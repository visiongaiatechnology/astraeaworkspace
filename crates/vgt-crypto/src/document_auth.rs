//! Authenticated document/chunk metadata and nonce discipline.

use serde::{Deserialize, Serialize};

use crate::key_hierarchy::{DOCUMENT_ID_BYTES, KEY_SLOT_ID_BYTES};
use crate::{
    decrypt_aes_gcm, derive_domain_subkey, encrypt_aes_gcm_with_nonce, generate_random_bytes,
    CryptoDomain, CryptoError, KEY_SIZE, NONCE_SIZE, SALT_SIZE,
};

pub const DOCUMENT_AUTH_FORMAT_VERSION: u16 = 1;
pub const MAX_KEY_SLOTS: u16 = 64;
pub const MAX_CHUNK_AAD_BYTES: usize = 4096;
pub const MAX_DOCUMENT_CHUNK_BYTES: usize = 16 * 1024 * 1024;
/// Hard per-key nonce budget. The caller must rekey before any 96-bit nonce can repeat.
pub const MAX_NONCES_PER_KEY: u64 = 1u64 << 32;

/// Critical serialized metadata that must be authenticated with every protected chunk.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct DocumentAuthHeader {
    pub format_version: u16,
    pub suite_version: u16,
    pub document_id: [u8; DOCUMENT_ID_BYTES],
    pub primary_slot_id: [u8; KEY_SLOT_ID_BYTES],
    pub key_slot_count: u16,
    pub algorithm_id: u16,
}

impl DocumentAuthHeader {
    pub fn new(
        document_id: [u8; DOCUMENT_ID_BYTES],
        primary_slot_id: [u8; KEY_SLOT_ID_BYTES],
        key_slot_count: u16,
    ) -> Result<Self, CryptoError> {
        if key_slot_count == 0 || key_slot_count > MAX_KEY_SLOTS {
            return Err(CryptoError::BoundaryViolation("key slot count"));
        }
        Ok(Self {
            format_version: DOCUMENT_AUTH_FORMAT_VERSION,
            suite_version: crate::PRODUCTION_CRYPTO_SUITE_VERSION,
            document_id,
            primary_slot_id,
            key_slot_count,
            algorithm_id: 1, // suite-v1 AES-256-GCM
        })
    }

    pub fn canonical_aad(
        &self,
        chunk_index: u64,
        caller_aad: &[u8],
    ) -> Result<Vec<u8>, CryptoError> {
        if caller_aad.len() > MAX_CHUNK_AAD_BYTES {
            return Err(CryptoError::BoundaryViolation("chunk aad"));
        }
        if self.format_version != DOCUMENT_AUTH_FORMAT_VERSION {
            return Err(CryptoError::UnsupportedDocumentAuthVersion(
                self.format_version,
            ));
        }
        crate::crypto_suite(self.suite_version)?;
        if self.algorithm_id != 1 || self.key_slot_count == 0 || self.key_slot_count > MAX_KEY_SLOTS
        {
            return Err(CryptoError::DecryptionFailed);
        }
        let mut aad = Vec::with_capacity(64 + caller_aad.len());
        aad.extend_from_slice(b"VGT-DOCUMENT-CHUNK\0");
        aad.extend_from_slice(&self.format_version.to_be_bytes());
        aad.extend_from_slice(&self.suite_version.to_be_bytes());
        aad.extend_from_slice(&self.algorithm_id.to_be_bytes());
        aad.extend_from_slice(&self.key_slot_count.to_be_bytes());
        aad.extend_from_slice(&self.document_id);
        aad.extend_from_slice(&self.primary_slot_id);
        aad.extend_from_slice(&chunk_index.to_be_bytes());
        aad.extend_from_slice(&(caller_aad.len() as u32).to_be_bytes());
        aad.extend_from_slice(caller_aad);
        Ok(aad)
    }
}

/// Per-key nonce sequence: random 64-bit epoch + monotonic 32-bit counter.
/// Within one sequence a nonce cannot repeat. Callers persist/recreate a sequence only with
/// a fresh epoch; exhaustion fails closed rather than wrapping the counter.
pub struct AesGcmNonceSequence {
    epoch: [u8; 8],
    next_counter: u64,
}

impl AesGcmNonceSequence {
    pub fn new() -> Self {
        Self {
            epoch: generate_random_bytes::<8>(),
            next_counter: 0,
        }
    }

