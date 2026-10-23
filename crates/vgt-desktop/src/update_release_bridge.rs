// STATUS: DIAMANT VGT SUPREME
//! Signed release-manifest and offline update-artifact verification.
//! The compile-time public key and release sequence are trust roots. UI policy can narrow access,
//! but it cannot bypass signature, digest, channel or rollback checks.

use crate::update_storage_common::update_root;
use crate::update_transfer_bridge::{
    cleanup_transfer, read_transfer_checkpoint, transfer_package_path, VerifyTransferUpdateRequest,
};
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use tauri::AppHandle;

const MANIFEST_SCHEMA: &str = "astraea-release-manifest/v1";
const SIGNED_SCHEMA: &str = "astraea-signed-release-manifest/v1";
const PRODUCT_ID: &str = "technology.visiongaia.astraea.workspace";
const MAX_MANIFEST_BYTES: usize = 256 * 1024;
const MAX_ARTIFACTS: usize = 64;
const MAX_ROLLBACK_AUTHORIZATIONS: usize = 32;
const MAX_UPDATE_BYTES: u64 = 4 * 1024 * 1024 * 1024;
const COPY_BUFFER_BYTES: usize = 1024 * 1024;
const MAX_JOURNAL_BYTES: usize = 32 * 1024;
const JOURNAL_FILE: &str = "update-recovery-v1.json";

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ReleaseChannel {
    Stable,
    Beta,
    Managed,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ArtifactKind {
    Full,
    Delta,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ReleaseArtifact {
    pub platform: String,
    pub architecture: String,
    pub kind: ArtifactKind,
    pub file_name: String,
    pub size_bytes: u64,
    pub sha256_hex: String,
    pub signature_base64: String,
    pub download_url: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct RollbackAuthorization {
    pub authorization_id: String,
    pub from_sequence: u64,
    pub to_sequence: u64,
    pub reason_code: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ReleaseManifest {
    pub schema: String,
    pub product_id: String,
    pub version: String,
    pub sequence: u64,
    pub minimum_supported_sequence: u64,
    pub channel: ReleaseChannel,
    pub commit: String,
    pub created_at: String,
    pub artifacts: Vec<ReleaseArtifact>,
    pub rollback_authorizations: Vec<RollbackAuthorization>,
    pub release_hashes_sha256: String,
    pub sbom_sha256: String,
    pub dependency_inventory_sha256: String,
    pub build_provenance_sha256: String,
    pub security_advisory_url: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct SignedReleaseManifest {
    pub schema: String,
    pub key_id: String,
    pub manifest: ReleaseManifest,
    pub signature_base64: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct VerifyOfflineUpdateRequest {
    pub signed_manifest_json: String,
    pub package_path: String,
    pub expected_channel: ReleaseChannel,
    pub explicit_update_policy: bool,
    pub allow_offline_manual: bool,
    pub allow_delta: bool,
    pub recovery_mode: bool,
}

#[derive(Debug, Serialize)]
pub struct UpdateReleaseStatus {
    pub configured: bool,
    pub current_version: &'static str,
    pub current_sequence: Option<u64>,
    pub release_channel: Option<String>,
    pub key_id: Option<String>,
    pub network_download_default: bool,
    pub automatic_install_default: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UpdateRecoveryJournal {
    pub schema: String,
    pub pending_version: String,
    pub pending_sequence: u64,
    pub pending_sha256: String,
    pub pending_cached_path: String,
    pub previous_version: String,
    pub previous_sequence: u64,
    pub previous_sha256: Option<String>,
    pub previous_cached_path: Option<String>,
    pub phase: String,
    pub install_attempts: u32,
}

#[derive(Debug, Serialize)]
pub struct VerifiedOfflineUpdate {
    pub verified: bool,
    pub version: String,
    pub sequence: u64,
    pub channel: ReleaseChannel,
    pub artifact_kind: ArtifactKind,
    pub artifact_file_name: String,
    pub artifact_sha256: String,
    pub cached_path: String,
    pub rollback_authorized: bool,
    pub security_advisory_url: String,
    pub journal: UpdateRecoveryJournal,
}

fn fail(code: &'static str) -> String {
    code.to_string()
}

fn valid_short_ascii(value: &str, max: usize) -> bool {
    !value.is_empty()
        && value.len() <= max
        && value.bytes().all(|b| b.is_ascii_graphic() || b == b' ')
}

fn valid_hex(value: &str, bytes: usize) -> bool {
    value.len() == bytes * 2 && value.bytes().all(|b| b.is_ascii_hexdigit())
}

fn ct_eq(left: &[u8], right: &[u8]) -> bool {
    if left.len() != right.len() {
        return false;
    }
    let mut diff = 0u8;
    for (&a, &b) in left.iter().zip(right.iter()) {
        diff |= a ^ b;
    }
    diff == 0
}

fn append_u64(out: &mut Vec<u8>, value: u64) {
    out.extend_from_slice(&value.to_be_bytes());
}
fn append_str(out: &mut Vec<u8>, value: &str) {
    let bytes = value.as_bytes();
    out.extend_from_slice(&(bytes.len() as u32).to_be_bytes());
    out.extend_from_slice(bytes);
}
fn append_channel(out: &mut Vec<u8>, channel: ReleaseChannel) {
    append_str(
        out,
        match channel {
            ReleaseChannel::Stable => "stable",
            ReleaseChannel::Beta => "beta",
            ReleaseChannel::Managed => "managed",
        },
    );
}
fn append_kind(out: &mut Vec<u8>, kind: ArtifactKind) {
    append_str(
        out,
        match kind {
            ArtifactKind::Full => "full",
            ArtifactKind::Delta => "delta",
        },
    );
}

fn manifest_signing_bytes(manifest: &ReleaseManifest) -> Vec<u8> {
    let mut out = b"ASTRAEA_RELEASE_MANIFEST_V1\0".to_vec();
    append_str(&mut out, &manifest.schema);
    append_str(&mut out, &manifest.product_id);
    append_str(&mut out, &manifest.version);
    append_u64(&mut out, manifest.sequence);
    append_u64(&mut out, manifest.minimum_supported_sequence);
    append_channel(&mut out, manifest.channel);
    append_str(&mut out, &manifest.commit);
    append_str(&mut out, &manifest.created_at);
    append_u64(&mut out, manifest.artifacts.len() as u64);
    for artifact in &manifest.artifacts {
        append_str(&mut out, &artifact.platform);
        append_str(&mut out, &artifact.architecture);
        append_kind(&mut out, artifact.kind);
        append_str(&mut out, &artifact.file_name);
        append_u64(&mut out, artifact.size_bytes);
        append_str(&mut out, &artifact.sha256_hex);
        append_str(&mut out, &artifact.signature_base64);
        append_str(&mut out, artifact.download_url.as_deref().unwrap_or(""));
    }
    append_u64(&mut out, manifest.rollback_authorizations.len() as u64);
    for auth in &manifest.rollback_authorizations {
        append_str(&mut out, &auth.authorization_id);
        append_u64(&mut out, auth.from_sequence);
        append_u64(&mut out, auth.to_sequence);
        append_str(&mut out, &auth.reason_code);
    }
    append_str(&mut out, &manifest.release_hashes_sha256);
    append_str(&mut out, &manifest.sbom_sha256);
    append_str(&mut out, &manifest.dependency_inventory_sha256);
    append_str(&mut out, &manifest.build_provenance_sha256);
    append_str(&mut out, &manifest.security_advisory_url);
    out
}

fn artifact_signing_bytes(manifest: &ReleaseManifest, artifact: &ReleaseArtifact) -> Vec<u8> {
    let mut out = b"ASTRAEA_RELEASE_ARTIFACT_V1\0".to_vec();
    append_str(&mut out, &manifest.product_id);
    append_str(&mut out, &manifest.version);
    append_u64(&mut out, manifest.sequence);
    append_channel(&mut out, manifest.channel);
    append_str(&mut out, &artifact.platform);
    append_str(&mut out, &artifact.architecture);
    append_kind(&mut out, artifact.kind);
    append_str(&mut out, &artifact.file_name);
    append_u64(&mut out, artifact.size_bytes);
    append_str(&mut out, &artifact.sha256_hex);
    out
}

fn compiled_sequence() -> Option<u64> {
    option_env!("ASTRAEA_RELEASE_SEQUENCE").and_then(|value| value.parse::<u64>().ok())
}

fn compiled_channel() -> Option<&'static str> {
    option_env!("ASTRAEA_RELEASE_CHANNEL")
        .filter(|value| matches!(*value, "stable" | "beta" | "managed"))
}

fn trusted_verifying_key() -> Result<(VerifyingKey, String), String> {
    let encoded = option_env!("ASTRAEA_UPDATE_PUBLIC_KEY_B64")
        .ok_or_else(|| fail("UPDATE_TRUST_ROOT_UNCONFIGURED"))?;
    let decoded = B64
        .decode(encoded.as_bytes())
        .map_err(|_| fail("UPDATE_TRUST_ROOT_REJECTED"))?;
    let bytes: [u8; 32] = decoded
        .try_into()
        .map_err(|_| fail("UPDATE_TRUST_ROOT_REJECTED"))?;
    let key = VerifyingKey::from_bytes(&bytes).map_err(|_| fail("UPDATE_TRUST_ROOT_REJECTED"))?;
    let key_id = hex::encode(&Sha256::digest(bytes)[..8]);
    Ok((key, key_id))
}

fn verify_signature(
    key: &VerifyingKey,
    encoded: &str,
    message: &[u8],
    code: &'static str,
) -> Result<(), String> {
    let bytes = B64.decode(encoded.as_bytes()).map_err(|_| fail(code))?;
    let signature = Signature::from_slice(&bytes).map_err(|_| fail(code))?;
    key.verify(message, &signature).map_err(|_| fail(code))
}

fn validate_manifest_shape(signed: &SignedReleaseManifest) -> Result<(), String> {
    let manifest = &signed.manifest;
    if signed.schema != SIGNED_SCHEMA
        || manifest.schema != MANIFEST_SCHEMA
        || manifest.product_id != PRODUCT_ID
    {
        return Err(fail("UPDATE_MANIFEST_SCHEMA_REJECTED"));
    }
    if !valid_short_ascii(&signed.key_id, 128)
        || !valid_short_ascii(&manifest.version, 64)
        || !valid_short_ascii(&manifest.commit, 128)
        || !valid_short_ascii(&manifest.created_at, 64)
    {
        return Err(fail("UPDATE_MANIFEST_FIELD_REJECTED"));
    }
    if manifest.sequence == 0 || manifest.minimum_supported_sequence > manifest.sequence {
        return Err(fail("UPDATE_MANIFEST_SEQUENCE_REJECTED"));
    }
    if manifest.artifacts.is_empty()
        || manifest.artifacts.len() > MAX_ARTIFACTS
        || manifest.rollback_authorizations.len() > MAX_ROLLBACK_AUTHORIZATIONS
    {
        return Err(fail("UPDATE_MANIFEST_CARDINALITY_REJECTED"));
    }
    if !valid_hex(&manifest.release_hashes_sha256, 32)
        || !valid_hex(&manifest.sbom_sha256, 32)
        || !valid_hex(&manifest.dependency_inventory_sha256, 32)
        || !valid_hex(&manifest.build_provenance_sha256, 32)
    {
        return Err(fail("UPDATE_MANIFEST_EVIDENCE_DIGEST_REJECTED"));
    }
    if manifest.security_advisory_url.len() > 512
        || !manifest.security_advisory_url.starts_with("https://")
    {
        return Err(fail("UPDATE_SECURITY_ADVISORY_URL_REJECTED"));
    }

    let mut previous_artifact_key: Option<String> = None;
    for artifact in &manifest.artifacts {
        if !valid_short_ascii(&artifact.platform, 32)
            || !valid_short_ascii(&artifact.architecture, 32)
            || !valid_short_ascii(&artifact.file_name, 192)
            || artifact.file_name.contains('/')
            || artifact.file_name.contains('\\')
            || artifact.size_bytes == 0
            || artifact.size_bytes > MAX_UPDATE_BYTES
            || !valid_hex(&artifact.sha256_hex, 32)
        {
            return Err(fail("UPDATE_ARTIFACT_FIELD_REJECTED"));
        }
        if let Some(url) = artifact.download_url.as_deref() {
            if url.len() > 2048 || !url.starts_with("https://") {
                return Err(fail("UPDATE_ARTIFACT_URL_REJECTED"));
            }
        }
        let key = format!(
            "{}\u{1f}{}\u{1f}{:?}\u{1f}{}",
            artifact.platform, artifact.architecture, artifact.kind, artifact.file_name
        );
        if previous_artifact_key
            .as_ref()
            .is_some_and(|previous| previous >= &key)
        {
            return Err(fail("UPDATE_ARTIFACT_ORDER_REJECTED"));
        }
        previous_artifact_key = Some(key);
    }

    let mut previous_rollback_key: Option<(u64, u64, &str)> = None;
    for auth in &manifest.rollback_authorizations {
        if auth.from_sequence == 0
            || auth.to_sequence == 0
            || auth.to_sequence >= auth.from_sequence
            || !valid_short_ascii(&auth.authorization_id, 128)
            || !valid_short_ascii(&auth.reason_code, 128)
        {
            return Err(fail("UPDATE_ROLLBACK_AUTHORIZATION_REJECTED"));
        }
        let key = (
            auth.from_sequence,
            auth.to_sequence,
            auth.authorization_id.as_str(),
        );
        if previous_rollback_key.is_some_and(|previous| previous >= key) {
            return Err(fail("UPDATE_ROLLBACK_ORDER_REJECTED"));
        }
        previous_rollback_key = Some(key);
    }
    Ok(())
}

fn parse_signed_manifest(json: &str) -> Result<SignedReleaseManifest, String> {
    if json.is_empty() || json.len() > MAX_MANIFEST_BYTES {
        return Err(fail("UPDATE_MANIFEST_SIZE_REJECTED"));
    }
    let signed: SignedReleaseManifest =
        serde_json::from_str(json).map_err(|_| fail("UPDATE_MANIFEST_PARSE_REJECTED"))?;
    validate_manifest_shape(&signed)?;
    let (key, expected_key_id) = trusted_verifying_key()?;
    if !ct_eq(expected_key_id.as_bytes(), signed.key_id.as_bytes()) {
        return Err(fail("UPDATE_MANIFEST_KEY_ID_REJECTED"));
    }
    verify_signature(
        &key,
        &signed.signature_base64,
        &manifest_signing_bytes(&signed.manifest),
        "UPDATE_MANIFEST_SIGNATURE_REJECTED",
    )?;
    Ok(signed)
}

fn rollback_allowed(
    manifest: &ReleaseManifest,
    current_sequence: u64,
    recovery_mode: bool,
) -> bool {
    if manifest.sequence > current_sequence {
        return true;
    }
    recovery_mode
        && manifest.sequence < current_sequence
        && manifest.rollback_authorizations.iter().any(|auth| {
            auth.from_sequence == current_sequence && auth.to_sequence == manifest.sequence
        })
}

fn target_matches(artifact: &ReleaseArtifact) -> bool {
    artifact.platform == std::env::consts::OS && artifact.architecture == std::env::consts::ARCH
}

fn find_artifact<'a>(
    manifest: &'a ReleaseManifest,
    package_path: &Path,
    allow_delta: bool,
) -> Result<&'a ReleaseArtifact, String> {
    let file_name = package_path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| fail("UPDATE_PACKAGE_NAME_REJECTED"))?;
    let mut matches = manifest.artifacts.iter().filter(|artifact| {
        target_matches(artifact)
            && artifact.file_name == file_name
            && (allow_delta || artifact.kind == ArtifactKind::Full)
    });
    let artifact = matches
        .next()
        .ok_or_else(|| fail("UPDATE_ARTIFACT_TARGET_REJECTED"))?;
    if matches.next().is_some() {
        return Err(fail("UPDATE_ARTIFACT_AMBIGUOUS"));
    }
    Ok(artifact)
}

fn hash_file(path: &Path, expected_size: u64) -> Result<[u8; 32], String> {
    let mut file = File::open(path).map_err(|_| fail("UPDATE_PACKAGE_OPEN_FAILED"))?;
    let metadata = file
        .metadata()
        .map_err(|_| fail("UPDATE_PACKAGE_METADATA_FAILED"))?;
    if !metadata.is_file()
        || metadata.len() != expected_size
        || metadata.len() == 0
        || metadata.len() > MAX_UPDATE_BYTES
    {
        return Err(fail("UPDATE_PACKAGE_SIZE_REJECTED"));
    }
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; COPY_BUFFER_BYTES];
    let mut total = 0u64;
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|_| fail("UPDATE_PACKAGE_READ_FAILED"))?;
        if read == 0 {
            break;
        }
        total = total
            .checked_add(read as u64)
            .ok_or_else(|| fail("UPDATE_PACKAGE_SIZE_REJECTED"))?;
        if total > expected_size {
            return Err(fail("UPDATE_PACKAGE_SIZE_REJECTED"));
        }
        hasher.update(&buffer[..read]);
    }
    if total != expected_size {
        return Err(fail("UPDATE_PACKAGE_SIZE_REJECTED"));
    }
    Ok(hasher.finalize().into())
}

