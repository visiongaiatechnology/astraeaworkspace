// STATUS: DIAMANT VGT SUPREME
//! Authenticated slot mutation transactions. Rotation rewraps the existing document DEK;
//! it does not decrypt/re-encrypt document content. Every successful slot mutation is audited.

use crate::{
    audit::KeyVaultAuditAction, lifecycle::document_digest, KeySlot, KeySlotType, KeyVaultError,
    UnlockPolicy, VgtKeyVault,
};
use serde::{Deserialize, Serialize};
use vgt_crypto::{
    confidential_content_fingerprint, constant_time_eq, generate_random_bytes, zeroize_best_effort,
    KEY_SIZE,
};

pub const KEY_SLOT_TRANSACTION_VERSION: u16 = 1;
pub const MAX_SLOTS_PER_DOCUMENT: usize = 64;

#[repr(u32)]
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum KeySlotMutationKind {
    PinRotation,
    PasswordRotation,
    RecipientAdd,
    SlotRemove,
    DeviceRevoke,
    RecipientRevoke,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct KeySlotTransactionReceipt {
    pub version: u16,
    pub operation_id: String,
    pub document_id_digest_blake3: [u8; 32],
    pub mutation: KeySlotMutationKind,
    pub before_slots_tag: [u8; 32],
    pub after_slots_tag: [u8; 32],
    pub transaction_auth_tag: [u8; 32],
}

impl VgtKeyVault {
    pub fn rotate_pin_slot(
        &mut self,
        document_id: &str,
        slots: &[KeySlot],
        old_pin: &str,
        new_pin: &str,
    ) -> Result<(Vec<KeySlot>, KeySlotTransactionReceipt), KeyVaultError> {
        let mut dek = self.unlock_dek_with_pin_for_document(document_id, slots, old_pin)?;
        let result = (|| {
            crate::validate_pin_format(new_pin)?;
            let replacement = self
                .create_slots_for_policy_scoped(
                    &dek,
                    UnlockPolicy::DeviceAndPin,
                    Some(new_pin),
                    None,
                    None,
                    Some(document_id),
                )?
                .into_iter()
                .next()
                .ok_or(KeyVaultError::IntegrityFailed)?;
            let after = replace_slot_type(slots, KeySlotType::MasterWithPin, replacement)?;
            let receipt = authenticated_receipt(
                document_id,
                KeySlotMutationKind::PinRotation,
                slots,
                &after,
                &dek,
            )?;
            self.audit_slot_event(
                document_id,
                KeyVaultAuditAction::PinRotated,
                Some(KeySlotType::MasterWithPin),
                Some(1),
                true,
                "KEYVAULT_PIN_ROTATED",
            )?;
            Ok((after, receipt))
        })();
        zeroize_best_effort(&mut dek);
        result
    }

    pub fn rotate_password_slot(
        &mut self,
        document_id: &str,
        slots: &[KeySlot],
        old_password: &str,
        new_password: &str,
    ) -> Result<(Vec<KeySlot>, KeySlotTransactionReceipt), KeyVaultError> {
        let mut dek = Self::unlock_dek_with_password(slots, old_password)?;
        let result = (|| {
            crate::validate_portable_password_format(new_password)?;
            let replacement = self
                .create_slots_for_policy_scoped(
                    &dek,
                    UnlockPolicy::PortablePasswordOnly,
                    None,
                    Some(new_password),
                    None,
                    Some(document_id),
                )?
                .into_iter()
                .next()
                .ok_or(KeyVaultError::IntegrityFailed)?;
            let after = replace_slot_type(slots, KeySlotType::PortablePassword, replacement)?;
            let receipt = authenticated_receipt(
                document_id,
                KeySlotMutationKind::PasswordRotation,
                slots,
                &after,
                &dek,
            )?;
            self.audit_slot_event(
                document_id,
                KeyVaultAuditAction::PasswordRotated,
                Some(KeySlotType::PortablePassword),
                Some(2),
                true,
                "KEYVAULT_PASSWORD_ROTATED",
            )?;
            Ok((after, receipt))
        })();
        zeroize_best_effort(&mut dek);
        result
    }

    pub fn add_recipient_slot_authenticated(
        &mut self,
        document_id: &str,
        slots: &[KeySlot],
        dek: &[u8; KEY_SIZE],
        recipient_public_key: &[u8; 32],
    ) -> Result<(Vec<KeySlot>, KeySlotTransactionReceipt), KeyVaultError> {
        validate_slot_set(slots)?;
        if slots.len() >= MAX_SLOTS_PER_DOCUMENT {
            return Err(KeyVaultError::PolicyViolation);
        }
        let mut slot = self
            .create_slots_for_policy_scoped(
                dek,
                UnlockPolicy::RecipientOnly,
                None,
                None,
                Some(recipient_public_key),
                Some(document_id),
            )?
            .into_iter()
            .next()
            .ok_or(KeyVaultError::IntegrityFailed)?;
        slot.slot_id = next_slot_id(slots)?;
        let mut after = slots.to_vec();
        after.push(slot.clone());
        validate_slot_set(&after)?;
        let receipt = authenticated_receipt(
            document_id,
            KeySlotMutationKind::RecipientAdd,
            slots,
            &after,
            dek,
        )?;
        self.audit_slot_event(
            document_id,
            KeyVaultAuditAction::SlotAdded,
            Some(KeySlotType::RecipientPublicKey),
            Some(slot.slot_id),
            true,
            "KEYVAULT_SLOT_ADDED",
        )?;
        Ok((after, receipt))
    }

    pub fn remove_slot_authenticated(
        &mut self,
        document_id: &str,
        slots: &[KeySlot],
        dek: &[u8; KEY_SIZE],
        slot_id: u32,
    ) -> Result<(Vec<KeySlot>, KeySlotTransactionReceipt), KeyVaultError> {
        validate_slot_set(slots)?;
        let removed = slots
            .iter()
            .find(|slot| slot.slot_id == slot_id)
            .ok_or(KeyVaultError::AuthenticationFailed)?;
        if slots.len() <= 1 {
            return Err(KeyVaultError::PolicyViolation);
        }
        let after = slots
            .iter()
            .filter(|slot| slot.slot_id != slot_id)
            .cloned()
            .collect::<Vec<_>>();
        validate_slot_set(&after)?;
        let mutation = match removed.slot_type {
            KeySlotType::LocalDevice | KeySlotType::HardwareBacked => {
                KeySlotMutationKind::DeviceRevoke
            }
            KeySlotType::RecipientPublicKey => KeySlotMutationKind::RecipientRevoke,
            _ => KeySlotMutationKind::SlotRemove,
        };
        let receipt = authenticated_receipt(document_id, mutation, slots, &after, dek)?;
        let action = match mutation {
            KeySlotMutationKind::DeviceRevoke => KeyVaultAuditAction::DeviceRevoked,
            KeySlotMutationKind::RecipientRevoke => KeyVaultAuditAction::RecipientRevoked,
            _ => KeyVaultAuditAction::SlotRemoved,
        };
        self.audit_slot_event(
            document_id,
            action,
            Some(removed.slot_type),
            Some(slot_id),
            true,
            "KEYVAULT_SLOT_REMOVED",
        )?;
        Ok((after, receipt))
    }

    pub fn verify_slot_transaction_receipt(
        &self,
        document_id: &str,
        receipt: &KeySlotTransactionReceipt,
        dek: &[u8; KEY_SIZE],
    ) -> Result<(), KeyVaultError> {
        if receipt.version != KEY_SLOT_TRANSACTION_VERSION
            || receipt.operation_id.len() != 32
            || !receipt
                .operation_id
                .bytes()
                .all(|byte| byte.is_ascii_hexdigit())
            || !constant_time_eq(
                &receipt.document_id_digest_blake3,
                &document_digest(document_id)?,
            )
        {
            return Err(KeyVaultError::IntegrityFailed);
        }
        let canonical = receipt_auth_body(receipt);
        let expected = confidential_content_fingerprint(dek, &canonical);
        if !constant_time_eq(&expected, &receipt.transaction_auth_tag) {
            return Err(KeyVaultError::IntegrityFailed);
        }
        Ok(())
    }
}

fn replace_slot_type(
    slots: &[KeySlot],
    slot_type: KeySlotType,
    replacement: KeySlot,
) -> Result<Vec<KeySlot>, KeyVaultError> {
    validate_slot_set(slots)?;
    let matches = slots
        .iter()
        .filter(|slot| slot.slot_type == slot_type)
        .count();
    if matches != 1 {
        return Err(KeyVaultError::AuthenticationFailed);
    }
    let mut after = slots.to_vec();
    for slot in &mut after {
        if slot.slot_type == slot_type {
            *slot = replacement.clone();
        }
    }
    validate_slot_set(&after)?;
    Ok(after)
}

fn validate_slot_set(slots: &[KeySlot]) -> Result<(), KeyVaultError> {
    if slots.is_empty() || slots.len() > MAX_SLOTS_PER_DOCUMENT {
        return Err(KeyVaultError::PolicyViolation);
    }
    let mut ids = std::collections::HashSet::with_capacity(slots.len());
    for slot in slots {
        if !ids.insert(slot.slot_id) {
            return Err(KeyVaultError::IntegrityFailed);
        }
    }
    Ok(())
}

fn next_slot_id(slots: &[KeySlot]) -> Result<u32, KeyVaultError> {
    slots
        .iter()
        .map(|slot| slot.slot_id)
        .max()
        .unwrap_or(0)
        .checked_add(1)
        .ok_or(KeyVaultError::PolicyViolation)
}

fn authenticated_receipt(
    document_id: &str,
    mutation: KeySlotMutationKind,
    before: &[KeySlot],
    after: &[KeySlot],
    dek: &[u8; KEY_SIZE],
) -> Result<KeySlotTransactionReceipt, KeyVaultError> {
    validate_slot_set(before)?;
    validate_slot_set(after)?;
    let before_bytes = serde_json::to_vec(before).map_err(|_| KeyVaultError::IntegrityFailed)?;
    let after_bytes = serde_json::to_vec(after).map_err(|_| KeyVaultError::IntegrityFailed)?;
    let before_slots_tag = confidential_content_fingerprint(dek, &before_bytes);
    let after_slots_tag = confidential_content_fingerprint(dek, &after_bytes);
    let mut receipt = KeySlotTransactionReceipt {
        version: KEY_SLOT_TRANSACTION_VERSION,
        operation_id: random_operation_id(),
        document_id_digest_blake3: document_digest(document_id)?,
        mutation,
        before_slots_tag,
        after_slots_tag,
        transaction_auth_tag: [0u8; 32],
    };
    receipt.transaction_auth_tag =
        confidential_content_fingerprint(dek, &receipt_auth_body(&receipt));
    Ok(receipt)
}

fn receipt_auth_body(receipt: &KeySlotTransactionReceipt) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(2 + 32 + 32 + 32 + 32 + 4);
    bytes.extend_from_slice(&receipt.version.to_le_bytes());
    bytes.extend_from_slice(receipt.operation_id.as_bytes());
    bytes.extend_from_slice(&receipt.document_id_digest_blake3);
    bytes.extend_from_slice(&(receipt.mutation as u32).to_le_bytes());
    bytes.extend_from_slice(&receipt.before_slots_tag);
    bytes.extend_from_slice(&receipt.after_slots_tag);
    bytes
}

fn random_operation_id() -> String {
    let bytes = generate_random_bytes::<16>();
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut output = String::with_capacity(32);
    for byte in bytes {
        output.push(HEX[(byte >> 4) as usize] as char);
        output.push(HEX[(byte & 0x0f) as usize] as char);
    }
    output
}
