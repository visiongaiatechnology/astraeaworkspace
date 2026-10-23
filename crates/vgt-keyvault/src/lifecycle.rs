// STATUS: DIAMANT VGT SUPREME
//! Per-document unlock lifecycle. User credentials are never persisted in this registry.
//! Only an already-authenticated document key is held behind a random opaque handle.
//! Every active key has a hard maximum idle lifetime of 60 seconds, refreshed only by
//! an authenticated operation. Keys are wiped best-effort on expiry, manual lock,
//! suspend, session lock, shutdown and drop.

use crate::{platform::memory::LockedKey, KeyVaultError};
use std::collections::HashMap;
use std::time::{Duration, Instant};
use vgt_crypto::{
    constant_time_eq, generate_random_bytes, hash_blake3, zeroize_best_effort, KEY_SIZE,
};

pub const MAX_ACTIVE_DOCUMENT_KEYS: usize = 256;
pub const MAX_DOCUMENT_ID_BYTES: usize = 256;
pub const MAX_UNLOCK_TTL_SECS: u64 = 60;
const DEFAULT_UNLOCK_IDLE_TTL: Duration = Duration::from_secs(MAX_UNLOCK_TTL_SECS);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LockReason {
    Manual,
    Timeout,
    Suspend,
    SessionLock,
    Shutdown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DocumentKeyHandle {
    token: [u8; 16],
    document_id_digest: [u8; 32],
}

impl DocumentKeyHandle {
    pub fn document_id_digest(&self) -> [u8; 32] {
        self.document_id_digest
    }
}

#[derive(Debug)]
struct ActiveDocumentKey {
    key: LockedKey,
    handle_token: [u8; 16],
    idle_ttl: Duration,
    expires_at: Instant,
}

impl Drop for ActiveDocumentKey {
    fn drop(&mut self) {
        zeroize_best_effort(&mut self.handle_token);
    }
}

#[derive(Debug, Default)]
pub(crate) struct DocumentCredentialRegistry {
    entries: HashMap<[u8; 32], ActiveDocumentKey>,
}

impl DocumentCredentialRegistry {
    pub(crate) fn activate(
        &mut self,
        document_id: &str,
        key: [u8; KEY_SIZE],
        ttl: Option<Duration>,
    ) -> Result<DocumentKeyHandle, KeyVaultError> {
        let digest = document_digest(document_id)?;
        if self.entries.len() >= MAX_ACTIVE_DOCUMENT_KEYS && !self.entries.contains_key(&digest) {
            return Err(KeyVaultError::PolicyViolation);
        }
        let idle_ttl = ttl.unwrap_or(DEFAULT_UNLOCK_IDLE_TTL);
        if idle_ttl.is_zero() || idle_ttl.as_secs() > MAX_UNLOCK_TTL_SECS {
            return Err(KeyVaultError::PolicyViolation);
        }
        let token = generate_random_bytes::<16>();
        self.entries.insert(
            digest,
            ActiveDocumentKey {
                key: LockedKey::new(key)?,
                handle_token: token,
                idle_ttl,
                expires_at: Instant::now() + idle_ttl,
            },
        );
        Ok(DocumentKeyHandle {
            token,
            document_id_digest: digest,
        })
    }

    pub(crate) fn with_key<T>(
        &mut self,
        document_id: &str,
        handle: &DocumentKeyHandle,
        operation: impl FnOnce(&[u8; KEY_SIZE]) -> Result<T, KeyVaultError>,
    ) -> Result<T, KeyVaultError> {
        let digest = document_digest(document_id)?;
        if !constant_time_eq(&digest, &handle.document_id_digest) {
            return Err(KeyVaultError::AuthenticationFailed);
        }
        let now = Instant::now();
        if self
            .entries
            .get(&digest)
            .is_some_and(|entry| now >= entry.expires_at)
        {
            self.entries.remove(&digest);
            return Err(KeyVaultError::VaultLocked);
        }
        let entry = self
            .entries
            .get_mut(&digest)
            .ok_or(KeyVaultError::VaultLocked)?;
        if !constant_time_eq(&entry.handle_token, &handle.token) {
            return Err(KeyVaultError::AuthenticationFailed);
        }
        let result = operation(entry.key.as_bytes());
        // Sliding idle deadline: a successful or failed authenticated operation is activity,
        // but can never extend the key beyond the policy maximum idle interval.
        entry.expires_at = Instant::now() + entry.idle_ttl;
        result
    }

    pub(crate) fn lock_document(&mut self, document_id: &str) -> Result<bool, KeyVaultError> {
        let digest = document_digest(document_id)?;
        Ok(self.entries.remove(&digest).is_some())
    }

    pub(crate) fn clear(&mut self) -> usize {
        let count = self.entries.len();
        self.entries.clear();
        count
    }

    pub(crate) fn sweep_expired(&mut self) -> usize {
        self.sweep_expired_at(Instant::now())
    }

    fn sweep_expired_at(&mut self, now: Instant) -> usize {
        let before = self.entries.len();
        self.entries.retain(|_, entry| now < entry.expires_at);
        before.saturating_sub(self.entries.len())
    }

    pub(crate) fn active_count(&self) -> usize {
        self.entries.len()
    }
}

pub(crate) fn validate_document_id(document_id: &str) -> Result<(), KeyVaultError> {
    let bytes = document_id.as_bytes();
    if bytes.is_empty()
        || bytes.len() > MAX_DOCUMENT_ID_BYTES
        || bytes.iter().any(|byte| byte.is_ascii_control())
    {
        return Err(KeyVaultError::InvalidCredentialFormat);
    }
    Ok(())
}

pub(crate) fn document_digest(document_id: &str) -> Result<[u8; 32], KeyVaultError> {
    validate_document_id(document_id)?;
    Ok(hash_blake3(document_id.as_bytes()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sec014_default_session_key_expires_after_sixty_seconds_idle() {
        let mut registry = DocumentCredentialRegistry::default();
        let handle = registry
            .activate("doc-idle", [0x55; KEY_SIZE], None)
            .unwrap();
        assert_eq!(registry.active_count(), 1);
        let future = Instant::now() + Duration::from_secs(MAX_UNLOCK_TTL_SECS + 1);
        assert_eq!(registry.sweep_expired_at(future), 1);
        assert!(matches!(
            registry.with_key("doc-idle", &handle, |_| Ok(())),
            Err(KeyVaultError::VaultLocked)
        ));
    }

    #[test]
    fn sec014_ttl_above_sixty_seconds_is_rejected() {
        let mut registry = DocumentCredentialRegistry::default();
        assert!(matches!(
            registry.activate(
                "doc-too-long",
                [0x66; KEY_SIZE],
                Some(Duration::from_secs(MAX_UNLOCK_TTL_SECS + 1)),
            ),
            Err(KeyVaultError::PolicyViolation)
        ));
    }
}
