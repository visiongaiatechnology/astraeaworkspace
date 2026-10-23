// STATUS: DIAMANT VGT SUPREME
//! Bounded local OCR bridge. Tesseract is invoked directly without a shell and no network path exists.

use crate::converter_jail::{
    create_private_converter_jail, jail_leaf, require_existing_path_in_jail,
};
use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

use crate::decode_base64;

const MAX_OCR_IMAGE_BYTES: usize = 24 * 1024 * 1024;
const MAX_OCR_TSV_BYTES: usize = 24 * 1024 * 1024;
const MAX_OCR_LANGUAGES: usize = 256;
const MAX_OCR_LANGUAGE_LEN: usize = 64;
const OCR_TIMEOUT: Duration = Duration::from_secs(45);
const OCR_POLL_INTERVAL: Duration = Duration::from_millis(25);

#[derive(Serialize)]
pub struct OcrLanguagesResponse {
    engine: String,
    engine_version: String,
    languages: Vec<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OcrRecognizeRequest {
    image_base64: String,
    language: String,
    page_segmentation_mode: Option<u8>,
}

#[derive(Serialize)]
pub struct OcrRecognizeResponse {
    engine: String,
    engine_version: String,
    language: String,
    tsv: String,
    processing_time_ms: u128,
}

fn clean_language(value: &str) -> Result<String, String> {
    let language = value.trim();
    if language.is_empty() || language.len() > MAX_OCR_LANGUAGE_LEN {
        return Err("OCR language identifier is invalid".to_string());
    }
    if !language
        .bytes()
        .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'+' | b'.' | b'-'))
    {
        return Err("OCR language identifier contains unsupported characters".to_string());
    }
    Ok(language.to_string())
}

fn clean_psm(value: Option<u8>) -> Result<u8, String> {
    let psm = value.unwrap_or(6);
    if matches!(psm, 3 | 4 | 6 | 11 | 12 | 13) {
        Ok(psm)
    } else {
        Err("OCR page segmentation mode is not allowed".to_string())
    }
}

fn tesseract_version() -> Result<String, String> {
    let output = Command::new("tesseract")
        .arg("--version")
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .output()
        .map_err(|_| "Local Tesseract OCR engine is unavailable".to_string())?;
    if !output.status.success() {
        return Err("Local Tesseract OCR engine did not report a version".to_string());
    }
    let first = String::from_utf8_lossy(&output.stdout)
        .lines()
        .next()
        .unwrap_or("tesseract")
        .trim()
        .chars()
        .take(128)
        .collect::<String>();
    Ok(first)
}

fn list_languages() -> Result<Vec<String>, String> {
    let output = Command::new("tesseract")
        .arg("--list-langs")
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .output()
        .map_err(|_| "Local Tesseract OCR engine is unavailable".to_string())?;
    if !output.status.success() || output.stdout.len() > 512 * 1024 {
        return Err("Local OCR language inventory failed".to_string());
    }
    let mut languages = String::from_utf8_lossy(&output.stdout)
        .lines()
        .skip(1)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .filter_map(|value| clean_language(value).ok())
        .take(MAX_OCR_LANGUAGES)
        .collect::<Vec<_>>();
    languages.sort();
    languages.dedup();
    Ok(languages)
}

fn safe_cache_paths(
    _app: &tauri::AppHandle,
    image_bytes: &[u8],
) -> Result<
    (
        std::path::PathBuf,
        std::path::PathBuf,
        std::path::PathBuf,
        std::path::PathBuf,
    ),
    String,
> {
    let _ = image_bytes;
    let root = create_private_converter_jail("ocr")?;
    let input = jail_leaf(&root, "input.jpg")?;
    let output_base = jail_leaf(&root, "result")?;
    let tsv = jail_leaf(&root, "result.tsv")?;
    Ok((root, input, output_base, tsv))
}

