use crate::{
    authorize_host_request, sha256_hex, validate_standard_tier_wasm, verify_initial_package,
    verify_update_package, PluginCapability, PluginExecutionPermit, PluginHostRequest,
    PluginManifest, PluginUpdateSource, SignatureState, MAX_INSTALLED_PLUGINS,
    MAX_PLUGIN_LOG_ENTRIES, MAX_ROLLBACK_SNAPSHOTS,
};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeSet, HashMap, VecDeque};
use std::time::{SystemTime, UNIX_EPOCH};
use thiserror::Error;

const CRASH_QUARANTINE_THRESHOLD: u8 = 3;
const MAX_DOCUMENT_GRANTS: usize = 256;

#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum RuntimeError {
    #[error("PLUGIN_RUNTIME_CAPACITY_REACHED")]
    Capacity,
    #[error("PLUGIN_ALREADY_INSTALLED")]
    AlreadyInstalled,
    #[error("PLUGIN_NOT_INSTALLED")]
    NotInstalled,
    #[error("PLUGIN_RECONSENT_REQUIRED")]
    ReconsentRequired,
    #[error("PLUGIN_SAFE_MODE_BLOCK")]
    SafeMode,
    #[error("PLUGIN_DISABLED_BY_POLICY")]
    Disabled,
    #[error("PLUGIN_QUARANTINED")]
    Quarantined,
    #[error("PLUGIN_PACKAGE_REJECTED")]
    Package,
    #[error("PLUGIN_HOST_API_DENIED")]
    HostApi,
    #[error("PLUGIN_ROLLBACK_UNAVAILABLE")]
    RollbackUnavailable,
    #[error("PLUGIN_IDENTITY_CHANGED")]
    IdentityChanged,
    #[error("PLUGIN_DOCUMENT_CONSENT_REQUIRED")]
    DocumentConsentRequired,
    #[error("PLUGIN_SIGNER_NOT_TRUSTED")]
    SignerNotTrusted,
    #[error("PLUGIN_SIGNER_TRUST_CONFIRMATION_REQUIRED")]
    SignerTrustConfirmationRequired,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct InstallReview {
    pub plugin_id: String,
    pub name: String,
    pub publisher: String,
    pub version: String,
    pub signature_state: SignatureState,
    pub signer_fingerprint_sha256: Option<String>,
    pub requested_capabilities: Vec<PluginCapability>,
    pub update_source: String,
    pub negotiated_api_version: String,
    pub reconsent_required: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PluginLogCode {
    Installed,
    Updated,
    UpdateRejected,
    Disabled,
    Enabled,
    SafeModeBlocked,
    CapabilityDenied,
    Crash,
    Quarantined,
    Rollback,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PluginLogEntry {
    pub unix_ms: u64,
    pub code: PluginLogCode,
    pub version: String,
    pub numeric_detail: Option<u64>,
}

#[derive(Debug, Clone)]
struct PluginSnapshot {
    manifest: PluginManifest,
    package_bytes: Vec<u8>,
    signature_state: SignatureState,
    signer_fingerprint: Option<String>,
}

#[derive(Debug, Clone)]
struct PluginRecord {
    current: PluginSnapshot,
    rollback: VecDeque<PluginSnapshot>,
    user_enabled: bool,
    admin_enabled: bool,
    consented_capabilities: Vec<PluginCapability>,
    consented_document_ids: BTreeSet<String>,
    signer_pin: Option<String>,
    consecutive_crashes: u8,
    quarantined: bool,
    logs: VecDeque<PluginLogEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PluginStatus {
    pub plugin_id: String,
    pub version: String,
    pub user_enabled: bool,
    pub admin_enabled: bool,
    pub safe_mode: bool,
    pub quarantined: bool,
    pub consecutive_crashes: u8,
    pub signature_state: SignatureState,
    pub signer_fingerprint_sha256: Option<String>,
    pub capabilities: Vec<PluginCapability>,
}

#[derive(Default)]
pub struct PluginRuntime {
    plugins: HashMap<String, PluginRecord>,
    trusted_signer_fingerprints: BTreeSet<String>,
    safe_mode: bool,
}

impl PluginRuntime {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn trust_developer_signer(
        &mut self,
        fingerprint_sha256: &str,
        explicit_user_confirmation: bool,
    ) -> Result<(), RuntimeError> {
        if !explicit_user_confirmation {
            return Err(RuntimeError::SignerTrustConfirmationRequired);
        }
        let normalized = normalize_sha256_fingerprint(fingerprint_sha256)
            .ok_or(RuntimeError::SignerNotTrusted)?;
        self.trusted_signer_fingerprints.insert(normalized);
        Ok(())
    }

    pub fn revoke_developer_signer(
        &mut self,
        fingerprint_sha256: &str,
    ) -> Result<(), RuntimeError> {
        let normalized = normalize_sha256_fingerprint(fingerprint_sha256)
            .ok_or(RuntimeError::SignerNotTrusted)?;
        self.trusted_signer_fingerprints.remove(&normalized);
        Ok(())
    }

    pub fn is_developer_signer_trusted(&self, fingerprint_sha256: &str) -> bool {
        normalize_sha256_fingerprint(fingerprint_sha256)
            .map(|fingerprint| self.trusted_signer_fingerprints.contains(&fingerprint))
            .unwrap_or(false)
    }

    pub fn review_initial(
        &self,
        bytes: &[u8],
        manifest: &PluginManifest,
    ) -> Result<InstallReview, RuntimeError> {
        let verification =
            verify_initial_package(bytes, manifest).map_err(|_| RuntimeError::Package)?;
        validate_standard_tier_wasm(bytes, manifest).map_err(|_| RuntimeError::Package)?;
        Ok(review_from(
            manifest,
            verification.signature_state,
            verification.signer_fingerprint_sha256,
            !manifest.requested_capabilities.is_empty(),
        ))
    }

    pub fn install_initial(
        &mut self,
        bytes: Vec<u8>,
        manifest: PluginManifest,
        explicit_consent: bool,
    ) -> Result<InstallReview, RuntimeError> {
        if self.plugins.len() >= MAX_INSTALLED_PLUGINS {
            return Err(RuntimeError::Capacity);
        }
        if self.plugins.contains_key(&manifest.plugin_id) {
            return Err(RuntimeError::AlreadyInstalled);
        }
        let review = self.review_initial(&bytes, &manifest)?;
        let signer_pin = review
            .signer_fingerprint_sha256
            .clone()
            .ok_or(RuntimeError::SignerNotTrusted)?;
        if !self.trusted_signer_fingerprints.contains(&signer_pin) {
            return Err(RuntimeError::SignerNotTrusted);
        }
        if review.reconsent_required && !explicit_consent {
            return Err(RuntimeError::ReconsentRequired);
        }
        let signer_pin = Some(signer_pin);
        let snapshot = PluginSnapshot {
            manifest: manifest.clone(),
            package_bytes: bytes,
            signature_state: review.signature_state,
            signer_fingerprint: signer_pin.clone(),
        };
        let mut record = PluginRecord {
            current: snapshot,
            rollback: VecDeque::new(),
            user_enabled: true,
            admin_enabled: true,
            consented_capabilities: manifest.requested_capabilities.clone(),
            consented_document_ids: BTreeSet::new(),
            signer_pin,
            consecutive_crashes: 0,
            quarantined: false,
            logs: VecDeque::new(),
        };
        push_log(&mut record, PluginLogCode::Installed, None);
        self.plugins.insert(manifest.plugin_id.clone(), record);
        Ok(review)
    }

    pub fn review_update(
        &self,
        bytes: &[u8],
        manifest: &PluginManifest,
    ) -> Result<InstallReview, RuntimeError> {
        let record = self
            .plugins
            .get(&manifest.plugin_id)
            .ok_or(RuntimeError::NotInstalled)?;
        if manifest.publisher != record.current.manifest.publisher {
            return Err(RuntimeError::IdentityChanged);
        }
        let current_signer = record
            .signer_pin
            .as_deref()
            .ok_or(RuntimeError::SignerNotTrusted)?;
        if !self.trusted_signer_fingerprints.contains(current_signer) {
            return Err(RuntimeError::SignerNotTrusted);
        }
        let (verification, signer_bootstrap) = if let Some(pinned) = record.signer_pin.as_deref() {
            (
                verify_update_package(bytes, manifest, pinned)
                    .map_err(|_| RuntimeError::Package)?,
                false,
            )
        } else {
            let verification =
                verify_initial_package(bytes, manifest).map_err(|_| RuntimeError::Package)?;
            if verification.signer_fingerprint_sha256.is_none() {
                return Err(RuntimeError::Package);
            }
            (verification, true)
        };
        validate_standard_tier_wasm(bytes, manifest).map_err(|_| RuntimeError::Package)?;
        let verified_signer = verification
            .signer_fingerprint_sha256
            .as_deref()
            .ok_or(RuntimeError::SignerNotTrusted)?;
        if !self.trusted_signer_fingerprints.contains(verified_signer) {
            return Err(RuntimeError::SignerNotTrusted);
        }
        let reconsent_required = signer_bootstrap
            || capability_expansion(
                &record.consented_capabilities,
                &manifest.requested_capabilities,
            )
            || record.current.manifest.api_compatibility != manifest.api_compatibility;
        Ok(review_from(
            manifest,
            verification.signature_state,
            verification.signer_fingerprint_sha256,
            reconsent_required,
        ))
    }

    pub fn install_update(
        &mut self,
        bytes: Vec<u8>,
        manifest: PluginManifest,
        explicit_reconsent: bool,
    ) -> Result<InstallReview, RuntimeError> {
        let review = self.review_update(&bytes, &manifest)?;
        if review.reconsent_required && !explicit_reconsent {
            return Err(RuntimeError::ReconsentRequired);
        }
        let record = self
            .plugins
            .get_mut(&manifest.plugin_id)
            .ok_or(RuntimeError::NotInstalled)?;
        let old = record.current.clone();
        record.rollback.push_front(old);
        while record.rollback.len() > MAX_ROLLBACK_SNAPSHOTS {
            record.rollback.pop_back();
        }
        record.current = PluginSnapshot {
            manifest: manifest.clone(),
            package_bytes: bytes,
            signature_state: review.signature_state,
            signer_fingerprint: review.signer_fingerprint_sha256.clone(),
        };
        if record.signer_pin.is_none() {
            record.signer_pin = review.signer_fingerprint_sha256.clone();
        }
        record.consented_capabilities = manifest.requested_capabilities.clone();
        record.consented_document_ids.clear();
        record.consecutive_crashes = 0;
        record.quarantined = false;
        push_log(record, PluginLogCode::Updated, None);
        Ok(review)
    }

    pub fn rollback(&mut self, plugin_id: &str) -> Result<PluginStatus, RuntimeError> {
        let record = self
            .plugins
            .get_mut(plugin_id)
            .ok_or(RuntimeError::NotInstalled)?;
        let previous = record
            .rollback
            .pop_front()
            .ok_or(RuntimeError::RollbackUnavailable)?;
        let current = std::mem::replace(&mut record.current, previous);
        record.rollback.push_front(current);
        record.consented_capabilities = record.current.manifest.requested_capabilities.clone();
        record.consented_document_ids.clear();
        record.consecutive_crashes = 0;
        record.quarantined = false;
        push_log(record, PluginLogCode::Rollback, None);
        Ok(status_for(plugin_id, record, self.safe_mode))
    }

    pub fn set_safe_mode(&mut self, enabled: bool) {
        self.safe_mode = enabled;
    }
    pub fn set_user_enabled(&mut self, plugin_id: &str, enabled: bool) -> Result<(), RuntimeError> {
        let record = self
            .plugins
            .get_mut(plugin_id)
            .ok_or(RuntimeError::NotInstalled)?;
        record.user_enabled = enabled;
        push_log(
            record,
            if enabled {
                PluginLogCode::Enabled
            } else {
                PluginLogCode::Disabled
            },
            None,
        );
        Ok(())
    }
    pub fn set_admin_enabled(
        &mut self,
        plugin_id: &str,
        enabled: bool,
    ) -> Result<(), RuntimeError> {
        let record = self
            .plugins
            .get_mut(plugin_id)
            .ok_or(RuntimeError::NotInstalled)?;
        record.admin_enabled = enabled;
        push_log(
            record,
            if enabled {
                PluginLogCode::Enabled
            } else {
                PluginLogCode::Disabled
            },
            None,
        );
        Ok(())
    }

    pub fn execution_permit(
        &mut self,
        plugin_id: &str,
    ) -> Result<PluginExecutionPermit, RuntimeError> {
        let trusted_signers = &self.trusted_signer_fingerprints;
        let record = self
            .plugins
            .get_mut(plugin_id)
            .ok_or(RuntimeError::NotInstalled)?;
        ensure_active(record, self.safe_mode)?;
        let signer = record
            .current
            .signer_fingerprint
            .as_deref()
            .ok_or(RuntimeError::SignerNotTrusted)?;
        if !trusted_signers.contains(signer) {
            return Err(RuntimeError::SignerNotTrusted);
        }
        let manifest = &record.current.manifest;
        if sha256_hex(&record.current.package_bytes) != manifest.package_sha256 {
            return Err(RuntimeError::Package);
        }
        let entrypoint_export = manifest
            .entrypoints
            .first()
            .map(|entry| match entry {
                crate::PluginEntrypoint::Wasm { export_name } => export_name.clone(),
            })
            .ok_or(RuntimeError::Package)?;
        Ok(PluginExecutionPermit {
            plugin_id: manifest.plugin_id.clone(),
            version: manifest.version.clone(),
            package_sha256: manifest.package_sha256.clone(),
            negotiated_api_version: manifest
                .api_compatibility
                .negotiate_current()
                .map_err(|_| RuntimeError::Package)?,
            entrypoint_export,
            resource_limits: manifest.resource_limits.clone(),
            host_capabilities: record.consented_capabilities.clone(),
            standard_tier_importless_wasm: true,
        })
    }

    pub fn grant_document_access(
        &mut self,
        plugin_id: &str,
        document_id: &str,
        explicit_user_confirmation: bool,
    ) -> Result<(), RuntimeError> {
        let record = self
            .plugins
            .get_mut(plugin_id)
            .ok_or(RuntimeError::NotInstalled)?;
        ensure_active(record, self.safe_mode)?;
        if !explicit_user_confirmation {
            return Err(RuntimeError::DocumentConsentRequired);
        }
        let has_document_capability = record.consented_capabilities.iter().any(|capability| {
            matches!(
                capability,
                PluginCapability::DocumentRead | PluginCapability::DocumentProposeOperations
            )
        });
        if !has_document_capability || !valid_document_id(document_id) {
            return Err(RuntimeError::HostApi);
        }
        if !record.consented_document_ids.contains(document_id)
            && record.consented_document_ids.len() >= MAX_DOCUMENT_GRANTS
        {
            return Err(RuntimeError::Capacity);
        }
        record
            .consented_document_ids
            .insert(document_id.to_string());
        Ok(())
    }

    pub fn revoke_document_access(
        &mut self,
        plugin_id: &str,
        document_id: &str,
    ) -> Result<(), RuntimeError> {
        let record = self
            .plugins
            .get_mut(plugin_id)
            .ok_or(RuntimeError::NotInstalled)?;
        if !valid_document_id(document_id) {
            return Err(RuntimeError::HostApi);
        }
        record.consented_document_ids.remove(document_id);
        Ok(())
    }

    pub fn authorize_host_api(
        &mut self,
        plugin_id: &str,
        request: &PluginHostRequest,
    ) -> Result<(), RuntimeError> {
        let record = self
            .plugins
            .get_mut(plugin_id)
            .ok_or(RuntimeError::NotInstalled)?;
        ensure_active(record, self.safe_mode)?;
        if authorize_host_request(&record.current.manifest, request).is_err() {
            push_log(record, PluginLogCode::CapabilityDenied, None);
            return Err(RuntimeError::HostApi);
        }
        if !record
            .consented_capabilities
            .contains(&request.required_capability())
        {
            push_log(record, PluginLogCode::CapabilityDenied, None);
            return Err(RuntimeError::HostApi);
        }
        let document_id = match request {
            PluginHostRequest::DocumentRead { document_id, .. }
            | PluginHostRequest::ProposeOperations { document_id, .. } => {
                Some(document_id.as_str())
            }
            _ => None,
        };
        if let Some(document_id) = document_id {
            if !record.consented_document_ids.contains(document_id) {
                push_log(record, PluginLogCode::CapabilityDenied, None);
                return Err(RuntimeError::DocumentConsentRequired);
            }
        }
        Ok(())
    }

    pub fn record_crash(&mut self, plugin_id: &str) -> Result<PluginStatus, RuntimeError> {
        let record = self
            .plugins
            .get_mut(plugin_id)
            .ok_or(RuntimeError::NotInstalled)?;
        record.consecutive_crashes = record.consecutive_crashes.saturating_add(1);
        push_log(
            record,
            PluginLogCode::Crash,
            Some(record.consecutive_crashes.into()),
        );
        if record.consecutive_crashes >= CRASH_QUARANTINE_THRESHOLD {
            record.quarantined = true;
            push_log(record, PluginLogCode::Quarantined, None);
        }
        Ok(status_for(plugin_id, record, self.safe_mode))
    }
    pub fn record_success(&mut self, plugin_id: &str) -> Result<(), RuntimeError> {
        let record = self
            .plugins
            .get_mut(plugin_id)
            .ok_or(RuntimeError::NotInstalled)?;
        record.consecutive_crashes = 0;
        Ok(())
    }
    pub fn status(&self, plugin_id: &str) -> Result<PluginStatus, RuntimeError> {
        let record = self
            .plugins
            .get(plugin_id)
            .ok_or(RuntimeError::NotInstalled)?;
        Ok(status_for(plugin_id, record, self.safe_mode))
    }
    pub fn logs(&self, plugin_id: &str) -> Result<Vec<PluginLogEntry>, RuntimeError> {
        let record = self
            .plugins
            .get(plugin_id)
            .ok_or(RuntimeError::NotInstalled)?;
        Ok(record.logs.iter().cloned().collect())
    }
}

fn ensure_active(record: &mut PluginRecord, safe_mode: bool) -> Result<(), RuntimeError> {
    if safe_mode {
        push_log(record, PluginLogCode::SafeModeBlocked, None);
        return Err(RuntimeError::SafeMode);
    }
    if !record.user_enabled || !record.admin_enabled {
        return Err(RuntimeError::Disabled);
    }
    if record.quarantined {
        return Err(RuntimeError::Quarantined);
    }
    Ok(())
}
fn valid_document_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b':' | b'-' | b'/'))
}

