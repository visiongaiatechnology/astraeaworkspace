//! Astraea PDF Studio native signing bridge.
//!
//! Private keys never cross IPC. Windows uses the CurrentUser certificate store, which also
//! covers CSP/KSP/smartcard-backed keys. Linux/macOS can use an administrator-configured
//! OpenSSL 3 PKCS#11 provider. Provider absence is reported explicitly and never emulated.

use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

const MAX_IDENTITIES: usize = 256;
const MAX_SIGN_INPUT_BYTES: usize = 64 * 1024;
const MAX_PROVIDER_OUTPUT_BYTES: usize = 4 * 1024 * 1024;
const PROCESS_TIMEOUT: Duration = Duration::from_secs(20);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NativePdfSigningIdentity {
    pub id: String,
    pub label: String,
    pub source: String,
    pub algorithm: String,
    #[serde(rename = "certificateDerBase64")]
    pub certificate_der_base64: String,
    #[serde(rename = "chainDerBase64")]
    pub chain_der_base64: Vec<String>,
    #[serde(rename = "hardwareBacked")]
    pub hardware_backed: bool,
}

#[derive(Serialize)]
pub struct NativePdfSigningIdentityListResponse {
    available: bool,
    provider: String,
    reason: String,
    identities: Vec<NativePdfSigningIdentity>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct NativePdfSignRequest {
    pub identity_id: String,
    pub data_base64: String,
}

#[derive(Serialize)]
pub struct NativePdfSignResponse {
    success: bool,
    #[serde(rename = "signatureBase64")]
    signature_base64: Option<String>,
    error: Option<String>,
}

fn run_bounded_command(mut command: Command, stdin: Option<&[u8]>) -> Result<Vec<u8>, String> {
    command.stdin(if stdin.is_some() {
        Stdio::piped()
    } else {
        Stdio::null()
    });
    command.stdout(Stdio::piped()).stderr(Stdio::null());
    let mut child = command
        .spawn()
        .map_err(|_| "Native signing provider could not be started".to_string())?;
    if let Some(bytes) = stdin {
        let mut pipe = child
            .stdin
            .take()
            .ok_or_else(|| "Native signing provider input is unavailable".to_string())?;
        pipe.write_all(bytes)
            .map_err(|_| "Native signing provider input failed".to_string())?;
    }
    let mut stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Native signing provider output is unavailable".to_string())?;
    let reader = thread::spawn(move || {
        let mut bytes = Vec::new();
        stdout
            .by_ref()
            .take((MAX_PROVIDER_OUTPUT_BYTES + 1) as u64)
            .read_to_end(&mut bytes)
            .map(|_| bytes)
    });
    let started = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let output = reader
                    .join()
                    .map_err(|_| "Native signing provider output reader failed".to_string())?
                    .map_err(|_| "Native signing provider output failed".to_string())?;
                if !status.success() {
                    return Err("Native signing provider rejected the operation".to_string());
                }
                if output.len() > MAX_PROVIDER_OUTPUT_BYTES {
                    return Err("Native signing provider output exceeded policy".to_string());
                }
                return Ok(output);
            }
            Ok(None) if started.elapsed() < PROCESS_TIMEOUT => {
                thread::sleep(Duration::from_millis(25))
            }
            Ok(None) => {
                let _ = child.kill();
                let _ = child.wait();
                let _ = reader.join();
                return Err("Native signing provider exceeded the execution budget".to_string());
            }
            Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
                let _ = reader.join();
                return Err("Native signing provider status failed".to_string());
            }
        }
    }
}

#[cfg(target_os = "windows")]
fn windows_identities() -> Result<Vec<NativePdfSigningIdentity>, String> {
    const SCRIPT: &str = r#"$ErrorActionPreference='Stop'; $items=@(); Get-ChildItem Cert:\CurrentUser\My | Where-Object {$_.HasPrivateKey} | Select-Object -First 256 | ForEach-Object { $alg=$_.PublicKey.Oid.FriendlyName; if($alg -match 'RSA'){ $kind='RSA' } elseif($alg -match 'ECC|ECDSA'){ $kind='ECDSA' } else { return }; $chain=New-Object System.Security.Cryptography.X509Certificates.X509Chain; [void]$chain.Build($_); $chainDer=@(); foreach($el in $chain.ChainElements){$chainDer += [Convert]::ToBase64String($el.Certificate.RawData)}; $hardware=$false; try { $rsa=$_.GetRSAPrivateKey(); if($rsa -and $rsa.Key -and $rsa.Key.CspKeyContainerInfo){$hardware=$rsa.Key.CspKeyContainerInfo.HardwareDevice} } catch {}; $items += [pscustomobject]@{id=('win:'+($_.Thumbprint.ToUpperInvariant()));label=($_.Subject);source='windows-cert-store';algorithm=$kind;certificateDerBase64=[Convert]::ToBase64String($_.RawData);chainDerBase64=$chainDer;hardwareBacked=$hardware} }; $items | ConvertTo-Json -Compress -Depth 6"#;
    let mut command = Command::new("powershell.exe");
    // Round 41: never flash a console window while the packaged application talks to PowerShell.
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command.args([
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        SCRIPT,
    ]);
    let output = run_bounded_command(command, None)?;
    if output.is_empty() {
        return Ok(Vec::new());
    }
    let value: serde_json::Value = serde_json::from_slice(&output)
        .map_err(|_| "Windows certificate inventory returned invalid JSON".to_string())?;
    let values = match value {
        serde_json::Value::Array(values) => values,
        other => vec![other],
    };
    values
        .into_iter()
        .take(MAX_IDENTITIES)
        .map(|entry| {
            serde_json::from_value(entry).map_err(|_| {
                "Windows certificate inventory contained an invalid identity".to_string()
            })
        })
        .collect()
}

