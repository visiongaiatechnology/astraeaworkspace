// STATUS: DIAMANT VGT SUPREME
use crate::{inspect_xml, Budget, PreservedForeignPart, Result, SandboxError};
use crc32fast::Hasher as Crc32;
use flate2::read::DeflateDecoder;
use std::collections::{BTreeMap, HashSet};
use std::io::Read;

const LOCAL_SIG: u32 = 0x0403_4b50;
const CENTRAL_SIG: u32 = 0x0201_4b50;
const EOCD_SIG: u32 = 0x0605_4b50;
const UTF8_FLAG: u16 = 1 << 11;
const ENCRYPTED_FLAG: u16 = 1 << 0;
const DATA_DESCRIPTOR_FLAG: u16 = 1 << 3;
const ALLOWED_FLAGS: u16 = (1 << 1) | (1 << 2) | DATA_DESCRIPTOR_FLAG | UTF8_FLAG;
const DATA_DESCRIPTOR_SIG: u32 = 0x0807_4b50;
const ZIP64_EXTRA_ID: u16 = 0x0001;
const UNICODE_PATH_EXTRA_ID: u16 = 0x7075;

#[derive(Debug, Clone)]
pub struct ArchiveEntry {
    pub name: String,
    pub compressed_size: u64,
    pub uncompressed_size: u64,
    pub crc32: u32,
    pub method: u16,
    pub data: Vec<u8>,
}

#[derive(Debug, Clone)]
pub struct ValidatedArchive {
    pub entries: BTreeMap<String, ArchiveEntry>,
    pub entry_order: Vec<String>,
    pub expanded_bytes: u64,
    pub max_ratio_milli: u64,
}

fn le_u16(bytes: &[u8], offset: usize) -> Result<u16> {
    let slice = bytes
        .get(offset..offset + 2)
        .ok_or(SandboxError::Integrity("truncated u16"))?;
    Ok(u16::from_le_bytes([slice[0], slice[1]]))
}

fn le_u32(bytes: &[u8], offset: usize) -> Result<u32> {
    let slice = bytes
        .get(offset..offset + 4)
        .ok_or(SandboxError::Integrity("truncated u32"))?;
    Ok(u32::from_le_bytes([slice[0], slice[1], slice[2], slice[3]]))
}

fn checked_add(a: usize, b: usize) -> Result<usize> {
    a.checked_add(b)
        .ok_or(SandboxError::Integrity("archive offset overflow"))
}

fn find_eocd(bytes: &[u8]) -> Result<usize> {
    if bytes.len() < 22 {
        return Err(SandboxError::Integrity("ZIP EOCD missing"));
    }
    let minimum = bytes.len().saturating_sub(22 + 65_535);
    for offset in (minimum..=bytes.len() - 22).rev() {
        if le_u32(bytes, offset)? == EOCD_SIG {
            return Ok(offset);
        }
    }
    Err(SandboxError::Integrity("ZIP EOCD missing"))
}

fn safe_name(name: &str, budget: &Budget) -> Result<String> {
    if name.is_empty() || name.len() > budget.limits().max_path_bytes || name.contains('\0') {
        return Err(SandboxError::Rejected("archive path rejected"));
    }
    let normalized = name.replace('\\', "/");
    if normalized.starts_with('/') || normalized.starts_with("//") {
        return Err(SandboxError::Rejected("absolute archive path rejected"));
    }
    let bytes = normalized.as_bytes();
    if bytes.len() >= 2 && bytes[1] == b':' && bytes[0].is_ascii_alphabetic() {
        return Err(SandboxError::Rejected(
            "drive-qualified archive path rejected",
        ));
    }
    let segments = normalized.split('/').collect::<Vec<_>>();
    if segments.len() > budget.limits().max_path_segments {
        return Err(SandboxError::Resource("archive path nesting exceeded"));
    }
    if segments
        .iter()
        .any(|segment| *segment == ".." || *segment == ".")
    {
        return Err(SandboxError::Rejected("archive path traversal rejected"));
    }
    if segments
        .iter()
        .enumerate()
        .any(|(index, segment)| segment.is_empty() && index + 1 != segments.len())
    {
        return Err(SandboxError::Rejected("ambiguous archive path rejected"));
    }
    Ok(normalized)
}

fn decode_name(raw: &[u8], flags: u16) -> Result<String> {
    if flags & UTF8_FLAG == 0 && raw.iter().any(|byte| *byte >= 0x80) {
        return Err(SandboxError::Rejected("non-UTF8 ZIP names rejected"));
    }
    std::str::from_utf8(raw)
        .map(str::to_owned)
        .map_err(|_| SandboxError::Rejected("invalid UTF-8 ZIP name"))
}

