//! Astraea VGT Top Secret outer security domain.
//!
//! The inner VWC remains independently authenticated/encrypted. This crate treats it as an opaque
//! ciphertext stream and seals it with the exact pinned VGT Infinity suite. No browser fallback and
//! no downgrade to the Standard profile is permitted.

use rand::{rngs::OsRng, RngCore};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{self, File, OpenOptions};
use std::io::{BufReader, BufWriter, Read, Write};
use std::path::{Path, PathBuf};
use thiserror::Error;
use vgt_infinity_core::vault::{decrypt_file, encrypt_file};
use vgt_keyvault::VgtKeyVault;

mod identity_adapter;
pub use identity_adapter::enroll_identity_from_infinity;
use identity_adapter::load_infinity_identity;

pub const OUTER_MAGIC: &[u8; 8] = b"VGATS001";
pub const OUTER_FORMAT_VERSION: u16 = 1;
pub const OUTER_SUITE: &str = "VGT-ASTRAEA-TS-1";
pub const INFINITY_SUITE: &str = "VGT-INFINITY-1";
pub const INFINITY_PINNED_COMMIT: &str = "55b05a697a189d0ec583cdcf340beeba1efc9130";
pub const DEFAULT_INFINITY_CHUNK_SIZE: usize = 4 * 1024 * 1024;
pub const MAX_OUTER_CONTAINER_BYTES: u64 = 768 * 1024 * 1024;
pub const MAX_OUTER_HEADER_BYTES: usize = 4096;
pub const MAX_DIAGNOSTIC_CODE_BYTES: usize = 96;
const COPY_BUFFER_BYTES: usize = 1024 * 1024;

