// STATUS: DIAMANT VGT SUPREME
//! # VGT KeyVault
//!
//! Platform-abstracted secure key management for Astraea Workspace.
//! Standard, PQC and VGT Top Secret are separate key domains: none is derived
//! from another domain root, and policy transitions require explicit rewrap/reseal.

pub mod audit;
pub mod domain;
pub mod lifecycle;
mod platform;
pub mod plugin_handle_policy;
pub mod provider;
pub mod recovery;
mod rotation_history;
pub mod slots;
mod software_provider;
pub mod storage;
pub mod throttle;
pub mod top_secret_access;
pub mod top_secret_identity;
pub mod transactions;
pub mod transitions;

pub use audit::{KeyVaultAuditAction, KeyVaultAuditRecord, KeyVaultAuditSnapshot};
pub use domain::{
    AuthorityDomain, DomainAuthorizationToken, SealedAuthorityDomainSecret, SealedDomainSecret,
    SecurityKeyNamespace,
};
pub use lifecycle::{DocumentKeyHandle, LockReason};
pub use plugin_handle_policy::{
    plugin_secret_handle_expired, validate_plugin_secret_handle_ttl,
    MAX_PLUGIN_SECRET_HANDLE_TTL_SECS, MIN_PLUGIN_SECRET_HANDLE_TTL_SECS,
};
pub use provider::{ProviderHealth, ProviderRequirement};
pub use recovery::{
    BreakGlassRecoveryReceipt, BreakGlassShare, RecoveryArtifactDescriptor, RecoveryMode,
    RecoveryPolicy, BREAK_GLASS_SHARE_COUNT, BREAK_GLASS_THRESHOLD,
};
pub use slots::{parse_x25519_key_material, KeySlot, KeySlotType, UnlockPolicy};
pub use throttle::UnlockFactorClass;
pub use top_secret_access::{
    parse_offline_factor_hex, OfflineFactorState, TopSecretAccessPolicy, TopSecretEnrollmentResult,
    TopSecretRootEnvelope,
};
pub use top_secret_identity::{
    TopSecretComponentKind, TopSecretIdentityLifecycle, TopSecretIdentityRecord,
    TopSecretPrivateComponentInput, TopSecretPublicComponent, TopSecretRecipientBundle,
};
pub use transactions::{KeySlotMutationKind, KeySlotTransactionReceipt};
pub use transitions::{
    ProfileTransitionPlan, ResealCommitProof, RootRotationReceipt, SecurityProfile,
};

use platform::memory::LockedKey;
use serde::{Deserialize, Serialize};
use thiserror::Error;
use vgt_crypto::{
    decrypt_aes_gcm, derive_domain_subkey, encrypt_aes_gcm, CryptoDomain, KEY_SIZE, NONCE_SIZE,
};

#[derive(Error, Debug)]
pub enum KeyVaultError {
    #[error("Cryptographic operation failed")]
    Crypto(#[from] vgt_crypto::CryptoError),
    #[error("Requested key slot is unavailable")]
    SlotNotFound(u32),
    #[error("Authentication failed")]
    AuthenticationFailed,
    #[error("KeyVault storage operation failed")]
    StorageError(String),
    #[error("KeyVault is locked")]
    VaultLocked,
    #[error("Credential format rejected")]
    InvalidCredentialFormat,
    #[error("KeyVault policy rejected the operation")]
    PolicyViolation,
    #[error("Required secure-storage provider is unavailable")]
    ProviderUnavailable,
    #[error("Top Secret domain is not enrolled")]
    TopSecretNotEnrolled,
    #[error("Top Secret domain is locked")]
    TopSecretLocked,
    #[error("KeyVault record integrity validation failed")]
    IntegrityFailed,
    #[error("Recipient bundle provenance verification failed")]
    ProvenanceRejected,
    #[error("Operation requires an explicit cryptographic rewrap or reseal")]
    ResealRequired,
    #[error("Required anti-paging memory protection is unavailable")]
    MemoryProtectionUnavailable,
}

impl KeyVaultError {
    /// Stable non-secret diagnostic code. The code deliberately does not expose which
    /// internal unlock stage failed.
    pub const fn diagnostic_code(&self) -> &'static str {
        match self {
            Self::Crypto(_) => "KEYVAULT_CRYPTO_FAILED",
            Self::SlotNotFound(_) | Self::AuthenticationFailed => "KEYVAULT_AUTHENTICATION_FAILED",
            Self::StorageError(_) => "KEYVAULT_STORAGE_FAILED",
            Self::VaultLocked => "KEYVAULT_LOCKED",
            Self::InvalidCredentialFormat => "KEYVAULT_CREDENTIAL_FORMAT_REJECTED",
            Self::PolicyViolation => "KEYVAULT_POLICY_REJECTED",
            Self::ProviderUnavailable => "KEYVAULT_PROVIDER_UNAVAILABLE",
            Self::TopSecretNotEnrolled => "KEYVAULT_TOP_SECRET_NOT_ENROLLED",
            Self::TopSecretLocked => "KEYVAULT_TOP_SECRET_LOCKED",
            Self::IntegrityFailed => "KEYVAULT_INTEGRITY_FAILED",
            Self::ProvenanceRejected => "KEYVAULT_PROVENANCE_REJECTED",
            Self::ResealRequired => "KEYVAULT_RESEAL_REQUIRED",
            Self::MemoryProtectionUnavailable => "KEYVAULT_MEMORY_PROTECTION_UNAVAILABLE",
        }
    }
}

