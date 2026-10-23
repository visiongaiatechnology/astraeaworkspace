use crate::storage::{account_file_path, atomic_write};
use crate::KeyVaultError;
use std::fs::File;
use std::io::Read;
use vgt_crypto::KEY_SIZE;

#[repr(C)]
struct DataBlob {
    cb_data: u32,
    pb_data: *mut u8,
}

#[link(name = "crypt32")]
#[link(name = "kernel32")]
extern "system" {
    fn CryptProtectData(
        data_in: *const DataBlob,
        description: *const u16,
        optional_entropy: *const DataBlob,
        reserved: *mut std::ffi::c_void,
        prompt: *mut std::ffi::c_void,
        flags: u32,
        data_out: *mut DataBlob,
    ) -> i32;
    fn CryptUnprotectData(
        data_in: *const DataBlob,
        description: *mut *mut u16,
        optional_entropy: *const DataBlob,
        reserved: *mut std::ffi::c_void,
        prompt: *mut std::ffi::c_void,
        flags: u32,
        data_out: *mut DataBlob,
    ) -> i32;
    fn LocalFree(memory: *mut std::ffi::c_void) -> *mut std::ffi::c_void;
}

const UI_FORBIDDEN: u32 = 0x1;

fn protect(data: &[u8]) -> Result<Vec<u8>, KeyVaultError> {
    let input = DataBlob {
        cb_data: data.len() as u32,
        pb_data: data.as_ptr() as *mut u8,
    };
    let mut output = DataBlob {
        cb_data: 0,
        pb_data: std::ptr::null_mut(),
    };
    let ok = unsafe {
        CryptProtectData(
            &input,
            std::ptr::null(),
            std::ptr::null(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            UI_FORBIDDEN,
            &mut output,
        )
    };
    if ok == 0 || output.pb_data.is_null() {
        return Err(KeyVaultError::StorageError(
            "Windows DPAPI protect failed".into(),
        ));
    }
    let result = unsafe {
        let bytes = std::slice::from_raw_parts(output.pb_data, output.cb_data as usize).to_vec();
        LocalFree(output.pb_data as *mut std::ffi::c_void);
        bytes
    };
    Ok(result)
}

fn unprotect(data: &[u8]) -> Result<Vec<u8>, KeyVaultError> {
    let input = DataBlob {
        cb_data: data.len() as u32,
        pb_data: data.as_ptr() as *mut u8,
    };
    let mut output = DataBlob {
        cb_data: 0,
        pb_data: std::ptr::null_mut(),
    };
    let ok = unsafe {
        CryptUnprotectData(
            &input,
            std::ptr::null_mut(),
            std::ptr::null(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            UI_FORBIDDEN,
            &mut output,
        )
    };
    if ok == 0 || output.pb_data.is_null() {
        return Err(KeyVaultError::StorageError(
            "Windows DPAPI unprotect failed".into(),
        ));
    }
    let result = unsafe {
        let bytes = std::slice::from_raw_parts(output.pb_data, output.cb_data as usize).to_vec();
        for index in 0..output.cb_data as usize {
            std::ptr::write_volatile(output.pb_data.add(index), 0);
        }
        LocalFree(output.pb_data as *mut std::ffi::c_void);
        bytes
    };
    Ok(result)
}

pub(super) fn load(account: &str) -> Result<Option<[u8; KEY_SIZE]>, KeyVaultError> {
    let path = account_file_path(account)?;
    if !path.exists() {
        return Ok(None);
    }
    let mut ciphertext = Vec::new();
    File::open(path)
        .and_then(|mut file| file.read_to_end(&mut ciphertext))
        .map_err(|e| KeyVaultError::StorageError(e.to_string()))?;
    if ciphertext.is_empty() {
        return Err(KeyVaultError::StorageError(
            "Persistent DPAPI record is empty".into(),
        ));
    }
    let mut plaintext = unprotect(&ciphertext)?;
    if plaintext.len() != KEY_SIZE {
        plaintext.fill(0);
        return Err(KeyVaultError::StorageError(
            "Persistent DPAPI secret has invalid length".into(),
        ));
    }
    let mut secret = [0u8; KEY_SIZE];
    secret.copy_from_slice(&plaintext);
    plaintext.fill(0);
    Ok(Some(secret))
}

pub(super) fn save(account: &str, secret: &[u8; KEY_SIZE]) -> Result<(), KeyVaultError> {
    let path = account_file_path(account)?;
    let mut ciphertext = protect(secret)?;
    let result = atomic_write(&path, &ciphertext);
    ciphertext.fill(0);
    result
}

#[link(name = "ncrypt")]
extern "system" {
    fn NCryptOpenStorageProvider(
        provider: *mut usize,
        provider_name: *const u16,
        flags: u32,
    ) -> i32;
    fn NCryptFreeObject(object: usize) -> i32;
}

fn wide_null(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}

fn cng_provider_detected(name: &str) -> bool {
    let provider_name = wide_null(name);
    let mut handle = 0usize;
    let status = unsafe { NCryptOpenStorageProvider(&mut handle, provider_name.as_ptr(), 0) };
    if status == 0 && handle != 0 {
        unsafe { NCryptFreeObject(handle) };
        true
    } else {
        false
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum CngTpmProviderProbe {
    Present,
    DefinitivelyAbsent,
    Indeterminate(i32),
}

const ERROR_SUCCESS_STATUS: i32 = 0;
const NTE_BAD_PROVIDER_STATUS: i32 = 0x8009_0013u32 as i32;

fn classify_cng_tpm_provider_status(status: i32, handle: usize) -> CngTpmProviderProbe {
    match (status, handle) {
        (ERROR_SUCCESS_STATUS, 0) => CngTpmProviderProbe::Indeterminate(status),
        (ERROR_SUCCESS_STATUS, _) => CngTpmProviderProbe::Present,
        (NTE_BAD_PROVIDER_STATUS, 0) => CngTpmProviderProbe::DefinitivelyAbsent,
        _ => CngTpmProviderProbe::Indeterminate(status),
    }
}

pub(super) fn cng_software_provider_detected() -> bool {
    cng_provider_detected("Microsoft Software Key Storage Provider")
}

/// Only NTE_BAD_PROVIDER for this fixed provider name is definitive absence. Every other
/// failed probe is indeterminate and must keep root-key persistence fail-closed.
pub(super) fn cng_tpm_provider_probe() -> CngTpmProviderProbe {
    let provider_name = wide_null("Microsoft Platform Crypto Provider");
    let mut handle = 0usize;
    let status = unsafe { NCryptOpenStorageProvider(&mut handle, provider_name.as_ptr(), 0) };
    match classify_cng_tpm_provider_status(status, handle) {
        CngTpmProviderProbe::Present => {
            let free_status = unsafe { NCryptFreeObject(handle) };
            if free_status == ERROR_SUCCESS_STATUS {
                CngTpmProviderProbe::Present
            } else {
                CngTpmProviderProbe::Indeterminate(free_status)
            }
        }
        probe => probe,
    }
}

pub(super) fn delete(account: &str) -> Result<(), KeyVaultError> {
    let path = account_file_path(account)?;
    if !path.exists() {
        return Ok(());
    }
    std::fs::remove_file(path).map_err(|e| KeyVaultError::StorageError(e.to_string()))
}

#[cfg(test)]
mod cng_tpm_probe_tests {
    use super::{classify_cng_tpm_provider_status, CngTpmProviderProbe};

    #[test]
    fn provider_status_classifier_keeps_non_absence_errors_indeterminate() {
        assert_eq!(
            classify_cng_tpm_provider_status(0, 1),
            CngTpmProviderProbe::Present
        );
        assert_eq!(
            classify_cng_tpm_provider_status(0, 0),
            CngTpmProviderProbe::Indeterminate(0)
        );
        assert_eq!(
            classify_cng_tpm_provider_status(0x8009_0013u32 as i32, 0),
            CngTpmProviderProbe::DefinitivelyAbsent
        );
        assert_eq!(
            classify_cng_tpm_provider_status(0x8009_0010u32 as i32, 0),
            CngTpmProviderProbe::Indeterminate(0x8009_0010u32 as i32)
        );
    }
}
