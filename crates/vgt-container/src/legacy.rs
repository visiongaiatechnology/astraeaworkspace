// STATUS: PLATIN — legacy VWC v1/v2 read compatibility only. New writes use VWC v3.

use crate::format::{legacy_chunk_aad, packbits_decompress, parse_header, read_chunk_header};
use crate::{
    ChunkType, CompressionAlgorithm, ContainerError, ContainerHeaderMetadata, MAX_CHUNK_COUNT,
    MAX_DOCUMENT_PLAINTEXT_SIZE,
};
use std::io::Read;
use vgt_crypto::{decrypt_aes_gcm, KEY_SIZE, NONCE_SIZE};
use vgt_object_model::WorkspaceDocument;

pub(crate) fn decrypt_legacy(
    bytes: &[u8],
    dek: &[u8; KEY_SIZE],
) -> Result<WorkspaceDocument, ContainerError> {
    let (format_version, _, metadata_bytes, mut cursor) = parse_header(bytes)?;
    let metadata: ContainerHeaderMetadata = serde_json::from_slice(metadata_bytes)?;
    let mut count_bytes = [0u8; 4];
    cursor
        .read_exact(&mut count_bytes)
        .map_err(|_| ContainerError::UnexpectedEof)?;
    let chunk_count = u32::from_le_bytes(count_bytes);
    if chunk_count == 0 || chunk_count > MAX_CHUNK_COUNT {
        return Err(ContainerError::TooManyChunks(chunk_count, MAX_CHUNK_COUNT));
    }

    let mut document_payload = Vec::new();
    let mut saw_document = false;
    let mut offset = cursor.position() as usize;
    for index in 0..chunk_count {
        let header = read_chunk_header(bytes, offset, format_version)?;
        let mut nonce = [0u8; NONCE_SIZE];
        nonce.copy_from_slice(&bytes[header.nonce_offset..header.nonce_offset + NONCE_SIZE]);
        let ciphertext = &bytes[header.payload_offset..header.next_offset];
        let aad = if format_version >= 2 {
            legacy_chunk_aad(metadata_bytes, index, header.chunk_type.as_u8())
        } else {
            metadata_bytes.to_vec()
        };
        let plaintext = decrypt_aes_gcm(ciphertext, &nonce, dek, &aad)?;
        if header.chunk_type == ChunkType::DocumentTree {
            saw_document = true;
            let next_len = document_payload
                .len()
                .checked_add(plaintext.len())
                .ok_or(ContainerError::PlaintextTooLarge(usize::MAX))?;
            if next_len > MAX_DOCUMENT_PLAINTEXT_SIZE {
                return Err(ContainerError::PlaintextTooLarge(next_len));
            }
            document_payload.extend_from_slice(&plaintext);
        }
        offset = header.next_offset;
    }
    if offset != bytes.len() {
        return Err(ContainerError::TrailingBytes);
    }
    if !saw_document {
        return Err(ContainerError::MissingDocumentTree);
    }
    let decoded = match metadata.compression {
        CompressionAlgorithm::None => document_payload,
        CompressionAlgorithm::PackBitsV1 => {
            packbits_decompress(&document_payload, MAX_DOCUMENT_PLAINTEXT_SIZE)?
        }
    };
    let document: WorkspaceDocument = serde_json::from_slice(&decoded)?;
    if document.id != metadata.document_id
        || document.security_policy.profile != metadata.security_profile
    {
        return Err(ContainerError::CorruptedData);
    }
    Ok(document)
}