pub(crate) fn validate_pin_format(pin: &str) -> Result<(), KeyVaultError> {
    if pin == pin.trim()
        && (4..=8).contains(&pin.len())
        && pin.bytes().all(|byte| byte.is_ascii_digit())
    {
        Ok(())
    } else {
        Err(KeyVaultError::InvalidCredentialFormat)
    }
}

pub(crate) fn validate_portable_password_format(password: &str) -> Result<(), KeyVaultError> {
    let length = password.chars().count();
    if (8..=128).contains(&length) && !password.chars().any(char::is_control) {
        Ok(())
    } else {
        Err(KeyVaultError::InvalidCredentialFormat)
    }
}

pub(crate) fn validate_top_secret_user_secret(secret: &str) -> Result<(), KeyVaultError> {
    let length = secret.chars().count();
    if (12..=256).contains(&length) {
        Ok(())
    } else {
        Err(KeyVaultError::InvalidCredentialFormat)
    }
}

const MAX_APPLICATION_SECRET_BYTES: usize = 4096;
const MAX_APPLICATION_SECRET_SCOPE_BYTES: usize = 128;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SealedApplicationSecret {
    pub version: u8,
    pub nonce: [u8; NONCE_SIZE],
    pub ciphertext: Vec<u8>,
}

fn application_secret_aad(scope: &str) -> Result<Vec<u8>, KeyVaultError> {
    let bytes = scope.as_bytes();
    if bytes.is_empty()
        || bytes.len() > MAX_APPLICATION_SECRET_SCOPE_BYTES
        || !bytes
            .iter()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(*byte, b'.' | b'_' | b'-' | b':'))
    {
        return Err(KeyVaultError::InvalidCredentialFormat);
    }
    let mut aad = b"vgt-keyvault-application-secret-v1:".to_vec();
    aad.extend_from_slice(bytes);
    Ok(aad)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum VaultPlatform {
    WindowsDpapi,
    MacOSKeychain,
    LinuxSecretService,
    AstraeaOSKeyVault,
    SoftwareEncrypted,
    Unavailable,
}

pub struct VgtKeyVault {
    platform: VaultPlatform,
    workspace_master_key: Option<LockedKey>,
    pqc_root: Option<LockedKey>,
    personal_domain_root: Option<LockedKey>,
    enterprise_domain_root: Option<LockedKey>,
    top_secret_root: Option<LockedKey>,
    is_unlocked: bool,
    top_secret_unlocked: bool,
    top_secret_failed_attempts: u8,
    top_secret_blocked_until: Option<std::time::Instant>,
    document_credentials: lifecycle::DocumentCredentialRegistry,
    attempt_limiter: throttle::UnlockAttemptLimiter,
    audit_trail: audit::KeyVaultAuditTrail,
}

impl Default for VgtKeyVault {
    fn default() -> Self {
        Self::new()
    }
}

impl Drop for VgtKeyVault {
    fn drop(&mut self) {
        self.lock();
    }
}

