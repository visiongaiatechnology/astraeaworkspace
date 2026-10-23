// STATUS: DIAMANT VGT SUPREME
use crate::archive::{inspect_zip, is_active_part, preservation_candidates, ValidatedArchive};
use crate::package::validate_package_semantics;
use crate::pdf::inspect_pdf_structure;
use crate::{
    ActiveContentDisposition, Budget, FidelityReport, ForeignFormat, Result, SandboxError,
    SandboxInspectionReport, SandboxLimits, UntrustedResourceSummary, SANDBOX_CONTRACT,
};
use std::collections::HashSet;
use std::fs;
use std::path::Path;

/// VWC v3 framing magic (`crates/vgt-container/src/lib.rs`). The container payload stays opaque.
pub(crate) const VWC_MAGIC: &[u8; 4] = b"VWC1";
/// Minimum plausible framed container size: magic + version + lengths + at least one tag.
pub(crate) const VWC_MIN_FRAMED_BYTES: usize = 32;

pub fn inspect_path(
    path: &Path,
    file_name_hint: &str,
    limits: SandboxLimits,
) -> Result<SandboxInspectionReport> {
    let bytes = read_regular_file(path, &limits)?;
    inspect_bytes(&bytes, file_name_hint, limits)
}

pub fn validate_export_path(
    path: &Path,
    file_name_hint: &str,
    limits: SandboxLimits,
) -> Result<SandboxInspectionReport> {
    let bytes = read_regular_file(path, &limits)?;
    validate_export_bytes(&bytes, file_name_hint, limits)
}

fn read_regular_file(path: &Path, limits: &SandboxLimits) -> Result<Vec<u8>> {
    let meta = fs::symlink_metadata(path)?;
    if !meta.is_file() || meta.file_type().is_symlink() {
        return Err(SandboxError::Rejected(
            "input path must be a regular non-symlink file",
        ));
    }
    if meta.len() == 0 || meta.len() > limits.max_input_bytes {
        return Err(SandboxError::Resource("input size rejected"));
    }
    fs::read(path).map_err(SandboxError::Io)
}

pub fn validate_export_bytes(
    bytes: &[u8],
    file_name_hint: &str,
    limits: SandboxLimits,
) -> Result<SandboxInspectionReport> {
    let report = inspect_bytes(bytes, file_name_hint, limits)?;
    if report.active_content != ActiveContentDisposition::None {
        return Err(SandboxError::Rejected(
            "active foreign content cannot be emitted by the standard export boundary",
        ));
    }
    if !report.integrity_verified {
        return Err(SandboxError::Integrity(
            "export artifact integrity not verified",
        ));
    }
    Ok(report)
}

