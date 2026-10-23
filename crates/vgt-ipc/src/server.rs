//! # Sovereign Core IPC Bridge & Local Server
//!
//! Hardened loopback-only IPC server (`127.0.0.1:5042`) bridging UI to Rust Workspace Core:
//! - Strict origin allowlist and no wildcard CORS
//! - Request body ceiling (128 MiB) and header limits (64 KiB)
//! - Explicit UnlockPolicy enforcement
//! - Socket read/write timeouts (5s)
//! - Honest platform capability reporting

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use vgt_container::{ContainerError, SaveOptions, VgtContainer};
use vgt_formula::{CellCoord, ComputedValue, SpreadsheetEngine};
use vgt_keyvault::{
    parse_offline_factor_hex, parse_x25519_key_material, UnlockPolicy, VgtKeyVault,
};
use vgt_netgate::{
    NetGate, NetworkCapability, NetworkDataClass, NetworkDirection, NetworkProtocol, NetworkRequest,
};
use vgt_object_model::WorkspaceDocument;
use vgt_search::{DocumentIndexOptions, SearchIndex};

pub const MAX_REQUEST_BODY: usize = 128 * 1024 * 1024; // 128 MiB ceiling for JSON/base64 document IPC
pub const MAX_HEADER_BYTES: usize = 64 * 1024; // 64 KiB ceiling
pub const MAX_FORMULA_LENGTH: usize = 16 * 1024; // 16 KiB formula text ceiling
pub const MAX_FORMULA_CELLS: usize = 50_000; // bound dependency input per evaluation

fn request_body_exceeds_limit(content_length: usize) -> bool {
    content_length > MAX_REQUEST_BODY
}

fn search_transfer_request_body_limit(path: &str) -> Option<usize> {
    match path {
        "/api/v1/search/import/chunk" => Some(MAX_SEARCH_TRANSFER_REQUEST_BYTES),
        "/api/v1/search/import/begin"
        | "/api/v1/search/import/finalize"
        | "/api/v1/search/export/begin"
        | "/api/v1/search/export/chunk"
        | "/api/v1/search/transfer/abort" => Some(16 * 1024),
        _ => None,
    }
}

fn send_search_transfer_error(
    stream: &mut TcpStream,
    error: SearchTransferError,
    origin: &str,
) -> std::io::Result<()> {
    let (status, message) = match error {
        SearchTransferError::TooLarge => (413, "Encrypted search index exceeds transfer ceiling"),
        SearchTransferError::Busy => (429, "Search transfer capacity is unavailable"),
        SearchTransferError::NotFound => (404, "Search transfer was not found"),
        SearchTransferError::InvalidSequence => (409, "Search transfer sequence rejected"),
        SearchTransferError::StaleGeneration => (409, "Search transfer generation is stale"),
        SearchTransferError::Incomplete => (409, "Search transfer is incomplete"),
        SearchTransferError::DigestMismatch => (409, "Search transfer integrity check failed"),
        SearchTransferError::WrongDirection => (409, "Search transfer operation rejected"),
        SearchTransferError::Invalid => (400, "Search transfer request rejected"),
    };
    send_error(stream, status, message, origin)
}

fn hex_encode_32(bytes: &[u8; 32]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut output = String::with_capacity(64);
    for byte in bytes {
        output.push(HEX[(byte >> 4) as usize] as char);
        output.push(HEX[(byte & 0x0f) as usize] as char);
    }
    output
}

use crate::base64;
use crate::ipc_auth::{IpcAuthState, IPC_AUTH_HEADER};
use crate::search_transfer::{
    transfer_id_is_valid, SearchTransferError, SearchTransferStore, MAX_SEARCH_TRANSFER_BYTES,
    MAX_SEARCH_TRANSFER_CHUNK_BASE64_BYTES, MAX_SEARCH_TRANSFER_REQUEST_BYTES,
    SEARCH_TRANSFER_CHUNK_BYTES,
};

#[derive(Deserialize)]
struct PackRequest {
    document: WorkspaceDocument,
    pin: Option<String>,
    password: Option<String>,
    recipient_public_key: Option<String>,
}

#[derive(Serialize)]
struct PackResponse {
    success: bool,
    container_base64: Option<String>,
    error: Option<String>,
}

#[derive(Deserialize)]
struct UnpackRequest {
    container_base64: String,
    pin: Option<String>,
    password: Option<String>,
    recipient_private_key: Option<String>,
}

#[derive(Serialize)]
struct UnpackResponse {
    success: bool,
    document: Option<WorkspaceDocument>,
    error: Option<String>,
    requires_pin: bool,
    requires_password: bool,
}

#[derive(Deserialize)]
struct NetgateRequest {
    target_host: String,
    target_port: u16,
    purpose: String,
    capability: String,
    #[serde(default = "default_netgate_component")]
    component_id: String,
    #[serde(default)]
    document_id: Option<String>,
    #[serde(default)]
    automation_id: Option<String>,
    #[serde(default = "default_netgate_method")]
    method: String,
    #[serde(default)]
    expected_request_bytes: u64,
    #[serde(default)]
    expected_response_bytes: u64,
    #[serde(default = "default_netgate_timeout")]
    timeout_ms: u64,
}

fn default_netgate_component() -> String {
    "workspace-shell".to_string()
}

fn default_netgate_method() -> String {
    "GET".to_string()
}

fn default_netgate_timeout() -> u64 {
    5_000
}

fn evaluate_netgate_request(body: &[u8]) -> Result<serde_json::Value, serde_json::Error> {
    let request: NetgateRequest = serde_json::from_slice(body)?;
    let capability = match request.capability.as_str() {
        "LocalLanOnly" => NetworkCapability::LocalLanOnly,
        "WhitelistedOnly" => NetworkCapability::WhitelistedOnly,
        "FullUserApproved" => NetworkCapability::FullUserApproved,
        _ => NetworkCapability::None,
    };
    let protocol = if request.target_port == 80 {
        NetworkProtocol::Http
    } else {
        NetworkProtocol::Https
    };
    let network_request = NetworkRequest {
        component_id: request.component_id.clone(),
        document_id: request.document_id.clone(),
        automation_id: request.automation_id.clone(),
        target_host: request.target_host.clone(),
        target_port: request.target_port,
        protocol,
        direction: NetworkDirection::Outbound,
        data_class: NetworkDataClass::Metadata,
        purpose: request.purpose.clone(),
        method: Some(request.method.to_ascii_uppercase()),
        expected_request_bytes: request.expected_request_bytes,
        expected_response_bytes: request.expected_response_bytes,
        timeout_ms: request.timeout_ms,
    };
    let mut evaluator = NetGate::new();
    evaluator.set_capability(capability);
    let decision = evaluator
        .preview_compatibility_request(&network_request)
        .ok();
    let resolution_required = request.target_host.parse::<std::net::IpAddr>().is_err()
        && request.target_host != "localhost";

    Ok(serde_json::json!({
        "verdict": decision.as_ref().map(|value| format!("{:?}", value.verdict)).unwrap_or_else(|| "BlockedByDefault".to_string()),
        "capability": format!("{:?}", capability),
        "target_host": decision.as_ref().map(|value| value.canonical_host.clone()).unwrap_or_else(|| request.target_host.clone()),
        "target_port": request.target_port,
        "purpose": request.purpose,
        "component_id": request.component_id,
        "document_id": request.document_id,
        "automation_id": request.automation_id,
        "destination_classes": decision.as_ref().map(|value| value.destination_classes.iter().map(|class| format!("{:?}", class)).collect::<Vec<_>>()).unwrap_or_default(),
        "capability_id": decision.and_then(|value| value.capability_id),
        "preview_only": true,
        "resolution_required": resolution_required,
    }))
}

#[derive(Deserialize)]
struct FormulaRequest {
    formula: String,
    cells: HashMap<String, CellInput>,
    #[serde(default)]
    volatile_policy: Option<String>,
    #[serde(default)]
    external_reference_policy: Option<String>,
    #[serde(default)]
    contract: Option<String>,
}

#[derive(Deserialize)]
struct CellInput {
    value: Option<serde_json::Value>,
    formula: Option<String>,
}

fn formula_contains_volatile_function(formula: &str) -> bool {
    let upper = formula.to_ascii_uppercase();
    ["NOW(", "TODAY(", "RAND(", "RANDBETWEEN(", "RANDARRAY("]
        .iter()
        .any(|needle| upper.contains(needle))
}

fn formula_contains_external_workbook_reference(formula: &str) -> bool {
    // Excel-style [Book.xlsx]Sheet!A1 references never trigger I/O inside vgt-formula.
    // They require an explicitly authorized Workspace Fabric / connector binding.
    let bytes = formula.as_bytes();
    let mut in_string = false;
    let mut i = 0usize;
    while i < bytes.len() {
        if bytes[i] == b'"' {
            if in_string && i + 1 < bytes.len() && bytes[i + 1] == b'"' {
                i += 2;
                continue;
            }
            in_string = !in_string;
            i += 1;
            continue;
        }
        if !in_string && bytes[i] == b'[' {
            if let Some(close_rel) = formula[i + 1..].find(']') {
                let close = i + 1 + close_rel;
                if close + 1 < bytes.len() && formula[close + 1..].contains('!') {
                    return true;
                }
            }
        }
        i += 1;
    }
    false
}

fn validate_formula_contract(request: &FormulaRequest) -> Result<(), &'static str> {
    if request.contract.as_deref() != Some("VGT-FORMULA-CORE-1") {
        return Err("Formula engine contract rejected");
    }
    let external_allowed =
        request.external_reference_policy.as_deref() == Some("workspace-capability");
    if !external_allowed
        && (formula_contains_external_workbook_reference(&request.formula)
            || request
                .cells
                .values()
                .filter_map(|cell| cell.formula.as_deref())
                .any(formula_contains_external_workbook_reference))
    {
        return Err("EXTERNAL_REFERENCE_CAPABILITY_REQUIRED");
    }
    let volatile_allowed = request.volatile_policy.as_deref() == Some("runtime");
    if !volatile_allowed
        && (formula_contains_volatile_function(&request.formula)
            || request
                .cells
                .values()
                .filter_map(|cell| cell.formula.as_deref())
                .any(formula_contains_volatile_function))
    {
        return Err("VOLATILE_DISABLED");
    }
    Ok(())
}

#[derive(Serialize)]
struct FormulaResponse {
    success: bool,
    result: Option<serde_json::Value>,
    error: Option<String>,
}

fn is_origin_allowed(origin: &str) -> bool {
    let clean = origin.trim();
    clean == "http://127.0.0.1:5173"
        || clean == "http://localhost:5173"
        || clean == "http://127.0.0.1:4173"
        || clean == "http://localhost:4173"
        || clean == "http://127.0.0.1:3000"
        || clean == "http://localhost:3000"
        || clean == "http://tauri.localhost"
        || clean == "https://tauri.localhost"
        || clean == "tauri://localhost"
}

pub fn run_ipc_server(
    port: u16,
    stop_signal: Option<Arc<AtomicBool>>,
) -> Result<(), Box<dyn std::error::Error>> {
    run_ipc_server_inner(bind_loopback_listener(port)?, stop_signal, None, None)
}

pub fn run_ipc_server_with_ready_signal(
    port: u16,
    stop_signal: Arc<AtomicBool>,
    ready_signal: Arc<AtomicBool>,
) -> Result<(), Box<dyn std::error::Error>> {
    run_ipc_server_inner(
        bind_loopback_listener(port)?,
        Some(stop_signal),
        Some(ready_signal),
        None,
    )
}

pub fn run_ipc_server_with_shared_vault(
    port: u16,
    stop_signal: Arc<AtomicBool>,
    ready_signal: Arc<AtomicBool>,
    vault: Arc<Mutex<VgtKeyVault>>,
) -> Result<(), Box<dyn std::error::Error>> {
    run_ipc_server_with_listener_and_shared_vault(
        bind_loopback_listener(port)?,
        stop_signal,
        ready_signal,
        vault,
    )
}

pub struct LoopbackIpcListener(TcpListener);

pub fn bind_loopback_listener(port: u16) -> std::io::Result<LoopbackIpcListener> {
    let address = format!("127.0.0.1:{port}");
    let listener = TcpListener::bind(&address)?;
    listener.set_nonblocking(true)?;
    Ok(LoopbackIpcListener(listener))
}

pub fn run_ipc_server_with_listener_and_shared_vault(
    listener: LoopbackIpcListener,
    stop_signal: Arc<AtomicBool>,
    ready_signal: Arc<AtomicBool>,
    vault: Arc<Mutex<VgtKeyVault>>,
) -> Result<(), Box<dyn std::error::Error>> {
    run_ipc_server_inner(listener, Some(stop_signal), Some(ready_signal), Some(vault))
}

fn run_ipc_server_inner(
    listener: LoopbackIpcListener,
    stop_signal: Option<Arc<AtomicBool>>,
    ready_signal: Option<Arc<AtomicBool>>,
    shared_vault: Option<Arc<Mutex<VgtKeyVault>>>,
) -> Result<(), Box<dyn std::error::Error>> {
    let LoopbackIpcListener(listener) = listener;
    let address = listener.local_addr()?;
    let _ready_reset = IpcReadyReset(ready_signal);
    println!(
        "[VGT IPC Core] Sovereign IPC daemon listening strictly on http://{}",
        address
    );

    let mut local_vault = shared_vault.is_none().then(VgtKeyVault::new);
    let mut search_index = SearchIndex::new();
    let mut search_transfers = SearchTransferStore::default();
    let mut ipc_auth = IpcAuthState::default();
    let mut next_transfer_cleanup = std::time::Instant::now() + Duration::from_secs(15);
    if let Some(signal) = _ready_reset.0.as_ref() {
        signal.store(true, Ordering::Release);
    }
    loop {
        if std::time::Instant::now() >= next_transfer_cleanup {
            search_transfers.expire_stale();
            next_transfer_cleanup = std::time::Instant::now() + Duration::from_secs(15);
        }
        if let Some(ref sig) = stop_signal {
            if sig.load(Ordering::Relaxed) {
                break;
            }
        }

        match listener.accept() {
            Ok((stream, _)) => {
                if let Some(shared_vault) = shared_vault.as_ref() {
                    match shared_vault.lock() {
                        Ok(mut vault) => {
                            let _ = handle_client(
                                stream,
                                &mut vault,
                                &mut search_index,
                                &mut search_transfers,
                                &mut ipc_auth,
                            );
                        }
                        Err(_) => {
                            eprintln!("[VGT IPC Core] Shared KeyVault lock is unavailable.");
                        }
                    }
                } else if let Some(vault) = local_vault.as_mut() {
                    let _ = handle_client(
                        stream,
                        vault,
                        &mut search_index,
                        &mut search_transfers,
                        &mut ipc_auth,
                    );
                }
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(10));
            }
            Err(e) => {
                eprintln!("[VGT IPC Core] Accept error: {}", e);
            }
        }
    }

    Ok(())
}