impl VgtKeyVault {
    pub fn new() -> Self {
        let platform = match storage::active_provider() {
            storage::StorageProvider::WindowsDpapi => VaultPlatform::WindowsDpapi,
            storage::StorageProvider::MacOSKeychain => VaultPlatform::MacOSKeychain,
            storage::StorageProvider::LinuxSecretService => VaultPlatform::LinuxSecretService,
            storage::StorageProvider::AstraeaOSNative => VaultPlatform::AstraeaOSKeyVault,
            storage::StorageProvider::Unavailable => VaultPlatform::Unavailable,
        };
        Self {
            platform,
            workspace_master_key: None,
            pqc_root: None,
            personal_domain_root: None,
            enterprise_domain_root: None,
            top_secret_root: None,
            is_unlocked: false,
            top_secret_unlocked: false,
            top_secret_failed_attempts: 0,
            top_secret_blocked_until: None,
            document_credentials: lifecycle::DocumentCredentialRegistry::default(),
            attempt_limiter: throttle::UnlockAttemptLimiter::default(),
            audit_trail: audit::KeyVaultAuditTrail::default(),
        }
    }

    pub fn unlock_with_master_key(&mut self, wmk: [u8; KEY_SIZE]) -> Result<(), KeyVaultError> {
        self.workspace_master_key = Some(LockedKey::new(wmk)?);
        self.is_unlocked = true;
        Ok(())
    }

    /// Creates a separate passphrase-wrapped Standard Workspace root and selects it explicitly.
    /// Existing native-provider records are never read, replaced, or migrated by this operation.
    pub fn create_software_provider(&mut self, passphrase: String) -> Result<(), KeyVaultError> {
        if self.is_unlocked || self.workspace_master_key.is_some() {
            return Err(KeyVaultError::PolicyViolation);
        }
        let passphrase = zeroize::Zeroizing::new(passphrase);
        let protected = LockedKey::new(vgt_crypto::generate_random_bytes::<KEY_SIZE>())?;
        software_provider::create(&passphrase, protected.as_bytes())?;
        self.workspace_master_key = Some(protected);
        self.platform = VaultPlatform::SoftwareEncrypted;
        self.is_unlocked = true;
        Ok(())
    }

    /// Selects and unlocks the separately stored software provider after an explicit user action.
    pub fn unlock_software_provider(&mut self, passphrase: String) -> Result<(), KeyVaultError> {
        if self.is_unlocked || self.workspace_master_key.is_some() {
            return Err(KeyVaultError::PolicyViolation);
        }
        let passphrase = zeroize::Zeroizing::new(passphrase);
        let root = software_provider::unlock(&passphrase)?;
        let protected = LockedKey::new(root)?;
        self.workspace_master_key = Some(protected);
        self.platform = VaultPlatform::SoftwareEncrypted;
        self.is_unlocked = true;
        Ok(())
    }

    pub fn software_provider_configured() -> bool {
        software_provider::configured().unwrap_or(false)
    }

    /// Ensures the Workspace root exists without exposing root key bytes.
    pub fn ensure_workspace_root(&mut self) -> Result<(), KeyVaultError> {
        let result = self.ensure_wmk_loaded();
        self.audit_slot_event(
            "keyvault:root:standard",
            KeyVaultAuditAction::RootEnsured,
            None,
            None,
            result.is_ok(),
            if result.is_ok() {
                "KEYVAULT_ROOT_ENSURED"
            } else {
                "KEYVAULT_ROOT_ENSURE_REJECTED"
            },
        )?;
        result
    }

    fn ensure_wmk_loaded(&mut self) -> Result<(), KeyVaultError> {
        if self.workspace_master_key.is_some() {
            return Ok(());
        }
        if self.platform == VaultPlatform::SoftwareEncrypted {
            return Err(KeyVaultError::VaultLocked);
        }
        self.require_provider(ProviderRequirement::NativeSecurePersistence)?;
        let loaded = rotation_history::load_or_create_current_root(
            domain::SecurityKeyNamespace::Standard,
            storage::STANDARD_ROOT_ACCOUNT,
        )?;
        self.workspace_master_key = Some(LockedKey::new(loaded.root)?);
        self.is_unlocked = true;
        Ok(())
    }

    pub(crate) fn workspace_root(&mut self) -> Result<&[u8; KEY_SIZE], KeyVaultError> {
        self.ensure_wmk_loaded()?;
        self.workspace_master_key
            .as_ref()
            .map(LockedKey::as_bytes)
            .ok_or(KeyVaultError::VaultLocked)
    }

    pub fn derive_search_index_key(
        &mut self,
        workspace_scope: &str,
    ) -> Result<[u8; KEY_SIZE], KeyVaultError> {
        if !self.is_unlocked {
            return Err(KeyVaultError::VaultLocked);
        }
        let scope = workspace_scope.trim();
        if scope.is_empty()
            || scope.len() > 512
            || scope.bytes().any(|byte| byte.is_ascii_control())
        {
            return Err(KeyVaultError::InvalidCredentialFormat);
        }
        let root = self.workspace_root()?;
        derive_domain_subkey(
            root,
            b"vgt-search-index-v2",
            CryptoDomain::SearchIndex,
            scope.as_bytes(),
        )
        .map_err(Into::into)
    }