fn stage_verified_artifact(
    app: &AppHandle,
    source: &Path,
    digest_hex: &str,
    expected_size: u64,
) -> Result<PathBuf, String> {
    let root = update_root(app)?;
    let extension = source
        .extension()
        .and_then(|value| value.to_str())
        .filter(|value| value.len() <= 16 && value.bytes().all(|b| b.is_ascii_alphanumeric()))
        .unwrap_or("pkg");
    let final_path = root.join(format!("{}.{}", digest_hex, extension));
    if final_path.exists() {
        let digest = hash_file(&final_path, expected_size)?;
        if ct_eq(hex::encode(digest).as_bytes(), digest_hex.as_bytes()) {
            return Ok(final_path);
        }
        fs::remove_file(&final_path).map_err(|_| fail("UPDATE_CACHE_REPAIR_FAILED"))?;
    }
    let temp_path = root.join(format!(".{}.{}.tmp", digest_hex, std::process::id()));
    let mut input = File::open(source).map_err(|_| fail("UPDATE_PACKAGE_OPEN_FAILED"))?;
    let mut output = fs::OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&temp_path)
        .map_err(|_| fail("UPDATE_CACHE_WRITE_FAILED"))?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; COPY_BUFFER_BYTES];
    let mut total = 0u64;
    let result = (|| -> Result<(), String> {
        loop {
            let read = input
                .read(&mut buffer)
                .map_err(|_| fail("UPDATE_PACKAGE_READ_FAILED"))?;
            if read == 0 {
                break;
            }
            total = total
                .checked_add(read as u64)
                .ok_or_else(|| fail("UPDATE_PACKAGE_SIZE_REJECTED"))?;
            if total > expected_size {
                return Err(fail("UPDATE_PACKAGE_SIZE_REJECTED"));
            }
            hasher.update(&buffer[..read]);
            output
                .write_all(&buffer[..read])
                .map_err(|_| fail("UPDATE_CACHE_WRITE_FAILED"))?;
        }
        if total != expected_size {
            return Err(fail("UPDATE_PACKAGE_SIZE_REJECTED"));
        }
        let actual = hex::encode(hasher.finalize());
        if !ct_eq(actual.as_bytes(), digest_hex.as_bytes()) {
            return Err(fail("UPDATE_PACKAGE_DIGEST_REJECTED"));
        }
        output
            .sync_all()
            .map_err(|_| fail("UPDATE_CACHE_SYNC_FAILED"))?;
        fs::rename(&temp_path, &final_path).map_err(|_| fail("UPDATE_CACHE_COMMIT_FAILED"))?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temp_path);
    }
    result?;
    Ok(final_path)
}

