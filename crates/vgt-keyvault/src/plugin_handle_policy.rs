// STATUS: DIAMANT VGT SUPREME
//! Shared fail-closed policy for opaque plugin secret handles.

use crate::KeyVaultError;

pub const MIN_PLUGIN_SECRET_HANDLE_TTL_SECS: u64 = 1;
pub const MAX_PLUGIN_SECRET_HANDLE_TTL_SECS: u64 = 300;

pub fn validate_plugin_secret_handle_ttl(ttl_seconds: u64) -> Result<(), KeyVaultError> {
    if !(MIN_PLUGIN_SECRET_HANDLE_TTL_SECS..=MAX_PLUGIN_SECRET_HANDLE_TTL_SECS)
        .contains(&ttl_seconds)
    {
        return Err(KeyVaultError::PolicyViolation);
    }
    Ok(())
}

pub fn plugin_secret_handle_expired(
    issued_unix_ms: u64,
    ttl_seconds: u64,
    now_unix_ms: u64,
) -> Result<bool, KeyVaultError> {
    validate_plugin_secret_handle_ttl(ttl_seconds)?;
    let expires = issued_unix_ms.saturating_add(ttl_seconds.saturating_mul(1000));
    Ok(now_unix_ms >= expires)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sec019_max_ttl_is_300_seconds() {
        assert!(validate_plugin_secret_handle_ttl(300).is_ok());
        assert!(validate_plugin_secret_handle_ttl(301).is_err());
    }

    #[test]
    fn sec019_handle_is_expired_after_301_seconds() {
        let issued = 1_000_000u64;
        assert!(!plugin_secret_handle_expired(issued, 300, issued + 299_000).unwrap());
        assert!(plugin_secret_handle_expired(issued, 300, issued + 301_000).unwrap());
    }
}