    pub fn derive_sync_transport_key(
        &mut self,
        workspace_scope: &str,
    ) -> Result<[u8; KEY_SIZE], KeyVaultError> {
        if !self.is_unlocked {
            return Err(KeyVaultError::VaultLocked);
        }
        let scope = workspace_scope.trim();
        if scope.is_empty()
            || scope.len() > 512
            || scope.bytes().any(|byte| byte.is_ascii_control())
        {
            return Err(KeyVaultError::InvalidCredentialFormat);
        }
        let root = self.workspace_root()?;
        derive_domain_subkey(
            root,
            b"vgt-sync-transport-v1",
            CryptoDomain::SyncTransport,
            scope.as_bytes(),
        )
        .map_err(Into::into)
    }

    pub fn seal_application_secret(
        &mut self,
        scope: &str,
        secret: &[u8],
    ) -> Result<SealedApplicationSecret, KeyVaultError> {
        if secret.is_empty() || secret.len() > MAX_APPLICATION_SECRET_BYTES {
            return Err(KeyVaultError::InvalidCredentialFormat);
        }
        let aad = application_secret_aad(scope)?;
        let wmk = self.workspace_root()?;
        let (ciphertext, nonce) = encrypt_aes_gcm(secret, wmk, &aad)?;
        Ok(SealedApplicationSecret {
            version: 1,
            nonce,
            ciphertext,
        })
    }

    pub fn unseal_application_secret(
        &mut self,
        scope: &str,
        sealed: &SealedApplicationSecret,
    ) -> Result<Vec<u8>, KeyVaultError> {
        if sealed.version != 1
            || sealed.ciphertext.is_empty()
            || sealed.ciphertext.len() > MAX_APPLICATION_SECRET_BYTES + 32
        {
            return Err(KeyVaultError::InvalidCredentialFormat);
        }
        let aad = application_secret_aad(scope)?;
        let wmk = self.workspace_root()?;
        decrypt_aes_gcm(&sealed.ciphertext, &sealed.nonce, wmk, &aad)
            .map_err(|_| KeyVaultError::AuthenticationFailed)
    }

    pub fn cryptographic_wipe(&mut self) -> Result<(), KeyVaultError> {
        self.lock();
        storage::purge_persistent_key_material()?;
        self.audit_trail = audit::KeyVaultAuditTrail::default();
        Ok(())
    }

    pub fn lock(&mut self) {
        let _ = self.workspace_master_key.take();
        let _ = self.pqc_root.take();
        let _ = self.personal_domain_root.take();
        let _ = self.enterprise_domain_root.take();
        let _ = self.top_secret_root.take();
        self.document_credentials.clear();
        self.attempt_limiter.clear();
        self.is_unlocked = false;
        self.top_secret_unlocked = false;
    }

    pub fn activate_document_key(
        &mut self,
        document_id: &str,
        key: [u8; KEY_SIZE],
        ttl: Option<std::time::Duration>,
    ) -> Result<DocumentKeyHandle, KeyVaultError> {
        let handle = self.document_credentials.activate(document_id, key, ttl)?;
        let _ = self.audit_slot_event(
            document_id,
            KeyVaultAuditAction::DocumentUnlocked,
            None,
            None,
            true,
            "KEYVAULT_DOCUMENT_UNLOCKED",
        );
        Ok(handle)
    }

    pub fn with_document_key<T>(
        &mut self,
        document_id: &str,
        handle: &DocumentKeyHandle,
        operation: impl FnOnce(&[u8; KEY_SIZE]) -> Result<T, KeyVaultError>,
    ) -> Result<T, KeyVaultError> {
        let result = self
            .document_credentials
            .with_key(document_id, handle, operation);
        let _ = self.audit_slot_event(
            document_id,
            KeyVaultAuditAction::DocumentKeyUsed,
            None,
            None,
            result.is_ok(),
            if result.is_ok() {
                "KEYVAULT_KEY_USED"
            } else {
                "KEYVAULT_KEY_USE_REJECTED"
            },
        );
        result
    }

    pub fn lock_document(
        &mut self,
        document_id: &str,
        _reason: LockReason,
    ) -> Result<bool, KeyVaultError> {
        let removed = self.document_credentials.lock_document(document_id)?;
        if removed {
            let _ = self.audit_slot_event(
                document_id,
                KeyVaultAuditAction::DocumentLocked,
                None,
                None,
                true,
                "KEYVAULT_DOCUMENT_LOCKED",
            );
        }
        Ok(removed)
    }

