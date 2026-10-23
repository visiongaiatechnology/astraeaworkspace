// STATUS: DIAMANT VGT SUPREME
//! Tamper-resistant KeyVault security audit chain. Records contain only bounded
//! identifiers/digests and stable result codes. Every record is HMAC-SHA256 chained;
//! credentials, raw keys, plaintext/ciphertext bodies and exception strings are excluded.

use crate::{lifecycle::document_digest, KeySlotType, KeyVaultError};
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use std::collections::VecDeque;
use std::time::{SystemTime, UNIX_EPOCH};
use vgt_crypto::{constant_time_eq, generate_random_bytes, zeroize_best_effort};

pub const MAX_KEYVAULT_AUDIT_RECORDS: usize = 4096;
type HmacSha256 = Hmac<Sha256>;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum KeyVaultAuditAction {
    SlotAdded,
    SlotRemoved,
    DeviceRevoked,
    RecipientRevoked,
    PinRotated,
    PasswordRotated,
    HardwareSlotCreated,
    RecoveryPolicyChanged,
    DocumentUnlocked,
    DocumentLocked,
    DocumentKeyUsed,
    RootEnsured,
    DomainSecretSealed,
    DomainSecretUnsealed,
    AuthorizationMinted,
    AuthorizationVerified,
    BreakGlassSharesCreated,
    BreakGlassRecovered,
    RootRotated,
}

