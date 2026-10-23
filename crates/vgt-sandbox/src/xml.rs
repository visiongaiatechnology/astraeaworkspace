// STATUS: DIAMANT VGT SUPREME
//! Bounded, namespace-aware XML structural validation for hostile OOXML/ODF parts.
//!
//! This parser deliberately implements only the XML surface needed by the sandbox:
//! well-formed element/attribute structure, namespace bindings and bounded text. It
//! never resolves a DTD or external/general entity.

use crate::{Budget, Result, SandboxError};
use std::collections::{BTreeMap, HashSet};

const XML_NAMESPACE: &str = "http://www.w3.org/XML/1998/namespace";
const MAX_ATTRIBUTES_PER_ELEMENT: usize = 512;
pub(crate) const MAX_XML_COLLECTION_ELEMENTS: usize = 32_768;

#[derive(Debug, Clone)]
pub(crate) struct XmlStartElement {
    pub local_name: String,
    pub namespace_uri: Option<String>,
    pub attributes: BTreeMap<String, String>,
}

#[derive(Debug, Clone)]
struct OpenElement {
    qname: String,
    namespaces: BTreeMap<String, String>,
}

pub fn inspect_xml(bytes: &[u8], budget: &Budget) -> Result<()> {
    parse_xml(bytes, budget, &[], 0).map(|_| ())
}

pub(crate) fn collect_xml_start_elements(
    bytes: &[u8],
    budget: &Budget,
    wanted_local_names: &[&str],
    max_collected: usize,
) -> Result<Vec<XmlStartElement>> {
    if max_collected == 0 || max_collected > MAX_XML_COLLECTION_ELEMENTS {
        return Err(SandboxError::Resource("invalid XML collection ceiling"));
    }
    parse_xml(bytes, budget, wanted_local_names, max_collected)
}

