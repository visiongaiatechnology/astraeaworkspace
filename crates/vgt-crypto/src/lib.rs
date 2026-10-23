#![forbid(unsafe_code)]

//! # VGT Crypto Core
//!
//! Cryptographic primitives for VGT Workspace:
//! - AES-256-GCM symmetric authenticated encryption
//! - Argon2id key derivation from PIN/passwords with salt
//! - HKDF-SHA256 key derivation for envelope encryption (WMK + PIN-derived key)
//! - BLAKE3 cryptographic hashing for content addressing and data integrity verification
//! - Best-effort zeroization of mutable temporary secret buffers

pub mod assurance;
pub mod document_auth;
pub mod key_hierarchy;
pub mod policy;
pub mod recipient;

pub use assurance::{
    migration_action, supported_platforms, validate_public_crypto_input, AlgorithmRegistryEntry,
    CryptoImplementationOwner, CryptoPlatform, MigrationAction, CRYPTO_REGISTRY_VERSION,
    INDEPENDENT_REVIEW_POLICY, INDEPENDENT_REVIEW_REQUIRED, LEGACY_UNBUNDLED_RECIPIENT_VERSION,
    STANDARD_REGISTRY_ENTRY, TOP_SECRET_REGISTRY_ENTRY,
};
pub use document_auth::{
    confidential_content_fingerprint, open_document_chunk, seal_document_chunk,
    AesGcmNonceSequence, AuthenticatedChunk, DocumentAuthHeader, DOCUMENT_AUTH_FORMAT_VERSION,
    MAX_NONCES_PER_KEY,
};
pub use key_hierarchy::{
    open_wrapped_document_dek, rewrap_document_dek, wrap_document_dek, DocumentKeyHierarchy,
    DocumentSubkeyPurpose, WrappedDocumentDek, DOCUMENT_KEY_HIERARCHY_VERSION,
};
pub use policy::{
    constant_time_eq, crypto_suite, derive_domain_subkey, derive_hkdf_sha256, fill_csprng,
    zeroize_best_effort, AeadAlgorithm, CryptoDomain, CryptoSuite, KdfAlgorithm,
    RecipientAlgorithm, PRODUCTION_CRYPTO_SUITE, PRODUCTION_CRYPTO_SUITE_VERSION,
};

pub use recipient::{
    parse_recipient_bundle_json, recipient_profile_descriptor, serialize_recipient_bundle_json,
    unwrap_dek_from_recipients, validate_top_secret_delegation, wrap_dek_for_recipients,
    wrap_dek_for_recipients_cancellable, MultiRecipientEnvelope, RecipientProfileDescriptor,
    RecipientSecurityProfile, StandardRecipientSlot, VerifiedX25519Recipient,
    MAX_STANDARD_RECIPIENTS, RECIPIENT_BUNDLE_VERSION, STANDARD_RECIPIENT_PROFILE_ID,
    TOP_SECRET_EXTERNAL_SUITE_ID, TOP_SECRET_PROFILE_ID, TOP_SECRET_PROVIDER_OWNER,
};

use aes_gcm::{
    aead::{Aead, KeyInit, Payload},
    Aes256Gcm, Key, Nonce,
};
use argon2::{Algorithm, Argon2, Params, Version};
use hkdf::Hkdf;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use thiserror::Error;
use x25519_dalek::{PublicKey as X25519PublicKey, StaticSecret as X25519StaticSecret};

pub const KEY_SIZE: usize = 32; // 256-bit
pub const NONCE_SIZE: usize = 12; // 96-bit
pub const SALT_SIZE: usize = 16; // 128-bit
pub const BLAKE3_HASH_SIZE: usize = 32;
pub const ARGON2ID_PARAMETERS_VERSION: u16 = 1;
pub const MAX_PASSWORD_BYTES: usize = 4096;
pub const MAX_KDF_SALT_BYTES: usize = 64;

// Hard bounds against KDF DoS attacks
pub const MIN_ARGON_MEMORY_KB: u32 = 64 * 1024; // SEC-015: 64 MB minimum
pub const MAX_ARGON_MEMORY_KB: u32 = 256 * 1024; // 256 MB max ceiling
pub const MIN_ARGON_TIME_ITERS: u32 = 3;
pub const MAX_ARGON_TIME_ITERS: u32 = 10;
pub const MIN_ARGON_PARALLELISM: u32 = 4;
pub const MAX_ARGON_PARALLELISM: u32 = 8;

#[derive(Error, Debug)]
pub enum CryptoError {
    #[error("Encryption failed")]
    EncryptionFailed(String),

