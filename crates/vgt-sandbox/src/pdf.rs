// STATUS: DIAMANT VGT SUPREME
//! Passive bounded PDF structural preflight. This module never evaluates actions,
//! JavaScript, launch dictionaries, fonts, ICC profiles or embedded files.

use crate::{Budget, Result, SandboxError};

const ACTIVE_MARKERS: &[&[u8]] = &[
    b"/JavaScript",
    b"/JS",
    b"/Launch",
    b"/OpenAction",
    b"/AA",
    b"/RichMedia",
    b"/SubmitForm",
    b"/ImportData",
    b"/GoToR",
];
const EXTERNAL_MARKERS: &[&[u8]] = &[b"/URI", b"/GoToR", b"/SubmitForm", b"/ImportData"];
const RESOURCE_MARKERS: &[&[u8]] = &[
    b"/Resources",
    b"/XObject",
    b"/Pattern",
    b"/Shading",
    b"/ExtGState",
];

#[derive(Debug, Clone, Default)]
pub(crate) struct PdfInspection {
    pub objects: usize,
    pub embedded_fonts: usize,
    pub icc_profiles: usize,
    pub external_references: usize,
    pub active_markers: Vec<String>,
}

pub(crate) fn inspect_pdf_structure(bytes: &[u8], budget: &Budget) -> Result<PdfInspection> {
    budget.checkpoint()?;
    let header_window = &bytes[..bytes.len().min(1024)];
    if find_subslice(header_window, b"%PDF-").is_none() {
        return Err(SandboxError::Rejected("invalid PDF header"));
    }
    let tail_start = bytes.len().saturating_sub(8192);
    let tail = &bytes[tail_start..];
    let eof_relative =
        rfind_subslice(tail, b"%%EOF").ok_or(SandboxError::Integrity("PDF EOF marker missing"))?;
    let eof = tail_start + eof_relative;
    let startxref_relative = rfind_subslice(&bytes[..eof], b"startxref")
        .ok_or(SandboxError::Integrity("PDF startxref missing"))?;
    let xref_offset = parse_startxref_offset(bytes, startxref_relative)?;
    validate_xref_target(bytes, xref_offset)?;

    let objects = count_subslice(bytes, b" obj");
    let pages = count_subslice(bytes, b"/Type /Page")
        .saturating_sub(count_subslice(bytes, b"/Type /Pages"));
    let streams = count_subslice(bytes, b"stream");
    let xref_sections = count_subslice(bytes, b"startxref");
    let resources = RESOURCE_MARKERS
        .iter()
        .map(|marker| count_subslice(bytes, marker))
        .sum::<usize>();
    let embedded_fonts =
        count_subslice(bytes, b"/Font").saturating_add(count_subslice(bytes, b"/FontFile"));
    let icc_profiles =
        count_subslice(bytes, b"/ICCBased").saturating_add(count_subslice(bytes, b"/OutputIntent"));
    let external_references = EXTERNAL_MARKERS
        .iter()
        .map(|marker| count_subslice(bytes, marker))
        .sum::<usize>();

    if objects > budget.limits().max_pdf_objects {
        return Err(SandboxError::Resource("PDF object count exceeded"));
    }
    if pages > budget.limits().max_pdf_pages {
        return Err(SandboxError::Resource("PDF page count exceeded"));
    }
    if streams > budget.limits().max_pdf_streams {
        return Err(SandboxError::Resource("PDF stream count exceeded"));
    }
    if xref_sections == 0 || xref_sections > budget.limits().max_pdf_xref_sections {
        return Err(SandboxError::Resource("PDF xref section count exceeded"));
    }
    if resources > budget.limits().max_pdf_resources {
        return Err(SandboxError::Resource("PDF resource count exceeded"));
    }
    if embedded_fonts > budget.limits().max_embedded_font_parts {
        return Err(SandboxError::Resource("PDF font resource count exceeded"));
    }
    if icc_profiles > budget.limits().max_icc_profile_parts {
        return Err(SandboxError::Resource("PDF ICC profile count exceeded"));
    }

    let active_markers = ACTIVE_MARKERS
        .iter()
        .filter(|marker| find_subslice(bytes, marker).is_some())
        .map(|marker| String::from_utf8_lossy(marker).into_owned())
        .collect::<Vec<_>>();

    Ok(PdfInspection {
        objects,
        embedded_fonts,
        icc_profiles,
        external_references,
        active_markers,
    })
}

fn parse_startxref_offset(bytes: &[u8], marker: usize) -> Result<usize> {
    let mut cursor = marker + b"startxref".len();
    while cursor < bytes.len() && bytes[cursor].is_ascii_whitespace() {
        cursor += 1;
    }
    let start = cursor;
    while cursor < bytes.len() && bytes[cursor].is_ascii_digit() {
        cursor += 1;
    }
    if start == cursor || cursor - start > 20 {
        return Err(SandboxError::Integrity("invalid PDF startxref offset"));
    }
    let value = std::str::from_utf8(&bytes[start..cursor])
        .map_err(|_| SandboxError::Integrity("invalid PDF startxref encoding"))?
        .parse::<u64>()
        .map_err(|_| SandboxError::Integrity("invalid PDF startxref number"))?;
    usize::try_from(value).map_err(|_| SandboxError::Integrity("PDF startxref offset overflow"))
}

fn validate_xref_target(bytes: &[u8], offset: usize) -> Result<()> {
    if offset >= bytes.len() {
        return Err(SandboxError::Integrity("PDF startxref points outside file"));
    }
    let mut cursor = offset;
    while cursor < bytes.len() && bytes[cursor].is_ascii_whitespace() {
        cursor += 1;
    }
    if bytes.get(cursor..cursor + 4) == Some(b"xref") {
        return Ok(());
    }
    let end = (cursor + 8192).min(bytes.len());
    let window = &bytes[cursor..end];
    let object_marker = find_subslice(window, b" obj");
    let xref_stream_marker = find_subslice(window, b"/Type /XRef");
    if object_marker.is_some() && xref_stream_marker.is_some() {
        return Ok(());
    }
    Err(SandboxError::Integrity(
        "PDF startxref target is not xref table/stream",
    ))
}

fn count_subslice(haystack: &[u8], needle: &[u8]) -> usize {
    if needle.is_empty() || haystack.len() < needle.len() {
        return 0;
    }
    let mut count = 0usize;
    let mut cursor = 0usize;
    while cursor + needle.len() <= haystack.len() {
        let Some(relative) = find_subslice(&haystack[cursor..], needle) else {
            break;
        };
        count += 1;
        cursor += relative + needle.len();
    }
    count
}

fn find_subslice(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    if needle.is_empty() {
        return Some(0);
    }
    haystack
        .windows(needle.len())
        .position(|window| window == needle)
}

fn rfind_subslice(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    if needle.is_empty() {
        return Some(haystack.len());
    }
    haystack
        .windows(needle.len())
        .rposition(|window| window == needle)
}
