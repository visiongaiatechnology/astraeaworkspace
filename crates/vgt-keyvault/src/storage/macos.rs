use crate::storage::SERVICE_NAME;
use crate::KeyVaultError;
use std::process::{Command, Stdio};
use vgt_crypto::KEY_SIZE;

type OSStatus = i32;
type SecKeychainItemRef = *mut std::ffi::c_void;

#[link(name = "Security", kind = "framework")]
extern "C" {
    fn SecKeychainFindGenericPassword(
        keychain_or_array: *const std::ffi::c_void,
        service_len: u32,
        service: *const i8,
        account_len: u32,
        account: *const i8,
        password_len: *mut u32,
        password_data: *mut *mut std::ffi::c_void,
        item_ref: *mut SecKeychainItemRef,
    ) -> OSStatus;
    fn SecKeychainAddGenericPassword(
        keychain: *const std::ffi::c_void,
        service_len: u32,
        service: *const i8,
        account_len: u32,
        account: *const i8,
        password_len: u32,
        password_data: *const std::ffi::c_void,
        item_ref: *mut SecKeychainItemRef,
    ) -> OSStatus;
    fn SecKeychainItemModifyAttributesAndData(
        item_ref: SecKeychainItemRef,
        attr_list: *const std::ffi::c_void,
        length: u32,
        data: *const std::ffi::c_void,
    ) -> OSStatus;
    fn SecKeychainItemFreeContent(
        attr_list: *const std::ffi::c_void,
        data: *mut std::ffi::c_void,
    ) -> OSStatus;
    fn SecKeychainItemDelete(item_ref: SecKeychainItemRef) -> OSStatus;
}

#[link(name = "CoreFoundation", kind = "framework")]
extern "C" {
    fn CFRelease(cf: *const std::ffi::c_void);
}

const ITEM_NOT_FOUND: OSStatus = -25300;

unsafe fn release(item: SecKeychainItemRef) {
    if !item.is_null() {
        CFRelease(item as *const std::ffi::c_void);
    }
}

fn find(account: &str) -> Result<Option<([u8; KEY_SIZE], SecKeychainItemRef)>, KeyVaultError> {
    let service = SERVICE_NAME.as_bytes();
    let account_bytes = account.as_bytes();
    let mut length = 0u32;
    let mut data: *mut std::ffi::c_void = std::ptr::null_mut();
    let mut item: SecKeychainItemRef = std::ptr::null_mut();
    let status = unsafe {
        SecKeychainFindGenericPassword(
            std::ptr::null(),
            service.len() as u32,
            service.as_ptr() as *const i8,
            account_bytes.len() as u32,
            account_bytes.as_ptr() as *const i8,
            &mut length,
            &mut data,
            &mut item,
        )
    };
    if status == ITEM_NOT_FOUND {
        return Ok(None);
    }
    if status != 0 || data.is_null() {
        unsafe { release(item) };
        return Err(KeyVaultError::StorageError(format!(
            "macOS Keychain lookup failed ({status})"
        )));
    }
    if length as usize != KEY_SIZE {
        unsafe {
            SecKeychainItemFreeContent(std::ptr::null(), data);
            release(item);
        }
        return Err(KeyVaultError::StorageError(
            "macOS Keychain secret has invalid length".into(),
        ));
    }
    let mut secret = [0u8; KEY_SIZE];
    unsafe {
        secret.copy_from_slice(std::slice::from_raw_parts(data as *const u8, KEY_SIZE));
        SecKeychainItemFreeContent(std::ptr::null(), data);
    }
    Ok(Some((secret, item)))
}

pub(super) fn load(account: &str) -> Result<Option<[u8; KEY_SIZE]>, KeyVaultError> {
    match find(account)? {
        Some((secret, item)) => {
            unsafe { release(item) };
            Ok(Some(secret))
        }
        None => Ok(None),
    }
}

pub(super) fn save(account: &str, secret: &[u8; KEY_SIZE]) -> Result<(), KeyVaultError> {
    if let Some((_old, item)) = find(account)? {
        let status = unsafe {
            SecKeychainItemModifyAttributesAndData(
                item,
                std::ptr::null(),
                KEY_SIZE as u32,
                secret.as_ptr() as *const std::ffi::c_void,
            )
        };
        unsafe { release(item) };
        if status != 0 {
            return Err(KeyVaultError::StorageError(format!(
                "macOS Keychain update failed ({status})"
            )));
        }
        return Ok(());
    }

    let service = SERVICE_NAME.as_bytes();
    let account_bytes = account.as_bytes();
    let mut item: SecKeychainItemRef = std::ptr::null_mut();
    let status = unsafe {
        SecKeychainAddGenericPassword(
            std::ptr::null(),
            service.len() as u32,
            service.as_ptr() as *const i8,
            account_bytes.len() as u32,
            account_bytes.as_ptr() as *const i8,
            KEY_SIZE as u32,
            secret.as_ptr() as *const std::ffi::c_void,
            &mut item,
        )
    };
    unsafe { release(item) };
    if status != 0 {
        return Err(KeyVaultError::StorageError(format!(
            "macOS Keychain save failed ({status})"
        )));
    }
    Ok(())
}

/// The Security framework exposes Secure Enclave key APIs on supported macOS systems,
/// but API availability alone is not key-bound attestation. Hardware-backed remains false
/// until the actual Workspace root/slot is proven by the native provider.
pub(super) fn secure_enclave_api_available() -> bool {
    Command::new("ioreg")
        .args(["-rd1", "-c", "AppleSEPManager"])
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .output()
        .map(|output| output.status.success() && !output.stdout.is_empty())
        .unwrap_or(false)
}

pub(super) fn delete(account: &str) -> Result<(), KeyVaultError> {
    match find(account)? {
        Some((mut secret, item)) => {
            secret.fill(0);
            let status = unsafe { SecKeychainItemDelete(item) };
            unsafe { release(item) };
            if status == 0 || status == ITEM_NOT_FOUND {
                Ok(())
            } else {
                Err(KeyVaultError::StorageError(format!(
                    "macOS Keychain delete failed ({status})"
                )))
            }
        }
        None => Ok(()),
    }
}
