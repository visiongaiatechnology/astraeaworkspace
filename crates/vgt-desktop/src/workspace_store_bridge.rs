// STATUS: PLATIN — native, atomic workspace document file store (Release Beta 0.1).
//
// The user's release blocker #1: "a saved symbol must not merely mean that an IndexedDB action
// succeeded while the file was never written". This module is the only place where a Workspace
// document becomes a real file on disk. It writes opaque, already-encrypted VWC container bytes
// (the UI packs/encrypts them with the existing container crypto) into the application data
// directory, atomically (temp file + fsync + rename), and exposes list/read/remove/reveal.
//
// Security: gated to the trusted shell window, the document id is bounded and hashed into a
// fixed file name (never used as a path), every incoming file name must match the generated
// pattern, reads/writes are size capped, symlinks are refused and nothing outside the store
// directory is reachable. No arbitrary user path, no shell execution, no new dependency.
use crate::security_gate_bridge::require_trusted_shell_window;
use base64::Engine;
use serde::{Deserialize, Serialize};
use sha2::Digest;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, WebviewWindow};

const WORKSPACE_STORE_DIR: &str = "workspace-store";
const WORKSPACE_STORE_TRASH_DIR: &str = "trash";
const MAX_WORKSPACE_STORE_FILE_BYTES: usize = 128 * 1024 * 1024;
const MAX_WORKSPACE_STORE_LIST_ENTRIES: usize = 4_096;
const MAX_DOCUMENT_ID_LEN: usize = 256;
const STORE_FILE_EXTENSION: &str = ".vwc";

#[derive(Serialize)]
pub struct WorkspaceStoreFileInfo {
    file_name: String,
    size_bytes: u64,
    modified_at_ms: u64,
}

#[derive(Serialize)]
pub struct WorkspaceStoreListing {
    root_path: String,
    files: Vec<WorkspaceStoreFileInfo>,
}

#[derive(Serialize)]
pub struct WorkspaceStoreWriteResult {
    file_name: String,
    size_bytes: u64,
    sha256: String,
    modified_at_ms: u64,
}

#[derive(Serialize)]
pub struct WorkspaceStoreReadResult {
    file_name: String,
    bytes_base64: String,
    size_bytes: u64,
    sha256: String,
    modified_at_ms: u64,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WorkspaceStoreWriteRequest {
    document_id: String,
    bytes_base64: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WorkspaceStoreFileRequest {
    file_name: String,
}

fn workspace_store_root(app: &AppHandle) -> Result<PathBuf, String> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|_| "Application data directory is unavailable".to_string())?
        .join(WORKSPACE_STORE_DIR);
    fs::create_dir_all(&root).map_err(|_| "Workspace store directory could not be created".to_string())?;
    Ok(root)
}

fn workspace_store_trash(app: &AppHandle) -> Result<PathBuf, String> {
    let trash = workspace_store_root(app)?.join(WORKSPACE_STORE_TRASH_DIR);
    fs::create_dir_all(&trash).map_err(|_| "Workspace store trash directory could not be created".to_string())?;
    Ok(trash)
}

fn validate_document_id(document_id: &str) -> Result<(), String> {
    if document_id.is_empty()
        || document_id.len() > MAX_DOCUMENT_ID_LEN
        || !document_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b':' | b'-'))
    {
        return Err("Workspace document id is invalid".to_string());
    }
    Ok(())
}

/// File names are fixed by the store; only this generated pattern can be read or removed.
fn store_file_name(document_id: &str) -> String {
    let digest = sha2::Sha256::digest(document_id.as_bytes());
    let mut name = String::from("doc-");
    for byte in digest.iter().take(16) {
        name.push_str(&format!("{byte:02x}"));
    }
    name.push_str(STORE_FILE_EXTENSION);
    name
}

fn validate_store_file_name(file_name: &str) -> Result<(), String> {
    let bytes = file_name.as_bytes();
    let expected_len = "doc-".len() + 32 + STORE_FILE_EXTENSION.len();
    if bytes.len() != expected_len
        || !file_name.starts_with("doc-")
        || !file_name.ends_with(STORE_FILE_EXTENSION)
    {
        return Err("Workspace store file name is invalid".to_string());
    }
    let hash = &file_name["doc-".len().."doc-".len() + 32];
    if !hash.bytes().all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase()) {
        return Err("Workspace store file name is invalid".to_string());
    }
    Ok(())
}

