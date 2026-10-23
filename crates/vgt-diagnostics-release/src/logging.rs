use crate::{validate_id, DiagnosticsCoreError};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, VecDeque};

pub const MAX_DEBUG_MODE_MS: u64 = 30 * 60 * 1000;
const MAX_LOG_ENTRIES: usize = 1024;
const MAX_LOG_BYTES: usize = 1024 * 1024;
const MAX_MESSAGE: usize = 512;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum LogSeverity { Debug, Info, Warn, Error }

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(untagged)]
pub enum DiagnosticScalar { Bool(bool), Integer(i64), Unsigned(u64), Text(String) }

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct StructuredLogEntry {
    pub sequence: u64,
    pub timestamp_ms: u64,
    pub severity: LogSeverity,
    pub component: String,
    pub event_id: String,
    pub message: String,
    pub fields: BTreeMap<String, DiagnosticScalar>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct DebugModeState {
    pub enabled: bool,
    pub enabled_until_ms: Option<u64>,
}

#[derive(Debug, Default)]
pub struct LocalLogRing {
    entries: VecDeque<StructuredLogEntry>,
    approximate_bytes: usize,
    sequence: u64,
    debug_until_ms: Option<u64>,
}

impl LocalLogRing {
    pub fn enable_debug(&mut self, now_ms: u64, requested_ms: u64) -> Result<DebugModeState, DiagnosticsCoreError> {
        if requested_ms == 0 || requested_ms > MAX_DEBUG_MODE_MS { return Err(DiagnosticsCoreError::BoundaryRejected); }
        self.debug_until_ms = Some(now_ms.saturating_add(requested_ms));
        Ok(self.debug_state(now_ms))
    }

    pub fn disable_debug(&mut self) { self.debug_until_ms = None; }

    pub fn debug_state(&mut self, now_ms: u64) -> DebugModeState {
        if self.debug_until_ms.is_some_and(|deadline| deadline <= now_ms) { self.debug_until_ms = None; }
        DebugModeState { enabled: self.debug_until_ms.is_some(), enabled_until_ms: self.debug_until_ms }
    }

    pub fn push(
        &mut self,
        now_ms: u64,
        severity: LogSeverity,
        component: String,
        event_id: String,
        message: String,
        mut fields: BTreeMap<String, DiagnosticScalar>,
    ) -> Result<bool, DiagnosticsCoreError> {
        if severity == LogSeverity::Debug && !self.debug_state(now_ms).enabled { return Ok(false); }
        validate_id(&component)?;
        validate_id(&event_id)?;
        if message.is_empty() || message.len() > MAX_MESSAGE || message.chars().any(char::is_control) { return Err(DiagnosticsCoreError::BoundaryRejected); }
        validate_fields(&fields)?;
        sanitize_fields(&mut fields);
        let message = redact_text(&message);
        self.sequence = self.sequence.saturating_add(1);
        let entry = StructuredLogEntry { sequence: self.sequence, timestamp_ms: now_ms, severity, component, event_id, message, fields };
        let size = serde_json::to_vec(&entry).map_err(|_| DiagnosticsCoreError::BoundaryRejected)?.len();
        if size > MAX_LOG_BYTES { return Err(DiagnosticsCoreError::BoundaryRejected); }
        self.approximate_bytes = self.approximate_bytes.saturating_add(size);
        self.entries.push_back(entry);
        while self.entries.len() > MAX_LOG_ENTRIES || self.approximate_bytes > MAX_LOG_BYTES {
            let Some(old) = self.entries.pop_front() else { break; };
            let old_size = serde_json::to_vec(&old).map(|v| v.len()).unwrap_or(0);
            self.approximate_bytes = self.approximate_bytes.saturating_sub(old_size);
        }
        Ok(true)
    }

    pub fn snapshot(&mut self, now_ms: u64, limit: usize) -> (DebugModeState, Vec<StructuredLogEntry>) {
        let debug = self.debug_state(now_ms);
        let take = limit.min(MAX_LOG_ENTRIES);
        let entries = self.entries.iter().skip(self.entries.len().saturating_sub(take)).cloned().collect();
        (debug, entries)
    }
}

fn validate_fields(fields: &BTreeMap<String, DiagnosticScalar>) -> Result<(), DiagnosticsCoreError> {
    if fields.len() > 32 { return Err(DiagnosticsCoreError::BoundaryRejected); }
    const SECRET_FRAGMENTS: &[&str] = &["key", "token", "password", "secret", "authorization", "cookie", "nonce", "ciphertext", "document_id", "document_title"];
    for (key, value) in fields {
        validate_id(key)?;
        let lower = key.to_ascii_lowercase();
        if SECRET_FRAGMENTS.iter().any(|fragment| lower.contains(fragment)) { return Err(DiagnosticsCoreError::BoundaryRejected); }
        if let DiagnosticScalar::Text(text) = value {
            if text.len() > 256 || text.chars().any(char::is_control) { return Err(DiagnosticsCoreError::BoundaryRejected); }
        }
    }
    Ok(())
}


fn sanitize_fields(fields: &mut BTreeMap<String, DiagnosticScalar>) {
    for value in fields.values_mut() {
        if let DiagnosticScalar::Text(text) = value { *text = redact_text(text); }
    }
}

fn redact_text(input: &str) -> String {
    let mut tokens = Vec::new();
    let mut redact_following = 0usize;
    for token in input.split_whitespace() {
        let lower = token.to_ascii_lowercase();
        let normalized = lower.trim_matches(|ch: char| matches!(ch, ':' | ';' | ','));
        if redact_following > 0 {
            tokens.push("[REDACTED]".to_string());
            if normalized == "bearer" {
                redact_following = 1;
            } else {
                redact_following = redact_following.saturating_sub(1);
            }
            continue;
        }
        if normalized == "authorization" {
            tokens.push("[REDACTED]".to_string());
            redact_following = 2; // covers the common `Authorization: Bearer <credential>` form.
            continue;
        }
        if normalized == "bearer" {
            tokens.push("[REDACTED]".to_string());
            redact_following = 1;
            continue;
        }
        let sensitive = lower.starts_with("bearer=")
            || lower.starts_with("bearer:")
            || lower.starts_with("password=")
            || lower.starts_with("token=")
            || lower.starts_with("secret=")
            || lower.starts_with("authorization=")
            || looks_like_jwt(token);
        tokens.push(if sensitive { "[REDACTED]".to_string() } else { token.chars().take(128).collect() });
    }
    tokens.join(" ")
}

fn looks_like_jwt(value: &str) -> bool {
    let mut parts = value.split('.');
    match (parts.next(), parts.next(), parts.next(), parts.next()) {
        (Some(a), Some(b), Some(c), None) => a.len() >= 8 && b.len() >= 8 && c.len() >= 8 && [a,b,c].iter().all(|part| part.bytes().all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, b'-' | b'_'))),
        _ => false,
    }
}
