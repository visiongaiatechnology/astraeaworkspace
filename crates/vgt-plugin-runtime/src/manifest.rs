use crate::{
    MAX_PLUGIN_CAPABILITIES, MAX_PLUGIN_ENTRYPOINTS, MAX_PLUGIN_EXECUTION_MS, MAX_PLUGIN_IO_BYTES,
    MAX_PLUGIN_LINEAR_MEMORY_BYTES, MAX_PLUGIN_STORAGE_BYTES, PLUGIN_API_CURRENT,
    PLUGIN_INITIAL_LINEAR_MEMORY_BYTES, PLUGIN_MANIFEST_SCHEMA,
};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
use thiserror::Error;

#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum ManifestError {
    #[error("PLUGIN_MANIFEST_SCHEMA_REJECTED")]
    Schema,
    #[error("PLUGIN_ID_REJECTED")]
    PluginId,
    #[error("PLUGIN_PUBLISHER_REJECTED")]
    Publisher,
    #[error("PLUGIN_VERSION_REJECTED")]
    Version,
    #[error("PLUGIN_API_COMPATIBILITY_REJECTED")]
    ApiCompatibility,
    #[error("PLUGIN_ENTRYPOINT_REJECTED")]
    Entrypoint,
    #[error("PLUGIN_CAPABILITY_REJECTED")]
    Capability,
    #[error("PLUGIN_RESOURCE_LIMIT_REJECTED")]
    ResourceLimit,
    #[error("PLUGIN_DIGEST_REJECTED")]
    Digest,
    #[error("PLUGIN_SIGNATURE_METADATA_REJECTED")]
    Signature,
    #[error("PLUGIN_UPDATE_SOURCE_REJECTED")]
    UpdateSource,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
