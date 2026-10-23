// STATUS: DIAMANT VGT SUPREME — bounded VWC framing, checked offsets and legacy compatibility.

use crate::{
    ContainerError, CURRENT_CRYPTO_VERSION, CURRENT_FORMAT_VERSION, MAGIC_BYTES, MAX_CHUNK_COUNT,
    MAX_CHUNK_SIZE, MAX_CONTAINER_SIZE, MAX_MANIFEST_SIZE, MAX_METADATA_SIZE, MIN_FORMAT_VERSION,
    STREAM_PLAINTEXT_CHUNK_SIZE,
};
use serde::{Deserialize, Serialize};
use std::io::{Cursor, Read, Write};
use vgt_crypto::{encrypt_aes_gcm, KEY_SIZE, NONCE_SIZE};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ChunkType {
    DocumentTree,
    Asset,
    JournalDelta,
    Unknown(u8),
}

impl ChunkType {
    pub(crate) fn from_u8(value: u8) -> Self {
        match value {
            0 => Self::DocumentTree,
            1 => Self::Asset,
            2 => Self::JournalDelta,
            other => Self::Unknown(other),
        }
    }

    pub(crate) fn as_u8(self) -> u8 {
        match self {
            Self::DocumentTree => 0,
            Self::Asset => 1,
            Self::JournalDelta => 2,
            Self::Unknown(value) => value,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum CompressionAlgorithm {
    #[default]
    None,
    PackBitsV1,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ChunkDescriptor {
    pub index: u32,
    pub chunk_type: ChunkType,
    pub flags: u8,
    pub nonce_offset: usize,
    pub payload_offset: usize,
    pub encrypted_len: usize,
}

#[derive(Debug, Clone)]
pub struct ContainerStructure {
    pub format_version: u16,
    pub crypto_version: u16,
    pub metadata_len: usize,
    pub manifest_len: usize,
    pub chunk_count: u32,
    pub chunks: Vec<ChunkDescriptor>,
}

pub(crate) struct ParsedFraming<'a> {
    pub format_version: u16,
    pub crypto_version: u16,
    pub metadata_bytes: &'a [u8],
    pub manifest_bytes: Option<&'a [u8]>,
    pub chunk_count: u32,
    pub chunks_offset: usize,
}

#[derive(Debug, Clone, Copy)]
pub(crate) struct ParsedChunkHeader {
    pub chunk_type: ChunkType,
    pub flags: u8,
    pub nonce_offset: usize,
    pub payload_offset: usize,
    pub encrypted_len: usize,
    pub next_offset: usize,
}

fn checked_end(start: usize, len: usize, total: usize) -> Result<usize, ContainerError> {
    let end = start
        .checked_add(len)
        .ok_or(ContainerError::OffsetOverflow)?;
    if end > total {
        return Err(ContainerError::UnexpectedEof);
    }
    Ok(end)
}

fn read_u16(bytes: &[u8], offset: usize) -> Result<u16, ContainerError> {
    let end = checked_end(offset, 2, bytes.len())?;
    Ok(u16::from_le_bytes(
        bytes[offset..end]
            .try_into()
            .map_err(|_| ContainerError::UnexpectedEof)?,
    ))
}

fn read_u32(bytes: &[u8], offset: usize) -> Result<u32, ContainerError> {
    let end = checked_end(offset, 4, bytes.len())?;
    Ok(u32::from_le_bytes(
        bytes[offset..end]
            .try_into()
            .map_err(|_| ContainerError::UnexpectedEof)?,
    ))
}

pub(crate) fn parse_framing(bytes: &[u8]) -> Result<ParsedFraming<'_>, ContainerError> {
    if bytes.len() > MAX_CONTAINER_SIZE {
        return Err(ContainerError::ContainerTooLarge(bytes.len()));
    }
    if bytes.len() < 12 {
        return Err(ContainerError::UnexpectedEof);
    }
    if &bytes[..4] != MAGIC_BYTES {
        return Err(ContainerError::InvalidMagic);
    }
    let format_version = read_u16(bytes, 4)?;
    if !(MIN_FORMAT_VERSION..=CURRENT_FORMAT_VERSION).contains(&format_version) {
        return Err(ContainerError::UnsupportedFormatVersion(format_version));
    }
    let crypto_version = read_u16(bytes, 6)?;
    if crypto_version != CURRENT_CRYPTO_VERSION {
        return Err(ContainerError::UnsupportedCryptoVersion(crypto_version));
    }
    let metadata_len = read_u32(bytes, 8)? as usize;
    if metadata_len > MAX_METADATA_SIZE {
        return Err(ContainerError::MetadataTooLarge(
            metadata_len,
            MAX_METADATA_SIZE,
        ));
    }
    let metadata_start = 12usize;
    let metadata_end = checked_end(metadata_start, metadata_len, bytes.len())?;
    let mut cursor = metadata_end;
    let (manifest_bytes, manifest_len) = if format_version >= 3 {
        let declared = read_u32(bytes, cursor)? as usize;
        cursor = cursor
            .checked_add(4)
            .ok_or(ContainerError::OffsetOverflow)?;
        if declared == 0 || declared > MAX_MANIFEST_SIZE {
            return Err(ContainerError::ManifestTooLarge(
                declared,
                MAX_MANIFEST_SIZE,
            ));
        }
        let end = checked_end(cursor, declared, bytes.len())?;
        let value = Some(&bytes[cursor..end]);
        cursor = end;
        (value, declared)
    } else {
        (None, 0usize)
    };
    let chunk_count = read_u32(bytes, cursor)?;
    cursor = cursor
        .checked_add(4)
        .ok_or(ContainerError::OffsetOverflow)?;
    if chunk_count == 0 || chunk_count > MAX_CHUNK_COUNT {
        return Err(ContainerError::TooManyChunks(chunk_count, MAX_CHUNK_COUNT));
    }
    let _ = manifest_len;
    Ok(ParsedFraming {
        format_version,
        crypto_version,
        metadata_bytes: &bytes[metadata_start..metadata_end],
        manifest_bytes,
        chunk_count,
        chunks_offset: cursor,
    })
}

type LegacyHeader<'a> = (u16, u16, &'a [u8], Cursor<&'a [u8]>);

pub(crate) fn parse_header(bytes: &[u8]) -> Result<LegacyHeader<'_>, ContainerError> {
    let framing = parse_framing(bytes)?;
    if framing.format_version >= 3 {
        return Err(ContainerError::LegacyHeaderApiOnV3);
    }
    let mut cursor = Cursor::new(bytes);
    let legacy_count_offset = 12usize
        .checked_add(framing.metadata_bytes.len())
        .ok_or(ContainerError::OffsetOverflow)?;
    cursor.set_position(legacy_count_offset as u64);
    Ok((
        framing.format_version,
        framing.crypto_version,
        framing.metadata_bytes,
        cursor,
    ))
}

pub(crate) fn write_v3_header<W: Write + ?Sized>(
    writer: &mut W,
    metadata_json: &[u8],
    manifest_json: &[u8],
    chunk_count: u32,
) -> Result<(), ContainerError> {
    if metadata_json.is_empty() || metadata_json.len() > MAX_METADATA_SIZE {
        return Err(ContainerError::MetadataTooLarge(
            metadata_json.len(),
            MAX_METADATA_SIZE,
        ));
    }
    if manifest_json.is_empty() || manifest_json.len() > MAX_MANIFEST_SIZE {
        return Err(ContainerError::ManifestTooLarge(
            manifest_json.len(),
            MAX_MANIFEST_SIZE,
        ));
    }
    if chunk_count == 0 || chunk_count > MAX_CHUNK_COUNT {
        return Err(ContainerError::TooManyChunks(chunk_count, MAX_CHUNK_COUNT));
    }
    writer.write_all(MAGIC_BYTES)?;
    writer.write_all(&CURRENT_FORMAT_VERSION.to_le_bytes())?;
    writer.write_all(&CURRENT_CRYPTO_VERSION.to_le_bytes())?;
    writer.write_all(&(metadata_json.len() as u32).to_le_bytes())?;
    writer.write_all(metadata_json)?;
    writer.write_all(&(manifest_json.len() as u32).to_le_bytes())?;
    writer.write_all(manifest_json)?;
    writer.write_all(&chunk_count.to_le_bytes())?;
    Ok(())
}

pub(crate) fn read_chunk_header(
    bytes: &[u8],
    offset: usize,
    format_version: u16,
) -> Result<ParsedChunkHeader, ContainerError> {
    let header_len = if format_version >= 3 {
        1 + 1 + NONCE_SIZE + 4
    } else {
        1 + NONCE_SIZE + 4
    };
    let header_end = checked_end(offset, header_len, bytes.len())?;
    let chunk_type = ChunkType::from_u8(bytes[offset]);
    let flags = if format_version >= 3 {
        bytes[offset + 1]
    } else {
        0
    };
    let nonce_offset = offset + if format_version >= 3 { 2 } else { 1 };
    let len_offset = nonce_offset
        .checked_add(NONCE_SIZE)
        .ok_or(ContainerError::OffsetOverflow)?;
    let encrypted_len = read_u32(bytes, len_offset)? as usize;
    if !(16..=MAX_CHUNK_SIZE).contains(&encrypted_len) {
        return Err(ContainerError::ChunkTooLarge(encrypted_len, MAX_CHUNK_SIZE));
    }
    let payload_offset = header_end;
    let next_offset = checked_end(payload_offset, encrypted_len, bytes.len())?;
    Ok(ParsedChunkHeader {
        chunk_type,
        flags,
        nonce_offset,
        payload_offset,
        encrypted_len,
        next_offset,
    })
}

pub(crate) fn legacy_chunk_aad(metadata_json: &[u8], index: u32, chunk_type: u8) -> Vec<u8> {
    let mut aad = Vec::with_capacity(metadata_json.len().saturating_add(16));
    aad.extend_from_slice(metadata_json);
    aad.extend_from_slice(b"|vwc2|");
    aad.extend_from_slice(&index.to_le_bytes());
    aad.push(chunk_type);
    aad
}

pub fn required_stream_chunks(total_plaintext_len: u64) -> Result<u32, ContainerError> {
    if total_plaintext_len == 0 {
        return Ok(1);
    }
    if total_plaintext_len > crate::MAX_TOTAL_PLAINTEXT_SIZE as u64 {
        return Err(ContainerError::PlaintextTotalTooLarge(total_plaintext_len));
    }
    let chunk_size = STREAM_PLAINTEXT_CHUNK_SIZE as u64;
    let chunks = total_plaintext_len
        .checked_add(chunk_size - 1)
        .ok_or(ContainerError::PlaintextTotalTooLarge(total_plaintext_len))?
        / chunk_size;
    if chunks > MAX_CHUNK_COUNT as u64 {
        return Err(ContainerError::TooManyChunks(
            chunks.min(u32::MAX as u64) as u32,
            MAX_CHUNK_COUNT,
        ));
    }
    Ok(chunks as u32)
}

/// Legacy v1/v2 streaming writer retained exclusively for read/write compatibility tests.
pub fn write_stream_chunks<R: Read, W: Write>(
    reader: &mut R,
    writer: &mut W,
    total_plaintext_len: u64,
    dek: &[u8; KEY_SIZE],
    metadata_json: &[u8],
    first_chunk_index: u32,
    chunk_type: ChunkType,
) -> Result<u32, ContainerError> {
    let expected_chunks = required_stream_chunks(total_plaintext_len)?;
    let mut remaining = total_plaintext_len;
    let mut written = 0u32;
    loop {
        let requested = if remaining == 0 {
            if written == 0 {
                0
            } else {
                break;
            }
        } else {
            remaining.min(STREAM_PLAINTEXT_CHUNK_SIZE as u64) as usize
        };
        let mut plaintext = vec![0u8; requested];
        if requested > 0 {
            reader
                .read_exact(&mut plaintext)
                .map_err(|_| ContainerError::UnexpectedEof)?;
        }
        let index = first_chunk_index
            .checked_add(written)
            .ok_or(ContainerError::TooManyChunks(u32::MAX, MAX_CHUNK_COUNT))?;
        let aad = legacy_chunk_aad(metadata_json, index, chunk_type.as_u8());
        let (ciphertext, nonce) = encrypt_aes_gcm(&plaintext, dek, &aad)?;
        if ciphertext.len() > MAX_CHUNK_SIZE {
            return Err(ContainerError::ChunkTooLarge(
                ciphertext.len(),
                MAX_CHUNK_SIZE,
            ));
        }
        writer.write_all(&[chunk_type.as_u8()])?;
        writer.write_all(&nonce)?;
        writer.write_all(&(ciphertext.len() as u32).to_le_bytes())?;
        writer.write_all(&ciphertext)?;
        written = written
            .checked_add(1)
            .ok_or(ContainerError::TooManyChunks(u32::MAX, MAX_CHUNK_COUNT))?;
        remaining = remaining
            .checked_sub(requested as u64)
            .ok_or(ContainerError::CorruptedData)?;
        if remaining == 0 {
            break;
        }
    }
    if written != expected_chunks {
        return Err(ContainerError::CorruptedData);
    }
    Ok(written)
}

pub fn compress_safe_asset_before_encryption(
    bytes: &[u8],
    contains_secrets: bool,
) -> (CompressionAlgorithm, Vec<u8>) {
    if contains_secrets || bytes.len() < 64 * 1024 {
        return (CompressionAlgorithm::None, bytes.to_vec());
    }
    let compressed = packbits_compress(bytes);
    if compressed.len().saturating_add(64) < bytes.len() {
        (CompressionAlgorithm::PackBitsV1, compressed)
    } else {
        (CompressionAlgorithm::None, bytes.to_vec())
    }
}

fn packbits_compress(input: &[u8]) -> Vec<u8> {
    let mut output = Vec::with_capacity(input.len());
    let mut index = 0usize;
    while index < input.len() {
        let mut run = 1usize;
        while index + run < input.len() && input[index + run] == input[index] && run < 128 {
            run += 1;
        }
        if run >= 4 {
            output.push(0x80 | ((run - 1) as u8));
            output.push(input[index]);
            index += run;
            continue;
        }
        let literal_start = index;
        index += run;
        while index < input.len() && index - literal_start < 128 {
            let mut next_run = 1usize;
            while index + next_run < input.len()
                && input[index + next_run] == input[index]
                && next_run < 128
            {
                next_run += 1;
            }
            if next_run >= 4 {
                break;
            }
            index += next_run;
        }
        let literal_len = index - literal_start;
        output.push((literal_len - 1) as u8);
        output.extend_from_slice(&input[literal_start..index]);
    }
    output
}

pub(crate) fn packbits_decompress(
    input: &[u8],
    max_output: usize,
) -> Result<Vec<u8>, ContainerError> {
    let mut output = Vec::new();
    let mut index = 0usize;
    while index < input.len() {
        let token = input[index];
        index += 1;
        let len = ((token & 0x7f) as usize) + 1;
        if token & 0x80 != 0 {
            let value = *input
                .get(index)
                .ok_or(ContainerError::InvalidCompressedPayload)?;
            index += 1;
            let next_len = output
                .len()
                .checked_add(len)
                .ok_or(ContainerError::InvalidCompressedPayload)?;
            if next_len > max_output {
                return Err(ContainerError::PlaintextTooLarge(next_len));
            }
            output.resize(next_len, value);
        } else {
            let end = index
                .checked_add(len)
                .ok_or(ContainerError::InvalidCompressedPayload)?;
            let next_len = output
                .len()
                .checked_add(len)
                .ok_or(ContainerError::InvalidCompressedPayload)?;
            if end > input.len() || next_len > max_output {
                return Err(ContainerError::InvalidCompressedPayload);
            }
            output.extend_from_slice(&input[index..end]);
            index = end;
        }
    }
    Ok(output)
}