struct IpcReadyReset(Option<Arc<AtomicBool>>);

impl Drop for IpcReadyReset {
    fn drop(&mut self) {
        if let Some(signal) = self.0.as_ref() {
            signal.store(false, Ordering::Release);
        }
    }
}

enum BoundedLineReadError {
    TooLong,
    Io(std::io::Error),
}

fn read_bounded_line<R: BufRead>(
    reader: &mut R,
    max_bytes: usize,
) -> Result<Option<Vec<u8>>, BoundedLineReadError> {
    let mut line = Vec::with_capacity(256.min(max_bytes));
    loop {
        let available = reader.fill_buf().map_err(BoundedLineReadError::Io)?;
        if available.is_empty() {
            return if line.is_empty() {
                Ok(None)
            } else {
                Ok(Some(line))
            };
        }

        let newline = available.iter().position(|byte| *byte == b'\n');
        let chunk_length = newline.map_or(available.len(), |index| index + 1);
        let remaining = max_bytes.saturating_sub(line.len());
        if chunk_length > remaining {
            return Err(BoundedLineReadError::TooLong);
        }

        line.extend_from_slice(&available[..chunk_length]);
        reader.consume(chunk_length);
        if newline.is_some() {
            return Ok(Some(line));
        }
    }
}

fn handle_client(
    mut stream: TcpStream,
    vault: &mut VgtKeyVault,
    search_index: &mut SearchIndex,
    search_transfers: &mut SearchTransferStore,
    ipc_auth: &mut IpcAuthState,
) -> Result<(), Box<dyn std::error::Error>> {
    stream.set_read_timeout(Some(Duration::from_secs(5)))?;
    stream.set_write_timeout(Some(Duration::from_secs(5)))?;

    let mut reader = BufReader::new(stream.try_clone()?);
    let request_line_bytes = match read_bounded_line(&mut reader, MAX_HEADER_BYTES) {
        Ok(Some(line)) => line,
        Ok(None) => return Ok(()),
        Err(BoundedLineReadError::TooLong) => {
            send_error(
                &mut stream,
                431,
                "Header fields too large",
                "http://127.0.0.1:5173",
            )?;
            return Ok(());
        }
        Err(BoundedLineReadError::Io(error)) => return Err(error.into()),
    };
    let request_line = match String::from_utf8(request_line_bytes) {
        Ok(line) => line,
        Err(_) => {
            send_error(&mut stream, 400, "Malformed HTTP request line", "null")?;
            return Ok(());
        }
    };
    if !request_line.ends_with("\r\n") {
        send_error(&mut stream, 400, "Malformed HTTP request line", "null")?;
        return Ok(());
    }

    let parts: Vec<&str> = request_line.split_whitespace().collect();
    if parts.len() != 3 || parts[2] != "HTTP/1.1" {
        send_error(&mut stream, 400, "Malformed HTTP request line", "null")?;
        return Ok(());
    }
    let method = parts[0];
    let path = parts[1];

    let mut content_length: usize = 0;
    let mut content_length_seen = false;
    let mut content_type: Option<String> = None;
    let mut transfer_encoding_seen = false;
    let mut origin: Option<String> = None;
    let mut ipc_token: Option<String> = None;
    let mut total_header_bytes = request_line.len();

    loop {
        let remaining_header_bytes = MAX_HEADER_BYTES.saturating_sub(total_header_bytes);
        let line_bytes = match read_bounded_line(&mut reader, remaining_header_bytes) {
            Ok(Some(line)) => line,
            Ok(None) => break,
            Err(BoundedLineReadError::TooLong) => {
                send_error(
                    &mut stream,
                    431,
                    "Header fields too large",
                    "http://127.0.0.1:5173",
                )?;
                return Ok(());
            }
            Err(BoundedLineReadError::Io(error)) => return Err(error.into()),
        };
        total_header_bytes = total_header_bytes.saturating_add(line_bytes.len());
        let line = match String::from_utf8(line_bytes) {
            Ok(line) => line,
            Err(_) => {
                send_error(&mut stream, 400, "Malformed HTTP header", "null")?;
                return Ok(());
            }
        };

        if line == "\r\n" || line == "\n" {
            break;
        }
        let lower = line.to_ascii_lowercase();
        if lower.starts_with("content-length:") {
            if content_length_seen {
                send_error(&mut stream, 400, "Duplicate Content-Length header", "null")?;
                return Ok(());
            }
            content_length_seen = true;
            let Some((_, raw_value)) = line.split_once(':') else {
                send_error(&mut stream, 400, "Malformed Content-Length header", "null")?;
                return Ok(());
            };
            content_length = match raw_value.trim().parse::<usize>() {
                Ok(value) => value,
                Err(_) => {
                    send_error(&mut stream, 400, "Invalid Content-Length header", "null")?;
                    return Ok(());
                }
            };
        } else if lower.starts_with("content-type:") {
            if let Some((_, val)) = line.split_once(':') {
                content_type = Some(val.trim().to_ascii_lowercase());
            }
        } else if lower.starts_with("transfer-encoding:") {
            transfer_encoding_seen = true;
        } else if lower.starts_with("origin:") {
            if let Some((_, val)) = line.split_once(':') {
                origin = Some(val.trim().to_string());
            }
        } else if lower.starts_with(&format!("{}:", IPC_AUTH_HEADER)) {
            if ipc_token.is_some() {
                send_error(
                    &mut stream,
                    400,
                    "Duplicate IPC authorization header",
                    "null",
                )?;
                return Ok(());
            }
            if let Some((_, val)) = line.split_once(':') {
                ipc_token = Some(val.trim().to_string());
            }
        }
    }

    let origin_str = origin.as_deref().unwrap_or("http://127.0.0.1:5173");
    if origin.is_some() && !is_origin_allowed(origin_str) {
        send_error(&mut stream, 403, "Origin not allowed", "null")?;
        return Ok(());
    }
    let allowed_origin = origin_str;

    if !matches!(method, "GET" | "POST" | "OPTIONS") {
        send_error(&mut stream, 405, "HTTP method not allowed", allowed_origin)?;
        return Ok(());
    }

    // This minimal one-request-per-connection server deliberately does not implement
    // HTTP chunked transfer coding. Reject it instead of creating request ambiguity.
    if transfer_encoding_seen {
        send_error(
            &mut stream,
            400,
            "Transfer-Encoding is not supported",
            allowed_origin,
        )?;
        return Ok(());
    }

    // Handle CORS preflight
    if method == "OPTIONS" {
        let response = format!(
            "HTTP/1.1 204 No Content\r\n\
Access-Control-Allow-Origin: {}\r\n\
Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n\
Access-Control-Allow-Headers: Content-Type, X-VGT-IPC-Token\r\n\
Access-Control-Max-Age: 86400\r\n\
Vary: Origin\r\n\
Cache-Control: no-store\r\n\
X-Content-Type-Options: nosniff\r\n\
Connection: close\r\n\
Content-Length: 0\r\n\r\n",
            allowed_origin
        );
        stream.write_all(response.as_bytes())?;
        return Ok(());
    }

    if method == "POST" && path == "/api/v1/ipc/pair" {
        if origin.is_none() || !is_origin_allowed(origin_str) {
            send_error(&mut stream, 403, "IPC pairing rejected", "null")?;
            return Ok(());
        }
        match ipc_token
            .as_deref()
            .and_then(|token| ipc_auth.pair(token).ok().map(|_| token))
        {
            Some(_) => send_json(
                &mut stream,
                200,
                &serde_json::json!({"success": true, "paired": true}),
                allowed_origin,
            )?,
            None => send_error(&mut stream, 403, "IPC pairing rejected", allowed_origin)?,
        }
        return Ok(());
    }

    if ipc_auth.authorize(ipc_token.as_deref()).is_err() {
        send_error(
            &mut stream,
            401,
            "IPC authorization required",
            allowed_origin,
        )?;
        return Ok(());
    }

    let route_body_limit = search_transfer_request_body_limit(path).unwrap_or(MAX_REQUEST_BODY);
    if request_body_exceeds_limit(content_length) {
        send_error(
            &mut stream,
            413,
            &format!(
                "Request body exceeds {} MiB ceiling",
                MAX_REQUEST_BODY / (1024 * 1024)
            ),
            allowed_origin,
        )?;
        return Ok(());
    }
    if content_length > route_body_limit {
        send_error(
            &mut stream,
            413,
            "Request body exceeds endpoint ceiling",
            allowed_origin,
        )?;
        return Ok(());
    }

    if method == "POST" {
        let is_json = content_type
            .as_deref()
            .map(|value| value.split(';').next().unwrap_or("").trim() == "application/json")
            .unwrap_or(false);
        if !is_json {
            send_error(
                &mut stream,
                415,
                "POST endpoints require application/json",
                allowed_origin,
            )?;
            return Ok(());
        }
    }

    let mut body = vec![0u8; content_length];
    if content_length > 0 {
        reader.read_exact(&mut body)?;
    }

    let session_token = ipc_token.as_deref().unwrap_or_default();

    if method == "POST" && path == "/api/v1/container/pack" {
        match serde_json::from_slice::<PackRequest>(&body) {
            Ok(req) => {
                let recipient_public_key = match req.recipient_public_key.as_deref() {
                    Some(value) => match parse_x25519_key_material(value) {
                        Ok(key) => Some(key),
                        Err(_) => {
                            let resp = PackResponse {
                                success: false,
                                container_base64: None,
                                error: Some("Recipient X25519 public key is invalid".into()),
                            };
                            send_json(&mut stream, 400, &resp, allowed_origin)?;
                            return Ok(());
                        }
                    },
                    None => None,
                };
                if recipient_public_key.is_some()
                    && (req
                        .pin
                        .as_deref()
                        .is_some_and(|value| !value.trim().is_empty())
                        || req
                            .password
                            .as_deref()
                            .is_some_and(|value| !value.is_empty()))
                {
                    let resp = PackResponse {
                        success: false,
                        container_base64: None,
                        error: Some(
                            "RecipientOnly cannot be combined with PIN/password slots".into(),
                        ),
                    };
                    send_json(&mut stream, 400, &resp, allowed_origin)?;
                    return Ok(());
                }
                let options = SaveOptions {
                    policy: recipient_public_key
                        .as_ref()
                        .map(|_| UnlockPolicy::RecipientOnly),
                    pin: req.pin.as_deref(),
                    portable_password: req.password.as_deref(),
                    recipient_public_key: recipient_public_key.as_ref(),
                };
                match VgtContainer::pack_document(&req.document, vault, options) {
                    Ok(bytes) => {
                        let resp = PackResponse {
                            success: true,
                            container_base64: Some(base64::encode(&bytes)),
                            error: None,
                        };
                        send_json(&mut stream, 200, &resp, allowed_origin)?;
                    }
                    Err(e) => {
                        let resp = PackResponse {
                            success: false,
                            container_base64: None,
                            error: Some(public_container_error(&e).to_string()),
                        };
                        send_json(&mut stream, 400, &resp, allowed_origin)?;
                    }
                }
            }
            Err(_) => send_error(
                &mut stream,
                400,
                "Invalid JSON request body",
                allowed_origin,
            )?,
        }
    } else if method == "POST" && path == "/api/v1/container/unpack" {
        match serde_json::from_slice::<UnpackRequest>(&body) {
            Ok(req) => match base64::decode(&req.container_base64) {
                Ok(bytes) => {
                    let meta = match VgtContainer::read_metadata(&bytes) {
                        Ok(m) => m,
                        Err(e) => {
                            let resp = UnpackResponse {
                                success: false,
                                document: None,
                                error: Some(public_container_error(&e).to_string()),
                                requires_pin: false,
                                requires_password: false,
                            };
                            send_json(&mut stream, 400, &resp, allowed_origin)?;
                            return Ok(());
                        }
                    };

                    let unpack_res = match meta.unlock_policy {
                        UnlockPolicy::DeviceAndPin => {
                            if let Some(ref pin) = req.pin {
                                VgtContainer::unpack_with_pin(&bytes, vault, pin)
                            } else {
                                let resp = UnpackResponse {
                                    success: false,
                                    document: None,
                                    error: Some("PIN required to unlock on this device".into()),
                                    requires_pin: true,
                                    requires_password: false,
                                };
                                send_json(&mut stream, 200, &resp, allowed_origin)?;
                                return Ok(());
                            }
                        }
                        UnlockPolicy::PortablePasswordOnly => {
                            if let Some(ref pwd) = req.password {
                                VgtContainer::unpack_with_password(&bytes, pwd)
                            } else {
                                let resp = UnpackResponse {
                                    success: false,
                                    document: None,
                                    error: Some("Portable Password required to unlock".into()),
                                    requires_pin: false,
                                    requires_password: true,
                                };
                                send_json(&mut stream, 200, &resp, allowed_origin)?;
                                return Ok(());
                            }
                        }
                        UnlockPolicy::DeviceOnly => VgtContainer::unpack_with_vault(&bytes, vault),
                        UnlockPolicy::HardwareBackedOnly => {
                            VgtContainer::unpack_with_hardware(&bytes, vault)
                        }
                        UnlockPolicy::DeviceOrPortablePassword => {
                            if let Some(ref pwd) = req.password {
                                VgtContainer::unpack_with_password(&bytes, pwd)
                            } else {
                                VgtContainer::unpack_with_vault(&bytes, vault)
                            }
                        }
                        UnlockPolicy::RecipientOnly => {
                            if let Some(ref private_key) = req.recipient_private_key {
                                match parse_x25519_key_material(private_key) {
                                    Ok(key) => VgtContainer::unpack_with_recipient(&bytes, &key),
                                    Err(_) => Err(vgt_container::ContainerError::CorruptedData),
                                }
                            } else {
                                let resp = UnpackResponse {
                                    success: false,
                                    document: None,
                                    error: Some("RECIPIENT_KEY_REQUIRED".into()),
                                    requires_pin: false,
                                    requires_password: false,
                                };
                                send_json(&mut stream, 200, &resp, allowed_origin)?;
                                return Ok(());
                            }
                        }
                    };

                    match unpack_res {
                        Ok(doc) => {
                            let resp = UnpackResponse {
                                success: true,
                                document: Some(doc),
                                error: None,
                                requires_pin: false,
                                requires_password: false,
                            };
                            send_json(&mut stream, 200, &resp, allowed_origin)?;
                        }
                        Err(e) => {
                            let is_pin = meta.unlock_policy == UnlockPolicy::DeviceAndPin
                                && req.pin.is_none();
                            let resp = UnpackResponse {
                                success: false,
                                document: None,
                                error: Some(public_container_error(&e).to_string()),
                                requires_pin: is_pin,
                                requires_password: false,
                            };
                            send_json(&mut stream, 200, &resp, allowed_origin)?;
                        }
                    }
                }
                Err(_) => send_error(
                    &mut stream,
                    400,
                    "Invalid container encoding",
                    allowed_origin,
                )?,
            },
            Err(_) => send_error(
                &mut stream,
                400,
                "Invalid JSON request body",
                allowed_origin,
            )?,
        }
    } else if method == "POST" && path == "/api/v1/formula/evaluate" {
        match serde_json::from_slice::<FormulaRequest>(&body) {
            Ok(req) => {
                if let Err(error) = validate_formula_contract(&req) {
                    send_error(&mut stream, 422, error, allowed_origin)?;
                    return Ok(());
                }
                if req.formula.len() > MAX_FORMULA_LENGTH || req.cells.len() > MAX_FORMULA_CELLS {
                    send_error(
                        &mut stream,
                        413,
                        "Formula evaluation exceeds configured resource limits",
                        allowed_origin,
                    )?;
                    return Ok(());
                }
                let mut engine = SpreadsheetEngine::new();
                for (coord_str, cell) in req.cells {
                    let coord = match CellCoord::parse(&coord_str) {
                        Ok(coord) => coord,
                        Err(_) => {
                            send_error(
                                &mut stream,
                                422,
                                "INVALID_CELL_COORDINATE",
                                allowed_origin,
                            )?;
                            return Ok(());
                        }
                    };
                    if let Some(ref f) = cell.formula {
                        if f.len() > MAX_FORMULA_LENGTH {
                            send_error(&mut stream, 413, "FORMULA_RESOURCE_LIMIT", allowed_origin)?;
                            return Ok(());
                        }
                        if engine.set_formula(coord, f).is_err() {
                            send_error(&mut stream, 422, "INVALID_CELL_FORMULA", allowed_origin)?;
                            return Ok(());
                        }
                    } else if let Some(ref v) = cell.value {
                        if let Some(n) = v.as_f64() {
                            engine.set_value(coord, ComputedValue::Number(n));
                        } else if let Some(s) = v.as_str() {
                            engine.set_value(coord, ComputedValue::String(s.to_string()));
                        } else if let Some(b) = v.as_bool() {
                            engine.set_value(coord, ComputedValue::Boolean(b));
                        }
                    }
                }
                let scratch_coord = CellCoord::new(99, 99);
                match engine.set_formula(scratch_coord, &req.formula) {
                    Ok(_) => {
                        let val = engine.get_value(&scratch_coord);
                        let json_val = match val {
                            ComputedValue::Number(n) => serde_json::json!(n),
                            ComputedValue::String(s) => serde_json::json!(s),
                            ComputedValue::Boolean(b) => serde_json::json!(b),
                            ComputedValue::Empty => serde_json::Value::Null,
                            ComputedValue::Error(e) => serde_json::json!(format!("#ERR: {:?}", e)),
                            ComputedValue::Array(matrix) => {
                                let rows: Vec<serde_json::Value> = matrix
                                    .iter()
                                    .map(|row| {
                                        let items: Vec<serde_json::Value> = row
                                            .iter()
                                            .map(|v| match v {
                                                ComputedValue::Number(n) => serde_json::json!(n),
                                                ComputedValue::String(s) => serde_json::json!(s),
                                                ComputedValue::Boolean(b) => serde_json::json!(b),
                                                ComputedValue::Empty => serde_json::Value::Null,
                                                ComputedValue::Error(e) => {
                                                    serde_json::json!(format!("#ERR: {:?}", e))
                                                }
                                                ComputedValue::Array(_) => serde_json::Value::Null,
                                            })
                                            .collect();
                                        serde_json::Value::Array(items)
                                    })
                                    .collect();
                                serde_json::Value::Array(rows)
                            }
                        };
                        let resp = FormulaResponse {
                            success: true,
                            result: Some(json_val),
                            error: None,
                        };
                        send_json(&mut stream, 200, &resp, allowed_origin)?;
                    }
                    Err(e) => {
                        let resp = FormulaResponse {
                            success: false,
                            result: None,
                            error: Some(format!("{:?}", e)),
                        };
                        send_json(&mut stream, 200, &resp, allowed_origin)?;
                    }
                }
            }
            Err(_) => send_error(
                &mut stream,
                400,
                "Invalid JSON request body",
                allowed_origin,
            )?,
        }
    } else if method == "GET" && path == "/api/v1/keyvault/status" {
        let health = vault.provider_health();
        let resp = serde_json::json!({
            "success": true,
            "platform": format!("{:?}", vault.platform()),
            "provider_name": health.provider_name,
            "provider_available": health.available,
            "secure_persistence": health.secure_persistence,
            "hardware_interface_detected": health.hardware_interface_detected,
            "hardware_slot_supported": health.hardware_slot_supported,
            "provider_capabilities": health.capabilities,
            "provider_detail": health.detail,
            "is_unlocked": vault.is_unlocked(),
            "pqc_unlocked": vault.is_pqc_unlocked(),
            "top_secret_enrolled": vault.top_secret_enrolled(),
            "top_secret_unlocked": vault.is_top_secret_unlocked(),
            "hardware_backed": health.hardware_backed,
            "hardware_attestation_verified": health.hardware_attestation_verified,
        });
        send_json(&mut stream, 200, &resp, allowed_origin)?;
    } else if method == "POST" && path == "/api/v1/keyvault/lock" {
        vault.relock();
        search_index.lock();
        let health = vault.provider_health();
        let resp = serde_json::json!({
            "success": true,
            "platform": format!("{:?}", vault.platform()),
            "provider_name": health.provider_name,
            "provider_available": health.available,
            "secure_persistence": health.secure_persistence,
            "hardware_interface_detected": health.hardware_interface_detected,
            "hardware_slot_supported": health.hardware_slot_supported,
            "provider_capabilities": health.capabilities,
            "provider_detail": health.detail,
            "is_unlocked": vault.is_unlocked(),
            "pqc_unlocked": vault.is_pqc_unlocked(),
            "top_secret_enrolled": vault.top_secret_enrolled(),
            "top_secret_unlocked": vault.is_top_secret_unlocked(),
            "hardware_backed": health.hardware_backed,
            "hardware_attestation_verified": health.hardware_attestation_verified,
        });
        send_json(&mut stream, 200, &resp, allowed_origin)?;
    } else if method == "POST" && path == "/api/v1/keyvault/top-secret/enroll" {
        #[derive(Deserialize)]
        struct Request {
            user_secret: String,
            require_offline_factor: bool,
        }
        match serde_json::from_slice::<Request>(&body) {
            Ok(request) => {
                let response = match vault
                    .enroll_top_secret_access(&request.user_secret, request.require_offline_factor)
                {
                    Ok(mut result) => {
                        let offline_factor_hex = result.offline_factor.as_ref().map(hex_encode_32);
                        if let Some(factor) = result.offline_factor.as_mut() {
                            factor.fill(0);
                        }
                        serde_json::json!({
                            "success": true,
                            "generation": result.generation,
                            "offline_factor_hex": offline_factor_hex,
                            "recovery_hint": result.recovery_hint,
                        })
                    }
                    Err(_) => {
                        serde_json::json!({"success": false, "error": "Top Secret enrollment rejected"})
                    }
                };
                send_json(&mut stream, 200, &response, allowed_origin)?;
            }
            Err(_) => send_error(
                &mut stream,
                400,
                "Invalid Top Secret enrollment request",
                allowed_origin,
            )?,
        }
    } else if method == "POST" && path == "/api/v1/keyvault/top-secret/unlock" {
        #[derive(Deserialize)]
        struct Request {
            user_secret: String,
            offline_factor_hex: Option<String>,
        }
        match serde_json::from_slice::<Request>(&body) {
            Ok(request) => {
                let factor = request
                    .offline_factor_hex
                    .as_deref()
                    .map(parse_offline_factor_hex)
                    .transpose();
                let response = match factor {
                    Ok(mut factor) => {
                        let result = vault.unlock_top_secret(&request.user_secret, factor.as_ref());
                        if let Some(secret) = factor.as_mut() {
                            secret.fill(0);
                        }
                        match result {
                            Ok(()) => serde_json::json!({"success": true}),
                            Err(_) => {
                                serde_json::json!({"success": false, "error": "Top Secret unlock failed"})
                            }
                        }
                    }
                    Err(_) => {
                        serde_json::json!({"success": false, "error": "Offline factor format rejected"})
                    }
                };
                send_json(&mut stream, 200, &response, allowed_origin)?;
            }
            Err(_) => send_error(
                &mut stream,
                400,
                "Invalid Top Secret unlock request",
                allowed_origin,
            )?,
        }
    } else if method == "POST" && path == "/api/v1/keyvault/top-secret/rotate-factor" {
        #[derive(Deserialize)]
        struct Request {
            user_secret: String,
            current_offline_factor_hex: Option<String>,
            require_new_factor: bool,
        }
        match serde_json::from_slice::<Request>(&body) {
            Ok(request) => {
                let current = request
                    .current_offline_factor_hex
                    .as_deref()
                    .map(parse_offline_factor_hex)
                    .transpose();
                let response = match current {
                    Ok(mut current) => {
                        let result = vault.rotate_top_secret_offline_factor(
                            &request.user_secret,
                            current.as_ref(),
                            request.require_new_factor,
                        );
                        if let Some(secret) = current.as_mut() {
                            secret.fill(0);
                        }
                        match result {
                            Ok(mut next) => {
                                let offline_factor_hex = next.as_ref().map(hex_encode_32);
                                if let Some(secret) = next.as_mut() {
                                    secret.fill(0);
                                }
                                serde_json::json!({
                                    "success": true,
                                    "offline_factor_hex": offline_factor_hex,
                                    "recovery_hint": "A newly issued factor replaces the previous factor and must be stored separately.",
                                })
                            }
                            Err(_) => {
                                serde_json::json!({"success": false, "error": "Top Secret factor rotation failed"})
                            }
                        }
                    }
                    Err(_) => {
                        serde_json::json!({"success": false, "error": "Offline factor format rejected"})
                    }
                };
                send_json(&mut stream, 200, &response, allowed_origin)?;
            }
            Err(_) => send_error(
                &mut stream,
                400,
                "Invalid Top Secret rotation request",
                allowed_origin,
            )?,
        }
    } else if method == "POST" && path == "/api/v1/keyvault/top-secret/mark-factor-lost" {
        let response = match vault.mark_top_secret_offline_factor_lost() {
            Ok(()) => serde_json::json!({"success": true}),
            Err(_) => {
                serde_json::json!({"success": false, "error": "Offline factor loss state could not be recorded"})
            }
        };
        send_json(&mut stream, 200, &response, allowed_origin)?;
    } else if method == "GET" && path == "/api/v1/search/status" {
        let response = serde_json::json!({
            "success": true,
            "schema_version": vgt_search::SEARCH_INDEX_SCHEMA_VERSION,
            "generation": search_index.generation(),
            "document_count": search_index.document_count(),
            "locked": search_index.is_locked(),
        });
        send_json(&mut stream, 200, &response, allowed_origin)?;
    } else if method == "POST" && path == "/api/v1/search/import/begin" {
        if !vault.is_unlocked() {
            send_error(
                &mut stream,
                403,
                "KeyVault must be unlocked before search import",
                allowed_origin,
            )?;
            return Ok(());
        }
        #[derive(Deserialize)]
        struct Request {
            transfer_id: String,
            workspace_scope: String,
            total_bytes: usize,
            sha256: String,
            expected_generation: u64,
        }
        match serde_json::from_slice::<Request>(&body) {
            Ok(request)
                if !request.workspace_scope.is_empty()
                    && request.workspace_scope.len() <= 128
                    && transfer_id_is_valid(&request.transfer_id)
                    && request.total_bytes <= MAX_SEARCH_TRANSFER_BYTES =>
            {
                match search_transfers.begin_import(
                    session_token,
                    &request.transfer_id,
                    request.workspace_scope,
                    request.total_bytes,
                    &request.sha256,
                    request.expected_generation,
                ) {
                    Ok(()) => send_json(
                        &mut stream,
                        200,
                        &serde_json::json!({"success": true, "chunk_size": SEARCH_TRANSFER_CHUNK_BYTES}),
                        allowed_origin,
                    )?,
                    Err(error) => send_search_transfer_error(&mut stream, error, allowed_origin)?,
                }
            }
            Ok(request) if request.total_bytes > MAX_SEARCH_TRANSFER_BYTES => send_error(
                &mut stream,
                413,
                "Encrypted search index exceeds transfer ceiling",
                allowed_origin,
            )?,
            _ => send_error(
                &mut stream,
                400,
                "Invalid search import transfer",
                allowed_origin,
            )?,
        }
    } else if method == "POST" && path == "/api/v1/search/import/chunk" {
        #[derive(Deserialize)]
        struct Request {
            transfer_id: String,
            chunk_index: usize,
            data_base64: String,
        }
        match serde_json::from_slice::<Request>(&body) {
            Ok(request) if transfer_id_is_valid(&request.transfer_id) => {
                if !vault.is_unlocked() {
                    search_transfers.abort(session_token, &request.transfer_id);
                    send_error(
                        &mut stream,
                        403,
                        "KeyVault must remain unlocked during search import",
                        allowed_origin,
                    )?;
                    return Ok(());
                }
                if request.data_base64.len() > MAX_SEARCH_TRANSFER_CHUNK_BASE64_BYTES {
                    search_transfers.abort(session_token, &request.transfer_id);
                    send_error(
                        &mut stream,
                        413,
                        "Search import chunk exceeds ceiling",
                        allowed_origin,
                    )?;
                    return Ok(());
                }
                match base64::decode(&request.data_base64) {
                    Ok(chunk) => match search_transfers.append_import_chunk(
                        session_token,
                        &request.transfer_id,
                        request.chunk_index,
                        &chunk,
                    ) {
                        Ok(received_bytes) => send_json(
                            &mut stream,
                            200,
                            &serde_json::json!({"success": true, "received_bytes": received_bytes}),
                            allowed_origin,
                        )?,
                        Err(error) => {
                            send_search_transfer_error(&mut stream, error, allowed_origin)?
                        }
                    },
                    Err(_) => {
                        search_transfers.abort(session_token, &request.transfer_id);
                        send_error(
                            &mut stream,
                            400,
                            "Invalid search import chunk",
                            allowed_origin,
                        )?;
                    }
                }
            }
            _ => send_error(
                &mut stream,
                400,
                "Invalid search import chunk",
                allowed_origin,
            )?,
        }
    } else if method == "POST" && path == "/api/v1/search/import/finalize" {
        if !vault.is_unlocked() {
            send_error(
                &mut stream,
                403,
                "KeyVault must be unlocked before search import",
                allowed_origin,
            )?;
            return Ok(());
        }
        #[derive(Deserialize)]
        struct Request {
            transfer_id: String,
        }
        match serde_json::from_slice::<Request>(&body) {
            Ok(request) if transfer_id_is_valid(&request.transfer_id) => {
                match search_transfers.finish_import(session_token, &request.transfer_id) {
                    Ok((workspace_scope, encrypted_index, expected_generation)) => {
                        if search_index.generation() != expected_generation {
                            send_search_transfer_error(
                                &mut stream,
                                SearchTransferError::StaleGeneration,
                                allowed_origin,
                            )?;
                            return Ok(());
                        }
                        match vault.derive_search_index_key(&workspace_scope) {
                            Ok(mut key) => {
                                let restored =
                                    SearchIndex::import_encrypted(&encrypted_index, &key);
                                key.fill(0);
                                match restored {
                                    Ok(index) => {
                                        *search_index = index;
                                        send_json(
                                            &mut stream,
                                            200,
                                            &serde_json::json!({"success": true, "generation": search_index.generation(), "document_count": search_index.document_count()}),
                                            allowed_origin,
                                        )?;
                                    }
                                    Err(_) => send_error(&mut stream, 409, "Encrypted search index is corrupted or cannot be authenticated", allowed_origin)?,
                                }
                            }
                            Err(_) => send_error(
                                &mut stream,
                                403,
                                "Search KeyVault key unavailable",
                                allowed_origin,
                            )?,
                        }
                    }
                    Err(error) => send_search_transfer_error(&mut stream, error, allowed_origin)?,
                }
            }
            _ => send_error(
                &mut stream,
                400,
                "Invalid search import finalization",
                allowed_origin,
            )?,
        }
    } else if method == "POST" && path == "/api/v1/search/export/begin" {
        if !vault.is_unlocked() {
            send_error(
                &mut stream,
                403,
                "KeyVault must be unlocked before search export",
                allowed_origin,
            )?;
            return Ok(());
        }
        #[derive(Deserialize)]
        struct Request {
            transfer_id: String,
            workspace_scope: String,
        }
        match serde_json::from_slice::<Request>(&body) {
            Ok(request)
                if !request.workspace_scope.is_empty()
                    && request.workspace_scope.len() <= 128
                    && transfer_id_is_valid(&request.transfer_id) =>
            {
                match vault.derive_search_index_key(&request.workspace_scope) {
                    Ok(mut key) => {
                        let generation = search_index.generation();
                        let exported = search_index.export_encrypted(&key);
                        key.fill(0);
                        match exported {
                            Ok(data) if data.len() <= MAX_SEARCH_TRANSFER_BYTES => {
                                let total_bytes = data.len();
                                match search_transfers.begin_export(
                                    session_token,
                                    &request.transfer_id,
                                    request.workspace_scope,
                                    data,
                                    generation,
                                ) {
                                    Ok(sha256) => send_json(
                                        &mut stream,
                                        200,
                                        &serde_json::json!({"success": true, "total_bytes": total_bytes, "sha256": sha256, "chunk_size": SEARCH_TRANSFER_CHUNK_BYTES}),
                                        allowed_origin,
                                    )?,
                                    Err(error) => send_search_transfer_error(
                                        &mut stream,
                                        error,
                                        allowed_origin,
                                    )?,
                                }
                            }
                            Ok(_) => send_error(
                                &mut stream,
                                413,
                                "Encrypted search index exceeds transfer ceiling",
                                allowed_origin,
                            )?,
                            Err(_) => send_error(
                                &mut stream,
                                422,
                                "Search export rejected",
                                allowed_origin,
                            )?,
                        }
                    }
                    Err(_) => send_error(
                        &mut stream,
                        403,
                        "Search KeyVault key unavailable",
                        allowed_origin,
                    )?,
                }
            }
            _ => send_error(
                &mut stream,
                400,
                "Invalid search export transfer",
                allowed_origin,
            )?,
        }
    } else if method == "POST" && path == "/api/v1/search/export/chunk" {
        #[derive(Deserialize)]
        struct Request {
            transfer_id: String,
            chunk_index: usize,
        }
        match serde_json::from_slice::<Request>(&body) {
            Ok(request) if transfer_id_is_valid(&request.transfer_id) => {
                if !vault.is_unlocked() {
                    search_transfers.abort(session_token, &request.transfer_id);
                    send_error(
                        &mut stream,
                        403,
                        "KeyVault must remain unlocked during search export",
                        allowed_origin,
                    )?;
                    return Ok(());
                }
                match search_transfers.next_export_chunk(
                    session_token,
                    &request.transfer_id,
                    request.chunk_index,
                    search_index.generation(),
                ) {
                    Ok((chunk, total_chunks)) => send_json(
                        &mut stream,
                        200,
                        &serde_json::json!({"success": true, "chunk_index": request.chunk_index, "total_chunks": total_chunks, "data_base64": base64::encode(&chunk)}),
                        allowed_origin,
                    )?,
                    Err(error) => send_search_transfer_error(&mut stream, error, allowed_origin)?,
                }
            }
            _ => send_error(
                &mut stream,
                400,
                "Invalid search export chunk",
                allowed_origin,
            )?,
        }
    } else if method == "POST" && path == "/api/v1/search/transfer/abort" {
        #[derive(Deserialize)]
        struct Request {
            transfer_id: String,
        }
        match serde_json::from_slice::<Request>(&body) {
            Ok(request) if transfer_id_is_valid(&request.transfer_id) => {
                let removed = search_transfers.abort(session_token, &request.transfer_id);
                send_json(
                    &mut stream,
                    200,
                    &serde_json::json!({"success": true, "aborted": removed}),
                    allowed_origin,
                )?;
            }
            _ => send_error(
                &mut stream,
                400,
                "Invalid search transfer abort",
                allowed_origin,
            )?,
        }
    } else if method == "POST" && path == "/api/v1/search/rebuild" {
        if !vault.is_unlocked() {
            send_error(
                &mut stream,
                403,
                "KeyVault must be unlocked before indexing",
                allowed_origin,
            )?;
            return Ok(());
        }
        #[derive(Deserialize)]
        struct SearchDocumentInput {
            document: WorkspaceDocument,
            #[serde(default)]
            options: DocumentIndexOptions,
        }
        #[derive(Deserialize)]
        struct Request {
            documents: Vec<SearchDocumentInput>,
        }
        match serde_json::from_slice::<Request>(&body) {
            Ok(request) if request.documents.len() <= 100_000 => {
                let corpus: Vec<(WorkspaceDocument, DocumentIndexOptions)> = request
                    .documents
                    .into_iter()
                    .map(|item| (item.document, item.options))
                    .collect();
                let preferences = search_index.preferences().clone();
                match SearchIndex::rebuild_cancellable(&corpus, &vgt_search::NeverCancel, |_| {}) {
                    Ok((mut next, report)) => {
                        let _ = next.set_preferences(preferences);
                        *search_index = next;
                        let response = serde_json::json!({"success": true, "generation": search_index.generation(), "document_count": search_index.document_count(), "skipped": report.skipped_documents, "processed": corpus.len()});
                        send_json(&mut stream, 200, &response, allowed_origin)?;
                    }
                    Err(_) => send_error(
                        &mut stream,
                        422,
                        "Search index rebuild rejected",
                        allowed_origin,
                    )?,
                }
            }
            _ => send_error(
                &mut stream,
                400,
                "Invalid search rebuild request",
                allowed_origin,
            )?,
        }
    } else if method == "POST" && path == "/api/v1/search/upsert" {
        if !vault.is_unlocked() {
            send_error(
                &mut stream,
                403,
                "KeyVault must be unlocked before indexing",
                allowed_origin,
            )?;
            return Ok(());
        }
        #[derive(Deserialize)]
        struct Request {
            document: WorkspaceDocument,
            #[serde(default)]
            options: DocumentIndexOptions,
        }
        match serde_json::from_slice::<Request>(&body) {
            Ok(request) => {
                let document_id = request.document.id.clone();
                let authoritative_version = request.document.version;
                let event = vgt_search::SearchIndexEvent {
                    kind: vgt_search::SearchIndexEventKind::Upsert,
                    document_id,
                    authoritative_version,
                    document: Some(request.document),
                    options: request.options,
                };
                match search_index.apply_event(event) {
                    Ok(checkpoint) => send_json(
                        &mut stream,
                        200,
                        &serde_json::json!({"success": true, "generation": checkpoint.generation, "checkpoint": checkpoint}),
                        allowed_origin,
                    )?,
                    Err(_) => {
                        send_error(&mut stream, 422, "Search upsert rejected", allowed_origin)?
                    }
                }
            }
            Err(_) => send_error(
                &mut stream,
                400,
                "Invalid search upsert request",
                allowed_origin,
            )?,
        }
    } else if method == "POST" && path == "/api/v1/search/event" {
        if !vault.is_unlocked() {
            send_error(
                &mut stream,
                403,
                "KeyVault must be unlocked before index mutation",
                allowed_origin,
            )?;
            return Ok(());
        }
        match serde_json::from_slice::<vgt_search::SearchIndexEvent>(&body) {
            Ok(event) => match search_index.apply_event(event) {
                Ok(checkpoint) => send_json(
                    &mut stream,
                    200,
                    &serde_json::json!({"success": true, "checkpoint": checkpoint}),
                    allowed_origin,
                )?,
                Err(_) => send_error(&mut stream, 422, "Search event rejected", allowed_origin)?,
            },
            Err(_) => send_error(&mut stream, 400, "Invalid search event", allowed_origin)?,
        }
    } else if method == "POST" && path == "/api/v1/search/delete" {
        if !vault.is_unlocked() {
            send_error(
                &mut stream,
                403,
                "KeyVault must be unlocked before index mutation",
                allowed_origin,
            )?;
            return Ok(());
        }
        #[derive(Deserialize)]
        struct Request {
            document_id: String,
        }
        match serde_json::from_slice::<Request>(&body) {
            Ok(request) if !request.document_id.is_empty() && request.document_id.len() <= 256 => {
                match search_index.remove_document(&request.document_id) {
                    Ok(()) => send_json(
                        &mut stream,
                        200,
                        &serde_json::json!({"success": true, "generation": search_index.generation()}),
                        allowed_origin,
                    )?,
                    Err(_) => {
                        send_error(&mut stream, 422, "Search delete rejected", allowed_origin)?
                    }
                }
            }
            _ => send_error(
                &mut stream,
                400,
                "Invalid search delete request",
                allowed_origin,
            )?,
        }
    } else if method == "POST" && path == "/api/v1/search/query" {
        if !vault.is_unlocked() {
            send_error(
                &mut stream,
                403,
                "KeyVault must be unlocked before search",
                allowed_origin,
            )?;
            return Ok(());
        }
        #[derive(Deserialize)]
        struct Request {
            query: String,
            limit: Option<usize>,
        }
        // Die Berechtigung wird ABGELEITET, nicht gelesen.
        //
        // Gemessen am 2026-10-16: hier stand `#[serde(default)] permission:
        // SearchPermissionContext`, und der Wert ging unveraendert an
        // `search_with_context`. Damit bestimmte der AUFRUFER, welche
        // Partitionen er sehen darf — die Partition-ACL war eine
        // Selbstauskunft. Ein unbekanntes Feld im Body wird von serde
        // ignoriert, ein bestehender Client bricht also nicht.
        let permission = search_index.local_owner_permission();
        match serde_json::from_slice::<Request>(&body) {
            Ok(request) => match search_index.search_with_context(
                &request.query,
                &permission,
                request.limit.unwrap_or(50),
            ) {
                Ok(hits) => send_json(
                    &mut stream,
                    200,
                    &serde_json::json!({"success": true, "hits": hits, "generation": search_index.generation()}),
                    allowed_origin,
                )?,
                Err(_) => send_error(&mut stream, 422, "Search query rejected", allowed_origin)?,
            },
            Err(_) => send_error(
                &mut stream,
                400,
                "Invalid search query request",
                allowed_origin,
            )?,
        }
    } else if method == "POST" && path == "/api/v1/search/facets" {
        if !vault.is_unlocked() {
            send_error(
                &mut stream,
                403,
                "KeyVault must be unlocked before search facets",
                allowed_origin,
            )?;
            return Ok(());
        }
        #[derive(Deserialize)]
        struct Request {}
        // DIESELBE ABLEITUNG WIE BEI `/search/query`.
        //
        // Gemessen am 2026-10-16: auch dieser Endpunkt las die Berechtigung aus
        // dem Request-Body (`#[serde(default)] permission:
        // SearchPermissionContext`) und reichte sie unveraendert an
        // `facet_counts_with_context` weiter. Wer nur `/search/query` repariert
        // haette, haette die Luecke hier offen gelassen — die Facetten eines
        // Dokuments verraten seinen Inhalt.
        let permission = search_index.local_owner_permission();
        match serde_json::from_slice::<Request>(&body) {
            Ok(_) => match search_index.facet_counts_with_context(&permission) {
                Ok(facets) => send_json(
                    &mut stream,
                    200,
                    &serde_json::json!({"success": true, "facets": facets, "generation": search_index.generation()}),
                    allowed_origin,
                )?,
                Err(_) => send_error(&mut stream, 422, "Search facets rejected", allowed_origin)?,
            },
            Err(_) => send_error(
                &mut stream,
                400,
                "Invalid search facets request",
                allowed_origin,
            )?,
        }
    } else if method == "GET" && path == "/api/v1/search/preferences" {
        if !vault.is_unlocked() {
            send_error(
                &mut stream,
                403,
                "KeyVault must be unlocked before search preferences",
                allowed_origin,
            )?;
            return Ok(());
        }
        send_json(
            &mut stream,
            200,
            &serde_json::json!({"success": true, "preferences": search_index.preferences()}),
            allowed_origin,
        )?;
    } else if method == "POST" && path == "/api/v1/search/preferences" {
        if !vault.is_unlocked() {
            send_error(
                &mut stream,
                403,
                "KeyVault must be unlocked before search preferences",
                allowed_origin,
            )?;
            return Ok(());
        }
        match serde_json::from_slice::<vgt_search::SearchPreferences>(&body) {
            Ok(preferences) => match search_index.set_preferences(preferences) {
                Ok(()) => send_json(
                    &mut stream,
                    200,
                    &serde_json::json!({"success": true, "generation": search_index.generation()}),
                    allowed_origin,
                )?,
                Err(_) => send_error(
                    &mut stream,
                    422,
                    "Search preferences rejected",
                    allowed_origin,
                )?,
            },
            Err(_) => send_error(
                &mut stream,
                400,
                "Invalid search preferences",
                allowed_origin,
            )?,
        }
    } else if method == "POST" && path == "/api/v1/search/history/record" {
        if !vault.is_unlocked() {
            send_error(
                &mut stream,
                403,
                "KeyVault must be unlocked before search history",
                allowed_origin,
            )?;
            return Ok(());
        }
        #[derive(Deserialize)]
        struct Request {
            query: String,
            executed_at: i64,
        }
        match serde_json::from_slice::<Request>(&body) {
            Ok(request) => {
                match search_index.record_recent_query(&request.query, request.executed_at) {
                    Ok(()) => send_json(
                        &mut stream,
                        200,
                        &serde_json::json!({"success": true}),
                        allowed_origin,
                    )?,
                    Err(_) => send_error(
                        &mut stream,
                        422,
                        "Search history update rejected",
                        allowed_origin,
                    )?,
                }
            }
            Err(_) => send_error(
                &mut stream,
                400,
                "Invalid search history request",
                allowed_origin,
            )?,
        }
    } else if method == "POST" && path == "/api/v1/search/history/clear" {
        if !vault.is_unlocked() {
            send_error(
                &mut stream,
                403,
                "KeyVault must be unlocked before search history",
                allowed_origin,
            )?;
            return Ok(());
        }
        match search_index.clear_recent_queries() {
            Ok(()) => send_json(
                &mut stream,
                200,
                &serde_json::json!({"success": true}),
                allowed_origin,
            )?,
            Err(_) => send_error(
                &mut stream,
                422,
                "Search history clear rejected",
                allowed_origin,
            )?,
        }
    } else if method == "POST" && path == "/api/v1/search/saved/upsert" {
        if !vault.is_unlocked() {
            send_error(
                &mut stream,
                403,
                "KeyVault must be unlocked before saved search mutation",
                allowed_origin,
            )?;
            return Ok(());
        }
        match serde_json::from_slice::<vgt_search::SearchSavedQuery>(&body) {
            Ok(saved) => match search_index.upsert_saved_query(saved) {
                Ok(()) => send_json(
                    &mut stream,
                    200,
                    &serde_json::json!({"success": true}),
                    allowed_origin,
                )?,
                Err(_) => send_error(&mut stream, 422, "Saved search rejected", allowed_origin)?,
            },
            Err(_) => send_error(&mut stream, 400, "Invalid saved search", allowed_origin)?,
        }
    } else if method == "POST" && path == "/api/v1/search/export" {
        if !vault.is_unlocked() {
            send_error(
                &mut stream,
                403,
                "KeyVault must be unlocked before search export",
                allowed_origin,
            )?;
            return Ok(());
        }
        #[derive(Deserialize)]
        struct Request {
            workspace_scope: String,
        }
        match serde_json::from_slice::<Request>(&body) {
            Ok(request) => match vault.derive_search_index_key(&request.workspace_scope) {
                Ok(mut key) => {
                    let result = search_index.export_encrypted(&key);
                    key.fill(0);
                    match result {
                        Ok(blob) => send_json(
                            &mut stream,
                            200,
                            &serde_json::json!({"success": true, "encrypted_index_base64": base64::encode(&blob)}),
                            allowed_origin,
                        )?,
                        Err(_) => {
                            send_error(&mut stream, 422, "Search export rejected", allowed_origin)?
                        }
                    }
                }
                Err(_) => send_error(
                    &mut stream,
                    403,
                    "Search KeyVault key unavailable",
                    allowed_origin,
                )?,
            },
            Err(_) => send_error(
                &mut stream,
                400,
                "Invalid search export request",
                allowed_origin,
            )?,
        }
    } else if method == "POST" && path == "/api/v1/search/import" {
        if !vault.is_unlocked() {
            send_error(
                &mut stream,
                403,
                "KeyVault must be unlocked before search import",
                allowed_origin,
            )?;
            return Ok(());
        }
        #[derive(Deserialize)]
        struct Request {
            workspace_scope: String,
            encrypted_index_base64: String,
        }
        match serde_json::from_slice::<Request>(&body) {
            Ok(request) if request.encrypted_index_base64.len() <= MAX_REQUEST_BODY => {
                let decoded = base64::decode(&request.encrypted_index_base64);
                match (
                    decoded,
                    vault.derive_search_index_key(&request.workspace_scope),
                ) {
                    (Ok(blob), Ok(mut key)) => {
                        let restored = SearchIndex::import_encrypted(&blob, &key);
                        key.fill(0);
                        match restored {
                            Ok(index) => {
                                *search_index = index;
                                send_json(
                                    &mut stream,
                                    200,
                                    &serde_json::json!({"success": true, "generation": search_index.generation(), "document_count": search_index.document_count()}),
                                    allowed_origin,
                                )?;
                            }
                            Err(_) => send_error(
                                &mut stream,
                                409,
                                "Encrypted search index is corrupted or cannot be authenticated",
                                allowed_origin,
                            )?,
                        }
                    }
                    _ => send_error(&mut stream, 400, "Search import rejected", allowed_origin)?,
                }
            }
            _ => send_error(
                &mut stream,
                400,
                "Invalid search import request",
                allowed_origin,
            )?,
        }
    } else if method == "POST" && path == "/api/v1/netgate/evaluate" {
        match evaluate_netgate_request(&body) {
            Ok(response) => send_json(&mut stream, 200, &response, allowed_origin)?,
            Err(_) => send_error(&mut stream, 400, "Invalid JSON", allowed_origin)?,
        }
    } else {
        send_error(&mut stream, 404, "Endpoint not found", allowed_origin)?;
    }

    Ok(())
}