pub fn inspect_bytes(
    bytes: &[u8],
    file_name_hint: &str,
    limits: SandboxLimits,
) -> Result<SandboxInspectionReport> {
    let budget = Budget::new(limits)?;
    budget.checkpoint()?;
    if bytes.is_empty() || bytes.len() as u64 > budget.limits().max_input_bytes {
        return Err(SandboxError::Resource("input size rejected"));
    }

    // Release Beta 0.1: the native Astraea Workspace container (VWC v3, magic "VWC1") is an
    // opaque, already encrypted document format. Exporting it must be possible through the same
    // atomic save boundary as DOCX/PDF, so the sandbox recognizes the framing without parsing
    // the encrypted payload. Payload integrity/credentials are verified by the container
    // boundary when the document is opened.
    if bytes.starts_with(VWC_MAGIC) {
        if bytes.len() < VWC_MIN_FRAMED_BYTES {
            return Err(SandboxError::Rejected(
                "VWC container framing is truncated",
            ));
        }
        return Ok(base_report(
            ForeignFormat::Vwc,
            file_name_hint,
            bytes.len() as u64,
            0,
            0,
            1000,
            ActiveContentDisposition::None,
            true,
            FidelityReport {
                source_format: "vwc".to_string(),
                supported_features: vec![
                    "opaque encrypted Astraea Workspace container".to_string(),
                    "structural VWC magic and minimum framing verified".to_string(),
                ],
                unsupported_features: vec![],
                preserved_foreign_parts: vec![],
                dropped_active_parts: vec![],
                warnings: vec![
                    "The encrypted payload is opaque at this boundary; integrity and credentials are verified when the document is opened.".to_string(),
                ],
                destructive_roundtrip_requires_confirmation: false,
            },
            None,
            None,
            UntrustedResourceSummary {
                embedded_fonts: 0,
                icc_profiles: 0,
                external_references: 0,
            },
        ));
    }
    if bytes.starts_with(b"PK\x03\x04") {
        return inspect_package(bytes, file_name_hint, &budget);
    }
    if bytes[..bytes.len().min(1024)]
        .windows(5)
        .any(|window| window == b"%PDF-")
    {
        return inspect_pdf(bytes, file_name_hint, &budget);
    }
    if let Some((format, width, height)) = inspect_image_header(bytes, &budget)? {
        let icc_profiles = image_icc_profile_count(bytes, &format);
        if icc_profiles > budget.limits().max_icc_profile_parts {
            return Err(SandboxError::Resource("image ICC profile count exceeded"));
        }
        let mut warnings = Vec::new();
        if icc_profiles > 0 {
            warnings.push("Embedded ICC/profile data is untrusted and may only be parsed inside an isolated decoder".to_string());
        }
        return Ok(base_report(
            format,
            file_name_hint,
            bytes.len() as u64,
            0,
            0,
            1000,
            ActiveContentDisposition::None,
            true,
            FidelityReport {
                source_format: "raster-image".to_string(),
                supported_features: vec![
                    "bounded image metadata intake".to_string(),
                    "isolated decode required before display".to_string(),
                ],
                unsupported_features: vec![],
                preserved_foreign_parts: vec![],
                dropped_active_parts: vec![],
                warnings,
                destructive_roundtrip_requires_confirmation: false,
            },
            Some(width),
            Some(height),
            UntrustedResourceSummary {
                embedded_fonts: 0,
                icc_profiles,
                external_references: 0,
            },
        ));
    }
    if serde_json::from_slice::<serde_json::Value>(bytes).is_ok() {
        return Ok(base_report(
            ForeignFormat::Json,
            file_name_hint,
            bytes.len() as u64,
            0,
            0,
            1000,
            ActiveContentDisposition::None,
            true,
            simple_fidelity("JSON", vec!["bounded JSON parse"]),
            None,
            None,
            UntrustedResourceSummary::default(),
        ));
    }
    if looks_like_csv(bytes) {
        return Ok(base_report(
            ForeignFormat::Csv,
            file_name_hint,
            bytes.len() as u64,
            0,
            0,
            1000,
            ActiveContentDisposition::None,
            true,
            simple_fidelity("CSV", vec!["bounded delimited text import"]),
            None,
            None,
            UntrustedResourceSummary::default(),
        ));
    }
    Err(SandboxError::Unsupported)
}

fn inspect_package(
    bytes: &[u8],
    file_name_hint: &str,
    budget: &Budget,
) -> Result<SandboxInspectionReport> {
    let archive = inspect_zip(bytes, budget, 0)?;
    let format = classify_package(&archive)?;
    validate_required_structure(&archive, &format)?;
    let semantic = validate_package_semantics(&archive, &format, budget)?;

    let active = archive
        .entries
        .keys()
        .filter(|name| is_active_part(&name.to_ascii_lowercase()))
        .cloned()
        .collect::<Vec<_>>();
    let disposition = if active.is_empty() {
        ActiveContentDisposition::None
    } else {
        ActiveContentDisposition::QuarantinedPreserved
    };
    let reserved = reserved_parts(&format);
    let preserved = preservation_candidates(&archive, &reserved, budget);
    let preserved_names = preserved
        .iter()
        .map(|part| part.path.as_str())
        .collect::<HashSet<_>>();
    let dropped_active = active
        .iter()
        .filter(|name| !preserved_names.contains(name.as_str()))
        .cloned()
        .collect::<Vec<_>>();

    let mut unsupported = Vec::<String>::new();
    let mut warnings = Vec::<String>::new();
    if !active.is_empty() {
        unsupported.push("active macro/OLE/ActiveX content is never executed".to_string());
        warnings.extend(
            active
                .iter()
                .map(|part| format!("Active part quarantined: {part}")),
        );
    }
    if semantic.external_relationships > 0 {
        warnings.push(format!("{} external relationship(s) retained as inert metadata; no network retrieval occurs in the sandbox", semantic.external_relationships));
    }
    if semantic.embedded_fonts > 0 {
        warnings.push(format!(
            "{} embedded font part(s) treated as untrusted opaque resources",
            semantic.embedded_fonts
        ));
    }
    if semantic.icc_profiles > 0 {
        warnings.push(format!(
            "{} ICC profile part(s) treated as untrusted opaque resources",
            semantic.icc_profiles
        ));
    }

    let label = format.label().to_string();
    let fidelity = FidelityReport {
        source_format: label,
        supported_features: vec![
            "bounded package structure".to_string(),
            "CRC-verified entries".to_string(),
            "namespace-aware XML structure".to_string(),
            "relationship/content-type integrity".to_string(),
            "safe passive foreign-part roundtrip".to_string(),
        ],
        unsupported_features: unsupported,
        preserved_foreign_parts: preserved,
        dropped_active_parts: dropped_active,
        warnings,
        destructive_roundtrip_requires_confirmation: !active.is_empty(),
    };
    Ok(base_report(
        format,
        file_name_hint,
        bytes.len() as u64,
        archive.entries.len(),
        archive.expanded_bytes,
        archive.max_ratio_milli,
        disposition,
        true,
        fidelity,
        None,
        None,
        UntrustedResourceSummary {
            embedded_fonts: semantic.embedded_fonts,
            icc_profiles: semantic.icc_profiles,
            external_references: semantic.external_relationships,
        },
    ))
}

