// STATUS: PLATIN
//! Native Astraea Workspace desktop shell.
//! Production UI-to-core calls use Tauri IPC directly; the HTTP daemon remains a development fallback.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]


mod automation_runtime_bridge;
mod container_storage;
mod converter_jail;
mod converter_security;
mod diagnostics_bridge;
mod ipc_runtime;
mod ipc_startup;
mod import_export_sandbox_bridge;
mod ipc_contract_types;
mod ipc_panic_boundary;
mod ipc_panic_core;
mod ipc_schema;
mod ipc_schema_core;
mod navigation_security;
mod ocr_bridge;
mod pdf_native_bridge;
mod pdf_native_signing;
mod plugin_runtime_bridge;
mod plugin_secret_bridge;
mod policy_bridge;
mod recovery_fs;
mod remote_wipe_bridge;
#[cfg(test)]
mod remote_wipe_core;
mod safe_mode_bridge;
mod save_dialog_security;
mod security_gate_bridge;
mod shell_native_services;
mod single_instance;
mod present_window_bridge;
mod workspace_store_bridge;
mod shell_window_bridge;
mod sync_bridge;
mod sync_bridge_support;
mod sync_queue_storage;
mod theme_asset_bridge;
mod top_secret_bridge;
mod update_release_bridge;
mod update_storage_common;
mod update_transfer_bridge;

use automation_runtime_bridge::{
    vgt_automation_runtime_activate, vgt_automation_runtime_cancel, vgt_automation_runtime_enqueue,
    vgt_automation_runtime_next, vgt_automation_runtime_status, AutomationRuntimeState,
};
use container_storage::{atomic_replace_encrypted, atomic_write_vwc_stream};
use diagnostics_bridge::{
    vgt_diagnostics_debug_mode, vgt_diagnostics_runtime_info, vgt_diagnostics_snapshot,
    DiagnosticsReleaseState,
};
use import_export_sandbox_bridge::{
    vgt_import_sandbox_atomic_export, vgt_import_sandbox_inspect_bytes,
    vgt_import_sandbox_inspect_path, vgt_import_sandbox_validate_export_bytes,
};
use ipc_runtime::{vgt_ipc_server_status, IpcServerStatus};
use ocr_bridge::{vgt_ocr_languages, vgt_ocr_recognize};
use pdf_native_bridge::{vgt_pdf_linearization_status, vgt_pdf_linearize};
use pdf_native_signing::{vgt_pdf_signing_identities, vgt_pdf_signing_sign};
use plugin_runtime_bridge::{
    vgt_plugin_runtime_authorize_host_api, vgt_plugin_runtime_diagnose_offline,
    vgt_plugin_runtime_execution_permit, vgt_plugin_runtime_grant_document_access,
    vgt_plugin_runtime_install_offline, vgt_plugin_runtime_record_crash,
    vgt_plugin_runtime_review_offline, vgt_plugin_runtime_rollback,
    vgt_plugin_runtime_set_safe_mode, vgt_plugin_runtime_set_user_enabled,
    vgt_plugin_runtime_status, vgt_plugin_runtime_trust_signer, vgt_plugin_runtime_update_offline,
    PluginRuntimeState,
};
use plugin_secret_bridge::{
    vgt_plugin_secret_handle_issue, vgt_plugin_secret_handle_revoke,
    vgt_plugin_secret_handle_status, PluginSecretHandleState,
};
use policy_bridge::{
    vgt_policy_effective_view, vgt_policy_evaluate, vgt_policy_install_signed_bundle,
    PolicyRuntimeState,
};
use rand::{rngs::OsRng, RngCore};
use recovery_fs::clear_recovery_root;
use remote_wipe_bridge::vgt_remote_wipe;
use safe_mode_bridge::{
    vgt_safe_mode_diagnose_plugin, vgt_safe_mode_rebuild_search_index, vgt_safe_mode_set,
    vgt_safe_mode_status, vgt_safe_mode_validate_workspace_config,
};
use save_dialog_security::SaveDialogGrantState;
use security_gate_bridge::require_trusted_main_window;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use shell_native_services::{
    vgt_shell_clipboard_read, vgt_shell_clipboard_write, vgt_shell_native_capabilities,
    vgt_shell_notify, vgt_shell_open_dialog, vgt_shell_save_dialog, vgt_shell_set_native_policy,
    ShellNativePolicyState,
};
use present_window_bridge::{vgt_present_close_display, vgt_present_monitors, vgt_present_open_display};
use workspace_store_bridge::{vgt_workspace_store_list, vgt_workspace_store_read, vgt_workspace_store_remove, vgt_workspace_store_reveal, vgt_workspace_store_write};
use shell_window_bridge::vgt_shell_open_window;
use std::collections::{HashMap, VecDeque};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};
use std::time::{SystemTime, UNIX_EPOCH};
use sync_bridge::{
    vgt_sync_bootstrap, vgt_sync_close, vgt_sync_gc, vgt_sync_membership_change, vgt_sync_merge,
    vgt_sync_missing, vgt_sync_open, vgt_sync_quarantine_future, vgt_sync_record,
    vgt_sync_snapshot, vgt_sync_status, SyncBridgeState,
};
#[cfg(target_os = "macos")]
use tauri::Emitter;
use tauri::{Manager, State, WebviewWindow};
use theme_asset_bridge::{
    vgt_brand_kit_preview, vgt_template_instantiate, vgt_theme_asset_validate,
    vgt_theme_flatten_export, vgt_theme_resolve,
};
use top_secret_bridge::{
    seal_vwc_bytes_for_storage, unseal_outer_bytes_for_storage, vgt_top_secret_cancel,
    vgt_top_secret_export_infinity, vgt_top_secret_import_infinity,
    vgt_top_secret_initialize_identity, vgt_top_secret_pack, vgt_top_secret_status,
    vgt_top_secret_unpack,
};
use update_release_bridge::{
    vgt_update_clear_recovery, vgt_update_mark_install_failed, vgt_update_mark_install_started,
    vgt_update_recovery_status, vgt_update_release_status, vgt_update_verify_and_stage_offline,
    vgt_update_verify_and_stage_transfer,
};
use update_transfer_bridge::{
    vgt_update_transfer_append, vgt_update_transfer_begin, vgt_update_transfer_pause,
    vgt_update_transfer_resume, vgt_update_transfer_status,
};
use vgt_container::{ContainerError, SaveOptions, VgtContainer};
use vgt_formula::functions::{UserZoneContext, UserZoneGuard};
use vgt_formula::{CellCoord, ComputedValue, SpreadsheetEngine};
use vgt_keyvault::{
    parse_offline_factor_hex, parse_x25519_key_material, KeyVaultAuditSnapshot,
    SealedApplicationSecret, UnlockPolicy, VgtKeyVault,
};
use vgt_netgate::{
    NetGate, NetworkCapability, NetworkDataClass, NetworkDirection, NetworkProtocol, NetworkRequest,
};
use vgt_object_model::{SecurityProfile, WorkspaceDocument};

const MAX_CONTAINER_BYTES: usize = 128 * 1024 * 1024;
const MAX_RECOVERY_CHAIN_BYTES: u64 = 64 * 1024 * 1024;
const MAX_FORMULA_LENGTH: usize = 16 * 1024;
const MAX_FORMULA_CELLS: usize = 50_000;

#[derive(Serialize)]
struct VaultDiskSpaceResponse {
    total_bytes: u64,
    free_bytes: u64,
}

#[cfg(unix)]
fn vault_disk_space_for_path(path: &Path) -> Result<VaultDiskSpaceResponse, String> {
    use std::ffi::CString;
    use std::os::unix::ffi::OsStrExt;
    let c_path = CString::new(path.as_os_str().as_bytes())
        .map_err(|_| "Vault storage path is invalid".to_string())?;
    let mut stat: libc::statvfs = unsafe { std::mem::zeroed() };
    if unsafe { libc::statvfs(c_path.as_ptr(), &mut stat) } != 0 {
        return Err("Vault disk space query failed".to_string());
    }
    let block_size = if stat.f_frsize > 0 {
        stat.f_frsize as u64
    } else {
        stat.f_bsize as u64
    };
    Ok(VaultDiskSpaceResponse {
        total_bytes: (stat.f_blocks as u64).saturating_mul(block_size),
        free_bytes: (stat.f_bavail as u64).saturating_mul(block_size),
    })
}

#[cfg(windows)]
fn vault_disk_space_for_path(path: &Path) -> Result<VaultDiskSpaceResponse, String> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;
    let wide: Vec<u16> = path
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let mut available = 0u64;
    let mut total = 0u64;
    let mut free = 0u64;
    if unsafe { GetDiskFreeSpaceExW(wide.as_ptr(), &mut available, &mut total, &mut free) } == 0 {
        return Err("Vault disk space query failed".to_string());
    }
    Ok(VaultDiskSpaceResponse {
        total_bytes: total,
        free_bytes: available.min(free),
    })
}

#[cfg(not(any(unix, windows)))]
fn vault_disk_space_for_path(_path: &Path) -> Result<VaultDiskSpaceResponse, String> {
    Err("Vault disk space query is unsupported on this platform".to_string())
}

#[tauri::command]
fn vgt_vault_disk_space() -> Result<VaultDiskSpaceResponse, String> {
    let path =
        std::env::current_dir().map_err(|_| "Vault storage location is unavailable".to_string())?;
    vault_disk_space_for_path(&path)
}

