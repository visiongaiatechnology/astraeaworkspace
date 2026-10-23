// STATUS: DIAMANT VGT SUPREME — capability-gated native shell services without shell-string interpolation.
use crate::policy_bridge::PolicyRuntimeState;
use crate::save_dialog_security::SaveDialogGrantState;
use crate::security_gate_bridge::require_trusted_shell_window;
use crate::{load_native_open_file, NativeOpenedFile};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::Mutex;
use tauri::{AppHandle, State, WebviewWindow};
use vgt_policy::ActionBoundary;

const ALLOWED_CAPABILITIES: &[&str] = &[
    "dialog.open",
    "dialog.save",
    "clipboard.read",
    "clipboard.write",
    "notification.show",
];
const MAX_CLIPBOARD_BYTES: usize = 1024 * 1024;
const MAX_NOTIFICATION_TEXT: usize = 512;

#[derive(Default)]
pub struct ShellNativePolicyState {
    allowed: Mutex<HashSet<String>>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ShellNativePolicyRequest {
    allowed: Vec<String>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ShellClipboardWriteRequest {
    text: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ShellNotificationRequest {
    title: String,
    body: String,
}

/**
 * Round 41 (native user finding): the save dialog opened without a suggested file name and
 * without a file-type filter, so exports were written without an extension ("no file type").
 * The UI now sends the artifact name plus its validated extension whitelist; this request is
 * the only place that data enters the privileged dialog path.
 */
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ShellSaveDialogRequest {
    // The UI sends camelCase (`suggestedName`). Without this rename the native command rejected
    // every export request during deserialization before the dialog was ever opened — the user
    // saw only "no target was chosen" for DOCX/XLSX/PPTX/PDF/VWC. The snake_case alias keeps old
    // test payloads and scripted callers compatible during the transition.
    #[serde(default, alias = "suggested_name")]
    suggested_name: Option<String>,
    #[serde(default)]
    extensions: Vec<String>,
}

const MAX_SAVE_EXTENSIONS: usize = 8;
const MAX_SAVE_EXTENSION_LEN: usize = 12;

/** Validated chooser input: never contains path separators, control characters or shell syntax. */
#[derive(Default, Clone)]
struct ChooserOptions {
    file_name: Option<String>,
    extensions: Vec<String>,
}

fn validate_extension(value: &str) -> Result<String, String> {
    let trimmed = value.trim().trim_start_matches('.').to_lowercase();
    if trimmed.is_empty() || trimmed.len() > MAX_SAVE_EXTENSION_LEN || !trimmed.chars().all(|c| c.is_ascii_alphanumeric()) {
        return Err("Native save file type is invalid".to_string());
    }
    Ok(trimmed)
}

fn validate_save_dialog_request(request: &ShellSaveDialogRequest) -> Result<ChooserOptions, String> {
    let file_name = match request.suggested_name.as_deref() {
        None => None,
        Some(raw) => {
            let trimmed = raw.trim();
            if trimmed.is_empty()
                || trimmed.len() > 255
                || trimmed == "."
                || trimmed == ".."
                || trimmed.starts_with('-')
                || trimmed.contains(['/', '\\'])
                || trimmed.chars().any(char::is_control)
            {
                return Err("Native save file name is invalid".to_string());
            }
            Some(trimmed.to_string())
        }
    };
    if request.extensions.len() > MAX_SAVE_EXTENSIONS {
        return Err("Native save file type list is too long".to_string());
    }
    let mut extensions = Vec::new();
    for value in &request.extensions {
        let normalized = validate_extension(value)?;
        if !extensions.contains(&normalized) {
            extensions.push(normalized);
        }
    }
    Ok(ChooserOptions { file_name, extensions })
}

/** Windows PowerShell helpers must never open a console window in the packaged application. */
#[cfg(target_os = "windows")]
fn hidden_powershell() -> Command {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let mut command = Command::new("powershell.exe");
    command.creation_flags(CREATE_NO_WINDOW);
    command
}

/** Builds the WinForms filter string from already validated alphanumeric extensions. */
fn save_dialog_filter(extensions: &[String]) -> Option<String> {
    let first = extensions.first()?;
    let mut filter = format!("Document (*.{first})|*.{first}");
    for extension in extensions.iter().skip(1) {
        filter.push_str(&format!("|Document (*.{extension})|*.{extension}"));
    }
    filter.push_str("|All files (*.*)|*.*");
    Some(filter)
}
#[derive(Serialize)]
pub struct NativeSaveDialogGrant {
    token: String,
    file_name: String,
}

#[derive(Serialize)]
pub struct ShellNativeCapabilities {
    platform: String,
    process_bound_ipc: bool,
    policy_gated: bool,
}

fn require_capability(
    state: &State<'_, ShellNativePolicyState>,
    capability: &str,
) -> Result<(), String> {
    let allowed = state
        .allowed
        .lock()
        .map_err(|_| "Native shell policy is unavailable".to_string())?;
    if !allowed.contains(capability) {
        return Err("Native shell capability denied".to_string());
    }
    Ok(())
}

fn command_stdout(mut command: Command) -> Result<String, String> {
    let output = command
        .output()
        .map_err(|_| "Native desktop service is unavailable".to_string())?;
    if !output.status.success() {
        return Err("Native desktop service rejected the request".to_string());
    }
    String::from_utf8(output.stdout)
        .map(|value| value.trim().to_string())
        .map_err(|_| "Native desktop service returned invalid text".to_string())
}

#[cfg(target_os = "linux")]
fn choose_file(save: bool, _options: &ChooserOptions) -> Result<PathBuf, String> {
    let mut zenity = Command::new("zenity");
    zenity.arg("--file-selection");
    if save {
        zenity.arg("--save").arg("--confirm-overwrite");
    }
    if let Ok(value) = command_stdout(zenity) {
        if !value.is_empty() {
            return Ok(PathBuf::from(value));
        }
    }
    let mut kdialog = Command::new("kdialog");
    kdialog.arg(if save {
        "--getsavefilename"
    } else {
        "--getopenfilename"
    });
    command_stdout(kdialog).map(PathBuf::from)
}

#[cfg(target_os = "macos")]
fn choose_file(save: bool, _options: &ChooserOptions) -> Result<PathBuf, String> {
    let script = if save {
        "POSIX path of (choose file name with prompt \"Save Astraea Workspace file\")"
    } else {
        "POSIX path of (choose file with prompt \"Open Astraea Workspace file\")"
    };
    let mut command = Command::new("/usr/bin/osascript");
    command.arg("-e").arg(script);
    command_stdout(command).map(PathBuf::from)
}

/**
 * Native Win32 Common Item Dialog (comdlg32) on the UI thread with the real Astraea window as owner.
 *
 * Alpha 0.1 blocker: the previous implementation started a *hidden* PowerShell + WinForms dialog.
 * The dialog existed but was not activated/visible above the app window, so exports looked like
 * "no target was chosen" even though the dialog was technically open. The native common dialog is
 * owned by the application HWND, is modal to it and receives focus; it also removes the external
 * PowerShell dependency from every export path.
 */
#[cfg(target_os = "windows")]
fn choose_file_windows(
    save: bool,
    options: &ChooserOptions,
    owner: *mut core::ffi::c_void,
) -> Result<Option<PathBuf>, String> {
    use windows_sys::Win32::UI::Controls::Dialogs::{
        CommDlgExtendedError, GetOpenFileNameW, GetSaveFileNameW, OPENFILENAMEW, OFN_EXPLORER,
        OFN_FILEMUSTEXIST, OFN_NOCHANGEDIR, OFN_OVERWRITEPROMPT, OFN_PATHMUSTEXIST,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{BringWindowToTop, SetForegroundWindow};

    fn wide(value: &str) -> Vec<u16> {
        value.encode_utf16().chain(std::iter::once(0)).collect()
    }

    let mut file_buffer = vec![0u16; 32_768];
    if let Some(name) = options.file_name.as_deref() {
        for (index, unit) in name.encode_utf16().take(file_buffer.len() - 1).enumerate() {
            file_buffer[index] = unit;
        }
    }

    let mut filter: Vec<u16> = Vec::new();
    if options.extensions.is_empty() {
        filter.extend(wide("Alle Dateien (*.*)"));
        filter.extend(wide("*.*"));
    } else {
        for extension in &options.extensions {
            filter.extend(wide(&format!("{extension}-Dateien (*.{extension})")));
            filter.extend(wide(&format!("*.{extension}")));
        }
        filter.extend(wide("Alle Dateien (*.*)"));
        filter.extend(wide("*.*"));
    }
    filter.push(0);

    let default_extension = options
        .extensions
        .first()
        .map(|value| wide(value))
        .unwrap_or_default();
    let title = wide(if save {
        "Astraea Workspace – Speichern unter"
    } else {
        "Astraea Workspace – Datei öffnen"
    });

    // The dialog is owned by the Workspace window, but bring that window forward first so the
    // modal dialog is visible and focused instead of appearing behind the app/browser.
    if !owner.is_null() {
        unsafe {
            SetForegroundWindow(owner);
            BringWindowToTop(owner);
        }
    }
    let mut ofn: OPENFILENAMEW = unsafe { std::mem::zeroed() };
    ofn.lStructSize = std::mem::size_of::<OPENFILENAMEW>() as u32;
    ofn.hwndOwner = owner;
    ofn.lpstrFilter = filter.as_ptr();
    ofn.nFilterIndex = 1;
    ofn.lpstrFile = file_buffer.as_mut_ptr();
    ofn.nMaxFile = file_buffer.len() as u32;
    ofn.lpstrTitle = title.as_ptr();
    if !default_extension.is_empty() {
        ofn.lpstrDefExt = default_extension.as_ptr();
    }
    ofn.Flags = OFN_EXPLORER | OFN_NOCHANGEDIR | OFN_PATHMUSTEXIST;
    if save {
        ofn.Flags |= OFN_OVERWRITEPROMPT;
    } else {
        ofn.Flags |= OFN_FILEMUSTEXIST;
    }

    let accepted = unsafe {
        if save {
            GetSaveFileNameW(&mut ofn)
        } else {
            GetOpenFileNameW(&mut ofn)
        }
    };
    if accepted == 0 {
        let error = unsafe { CommDlgExtendedError() };
        if error == 0 {
            return Ok(None); // user cancelled
        }
        return Err(format!("Native file dialog failed ({error})"));
    }
    let length = file_buffer
        .iter()
        .position(|unit| *unit == 0)
        .unwrap_or(file_buffer.len());
    if length == 0 {
        return Err("Native file dialog returned no path".to_string());
    }
    let mut path = PathBuf::new();
    path.push(String::from_utf16_lossy(&file_buffer[..length]));
    Ok(Some(path))
}

#[cfg(target_os = "linux")]
fn clipboard_read() -> Result<String, String> {
    let mut wl = Command::new("wl-paste");
    wl.args(["--no-newline", "--type", "text"]);
    command_stdout(wl).or_else(|_| {
        let mut xclip = Command::new("xclip");
        xclip.args(["-selection", "clipboard", "-o"]);
        command_stdout(xclip)
    })
}
#[cfg(target_os = "macos")]
fn clipboard_read() -> Result<String, String> {
    command_stdout(Command::new("/usr/bin/pbpaste"))
}
#[cfg(target_os = "windows")]
fn clipboard_read() -> Result<String, String> {
    let mut c = hidden_powershell();
    c.args([
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "Get-Clipboard -Raw",
    ]);
    command_stdout(c)
}

fn write_child_stdin(mut command: Command, text: &str) -> Result<(), String> {
    command
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    let mut child = command
        .spawn()
        .map_err(|_| "Native clipboard service is unavailable".to_string())?;
    child
        .stdin
        .as_mut()
        .ok_or_else(|| "Native clipboard input is unavailable".to_string())?
        .write_all(text.as_bytes())
        .map_err(|_| "Native clipboard write failed".to_string())?;
    if child
        .wait()
        .map_err(|_| "Native clipboard service failed".to_string())?
        .success()
    {
        Ok(())
    } else {
        Err("Native clipboard service rejected the request".to_string())
    }
}
#[cfg(target_os = "linux")]
fn clipboard_write(text: &str) -> Result<(), String> {
    let c = Command::new("wl-copy");
    write_child_stdin(c, text).or_else(|_| {
        let mut c = Command::new("xclip");
        c.args(["-selection", "clipboard"]);
        write_child_stdin(c, text)
    })
}
#[cfg(target_os = "macos")]
fn clipboard_write(text: &str) -> Result<(), String> {
    write_child_stdin(Command::new("/usr/bin/pbcopy"), text)
}
#[cfg(target_os = "windows")]
fn clipboard_write(text: &str) -> Result<(), String> {
    let mut c = hidden_powershell();
    c.args([
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "$input | Out-String | Set-Clipboard",
    ]);
    write_child_stdin(c, text)
}

#[cfg(target_os = "linux")]
fn show_notification(title: &str, body: &str) -> Result<(), String> {
    let status = Command::new("notify-send")
        .arg(title)
        .arg(body)
        .status()
        .map_err(|_| "Native notification service is unavailable".to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err("Native notification service rejected the request".to_string())
    }
}
#[cfg(target_os = "macos")]
fn show_notification(title: &str, body: &str) -> Result<(), String> {
    let status = Command::new("/usr/bin/osascript")
        .args([
            "-e",
            "on run argv",
            "-e",
            "display notification (item 2 of argv) with title (item 1 of argv)",
            "-e",
            "end run",
            "--",
            title,
            body,
        ])
        .status()
        .map_err(|_| "Native notification service is unavailable".to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err("Native notification service rejected the request".to_string())
    }
}
#[cfg(target_os = "windows")]
fn show_notification(title: &str, body: &str) -> Result<(), String> {
    let script="Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; $n=New-Object System.Windows.Forms.NotifyIcon; $n.Icon=[System.Drawing.SystemIcons]::Information; $n.Visible=$true; $n.BalloonTipTitle=$args[0]; $n.BalloonTipText=$args[1]; $n.ShowBalloonTip(3000); Start-Sleep -Milliseconds 350; $n.Dispose()";
    let status = hidden_powershell()
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            script,
            title,
            body,
        ])
        .status()
        .map_err(|_| "Native notification service is unavailable".to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err("Native notification service rejected the request".to_string())
    }
}

#[tauri::command]
pub fn vgt_shell_native_capabilities(
    window: WebviewWindow,
) -> Result<ShellNativeCapabilities, String> {
    require_trusted_shell_window(&window)?;
    Ok(ShellNativeCapabilities {
        platform: std::env::consts::OS.to_string(),
        process_bound_ipc: true,
        policy_gated: true,
    })
}

#[tauri::command]
pub fn vgt_shell_set_native_policy(
    window: WebviewWindow,
    state: State<'_, ShellNativePolicyState>,
    request: ShellNativePolicyRequest,
) -> Result<bool, String> {
    require_trusted_shell_window(&window)?;
    if request.allowed.len() > ALLOWED_CAPABILITIES.len() {
        return Err("Native shell policy exceeds capability boundary".to_string());
    }
    let mut normalized = HashSet::new();
    for value in request.allowed {
        if !ALLOWED_CAPABILITIES.contains(&value.as_str()) {
            return Err("Native shell policy contains unknown capability".to_string());
        }
        normalized.insert(value);
    }
    *state
        .allowed
        .lock()
        .map_err(|_| "Native shell policy is unavailable".to_string())? = normalized;
    Ok(true)
}

#[tauri::command]
pub async fn vgt_shell_open_dialog(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, ShellNativePolicyState>,
) -> Result<NativeOpenedFile, String> {
    require_trusted_shell_window(&window)?;
    require_capability(&state, "dialog.open")?;
    let selection = choose_file_on_ui_thread(&app, &window, false, &ChooserOptions::default())
        .map_err(|_| "Native open dialog could not be opened".to_string())??;
    let path = selected_path_or_cancel(selection)?;
    load_native_open_file(&path)
}

/**
 * Dispatches the blocking native modal dialog to the application's UI thread and awaits the
 * result on the async command thread. `run_on_main_thread` is required for a focused, owned
 * Win32 common dialog; the command itself must not block the main/IPC loop.
 */
fn choose_file_on_ui_thread(
    app: &AppHandle,
    window: &WebviewWindow,
    save: bool,
    options: &ChooserOptions,
) -> Result<Result<Option<PathBuf>, String>, String> {
    #[cfg(target_os = "windows")]
    {
        // Raw HWND pointers are not Send; carry the numeric handle through the thread boundary and
        // reconstitute it on the UI thread only.
        let owner = window
            .hwnd()
            .map_err(|_| "Native dialog owner window is unavailable".to_string())?
            .0 as isize;
        let options = options.clone();
        let (sender, receiver) = std::sync::mpsc::channel();
        app.run_on_main_thread(move || {
            let owner = owner as *mut core::ffi::c_void;
            let _ = sender.send(choose_file_windows(save, &options, owner));
        })
        .map_err(|_| "Native dialog could not be scheduled on the UI thread".to_string())?;
        receiver
            .recv_timeout(std::time::Duration::from_secs(900))
            .map_err(|_| "Native dialog did not return a result".to_string())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (app, window);
        choose_file(save, options).map(Some)
    }
}

fn selected_path_or_cancel(result: Option<PathBuf>) -> Result<PathBuf, String> {
    result.ok_or_else(|| "Native file dialog was cancelled".to_string())
}

/** The extension is authoritative for the OS file association; never return an extension-less export. */
fn apply_default_extension(path: &mut PathBuf, options: &ChooserOptions) {
    if path.extension().is_none() {
        if let Some(extension) = options.extensions.first() {
            path.set_extension(extension);
        }
    }
}

#[tauri::command]
pub async fn vgt_shell_save_dialog(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, ShellNativePolicyState>,
    save_grants: State<'_, SaveDialogGrantState>,
    request: ShellSaveDialogRequest,
) -> Result<NativeSaveDialogGrant, String> {
    require_trusted_shell_window(&window)?;
    require_capability(&state, "dialog.save")?;
    // Round 41: the validated name/extension tuple configures the dialog and is enforced again
    // on the returned path before any grant is issued (never trust the dialog output alone).
    let options = validate_save_dialog_request(&request)?;
    let selection = choose_file_on_ui_thread(&app, &window, true, &options)
        .map_err(|_| "Native save dialog could not be opened".to_string())??;
    let mut path = selected_path_or_cancel(selection)?;
    apply_default_extension(&mut path, &options);
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "Native save selection is invalid".to_string())?
        .to_string();
    if file_name.is_empty() || file_name.len() > 255 || file_name.contains(['/', '\\']) {
        return Err("Native save selection is invalid".to_string());
    }
    let token = save_grants.issue(&path)?;
    Ok(NativeSaveDialogGrant { token, file_name })
}
#[tauri::command]
pub fn vgt_shell_clipboard_read(
    policy: State<'_, PolicyRuntimeState>,
    window: WebviewWindow,
    state: State<'_, ShellNativePolicyState>,
) -> Result<String, String> {
    policy.require(ActionBoundary::ClipboardRead, "clipboard:local")?;
    require_trusted_shell_window(&window)?;
    require_capability(&state, "clipboard.read")?;
    let text = clipboard_read()?;
    if text.len() > MAX_CLIPBOARD_BYTES {
        return Err("Clipboard text exceeds boundary".to_string());
    }
    Ok(text)
}
#[tauri::command]
pub fn vgt_shell_clipboard_write(
    policy: State<'_, PolicyRuntimeState>,
    window: WebviewWindow,
    state: State<'_, ShellNativePolicyState>,
    request: ShellClipboardWriteRequest,
) -> Result<bool, String> {
    policy.require(ActionBoundary::ClipboardWrite, "clipboard:local")?;
    require_trusted_shell_window(&window)?;
    require_capability(&state, "clipboard.write")?;
    if request.text.len() > MAX_CLIPBOARD_BYTES {
        return Err("Clipboard text exceeds boundary".to_string());
    }
    clipboard_write(&request.text)?;
    Ok(true)
}
#[tauri::command]
pub fn vgt_shell_notify(
    window: WebviewWindow,
    state: State<'_, ShellNativePolicyState>,
    request: ShellNotificationRequest,
) -> Result<bool, String> {
    require_trusted_shell_window(&window)?;
    require_capability(&state, "notification.show")?;
    if request.title.len() > MAX_NOTIFICATION_TEXT || request.body.len() > MAX_NOTIFICATION_TEXT {
        return Err("Notification text exceeds boundary".to_string());
    }
    show_notification(&request.title, &request.body)?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn options(name: Option<&str>, extensions: &[&str]) -> ShellSaveDialogRequest {
        ShellSaveDialogRequest {
            suggested_name: name.map(str::to_string),
            extensions: extensions.iter().map(|value| value.to_string()).collect(),
        }
    }

    #[test]
    fn sec041_save_dialog_accepts_a_plain_name_and_extension() {
        let parsed = validate_save_dialog_request(&options(Some("Report.docx"), &["docx"])).unwrap();
        assert_eq!(parsed.file_name.as_deref(), Some("Report.docx"));
        assert_eq!(parsed.extensions, vec!["docx".to_string()]);
    }

    #[test]
    fn sec041_save_dialog_rejects_path_and_control_injections() {
        for name in ["../evil.docx", "dir\\evil.docx", "-flag.docx", ".", "..", "bad\nname.docx"] {
            assert!(validate_save_dialog_request(&options(Some(name), &["docx"])).is_err(), "{name}");
        }
        assert!(validate_save_dialog_request(&options(Some(&"x".repeat(256)), &["docx"])).is_err());
    }

    #[test]
    fn sec041_save_dialog_rejects_shell_unsafe_extensions_and_dedupes() {
        for extension in ["docx|calc", "../docx", "with space", "a-b", "x".repeat(13).as_str()] {
            assert!(validate_save_dialog_request(&options(None, &[extension])).is_err(), "{extension}");
        }
        let parsed = validate_save_dialog_request(&options(None, &[".DOCX", "docx", "PDF"])).unwrap();
        assert_eq!(parsed.extensions, vec!["docx".to_string(), "pdf".to_string()]);
        let too_many: Vec<&str> = vec!["a"; MAX_SAVE_EXTENSIONS + 1];
        assert!(validate_save_dialog_request(&options(None, &too_many)).is_err());
    }

    #[test]
    fn sec041_extension_is_enforced_when_the_dialog_returned_none() {
        let opts = validate_save_dialog_request(&options(Some("Deck.pptx"), &["pptx"])).unwrap();
        let mut without_extension = PathBuf::from(r"C:\Users\Public\Deck");
        apply_default_extension(&mut without_extension, &opts);
        assert_eq!(without_extension.extension().and_then(|value| value.to_str()), Some("pptx"));
        let mut with_extension = PathBuf::from(r"C:\Users\Public\Deck.pptx");
        apply_default_extension(&mut with_extension, &opts);
        assert_eq!(with_extension, PathBuf::from(r"C:\Users\Public\Deck.pptx"));
    }

    #[test]
    fn save_dialog_request_accepts_the_ui_camel_case_payload() {
        let request: ShellSaveDialogRequest = serde_json::from_value(serde_json::json!({
            "suggestedName": "Quarterly-Report.docx",
            "extensions": ["docx"]
        }))
        .expect("UI export payload must deserialize");
        let options = validate_save_dialog_request(&request).expect("valid request");
        assert_eq!(options.file_name.as_deref(), Some("Quarterly-Report.docx"));
        assert_eq!(options.extensions, vec!["docx".to_string()]);
        // The snake_case alias keeps scripted/legacy callers compatible.
        let legacy: ShellSaveDialogRequest = serde_json::from_value(serde_json::json!({
            "suggested_name": "Legacy.pdf",
            "extensions": ["pdf"]
        }))
        .expect("legacy payload must still deserialize");
        assert_eq!(validate_save_dialog_request(&legacy).unwrap().file_name.as_deref(), Some("Legacy.pdf"));
    }

    #[test]
    fn sec041_dialog_filter_uses_validated_extensions_only() {
        assert_eq!(
            save_dialog_filter(&["docx".to_string(), "pdf".to_string()]).as_deref(),
            Some("Document (*.docx)|*.docx|Document (*.pdf)|*.pdf|All files (*.*)|*.*")
        );
        assert_eq!(save_dialog_filter(&[]), None);
    }
}