fn public_container_error(error: &ContainerError) -> &'static str {
    match error {
        ContainerError::InvalidMagic
        | ContainerError::CorruptedData
        | ContainerError::UnexpectedEof
        | ContainerError::TrailingBytes
        | ContainerError::MissingDocumentTree
        | ContainerError::InvalidCompressedPayload
        | ContainerError::OffsetOverflow
        | ContainerError::ManifestChunkMismatch
        | ContainerError::CorruptedManifest
        | ContainerError::IncompatibleManifest
        | ContainerError::UnknownCriticalChunk(_)
        | ContainerError::MissingChunkKdfSalt
        | ContainerError::InvalidKeySlotCount(_) => "Container is invalid, corrupted, or truncated",
        ContainerError::UnsupportedFormatVersion(_)
        | ContainerError::UnsupportedCryptoVersion(_)
        | ContainerError::UnsupportedManifestVersion(_)
        | ContainerError::LegacyHeaderApiOnV3
        | ContainerError::StreamingLegacyRequiresBuffer(_) => {
            "Container format version is not supported by this operation"
        }
        ContainerError::MigrationCredentialsRequired => {
            "Container migration requires the original unlock credential"
        }
        ContainerError::Cancelled => "Container operation was cancelled",
        ContainerError::ContainerTooLarge(_)
        | ContainerError::MetadataTooLarge(_, _)
        | ContainerError::ManifestTooLarge(_, _)
        | ContainerError::TooManyChunks(_, _)
        | ContainerError::ChunkTooLarge(_, _)
        | ContainerError::ChunkPlaintextTooLarge(_, _)
        | ContainerError::PlaintextTooLarge(_)
        | ContainerError::PlaintextTotalTooLarge(_) => {
            "Container exceeds configured resource limits"
        }
        ContainerError::KeyVault(vgt_keyvault::KeyVaultError::AuthenticationFailed)
        | ContainerError::KeyVault(vgt_keyvault::KeyVaultError::InvalidCredentialFormat) => {
            "Authentication failed"
        }
        ContainerError::KeyVault(vgt_keyvault::KeyVaultError::VaultLocked) => {
            "Local KeyVault is locked"
        }
        ContainerError::KeyVault(_) => "Native key storage is unavailable or failed",
        ContainerError::Crypto(_) => "Cryptographic operation failed",
        ContainerError::Serialization(_) => "Workspace document serialization failed",
        ContainerError::Io(_) => "Container I/O operation failed",
    }
}

