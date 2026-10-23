// STATUS: DIAMANT VGT SUPREME
use crate::converter_security::{new_uuid_token, validate_user_file_name_hint};
use crate::policy_bridge::PolicyRuntimeState;
use crate::save_dialog_security::SaveDialogGrantState;
use crate::security_gate_bridge::require_trusted_shell_window;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{State, WebviewWindow};
use vgt_policy::ActionBoundary;
use vgt_sandbox::{
    inspect_foreign_file, validate_export_file, SandboxInspectionReport, SandboxLimits,
};

const WORKER_FLAG: &str = "--vgt-import-sandbox-worker";
const MAX_IPC_BYTES: usize = 32 * 1024 * 1024;
const WORKER_TIMEOUT: Duration = Duration::from_secs(15);
const POLL: Duration = Duration::from_millis(10);

fn validate_file_name_hint(file_name: &str) -> Result<(), String> {
    validate_user_file_name_hint(file_name).map_err(|_| public_error())
}

fn validate_path_matches_hint(path: &Path, file_name: &str) -> Result<PathBuf, String> {
    validate_file_name_hint(file_name)?;
    let metadata = fs::symlink_metadata(path).map_err(|_| public_error())?;
    if !metadata.is_file() || metadata.file_type().is_symlink() {
        return Err(public_error());
    }
    let canonical = path.canonicalize().map_err(|_| public_error())?;
    let leaf = canonical
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(public_error)?;
    if !leaf.eq_ignore_ascii_case(file_name) {
        return Err(public_error());
    }
    Ok(canonical)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct InspectBytesRequest {
    pub file_name: String,
    pub bytes_base64: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct InspectPathRequest {
    pub file_name: String,
    pub path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AtomicExportRequest {
    pub file_name: String,
    pub save_token: String,
    pub bytes_base64: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct WorkerEnvelope {
    ok: bool,
    report: Option<SandboxInspectionReport>,
    error: Option<String>,
}

fn public_error() -> String {
    "Foreign file was rejected by the import/export sandbox".to_string()
}

fn random_token() -> String {
    new_uuid_token()
}

fn sandbox_temp_root() -> Result<PathBuf, String> {
    let root = std::env::temp_dir().join("astraea-import-sandbox-v2");
    fs::create_dir_all(&root)
        .map_err(|_| "Sandbox temporary directory is unavailable".to_string())?;
    Ok(root)
}

fn create_private_temp(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options
        .open(path)
        .map_err(|_| "Sandbox input staging failed".to_string())?;
    file.write_all(bytes)
        .map_err(|_| "Sandbox input staging failed".to_string())?;
    file.sync_all()
        .map_err(|_| "Sandbox input staging failed".to_string())?;
    Ok(())
}

fn inspect_via_worker(
    input: &Path,
    file_name: &str,
    purpose: &str,
) -> Result<SandboxInspectionReport, String> {
    if purpose != "import" && purpose != "export" {
        return Err(public_error());
    }
    let root = sandbox_temp_root()?;
    let output = root.join(format!("report-{}.json", random_token()));
    let executable =
        std::env::current_exe().map_err(|_| "Sandbox worker is unavailable".to_string())?;
    let mut child = Command::new(executable)
        .arg(WORKER_FLAG)
        .arg(input)
        .arg(&output)
        .arg(file_name)
        .arg(purpose)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| "Sandbox worker could not start".to_string())?;
    let deadline = Instant::now() + WORKER_TIMEOUT;
    let status = loop {
        if let Some(status) = child
            .try_wait()
            .map_err(|_| "Sandbox worker failed".to_string())?
        {
            break status;
        }
        if Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            let _ = fs::remove_file(&output);
            return Err("Sandbox worker exceeded its deadline".to_string());
        }
        thread::sleep(POLL);
    };
    let bytes = fs::read(&output).map_err(|_| public_error())?;
    let _ = fs::remove_file(&output);
    if bytes.len() > 4 * 1024 * 1024 || bytes.is_empty() {
        return Err(public_error());
    }
    let envelope: WorkerEnvelope = serde_json::from_slice(&bytes).map_err(|_| public_error())?;
    if !status.success() || !envelope.ok {
        return Err(envelope.error.unwrap_or_else(public_error));
    }
    envelope.report.ok_or_else(public_error)
}

fn inspect_staged_bytes(
    request: &InspectBytesRequest,
    purpose: &str,
) -> Result<SandboxInspectionReport, String> {
    validate_file_name_hint(&request.file_name)?;
    if request.bytes_base64.len() > (MAX_IPC_BYTES * 4 / 3 + 16) {
        return Err("Foreign artifact exceeds byte-IPC sandbox limit".to_string());
    }
    let bytes = STANDARD
        .decode(request.bytes_base64.as_bytes())
        .map_err(|_| public_error())?;
    if bytes.is_empty() || bytes.len() > MAX_IPC_BYTES {
        return Err("Foreign artifact exceeds byte-IPC sandbox limit".to_string());
    }
    let root = sandbox_temp_root()?;
    let input = root.join(format!("input-{}.foreign", random_token()));
    create_private_temp(&input, &bytes)?;
    let result = inspect_via_worker(&input, &request.file_name, purpose);
    let _ = fs::remove_file(&input);
    result
}

#[tauri::command]
pub fn vgt_import_sandbox_inspect_bytes(
    policy: State<'_, PolicyRuntimeState>,
    window: WebviewWindow,
    request: InspectBytesRequest,
) -> Result<SandboxInspectionReport, String> {
    policy.require(ActionBoundary::FileImport, "sandbox:document")?;
    require_trusted_shell_window(&window)?;
    inspect_staged_bytes(&request, "import")
}

#[tauri::command]
pub fn vgt_import_sandbox_validate_export_bytes(
    policy: State<'_, PolicyRuntimeState>,
    window: WebviewWindow,
    request: InspectBytesRequest,
) -> Result<SandboxInspectionReport, String> {
    policy.require(ActionBoundary::FileExport, "sandbox:document")?;
    require_trusted_shell_window(&window)?;
    inspect_staged_bytes(&request, "export")
}

#[tauri::command]
pub fn vgt_import_sandbox_inspect_path(
    policy: State<'_, PolicyRuntimeState>,
    window: WebviewWindow,
    request: InspectPathRequest,
) -> Result<SandboxInspectionReport, String> {
    policy.require(ActionBoundary::FileImport, "sandbox:document")?;
    require_trusted_shell_window(&window)?;
    let path = validate_path_matches_hint(Path::new(&request.path), &request.file_name)?;
    let metadata = fs::symlink_metadata(&path).map_err(|_| public_error())?;
    if !metadata.is_file()
        || metadata.file_type().is_symlink()
        || metadata.len() == 0
        || metadata.len() > SandboxLimits::default().max_input_bytes
    {
        return Err(public_error());
    }
    inspect_via_worker(&path, &request.file_name, "import")
}

#[tauri::command]
pub fn vgt_import_sandbox_atomic_export(
    policy: State<'_, PolicyRuntimeState>,
    window: WebviewWindow,
    save_grants: State<'_, SaveDialogGrantState>,
    request: AtomicExportRequest,
) -> Result<SandboxInspectionReport, String> {
    policy.require(ActionBoundary::FileExport, "sandbox:document")?;
    require_trusted_shell_window(&window)?;
    validate_file_name_hint(&request.file_name)?;
    if request.bytes_base64.len() > (MAX_IPC_BYTES * 4 / 3 + 16) {
        return Err("Export exceeds byte-IPC sandbox limit".to_string());
    }
    let bytes = STANDARD
        .decode(request.bytes_base64.as_bytes())
        .map_err(|_| public_error())?;
    if bytes.is_empty() || bytes.len() > MAX_IPC_BYTES {
        return Err("Export exceeds byte-IPC sandbox limit".to_string());
    }
    let destination = save_grants.consume(&request.save_token, &request.file_name)?;
    if destination.exists() {
        return Err("Atomic export refuses to replace an existing file".to_string());
    }
    let parent = destination
        .parent()
        .ok_or_else(|| "Export destination has no parent directory".to_string())?;
    if !parent.is_dir() {
        return Err("Export destination directory is unavailable".to_string());
    }
    let temporary = parent.join(format!(".astraea-export-{}.tmp", random_token()));
    create_private_temp(&temporary, &bytes)?;
    let report = match inspect_via_worker(&temporary, &request.file_name, "export") {
        Ok(report) => report,
        Err(error) => {
            let _ = fs::remove_file(&temporary);
            return Err(error);
        }
    };
    if fs::rename(&temporary, &destination).is_err() {
        let _ = fs::remove_file(&temporary);
        return Err("Atomic export commit failed".to_string());
    }
    #[cfg(unix)]
    if let Ok(dir) = fs::File::open(parent) {
        let _ = dir.sync_all();
    }
    Ok(report)
}

pub fn run_worker_mode_from_args() -> Option<i32> {
    let args = std::env::args_os().collect::<Vec<_>>();
    let index = args.iter().position(|arg| arg == WORKER_FLAG)?;
    let input = args.get(index + 1).map(PathBuf::from);
    let output = args.get(index + 2).map(PathBuf::from);
    let hint = args
        .get(index + 3)
        .map(|value| value.to_string_lossy().into_owned());
    let purpose = args
        .get(index + 4)
        .map(|value| value.to_string_lossy().into_owned());
    let (Some(input), Some(output), Some(hint), Some(purpose)) = (input, output, hint, purpose)
    else {
        return Some(2);
    };
    let result = match purpose.as_str() {
        "import" => inspect_foreign_file(&input, &hint, SandboxLimits::default()),
        "export" => validate_export_file(&input, &hint, SandboxLimits::default()),
        _ => return Some(2),
    };
    let envelope = match result {
        Ok(report) => WorkerEnvelope {
            ok: true,
            report: Some(report),
            error: None,
        },
        Err(_) => WorkerEnvelope {
            ok: false,
            report: None,
            error: Some(public_error()),
        },
    };
    let encoded = match serde_json::to_vec(&envelope) {
        Ok(value) => value,
        Err(_) => return Some(2),
    };
    if encoded.len() > 4 * 1024 * 1024 {
        return Some(2);
    }
    if create_private_temp(&output, &encoded).is_err() {
        return Some(2);
    }
    Some(if envelope.ok { 0 } else { 2 })
}

#[cfg(test)]
mod tests {
    use super::{AtomicExportRequest, InspectBytesRequest, InspectPathRequest};
    use serde_json::json;

    #[test]
    fn ipc_requests_accept_frontend_camel_case_and_reject_unknown_fields() {
        assert!(serde_json::from_value::<InspectBytesRequest>(json!({
            "fileName": "probe.xlsx",
            "bytesBase64": "UEsDBA=="
        }))
        .is_ok());
        assert!(serde_json::from_value::<InspectPathRequest>(json!({
            "fileName": "probe.xlsx",
            "path": "C:/isolated/probe.xlsx"
        }))
        .is_ok());
        assert!(serde_json::from_value::<AtomicExportRequest>(json!({
            "fileName": "probe.xlsx",
            "saveToken": "test-token",
            "bytesBase64": "UEsDBA=="
        }))
        .is_ok());
        assert!(serde_json::from_value::<InspectBytesRequest>(json!({
            "fileName": "probe.xlsx",
            "bytesBase64": "UEsDBA==",
            "extra": true
        }))
        .is_err());
    }
}