fn journal_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(update_root(app)?.join(JOURNAL_FILE))
}

fn read_recovery_journal(path: &Path) -> Result<Option<UpdateRecoveryJournal>, String> {
    let file = match File::open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err(fail("UPDATE_JOURNAL_READ_FAILED")),
    };

    // Read one byte beyond the accepted limit so growth after open cannot bypass the cap.
    let mut bytes = Vec::with_capacity(MAX_JOURNAL_BYTES + 1);
    file.take((MAX_JOURNAL_BYTES + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|_| fail("UPDATE_JOURNAL_READ_FAILED"))?;
    if bytes.len() > MAX_JOURNAL_BYTES {
        return Err(fail("UPDATE_JOURNAL_SIZE_REJECTED"));
    }

    let journal: UpdateRecoveryJournal =
        serde_json::from_slice(&bytes).map_err(|_| fail("UPDATE_JOURNAL_PARSE_REJECTED"))?;
    if journal.schema != "astraea-update-recovery/v1" || !valid_hex(&journal.pending_sha256, 32) {
        return Err(fail("UPDATE_JOURNAL_SCHEMA_REJECTED"));
    }
    Ok(Some(journal))
}

fn write_journal(app: &AppHandle, journal: &UpdateRecoveryJournal) -> Result<(), String> {
    let path = journal_path(app)?;
    let temp = path.with_extension("json.tmp");
    let bytes = serde_json::to_vec(journal).map_err(|_| fail("UPDATE_JOURNAL_SERIALIZE_FAILED"))?;
    if bytes.len() > MAX_JOURNAL_BYTES {
        return Err(fail("UPDATE_JOURNAL_SIZE_REJECTED"));
    }
    let mut file = fs::OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .open(&temp)
        .map_err(|_| fail("UPDATE_JOURNAL_WRITE_FAILED"))?;
    file.write_all(&bytes)
        .map_err(|_| fail("UPDATE_JOURNAL_WRITE_FAILED"))?;
    file.sync_all()
        .map_err(|_| fail("UPDATE_JOURNAL_SYNC_FAILED"))?;
    fs::rename(temp, path).map_err(|_| fail("UPDATE_JOURNAL_COMMIT_FAILED"))
}

