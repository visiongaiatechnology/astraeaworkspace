use crate::{storage, validate_top_secret_user_secret, KeyVaultError, VgtKeyVault};
use serde::{Deserialize, Serialize};
use std::fs;
use std::time::{SystemTime, UNIX_EPOCH};
use vgt_crypto::{
    constant_time_eq, decrypt_aes_gcm, derive_envelope_unlock_key, derive_key_from_pin,
    encrypt_aes_gcm, generate_random_bytes, hash_blake3, zeroize_best_effort, CryptoParameters,
    KEY_SIZE, NONCE_SIZE,
};

const ENVELOPE_VERSION: u8 = 1;
const ENVELOPE_SUITE: &str = "VGT-ASTRAEA-TS-KEYVAULT-1";
const MAX_ENVELOPE_BYTES: u64 = 64 * 1024;

pub fn parse_offline_factor_hex(input: &str) -> Result<[u8; KEY_SIZE], KeyVaultError> {
    let text = input.trim();
    if text.len() != KEY_SIZE * 2 || !text.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(KeyVaultError::InvalidCredentialFormat);
    }
    let mut factor = [0u8; KEY_SIZE];
    for (index, slot) in factor.iter_mut().enumerate() {
        *slot = u8::from_str_radix(&text[index * 2..index * 2 + 2], 16)
            .map_err(|_| KeyVaultError::InvalidCredentialFormat)?;
    }
    if factor.iter().all(|byte| *byte == 0) {
        return Err(KeyVaultError::InvalidCredentialFormat);
    }
    Ok(factor)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum OfflineFactorState {
    NotRequired,
    Active,
    ReportedLost,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TopSecretAccessPolicy {
    pub require_device_factor: bool,
    pub require_user_secret: bool,
    pub require_offline_factor: bool,
}

impl Default for TopSecretAccessPolicy {
    fn default() -> Self {
        Self {
            require_device_factor: true,
            require_user_secret: true,
            require_offline_factor: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct TopSecretRootEnvelope {
    pub version: u8,
    pub suite: String,
    pub generation: u64,
    pub created_unix: u64,
    pub policy: TopSecretAccessPolicy,
    pub offline_factor_state: OfflineFactorState,
    pub offline_factor_commitment: Option<[u8; 32]>,
    pub kdf_params: CryptoParameters,
    pub nonce: [u8; NONCE_SIZE],
    pub ciphertext: Vec<u8>,
}

pub struct TopSecretEnrollmentResult {
    pub generation: u64,
    pub offline_factor: Option<[u8; 32]>,
    pub recovery_hint: String,
}

impl VgtKeyVault {
    pub fn enroll_top_secret_access(
        &mut self,
        user_secret: &str,
        require_offline_factor: bool,
    ) -> Result<TopSecretEnrollmentResult, KeyVaultError> {
        validate_top_secret_user_secret(user_secret)?;
        if self.top_secret_enrolled() {
            return Err(KeyVaultError::PolicyViolation);
        }
        if !storage::native_provider_available() {
            return Err(KeyVaultError::ProviderUnavailable);
        }

        let mut device_factor = generate_random_bytes::<KEY_SIZE>();
        storage::save_persistent_secret(storage::TOP_SECRET_DEVICE_FACTOR_ACCOUNT, &device_factor)?;
        let root = generate_random_bytes::<KEY_SIZE>();
        let offline_factor = require_offline_factor.then(generate_random_bytes::<KEY_SIZE>);
        let params = CryptoParameters {
            kdf_memory_cost_kb: 128 * 1024,
            kdf_time_cost_iters: 3,
            kdf_parallelism: 4,
            ..CryptoParameters::default()
        };
        let policy = TopSecretAccessPolicy {
            require_device_factor: true,
            require_user_secret: true,
            require_offline_factor,
        };
        let generation = 1;
        let offline_commitment = offline_factor.as_ref().map(|factor| hash_blake3(factor));
        let mut unlock_key = derive_access_key(
            &device_factor,
            user_secret,
            offline_factor.as_ref(),
            offline_commitment.as_ref(),
            &params,
            policy,
        )?;
        let aad = envelope_aad(generation, policy, offline_commitment.as_ref());
        let encrypted = encrypt_aes_gcm(&root, &unlock_key, &aad);
        zeroize_best_effort(&mut unlock_key);
        zeroize_best_effort(&mut device_factor);
        let (ciphertext, nonce) = encrypted?;
        let envelope = TopSecretRootEnvelope {
            version: ENVELOPE_VERSION,
            suite: ENVELOPE_SUITE.to_string(),
            generation,
            created_unix: unix_now(),
            policy,
            offline_factor_state: if require_offline_factor {
                OfflineFactorState::Active
            } else {
                OfflineFactorState::NotRequired
            },
            offline_factor_commitment: offline_commitment,
            kdf_params: params,
            nonce,
            ciphertext,
        };
        save_envelope(&envelope)?;
        self.set_top_secret_root(root)?;
        self.clear_top_secret_auth_failures();
        Ok(TopSecretEnrollmentResult {
            generation,
            offline_factor,
            recovery_hint: if require_offline_factor {
                "Store the 32-byte offline factor separately from this device and the private Top Secret identity. Loss of a required factor intentionally blocks normal unlock.".into()
            } else {
                "Top Secret access currently requires the native device factor and user secret."
                    .into()
            },
        })
    }

    pub fn unlock_top_secret(
        &mut self,
        user_secret: &str,
        offline_factor: Option<&[u8; 32]>,
    ) -> Result<(), KeyVaultError> {
        self.check_top_secret_throttle()?;
        validate_top_secret_user_secret(user_secret)?;
        let envelope = load_envelope()?.ok_or(KeyVaultError::TopSecretNotEnrolled)?;
        validate_envelope(&envelope)?;
        let mut device_factor =
            storage::load_persistent_secret(storage::TOP_SECRET_DEVICE_FACTOR_ACCOUNT)?
                .ok_or(KeyVaultError::ProviderUnavailable)?;
        let mut unlock_key = match derive_access_key(
            &device_factor,
            user_secret,
            offline_factor,
            envelope.offline_factor_commitment.as_ref(),
            &envelope.kdf_params,
            envelope.policy,
        ) {
            Ok(key) => key,
            Err(error) => {
                zeroize_best_effort(&mut device_factor);
                self.record_top_secret_auth_failure();
                return Err(error);
            }
        };
        zeroize_best_effort(&mut device_factor);
        let aad = envelope_aad(
            envelope.generation,
            envelope.policy,
            envelope.offline_factor_commitment.as_ref(),
        );
        let decrypted = decrypt_aes_gcm(&envelope.ciphertext, &envelope.nonce, &unlock_key, &aad);
        zeroize_best_effort(&mut unlock_key);
        let mut root = match decrypted {
            Ok(value) if value.len() == KEY_SIZE => value,
            _ => {
                self.record_top_secret_auth_failure();
                return Err(KeyVaultError::AuthenticationFailed);
            }
        };
        let mut root_array = [0u8; KEY_SIZE];
        root_array.copy_from_slice(&root);
        root.fill(0);
        self.set_top_secret_root(root_array)?;
        self.clear_top_secret_auth_failures();
        Ok(())
    }

    pub fn relock_top_secret(&mut self) {
        let _ = self.top_secret_root.take();
        self.top_secret_unlocked = false;
    }

    pub fn rotate_top_secret_offline_factor(
        &mut self,
        user_secret: &str,
        current_factor: Option<&[u8; 32]>,
        require_new_factor: bool,
    ) -> Result<Option<[u8; 32]>, KeyVaultError> {
        self.unlock_top_secret(user_secret, current_factor)?;
        let old = load_envelope()?.ok_or(KeyVaultError::TopSecretNotEnrolled)?;
        let root = *self.top_secret_root()?;
        let new_factor = require_new_factor.then(generate_random_bytes::<KEY_SIZE>);
        let commitment = new_factor.as_ref().map(|factor| hash_blake3(factor));
        let policy = TopSecretAccessPolicy {
            require_device_factor: true,
            require_user_secret: true,
            require_offline_factor: require_new_factor,
        };
        let mut device_factor =
            storage::load_persistent_secret(storage::TOP_SECRET_DEVICE_FACTOR_ACCOUNT)?
                .ok_or(KeyVaultError::ProviderUnavailable)?;
        let mut unlock_key = derive_access_key(
            &device_factor,
            user_secret,
            new_factor.as_ref(),
            commitment.as_ref(),
            &old.kdf_params,
            policy,
        )?;
        zeroize_best_effort(&mut device_factor);
        let aad = envelope_aad(old.generation, policy, commitment.as_ref());
        let encrypted = encrypt_aes_gcm(&root, &unlock_key, &aad);
        zeroize_best_effort(&mut unlock_key);
        let (ciphertext, nonce) = encrypted?;
        let updated = TopSecretRootEnvelope {
            policy,
            offline_factor_state: if require_new_factor {
                OfflineFactorState::Active
            } else {
                OfflineFactorState::NotRequired
            },
            offline_factor_commitment: commitment,
            nonce,
            ciphertext,
            ..old
        };
        save_envelope(&updated)?;
        Ok(new_factor)
    }

    pub fn mark_top_secret_offline_factor_lost(&self) -> Result<(), KeyVaultError> {
        let mut envelope = load_envelope()?.ok_or(KeyVaultError::TopSecretNotEnrolled)?;
        if !envelope.policy.require_offline_factor {
            return Err(KeyVaultError::PolicyViolation);
        }
        envelope.offline_factor_state = OfflineFactorState::ReportedLost;
        save_envelope(&envelope)
    }

    pub fn top_secret_access_status(&self) -> Result<Option<TopSecretRootEnvelope>, KeyVaultError> {
        load_envelope()
    }
}

fn derive_access_key(
    device_factor: &[u8; KEY_SIZE],
    user_secret: &str,
    offline_factor: Option<&[u8; KEY_SIZE]>,
    expected_commitment: Option<&[u8; 32]>,
    params: &CryptoParameters,
    policy: TopSecretAccessPolicy,
) -> Result<[u8; KEY_SIZE], KeyVaultError> {
    if !policy.require_device_factor || !policy.require_user_secret {
        return Err(KeyVaultError::PolicyViolation);
    }
    let mut user_key = derive_key_from_pin(user_secret, &params.kdf_salt, params)?;
    let mut combined = derive_envelope_unlock_key(
        device_factor,
        &user_key,
        b"VGT/KEYVAULT/TOP-SECRET/DEVICE+USER/v1",
    )?;
    zeroize_best_effort(&mut user_key);
    if policy.require_offline_factor {
        let factor = offline_factor.ok_or(KeyVaultError::AuthenticationFailed)?;
        let expected = expected_commitment.ok_or(KeyVaultError::IntegrityFailed)?;
        let actual = hash_blake3(factor);
        if !constant_time_eq(&actual, expected) {
            zeroize_best_effort(&mut combined);
            return Err(KeyVaultError::AuthenticationFailed);
        }
        let next =
            derive_envelope_unlock_key(&combined, factor, b"VGT/KEYVAULT/TOP-SECRET/OFFLINE/v1")?;
        zeroize_best_effort(&mut combined);
        combined = next;
    } else if offline_factor.is_some() || expected_commitment.is_some() {
        zeroize_best_effort(&mut combined);
        return Err(KeyVaultError::PolicyViolation);
    }
    Ok(combined)
}

fn envelope_aad(
    generation: u64,
    policy: TopSecretAccessPolicy,
    commitment: Option<&[u8; 32]>,
) -> Vec<u8> {
    let mut aad = format!(
        "{ENVELOPE_SUITE}|generation={generation}|device={}|user={}|offline={}",
        policy.require_device_factor, policy.require_user_secret, policy.require_offline_factor
    )
    .into_bytes();
    if let Some(commitment) = commitment {
        aad.extend_from_slice(commitment);
    }
    aad
}

fn validate_envelope(envelope: &TopSecretRootEnvelope) -> Result<(), KeyVaultError> {
    if envelope.version != ENVELOPE_VERSION
        || envelope.suite != ENVELOPE_SUITE
        || envelope.generation == 0
        || !envelope.policy.require_device_factor
        || !envelope.policy.require_user_secret
        || envelope.ciphertext.len() != KEY_SIZE + 16
        || (envelope.policy.require_offline_factor != envelope.offline_factor_commitment.is_some())
    {
        return Err(KeyVaultError::IntegrityFailed);
    }
    Ok(())
}

fn load_envelope() -> Result<Option<TopSecretRootEnvelope>, KeyVaultError> {
    let path = storage::top_secret_envelope_path()?;
    if !path.exists() {
        return Ok(None);
    }
    let metadata = fs::metadata(&path).map_err(|e| KeyVaultError::StorageError(e.to_string()))?;
    if metadata.len() == 0 || metadata.len() > MAX_ENVELOPE_BYTES {
        return Err(KeyVaultError::IntegrityFailed);
    }
    let bytes = fs::read(path).map_err(|e| KeyVaultError::StorageError(e.to_string()))?;
    let envelope: TopSecretRootEnvelope =
        serde_json::from_slice(&bytes).map_err(|_| KeyVaultError::IntegrityFailed)?;
    validate_envelope(&envelope)?;
    Ok(Some(envelope))
}

fn save_envelope(envelope: &TopSecretRootEnvelope) -> Result<(), KeyVaultError> {
    validate_envelope(envelope)?;
    let bytes = serde_json::to_vec(envelope).map_err(|_| KeyVaultError::IntegrityFailed)?;
    if bytes.len() as u64 > MAX_ENVELOPE_BYTES {
        return Err(KeyVaultError::IntegrityFailed);
    }
    storage::atomic_write(&storage::top_secret_envelope_path()?, &bytes)
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

    fn cheap_params() -> CryptoParameters {
        CryptoParameters {
            kdf_memory_cost_kb: 64 * 1024,
            kdf_time_cost_iters: 3,
            kdf_parallelism: 4,
            ..CryptoParameters::default()
        }
    }

    #[test]
    fn top_secret_factor_combiner_requires_all_configured_factors() {
        let device = [0x11u8; KEY_SIZE];
        let offline = [0x22u8; KEY_SIZE];
        let commitment = hash_blake3(&offline);
        let policy = TopSecretAccessPolicy {
            require_device_factor: true,
            require_user_secret: true,
            require_offline_factor: true,
        };
        let params = cheap_params();
        let key = derive_access_key(
            &device,
            "Correct Horse Battery Staple",
            Some(&offline),
            Some(&commitment),
            &params,
            policy,
        )
        .expect("all factors should derive a key");
        assert_ne!(key, [0u8; KEY_SIZE]);
        assert!(derive_access_key(
            &device,
            "Correct Horse Battery Staple",
            None,
            Some(&commitment),
            &params,
            policy,
        )
        .is_err());
        let wrong = [0x23u8; KEY_SIZE];
        assert!(derive_access_key(
            &device,
            "Correct Horse Battery Staple",
            Some(&wrong),
            Some(&commitment),
            &params,
            policy,
        )
        .is_err());
    }

    #[test]
    fn policy_cannot_drop_device_or_user_factor() {
        let params = cheap_params();
        let device = [7u8; KEY_SIZE];
        let policy = TopSecretAccessPolicy {
            require_device_factor: false,
            require_user_secret: true,
            require_offline_factor: false,
        };
        assert!(matches!(
            derive_access_key(
                &device,
                "Correct Horse Battery Staple",
                None,
                None,
                &params,
                policy
            ),
            Err(KeyVaultError::PolicyViolation)
        ));
    }
}
