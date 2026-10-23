// STATUS: PLATIN
//! Explicit passphrase protection for the existing random Standard Workspace root.
//! The record is independent of platform key-store records and never changes VWC bytes.

use crate::{storage, KeyVaultError};
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::Read;
use std::path::{Path, PathBuf};
use vgt_crypto::{
    decrypt_aes_gcm, derive_key_from_pin, encrypt_aes_gcm, zeroize_best_effort, CryptoParameters,
    KEY_SIZE, NONCE_SIZE, SALT_SIZE,
};

const SOFTWARE_WMK_FILE: &str = "software-wmk-v1.json";
const ENVELOPE_VERSION: u16 = 1;
const MAX_ENVELOPE_BYTES: u64 = 4 * 1024;
const MIN_PASSPHRASE_BYTES: usize = 16;
const MAX_PASSPHRASE_BYTES: usize = 128;
const AAD: &[u8] = b"VGT/KEYVAULT/SOFTWARE-WMK/v1";
const KDF_MEMORY_COST_KB: u32 = 64 * 1024;
const KDF_TIME_COST_ITERS: u32 = 3;
const KDF_PARALLELISM: u32 = 4;
const WRAPPED_WMK_BYTES: usize = KEY_SIZE + 16;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct SoftwareWmkEnvelope {
    version: u16,
    crypto: CryptoParameters,
    nonce: [u8; NONCE_SIZE],
    ciphertext: Vec<u8>,
}

fn envelope_path() -> Result<PathBuf, KeyVaultError> {
    Ok(storage::get_vault_dir()?.join(SOFTWARE_WMK_FILE))
}

pub(crate) fn configured() -> Result<bool, KeyVaultError> {
    match fs::symlink_metadata(envelope_path()?) {
        Ok(_) => Ok(true),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(KeyVaultError::StorageError(error.to_string())),
    }
}

pub(crate) fn create(passphrase: &str, wmk: &[u8; KEY_SIZE]) -> Result<(), KeyVaultError> {
    create_at(&envelope_path()?, passphrase, wmk)
}

pub(crate) fn unlock(passphrase: &str) -> Result<[u8; KEY_SIZE], KeyVaultError> {
    unlock_at(&envelope_path()?, passphrase)
}

fn create_at(path: &Path, passphrase: &str, wmk: &[u8; KEY_SIZE]) -> Result<(), KeyVaultError> {
    validate_passphrase(passphrase)?;
    let crypto = CryptoParameters {
        kdf_memory_cost_kb: KDF_MEMORY_COST_KB,
        kdf_time_cost_iters: KDF_TIME_COST_ITERS,
        kdf_parallelism: KDF_PARALLELISM,
        ..CryptoParameters::default()
    };
    let mut wrapping_key = derive_key_from_pin(passphrase, &crypto.kdf_salt, &crypto)?;
    let encrypted = encrypt_aes_gcm(wmk, &wrapping_key, AAD);
    zeroize_best_effort(&mut wrapping_key);
    let (ciphertext, nonce) = encrypted?;
    let envelope = SoftwareWmkEnvelope {
        version: ENVELOPE_VERSION,
        crypto,
        nonce,
        ciphertext,
    };
    validate_envelope(&envelope)?;
    let bytes = serde_json::to_vec(&envelope).map_err(|_| KeyVaultError::IntegrityFailed)?;
    if bytes.len() as u64 > MAX_ENVELOPE_BYTES {
        return Err(KeyVaultError::IntegrityFailed);
    }
    storage::atomic_create(path, &bytes)
}

fn unlock_at(path: &Path, passphrase: &str) -> Result<[u8; KEY_SIZE], KeyVaultError> {
    validate_passphrase(passphrase)?;
    let envelope = read_envelope(path)?;
    validate_envelope(&envelope)?;
    let mut wrapping_key =
        derive_key_from_pin(passphrase, &envelope.crypto.kdf_salt, &envelope.crypto)?;
    let decrypted = decrypt_aes_gcm(&envelope.ciphertext, &envelope.nonce, &wrapping_key, AAD);
    zeroize_best_effort(&mut wrapping_key);
    let mut plaintext = decrypted.map_err(|_| KeyVaultError::AuthenticationFailed)?;
    if plaintext.len() != KEY_SIZE {
        zeroize_best_effort(&mut plaintext);
        return Err(KeyVaultError::IntegrityFailed);
    }
    let mut wmk = [0u8; KEY_SIZE];
    wmk.copy_from_slice(&plaintext);
    zeroize_best_effort(&mut plaintext);
    Ok(wmk)
}

fn validate_passphrase(passphrase: &str) -> Result<(), KeyVaultError> {
    let byte_len = passphrase.len();
    if !(MIN_PASSPHRASE_BYTES..=MAX_PASSPHRASE_BYTES).contains(&byte_len)
        || passphrase.bytes().any(|byte| byte.is_ascii_control())
    {
        return Err(KeyVaultError::InvalidCredentialFormat);
    }
    Ok(())
}