    pub fn next_nonce(&mut self) -> Result<[u8; NONCE_SIZE], CryptoError> {
        if self.next_counter >= MAX_NONCES_PER_KEY {
            return Err(CryptoError::NonceExhausted);
        }
        let counter = self.next_counter as u32;
        self.next_counter += 1;
        let mut nonce = [0u8; NONCE_SIZE];
        nonce[..8].copy_from_slice(&self.epoch);
        nonce[8..].copy_from_slice(&counter.to_be_bytes());
        Ok(nonce)
    }

    pub const fn rekey_required(&self) -> bool {
        self.next_counter >= MAX_NONCES_PER_KEY
    }
    pub const fn remaining_nonce_capacity(&self) -> u64 {
        MAX_NONCES_PER_KEY - self.next_counter
    }

    #[cfg(test)]
    pub(crate) fn with_test_state(epoch: [u8; 8], next_counter: u64) -> Self {
        Self {
            epoch,
            next_counter,
        }
    }
}

impl Default for AesGcmNonceSequence {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct AuthenticatedChunk {
    pub chunk_index: u64,
    pub nonce: [u8; NONCE_SIZE],
    pub ciphertext: Vec<u8>,
}

pub fn seal_document_chunk(
    plaintext: &[u8],
    document_dek: &[u8; KEY_SIZE],
    derivation_salt: &[u8; SALT_SIZE],
    header: &DocumentAuthHeader,
    chunk_index: u64,
    caller_aad: &[u8],
    nonce_sequence: &mut AesGcmNonceSequence,
) -> Result<AuthenticatedChunk, CryptoError> {
    if plaintext.len() > MAX_DOCUMENT_CHUNK_BYTES {
        return Err(CryptoError::BoundaryViolation("document chunk size"));
    }
    let mut context = Vec::with_capacity(DOCUMENT_ID_BYTES + 8);
    context.extend_from_slice(&header.document_id);
    context.extend_from_slice(&chunk_index.to_be_bytes());
    let mut subkey = derive_domain_subkey(
        document_dek,
        derivation_salt,
        CryptoDomain::ContainerChunk,
        &context,
    )?;
    let aad = header.canonical_aad(chunk_index, caller_aad)?;
    let nonce = nonce_sequence.next_nonce()?;
    let encrypted = encrypt_aes_gcm_with_nonce(plaintext, &subkey, &aad, &nonce);
    crate::zeroize_best_effort(&mut subkey);
    let ciphertext = encrypted?;
    Ok(AuthenticatedChunk {
        chunk_index,
        nonce,
        ciphertext,
    })
}

/// AEAD authentication completes before plaintext is returned to the caller.
pub fn open_document_chunk(
    chunk: &AuthenticatedChunk,
    document_dek: &[u8; KEY_SIZE],
    derivation_salt: &[u8; SALT_SIZE],
    header: &DocumentAuthHeader,
    caller_aad: &[u8],
) -> Result<Vec<u8>, CryptoError> {
    if chunk.ciphertext.len() < 16 || chunk.ciphertext.len() > MAX_DOCUMENT_CHUNK_BYTES + 16 {
        return Err(CryptoError::BoundaryViolation("document ciphertext size"));
    }
    let mut context = Vec::with_capacity(DOCUMENT_ID_BYTES + 8);
    context.extend_from_slice(&header.document_id);
    context.extend_from_slice(&chunk.chunk_index.to_be_bytes());
    let mut subkey = derive_domain_subkey(
        document_dek,
        derivation_salt,
        CryptoDomain::ContainerChunk,
        &context,
    )?;
    let aad = header.canonical_aad(chunk.chunk_index, caller_aad)?;
    let decrypted = decrypt_aes_gcm(&chunk.ciphertext, &chunk.nonce, &subkey, &aad);
    crate::zeroize_best_effort(&mut subkey);
    decrypted
}

/// Equality-resistant fingerprint for confidential plaintext. It is keyed and therefore
/// must not be replaced by an unauthenticated serialized plaintext digest.
pub fn confidential_content_fingerprint(document_dek: &[u8; KEY_SIZE], content: &[u8]) -> [u8; 32] {
    *blake3::keyed_hash(document_dek, content).as_bytes()
}
