// STATUS: DIAMANT VGT SUPREME
//! Explicit KeyVault slot policies. Device+PIN is a cryptographic AND construction;
//! hardware-backed slots are accepted only from a provider with verified key-bound attestation.

use crate::{
    lifecycle::{document_digest, validate_document_id},
    storage, validate_pin_format, validate_portable_password_format, KeyVaultError, VgtKeyVault,
};
use serde::{Deserialize, Serialize};
use vgt_crypto::{
    constant_time_eq, decrypt_aes_gcm, derive_envelope_unlock_key, derive_key_from_pin,
    encrypt_aes_gcm, unwrap_dek_for_x25519_recipient, wrap_dek_for_x25519_recipient,
    zeroize_best_effort, CryptoParameters, X25519RecipientEnvelope, KEY_SIZE, NONCE_SIZE,
};

pub fn parse_x25519_key_material(input: &str) -> Result<[u8; 32], KeyVaultError> {
    let normalized = input.trim().strip_prefix("x25519:").unwrap_or(input.trim());
    if normalized.len() != 64 || !normalized.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(KeyVaultError::InvalidCredentialFormat);
    }
    let mut key = [0u8; 32];
    for (index, byte) in key.iter_mut().enumerate() {
        *byte = u8::from_str_radix(&normalized[index * 2..index * 2 + 2], 16)
            .map_err(|_| KeyVaultError::InvalidCredentialFormat)?;
    }
    if key.iter().all(|byte| *byte == 0) {
        return Err(KeyVaultError::InvalidCredentialFormat);
    }
    Ok(key)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum UnlockPolicy {
    DeviceOnly,
    DeviceAndPin,
    PortablePasswordOnly,
    RecipientOnly,
    HardwareBackedOnly,
    DeviceOrPortablePassword,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct KeySlot {
    pub slot_id: u32,
    pub slot_type: KeySlotType,
    pub encrypted_dek: Vec<u8>,
    pub nonce: [u8; NONCE_SIZE],
    pub kdf_params: Option<CryptoParameters>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub recipient: Option<X25519RecipientEnvelope>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hardware: Option<storage::HardwareSealedDek>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum KeySlotType {
    LocalDevice,
    MasterWithPin,
    PortablePassword,
    RecipientPublicKey,
    HardwareBacked,
}

impl VgtKeyVault {
    pub fn create_slots_for_policy(
        &mut self,
        dek: &[u8; KEY_SIZE],
        policy: UnlockPolicy,
        pin: Option<&str>,
        portable_password: Option<&str>,
    ) -> Result<Vec<KeySlot>, KeyVaultError> {
        self.create_slots_for_policy_scoped(dek, policy, pin, portable_password, None, None)
    }

    pub fn create_slots_for_policy_with_recipient(
        &mut self,
        dek: &[u8; KEY_SIZE],
        policy: UnlockPolicy,
        pin: Option<&str>,
        portable_password: Option<&str>,
        recipient_public_key: Option<&[u8; 32]>,
    ) -> Result<Vec<KeySlot>, KeyVaultError> {
        self.create_slots_for_policy_scoped(
            dek,
            policy,
            pin,
            portable_password,
            recipient_public_key,
            None,
        )
    }

    pub fn create_slots_for_policy_scoped(
        &mut self,
        dek: &[u8; KEY_SIZE],
        policy: UnlockPolicy,
        pin: Option<&str>,
        portable_password: Option<&str>,
        recipient_public_key: Option<&[u8; 32]>,
        document_id: Option<&str>,
    ) -> Result<Vec<KeySlot>, KeyVaultError> {
        let has_pin = pin.is_some_and(|value| !value.is_empty());
        let has_password = portable_password.is_some_and(|value| !value.is_empty());
        match policy {
            UnlockPolicy::RecipientOnly
                if has_pin || has_password || recipient_public_key.is_none() =>
            {
                return Err(KeyVaultError::InvalidCredentialFormat)
            }
            UnlockPolicy::HardwareBackedOnly
                if has_pin
                    || has_password
                    || recipient_public_key.is_some()
                    || document_id.is_none() =>
            {
                return Err(KeyVaultError::InvalidCredentialFormat)
            }
            UnlockPolicy::DeviceOnly
            | UnlockPolicy::DeviceAndPin
            | UnlockPolicy::PortablePasswordOnly
            | UnlockPolicy::DeviceOrPortablePassword
                if recipient_public_key.is_some() =>
            {
                return Err(KeyVaultError::InvalidCredentialFormat)
            }
            _ => {}
        }

        let mut slots = Vec::new();
        match policy {
            UnlockPolicy::DeviceOnly => {
                let wmk = self.workspace_root()?;
                let (encrypted_dek, nonce) = encrypt_aes_gcm(dek, wmk, b"slot_local_v1")?;
                slots.push(software_slot(
                    0,
                    KeySlotType::LocalDevice,
                    encrypted_dek,
                    nonce,
                    None,
                ));
            }
            UnlockPolicy::DeviceAndPin => {
                let pin = pin
                    .filter(|value| !value.is_empty())
                    .ok_or(KeyVaultError::AuthenticationFailed)?;
                validate_pin_format(pin)?;
                let wmk = self.workspace_root()?;
                let params = keyvault_kdf_params();
                let mut pin_secret = derive_key_from_pin(pin, &params.kdf_salt, &params)?;
                let mut unlock_key =
                    derive_envelope_unlock_key(wmk, &pin_secret, b"vgt_slot_pin_v1")?;
                zeroize_best_effort(&mut pin_secret);
                let encrypted = encrypt_aes_gcm(dek, &unlock_key, b"slot_pin_v1");
                zeroize_best_effort(&mut unlock_key);
                let (encrypted_dek, nonce) = encrypted?;
                // Intentionally one slot only: no LocalDevice bypass exists for DeviceAndPin.
                slots.push(software_slot(
                    1,
                    KeySlotType::MasterWithPin,
                    encrypted_dek,
                    nonce,
                    Some(params),
                ));
            }
            UnlockPolicy::PortablePasswordOnly => {
                let password = portable_password
                    .filter(|value| !value.is_empty())
                    .ok_or(KeyVaultError::AuthenticationFailed)?;
                validate_portable_password_format(password)?;
                let params = keyvault_kdf_params();
                let mut password_key = derive_key_from_pin(password, &params.kdf_salt, &params)?;
                let encrypted = encrypt_aes_gcm(dek, &password_key, b"slot_portable_v1");
                zeroize_best_effort(&mut password_key);
                let (encrypted_dek, nonce) = encrypted?;
                slots.push(software_slot(
                    2,
                    KeySlotType::PortablePassword,
                    encrypted_dek,
                    nonce,
                    Some(params),
                ));
            }
            UnlockPolicy::DeviceOrPortablePassword => {
                let wmk = self.workspace_root()?;
                let (encrypted_dek, nonce) = encrypt_aes_gcm(dek, wmk, b"slot_local_v1")?;
                slots.push(software_slot(
                    0,
                    KeySlotType::LocalDevice,
                    encrypted_dek,
                    nonce,
                    None,
                ));
                if let Some(password) = portable_password.filter(|value| !value.is_empty()) {
                    validate_portable_password_format(password)?;
                    let params = keyvault_kdf_params();
                    let mut password_key =
                        derive_key_from_pin(password, &params.kdf_salt, &params)?;
                    let encrypted = encrypt_aes_gcm(dek, &password_key, b"slot_portable_v1");
                    zeroize_best_effort(&mut password_key);
                    let (encrypted_dek, nonce) = encrypted?;
                    slots.push(software_slot(
                        2,
                        KeySlotType::PortablePassword,
                        encrypted_dek,
                        nonce,
                        Some(params),
                    ));
                }
            }
            UnlockPolicy::RecipientOnly => {
                let recipient =
                    recipient_public_key.ok_or(KeyVaultError::InvalidCredentialFormat)?;
                let envelope = wrap_dek_for_x25519_recipient(dek, recipient)?;
                slots.push(KeySlot {
                    slot_id: 3,
                    slot_type: KeySlotType::RecipientPublicKey,
                    encrypted_dek: envelope.encrypted_dek.clone(),
                    nonce: envelope.nonce,
                    kdf_params: None,
                    recipient: Some(envelope),
                    hardware: None,
                });
            }
            UnlockPolicy::HardwareBackedOnly => {
                let document_id = document_id.ok_or(KeyVaultError::InvalidCredentialFormat)?;
                validate_document_id(document_id)?;
                let account = hardware_account(document_id)?;
                let aad = hardware_slot_aad(document_id)?;
                let envelope = storage::seal_hardware_backed_dek(&account, dek, &aad)?;
                slots.push(KeySlot {
                    slot_id: 4,
                    slot_type: KeySlotType::HardwareBacked,
                    encrypted_dek: envelope.sealed_dek.clone(),
                    nonce: [0u8; NONCE_SIZE],
                    kdf_params: None,
                    recipient: None,
                    hardware: Some(envelope),
                });
            }
        }
        Ok(slots)
    }

    pub fn create_slots_for_document(
        &mut self,
        dek: &[u8; KEY_SIZE],
        pin: Option<&str>,
        portable_password: Option<&str>,
    ) -> Result<Vec<KeySlot>, KeyVaultError> {
        let policy = if pin.is_some_and(|value| !value.is_empty()) {
            UnlockPolicy::DeviceAndPin
        } else if portable_password.is_some_and(|value| !value.is_empty()) {
            UnlockPolicy::PortablePasswordOnly
        } else {
            UnlockPolicy::DeviceOnly
        };
        self.create_slots_for_policy(dek, policy, pin, portable_password)
    }

    pub fn unlock_dek_local(&self, slots: &[KeySlot]) -> Result<[u8; KEY_SIZE], KeyVaultError> {
        let wmk = self
            .workspace_master_key
            .as_ref()
            .ok_or(KeyVaultError::VaultLocked)?;
        let slot = slots
            .iter()
            .find(|slot| slot.slot_type == KeySlotType::LocalDevice)
            .ok_or(KeyVaultError::AuthenticationFailed)?;
        decode_dek(decrypt_aes_gcm(
            &slot.encrypted_dek,
            &slot.nonce,
            wmk.as_bytes(),
            b"slot_local_v1",
        ))
    }

    pub(crate) fn unlock_dek_with_pin(
        &self,
        slots: &[KeySlot],
        pin: &str,
    ) -> Result<[u8; KEY_SIZE], KeyVaultError> {
        validate_pin_format(pin)?;
        let wmk = self
            .workspace_master_key
            .as_ref()
            .ok_or(KeyVaultError::VaultLocked)?;
        let slot = slots
            .iter()
            .find(|slot| slot.slot_type == KeySlotType::MasterWithPin)
            .ok_or(KeyVaultError::AuthenticationFailed)?;
        let params = slot
            .kdf_params
            .as_ref()
            .ok_or(KeyVaultError::AuthenticationFailed)?;
        let mut pin_secret = derive_key_from_pin(pin, &params.kdf_salt, params)
            .map_err(|_| KeyVaultError::AuthenticationFailed)?;
        let mut unlock_key =
            derive_envelope_unlock_key(wmk.as_bytes(), &pin_secret, b"vgt_slot_pin_v1")
                .map_err(|_| KeyVaultError::AuthenticationFailed)?;
        zeroize_best_effort(&mut pin_secret);
        let decrypted = decrypt_aes_gcm(
            &slot.encrypted_dek,
            &slot.nonce,
            &unlock_key,
            b"slot_pin_v1",
        );
        zeroize_best_effort(&mut unlock_key);
        decode_dek(decrypted)
    }

    pub fn unlock_dek_with_password(
        slots: &[KeySlot],
        password: &str,
    ) -> Result<[u8; KEY_SIZE], KeyVaultError> {
        validate_portable_password_format(password)?;
        let slot = slots
            .iter()
            .find(|slot| slot.slot_type == KeySlotType::PortablePassword)
            .ok_or(KeyVaultError::AuthenticationFailed)?;
        let params = slot
            .kdf_params
            .as_ref()
            .ok_or(KeyVaultError::AuthenticationFailed)?;
        let mut password_key = derive_key_from_pin(password, &params.kdf_salt, params)
            .map_err(|_| KeyVaultError::AuthenticationFailed)?;
        let decrypted = decrypt_aes_gcm(
            &slot.encrypted_dek,
            &slot.nonce,
            &password_key,
            b"slot_portable_v1",
        );
        zeroize_best_effort(&mut password_key);
        decode_dek(decrypted)
    }

    pub fn unlock_dek_with_recipient(
        slots: &[KeySlot],
        private_key: &[u8; 32],
    ) -> Result<[u8; KEY_SIZE], KeyVaultError> {
        let slot = slots
            .iter()
            .find(|slot| slot.slot_type == KeySlotType::RecipientPublicKey)
            .ok_or(KeyVaultError::AuthenticationFailed)?;
        let envelope = slot
            .recipient
            .as_ref()
            .ok_or(KeyVaultError::AuthenticationFailed)?;
        if !constant_time_eq(&slot.encrypted_dek, &envelope.encrypted_dek)
            || !constant_time_eq(&slot.nonce, &envelope.nonce)
        {
            return Err(KeyVaultError::AuthenticationFailed);
        }
        unwrap_dek_for_x25519_recipient(envelope, private_key)
            .map_err(|_| KeyVaultError::AuthenticationFailed)
    }

    pub(crate) fn unlock_dek_hardware_backed(
        &self,
        document_id: &str,
        slots: &[KeySlot],
    ) -> Result<[u8; KEY_SIZE], KeyVaultError> {
        validate_document_id(document_id)?;
        let slot = slots
            .iter()
            .find(|slot| slot.slot_type == KeySlotType::HardwareBacked)
            .ok_or(KeyVaultError::AuthenticationFailed)?;
        let envelope = slot
            .hardware
            .as_ref()
            .ok_or(KeyVaultError::AuthenticationFailed)?;
        if !constant_time_eq(&slot.encrypted_dek, &envelope.sealed_dek) {
            return Err(KeyVaultError::AuthenticationFailed);
        }
        let account = hardware_account(document_id)?;
        let aad = hardware_slot_aad(document_id)?;
        storage::unseal_hardware_backed_dek(&account, envelope, &aad)
            .map_err(|_| KeyVaultError::AuthenticationFailed)
    }

    pub fn unlock_dek_with_pin_for_document(
        &mut self,
        document_id: &str,
        slots: &[KeySlot],
        pin: &str,
    ) -> Result<[u8; KEY_SIZE], KeyVaultError> {
        validate_document_id(document_id)?;
        self.attempt_limiter
            .check(document_id, crate::UnlockFactorClass::DeviceAndPin)?;
        match self.unlock_dek_with_pin(slots, pin) {
            Ok(dek) => {
                self.attempt_limiter
                    .success(document_id, crate::UnlockFactorClass::DeviceAndPin)?;
                Ok(dek)
            }
            Err(KeyVaultError::InvalidCredentialFormat) => {
                Err(KeyVaultError::InvalidCredentialFormat)
            }
            Err(KeyVaultError::VaultLocked) => Err(KeyVaultError::VaultLocked),
            Err(_) => {
                let _ = self
                    .attempt_limiter
                    .failure(document_id, crate::UnlockFactorClass::DeviceAndPin);
                Err(KeyVaultError::AuthenticationFailed)
            }
        }
    }

    pub fn unlock_dek_hardware_for_document(
        &mut self,
        document_id: &str,
        slots: &[KeySlot],
    ) -> Result<[u8; KEY_SIZE], KeyVaultError> {
        validate_document_id(document_id)?;
        self.attempt_limiter
            .check(document_id, crate::UnlockFactorClass::HardwareBacked)?;
        match self.unlock_dek_hardware_backed(document_id, slots) {
            Ok(dek) => {
                self.attempt_limiter
                    .success(document_id, crate::UnlockFactorClass::HardwareBacked)?;
                Ok(dek)
            }
            Err(_) => {
                let _ = self
                    .attempt_limiter
                    .failure(document_id, crate::UnlockFactorClass::HardwareBacked);
                Err(KeyVaultError::AuthenticationFailed)
            }
        }
    }

    pub fn rewrap_dek_for_policy(
        &mut self,
        dek: &[u8; KEY_SIZE],
        policy: UnlockPolicy,
        pin: Option<&str>,
        password: Option<&str>,
        recipient: Option<&[u8; 32]>,
    ) -> Result<Vec<KeySlot>, KeyVaultError> {
        self.create_slots_for_policy_scoped(dek, policy, pin, password, recipient, None)
    }
}

fn software_slot(
    slot_id: u32,
    slot_type: KeySlotType,
    encrypted_dek: Vec<u8>,
    nonce: [u8; NONCE_SIZE],
    kdf_params: Option<CryptoParameters>,
) -> KeySlot {
    KeySlot {
        slot_id,
        slot_type,
        encrypted_dek,
        nonce,
        kdf_params,
        recipient: None,
        hardware: None,
    }
}

fn keyvault_kdf_params() -> CryptoParameters {
    CryptoParameters {
        kdf_memory_cost_kb: 64 * 1024,
        kdf_time_cost_iters: 3,
        kdf_parallelism: 4,
        ..CryptoParameters::default()
    }
}

fn hardware_account(document_id: &str) -> Result<String, KeyVaultError> {
    let digest = document_digest(document_id)?;
    let mut account = String::from("hardware-");
    for byte in digest {
        account.push_str(&format!("{byte:02x}"));
    }
    Ok(account)
}

fn hardware_slot_aad(document_id: &str) -> Result<Vec<u8>, KeyVaultError> {
    let digest = document_digest(document_id)?;
    let mut aad = b"VGT/KEYVAULT/HARDWARE-SLOT/v1|".to_vec();
    aad.extend_from_slice(&digest);
    Ok(aad)
}

fn decode_dek(
    result: Result<Vec<u8>, vgt_crypto::CryptoError>,
) -> Result<[u8; KEY_SIZE], KeyVaultError> {
    let mut bytes = result.map_err(|_| KeyVaultError::AuthenticationFailed)?;
    if bytes.len() != KEY_SIZE {
        bytes.fill(0);
        return Err(KeyVaultError::AuthenticationFailed);
    }
    let mut dek = [0u8; KEY_SIZE];
    dek.copy_from_slice(&bytes);
    bytes.fill(0);
    Ok(dek)
}