impl KeyVaultAuditAction {
    const fn code(self) -> u8 {
        self as u8
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct KeyVaultAuditRecord {
    pub version: u8,
    pub sequence: u64,
    pub event_id: String,
    pub timestamp_unix: u64,
    pub document_id_digest_blake3: [u8; 32],
    pub action: KeyVaultAuditAction,
    pub slot_type: Option<KeySlotType>,
    pub slot_id: Option<u32>,
    pub success: bool,
    pub result_code: String,
    pub previous_hmac_sha256: [u8; 32],
    pub hmac_sha256: [u8; 32],
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct KeyVaultAuditSnapshot {
    pub version: u8,
    pub anchor_hmac_sha256: [u8; 32],
    pub terminal_sequence: u64,
    pub terminal_hmac_sha256: [u8; 32],
    pub records: Vec<KeyVaultAuditRecord>,
}

#[derive(Debug)]
pub(crate) struct KeyVaultAuditTrail {
    records: VecDeque<KeyVaultAuditRecord>,
    chain_key: [u8; 32],
    anchor_hmac: [u8; 32],
    next_sequence: u64,
}

impl Default for KeyVaultAuditTrail {
    fn default() -> Self {
        Self {
            records: VecDeque::new(),
            chain_key: generate_random_bytes::<32>(),
            anchor_hmac: [0u8; 32],
            next_sequence: 1,
        }
    }
}

impl Drop for KeyVaultAuditTrail {
    fn drop(&mut self) {
        zeroize_best_effort(&mut self.chain_key);
    }
}

impl KeyVaultAuditTrail {
    pub(crate) fn push(
        &mut self,
        document_id: &str,
        action: KeyVaultAuditAction,
        slot_type: Option<KeySlotType>,
        slot_id: Option<u32>,
        success: bool,
        result_code: &'static str,
    ) -> Result<KeyVaultAuditRecord, KeyVaultError> {
        if result_code.is_empty()
            || result_code.len() > 96
            || !result_code
                .bytes()
                .all(|byte| byte.is_ascii_uppercase() || byte.is_ascii_digit() || byte == b'_')
        {
            return Err(KeyVaultError::IntegrityFailed);
        }
        let previous_hmac = self
            .records
            .back()
            .map(|record| record.hmac_sha256)
            .unwrap_or(self.anchor_hmac);
        let mut record = KeyVaultAuditRecord {
            version: 2,
            sequence: self.next_sequence,
            event_id: random_event_id(),
            timestamp_unix: unix_now(),
            document_id_digest_blake3: document_digest(document_id)?,
            action,
            slot_type,
            slot_id,
            success,
            result_code: result_code.to_string(),
            previous_hmac_sha256: previous_hmac,
            hmac_sha256: [0u8; 32],
        };
        record.hmac_sha256 = compute_record_hmac(&self.chain_key, &record)?;
        self.next_sequence = self
            .next_sequence
            .checked_add(1)
            .ok_or(KeyVaultError::IntegrityFailed)?;
        if self.records.len() >= MAX_KEYVAULT_AUDIT_RECORDS {
            if let Some(removed) = self.records.pop_front() {
                self.anchor_hmac = removed.hmac_sha256;
            }
        }
        self.records.push_back(record.clone());
        Ok(record)
    }

    pub(crate) fn snapshot(&self, max_records: usize) -> Vec<KeyVaultAuditRecord> {
        let take = max_records
            .min(MAX_KEYVAULT_AUDIT_RECORDS)
            .min(self.records.len());
        self.records.iter().rev().take(take).cloned().collect()
    }

    pub(crate) fn chain_snapshot(&self) -> KeyVaultAuditSnapshot {
        let terminal_sequence = self.records.back().map(|r| r.sequence).unwrap_or(0);
        let terminal_hmac_sha256 = self
            .records
            .back()
            .map(|r| r.hmac_sha256)
            .unwrap_or(self.anchor_hmac);
        KeyVaultAuditSnapshot {
            version: 1,
            anchor_hmac_sha256: self.anchor_hmac,
            terminal_sequence,
            terminal_hmac_sha256,
            records: self.records.iter().cloned().collect(),
        }
    }

    pub(crate) fn verify_snapshot(
        &self,
        snapshot: &KeyVaultAuditSnapshot,
    ) -> Result<(), KeyVaultError> {
        if snapshot.version != 1 {
            return Err(KeyVaultError::IntegrityFailed);
        }
        let mut previous = snapshot.anchor_hmac_sha256;
        let mut expected_sequence = snapshot.records.first().map(|r| r.sequence).unwrap_or(0);
        for record in &snapshot.records {
            if record.version != 2
                || record.sequence != expected_sequence
                || !constant_time_eq(&record.previous_hmac_sha256, &previous)
            {
                return Err(KeyVaultError::IntegrityFailed);
            }
            let expected_hmac = compute_record_hmac(&self.chain_key, record)?;
            if !constant_time_eq(&record.hmac_sha256, &expected_hmac) {
                return Err(KeyVaultError::IntegrityFailed);
            }
            previous = record.hmac_sha256;
            expected_sequence = expected_sequence
                .checked_add(1)
                .ok_or(KeyVaultError::IntegrityFailed)?;
        }
        let actual_terminal_sequence = snapshot.records.last().map(|r| r.sequence).unwrap_or(0);
        let actual_terminal_hmac = snapshot
            .records
            .last()
            .map(|r| r.hmac_sha256)
            .unwrap_or(snapshot.anchor_hmac_sha256);
        if actual_terminal_sequence != snapshot.terminal_sequence
            || !constant_time_eq(&actual_terminal_hmac, &snapshot.terminal_hmac_sha256)
        {
            return Err(KeyVaultError::IntegrityFailed);
        }
        Ok(())
    }
}

fn compute_record_hmac(
    key: &[u8; 32],
    record: &KeyVaultAuditRecord,
) -> Result<[u8; 32], KeyVaultError> {
    let canonical = canonical_record_bytes(record)?;
    let mut mac = HmacSha256::new_from_slice(key).map_err(|_| KeyVaultError::IntegrityFailed)?;
    mac.update(&canonical);
    let bytes = mac.finalize().into_bytes();
    let mut out = [0u8; 32];
    out.copy_from_slice(&bytes);
    Ok(out)
}

fn canonical_record_bytes(record: &KeyVaultAuditRecord) -> Result<Vec<u8>, KeyVaultError> {
    if record.event_id.len() != 32 || !record.event_id.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err(KeyVaultError::IntegrityFailed);
    }
    let mut out = Vec::with_capacity(256);
    out.push(record.version);
    out.extend_from_slice(&record.sequence.to_le_bytes());
    out.extend_from_slice(record.event_id.as_bytes());
    out.extend_from_slice(&record.timestamp_unix.to_le_bytes());
    out.extend_from_slice(&record.document_id_digest_blake3);
    out.push(record.action.code());
    out.push(record.slot_type.map(slot_type_code).unwrap_or(0xff));
    out.extend_from_slice(&record.slot_id.unwrap_or(u32::MAX).to_le_bytes());
    out.push(u8::from(record.success));
    out.extend_from_slice(&(record.result_code.len() as u16).to_le_bytes());
    out.extend_from_slice(record.result_code.as_bytes());
    out.extend_from_slice(&record.previous_hmac_sha256);
    Ok(out)
}

fn slot_type_code(value: KeySlotType) -> u8 {
    match value {
        KeySlotType::LocalDevice => 0,
        KeySlotType::MasterWithPin => 1,
        KeySlotType::PortablePassword => 2,
        KeySlotType::RecipientPublicKey => 3,
        KeySlotType::HardwareBacked => 4,
    }
}

fn random_event_id() -> String {
    let bytes = generate_random_bytes::<16>();
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut output = String::with_capacity(32);
    for byte in bytes {
        output.push(HEX[(byte >> 4) as usize] as char);
        output.push(HEX[(byte & 0x0f) as usize] as char);
    }
    output
}

fn unix_now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sec020_middle_deletion_is_detected() {
        let mut trail = KeyVaultAuditTrail::default();
        for index in 0..5 {
            trail
                .push(
                    &format!("doc-{index}"),
                    KeyVaultAuditAction::DocumentKeyUsed,
                    None,
                    None,
                    true,
                    "KEYVAULT_KEY_USED",
                )
                .unwrap();
        }
        let mut snapshot = trail.chain_snapshot();
        trail.verify_snapshot(&snapshot).unwrap();
        snapshot.records.remove(2);
        assert!(matches!(
            trail.verify_snapshot(&snapshot),
            Err(KeyVaultError::IntegrityFailed)
        ));
    }

    #[test]
    fn sec020_record_tamper_is_detected() {
        let mut trail = KeyVaultAuditTrail::default();
        trail
            .push(
                "doc-a",
                KeyVaultAuditAction::DocumentUnlocked,
                None,
                None,
                true,
                "KEYVAULT_DOCUMENT_UNLOCKED",
            )
            .unwrap();
        trail
            .push(
                "doc-a",
                KeyVaultAuditAction::DocumentKeyUsed,
                None,
                None,
                true,
                "KEYVAULT_KEY_USED",
            )
            .unwrap();
        let mut snapshot = trail.chain_snapshot();
        snapshot.records[0].success = false;
        assert!(trail.verify_snapshot(&snapshot).is_err());
    }

    #[test]
    fn sec020_tail_deletion_is_detected_by_terminal_commitment() {
        let mut trail = KeyVaultAuditTrail::default();
        for index in 0..3 {
            trail
                .push(
                    &format!("doc-{index}"),
                    KeyVaultAuditAction::DocumentKeyUsed,
                    None,
                    None,
                    true,
                    "KEYVAULT_KEY_USED",
                )
                .unwrap();
        }
        let mut snapshot = trail.chain_snapshot();
        snapshot.records.pop();
        assert!(trail.verify_snapshot(&snapshot).is_err());
    }
}
