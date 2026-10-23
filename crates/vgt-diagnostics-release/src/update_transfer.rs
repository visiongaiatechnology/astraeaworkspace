use crate::DiagnosticsCoreError;
use serde::{Deserialize, Serialize};

pub const MAX_UPDATE_TRANSFER_BYTES: u64 = 4 * 1024 * 1024 * 1024;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum UpdatePayloadKind { Full, Delta }

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TransferPhase { Active, Paused, Complete }

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct UpdateTransferCheckpoint {
    pub schema: String,
    pub transfer_id: String,
    pub payload_kind: UpdatePayloadKind,
    pub artifact_file_name: String,
    pub expected_bytes: u64,
    pub received_bytes: u64,
    pub expected_sha256: String,
    pub phase: TransferPhase,
    pub requires_manifest_signature_verification: bool,
    pub requires_package_signature_verification: bool,
}

impl UpdateTransferCheckpoint {
    pub fn new(transfer_id: String, payload_kind: UpdatePayloadKind, artifact_file_name: String, expected_bytes: u64, expected_sha256: String) -> Result<Self, DiagnosticsCoreError> {
        if transfer_id.is_empty() || transfer_id.len() > 96 || !transfer_id.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b'-')) || artifact_file_name.is_empty() || artifact_file_name.len() > 192 || artifact_file_name.contains('/') || artifact_file_name.contains('\\') || artifact_file_name.chars().any(char::is_control) || expected_bytes == 0 || expected_bytes > MAX_UPDATE_TRANSFER_BYTES || expected_sha256.len() != 64 || !expected_sha256.bytes().all(|b| b.is_ascii_hexdigit()) {
            return Err(DiagnosticsCoreError::BoundaryRejected);
        }
        Ok(Self {
            schema: "vgt.update.transfer/1".into(), transfer_id, payload_kind, artifact_file_name, expected_bytes, received_bytes: 0,
            expected_sha256: expected_sha256.to_ascii_lowercase(), phase: TransferPhase::Active,
            requires_manifest_signature_verification: true, requires_package_signature_verification: true,
        })
    }

    pub fn record_contiguous_bytes(&mut self, offset: u64, length: u64) -> Result<(), DiagnosticsCoreError> {
        if self.phase != TransferPhase::Active || offset != self.received_bytes || length == 0 { return Err(DiagnosticsCoreError::BoundaryRejected); }
        let next = self.received_bytes.checked_add(length).ok_or(DiagnosticsCoreError::BoundaryRejected)?;
        if next > self.expected_bytes { return Err(DiagnosticsCoreError::BoundaryRejected); }
        self.received_bytes = next;
        if next == self.expected_bytes { self.phase = TransferPhase::Complete; }
        Ok(())
    }

    pub fn pause(&mut self) -> Result<(), DiagnosticsCoreError> {
        if self.phase != TransferPhase::Active { return Err(DiagnosticsCoreError::BoundaryRejected); }
        self.phase = TransferPhase::Paused; Ok(())
    }

    pub fn resume(&mut self) -> Result<(), DiagnosticsCoreError> {
        if self.phase != TransferPhase::Paused { return Err(DiagnosticsCoreError::BoundaryRejected); }
        self.phase = TransferPhase::Active; Ok(())
    }

    pub fn ready_for_security_verification(&self) -> bool {
        self.phase == TransferPhase::Complete && self.received_bytes == self.expected_bytes
            && self.requires_manifest_signature_verification && self.requires_package_signature_verification
    }
}
