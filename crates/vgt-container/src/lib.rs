#![forbid(unsafe_code)]
// STATUS: DIAMANT VGT SUPREME — authoritative VWC native storage core.
//! # VGT Workspace Container (VWC)
//!
//! VWC v3 is the native Astraea storage truth. It keeps v1/v2 read compatibility while
//! adding a separately authenticated manifest, explicit critical/optional chunk semantics,
//! deterministic nonce discipline, streaming writes/reads, checked framing arithmetic and
//! container-vs-payload compatibility separation.

mod api;
mod format;
mod legacy;
mod manifest;
mod stream_reader;
mod streaming;

pub use format::{
    compress_safe_asset_before_encryption, required_stream_chunks, write_stream_chunks,
    ChunkDescriptor, ChunkType, CompressionAlgorithm, ContainerStructure,
};
pub use manifest::{
    migration_plan, CompatibilityMatrixEntry, ContainerCompatibility, ContainerManifest,
    ContainerMigrationAction, ContainerMigrationPlan, ManifestChunkEntry, CHUNK_FLAG_CRITICAL,
    COMPATIBILITY_MATRIX, CURRENT_MANIFEST_SCHEMA_VERSION,
};

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use thiserror::Error;
use vgt_crypto::SALT_SIZE;
use vgt_keyvault::{KeySlot, KeyVaultError, UnlockPolicy};
use vgt_object_model::SecurityProfile;

pub const MAGIC_BYTES: &[u8; 4] = b"VWC1";
pub const MIN_FORMAT_VERSION: u16 = 1;
pub const CURRENT_FORMAT_VERSION: u16 = 3;
pub const CURRENT_CRYPTO_VERSION: u16 = 1;
pub const CURRENT_HEADER_SCHEMA_VERSION: u16 = 3;
pub const MAX_CONTAINER_SIZE: usize = 512 * 1024 * 1024;
pub const MAX_METADATA_SIZE: usize = 10 * 1024 * 1024;
pub const MAX_MANIFEST_SIZE: usize = 2 * 1024 * 1024;
pub const MAX_CHUNK_COUNT: u32 = 10_000;
pub const MAX_CHUNK_SIZE: usize = 128 * 1024 * 1024;
pub const STREAM_PLAINTEXT_CHUNK_SIZE: usize = 4 * 1024 * 1024;
pub const MAX_DOCUMENT_PLAINTEXT_SIZE: usize = 256 * 1024 * 1024;
pub const MAX_TOTAL_PLAINTEXT_SIZE: usize = 384 * 1024 * 1024;

