use crate::{AutomationRuntimeError, AUTOMATION_CHECKPOINT_SCHEMA, MAX_CHECKPOINT_BYTES};
use serde::{Deserialize, Serialize};
use std::io::{self, Write};
use vgt_crypto::{decrypt_aes_gcm, encrypt_aes_gcm};

// Reserve serde_json's enclosing checkpoint-object depth so sealed state always reopens.
const MAX_CHECKPOINT_STATE_DEPTH: usize = 126;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct RunCheckpoint {
    pub schema: String,
    pub run_id: String,
    pub flow_id: String,
    pub flow_version: u64,
    pub activation_digest: String,
    pub resume_node_id: String,
    pub external_assumption_digest: String,
    pub created_at_ms: u64,
    pub state: serde_json::Value,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct EncryptedCheckpoint {
    pub nonce: Vec<u8>,
    pub ciphertext: Vec<u8>,
}

pub fn seal_checkpoint(
    checkpoint: &RunCheckpoint,
    key: &[u8; 32],
) -> Result<EncryptedCheckpoint, AutomationRuntimeError> {
    if !valid_checkpoint(checkpoint) {
        return Err(AutomationRuntimeError::InvalidInput);
    }
    if !checkpoint_state_within_limits(&checkpoint.state) {
        return Err(AutomationRuntimeError::LimitExceeded);
    }
    let bytes = serialize_checkpoint(checkpoint)?;
    let aad = format!(
        "{}:{}:{}:{}",
        checkpoint.schema, checkpoint.flow_id, checkpoint.flow_version, checkpoint.run_id
    );
    let (ciphertext, nonce) = encrypt_aes_gcm(&bytes, key, aad.as_bytes())
        .map_err(|_| AutomationRuntimeError::CryptoFailed)?;
    Ok(EncryptedCheckpoint {
        nonce: nonce.to_vec(),
        ciphertext,
    })
}
pub fn open_checkpoint_for_run(
    encrypted: &EncryptedCheckpoint,
    key: &[u8; 32],
    run_id: &str,
    expected_flow_id: &str,
    expected_flow_version: u64,
    expected_activation_digest: &str,
    expected_assumption_digest: &str,
) -> Result<RunCheckpoint, AutomationRuntimeError> {
    if !valid_id(run_id)
        || !valid_id(expected_flow_id)
        || expected_flow_version == 0
        || !valid_digest(expected_activation_digest)
        || !valid_digest(expected_assumption_digest)
        || encrypted.nonce.len() != 12
        || encrypted.ciphertext.len() > MAX_CHECKPOINT_BYTES + 16
    {
        return Err(AutomationRuntimeError::CheckpointRejected);
    }
    let aad = format!(
        "{}:{}:{}:{}",
        AUTOMATION_CHECKPOINT_SCHEMA, expected_flow_id, expected_flow_version, run_id
    );
    let nonce: &[u8; 12] = encrypted
        .nonce
        .as_slice()
        .try_into()
        .map_err(|_| AutomationRuntimeError::CheckpointRejected)?;
    let bytes = decrypt_aes_gcm(&encrypted.ciphertext, nonce, key, aad.as_bytes())
        .map_err(|_| AutomationRuntimeError::CheckpointRejected)?;
    if bytes.len() > MAX_CHECKPOINT_BYTES {
        return Err(AutomationRuntimeError::CheckpointRejected);
    }
    let checkpoint: RunCheckpoint =
        serde_json::from_slice(&bytes).map_err(|_| AutomationRuntimeError::CheckpointRejected)?;
    if !valid_checkpoint(&checkpoint)
        || checkpoint.run_id != run_id
        || checkpoint.flow_id != expected_flow_id
        || checkpoint.flow_version != expected_flow_version
        || checkpoint.activation_digest != expected_activation_digest
    {
        return Err(AutomationRuntimeError::CheckpointRejected);
    }
    if checkpoint.external_assumption_digest != expected_assumption_digest {
        return Err(AutomationRuntimeError::ResumeAssumptionChanged);
    }
    Ok(checkpoint)
}

fn valid_checkpoint(checkpoint: &RunCheckpoint) -> bool {
    checkpoint.schema == AUTOMATION_CHECKPOINT_SCHEMA
        && valid_id(&checkpoint.run_id)
        && valid_id(&checkpoint.flow_id)
        && valid_id(&checkpoint.resume_node_id)
        && checkpoint.flow_version > 0
        && valid_digest(&checkpoint.activation_digest)
        && valid_digest(&checkpoint.external_assumption_digest)
}

fn valid_id(value: &str) -> bool {
    (1..=128).contains(&value.len())
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b':' | b'-'))
}