    #[error("Cryptographic authentication failed")]
    DecryptionFailed,

    #[error("Key derivation failed")]
    KeyDerivationFailed(String),

    #[error("Invalid key length: expected {0}, got {1}")]
    InvalidKeyLength(usize, usize),

    #[error("Cryptographic serialization failed")]
    SerializationError(String),

    #[error("Unsupported crypto suite version: {0}")]
    UnsupportedCryptoSuite(u16),

    #[error("Unsupported Argon2id parameter version: {0}")]
    UnsupportedKdfParameters(u16),

    #[error("Unsupported document key hierarchy version: {0}")]
    UnsupportedKeyHierarchyVersion(u16),

    #[error("Unsupported document authentication version: {0}")]
    UnsupportedDocumentAuthVersion(u16),

    #[error("Cryptographic boundary violation: {0}")]
    BoundaryViolation(&'static str),

    #[error("AEAD nonce sequence exhausted")]
    NonceExhausted,

    #[error("Unsupported or downgraded security profile")]
    UnsupportedSecurityProfile,

    #[error("Cryptographic operation cancelled at safe boundary")]
    Cancelled,
}

impl CryptoError {
    /// Stable non-secret diagnostic code. Error display strings must never embed key material.
    pub const fn diagnostic_code(&self) -> &'static str {
        match self {
            Self::EncryptionFailed(_) => "CRYPTO_ENCRYPTION_FAILED",
            Self::DecryptionFailed => "CRYPTO_AUTHENTICATION_FAILED",
            Self::KeyDerivationFailed(_) => "CRYPTO_KDF_FAILED",
            Self::InvalidKeyLength(_, _) => "CRYPTO_KEY_LENGTH_REJECTED",
            Self::SerializationError(_) => "CRYPTO_SERIALIZATION_FAILED",
            Self::UnsupportedCryptoSuite(_) => "CRYPTO_SUITE_UNSUPPORTED",
            Self::UnsupportedKdfParameters(_) => "CRYPTO_KDF_VERSION_UNSUPPORTED",
            Self::UnsupportedKeyHierarchyVersion(_) => "CRYPTO_KEY_HIERARCHY_UNSUPPORTED",
            Self::UnsupportedDocumentAuthVersion(_) => "CRYPTO_DOCUMENT_AUTH_UNSUPPORTED",
            Self::BoundaryViolation(_) => "CRYPTO_BOUNDARY_REJECTED",
            Self::NonceExhausted => "CRYPTO_REKEY_REQUIRED",
            Self::UnsupportedSecurityProfile => "CRYPTO_SECURITY_PROFILE_UNSUPPORTED",
            Self::Cancelled => "CRYPTO_CANCELLED",
        }
    }

    /// Caller-safe authentication outcome. Never distinguishes key/tag/padding/parser stages.
    pub const fn public_authentication_code(&self) -> &'static str {
        match self {
            Self::DecryptionFailed
            | Self::InvalidKeyLength(_, _)
            | Self::UnsupportedCryptoSuite(_)
            | Self::UnsupportedKdfParameters(_)
            | Self::UnsupportedKeyHierarchyVersion(_)
            | Self::UnsupportedDocumentAuthVersion(_)
            | Self::BoundaryViolation(_)
            | Self::UnsupportedSecurityProfile => "CRYPTO_AUTHENTICATION_FAILED",
            Self::NonceExhausted => "CRYPTO_REKEY_REQUIRED",
            Self::Cancelled => "CRYPTO_CANCELLED",
            Self::EncryptionFailed(_)
            | Self::KeyDerivationFailed(_)
            | Self::SerializationError(_) => "CRYPTO_OPERATION_FAILED",
        }
    }
}

/// Envelope encryption parameters stored in the container header
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct CryptoParameters {
    #[serde(default = "legacy_crypto_suite_version")]
    pub suite_version: u16,
    pub cipher: String,
    pub kdf_algorithm: String,
    #[serde(default = "legacy_argon2id_parameters_version")]
    pub kdf_params_version: u16,
    pub kdf_salt: Vec<u8>,
    pub kdf_memory_cost_kb: u32,
    pub kdf_time_cost_iters: u32,
    pub kdf_parallelism: u32,
}

fn legacy_crypto_suite_version() -> u16 {
    PRODUCTION_CRYPTO_SUITE_VERSION
}
fn legacy_argon2id_parameters_version() -> u16 {
    ARGON2ID_PARAMETERS_VERSION
}

