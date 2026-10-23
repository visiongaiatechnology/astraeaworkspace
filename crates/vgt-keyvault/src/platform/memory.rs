// STATUS: DIAMANT VGT SUPREME
//! Page-locked storage for secret key material. The heap address is stable for the
//! lifetime of the Box, the containing page is locked before the key is exposed to
//! callers, and bytes are overwritten before the OS page lock is released.

use crate::KeyVaultError;
use std::ffi::c_void;
use vgt_crypto::{zeroize_best_effort, KEY_SIZE};

#[derive(Debug)]
pub(crate) struct LockedKey {
    bytes: Box<[u8; KEY_SIZE]>,
    locked: bool,
}

impl LockedKey {
    pub(crate) fn new(mut source: [u8; KEY_SIZE]) -> Result<Self, KeyVaultError> {
        let mut bytes = Box::new([0u8; KEY_SIZE]);
        bytes.copy_from_slice(&source);
        zeroize_best_effort(&mut source);
        if !lock_pages(bytes.as_ptr().cast::<c_void>(), KEY_SIZE) {
            zeroize_best_effort(bytes.as_mut_slice());
            return Err(KeyVaultError::MemoryProtectionUnavailable);
        }
        Ok(Self {
            bytes,
            locked: true,
        })
    }

    pub(crate) fn as_bytes(&self) -> &[u8; KEY_SIZE] {
        &self.bytes
    }

    #[cfg(test)]
    pub(crate) fn is_locked(&self) -> bool {
        self.locked
    }
}

impl Drop for LockedKey {
    fn drop(&mut self) {
        zeroize_best_effort(self.bytes.as_mut_slice());
        if self.locked {
            let _ = unlock_pages(self.bytes.as_ptr().cast::<c_void>(), KEY_SIZE);
            self.locked = false;
        }
    }
}

#[cfg(unix)]
fn lock_pages(address: *const c_void, len: usize) -> bool {
    unsafe extern "C" {
        fn mlock(addr: *const c_void, len: usize) -> i32;
    }
    // SAFETY: address references a live Box allocation for at least `len` bytes.
    unsafe { mlock(address, len) == 0 }
}

#[cfg(unix)]
fn unlock_pages(address: *const c_void, len: usize) -> bool {
    unsafe extern "C" {
        fn munlock(addr: *const c_void, len: usize) -> i32;
    }
    // SAFETY: called before the Box allocation is released and with the same range.
    unsafe { munlock(address, len) == 0 }
}

#[cfg(windows)]
fn lock_pages(address: *const c_void, len: usize) -> bool {
    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn VirtualLock(address: *const c_void, size: usize) -> i32;
    }
    // SAFETY: address references a live Box allocation for at least `len` bytes.
    unsafe { VirtualLock(address, len) != 0 }
}

#[cfg(windows)]
fn unlock_pages(address: *const c_void, len: usize) -> bool {
    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn VirtualUnlock(address: *const c_void, size: usize) -> i32;
    }
    // SAFETY: called before the Box allocation is released and with the same range.
    unsafe { VirtualUnlock(address, len) != 0 }
}

#[cfg(not(any(unix, windows)))]
fn lock_pages(_address: *const c_void, _len: usize) -> bool {
    false
}

#[cfg(not(any(unix, windows)))]
fn unlock_pages(_address: *const c_void, _len: usize) -> bool {
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sec018_key_pages_are_locked_and_drop_is_supported() {
        let key = LockedKey::new([0xA5; KEY_SIZE])
            .expect("page locking must be available for KeyVault tests");
        assert!(key.is_locked());
        assert_eq!(key.as_bytes()[0], 0xA5);
    }
}
