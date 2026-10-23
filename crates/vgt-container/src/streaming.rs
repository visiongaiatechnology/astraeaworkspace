// STATUS: DIAMANT VGT SUPREME — streaming authenticated VWC v3 chunk writer.

use crate::manifest::ManifestChunkEntry;
use crate::{
    ChunkType, ContainerError, ContainerHeaderMetadata, MAX_CHUNK_SIZE, MAX_CONTAINER_SIZE,
    STREAM_PLAINTEXT_CHUNK_SIZE,
};
use std::io::{self, Read, Write};
use vgt_crypto::{
    seal_document_chunk, AesGcmNonceSequence, DocumentAuthHeader, KEY_SIZE, SALT_SIZE,
};

pub(crate) fn serialized_json_len<T: serde::Serialize>(value: &T) -> Result<u64, ContainerError> {
    struct Counter(u64);
    impl Write for Counter {
        fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
            self.0 = self.0.checked_add(buf.len() as u64).ok_or_else(|| {
                io::Error::new(io::ErrorKind::InvalidData, "serialized size overflow")
            })?;
            Ok(buf.len())
        }
        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }
    let mut counter = Counter(0);
    serde_json::to_writer(&mut counter, value)?;
    Ok(counter.0)
}

pub(crate) fn document_auth_header(
    metadata: &ContainerHeaderMetadata,
) -> Result<DocumentAuthHeader, ContainerError> {
    if metadata.key_slots.is_empty() || metadata.key_slots.len() > 64 {
        return Err(ContainerError::InvalidKeySlotCount(
            metadata.key_slots.len(),
        ));
    }
    let document_hash = blake3::hash(metadata.document_id.as_bytes());
    let mut document_id = [0u8; 16];
    document_id.copy_from_slice(&document_hash.as_bytes()[..16]);

    let mut slot_hasher = blake3::Hasher::new_derive_key("vgt-vwc3-primary-slot-id-v1");
    slot_hasher.update(&metadata.key_slots[0].slot_id.to_le_bytes());
    slot_hasher.update(&document_id);
    let slot_hash = slot_hasher.finalize();
    let mut primary_slot_id = [0u8; 16];
    primary_slot_id.copy_from_slice(&slot_hash.as_bytes()[..16]);

    DocumentAuthHeader::new(
        document_id,
        primary_slot_id,
        metadata.key_slots.len() as u16,
    )
    .map_err(ContainerError::Crypto)
}

pub(crate) fn framing_digest(metadata_json: &[u8], manifest_json: &[u8]) -> [u8; 32] {
    let mut hasher = blake3::Hasher::new_derive_key("vgt-vwc3-authenticated-framing-v1");
    hasher.update(&(metadata_json.len() as u64).to_le_bytes());
    hasher.update(metadata_json);
    hasher.update(&(manifest_json.len() as u64).to_le_bytes());
    hasher.update(manifest_json);
    *hasher.finalize().as_bytes()
}

pub(crate) fn v3_chunk_caller_aad(digest: &[u8; 32], entry: &ManifestChunkEntry) -> Vec<u8> {
    let mut aad = Vec::with_capacity(32 + 1 + 1 + 8);
    aad.extend_from_slice(digest);
    aad.push(entry.chunk_type);
    aad.push(entry.flags);
    aad.extend_from_slice(&entry.plaintext_len.to_le_bytes());
    aad
}

pub(crate) struct V3ChunkEmitter<'a, W: Write + ?Sized> {
    writer: &'a mut W,
    dek: &'a [u8; KEY_SIZE],
    derivation_salt: &'a [u8; SALT_SIZE],
    auth_header: &'a DocumentAuthHeader,
    framing_digest: [u8; 32],
    manifest_entries: &'a [ManifestChunkEntry],
    cancellation: &'a dyn crate::CancellationCheck,
    nonce_sequence: AesGcmNonceSequence,
    next_index: usize,
    ciphertext_bytes_written: u64,
}

impl<'a, W: Write + ?Sized> V3ChunkEmitter<'a, W> {
    pub(crate) fn new(
        writer: &'a mut W,
        dek: &'a [u8; KEY_SIZE],
        derivation_salt: &'a [u8; SALT_SIZE],
        auth_header: &'a DocumentAuthHeader,
        framing_digest: [u8; 32],
        manifest_entries: &'a [ManifestChunkEntry],
        cancellation: &'a dyn crate::CancellationCheck,
    ) -> Self {
        Self {
            writer,
            dek,
            derivation_salt,
            auth_header,
            framing_digest,
            manifest_entries,
            cancellation,
            nonce_sequence: AesGcmNonceSequence::new(),
            next_index: 0,
            ciphertext_bytes_written: 0,
        }
    }