fn inspect_extra_fields(extra: &[u8]) -> Result<()> {
    let mut cursor = 0usize;
    while cursor < extra.len() {
        if cursor + 4 > extra.len() {
            return Err(SandboxError::Integrity("truncated ZIP extra field"));
        }
        let id = u16::from_le_bytes([extra[cursor], extra[cursor + 1]]);
        let size = u16::from_le_bytes([extra[cursor + 2], extra[cursor + 3]]) as usize;
        cursor += 4;
        let end = cursor
            .checked_add(size)
            .ok_or(SandboxError::Integrity("ZIP extra field overflow"))?;
        if end > extra.len() {
            return Err(SandboxError::Integrity("ZIP extra field outside header"));
        }
        if id == ZIP64_EXTRA_ID {
            return Err(SandboxError::Rejected(
                "ZIP64 extra field rejected by bounded profile",
            ));
        }
        if id == UNICODE_PATH_EXTRA_ID {
            return Err(SandboxError::Rejected(
                "Unicode path override extra field rejected",
            ));
        }
        cursor = end;
    }
    Ok(())
}

fn verify_data_descriptor(
    bytes: &[u8],
    data_end: usize,
    crc: u32,
    compressed: usize,
    uncompressed: usize,
) -> Result<()> {
    let mut cursor = data_end;
    if bytes
        .get(cursor..cursor + 4)
        .and_then(|slice| slice.try_into().ok())
        .map(u32::from_le_bytes)
        == Some(DATA_DESCRIPTOR_SIG)
    {
        cursor += 4;
    }
    if cursor + 12 > bytes.len() {
        return Err(SandboxError::Integrity("ZIP data descriptor truncated"));
    }
    let descriptor_crc = le_u32(bytes, cursor)?;
    let descriptor_compressed = le_u32(bytes, cursor + 4)? as usize;
    let descriptor_uncompressed = le_u32(bytes, cursor + 8)? as usize;
    if descriptor_crc != crc
        || descriptor_compressed != compressed
        || descriptor_uncompressed != uncompressed
    {
        return Err(SandboxError::Integrity("ZIP data descriptor mismatch"));
    }
    Ok(())
}

fn decompress(method: u16, compressed: &[u8], expected: usize, budget: &Budget) -> Result<Vec<u8>> {
    budget.checkpoint()?;
    match method {
        0 => {
            if compressed.len() != expected {
                return Err(SandboxError::Integrity("stored entry size mismatch"));
            }
            Ok(compressed.to_vec())
        }
        8 => {
            let mut decoder = DeflateDecoder::new(compressed);
            let take_limit = expected.saturating_add(1) as u64;
            let mut output = Vec::with_capacity(expected.min(8 * 1024 * 1024));
            decoder.by_ref().take(take_limit).read_to_end(&mut output)?;
            if output.len() != expected {
                return Err(SandboxError::Integrity("deflate size mismatch"));
            }
            Ok(output)
        }
        _ => Err(SandboxError::Rejected("unsupported ZIP compression method")),
    }
}

