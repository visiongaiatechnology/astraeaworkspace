// STATUS: DIAMANT VGT SUPREME — Astraea Top Secret native bridge
use crate::security_gate_bridge::require_trusted_main_window;
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use rand::{rngs::OsRng, RngCore};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Emitter, State, WebviewWindow};
use vgt_container::{SaveOptions, VgtContainer};
use vgt_keyvault::{parse_x25519_key_material, UnlockPolicy};
use vgt_object_model::{SecurityProfile, WorkspaceDocument};
use vgt_top_secret::{
    enroll_identity_from_infinity, inspect_outer_file, NoopProgress, ProgressSink, TopSecretEngine,
    TopSecretPhase, TopSecretProgress, INFINITY_PINNED_COMMIT, INFINITY_SUITE, OUTER_SUITE,
};

use crate::{lock_vault, AppState};

const MAX_IPC_TOP_SECRET_BYTES: usize = 640 * 1024 * 1024;
static CANCELLED: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();

fn cancelled_set() -> &'static Mutex<HashSet<String>> {
    CANCELLED.get_or_init(|| Mutex::new(HashSet::new()))
}

#[derive(Debug, Serialize)]
pub struct TopSecretStatusResponse {
    pub success: bool,
    pub provider_ready: bool,
    pub identity_ready: bool,
    pub top_secret_unlocked: bool,
    pub outer_suite: &'static str,
    pub infinity_suite: &'static str,
    pub infinity_commit: &'static str,
    pub assurance: &'static str,
    pub error_code: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TopSecretPackRequest {
    pub operation_id: String,
    pub document: WorkspaceDocument,
    pub pin: Option<String>,
    pub password: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TopSecretUnpackRequest {
    pub operation_id: String,
    pub container_base64: String,
    pub pin: Option<String>,
    pub password: Option<String>,
    pub recipient_private_key: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct TopSecretPackResponse {
    pub success: bool,
    pub container_base64: Option<String>,
    pub error_code: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct TopSecretUnpackResponse {
    pub success: bool,
    pub document: Option<WorkspaceDocument>,
    pub requires_pin: bool,
    pub requires_password: bool,
    pub error_code: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TopSecretCancelRequest {
    pub operation_id: String,
}

#[derive(Debug, Serialize, Clone)]
struct TopSecretAuditEvent {
    action: &'static str,
    result: &'static str,
    diagnostic_code: Option<&'static str>,
}

fn emit_audit(
    app: &AppHandle,
    action: &'static str,
    result: &'static str,
    diagnostic_code: Option<&'static str>,
) {
    let _ = app.emit(
        "vgt://top-secret/audit",
        TopSecretAuditEvent {
            action,
            result,
            diagnostic_code,
        },
    );
}

struct TauriProgress<'a> {
    app: &'a AppHandle,
    operation_id: String,
}
impl ProgressSink for TauriProgress<'_> {
    fn report(&mut self, event: TopSecretProgress) {
        let _ = self.app.emit("vgt://top-secret/progress", event);
    }
    fn cancelled(&self) -> bool {
        cancelled_set()
            .lock()
            .map(|set| set.contains(&self.operation_id))
            .unwrap_or(false)
    }
}
impl Drop for TauriProgress<'_> {
    fn drop(&mut self) {
        if let Ok(mut set) = cancelled_set().lock() {
            set.remove(&self.operation_id);
        }
    }
}

fn provider_root() -> PathBuf {
    if let Ok(root) = std::env::var("VGT_INFINITY_PROVIDER_ROOT") {
        return PathBuf::from(root);
    }
    std::env::current_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("vendor/infinity")
}

fn engine() -> TopSecretEngine {
    TopSecretEngine::new(provider_root())
}

fn validate_operation_id(value: &str) -> bool {
    (8..=96).contains(&value.len())
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_'))
}

fn temp_file(label: &str) -> Result<PathBuf, String> {
    let root = std::env::temp_dir().join("astraea-top-secret");
    fs::create_dir_all(&root).map_err(|_| "TS_IO_FAILURE".to_string())?;
    for _ in 0..32 {
        let mut suffix_bytes = [0u8; 8];
        OsRng.fill_bytes(&mut suffix_bytes);
        let path = root.join(format!(
            "{label}-{:016x}.tmp",
            u64::from_be_bytes(suffix_bytes)
        ));
        match OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(file) => {
                file.sync_all().map_err(|_| "TS_IO_FAILURE".to_string())?;
                return Ok(path);
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(_) => return Err("TS_IO_FAILURE".to_string()),
        }
    }
    Err("TS_IO_FAILURE".to_string())
}

fn write_ciphertext_temp(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if bytes.len() > MAX_IPC_TOP_SECRET_BYTES {
        return Err("TS_SIZE_LIMIT".to_string());
    }
    let mut file = OpenOptions::new()
        .write(true)
        .truncate(true)
        .open(path)
        .map_err(|_| "TS_IO_FAILURE".to_string())?;
    file.write_all(bytes)
        .map_err(|_| "TS_IO_FAILURE".to_string())?;
    file.sync_all().map_err(|_| "TS_IO_FAILURE".to_string())
}

fn decode_b64(value: &str) -> Result<Vec<u8>, String> {
    if value.len() > MAX_IPC_TOP_SECRET_BYTES.saturating_mul(2) {
        return Err("TS_SIZE_LIMIT".to_string());
    }
    let bytes = B64
        .decode(value.as_bytes())
        .map_err(|_| "TS_ENCODING_REJECTED".to_string())?;
    if bytes.is_empty() || bytes.len() > MAX_IPC_TOP_SECRET_BYTES {
        return Err("TS_SIZE_LIMIT".to_string());
    }
    Ok(bytes)
}

fn emit_phase(
    app: &AppHandle,
    operation_id: &str,
    phase: TopSecretPhase,
    bytes: u64,
    total: Option<u64>,
    cancellable: bool,
) {
    let _ = app.emit(
        "vgt://top-secret/progress",
        TopSecretProgress {
            operation_id: operation_id.to_owned(),
            phase,
            bytes_completed: bytes,
            bytes_total: total,
            chunks_completed: 0,
            chunks_total: None,
            cancellable,
        },
    );
}

fn authenticate_inner_vwc(
    inner: &[u8],
    vault: &mut vgt_keyvault::VgtKeyVault,
    pin: Option<&str>,
    password: Option<&str>,
    recipient_private_key: Option<&str>,
) -> Result<WorkspaceDocument, String> {
    let meta =
        VgtContainer::read_metadata(inner).map_err(|_| "TS_INNER_VWC_REJECTED".to_string())?;
    let document = match meta.unlock_policy {
        UnlockPolicy::DeviceAndPin => {
            let Some(pin) = pin else {
                return Err("PIN_REQUIRED".into());
            };
            VgtContainer::unpack_with_pin(inner, vault, pin)
        }
        UnlockPolicy::PortablePasswordOnly => {
            let Some(password) = password else {
                return Err("PASSWORD_REQUIRED".into());
            };
            VgtContainer::unpack_with_password(inner, password)
        }
        UnlockPolicy::DeviceOnly | UnlockPolicy::DeviceOrPortablePassword => {
            VgtContainer::unpack_with_vault(inner, vault)
        }
        UnlockPolicy::HardwareBackedOnly => VgtContainer::unpack_with_hardware(inner, vault),
        UnlockPolicy::RecipientOnly => {
            let Some(value) = recipient_private_key else {
                return Err("RECIPIENT_KEY_REQUIRED".into());
            };
            let key = parse_x25519_key_material(value)
                .map_err(|_| "RECIPIENT_KEY_REJECTED".to_string())?;
            VgtContainer::unpack_with_recipient(inner, &key)
        }
    }
    .map_err(|_| "TS_INNER_AUTHENTICATION_FAILED".to_string())?;
    if document.security_policy.profile != SecurityProfile::VgtTopSecret
        || document.security_policy.infinity_suite.as_deref() != Some(INFINITY_SUITE)
        || document.security_policy.infinity_commit.as_deref() != Some(INFINITY_PINNED_COMMIT)
    {
        return Err("TS_INNER_PROFILE_MISMATCH".to_string());
    }
    Ok(document)
}

#[tauri::command]
pub fn vgt_top_secret_status(
    state: State<'_, AppState>,
) -> Result<TopSecretStatusResponse, String> {
    let engine = engine();
    let provider_ready = engine.validate_provider().is_ok();
    let vault = lock_vault(&state)?;
    let top_secret_unlocked = vault.is_top_secret_unlocked();
    let identity_ready = vault
        .top_secret_identity()
        .ok()
        .flatten()
        .is_some_and(|record| {
            record.bundle.suite == INFINITY_SUITE && record.bundle.components.len() == 7
        });
    Ok(TopSecretStatusResponse {
        success: true, provider_ready, identity_ready, top_secret_unlocked,
        outer_suite: OUTER_SUITE, infinity_suite: INFINITY_SUITE, infinity_commit: INFINITY_PINNED_COMMIT,
        assurance: "VGT security profile / research composition; not a governmental classification or certification",
        error_code: if provider_ready { None } else { Some("TS_PROVIDER_UNAVAILABLE".into()) },
    })
}

#[tauri::command]
pub fn vgt_top_secret_initialize_identity(
    window: WebviewWindow,
    state: State<'_, AppState>,
) -> Result<TopSecretStatusResponse, String> {
    require_trusted_main_window(&window)?;
    let engine = engine();
    let mut vault = lock_vault(&state)?;
    enroll_identity_from_infinity(&engine, &mut vault)
        .map_err(|error| error.diagnostic_code().to_string())?;
    drop(vault);
    vgt_top_secret_status(state)
}

#[tauri::command]
pub fn vgt_top_secret_cancel(
    window: WebviewWindow,
    request: TopSecretCancelRequest,
) -> Result<bool, String> {
    require_trusted_main_window(&window)?;
    if !validate_operation_id(&request.operation_id) {
        return Err("TS_OPERATION_ID_REJECTED".into());
    }
    cancelled_set()
        .lock()
        .map_err(|_| "TS_CANCEL_STATE_UNAVAILABLE".to_string())?
        .insert(request.operation_id);
    Ok(true)
}

#[tauri::command]
pub fn vgt_top_secret_pack(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    request: TopSecretPackRequest,
) -> Result<TopSecretPackResponse, String> {
    require_trusted_main_window(&window)?;
    if !validate_operation_id(&request.operation_id) {
        return Err("TS_OPERATION_ID_REJECTED".into());
    }
    if request.document.security_policy.profile != SecurityProfile::VgtTopSecret
        || request.document.security_policy.infinity_suite.as_deref() != Some(INFINITY_SUITE)
        || request.document.security_policy.infinity_commit.as_deref()
            != Some(INFINITY_PINNED_COMMIT)
    {
        return Ok(TopSecretPackResponse {
            success: false,
            container_base64: None,
            error_code: Some("TS_PROFILE_PROVENANCE_REJECTED".into()),
        });
    }

    let mut vault = lock_vault(&state)?;
    emit_phase(
        &app,
        &request.operation_id,
        TopSecretPhase::PreparingInnerVwc,
        0,
        None,
        true,
    );
    let options = SaveOptions {
        policy: None,
        pin: request.pin.as_deref(),
        portable_password: request.password.as_deref(),
        recipient_public_key: None,
    };
    let inner = match VgtContainer::pack_document(&request.document, &mut vault, options) {
        Ok(value) => value,
        Err(_) => {
            return Ok(TopSecretPackResponse {
                success: false,
                container_base64: None,
                error_code: Some("TS_INNER_VWC_REJECTED".into()),
            })
        }
    };
    if inner.len() > MAX_IPC_TOP_SECRET_BYTES {
        return Ok(TopSecretPackResponse {
            success: false,
            container_base64: None,
            error_code: Some("TS_SIZE_LIMIT".into()),
        });
    }
    let inner_path = temp_file("inner-vwc")?;
    let outer_path = temp_file("outer-target")?;
    let _ = fs::remove_file(&outer_path); // engine requires a non-existing commit target
    let result = (|| {
        write_ciphertext_temp(&inner_path, &inner)?;
        let mut progress = TauriProgress {
            app: &app,
            operation_id: request.operation_id.clone(),
        };
        engine()
            .seal_vwc_file(
                &mut vault,
                &inner_path,
                &outer_path,
                None,
                &request.operation_id,
                &mut progress,
            )
            .map_err(|error| error.diagnostic_code().to_string())?;
        let bytes = fs::read(&outer_path).map_err(|_| "TS_IO_FAILURE".to_string())?;
        if bytes.len() > MAX_IPC_TOP_SECRET_BYTES {
            return Err("TS_SIZE_LIMIT".to_string());
        }
        Ok(B64.encode(bytes))
    })();
    let _ = fs::remove_file(&inner_path);
    let _ = fs::remove_file(&outer_path);
    Ok(match result {
        Ok(encoded) => {
            emit_audit(&app, "seal", "ok", None);
            TopSecretPackResponse {
                success: true,
                container_base64: Some(encoded),
                error_code: None,
            }
        }
        Err(code) => {
            emit_audit(&app, "seal", "rejected", Some("TS_SEAL_REJECTED"));
            TopSecretPackResponse {
                success: false,
                container_base64: None,
                error_code: Some(code),
            }
        }
    })
}

#[tauri::command]
pub fn vgt_top_secret_unpack(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    request: TopSecretUnpackRequest,
) -> Result<TopSecretUnpackResponse, String> {
    require_trusted_main_window(&window)?;
    if !validate_operation_id(&request.operation_id) {
        return Err("TS_OPERATION_ID_REJECTED".into());
    }
    let outer = decode_b64(&request.container_base64)?;
    let outer_path = temp_file("outer-input")?;
    let inner_path = temp_file("inner-output")?;
    let _ = fs::remove_file(&inner_path);
    let mut vault = lock_vault(&state)?;
    let result = (|| {
        write_ciphertext_temp(&outer_path, &outer)?;
        inspect_outer_file(&outer_path).map_err(|error| error.diagnostic_code().to_string())?;
        let mut progress = TauriProgress {
            app: &app,
            operation_id: request.operation_id.clone(),
        };
        engine()
            .unseal_to_vwc_file(
                &mut vault,
                &outer_path,
                &inner_path,
                None,
                &request.operation_id,
                &mut progress,
            )
            .map_err(|error| error.diagnostic_code().to_string())?;
        let inner = fs::read(&inner_path).map_err(|_| "TS_IO_FAILURE".to_string())?;
        emit_phase(
            &app,
            &request.operation_id,
            TopSecretPhase::AuthenticateInnerVwc,
            0,
            Some(inner.len() as u64),
            false,
        );
        let document = authenticate_inner_vwc(
            &inner,
            &mut vault,
            request.pin.as_deref(),
            request.password.as_deref(),
            request.recipient_private_key.as_deref(),
        )?;
        emit_phase(
            &app,
            &request.operation_id,
            TopSecretPhase::Complete,
            inner.len() as u64,
            Some(inner.len() as u64),
            false,
        );
        Ok(document)
    })();
    let _ = fs::remove_file(&outer_path);
    let _ = fs::remove_file(&inner_path);
    Ok(match result {
        Ok(document) => {
            emit_audit(&app, "unseal", "ok", None);
            TopSecretUnpackResponse {
                success: true,
                document: Some(document),
                requires_pin: false,
                requires_password: false,
                error_code: None,
            }
        }
        Err(code) if code == "PIN_REQUIRED" => TopSecretUnpackResponse {
            success: false,
            document: None,
            requires_pin: true,
            requires_password: false,
            error_code: Some(code),
        },
        Err(code) if code == "PASSWORD_REQUIRED" => TopSecretUnpackResponse {
            success: false,
            document: None,
            requires_pin: false,
            requires_password: true,
            error_code: Some(code),
        },
        Err(_code) => {
            emit_audit(&app, "unseal", "rejected", Some("TS_AUTHENTICATION_FAILED"));
            TopSecretUnpackResponse {
                success: false,
                document: None,
                requires_pin: false,
                requires_password: false,
                error_code: Some("TS_AUTHENTICATION_FAILED".into()),
            }
        }
    })
}

#[tauri::command]
pub fn vgt_top_secret_export_infinity(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    request: TopSecretPackRequest,
) -> Result<TopSecretPackResponse, String> {
    require_trusted_main_window(&window)?;
    if !validate_operation_id(&request.operation_id) {
        return Err("TS_OPERATION_ID_REJECTED".into());
    }
    if request.document.security_policy.profile != SecurityProfile::VgtTopSecret {
        return Ok(TopSecretPackResponse {
            success: false,
            container_base64: None,
            error_code: Some("TS_PROFILE_PROVENANCE_REJECTED".into()),
        });
    }
    let mut vault = lock_vault(&state)?;
    emit_phase(
        &app,
        &request.operation_id,
        TopSecretPhase::PreparingInnerVwc,
        0,
        None,
        true,
    );
    let inner = VgtContainer::pack_document(
        &request.document,
        &mut vault,
        SaveOptions {
            policy: None,
            pin: request.pin.as_deref(),
            portable_password: request.password.as_deref(),
            recipient_public_key: None,
        },
    )
    .map_err(|_| "TS_INNER_VWC_REJECTED".to_string())?;
    let inner_path = temp_file("export-inner")?;
    let vgti_path = temp_file("export-vgti")?;
    let _ = fs::remove_file(&vgti_path);
    let result = (|| {
        write_ciphertext_temp(&inner_path, &inner)?;
        let mut progress = TauriProgress {
            app: &app,
            operation_id: request.operation_id.clone(),
        };
        engine()
            .export_vgti_file(
                &mut vault,
                &inner_path,
                &vgti_path,
                None,
                &request.operation_id,
                &mut progress,
            )
            .map_err(|error| error.diagnostic_code().to_string())?;
        let bytes = fs::read(&vgti_path).map_err(|_| "TS_IO_FAILURE".to_string())?;
        if bytes.len() > MAX_IPC_TOP_SECRET_BYTES {
            return Err("TS_SIZE_LIMIT".to_string());
        }
        Ok(B64.encode(bytes))
    })();
    let _ = fs::remove_file(inner_path);
    let _ = fs::remove_file(vgti_path);
    Ok(match result {
        Ok(encoded) => {
            emit_audit(&app, "export_vgti", "ok", None);
            TopSecretPackResponse {
                success: true,
                container_base64: Some(encoded),
                error_code: None,
            }
        }
        Err(code) => {
            emit_audit(&app, "export_vgti", "rejected", Some("TS_EXPORT_REJECTED"));
            TopSecretPackResponse {
                success: false,
                container_base64: None,
                error_code: Some(code),
            }
        }
    })
}

#[tauri::command]
pub fn vgt_top_secret_import_infinity(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    request: TopSecretUnpackRequest,
) -> Result<TopSecretUnpackResponse, String> {
    require_trusted_main_window(&window)?;
    if !validate_operation_id(&request.operation_id) {
        return Err("TS_OPERATION_ID_REJECTED".into());
    }
    let vgti = decode_b64(&request.container_base64)?;
    if vgti.len() < 8 || &vgti[..8] != b"VGTINF02" {
        return Ok(TopSecretUnpackResponse {
            success: false,
            document: None,
            requires_pin: false,
            requires_password: false,
            error_code: Some("TS_INFINITY_FORMAT_REJECTED".into()),
        });
    }
    let vgti_path = temp_file("import-vgti")?;
    let inner_path = temp_file("import-inner")?;
    let _ = fs::remove_file(&inner_path);
    let mut vault = lock_vault(&state)?;
    let result = (|| {
        write_ciphertext_temp(&vgti_path, &vgti)?;
        let mut progress = TauriProgress {
            app: &app,
            operation_id: request.operation_id.clone(),
        };
        engine()
            .import_vgti_to_vwc_file(
                &mut vault,
                &vgti_path,
                &inner_path,
                None,
                &request.operation_id,
                &mut progress,
            )
            .map_err(|error| error.diagnostic_code().to_string())?;
        let inner = fs::read(&inner_path).map_err(|_| "TS_IO_FAILURE".to_string())?;
        emit_phase(
            &app,
            &request.operation_id,
            TopSecretPhase::AuthenticateInnerVwc,
            0,
            Some(inner.len() as u64),
            false,
        );
        let document = authenticate_inner_vwc(
            &inner,
            &mut vault,
            request.pin.as_deref(),
            request.password.as_deref(),
            request.recipient_private_key.as_deref(),
        )?;
        emit_phase(
            &app,
            &request.operation_id,
            TopSecretPhase::Complete,
            inner.len() as u64,
            Some(inner.len() as u64),
            false,
        );
        Ok(document)
    })();
    let _ = fs::remove_file(vgti_path);
    let _ = fs::remove_file(inner_path);
    Ok(match result {
        Ok(document) => {
            emit_audit(&app, "import_vgti", "ok", None);
            TopSecretUnpackResponse {
                success: true,
                document: Some(document),
                requires_pin: false,
                requires_password: false,
                error_code: None,
            }
        }
        Err(code) if code == "PIN_REQUIRED" => TopSecretUnpackResponse {
            success: false,
            document: None,
            requires_pin: true,
            requires_password: false,
            error_code: Some(code),
        },
        Err(code) if code == "PASSWORD_REQUIRED" => TopSecretUnpackResponse {
            success: false,
            document: None,
            requires_pin: false,
            requires_password: true,
            error_code: Some(code),
        },
        Err(_code) => {
            emit_audit(
                &app,
                "import_vgti",
                "rejected",
                Some("TS_AUTHENTICATION_FAILED"),
            );
            TopSecretUnpackResponse {
                success: false,
                document: None,
                requires_pin: false,
                requires_password: false,
                error_code: Some("TS_AUTHENTICATION_FAILED".into()),
            }
        }
    })
}

pub(crate) fn seal_vwc_bytes_for_storage(
    vault: &mut vgt_keyvault::VgtKeyVault,
    inner: &[u8],
) -> Result<Vec<u8>, String> {
    let inner_path = temp_file("storage-inner")?;
    let outer_path = temp_file("storage-outer")?;
    let _ = fs::remove_file(&outer_path);
    let result = (|| {
        write_ciphertext_temp(&inner_path, inner)?;
        let mut progress = NoopProgress;
        engine()
            .seal_vwc_file(
                vault,
                &inner_path,
                &outer_path,
                None,
                "recovery-seal",
                &mut progress,
            )
            .map_err(|error| error.diagnostic_code().to_string())?;
        let bytes = fs::read(&outer_path).map_err(|_| "TS_IO_FAILURE".to_string())?;
        if bytes.len() > MAX_IPC_TOP_SECRET_BYTES {
            return Err("TS_SIZE_LIMIT".to_string());
        }
        Ok(bytes)
    })();
    let _ = fs::remove_file(inner_path);
    let _ = fs::remove_file(outer_path);
    result
}

pub(crate) fn unseal_outer_bytes_for_storage(
    vault: &mut vgt_keyvault::VgtKeyVault,
    outer: &[u8],
) -> Result<Vec<u8>, String> {
    let outer_path = temp_file("storage-outer-input")?;
    let inner_path = temp_file("storage-inner-output")?;
    let _ = fs::remove_file(&inner_path);
    let result = (|| {
        write_ciphertext_temp(&outer_path, outer)?;
        let mut progress = NoopProgress;
        engine()
            .unseal_to_vwc_file(
                vault,
                &outer_path,
                &inner_path,
                None,
                "recovery-open",
                &mut progress,
            )
            .map_err(|error| error.diagnostic_code().to_string())?;
        let bytes = fs::read(&inner_path).map_err(|_| "TS_IO_FAILURE".to_string())?;
        if bytes.len() > MAX_IPC_TOP_SECRET_BYTES {
            return Err("TS_SIZE_LIMIT".to_string());
        }
        Ok(bytes)
    })();
    let _ = fs::remove_file(outer_path);
    let _ = fs::remove_file(inner_path);
    result
}