fn read_envelope(path: &Path) -> Result<SoftwareWmkEnvelope, KeyVaultError> {
    let link_metadata = fs::symlink_metadata(path).map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            KeyVaultError::ProviderUnavailable
        } else {
            KeyVaultError::StorageError(error.to_string())
        }
    })?;
    if link_metadata.file_type().is_symlink() || !link_metadata.is_file() {
        return Err(KeyVaultError::IntegrityFailed);
    }
    let file = File::open(path).map_err(|error| KeyVaultError::StorageError(error.to_string()))?;
    let metadata = file
        .metadata()
        .map_err(|error| KeyVaultError::StorageError(error.to_string()))?;
    if !metadata.is_file() || metadata.len() == 0 || metadata.len() > MAX_ENVELOPE_BYTES {
        return Err(KeyVaultError::IntegrityFailed);
    }
    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    file.take(MAX_ENVELOPE_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| KeyVaultError::StorageError(error.to_string()))?;
    if bytes.is_empty() || bytes.len() as u64 > MAX_ENVELOPE_BYTES {
        return Err(KeyVaultError::IntegrityFailed);
    }
    serde_json::from_slice(&bytes).map_err(|_| KeyVaultError::IntegrityFailed)
}

fn validate_envelope(envelope: &SoftwareWmkEnvelope) -> Result<(), KeyVaultError> {
    let expected = CryptoParameters::default();
    if envelope.version != ENVELOPE_VERSION
        || envelope.crypto.suite_version != expected.suite_version
        || envelope.crypto.cipher != "AES-256-GCM"
        || envelope.crypto.kdf_algorithm != "Argon2id"
        || envelope.crypto.kdf_params_version != expected.kdf_params_version
        || envelope.crypto.kdf_salt.len() != SALT_SIZE
        || envelope.crypto.kdf_memory_cost_kb != KDF_MEMORY_COST_KB
        || envelope.crypto.kdf_time_cost_iters != KDF_TIME_COST_ITERS
        || envelope.crypto.kdf_parallelism != KDF_PARALLELISM
        || envelope.ciphertext.len() != WRAPPED_WMK_BYTES
    {
        return Err(KeyVaultError::IntegrityFailed);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use vgt_crypto::generate_random_bytes;

    struct TestFile(PathBuf);

    impl TestFile {
        fn new() -> Self {
            let unique = generate_random_bytes::<8>()
                .iter()
                .map(|byte| format!("{byte:02x}"))
                .collect::<String>();
            let directory = std::env::temp_dir().join(format!(
                "vgt-software-provider-{}-{unique}",
                std::process::id()
            ));
            fs::create_dir(&directory).expect("create isolated test directory");
            Self(directory.join(SOFTWARE_WMK_FILE))
        }
    }

    impl Drop for TestFile {
        fn drop(&mut self) {
            if let Some(parent) = self.0.parent() {
                let _ = fs::remove_dir_all(parent);
            }
        }
    }

    #[test]
    fn wraps_existing_random_wmk_and_rejects_wrong_passphrase() {
        let file = TestFile::new();
        let wmk = generate_random_bytes::<KEY_SIZE>();
        create_at(&file.0, "correct horse battery staple", &wmk).expect("create envelope");
        assert_eq!(
            unlock_at(&file.0, "correct horse battery staple").unwrap(),
            wmk
        );
        assert!(matches!(
            unlock_at(&file.0, "incorrect horse battery staple"),
            Err(KeyVaultError::AuthenticationFailed)
        ));
        let encoded = fs::read(&file.0).unwrap();
        assert!(!encoded.windows(KEY_SIZE).any(|window| window == wmk));
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                fs::metadata(&file.0).unwrap().permissions().mode() & 0o777,
                0o600
            );
        }
    }

    #[test]
    fn refuses_overwrite_and_detects_authenticated_record_corruption() {
        let file = TestFile::new();
        let wmk = generate_random_bytes::<KEY_SIZE>();
        create_at(&file.0, "correct horse battery staple", &wmk).expect("create envelope");
        let original = fs::read(&file.0).unwrap();
        let replacement = generate_random_bytes::<KEY_SIZE>();
        assert!(matches!(
            create_at(&file.0, "another correct horse battery", &replacement),
            Err(KeyVaultError::PolicyViolation)
        ));
        assert_eq!(fs::read(&file.0).unwrap(), original);

        let mut envelope: SoftwareWmkEnvelope = serde_json::from_slice(&original).unwrap();
        envelope.ciphertext[0] ^= 0x80;
        fs::write(&file.0, serde_json::to_vec(&envelope).unwrap()).unwrap();
        assert!(matches!(
            unlock_at(&file.0, "correct horse battery staple"),
            Err(KeyVaultError::AuthenticationFailed)
        ));
    }

    #[test]
    fn rejects_truncated_oversized_and_invalid_kdf_metadata() {
        let file = TestFile::new();
        let wmk = generate_random_bytes::<KEY_SIZE>();
        create_at(&file.0, "correct horse battery staple", &wmk).expect("create envelope");
        fs::write(&file.0, b"{").unwrap();
        assert!(matches!(
            unlock_at(&file.0, "correct horse battery staple"),
            Err(KeyVaultError::IntegrityFailed)
        ));

        fs::remove_file(&file.0).unwrap();
        create_at(&file.0, "correct horse battery staple", &wmk).unwrap();
        let encoded = fs::read(&file.0).unwrap();
        let mut envelope: SoftwareWmkEnvelope = serde_json::from_slice(&encoded).unwrap();
        envelope.crypto.kdf_memory_cost_kb = u32::MAX;
        fs::write(&file.0, serde_json::to_vec(&envelope).unwrap()).unwrap();
        assert!(matches!(
            unlock_at(&file.0, "correct horse battery staple"),
            Err(KeyVaultError::IntegrityFailed)
        ));

        fs::write(&file.0, vec![b'x'; MAX_ENVELOPE_BYTES as usize + 1]).unwrap();
        assert!(matches!(
            unlock_at(&file.0, "correct horse battery staple"),
            Err(KeyVaultError::IntegrityFailed)
        ));
    }
}