#[tauri::command]
pub fn vgt_update_release_status() -> UpdateReleaseStatus {
    let key_id = trusted_verifying_key().ok().map(|(_, id)| id);
    UpdateReleaseStatus {
        configured: compiled_sequence().is_some() && key_id.is_some(),
        current_version: env!("CARGO_PKG_VERSION"),
        current_sequence: compiled_sequence(),
        release_channel: compiled_channel().map(str::to_string),
        key_id,
        network_download_default: false,
        automatic_install_default: false,
    }
}

fn verify_and_stage_path(
    app: &AppHandle,
    signed_manifest_json: &str,
    package_path: &Path,
    expected_channel: ReleaseChannel,
    explicit_update_policy: bool,
    allow_delta: bool,
    recovery_mode: bool,
) -> Result<VerifiedOfflineUpdate, String> {
    if !explicit_update_policy {
        return Err(fail("UPDATE_EXPLICIT_POLICY_REQUIRED"));
    }
    let current_sequence =
        compiled_sequence().ok_or_else(|| fail("UPDATE_RELEASE_SEQUENCE_UNCONFIGURED"))?;
    let signed = parse_signed_manifest(signed_manifest_json)?;
    let manifest = &signed.manifest;
    if manifest.channel != expected_channel {
        return Err(fail("UPDATE_CHANNEL_REJECTED"));
    }
    if let Some(channel) = compiled_channel() {
        if channel == "stable" && manifest.channel == ReleaseChannel::Beta {
            return Err(fail("UPDATE_STABLE_TO_BETA_REJECTED"));
        }
    }
    if !rollback_allowed(manifest, current_sequence, recovery_mode) {
        return Err(fail("UPDATE_ROLLBACK_PROTECTION_REJECTED"));
    }
    if manifest.sequence == current_sequence {
        return Err(fail("UPDATE_ALREADY_CURRENT"));
    }

    let artifact = find_artifact(manifest, package_path, allow_delta)?;
    let digest = hash_file(package_path, artifact.size_bytes)?;
    let digest_hex = hex::encode(digest);
    if !ct_eq(digest_hex.as_bytes(), artifact.sha256_hex.as_bytes()) {
        return Err(fail("UPDATE_PACKAGE_DIGEST_REJECTED"));
    }
    let (key, _) = trusted_verifying_key()?;
    verify_signature(
        &key,
        &artifact.signature_base64,
        &artifact_signing_bytes(manifest, artifact),
        "UPDATE_ARTIFACT_SIGNATURE_REJECTED",
    )?;

    let cached = stage_verified_artifact(app, package_path, &digest_hex, artifact.size_bytes)?;
    let rollback_authorized = manifest.sequence < current_sequence;
    let journal = UpdateRecoveryJournal {
        schema: "astraea-update-recovery/v1".into(),
        pending_version: manifest.version.clone(),
        pending_sequence: manifest.sequence,
        pending_sha256: digest_hex.clone(),
        pending_cached_path: cached.to_string_lossy().into_owned(),
        previous_version: env!("CARGO_PKG_VERSION").to_string(),
        previous_sequence: current_sequence,
        previous_sha256: None,
        previous_cached_path: None,
        phase: "verified_staged".into(),
        install_attempts: 0,
    };
    write_journal(app, &journal)?;
    Ok(VerifiedOfflineUpdate {
        verified: true,
        version: manifest.version.clone(),
        sequence: manifest.sequence,
        channel: manifest.channel,
        artifact_kind: artifact.kind,
        artifact_file_name: artifact.file_name.clone(),
        artifact_sha256: digest_hex,
        cached_path: cached.to_string_lossy().into_owned(),
        rollback_authorized,
        security_advisory_url: manifest.security_advisory_url.clone(),
        journal,
    })
}