    fn write_one(&mut self, chunk_type: ChunkType, plaintext: &[u8]) -> Result<(), ContainerError> {
        if self.cancellation.is_cancelled() {
            return Err(ContainerError::Cancelled);
        }
        let entry = self
            .manifest_entries
            .get(self.next_index)
            .ok_or(ContainerError::ManifestChunkMismatch)?;
        if entry.index != self.next_index as u32
            || entry.chunk_type != chunk_type.as_u8()
            || entry.plaintext_len != plaintext.len() as u64
        {
            return Err(ContainerError::ManifestChunkMismatch);
        }
        let caller_aad = v3_chunk_caller_aad(&self.framing_digest, entry);
        let sealed = seal_document_chunk(
            plaintext,
            self.dek,
            self.derivation_salt,
            self.auth_header,
            self.next_index as u64,
            &caller_aad,
            &mut self.nonce_sequence,
        )?;
        if sealed.ciphertext.len() > MAX_CHUNK_SIZE {
            return Err(ContainerError::ChunkTooLarge(
                sealed.ciphertext.len(),
                MAX_CHUNK_SIZE,
            ));
        }
        self.writer.write_all(&[entry.chunk_type, entry.flags])?;
        self.writer.write_all(&sealed.nonce)?;
        self.writer
            .write_all(&(sealed.ciphertext.len() as u32).to_le_bytes())?;
        self.writer.write_all(&sealed.ciphertext)?;
        self.ciphertext_bytes_written = self
            .ciphertext_bytes_written
            .checked_add(sealed.ciphertext.len() as u64 + 18)
            .ok_or(ContainerError::ContainerTooLarge(usize::MAX))?;
        if self.ciphertext_bytes_written > MAX_CONTAINER_SIZE as u64 {
            return Err(ContainerError::ContainerTooLarge(
                self.ciphertext_bytes_written as usize,
            ));
        }
        self.next_index += 1;
        Ok(())
    }

    pub(crate) fn write_reader_exact<R: Read>(
        &mut self,
        reader: &mut R,
        total_plaintext_len: u64,
        chunk_type: ChunkType,
    ) -> Result<u32, ContainerError> {
        let first = self.next_index;
        let mut remaining = total_plaintext_len;
        loop {
            let requested = if remaining == 0 {
                if self.next_index == first {
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
            self.write_one(chunk_type, &plaintext)?;
            remaining = remaining
                .checked_sub(requested as u64)
                .ok_or(ContainerError::CorruptedData)?;
            if remaining == 0 {
                break;
            }
        }
        Ok((self.next_index - first) as u32)
    }

    pub(crate) fn write_json_document<T: serde::Serialize>(
        &mut self,
        value: &T,
    ) -> Result<u32, ContainerError> {
        let first = self.next_index;
        let mut sink = JsonChunkSink::new(self, ChunkType::DocumentTree);
        let serialize = serde_json::to_writer(&mut sink, value);
        if let Some(error) = sink.take_error() {
            return Err(error);
        }
        serialize?;
        sink.finish()?;
        Ok((self.next_index - first) as u32)
    }

    pub(crate) fn finish(self) -> Result<u32, ContainerError> {
        if self.next_index != self.manifest_entries.len() {
            return Err(ContainerError::ManifestChunkMismatch);
        }
        Ok(self.next_index as u32)
    }
}

struct JsonChunkSink<'a, 'b, W: Write + ?Sized> {
    emitter: &'a mut V3ChunkEmitter<'b, W>,
    chunk_type: ChunkType,
    buffer: Vec<u8>,
    error: Option<ContainerError>,
}

impl<'a, 'b, W: Write + ?Sized> JsonChunkSink<'a, 'b, W> {
    fn new(emitter: &'a mut V3ChunkEmitter<'b, W>, chunk_type: ChunkType) -> Self {
        Self {
            emitter,
            chunk_type,
            buffer: Vec::with_capacity(STREAM_PLAINTEXT_CHUNK_SIZE),
            error: None,
        }
    }

    fn emit_full_chunks(&mut self) -> Result<(), ContainerError> {
        while self.buffer.len() >= STREAM_PLAINTEXT_CHUNK_SIZE {
            let tail = self.buffer.split_off(STREAM_PLAINTEXT_CHUNK_SIZE);
            let chunk = std::mem::replace(&mut self.buffer, tail);
            self.emitter.write_one(self.chunk_type, &chunk)?;
        }
        Ok(())
    }

    fn take_error(&mut self) -> Option<ContainerError> {
        self.error.take()
    }

    fn finish(&mut self) -> Result<(), ContainerError> {
        if self.error.is_some() {
            return Err(self.error.take().unwrap_or(ContainerError::CorruptedData));
        }
        if !self.buffer.is_empty() || self.emitter.next_index == 0 {
            let chunk = std::mem::take(&mut self.buffer);
            self.emitter.write_one(self.chunk_type, &chunk)?;
        }
        Ok(())
    }
}

impl<W: Write + ?Sized> Write for JsonChunkSink<'_, '_, W> {
    fn write(&mut self, input: &[u8]) -> io::Result<usize> {
        if self.error.is_some() {
            return Err(io::Error::other("VWC chunk writer failed"));
        }
        self.buffer.extend_from_slice(input);
        if let Err(error) = self.emit_full_chunks() {
            self.error = Some(error);
            return Err(io::Error::other("VWC chunk writer failed"));
        }
        Ok(input.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}
