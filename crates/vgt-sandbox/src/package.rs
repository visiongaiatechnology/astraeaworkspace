// STATUS: DIAMANT VGT SUPREME
//! Semantic OOXML/ODF package validation layered on top of the bounded ZIP/XML gate.

use crate::archive::ValidatedArchive;
use crate::xml::{collect_xml_start_elements, XmlStartElement, MAX_XML_COLLECTION_ELEMENTS};
use crate::{Budget, ForeignFormat, Result, SandboxError};
use std::collections::{BTreeMap, HashSet};

const CONTENT_TYPES_NS: &str = "http://schemas.openxmlformats.org/package/2006/content-types";
const RELATIONSHIPS_NS: &str = "http://schemas.openxmlformats.org/package/2006/relationships";
const ODF_MANIFEST_NS: &str = "urn:oasis:names:tc:opendocument:xmlns:manifest:1.0";
const MAX_PACKAGE_METADATA_BYTES: usize = 4 * 1024 * 1024;
const MAX_RELATIONSHIPS: usize = 100_000;

#[derive(Debug, Clone, Copy, Default)]
pub(crate) struct PackageSemanticSummary {
    pub external_relationships: usize,
    pub embedded_fonts: usize,
    pub icc_profiles: usize,
}

pub(crate) fn validate_package_semantics(
    archive: &ValidatedArchive,
    format: &ForeignFormat,
    budget: &Budget,
) -> Result<PackageSemanticSummary> {
    budget.checkpoint()?;
    let (embedded_fonts, icc_profiles) = count_untrusted_resources(archive, budget)?;
    let external_relationships = match format {
        ForeignFormat::Docx | ForeignFormat::Xlsx | ForeignFormat::Pptx => {
            validate_ooxml_content_types(archive, format, budget)?;
            validate_ooxml_relationships(archive, budget)?
        }
        ForeignFormat::Odt | ForeignFormat::Ods | ForeignFormat::Odp => {
            validate_odf_manifest(archive, format, budget)?;
            0
        }
        _ => 0,
    };
    Ok(PackageSemanticSummary {
        external_relationships,
        embedded_fonts,
        icc_profiles,
    })
}

fn count_untrusted_resources(
    archive: &ValidatedArchive,
    budget: &Budget,
) -> Result<(usize, usize)> {
    let mut fonts = 0usize;
    let mut profiles = 0usize;
    for name in archive.entries.keys() {
        let lower = name.to_ascii_lowercase();
        if [".ttf", ".otf", ".ttc", ".woff", ".woff2", ".eot"]
            .iter()
            .any(|suffix| lower.ends_with(suffix))
        {
            fonts += 1;
            if fonts > budget.limits().max_embedded_font_parts {
                return Err(SandboxError::Resource("embedded font count exceeded"));
            }
        }
        if lower.ends_with(".icc") || lower.ends_with(".icm") {
            profiles += 1;
            if profiles > budget.limits().max_icc_profile_parts {
                return Err(SandboxError::Resource("ICC profile count exceeded"));
            }
        }
    }
    Ok((fonts, profiles))
}

fn validate_ooxml_content_types(
    archive: &ValidatedArchive,
    format: &ForeignFormat,
    budget: &Budget,
) -> Result<()> {
    let bytes = metadata_part(archive, "[Content_Types].xml")?;
    let elements = collect_xml_start_elements(
        bytes,
        budget,
        &["Default", "Override"],
        MAX_XML_COLLECTION_ELEMENTS,
    )?;
    let mut defaults = BTreeMap::<String, String>::new();
    let mut overrides = BTreeMap::<String, String>::new();
    for element in elements {
        require_namespace(&element, CONTENT_TYPES_NS)?;
        match element.local_name.as_str() {
            "Default" => {
                let extension = required_attr(&element, "Extension")?
                    .trim_start_matches('.')
                    .to_ascii_lowercase();
                let content_type = required_attr(&element, "ContentType")?;
                if extension.is_empty()
                    || content_type.is_empty()
                    || defaults.insert(extension, content_type).is_some()
                {
                    return Err(SandboxError::Integrity(
                        "duplicate or invalid OOXML default content type",
                    ));
                }
            }
            "Override" => {
                let part_name = normalize_part_name(&required_attr(&element, "PartName")?)?;
                let content_type = required_attr(&element, "ContentType")?;
                if content_type.is_empty() || overrides.insert(part_name, content_type).is_some() {
                    return Err(SandboxError::Integrity(
                        "duplicate or invalid OOXML override content type",
                    ));
                }
            }
            _ => {}
        }
    }
    if defaults.is_empty() && overrides.is_empty() {
        return Err(SandboxError::Rejected("OOXML content type map is empty"));
    }

    for name in archive.entries.keys() {
        if name == "[Content_Types].xml" || name.ends_with('/') {
            continue;
        }
        let canonical = format!("/{name}");
        if overrides.contains_key(&canonical) {
            continue;
        }
        let extension = name
            .rsplit_once('.')
            .map(|(_, extension)| extension.to_ascii_lowercase());
        if extension
            .as_ref()
            .is_some_and(|extension| defaults.contains_key(extension))
        {
            continue;
        }
        return Err(SandboxError::Rejected(
            "OOXML package part has no declared content type",
        ));
    }

    let (primary, expected) = match format {
        ForeignFormat::Docx => (
            "/word/document.xml",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",
        ),
        ForeignFormat::Xlsx => (
            "/xl/workbook.xml",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml",
        ),
        ForeignFormat::Pptx => (
            "/ppt/presentation.xml",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml",
        ),
        _ => return Ok(()),
    };
    if overrides.get(primary).map(String::as_str) != Some(expected) {
        return Err(SandboxError::Rejected(
            "OOXML primary part content type mismatch",
        ));
    }
    Ok(())
}