#[tauri::command]
pub fn vgt_update_verify_and_stage_offline(
    app: AppHandle,
    request: VerifyOfflineUpdateRequest,
) -> Result<VerifiedOfflineUpdate, String> {
    if !request.allow_offline_manual {
        return Err(fail("UPDATE_OFFLINE_POLICY_REJECTED"));
    }
    let package_path = Path::new(&request.package_path);
    verify_and_stage_path(
        &app,
        &request.signed_manifest_json,
        package_path,
        request.expected_channel,
        request.explicit_update_policy,
        request.allow_delta,
        request.recovery_mode,
    )
}

#[tauri::command]
pub fn vgt_update_verify_and_stage_transfer(
    app: AppHandle,
    request: VerifyTransferUpdateRequest,
) -> Result<VerifiedOfflineUpdate, String> {
    let checkpoint = read_transfer_checkpoint(&app, &request.transfer_id)?;
    if !checkpoint.ready_for_security_verification() {
        return Err(fail("UPDATE_TRANSFER_INCOMPLETE"));
    }
    let package_path = transfer_package_path(&app, &checkpoint)?;
    let digest = hash_file(&package_path, checkpoint.expected_bytes)?;
    let digest_hex = hex::encode(digest);
    if !ct_eq(digest_hex.as_bytes(), checkpoint.expected_sha256.as_bytes()) {
        return Err(fail("UPDATE_TRANSFER_DIGEST_REJECTED"));
    }
    let result = verify_and_stage_path(
        &app,
        &request.signed_manifest_json,
        &package_path,
        request.expected_channel,
        request.explicit_update_policy,
        request.allow_delta,
        request.recovery_mode,
    )?;
    cleanup_transfer(&app, &checkpoint)?;
    Ok(result)
}