impl Default for CryptoParameters {
    fn default() -> Self {
        let mut salt = vec![0u8; SALT_SIZE];
        fill_csprng(&mut salt);

        Self {
            suite_version: PRODUCTION_CRYPTO_SUITE_VERSION,
            cipher: "AES-256-GCM".to_string(),
            kdf_algorithm: "Argon2id".to_string(),
            kdf_params_version: ARGON2ID_PARAMETERS_VERSION,
            kdf_salt: salt,
            kdf_memory_cost_kb: 64 * 1024, // 64 MB
            kdf_time_cost_iters: 3,
            kdf_parallelism: 4,
        }
    }
}

/// Metadata required to unwrap a DEK sealed to one X25519 recipient.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct X25519RecipientEnvelope {
    #[serde(default = "legacy_recipient_envelope_version")]
    pub version: u16,
    pub ephemeral_public_key: [u8; 32],
    pub recipient_public_key_fingerprint_sha256: [u8; 32],
    pub hkdf_salt: [u8; SALT_SIZE],
    pub nonce: [u8; NONCE_SIZE],
    pub encrypted_dek: Vec<u8>,
}

fn legacy_recipient_envelope_version() -> u16 {
    1
}

fn recipient_aad(recipient_public_key: &[u8; 32], ephemeral_public_key: &[u8; 32]) -> Vec<u8> {
    let mut aad = Vec::with_capacity(24 + 32 + 32);
    aad.extend_from_slice(b"vgt_recipient_slot_v1|");
    aad.extend_from_slice(recipient_public_key);
    aad.extend_from_slice(ephemeral_public_key);
    aad
}

fn derive_recipient_wrap_key(
    shared_secret: &[u8; 32],
    salt: &[u8; SALT_SIZE],
) -> Result<[u8; KEY_SIZE], CryptoError> {
    if shared_secret.iter().all(|byte| *byte == 0) {
        return Err(CryptoError::KeyDerivationFailed(
            "X25519 shared secret is non-contributory".to_string(),
        ));
    }
    let hk = Hkdf::<Sha256>::new(Some(salt), shared_secret);
    let mut key = [0u8; KEY_SIZE];
    hk.expand(b"vgt_recipient_slot_v1", &mut key)
        .map_err(|error| CryptoError::KeyDerivationFailed(error.to_string()))?;
    Ok(key)
}

/// Derive the X25519 public key corresponding to a raw 32-byte private key.
pub fn x25519_public_from_private(recipient_private_key: &[u8; 32]) -> [u8; 32] {
    let secret = X25519StaticSecret::from(*recipient_private_key);
    X25519PublicKey::from(&secret).to_bytes()
}

/// Seal a document DEK to an X25519 recipient public key.
/// The ephemeral sender secret never leaves this function.
pub fn wrap_dek_for_x25519_recipient(
    dek: &[u8; KEY_SIZE],
    recipient_public_key: &[u8; 32],
) -> Result<X25519RecipientEnvelope, CryptoError> {
    let recipient = X25519PublicKey::from(*recipient_public_key);
    let ephemeral_secret = X25519StaticSecret::random_from_rng(rand::rngs::OsRng);
    let ephemeral_public = X25519PublicKey::from(&ephemeral_secret);
    let mut shared = ephemeral_secret.diffie_hellman(&recipient).to_bytes();
    let salt = generate_random_bytes::<SALT_SIZE>();
    let mut wrap_key = match derive_recipient_wrap_key(&shared, &salt) {
        Ok(key) => key,
        Err(error) => {
            zeroize_best_effort(&mut shared);
            return Err(error);
        }
    };
    let ephemeral_public_key = ephemeral_public.to_bytes();
    let aad = recipient_aad(recipient_public_key, &ephemeral_public_key);
    let encrypted = encrypt_aes_gcm(dek, &wrap_key, &aad);
    zeroize_best_effort(&mut shared);
    zeroize_best_effort(&mut wrap_key);
    let (encrypted_dek, nonce) = encrypted?;
    let fingerprint: [u8; 32] = Sha256::digest(recipient_public_key).into();
    Ok(X25519RecipientEnvelope {
        version: PRODUCTION_CRYPTO_SUITE_VERSION,
        ephemeral_public_key,
        recipient_public_key_fingerprint_sha256: fingerprint,
        hkdf_salt: salt,
        nonce,
        encrypted_dek,
    })
}

