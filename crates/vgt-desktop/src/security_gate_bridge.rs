// STATUS: DIAMANT VGT SUPREME
//! Native IPC caller-scope guard for security-sensitive Tauri commands.

use tauri::WebviewWindow;

const OPAQUE_REJECT: &str = "Workspace security policy rejected the native request";

fn trusted_local_url(window: &WebviewWindow) -> bool {
    let Ok(url) = window.url() else {
        return false;
    };
    match url.scheme() {
        "tauri" => true,
        "http" | "https" => {
            let host = url.host_str().unwrap_or_default().to_ascii_lowercase();
            host == "tauri.localhost"
                || (cfg!(debug_assertions)
                    && matches!(host.as_str(), "localhost" | "127.0.0.1" | "::1"))
        }
        _ => false,
    }
}

pub(crate) fn require_trusted_main_window(window: &WebviewWindow) -> Result<(), String> {
    if window.label() != "main" || !trusted_local_url(window) {
        return Err(OPAQUE_REJECT.to_string());
    }
    Ok(())
}

pub(crate) fn require_trusted_shell_window(window: &WebviewWindow) -> Result<(), String> {
    if !trusted_local_url(window) {
        return Err(OPAQUE_REJECT.to_string());
    }
    let label = window.label();
    if label == "main" {
        return Ok(());
    }
    let Some(suffix) = label.strip_prefix("workspace-") else {
        return Err(OPAQUE_REJECT.to_string());
    };
    if suffix.is_empty() || suffix.len() > 20 || !suffix.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err(OPAQUE_REJECT.to_string());
    }
    Ok(())
}