fn http_reason_phrase(status: u16) -> &'static str {
    match status {
        200 => "OK",
        201 => "Created",
        202 => "Accepted",
        204 => "No Content",
        400 => "Bad Request",
        401 => "Unauthorized",
        403 => "Forbidden",
        404 => "Not Found",
        405 => "Method Not Allowed",
        408 => "Request Timeout",
        409 => "Conflict",
        413 => "Payload Too Large",
        415 => "Unsupported Media Type",
        422 => "Unprocessable Entity",
        429 => "Too Many Requests",
        431 => "Request Header Fields Too Large",
        500 => "Internal Server Error",
        503 => "Service Unavailable",
        _ => "Status",
    }
}

fn send_json<T: Serialize>(
    stream: &mut TcpStream,
    status: u16,
    data: &T,
    origin: &str,
) -> std::io::Result<()> {
    let json_bytes = serde_json::to_vec(data)?;
    let header = format!(
        "HTTP/1.1 {} {}\r\n\
Content-Type: application/json\r\n\
Access-Control-Allow-Origin: {}\r\n\
Vary: Origin\r\n\
Cache-Control: no-store\r\n\
X-Content-Type-Options: nosniff\r\n\
Connection: close\r\n\
Content-Length: {}\r\n\r\n",
        status,
        http_reason_phrase(status),
        origin,
        json_bytes.len()
    );
    stream.write_all(header.as_bytes())?;
    stream.write_all(&json_bytes)?;
    stream.flush()
}