/// Unwrap a recipient-only DEK using the recipient's X25519 private key.
pub fn unwrap_dek_for_x25519_recipient(
    envelope: &X25519RecipientEnvelope,
    recipient_private_key: &[u8; 32],
) -> Result<[u8; KEY_SIZE], CryptoError> {
    crypto_suite(envelope.version)?;
    if envelope.encrypted_dek.len() != KEY_SIZE + 16 {
        return Err(CryptoError::DecryptionFailed);
    }
    let recipient_secret = X25519StaticSecret::from(*recipient_private_key);
    let recipient_public_key = x25519_public_from_private(recipient_private_key);
    let actual_fingerprint: [u8; 32] = Sha256::digest(recipient_public_key).into();
    if !constant_time_eq(
        &actual_fingerprint,
        &envelope.recipient_public_key_fingerprint_sha256,
    ) {
        return Err(CryptoError::DecryptionFailed);
    }
    let ephemeral_public = X25519PublicKey::from(envelope.ephemeral_public_key);
    let mut shared = recipient_secret
        .diffie_hellman(&ephemeral_public)
        .to_bytes();
    let mut wrap_key = match derive_recipient_wrap_key(&shared, &envelope.hkdf_salt) {
        Ok(key) => key,
        Err(error) => {
            zeroize_best_effort(&mut shared);
            return Err(error);
        }
    };
    let aad = recipient_aad(&recipient_public_key, &envelope.ephemeral_public_key);
    let decrypted = decrypt_aes_gcm(&envelope.encrypted_dek, &envelope.nonce, &wrap_key, &aad);
    zeroize_best_effort(&mut shared);
    zeroize_best_effort(&mut wrap_key);
    let mut plaintext = decrypted?;
    if plaintext.len() != KEY_SIZE {
        zeroize_best_effort(&mut plaintext);
        return Err(CryptoError::DecryptionFailed);
    }
    let mut dek = [0u8; KEY_SIZE];
    dek.copy_from_slice(&plaintext);
    zeroize_best_effort(&mut plaintext);
    Ok(dek)
}

/// Generate cryptographically secure random bytes
pub fn generate_random_bytes<const N: usize>() -> [u8; N] {
    let mut bytes = [0u8; N];
    fill_csprng(&mut bytes);
    bytes
}

/// Generate a 256-bit Document Encryption Key (DEK)
pub fn generate_dek() -> [u8; KEY_SIZE] {
    generate_random_bytes::<KEY_SIZE>()
}

/// Derive a 256-bit secret key from a user PIN/password and salt using Argon2id
pub fn derive_key_from_pin(
    pin: &str,
    salt: &[u8],
    params: &CryptoParameters,
) -> Result<[u8; KEY_SIZE], CryptoError> {
    crypto_suite(params.suite_version)?;
    if params.cipher != "AES-256-GCM" || params.kdf_algorithm != "Argon2id" {
        return Err(CryptoError::KeyDerivationFailed(
            "Unsupported KDF/cipher metadata for suite v1".to_string(),
        ));
    }
    if params.kdf_params_version != ARGON2ID_PARAMETERS_VERSION {
        return Err(CryptoError::UnsupportedKdfParameters(
            params.kdf_params_version,
        ));
    }
    if pin.is_empty() || pin.len() > MAX_PASSWORD_BYTES {
        return Err(CryptoError::BoundaryViolation("password length"));
    }
    if salt.len() < 8 || salt.len() > MAX_KDF_SALT_BYTES || salt != params.kdf_salt.as_slice() {
        return Err(CryptoError::KeyDerivationFailed(
            "KDF salt metadata rejected".to_string(),
        ));
    }

    if params.kdf_memory_cost_kb < MIN_ARGON_MEMORY_KB
        || params.kdf_memory_cost_kb > MAX_ARGON_MEMORY_KB
    {
        return Err(CryptoError::KeyDerivationFailed(format!(
            "Argon2 memory cost {} KB out of safe bounds [{}, {}]",
            params.kdf_memory_cost_kb, MIN_ARGON_MEMORY_KB, MAX_ARGON_MEMORY_KB
        )));
    }
    if params.kdf_time_cost_iters < MIN_ARGON_TIME_ITERS
        || params.kdf_time_cost_iters > MAX_ARGON_TIME_ITERS
    {
        return Err(CryptoError::KeyDerivationFailed(format!(
            "Argon2 time cost {} out of safe bounds [{}, {}]",
            params.kdf_time_cost_iters, MIN_ARGON_TIME_ITERS, MAX_ARGON_TIME_ITERS
        )));
    }
    if params.kdf_parallelism < MIN_ARGON_PARALLELISM
        || params.kdf_parallelism > MAX_ARGON_PARALLELISM
    {
        return Err(CryptoError::KeyDerivationFailed(format!(
            "Argon2 parallelism {} out of safe bounds [{}, {}]",
            params.kdf_parallelism, MIN_ARGON_PARALLELISM, MAX_ARGON_PARALLELISM
        )));
    }

    let argon_params = Params::new(
        params.kdf_memory_cost_kb,
        params.kdf_time_cost_iters,
        params.kdf_parallelism,
        Some(KEY_SIZE),
    )
    .map_err(|e| CryptoError::KeyDerivationFailed(e.to_string()))?;

    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, argon_params);

    let mut output_key = [0u8; KEY_SIZE];
    argon2
        .hash_password_into(pin.as_bytes(), salt, &mut output_key)
        .map_err(|e| CryptoError::KeyDerivationFailed(e.to_string()))?;

    Ok(output_key)
}

