// STATUS: DIAMANT VGT SUPREME
use crate::KeyVaultError;
use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::os::unix::net::UnixStream;
use std::path::PathBuf;
use std::time::Duration;
use vgt_crypto::{constant_time_eq, KEY_SIZE};

const DEFAULT_SOCKET: &str = "/run/astraea/keyvault.sock";
const MAX_RESPONSE_BYTES: u64 = 16 * 1024;
const MAX_HARDWARE_ENVELOPE_BYTES: usize = 4096;
const MAX_HANDLE_BYTES: usize = 256;

#[derive(Serialize)]
struct Request<'a> {
    version: u8,
    operation: &'a str,
    namespace: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    account: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    value_hex: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    key_handle: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    aad_hex: Option<&'a str>,
}

#[derive(Deserialize)]
struct Response {
    version: u8,
    success: bool,
    found: Option<bool>,
    value_hex: Option<String>,
    #[serde(rename = "error")]
    _error: Option<String>,
    hardware_backed: Option<bool>,
    attestation_verified: Option<bool>,
    hardware_slot_api: Option<bool>,
    provider_name: Option<String>,
    key_handle: Option<String>,
    attestation_digest_hex: Option<String>,
}

#[derive(Debug, Clone)]
pub(super) struct NativeCapabilities {
    pub hardware_backed: bool,
    pub attestation_verified: bool,
    pub hardware_slot_api: bool,
    pub provider_name: String,
}

#[derive(Debug, Clone)]
pub(super) struct NativeHardwareEnvelope {
    pub key_handle: String,
    pub sealed: Vec<u8>,
    pub attestation_digest: [u8; 32],
}

fn socket_path() -> PathBuf {
    std::env::var_os("ASTRAEAOS_KEYVAULT_SOCKET")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(DEFAULT_SOCKET))
}

pub(super) fn available() -> bool {
    let path = socket_path();
    path.is_absolute() && path.exists() && !path.is_symlink()
}

fn transact(request: &Request<'_>) -> Result<Response, KeyVaultError> {
    if !available() {
        return Err(KeyVaultError::ProviderUnavailable);
    }
    let mut stream =
        UnixStream::connect(socket_path()).map_err(|_| KeyVaultError::ProviderUnavailable)?;
    stream
        .set_read_timeout(Some(Duration::from_secs(2)))
        .and_then(|_| stream.set_write_timeout(Some(Duration::from_secs(2))))
        .map_err(|_| KeyVaultError::ProviderUnavailable)?;
    let mut encoded = serde_json::to_vec(request).map_err(|_| KeyVaultError::IntegrityFailed)?;
    encoded.push(b'\n');
    let write_result = stream.write_all(&encoded);
    encoded.fill(0);
    write_result.map_err(|_| KeyVaultError::ProviderUnavailable)?;

    let mut bytes = Vec::new();
    stream
        .take(MAX_RESPONSE_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| KeyVaultError::ProviderUnavailable)?;
    if bytes.is_empty() || bytes.len() as u64 > MAX_RESPONSE_BYTES {
        bytes.fill(0);
        return Err(KeyVaultError::IntegrityFailed);
    }
    let response: Response =
        serde_json::from_slice(&bytes).map_err(|_| KeyVaultError::IntegrityFailed)?;
    bytes.fill(0);
    if response.version != 1 || !response.success {
        return Err(KeyVaultError::ProviderUnavailable);
    }
    Ok(response)
}

pub(super) fn capabilities() -> Result<NativeCapabilities, KeyVaultError> {
    let response = transact(&Request {
        version: 1,
        operation: "capabilities",
        namespace: "astraea-workspace",
        account: None,
        value_hex: None,
        key_handle: None,
        aad_hex: None,
    })?;
    let name = response
        .provider_name
        .unwrap_or_else(|| "AstraeaOS Native KeyVault".into());
    if name.is_empty() || name.len() > 128 || name.bytes().any(|byte| byte.is_ascii_control()) {
        return Err(KeyVaultError::IntegrityFailed);
    }
    Ok(NativeCapabilities {
        hardware_backed: response.hardware_backed == Some(true),
        attestation_verified: response.attestation_verified == Some(true),
        hardware_slot_api: response.hardware_slot_api == Some(true),
        provider_name: name,
    })
}

fn decode_secret(value: &str) -> Result<[u8; KEY_SIZE], KeyVaultError> {
    let bytes = decode_hex_bounded(value, KEY_SIZE)?;
    let mut output = [0u8; KEY_SIZE];
    output.copy_from_slice(&bytes);
    Ok(output)
}

fn encode_hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut output = String::with_capacity(bytes.len() * 2);
    for &byte in bytes {
        output.push(HEX[(byte >> 4) as usize] as char);
        output.push(HEX[(byte & 0x0f) as usize] as char);
    }
    output
}

fn decode_hex_bounded(value: &str, max_bytes: usize) -> Result<Vec<u8>, KeyVaultError> {
    if !value.len().is_multiple_of(2)
        || value.len() > max_bytes.saturating_mul(2)
        || !value.bytes().all(|byte| byte.is_ascii_hexdigit())
    {
        return Err(KeyVaultError::IntegrityFailed);
    }
    let mut output = Vec::with_capacity(value.len() / 2);
    for index in (0..value.len()).step_by(2) {
        output.push(
            u8::from_str_radix(&value[index..index + 2], 16)
                .map_err(|_| KeyVaultError::IntegrityFailed)?,
        );
    }
    Ok(output)
}

