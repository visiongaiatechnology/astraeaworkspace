// STATUS: DIAMANT VGT SUPREME
//! Bounded local unlock backoff. This is deliberately not described as protection
//! against offline cracking of exported portable-password slots.

use crate::{lifecycle::document_digest, KeyVaultError};
use std::collections::HashMap;
use std::time::{Duration, Instant};

pub const MAX_THROTTLE_RECORDS: usize = 1024;
pub const MAX_BACKOFF_SECS: u64 = 32;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum UnlockFactorClass {
    DeviceAndPin,
    HardwareBacked,
    TopSecret,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
struct AttemptKey {
    document_digest: [u8; 32],
    factor: UnlockFactorClass,
}

#[derive(Debug, Clone)]
struct AttemptState {
    failures: u8,
    blocked_until: Option<Instant>,
    last_seen: Instant,
}

#[derive(Debug, Default)]
pub(crate) struct UnlockAttemptLimiter {
    records: HashMap<AttemptKey, AttemptState>,
}

impl UnlockAttemptLimiter {
    fn key(document_id: &str, factor: UnlockFactorClass) -> Result<AttemptKey, KeyVaultError> {
        Ok(AttemptKey {
            document_digest: document_digest(document_id)?,
            factor,
        })
    }

    pub(crate) fn check(
        &mut self,
        document_id: &str,
        factor: UnlockFactorClass,
    ) -> Result<(), KeyVaultError> {
        self.prune();
        let key = Self::key(document_id, factor)?;
        if self
            .records
            .get(&key)
            .and_then(|state| state.blocked_until)
            .is_some_and(|deadline| Instant::now() < deadline)
        {
            return Err(KeyVaultError::AuthenticationFailed);
        }
        Ok(())
    }

    pub(crate) fn failure(
        &mut self,
        document_id: &str,
        factor: UnlockFactorClass,
    ) -> Result<Duration, KeyVaultError> {
        self.prune();
        let key = Self::key(document_id, factor)?;
        if self.records.len() >= MAX_THROTTLE_RECORDS && !self.records.contains_key(&key) {
            self.evict_oldest();
        }
        let now = Instant::now();
        let state = self.records.entry(key).or_insert(AttemptState {
            failures: 0,
            blocked_until: None,
            last_seen: now,
        });
        state.failures = state.failures.saturating_add(1);
        state.last_seen = now;
        let delay = if state.failures < 3 {
            Duration::ZERO
        } else {
            let exponent = u32::from(state.failures.saturating_sub(3)).min(5);
            Duration::from_secs((1u64 << exponent).min(MAX_BACKOFF_SECS))
        };
        state.blocked_until = (!delay.is_zero()).then_some(now + delay);
        Ok(delay)
    }

    pub(crate) fn success(
        &mut self,
        document_id: &str,
        factor: UnlockFactorClass,
    ) -> Result<(), KeyVaultError> {
        let key = Self::key(document_id, factor)?;
        self.records.remove(&key);
        Ok(())
    }

    pub(crate) fn clear(&mut self) {
        self.records.clear();
    }

    fn prune(&mut self) {
        let stale_before = Instant::now() - Duration::from_secs(15 * 60);
        self.records.retain(|_, state| {
            state.last_seen >= stale_before
                || state
                    .blocked_until
                    .is_some_and(|deadline| deadline > Instant::now())
        });
    }

    fn evict_oldest(&mut self) {
        if let Some(oldest) = self
            .records
            .iter()
            .min_by_key(|(_, state)| state.last_seen)
            .map(|(key, _)| *key)
        {
            self.records.remove(&oldest);
        }
    }
}