#[tauri::command]
pub fn vgt_update_recovery_status(app: AppHandle) -> Result<Option<UpdateRecoveryJournal>, String> {
    let path = journal_path(&app)?;
    read_recovery_journal(&path)
}

#[tauri::command]
pub fn vgt_update_mark_install_started(app: AppHandle) -> Result<UpdateRecoveryJournal, String> {
    let mut journal =
        vgt_update_recovery_status(app.clone())?.ok_or_else(|| fail("UPDATE_JOURNAL_MISSING"))?;
    if journal.phase != "verified_staged" && journal.phase != "install_failed" {
        return Err(fail("UPDATE_JOURNAL_PHASE_REJECTED"));
    }
    journal.phase = "installing".into();
    journal.install_attempts = journal.install_attempts.saturating_add(1);
    if journal.install_attempts > 3 {
        return Err(fail("UPDATE_INSTALL_ATTEMPT_LIMIT"));
    }
    write_journal(&app, &journal)?;
    Ok(journal)
}

#[tauri::command]
pub fn vgt_update_mark_install_failed(app: AppHandle) -> Result<UpdateRecoveryJournal, String> {
    let mut journal =
        vgt_update_recovery_status(app.clone())?.ok_or_else(|| fail("UPDATE_JOURNAL_MISSING"))?;
    if journal.phase != "installing" {
        return Err(fail("UPDATE_JOURNAL_PHASE_REJECTED"));
    }
    journal.phase = "install_failed".into();
    write_journal(&app, &journal)?;
    Ok(journal)
}

