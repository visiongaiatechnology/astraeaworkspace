// STATUS: DIAMANT VGT SUPREME
//! Shared private storage root for verified update state.

use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const CACHE_DIR: &str = "verified-updates-v1";

pub(crate) fn update_root(app: &AppHandle) -> Result<PathBuf, String> {
    let root = app
        .path()
        .app_local_data_dir()
        .map_err(|_| "UPDATE_STORAGE_UNAVAILABLE".to_string())?
        .join(CACHE_DIR);
    fs::create_dir_all(&root).map_err(|_| "UPDATE_STORAGE_UNAVAILABLE".to_string())?;
    Ok(root)
}