fn parse_xml(
    bytes: &[u8],
    budget: &Budget,
    wanted_local_names: &[&str],
    max_collected: usize,
) -> Result<Vec<XmlStartElement>> {
    budget.checkpoint()?;
    if bytes.len() > budget.limits().max_xml_text_bytes {
        return Err(SandboxError::Resource("XML byte ceiling exceeded"));
    }
    let text =
        std::str::from_utf8(bytes).map_err(|_| SandboxError::Rejected("XML is not UTF-8"))?;
    let upper = text.to_ascii_uppercase();
    if upper.contains("<!DOCTYPE")
        || upper.contains("<!ENTITY")
        || upper.contains("<!NOTATION")
        || upper.contains("<!ELEMENT")
        || upper.contains("<!ATTLIST")
    {
        return Err(SandboxError::Rejected("XML DTD/external entity rejected"));
    }

    let wanted = wanted_local_names.iter().copied().collect::<HashSet<_>>();
    let raw = text.as_bytes();
    let mut index = 0usize;
    let mut elements = 0usize;
    let mut text_bytes = 0usize;
    let mut stack = Vec::<OpenElement>::new();
    let mut collected = Vec::<XmlStartElement>::new();

    while index < raw.len() {
        if index & 0x3fff == 0 {
            budget.checkpoint()?;
        }
        if raw[index] != b'<' {
            let next = raw[index..]
                .iter()
                .position(|byte| *byte == b'<')
                .map(|offset| index + offset)
                .unwrap_or(raw.len());
            let fragment = &text[index..next];
            validate_entity_refs(fragment)?;
            text_bytes = text_bytes
                .checked_add(fragment.len())
                .ok_or(SandboxError::Resource("XML text byte overflow"))?;
            if text_bytes > budget.limits().max_xml_text_bytes {
                return Err(SandboxError::Resource("XML text ceiling exceeded"));
            }
            index = next;
            continue;
        }

        if raw.get(index..index + 4) == Some(b"<!--") {
            let tail = &text[index + 4..];
            let end = tail
                .find("-->")
                .ok_or(SandboxError::Integrity("unterminated XML comment"))?;
            if tail[..end].contains("--") {
                return Err(SandboxError::Integrity("invalid XML comment"));
            }
            index += 4 + end + 3;
            continue;
        }
        if raw.get(index..index + 9) == Some(b"<![CDATA[") {
            let tail = &text[index + 9..];
            let end = tail
                .find("]]>")
                .ok_or(SandboxError::Integrity("unterminated XML CDATA"))?;
            text_bytes = text_bytes
                .checked_add(end)
                .ok_or(SandboxError::Resource("XML text byte overflow"))?;
            if text_bytes > budget.limits().max_xml_text_bytes {
                return Err(SandboxError::Resource("XML text ceiling exceeded"));
            }
            index += 9 + end + 3;
            continue;
        }
        if raw.get(index..index + 2) == Some(b"<?") {
            let tail = &text[index + 2..];
            let end = tail.find("?>").ok_or(SandboxError::Integrity(
                "unterminated XML processing instruction",
            ))?;
            index += 2 + end + 2;
            continue;
        }
        if raw.get(index..index + 2) == Some(b"<!") {
            return Err(SandboxError::Rejected("XML declaration rejected"));
        }

        let end = find_tag_end(text, index + 1)?;
        let raw_tag = text[index + 1..end].trim();
        if raw_tag.is_empty() {
            return Err(SandboxError::Integrity("empty XML tag"));
        }

        if let Some(rest) = raw_tag.strip_prefix('/') {
            let close_name = rest.trim();
            validate_qname(close_name)?;
            if close_name.chars().any(char::is_whitespace) {
                return Err(SandboxError::Integrity("invalid XML close tag"));
            }
            let open = stack
                .pop()
                .ok_or(SandboxError::Integrity("XML close-tag underflow"))?;
            if open.qname != close_name {
                return Err(SandboxError::Integrity("XML start/end tag mismatch"));
            }
            validate_bound_qname(close_name, &open.namespaces, true)?;
            index = end + 1;
            continue;
        }

        let self_closing = raw_tag.ends_with('/');
        let body = if self_closing {
            raw_tag[..raw_tag.len() - 1].trim_end()
        } else {
            raw_tag
        };
        let (qname, attributes) = parse_start_tag(body)?;
        elements += 1;
        if elements > budget.limits().max_xml_elements {
            return Err(SandboxError::Resource("XML element count exceeded"));
        }
        if stack.len() + 1 > budget.limits().max_xml_depth {
            return Err(SandboxError::Resource("XML nesting depth exceeded"));
        }

        let mut namespaces = stack
            .last()
            .map(|entry| entry.namespaces.clone())
            .unwrap_or_else(|| {
                let mut root = BTreeMap::new();
                root.insert("xml".to_string(), XML_NAMESPACE.to_string());
                root
            });
        for (name, value) in &attributes {
            if name == "xmlns" {
                namespaces.insert(String::new(), value.clone());
            } else if let Some(prefix) = name.strip_prefix("xmlns:") {
                validate_ncname(prefix)?;
                if prefix == "xmlns" || value.is_empty() {
                    return Err(SandboxError::Rejected("invalid XML namespace declaration"));
                }
                if prefix == "xml" && value != XML_NAMESPACE {
                    return Err(SandboxError::Rejected("xml namespace cannot be rebound"));
                }
                namespaces.insert(prefix.to_string(), value.clone());
            }
        }
        validate_bound_qname(&qname, &namespaces, true)?;
        for name in attributes.keys() {
            if name == "xmlns" || name.starts_with("xmlns:") {
                continue;
            }
            validate_bound_qname(name, &namespaces, false)?;
        }

        let (_, local_name) = split_qname(&qname)?;
        if wanted.contains(local_name) {
            if collected.len() >= max_collected {
                return Err(SandboxError::Resource(
                    "XML critical element collection exceeded",
                ));
            }
            let (prefix, _) = split_qname(&qname)?;
            let namespace_uri = prefix
                .and_then(|prefix| namespaces.get(prefix).cloned())
                .or_else(|| {
                    if prefix.is_none() {
                        namespaces.get("").cloned()
                    } else {
                        None
                    }
                });
            collected.push(XmlStartElement {
                local_name: local_name.to_string(),
                namespace_uri,
                attributes: attributes.clone(),
            });
        }

        if !self_closing {
            stack.push(OpenElement { qname, namespaces });
        }
        index = end + 1;
    }

    if !stack.is_empty() {
        return Err(SandboxError::Integrity("XML tags are unbalanced"));
    }
    Ok(collected)
}

fn find_tag_end(text: &str, start: usize) -> Result<usize> {
    let bytes = text.as_bytes();
    let mut quote = None::<u8>;
    for (offset, byte) in bytes[start..].iter().copied().enumerate() {
        match quote {
            Some(active) if byte == active => quote = None,
            Some(_) => {}
            None if byte == b'\'' || byte == b'"' => quote = Some(byte),
            None if byte == b'>' => return Ok(start + offset),
            None if byte == b'<' => return Err(SandboxError::Integrity("nested XML tag opener")),
            None => {}
        }
    }
    Err(SandboxError::Integrity("unterminated XML tag"))
}