pub fn inspect_zip(bytes: &[u8], budget: &Budget, depth: usize) -> Result<ValidatedArchive> {
    budget.checkpoint()?;
    if depth > budget.limits().max_archive_depth {
        return Err(SandboxError::Resource("archive recursion limit exceeded"));
    }
    if bytes.len() as u64 > budget.limits().max_input_bytes {
        return Err(SandboxError::Resource("archive input too large"));
    }

    let eocd = find_eocd(bytes)?;
    let disk = le_u16(bytes, eocd + 4)?;
    let central_disk = le_u16(bytes, eocd + 6)?;
    let disk_entries = le_u16(bytes, eocd + 8)?;
    let entries_total = le_u16(bytes, eocd + 10)?;
    let central_size = le_u32(bytes, eocd + 12)? as usize;
    let central_offset = le_u32(bytes, eocd + 16)? as usize;
    if disk != 0 || central_disk != 0 || disk_entries != entries_total {
        return Err(SandboxError::Rejected("multi-disk ZIP rejected"));
    }
    if entries_total == u16::MAX
        || central_size == u32::MAX as usize
        || central_offset == u32::MAX as usize
    {
        return Err(SandboxError::Rejected(
            "ZIP64 rejected by bounded sandbox profile",
        ));
    }
    if entries_total as usize > budget.limits().max_entries {
        return Err(SandboxError::Resource("archive entry count exceeded"));
    }
    let central_end = checked_add(central_offset, central_size)?;
    if central_end > eocd || central_end > bytes.len() {
        return Err(SandboxError::Integrity("central directory outside archive"));
    }

    let mut cursor = central_offset;
    let mut names = HashSet::new();
    let mut entries = BTreeMap::new();
    let mut entry_order = Vec::new();
    let mut expanded = 0u64;
    let mut max_ratio_milli = 0u64;

    for _ in 0..entries_total {
        budget.checkpoint()?;
        if le_u32(bytes, cursor)? != CENTRAL_SIG {
            return Err(SandboxError::Integrity(
                "invalid central directory signature",
            ));
        }
        let flags = le_u16(bytes, cursor + 8)?;
        let method = le_u16(bytes, cursor + 10)?;
        let expected_crc = le_u32(bytes, cursor + 16)?;
        let compressed_size = le_u32(bytes, cursor + 20)? as usize;
        let uncompressed_size = le_u32(bytes, cursor + 24)? as usize;
        let name_len = le_u16(bytes, cursor + 28)? as usize;
        let extra_len = le_u16(bytes, cursor + 30)? as usize;
        let comment_len = le_u16(bytes, cursor + 32)? as usize;
        let local_offset = le_u32(bytes, cursor + 42)? as usize;
        let end = checked_add(
            checked_add(checked_add(cursor + 46, name_len)?, extra_len)?,
            comment_len,
        )?;
        if end > bytes.len() {
            return Err(SandboxError::Integrity("central directory entry truncated"));
        }
        if flags & ENCRYPTED_FLAG != 0 {
            return Err(SandboxError::Rejected("encrypted ZIP entry rejected"));
        }
        if flags & !ALLOWED_FLAGS != 0 {
            return Err(SandboxError::Rejected(
                "unsupported or ambiguous ZIP general-purpose flags",
            ));
        }
        if method == 0 && flags & ((1 << 1) | (1 << 2)) != 0 {
            return Err(SandboxError::Rejected(
                "stored ZIP entry has deflate option flags",
            ));
        }
        if uncompressed_size as u64 > budget.limits().max_entry_bytes {
            return Err(SandboxError::Resource("archive entry too large"));
        }
        expanded = expanded
            .checked_add(uncompressed_size as u64)
            .ok_or(SandboxError::Resource("archive expanded size overflow"))?;
        if expanded > budget.limits().max_expanded_bytes {
            return Err(SandboxError::Resource("archive expanded size exceeded"));
        }
        let ratio_milli = if uncompressed_size == 0 {
            1000
        } else {
            (uncompressed_size as u64).saturating_mul(1000) / (compressed_size.max(1) as u64)
        };
        max_ratio_milli = max_ratio_milli.max(ratio_milli);
        if uncompressed_size > 64 * 1024
            && ratio_milli > budget.limits().max_compression_ratio.saturating_mul(1000)
        {
            return Err(SandboxError::Resource("archive compression ratio exceeded"));
        }

        let raw_name = bytes
            .get(cursor + 46..cursor + 46 + name_len)
            .ok_or(SandboxError::Integrity("entry name truncated"))?;
        let central_extra_start = cursor + 46 + name_len;
        let central_extra = bytes
            .get(central_extra_start..central_extra_start + extra_len)
            .ok_or(SandboxError::Integrity("central extra field truncated"))?;
        inspect_extra_fields(central_extra)?;
        let name = safe_name(&decode_name(raw_name, flags)?, budget)?;
        let collision_key = name.to_ascii_lowercase();
        if !names.insert(collision_key) {
            return Err(SandboxError::Rejected(
                "duplicate or case-colliding archive entry",
            ));
        }

        if local_offset >= central_offset {
            return Err(SandboxError::Integrity(
                "ZIP local header overlaps central directory",
            ));
        }
        if le_u32(bytes, local_offset)? != LOCAL_SIG {
            return Err(SandboxError::Integrity("invalid local header signature"));
        }
        let local_flags = le_u16(bytes, local_offset + 6)?;
        let local_method = le_u16(bytes, local_offset + 8)?;
        let local_crc = le_u32(bytes, local_offset + 14)?;
        let local_comp = le_u32(bytes, local_offset + 18)? as usize;
        let local_uncomp = le_u32(bytes, local_offset + 22)? as usize;
        let local_name_len = le_u16(bytes, local_offset + 26)? as usize;
        let local_extra_len = le_u16(bytes, local_offset + 28)? as usize;
        let local_name_end = checked_add(local_offset + 30, local_name_len)?;
        if local_name_end > bytes.len() {
            return Err(SandboxError::Integrity("local entry name truncated"));
        }
        let local_name = safe_name(
            &decode_name(&bytes[local_offset + 30..local_name_end], local_flags)?,
            budget,
        )?;
        let local_extra = bytes
            .get(local_name_end..local_name_end + local_extra_len)
            .ok_or(SandboxError::Integrity("local extra field truncated"))?;
        inspect_extra_fields(local_extra)?;
        if local_name != name || local_flags != flags || local_method != method {
            return Err(SandboxError::Integrity("central/local header mismatch"));
        }
        let deferred = flags & DATA_DESCRIPTOR_FLAG != 0
            && local_crc == 0
            && local_comp == 0
            && local_uncomp == 0;
        if !deferred
            && (local_crc != expected_crc
                || local_comp != compressed_size
                || local_uncomp != uncompressed_size)
        {
            return Err(SandboxError::Integrity(
                "central/local size or CRC mismatch",
            ));
        }
        let data_offset = checked_add(local_name_end, local_extra_len)?;
        let data_end = checked_add(data_offset, compressed_size)?;
        if data_end > bytes.len() {
            return Err(SandboxError::Integrity("entry data outside archive"));
        }
        if flags & DATA_DESCRIPTOR_FLAG != 0 {
            verify_data_descriptor(
                bytes,
                data_end,
                expected_crc,
                compressed_size,
                uncompressed_size,
            )?;
        }
        let data = decompress(
            method,
            &bytes[data_offset..data_end],
            uncompressed_size,
            budget,
        )?;
        let mut crc = Crc32::new();
        crc.update(&data);
        if crc.finalize() != expected_crc {
            return Err(SandboxError::Integrity("ZIP CRC mismatch"));
        }

        if name.to_ascii_lowercase().ends_with(".xml")
            || name.to_ascii_lowercase().ends_with(".rels")
        {
            inspect_xml(&data, budget)?;
        }
        if depth < budget.limits().max_archive_depth
            && data.len() >= 4
            && data[..4] == [0x50, 0x4b, 0x03, 0x04]
        {
            let _ = inspect_zip(&data, budget, depth + 1)?;
        }

        entry_order.push(name.clone());
        entries.insert(
            name.clone(),
            ArchiveEntry {
                name,
                compressed_size: compressed_size as u64,
                uncompressed_size: uncompressed_size as u64,
                crc32: expected_crc,
                method,
                data,
            },
        );
        cursor = end;
    }

    if cursor != central_offset + central_size {
        return Err(SandboxError::Integrity("central directory length mismatch"));
    }
    Ok(ValidatedArchive {
        entries,
        entry_order,
        expanded_bytes: expanded,
        max_ratio_milli,
    })
}