fn classify_package(archive: &ValidatedArchive) -> Result<ForeignFormat> {
    if archive.entries.contains_key("[Content_Types].xml") {
        if archive.entries.contains_key("word/document.xml") {
            return Ok(ForeignFormat::Docx);
        }
        if archive.entries.contains_key("xl/workbook.xml") {
            return Ok(ForeignFormat::Xlsx);
        }
        if archive.entries.contains_key("ppt/presentation.xml") {
            return Ok(ForeignFormat::Pptx);
        }
        return Err(SandboxError::Rejected(
            "OOXML package has no recognized primary part",
        ));
    }
    let mime = archive
        .entries
        .get("mimetype")
        .and_then(|entry| std::str::from_utf8(&entry.data).ok())
        .unwrap_or("")
        .trim();
    match mime {
        "application/vnd.oasis.opendocument.text" => Ok(ForeignFormat::Odt),
        "application/vnd.oasis.opendocument.spreadsheet" => Ok(ForeignFormat::Ods),
        "application/vnd.oasis.opendocument.presentation" => Ok(ForeignFormat::Odp),
        _ => Err(SandboxError::Unsupported),
    }
}

fn validate_required_structure(archive: &ValidatedArchive, format: &ForeignFormat) -> Result<()> {
    let required: &[&str] = match format {
        ForeignFormat::Docx => &["[Content_Types].xml", "_rels/.rels", "word/document.xml"],
        ForeignFormat::Xlsx => &[
            "[Content_Types].xml",
            "_rels/.rels",
            "xl/workbook.xml",
            "xl/_rels/workbook.xml.rels",
        ],
        ForeignFormat::Pptx => &[
            "[Content_Types].xml",
            "_rels/.rels",
            "ppt/presentation.xml",
            "ppt/_rels/presentation.xml.rels",
        ],
        ForeignFormat::Odt | ForeignFormat::Ods | ForeignFormat::Odp => {
            &["mimetype", "content.xml", "META-INF/manifest.xml"]
        }
        _ => &[],
    };
    if required
        .iter()
        .any(|name| !archive.entries.contains_key(*name))
    {
        return Err(SandboxError::Rejected(
            "package is missing a required structural part",
        ));
    }
    Ok(())
}

fn reserved_parts(format: &ForeignFormat) -> HashSet<String> {
    let values: &[&str] = match format {
        ForeignFormat::Docx => &[
            "[Content_Types].xml",
            "_rels/.rels",
            "word/document.xml",
            "word/styles.xml",
            "word/settings.xml",
        ],
        ForeignFormat::Xlsx => &[
            "[Content_Types].xml",
            "_rels/.rels",
            "xl/workbook.xml",
            "xl/_rels/workbook.xml.rels",
            "xl/styles.xml",
            "xl/sharedStrings.xml",
        ],
        ForeignFormat::Pptx => &[
            "[Content_Types].xml",
            "_rels/.rels",
            "ppt/presentation.xml",
            "ppt/_rels/presentation.xml.rels",
        ],
        ForeignFormat::Odt | ForeignFormat::Ods | ForeignFormat::Odp => &[
            "mimetype",
            "content.xml",
            "styles.xml",
            "meta.xml",
            "META-INF/manifest.xml",
        ],
        _ => &[],
    };
    values.iter().map(|value| (*value).to_string()).collect()
}

