// STATUS: DIAMANT VGT SUPREME
//! Recovery safe-mode adapter. The policy lives in `vgt-diagnostics-release`; this module only
//! exposes bounded desktop commands and delegates plugin/search repair work without loading
//! third-party plugin code.

use serde::{Deserialize, Serialize};
use tauri::State;
use vgt_diagnostics_release::{
    diagnose_plugin_without_loading, validate_workspace_configuration, PluginDiagnosticFinding,
    PluginDiagnosticInput, SafeModeStatus,
};
use vgt_object_model::WorkspaceDocument;
use vgt_search::{DocumentIndexOptions, SearchIndex};

use crate::diagnostics_bridge::DiagnosticsReleaseState;
use crate::plugin_runtime_bridge::PluginRuntimeState;

const MAX_REBUILD_DOCUMENTS: usize = 100_000;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WorkspaceConfigValidationRequest {
    pub config_json: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PluginDiagnosticRequest {
    pub plugin_id: String,
    pub manifest_compatible: bool,
    pub digest_verified: bool,
    pub signature_verified: bool,
    pub quarantined: bool,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SearchRebuildRequest {
    pub documents: Vec<WorkspaceDocument>,
}

#[derive(Serialize)]
pub struct SearchRebuildResult {
    schema: &'static str,
    rebuilt: bool,
    indexed_documents: usize,
    skipped_documents: usize,
    generation: u64,
    corpus_digest_blake3: String,
}

#[tauri::command]
pub fn vgt_safe_mode_status(
    state: State<'_, DiagnosticsReleaseState>,
) -> Result<SafeModeStatus, String> {
    state.safe_mode_status()
}

#[tauri::command]
pub fn vgt_safe_mode_set(
    state: State<'_, DiagnosticsReleaseState>,
    plugins: State<'_, PluginRuntimeState>,
    enabled: bool,
) -> Result<SafeModeStatus, String> {
    let status = state.set_safe_mode(enabled)?;
    plugins
        .runtime
        .lock()
        .map_err(|_| "PLUGIN_RUNTIME_STATE_UNAVAILABLE".to_string())?
        .set_safe_mode(enabled);
    Ok(status)
}

#[tauri::command]
pub fn vgt_safe_mode_validate_workspace_config(
    request: WorkspaceConfigValidationRequest,
) -> vgt_diagnostics_release::WorkspaceConfigValidation {
    validate_workspace_configuration(&request.config_json)
}

#[tauri::command]
pub fn vgt_safe_mode_diagnose_plugin(
    request: PluginDiagnosticRequest,
) -> Result<PluginDiagnosticFinding, String> {
    diagnose_plugin_without_loading(PluginDiagnosticInput {
        plugin_id: request.plugin_id,
        manifest_compatible: request.manifest_compatible,
        digest_verified: request.digest_verified,
        signature_verified: request.signature_verified,
        quarantined: request.quarantined,
    })
    .map_err(|_| "PLUGIN_DIAGNOSTIC_BOUNDARY_REJECTED".to_string())
}

#[tauri::command]
pub fn vgt_safe_mode_rebuild_search_index(
    request: SearchRebuildRequest,
) -> Result<SearchRebuildResult, String> {
    if request.documents.len() > MAX_REBUILD_DOCUMENTS {
        return Err("SAFE_MODE_REBUILD_DOCUMENT_LIMIT".to_string());
    }
    let corpus: Vec<_> = request
        .documents
        .into_iter()
        .map(|document| (document, DocumentIndexOptions::default()))
        .collect();
    let key = [0xA5u8; 32]; // Ephemeral repair key; this command emits no persistent index bytes.
    let (index, report) = SearchIndex::load_or_rebuild(None, &key, &corpus)
        .map_err(|_| "SAFE_MODE_SEARCH_REBUILD_FAILED".to_string())?;
    let checkpoint = index
        .checkpoint()
        .map_err(|_| "SAFE_MODE_SEARCH_CHECKPOINT_FAILED".to_string())?;
    Ok(SearchRebuildResult {
        schema: "vgt.safe-mode.search-rebuild/1",
        rebuilt: report.rebuilt,
        indexed_documents: report.indexed_documents,
        skipped_documents: report.skipped_documents,
        generation: report.generation,
        corpus_digest_blake3: checkpoint.corpus_digest_blake3,
    })
}
