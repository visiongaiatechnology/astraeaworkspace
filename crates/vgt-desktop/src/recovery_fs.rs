// STATUS: DIAMANT VGT SUPREME — fail-closed recovery cleanup boundary.
use std::{fs, path::Path};

pub(crate) fn clear_recovery_root(root: &Path) -> Result<u64, String> {
    let metadata = match fs::symlink_metadata(root) {
        Ok(value) => value,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(0),
        Err(_) => return Err("Recovery directory metadata could not be read".to_string()),
    };
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err("Recovery directory failed path-integrity validation".to_string());
    }

    let mut removed = 0u64;
    let entries =
        fs::read_dir(root).map_err(|_| "Recovery directory could not be read".to_string())?;
    for entry in entries.filter_map(Result::ok) {
        let path = entry.path();
        let Some(name) = entry.file_name().to_str().map(ToOwned::to_owned) else {
            continue;
        };
        let entry_meta = fs::symlink_metadata(&path)
            .map_err(|_| "Recovery entry metadata could not be read".to_string())?;
        if entry_meta.file_type().is_symlink() {
            return Err("Recovery cleanup refused a symlinked entry".to_string());
        }
        if !entry_meta.is_dir()
            || name.len() != 32
            || !name.bytes().all(|byte| byte.is_ascii_hexdigit())
        {
            continue;
        }

        let files = fs::read_dir(&path)
            .map_err(|_| "Recovery snapshot directory could not be read".to_string())?;
        for file_entry in files.filter_map(Result::ok) {
            let file_path = file_entry.path();
            let file_meta = fs::symlink_metadata(&file_path)
                .map_err(|_| "Recovery snapshot metadata could not be read".to_string())?;
            if file_meta.file_type().is_symlink() || !file_meta.is_file() {
                return Err("Recovery cleanup refused a non-regular snapshot entry".to_string());
            }
            let file_name = file_path
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or_default();
            let allowed = file_name.ends_with(".vrec") || file_name.ends_with(".vrec.meta");
            if !allowed {
                continue;
            }
            fs::remove_file(&file_path)
                .map_err(|_| "Recovery snapshot could not be deleted".to_string())?;
            removed = removed.saturating_add(1);
        }

        if fs::read_dir(&path)
            .map_err(|_| "Recovery snapshot directory could not be re-read".to_string())?
            .next()
            .is_none()
        {
            fs::remove_dir(&path)
                .map_err(|_| "Recovery snapshot directory could not be removed".to_string())?;
        }
    }
    Ok(removed)
}