struct AppState {
    vault: Mutex<VgtKeyVault>,
    netgate: Mutex<NetGate>,
    opened_files: Mutex<VecDeque<PathBuf>>,
    deep_links: Mutex<VecDeque<String>>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct PackRequest {
    document: WorkspaceDocument,
    pin: Option<String>,
    password: Option<String>,
    recipient_public_key: Option<String>,
}

#[derive(Serialize)]
struct PackResponse {
    success: bool,
    container_base64: Option<String>,
    error: Option<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct UnpackRequest {
    container_base64: String,
    pin: Option<String>,
    password: Option<String>,
    recipient_private_key: Option<String>,
}

#[derive(Serialize)]
struct UnpackResponse {
    success: bool,
    document: Option<WorkspaceDocument>,
    error: Option<String>,
    requires_pin: bool,
    requires_password: bool,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct FormulaRequest {
    formula: String,
    cells: HashMap<String, CellInput>,
    #[serde(default)]
    volatile_policy: Option<String>,
    #[serde(default)]
    external_reference_policy: Option<String>,
    #[serde(default)]
    contract: Option<String>,
    /// **W-426:** die Zone des **Nutzers**. Fehlt das Feld, gilt die Zone des **Rechners** — **genau wie bisher** ✓
    /// (*additiv* ✓). Es liegt **innerhalb** von `request` ✓, damit der IPC-Vertrag unverändert bleibt
    /// (`ipc_schema_core.rs:41` erlaubt genau `["request"]` ✓).
    #[serde(default)]
    time_zone: Option<FormulaTimeZoneInput>,
}

/// **Die Zone, wie die Oberfläche sie gemessen hat** ✓ (W-426) — **eine** Gestalt für **eine** Herkunft ✓.
///
/// Die Namen sind die der Nutzlast aus `open-core/ui/src/apps/grid/formulas/formula.ts` ✓. Die **Anpassung** von der
/// TypeScript-Gestalt (`GridFormulaTimeContext`, camelCase ✓) auf diese Namen geschieht **an genau einer Stelle**:
/// dort, wo der Payload gebaut wird ✓ — hier wird nur noch **gelesen** ✓.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct FormulaTimeZoneInput {
    /// Der Zeitpunkt, **zu dem** der Offset gemessen wurde (ms seit der Epoche) ✓. Fehlt er, gilt die Uhr des
    /// Rechners ✓ — der Offset bleibt dann der einzige feste Bestandteil ✓.
    #[serde(default)]
    now_ms: Option<i64>,
    /// Der Offset in Minuten, positiv **östlich** von UTC ✓ (Berlin im Winter: `60` ✓).
    #[serde(default)]
    utc_offset_minutes: Option<i32>,
    /// Der **Name** der Zone (`Europe/Berlin` ✓) oder `null` für die Zone des Rechners ✓ — nur Herkunft ✓.
    #[serde(default)]
    zone: Option<String>,
    /// `explicit` oder `host` ✓ — nur Herkunft ✓, **keine** Regel ✓.
    #[serde(default)]
    source: Option<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct CellInput {
    value: Option<serde_json::Value>,
    formula: Option<String>,
}

fn formula_contains_volatile_function(formula: &str) -> bool {
    let upper = formula.to_ascii_uppercase();
    ["NOW(", "TODAY(", "RAND(", "RANDBETWEEN(", "RANDARRAY("]
        .iter()
        .any(|needle| upper.contains(needle))
}

fn formula_contains_external_workbook_reference(formula: &str) -> bool {
    // Excel-style [Book.xlsx]Sheet!A1 references never trigger I/O inside vgt-formula.
    // They require an explicitly authorized Workspace Fabric / connector binding.
    let bytes = formula.as_bytes();
    let mut in_string = false;
    let mut i = 0usize;
    while i < bytes.len() {
        if bytes[i] == b'"' {
            if in_string && i + 1 < bytes.len() && bytes[i + 1] == b'"' {
                i += 2;
                continue;
            }
            in_string = !in_string;
            i += 1;
            continue;
        }
        if !in_string && bytes[i] == b'[' {
            if let Some(close_rel) = formula[i + 1..].find(']') {
                let close = i + 1 + close_rel;
                if close + 1 < bytes.len() && formula[close + 1..].contains('!') {
                    return true;
                }
            }
        }
        i += 1;
    }
    false
}

fn validate_formula_contract(request: &FormulaRequest) -> Result<(), &'static str> {
    if request.contract.as_deref() != Some("VGT-FORMULA-CORE-1") {
        return Err("Formula engine contract rejected");
    }
    let external_allowed =
        request.external_reference_policy.as_deref() == Some("workspace-capability");
    if !external_allowed
        && (formula_contains_external_workbook_reference(&request.formula)
            || request
                .cells
                .values()
                .filter_map(|cell| cell.formula.as_deref())
                .any(formula_contains_external_workbook_reference))
    {
        return Err("EXTERNAL_REFERENCE_CAPABILITY_REQUIRED");
    }
    let volatile_allowed = request.volatile_policy.as_deref() == Some("runtime");
    if !volatile_allowed
        && (formula_contains_volatile_function(&request.formula)
            || request
                .cells
                .values()
                .filter_map(|cell| cell.formula.as_deref())
                .any(formula_contains_volatile_function))
    {
        return Err("VOLATILE_DISABLED");
    }
    Ok(())
}

#[derive(Serialize)]
struct FormulaResponse {
    success: bool,
    result: Option<serde_json::Value>,
    error: Option<String>,
}

#[derive(Serialize)]
struct KeyVaultStatusResponse {
    success: bool,
    platform: String,
    provider_name: String,
    provider_available: bool,
    secure_persistence: bool,
    hardware_interface_detected: bool,
    hardware_slot_supported: bool,
    provider_capabilities: Vec<String>,
    provider_detail: String,
    is_unlocked: bool,
    pqc_unlocked: bool,
    top_secret_enrolled: bool,
    top_secret_unlocked: bool,
    hardware_backed: bool,
    hardware_attestation_verified: bool,
    software_provider_configured: bool,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct SoftwareProviderPassphraseRequest {
    passphrase: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct TopSecretEnrollRequest {
    user_secret: String,
    require_offline_factor: bool,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct TopSecretUnlockRequest {
    user_secret: String,
    offline_factor_hex: Option<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct TopSecretRotateFactorRequest {
    user_secret: String,
    current_offline_factor_hex: Option<String>,
    require_new_factor: bool,
}

#[derive(Serialize)]
struct TopSecretAccessResponse {
    success: bool,
    generation: Option<u64>,
    offline_factor_hex: Option<String>,
    recovery_hint: Option<String>,
    error: Option<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct KeyVaultSealSecretRequest {
    scope: String,
    secret: String,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct KeyVaultSealedSecretPayload {
    version: u8,
    nonce: Vec<u8>,
    ciphertext: Vec<u8>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct KeyVaultUnsealSecretRequest {
    scope: String,
    sealed: KeyVaultSealedSecretPayload,
}

#[derive(Serialize)]
struct KeyVaultSecretResponse {
    success: bool,
    sealed: Option<KeyVaultSealedSecretPayload>,
    secret: Option<String>,
    error: Option<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct NetGateRequest {
    target_host: String,
    target_port: u16,
    purpose: String,
    capability: String,
    #[serde(default = "default_netgate_component")]
    component_id: String,
    #[serde(default)]
    document_id: Option<String>,
    #[serde(default)]
    automation_id: Option<String>,
    #[serde(default = "default_netgate_method")]
    method: String,
    #[serde(default)]
    expected_request_bytes: u64,
    #[serde(default)]
    expected_response_bytes: u64,
    #[serde(default = "default_netgate_timeout")]
    timeout_ms: u64,
}

fn default_netgate_component() -> String {
    "workspace-shell".to_string()
}
fn default_netgate_method() -> String {
    "GET".to_string()
}
fn default_netgate_timeout() -> u64 {
    5_000
}

#[derive(Serialize)]
struct NetGateResponse {
    verdict: String,
    capability: String,
    target_host: String,
    target_port: u16,
    purpose: String,
    component_id: String,
    document_id: Option<String>,
    automation_id: Option<String>,
    destination_classes: Vec<String>,
    capability_id: Option<String>,
    preview_only: bool,
    resolution_required: bool,
}

#[derive(Serialize, Clone)]
pub(crate) struct NativeOpenedFile {
    file_name: String,
    data_base64: String,
    size_bytes: u64,
}

const SUPPORTED_OPEN_EXTENSIONS: &[&str] = &[
    "docx",
    "odp",
    "ods",
    "odt",
    "pdf",
    "pptx",
    "vauto",
    "vboard",
    "vconnect",
    "vdoc",
    "vdraw",
    "vgrid",
    "vinsight",
    "vnote",
    "vpdf",
    "vpolicy",
    "vpresent",
    "vpub",
    "vtask",
    "vvault",
    "vwc",
    "xlsx",
];

fn is_supported_open_path(path: &Path) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .map(|value| {
            SUPPORTED_OPEN_EXTENSIONS
                .iter()
                .any(|allowed| value.eq_ignore_ascii_case(allowed))
        })
        .unwrap_or(false)
}

fn canonical_open_path(path: &Path) -> Result<PathBuf, String> {
    if !is_supported_open_path(path) {
        return Err("File type is not supported by Astraea Workspace Beta".to_string());
    }
    let canonical =
        fs::canonicalize(path).map_err(|_| "Requested file is unavailable".to_string())?;
    let metadata = fs::metadata(&canonical)
        .map_err(|_| "Requested file metadata is unavailable".to_string())?;
    if !metadata.is_file() {
        return Err("Requested path is not a regular file".to_string());
    }
    if metadata.len() == 0 || metadata.len() > MAX_CONTAINER_BYTES as u64 {
        return Err("Requested file exceeds the desktop open size boundary".to_string());
    }
    Ok(canonical)
}

pub(crate) fn load_native_open_file(path: &Path) -> Result<NativeOpenedFile, String> {
    let canonical = canonical_open_path(path)?;
    let file_name = canonical
        .file_name()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "Requested file name is invalid".to_string())?
        .to_string();
    let bytes = fs::read(&canonical).map_err(|_| "Requested file could not be read".to_string())?;
    if bytes.is_empty() || bytes.len() > MAX_CONTAINER_BYTES {
        return Err("Requested file exceeds the desktop open size boundary".to_string());
    }
    Ok(NativeOpenedFile {
        file_name,
        data_base64: encode_base64(&bytes),
        size_bytes: bytes.len() as u64,
    })
}

fn collect_startup_files() -> VecDeque<PathBuf> {
    std::env::args_os()
        .skip(1)
        .take(16)
        .map(PathBuf::from)
        .filter(|path| path.exists() && is_supported_open_path(path))
        .collect()
}

fn collect_startup_deep_links() -> VecDeque<String> {
    std::env::args_os()
        .skip(1)
        .take(16)
        .filter_map(|value| value.into_string().ok())
        .filter(|value| value.len() <= 2048 && value.starts_with("vgt://workspace/document/"))
        .collect()
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RecoveryWriteRequest {
    document: WorkspaceDocument,
    pin: Option<String>,
    password: Option<String>,
    recipient_public_key: Option<String>,
}

#[derive(Serialize)]
struct RecoveryWriteResponse {
    success: bool,
    snapshot_id: String,
    created_at: u64,
}

#[derive(Serialize)]
struct RecoverySnapshotInfo {
    snapshot_id: String,
    document_kind: String,
    created_at: u64,
    size_bytes: u64,
    requires_pin: bool,
    requires_password: bool,
    security_profile: String,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct RecoveryDisplayMetadata {
    version: u8,
    container_sha256: String,
    document_kind: String,
    security_profile: String,
}

fn recovery_display_meta_path(snapshot_path: &Path) -> PathBuf {
    PathBuf::from(format!("{}.meta", snapshot_path.display()))
}

fn recovery_container_sha256(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RecoveryRestoreRequest {
    snapshot_id: String,
    pin: Option<String>,
    password: Option<String>,
    recipient_private_key: Option<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RecoveryDeleteRequest {
    snapshot_id: String,
}

fn recovery_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|_| "Application data directory is unavailable".to_string())?
        .join("recovery");
    fs::create_dir_all(&root).map_err(|_| "Recovery directory could not be created".to_string())?;
    Ok(root)
}

fn hex_prefix(bytes: &[u8], count: usize) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut output = String::with_capacity(count * 2);
    for byte in bytes.iter().take(count) {
        output.push(HEX[(byte >> 4) as usize] as char);
        output.push(HEX[(byte & 0x0f) as usize] as char);
    }
    output
}

fn recovery_doc_key(document_id: &str) -> String {
    let digest = Sha256::digest(document_id.as_bytes());
    hex_prefix(&digest, 16)
}

fn now_millis() -> Result<u64, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .map_err(|_| "System clock is invalid".to_string())
}

fn safe_snapshot_path(root: &Path, snapshot_id: &str) -> Result<PathBuf, String> {
    if snapshot_id.len() > 112 || snapshot_id.contains('\\') || snapshot_id.starts_with('/') {
        return Err("Recovery snapshot identifier is invalid".to_string());
    }
    let mut parts = snapshot_id.split('/');
    let directory = parts.next().unwrap_or_default();
    let file = parts.next().unwrap_or_default();
    if parts.next().is_some()
        || directory.len() != 32
        || !directory.bytes().all(|byte| byte.is_ascii_hexdigit())
    {
        return Err("Recovery snapshot identifier is invalid".to_string());
    }
    let stem = file
        .strip_suffix(".vrec")
        .ok_or_else(|| "Recovery snapshot identifier is invalid".to_string())?;
    let valid_stem = if let Some((timestamp, nonce)) = stem.split_once('-') {
        !timestamp.is_empty()
            && timestamp.bytes().all(|byte| byte.is_ascii_digit())
            && nonce.len() == 16
            && nonce.bytes().all(|byte| byte.is_ascii_hexdigit())
    } else {
        // Legacy timestamp-only snapshot ids remain readable.
        !stem.is_empty() && stem.bytes().all(|byte| byte.is_ascii_digit())
    };
    if !valid_stem {
        return Err("Recovery snapshot identifier is invalid".to_string());
    }
    Ok(root.join(directory).join(file))
}

fn prune_recovery_directory(directory: &Path, keep: usize, max_bytes: u64) {
    let Ok(entries) = fs::read_dir(directory) else {
        return;
    };
    let mut files: Vec<(u64, u64, PathBuf)> = entries
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let path = entry.path();
            if path.extension().and_then(|value| value.to_str()) != Some("vrec") {
                return None;
            }
            let raw = path.file_stem()?.to_str()?;
            let timestamp = raw
                .split_once('-')
                .map(|(value, _)| value)
                .unwrap_or(raw)
                .parse::<u64>()
                .ok()?;
            let bytes = entry.metadata().ok()?.len();
            Some((timestamp, bytes, path))
        })
        .collect();
    files.sort_by_key(|item| std::cmp::Reverse(item.0));
    let mut retained = 0usize;
    let mut retained_bytes = 0u64;
    for (_, bytes, path) in files {
        let fits = retained < keep && retained_bytes.saturating_add(bytes) <= max_bytes;
        if fits {
            retained += 1;
            retained_bytes = retained_bytes.saturating_add(bytes);
            continue;
        }
        let meta_path = recovery_display_meta_path(&path);
        let _ = fs::remove_file(path);
        let _ = fs::remove_file(meta_path);
    }
}

fn lock_vault<'a>(state: &'a State<'a, AppState>) -> Result<MutexGuard<'a, VgtKeyVault>, String> {
    state
        .vault
        .lock()
        .map_err(|_| "Native KeyVault state is unavailable".to_string())
}

fn public_container_error(error: &ContainerError) -> &'static str {
    match error {
        ContainerError::InvalidMagic
        | ContainerError::CorruptedData
        | ContainerError::UnexpectedEof
        | ContainerError::TrailingBytes
        | ContainerError::MissingDocumentTree
        | ContainerError::InvalidCompressedPayload
        | ContainerError::OffsetOverflow
        | ContainerError::ManifestChunkMismatch
        | ContainerError::CorruptedManifest
        | ContainerError::IncompatibleManifest
        | ContainerError::UnknownCriticalChunk(_)
        | ContainerError::MissingChunkKdfSalt
        | ContainerError::InvalidKeySlotCount(_) => "Container is invalid, corrupted, or truncated",
        ContainerError::UnsupportedFormatVersion(_)
        | ContainerError::UnsupportedCryptoVersion(_)
        | ContainerError::UnsupportedManifestVersion(_)
        | ContainerError::LegacyHeaderApiOnV3
        | ContainerError::StreamingLegacyRequiresBuffer(_) => {
            "Container format version is not supported by this operation"
        }
        ContainerError::MigrationCredentialsRequired => {
            "Container migration requires the original unlock credential"
        }
        ContainerError::Cancelled => "Container operation was cancelled",
        ContainerError::ContainerTooLarge(_)
        | ContainerError::MetadataTooLarge(_, _)
        | ContainerError::ManifestTooLarge(_, _)
        | ContainerError::TooManyChunks(_, _)
        | ContainerError::ChunkTooLarge(_, _)
        | ContainerError::ChunkPlaintextTooLarge(_, _)
        | ContainerError::PlaintextTooLarge(_)
        | ContainerError::PlaintextTotalTooLarge(_) => {
            "Container exceeds configured resource limits"
        }
        ContainerError::KeyVault(vgt_keyvault::KeyVaultError::AuthenticationFailed)
        | ContainerError::KeyVault(vgt_keyvault::KeyVaultError::InvalidCredentialFormat) => {
            "Authentication failed"
        }
        ContainerError::KeyVault(vgt_keyvault::KeyVaultError::VaultLocked) => {
            "Local KeyVault is locked"
        }
        ContainerError::KeyVault(_) => "Native key storage is unavailable or failed",
        ContainerError::Crypto(_) => "Cryptographic operation failed",
        ContainerError::Serialization(_) => "Workspace document serialization failed",
        ContainerError::Io(_) => "Container I/O operation failed",
    }
}

fn encode_base64(data: &[u8]) -> String {
    const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::with_capacity(data.len().div_ceil(3) * 4);
    let mut chunks = data.chunks_exact(3);
    for chunk in chunks.by_ref() {
        let n = ((chunk[0] as u32) << 16) | ((chunk[1] as u32) << 8) | chunk[2] as u32;
        result.push(ALPHABET[((n >> 18) & 63) as usize] as char);
        result.push(ALPHABET[((n >> 12) & 63) as usize] as char);
        result.push(ALPHABET[((n >> 6) & 63) as usize] as char);
        result.push(ALPHABET[(n & 63) as usize] as char);
    }
    let rem = chunks.remainder();
    if rem.len() == 1 {
        let n = (rem[0] as u32) << 16;
        result.push(ALPHABET[((n >> 18) & 63) as usize] as char);
        result.push(ALPHABET[((n >> 12) & 63) as usize] as char);
        result.push('=');
        result.push('=');
    } else if rem.len() == 2 {
        let n = ((rem[0] as u32) << 16) | ((rem[1] as u32) << 8);
        result.push(ALPHABET[((n >> 18) & 63) as usize] as char);
        result.push(ALPHABET[((n >> 12) & 63) as usize] as char);
        result.push(ALPHABET[((n >> 6) & 63) as usize] as char);
        result.push('=');
    }
    result
}

pub(crate) fn decode_base64(input: &str) -> Result<Vec<u8>, ()> {
    if input.len() > MAX_CONTAINER_BYTES.saturating_mul(2) {
        return Err(());
    }
    let clean: Vec<u8> = input.bytes().filter(|b| !b.is_ascii_whitespace()).collect();
    if !clean.len().is_multiple_of(4) {
        return Err(());
    }
    let mut table = [0xffu8; 256];
    for (index, byte) in b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
        .iter()
        .enumerate()
    {
        table[*byte as usize] = index as u8;
    }
    let mut output = Vec::with_capacity(clean.len() / 4 * 3);
    for chunk in clean.chunks_exact(4) {
        let a = table[chunk[0] as usize];
        let b = table[chunk[1] as usize];
        let c = if chunk[2] == b'=' {
            0
        } else {
            table[chunk[2] as usize]
        };
        let d = if chunk[3] == b'=' {
            0
        } else {
            table[chunk[3] as usize]
        };
        if a == 0xff
            || b == 0xff
            || (chunk[2] != b'=' && c == 0xff)
            || (chunk[3] != b'=' && d == 0xff)
        {
            return Err(());
        }
        let triple = ((a as u32) << 18) | ((b as u32) << 12) | ((c as u32) << 6) | d as u32;
        output.push((triple >> 16) as u8);
        if chunk[2] != b'=' {
            output.push((triple >> 8) as u8);
        }
        if chunk[3] != b'=' {
            output.push(triple as u8);
        }
        if output.len() > MAX_CONTAINER_BYTES {
            return Err(());
        }
    }
    Ok(output)
}

#[tauri::command]
fn vgt_pack_container(
    state: State<'_, AppState>,
    request: PackRequest,
) -> Result<PackResponse, String> {
    let mut vault = lock_vault(&state)?;
    let recipient_public_key = match request.recipient_public_key.as_deref() {
        Some(value) => Some(
            parse_x25519_key_material(value)
                .map_err(|_| "Recipient X25519 public key is invalid".to_string())?,
        ),
        None => None,
    };
    if recipient_public_key.is_some()
        && (request
            .pin
            .as_deref()
            .is_some_and(|value| !value.trim().is_empty())
            || request
                .password
                .as_deref()
                .is_some_and(|value| !value.is_empty()))
    {
        return Err("RecipientOnly cannot be combined with PIN/password slots".to_string());
    }
    let options = SaveOptions {
        policy: recipient_public_key
            .as_ref()
            .map(|_| UnlockPolicy::RecipientOnly),
        pin: request.pin.as_deref(),
        portable_password: request.password.as_deref(),
        recipient_public_key: recipient_public_key.as_ref(),
    };
    Ok(
        match VgtContainer::pack_document(&request.document, &mut vault, options) {
            Ok(bytes) => PackResponse {
                success: true,
                container_base64: Some(encode_base64(&bytes)),
                error: None,
            },
            Err(error) => PackResponse {
                success: false,
                container_base64: None,
                error: Some(public_container_error(&error).to_string()),
            },
        },
    )
}

#[tauri::command]
fn vgt_unpack_container(
    state: State<'_, AppState>,
    request: UnpackRequest,
) -> Result<UnpackResponse, String> {
    let bytes = decode_base64(&request.container_base64)
        .map_err(|_| "Container encoding is invalid".to_string())?;
    let meta = match VgtContainer::read_metadata(&bytes) {
        Ok(meta) => meta,
        Err(error) => {
            return Ok(UnpackResponse {
                success: false,
                document: None,
                error: Some(public_container_error(&error).to_string()),
                requires_pin: false,
                requires_password: false,
            })
        }
    };
    let mut vault = lock_vault(&state)?;
    let result = match meta.unlock_policy {
        UnlockPolicy::DeviceAndPin => match request.pin.as_deref() {
            Some(pin) => VgtContainer::unpack_with_pin(&bytes, &mut vault, pin),
            None => {
                return Ok(UnpackResponse {
                    success: false,
                    document: None,
                    error: Some("PIN required to unlock on this device".to_string()),
                    requires_pin: true,
                    requires_password: false,
                })
            }
        },
        UnlockPolicy::PortablePasswordOnly => match request.password.as_deref() {
            Some(password) => VgtContainer::unpack_with_password(&bytes, password),
            None => {
                return Ok(UnpackResponse {
                    success: false,
                    document: None,
                    error: Some("Portable password required to unlock".to_string()),
                    requires_pin: false,
                    requires_password: true,
                })
            }
        },
        UnlockPolicy::DeviceOnly => VgtContainer::unpack_with_vault(&bytes, &vault),
        UnlockPolicy::HardwareBackedOnly => VgtContainer::unpack_with_hardware(&bytes, &mut vault),
        UnlockPolicy::DeviceOrPortablePassword => match request.password.as_deref() {
            Some(password) => VgtContainer::unpack_with_password(&bytes, password),
            None => VgtContainer::unpack_with_vault(&bytes, &vault),
        },
        UnlockPolicy::RecipientOnly => match request.recipient_private_key.as_deref() {
            Some(value) => {
                let key = parse_x25519_key_material(value)
                    .map_err(|_| "Recipient X25519 private key is invalid".to_string())?;
                VgtContainer::unpack_with_recipient(&bytes, &key)
            }
            None => {
                return Ok(UnpackResponse {
                    success: false,
                    document: None,
                    error: Some("RECIPIENT_KEY_REQUIRED".to_string()),
                    requires_pin: false,
                    requires_password: false,
                })
            }
        },
    };
    Ok(match result {
        Ok(document) => UnpackResponse {
            success: true,
            document: Some(document),
            error: None,
            requires_pin: false,
            requires_password: false,
        },
        Err(error) => UnpackResponse {
            success: false,
            document: None,
            error: Some(public_container_error(&error).to_string()),
            requires_pin: false,
            requires_password: false,
        },
    })
}

/// **W-426: die Zone des Nutzers für die Dauer der Auswertung** ✓.
///
/// **Fail-closed, nicht still** ✓: Fehlt der Offset, widerspricht sich die Angabe oder ist der Zeitpunkt nicht
/// darstellbar, wird die Auswertung **abgelehnt** ✓ (`FORMULA_TIME_ZONE_*` ✓) — statt still die Zone des Rechners
/// oder „UTC 0" einzusetzen ✗. Fehlt das Feld **ganz**, ist das Ergebnis `Ok(None)` ✓: dann gilt unverändert die
/// Zone des Rechners ✓ (*additiv* ✓).
fn formula_zone_guard(
    request: &FormulaRequest,
    engine: &SpreadsheetEngine,
) -> Result<Option<UserZoneGuard>, String> {
    let input = match request.time_zone.as_ref() {
        Some(input) => input,
        None => return Ok(None),
    };
    let source = input.source.as_deref();
    if !matches!(source, None | Some("explicit") | Some("host")) {
        return Err("FORMULA_TIME_ZONE_SOURCE_UNKNOWN".to_string());
    }
    if source == Some("explicit") && input.zone.as_deref().map(str::trim).unwrap_or_default().is_empty() {
        return Err("FORMULA_TIME_ZONE_NAME_REQUIRED".to_string());
    }
    let offset = match input.utc_offset_minutes {
        Some(offset) => offset,
        None => return Err("FORMULA_TIME_ZONE_OFFSET_REQUIRED".to_string()),
    };
    UserZoneContext::new(engine, offset)
        .install_at(input.now_ms)
        .map(Some)
        .map_err(|reason| reason.to_string())
}

#[tauri::command]
fn vgt_formula_evaluate(
    window: WebviewWindow,
    request: FormulaRequest,
) -> Result<FormulaResponse, String> {
    require_trusted_main_window(&window)?;
    if let Err(error) = validate_formula_contract(&request) {
        return Ok(FormulaResponse {
            success: false,
            result: None,
            error: Some(error.to_string()),
        });
    }
    if request.formula.len() > MAX_FORMULA_LENGTH || request.cells.len() > MAX_FORMULA_CELLS {
        return Ok(FormulaResponse {
            success: false,
            result: None,
            error: Some("Formula input exceeds configured resource limits".to_string()),
        });
    }
    let mut engine = SpreadsheetEngine::new();
    // **W-426:** Die Zone der Nutzlast gilt für die **Dauer der Auswertung** ✓ — und sie wird **vor** den Zellen
    // gesetzt, weil `set_formula` sofort rechnet (`vgt-formula/src/engine.rs:159` ✓): eine Zelle `=TODAY()` aus
    // `cells` muss die Zone des Nutzers also schon sehen ✓.
    let _zone_guard = match formula_zone_guard(&request, &engine) {
        Ok(guard) => guard,
        Err(reason) => {
            return Ok(FormulaResponse {
                success: false,
                result: None,
                error: Some(reason),
            })
        }
    };
    for (coord_text, cell) in request.cells {
        let coord = match CellCoord::parse(&coord_text) {
            Ok(coord) => coord,
            Err(_) => {
                return Ok(FormulaResponse {
                    success: false,
                    result: None,
                    error: Some("INVALID_CELL_COORDINATE".to_string()),
                })
            }
        };
        if let Some(formula) = cell.formula {
            if formula.len() > MAX_FORMULA_LENGTH {
                return Ok(FormulaResponse {
                    success: false,
                    result: None,
                    error: Some("FORMULA_RESOURCE_LIMIT".to_string()),
                });
            }
            if engine.set_formula(coord, &formula).is_err() {
                return Ok(FormulaResponse {
                    success: false,
                    result: None,
                    error: Some("INVALID_CELL_FORMULA".to_string()),
                });
            }
        } else if let Some(value) = cell.value {
            if let Some(number) = value.as_f64() {
                engine.set_value(coord, ComputedValue::Number(number));
            } else if let Some(text) = value.as_str() {
                engine.set_value(coord, ComputedValue::String(text.to_string()));
            } else if let Some(boolean) = value.as_bool() {
                engine.set_value(coord, ComputedValue::Boolean(boolean));
            }
        }
    }
    let scratch = CellCoord::new(99, 99);
    match engine.set_formula(scratch, &request.formula) {
        Ok(_) => {
            let result = match engine.get_value(&scratch) {
                ComputedValue::Number(value) => serde_json::json!(value),
                ComputedValue::String(value) => serde_json::json!(value),
                ComputedValue::Boolean(value) => serde_json::json!(value),
                ComputedValue::Empty => serde_json::Value::Null,
                ComputedValue::Error(_) => serde_json::json!("#ERR!"),
                ComputedValue::Array(matrix) => {
                    let rows: Vec<serde_json::Value> = matrix
                        .iter()
                        .map(|row| {
                            let items: Vec<serde_json::Value> = row
                                .iter()
                                .map(|v| match v {
                                    ComputedValue::Number(n) => serde_json::json!(n),
                                    ComputedValue::String(s) => serde_json::json!(s),
                                    ComputedValue::Boolean(b) => serde_json::json!(b),
                                    ComputedValue::Empty => serde_json::Value::Null,
                                    ComputedValue::Error(_) => serde_json::json!("#ERR!"),
                                    ComputedValue::Array(_) => serde_json::Value::Null,
                                })
                                .collect();
                            serde_json::Value::Array(items)
                        })
                        .collect();
                    serde_json::Value::Array(rows)
                }
            };
            Ok(FormulaResponse {
                success: true,
                result: Some(result),
                error: None,
            })
        }
        Err(_) => Ok(FormulaResponse {
            success: false,
            result: None,
            error: Some("Formula evaluation failed".to_string()),
        }),
    }
}

#[tauri::command]
fn vgt_keyvault_status(state: State<'_, AppState>) -> Result<KeyVaultStatusResponse, String> {
    let vault = lock_vault(&state)?;
    Ok(keyvault_status_response(&vault))
}

#[tauri::command]
fn keyvault_status_response(vault: &VgtKeyVault) -> KeyVaultStatusResponse {
    let health = vault.provider_health();
    KeyVaultStatusResponse {
        success: true,
        platform: format!("{:?}", vault.platform()),
        provider_name: health.provider_name,
        provider_available: health.available,
        secure_persistence: health.secure_persistence,
        hardware_interface_detected: health.hardware_interface_detected,
        hardware_slot_supported: health.hardware_slot_supported,
        provider_capabilities: health.capabilities,
        provider_detail: health.detail,
        is_unlocked: vault.is_unlocked(),
        pqc_unlocked: vault.is_pqc_unlocked(),
        top_secret_enrolled: vault.top_secret_enrolled(),
        top_secret_unlocked: vault.is_top_secret_unlocked(),
        hardware_backed: health.hardware_backed,
        hardware_attestation_verified: health.hardware_attestation_verified,
        software_provider_configured: VgtKeyVault::software_provider_configured(),
    }
}

#[tauri::command]
fn vgt_keyvault_software_provider_create(
    window: tauri::WebviewWindow,
    state: State<'_, AppState>,
    request: SoftwareProviderPassphraseRequest,
) -> Result<KeyVaultStatusResponse, String> {
    require_trusted_main_window(&window)?;
    let mut vault = lock_vault(&state)?;
    vault
        .create_software_provider(request.passphrase)
        .map_err(|_| "KEYVAULT_SOFTWARE_PROVIDER_CREATE_REJECTED".to_string())?;
    Ok(keyvault_status_response(&vault))
}

#[tauri::command]
fn vgt_keyvault_software_provider_unlock(
    window: tauri::WebviewWindow,
    state: State<'_, AppState>,
    request: SoftwareProviderPassphraseRequest,
) -> Result<KeyVaultStatusResponse, String> {
    require_trusted_main_window(&window)?;
    let mut vault = lock_vault(&state)?;
    vault
        .unlock_software_provider(request.passphrase)
        .map_err(|_| "KEYVAULT_SOFTWARE_PROVIDER_UNLOCK_REJECTED".to_string())?;
    Ok(keyvault_status_response(&vault))
}

#[tauri::command]
fn vgt_keyvault_audit_snapshot(
    state: State<'_, AppState>,
) -> Result<KeyVaultAuditSnapshot, String> {
    let vault = lock_vault(&state)?;
    Ok(vault.audit_chain_snapshot())
}

#[tauri::command]
fn vgt_keyvault_audit_verify(
    state: State<'_, AppState>,
    snapshot: KeyVaultAuditSnapshot,
) -> Result<bool, String> {
    let vault = lock_vault(&state)?;
    Ok(vault.verify_audit_chain(&snapshot).is_ok())
}

#[tauri::command]
fn vgt_keyvault_lock(state: State<'_, AppState>) -> Result<KeyVaultStatusResponse, String> {
    {
        let mut vault = lock_vault(&state)?;
        vault.relock();
    }
    vgt_keyvault_status(state)
}

fn hex_encode_secret(bytes: &[u8; 32]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut output = String::with_capacity(64);
    for byte in bytes {
        output.push(HEX[(byte >> 4) as usize] as char);
        output.push(HEX[(byte & 0x0f) as usize] as char);
    }
    output
}

#[tauri::command]
fn vgt_keyvault_top_secret_enroll(
    policy: State<'_, PolicyRuntimeState>,
    state: State<'_, AppState>,
    request: TopSecretEnrollRequest,
) -> Result<TopSecretAccessResponse, String> {
    policy.require(
        vgt_policy::ActionBoundary::KeyPolicy,
        "key:top-secret-policy",
    )?;
    let mut vault = lock_vault(&state)?;
    Ok(
        match vault.enroll_top_secret_access(&request.user_secret, request.require_offline_factor) {
            Ok(mut result) => {
                let offline_factor_hex = result.offline_factor.as_ref().map(hex_encode_secret);
                if let Some(factor) = result.offline_factor.as_mut() {
                    factor.fill(0);
                }
                TopSecretAccessResponse {
                    success: true,
                    generation: Some(result.generation),
                    offline_factor_hex,
                    recovery_hint: Some(result.recovery_hint),
                    error: None,
                }
            }
            Err(_) => TopSecretAccessResponse {
                success: false,
                generation: None,
                offline_factor_hex: None,
                recovery_hint: None,
                error: Some("Top Secret enrollment was rejected by KeyVault policy".to_string()),
            },
        },
    )
}

#[tauri::command]
fn vgt_keyvault_top_secret_unlock(
    state: State<'_, AppState>,
    request: TopSecretUnlockRequest,
) -> Result<TopSecretAccessResponse, String> {
    let mut factor = match request.offline_factor_hex.as_deref() {
        Some(value) => Some(
            parse_offline_factor_hex(value)
                .map_err(|_| "Offline factor format rejected".to_string())?,
        ),
        None => None,
    };
    let mut vault = lock_vault(&state)?;
    let unlock_result = vault.unlock_top_secret(&request.user_secret, factor.as_ref());
    if let Some(secret) = factor.as_mut() {
        secret.fill(0);
    }
    Ok(match unlock_result {
        Ok(()) => TopSecretAccessResponse {
            success: true,
            generation: None,
            offline_factor_hex: None,
            recovery_hint: None,
            error: None,
        },
        Err(_) => TopSecretAccessResponse {
            success: false,
            generation: None,
            offline_factor_hex: None,
            recovery_hint: None,
            error: Some("Top Secret unlock failed".to_string()),
        },
    })
}

#[tauri::command]
fn vgt_keyvault_top_secret_rotate_factor(
    policy: State<'_, PolicyRuntimeState>,
    state: State<'_, AppState>,
    request: TopSecretRotateFactorRequest,
) -> Result<TopSecretAccessResponse, String> {
    policy.require(
        vgt_policy::ActionBoundary::KeyPolicy,
        "key:top-secret-policy",
    )?;
    let mut current = match request.current_offline_factor_hex.as_deref() {
        Some(value) => Some(
            parse_offline_factor_hex(value)
                .map_err(|_| "Offline factor format rejected".to_string())?,
        ),
        None => None,
    };
    let mut vault = lock_vault(&state)?;
    let rotation_result = vault.rotate_top_secret_offline_factor(
        &request.user_secret,
        current.as_ref(),
        request.require_new_factor,
    );
    if let Some(secret) = current.as_mut() {
        secret.fill(0);
    }
    Ok(match rotation_result {
        Ok(mut next) => {
            let offline_factor_hex = next.as_ref().map(hex_encode_secret);
            if let Some(secret) = next.as_mut() {
                secret.fill(0);
            }
            TopSecretAccessResponse {
                success: true, generation: None, offline_factor_hex,
                recovery_hint: Some("Any newly issued offline factor replaces the previous factor and must be stored separately.".to_string()),
                error: None,
            }
        }
        Err(_) => TopSecretAccessResponse {
            success: false,
            generation: None,
            offline_factor_hex: None,
            recovery_hint: None,
            error: Some("Top Secret factor rotation failed".to_string()),
        },
    })
}

#[tauri::command]
fn vgt_keyvault_top_secret_mark_factor_lost(
    policy: State<'_, PolicyRuntimeState>,
    state: State<'_, AppState>,
) -> Result<TopSecretAccessResponse, String> {
    policy.require(
        vgt_policy::ActionBoundary::KeyPolicy,
        "key:top-secret-policy",
    )?;
    let vault = lock_vault(&state)?;
    Ok(match vault.mark_top_secret_offline_factor_lost() {
        Ok(()) => TopSecretAccessResponse { success: true, generation: None, offline_factor_hex: None, recovery_hint: Some("Offline factor marked lost. Normal Top Secret unlock remains fail-closed until an explicit recovery path succeeds.".to_string()), error: None },
        Err(_) => TopSecretAccessResponse { success: false, generation: None, offline_factor_hex: None, recovery_hint: None, error: Some("Offline factor loss state could not be recorded".to_string()) },
    })
}

#[tauri::command]
fn vgt_keyvault_seal_secret(
    state: State<'_, AppState>,
    request: KeyVaultSealSecretRequest,
) -> Result<KeyVaultSecretResponse, String> {
    if request.secret.len() > 4096 {
        return Err("KeyVault application secret exceeds policy".to_string());
    }
    let mut vault = lock_vault(&state)?;
    Ok(
        match vault.seal_application_secret(&request.scope, request.secret.as_bytes()) {
            Ok(sealed) => KeyVaultSecretResponse {
                success: true,
                sealed: Some(KeyVaultSealedSecretPayload {
                    version: sealed.version,
                    nonce: sealed.nonce.to_vec(),
                    ciphertext: sealed.ciphertext,
                }),
                secret: None,
                error: None,
            },
            Err(_) => KeyVaultSecretResponse {
                success: false,
                sealed: None,
                secret: None,
                error: Some("Native KeyVault could not seal the application secret".to_string()),
            },
        },
    )
}

#[tauri::command]
fn vgt_keyvault_unseal_secret(
    state: State<'_, AppState>,
    request: KeyVaultUnsealSecretRequest,
) -> Result<KeyVaultSecretResponse, String> {
    if request.sealed.nonce.len() != 12 || request.sealed.ciphertext.len() > 4128 {
        return Err("KeyVault sealed application secret is invalid".to_string());
    }
    let mut nonce = [0u8; 12];
    nonce.copy_from_slice(&request.sealed.nonce);
    let sealed = SealedApplicationSecret {
        version: request.sealed.version,
        nonce,
        ciphertext: request.sealed.ciphertext,
    };
    let mut vault = lock_vault(&state)?;
    let mut plaintext = match vault.unseal_application_secret(&request.scope, &sealed) {
        Ok(value) => value,
        Err(_) => {
            return Ok(KeyVaultSecretResponse {
                success: false,
                sealed: None,
                secret: None,
                error: Some("Native KeyVault could not unseal the application secret".to_string()),
            })
        }
    };
    let secret = match String::from_utf8(plaintext.clone()) {
        Ok(value) => value,
        Err(_) => {
            plaintext.fill(0);
            return Err("KeyVault application secret is not valid UTF-8".to_string());
        }
    };
    plaintext.fill(0);
    Ok(KeyVaultSecretResponse {
        success: true,
        sealed: None,
        secret: Some(secret),
        error: None,
    })
}

#[tauri::command]
fn vgt_netgate_evaluate(
    policy: State<'_, PolicyRuntimeState>,
    state: State<'_, AppState>,
    diagnostics: State<'_, DiagnosticsReleaseState>,
    request: NetGateRequest,
) -> Result<NetGateResponse, String> {
    policy.require(
        vgt_policy::ActionBoundary::NetworkConnector,
        "network:connector",
    )?;
    if diagnostics.safe_mode_enabled() {
        return Err("NETGATE_SAFE_MODE_DENY".to_string());
    }
    let capability = match request.capability.as_str() {
        "LocalLanOnly" => NetworkCapability::LocalLanOnly,
        "WhitelistedOnly" => NetworkCapability::WhitelistedOnly,
        "FullUserApproved" => NetworkCapability::FullUserApproved,
        _ => NetworkCapability::None,
    };
    let protocol = if request.target_port == 80 {
        NetworkProtocol::Http
    } else {
        NetworkProtocol::Https
    };
    let policy_request = NetworkRequest {
        component_id: request.component_id.clone(),
        document_id: request.document_id.clone(),
        automation_id: request.automation_id.clone(),
        target_host: request.target_host.clone(),
        target_port: request.target_port,
        protocol,
        direction: NetworkDirection::Outbound,
        data_class: NetworkDataClass::Metadata,
        purpose: request.purpose.clone(),
        method: Some(request.method.to_ascii_uppercase()),
        expected_request_bytes: request.expected_request_bytes,
        expected_response_bytes: request.expected_response_bytes,
        timeout_ms: request.timeout_ms,
    };
    let mut gate = state
        .netgate
        .lock()
        .map_err(|_| "NetGate policy state unavailable".to_string())?;
    gate.set_capability(capability);
    // This command is intentionally a policy preview. It performs no DNS query and opens no
    // socket. Real connector transports must resolve and re-authorize through NetGate.
    let decision = gate
        .preview_compatibility_request(&policy_request)
        .map_err(|_| "NetGate policy preview rejected invalid input".to_string())?;
    Ok(NetGateResponse {
        verdict: format!("{:?}", decision.verdict),
        capability: format!("{:?}", capability),
        target_host: decision.canonical_host,
        target_port: request.target_port,
        purpose: request.purpose,
        component_id: request.component_id,
        document_id: request.document_id,
        automation_id: request.automation_id,
        destination_classes: decision
            .destination_classes
            .into_iter()
            .map(|class| format!("{:?}", class))
            .collect(),
        capability_id: decision.capability_id,
        preview_only: true,
        resolution_required: request.target_host.parse::<std::net::IpAddr>().is_err()
            && request.target_host != "localhost",
    })
}

#[tauri::command]
fn vgt_take_opened_file(state: State<'_, AppState>) -> Result<Option<NativeOpenedFile>, String> {
    let path = {
        let mut queue = state
            .opened_files
            .lock()
            .map_err(|_| "Desktop open-file queue is unavailable".to_string())?;
        queue.pop_front()
    };
    match path {
        Some(path) => load_native_open_file(&path).map(Some),
        None => Ok(None),
    }
}

#[tauri::command]
fn vgt_take_deep_link(state: State<'_, AppState>) -> Result<Option<String>, String> {
    let mut queue = state
        .deep_links
        .lock()
        .map_err(|_| "Desktop deep-link queue is unavailable".to_string())?;
    Ok(queue.pop_front())
}

#[tauri::command]
fn vgt_recovery_write(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    request: RecoveryWriteRequest,
) -> Result<RecoveryWriteResponse, String> {
    require_trusted_main_window(&window)?;
    let mut vault = lock_vault(&state)?;
    let recipient_public_key = match request.recipient_public_key.as_deref() {
        Some(value) => Some(
            parse_x25519_key_material(value)
                .map_err(|_| "Recipient X25519 public key is invalid".to_string())?,
        ),
        None => None,
    };
    if recipient_public_key.is_some()
        && (request
            .pin
            .as_deref()
            .is_some_and(|value| !value.trim().is_empty())
            || request
                .password
                .as_deref()
                .is_some_and(|value| !value.is_empty()))
    {
        return Err(
            "RecipientOnly recovery cannot be combined with PIN/password slots".to_string(),
        );
    }
    let options = SaveOptions {
        policy: recipient_public_key
            .as_ref()
            .map(|_| UnlockPolicy::RecipientOnly),
        pin: request.pin.as_deref(),
        portable_password: request.password.as_deref(),
        recipient_public_key: recipient_public_key.as_ref(),
    };
    if request.document.security_policy.profile == SecurityProfile::Pqc {
        return Err("PQC profile is not operational in this build".to_string());
    }
    let created_at = now_millis()?;
    let key = recovery_doc_key(&request.document.id);
    let root = recovery_root(&app)?;
    let directory = root.join(&key);
    fs::create_dir_all(&directory)
        .map_err(|_| "Recovery directory could not be created".to_string())?;
    let mut nonce_bytes = [0u8; 8];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = u64::from_be_bytes(nonce_bytes);
    let file_name = format!("{created_at}-{nonce:016x}.vrec");
    let final_path = directory.join(&file_name);

    if request.document.security_policy.profile == SecurityProfile::VgtTopSecret {
        let inner_bytes = VgtContainer::pack_document(&request.document, &mut vault, options)
            .map_err(|error| public_container_error(&error).to_string())?;
        let outer_bytes = seal_vwc_bytes_for_storage(&mut vault, &inner_bytes)?;
        if outer_bytes.len() as u64 > MAX_RECOVERY_CHAIN_BYTES {
            return Err("Recovery snapshot exceeds configured size limit".to_string());
        }
        atomic_replace_encrypted(&final_path, &outer_bytes)
            .map_err(|_| "Recovery snapshot could not be committed atomically".to_string())?;
        let display_metadata = RecoveryDisplayMetadata {
            version: 1,
            container_sha256: recovery_container_sha256(&outer_bytes),
            document_kind: format!("{:?}", request.document.kind),
            security_profile: "VGT_TOP_SECRET".to_string(),
        };
        let metadata_bytes = serde_json::to_vec(&display_metadata)
            .map_err(|_| "Recovery display metadata could not be serialized".to_string())?;
        atomic_replace_encrypted(&recovery_display_meta_path(&final_path), &metadata_bytes)
            .map_err(|_| {
                "Recovery display metadata could not be committed atomically".to_string()
            })?;
    } else {
        atomic_write_vwc_stream(&final_path, |writer| {
            VgtContainer::write_document_streaming(
                writer,
                &request.document,
                &mut vault,
                options,
                &[],
                std::collections::HashMap::new(),
            )
            .map_err(|error| public_container_error(&error).to_string())
        })
        .map_err(|_| "Recovery snapshot could not be committed atomically".to_string())?;
    }
    let committed_size = fs::metadata(&final_path)
        .map_err(|_| "Recovery snapshot metadata could not be read".to_string())?
        .len();
    if committed_size > MAX_RECOVERY_CHAIN_BYTES {
        let _ = fs::remove_file(&final_path);
        let _ = fs::remove_file(recovery_display_meta_path(&final_path));
        return Err("Recovery snapshot exceeds configured size limit".to_string());
    }
    prune_recovery_directory(&directory, 5, MAX_RECOVERY_CHAIN_BYTES);
    Ok(RecoveryWriteResponse {
        success: true,
        snapshot_id: format!("{key}/{file_name}"),
        created_at,
    })
}

#[tauri::command]
fn vgt_recovery_list(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
) -> Result<Vec<RecoverySnapshotInfo>, String> {
    require_trusted_main_window(&window)?;
    let root = recovery_root(&app)?;
    let mut output = Vec::new();
    let directories =
        fs::read_dir(&root).map_err(|_| "Recovery directory could not be read".to_string())?;
    for directory_entry in directories.filter_map(Result::ok) {
        let directory_path = directory_entry.path();
        if !directory_path.is_dir() {
            continue;
        }
        let Some(directory_name) = directory_path.file_name().and_then(|value| value.to_str())
        else {
            continue;
        };
        if directory_name.len() != 32
            || !directory_name.bytes().all(|byte| byte.is_ascii_hexdigit())
        {
            continue;
        }
        let Ok(files) = fs::read_dir(&directory_path) else {
            continue;
        };
        for file_entry in files.filter_map(Result::ok) {
            let path = file_entry.path();
            if path.extension().and_then(|value| value.to_str()) != Some("vrec") {
                continue;
            }
            let Some(stem) = path.file_stem().and_then(|value| value.to_str()) else {
                continue;
            };
            let timestamp_part = stem.split_once('-').map(|(value, _)| value).unwrap_or(stem);
            let Ok(created_at) = timestamp_part.parse::<u64>() else {
                continue;
            };
            let Ok(metadata) = file_entry.metadata() else {
                continue;
            };
            if metadata.len() > MAX_CONTAINER_BYTES.saturating_mul(2) as u64 {
                continue;
            }
            let Ok(bytes) = fs::read(&path) else {
                continue;
            };
            let sidecar = fs::read(recovery_display_meta_path(&path))
                .ok()
                .and_then(|raw| serde_json::from_slice::<RecoveryDisplayMetadata>(&raw).ok())
                .filter(|meta| {
                    meta.version == 1 && meta.container_sha256 == recovery_container_sha256(&bytes)
                });
            let sidecar_kind = sidecar
                .as_ref()
                .map(|meta| meta.document_kind.clone())
                .unwrap_or_else(|| "Protected".to_string());
            let is_top_secret = bytes.starts_with(vgt_top_secret::OUTER_MAGIC);
            let (requires_pin, requires_password, security_profile, document_kind) =
                if is_top_secret {
                    // Sidecar contains content-minimal display metadata only and is hash-bound to this exact encrypted snapshot.
                    (false, false, "VGT_TOP_SECRET".to_string(), sidecar_kind)
                } else {
                    let Ok(probe) = VgtContainer::recovery_probe(&bytes) else {
                        continue;
                    };
                    (
                        probe.protection == "DeviceAndPin",
                        probe.protection == "PortablePasswordOnly",
                        probe.security_profile,
                        probe.document_kind,
                    )
                };
            output.push(RecoverySnapshotInfo {
                snapshot_id: format!(
                    "{directory_name}/{}",
                    path.file_name()
                        .and_then(|value| value.to_str())
                        .unwrap_or_default()
                ),
                document_kind,
                created_at,
                size_bytes: metadata.len(),
                requires_pin,
                requires_password,
                security_profile,
            });
            if output.len() >= 100 {
                break;
            }
        }
        if output.len() >= 100 {
            break;
        }
    }
    output.sort_by_key(|item| std::cmp::Reverse(item.created_at));
    Ok(output)
}

#[tauri::command]
fn vgt_recovery_restore(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    request: RecoveryRestoreRequest,
) -> Result<UnpackResponse, String> {
    require_trusted_main_window(&window)?;
    let root = recovery_root(&app)?;
    let path = safe_snapshot_path(&root, &request.snapshot_id)?;
    let metadata =
        fs::metadata(&path).map_err(|_| "Recovery snapshot does not exist".to_string())?;
    if metadata.len() > MAX_CONTAINER_BYTES.saturating_mul(2) as u64 {
        return Err("Recovery snapshot exceeds configured size limit".to_string());
    }
    let stored_bytes =
        fs::read(&path).map_err(|_| "Recovery snapshot could not be read".to_string())?;
    let mut vault = lock_vault(&state)?;
    let bytes = if stored_bytes.starts_with(vgt_top_secret::OUTER_MAGIC) {
        unseal_outer_bytes_for_storage(&mut vault, &stored_bytes)?
    } else {
        stored_bytes
    };
    let container_meta = VgtContainer::read_metadata(&bytes)
        .map_err(|error| public_container_error(&error).to_string())?;
    if container_meta.unlock_policy == UnlockPolicy::DeviceAndPin && request.pin.is_none() {
        return Ok(UnpackResponse {
            success: false,
            document: None,
            error: Some("PIN required".to_string()),
            requires_pin: true,
            requires_password: false,
        });
    }
    if container_meta.unlock_policy == UnlockPolicy::PortablePasswordOnly
        && request.password.is_none()
    {
        return Ok(UnpackResponse {
            success: false,
            document: None,
            error: Some("Portable password required".to_string()),
            requires_pin: false,
            requires_password: true,
        });
    }
    let result = match container_meta.unlock_policy {
        UnlockPolicy::DeviceAndPin => VgtContainer::unpack_with_pin(
            &bytes,
            &mut vault,
            request.pin.as_deref().unwrap_or_default(),
        ),
        UnlockPolicy::PortablePasswordOnly => VgtContainer::unpack_with_password(
            &bytes,
            request.password.as_deref().unwrap_or_default(),
        ),
        UnlockPolicy::DeviceOnly => VgtContainer::unpack_with_vault(&bytes, &vault),
        UnlockPolicy::HardwareBackedOnly => VgtContainer::unpack_with_hardware(&bytes, &mut vault),
        UnlockPolicy::DeviceOrPortablePassword => match request.password.as_deref() {
            Some(password) => VgtContainer::unpack_with_password(&bytes, password),
            None => VgtContainer::unpack_with_vault(&bytes, &vault),
        },
        UnlockPolicy::RecipientOnly => match request.recipient_private_key.as_deref() {
            Some(value) => {
                let key = parse_x25519_key_material(value)
                    .map_err(|_| "Recipient X25519 private key is invalid".to_string())?;
                VgtContainer::unpack_with_recipient(&bytes, &key)
            }
            None => {
                return Ok(UnpackResponse {
                    success: false,
                    document: None,
                    error: Some("RECIPIENT_KEY_REQUIRED".to_string()),
                    requires_pin: false,
                    requires_password: false,
                })
            }
        },
    };
    Ok(match result {
        Ok(document) => UnpackResponse {
            success: true,
            document: Some(document),
            error: None,
            requires_pin: false,
            requires_password: false,
        },
        Err(error) => UnpackResponse {
            success: false,
            document: None,
            error: Some(public_container_error(&error).to_string()),
            requires_pin: false,
            requires_password: false,
        },
    })
}

#[tauri::command]
fn vgt_recovery_clear_all(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
) -> Result<u64, String> {
    require_trusted_main_window(&window)?;
    let root = recovery_root(&app)?;
    clear_recovery_root(&root)
}

#[tauri::command]
fn vgt_recovery_delete(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    request: RecoveryDeleteRequest,
) -> Result<bool, String> {
    require_trusted_main_window(&window)?;
    let root = recovery_root(&app)?;
    let path = safe_snapshot_path(&root, &request.snapshot_id)?;
    let meta_path = recovery_display_meta_path(&path);
    match fs::remove_file(path) {
        Ok(_) => {
            let _ = fs::remove_file(meta_path);
            Ok(true)
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(_) => Err("Recovery snapshot could not be deleted".to_string()),
    }
}

macro_rules! generate_invoke_handler {
  ($($edition_command:ident),* $(,)?) => {
    tauri::generate_handler![
      vgt_template_instantiate,
      vgt_theme_resolve,
      vgt_brand_kit_preview,
      vgt_theme_asset_validate,
      vgt_theme_flatten_export,
      vgt_policy_evaluate,
      vgt_policy_effective_view,
      vgt_policy_install_signed_bundle,
      vgt_automation_runtime_activate,
      vgt_automation_runtime_enqueue,
      vgt_automation_runtime_cancel,
      vgt_automation_runtime_next,
      vgt_automation_runtime_status,
      vgt_diagnostics_runtime_info,
      vgt_diagnostics_snapshot,
      vgt_diagnostics_debug_mode,
      vgt_safe_mode_status,
      vgt_safe_mode_set,
      vgt_safe_mode_validate_workspace_config,
      vgt_safe_mode_rebuild_search_index,
      vgt_safe_mode_diagnose_plugin,
      vgt_update_release_status,
      vgt_update_verify_and_stage_offline,
      vgt_update_transfer_begin,
      vgt_update_transfer_append,
      vgt_update_transfer_pause,
      vgt_update_transfer_resume,
      vgt_update_transfer_status,
      vgt_update_verify_and_stage_transfer,
      vgt_update_recovery_status,
      vgt_update_mark_install_started,
      vgt_update_mark_install_failed,
      vgt_update_clear_recovery,
      vgt_pack_container,
      vgt_unpack_container,
      vgt_formula_evaluate,
      vgt_remote_wipe,
      vgt_keyvault_status,
      vgt_keyvault_software_provider_create,
      vgt_keyvault_software_provider_unlock,
      vgt_keyvault_audit_snapshot,
      vgt_keyvault_audit_verify,
      vgt_keyvault_lock,
      vgt_keyvault_top_secret_enroll,
      vgt_keyvault_top_secret_unlock,
      vgt_keyvault_top_secret_rotate_factor,
      vgt_keyvault_top_secret_mark_factor_lost,
      vgt_top_secret_status,
      vgt_top_secret_initialize_identity,
      vgt_top_secret_pack,
      vgt_top_secret_unpack,
      vgt_top_secret_export_infinity,
      vgt_top_secret_import_infinity,
      vgt_top_secret_cancel,
      vgt_keyvault_seal_secret,
      vgt_keyvault_unseal_secret,
      vgt_plugin_secret_handle_issue,
      vgt_plugin_secret_handle_status,
      vgt_plugin_secret_handle_revoke,
      vgt_plugin_runtime_review_offline,
      vgt_plugin_runtime_diagnose_offline,
      vgt_plugin_runtime_install_offline,
      vgt_plugin_runtime_update_offline,
      vgt_plugin_runtime_execution_permit,
      vgt_plugin_runtime_grant_document_access,
      vgt_plugin_runtime_trust_signer,
      vgt_plugin_runtime_authorize_host_api,
      vgt_plugin_runtime_status,
      vgt_plugin_runtime_set_user_enabled,
      vgt_plugin_runtime_set_safe_mode,
      vgt_plugin_runtime_record_crash,
      vgt_plugin_runtime_rollback,
      vgt_netgate_evaluate,
      vgt_take_opened_file,
      vgt_take_deep_link,
      vgt_shell_open_window,
      vgt_present_monitors,
      vgt_present_open_display,
      vgt_present_close_display,
      vgt_workspace_store_write,
      vgt_workspace_store_list,
      vgt_workspace_store_read,
      vgt_workspace_store_remove,
      vgt_workspace_store_reveal,
      vgt_shell_native_capabilities,
      vgt_shell_set_native_policy,
      vgt_shell_open_dialog,
      vgt_shell_save_dialog,
      vgt_shell_clipboard_read,
      vgt_shell_clipboard_write,
      vgt_shell_notify,
      vgt_recovery_write,
      vgt_recovery_list,
      vgt_recovery_restore,
      vgt_recovery_delete,
      vgt_recovery_clear_all,
      vgt_vault_disk_space,
      vgt_ocr_languages,
      vgt_ocr_recognize,
      vgt_import_sandbox_inspect_bytes,
      vgt_import_sandbox_inspect_path,
      vgt_import_sandbox_validate_export_bytes,
      vgt_import_sandbox_atomic_export,
      vgt_pdf_linearization_status,
      vgt_pdf_linearize,
      vgt_pdf_signing_identities,
      vgt_pdf_signing_sign,
      vgt_sync_open,
      vgt_sync_record,
      vgt_sync_merge,
      vgt_sync_quarantine_future,
      vgt_sync_missing,
      vgt_sync_status,
      vgt_sync_snapshot,
      vgt_sync_bootstrap,
      vgt_sync_gc,
      vgt_sync_membership_change,
      vgt_sync_close,
      vgt_ipc_server_status,
      $($edition_command,)*
    ]
  };
}

fn main() {
    if let Some(code) = import_export_sandbox_bridge::run_worker_mode_from_args() {
        std::process::exit(code);
    }
    // Release Beta 0.1: only one instance may write the workspace store. Without this guard two
    // windows autosave the same files and a stale window can silently overwrite newer work.
    if !single_instance::acquire_single_instance() {
        std::process::exit(0);
    }
    let opened_files = collect_startup_files();
    let deep_links = collect_startup_deep_links();
    let initial_safe_mode = std::env::args().any(|argument| argument == "--safe-mode");
    let builder = tauri::Builder::<tauri::Wry>::default()
        .manage(AppState {
            vault: Mutex::new(VgtKeyVault::new()),
            netgate: Mutex::new(NetGate::new()),
            opened_files: Mutex::new(opened_files),
            deep_links: Mutex::new(deep_links),
        })
        .manage(DiagnosticsReleaseState::new(initial_safe_mode))
        .manage(AutomationRuntimeState::new())
        .manage(PolicyRuntimeState::personal_default())
        .manage(SyncBridgeState::default())
        .manage(PluginSecretHandleState::default())
        .manage(PluginRuntimeState::new(initial_safe_mode))
        .manage(ShellNativePolicyState::default())
        .manage(SaveDialogGrantState::default())
        // The canonical desktop does not start the loopback IPC server on 127.0.0.1:5042, so the ready
        // flag is honestly false. The command then answers instead of failing with "state not managed",
        // and ui/src/platform/native/ipcAuth.ts takes the native path as it should.
        .manage(IpcServerStatus::new(std::sync::Arc::new(
            std::sync::atomic::AtomicBool::new(false),
        )))
        .plugin(
            tauri::plugin::Builder::<tauri::Wry, ()>::new("astraea-navigation-lock")
                .on_navigation(|_webview, url| {
                    navigation_security::allow_workspace_navigation_url(
                        url.as_str(),
                        cfg!(debug_assertions),
                    )
                })
                .build(),
        );
    let invoke_handler: Box<tauri::ipc::InvokeHandler<tauri::Wry>> =
        Box::new(generate_invoke_handler!());
    let builder = builder.invoke_handler(move |invoke| {
        let panic_resolver = invoke.resolver.clone();
        match ipc_panic_boundary::catch_dispatch(|| {
            if let Err(error) = ipc_schema::validate_invoke(&invoke) {
                invoke.resolver.reject(error);
                true
            } else {
                invoke_handler(invoke)
            }
        }) {
            Ok(handled) => handled,
            Err(error) => {
                ipc_panic_boundary::reject_panic(panic_resolver, error);
                true
            }
        }
    });

    let app = match builder.build(tauri::generate_context!()) {
        Ok(app) => app,
        Err(error) => {
            eprintln!("Astraea Workspace desktop build failed: {error}");
            std::process::exit(1);
        }
    };

    app.run(|_app_handle, _event| {
        // Native user finding (Alpha 0.1): closing a detached Workspace/Present window could leave the
        // application unresponsive because WebView2's interactive close path (page beforeunload) was
        // waiting behind the window. Detached windows are views, not owners of the workspace; destroy
        // them directly. The main window keeps its normal graceful-close path.
        if let tauri::RunEvent::WindowEvent {
            label,
            event: tauri::WindowEvent::CloseRequested { api, .. },
            ..
        } = &_event
        {
            if label != "main" {
                api.prevent_close();
                if let Some(window) = _app_handle.get_webview_window(label) {
                    let _ = window.destroy();
                }
            }
        }
        if matches!(_event, tauri::RunEvent::ExitRequested { .. }) {
            if let Ok(root) = recovery_root(_app_handle) {
                if let Err(error) = clear_recovery_root(&root) {
                    eprintln!("Astraea recovery cleanup failed during graceful exit: {error}");
                }
            }
        }
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Opened { urls } = _event {
            let mut added = false;
            if let Ok(mut queue) = _app_handle.state::<AppState>().opened_files.lock() {
                for url in urls.iter().take(16) {
                    if let Ok(path) = url.to_file_path() {
                        if path.exists() && is_supported_open_path(&path) {
                            queue.push_back(path);
                            added = true;
                        }
                    }
                }
            }
            if added {
                let _ = _app_handle.emit("astraea://opened-file", true);
            }
        }
    });
}

#[cfg(test)]
mod native_open_extension_tests {
    use super::is_supported_open_path;
    use std::path::Path;

    #[test]
    fn native_open_accepts_each_canonical_workspace_and_external_extension() {
        for extension in [
            "docx",
            "odp",
            "ods",
            "odt",
            "pdf",
            "pptx",
            "vauto",
            "vboard",
            "vconnect",
            "vdoc",
            "vdraw",
            "vgrid",
            "vinsight",
            "vnote",
            "vpdf",
            "vpolicy",
            "vpresent",
            "vpub",
            "vtask",
            "vvault",
            "vwc",
            "xlsx",
        ] {
            let filename = format!("workspace.{extension}");
            assert!(
                is_supported_open_path(Path::new(&filename)),
                "{filename} must open"
            );
        }
    }

    #[test]
    fn native_open_rejects_unknown_and_non_container_extensions() {
        for filename in [
            "workspace.vdb",
            "workspace.vform",
            "workspace.vgcom",
            "workspace.vplan",
            "workspace.vproj",
            "workspace.vspace",
            "workspace.vautomate",
            "workspace.vconn",
            "workspace.vadmin",
            "workspace.vcf",
            "workspace.zip",
            "workspace",
        ] {
            assert!(
                !is_supported_open_path(Path::new(filename)),
                "{filename} must be rejected"
            );
        }
    }
}

// --- isolated acceptance profile, taken from the export projection during the migration audit ---
#[cfg(feature = "isolated-acceptance")]
fn canonical_acceptance_directory_path(path: &Path) -> Result<PathBuf, String> {
    let mut component_path = PathBuf::new();
    for component in path.components() {
        component_path.push(component.as_os_str());
        let metadata = fs::symlink_metadata(&component_path)
            .map_err(|_| "Isolated acceptance directory could not be inspected".to_string())?;
        if is_acceptance_link_or_reparse_point(&metadata) {
            return Err("Isolated acceptance directory contains a reparse point".to_string());
        }
    }
    let canonical = fs::canonicalize(path)
        .map_err(|_| "Isolated acceptance directory could not be resolved".to_string())?;
    if !canonical.is_dir() {
        return Err("Isolated acceptance path is not a directory".to_string());
    }
    Ok(canonical)
}

#[cfg(feature = "isolated-acceptance")]
fn canonical_acceptance_directory(name: &str) -> Result<PathBuf, String> {
    let value = std::env::var_os(name)
        .map(PathBuf::from)
        .ok_or_else(|| "Isolated acceptance directory is unavailable".to_string())?;
    canonical_acceptance_directory_path(&value)
}

#[cfg(feature = "isolated-acceptance")]
fn canonical_acceptance_directory_within(
    path: &Path,
    canonical_root: &Path,
) -> Result<PathBuf, String> {
    let canonical_path = canonical_acceptance_directory_path(path)?;
    if !canonical_path.starts_with(&canonical_root) {
        return Err("Isolated acceptance directory escaped the temporary profile".to_string());
    }
    Ok(canonical_path)
}

#[cfg(feature = "isolated-acceptance")]
fn is_acceptance_link_or_reparse_point(metadata: &fs::Metadata) -> bool {
    if metadata.file_type().is_symlink() {
        return true;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0400;
        return metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0;
    }
    #[cfg(not(windows))]
    false
}

#[cfg(feature = "isolated-acceptance")]
struct IsolatedAcceptancePathRoots {
    app_data_root: PathBuf,
    tauri_temp_dir: PathBuf,
}

#[cfg(feature = "isolated-acceptance")]
fn isolated_acceptance_path_roots(
    app: &tauri::AppHandle,
) -> Result<IsolatedAcceptancePathRoots, String> {
    if !app.config().identifier.ends_with(".acceptance.recovery") {
        return Err("Isolated recovery identity validation failed".to_string());
    }

    let expected_root = canonical_acceptance_directory("ASTRAEA_ACCEPTANCE_DATA_DIR")?;
    let expected_local = canonical_acceptance_directory("ASTRAEA_ACCEPTANCE_LOCAL_DATA_DIR")?;
    let expected_config = canonical_acceptance_directory("ASTRAEA_ACCEPTANCE_CONFIG_DIR")?;
    let expected_cache = canonical_acceptance_directory("ASTRAEA_ACCEPTANCE_CACHE_DIR")?;
    let expected_log = canonical_acceptance_directory("ASTRAEA_ACCEPTANCE_LOG_DIR")?;
    let webview_root = canonical_acceptance_directory("WEBVIEW2_USER_DATA_FOLDER")?;
    let temp_root = canonical_acceptance_directory("TEMP")?;
    let expected_directories = [
        &expected_root,
        &expected_local,
        &expected_config,
        &expected_cache,
        &expected_log,
        &webview_root,
    ];
    if expected_directories
        .iter()
        .any(|path| *path == &temp_root || !path.starts_with(&temp_root))
    {
        return Err("Isolated recovery profile escaped the temporary directory".to_string());
    }
    let tauri_temp_dir = app
        .path()
        .temp_dir()
        .map_err(|_| "Tauri temporary directory is unavailable".to_string())?;
    let resolved_temp_dir = canonical_acceptance_directory_within(&tauri_temp_dir, &temp_root)?;

    let resolved_root = fs::canonicalize(
        app.path()
            .app_data_dir()
            .map_err(|_| "Application data directory is unavailable".to_string())?,
    )
    .map_err(|_| "Application data directory could not be resolved".to_string())?;
    let resolved_local = fs::canonicalize(
        app.path()
            .app_local_data_dir()
            .map_err(|_| "Application local data directory is unavailable".to_string())?,
    )
    .map_err(|_| "Application local data directory could not be resolved".to_string())?;
    let resolved_config = fs::canonicalize(
        app.path()
            .app_config_dir()
            .map_err(|_| "Application config directory is unavailable".to_string())?,
    )
    .map_err(|_| "Application config directory could not be resolved".to_string())?;
    let resolved_cache = fs::canonicalize(
        app.path()
            .app_cache_dir()
            .map_err(|_| "Application cache directory is unavailable".to_string())?,
    )
    .map_err(|_| "Application cache directory could not be resolved".to_string())?;
    let resolved_log = fs::canonicalize(
        app.path()
            .app_log_dir()
            .map_err(|_| "Application log directory is unavailable".to_string())?,
    )
    .map_err(|_| "Application log directory could not be resolved".to_string())?;
    let keyvault_root = canonical_acceptance_directory("APPDATA")?;
    let local_env_root = canonical_acceptance_directory("LOCALAPPDATA")?;
    if resolved_root != expected_root
        || resolved_local != expected_local
        || resolved_config != expected_config
        || resolved_cache != expected_cache
        || resolved_log != expected_log
        || keyvault_root != expected_root
        || local_env_root != expected_local
        || webview_root == expected_root
        || !webview_root.starts_with(&expected_root)
    {
        return Err("Isolated recovery profile path validation failed".to_string());
    }
    Ok(IsolatedAcceptancePathRoots {
        app_data_root: resolved_root,
        tauri_temp_dir: resolved_temp_dir,
    })
}

#[cfg(feature = "isolated-acceptance")]
fn record_isolated_recovery_path(
    app_data_root: &Path,
    recovery_root: &Path,
    action: &str,
) -> Result<(), String> {
    use std::io::Write;

    let receipt_path = app_data_root.join("tauri-recovery-path-verification.log");
    match fs::symlink_metadata(&receipt_path) {
        Ok(metadata) if is_acceptance_link_or_reparse_point(&metadata) || !metadata.is_file() => {
            return Err("Isolated recovery path receipt failed integrity validation".to_string());
        }
        Ok(_) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(_) => return Err("Isolated recovery path receipt could not be inspected".to_string()),
    }

    let mut receipt = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(receipt_path)
        .map_err(|_| "Isolated recovery path receipt could not be opened".to_string())?;
    writeln!(
        receipt,
        "pid={} action={} verified_at_unix_ms={} app_data_root={} recovery_root={}",
        std::process::id(),
        action,
        now_millis()?,
        app_data_root.display(),
        recovery_root.display()
    )
    .and_then(|()| receipt.sync_all())
    .map_err(|_| "Isolated recovery path receipt could not be committed".to_string())
}

#[cfg(all(test, feature = "isolated-acceptance"))]
mod isolated_acceptance_temp_dir_tests {
    use super::canonical_acceptance_directory_within;
    use super::canonical_acceptance_directory_path;
    use std::fs;
    use std::path::PathBuf;

    struct TemporaryAcceptanceFixture(PathBuf);

    impl Drop for TemporaryAcceptanceFixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn tauri_temp_dir_must_be_inside_the_canonical_profile() {
        let fixture_root = std::env::temp_dir().join(format!(
            "vgt-isolated-acceptance-temp-dir-{}-{}",
            std::process::id(),
            uuid::Uuid::new_v4()
        ));
        fs::create_dir(&fixture_root).expect("create unique test fixture under system TEMP");
        let _fixture = TemporaryAcceptanceFixture(fixture_root.clone());

        let profile_root = fixture_root.join("profile");
        let nested_temp = profile_root.join("nested-temp");
        let sibling_prefix = fixture_root.join("profile-escape");
        fs::create_dir(&profile_root).expect("create isolated profile fixture");
        fs::create_dir(&nested_temp).expect("create nested temporary directory");
        fs::create_dir(&sibling_prefix).expect("create prefix-sharing escape fixture");
        let canonical_profile_root = canonical_acceptance_directory_path(&profile_root)
            .expect("canonicalize isolated profile fixture without reparse points");

        assert_eq!(
            canonical_acceptance_directory_within(&profile_root, &canonical_profile_root)
                .expect("the profile root itself is contained"),
            canonical_profile_root
        );
        assert_eq!(
            canonical_acceptance_directory_within(&nested_temp, &canonical_profile_root)
                .expect("a nested temp directory is contained"),
            fs::canonicalize(&nested_temp).expect("canonicalize nested temp fixture")
        );
        assert!(
            canonical_acceptance_directory_within(&sibling_prefix, &canonical_profile_root)
                .is_err(),
            "a sibling sharing the profile path prefix must be rejected"
        );
        let traversal = profile_root.join("..").join("profile-escape");
        assert!(
            canonical_acceptance_directory_within(&traversal, &canonical_profile_root).is_err(),
            "a traversal path resolving outside the profile must be rejected"
        );
        drop(_fixture);
        assert!(
            !fixture_root.exists(),
            "temporary acceptance fixture must be removed after the test"
        );
    }
}