fn write_private_image(path: &std::path::Path, bytes: &[u8]) -> Result<(), String> {
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options
        .open(path)
        .map_err(|_| "OCR temporary image could not be created".to_string())?;
    file.write_all(bytes)
        .map_err(|_| "OCR temporary image could not be written".to_string())?;
    file.sync_all()
        .map_err(|_| "OCR temporary image could not be committed".to_string())?;
    Ok(())
}

#[tauri::command]
pub fn vgt_ocr_languages() -> Result<OcrLanguagesResponse, String> {
    Ok(OcrLanguagesResponse {
        engine: "tesseract-local".to_string(),
        engine_version: tesseract_version()?,
        languages: list_languages()?,
    })
}

#[tauri::command]
pub fn vgt_ocr_recognize(
    app: tauri::AppHandle,
    request: OcrRecognizeRequest,
) -> Result<OcrRecognizeResponse, String> {
    if request.image_base64.len() > MAX_OCR_IMAGE_BYTES.saturating_mul(2) {
        return Err("OCR image exceeds encoded-size policy".to_string());
    }
    let image_bytes = decode_base64(&request.image_base64)
        .map_err(|_| "OCR image base64 is invalid".to_string())?;
    if image_bytes.len() < 32 || image_bytes.len() > MAX_OCR_IMAGE_BYTES {
        return Err("OCR image exceeds byte-size policy".to_string());
    }
    if image_bytes[0] != 0xff
        || image_bytes[1] != 0xd8
        || image_bytes[image_bytes.len() - 2] != 0xff
        || image_bytes[image_bytes.len() - 1] != 0xd9
    {
        return Err("OCR input must be a complete normalized JPEG".to_string());
    }
    let language = clean_language(&request.language)?;
    let psm = clean_psm(request.page_segmentation_mode)?;
    let (job_root, input_path, _output_base, tsv_path) = safe_cache_paths(&app, &image_bytes)?;
    write_private_image(&input_path, &image_bytes)?;

    let started = Instant::now();
    let result = (|| -> Result<OcrRecognizeResponse, String> {
        require_existing_path_in_jail(&job_root, &input_path)?;
        let mut child = Command::new("tesseract")
            .current_dir(&job_root)
            .arg("input.jpg")
            .arg("result")
            .arg("-l")
            .arg(&language)
            .arg("--psm")
            .arg(psm.to_string())
            .arg("tsv")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|_| "Local Tesseract OCR engine is unavailable".to_string())?;

        let status = loop {
            if let Some(status) = child
                .try_wait()
                .map_err(|_| "Local OCR process status failed".to_string())?
            {
                break status;
            }
            if started.elapsed() >= OCR_TIMEOUT {
                let _ = child.kill();
                let _ = child.wait();
                return Err("Local OCR exceeded the configured time limit".to_string());
            }
            thread::sleep(OCR_POLL_INTERVAL);
        };
        if !status.success() {
            return Err("Local OCR engine rejected the image or language pack".to_string());
        }
        require_existing_path_in_jail(&job_root, &tsv_path)?;
        let metadata = fs::metadata(&tsv_path)
            .map_err(|_| "Local OCR did not produce a TSV result".to_string())?;
        if metadata.len() == 0 || metadata.len() > MAX_OCR_TSV_BYTES as u64 {
            return Err("Local OCR result exceeds output-size policy".to_string());
        }
        let tsv = fs::read_to_string(&tsv_path)
            .map_err(|_| "Local OCR TSV result is not valid UTF-8".to_string())?;
        Ok(OcrRecognizeResponse {
            engine: "tesseract-local".to_string(),
            engine_version: tesseract_version()?,
            language,
            tsv,
            processing_time_ms: started.elapsed().as_millis(),
        })
    })();

    let _ = fs::remove_file(&input_path);
    let _ = fs::remove_file(&tsv_path);
    let _ = fs::remove_dir(&job_root);
    result
}
