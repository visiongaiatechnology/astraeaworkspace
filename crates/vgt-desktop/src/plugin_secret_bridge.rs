// STATUS: DIAMANT VGT SUPREME
//! Opaque plugin secret handles. Plaintext secrets never cross back into plugin/UI execution.

use crate::security_gate_bridge::require_trusted_main_window;
use crate::AppState;
use rand::{rngs::OsRng, RngCore};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{State, WebviewWindow};
use vgt_keyvault::{
    validate_plugin_secret_handle_ttl, SealedApplicationSecret, MAX_PLUGIN_SECRET_HANDLE_TTL_SECS,
};

const MAX_PLUGIN_ID_BYTES: usize = 128;
const MAX_SCOPE_BYTES: usize = 128;
const MAX_SECRET_BYTES: usize = 4096;

struct SecretHandleRecord {
    plugin_id: String,
    scope: String,
    expires_unix_ms: u64,
    sealed: SealedApplicationSecret,
}

#[derive(Default)]
pub struct PluginSecretHandleState {
    handles: Mutex<HashMap<String, SecretHandleRecord>>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct IssuePluginSecretHandleRequest {
    plugin_id: String,
    scope: String,
    secret: String,
    ttl_seconds: u64,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PluginSecretHandleRequest {
    plugin_id: String,
    scope: String,
    handle_id: String,
}

#[derive(Serialize)]
pub struct PluginSecretHandleResponse {
    success: bool,
    handle_id: Option<String>,
    plugin_id: String,
    scope: String,
    expires_unix_ms: Option<u64>,
    error: Option<String>,
}

#[tauri::command]
pub fn vgt_plugin_secret_handle_issue(
    window: WebviewWindow,
    app_state: State<'_, AppState>,
    handle_state: State<'_, PluginSecretHandleState>,
    request: IssuePluginSecretHandleRequest,
) -> Result<PluginSecretHandleResponse, String> {
    require_trusted_main_window(&window)?;
    validate_plugin_id(&request.plugin_id)?;
    validate_scope(&request.scope)?;
    validate_plugin_secret_handle_ttl(request.ttl_seconds)
        .map_err(|_| "Plugin secret handle TTL rejected".to_string())?;
    let mut secret = request.secret.into_bytes();
    if secret.is_empty() || secret.len() > MAX_SECRET_BYTES {
        secret.fill(0);
        return Err("Plugin secret size rejected".to_string());
    }
    let key_scope = format!("plugin-secret/{}/{}", request.plugin_id, request.scope);
    let sealed = {
        let mut vault = app_state
            .vault
            .lock()
            .map_err(|_| "KeyVault state unavailable".to_string())?;
        let result = vault
            .seal_application_secret(&key_scope, &secret)
            .map_err(|_| "Plugin secret could not be sealed".to_string());
        secret.fill(0);
        result?
    };
    let handle_id = random_handle_id();
    debug_assert!(request.ttl_seconds <= MAX_PLUGIN_SECRET_HANDLE_TTL_SECS);
    let expires_unix_ms = now_ms()?.saturating_add(request.ttl_seconds.saturating_mul(1000));
    let record = SecretHandleRecord {
        plugin_id: request.plugin_id.clone(),
        scope: request.scope.clone(),
        expires_unix_ms,
        sealed,
    };
    let mut handles = handle_state
        .handles
        .lock()
        .map_err(|_| "Plugin secret handle state unavailable".to_string())?;
    purge_expired(&mut handles, now_ms()?);
    handles.insert(handle_id.clone(), record);
    Ok(PluginSecretHandleResponse {
        success: true,
        handle_id: Some(handle_id),
        plugin_id: request.plugin_id,
        scope: request.scope,
        expires_unix_ms: Some(expires_unix_ms),
        error: None,
    })
}

#[tauri::command]
pub fn vgt_plugin_secret_handle_status(
    window: WebviewWindow,
    handle_state: State<'_, PluginSecretHandleState>,
    request: PluginSecretHandleRequest,
) -> Result<PluginSecretHandleResponse, String> {
    require_trusted_main_window(&window)?;
    validate_plugin_id(&request.plugin_id)?;
    validate_scope(&request.scope)?;
    validate_handle_id(&request.handle_id)?;
    let now = now_ms()?;
    let mut handles = handle_state
        .handles
        .lock()
        .map_err(|_| "Plugin secret handle state unavailable".to_string())?;
    purge_expired(&mut handles, now);
    let record = handles.get(&request.handle_id);
    let valid = record.is_some_and(|value| {
        value.plugin_id == request.plugin_id
            && value.scope == request.scope
            && value.expires_unix_ms > now
    });
    Ok(PluginSecretHandleResponse {
        success: valid,
        handle_id: valid.then_some(request.handle_id),
        plugin_id: request.plugin_id,
        scope: request.scope,
        expires_unix_ms: record.filter(|_| valid).map(|value| value.expires_unix_ms),
        error: (!valid).then(|| "Plugin secret handle unavailable".to_string()),
    })
}

#[tauri::command]
pub fn vgt_plugin_secret_handle_revoke(
    window: WebviewWindow,
    handle_state: State<'_, PluginSecretHandleState>,
    request: PluginSecretHandleRequest,
) -> Result<PluginSecretHandleResponse, String> {
    require_trusted_main_window(&window)?;
    validate_plugin_id(&request.plugin_id)?;
    validate_scope(&request.scope)?;
    validate_handle_id(&request.handle_id)?;
    let mut handles = handle_state
        .handles
        .lock()
        .map_err(|_| "Plugin secret handle state unavailable".to_string())?;
    let removed = handles
        .remove(&request.handle_id)
        .filter(|value| value.plugin_id == request.plugin_id && value.scope == request.scope)
        .is_some();
    Ok(PluginSecretHandleResponse {
        success: removed,
        handle_id: None,
        plugin_id: request.plugin_id,
        scope: request.scope,
        expires_unix_ms: None,
        error: (!removed).then(|| "Plugin secret handle unavailable".to_string()),
    })
}

#[allow(dead_code)]
pub(crate) fn resolve_secret_for_host(
    app_state: &AppState,
    handle_state: &PluginSecretHandleState,
    plugin_id: &str,
    scope: &str,
    handle_id: &str,
) -> Result<Vec<u8>, String> {
    validate_plugin_id(plugin_id)?;
    validate_scope(scope)?;
    validate_handle_id(handle_id)?;
    let now = now_ms()?;
    let handles = handle_state
        .handles
        .lock()
        .map_err(|_| "Plugin secret handle state unavailable".to_string())?;
    let record = handles
        .get(handle_id)
        .ok_or_else(|| "Plugin secret handle unavailable".to_string())?;
    if record.plugin_id != plugin_id || record.scope != scope || record.expires_unix_ms <= now {
        return Err("Plugin secret handle unavailable".to_string());
    }
    let key_scope = format!("plugin-secret/{plugin_id}/{scope}");
    let mut vault = app_state
        .vault
        .lock()
        .map_err(|_| "KeyVault state unavailable".to_string())?;
    vault
        .unseal_application_secret(&key_scope, &record.sealed)
        .map_err(|_| "Plugin secret handle unavailable".to_string())
}

fn purge_expired(handles: &mut HashMap<String, SecretHandleRecord>, now: u64) {
    handles.retain(|_, value| value.expires_unix_ms > now);
}

fn random_handle_id() -> String {
    let mut bytes = [0u8; 32];
    OsRng.fill_bytes(&mut bytes);
    let mut output = String::with_capacity(64);
    for byte in bytes {
        use std::fmt::Write as _;
        let _ = write!(&mut output, "{byte:02x}");
    }
    output
}

fn now_ms() -> Result<u64, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis().min(u128::from(u64::MAX)) as u64)
        .map_err(|_| "System clock unavailable".to_string())
}

fn validate_plugin_id(value: &str) -> Result<(), String> {
    if value.is_empty()
        || value.len() > MAX_PLUGIN_ID_BYTES
        || !value.bytes().all(|byte| {
            byte.is_ascii_lowercase() || byte.is_ascii_digit() || matches!(byte, b'.' | b'-')
        })
    {
        return Err("Plugin identity rejected".to_string());
    }
    Ok(())
}

fn validate_scope(value: &str) -> Result<(), String> {
    if value.is_empty()
        || value.len() > MAX_SCOPE_BYTES
        || !value.bytes().all(|byte| {
            byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'-' | b'_' | b':' | b'/')
        })
    {
        return Err("Plugin secret scope rejected".to_string());
    }
    Ok(())
}

fn validate_handle_id(value: &str) -> Result<(), String> {
    if value.len() != 64
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
    {
        return Err("Plugin secret handle rejected".to_string());
    }
    Ok(())
}
