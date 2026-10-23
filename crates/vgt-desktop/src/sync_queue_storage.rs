// STATUS: DIAMANT VGT SUPREME
//! Authenticated local persistence for SyncGraph offline outbound/inbound queues.

use crate::AppState;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, State};
use vgt_crypto::{hash_blake3, zeroize_best_effort};
use vgt_syncgraph::{OfflineQueueState, SealedSyncEnvelope, SyncEnvelopeContext, MAX_QUEUE_BYTES};

const MAX_QUEUE_FILE_BYTES: u64 = MAX_QUEUE_BYTES as u64 + 2 * 1024 * 1024;

fn queue_directory(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|_| "SyncGraph storage root is unavailable".to_string())?;
    let directory = base.join("syncgraph");
    fs::create_dir_all(&directory)
        .map_err(|_| "SyncGraph storage directory could not be created".to_string())?;
    if fs::symlink_metadata(&directory)
        .map_err(|_| "SyncGraph storage directory is unavailable".to_string())?
        .file_type()
        .is_symlink()
    {
        return Err("SyncGraph storage directory rejected".to_string());
    }
    Ok(directory)
}

fn queue_path(app: &AppHandle, document_id: &str) -> Result<PathBuf, String> {
    let digest = hash_blake3(document_id.as_bytes());
    Ok(queue_directory(app)?.join(format!("{}.vgsq", hex::encode(digest))))
}

fn queue_context(document_id: &str, membership_epoch: u64) -> SyncEnvelopeContext {
    SyncEnvelopeContext {
        document_id: document_id.to_string(),
        session_id: "local-offline-queue".to_string(),
        membership_epoch,
        sender_device_id: "local-native-device".to_string(),
    }
}

pub(crate) fn derive_sync_key(
    app_state: &State<'_, AppState>,
    document_id: &str,
) -> Result<[u8; 32], String> {
    let scope = format!("syncgraph:{document_id}");
    let mut vault = app_state
        .vault
        .lock()
        .map_err(|_| "KeyVault is unavailable".to_string())?;
    vault
        .derive_sync_transport_key(&scope)
        .map_err(|_| "SyncGraph queue key is unavailable".to_string())
}

fn quarantine_corrupt(path: &Path) {
    let suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_secs())
        .unwrap_or_default();
    let quarantine = path.with_extension(format!("vgsq.corrupt-{suffix}"));
    let _ = fs::rename(path, quarantine);
}

pub fn load_queue(
    app: &AppHandle,
    app_state: &State<'_, AppState>,
    document_id: &str,
) -> Result<(OfflineQueueState, bool), String> {
    let path = queue_path(app, document_id)?;
    if !path.exists() {
        return Ok((OfflineQueueState::default(), false));
    }
    let metadata = fs::symlink_metadata(&path)
        .map_err(|_| "SyncGraph queue metadata is unavailable".to_string())?;
    if !metadata.is_file()
        || metadata.file_type().is_symlink()
        || metadata.len() == 0
        || metadata.len() > MAX_QUEUE_FILE_BYTES
    {
        quarantine_corrupt(&path);
        return Ok((OfflineQueueState::default(), true));
    }
    let encoded = match fs::read(&path) {
        Ok(bytes) => bytes,
        Err(_) => {
            quarantine_corrupt(&path);
            return Ok((OfflineQueueState::default(), true));
        }
    };
    let envelope: SealedSyncEnvelope = match serde_json::from_slice(&encoded) {
        Ok(value) => value,
        Err(_) => {
            quarantine_corrupt(&path);
            return Ok((OfflineQueueState::default(), true));
        }
    };
    if envelope.context.document_id != document_id
        || envelope.context.session_id != "local-offline-queue"
        || envelope.context.sender_device_id != "local-native-device"
    {
        quarantine_corrupt(&path);
        return Ok((OfflineQueueState::default(), true));
    }
    let mut key = derive_sync_key(app_state, document_id)?;
    let restored = OfflineQueueState::restore_from_storage(&envelope, &key);
    zeroize_best_effort(&mut key);
    match restored {
        Ok(queue) if envelope.context.membership_epoch == queue.membership.epoch => {
            Ok((queue, false))
        }
        Ok(_) => {
            quarantine_corrupt(&path);
            Ok((OfflineQueueState::default(), true))
        }
        Err(_) => {
            quarantine_corrupt(&path);
            Ok((OfflineQueueState::default(), true))
        }
    }
}

pub fn persist_queue(
    app: &AppHandle,
    app_state: &State<'_, AppState>,
    document_id: &str,
    membership_epoch: u64,
    queue: &OfflineQueueState,
) -> Result<(), String> {
    let path = queue_path(app, document_id)?;
    if queue.membership.epoch != membership_epoch {
        return Err("SyncGraph membership/queue epoch mismatch".to_string());
    }
    let mut key = derive_sync_key(app_state, document_id)?;
    let sealed = queue.seal_for_storage(&key, queue_context(document_id, membership_epoch));
    zeroize_best_effort(&mut key);
    let envelope = sealed.map_err(|_| "SyncGraph queue sealing failed".to_string())?;
    let encoded = serde_json::to_vec(&envelope)
        .map_err(|_| "SyncGraph queue serialization failed".to_string())?;
    if encoded.len() as u64 > MAX_QUEUE_FILE_BYTES {
        return Err("SyncGraph queue exceeds storage boundary".to_string());
    }
    crate::container_storage::atomic_replace_encrypted(&path, &encoded)
}

pub fn delete_queue(app: &AppHandle, document_id: &str) -> Result<(), String> {
    let path = queue_path(app, document_id)?;
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(_) => Err("SyncGraph queue could not be removed".to_string()),
    }
}
