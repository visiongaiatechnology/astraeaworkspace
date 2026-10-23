// STATUS: DIAMANT VGT SUPREME — single-use native save-dialog authorization grants.
use crate::converter_security::new_uuid_token;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

const SAVE_GRANT_TTL: Duration = Duration::from_secs(120);
const MAX_GRANTS: usize = 32;

#[derive(Debug, Clone)]
struct SaveGrant {
    path: PathBuf,
    created_at: Instant,
}

#[derive(Default)]
pub struct SaveDialogGrantState {
    grants: Mutex<HashMap<String, SaveGrant>>,
}

impl SaveDialogGrantState {
    pub fn issue(&self, selected_path: &Path) -> Result<String, String> {
        let file_name = selected_path
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or_else(|| "Native save selection is invalid".to_string())?;
        if file_name.is_empty() || file_name.len() > 255 || file_name.contains(['/', '\\']) {
            return Err("Native save selection is invalid".to_string());
        }
        let parent = selected_path
            .parent()
            .ok_or_else(|| "Native save selection is invalid".to_string())?;
        let parent = parent
            .canonicalize()
            .map_err(|_| "Native save directory is unavailable".to_string())?;
        let metadata = std::fs::symlink_metadata(&parent)
            .map_err(|_| "Native save directory is unavailable".to_string())?;
        if !metadata.is_dir() || metadata.file_type().is_symlink() {
            return Err("Native save directory is unavailable".to_string());
        }
        let canonical_selection = parent.join(file_name);
        let token = new_uuid_token();
        let mut grants = self
            .grants
            .lock()
            .map_err(|_| "Native save authorization is unavailable".to_string())?;
        grants.retain(|_, grant| grant.created_at.elapsed() <= SAVE_GRANT_TTL);
        if grants.len() >= MAX_GRANTS {
            return Err("Native save authorization capacity reached".to_string());
        }
        grants.insert(
            token.clone(),
            SaveGrant {
                path: canonical_selection,
                created_at: Instant::now(),
            },
        );
        Ok(token)
    }

    pub fn consume(&self, token: &str, expected_file_name: &str) -> Result<PathBuf, String> {
        if uuid::Uuid::parse_str(token).is_err() {
            return Err("Native save authorization is invalid".to_string());
        }
        let grant = self
            .grants
            .lock()
            .map_err(|_| "Native save authorization is unavailable".to_string())?
            .remove(token)
            .ok_or_else(|| "Native save authorization is invalid".to_string())?;
        if grant.created_at.elapsed() > SAVE_GRANT_TTL {
            return Err("Native save authorization expired".to_string());
        }
        if grant.path.file_name().and_then(|value| value.to_str()) != Some(expected_file_name) {
            return Err("Native save authorization does not match the requested file".to_string());
        }
        Ok(grant.path)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sec066_save_grant_is_dialog_bound_and_single_use() {
        let root = std::env::temp_dir().join(format!("astraea-sec066-{}", new_uuid_token()));
        std::fs::create_dir(&root).unwrap();
        let state = SaveDialogGrantState::default();
        let selected = root.join("report.vdoc");
        let token = state.issue(&selected).unwrap();
        assert!(state.consume(&token, "report.vdoc").is_ok());
        assert!(state.consume(&token, "report.vdoc").is_err());
        let _ = std::fs::remove_dir(root);
    }

    #[test]
    fn sec066_arbitrary_webview_path_has_no_authorization_token() {
        let state = SaveDialogGrantState::default();
        assert!(state.consume("C:\\evil.exe", "evil.exe").is_err());
        assert!(state
            .consume("00000000-0000-4000-8000-000000000000", "evil.exe")
            .is_err());
    }
}