fn decode_digest(value: &str) -> Result<[u8; 32], KeyVaultError> {
    let bytes = decode_hex_bounded(value, 32)?;
    if bytes.len() != 32 {
        return Err(KeyVaultError::IntegrityFailed);
    }
    let mut digest = [0u8; 32];
    digest.copy_from_slice(&bytes);
    Ok(digest)
}

pub(super) fn load(account: &str) -> Result<Option<[u8; KEY_SIZE]>, KeyVaultError> {
    let response = transact(&Request {
        version: 1,
        operation: "load",
        namespace: "astraea-workspace",
        account: Some(account),
        value_hex: None,
        key_handle: None,
        aad_hex: None,
    })?;
    if response.found == Some(false) {
        return Ok(None);
    }
    let value = response.value_hex.ok_or(KeyVaultError::IntegrityFailed)?;
    Ok(Some(decode_secret(&value)?))
}

pub(super) fn save(account: &str, secret: &[u8; KEY_SIZE]) -> Result<(), KeyVaultError> {
    let mut encoded = encode_hex(secret);
    let result = transact(&Request {
        version: 1,
        operation: "save",
        namespace: "astraea-workspace",
        account: Some(account),
        value_hex: Some(&encoded),
        key_handle: None,
        aad_hex: None,
    });
    encoded.clear();
    result.map(|_| ())
}

pub(super) fn seal_hardware_dek(
    account: &str,
    dek: &[u8; KEY_SIZE],
    aad: &[u8],
) -> Result<NativeHardwareEnvelope, KeyVaultError> {
    let capabilities = capabilities()?;
    if !capabilities.hardware_backed
        || !capabilities.attestation_verified
        || !capabilities.hardware_slot_api
    {
        return Err(KeyVaultError::ProviderUnavailable);
    }
    let mut value_hex = encode_hex(dek);
    let mut aad_hex = encode_hex(aad);
    let response = transact(&Request {
        version: 1,
        operation: "seal-hardware-dek",
        namespace: "astraea-workspace",
        account: Some(account),
        value_hex: Some(&value_hex),
        key_handle: None,
        aad_hex: Some(&aad_hex),
    });
    value_hex.clear();
    aad_hex.clear();
    let response = response?;
    let key_handle = response.key_handle.ok_or(KeyVaultError::IntegrityFailed)?;
    if key_handle.is_empty()
        || key_handle.len() > MAX_HANDLE_BYTES
        || key_handle.bytes().any(|byte| byte.is_ascii_control())
    {
        return Err(KeyVaultError::IntegrityFailed);
    }
    let sealed_hex = response.value_hex.ok_or(KeyVaultError::IntegrityFailed)?;
    let sealed = decode_hex_bounded(&sealed_hex, MAX_HARDWARE_ENVELOPE_BYTES)?;
    if sealed.is_empty() {
        return Err(KeyVaultError::IntegrityFailed);
    }
    let attestation_digest = decode_digest(
        response
            .attestation_digest_hex
            .as_deref()
            .ok_or(KeyVaultError::IntegrityFailed)?,
    )?;
    Ok(NativeHardwareEnvelope {
        key_handle,
        sealed,
        attestation_digest,
    })
}

pub(super) fn unseal_hardware_dek(
    account: &str,
    key_handle: &str,
    sealed: &[u8],
    aad: &[u8],
    expected_attestation_digest: &[u8; 32],
) -> Result<[u8; KEY_SIZE], KeyVaultError> {
    let capabilities = capabilities()?;
    if !capabilities.hardware_backed
        || !capabilities.attestation_verified
        || !capabilities.hardware_slot_api
    {
        return Err(KeyVaultError::ProviderUnavailable);
    }
    if key_handle.is_empty()
        || key_handle.len() > MAX_HANDLE_BYTES
        || key_handle.bytes().any(|byte| byte.is_ascii_control())
        || sealed.is_empty()
        || sealed.len() > MAX_HARDWARE_ENVELOPE_BYTES
    {
        return Err(KeyVaultError::AuthenticationFailed);
    }
    let mut sealed_hex = encode_hex(sealed);
    let mut aad_hex = encode_hex(aad);
    let response = transact(&Request {
        version: 1,
        operation: "unseal-hardware-dek",
        namespace: "astraea-workspace",
        account: Some(account),
        value_hex: Some(&sealed_hex),
        key_handle: Some(key_handle),
        aad_hex: Some(&aad_hex),
    });
    sealed_hex.clear();
    aad_hex.clear();
    let response = response.map_err(|_| KeyVaultError::AuthenticationFailed)?;
    let returned_digest = decode_digest(
        response
            .attestation_digest_hex
            .as_deref()
            .ok_or(KeyVaultError::AuthenticationFailed)?,
    )?;
    if !constant_time_eq(&returned_digest, expected_attestation_digest) {
        return Err(KeyVaultError::AuthenticationFailed);
    }
    let value = response
        .value_hex
        .ok_or(KeyVaultError::AuthenticationFailed)?;
    decode_secret(&value).map_err(|_| KeyVaultError::AuthenticationFailed)
}

pub(super) fn delete(account: &str) -> Result<(), KeyVaultError> {
    if !available() {
        return Ok(());
    }
    transact(&Request {
        version: 1,
        operation: "delete",
        namespace: "astraea-workspace",
        account: Some(account),
        value_hex: None,
        key_handle: None,
        aad_hex: None,
    })
    .map(|_| ())
}
