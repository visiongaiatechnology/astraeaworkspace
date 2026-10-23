// STATUS: DIAMANT VGT SUPREME — bounded native Workspace multi-window bridge.
use crate::ipc_contract_types::{ShellOpenWindowRequest, ShellWindowState};
use crate::security_gate_bridge::require_trusted_shell_window;
use std::sync::atomic::{AtomicU64, Ordering};
use tauri::{AppHandle, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

static WINDOW_COUNTER: AtomicU64 = AtomicU64::new(1);

fn validate_document_id(value: Option<String>) -> Result<Option<String>, String> {
    match value {
        None => Ok(None),
        Some(id) => {
            if id.is_empty()
                || id.len() > 128
                || !id.bytes().all(|byte| {
                    byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b':' | b'-')
                })
            {
                return Err(
                    "Document ID cannot be used for a detached Workspace window".to_string()
                );
            }
            Ok(Some(id))
        }
    }
}

fn bounded_window_state(state: Option<ShellWindowState>) -> ShellWindowState {
    let state = state.unwrap_or(ShellWindowState {
        x: 80,
        y: 80,
        width: 1280,
        height: 820,
        maximized: false,
    });
    ShellWindowState {
        x: state.x.clamp(-32_768, 32_768),
        y: state.y.clamp(-32_768, 32_768),
        width: state.width.clamp(960, 16_384),
        height: state.height.clamp(640, 16_384),
        maximized: state.maximized,
    }
}

#[tauri::command]
pub async fn vgt_shell_open_window(
    window: WebviewWindow,
    app: AppHandle,
    request: ShellOpenWindowRequest,
) -> Result<String, String> {
    require_trusted_shell_window(&window)?;
    let document_id = validate_document_id(request.document_id)?;
    let state = bounded_window_state(request.window_state);
    let counter = WINDOW_COUNTER.fetch_add(1, Ordering::Relaxed);
    let label = format!("workspace-{counter}");
    let mut query = format!(
        "start={}",
        if request.start_center {
            "true"
        } else {
            "false"
        }
    );
    if let Some(document_id) = document_id {
        query.push_str("&doc=");
        query.push_str(&document_id);
    }
    let url = WebviewUrl::App(format!("index.html?{query}").into());
    // Async command: never block the IPC/main thread while the new webview is being constructed.
    // A synchronous command here deadlocked the event loop and left the second window white and
    // unclosable (native user finding, Alpha 0.1 blocker round).
    let built = WebviewWindowBuilder::new(&app, &label, url)
        .title("Astraea Workspace")
        .inner_size(state.width as f64, state.height as f64)
        .position(state.x as f64, state.y as f64)
        .min_inner_size(960.0, 640.0)
        .resizable(true)
        .on_navigation(|url| {
            crate::navigation_security::allow_workspace_navigation_url(
                url.as_str(),
                cfg!(debug_assertions),
            )
        })
        .build()
        .map_err(|_| "Workspace window could not be created".to_string())?;
    if state.maximized {
        let _ = built.maximize();
    }
    Ok(label)
}
