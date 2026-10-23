use crate::{ManifestError, PluginManifest, MAX_PLUGIN_PACKAGE_BYTES};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;
use thiserror::Error;

#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum PackageError {
    #[error("PLUGIN_MANIFEST_REJECTED")]
    Manifest,
    #[error("PLUGIN_PACKAGE_SIZE_REJECTED")]
    Size,
    #[error("PLUGIN_PACKAGE_DIGEST_MISMATCH")]
    Digest,
    #[error("PLUGIN_SIGNATURE_ENCODING_REJECTED")]
    SignatureEncoding,
    #[error("PLUGIN_SIGNATURE_INVALID")]
    SignatureInvalid,
    #[error("PLUGIN_UPDATE_SIGNATURE_REQUIRED")]
    UpdateSignatureRequired,
    #[error("PLUGIN_UPDATE_SIGNER_CHANGED")]
    UpdateSignerChanged,
}

impl From<ManifestError> for PackageError {
    fn from(_: ManifestError) -> Self {
        Self::Manifest
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SignatureState {
    UnsignedExplicitReview,
    VerifiedUnpinned,
    VerifiedPinned,
    Rejected,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PackageVerification {
    pub digest_verified: bool,
    pub signature_state: SignatureState,
    pub signer_fingerprint_sha256: Option<String>,
    pub package_sha256: String,
}

pub fn verify_initial_package(
    bytes: &[u8],
    manifest: &PluginManifest,
) -> Result<PackageVerification, PackageError> {
    verify_common(bytes, manifest, None, false)
}

pub fn verify_update_package(
    bytes: &[u8],
    manifest: &PluginManifest,
    pinned_signer_fingerprint: &str,
) -> Result<PackageVerification, PackageError> {
    verify_common(bytes, manifest, Some(pinned_signer_fingerprint), true)
}

fn verify_common(
    bytes: &[u8],
    manifest: &PluginManifest,
    pinned_signer_fingerprint: Option<&str>,
    require_signature: bool,
) -> Result<PackageVerification, PackageError> {
    manifest.validate()?;
    if bytes.is_empty() || bytes.len() > MAX_PLUGIN_PACKAGE_BYTES {
        return Err(PackageError::Size);
    }
    let package_sha256 = sha256_hex(bytes);
    if !ct_ascii_eq(&package_sha256, &manifest.package_sha256) {
        return Err(PackageError::Digest);
    }
    let Some(signature_meta) = &manifest.signature else {
        if require_signature {
            return Err(PackageError::UpdateSignatureRequired);
        }
        return Ok(PackageVerification {
            digest_verified: true,
            signature_state: SignatureState::UnsignedExplicitReview,
            signer_fingerprint_sha256: None,
            package_sha256,
        });
    };
    let public_bytes = BASE64
        .decode(&signature_meta.public_key_base64)
        .map_err(|_| PackageError::SignatureEncoding)?;
    let public_array: [u8; 32] = public_bytes
        .try_into()
        .map_err(|_| PackageError::SignatureEncoding)?;
    let verifying_key =
        VerifyingKey::from_bytes(&public_array).map_err(|_| PackageError::SignatureEncoding)?;
    let signature_bytes = BASE64
        .decode(&signature_meta.signature_base64)
        .map_err(|_| PackageError::SignatureEncoding)?;
    let signature =
        Signature::from_slice(&signature_bytes).map_err(|_| PackageError::SignatureEncoding)?;
    verifying_key
        .verify(&signing_payload(manifest), &signature)
        .map_err(|_| PackageError::SignatureInvalid)?;
    let fingerprint = sha256_hex(&public_array);
    if let Some(pinned) = pinned_signer_fingerprint {
        if !ct_ascii_eq(&fingerprint, pinned) {
            return Err(PackageError::UpdateSignerChanged);
        }
    }
    Ok(PackageVerification {
        digest_verified: true,
        signature_state: if pinned_signer_fingerprint.is_some() {
            SignatureState::VerifiedPinned
        } else {
            SignatureState::VerifiedUnpinned
        },
        signer_fingerprint_sha256: Some(fingerprint),
        package_sha256,
    })
}

pub fn signing_payload(manifest: &PluginManifest) -> Vec<u8> {
    let mut capabilities = manifest
        .requested_capabilities
        .iter()
        .map(|c| format!("{c:?}"))
        .collect::<Vec<_>>();
    capabilities.sort();
    let source = match &manifest.update_source {
        crate::PluginUpdateSource::OfflineFile { source_id } => format!("offline:{source_id}"),
        crate::PluginUpdateSource::ManagedChannel { channel_id } => format!("managed:{channel_id}"),
        crate::PluginUpdateSource::Disabled => "disabled".to_string(),
    };
    [
        "VGT/ASTRAEA/PLUGIN-PACKAGE/2".to_string(),
        manifest.schema_version.clone(),
        manifest.plugin_id.clone(),
        manifest.publisher.clone(),
        manifest.version.clone(),
        manifest.api_compatibility.minimum_inclusive.clone(),
        manifest
            .api_compatibility
            .maximum_exclusive
            .clone()
            .unwrap_or_default(),
        manifest.package_sha256.clone(),
        capabilities.join(","),
        source,
    ]
    .join("\0")
    .into_bytes()
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    let mut output = String::with_capacity(64);
    use std::fmt::Write as _;
    for byte in digest {
        let _ = write!(&mut output, "{byte:02x}");
    }
    output
}

fn ct_ascii_eq(left: &str, right: &str) -> bool {
    let l = left.as_bytes();
    let r = right.as_bytes();
    if l.len() != r.len() {
        return false;
    }
    l.ct_eq(r).into()
}