fn inspect_pdf(
    bytes: &[u8],
    file_name_hint: &str,
    budget: &Budget,
) -> Result<SandboxInspectionReport> {
    let pdf = inspect_pdf_structure(bytes, budget)?;
    let disposition = if pdf.active_markers.is_empty() {
        ActiveContentDisposition::None
    } else {
        ActiveContentDisposition::QuarantinedPreserved
    };
    let mut warnings = pdf
        .active_markers
        .iter()
        .map(|marker| format!("PDF active-content marker quarantined: {marker}"))
        .collect::<Vec<_>>();
    if pdf.embedded_fonts > 0 {
        warnings.push(format!(
            "{} PDF font resource(s) treated as untrusted renderer input",
            pdf.embedded_fonts
        ));
    }
    if pdf.icc_profiles > 0 {
        warnings.push(format!(
            "{} PDF ICC/profile resource(s) treated as untrusted renderer input",
            pdf.icc_profiles
        ));
    }
    if pdf.external_references > 0 {
        warnings.push(format!(
            "{} PDF external reference marker(s) are inert during sandbox inspection",
            pdf.external_references
        ));
    }
    let fidelity = FidelityReport {
        source_format: "PDF".to_string(),
        supported_features: vec![
            "bounded object/xref/stream/page/resource preflight".to_string(),
            "passive rendering/import".to_string(),
            "untrusted font/ICC isolation contract".to_string(),
        ],
        unsupported_features: if pdf.active_markers.is_empty() {
            vec![]
        } else {
            vec!["embedded PDF script/action execution".to_string()]
        },
        preserved_foreign_parts: vec![],
        dropped_active_parts: pdf.active_markers.clone(),
        warnings,
        destructive_roundtrip_requires_confirmation: !pdf.active_markers.is_empty(),
    };
    Ok(base_report(
        ForeignFormat::Pdf,
        file_name_hint,
        bytes.len() as u64,
        pdf.objects,
        bytes.len() as u64,
        1000,
        disposition,
        true,
        fidelity,
        None,
        None,
        UntrustedResourceSummary {
            embedded_fonts: pdf.embedded_fonts,
            icc_profiles: pdf.icc_profiles,
            external_references: pdf.external_references,
        },
    ))
}

fn inspect_image_header(
    bytes: &[u8],
    budget: &Budget,
) -> Result<Option<(ForeignFormat, u32, u32)>> {
    let parsed = if bytes.len() >= 24 && bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        if &bytes[12..16] != b"IHDR" {
            return Err(SandboxError::Integrity("PNG IHDR missing"));
        }
        let width = u32::from_be_bytes(
            bytes[16..20]
                .try_into()
                .map_err(|_| SandboxError::Integrity("PNG width field truncated"))?,
        );
        let height = u32::from_be_bytes(
            bytes[20..24]
                .try_into()
                .map_err(|_| SandboxError::Integrity("PNG height field truncated"))?,
        );
        Some((ForeignFormat::Png, width, height))
    } else if bytes.len() >= 10 && (&bytes[..6] == b"GIF87a" || &bytes[..6] == b"GIF89a") {
        Some((
            ForeignFormat::Gif,
            u16::from_le_bytes([bytes[6], bytes[7]]) as u32,
            u16::from_le_bytes([bytes[8], bytes[9]]) as u32,
        ))
    } else if bytes.len() >= 30
        && bytes.starts_with(b"RIFF")
        && &bytes[8..12] == b"WEBP"
        && &bytes[12..16] == b"VP8X"
    {
        let w = 1 + u32::from_le_bytes([bytes[24], bytes[25], bytes[26], 0]);
        let h = 1 + u32::from_le_bytes([bytes[27], bytes[28], bytes[29], 0]);
        Some((ForeignFormat::Webp, w, h))
    } else if bytes.len() >= 4 && bytes[0] == 0xff && bytes[1] == 0xd8 {
        jpeg_dimensions(bytes).map(|(w, h)| (ForeignFormat::Jpeg, w, h))
    } else {
        None
    };
    if let Some((format, width, height)) = parsed {
        if width == 0
            || height == 0
            || width > budget.limits().max_image_dimension
            || height > budget.limits().max_image_dimension
            || (width as u64).saturating_mul(height as u64) > budget.limits().max_image_pixels
        {
            return Err(SandboxError::Resource(
                "image dimension/pixel ceiling exceeded",
            ));
        }
        return Ok(Some((format, width, height)));
    }
    Ok(None)
}