fn validate_ooxml_relationships(archive: &ValidatedArchive, budget: &Budget) -> Result<usize> {
    let mut relationship_count = 0usize;
    let mut external_count = 0usize;
    for (path, entry) in &archive.entries {
        if !path.to_ascii_lowercase().ends_with(".rels") {
            continue;
        }
        if entry.data.len() > MAX_PACKAGE_METADATA_BYTES {
            return Err(SandboxError::Resource("relationship part too large"));
        }
        let elements = collect_xml_start_elements(
            &entry.data,
            budget,
            &["Relationship"],
            MAX_XML_COLLECTION_ELEMENTS,
        )?;
        let mut ids = HashSet::<String>::new();
        for relationship in elements {
            require_namespace(&relationship, RELATIONSHIPS_NS)?;
            relationship_count += 1;
            if relationship_count > MAX_RELATIONSHIPS {
                return Err(SandboxError::Resource("relationship count exceeded"));
            }
            let id = required_attr(&relationship, "Id")?;
            let relation_type = required_attr(&relationship, "Type")?;
            let target = required_attr(&relationship, "Target")?;
            if id.is_empty() || relation_type.is_empty() || target.is_empty() || !ids.insert(id) {
                return Err(SandboxError::Integrity(
                    "invalid or duplicate OOXML relationship",
                ));
            }
            let target_mode = optional_attr(&relationship, "TargetMode");
            match target_mode.as_deref() {
                Some(value) if value.eq_ignore_ascii_case("External") => {
                    external_count += 1;
                }
                Some(_) => {
                    return Err(SandboxError::Rejected(
                        "unsupported OOXML relationship target mode",
                    ))
                }
                None => {
                    let resolved = resolve_relationship_target(path, &target)?;
                    if !archive.entries.contains_key(&resolved) {
                        return Err(SandboxError::Integrity(
                            "OOXML relationship target is missing",
                        ));
                    }
                }
            }
        }
    }
    Ok(external_count)
}

fn validate_odf_manifest(
    archive: &ValidatedArchive,
    format: &ForeignFormat,
    budget: &Budget,
) -> Result<()> {
    let expected_mime = match format {
        ForeignFormat::Odt => "application/vnd.oasis.opendocument.text",
        ForeignFormat::Ods => "application/vnd.oasis.opendocument.spreadsheet",
        ForeignFormat::Odp => "application/vnd.oasis.opendocument.presentation",
        _ => return Ok(()),
    };
    let mimetype = archive
        .entries
        .get("mimetype")
        .ok_or(SandboxError::Rejected("ODF mimetype entry missing"))?;
    if mimetype.method != 0 || mimetype.data != expected_mime.as_bytes() {
        return Err(SandboxError::Rejected(
            "ODF mimetype must be exact and stored",
        ));
    }
    if archive.entry_order.first().map(String::as_str) != Some("mimetype") {
        return Err(SandboxError::Rejected(
            "ODF mimetype must be the first archive entry",
        ));
    }

    let bytes = metadata_part(archive, "META-INF/manifest.xml")?;
    let elements =
        collect_xml_start_elements(bytes, budget, &["file-entry"], MAX_XML_COLLECTION_ELEMENTS)?;
    let mut listed = BTreeMap::<String, String>::new();
    for element in elements {
        require_namespace(&element, ODF_MANIFEST_NS)?;
        let full_path = required_attr(&element, "full-path")?;
        let media_type = required_attr(&element, "media-type")?;
        if listed.insert(full_path, media_type).is_some() {
            return Err(SandboxError::Integrity("duplicate ODF manifest entry"));
        }
    }
    if listed.get("/").map(String::as_str) != Some(expected_mime) {
        return Err(SandboxError::Rejected(
            "ODF manifest root media type mismatch",
        ));
    }
    if !listed.contains_key("content.xml") {
        return Err(SandboxError::Rejected(
            "ODF content.xml missing from manifest",
        ));
    }
    Ok(())
}