/// Derive a combined Document Unlock Key from a Workspace Master Key (WMK) and PIN-derived secret using HKDF-SHA256
pub fn derive_envelope_unlock_key(
    workspace_master_key: &[u8; KEY_SIZE],
    pin_secret: &[u8; KEY_SIZE],
    context_info: &[u8],
) -> Result<[u8; KEY_SIZE], CryptoError> {
    if context_info.is_empty() || context_info.len() > policy::MAX_HKDF_CONTEXT_BYTES {
        return Err(CryptoError::BoundaryViolation("envelope context"));
    }
    let hk = Hkdf::<Sha256>::new(Some(workspace_master_key), pin_secret);
    let mut unlock_key = [0u8; KEY_SIZE];
    hk.expand(context_info, &mut unlock_key)
        .map_err(|e| CryptoError::KeyDerivationFailed(e.to_string()))?;
    Ok(unlock_key)
}

/// Encrypt plaintext with AES-256-GCM using authenticated additional data (AAD)
pub(crate) fn encrypt_aes_gcm_with_nonce(
    plaintext: &[u8],
    key: &[u8; KEY_SIZE],
    aad: &[u8],
    nonce_bytes: &[u8; NONCE_SIZE],
) -> Result<Vec<u8>, CryptoError> {
    let nonce = Nonce::from_slice(nonce_bytes);
    let cipher_key = Key::<Aes256Gcm>::from_slice(key);
    let cipher = Aes256Gcm::new(cipher_key);
    cipher
        .encrypt(
            nonce,
            Payload {
                msg: plaintext,
                aad,
            },
        )
        .map_err(|e| CryptoError::EncryptionFailed(e.to_string()))
}

pub fn encrypt_aes_gcm(
    plaintext: &[u8],
    key: &[u8; KEY_SIZE],
    aad: &[u8],
) -> Result<(Vec<u8>, [u8; NONCE_SIZE]), CryptoError> {
    let nonce_bytes = generate_random_bytes::<NONCE_SIZE>();
    let ciphertext = encrypt_aes_gcm_with_nonce(plaintext, key, aad, &nonce_bytes)?;
    Ok((ciphertext, nonce_bytes))
}

/// Decrypt ciphertext with AES-256-GCM using authenticated additional data (AAD)
pub fn decrypt_aes_gcm(
    ciphertext: &[u8],
    nonce: &[u8; NONCE_SIZE],
    key: &[u8; KEY_SIZE],
    aad: &[u8],
) -> Result<Vec<u8>, CryptoError> {
    let cipher_key = Key::<Aes256Gcm>::from_slice(key);
    let cipher = Aes256Gcm::new(cipher_key);
    let nonce_ref = Nonce::from_slice(nonce);

    let payload = Payload {
        msg: ciphertext,
        aad,
    };

    cipher
        .decrypt(nonce_ref, payload)
        .map_err(|_| CryptoError::DecryptionFailed)
}

/// Calculate an unkeyed BLAKE3 checksum for non-confidential integrity/content-addressing.
/// Never serialize this over confidential plaintext as a document-equality identifier; use
/// `confidential_content_fingerprint` where equality disclosure is not an explicit policy.
pub fn hash_blake3(data: &[u8]) -> [u8; BLAKE3_HASH_SIZE] {
    let mut hasher = blake3::Hasher::new();
    hasher.update(data);
    *hasher.finalize().as_bytes()
}

/// Hex-encoded BLAKE3 hash string
pub fn hash_blake3_hex(data: &[u8]) -> String {
    let hash = hash_blake3(data);
    let mut s = String::with_capacity(64);
    for b in hash {
        s.push_str(&format!("{:02x}", b));
    }
    s
}

#[cfg(test)]
mod tests;