pub fn preservation_candidates(
    archive: &ValidatedArchive,
    reserved: &HashSet<String>,
    budget: &Budget,
) -> Vec<PreservedForeignPart> {
    let mut output = Vec::new();
    let mut total = 0u64;
    for entry in archive.entries.values() {
        if output.len() >= budget.limits().max_preserved_parts {
            break;
        }
        if reserved.contains(&entry.name)
            || entry.uncompressed_size > budget.limits().max_preserved_part_bytes
        {
            continue;
        }
        let lower = entry.name.to_ascii_lowercase();
        if total.saturating_add(entry.uncompressed_size) > budget.limits().max_preserved_total_bytes
        {
            break;
        }
        total = total.saturating_add(entry.uncompressed_size);
        output.push(PreservedForeignPart {
            path: entry.name.clone(),
            size_bytes: entry.uncompressed_size,
            blake3: blake3::hash(&entry.data).to_hex().to_string(),
            media_hint: media_hint(&lower).to_string(),
            quarantined: is_active_part(&lower),
        });
    }
    output
}

pub fn is_active_part(lower: &str) -> bool {
    lower.contains("vbaproject")
        || lower.contains("activex")
        || lower.contains("macrosheet")
        || lower.contains("oleobject")
        || lower.ends_with(".vba")
        || lower.ends_with(".bin") && (lower.contains("vba") || lower.contains("ole"))
}

fn media_hint(lower: &str) -> &'static str {
    if lower.ends_with(".xml") || lower.ends_with(".rels") {
        "application/xml"
    } else if lower.ends_with(".png") {
        "image/png"
    } else if lower.ends_with(".jpg") || lower.ends_with(".jpeg") {
        "image/jpeg"
    } else if lower.ends_with(".gif") {
        "image/gif"
    } else if lower.ends_with(".webp") {
        "image/webp"
    } else {
        "application/octet-stream"
    }
}
