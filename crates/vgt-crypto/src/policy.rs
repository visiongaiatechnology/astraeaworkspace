// STATUS: implementation-internal; certification claims require independent cryptographic review
//! Versioned crypto-suite policy, domain separation and side-channel helpers.
//!
//! This module deliberately composes established RustCrypto primitives. It does not
//! implement block ciphers, hashes, KDFs, or public-key arithmetic itself.

use hkdf::Hkdf;
use rand::{rngs::OsRng, RngCore};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use subtle::ConstantTimeEq;
use zeroize::Zeroize;

use crate::{CryptoError, KEY_SIZE};

pub const PRODUCTION_CRYPTO_SUITE_VERSION: u16 = 1;
pub const MAX_HKDF_CONTEXT_BYTES: usize = 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum AeadAlgorithm {
    Aes256Gcm,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum KdfAlgorithm {
    HkdfSha256,
    Argon2id,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum RecipientAlgorithm {
    X25519HkdfSha256Aes256Gcm,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct CryptoSuite {
    pub version: u16,
    pub aead: AeadAlgorithm,
    pub envelope_kdf: KdfAlgorithm,
    pub password_kdf: KdfAlgorithm,
    pub recipient: RecipientAlgorithm,
}

pub const PRODUCTION_CRYPTO_SUITE: CryptoSuite = CryptoSuite {
    version: PRODUCTION_CRYPTO_SUITE_VERSION,
    aead: AeadAlgorithm::Aes256Gcm,
    envelope_kdf: KdfAlgorithm::HkdfSha256,
    password_kdf: KdfAlgorithm::Argon2id,
    recipient: RecipientAlgorithm::X25519HkdfSha256Aes256Gcm,
};

pub fn crypto_suite(version: u16) -> Result<CryptoSuite, CryptoError> {
    match version {
        PRODUCTION_CRYPTO_SUITE_VERSION => Ok(PRODUCTION_CRYPTO_SUITE),
        other => Err(CryptoError::UnsupportedCryptoSuite(other)),
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum CryptoDomain {
    ContainerChunk,
    LocalKeySlot,
    DevicePinKeySlot,
    PortablePasswordKeySlot,
    RecipientKeySlot,
    ApplicationSecret,
    SearchIndex,
    DocumentMetadata,
    RecipientEnvelope,
    FutureExtension,
    SyncTransport,
    Backup,
}

impl CryptoDomain {
    pub const fn label(self) -> &'static [u8] {
        match self {
            Self::ContainerChunk => b"vgt.crypto.v1.container-chunk",
            Self::LocalKeySlot => b"vgt.crypto.v1.keyslot.local",
            Self::DevicePinKeySlot => b"vgt.crypto.v1.keyslot.device-pin",
            Self::PortablePasswordKeySlot => b"vgt.crypto.v1.keyslot.portable-password",
            Self::RecipientKeySlot => b"vgt.crypto.v1.keyslot.recipient",
            Self::ApplicationSecret => b"vgt.crypto.v1.application-secret",
            Self::SearchIndex => b"vgt.crypto.v1.search-index",
            Self::DocumentMetadata => b"vgt.crypto.v1.document-metadata",
            Self::RecipientEnvelope => b"vgt.crypto.v1.recipient-envelope",
            Self::FutureExtension => b"vgt.crypto.v1.future-extension",
            Self::SyncTransport => b"vgt.crypto.v1.sync-transport",
            Self::Backup => b"vgt.crypto.v1.backup",
        }
    }
}

pub fn fill_csprng(bytes: &mut [u8]) {
    OsRng.fill_bytes(bytes);
}

pub fn derive_hkdf_sha256<const N: usize>(
    input_key_material: &[u8],
    salt: &[u8],
    info: &[u8],
) -> Result<[u8; N], CryptoError> {
    if N == 0 || info.len() > MAX_HKDF_CONTEXT_BYTES {
        return Err(CryptoError::KeyDerivationFailed(
            "HKDF output/context boundary violation".to_string(),
        ));
    }
    let hk = Hkdf::<Sha256>::new(Some(salt), input_key_material);
    let mut output = [0u8; N];
    hk.expand(info, &mut output)
        .map_err(|error| CryptoError::KeyDerivationFailed(error.to_string()))?;
    Ok(output)
}

pub fn derive_domain_subkey(
    root_key: &[u8; KEY_SIZE],
    salt: &[u8],
    domain: CryptoDomain,
    context: &[u8],
) -> Result<[u8; KEY_SIZE], CryptoError> {
    if context.len() > MAX_HKDF_CONTEXT_BYTES {
        return Err(CryptoError::KeyDerivationFailed(
            "HKDF context boundary violation".to_string(),
        ));
    }
    let mut info = Vec::with_capacity(domain.label().len() + 1 + context.len());
    info.extend_from_slice(domain.label());
    info.push(0);
    info.extend_from_slice(context);
    derive_hkdf_sha256::<KEY_SIZE>(root_key, salt, &info)
}

/// Constant-time compare for equal-length sensitive byte strings.
/// Length is public metadata and may be rejected before the constant-time portion.
pub fn constant_time_eq(left: &[u8], right: &[u8]) -> bool {
    left.len() == right.len() && bool::from(left.ct_eq(right))
}

/// Best-effort in-process wipe for mutable secret buffers.
///
/// This is intentionally documented as best-effort: copies may have existed in registers,
/// allocator internals, crash dumps, swap, or immutable caller-owned buffers. The volatile
/// writes plus compiler fence reduce avoidable lifetime in this process but are not a claim
/// of perfect erasure from every hardware/software layer.
pub fn zeroize_best_effort(bytes: &mut [u8]) {
    bytes.zeroize();
}