    pub fn sweep_expired_document_keys(&mut self) -> usize {
        self.document_credentials.sweep_expired()
    }

    pub fn active_document_key_count(&self) -> usize {
        self.document_credentials.active_count()
    }

    pub fn handle_suspend(&mut self) {
        self.document_credentials.clear();
        self.attempt_limiter.clear();
    }

    pub fn handle_session_lock(&mut self) {
        self.document_credentials.clear();
        self.attempt_limiter.clear();
    }

    pub fn audit_snapshot(&self, max_records: usize) -> Vec<KeyVaultAuditRecord> {
        self.audit_trail.snapshot(max_records)
    }

    pub fn audit_chain_snapshot(&self) -> KeyVaultAuditSnapshot {
        self.audit_trail.chain_snapshot()
    }

    pub fn verify_audit_chain(
        &self,
        snapshot: &KeyVaultAuditSnapshot,
    ) -> Result<(), KeyVaultError> {
        self.audit_trail.verify_snapshot(snapshot)
    }

    pub(crate) fn audit_slot_event(
        &mut self,
        document_id: &str,
        action: KeyVaultAuditAction,
        slot_type: Option<KeySlotType>,
        slot_id: Option<u32>,
        success: bool,
        result_code: &'static str,
    ) -> Result<KeyVaultAuditRecord, KeyVaultError> {
        self.audit_trail.push(
            document_id,
            action,
            slot_type,
            slot_id,
            success,
            result_code,
        )
    }

    pub fn relock(&mut self) {
        self.lock();
    }

    pub fn is_unlocked(&self) -> bool {
        self.is_unlocked
    }

    pub fn is_top_secret_unlocked(&self) -> bool {
        self.top_secret_unlocked
    }

    pub fn is_pqc_unlocked(&self) -> bool {
        self.pqc_root.is_some()
    }

    pub fn platform(&self) -> VaultPlatform {
        self.platform
    }

    pub fn top_secret_enrolled(&self) -> bool {
        storage::top_secret_envelope_path()
            .map(|path| path.exists())
            .unwrap_or(false)
    }

    pub(crate) fn top_secret_root(&self) -> Result<&[u8; KEY_SIZE], KeyVaultError> {
        self.top_secret_root
            .as_ref()
            .map(LockedKey::as_bytes)
            .ok_or(KeyVaultError::TopSecretLocked)
    }

    pub(crate) fn set_top_secret_root(
        &mut self,
        root: [u8; KEY_SIZE],
    ) -> Result<(), KeyVaultError> {
        let replacement = LockedKey::new(root)?;
        let _ = self.top_secret_root.replace(replacement);
        self.top_secret_unlocked = true;
        Ok(())
    }

    pub(crate) fn check_top_secret_throttle(&self) -> Result<(), KeyVaultError> {
        if self
            .top_secret_blocked_until
            .is_some_and(|deadline| std::time::Instant::now() < deadline)
        {
            Err(KeyVaultError::AuthenticationFailed)
        } else {
            Ok(())
        }
    }

    pub(crate) fn record_top_secret_auth_failure(&mut self) {
        self.top_secret_failed_attempts = self.top_secret_failed_attempts.saturating_add(1);
        if self.top_secret_failed_attempts >= 3 {
            let exponent = u32::from(self.top_secret_failed_attempts.saturating_sub(3)).min(5);
            let seconds = 1u64 << exponent;
            self.top_secret_blocked_until =
                Some(std::time::Instant::now() + std::time::Duration::from_secs(seconds));
        }
    }

    pub(crate) fn clear_top_secret_auth_failures(&mut self) {
        self.top_secret_failed_attempts = 0;
        self.top_secret_blocked_until = None;
    }
}

#[cfg(test)]
mod software_provider_selection_tests {
    use super::{KeyVaultError, VaultPlatform, VgtKeyVault};

    #[test]
    fn locked_software_provider_never_falls_back_to_platform_storage() {
        let mut vault = VgtKeyVault::new();
        vault.platform = VaultPlatform::SoftwareEncrypted;
        vault.lock();
        assert_eq!(vault.platform(), VaultPlatform::SoftwareEncrypted);
        assert!(matches!(
            vault.ensure_wmk_loaded(),
            Err(KeyVaultError::VaultLocked)
        ));
        assert!(!vault.is_unlocked());
    }
}