fn metadata_part<'a>(archive: &'a ValidatedArchive, name: &str) -> Result<&'a [u8]> {
    let entry = archive.entries.get(name).ok_or(SandboxError::Rejected(
        "required package metadata part missing",
    ))?;
    if entry.data.len() > MAX_PACKAGE_METADATA_BYTES {
        return Err(SandboxError::Resource("package metadata part too large"));
    }
    Ok(&entry.data)
}

fn require_namespace(element: &XmlStartElement, expected: &str) -> Result<()> {
    if element.namespace_uri.as_deref() != Some(expected) {
        return Err(SandboxError::Rejected(
            "package metadata namespace mismatch",
        ));
    }
    Ok(())
}

fn required_attr(element: &XmlStartElement, local_name: &str) -> Result<String> {
    optional_attr(element, local_name).ok_or(SandboxError::Rejected(
        "required package XML attribute missing",
    ))
}

fn optional_attr(element: &XmlStartElement, local_name: &str) -> Option<String> {
    let mut found = None::<String>;
    for (name, value) in &element.attributes {
        let local = name
            .rsplit_once(':')
            .map(|(_, local)| local)
            .unwrap_or(name);
        if local == local_name {
            if found.is_some() {
                return None;
            }
            found = Some(value.clone());
        }
    }
    found
}

fn normalize_part_name(part_name: &str) -> Result<String> {
    if !part_name.starts_with('/')
        || part_name.starts_with("//")
        || part_name.contains('\\')
        || part_name.contains('\0')
    {
        return Err(SandboxError::Rejected("invalid OOXML part name"));
    }
    let path = normalize_segments(part_name.trim_start_matches('/'))?;
    Ok(format!("/{path}"))
}

fn resolve_relationship_target(rels_path: &str, target: &str) -> Result<String> {
    let target = target.split('#').next().unwrap_or("");
    if target.is_empty() || target.contains('?') || target.contains('\\') || target.contains('\0') {
        return Err(SandboxError::Rejected(
            "ambiguous OOXML relationship target",
        ));
    }
    let decoded = percent_decode(target)?;
    let base = relationship_source_dir(rels_path)?;
    let joined = if decoded.starts_with('/') {
        decoded.trim_start_matches('/').to_string()
    } else if base.is_empty() {
        decoded
    } else {
        format!("{base}/{decoded}")
    };
    normalize_segments(&joined)
}

fn relationship_source_dir(rels_path: &str) -> Result<String> {
    if rels_path == "_rels/.rels" {
        return Ok(String::new());
    }
    let marker = "/_rels/";
    let Some(index) = rels_path.find(marker) else {
        return Err(SandboxError::Rejected(
            "invalid OOXML relationship part path",
        ));
    };
    let prefix = &rels_path[..index];
    let rel_name = &rels_path[index + marker.len()..];
    let source_name = rel_name
        .strip_suffix(".rels")
        .ok_or(SandboxError::Rejected(
            "invalid OOXML relationship part suffix",
        ))?;
    let source = if prefix.is_empty() {
        source_name.to_string()
    } else {
        format!("{prefix}/{source_name}")
    };
    Ok(source
        .rsplit_once('/')
        .map(|(dir, _)| dir.to_string())
        .unwrap_or_default())
}

fn normalize_segments(path: &str) -> Result<String> {
    let mut output = Vec::<&str>::new();
    for segment in path.split('/') {
        match segment {
            "" | "." => continue,
            ".." => {
                if output.pop().is_none() {
                    return Err(SandboxError::Rejected(
                        "package relationship escapes archive root",
                    ));
                }
            }
            value if value.contains(':') => {
                return Err(SandboxError::Rejected(
                    "package relationship contains URI scheme",
                ))
            }
            value => output.push(value),
        }
    }
    if output.is_empty() {
        return Err(SandboxError::Rejected("empty package relationship target"));
    }
    Ok(output.join("/"))
}

fn percent_decode(value: &str) -> Result<String> {
    let bytes = value.as_bytes();
    let mut output = Vec::<u8>::with_capacity(bytes.len());
    let mut cursor = 0usize;
    while cursor < bytes.len() {
        if bytes[cursor] != b'%' {
            output.push(bytes[cursor]);
            cursor += 1;
            continue;
        }
        if cursor + 2 >= bytes.len() {
            return Err(SandboxError::Rejected(
                "invalid percent-encoded relationship target",
            ));
        }
        let high = hex(bytes[cursor + 1])?;
        let low = hex(bytes[cursor + 2])?;
        output.push((high << 4) | low);
        cursor += 3;
    }
    String::from_utf8(output)
        .map_err(|_| SandboxError::Rejected("relationship target is not UTF-8"))
}

fn hex(value: u8) -> Result<u8> {
    match value {
        b'0'..=b'9' => Ok(value - b'0'),
        b'a'..=b'f' => Ok(value - b'a' + 10),
        b'A'..=b'F' => Ok(value - b'A' + 10),
        _ => Err(SandboxError::Rejected("invalid percent-encoding")),
    }
}

#[cfg(test)]
#[path = "package_mutation_tests.rs"]
mod package_mutation_tests;