fn store_file_path(app: &AppHandle, file_name: &str) -> Result<PathBuf, String> {
    validate_store_file_name(file_name)?;
    let root = workspace_store_root(app)?;
    let path = root.join(file_name);
    let root_canonical = root.canonicalize().map_err(|_| "Workspace store is unavailable".to_string())?;
    let parent = path.parent().ok_or_else(|| "Workspace store path is invalid".to_string())?;
    let parent_canonical = parent.canonicalize().map_err(|_| "Workspace store is unavailable".to_string())?;
    if parent_canonical != root_canonical {
        return Err("Workspace store path is invalid".to_string());
    }
    Ok(path)
}

fn modified_at_ms(modified: SystemTime) -> u64 {
    modified
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn is_regular_store_file(path: &Path) -> bool {
    match fs::symlink_metadata(path) {
        Ok(metadata) => metadata.file_type().is_file(),
        Err(_) => false,
    }
}

/// Writes bytes atomically: temp file in the store directory, fsync, rename over the target.
fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path.parent().ok_or_else(|| "Workspace store path is invalid".to_string())?;
    let temp_name = format!(
        ".tmp-{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or(0)
    );
    let temp_path = parent.join(temp_name);
    let result = (|| -> Result<(), String> {
        let mut file = fs::File::create(&temp_path)
            .map_err(|_| "Workspace document could not be created".to_string())?;
        file.write_all(bytes)
            .map_err(|_| "Workspace document could not be written".to_string())?;
        file.sync_all()
            .map_err(|_| "Workspace document could not be flushed to disk".to_string())?;
        drop(file);
        fs::rename(&temp_path, path).map_err(|_| "Workspace document could not be committed".to_string())?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temp_path);
    }
    result
}

fn sha256_hex(bytes: &[u8]) -> String {
    let digest = sha2::Sha256::digest(bytes);
    let mut output = String::with_capacity(64);
    for byte in digest.iter() {
        output.push_str(&format!("{byte:02x}"));
    }
    output
}

#[tauri::command]
pub fn vgt_workspace_store_write(
    window: WebviewWindow,
    app: AppHandle,
    request: WorkspaceStoreWriteRequest,
) -> Result<WorkspaceStoreWriteResult, String> {
    require_trusted_shell_window(&window)?;
    validate_document_id(&request.document_id)?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(request.bytes_base64.as_bytes())
        .map_err(|_| "Workspace document payload is not valid base64".to_string())?;
    if bytes.is_empty() || bytes.len() > MAX_WORKSPACE_STORE_FILE_BYTES {
        return Err("Workspace document payload is out of bounds".to_string());
    }
    let file_name = store_file_name(&request.document_id);
    let path = store_file_path(&app, &file_name)?;
    atomic_write(&path, &bytes)?;
    let modified = fs::metadata(&path)
        .and_then(|metadata| metadata.modified())
        .unwrap_or_else(|_| SystemTime::now());
    Ok(WorkspaceStoreWriteResult {
        file_name,
        size_bytes: bytes.len() as u64,
        sha256: sha256_hex(&bytes),
        modified_at_ms: modified_at_ms(modified),
    })
}