#[derive(Debug, Error)]
pub enum TopSecretError {
    #[error("Top Secret provider unavailable")]
    ProviderUnavailable,
    #[error("Top Secret identity unavailable")]
    IdentityUnavailable,
    #[error("Top Secret identity rejected")]
    IdentityRejected,
    #[error("Top Secret container rejected")]
    ContainerRejected,
    #[error("Top Secret size boundary exceeded")]
    SizeLimit,
    #[error("Top Secret operation cancelled at safe boundary")]
    Cancelled,
    #[error("Top Secret IO failure")]
    Io(#[from] std::io::Error),
    #[error("Top Secret serialization failure")]
    Serialization(#[from] serde_json::Error),
    #[error("Top Secret Infinity operation failed")]
    Infinity(#[from] vgt_infinity_core::InfinityError),
    #[error("Top Secret KeyVault operation failed")]
    KeyVault(#[from] vgt_keyvault::KeyVaultError),
}

impl TopSecretError {
    pub fn diagnostic_code(&self) -> &'static str {
        match self {
            Self::ProviderUnavailable => "TS_PROVIDER_UNAVAILABLE",
            Self::IdentityUnavailable => "TS_IDENTITY_UNAVAILABLE",
            Self::IdentityRejected => "TS_IDENTITY_REJECTED",
            Self::ContainerRejected => "TS_CONTAINER_REJECTED",
            Self::SizeLimit => "TS_SIZE_LIMIT",
            Self::Cancelled => "TS_SAFE_CANCEL",
            Self::Io(_) => "TS_IO_FAILURE",
            Self::Serialization(_) => "TS_SERIALIZATION_FAILURE",
            Self::Infinity(_) => "TS_INFINITY_FAILURE",
            Self::KeyVault(_) => "TS_KEYVAULT_FAILURE",
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TopSecretPhase {
    PreparingInnerVwc,
    KemEncapsulation,
    InfinityCascade,
    PqSignatures,
    AtomicWrite,
    VerifyingOuter,
    VerifyPqSignatures,
    OpenInfinityLayers,
    AuthenticateInnerVwc,
    Complete,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TopSecretProgress {
    pub operation_id: String,
    pub phase: TopSecretPhase,
    pub bytes_completed: u64,
    pub bytes_total: Option<u64>,
    pub chunks_completed: u64,
    pub chunks_total: Option<u64>,
    pub cancellable: bool,
}

pub trait ProgressSink {
    fn report(&mut self, event: TopSecretProgress);
    fn cancelled(&self) -> bool { false }
}

pub struct NoopProgress;
impl ProgressSink for NoopProgress { fn report(&mut self, _event: TopSecretProgress) {} }

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct OuterHeader {
    pub suite: String,
    pub infinity_suite: String,
    pub infinity_commit: String,
    pub payload_sha256: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OuterInspection {
    pub format_version: u16,
    pub payload_offset: u64,
    pub payload_len: u64,
    pub header: OuterHeader,
}

pub struct TopSecretEngine {
    provider_workspace: PathBuf,
}

impl TopSecretEngine {
    pub fn new(provider_workspace: impl Into<PathBuf>) -> Self {
        Self { provider_workspace: provider_workspace.into() }
    }

    pub fn provider_workspace(&self) -> &Path { &self.provider_workspace }

    pub fn validate_provider(&self) -> Result<(), TopSecretError> {
        if !self.provider_workspace.is_dir()
            || !self.provider_workspace.join("helpers/vgt_infinity_provider.py").is_file()
        {
            return Err(TopSecretError::ProviderUnavailable);
        }
        vgt_infinity_core::vault::validate_runtime().map_err(TopSecretError::Infinity)?;
        vgt_infinity_core::provider::IsolatedProvider::discover(&self.provider_workspace)
            .map(|_| ())
            .map_err(|_| TopSecretError::ProviderUnavailable)
    }

    pub fn seal_vwc_file(
        &self,
        vault: &mut VgtKeyVault,
        inner_vwc: &Path,
        output: &Path,
        offline_factor: Option<&[u8; 32]>,
        operation_id: &str,
        progress: &mut dyn ProgressSink,
    ) -> Result<(), TopSecretError> {
        self.validate_provider()?;
        let input_meta = fs::symlink_metadata(inner_vwc)?;
        if !input_meta.is_file() || input_meta.file_type().is_symlink() || input_meta.len() > MAX_OUTER_CONTAINER_BYTES {
            return Err(TopSecretError::ContainerRejected);
        }
        if progress.cancelled() { return Err(TopSecretError::Cancelled); }
        progress.report(event(operation_id, TopSecretPhase::KemEncapsulation, 0, Some(input_meta.len()), 0, None, true));
        let identity = load_infinity_identity(vault)?;
        if progress.cancelled() { return Err(TopSecretError::Cancelled); }

        let infinity_temp = sibling_temp(output, "infinity")?;
        progress.report(event(operation_id, TopSecretPhase::InfinityCascade, 0, Some(input_meta.len()), 0, None, false));
        let report = encrypt_file(
            &self.provider_workspace,
            &identity,
            inner_vwc,
            &infinity_temp,
            DEFAULT_INFINITY_CHUNK_SIZE,
            offline_factor,
        )?;
        progress.report(event(operation_id, TopSecretPhase::PqSignatures, report.bytes, Some(report.bytes), report.chunks, Some(report.chunks), false));

        let result = (|| {
            progress.report(event(operation_id, TopSecretPhase::AtomicWrite, report.bytes, Some(report.bytes), report.chunks, Some(report.chunks), false));
            wrap_infinity_file(&infinity_temp, output)?;
            progress.report(event(operation_id, TopSecretPhase::VerifyingOuter, report.bytes, Some(report.bytes), report.chunks, Some(report.chunks), false));
            verify_outer_file(output)?;
            progress.report(event(operation_id, TopSecretPhase::Complete, report.bytes, Some(report.bytes), report.chunks, Some(report.chunks), false));
            Ok(())
        })();
        let _ = fs::remove_file(&infinity_temp);
        result
    }

    /// Outer signatures are verified by Infinity before it creates the inner VWC ciphertext output.
    /// The caller MUST authenticate/decrypt that VWC through vgt-container before exposing WOM.
    pub fn unseal_to_vwc_file(
        &self,
        vault: &mut VgtKeyVault,
        input: &Path,
        inner_vwc_output: &Path,
        offline_factor: Option<&[u8; 32]>,
        operation_id: &str,
        progress: &mut dyn ProgressSink,
    ) -> Result<(), TopSecretError> {
        self.validate_provider()?;
        let inspection = inspect_outer_file(input)?;
        if progress.cancelled() { return Err(TopSecretError::Cancelled); }
        let identity = load_infinity_identity(vault)?;
        let infinity_temp = sibling_temp(inner_vwc_output, "sealed")?;
        extract_infinity_payload(input, &infinity_temp, &inspection)?;
        let result = (|| {
            progress.report(event(operation_id, TopSecretPhase::VerifyPqSignatures, 0, Some(inspection.payload_len), 0, None, false));
            let report = decrypt_file(&self.provider_workspace, &identity, &infinity_temp, inner_vwc_output, offline_factor)?;
            progress.report(event(operation_id, TopSecretPhase::OpenInfinityLayers, report.bytes, Some(report.bytes), report.chunks, Some(report.chunks), false));
            // Do not emit Complete here. Inner VWC authentication is a separate mandatory boundary.
            Ok(())
        })();
        let _ = fs::remove_file(&infinity_temp);
        result
    }

    /// Explicit standalone Infinity export adapter. This intentionally emits a real `.vgti`
    /// artifact and therefore keeps Infinity's own signed metadata semantics. It is never used
    /// as the Astraea Top-Secret outer container.
    pub fn export_vgti_file(
        &self,
        vault: &mut VgtKeyVault,
        inner_vwc: &Path,
        output: &Path,
        offline_factor: Option<&[u8; 32]>,
        operation_id: &str,
        progress: &mut dyn ProgressSink,
    ) -> Result<(), TopSecretError> {
        self.validate_provider()?;
        let meta = fs::symlink_metadata(inner_vwc)?;
        if !meta.is_file() || meta.file_type().is_symlink() || meta.len() == 0 || meta.len() > MAX_OUTER_CONTAINER_BYTES || output.exists() {
            return Err(TopSecretError::ContainerRejected);
        }
        if progress.cancelled() { return Err(TopSecretError::Cancelled); }
        let identity = load_infinity_identity(vault)?;
        progress.report(event(operation_id, TopSecretPhase::KemEncapsulation, 0, Some(meta.len()), 0, None, true));
        if progress.cancelled() { return Err(TopSecretError::Cancelled); }
        progress.report(event(operation_id, TopSecretPhase::InfinityCascade, 0, Some(meta.len()), 0, None, false));
        let report = encrypt_file(&self.provider_workspace, &identity, inner_vwc, output, DEFAULT_INFINITY_CHUNK_SIZE, offline_factor)?;
        progress.report(event(operation_id, TopSecretPhase::PqSignatures, report.bytes, Some(report.bytes), report.chunks, Some(report.chunks), false));
        progress.report(event(operation_id, TopSecretPhase::Complete, report.bytes, Some(report.bytes), report.chunks, Some(report.chunks), false));
        Ok(())
    }

    /// Authenticated standalone Infinity import adapter. Upstream decrypt verifies both PQ
    /// signatures and the complete signed structure before creating the VWC ciphertext output.
    pub fn import_vgti_to_vwc_file(
        &self,
        vault: &mut VgtKeyVault,
        input: &Path,
        inner_vwc_output: &Path,
        offline_factor: Option<&[u8; 32]>,
        operation_id: &str,
        progress: &mut dyn ProgressSink,
    ) -> Result<(), TopSecretError> {
        self.validate_provider()?;
        let meta = fs::symlink_metadata(input)?;
        if !meta.is_file() || meta.file_type().is_symlink() || meta.len() == 0 || meta.len() > MAX_OUTER_CONTAINER_BYTES || inner_vwc_output.exists() {
            return Err(TopSecretError::ContainerRejected);
        }
        let identity = load_infinity_identity(vault)?;
        progress.report(event(operation_id, TopSecretPhase::VerifyPqSignatures, 0, Some(meta.len()), 0, None, false));
        let report = decrypt_file(&self.provider_workspace, &identity, input, inner_vwc_output, offline_factor)?;
        progress.report(event(operation_id, TopSecretPhase::OpenInfinityLayers, report.bytes, Some(report.bytes), report.chunks, Some(report.chunks), false));
        Ok(())
    }
}

fn event(id: &str, phase: TopSecretPhase, bytes: u64, bytes_total: Option<u64>, chunks: u64, chunks_total: Option<u64>, cancellable: bool) -> TopSecretProgress {
    TopSecretProgress { operation_id: id.to_owned(), phase, bytes_completed: bytes, bytes_total, chunks_completed: chunks, chunks_total, cancellable }
}

fn sibling_temp(target: &Path, label: &str) -> Result<PathBuf, TopSecretError> {
    let parent = target.parent().ok_or(TopSecretError::ContainerRejected)?;
    fs::create_dir_all(parent)?;
    for _ in 0..32 {
        let mut suffix_bytes = [0u8; 8];
        OsRng.fill_bytes(&mut suffix_bytes);
        let suffix = u64::from_be_bytes(suffix_bytes);
        let candidate = parent.join(format!(".astraea-ts-{label}-{suffix:016x}.tmp"));
        match OpenOptions::new().write(true).create_new(true).open(&candidate) {
            Ok(file) => { file.sync_all()?; drop(file); return Ok(candidate); }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error.into()),
        }
    }
    Err(TopSecretError::Io(std::io::Error::new(std::io::ErrorKind::AlreadyExists, "temporary path collision")))
}

pub fn wrap_infinity_file(infinity_file: &Path, output: &Path) -> Result<(), TopSecretError> {
    let meta = fs::symlink_metadata(infinity_file)?;
    if !meta.is_file() || meta.file_type().is_symlink() || meta.len() == 0 || meta.len() > MAX_OUTER_CONTAINER_BYTES {
        return Err(TopSecretError::ContainerRejected);
    }
    if output.exists() { return Err(TopSecretError::ContainerRejected); }
    let payload_hash = sha256_file(infinity_file)?;
    let header = OuterHeader {
        suite: OUTER_SUITE.to_owned(),
        infinity_suite: INFINITY_SUITE.to_owned(),
        infinity_commit: INFINITY_PINNED_COMMIT.to_owned(),
        payload_sha256: payload_hash,
    };
    let header_bytes = serde_json::to_vec(&header)?;
    if header_bytes.is_empty() || header_bytes.len() > MAX_OUTER_HEADER_BYTES { return Err(TopSecretError::ContainerRejected); }
    let payload_len = meta.len();
    let temp = sibling_temp(output, "outer")?;
    let result = (|| {
        let mut writer = BufWriter::new(OpenOptions::new().write(true).truncate(true).open(&temp)?);
        writer.write_all(OUTER_MAGIC)?;
        writer.write_all(&OUTER_FORMAT_VERSION.to_be_bytes())?;
        writer.write_all(&(header_bytes.len() as u32).to_be_bytes())?;
        writer.write_all(&payload_len.to_be_bytes())?;
        writer.write_all(&header_bytes)?;
        let mut reader = BufReader::new(File::open(infinity_file)?);
        copy_bounded(&mut reader, &mut writer, payload_len)?;
        writer.flush()?;
        writer.get_ref().sync_all()?;
        drop(writer);
        fs::rename(&temp, output)?;
        if let Some(parent) = output.parent() { sync_directory(parent); }
        Ok(())
    })();
    if result.is_err() { let _ = fs::remove_file(&temp); }
    result
}

pub fn inspect_outer_file(path: &Path) -> Result<OuterInspection, TopSecretError> {
    let meta = fs::symlink_metadata(path)?;
    if !meta.is_file() || meta.file_type().is_symlink() || meta.len() > MAX_OUTER_CONTAINER_BYTES + MAX_OUTER_HEADER_BYTES as u64 + 32 {
        return Err(TopSecretError::ContainerRejected);
    }
    let mut reader = BufReader::new(File::open(path)?);
    let mut fixed = [0u8; 22];
    reader.read_exact(&mut fixed).map_err(|_| TopSecretError::ContainerRejected)?;
    if &fixed[..8] != OUTER_MAGIC { return Err(TopSecretError::ContainerRejected); }
    let version = u16::from_be_bytes([fixed[8], fixed[9]]);
    if version != OUTER_FORMAT_VERSION { return Err(TopSecretError::ContainerRejected); }
    let header_len = u32::from_be_bytes(fixed[10..14].try_into().map_err(|_| TopSecretError::ContainerRejected)?) as usize;
    let payload_len = u64::from_be_bytes(fixed[14..22].try_into().map_err(|_| TopSecretError::ContainerRejected)?);
    if header_len == 0 || header_len > MAX_OUTER_HEADER_BYTES || payload_len == 0 || payload_len > MAX_OUTER_CONTAINER_BYTES { return Err(TopSecretError::ContainerRejected); }
    let expected = 22u64.checked_add(header_len as u64).and_then(|v| v.checked_add(payload_len)).ok_or(TopSecretError::SizeLimit)?;
    if expected != meta.len() { return Err(TopSecretError::ContainerRejected); }
    let mut header_bytes = vec![0u8; header_len];
    reader.read_exact(&mut header_bytes).map_err(|_| TopSecretError::ContainerRejected)?;
    let header: OuterHeader = serde_json::from_slice(&header_bytes)?;
    if header.suite != OUTER_SUITE || header.infinity_suite != INFINITY_SUITE || header.infinity_commit != INFINITY_PINNED_COMMIT || header.payload_sha256.len() != 64 {
        return Err(TopSecretError::ContainerRejected);
    }
    Ok(OuterInspection { format_version: version, payload_offset: 22 + header_len as u64, payload_len, header })
}

/// Structural + payload-integrity verification of the committed Astraea outer envelope.
pub fn verify_outer_file(path: &Path) -> Result<OuterInspection, TopSecretError> {
    use std::io::{Seek, SeekFrom};
    let inspection = inspect_outer_file(path)?;
    let mut source = BufReader::new(File::open(path)?);
    source.seek(SeekFrom::Start(inspection.payload_offset))?;
    let mut hasher = Sha256::new();
    let mut remaining = inspection.payload_len;
    let mut buffer = vec![0u8; COPY_BUFFER_BYTES];
    while remaining > 0 {
        let take = usize::try_from(remaining.min(buffer.len() as u64)).map_err(|_| TopSecretError::SizeLimit)?;
        source.read_exact(&mut buffer[..take])?;
        hasher.update(&buffer[..take]);
        remaining -= take as u64;
    }
    let digest = format!("{:x}", hasher.finalize());
    if digest != inspection.header.payload_sha256 { return Err(TopSecretError::ContainerRejected); }
    Ok(inspection)
}

fn extract_infinity_payload(input: &Path, output: &Path, inspection: &OuterInspection) -> Result<(), TopSecretError> {
    if output.exists() { return Err(TopSecretError::ContainerRejected); }
    let mut source = BufReader::new(File::open(input)?);
    std::io::Seek::seek(&mut source, std::io::SeekFrom::Start(inspection.payload_offset))?;
    let mut writer = BufWriter::new(OpenOptions::new().write(true).create_new(true).open(output)?);
    let mut hasher = Sha256::new();
    let mut remaining = inspection.payload_len;
    let mut buf = vec![0u8; COPY_BUFFER_BYTES];
    while remaining > 0 {
        let take = usize::try_from(remaining.min(buf.len() as u64)).map_err(|_| TopSecretError::SizeLimit)?;
        source.read_exact(&mut buf[..take])?;
        hasher.update(&buf[..take]);
        writer.write_all(&buf[..take])?;
        remaining -= take as u64;
    }
    writer.flush()?;
    writer.get_ref().sync_all()?;
    let digest = format!("{:x}", hasher.finalize());
    if digest != inspection.header.payload_sha256 { let _ = fs::remove_file(output); return Err(TopSecretError::ContainerRejected); }
    Ok(())
}

fn copy_bounded(reader: &mut impl Read, writer: &mut impl Write, expected: u64) -> Result<(), TopSecretError> {
    let mut remaining = expected;
    let mut buf = vec![0u8; COPY_BUFFER_BYTES];
    while remaining > 0 {
        let take = usize::try_from(remaining.min(buf.len() as u64)).map_err(|_| TopSecretError::SizeLimit)?;
        reader.read_exact(&mut buf[..take])?;
        writer.write_all(&buf[..take])?;
        remaining -= take as u64;
    }
    let mut extra = [0u8; 1];
    if reader.read(&mut extra)? != 0 { return Err(TopSecretError::ContainerRejected); }
    Ok(())
}

fn sha256_file(path: &Path) -> Result<String, TopSecretError> {
    let mut reader = BufReader::new(File::open(path)?);
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; COPY_BUFFER_BYTES];
    let mut total = 0u64;
    loop {
        let n = reader.read(&mut buf)?;
        if n == 0 { break; }
        total = total.checked_add(n as u64).ok_or(TopSecretError::SizeLimit)?;
        if total > MAX_OUTER_CONTAINER_BYTES { return Err(TopSecretError::SizeLimit); }
        hasher.update(&buf[..n]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

#[cfg(unix)]
fn sync_directory(path: &Path) { if let Ok(file) = File::open(path) { let _ = file.sync_all(); } }
#[cfg(not(unix))]
fn sync_directory(_path: &Path) {}

