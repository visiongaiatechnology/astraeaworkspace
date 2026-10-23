//! Native secure persistence adapters for KeyVault roots and device factors.
//!
//! Secret bytes are never persisted in plaintext by this module. Each logical
//! account is isolated at the provider boundary so Standard, PQC and Top-Secret
//! domains can use independent roots without deriving one from another.

use crate::KeyVaultError;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use vgt_crypto::{generate_random_bytes, zeroize_best_effort, KEY_SIZE};

#[cfg(target_os = "linux")]
mod astraeaos;
#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod windows;

pub const SERVICE_NAME: &str = "VGTWorkspace";
pub const STANDARD_ROOT_ACCOUNT: &str = "workspace-master-key";
pub const PQC_ROOT_ACCOUNT: &str = "workspace-pqc-root";
pub const PERSONAL_DOMAIN_ROOT_ACCOUNT: &str = "workspace-personal-domain-root";
pub const ENTERPRISE_DOMAIN_ROOT_ACCOUNT: &str = "workspace-enterprise-domain-root";
pub const TOP_SECRET_DEVICE_FACTOR_ACCOUNT: &str = "workspace-top-secret-device-factor";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum StorageProvider {
    WindowsDpapi,
    MacOSKeychain,
    LinuxSecretService,
    AstraeaOSNative,
    Unavailable,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum StorageProviderFeature {
    WindowsDpapi,
    WindowsCng,
    WindowsTpmProvider,
    MacOSKeychain,
    MacOSSecureEnclaveApi,
    LinuxSecretService,
    LinuxTpmInterface,
    AstraeaOSNative,
    AstraeaOSHardwareSlot,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StorageCapabilityProbe {
    pub provider: StorageProvider,
    pub available: bool,
    pub secure_persistence: bool,
    pub hardware_interface_detected: bool,
    pub hardware_slot_supported: bool,
    pub hardware_backed: bool,
    pub attestation_verified: bool,
    pub hardware_interface_probe_indeterminate: bool,
    pub hardware_provider_probe_status: Option<i32>,
    pub provider_name: String,
    pub features: Vec<StorageProviderFeature>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct HardwareSealedDek {
    pub version: u16,
    pub provider: StorageProvider,
    pub key_handle: String,
    pub sealed_dek: Vec<u8>,
    pub attestation_digest_sha256: [u8; 32],
}

pub fn get_vault_dir() -> Result<PathBuf, KeyVaultError> {
    #[cfg(target_os = "windows")]
    let dir = std::env::var_os("APPDATA")
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .map(|base| base.join("vgt_workspace"))
        .ok_or_else(|| {
            KeyVaultError::StorageError("Windows KeyVault data directory is unavailable".into())
        })?;

    #[cfg(not(target_os = "windows"))]
    let dir = std::env::var_os("HOME")
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .map(|base| base.join(".config").join("vgt_workspace"))
        .ok_or_else(|| {
            KeyVaultError::StorageError("KeyVault home directory is unavailable".into())
        })?;

    fs::create_dir_all(&dir).map_err(|e| KeyVaultError::StorageError(e.to_string()))?;
    let metadata =
        fs::symlink_metadata(&dir).map_err(|e| KeyVaultError::StorageError(e.to_string()))?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(KeyVaultError::StorageError(
            "KeyVault data directory is not a physical directory".into(),
        ));
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&dir, fs::Permissions::from_mode(0o700))
            .map_err(|e| KeyVaultError::StorageError(e.to_string()))?;
    }
    Ok(dir)
}

pub(crate) fn validate_account(account: &str) -> Result<(), KeyVaultError> {
    if account.is_empty()
        || account.len() > 96
        || !account
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    {
        return Err(KeyVaultError::StorageError(
            "KeyVault storage account name rejected".into(),
        ));
    }
    Ok(())
}

#[cfg(target_os = "windows")]
pub(crate) fn account_file_path(account: &str) -> Result<PathBuf, KeyVaultError> {
    validate_account(account)?;
    let dir = get_vault_dir()?;
    if account == STANDARD_ROOT_ACCOUNT {
        Ok(dir.join("wmk.dat"))
    } else {
        Ok(dir.join(format!("{}.dat", account)))
    }
}

pub fn top_secret_envelope_path() -> Result<PathBuf, KeyVaultError> {
    let dir = get_vault_dir()?;
    Ok(dir.join("top-secret-root-envelope.json"))
}

pub fn active_provider() -> StorageProvider {
    #[cfg(target_os = "windows")]
    {
        StorageProvider::WindowsDpapi
    }
    #[cfg(target_os = "macos")]
    {
        return StorageProvider::MacOSKeychain;
    }
    #[cfg(target_os = "linux")]
    {
        if astraeaos::available() {
            return StorageProvider::AstraeaOSNative;
        }
        if linux::available() {
            return StorageProvider::LinuxSecretService;
        }
        StorageProvider::Unavailable
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        StorageProvider::Unavailable
    }
}

pub fn provider_capabilities() -> StorageCapabilityProbe {
    match active_provider() {
        #[cfg(target_os = "windows")]
        StorageProvider::WindowsDpapi => {
            let cng = windows::cng_software_provider_detected();
            let tpm_probe = windows::cng_tpm_provider_probe();
            let (tpm, hardware_interface_probe_indeterminate, hardware_provider_probe_status) =
                match tpm_probe {
                    windows::CngTpmProviderProbe::Present => (true, false, None),
                    windows::CngTpmProviderProbe::DefinitivelyAbsent => (false, false, None),
                    windows::CngTpmProviderProbe::Indeterminate(status) => {
                        (false, true, Some(status))
                    }
                };
            let mut features = vec![StorageProviderFeature::WindowsDpapi];
            if cng {
                features.push(StorageProviderFeature::WindowsCng);
            }
            if tpm {
                features.push(StorageProviderFeature::WindowsTpmProvider);
            }
            StorageCapabilityProbe {
                provider: StorageProvider::WindowsDpapi,
                available: true,
                secure_persistence: true,
                hardware_interface_detected: tpm,
                hardware_slot_supported: false,
                hardware_backed: false,
                attestation_verified: false,
                hardware_interface_probe_indeterminate,
                hardware_provider_probe_status,
                provider_name: "Windows DPAPI".into(),
                features,
            }
        }
        #[cfg(target_os = "macos")]
        StorageProvider::MacOSKeychain => StorageCapabilityProbe {
            provider: StorageProvider::MacOSKeychain,
            available: true,
            secure_persistence: true,
            // A concrete IOKit registry probe detects an Apple SEP interface. Presence
            // alone is not attestation, so root persistence fails closed until a verified
            // hardware slot can be bound to the Workspace root.
            hardware_interface_detected: macos::secure_enclave_api_available(),
            hardware_slot_supported: false,
            hardware_backed: false,
            attestation_verified: false,
            hardware_interface_probe_indeterminate: false,
            hardware_provider_probe_status: None,
            provider_name: "macOS Keychain".into(),
            features: vec![
                StorageProviderFeature::MacOSKeychain,
                StorageProviderFeature::MacOSSecureEnclaveApi,
            ],
        },
        #[cfg(target_os = "linux")]
        StorageProvider::AstraeaOSNative => {
            let capabilities = astraeaos::capabilities().ok();
            let hardware_backed = capabilities.as_ref().is_some_and(|c| c.hardware_backed);
            let attestation_verified = capabilities
                .as_ref()
                .is_some_and(|c| c.attestation_verified);
            let hardware_slot_supported =
                capabilities.as_ref().is_some_and(|c| c.hardware_slot_api)
                    && hardware_backed
                    && attestation_verified;
            let mut features = vec![StorageProviderFeature::AstraeaOSNative];
            if hardware_slot_supported {
                features.push(StorageProviderFeature::AstraeaOSHardwareSlot);
            }
            StorageCapabilityProbe {
                provider: StorageProvider::AstraeaOSNative,
                available: true,
                secure_persistence: true,
                hardware_interface_detected: hardware_backed,
                hardware_slot_supported,
                hardware_backed,
                attestation_verified,
                hardware_interface_probe_indeterminate: false,
                hardware_provider_probe_status: None,
                provider_name: capabilities
                    .map(|c| c.provider_name)
                    .unwrap_or_else(|| "AstraeaOS Native KeyVault".into()),
                features,
            }
        }
        #[cfg(target_os = "linux")]
        StorageProvider::LinuxSecretService => {
            let tpm = linux::tpm_interface_detected();
            let mut features = vec![StorageProviderFeature::LinuxSecretService];
            if tpm {
                features.push(StorageProviderFeature::LinuxTpmInterface);
            }
            StorageCapabilityProbe {
                provider: StorageProvider::LinuxSecretService,
                available: true,
                secure_persistence: true,
                hardware_interface_detected: tpm,
                hardware_slot_supported: false,
                hardware_backed: false,
                attestation_verified: false,
                hardware_interface_probe_indeterminate: false,
                hardware_provider_probe_status: None,
                provider_name: "Linux Secret Service".into(),
                features,
            }
        }
        _ => StorageCapabilityProbe {
            provider: StorageProvider::Unavailable,
            available: false,
            secure_persistence: false,
            hardware_interface_detected: false,
            hardware_slot_supported: false,
            hardware_backed: false,
            attestation_verified: false,
            hardware_interface_probe_indeterminate: false,
            hardware_provider_probe_status: None,
            provider_name: "Unavailable".into(),
            features: Vec::new(),
        },
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum RootPersistenceMode {
    SecureSoftwareProvider,
    VerifiedHardwareSlot,
}

fn root_persistence_mode(
    probe: &StorageCapabilityProbe,
) -> Result<RootPersistenceMode, KeyVaultError> {
    if !probe.available || !probe.secure_persistence || probe.hardware_interface_probe_indeterminate
    {
        return Err(KeyVaultError::ProviderUnavailable);
    }
    let has_hardware_claim =
        probe.hardware_slot_supported || probe.hardware_backed || probe.attestation_verified;
    let complete_hardware_contract = probe.hardware_interface_detected
        && probe.hardware_backed
        && probe.attestation_verified
        && probe.hardware_slot_supported;

    // A provider that *claims* a hardware slot has to prove the whole contract.
    // Claiming less than it proves would be a silent downgrade of the root key.
    if has_hardware_claim {
        if complete_hardware_contract {
            return Ok(RootPersistenceMode::VerifiedHardwareSlot);
        }
        return Err(KeyVaultError::ProviderUnavailable);
    }

    // A merely **detected** hardware interface is not a claim.
    //
    // `WindowsDpapi` and `MacOSKeychain` report `hardware_interface_detected` when a
    // TPM / Secure Enclave is reachable, while `hardware_slot_supported`,
    // `hardware_backed` and `attestation_verified` stay false — they persist
    // through the OS keystore and never bind the Workspace root to the interface.
    // `provider.rs` (`ProviderRequirement::NativeSecurePersistence`) already
    // accepts exactly that. Rejecting it here made "save natively" fail on every
    // Windows PC with a TPM even though the provider was healthy.
    Ok(RootPersistenceMode::SecureSoftwareProvider)
}

fn is_root_account(account: &str) -> bool {
    matches!(
        account,
        STANDARD_ROOT_ACCOUNT
            | PQC_ROOT_ACCOUNT
            | PERSONAL_DOMAIN_ROOT_ACCOUNT
            | ENTERPRISE_DOMAIN_ROOT_ACCOUNT
    ) || account.starts_with("workspace-history-")
}

fn hardware_root_envelope_path(account: &str) -> Result<PathBuf, KeyVaultError> {
    validate_account(account)?;
    Ok(get_vault_dir()?.join(format!("{account}.hardware-root.json")))
}

fn root_aad(account: &str) -> Vec<u8> {
    format!("VGT/KEYVAULT/HARDWARE-ROOT/v1/{account}").into_bytes()
}

fn load_root_secret(account: &str) -> Result<Option<[u8; KEY_SIZE]>, KeyVaultError> {
    let probe = provider_capabilities();
    let envelope_path = hardware_root_envelope_path(account)?;
    match root_persistence_mode(&probe)? {
        RootPersistenceMode::VerifiedHardwareSlot => {
            if !envelope_path.exists() {
                // Never replace an existing software-persisted root with a fresh hardware
                // root. That would destroy decryptability. Existing roots require an explicit
                // migration ceremony before the verified hardware slot becomes authoritative.
                if let Some(mut legacy_root) = load_provider_secret(account)? {
                    zeroize_best_effort(&mut legacy_root);
                    return Err(KeyVaultError::ProviderUnavailable);
                }
                return Ok(None);
            }
            let bytes =
                fs::read(&envelope_path).map_err(|e| KeyVaultError::StorageError(e.to_string()))?;
            if bytes.is_empty() || bytes.len() > 16 * 1024 {
                return Err(KeyVaultError::IntegrityFailed);
            }
            let envelope: HardwareSealedDek =
                serde_json::from_slice(&bytes).map_err(|_| KeyVaultError::IntegrityFailed)?;
            unseal_hardware_backed_dek(account, &envelope, &root_aad(account)).map(Some)
        }
        RootPersistenceMode::SecureSoftwareProvider => {
            if envelope_path.exists() {
                // A hardware-sealed root must not be downgraded merely because the hardware
                // provider disappeared or its attestation can no longer be verified.
                return Err(KeyVaultError::ProviderUnavailable);
            }
            load_provider_secret(account)
        }
    }
}

fn save_root_secret(account: &str, secret: &[u8; KEY_SIZE]) -> Result<(), KeyVaultError> {
    let probe = provider_capabilities();
    match root_persistence_mode(&probe)? {
        RootPersistenceMode::VerifiedHardwareSlot => {
            let envelope = seal_hardware_backed_dek(account, secret, &root_aad(account))?;
            let bytes =
                serde_json::to_vec(&envelope).map_err(|_| KeyVaultError::IntegrityFailed)?;
            atomic_write(&hardware_root_envelope_path(account)?, &bytes)
        }
        RootPersistenceMode::SecureSoftwareProvider => save_provider_secret(account, secret),
    }
}

pub fn native_provider_available() -> bool {
    provider_capabilities().secure_persistence
}

pub fn seal_hardware_backed_dek(
    account: &str,
    _dek: &[u8; KEY_SIZE],
    aad: &[u8],
) -> Result<HardwareSealedDek, KeyVaultError> {
    validate_account(account)?;
    if aad.is_empty() || aad.len() > 1024 {
        return Err(KeyVaultError::PolicyViolation);
    }
    let capabilities = provider_capabilities();
    if !capabilities.hardware_slot_supported
        || !capabilities.hardware_backed
        || !capabilities.attestation_verified
    {
        return Err(KeyVaultError::ProviderUnavailable);
    }
    match capabilities.provider {
        #[cfg(target_os = "linux")]
        StorageProvider::AstraeaOSNative => {
            let envelope = astraeaos::seal_hardware_dek(account, _dek, aad)?;
            Ok(HardwareSealedDek {
                version: 1,
                provider: StorageProvider::AstraeaOSNative,
                key_handle: envelope.key_handle,
                sealed_dek: envelope.sealed,
                attestation_digest_sha256: envelope.attestation_digest,
            })
        }
        _ => Err(KeyVaultError::ProviderUnavailable),
    }
}

pub fn unseal_hardware_backed_dek(
    account: &str,
    envelope: &HardwareSealedDek,
    aad: &[u8],
) -> Result<[u8; KEY_SIZE], KeyVaultError> {
    validate_account(account)?;
    if envelope.version != 1 || aad.is_empty() || aad.len() > 1024 {
        return Err(KeyVaultError::AuthenticationFailed);
    }
    let capabilities = provider_capabilities();
    if envelope.provider != capabilities.provider
        || !capabilities.hardware_slot_supported
        || !capabilities.hardware_backed
        || !capabilities.attestation_verified
    {
        return Err(KeyVaultError::AuthenticationFailed);
    }
    match envelope.provider {
        #[cfg(target_os = "linux")]
        StorageProvider::AstraeaOSNative => astraeaos::unseal_hardware_dek(
            account,
            &envelope.key_handle,
            &envelope.sealed_dek,
            aad,
            &envelope.attestation_digest_sha256,
        ),
        _ => Err(KeyVaultError::AuthenticationFailed),
    }
}

fn load_provider_secret(account: &str) -> Result<Option<[u8; KEY_SIZE]>, KeyVaultError> {
    validate_account(account)?;
    match active_provider() {
        #[cfg(target_os = "windows")]
        StorageProvider::WindowsDpapi => windows::load(account),
        #[cfg(target_os = "macos")]
        StorageProvider::MacOSKeychain => macos::load(account),
        #[cfg(target_os = "linux")]
        StorageProvider::AstraeaOSNative => astraeaos::load(account),
        #[cfg(target_os = "linux")]
        StorageProvider::LinuxSecretService => linux::load(account),
        _ => Err(KeyVaultError::StorageError(
            "No supported native key persistence provider is available on this platform".into(),
        )),
    }
}

fn save_provider_secret(account: &str, secret: &[u8; KEY_SIZE]) -> Result<(), KeyVaultError> {
    validate_account(account)?;
    match active_provider() {
        #[cfg(target_os = "windows")]
        StorageProvider::WindowsDpapi => windows::save(account, secret),
        #[cfg(target_os = "macos")]
        StorageProvider::MacOSKeychain => macos::save(account, secret),
        #[cfg(target_os = "linux")]
        StorageProvider::AstraeaOSNative => astraeaos::save(account, secret),
        #[cfg(target_os = "linux")]
        StorageProvider::LinuxSecretService => linux::save(account, secret),
        _ => Err(KeyVaultError::StorageError(
            "No supported native key persistence provider is available on this platform".into(),
        )),
    }
}

pub fn load_persistent_secret(account: &str) -> Result<Option<[u8; KEY_SIZE]>, KeyVaultError> {
    validate_account(account)?;
    if is_root_account(account) {
        load_root_secret(account)
    } else {
        load_provider_secret(account)
    }
}

pub fn save_persistent_secret(account: &str, secret: &[u8; KEY_SIZE]) -> Result<(), KeyVaultError> {
    validate_account(account)?;
    if is_root_account(account) {
        save_root_secret(account, secret)
    } else {
        save_provider_secret(account, secret)
    }
}

fn delete_provider_secret(account: &str) -> Result<(), KeyVaultError> {
    validate_account(account)?;
    match active_provider() {
        #[cfg(target_os = "windows")]
        StorageProvider::WindowsDpapi => windows::delete(account),
        #[cfg(target_os = "macos")]
        StorageProvider::MacOSKeychain => macos::delete(account),
        #[cfg(target_os = "linux")]
        StorageProvider::AstraeaOSNative => astraeaos::delete(account),
        #[cfg(target_os = "linux")]
        StorageProvider::LinuxSecretService => linux::delete(account),
        _ => Ok(()),
    }
}

pub fn delete_persistent_secret(account: &str) -> Result<(), KeyVaultError> {
    validate_account(account)?;
    if is_root_account(account) {
        let envelope = hardware_root_envelope_path(account)?;
        if envelope.exists() {
            fs::remove_file(&envelope).map_err(|e| KeyVaultError::StorageError(e.to_string()))?;
        }
    }
    delete_provider_secret(account)
}

pub fn purge_persistent_key_material() -> Result<(), KeyVaultError> {
    let dir = get_vault_dir()?;
    let manifest = dir.join("key-rotation-history-v1.json");
    let mut accounts = vec![
        STANDARD_ROOT_ACCOUNT.to_string(),
        PQC_ROOT_ACCOUNT.to_string(),
        PERSONAL_DOMAIN_ROOT_ACCOUNT.to_string(),
        ENTERPRISE_DOMAIN_ROOT_ACCOUNT.to_string(),
        TOP_SECRET_DEVICE_FACTOR_ACCOUNT.to_string(),
        "workspace-rotation-history-integrity".to_string(),
    ];
    if let Ok(bytes) = fs::read(&manifest) {
        if bytes.len() <= 4 * 1024 * 1024 {
            if let Ok(value) = serde_json::from_slice::<serde_json::Value>(&bytes) {
                fn walk(v: &serde_json::Value, out: &mut Vec<String>) {
                    match v {
                        serde_json::Value::String(x)
                            if x.starts_with("workspace-history-")
                                && x.len() <= 96
                                && x.bytes().all(|b| {
                                    b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_')
                                }) =>
                        {
                            out.push(x.clone())
                        }
                        serde_json::Value::Array(a) => {
                            for x in a {
                                walk(x, out)
                            }
                        }
                        serde_json::Value::Object(m) => {
                            for x in m.values() {
                                walk(x, out)
                            }
                        }
                        _ => {}
                    }
                }
                walk(&value, &mut accounts);
            }
        }
    }
    accounts.sort();
    accounts.dedup();
    let mut first: Option<KeyVaultError> = None;
    for account in accounts {
        if let Err(e) = delete_persistent_secret(&account) {
            if first.is_none() {
                first = Some(e);
            }
        }
    }
    for path in [manifest, top_secret_envelope_path()?] {
        if path.exists() {
            if let Err(e) = fs::remove_file(path) {
                if first.is_none() {
                    first = Some(KeyVaultError::StorageError(e.to_string()));
                }
            }
        }
    }
    if let Some(e) = first {
        Err(e)
    } else {
        Ok(())
    }
}
pub fn load_persistent_wmk() -> Result<Option<[u8; KEY_SIZE]>, KeyVaultError> {
    load_persistent_secret(STANDARD_ROOT_ACCOUNT)
}

pub fn save_persistent_wmk(wmk: &[u8; KEY_SIZE]) -> Result<(), KeyVaultError> {
    save_persistent_secret(STANDARD_ROOT_ACCOUNT, wmk)
}

pub(crate) fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), KeyVaultError> {
    use std::io::Write;
    let parent = path
        .parent()
        .ok_or_else(|| KeyVaultError::StorageError("KeyVault path has no parent".into()))?;
    fs::create_dir_all(parent).map_err(|e| KeyVaultError::StorageError(e.to_string()))?;
    if let Ok(metadata) = fs::symlink_metadata(path) {
        if metadata.file_type().is_symlink() {
            return Err(KeyVaultError::StorageError(
                "KeyVault target may not be a symbolic link".into(),
            ));
        }
    }

    let random = generate_random_bytes::<8>();
    let suffix = random
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    let base = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| {
            KeyVaultError::StorageError("KeyVault path has an invalid filename".into())
        })?;
    let tmp = parent.join(format!(".{base}.{suffix}.tmp"));
    let result = (|| {
        let mut options = fs::OpenOptions::new();
        options.create_new(true).write(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options
            .open(&tmp)
            .map_err(|e| KeyVaultError::StorageError(e.to_string()))?;
        file.write_all(bytes)
            .and_then(|_| file.sync_all())
            .map_err(|e| KeyVaultError::StorageError(e.to_string()))?;
        drop(file);
        replace_file(&tmp, path)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    result
}

/// Atomically creates a private file without replacing an existing provider record.
pub(crate) fn atomic_create(path: &Path, bytes: &[u8]) -> Result<(), KeyVaultError> {
    use std::io::Write;
    let parent = path
        .parent()
        .ok_or_else(|| KeyVaultError::StorageError("KeyVault path has no parent".into()))?;
    fs::create_dir_all(parent).map_err(|e| KeyVaultError::StorageError(e.to_string()))?;
    let random = generate_random_bytes::<8>();
    let suffix = random
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    let base = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| {
            KeyVaultError::StorageError("KeyVault path has an invalid filename".into())
        })?;
    let tmp = parent.join(format!(".{base}.{suffix}.tmp"));
    let result = (|| {
        let mut options = fs::OpenOptions::new();
        options.create_new(true).write(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options
            .open(&tmp)
            .map_err(|e| KeyVaultError::StorageError(e.to_string()))?;
        file.write_all(bytes)
            .and_then(|_| file.sync_all())
            .map_err(|e| KeyVaultError::StorageError(e.to_string()))?;
        drop(file);
        fs::hard_link(&tmp, path).map_err(|e| {
            if e.kind() == std::io::ErrorKind::AlreadyExists {
                KeyVaultError::PolicyViolation
            } else {
                KeyVaultError::StorageError(e.to_string())
            }
        })?;
        fs::remove_file(&tmp).map_err(|e| KeyVaultError::StorageError(e.to_string()))?;
        #[cfg(unix)]
        fs::File::open(parent)
            .and_then(|dir| dir.sync_all())
            .map_err(|e| KeyVaultError::StorageError(e.to_string()))?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    result
}

#[cfg(not(target_os = "windows"))]
fn replace_file(tmp: &Path, path: &Path) -> Result<(), KeyVaultError> {
    fs::rename(tmp, path).map_err(|e| KeyVaultError::StorageError(e.to_string()))?;
    if let Some(parent) = path.parent() {
        fs::File::open(parent)
            .and_then(|dir| dir.sync_all())
            .map_err(|e| KeyVaultError::StorageError(e.to_string()))?;
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn replace_file(tmp: &Path, path: &Path) -> Result<(), KeyVaultError> {
    use std::os::windows::ffi::OsStrExt;
    const MOVEFILE_REPLACE_EXISTING: u32 = 0x1;
    const MOVEFILE_WRITE_THROUGH: u32 = 0x8;
    #[link(name = "kernel32")]
    extern "system" {
        fn MoveFileExW(existing: *const u16, replacement: *const u16, flags: u32) -> i32;
    }
    let from: Vec<u16> = tmp.as_os_str().encode_wide().chain(Some(0)).collect();
    let to: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
    let ok = unsafe {
        MoveFileExW(
            from.as_ptr(),
            to.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if ok == 0 {
        return Err(KeyVaultError::StorageError(
            "Windows atomic KeyVault replace failed".into(),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod sec012_tests {
    use super::*;

    fn probe(interface: bool, slot: bool, backed: bool, attested: bool) -> StorageCapabilityProbe {
        StorageCapabilityProbe {
            provider: StorageProvider::Unavailable,
            available: true,
            secure_persistence: true,
            hardware_interface_detected: interface,
            hardware_slot_supported: slot,
            hardware_backed: backed,
            attestation_verified: attested,
            hardware_interface_probe_indeterminate: false,
            hardware_provider_probe_status: None,
            provider_name: "SEC012 mock".into(),
            features: Vec::new(),
        }
    }

    #[test]
    fn sec012_detected_interface_without_a_claim_uses_the_secure_software_provider() {
        // The Windows + TPM case measured live: DPAPI reports the TPM interface but
        // claims no slot, no backing and no attestation. That is a healthy secure
        // software provider, not an error — refusing it made "save natively" fail.
        assert_eq!(
            root_persistence_mode(&probe(true, false, false, false)).unwrap(),
            RootPersistenceMode::SecureSoftwareProvider
        );
    }

    #[test]
    fn sec012_incomplete_hardware_claim_fails_closed() {
        // A provider that claims *anything* hardware-related must prove everything.
        assert!(matches!(
            root_persistence_mode(&probe(true, true, false, false)),
            Err(KeyVaultError::ProviderUnavailable)
        ));
        assert!(matches!(
            root_persistence_mode(&probe(true, false, true, false)),
            Err(KeyVaultError::ProviderUnavailable)
        ));
        assert!(matches!(
            root_persistence_mode(&probe(true, false, false, true)),
            Err(KeyVaultError::ProviderUnavailable)
        ));
        // … including a claim whose interface probe never saw the interface.
        assert!(matches!(
            root_persistence_mode(&probe(false, true, true, true)),
            Err(KeyVaultError::ProviderUnavailable)
        ));
    }

    #[test]
    fn sec012_verified_hardware_requires_all_attestation_signals() {
        assert_eq!(
            root_persistence_mode(&probe(true, true, true, true)).unwrap(),
            RootPersistenceMode::VerifiedHardwareSlot
        );
        assert!(root_persistence_mode(&probe(true, true, true, false)).is_err());
        assert!(root_persistence_mode(&probe(true, true, false, true)).is_err());
        assert!(root_persistence_mode(&probe(false, true, true, true)).is_err());
    }

    #[test]
    fn sec012_indeterminate_hardware_probe_never_falls_back_to_software() {
        let mut unknown = probe(false, false, false, false);
        unknown.hardware_interface_probe_indeterminate = true;
        unknown.hardware_provider_probe_status = Some(0x8009_0010u32 as i32);
        assert!(matches!(
            root_persistence_mode(&unknown),
            Err(KeyVaultError::ProviderUnavailable)
        ));
    }

    #[test]
    fn sec012_unavailable_or_insecure_provider_never_satisfies_root_policy() {
        let mut unavailable = probe(false, false, false, false);
        unavailable.available = false;
        assert!(root_persistence_mode(&unavailable).is_err());
        let mut insecure = probe(false, false, false, false);
        insecure.secure_persistence = false;
        assert!(root_persistence_mode(&insecure).is_err());
    }

    #[test]
    fn sec012_no_hardware_interface_may_use_secure_native_persistence() {
        assert_eq!(
            root_persistence_mode(&probe(false, false, false, false)).unwrap(),
            RootPersistenceMode::SecureSoftwareProvider
        );
    }
}

#[cfg(test)]
mod sec012a_live_tests {
    use super::*;

    #[test]
    fn sec012a_live_provider_probe_does_not_downgrade_root_persistence() {
        let capabilities = provider_capabilities();
        let mode = root_persistence_mode(&capabilities);
        println!(
            "SEC012A_LIVE_ROOT_POLICY provider={:?} available={} secure={} interface={} indeterminate={} slot={} backed={} attested={} probe_status={:?} result={:?}",
            capabilities.provider,
            capabilities.available,
            capabilities.secure_persistence,
            capabilities.hardware_interface_detected,
            capabilities.hardware_interface_probe_indeterminate,
            capabilities.hardware_slot_supported,
            capabilities.hardware_backed,
            capabilities.attestation_verified,
            capabilities.hardware_provider_probe_status,
            mode
        );

        let has_hardware_claim = capabilities.hardware_slot_supported
            || capabilities.hardware_backed
            || capabilities.attestation_verified;
        let complete_hardware_contract = capabilities.hardware_interface_detected
            && capabilities.hardware_slot_supported
            && capabilities.hardware_backed
            && capabilities.attestation_verified;
        // A detected interface is not a claim (see `root_persistence_mode`); only an
        // incomplete *claim* may fail closed.
        if !capabilities.available
            || !capabilities.secure_persistence
            || capabilities.hardware_interface_probe_indeterminate
            || (has_hardware_claim && !complete_hardware_contract)
        {
            assert!(matches!(mode, Err(KeyVaultError::ProviderUnavailable)));
        } else if complete_hardware_contract {
            assert!(matches!(
                mode,
                Ok(RootPersistenceMode::VerifiedHardwareSlot)
            ));
        } else {
            assert!(matches!(
                mode,
                Ok(RootPersistenceMode::SecureSoftwareProvider)
            ));
        }
    }
}
