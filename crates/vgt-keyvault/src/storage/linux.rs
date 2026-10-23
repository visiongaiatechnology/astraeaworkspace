use crate::storage::SERVICE_NAME;
use crate::KeyVaultError;
use std::io::Write;
use std::process::{Command, Stdio};
use vgt_crypto::KEY_SIZE;

pub(super) fn available() -> bool {
    Command::new("secret-tool")
        .arg("--version")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

fn hex_encode(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for &byte in bytes {
        out.push(HEX[(byte >> 4) as usize] as char);
        out.push(HEX[(byte & 0x0f) as usize] as char);
    }
    out
}

fn decode(input: &str) -> Result<[u8; KEY_SIZE], KeyVaultError> {
    let text = input.trim();
    if text.len() != KEY_SIZE * 2 || !text.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(KeyVaultError::StorageError(
            "Secret Service value has invalid encoding".into(),
        ));
    }
    let mut output = [0u8; KEY_SIZE];
    for (index, slot) in output.iter_mut().enumerate() {
        *slot = u8::from_str_radix(&text[index * 2..index * 2 + 2], 16).map_err(|_| {
            KeyVaultError::StorageError("Secret Service value has invalid encoding".into())
        })?;
    }
    Ok(output)
}

pub(super) fn load(account: &str) -> Result<Option<[u8; KEY_SIZE]>, KeyVaultError> {
    if !available() {
        return Err(KeyVaultError::StorageError(
            "Linux Secret Service client is unavailable".into(),
        ));
    }
    let output = Command::new("secret-tool")
        .args(["lookup", "service", SERVICE_NAME, "key", account])
        .stdin(Stdio::null())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| KeyVaultError::StorageError(format!("Secret Service lookup failed: {e}")))?;
    if !output.status.success() {
        let diagnostic = String::from_utf8_lossy(&output.stderr).trim().to_string();
        if diagnostic.is_empty() {
            return Ok(None);
        }
        return Err(KeyVaultError::StorageError(format!(
            "Secret Service lookup failed: {diagnostic}"
        )));
    }
    if output.stdout.is_empty() {
        return Ok(None);
    }
    let text = String::from_utf8(output.stdout)
        .map_err(|_| KeyVaultError::StorageError("Secret Service returned non-UTF8 data".into()))?;
    Ok(Some(decode(&text)?))
}

pub(super) fn save(account: &str, secret: &[u8; KEY_SIZE]) -> Result<(), KeyVaultError> {
    if !available() {
        return Err(KeyVaultError::StorageError(
            "Linux Secret Service client is unavailable".into(),
        ));
    }
    let mut child = Command::new("secret-tool")
        .args([
            "store",
            "--label",
            "VGT Workspace KeyVault Secret",
            "service",
            SERVICE_NAME,
            "key",
            account,
        ])
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| KeyVaultError::StorageError(format!("Secret Service save failed: {e}")))?;
    let mut encoded = hex_encode(secret);
    if let Some(stdin) = child.stdin.as_mut() {
        stdin.write_all(encoded.as_bytes()).map_err(|e| {
            KeyVaultError::StorageError(format!("Secret Service input failed: {e}"))
        })?;
    } else {
        encoded.clear();
        return Err(KeyVaultError::StorageError(
            "Secret Service stdin unavailable".into(),
        ));
    }
    encoded.clear();
    let output = child
        .wait_with_output()
        .map_err(|e| KeyVaultError::StorageError(format!("Secret Service save failed: {e}")))?;
    if !output.status.success() {
        return Err(KeyVaultError::StorageError(
            "Secret Service rejected secure storage".into(),
        ));
    }
    Ok(())
}

/// Detects a kernel TPM character-device interface only. This is deliberately not
/// interpreted as proof that any KeyVault key is hardware-resident.
pub(super) fn tpm_interface_detected() -> bool {
    ["/dev/tpmrm0", "/dev/tpm0"].iter().any(|path| {
        std::fs::metadata(path)
            .map(|meta| !meta.is_dir())
            .unwrap_or(false)
    })
}

pub(super) fn delete(account: &str) -> Result<(), KeyVaultError> {
    if !available() {
        return Ok(());
    }
    if load(account)?.is_none() {
        return Ok(());
    }
    let output = Command::new("secret-tool")
        .args(["clear", "service", SERVICE_NAME, "key", account])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| KeyVaultError::StorageError(format!("Secret Service delete failed: {e}")))?;
    if output.status.success() {
        Ok(())
    } else {
        Err(KeyVaultError::StorageError(
            "Secret Service rejected secure deletion".into(),
        ))
    }
}