fn send_error(stream: &mut TcpStream, status: u16, msg: &str, origin: &str) -> std::io::Result<()> {
    let resp = serde_json::json!({ "success": false, "error": msg });
    send_json(stream, status, &resp, origin)
}

#[cfg(test)]
mod server_tests {
    use super::*;
    use crate::search_transfer::sha256_hex;
    use std::net::Shutdown;
    use std::sync::Mutex as TestMutex;
    use std::thread;
    use vgt_object_model::{Paragraph, TextBlockObject, TextSpan, WorkspaceObject};

    const TEST_IPC_TOKEN: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    static LOOPBACK_TEST_LOCK: TestMutex<()> = TestMutex::new(());

    #[test]
    fn origin_allowlist_accepts_native_tauri_and_rejects_untrusted_origins() {
        assert!(is_origin_allowed("http://tauri.localhost"));
        assert!(is_origin_allowed("https://tauri.localhost"));
        assert!(is_origin_allowed("tauri://localhost"));
        assert!(!is_origin_allowed("https://attacker.example"));
        assert!(!is_origin_allowed(
            "http://tauri.localhost.attacker.example"
        ));
    }

    fn send_loopback_request(
        address: std::net::SocketAddr,
        request: &[u8],
    ) -> std::io::Result<Vec<u8>> {
        let mut client = TcpStream::connect(address)?;
        client.set_read_timeout(Some(Duration::from_secs(3)))?;
        client.write_all(request)?;
        client.shutdown(Shutdown::Write)?;
        let mut response = Vec::new();
        client.read_to_end(&mut response)?;
        Ok(response)
    }

    #[test]
    fn bound_ipc_listener_is_reserved_only_on_ipv4_loopback() {
        let listener = bind_loopback_listener(0).expect("bind ephemeral loopback listener");
        let address = listener
            .0
            .local_addr()
            .expect("read reserved loopback address");

        assert_eq!(
            address.ip(),
            std::net::IpAddr::V4(std::net::Ipv4Addr::LOCALHOST)
        );
        assert_ne!(address.port(), 0);
    }

