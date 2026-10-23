// STATUS: DIAMANT VGT SUPREME — bounded streaming VWC v3 reader and authenticated chunk verifier.

use crate::manifest::{ContainerManifest, CHUNK_FLAG_KNOWN_MASK};
use crate::streaming::{document_auth_header, framing_digest, v3_chunk_caller_aad};
use crate::{
    ChunkType, CompressionAlgorithm, ContainerError, ContainerHeaderMetadata,
    CURRENT_CRYPTO_VERSION, CURRENT_FORMAT_VERSION, MAGIC_BYTES, MAX_CHUNK_COUNT, MAX_CHUNK_SIZE,
    MAX_CONTAINER_SIZE, MAX_DOCUMENT_PLAINTEXT_SIZE, MAX_MANIFEST_SIZE, MAX_METADATA_SIZE,
};
use std::io::Read;
use vgt_crypto::{
    open_document_chunk, zeroize_best_effort, AuthenticatedChunk, KEY_SIZE, NONCE_SIZE,
};
use vgt_object_model::WorkspaceDocument;

pub(crate) struct CurrentStreamFraming {
    pub metadata: ContainerHeaderMetadata,
    pub metadata_json: Vec<u8>,
    pub manifest: ContainerManifest,
    pub manifest_json: Vec<u8>,
    pub bytes_read: u64,
}

fn read_exact_counted<R: Read>(
    reader: &mut R,
    output: &mut [u8],
    count: &mut u64,
) -> Result<(), ContainerError> {
    reader
        .read_exact(output)
        .map_err(|_| ContainerError::UnexpectedEof)?;
    *count = count
        .checked_add(output.len() as u64)
        .ok_or(ContainerError::ContainerTooLarge(usize::MAX))?;
    if *count > MAX_CONTAINER_SIZE as u64 {
        return Err(ContainerError::ContainerTooLarge(
            (*count).min(usize::MAX as u64) as usize,
        ));
    }
    Ok(())
}

fn read_u16<R: Read>(reader: &mut R, count: &mut u64) -> Result<u16, ContainerError> {
    let mut bytes = [0u8; 2];
    read_exact_counted(reader, &mut bytes, count)?;
    Ok(u16::from_le_bytes(bytes))
}

fn read_u32<R: Read>(reader: &mut R, count: &mut u64) -> Result<u32, ContainerError> {
    let mut bytes = [0u8; 4];
    read_exact_counted(reader, &mut bytes, count)?;
    Ok(u32::from_le_bytes(bytes))
}

pub(crate) fn read_current_framing<R: Read>(
    reader: &mut R,
) -> Result<CurrentStreamFraming, ContainerError> {
    let mut count = 0u64;
    let mut magic = [0u8; 4];
    read_exact_counted(reader, &mut magic, &mut count)?;
    if &magic != MAGIC_BYTES {
        return Err(ContainerError::InvalidMagic);
    }
    let format_version = read_u16(reader, &mut count)?;
    if format_version != CURRENT_FORMAT_VERSION {
        return Err(ContainerError::StreamingLegacyRequiresBuffer(
            format_version,
        ));
    }
    let crypto_version = read_u16(reader, &mut count)?;
    if crypto_version != CURRENT_CRYPTO_VERSION {
        return Err(ContainerError::UnsupportedCryptoVersion(crypto_version));
    }
    let metadata_len = read_u32(reader, &mut count)? as usize;
    if metadata_len == 0 || metadata_len > MAX_METADATA_SIZE {
        return Err(ContainerError::MetadataTooLarge(
            metadata_len,
            MAX_METADATA_SIZE,
        ));
    }
    let mut metadata_json = vec![0u8; metadata_len];
    read_exact_counted(reader, &mut metadata_json, &mut count)?;
    let metadata: ContainerHeaderMetadata = serde_json::from_slice(&metadata_json)?;
    crate::api::validate_metadata_for_version(&metadata, format_version)?;

    let manifest_len = read_u32(reader, &mut count)? as usize;
    if manifest_len == 0 || manifest_len > MAX_MANIFEST_SIZE {
        return Err(ContainerError::ManifestTooLarge(
            manifest_len,
            MAX_MANIFEST_SIZE,
        ));
    }
    let mut manifest_json = vec![0u8; manifest_len];
    read_exact_counted(reader, &mut manifest_json, &mut count)?;
    let manifest: ContainerManifest = serde_json::from_slice(&manifest_json)?;
    manifest.validate()?;

    let chunk_count = read_u32(reader, &mut count)?;
    if chunk_count == 0
        || chunk_count > MAX_CHUNK_COUNT
        || chunk_count as usize != manifest.chunks.len()
    {
        return Err(ContainerError::ManifestChunkMismatch);
    }
    Ok(CurrentStreamFraming {
        metadata,
        metadata_json,
        manifest,
        manifest_json,
        bytes_read: count,
    })
}