fn parse_start_tag(tag: &str) -> Result<(String, BTreeMap<String, String>)> {
    let bytes = tag.as_bytes();
    let mut cursor = 0usize;
    skip_ws(bytes, &mut cursor);
    let name_start = cursor;
    while cursor < bytes.len() && !bytes[cursor].is_ascii_whitespace() {
        cursor += 1;
    }
    if name_start == cursor {
        return Err(SandboxError::Integrity("XML element name missing"));
    }
    let qname = &tag[name_start..cursor];
    validate_qname(qname)?;

    let mut attributes = BTreeMap::new();
    while cursor < bytes.len() {
        skip_ws(bytes, &mut cursor);
        if cursor >= bytes.len() {
            break;
        }
        let attr_start = cursor;
        while cursor < bytes.len() && !bytes[cursor].is_ascii_whitespace() && bytes[cursor] != b'='
        {
            cursor += 1;
        }
        if attr_start == cursor {
            return Err(SandboxError::Integrity("XML attribute name missing"));
        }
        let name = &tag[attr_start..cursor];
        validate_qname(name)?;
        skip_ws(bytes, &mut cursor);
        if bytes.get(cursor) != Some(&b'=') {
            return Err(SandboxError::Integrity("XML attribute assignment missing"));
        }
        cursor += 1;
        skip_ws(bytes, &mut cursor);
        let quote = *bytes
            .get(cursor)
            .ok_or(SandboxError::Integrity("XML attribute value missing"))?;
        if quote != b'\'' && quote != b'"' {
            return Err(SandboxError::Integrity(
                "XML attribute value must be quoted",
            ));
        }
        cursor += 1;
        let value_start = cursor;
        while cursor < bytes.len() && bytes[cursor] != quote {
            if bytes[cursor] == b'<' {
                return Err(SandboxError::Integrity("XML attribute contains tag opener"));
            }
            cursor += 1;
        }
        if cursor >= bytes.len() {
            return Err(SandboxError::Integrity("unterminated XML attribute"));
        }
        let value = &tag[value_start..cursor];
        validate_entity_refs(value)?;
        cursor += 1;
        if attributes
            .insert(name.to_string(), decode_basic_entities(value)?)
            .is_some()
        {
            return Err(SandboxError::Integrity("duplicate XML attribute"));
        }
        if attributes.len() > MAX_ATTRIBUTES_PER_ELEMENT {
            return Err(SandboxError::Resource("XML attribute count exceeded"));
        }
    }
    Ok((qname.to_string(), attributes))
}

fn skip_ws(bytes: &[u8], cursor: &mut usize) {
    while *cursor < bytes.len() && bytes[*cursor].is_ascii_whitespace() {
        *cursor += 1;
    }
}

fn validate_bound_qname(
    name: &str,
    namespaces: &BTreeMap<String, String>,
    element: bool,
) -> Result<()> {
    let (prefix, _) = split_qname(name)?;
    if let Some(prefix) = prefix {
        if prefix != "xml" && !namespaces.contains_key(prefix) {
            return Err(SandboxError::Rejected("undeclared XML namespace prefix"));
        }
    } else if element {
        let _ = namespaces.get("");
    }
    Ok(())
}

fn split_qname(name: &str) -> Result<(Option<&str>, &str)> {
    validate_qname(name)?;
    if let Some((prefix, local)) = name.split_once(':') {
        Ok((Some(prefix), local))
    } else {
        Ok((None, name))
    }
}

fn validate_qname(name: &str) -> Result<()> {
    if name.is_empty() || name.matches(':').count() > 1 {
        return Err(SandboxError::Integrity("invalid XML qualified name"));
    }
    if let Some((prefix, local)) = name.split_once(':') {
        validate_ncname(prefix)?;
        validate_ncname(local)?;
    } else {
        validate_ncname(name)?;
    }
    Ok(())
}

fn validate_ncname(value: &str) -> Result<()> {
    let mut chars = value.chars();
    let Some(first) = chars.next() else {
        return Err(SandboxError::Integrity("empty XML name"));
    };
    if !(first == '_' || first.is_ascii_alphabetic()) {
        return Err(SandboxError::Integrity("invalid XML name"));
    }
    if !chars.all(|ch| ch == '_' || ch == '-' || ch == '.' || ch.is_ascii_alphanumeric()) {
        return Err(SandboxError::Integrity("invalid XML name"));
    }
    Ok(())
}