    #[test]
    fn binding_an_owned_loopback_port_fails_closed() {
        let listener = bind_loopback_listener(0).expect("bind ephemeral loopback listener");
        let port = listener
            .0
            .local_addr()
            .expect("read reserved loopback port")
            .port();

        let error = match bind_loopback_listener(port) {
            Ok(_) => panic!("second listener must not claim an occupied port"),
            Err(error) => error,
        };

        assert_eq!(error.kind(), std::io::ErrorKind::AddrInUse);
    }

    #[test]
    fn desktop_loopback_search_uses_the_shared_native_keyvault_unlock_state() {
        let _serial = LOOPBACK_TEST_LOCK
            .lock()
            .unwrap_or_else(|poison| poison.into_inner());
        let listener = bind_loopback_listener(0).expect("reserve loopback port");
        let port = listener
            .0
            .local_addr()
            .expect("read reserved loopback port")
            .port();

        let vault = Arc::new(Mutex::new(VgtKeyVault::new()));
        let stop_signal = Arc::new(AtomicBool::new(false));
        let ready_signal = Arc::new(AtomicBool::new(false));
        let server_vault = Arc::clone(&vault);
        let server_stop_signal = Arc::clone(&stop_signal);
        let server_ready_signal = Arc::clone(&ready_signal);
        let server_thread = thread::spawn(move || {
            run_ipc_server_with_listener_and_shared_vault(
                listener,
                server_stop_signal,
                server_ready_signal,
                server_vault,
            )
            .is_ok()
        });

        for _ in 0..400 {
            if ready_signal.load(Ordering::Acquire) || server_thread.is_finished() {
                break;
            }
            thread::sleep(Duration::from_millis(5));
        }
        let ready_when_started = ready_signal.load(Ordering::Acquire);

        let address = std::net::SocketAddr::from(([127, 0, 0, 1], port));
        let pairing_request = make_request(
            "POST /api/v1/ipc/pair HTTP/1.1",
            &[
                ("Origin", "http://tauri.localhost".to_string()),
                (IPC_AUTH_HEADER, TEST_IPC_TOKEN.to_string()),
                ("Content-Length", "0".to_string()),
            ],
            &[],
        );
        let preferences_request = make_request(
            "GET /api/v1/search/preferences HTTP/1.1",
            &[
                ("Origin", "http://tauri.localhost".to_string()),
                (IPC_AUTH_HEADER, TEST_IPC_TOKEN.to_string()),
            ],
            &[],
        );

        let pairing_response = send_loopback_request(address, &pairing_request);
        let pairing_status = pairing_response
            .as_ref()
            .ok()
            .and_then(|response| status_code(response));
        let locked_preferences_status = send_loopback_request(address, &preferences_request)
            .ok()
            .and_then(|response| status_code(&response));
        let unlock_succeeded = vault
            .lock()
            .map_err(|_| ())
            .and_then(|mut shared| shared.unlock_with_master_key([0x42; 32]).map_err(|_| ()))
            .is_ok();
        let unlocked_preferences_status = send_loopback_request(address, &preferences_request)
            .ok()
            .and_then(|response| status_code(&response));

        stop_signal.store(true, Ordering::Release);
        let server_result = server_thread.join().unwrap_or(false);

        assert!(ready_when_started);
        assert_eq!(pairing_status, Some(200));
        assert_eq!(locked_preferences_status, Some(403));
        assert!(unlock_succeeded);
        assert_eq!(unlocked_preferences_status, Some(200));
        assert!(server_result);
    }

    fn make_request(request_line: &str, headers: &[(&str, String)], body: &[u8]) -> Vec<u8> {
        let mut request = Vec::new();
        request.extend_from_slice(request_line.as_bytes());
        request.extend_from_slice(b"\r\n");
        for (name, value) in headers {
            request.extend_from_slice(name.as_bytes());
            request.extend_from_slice(b": ");
            request.extend_from_slice(value.as_bytes());
            request.extend_from_slice(b"\r\n");
        }
        request.extend_from_slice(b"\r\n");
        request.extend_from_slice(body);
        request
    }

    fn authenticated_json_request(path: &str, body: &[u8]) -> Vec<u8> {
        make_request(
            &format!("POST {path} HTTP/1.1"),
            &[
                ("Content-Type", "application/json".to_string()),
                (IPC_AUTH_HEADER, TEST_IPC_TOKEN.to_string()),
                ("Content-Length", body.len().to_string()),
            ],
            body,
        )
    }

    fn status_code(response: &[u8]) -> Option<u16> {
        let line_end = response.windows(2).position(|pair| pair == b"\r\n")?;
        let line = std::str::from_utf8(&response[..line_end]).ok()?;
        line.split_whitespace().nth(1)?.parse().ok()
    }

    fn response_error(response: &[u8]) -> Option<String> {
        let body_start = response
            .windows(4)
            .position(|window| window == b"\r\n\r\n")?
            + 4;
        let body: serde_json::Value = serde_json::from_slice(&response[body_start..]).ok()?;
        body.get("error")?.as_str().map(str::to_string)
    }

    fn response_json(response: &[u8]) -> serde_json::Value {
        let body_start = response
            .windows(4)
            .position(|window| window == b"\r\n\r\n")
            .expect("HTTP response header terminator")
            + 4;
        serde_json::from_slice(&response[body_start..]).expect("JSON response body")
    }

    fn authenticated_origin_json_request(path: &str, value: &serde_json::Value) -> Vec<u8> {
        let body = serde_json::to_vec(value).expect("serialize JSON request");
        make_request(
            &format!("POST {path} HTTP/1.1"),
            &[
                ("Origin", "http://tauri.localhost".to_string()),
                ("Content-Type", "application/json".to_string()),
                (IPC_AUTH_HEADER, TEST_IPC_TOKEN.to_string()),
                ("Content-Length", body.len().to_string()),
            ],
            &body,
        )
    }

    fn encrypted_search_fixture() -> (Vec<u8>, [u8; 32], String) {
        let mut vault = VgtKeyVault::new();
        vault
            .unlock_with_master_key([0x42; 32])
            .expect("unlock fixture Search vault");
        let key = vault
            .derive_search_index_key("astraea-workspace-default")
            .expect("derive fixture Search index key");
        let mut document =
            WorkspaceDocument::new("Strategy-2027", vgt_object_model::DocumentKind::Writer);
        let text = format!("strategy {}", "x".repeat(180_000));
        document.add_root_object(WorkspaceObject::TextBlock(TextBlockObject {
            id: "transfer-fixture-text".into(),
            paragraphs: vec![Paragraph {
                id: "transfer-fixture-paragraph".into(),
                style: Default::default(),
                spans: vec![TextSpan {
                    text,
                    ..Default::default()
                }],
            }],
        }));
        let mut index = SearchIndex::new();
        index
            .index_document(&document)
            .expect("index transfer fixture document");
        let encrypted = index
            .export_encrypted(&key)
            .expect("encrypt transfer fixture index");
        assert!(encrypted.len() > SEARCH_TRANSFER_CHUNK_BYTES);
        (encrypted, key, document.id)
    }

    /// Exercises the production TCP request handler using loopback sockets. The 128 MiB
    /// rejection cases send headers only, so they prove early framing rejection without
    /// allocating or transmitting a maximum-sized body.
    fn loopback_requests(requests: Vec<Vec<u8>>, pair_token: bool) -> Vec<Vec<u8>> {
        loopback_requests_configured(requests, pair_token, false)
    }

    fn loopback_requests_with_unlocked_vault(requests: Vec<Vec<u8>>) -> Vec<Vec<u8>> {
        loopback_requests_configured(requests, true, true)
    }

    fn loopback_requests_configured(
        requests: Vec<Vec<u8>>,
        pair_token: bool,
        unlock_vault: bool,
    ) -> Vec<Vec<u8>> {
        let _serial = LOOPBACK_TEST_LOCK
            .lock()
            .unwrap_or_else(|poison| poison.into_inner());
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind isolated loopback listener");
        let address = listener
            .local_addr()
            .expect("read ephemeral listener address");
        let request_count = requests.len();
        let server_thread = thread::spawn(move || {
            let mut vault = VgtKeyVault::new();
            if unlock_vault {
                vault
                    .unlock_with_master_key([0x42; 32])
                    .expect("unlock isolated Search transfer test vault");
            }
            let mut search_index = SearchIndex::new();
            let mut search_transfers = SearchTransferStore::default();
            let mut ipc_auth = IpcAuthState::default();
            if pair_token {
                ipc_auth.pair(TEST_IPC_TOKEN).expect("pair test IPC token");
            }

            for _ in 0..request_count {
                let (stream, _) = listener.accept().expect("accept loopback request");
                handle_client(
                    stream,
                    &mut vault,
                    &mut search_index,
                    &mut search_transfers,
                    &mut ipc_auth,
                )
                .expect("production request handler returns controlled outcome");
            }
        });

        let mut responses = Vec::with_capacity(request_count);
        for request in requests {
            let mut client = TcpStream::connect(address).expect("connect to isolated handler");
            client
                .set_read_timeout(Some(Duration::from_secs(3)))
                .expect("set bounded client read timeout");
            client.write_all(&request).expect("write bounded request");
            client
                .shutdown(Shutdown::Write)
                .expect("finish request stream");
            let mut response = Vec::new();
            client
                .read_to_end(&mut response)
                .expect("read bounded handler response");
            responses.push(response);
        }

        server_thread
            .join()
            .expect("loopback handler thread completes");
        responses
    }

    #[test]
    fn reason_phrases_match_common_status_codes() {
        assert_eq!(http_reason_phrase(200), "OK");
        assert_eq!(http_reason_phrase(403), "Forbidden");
        assert_eq!(http_reason_phrase(404), "Not Found");
        assert_eq!(http_reason_phrase(413), "Payload Too Large");
        assert_eq!(http_reason_phrase(431), "Request Header Fields Too Large");
        assert_eq!(http_reason_phrase(405), "Method Not Allowed");
    }

    #[test]
    fn public_container_errors_do_not_expose_storage_detail() {
        let error = ContainerError::KeyVault(vgt_keyvault::KeyVaultError::StorageError(
            "/private/path/keyring: backend detail".into(),
        ));
        assert_eq!(
            public_container_error(&error),
            "Native key storage is unavailable or failed"
        );
    }

    #[test]
    fn development_origin_allowlist_is_exact() {
        assert!(is_origin_allowed("http://127.0.0.1:5173"));
        assert!(is_origin_allowed("http://localhost:4173"));
        assert!(!is_origin_allowed("http://127.0.0.1.evil.example:5173"));
        assert!(!is_origin_allowed("https://attacker.example"));
        assert!(!is_origin_allowed("null"));
    }

    #[test]
    fn malformed_request_lines_receive_a_controlled_bad_request() {
        let requests = [
            b"\r\n\r\n".to_vec(),
            b"POST\r\n\r\n".to_vec(),
            b"POST /api/v1/container/pack\r\n\r\n".to_vec(),
            b"POST /api/v1/container/pack HTTP/2\r\n\r\n".to_vec(),
        ];
        let responses = loopback_requests(requests.to_vec(), false);

        for response in responses {
            assert_eq!(status_code(&response), Some(400));
            assert_eq!(
                response_error(&response).as_deref(),
                Some("Malformed HTTP request line")
            );
        }
    }

    #[test]
    fn oversized_unterminated_request_line_is_rejected_by_the_header_cap() {
        let request = vec![b'X'; MAX_HEADER_BYTES + 1];
        let response = loopback_requests(vec![request], false)
            .pop()
            .expect("one overlong request-line response");
        assert_eq!(status_code(&response), Some(431));
        assert_eq!(
            response_error(&response).as_deref(),
            Some("Header fields too large")
        );
    }

    #[test]
    fn oversized_single_unterminated_header_is_rejected_before_full_line_buffering() {
        let mut request = b"POST /api/v1/container/pack HTTP/1.1\r\nX-Pad: ".to_vec();
        request.extend(std::iter::repeat_n(b'x', MAX_HEADER_BYTES));
        let response = loopback_requests(vec![request], false)
            .pop()
            .expect("one overlong header response");
        assert_eq!(status_code(&response), Some(431));
        assert_eq!(
            response_error(&response).as_deref(),
            Some("Header fields too large")
        );
    }

    #[test]
    fn malformed_and_ambiguous_headers_are_rejected_before_auth_or_body_read() {
        let request_line = "POST /api/v1/container/pack HTTP/1.1";
        let cases = [
            make_request(request_line, &[("Content-Length", "12x".into())], b""),
            make_request(
                request_line,
                &[
                    ("Content-Length", "1".into()),
                    ("Content-Length", "1".into()),
                ],
                b"",
            ),
            make_request(
                request_line,
                &[
                    ("Content-Length", "0".into()),
                    ("Transfer-Encoding", "chunked".into()),
                ],
                b"",
            ),
            make_request(
                request_line,
                &[
                    ("Transfer-Encoding", "chunked".into()),
                    ("Transfer-Encoding", "chunked".into()),
                ],
                b"",
            ),
            make_request(
                request_line,
                &[
                    (IPC_AUTH_HEADER, TEST_IPC_TOKEN.into()),
                    (IPC_AUTH_HEADER, TEST_IPC_TOKEN.into()),
                ],
                b"",
            ),
        ];
        let mut requests = cases.to_vec();
        let oversized_header = "x".repeat(MAX_HEADER_BYTES + 1);
        requests.push(make_request(
            request_line,
            &[("X-Pad", oversized_header)],
            b"",
        ));
        let responses = loopback_requests(requests, false);
        let expected = [400, 400, 400, 400, 400, 431];

        for (response, expected_status) in responses.iter().zip(expected) {
            assert_eq!(status_code(response), Some(expected_status));
        }
    }