#[cfg(target_os = "windows")]
fn windows_sign(identity_id: &str, data_base64: &str) -> Result<String, String> {
    let thumbprint = identity_id
        .strip_prefix("win:")
        .ok_or_else(|| "Invalid Windows signing identity".to_string())?;
    if thumbprint.len() > 128 || !thumbprint.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err("Invalid Windows signing identity".to_string());
    }
    const SCRIPT: &str = r#"$ErrorActionPreference='Stop'; $thumb=$env:VGT_SIGN_THUMB; $data=[Convert]::FromBase64String($env:VGT_SIGN_DATA); $cert=Get-ChildItem Cert:\CurrentUser\My | Where-Object {$_.Thumbprint -eq $thumb -and $_.HasPrivateKey} | Select-Object -First 1; if(!$cert){throw 'identity unavailable'}; $sig=$null; $rsa=$cert.GetRSAPrivateKey(); if($rsa){$sig=$rsa.SignData($data,[Security.Cryptography.HashAlgorithmName]::SHA256,[Security.Cryptography.RSASignaturePadding]::Pkcs1)} else { $ecdsa=$cert.GetECDsaPrivateKey(); if(!$ecdsa){throw 'unsupported key algorithm'}; try {$sig=$ecdsa.SignData($data,[Security.Cryptography.HashAlgorithmName]::SHA256,[Security.Cryptography.DSASignatureFormat]::Rfc3279DerSequence)} catch {throw 'ECDSA provider does not expose DER signing on this runtime'} }; [Console]::Out.Write([Convert]::ToBase64String($sig))"#;
    let mut command = Command::new("powershell.exe");
    // Round 41: never flash a console window while the packaged application talks to PowerShell.
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command.args([
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        SCRIPT,
    ]);
    command
        .env("VGT_SIGN_THUMB", thumbprint)
        .env("VGT_SIGN_DATA", data_base64);
    let output = run_bounded_command(command, None)?;
    String::from_utf8(output)
        .map(|value| value.trim().to_string())
        .map_err(|_| "Windows signing provider returned invalid output".to_string())
}

fn openssl_pkcs11_identity() -> Result<Option<NativePdfSigningIdentity>, String> {
    let provider = match std::env::var("VGT_PKCS11_OPENSSL_PROVIDER") {
        Ok(value) if !value.trim().is_empty() => value,
        _ => return Ok(None),
    };
    let key_uri = std::env::var("VGT_PKCS11_KEY_URI")
        .map_err(|_| "PKCS#11 key URI is not configured".to_string())?;
    let cert_b64 = std::env::var("VGT_PKCS11_CERT_DER_B64")
        .map_err(|_| "PKCS#11 certificate is not configured".to_string())?;
    if key_uri.len() > 4096
        || !key_uri.starts_with("pkcs11:")
        || key_uri.to_ascii_lowercase().contains("pin-value=")
    {
        return Err("PKCS#11 URI violates credential policy".to_string());
    }
    if provider.len() > 128
        || !provider
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'_' | b'-' | b'.'))
    {
        return Err("PKCS#11 provider name is invalid".to_string());
    }
    let label = std::env::var("VGT_PKCS11_LABEL")
        .unwrap_or_else(|_| "PKCS#11 signing identity".to_string());
    let algorithm = match std::env::var("VGT_PKCS11_ALGORITHM")
        .unwrap_or_else(|_| "RSA".to_string())
        .to_ascii_uppercase()
        .as_str()
    {
        "RSA" => "RSA",
        "ECDSA" => "ECDSA",
        _ => return Err("PKCS#11 algorithm is unsupported".to_string()),
    };
    let id = format!(
        "pkcs11:{provider}:{}",
        std::env::var("VGT_PKCS11_ID").unwrap_or_else(|_| "configured".to_string())
    );
    // PKCS#11 is an API, not proof that the token is physical hardware. Never claim
    // hardware-backed custody unless the administrator explicitly attests that property.
    let hardware_backed = match std::env::var("VGT_PKCS11_HARDWARE_BACKED") {
        Ok(value) if value.eq_ignore_ascii_case("true") => true,
        Ok(value) if value.eq_ignore_ascii_case("false") || value.trim().is_empty() => false,
        Ok(_) => {
            return Err("PKCS#11 hardware-backed attestation must be true or false".to_string())
        }
        Err(_) => false,
    };
    Ok(Some(NativePdfSigningIdentity {
        id,
        label: label.chars().take(512).collect(),
        source: "pkcs11".to_string(),
        algorithm: algorithm.to_string(),
        certificate_der_base64: cert_b64,
        chain_der_base64: Vec::new(),
        hardware_backed,
    }))
}

