// STATUS: DIAMANT VGT SUPREME
//! Bounded large-object transfer framing. Payload bytes are streamed by transport/storage adapters.

use crate::SyncError;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use vgt_crypto::hash_blake3;

pub const LARGE_OBJECT_DEFAULT_CHUNK_BYTES: usize = 4 * 1024 * 1024;
pub const LARGE_OBJECT_MAX_CHUNK_BYTES: usize = 8 * 1024 * 1024;
pub const LARGE_OBJECT_MAX_BYTES: u64 = 1024 * 1024 * 1024;
pub const LARGE_OBJECT_MAX_CHUNKS: u32 = 512;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct LargeObjectManifest {
    pub transfer_id: String,
    pub object_id: String,
    pub total_bytes: u64,
    pub chunk_bytes: u32,
    pub chunk_count: u32,
    pub content_digest_blake3: [u8; 32],
}

impl LargeObjectManifest {
    pub fn new(
        transfer_id: String,
        object_id: String,
        total_bytes: u64,
        chunk_bytes: usize,
        content_digest_blake3: [u8; 32],
    ) -> Result<Self, SyncError> {
        if transfer_id.is_empty() || transfer_id.len() > 256 || object_id.is_empty() || object_id.len() > 512
            || total_bytes == 0 || total_bytes > LARGE_OBJECT_MAX_BYTES
            || chunk_bytes == 0 || chunk_bytes > LARGE_OBJECT_MAX_CHUNK_BYTES
        {
            return Err(SyncError::ResourceBoundary);
        }
        let count_u64 = total_bytes.div_ceil(chunk_bytes as u64);
        let chunk_count = u32::try_from(count_u64).map_err(|_| SyncError::ResourceBoundary)?;
        if chunk_count == 0 || chunk_count > LARGE_OBJECT_MAX_CHUNKS { return Err(SyncError::ResourceBoundary); }
        Ok(Self {
            transfer_id,
            object_id,
            total_bytes,
            chunk_bytes: chunk_bytes as u32,
            chunk_count,
            content_digest_blake3,
        })
    }

    pub fn expected_chunk_len(&self, index: u32) -> Result<usize, SyncError> {
        if index >= self.chunk_count { return Err(SyncError::ResourceBoundary); }
        let start = u64::from(index).saturating_mul(u64::from(self.chunk_bytes));
        let remaining = self.total_bytes.saturating_sub(start);
        usize::try_from(remaining.min(u64::from(self.chunk_bytes))).map_err(|_| SyncError::ResourceBoundary)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct LargeObjectChunkDescriptor {
    pub transfer_id: String,
    pub index: u32,
    pub plaintext_bytes: u32,
    pub digest_blake3: [u8; 32],
}

pub fn describe_large_object_chunk(
    manifest: &LargeObjectManifest,
    index: u32,
    chunk: &[u8],
) -> Result<LargeObjectChunkDescriptor, SyncError> {
    if chunk.len() != manifest.expected_chunk_len(index)? { return Err(SyncError::ResourceBoundary); }
    Ok(LargeObjectChunkDescriptor {
        transfer_id: manifest.transfer_id.clone(),
        index,
        plaintext_bytes: chunk.len() as u32,
        digest_blake3: hash_blake3(chunk),
    })
}

/// Receiver tracks only authenticated chunk descriptors; transports may stream bytes to encrypted
/// staging storage instead of retaining a full large object in process memory.
#[derive(Debug, Clone)]
pub struct LargeObjectReceiver {
    manifest: LargeObjectManifest,
    received: BTreeMap<u32, LargeObjectChunkDescriptor>,
    received_bytes: u64,
}

impl LargeObjectReceiver {
    pub fn new(manifest: LargeObjectManifest) -> Self {
        Self { manifest, received: BTreeMap::new(), received_bytes: 0 }
    }

    pub fn accept_descriptor(&mut self, descriptor: LargeObjectChunkDescriptor) -> Result<(), SyncError> {
        if descriptor.transfer_id != self.manifest.transfer_id
            || descriptor.index >= self.manifest.chunk_count
            || usize::try_from(descriptor.plaintext_bytes).map_err(|_| SyncError::ResourceBoundary)?
                != self.manifest.expected_chunk_len(descriptor.index)?
        {
            return Err(SyncError::ResourceBoundary);
        }
        if let Some(existing) = self.received.get(&descriptor.index) {
            return if existing == &descriptor { Ok(()) } else { Err(SyncError::EnvelopeAuthentication) };
        }
        self.received_bytes = self.received_bytes.checked_add(u64::from(descriptor.plaintext_bytes)).ok_or(SyncError::ResourceBoundary)?;
        if self.received_bytes > self.manifest.total_bytes { return Err(SyncError::ResourceBoundary); }
        self.received.insert(descriptor.index, descriptor);
        Ok(())
    }

    pub fn is_complete(&self) -> bool {
        self.received.len() == self.manifest.chunk_count as usize && self.received_bytes == self.manifest.total_bytes
    }

    /// Caller supplies the digest calculated while streaming chunks into the final encrypted staging sink.
    pub fn finalize(&self, streamed_content_digest: [u8; 32]) -> Result<(), SyncError> {
        if !self.is_complete() || streamed_content_digest != self.manifest.content_digest_blake3 {
            return Err(SyncError::EnvelopeAuthentication);
        }
        Ok(())
    }

    pub fn received_count(&self) -> usize { self.received.len() }
    pub fn received_bytes(&self) -> u64 { self.received_bytes }
}
