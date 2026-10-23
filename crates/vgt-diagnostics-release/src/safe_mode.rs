use crate::{validate_id, DiagnosticsCoreError};
use serde::{Deserialize, Serialize};

const MAX_CONFIG_BYTES: usize = 64 * 1024;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SupportedPlatform { Windows, Linux, Macos, AstraeaOs }

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct SafeModeStatus {
    pub enabled: bool,
    pub third_party_plugins_enabled: bool,
    pub automations_enabled: bool,
    pub network_enabled: bool,
}

#[derive(Debug, Clone)]
pub struct SafeModeState { enabled: bool }

impl SafeModeState {
    pub fn new(enabled: bool) -> Self { Self { enabled } }
    pub fn set_enabled(&mut self, enabled: bool) { self.enabled = enabled; }
    pub fn enabled(&self) -> bool { self.enabled }
    pub fn status(&self) -> SafeModeStatus {
        SafeModeStatus {
            enabled: self.enabled,
            third_party_plugins_enabled: !self.enabled,
            automations_enabled: !self.enabled,
            network_enabled: !self.enabled,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct WorkspaceConfigValidation {
    pub schema: String,
    pub valid: bool,
    pub error_id: Option<String>,
}

pub fn validate_workspace_configuration(json: &str) -> WorkspaceConfigValidation {
    let rejected = |id: &str| WorkspaceConfigValidation { schema: "vgt.safe-mode.config-validation/1".into(), valid: false, error_id: Some(id.into()) };
    if json.is_empty() || json.len() > MAX_CONFIG_BYTES { return rejected("WORKSPACE_CONFIG_SIZE_REJECTED"); }
    let Ok(value) = serde_json::from_str::<serde_json::Value>(json) else { return rejected("WORKSPACE_CONFIG_PARSE_REJECTED"); };
    let Some(object) = value.as_object() else { return rejected("WORKSPACE_CONFIG_ROOT_REJECTED"); };
    if object.len() > 128 { return rejected("WORKSPACE_CONFIG_FIELD_LIMIT"); }
    if object.keys().any(|key| validate_id(key).is_err()) { return rejected("WORKSPACE_CONFIG_FIELD_REJECTED"); }
    WorkspaceConfigValidation { schema: "vgt.safe-mode.config-validation/1".into(), valid: true, error_id: None }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PluginFindingState { Compatible, Incompatible, Corrupt, Quarantined }

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct PluginDiagnosticInput {
    pub plugin_id: String,
    pub manifest_compatible: bool,
    pub digest_verified: bool,
    pub signature_verified: bool,
    pub quarantined: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct PluginDiagnosticFinding {
    pub plugin_id: String,
    pub state: PluginFindingState,
    pub error_id: Option<String>,
    pub loaded: bool,
}

pub fn diagnose_plugin_without_loading(input: PluginDiagnosticInput) -> Result<PluginDiagnosticFinding, DiagnosticsCoreError> {
    validate_id(&input.plugin_id)?;
    let (state, error_id) = if input.quarantined {
        (PluginFindingState::Quarantined, Some("PLUGIN_QUARANTINED".to_string()))
    } else if !input.digest_verified || !input.signature_verified {
        (PluginFindingState::Corrupt, Some("PLUGIN_INTEGRITY_REJECTED".to_string()))
    } else if !input.manifest_compatible {
        (PluginFindingState::Incompatible, Some("PLUGIN_API_INCOMPATIBLE".to_string()))
    } else {
        (PluginFindingState::Compatible, None)
    };
    Ok(PluginDiagnosticFinding { plugin_id: input.plugin_id, state, error_id, loaded: false })
}
