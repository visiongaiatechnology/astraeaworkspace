// STATUS: DIAMANT VGT SUPREME
//! Bounded resumable update transfer staging.
//! Security verification is deliberately not implemented here: completed transfers are
//! always handed back to `update_release_bridge` for the normal signed-manifest,
//! signed-package, digest, channel and rollback verification path.

use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use serde::Deserialize;
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use tauri::AppHandle;
use vgt_diagnostics_release::{TransferPhase, UpdatePayloadKind, UpdateTransferCheckpoint};

use crate::update_release_bridge::ReleaseChannel;
use crate::update_storage_common::update_root;

const TRANSFER_DIR: &str = "transfers-v1";
const MAX_TRANSFER_CHUNK_BYTES: usize = 4 * 1024 * 1024;
const MAX_TRANSFER_CHUNK_BASE64: usize = MAX_TRANSFER_CHUNK_BYTES.div_ceil(3) * 4 + 16;
const MAX_CHECKPOINT_BYTES: usize = 16 * 1024;

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BeginUpdateTransferRequest {
    pub transfer_id: String,
    pub payload_kind: UpdatePayloadKind,
    pub artifact_file_name: String,
    pub expected_bytes: u64,
    pub expected_sha256: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AppendUpdateTransferChunkRequest {
    pub transfer_id: String,
    pub offset: u64,
    pub chunk_base64: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UpdateTransferIdRequest {
    pub transfer_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct VerifyTransferUpdateRequest {
    pub signed_manifest_json: String,
    pub transfer_id: String,
    pub expected_channel: ReleaseChannel,
    pub explicit_update_policy: bool,
    pub allow_delta: bool,
    pub recovery_mode: bool,
}

fn fail(code: &'static str) -> String {
    code.to_string()
}

fn transfer_root(app: &AppHandle) -> Result<PathBuf, String> {
    let root = update_root(app)?.join(TRANSFER_DIR);
    fs::create_dir_all(&root).map_err(|_| fail("UPDATE_TRANSFER_STORAGE_UNAVAILABLE"))?;
    Ok(root)
}

pub(crate) fn transfer_dir(
    app: &AppHandle,
    checkpoint: &UpdateTransferCheckpoint,
) -> Result<PathBuf, String> {
    Ok(transfer_root(app)?.join(&checkpoint.transfer_id))
}

fn transfer_checkpoint_path(app: &AppHandle, transfer_id: &str) -> Result<PathBuf, String> {
    if transfer_id.is_empty()
        || transfer_id.len() > 96
        || !transfer_id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b'-'))
    {
        return Err(fail("UPDATE_TRANSFER_ID_REJECTED"));
    }
    Ok(transfer_root(app)?
        .join(transfer_id)
        .join("checkpoint.json"))
}

fn write_transfer_checkpoint(
    app: &AppHandle,
    checkpoint: &UpdateTransferCheckpoint,
) -> Result<(), String> {
    let dir = transfer_dir(app, checkpoint)?;
    fs::create_dir_all(&dir).map_err(|_| fail("UPDATE_TRANSFER_STORAGE_UNAVAILABLE"))?;
    let path = dir.join("checkpoint.json");
    let temp = dir.join("checkpoint.json.tmp");
    let bytes = serde_json::to_vec(checkpoint)
        .map_err(|_| fail("UPDATE_TRANSFER_CHECKPOINT_SERIALIZE_FAILED"))?;
    if bytes.is_empty() || bytes.len() > MAX_CHECKPOINT_BYTES {
        return Err(fail("UPDATE_TRANSFER_CHECKPOINT_SIZE_REJECTED"));
    }
    let mut file = fs::OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .open(&temp)
        .map_err(|_| fail("UPDATE_TRANSFER_CHECKPOINT_WRITE_FAILED"))?;
    file.write_all(&bytes)
        .map_err(|_| fail("UPDATE_TRANSFER_CHECKPOINT_WRITE_FAILED"))?;
    file.sync_all()
        .map_err(|_| fail("UPDATE_TRANSFER_CHECKPOINT_SYNC_FAILED"))?;
    fs::rename(&temp, &path).map_err(|_| fail("UPDATE_TRANSFER_CHECKPOINT_COMMIT_FAILED"))
}

pub(crate) fn read_transfer_checkpoint(
    app: &AppHandle,
    transfer_id: &str,
) -> Result<UpdateTransferCheckpoint, String> {
    let path = transfer_checkpoint_path(app, transfer_id)?;
    let bytes = fs::read(&path).map_err(|_| fail("UPDATE_TRANSFER_CHECKPOINT_READ_FAILED"))?;
    if bytes.is_empty() || bytes.len() > MAX_CHECKPOINT_BYTES {
        return Err(fail("UPDATE_TRANSFER_CHECKPOINT_SIZE_REJECTED"));
    }
    let checkpoint: UpdateTransferCheckpoint = serde_json::from_slice(&bytes)
        .map_err(|_| fail("UPDATE_TRANSFER_CHECKPOINT_PARSE_REJECTED"))?;
    let canonical = UpdateTransferCheckpoint::new(
        checkpoint.transfer_id.clone(),
        checkpoint.payload_kind,
        checkpoint.artifact_file_name.clone(),
        checkpoint.expected_bytes,
        checkpoint.expected_sha256.clone(),
    )
    .map_err(|_| fail("UPDATE_TRANSFER_CHECKPOINT_SCHEMA_REJECTED"))?;
    if checkpoint.schema != canonical.schema
        || checkpoint.transfer_id != transfer_id
        || checkpoint.received_bytes > checkpoint.expected_bytes
        || !checkpoint.requires_manifest_signature_verification
        || !checkpoint.requires_package_signature_verification
    {
        return Err(fail("UPDATE_TRANSFER_CHECKPOINT_SCHEMA_REJECTED"));
    }
    Ok(checkpoint)
}

pub(crate) fn transfer_package_path(
    app: &AppHandle,
    checkpoint: &UpdateTransferCheckpoint,
) -> Result<PathBuf, String> {
    Ok(transfer_dir(app, checkpoint)?.join(&checkpoint.artifact_file_name))
}

pub(crate) fn cleanup_transfer(
    app: &AppHandle,
    checkpoint: &UpdateTransferCheckpoint,
) -> Result<(), String> {
    let dir = transfer_dir(app, checkpoint)?;
    match fs::remove_dir_all(dir) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(_) => Err(fail("UPDATE_TRANSFER_CLEANUP_FAILED")),
    }
}