    #[test]
    fn authorization_precedes_body_ceiling_and_max_plus_one_is_rejected_from_headers() {
        let length = (MAX_REQUEST_BODY + 1).to_string();
        let request_line = "POST /api/v1/container/pack HTTP/1.1";
        let headers = [
            ("Content-Type", "application/json".to_string()),
            ("Content-Length", length),
        ];
        let unauthorized = make_request(request_line, &headers, b"");
        let unauthorized_response = loopback_requests(vec![unauthorized], false)
            .pop()
            .expect("one unauthorized response");
        assert_eq!(status_code(&unauthorized_response), Some(401));
        assert_eq!(
            response_error(&unauthorized_response).as_deref(),
            Some("IPC authorization required")
        );

        let authorized = make_request(
            request_line,
            &[
                ("Content-Type", "application/json".to_string()),
                (IPC_AUTH_HEADER, TEST_IPC_TOKEN.to_string()),
                ("Content-Length", (MAX_REQUEST_BODY + 1).to_string()),
            ],
            b"",
        );
        let authorized_response = loopback_requests(vec![authorized], true)
            .pop()
            .expect("one oversized response");
        assert_eq!(status_code(&authorized_response), Some(413));
        assert_eq!(
            response_error(&authorized_response),
            Some(format!(
                "Request body exceeds {} MiB ceiling",
                MAX_REQUEST_BODY / (1024 * 1024)
            ))
        );
    }

    #[test]
    fn variable_size_search_import_bodies_are_fully_read_and_locked_vault_is_distinct_from_auth() {
        let character_counts = [
            65_536usize,
            262_144,
            524_288,
            1_572_864,
            1_942_016,
            2 * 1024 * 1024,
        ];
        let requests = character_counts
            .iter()
            .map(|character_count| {
                let body = serde_json::to_vec(&serde_json::json!({
                    "workspace_scope": "astraea-workspace-default",
                    "encrypted_index_base64": "A".repeat(*character_count),
                }))
                .unwrap();
                make_request(
                    "POST /api/v1/search/import HTTP/1.1",
                    &[
                        ("Origin", "http://tauri.localhost".to_string()),
                        ("Content-Type", "application/json".to_string()),
                        (IPC_AUTH_HEADER, TEST_IPC_TOKEN.to_string()),
                        ("Content-Length", body.len().to_string()),
                    ],
                    &body,
                )
            })
            .collect();
        let responses = loopback_requests(requests, true);
        assert_eq!(responses.len(), character_counts.len());
        for response in responses {
            assert_eq!(status_code(&response), Some(403));
            assert_eq!(
                response_error(&response).as_deref(),
                Some("KeyVault must be unlocked before search import")
            );
        }

        let unauthorized = make_request(
            "POST /api/v1/search/import HTTP/1.1",
            &[
                ("Origin", "http://tauri.localhost".to_string()),
                ("Content-Type", "application/json".to_string()),
                ("Content-Length", "0".to_string()),
            ],
            &[],
        );
        let unauthorized_response = loopback_requests(vec![unauthorized], false).pop().unwrap();
        assert_eq!(status_code(&unauthorized_response), Some(401));
        assert_eq!(
            response_error(&unauthorized_response).as_deref(),
            Some("IPC authorization required")
        );
    }

    #[test]
    fn search_transfer_import_and_export_roundtrip_multiple_authenticated_chunks() {
        let (encrypted, mut key, document_id) = encrypted_search_fixture();
        let import_id = "10112233445566778899aabbccddeeff";
        let export_id = "ffeeddccbbaa99887766554433221100";
        let chunk_count = encrypted.len().div_ceil(SEARCH_TRANSFER_CHUNK_BYTES);
        let mut requests = vec![authenticated_origin_json_request(
            "/api/v1/search/import/begin",
            &serde_json::json!({
                "transfer_id": import_id,
                "workspace_scope": "astraea-workspace-default",
                "total_bytes": encrypted.len(),
                "sha256": sha256_hex(&encrypted),
                "expected_generation": 0,
            }),
        )];
        for (chunk_index, chunk) in encrypted.chunks(SEARCH_TRANSFER_CHUNK_BYTES).enumerate() {
            requests.push(authenticated_origin_json_request(
                "/api/v1/search/import/chunk",
                &serde_json::json!({
                    "transfer_id": import_id,
                    "chunk_index": chunk_index,
                    "data_base64": base64::encode(chunk),
                }),
            ));
        }
        requests.push(authenticated_origin_json_request(
            "/api/v1/search/import/finalize",
            &serde_json::json!({"transfer_id": import_id}),
        ));
        requests.push(authenticated_origin_json_request(
            "/api/v1/search/query",
            &serde_json::json!({
                "query": "strategy",
                "permission": {
                    "allowed_partitions": ["local:owner"],
                    "unlocked_document_ids": [document_id.clone()],
                },
                "limit": 20,
            }),
        ));
        requests.push(authenticated_origin_json_request(
            "/api/v1/search/export/begin",
            &serde_json::json!({
                "transfer_id": export_id,
                "workspace_scope": "astraea-workspace-default",
            }),
        ));
        for chunk_index in 0..chunk_count {
            requests.push(authenticated_origin_json_request(
                "/api/v1/search/export/chunk",
                &serde_json::json!({"transfer_id": export_id, "chunk_index": chunk_index}),
            ));
        }

        let responses = loopback_requests_with_unlocked_vault(requests);
        assert_eq!(status_code(&responses[0]), Some(200));
        for response in responses.iter().take(chunk_count + 1).skip(1) {
            assert_eq!(status_code(response), Some(200));
        }
        let finalize_index = chunk_count + 1;
        assert_eq!(status_code(&responses[finalize_index]), Some(200));
        let query_index = finalize_index + 1;
        assert_eq!(status_code(&responses[query_index]), Some(200));
        let query_response = response_json(&responses[query_index]);
        let hits = query_response["hits"].as_array().expect("query hit list");
        assert_eq!(hits.len(), 2);
        assert!(hits.iter().all(|hit| hit["document_id"] == document_id));
        assert!(hits
            .iter()
            .any(|hit| hit["document_title"] == "Strategy-2027"));
        assert!(hits.iter().any(|hit| hit["field"] == "title"));
        assert!(hits.iter().any(|hit| hit["field"] == "full_text"));

        let export_begin_index = query_index + 1;
        assert_eq!(status_code(&responses[export_begin_index]), Some(200));
        let export_metadata = response_json(&responses[export_begin_index]);
        let exported_total_bytes = export_metadata["total_bytes"].as_u64().unwrap() as usize;
        assert_eq!(
            export_metadata["chunk_size"].as_u64(),
            Some(SEARCH_TRANSFER_CHUNK_BYTES as u64)
        );
        assert_eq!(
            exported_total_bytes.div_ceil(SEARCH_TRANSFER_CHUNK_BYTES),
            chunk_count
        );
        let mut exported = Vec::new();
        for (chunk_index, response) in responses.iter().skip(export_begin_index + 1).enumerate() {
            assert_eq!(status_code(response), Some(200));
            let chunk = response_json(response);
            assert_eq!(chunk["chunk_index"].as_u64(), Some(chunk_index as u64));
            assert_eq!(chunk["total_chunks"].as_u64(), Some(chunk_count as u64));
            exported.extend(base64::decode(chunk["data_base64"].as_str().unwrap()).unwrap());
        }
        assert_eq!(exported.len(), exported_total_bytes);
        assert_eq!(
            sha256_hex(&exported),
            export_metadata["sha256"].as_str().unwrap()
        );
        let restored =
            SearchIndex::import_encrypted(&exported, &key).expect("authenticate exported index");
        assert!(!restored.search("strategy").unwrap().is_empty());
        key.fill(0);
    }

    #[test]
    fn search_transfer_routes_reject_bad_auth_origin_oversize_abort_and_sequence_errors() {
        let small_data = b"four";
        let small_digest = sha256_hex(small_data);
        let first_id = "00112233445566778899aabbccddeeff";
        let abort_id = "11112233445566778899aabbccddeeff";
        let duplicate_id = "22222233445566778899aabbccddeeff";
        let stale_id = "33332233445566778899aabbccddeeff";
        let unauthorized = make_request(
            "POST /api/v1/search/import/begin HTTP/1.1",
            &[
                ("Origin", "http://tauri.localhost".to_string()),
                ("Content-Type", "application/json".to_string()),
                ("Content-Length", serde_json::to_vec(&serde_json::json!({"transfer_id":first_id,"workspace_scope":"scope","total_bytes":4,"sha256":small_digest.clone(),"expected_generation":0})).unwrap().len().to_string()),
            ],
            &serde_json::to_vec(&serde_json::json!({"transfer_id":first_id,"workspace_scope":"scope","total_bytes":4,"sha256":small_digest.clone(),"expected_generation":0})).unwrap(),
        );
        let wrong_origin = make_request(
            "POST /api/v1/search/import/begin HTTP/1.1",
            &[
                ("Origin", "https://attacker.example".to_string()),
                ("Content-Type", "application/json".to_string()),
                (IPC_AUTH_HEADER, TEST_IPC_TOKEN.to_string()),
                ("Content-Length", "0".to_string()),
            ],
            &[],
        );
        let oversized = authenticated_origin_json_request(
            "/api/v1/search/import/begin",
            &serde_json::json!({
                "transfer_id": "33332233445566778899aabbccddeeff",
                "workspace_scope": "scope",
                "total_bytes": MAX_SEARCH_TRANSFER_BYTES + 1,
                "sha256": "00".repeat(32),
                "expected_generation": 0,
            }),
        );
        let begin = authenticated_origin_json_request(
            "/api/v1/search/import/begin",
            &serde_json::json!({"transfer_id": first_id,"workspace_scope":"scope","total_bytes":small_data.len(),"sha256":small_digest.clone(),"expected_generation":0}),
        );
        let out_of_order = authenticated_origin_json_request(
            "/api/v1/search/import/chunk",
            &serde_json::json!({"transfer_id":first_id,"chunk_index":1,"data_base64":base64::encode(small_data)}),
        );
        let after_sequence_rejection = authenticated_origin_json_request(
            "/api/v1/search/import/chunk",
            &serde_json::json!({"transfer_id":first_id,"chunk_index":0,"data_base64":base64::encode(small_data)}),
        );
        let abort_begin = authenticated_origin_json_request(
            "/api/v1/search/import/begin",
            &serde_json::json!({"transfer_id":abort_id,"workspace_scope":"scope","total_bytes":small_data.len(),"sha256":small_digest.clone(),"expected_generation":0}),
        );
        let abort = authenticated_origin_json_request(
            "/api/v1/search/transfer/abort",
            &serde_json::json!({"transfer_id":abort_id}),
        );
        let after_abort = authenticated_origin_json_request(
            "/api/v1/search/import/chunk",
            &serde_json::json!({"transfer_id":abort_id,"chunk_index":0,"data_base64":base64::encode(small_data)}),
        );
        let duplicate_begin = authenticated_origin_json_request(
            "/api/v1/search/import/begin",
            &serde_json::json!({"transfer_id":duplicate_id,"workspace_scope":"scope","total_bytes":SEARCH_TRANSFER_CHUNK_BYTES + 1,"sha256":sha256_hex(&vec![0x44; SEARCH_TRANSFER_CHUNK_BYTES + 1]),"expected_generation":0}),
        );
        let first_chunk = authenticated_origin_json_request(
            "/api/v1/search/import/chunk",
            &serde_json::json!({"transfer_id":duplicate_id,"chunk_index":0,"data_base64":base64::encode(&vec![0x44; SEARCH_TRANSFER_CHUNK_BYTES])}),
        );
        let duplicate_chunk = authenticated_origin_json_request(
            "/api/v1/search/import/chunk",
            &serde_json::json!({"transfer_id":duplicate_id,"chunk_index":0,"data_base64":base64::encode(&vec![0x44; SEARCH_TRANSFER_CHUNK_BYTES])}),
        );
        let after_duplicate_rejection = authenticated_origin_json_request(
            "/api/v1/search/import/chunk",
            &serde_json::json!({"transfer_id":duplicate_id,"chunk_index":1,"data_base64":base64::encode(&[0x44])}),
        );
        let stale_begin = authenticated_origin_json_request(
            "/api/v1/search/import/begin",
            &serde_json::json!({"transfer_id":stale_id,"workspace_scope":"scope","total_bytes":small_data.len(),"sha256":small_digest.clone(),"expected_generation":0}),
        );
        let stale_chunk = authenticated_origin_json_request(
            "/api/v1/search/import/chunk",
            &serde_json::json!({"transfer_id":stale_id,"chunk_index":0,"data_base64":base64::encode(small_data)}),
        );
        let generation_change = authenticated_origin_json_request(
            "/api/v1/search/preferences",
            &serde_json::to_value(vgt_search::SearchPreferences::default()).unwrap(),
        );
        let stale_finalize = authenticated_origin_json_request(
            "/api/v1/search/import/finalize",
            &serde_json::json!({"transfer_id":stale_id}),
        );
        let responses = loopback_requests_with_unlocked_vault(vec![
            unauthorized,
            wrong_origin,
            begin,
            out_of_order,
            after_sequence_rejection,
            oversized,
            abort_begin,
            abort,
            after_abort,
            duplicate_begin,
            first_chunk,
            duplicate_chunk,
            after_duplicate_rejection,
            stale_begin,
            stale_chunk,
            generation_change,
            stale_finalize,
        ]);
        let status_codes: Vec<_> = responses
            .iter()
            .map(|response| status_code(response))
            .collect();
        assert_eq!(
            status_codes,
            [
                Some(401),
                Some(403),
                Some(200),
                Some(409),
                Some(404),
                Some(413),
                Some(200),
                Some(200),
                Some(404),
                Some(200),
                Some(200),
                Some(409),
                Some(404),
                Some(200),
                Some(200),
                Some(200),
                Some(409)
            ]
        );
        assert_eq!(response_json(&responses[7])["aborted"], true);
        assert_eq!(
            response_error(&responses[16]).as_deref(),
            Some("Search transfer generation is stale")
        );
    }