#[tauri::command]
pub fn vgt_update_clear_recovery(app: AppHandle) -> Result<bool, String> {
    let path = journal_path(&app)?;
    match fs::remove_file(path) {
        Ok(()) => Ok(true),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(_) => Err(fail("UPDATE_JOURNAL_DELETE_FAILED")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static NEXT_TEMP_FILE: AtomicU64 = AtomicU64::new(1);

    fn temp_journal_path() -> PathBuf {
        let sequence = NEXT_TEMP_FILE.fetch_add(1, Ordering::Relaxed);
        std::env::temp_dir().join(format!(
            "astraea-update-recovery-{}-{sequence}.json",
            std::process::id()
        ))
    }

    fn valid_journal() -> UpdateRecoveryJournal {
        UpdateRecoveryJournal {
            schema: "astraea-update-recovery/v1".into(),
            pending_version: String::new(),
            pending_sequence: 2,
            pending_sha256: "0".repeat(64),
            pending_cached_path: String::new(),
            previous_version: "1.0.0".into(),
            previous_sequence: 1,
            previous_sha256: None,
            previous_cached_path: None,
            phase: "verified_staged".into(),
            install_attempts: 0,
        }
    }

    fn write_valid_journal_of_size(path: &Path, size: usize) {
        let mut journal = valid_journal();
        let base_len = serde_json::to_vec(&journal)
            .expect("test journal serializes")
            .len();
        assert!(size >= base_len);
        journal.pending_version = "v".repeat(size - base_len);
        let bytes = serde_json::to_vec(&journal).expect("test journal serializes");
        assert_eq!(bytes.len(), size);
        fs::write(path, bytes).expect("test journal is written");
    }

    #[test]
    fn recovery_journal_reader_accepts_exact_limit_and_rejects_one_over() {
        let path = temp_journal_path();

        write_valid_journal_of_size(&path, MAX_JOURNAL_BYTES);
        let journal = read_recovery_journal(&path)
            .expect("exact-limit journal is accepted")
            .expect("journal exists");
        assert_eq!(journal.schema, "astraea-update-recovery/v1");
        assert!(!journal.pending_version.is_empty());

        write_valid_journal_of_size(&path, MAX_JOURNAL_BYTES + 1);
        assert_eq!(
            read_recovery_journal(&path).expect_err("one byte over the limit is rejected"),
            "UPDATE_JOURNAL_SIZE_REJECTED"
        );

        fs::remove_file(path).expect("temporary journal is removed");
    }

    #[test]
    fn recovery_journal_reader_preserves_missing_and_schema_errors() {
        let path = temp_journal_path();
        assert!(read_recovery_journal(&path)
            .expect("missing journal is not an error")
            .is_none());

        let mut invalid = valid_journal();
        invalid.schema = "unknown".into();
        fs::write(
            &path,
            serde_json::to_vec(&invalid).expect("test journal serializes"),
        )
        .expect("test journal is written");
        assert_eq!(
            read_recovery_journal(&path).expect_err("wrong schema is rejected"),
            "UPDATE_JOURNAL_SCHEMA_REJECTED"
        );

        fs::write(&path, b"{").expect("malformed test journal is written");
        assert_eq!(
            read_recovery_journal(&path).expect_err("malformed JSON is rejected"),
            "UPDATE_JOURNAL_PARSE_REJECTED"
        );

        fs::remove_file(path).expect("temporary journal is removed");
    }
}