#[tauri::command]
pub fn vgt_update_transfer_begin(
    app: AppHandle,
    request: BeginUpdateTransferRequest,
) -> Result<UpdateTransferCheckpoint, String> {
    let checkpoint = UpdateTransferCheckpoint::new(
        request.transfer_id,
        request.payload_kind,
        request.artifact_file_name,
        request.expected_bytes,
        request.expected_sha256,
    )
    .map_err(|_| fail("UPDATE_TRANSFER_REQUEST_REJECTED"))?;
    let dir = transfer_dir(&app, &checkpoint)?;
    if dir.exists() {
        return Err(fail("UPDATE_TRANSFER_ALREADY_EXISTS"));
    }
    fs::create_dir_all(&dir).map_err(|_| fail("UPDATE_TRANSFER_STORAGE_UNAVAILABLE"))?;
    let package = transfer_package_path(&app, &checkpoint)?;
    fs::OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&package)
        .map_err(|_| fail("UPDATE_TRANSFER_CREATE_FAILED"))?;
    write_transfer_checkpoint(&app, &checkpoint)?;
    Ok(checkpoint)
}

#[tauri::command]
pub fn vgt_update_transfer_append(
    app: AppHandle,
    request: AppendUpdateTransferChunkRequest,
) -> Result<UpdateTransferCheckpoint, String> {
    if request.chunk_base64.is_empty() || request.chunk_base64.len() > MAX_TRANSFER_CHUNK_BASE64 {
        return Err(fail("UPDATE_TRANSFER_CHUNK_SIZE_REJECTED"));
    }
    let mut checkpoint = read_transfer_checkpoint(&app, &request.transfer_id)?;
    if checkpoint.phase != TransferPhase::Active || request.offset != checkpoint.received_bytes {
        return Err(fail("UPDATE_TRANSFER_OFFSET_REJECTED"));
    }
    let chunk = B64
        .decode(request.chunk_base64.as_bytes())
        .map_err(|_| fail("UPDATE_TRANSFER_CHUNK_ENCODING_REJECTED"))?;
    if chunk.is_empty() || chunk.len() > MAX_TRANSFER_CHUNK_BYTES {
        return Err(fail("UPDATE_TRANSFER_CHUNK_SIZE_REJECTED"));
    }
    let package = transfer_package_path(&app, &checkpoint)?;
    if fs::metadata(&package)
        .map_err(|_| fail("UPDATE_TRANSFER_PACKAGE_MISSING"))?
        .len()
        != request.offset
    {
        return Err(fail("UPDATE_TRANSFER_OFFSET_REJECTED"));
    }
    let mut output = fs::OpenOptions::new()
        .append(true)
        .open(&package)
        .map_err(|_| fail("UPDATE_TRANSFER_WRITE_FAILED"))?;
    output
        .write_all(&chunk)
        .map_err(|_| fail("UPDATE_TRANSFER_WRITE_FAILED"))?;
    output
        .sync_data()
        .map_err(|_| fail("UPDATE_TRANSFER_SYNC_FAILED"))?;
    checkpoint
        .record_contiguous_bytes(request.offset, chunk.len() as u64)
        .map_err(|_| fail("UPDATE_TRANSFER_BOUNDARY_REJECTED"))?;
    write_transfer_checkpoint(&app, &checkpoint)?;
    Ok(checkpoint)
}

#[tauri::command]
pub fn vgt_update_transfer_pause(
    app: AppHandle,
    request: UpdateTransferIdRequest,
) -> Result<UpdateTransferCheckpoint, String> {
    let mut checkpoint = read_transfer_checkpoint(&app, &request.transfer_id)?;
    checkpoint
        .pause()
        .map_err(|_| fail("UPDATE_TRANSFER_PHASE_REJECTED"))?;
    write_transfer_checkpoint(&app, &checkpoint)?;
    Ok(checkpoint)
}

#[tauri::command]
pub fn vgt_update_transfer_resume(
    app: AppHandle,
    request: UpdateTransferIdRequest,
) -> Result<UpdateTransferCheckpoint, String> {
    let mut checkpoint = read_transfer_checkpoint(&app, &request.transfer_id)?;
    checkpoint
        .resume()
        .map_err(|_| fail("UPDATE_TRANSFER_PHASE_REJECTED"))?;
    let package = transfer_package_path(&app, &checkpoint)?;
    if fs::metadata(package)
        .map_err(|_| fail("UPDATE_TRANSFER_PACKAGE_MISSING"))?
        .len()
        != checkpoint.received_bytes
    {
        return Err(fail("UPDATE_TRANSFER_OFFSET_REJECTED"));
    }
    write_transfer_checkpoint(&app, &checkpoint)?;
    Ok(checkpoint)
}

#[tauri::command]
pub fn vgt_update_transfer_status(
    app: AppHandle,
    request: UpdateTransferIdRequest,
) -> Result<UpdateTransferCheckpoint, String> {
    read_transfer_checkpoint(&app, &request.transfer_id)
}