    #[test]
    fn search_chunk_body_ceiling_is_exact_and_auth_precedes_size_rejection() {
        assert_eq!(SEARCH_TRANSFER_CHUNK_BYTES, 131_070);
        assert_eq!(MAX_SEARCH_TRANSFER_CHUNK_BASE64_BYTES, 174_760);
        assert_eq!(MAX_SEARCH_TRANSFER_REQUEST_BYTES, 175_784);
        assert_eq!(
            search_transfer_request_body_limit("/api/v1/search/import/chunk"),
            Some(MAX_SEARCH_TRANSFER_REQUEST_BYTES)
        );

        let max_chunk = base64::encode(&vec![0x5a; SEARCH_TRANSFER_CHUNK_BYTES]);
        assert_eq!(max_chunk.len(), MAX_SEARCH_TRANSFER_CHUNK_BASE64_BYTES);
        let max_chunk_request = authenticated_origin_json_request(
            "/api/v1/search/import/chunk",
            &serde_json::json!({
                "transfer_id": "00112233445566778899aabbccddeeff",
                "chunk_index": 0,
                "data_base64": max_chunk,
            }),
        );

        let oversized_payload_request = authenticated_origin_json_request(
            "/api/v1/search/import/chunk",
            &serde_json::json!({
                "transfer_id": "00112233445566778899aabbccddeeff",
                "chunk_index": 0,
                "data_base64": "A".repeat(MAX_SEARCH_TRANSFER_CHUNK_BASE64_BYTES + 1),
            }),
        );
        let endpoint_limit_plus_one = MAX_SEARCH_TRANSFER_REQUEST_BYTES + 1;
        let endpoint_oversize = make_request(
            "POST /api/v1/search/import/chunk HTTP/1.1",
            &[
                ("Origin", "http://tauri.localhost".to_string()),
                ("Content-Type", "application/json".to_string()),
                (IPC_AUTH_HEADER, TEST_IPC_TOKEN.to_string()),
                ("Content-Length", endpoint_limit_plus_one.to_string()),
            ],
            &[],
        );
        let unauthorized_oversize = make_request(
            "POST /api/v1/search/import/chunk HTTP/1.1",
            &[
                ("Origin", "http://tauri.localhost".to_string()),
                ("Content-Type", "application/json".to_string()),
                ("Content-Length", endpoint_limit_plus_one.to_string()),
            ],
            &[],
        );

        let responses = loopback_requests_with_unlocked_vault(vec![
            max_chunk_request,
            oversized_payload_request,
            endpoint_oversize,
            unauthorized_oversize,
        ]);
        assert_eq!(
            responses
                .iter()
                .map(|response| status_code(response))
                .collect::<Vec<_>>(),
            [Some(404), Some(413), Some(413), Some(401)]
        );
        assert_eq!(
            response_error(&responses[1]).as_deref(),
            Some("Search import chunk exceeds ceiling")
        );
        assert_eq!(
            response_error(&responses[2]).as_deref(),
            Some("Request body exceeds endpoint ceiling")
        );
        assert_eq!(
            response_error(&responses[3]).as_deref(),
            Some("IPC authorization required")
        );
    }

    #[test]
    fn netgate_request_body_limit_accepts_exact_maximum_and_rejects_max_plus_one() {
        assert!(!request_body_exceeds_limit(MAX_REQUEST_BODY));
        assert!(request_body_exceeds_limit(MAX_REQUEST_BODY + 1));
    }

    #[test]
    fn netgate_evaluate_uses_typed_json_deserialization_and_policy_validation_for_4096_mutations() {
        const CASES: usize = 4_096;
        const BODY_CASE_LIMIT: usize = 16 * 1024;

        #[derive(Clone, Copy, Debug)]
        enum Expected {
            Allowed,
            BlockedByDefault,
            BlockedResourceLimit,
            InvalidJson,
        }

        fn mutation(index: usize) -> (Vec<u8>, Expected) {
            let mut value = serde_json::json!({
                "target_host": format!("netgate-{index}.example.test"),
                "target_port": 443,
                "purpose": format!("mutation-{index}"),
                "capability": "FullUserApproved",
                "component_id": format!("workspace-{index}"),
                "document_id": format!("document-{index}"),
                "automation_id": format!("automation-{index}"),
                "method": "GET",
                "expected_request_bytes": 0,
                "expected_response_bytes": 4_096,
                "timeout_ms": 3_000,
                "mutation_case": index,
            });
            let object = value.as_object_mut().expect("request object fixture");
            let expected = match index % 32 {
                0 => Expected::Allowed,
                1 => {
                    object.insert(
                        "target_host".into(),
                        serde_json::json!(format!("NETGATE-{index}.EXAMPLE.TEST.")),
                    );
                    object.insert("method".into(), serde_json::json!("get"));
                    Expected::Allowed
                }
                2 => {
                    for field in [
                        "component_id",
                        "document_id",
                        "automation_id",
                        "method",
                        "expected_request_bytes",
                        "expected_response_bytes",
                        "timeout_ms",
                    ] {
                        object.remove(field);
                    }
                    Expected::Allowed
                }
                3 => {
                    object.insert("capability".into(), serde_json::json!("future-capability"));
                    Expected::BlockedByDefault
                }
                4 => {
                    object.insert("component_id".into(), serde_json::json!("c".repeat(128)));
                    Expected::Allowed
                }
                5 => {
                    object.insert("component_id".into(), serde_json::json!("c".repeat(129)));
                    Expected::BlockedByDefault
                }
                6 => {
                    object.insert("purpose".into(), serde_json::json!("p".repeat(512)));
                    Expected::Allowed
                }
                7 => {
                    object.insert("purpose".into(), serde_json::json!("p".repeat(513)));
                    Expected::BlockedByDefault
                }
                8 => {
                    object.insert("document_id".into(), serde_json::json!("d".repeat(192)));
                    Expected::Allowed
                }
                9 => {
                    object.insert("document_id".into(), serde_json::json!("d".repeat(193)));
                    Expected::BlockedByDefault
                }
                10 => {
                    object.insert("automation_id".into(), serde_json::json!("a".repeat(192)));
                    Expected::Allowed
                }
                11 => {
                    object.insert("automation_id".into(), serde_json::json!("a".repeat(193)));
                    Expected::BlockedByDefault
                }
                12 => {
                    object.insert(
                        "target_host".into(),
                        serde_json::json!(format!(
                            "{}.{}.{}.{}",
                            "a".repeat(63),
                            "b".repeat(63),
                            "c".repeat(63),
                            "d".repeat(61)
                        )),
                    );
                    Expected::Allowed
                }
                13 => {
                    object.insert(
                        "target_host".into(),
                        serde_json::json!(format!(
                            "{}.{}.{}.{}",
                            "a".repeat(63),
                            "b".repeat(63),
                            "c".repeat(63),
                            "d".repeat(62)
                        )),
                    );
                    Expected::BlockedByDefault
                }
                14 => {
                    object.insert("target_port".into(), serde_json::json!(0));
                    Expected::BlockedByDefault
                }
                15 => {
                    object.insert("method".into(), serde_json::json!("TRACE"));
                    Expected::BlockedByDefault
                }
                16 => {
                    object.insert(
                        "expected_request_bytes".into(),
                        serde_json::json!(512 * 1024 * 1024u64),
                    );
                    Expected::BlockedResourceLimit
                }
                17 => {
                    object.insert(
                        "expected_request_bytes".into(),
                        serde_json::json!(512 * 1024 * 1024u64 + 1),
                    );
                    Expected::BlockedByDefault
                }
                18 => {
                    object.insert(
                        "expected_response_bytes".into(),
                        serde_json::json!(1024 * 1024 * 1024u64),
                    );
                    Expected::BlockedResourceLimit
                }
                19 => {
                    object.insert(
                        "expected_response_bytes".into(),
                        serde_json::json!(1024 * 1024 * 1024u64 + 1),
                    );
                    Expected::BlockedByDefault
                }
                20 => {
                    object.insert("timeout_ms".into(), serde_json::json!(120_000));
                    Expected::BlockedResourceLimit
                }
                21 => {
                    object.insert("timeout_ms".into(), serde_json::json!(120_001));
                    Expected::BlockedByDefault
                }
                22 => {
                    object.insert(
                        "target_host".into(),
                        serde_json::json!(format!("netgate-{index}.example/path")),
                    );
                    Expected::BlockedByDefault
                }
                23 => {
                    object.insert(
                        "purpose".into(),
                        serde_json::json!(format!("invalid\rpurpose-{index}")),
                    );
                    Expected::BlockedByDefault
                }
                24 => {
                    object.insert("target_port".into(), serde_json::json!("443"));
                    Expected::InvalidJson
                }
                25 => {
                    object.remove("target_host");
                    Expected::InvalidJson
                }
                26 => {
                    object.insert("capability".into(), serde_json::Value::Null);
                    Expected::InvalidJson
                }
                27 => {
                    let body = format!(
                        "{{\"target_host\":\"netgate-{index}.example.test\",\"target_host\":\"netgate-{index}.example.test\",\"target_port\":443,\"purpose\":\"mutation-{index}\",\"capability\":\"FullUserApproved\"}}"
                    );
                    return (body.into_bytes(), Expected::InvalidJson);
                }
                28 => {
                    object.insert("document_id".into(), serde_json::json!([]));
                    Expected::InvalidJson
                }
                29 => {
                    object.insert("expected_request_bytes".into(), serde_json::json!(-1));
                    Expected::InvalidJson
                }
                30 => {
                    object.insert("timeout_ms".into(), serde_json::json!(3.5));
                    Expected::InvalidJson
                }
                _ => {
                    return (
                        format!(
                            "{{\"target_host\":\"netgate-{index}.example.test\",\"target_port\":443,\"purpose\":\"mutation-{index}\",\"capability\":\"FullUserApproved\""
                        )
                        .into_bytes(),
                        Expected::InvalidJson,
                    );
                }
            };
            (
                serde_json::to_vec(&value).expect("serialize bounded mutation"),
                expected,
            )
        }

        let mut outcomes = [0usize; 4];
        let mut unique_bodies = std::collections::HashSet::with_capacity(CASES);
        for index in 0..CASES {
            let (body, expected) = mutation(index);
            assert!(
                body.len() <= BODY_CASE_LIMIT,
                "case {index} exceeded its byte cap"
            );
            assert!(
                unique_bodies.insert(body.clone()),
                "case {index} duplicated a JSON body"
            );
            let response = evaluate_netgate_request(&body);
            match expected {
                Expected::InvalidJson => {
                    outcomes[3] += 1;
                    assert!(response.is_err(), "case {index} accepted invalid JSON");
                }
                Expected::Allowed | Expected::BlockedByDefault | Expected::BlockedResourceLimit => {
                    let body = response.expect("typed JSON and policy preview accepted");
                    assert_eq!(body["preview_only"], true, "case {index}");
                    match expected {
                        Expected::Allowed => {
                            outcomes[0] += 1;
                            assert_eq!(body["verdict"], "Allowed", "case {index}");
                        }
                        Expected::BlockedByDefault => {
                            outcomes[1] += 1;
                            assert_eq!(body["verdict"], "BlockedByDefault", "case {index}");
                        }
                        Expected::BlockedResourceLimit => {
                            outcomes[2] += 1;
                            assert_eq!(body["verdict"], "BlockedResourceLimit", "case {index}");
                        }
                        Expected::InvalidJson => unreachable!(),
                    }
                    if index % 32 == 1 {
                        assert_eq!(body["target_host"], format!("netgate-{index}.example.test"));
                    }
                    if index % 32 == 2 {
                        assert_eq!(body["component_id"], "workspace-shell");
                        assert_eq!(body["document_id"], serde_json::Value::Null);
                        assert_eq!(body["automation_id"], serde_json::Value::Null);
                    }
                    if index % 32 == 3 {
                        assert_eq!(body["capability"], "None");
                    }
                }
            }
        }
        assert_eq!(unique_bodies.len(), CASES);

        // Keep a small HTTP-boundary sample; the 4,096 hostile cases above exercise the
        // exact production parser/evaluator without exhausting Windows ephemeral ports.
        let http_samples = [0usize, 3, 16, 24]
            .into_iter()
            .map(|index| {
                let (body, _) = mutation(index);
                authenticated_json_request("/api/v1/netgate/evaluate", &body)
            })
            .collect();
        let responses = loopback_requests(http_samples, true);
        assert_eq!(
            responses
                .iter()
                .map(|response| status_code(response))
                .collect::<Vec<_>>(),
            [Some(200), Some(200), Some(200), Some(400)]
        );
        for response in responses.iter().take(3) {
            assert_eq!(response_json(response)["preview_only"], true);
        }
        assert_eq!(
            response_error(&responses[3]).as_deref(),
            Some("Invalid JSON")
        );
        assert_eq!(outcomes, [1_024, 1_664, 384, 1_024]);
        assert_eq!(outcomes.iter().sum::<usize>(), CASES);
    }

    #[test]
    fn authenticated_unpack_json_schema_rejects_4096_deterministic_bodies() {
        const CASES: usize = 4_096;
        for index in 0..CASES {
            let body = match index % 8 {
                0 => format!("{{\"container_base64\":{index}"),
                1 => "{".to_string(),
                2 => "null".to_string(),
                3 => "[]".to_string(),
                4 => "{}".to_string(),
                5 => format!("{{\"container_base64\":{index}}}"),
                6 => format!("{{\"container_base64\":\"AA==\",\"pin\":false,\"marker\":{index}}}"),
                _ => "{\"container_base64\":\"AA==\",\"container_base64\":\"AA==\"}".to_string(),
            };
            assert!(
                serde_json::from_slice::<UnpackRequest>(body.as_bytes()).is_err(),
                "case {index} unexpectedly passed the production unpack schema"
            );
        }

        let response = loopback_requests(
            vec![authenticated_json_request("/api/v1/container/unpack", b"{")],
            true,
        )
        .pop()
        .expect("one production unpack response");
        assert_eq!(status_code(&response), Some(400));
        assert_eq!(
            response_error(&response).as_deref(),
            Some("Invalid JSON request body")
        );
    }
}