#[tauri::command]
pub fn vgt_workspace_store_list(
    window: WebviewWindow,
    app: AppHandle,
) -> Result<WorkspaceStoreListing, String> {
    require_trusted_shell_window(&window)?;
    let root = workspace_store_root(&app)?;
    let canonical_root = root
        .canonicalize()
        .map_err(|_| "Workspace store is unavailable".to_string())?;
    let entries = fs::read_dir(&canonical_root)
        .map_err(|_| "Workspace store could not be read".to_string())?;
    let mut files = Vec::new();
    for entry in entries.flatten() {
        if files.len() >= MAX_WORKSPACE_STORE_LIST_ENTRIES {
            break;
        }
        let path = entry.path();
        if !is_regular_store_file(&path) {
            continue;
        }
        let Some(file_name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        if validate_store_file_name(file_name).is_err() {
            continue;
        }
        let Ok(metadata) = entry.metadata() else { continue };
        files.push(WorkspaceStoreFileInfo {
            file_name: file_name.to_string(),
            size_bytes: metadata.len(),
            modified_at_ms: metadata
                .modified()
                .map(modified_at_ms)
                .unwrap_or(0),
        });
    }
    files.sort_by_key(|entry| std::cmp::Reverse(entry.modified_at_ms));
    Ok(WorkspaceStoreListing {
        root_path: canonical_root.to_string_lossy().to_string(),
        files,
    })
}

#[tauri::command]
pub fn vgt_workspace_store_read(
    window: WebviewWindow,
    app: AppHandle,
    request: WorkspaceStoreFileRequest,
) -> Result<WorkspaceStoreReadResult, String> {
    require_trusted_shell_window(&window)?;
    let path = store_file_path(&app, &request.file_name)?;
    if !is_regular_store_file(&path) {
        return Err("Workspace document does not exist".to_string());
    }
    let metadata = fs::metadata(&path).map_err(|_| "Workspace document is unavailable".to_string())?;
    if metadata.len() == 0 || metadata.len() > MAX_WORKSPACE_STORE_FILE_BYTES as u64 {
        return Err("Workspace document is out of bounds".to_string());
    }
    let bytes = fs::read(&path).map_err(|_| "Workspace document could not be read".to_string())?;
    if bytes.len() > MAX_WORKSPACE_STORE_FILE_BYTES {
        return Err("Workspace document is out of bounds".to_string());
    }
    Ok(WorkspaceStoreReadResult {
        file_name: request.file_name,
        bytes_base64: base64::engine::general_purpose::STANDARD.encode(&bytes),
        size_bytes: bytes.len() as u64,
        sha256: sha256_hex(&bytes),
        modified_at_ms: metadata
            .modified()
            .map(modified_at_ms)
            .unwrap_or(0),
    })
}

#[tauri::command]
pub fn vgt_workspace_store_remove(
    window: WebviewWindow,
    app: AppHandle,
    request: WorkspaceStoreFileRequest,
) -> Result<bool, String> {
    require_trusted_shell_window(&window)?;
    let path = store_file_path(&app, &request.file_name)?;
    if !is_regular_store_file(&path) {
        return Ok(false);
    }
    // Removed documents are moved into the trash directory instead of being destroyed: a beta
    // must never lose a document because of a mis-click in a dialog.
    let trash = workspace_store_trash(&app)?;
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0);
    let trash_name = format!("{stamp}-{}", request.file_name);
    let trash_path = trash.join(trash_name);
    fs::rename(&path, &trash_path).map_err(|_| "Workspace document could not be archived".to_string())?;
    Ok(true)
}

#[tauri::command]
pub fn vgt_workspace_store_reveal(
    window: WebviewWindow,
    app: AppHandle,
) -> Result<bool, String> {
    require_trusted_shell_window(&window)?;
    let root = workspace_store_root(&app)?;
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        std::process::Command::new("explorer.exe")
            .arg(&root)
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|_| "Workspace store folder could not be opened".to_string())?;
        return Ok(true);
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&root)
            .spawn()
            .map_err(|_| "Workspace store folder could not be opened".to_string())?;
        return Ok(true);
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&root)
            .spawn()
            .map_err(|_| "Workspace store folder could not be opened".to_string())?;
        return Ok(true);
    }
    #[allow(unreachable_code)]
    Ok(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn workspace_store_file_name_is_deterministic_and_bounded() {
        let name = store_file_name("doc-123:abc");
        assert_eq!(name.len(), "doc-".len() + 32 + ".vwc".len());
        assert!(name.starts_with("doc-"));
        assert!(name.ends_with(".vwc"));
        assert_eq!(name, store_file_name("doc-123:abc"));
        assert_ne!(name, store_file_name("doc-123:abd"));
        assert!(validate_store_file_name(&name).is_ok());
    }

    #[test]
    fn workspace_store_rejects_traversal_and_foreign_file_names() {
        for name in [
            "../doc-00000000000000000000000000000000.vwc",
            "doc-00000000000000000000000000000000.exe",
            "doc-0000000000000000000000000000000.vwc",
            "doc-X0000000000000000000000000000000.vwc",
            "doc-00000000000000000000000000000000.vwc/../x",
        ] {
            assert!(validate_store_file_name(name).is_err(), "{name}");
        }
        assert!(validate_store_file_name("doc-0123456789abcdef0123456789abcdef.vwc").is_ok());
    }

    #[test]
    fn workspace_store_document_ids_are_bounded() {
        assert!(validate_document_id("doc-1").is_ok());
        assert!(validate_document_id("2026-10-18:doc_1").is_ok());
        for value in ["", "../x", "a/b", "a\\b", "bad\nid", "x".repeat(MAX_DOCUMENT_ID_LEN + 1).as_str()] {
            assert!(validate_document_id(value).is_err(), "{value}");
        }
    }

    #[test]
    fn workspace_store_sha256_is_stable_hex() {
        assert_eq!(
            sha256_hex(b"astraea"),
            "5dee65c5d8c5c6a144fb18f2e267025c2ca15a927d6c60123f9b7c113eff1e4e"
        );
    }
}