pub(crate) fn decrypt_current_stream<R: Read>(
    reader: &mut R,
    framing: CurrentStreamFraming,
    dek: &[u8; KEY_SIZE],
) -> Result<WorkspaceDocument, ContainerError> {
    let never_cancel = || false;
    decrypt_current_stream_cancellable(reader, framing, dek, &never_cancel)
}

pub(crate) fn decrypt_current_stream_cancellable<R: Read>(
    reader: &mut R,
    framing: CurrentStreamFraming,
    dek: &[u8; KEY_SIZE],
    cancellation: &dyn crate::CancellationCheck,
) -> Result<WorkspaceDocument, ContainerError> {
    process_current_stream(reader, framing, dek, cancellation, true)?
        .ok_or(ContainerError::MissingDocumentTree)
}

pub(crate) fn verify_current_stream<R: Read>(
    reader: &mut R,
    framing: CurrentStreamFraming,
    dek: &[u8; KEY_SIZE],
) -> Result<(), ContainerError> {
    let never_cancel = || false;
    process_current_stream(reader, framing, dek, &never_cancel, false)?;
    Ok(())
}

fn process_current_stream<R: Read>(
    reader: &mut R,
    framing: CurrentStreamFraming,
    dek: &[u8; KEY_SIZE],
    cancellation: &dyn crate::CancellationCheck,
    retain_document_payload: bool,
) -> Result<Option<WorkspaceDocument>, ContainerError> {
    if cancellation.is_cancelled() {
        return Err(ContainerError::Cancelled);
    }
    let salt = framing
        .metadata
        .chunk_kdf_salt
        .ok_or(ContainerError::MissingChunkKdfSalt)?;
    let auth_header = document_auth_header(&framing.metadata)?;
    let digest = framing_digest(&framing.metadata_json, &framing.manifest_json);
    let mut count = framing.bytes_read;
    let mut document_payload = Vec::new();
    let mut saw_document = false;

    for entry in &framing.manifest.chunks {
        if cancellation.is_cancelled() {
            return Err(ContainerError::Cancelled);
        }
        if entry.flags & !CHUNK_FLAG_KNOWN_MASK != 0 {
            return Err(ContainerError::CorruptedManifest);
        }
        let mut fixed = [0u8; 18];
        read_exact_counted(reader, &mut fixed, &mut count)?;
        let chunk_type_raw = fixed[0];
        let flags = fixed[1];
        if chunk_type_raw != entry.chunk_type || flags != entry.flags {
            return Err(ContainerError::ManifestChunkMismatch);
        }
        let mut nonce = [0u8; NONCE_SIZE];
        nonce.copy_from_slice(&fixed[2..14]);
        let encrypted_len = u32::from_le_bytes(
            fixed[14..18]
                .try_into()
                .map_err(|_| ContainerError::UnexpectedEof)?,
        ) as usize;
        let expected_ciphertext = entry
            .plaintext_len
            .checked_add(16)
            .ok_or(ContainerError::ManifestChunkMismatch)?;
        if encrypted_len as u64 != expected_ciphertext || encrypted_len > MAX_CHUNK_SIZE {
            return Err(ContainerError::ManifestChunkMismatch);
        }
        let mut ciphertext = vec![0u8; encrypted_len];
        read_exact_counted(reader, &mut ciphertext, &mut count)?;
        let authenticated = AuthenticatedChunk {
            chunk_index: entry.index as u64,
            nonce,
            ciphertext,
        };
        let caller_aad = v3_chunk_caller_aad(&digest, entry);
        let mut plaintext =
            open_document_chunk(&authenticated, dek, &salt, &auth_header, &caller_aad)?;
        let consume_result = match ChunkType::from_u8(chunk_type_raw) {
            ChunkType::DocumentTree => {
                saw_document = true;
                if retain_document_payload {
                    match document_payload.len().checked_add(plaintext.len()) {
                        Some(next) if next <= MAX_DOCUMENT_PLAINTEXT_SIZE => {
                            document_payload.extend_from_slice(&plaintext);
                            Ok(())
                        }
                        Some(next) => Err(ContainerError::PlaintextTooLarge(next)),
                        None => Err(ContainerError::PlaintextTooLarge(usize::MAX)),
                    }
                } else {
                    Ok(())
                }
            }
            ChunkType::Asset | ChunkType::JournalDelta | ChunkType::Unknown(_) => {
                // Authentication is mandatory for every chunk; unrequested non-document plaintext
                // is released immediately after verification rather than accumulated in RAM.
                Ok(())
            }
        };
        zeroize_best_effort(&mut plaintext);
        consume_result?;
    }

    let mut trailing = [0u8; 1];
    match reader.read(&mut trailing) {
        Ok(0) => {}
        Ok(_) => return Err(ContainerError::TrailingBytes),
        Err(error) => return Err(ContainerError::Io(error)),
    }
    if cancellation.is_cancelled() {
        return Err(ContainerError::Cancelled);
    }
    if !saw_document {
        return Err(ContainerError::MissingDocumentTree);
    }
    if !retain_document_payload {
        return Ok(None);
    }
    let decoded = match framing.metadata.compression {
        CompressionAlgorithm::None => document_payload,
        CompressionAlgorithm::PackBitsV1 => {
            crate::format::packbits_decompress(&document_payload, MAX_DOCUMENT_PLAINTEXT_SIZE)?
        }
    };
    let document: WorkspaceDocument = serde_json::from_slice(&decoded)?;
    if document.id != framing.metadata.document_id
        || document.security_policy.profile != framing.metadata.security_profile
        || document.schema_version != framing.manifest.compatibility.payload_schema_version
    {
        return Err(ContainerError::CorruptedData);
    }
    Ok(Some(document))
}