fn image_icc_profile_count(bytes: &[u8], format: &ForeignFormat) -> usize {
    match format {
        ForeignFormat::Png => bytes.windows(4).filter(|window| *window == b"iCCP").count(),
        ForeignFormat::Jpeg => bytes
            .windows(11)
            .filter(|window| *window == b"ICC_PROFILE")
            .count(),
        ForeignFormat::Webp => bytes.windows(4).filter(|window| *window == b"ICCP").count(),
        _ => 0,
    }
}

fn jpeg_dimensions(bytes: &[u8]) -> Option<(u32, u32)> {
    let mut cursor = 2usize;
    while cursor + 4 <= bytes.len() {
        if bytes[cursor] != 0xff {
            cursor += 1;
            continue;
        }
        let marker = bytes[cursor + 1];
        cursor += 2;
        if marker == 0xd9 || marker == 0xda {
            break;
        }
        if cursor + 2 > bytes.len() {
            break;
        }
        let length = u16::from_be_bytes([bytes[cursor], bytes[cursor + 1]]) as usize;
        if length < 2 || cursor + length > bytes.len() {
            break;
        }
        if matches!(
            marker,
            0xc0 | 0xc1
                | 0xc2
                | 0xc3
                | 0xc5
                | 0xc6
                | 0xc7
                | 0xc9
                | 0xca
                | 0xcb
                | 0xcd
                | 0xce
                | 0xcf
        ) && length >= 7
        {
            let height = u16::from_be_bytes([bytes[cursor + 3], bytes[cursor + 4]]) as u32;
            let width = u16::from_be_bytes([bytes[cursor + 5], bytes[cursor + 6]]) as u32;
            return Some((width, height));
        }
        cursor += length;
    }
    None
}

fn looks_like_csv(bytes: &[u8]) -> bool {
    if bytes.len() > 64 * 1024 * 1024 {
        return false;
    }
    let Ok(text) = std::str::from_utf8(bytes) else {
        return false;
    };
    if text.contains('\0') {
        return false;
    }
    let sample = text.lines().take(32).collect::<Vec<_>>();
    if sample.is_empty() {
        return false;
    }
    let comma = sample.iter().filter(|line| line.contains(',')).count();
    let semi = sample.iter().filter(|line| line.contains(';')).count();
    let tab = sample.iter().filter(|line| line.contains('\t')).count();
    comma.max(semi).max(tab) >= sample.len().min(2)
}

fn simple_fidelity(label: &str, supported: Vec<&str>) -> FidelityReport {
    FidelityReport {
        source_format: label.to_string(),
        supported_features: supported.into_iter().map(str::to_string).collect(),
        unsupported_features: vec![],
        preserved_foreign_parts: vec![],
        dropped_active_parts: vec![],
        warnings: vec![],
        destructive_roundtrip_requires_confirmation: false,
    }
}

#[allow(clippy::too_many_arguments)]
fn base_report(
    format: ForeignFormat,
    file_name_hint: &str,
    size_bytes: u64,
    entry_count: usize,
    expanded_bytes: u64,
    max_ratio_milli: u64,
    active_content: ActiveContentDisposition,
    integrity_verified: bool,
    fidelity: FidelityReport,
    image_width: Option<u32>,
    image_height: Option<u32>,
    untrusted_resources: UntrustedResourceSummary,
) -> SandboxInspectionReport {
    SandboxInspectionReport {
        contract: SANDBOX_CONTRACT.to_string(),
        format,
        file_name_hint: sanitize_hint(file_name_hint),
        size_bytes,
        entry_count,
        expanded_bytes,
        max_observed_ratio_milli: max_ratio_milli,
        active_content,
        integrity_verified,
        parser_boundary: "isolated-native-worker".to_string(),
        image_width,
        image_height,
        untrusted_resources,
        fidelity,
    }
}

fn sanitize_hint(value: &str) -> String {
    value
        .chars()
        .filter(|ch| !ch.is_control())
        .take(240)
        .collect()
}

#[cfg(test)]
#[path = "formats_mutation_tests.rs"]
mod formats_mutation_tests;
#[cfg(test)]
#[path = "vwc_export_tests.rs"]
mod vwc_export_tests;
