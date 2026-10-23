// STATUS: DIAMANT VGT SUPREME
//! VGT Import / Export Sandbox Core.
//!
//! Foreign files are hostile input. This crate owns the canonical intake policy for
//! OOXML, ODF, PDF, CSV/JSON and raster images. It performs bounded validation only;
//! it never executes macros, embedded scripts, OLE/ActiveX payloads or external XML
//! entities.

mod archive;
mod formats;
mod package;
mod pdf;
mod xml;

use serde::{Deserialize, Serialize};
use std::path::Path;
use std::time::{Duration, Instant};
use thiserror::Error;

pub use archive::{ArchiveEntry, ValidatedArchive};
pub use formats::{inspect_bytes, inspect_path, validate_export_bytes, validate_export_path};
pub(crate) use xml::inspect_xml;

pub const SANDBOX_CONTRACT: &str = "VGT-IMPORT-SANDBOX-3";

#[derive(Error, Debug)]
pub enum SandboxError {
    #[error("foreign input rejected: {0}")]
    Rejected(&'static str),
    #[error("foreign input exceeds resource limit: {0}")]
    Resource(&'static str),
    #[error("foreign input integrity failure: {0}")]
    Integrity(&'static str),
    #[error("foreign input format is unsupported")]
    Unsupported,
    #[error("sandbox I/O failed")]
    Io(#[from] std::io::Error),
    #[error("sandbox JSON parse failed")]
    Json(#[from] serde_json::Error),
}

pub type Result<T> = std::result::Result<T, SandboxError>;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ForeignFormat {
    Docx,
    Xlsx,
    Pptx,
    Odt,
    Ods,
    Odp,
    Pdf,
    Csv,
    Json,
    Png,
    Jpeg,
    Gif,
    Webp,
    /// Opaque, already encrypted Astraea Workspace container (VWC). No payload parsing here.
    Vwc,
}

impl ForeignFormat {
    pub fn label(&self) -> &'static str {
        match self {
            Self::Docx => "DOCX",
            Self::Xlsx => "XLSX",
            Self::Pptx => "PPTX",
            Self::Odt => "ODT",
            Self::Ods => "ODS",
            Self::Odp => "ODP",
            Self::Pdf => "PDF",
            Self::Csv => "CSV",
            Self::Json => "JSON",
            Self::Png => "PNG",
            Self::Jpeg => "JPEG",
            Self::Gif => "GIF",
            Self::Webp => "WEBP",
            Self::Vwc => "VWC",
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ActiveContentDisposition {
    None,
    QuarantinedPreserved,
    Rejected,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PreservedForeignPart {
    pub path: String,
    pub size_bytes: u64,
    pub blake3: String,
    pub media_hint: String,
    pub quarantined: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct FidelityReport {
    pub source_format: String,
    pub supported_features: Vec<String>,
    pub unsupported_features: Vec<String>,
    pub preserved_foreign_parts: Vec<PreservedForeignPart>,
    pub dropped_active_parts: Vec<String>,
    pub warnings: Vec<String>,
    pub destructive_roundtrip_requires_confirmation: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct UntrustedResourceSummary {
    pub embedded_fonts: usize,
    pub icc_profiles: usize,
    pub external_references: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SandboxInspectionReport {
    pub contract: String,
    pub format: ForeignFormat,
    pub file_name_hint: String,
    pub size_bytes: u64,
    pub entry_count: usize,
    pub expanded_bytes: u64,
    pub max_observed_ratio_milli: u64,
    pub active_content: ActiveContentDisposition,
    pub integrity_verified: bool,
    pub parser_boundary: String,
    pub image_width: Option<u32>,
    pub image_height: Option<u32>,
    pub untrusted_resources: UntrustedResourceSummary,
    pub fidelity: FidelityReport,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SandboxLimits {
    pub max_input_bytes: u64,
    pub max_entries: usize,
    pub max_entry_bytes: u64,
    pub max_expanded_bytes: u64,
    pub max_compression_ratio: u64,
    pub max_path_bytes: usize,
    pub max_path_segments: usize,
    pub max_archive_depth: usize,
    pub max_xml_depth: usize,
    pub max_xml_elements: usize,
    pub max_xml_text_bytes: usize,
    pub max_pdf_objects: usize,
    pub max_pdf_pages: usize,
    pub max_pdf_streams: usize,
    pub max_image_pixels: u64,
    pub max_image_dimension: u32,
    pub max_pdf_xref_sections: usize,
    pub max_pdf_resources: usize,
    pub max_embedded_font_parts: usize,
    pub max_icc_profile_parts: usize,
    pub max_elapsed_ms: u64,
    pub max_preserved_parts: usize,
    pub max_preserved_part_bytes: u64,
    pub max_preserved_total_bytes: u64,
}

impl Default for SandboxLimits {
    fn default() -> Self {
        Self {
            max_input_bytes: 128 * 1024 * 1024,
            max_entries: 4096,
            max_entry_bytes: 64 * 1024 * 1024,
            max_expanded_bytes: 256 * 1024 * 1024,
            max_compression_ratio: 100,
            max_path_bytes: 4096,
            max_path_segments: 128,
            max_archive_depth: 3,
            max_xml_depth: 96,
            max_xml_elements: 750_000,
            max_xml_text_bytes: 64 * 1024 * 1024,
            max_pdf_objects: 250_000,
            max_pdf_pages: 25_000,
            max_pdf_streams: 250_000,
            max_image_pixels: 120_000_000,
            max_image_dimension: 16_384,
            max_pdf_xref_sections: 4_096,
            max_pdf_resources: 500_000,
            max_embedded_font_parts: 256,
            max_icc_profile_parts: 64,
            max_elapsed_ms: 12_000,
            max_preserved_parts: 512,
            max_preserved_part_bytes: 2 * 1024 * 1024,
            max_preserved_total_bytes: 16 * 1024 * 1024,
        }
    }
}

#[derive(Clone)]
pub(crate) struct Budget {
    limits: SandboxLimits,
    started: Instant,
}

impl Budget {
    pub(crate) fn new(limits: SandboxLimits) -> Result<Self> {
        if limits.max_input_bytes == 0
            || limits.max_entries == 0
            || limits.max_entry_bytes == 0
            || limits.max_expanded_bytes == 0
            || limits.max_compression_ratio == 0
            || limits.max_path_segments == 0
            || limits.max_image_dimension == 0
            || limits.max_pdf_xref_sections == 0
            || limits.max_pdf_resources == 0
            || limits.max_embedded_font_parts == 0
            || limits.max_icc_profile_parts == 0
            || limits.max_elapsed_ms == 0
        {
            return Err(SandboxError::Resource("invalid zero-valued sandbox limit"));
        }
        Ok(Self {
            limits,
            started: Instant::now(),
        })
    }

    pub(crate) fn limits(&self) -> &SandboxLimits {
        &self.limits
    }

    pub(crate) fn checkpoint(&self) -> Result<()> {
        if self.started.elapsed() > Duration::from_millis(self.limits.max_elapsed_ms) {
            return Err(SandboxError::Resource("processing deadline exceeded"));
        }
        Ok(())
    }
}

pub fn inspect_foreign_file(
    path: &Path,
    file_name_hint: &str,
    limits: SandboxLimits,
) -> Result<SandboxInspectionReport> {
    inspect_path(path, file_name_hint, limits)
}

pub fn validate_export_file(
    path: &Path,
    file_name_hint: &str,
    limits: SandboxLimits,
) -> Result<SandboxInspectionReport> {
    validate_export_path(path, file_name_hint, limits)
}

#[cfg(test)]
mod mutation_support;

#[cfg(test)]
mod hostile_mutation_tests;
