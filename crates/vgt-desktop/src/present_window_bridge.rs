// STATUS: PLATIN — bounded native Present multi-monitor display bridge (Runde 42).
//
// The user asked for a real presentation system: pick the projector/audience monitor and the
// presenter monitor at start, or fall back to a single-screen presentation. This bridge only
// exposes exactly that: enumerate monitors, open one borderless fullscreen display window per
// role on the chosen monitor, close it again. No arbitrary URLs, geometry, file access or shell
// execution is reachable through it; every command is gated to the trusted shell window and the
// monitor index is validated against the fresh monitor list on the Rust side.
use crate::security_gate_bridge::require_trusted_shell_window;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

const MAX_PRESENT_MONITORS: usize = 16;
const MAX_SESSION_ID_LEN: usize = 64;

#[derive(Serialize)]
pub struct PresentMonitorInfo {
    index: usize,
    name: String,
    width: u32,
    height: u32,
    x: i32,
    y: i32,
    scale_factor: f64,
    primary: bool,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PresentOpenDisplayRequest {
    role: String,
    monitor_index: usize,
    session: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PresentCloseDisplayRequest {
    role: String,
}

fn display_role(value: &str) -> Result<&'static str, String> {
    match value {
        "audience" => Ok("audience"),
        "presenter" => Ok("presenter"),
        _ => Err("Present display role is invalid".to_string()),
    }
}

fn validate_session(value: &str) -> Result<(), String> {
    if value.is_empty()
        || value.len() > MAX_SESSION_ID_LEN
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    {
        return Err("Present session identifier is invalid".to_string());
    }
    Ok(())
}

fn validate_monitor_index(index: usize, available: usize) -> Result<(), String> {
    if available == 0 || index >= available || index >= MAX_PRESENT_MONITORS {
        return Err("Present display monitor is unavailable".to_string());
    }
    Ok(())
}

fn display_label(role: &str) -> String {
    format!("present-{role}")
}

#[tauri::command]
pub fn vgt_present_monitors(
    window: WebviewWindow,
    app: AppHandle,
) -> Result<Vec<PresentMonitorInfo>, String> {
    require_trusted_shell_window(&window)?;
    let monitors = app
        .available_monitors()
        .map_err(|_| "Present display enumeration is unavailable".to_string())?;
    let primary = app
        .primary_monitor()
        .map_err(|_| "Present display enumeration is unavailable".to_string())?;
    let mut result = Vec::new();
    for (index, monitor) in monitors.into_iter().take(MAX_PRESENT_MONITORS).enumerate() {
        let primary_match = primary
            .as_ref()
            .map(|primary| {
                primary.name() == monitor.name()
                    && primary.position() == monitor.position()
                    && primary.size() == monitor.size()
            })
            .unwrap_or(false);
        result.push(PresentMonitorInfo {
            index,
            name: monitor
                .name()
                .cloned()
                .unwrap_or_else(|| format!("Display {}", index + 1)),
            width: monitor.size().width,
            height: monitor.size().height,
            x: monitor.position().x,
            y: monitor.position().y,
            scale_factor: monitor.scale_factor(),
            primary: primary_match,
        });
    }
    Ok(result)
}

#[tauri::command]
pub async fn vgt_present_open_display(
    window: WebviewWindow,
    app: AppHandle,
    request: PresentOpenDisplayRequest,
) -> Result<String, String> {
    require_trusted_shell_window(&window)?;
    let role = display_role(&request.role)?;
    validate_session(&request.session)?;
    let monitors = app
        .available_monitors()
        .map_err(|_| "Present display enumeration is unavailable".to_string())?;
    validate_monitor_index(request.monitor_index, monitors.len())?;
    let monitor = monitors
        .get(request.monitor_index)
        .ok_or_else(|| "Present display monitor is unavailable".to_string())?;
    let label = display_label(role);
    if app.get_webview_window(&label).is_some() {
        return Err("Der Present-Bildschirm ist bereits geöffnet".to_string());
    }
    let scale = monitor.scale_factor();
    let size = monitor.size().to_logical::<f64>(scale);
    let position = monitor.position().to_logical::<f64>(scale);
    let title = if role == "audience" {
        "Astraea Present · Audience"
    } else {
        "Astraea Present · Presenter"
    };
    let query = format!(
        "present_display={role}&session={session}",
        session = request.session
    );
    let url = WebviewUrl::App(format!("index.html?{query}").into());
    // Async command: do NOT run here on the IPC/main thread. Webview creation must be dispatched
    // to the event loop; a synchronous command would block the loop while waiting for the window
    // to be built, which froze the whole application (white, non-closable Present windows).
    let built = WebviewWindowBuilder::new(&app, &label, url)
        .title(title)
        .decorations(false)
        .resizable(false)
        .skip_taskbar(true)
        .inner_size(size.width, size.height)
        .position(position.x, position.y)
        .fullscreen(true)
        .on_navigation(|url| {
            crate::navigation_security::allow_workspace_navigation_url(
                url.as_str(),
                cfg!(debug_assertions),
            )
        })
        .build()
        .map_err(|_| "Present display window could not be created".to_string())?;
    let _ = built.set_focus();
    Ok(label)
}

#[tauri::command]
pub async fn vgt_present_close_display(
    window: WebviewWindow,
    app: AppHandle,
    request: PresentCloseDisplayRequest,
) -> Result<bool, String> {
    require_trusted_shell_window(&window)?;
    let role = display_role(&request.role)?;
    let label = display_label(role);
    if let Some(display) = app.get_webview_window(&label) {
        // Destroy instead of close: display windows have no unsaved document and must never block
        // the app on a WebView2 beforeunload prompt when a show ends.
        display
            .destroy()
            .map_err(|_| "Present display window could not be closed".to_string())?;
    }
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn present_role_accepts_only_audience_and_presenter() {
        assert_eq!(display_role("audience"), Ok("audience"));
        assert_eq!(display_role("presenter"), Ok("presenter"));
        assert!(display_role("editor").is_err());
        assert!(display_role("../audience").is_err());
        assert!(display_role("").is_err());
    }

    #[test]
    fn present_session_rejects_injection_shaped_values() {
        assert!(validate_session("session-42_A").is_ok());
        for value in ["", "with space", "with/slash", "with&query=1", "x".repeat(65).as_str()] {
            assert!(validate_session(value).is_err(), "{value}");
        }
    }

    #[test]
    fn present_monitor_index_is_bounded_by_the_live_list() {
        assert!(validate_monitor_index(0, 2).is_ok());
        assert!(validate_monitor_index(1, 2).is_ok());
        assert!(validate_monitor_index(2, 2).is_err());
        assert!(validate_monitor_index(0, 0).is_err());
        assert!(validate_monitor_index(MAX_PRESENT_MONITORS + 5, MAX_PRESENT_MONITORS + 6).is_err());
    }

    #[test]
    fn present_display_labels_are_fixed_per_role() {
        assert_eq!(display_label("audience"), "present-audience");
        assert_eq!(display_label("presenter"), "present-presenter");
    }
}