fn validate_entity_refs(value: &str) -> Result<()> {
    let bytes = value.as_bytes();
    let mut cursor = 0usize;
    while let Some(offset) = value[cursor..].find('&') {
        let start = cursor + offset;
        let tail = &value[start + 1..];
        let end = tail
            .find(';')
            .ok_or(SandboxError::Rejected("unterminated XML entity reference"))?;
        let token = &tail[..end];
        let named = matches!(token, "lt" | "gt" | "amp" | "quot" | "apos");
        let numeric_value = if let Some(hex) = token.strip_prefix("#x") {
            if hex.is_empty() || hex.len() > 6 || !hex.chars().all(|ch| ch.is_ascii_hexdigit()) {
                None
            } else {
                u32::from_str_radix(hex, 16).ok()
            }
        } else if let Some(decimal) = token.strip_prefix('#') {
            if decimal.is_empty()
                || decimal.len() > 7
                || !decimal.chars().all(|ch| ch.is_ascii_digit())
            {
                None
            } else {
                decimal.parse::<u32>().ok()
            }
        } else {
            None
        };
        if !named && numeric_value.is_none() {
            return Err(SandboxError::Rejected(
                "general XML entity reference rejected",
            ));
        }
        if let Some(value) = numeric_value {
            if !is_valid_xml_code_point(value) {
                return Err(SandboxError::Rejected("invalid XML code point"));
            }
        }
        cursor = start + 1 + end + 1;
    }
    let _ = bytes;
    Ok(())
}

fn is_valid_xml_code_point(value: u32) -> bool {
    matches!(value, 0x9 | 0xA | 0xD | 0x20..=0xD7FF | 0xE000..=0xFFFD | 0x10000..=0x10FFFF)
}

fn decode_basic_entities(value: &str) -> Result<String> {
    let mut output = String::with_capacity(value.len());
    let mut cursor = 0usize;
    while let Some(offset) = value[cursor..].find('&') {
        let start = cursor + offset;
        output.push_str(&value[cursor..start]);
        let tail = &value[start + 1..];
        let end = tail
            .find(';')
            .ok_or(SandboxError::Rejected("unterminated XML entity reference"))?;
        let token = &tail[..end];
        match token {
            "lt" => output.push('<'),
            "gt" => output.push('>'),
            "amp" => output.push('&'),
            "quot" => output.push('"'),
            "apos" => output.push('\''),
            _ if token.starts_with("#x") => {
                let value = u32::from_str_radix(&token[2..], 16)
                    .map_err(|_| SandboxError::Rejected("invalid numeric XML entity"))?;
                if !is_valid_xml_code_point(value) {
                    return Err(SandboxError::Rejected("invalid XML code point"));
                }
                output.push(
                    char::from_u32(value)
                        .ok_or(SandboxError::Rejected("invalid XML code point"))?,
                );
            }
            _ if token.starts_with('#') => {
                let value = token[1..]
                    .parse::<u32>()
                    .map_err(|_| SandboxError::Rejected("invalid numeric XML entity"))?;
                if !is_valid_xml_code_point(value) {
                    return Err(SandboxError::Rejected("invalid XML code point"));
                }
                output.push(
                    char::from_u32(value)
                        .ok_or(SandboxError::Rejected("invalid XML code point"))?,
                );
            }
            _ => {
                return Err(SandboxError::Rejected(
                    "general XML entity reference rejected",
                ))
            }
        }
        cursor = start + 1 + end + 1;
    }
    output.push_str(&value[cursor..]);
    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::SandboxLimits;

    #[test]
    fn xml_containing_system_and_public_in_body_is_not_rejected() {
        let xml = b"<root><p>Das System ist public und funktioniert einwandfrei.</p></root>";
        let budget = Budget::new(SandboxLimits::default()).unwrap();
        assert!(inspect_xml(xml, &budget).is_ok());
    }

    #[test]
    fn xml_with_dtd_or_entity_is_rejected() {
        let xml_doctype = b"<!DOCTYPE test SYSTEM 'http://evil.com/test.dtd'><root/>";
        let budget = Budget::new(SandboxLimits::default()).unwrap();
        assert!(matches!(
            inspect_xml(xml_doctype, &budget),
            Err(SandboxError::Rejected(_))
        ));

        let xml_entity = b"<!ENTITY test 'xxe'><root/>";
        assert!(matches!(
            inspect_xml(xml_entity, &budget),
            Err(SandboxError::Rejected(_))
        ));
    }
}