fn valid_digest(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn checkpoint_state_within_limits(root: &serde_json::Value) -> bool {
    let mut stack = Vec::with_capacity(MAX_CHECKPOINT_STATE_DEPTH);
    let mut visited_values = 0usize;
    if !push_state_container(root, &mut stack) {
        return false;
    }

    while let Some(frame) = stack.last_mut() {
        let Some((value, key)) = frame.next_child() else {
            stack.pop();
            continue;
        };

        if key.is_some_and(|key| key.len() > MAX_CHECKPOINT_BYTES)
            || !state_scalar_within_limits(value)
        {
            return false;
        }
        let Some(next_count) = visited_values.checked_add(1) else {
            return false;
        };
        if next_count > MAX_CHECKPOINT_BYTES {
            return false;
        }
        visited_values = next_count;

        if let Some(frame) = state_frame(value) {
            if stack.len() >= MAX_CHECKPOINT_STATE_DEPTH || !container_within_limits(value) {
                return false;
            }
            stack.push(frame);
        }
    }

    true
}

fn state_scalar_within_limits(value: &serde_json::Value) -> bool {
    !matches!(value, serde_json::Value::String(text) if text.len() > MAX_CHECKPOINT_BYTES)
}

fn container_within_limits(value: &serde_json::Value) -> bool {
    match value {
        serde_json::Value::Array(items) => items.len() <= MAX_CHECKPOINT_BYTES,
        serde_json::Value::Object(items) => items.len() <= MAX_CHECKPOINT_BYTES,
        _ => true,
    }
}

fn push_state_container<'a>(
    value: &'a serde_json::Value,
    stack: &mut Vec<CheckpointStateFrame<'a>>,
) -> bool {
    if !state_scalar_within_limits(value) || !container_within_limits(value) {
        return false;
    }
    if let Some(frame) = state_frame(value) {
        stack.push(frame);
    }
    true
}

fn state_frame(value: &serde_json::Value) -> Option<CheckpointStateFrame<'_>> {
    match value {
        serde_json::Value::Array(items) => Some(CheckpointStateFrame::Array(items.iter())),
        serde_json::Value::Object(items) => Some(CheckpointStateFrame::Object(items.iter())),
        _ => None,
    }
}

enum CheckpointStateFrame<'a> {
    Array(std::slice::Iter<'a, serde_json::Value>),
    Object(serde_json::map::Iter<'a>),
}

impl<'a> CheckpointStateFrame<'a> {
    fn next_child(&mut self) -> Option<(&'a serde_json::Value, Option<&'a str>)> {
        match self {
            Self::Array(items) => items.next().map(|value| (value, None)),
            Self::Object(items) => items.next().map(|(key, value)| (value, Some(key.as_str()))),
        }
    }
}

fn serialize_checkpoint(checkpoint: &RunCheckpoint) -> Result<Vec<u8>, AutomationRuntimeError> {
    let mut writer = CheckpointWriter::default();
    serde_json::to_writer(&mut writer, checkpoint).map_err(|error| {
        if matches!(
            error.io_error_kind(),
            Some(io::ErrorKind::FileTooLarge | io::ErrorKind::OutOfMemory)
        ) {
            AutomationRuntimeError::LimitExceeded
        } else {
            AutomationRuntimeError::InvalidInput
        }
    })?;
    Ok(writer.bytes)
}

#[derive(Default)]
struct CheckpointWriter {
    bytes: Vec<u8>,
}

impl Write for CheckpointWriter {
    fn write(&mut self, buffer: &[u8]) -> io::Result<usize> {
        let Some(new_len) = self.bytes.len().checked_add(buffer.len()) else {
            return Err(io::Error::new(
                io::ErrorKind::FileTooLarge,
                "checkpoint length overflow",
            ));
        };
        if new_len > MAX_CHECKPOINT_BYTES {
            return Err(io::Error::new(
                io::ErrorKind::FileTooLarge,
                "checkpoint exceeds byte limit",
            ));
        }
        self.bytes.try_reserve(buffer.len()).map_err(|_| {
            io::Error::new(
                io::ErrorKind::OutOfMemory,
                "checkpoint buffer allocation failed",
            )
        })?;
        self.bytes.extend_from_slice(buffer);
        Ok(buffer.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}