fn normalize_sha256_fingerprint(value: &str) -> Option<String> {
    if value.len() != 64 || !value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return None;
    }
    Some(value.to_ascii_lowercase())
}

fn capability_expansion(previous: &[PluginCapability], next: &[PluginCapability]) -> bool {
    next.iter().any(|c| !previous.contains(c))
}
fn review_from(
    manifest: &PluginManifest,
    signature_state: SignatureState,
    signer: Option<String>,
    reconsent_required: bool,
) -> InstallReview {
    let update_source = match &manifest.update_source {
        PluginUpdateSource::OfflineFile { source_id } => format!("offline:{source_id}"),
        PluginUpdateSource::ManagedChannel { channel_id } => format!("managed:{channel_id}"),
        PluginUpdateSource::Disabled => "disabled".to_string(),
    };
    InstallReview {
        plugin_id: manifest.plugin_id.clone(),
        name: manifest.name.clone(),
        publisher: manifest.publisher.clone(),
        version: manifest.version.clone(),
        signature_state,
        signer_fingerprint_sha256: signer,
        requested_capabilities: manifest.requested_capabilities.clone(),
        update_source,
        negotiated_api_version: manifest
            .api_compatibility
            .negotiate_current()
            .unwrap_or_else(|_| "rejected".into()),
        reconsent_required,
    }
}
fn status_for(plugin_id: &str, record: &PluginRecord, safe_mode: bool) -> PluginStatus {
    PluginStatus {
        plugin_id: plugin_id.to_string(),
        version: record.current.manifest.version.clone(),
        user_enabled: record.user_enabled,
        admin_enabled: record.admin_enabled,
        safe_mode,
        quarantined: record.quarantined,
        consecutive_crashes: record.consecutive_crashes,
        signature_state: record.current.signature_state,
        signer_fingerprint_sha256: record.current.signer_fingerprint.clone(),
        capabilities: record.consented_capabilities.clone(),
    }
}
fn push_log(record: &mut PluginRecord, code: PluginLogCode, numeric_detail: Option<u64>) {
    while record.logs.len() >= MAX_PLUGIN_LOG_ENTRIES {
        record.logs.pop_front();
    }
    record.logs.push_back(PluginLogEntry {
        unix_ms: now_ms(),
        code,
        version: record.current.manifest.version.clone(),
        numeric_detail,
    });
}
fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis().min(u128::from(u64::MAX)) as u64)
        .unwrap_or(0)
}