pub enum PluginCapability {
    #[serde(rename = "document.read")]
    DocumentRead,
    #[serde(rename = "document.propose-operations")]
    DocumentProposeOperations,
    #[serde(rename = "commands.register")]
    CommandsRegister,
    #[serde(rename = "panels.register")]
    PanelsRegister,
    #[serde(rename = "import-export.transform")]
    ImportExportTransform,
    #[serde(rename = "automation.action")]
    AutomationAction,
    #[serde(rename = "data.connector")]
    DataConnector,
    #[serde(rename = "network.request")]
    NetworkRequest,
    #[serde(rename = "storage.scoped")]
    StorageScoped,
    #[serde(rename = "clipboard.read")]
    ClipboardRead,
    #[serde(rename = "clipboard.write")]
    ClipboardWrite,
    #[serde(rename = "secrets.use-handle")]
    SecretsUseHandle,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ApiCompatibility {
    pub minimum_inclusive: String,
    pub maximum_exclusive: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ApiVersionRecord {
    pub version: String,
    pub status: ApiLifecycleStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "state", rename_all = "kebab-case")]
pub enum ApiLifecycleStatus {
    Current,
    Deprecated { remove_after_unix_ms: u64 },
}

#[derive(Debug, Clone, Default)]
pub struct ApiLifecycleRegistry {
    versions: Vec<ApiVersionRecord>,
}

impl ApiLifecycleRegistry {
    pub fn workspace_default() -> Self {
        Self {
            versions: vec![ApiVersionRecord {
                version: PLUGIN_API_CURRENT.to_string(),
                status: ApiLifecycleStatus::Current,
            }],
        }
    }
    pub fn with_versions(versions: Vec<ApiVersionRecord>) -> Self {
        Self { versions }
    }
    pub fn negotiate(
        &self,
        compatibility: &ApiCompatibility,
        now_unix_ms: u64,
    ) -> Result<ApiVersionRecord, ManifestError> {
        let min =
            api_major(&compatibility.minimum_inclusive).ok_or(ManifestError::ApiCompatibility)?;
        let max = match compatibility.maximum_exclusive.as_deref() {
            Some(value) => Some(api_major(value).ok_or(ManifestError::ApiCompatibility)?),
            None => None,
        };
        self.versions
            .iter()
            .filter(|record| {
                let Some(major) = api_major(&record.version) else {
                    return false;
                };
                major >= min && max.is_none_or(|upper| major < upper)
            })
            .filter(|record| match record.status {
                ApiLifecycleStatus::Current => true,
                ApiLifecycleStatus::Deprecated {
                    remove_after_unix_ms,
                } => now_unix_ms < remove_after_unix_ms,
            })
            .max_by_key(|record| api_major(&record.version).unwrap_or(0))
            .cloned()
            .ok_or(ManifestError::ApiCompatibility)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum PluginEntrypoint {
    Wasm { export_name: String },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PluginResourceLimits {
    pub max_linear_memory_bytes: u64,
    pub max_cpu_ms: u64,
    pub max_execution_ms: u64,
    pub max_input_bytes: u64,
    pub max_output_bytes: u64,
    pub max_storage_bytes: u64,
}

impl Default for PluginResourceLimits {
    fn default() -> Self {
        Self {
            max_linear_memory_bytes: MAX_PLUGIN_LINEAR_MEMORY_BYTES,
            max_cpu_ms: MAX_PLUGIN_EXECUTION_MS,
            max_execution_ms: MAX_PLUGIN_EXECUTION_MS,
            max_input_bytes: 256 * 1024,
            max_output_bytes: 256 * 1024,
            max_storage_bytes: 8 * 1024 * 1024,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PluginPackageSignature {
    pub algorithm: String,
    pub key_id: String,
    pub public_key_base64: String,
    pub signature_base64: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum PluginUpdateSource {
    OfflineFile { source_id: String },
    ManagedChannel { channel_id: String },
    Disabled,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PluginManifest {
    pub schema_version: String,
    pub plugin_id: String,
    pub name: String,
    pub publisher: String,
    pub version: String,
    pub api_compatibility: ApiCompatibility,
    pub package_sha256: String,
    pub signature: Option<PluginPackageSignature>,
    pub entrypoints: Vec<PluginEntrypoint>,
    pub requested_capabilities: Vec<PluginCapability>,
    pub resource_limits: PluginResourceLimits,
    pub update_source: PluginUpdateSource,
}

impl PluginManifest {
    pub fn parse_bounded_json(input: &[u8]) -> Result<Self, ManifestError> {
        if input.is_empty() || input.len() > 64 * 1024 {
            return Err(ManifestError::Schema);
        }
        let manifest: Self = serde_json::from_slice(input).map_err(|_| ManifestError::Schema)?;
        manifest.validate()?;
        Ok(manifest)
    }

    pub fn validate(&self) -> Result<(), ManifestError> {
        if self.schema_version != PLUGIN_MANIFEST_SCHEMA {
            return Err(ManifestError::Schema);
        }
        if !valid_plugin_id(&self.plugin_id) {
            return Err(ManifestError::PluginId);
        }
        if self.name.trim().is_empty() || self.name.len() > 128 {
            return Err(ManifestError::PluginId);
        }
        if self.publisher.trim().is_empty()
            || self.publisher.len() > 192
            || self.publisher.chars().any(char::is_control)
        {
            return Err(ManifestError::Publisher);
        }
        if !valid_semver(&self.version) {
            return Err(ManifestError::Version);
        }
        if self.api_compatibility.negotiate_current().is_err() {
            return Err(ManifestError::ApiCompatibility);
        }
        if self.entrypoints.is_empty() || self.entrypoints.len() > MAX_PLUGIN_ENTRYPOINTS {
            return Err(ManifestError::Entrypoint);
        }
        for entrypoint in &self.entrypoints {
            match entrypoint {
                PluginEntrypoint::Wasm { export_name } if valid_export(export_name) => {}
                _ => return Err(ManifestError::Entrypoint),
            }
        }
        if self.requested_capabilities.len() > MAX_PLUGIN_CAPABILITIES {
            return Err(ManifestError::Capability);
        }
        let unique: BTreeSet<_> = self.requested_capabilities.iter().copied().collect();
        if unique.len() != self.requested_capabilities.len() {
            return Err(ManifestError::Capability);
        }
        self.resource_limits.validate()?;
        if !is_lower_hex_64(&self.package_sha256) {
            return Err(ManifestError::Digest);
        }
        if let Some(signature) = &self.signature {
            if signature.algorithm != "Ed25519"
                || !valid_token(&signature.key_id, 128)
                || signature.public_key_base64.is_empty()
                || signature.public_key_base64.len() > 128
                || signature.signature_base64.is_empty()
                || signature.signature_base64.len() > 256
            {
                return Err(ManifestError::Signature);
            }
        }
        match &self.update_source {
            PluginUpdateSource::OfflineFile { source_id }
            | PluginUpdateSource::ManagedChannel {
                channel_id: source_id,
            } => {
                if !valid_source_id(source_id) {
                    return Err(ManifestError::UpdateSource);
                }
            }
            PluginUpdateSource::Disabled => {}
        }
        Ok(())
    }
}

impl ApiCompatibility {
    pub fn negotiate_current(&self) -> Result<String, ManifestError> {
        let min = api_major(&self.minimum_inclusive).ok_or(ManifestError::ApiCompatibility)?;
        let current = api_major(PLUGIN_API_CURRENT).ok_or(ManifestError::ApiCompatibility)?;
        let max = match self.maximum_exclusive.as_deref() {
            Some(value) => Some(api_major(value).ok_or(ManifestError::ApiCompatibility)?),
            None => None,
        };
        if current < min || max.is_some_and(|value| current >= value) {
            return Err(ManifestError::ApiCompatibility);
        }
        Ok(PLUGIN_API_CURRENT.to_string())
    }
}

impl PluginResourceLimits {
    pub fn validate(&self) -> Result<(), ManifestError> {
        let valid = self.max_linear_memory_bytes >= PLUGIN_INITIAL_LINEAR_MEMORY_BYTES
            && self.max_linear_memory_bytes <= MAX_PLUGIN_LINEAR_MEMORY_BYTES
            && (10..=MAX_PLUGIN_EXECUTION_MS).contains(&self.max_cpu_ms)
            && self.max_execution_ms >= self.max_cpu_ms
            && self.max_execution_ms <= MAX_PLUGIN_EXECUTION_MS
            && (1..=MAX_PLUGIN_IO_BYTES).contains(&self.max_input_bytes)
            && (1..=MAX_PLUGIN_IO_BYTES).contains(&self.max_output_bytes)
            && self.max_storage_bytes <= MAX_PLUGIN_STORAGE_BYTES;
        if valid {
            Ok(())
        } else {
            Err(ManifestError::ResourceLimit)
        }
    }
}

fn api_major(value: &str) -> Option<u32> {
    value.strip_prefix("vgt.workspace.plugin/")?.parse().ok()
}
fn valid_plugin_id(value: &str) -> bool {
    let bytes = value.as_bytes();
    (3..=128).contains(&bytes.len())
        && bytes.first().is_some_and(u8::is_ascii_lowercase)
        && bytes
            .last()
            .is_some_and(|b| b.is_ascii_lowercase() || b.is_ascii_digit())
        && bytes
            .iter()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || matches!(b, b'.' | b'-'))
}
fn valid_semver(value: &str) -> bool {
    let core = value.split_once('-').map_or(value, |(left, _)| left);
    let mut parts = core.split('.');
    let values = [parts.next(), parts.next(), parts.next()];
    parts.next().is_none()
        && values.iter().all(|part| {
            part.is_some_and(|v| !v.is_empty() && v.bytes().all(|b| b.is_ascii_digit()))
        })
}
fn valid_export(value: &str) -> bool {
    let mut bytes = value.bytes();
    matches!(bytes.next(), Some(b'a'..=b'z' | b'A'..=b'Z' | b'_' | b'$'))
        && value.len() <= 128
        && bytes.all(|b| b.is_ascii_alphanumeric() || matches!(b, b'_' | b'$'))
}
fn valid_token(value: &str, max: usize) -> bool {
    !value.is_empty()
        && value.len() <= max
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b':' | b'-'))
}
fn valid_source_id(value: &str) -> bool {
    valid_token(value, 192)
}
fn is_lower_hex_64(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|b| b.is_ascii_digit() || matches!(b, b'a'..=b'f'))
}