pub(crate) fn inspect_current_stream<R: Read>(
    reader: &mut R,
) -> Result<crate::ContainerStructure, ContainerError> {
    let framing = read_current_framing(reader)?;
    let mut bytes_read = framing.bytes_read;
    let mut chunks = Vec::with_capacity(framing.manifest.chunks.len().min(1024));
    for entry in &framing.manifest.chunks {
        let chunk_start = bytes_read as usize;
        let mut fixed = [0u8; 18];
        read_exact_counted(reader, &mut fixed, &mut bytes_read)?;
        let encrypted_len = u32::from_le_bytes(
            fixed[14..18]
                .try_into()
                .map_err(|_| ContainerError::UnexpectedEof)?,
        ) as usize;
        if fixed[0] != entry.chunk_type
            || fixed[1] != entry.flags
            || entry.plaintext_len.checked_add(16) != Some(encrypted_len as u64)
            || encrypted_len > MAX_CHUNK_SIZE
        {
            return Err(ContainerError::ManifestChunkMismatch);
        }
        let nonce_offset = chunk_start
            .checked_add(2)
            .ok_or(ContainerError::OffsetOverflow)?;
        let payload_offset = chunk_start
            .checked_add(18)
            .ok_or(ContainerError::OffsetOverflow)?;
        let mut remaining = encrypted_len;
        let mut discard = [0u8; 64 * 1024];
        while remaining > 0 {
            let take = remaining.min(discard.len());
            read_exact_counted(reader, &mut discard[..take], &mut bytes_read)?;
            remaining -= take;
        }
        chunks.push(crate::ChunkDescriptor {
            index: entry.index,
            chunk_type: ChunkType::from_u8(entry.chunk_type),
            flags: entry.flags,
            nonce_offset,
            payload_offset,
            encrypted_len,
        });
    }
    let mut trailing = [0u8; 1];
    match reader.read(&mut trailing) {
        Ok(0) => {}
        Ok(_) => return Err(ContainerError::TrailingBytes),
        Err(error) => return Err(ContainerError::Io(error)),
    }
    Ok(crate::ContainerStructure {
        format_version: CURRENT_FORMAT_VERSION,
        crypto_version: CURRENT_CRYPTO_VERSION,
        metadata_len: framing.metadata_json.len(),
        manifest_len: framing.manifest_json.len(),
        chunk_count: framing.manifest.chunks.len() as u32,
        chunks,
    })
}
