//! Crypto assurance metadata, migration policy and public-boundary limits.
//!
//! This is implementation evidence, not a certification statement. Stronger certification
//! claims require an independent cryptographic review of the composed system and its providers.

use serde::{Deserialize, Serialize};

use crate::recipient::{
    RECIPIENT_BUNDLE_VERSION, STANDARD_RECIPIENT_PROFILE_ID, TOP_SECRET_EXTERNAL_SUITE_ID,
    TOP_SECRET_PROFILE_ID,
};
use crate::{CryptoError, PRODUCTION_CRYPTO_SUITE_VERSION};

pub const CRYPTO_REGISTRY_VERSION: u16 = 1;
/// Sentinel used only by an explicit migration adapter for legacy single-recipient envelopes.
pub const LEGACY_UNBUNDLED_RECIPIENT_VERSION: u16 = 0;
pub const MAX_SERIALIZED_RECIPIENT_BUNDLE_BYTES: usize = 256 * 1024;
pub const MAX_SERIALIZED_CRYPTO_HEADER_BYTES: usize = 64 * 1024;
pub const MAX_PUBLIC_CRYPTO_INPUT_BYTES: usize = 4 * 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum CryptoPlatform {
    Windows,
    Linux,
    MacOs,
    AstraeaOs,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum CryptoImplementationOwner {
    VgtCrypto,
    VgtTopSecretInfinity,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AlgorithmRegistryEntry {
    pub registry_version: u16,
    pub suite_version: u16,
    pub profile_id: &'static str,
    pub implementation_owner: CryptoImplementationOwner,
    pub external_suite_id: Option<&'static str>,
}

pub const STANDARD_REGISTRY_ENTRY: AlgorithmRegistryEntry = AlgorithmRegistryEntry {
    registry_version: CRYPTO_REGISTRY_VERSION,
    suite_version: PRODUCTION_CRYPTO_SUITE_VERSION,
    profile_id: STANDARD_RECIPIENT_PROFILE_ID,
    implementation_owner: CryptoImplementationOwner::VgtCrypto,
    external_suite_id: None,
};

pub const TOP_SECRET_REGISTRY_ENTRY: AlgorithmRegistryEntry = AlgorithmRegistryEntry {
    registry_version: CRYPTO_REGISTRY_VERSION,
    suite_version: 1,
    profile_id: TOP_SECRET_PROFILE_ID,
    implementation_owner: CryptoImplementationOwner::VgtTopSecretInfinity,
    external_suite_id: Some(TOP_SECRET_EXTERNAL_SUITE_ID),
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MigrationAction {
    AcceptCurrent,
    RewrapOnWrite,
    RejectUnsupported,
}

pub fn migration_action(
    registry_version: u16,
    crypto_suite_version: u16,
    recipient_bundle_version: u16,
) -> MigrationAction {
    if registry_version != CRYPTO_REGISTRY_VERSION
        || crypto_suite_version != PRODUCTION_CRYPTO_SUITE_VERSION
    {
        return MigrationAction::RejectUnsupported;
    }
    match recipient_bundle_version {
        RECIPIENT_BUNDLE_VERSION => MigrationAction::AcceptCurrent,
        LEGACY_UNBUNDLED_RECIPIENT_VERSION => MigrationAction::RewrapOnWrite,
        _ => MigrationAction::RejectUnsupported,
    }
}

pub fn validate_public_crypto_input(bytes: &[u8], max: usize) -> Result<(), CryptoError> {
    if max == 0 || max > MAX_PUBLIC_CRYPTO_INPUT_BYTES || bytes.len() > max {
        Err(CryptoError::BoundaryViolation("public crypto input size"))
    } else {
        Ok(())
    }
}

/// Core behavior is platform-neutral. OS-specific secure persistence belongs to KeyVault adapters;
/// the Top Secret provider remains isolated behind the `vgt-top-secret` boundary.
pub const fn supported_platforms() -> [CryptoPlatform; 4] {
    [
        CryptoPlatform::Windows,
        CryptoPlatform::Linux,
        CryptoPlatform::MacOs,
        CryptoPlatform::AstraeaOs,
    ]
}

/// Marker consumed by release/audit tooling. It deliberately does not claim certification.
pub const INDEPENDENT_REVIEW_REQUIRED: bool = true;
pub const INDEPENDENT_REVIEW_POLICY: &str =
    "Independent cryptographic review required before stronger certification claims";
