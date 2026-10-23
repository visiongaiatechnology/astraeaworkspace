//! Astraea PDF Studio native utility bridge.
//!
//! Optional transforms that cannot be implemented safely in a browser are exposed here behind
//! bounded byte IPC. Providers are discovered locally and fail closed when unavailable.

use crate::converter_jail::{
    create_private_converter_jail, jail_leaf, require_existing_path_in_jail,
};
use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

const MAX_PDF_BYTES: usize = 128 * 1024 * 1024;
const PROCESS_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Serialize)]
pub struct PdfLinearizationStatusResponse {
    available: bool,
    provider: String,
    reason: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PdfLinearizeRequest {
    bytes: Vec<u8>,
}

#[derive(Serialize)]
pub struct PdfLinearizeResponse {
    success: bool,
    provider: String,
    bytes: Option<Vec<u8>>,
    error: Option<String>,
}

fn candidate_ghostscript_bins() -> &'static [&'static str] {
    #[cfg(target_os = "windows")]
    {
        &["gswin64c.exe", "gswin32c.exe"]
    }
    #[cfg(not(target_os = "windows"))]
    {
        &["gs"]
    }
}

fn command_succeeds(binary: &str, args: &[&str]) -> bool {
    Command::new(binary)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

fn find_ghostscript() -> Option<String> {
    candidate_ghostscript_bins()
        .iter()
        .find(|binary| command_succeeds(binary, &["--version"]))
        .map(|binary| (*binary).to_string())
}

fn temp_job_dir() -> Result<PathBuf, String> {
    create_private_converter_jail("pdf-linearize")
}

fn write_private_input(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options
        .open(path)
        .map_err(|_| "Could not create isolated PDF transform input".to_string())?;
    file.write_all(bytes)
        .and_then(|_| file.sync_all())
        .map_err(|_| "Could not persist isolated PDF transform input".to_string())
}

fn looks_encrypted_pdf(bytes: &[u8]) -> bool {
    bytes.windows(8).any(|window| window == b"/Encrypt")
}

fn looks_linearized_pdf(bytes: &[u8]) -> bool {
    let sample = &bytes[..bytes.len().min(8192)];
    sample.windows(11).any(|window| window == b"/Linearized")
}

fn run_ghostscript_linearization(binary: &str, input: &Path, output: &Path) -> Result<(), String> {
    let jail = input
        .parent()
        .ok_or_else(|| "Fast Web View jail is invalid".to_string())?
        .canonicalize()
        .map_err(|_| "Fast Web View jail is invalid".to_string())?;
    require_existing_path_in_jail(&jail, input)?;
    if output.parent() != Some(jail.as_path()) {
        return Err("Fast Web View output escaped its jail".to_string());
    }
    let mut child = Command::new(binary)
        .current_dir(&jail)
        .args([
            "-q",
            "-dSAFER",
            "-dBATCH",
            "-dNOPAUSE",
            "-sDEVICE=pdfwrite",
            "-dCompatibilityLevel=1.7",
            "-dFastWebView=true",
            "-dDetectDuplicateImages=true",
            "-dWriteObjStms=false",
            "-dWriteXRefStm=false",
            "-sOutputFile=output.pdf",
            "input.pdf",
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| "Fast Web View provider could not be started".to_string())?;

    let started = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) if status.success() => return Ok(()),
            Ok(Some(_)) => return Err("Fast Web View provider rejected the PDF".to_string()),
            Ok(None) if started.elapsed() < PROCESS_TIMEOUT => {
                thread::sleep(Duration::from_millis(25))
            }
            Ok(None) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(
                    "Fast Web View provider exceeded the 30 second execution budget".to_string(),
                );
            }
            Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err("Fast Web View provider status could not be read".to_string());
            }
        }
    }
}

#[tauri::command]
pub fn vgt_pdf_linearization_status() -> PdfLinearizationStatusResponse {
    match find_ghostscript() {
        Some(binary) => PdfLinearizationStatusResponse {
            available: true,
            provider: format!("Ghostscript pdfwrite ({binary})"),
            reason: "Native Fast Web View provider is available".to_string(),
        },
        None => PdfLinearizationStatusResponse {
            available: false,
            provider: "Unavailable".to_string(),
            reason: "Ghostscript pdfwrite is not installed on this host; Astraea will not fake PDF linearization".to_string(),
        },
    }
}

#[tauri::command]
pub fn vgt_pdf_linearize(request: PdfLinearizeRequest) -> PdfLinearizeResponse {
    let provider = match find_ghostscript() {
        Some(provider) => provider,
        None => {
            return PdfLinearizeResponse {
                success: false,
                provider: "Unavailable".to_string(),
                bytes: None,
                error: Some("Fast Web View provider is unavailable".to_string()),
            }
        }
    };

    let result = (|| -> Result<Vec<u8>, String> {
        if request.bytes.is_empty() || request.bytes.len() > MAX_PDF_BYTES {
            return Err("PDF exceeds the native Fast Web View byte policy".to_string());
        }
        if !request.bytes.starts_with(b"%PDF-") {
            return Err("Fast Web View input is not a PDF".to_string());
        }
        if looks_encrypted_pdf(&request.bytes) {
            return Err(
                "Encrypted PDFs must be decrypted before Fast Web View linearization".to_string(),
            );
        }
        let dir = temp_job_dir()?;
        let input = jail_leaf(&dir, "input.pdf")?;
        let output = jail_leaf(&dir, "output.pdf")?;
        let operation = (|| -> Result<Vec<u8>, String> {
            write_private_input(&input, &request.bytes)?;
            run_ghostscript_linearization(&provider, &input, &output)?;
            require_existing_path_in_jail(&dir, &output)?;
            let metadata = fs::metadata(&output)
                .map_err(|_| "Fast Web View provider did not create output".to_string())?;
            if metadata.len() == 0 || metadata.len() > MAX_PDF_BYTES as u64 {
                return Err("Fast Web View output violates the PDF byte policy".to_string());
            }
            let bytes = fs::read(&output)
                .map_err(|_| "Fast Web View output could not be read".to_string())?;
            if !bytes.starts_with(b"%PDF-") || !looks_linearized_pdf(&bytes) {
                return Err(
                    "Fast Web View output failed the linearization boundary check".to_string(),
                );
            }
            Ok(bytes)
        })();
        let _ = fs::remove_file(&input);
        let _ = fs::remove_file(&output);
        let _ = fs::remove_dir(&dir);
        operation
    })();

    match result {
        Ok(bytes) => PdfLinearizeResponse {
            success: true,
            provider: format!("Ghostscript pdfwrite ({provider})"),
            bytes: Some(bytes),
            error: None,
        },
        Err(error) => PdfLinearizeResponse {
            success: false,
            provider: format!("Ghostscript pdfwrite ({provider})"),
            bytes: None,
            error: Some(error),
        },
    }
}