fn openssl_pkcs11_sign(identity_id: &str, data_base64: &str) -> Result<String, String> {
    let provider = std::env::var("VGT_PKCS11_OPENSSL_PROVIDER")
        .map_err(|_| "PKCS#11 provider is unavailable".to_string())?;
    if !identity_id.starts_with(&format!("pkcs11:{provider}:")) {
        return Err("PKCS#11 identity does not match the configured provider".to_string());
    }
    let key_uri = std::env::var("VGT_PKCS11_KEY_URI")
        .map_err(|_| "PKCS#11 key URI is unavailable".to_string())?;
    if key_uri.to_ascii_lowercase().contains("pin-value=") {
        return Err("Inline PKCS#11 PIN values are forbidden".to_string());
    }
    let input = crate::decode_base64(data_base64)
        .map_err(|_| "Native signing payload is invalid base64".to_string())?;
    if input.is_empty() || input.len() > MAX_SIGN_INPUT_BYTES {
        return Err("Native signing payload exceeds policy".to_string());
    }
    let mut command = Command::new("openssl");
    command.args([
        "dgst",
        "-sha256",
        "-provider",
        "default",
        "-provider",
        &provider,
        "-sign",
        &key_uri,
        "-binary",
    ]);
    let signature = run_bounded_command(command, Some(&input))?;
    if signature.is_empty() || signature.len() > 64 * 1024 {
        return Err("PKCS#11 signature violates policy".to_string());
    }
    Ok(crate::encode_base64(&signature))
}

#[tauri::command]
pub fn vgt_pdf_signing_identities() -> NativePdfSigningIdentityListResponse {
    let mut identities = Vec::new();
    let mut providers = Vec::new();
    #[cfg(target_os = "windows")]
    if let Ok(mut values) = windows_identities() {
        if !values.is_empty() {
            providers.push("Windows CurrentUser\\My".to_string());
            identities.append(&mut values);
        }
    }
    if let Ok(Some(identity)) = openssl_pkcs11_identity() {
        providers.push("OpenSSL PKCS#11".to_string());
        identities.push(identity);
    }
    identities.truncate(MAX_IDENTITIES);
    NativePdfSigningIdentityListResponse {
        available: !identities.is_empty(),
        provider: if providers.is_empty() {
            "Unavailable".to_string()
        } else {
            providers.join(" + ")
        },
        reason: if identities.is_empty() {
            "No OS-keystore or configured PKCS#11 signing identity is available; Astraea will not synthesize one".to_string()
        } else {
            "Native private-key signing identities are available".to_string()
        },
        identities,
    }
}

#[tauri::command]
pub fn vgt_pdf_signing_sign(request: NativePdfSignRequest) -> NativePdfSignResponse {
    if request.identity_id.is_empty()
        || request.identity_id.len() > 512
        || request.data_base64.is_empty()
        || request.data_base64.len() > 128 * 1024
    {
        return NativePdfSignResponse {
            success: false,
            signature_base64: None,
            error: Some("Native signing request violates policy".to_string()),
        };
    }
    let result = if request.identity_id.starts_with("win:") {
        #[cfg(target_os = "windows")]
        {
            windows_sign(&request.identity_id, &request.data_base64)
        }
        #[cfg(not(target_os = "windows"))]
        {
            Err("Windows certificate-store identity is unavailable on this platform".to_string())
        }
    } else if request.identity_id.starts_with("pkcs11:") {
        openssl_pkcs11_sign(&request.identity_id, &request.data_base64)
    } else {
        Err("Unknown native signing identity".to_string())
    };
    match result {
        Ok(signature_base64) => NativePdfSignResponse {
            success: true,
            signature_base64: Some(signature_base64),
            error: None,
        },
        Err(error) => NativePdfSignResponse {
            success: false,
            signature_base64: None,
            error: Some(error),
        },
    }
}
