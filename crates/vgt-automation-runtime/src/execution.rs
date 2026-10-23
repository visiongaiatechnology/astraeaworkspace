use crate::{
    AutomationRuntimeError, MAX_CAPABILITY_HANDLES, MAX_CPU_MS, MAX_MEMORY_BYTES, MAX_OUTPUT_BYTES,
    MAX_RUN_MS,
};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum RetryClass {
    Never,
    Idempotent,
    ExplicitlySafe,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ActionMetadata {
    pub action_id: String,
    pub retry: RetryClass,
    pub max_attempts: u8,
    pub side_effecting: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RunLimits {
    pub wall_ms: u64,
    pub cpu_ms: u64,
    pub memory_bytes: u64,
    pub output_bytes: u64,
}
impl Default for RunLimits {
    fn default() -> Self {
        Self {
            wall_ms: 5_000,
            cpu_ms: 5_000,
            memory_bytes: 128 * 1024 * 1024,
            output_bytes: 4 * 1024 * 1024,
        }
    }
}
impl RunLimits {
    pub fn validate(&self) -> Result<(), AutomationRuntimeError> {
        if self.wall_ms == 0
            || self.wall_ms > MAX_RUN_MS
            || self.cpu_ms == 0
            || self.cpu_ms > MAX_CPU_MS
            || self.memory_bytes == 0
            || self.memory_bytes > MAX_MEMORY_BYTES
            || self.output_bytes == 0
            || self.output_bytes > MAX_OUTPUT_BYTES
        {
            return Err(AutomationRuntimeError::LimitExceeded);
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ActionContext {
    pub run_id: String,
    pub flow_id: String,
    pub flow_version: u64,
    pub node_id: String,
    pub deadline_unix_ms: u64,
    pub cancellation_epoch: u64,
    pub capability_handles: Vec<String>,
    pub idempotency_key: Option<String>,
}
impl ActionContext {
    pub fn validate(&self, now_ms: u64) -> Result<(), AutomationRuntimeError> {
        if self.deadline_unix_ms <= now_ms {
            return Err(AutomationRuntimeError::DeadlineExceeded);
        }
        if self.capability_handles.len() > MAX_CAPABILITY_HANDLES {
            return Err(AutomationRuntimeError::LimitExceeded);
        }
        let mut seen = BTreeSet::new();
        for handle in &self.capability_handles {
            if !valid_handle(handle) || !seen.insert(handle) {
                return Err(AutomationRuntimeError::InvalidInput);
            }
        }
        Ok(())
    }
    pub fn require_capability(&self, handle: &str) -> Result<(), AutomationRuntimeError> {
        if self.capability_handles.iter().any(|v| v == handle) {
            Ok(())
        } else {
            Err(AutomationRuntimeError::CapabilityDenied)
        }
    }
}

pub fn retry_allowed(
    meta: &ActionMetadata,
    attempt: u8,
    has_idempotency_key: bool,
) -> Result<bool, AutomationRuntimeError> {
    if meta.max_attempts == 0 || meta.max_attempts > 8 || attempt == 0 {
        return Err(AutomationRuntimeError::InvalidInput);
    }
    if attempt >= meta.max_attempts {
        return Ok(false);
    }
    match meta.retry {
        RetryClass::Never => Ok(false),
        RetryClass::Idempotent => {
            if meta.side_effecting && !has_idempotency_key {
                Err(AutomationRuntimeError::RetryUnsafe)
            } else {
                Ok(true)
            }
        }
        RetryClass::ExplicitlySafe => Ok(true),
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SafeHistoryEntry {
    pub run_id: String,
    pub node_id: String,
    pub status: String,
    pub safe_code: String,
    pub duration_ms: u64,
    pub numeric_detail: Option<u64>,
}
pub fn redact_history_json(value: &serde_json::Value) -> serde_json::Value {
    match value {
        serde_json::Value::Object(map) => serde_json::Value::Object(
            map.iter()
                .map(|(k, v)| {
                    let n = k.to_ascii_lowercase();
                    if n.contains("secret")
                        || n.contains("token")
                        || n.contains("password")
                        || n.contains("authorization")
                        || (n.contains("key") && !n.ends_with("key_id"))
                    {
                        (k.clone(), serde_json::Value::String("[REDACTED]".into()))
                    } else {
                        (k.clone(), redact_history_json(v))
                    }
                })
                .collect(),
        ),
        serde_json::Value::Array(items) => {
            serde_json::Value::Array(items.iter().map(redact_history_json).collect())
        }
        _ => value.clone(),
    }
}
fn valid_handle(v: &str) -> bool {
    (4..=256).contains(&v.len())
        && (v.starts_with("cap:") || v.starts_with("keyvault:/") || v.starts_with("pathhandle:"))
        && v.bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b':' | b'/' | b'-'))
}
