// STATUS: DIAMANT VGT SUPREME — Tauri IPC caller-scope and payload firewall.
use tauri::ipc::{Invoke, InvokeBody};
use tauri::Runtime;

use crate::ipc_schema_core::validate_json_payload;

fn trusted_webview<R: Runtime>(invoke: &Invoke<R>) -> bool {
    let webview = invoke.message.webview_ref();
    let label = webview.label();
    let label_ok = label == "main"
        || label.strip_prefix("workspace-").is_some_and(|suffix| {
            !suffix.is_empty()
                && suffix.len() <= 20
                && suffix.bytes().all(|byte| byte.is_ascii_digit())
        });
    if !label_ok {
        return false;
    }
    let Ok(url) = webview.url() else {
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

pub fn validate_invoke<R: Runtime>(invoke: &Invoke<R>) -> Result<(), &'static str> {
    if !trusted_webview(invoke) {
        return Err("IPC_CALLER_SCOPE_REJECTED");
    }
    match invoke.message.payload() {
        InvokeBody::Json(payload) => validate_json_payload(invoke.message.command(), payload),
        InvokeBody::Raw(_) => Err("IPC_RAW_PAYLOAD_REJECTED"),
    }
}
