use crate::policy_bridge::PolicyRuntimeState;
use crate::security_gate_bridge::require_trusted_main_window;
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use serde::Deserialize;
use std::sync::Mutex;
use tauri::{State, WebviewWindow};
use vgt_plugin_runtime::{
    InstallReview, PluginExecutionPermit, PluginHostRequest, PluginManifest, PluginRuntime,
    PluginStatus, PluginUpdateSource,
};
use vgt_policy::ActionBoundary;

const MAX_PACKAGE_BASE64_CHARS: usize = 24 * 1024 * 1024;

#[derive(Default)]
pub struct PluginRuntimeState {
    pub(crate) runtime: Mutex<PluginRuntime>,
}

impl PluginRuntimeState {
    pub fn new(safe_mode: bool) -> Self {
        let mut runtime = PluginRuntime::default();
        runtime.set_safe_mode(safe_mode);
        Self {
            runtime: Mutex::new(runtime),
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OfflinePluginPackageRequest {
    manifest: PluginManifest,
    package_base64: String,
    source_label: String,
    #[serde(default)]
    explicit_consent: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PluginEnableRequest {
    plugin_id: String,
    enabled: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PluginHostApiRequest {
    plugin_id: String,
    request: PluginHostRequest,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PluginSignerTrustRequest {
    signer_fingerprint_sha256: String,
    explicit_user_confirmation: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PluginDocumentGrantRequest {
    plugin_id: String,
    document_id: String,
    explicit_user_confirmation: bool,
}

#[derive(serde::Serialize)]
pub struct PluginDiagnosticResult {
    plugin_id: String,
    compatible: bool,
    integrity_verified: bool,
    signature_verified: bool,
    loaded: bool,
    error_id: Option<String>,
}

#[tauri::command]
pub fn vgt_plugin_runtime_diagnose_offline(
    window: WebviewWindow,
    state: State<'_, PluginRuntimeState>,
    request: OfflinePluginPackageRequest,
) -> Result<PluginDiagnosticResult, String> {
    require_trusted_main_window(&window)?;
    validate_offline_source(&request.manifest, &request.source_label)?;
    let plugin_id = request.manifest.plugin_id.clone();
    let bytes = match decode_package(&request.package_base64) {
        Ok(value) => value,
        Err(code) => {
            return Ok(PluginDiagnosticResult {
                plugin_id,
                compatible: false,
                integrity_verified: false,
                signature_verified: false,
                loaded: false,
                error_id: Some(code),
            })
        }
    };
    let runtime = state
        .runtime
        .lock()
        .map_err(|_| "PLUGIN_RUNTIME_STATE_UNAVAILABLE".to_string())?;
    match runtime.review_initial(&bytes, &request.manifest) {
        Ok(review) => Ok(PluginDiagnosticResult {
            plugin_id,
            compatible: true,
            integrity_verified: true,
            signature_verified: matches!(
                review.signature_state,
                vgt_plugin_runtime::SignatureState::VerifiedUnpinned
                    | vgt_plugin_runtime::SignatureState::VerifiedPinned
            ),
            loaded: false,
            error_id: None,
        }),
        Err(error) => Ok(PluginDiagnosticResult {
            plugin_id,
            compatible: false,
            integrity_verified: false,
            signature_verified: false,
            loaded: false,
            error_id: Some(stable_error(error)),
        }),
    }
}

#[tauri::command]
pub fn vgt_plugin_runtime_review_offline(
    window: WebviewWindow,
    state: State<'_, PluginRuntimeState>,
    request: OfflinePluginPackageRequest,
) -> Result<InstallReview, String> {
    require_trusted_main_window(&window)?;
    validate_offline_source(&request.manifest, &request.source_label)?;
    let bytes = decode_package(&request.package_base64)?;
    let runtime = state
        .runtime
        .lock()
        .map_err(|_| "PLUGIN_RUNTIME_STATE_UNAVAILABLE".to_string())?;
    runtime
        .review_initial(&bytes, &request.manifest)
        .map_err(stable_error)
}

#[tauri::command]
pub fn vgt_plugin_runtime_install_offline(
    policy: State<'_, PolicyRuntimeState>,
    window: WebviewWindow,
    state: State<'_, PluginRuntimeState>,
    request: OfflinePluginPackageRequest,
) -> Result<InstallReview, String> {
    policy.require(ActionBoundary::PluginInstall, "plugin:runtime")?;
    require_trusted_main_window(&window)?;
    validate_offline_source(&request.manifest, &request.source_label)?;
    let bytes = decode_package(&request.package_base64)?;
    state
        .runtime
        .lock()
        .map_err(|_| "PLUGIN_RUNTIME_STATE_UNAVAILABLE".to_string())?
        .install_initial(bytes, request.manifest, request.explicit_consent)
        .map_err(stable_error)
}

#[tauri::command]
pub fn vgt_plugin_runtime_update_offline(
    policy: State<'_, PolicyRuntimeState>,
    window: WebviewWindow,
    state: State<'_, PluginRuntimeState>,
    request: OfflinePluginPackageRequest,
) -> Result<InstallReview, String> {
    policy.require(ActionBoundary::PluginInstall, "plugin:runtime")?;
    require_trusted_main_window(&window)?;
    validate_offline_source(&request.manifest, &request.source_label)?;
    let bytes = decode_package(&request.package_base64)?;
    state
        .runtime
        .lock()
        .map_err(|_| "PLUGIN_RUNTIME_STATE_UNAVAILABLE".to_string())?
        .install_update(bytes, request.manifest, request.explicit_consent)
        .map_err(stable_error)
}

#[tauri::command]
pub fn vgt_plugin_runtime_execution_permit(
    policy: State<'_, PolicyRuntimeState>,
    window: WebviewWindow,
    state: State<'_, PluginRuntimeState>,
    plugin_id: String,
) -> Result<PluginExecutionPermit, String> {
    policy.require(ActionBoundary::PluginExecute, "plugin:runtime")?;
    require_trusted_main_window(&window)?;
    validate_plugin_id(&plugin_id)?;
    state
        .runtime
        .lock()
        .map_err(|_| "PLUGIN_RUNTIME_STATE_UNAVAILABLE".to_string())?
        .execution_permit(&plugin_id)
        .map_err(stable_error)
}

#[tauri::command]
pub fn vgt_plugin_runtime_trust_signer(
    policy: State<'_, PolicyRuntimeState>,
    window: WebviewWindow,
    state: State<'_, PluginRuntimeState>,
    request: PluginSignerTrustRequest,
) -> Result<bool, String> {
    policy.require(ActionBoundary::PluginInstall, "plugin:runtime")?;
    require_trusted_main_window(&window)?;
    state
        .runtime
        .lock()
        .map_err(|_| "PLUGIN_RUNTIME_STATE_UNAVAILABLE".to_string())?
        .trust_developer_signer(
            &request.signer_fingerprint_sha256,
            request.explicit_user_confirmation,
        )
        .map(|_| true)
        .map_err(stable_error)
}

#[tauri::command]
pub fn vgt_plugin_runtime_grant_document_access(
    policy: State<'_, PolicyRuntimeState>,
    window: WebviewWindow,
    state: State<'_, PluginRuntimeState>,
    request: PluginDocumentGrantRequest,
) -> Result<bool, String> {
    policy.require(ActionBoundary::PluginExecute, "plugin:runtime")?;
    require_trusted_main_window(&window)?;
    validate_plugin_id(&request.plugin_id)?;
    state
        .runtime
        .lock()
        .map_err(|_| "PLUGIN_RUNTIME_STATE_UNAVAILABLE".to_string())?
        .grant_document_access(
            &request.plugin_id,
            &request.document_id,
            request.explicit_user_confirmation,
        )
        .map(|_| true)
        .map_err(stable_error)
}

#[tauri::command]
pub fn vgt_plugin_runtime_authorize_host_api(
    policy: State<'_, PolicyRuntimeState>,
    window: WebviewWindow,
    state: State<'_, PluginRuntimeState>,
    request: PluginHostApiRequest,
) -> Result<bool, String> {
    policy.require(ActionBoundary::PluginExecute, "plugin:runtime")?;
    require_trusted_main_window(&window)?;
    validate_plugin_id(&request.plugin_id)?;
    state
        .runtime
        .lock()
        .map_err(|_| "PLUGIN_RUNTIME_STATE_UNAVAILABLE".to_string())?
        .authorize_host_api(&request.plugin_id, &request.request)
        .map(|_| true)
        .map_err(stable_error)
}

#[tauri::command]
pub fn vgt_plugin_runtime_status(
    window: WebviewWindow,
    state: State<'_, PluginRuntimeState>,
    plugin_id: String,
) -> Result<PluginStatus, String> {
    require_trusted_main_window(&window)?;
    validate_plugin_id(&plugin_id)?;
    state
        .runtime
        .lock()
        .map_err(|_| "PLUGIN_RUNTIME_STATE_UNAVAILABLE".to_string())?
        .status(&plugin_id)
        .map_err(stable_error)
}

#[tauri::command]
pub fn vgt_plugin_runtime_set_user_enabled(
    window: WebviewWindow,
    state: State<'_, PluginRuntimeState>,
    request: PluginEnableRequest,
) -> Result<bool, String> {
    require_trusted_main_window(&window)?;
    validate_plugin_id(&request.plugin_id)?;
    state
        .runtime
        .lock()
        .map_err(|_| "PLUGIN_RUNTIME_STATE_UNAVAILABLE".to_string())?
        .set_user_enabled(&request.plugin_id, request.enabled)
        .map(|_| true)
        .map_err(stable_error)
}

#[tauri::command]
pub fn vgt_plugin_runtime_set_safe_mode(
    window: WebviewWindow,
    state: State<'_, PluginRuntimeState>,
    enabled: bool,
) -> Result<bool, String> {
    require_trusted_main_window(&window)?;
    state
        .runtime
        .lock()
        .map_err(|_| "PLUGIN_RUNTIME_STATE_UNAVAILABLE".to_string())?
        .set_safe_mode(enabled);
    Ok(true)
}

#[tauri::command]
pub fn vgt_plugin_runtime_record_crash(
    window: WebviewWindow,
    state: State<'_, PluginRuntimeState>,
    plugin_id: String,
) -> Result<PluginStatus, String> {
    require_trusted_main_window(&window)?;
    validate_plugin_id(&plugin_id)?;
    state
        .runtime
        .lock()
        .map_err(|_| "PLUGIN_RUNTIME_STATE_UNAVAILABLE".to_string())?
        .record_crash(&plugin_id)
        .map_err(stable_error)
}

#[tauri::command]
pub fn vgt_plugin_runtime_rollback(
    window: WebviewWindow,
    state: State<'_, PluginRuntimeState>,
    plugin_id: String,
) -> Result<PluginStatus, String> {
    require_trusted_main_window(&window)?;
    validate_plugin_id(&plugin_id)?;
    state
        .runtime
        .lock()
        .map_err(|_| "PLUGIN_RUNTIME_STATE_UNAVAILABLE".to_string())?
        .rollback(&plugin_id)
        .map_err(stable_error)
}

fn decode_package(value: &str) -> Result<Vec<u8>, String> {
    if value.is_empty() || value.len() > MAX_PACKAGE_BASE64_CHARS {
        return Err("PLUGIN_PACKAGE_SIZE_REJECTED".to_string());
    }
    BASE64
        .decode(value)
        .map_err(|_| "PLUGIN_PACKAGE_ENCODING_REJECTED".to_string())
}

fn validate_offline_source(manifest: &PluginManifest, source_label: &str) -> Result<(), String> {
    if source_label.is_empty()
        || source_label.len() > 192
        || source_label.chars().any(char::is_control)
    {
        return Err("PLUGIN_INSTALL_SOURCE_REJECTED".to_string());
    }
    match &manifest.update_source {
        PluginUpdateSource::OfflineFile { source_id } if source_id == source_label => Ok(()),
        _ => Err("PLUGIN_INSTALL_SOURCE_MISMATCH".to_string()),
    }
}

fn validate_plugin_id(value: &str) -> Result<(), String> {
    if value.len() < 3
        || value.len() > 128
        || !value
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || matches!(b, b'.' | b'-'))
    {
        return Err("PLUGIN_ID_REJECTED".to_string());
    }
    Ok(())
}

fn stable_error(error: impl std::fmt::Display) -> String {
    error.to_string()
}