#[derive(Error, Debug)]
pub enum ContainerError {
    #[error("Invalid VWC magic")]
    InvalidMagic,
    #[error("Unsupported VWC format version")]
    UnsupportedFormatVersion(u16),
    #[error("Unsupported VWC crypto version")]
    UnsupportedCryptoVersion(u16),
    #[error("Unsupported VWC manifest version")]
    UnsupportedManifestVersion(u16),
    #[error("Container exceeds configured size ceiling")]
    ContainerTooLarge(usize),
    #[error("Metadata exceeds configured size ceiling")]
    MetadataTooLarge(usize, usize),
    #[error("Manifest exceeds configured size ceiling")]
    ManifestTooLarge(usize, usize),
    #[error("Chunk count exceeds configured ceiling")]
    TooManyChunks(u32, u32),
    #[error("Encrypted chunk exceeds configured ceiling")]
    ChunkTooLarge(usize, usize),
    #[error("Plaintext chunk exceeds configured ceiling")]
    ChunkPlaintextTooLarge(usize, usize),
    #[error("Document plaintext exceeds configured ceiling")]
    PlaintextTooLarge(usize),
    #[error("Aggregate plaintext exceeds configured ceiling")]
    PlaintextTotalTooLarge(u64),
    #[error("Container stream is truncated")]
    UnexpectedEof,
    #[error("Container contains trailing bytes")]
    TrailingBytes,
    #[error("Container has no document tree")]
    MissingDocumentTree,
    #[error("Compressed payload is invalid")]
    InvalidCompressedPayload,
    #[error("Checked offset arithmetic overflow")]
    OffsetOverflow,
    #[error("Manifest and chunk framing disagree")]
    ManifestChunkMismatch,
    #[error("Manifest is corrupted or incompatible")]
    CorruptedManifest,
    #[error("Manifest compatibility policy rejects this container")]
    IncompatibleManifest,
    #[error("Unknown critical chunk type")]
    UnknownCriticalChunk(u8),
    #[error("VWC v3 is missing its chunk KDF salt")]
    MissingChunkKdfSalt,
    #[error("Key-slot count violates VWC limits")]
    InvalidKeySlotCount(usize),
    #[error("Container migration requires the credential-specific migration API")]
    MigrationCredentialsRequired,
    #[error("Legacy header API cannot parse VWC v3")]
    LegacyHeaderApiOnV3,
    #[error("Streaming reader supports current VWC only; legacy version requires bounded buffer")]
    StreamingLegacyRequiresBuffer(u16),
    #[error("Container I/O operation failed")]
    Io(#[from] std::io::Error),
    #[error("Container serialization failed")]
    Serialization(#[from] serde_json::Error),
    #[error("Container cryptographic verification failed")]
    Crypto(#[from] vgt_crypto::CryptoError),
    #[error("Container key policy failed")]
    KeyVault(#[from] KeyVaultError),
    #[error("Container operation was cancelled")]
    Cancelled,
    #[error("Container data is corrupted")]
    CorruptedData,
}

impl ContainerError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::InvalidMagic => "invalid-magic",
            Self::UnsupportedFormatVersion(_) => "unsupported-format-version",
            Self::UnsupportedCryptoVersion(_) => "unsupported-crypto-version",
            Self::UnsupportedManifestVersion(_) => "unsupported-manifest-version",
            Self::ContainerTooLarge(_) => "container-too-large",
            Self::MetadataTooLarge(_, _) => "metadata-too-large",
            Self::ManifestTooLarge(_, _) => "manifest-too-large",
            Self::TooManyChunks(_, _) => "too-many-chunks",
            Self::ChunkTooLarge(_, _) | Self::ChunkPlaintextTooLarge(_, _) => "chunk-too-large",
            Self::PlaintextTooLarge(_) | Self::PlaintextTotalTooLarge(_) => "plaintext-too-large",
            Self::UnexpectedEof => "truncated",
            Self::TrailingBytes => "trailing-bytes",
            Self::MissingDocumentTree => "missing-document-tree",
            Self::InvalidCompressedPayload => "invalid-compressed-payload",
            Self::OffsetOverflow => "offset-overflow",
            Self::ManifestChunkMismatch | Self::CorruptedManifest | Self::IncompatibleManifest => {
                "manifest-rejected"
            }
            Self::UnknownCriticalChunk(_) => "unknown-critical-chunk",
            Self::MissingChunkKdfSalt => "missing-chunk-kdf-salt",
            Self::InvalidKeySlotCount(_) => "invalid-key-slot-count",
            Self::MigrationCredentialsRequired => "migration-credentials-required",
            Self::LegacyHeaderApiOnV3 | Self::StreamingLegacyRequiresBuffer(_) => {
                "api-version-mismatch"
            }
            Self::Io(_) => "io-error",
            Self::Serialization(_) => "serialization-error",
            Self::Crypto(_) => "authentication-failed",
            Self::KeyVault(_) => "keyvault-error",
            Self::Cancelled => "cancelled",
            Self::CorruptedData => "corrupted-data",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContainerHeaderMetadata {
    #[serde(default = "default_header_schema_version")]
    pub header_schema_version: u16,
    pub key_slots: Vec<KeySlot>,
    pub document_id: String,
    pub document_kind: String,
    #[serde(default)]
    pub security_profile: SecurityProfile,
    #[serde(default = "default_unlock_policy")]
    pub unlock_policy: UnlockPolicy,
    #[serde(default)]
    pub compression: CompressionAlgorithm,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub chunk_kdf_salt: Option<[u8; SALT_SIZE]>,
    #[serde(flatten)]
    pub extensions: HashMap<String, serde_json::Value>,
}

fn default_header_schema_version() -> u16 {
    1
}
fn default_unlock_policy() -> UnlockPolicy {
    UnlockPolicy::DeviceOnly
}

#[derive(Default, Clone, Copy)]
pub struct SaveOptions<'a> {
    pub policy: Option<UnlockPolicy>,
    pub pin: Option<&'a str>,
    pub portable_password: Option<&'a str>,
    pub recipient_public_key: Option<&'a [u8; 32]>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RecoveryProbe {
    pub format_version: u16,
    pub document_kind: String,
    pub security_profile: String,
    pub protection: String,
}

pub trait CancellationCheck {
    fn is_cancelled(&self) -> bool;
}

impl<F> CancellationCheck for F
where
    F: Fn() -> bool,
{
    fn is_cancelled(&self) -> bool {
        self()
    }
}

pub struct VgtContainer;
