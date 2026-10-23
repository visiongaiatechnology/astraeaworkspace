// STATUS: PLATIN
//! Deterministic hostile-byte mutation coverage for the sandbox's native parsers.

use crate::mutation_support::{
    assert_panic_free, bounded_limits, mutate_bytes, replace_range, MAX_MUTATION_BYTES,
    MUTATION_CASES,
};
use crate::{
    archive::inspect_zip,
    pdf::inspect_pdf_structure,
    xml::{collect_xml_start_elements, inspect_xml},
    Budget, ForeignFormat,
};

const VALID_RELATIONSHIPS: &[u8] = br#"<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="urn:document" Target="word/document.xml"/></Relationships>"#;

#[test]
fn zip_archive_parser_survives_4096_deterministic_hostile_mutations() {
    let seed = make_zip(&[("document.xml", b"<root/>")]);
    let budget = Budget::new(bounded_limits()).expect("valid bounded test limits");
    assert!(
        inspect_zip(&seed, &budget, 0).is_ok(),
        "valid ZIP seed rejected"
    );

    let cases = (0..MUTATION_CASES).map(|case| zip_case(&seed, case));
    assert_panic_free("ZIP/archive", cases, |bytes| inspect_zip(bytes, &budget, 0));
}

#[test]
fn xml_parser_survives_4096_deterministic_hostile_mutations() {
    let seed = br#"<root attr="ok"><child/></root>"#;
    let budget = Budget::new(bounded_limits()).expect("valid bounded test limits");
    assert!(
        inspect_xml(seed, &budget).is_ok(),
        "valid XML seed rejected"
    );

    let cases = (0..MUTATION_CASES).map(|case| xml_case(seed, case));
    assert_panic_free("XML", cases, |bytes| inspect_xml(bytes, &budget));
}

#[test]
fn pdf_xref_parser_survives_4096_deterministic_hostile_mutations() {
    let seed = minimal_pdf();
    let budget = Budget::new(bounded_limits()).expect("valid bounded test limits");
    assert!(
        inspect_pdf_structure(&seed, &budget).is_ok(),
        "valid PDF/xref seed rejected"
    );

    let cases = (0..MUTATION_CASES).map(|case| pdf_case(&seed, case));
    assert_panic_free("PDF/xref", cases, |bytes| {
        inspect_pdf_structure(bytes, &budget)
    });
}

#[test]
fn package_relationship_xml_survives_4096_deterministic_hostile_mutations() {
    let budget = Budget::new(bounded_limits()).expect("valid bounded test limits");
    let seed_elements =
        collect_xml_start_elements(VALID_RELATIONSHIPS, &budget, &["Relationship"], 32_768)
            .expect("valid OOXML relationship XML seed parses");
    assert_eq!(seed_elements.len(), 1);
    assert_eq!(
        seed_elements[0].namespace_uri.as_deref(),
        Some("http://schemas.openxmlformats.org/package/2006/relationships")
    );

    let cases = (0..MUTATION_CASES).map(relationship_case);
    assert_panic_free("OOXML package relationships", cases, |relationship_bytes| {
        collect_xml_start_elements(relationship_bytes, &budget, &["Relationship"], 32_768)
    });
}

#[test]
fn json_value_parser_survives_4096_deterministic_hostile_mutations() {
    let seed = br#"{"name":"Astraea","items":[1,true,null]}"#;
    assert!(
        serde_json::from_slice::<serde_json::Value>(seed).is_ok(),
        "valid JSON seed rejected"
    );

    let cases = (0..MUTATION_CASES).map(|case| json_case(seed, case));
    assert_panic_free("JSON value parser", cases, |bytes| {
        let _ = serde_json::from_slice::<serde_json::Value>(bytes);
    });

    let report = crate::inspect_bytes(seed, "mutation.json", bounded_limits())
        .expect("public inspection path accepts valid JSON seed");
    assert_eq!(report.format, ForeignFormat::Json);
}

fn zip_case(seed: &[u8], case: usize) -> Vec<u8> {
    match case {
        0 => seed.to_vec(),
        1 => {
            let inner = make_zip(&[("inside.bin", b"x")]);
            make_zip(&[("nested.zip", &inner)])
        }
        2 => {
            let middle = make_zip(&[("inner.zip", b"not-a-zip")]);
            make_zip(&[("nested.zip", &middle)])
        }
        3 => make_zip(&[("same.bin", b"first"), ("same.bin", b"second")]),
        4..=515 => {
            let keep = (case - 4) % seed.len();
            seed[..keep].to_vec()
        }
        516..=1_027 => mutate_zip_length_fields(seed, case),
        1_028..=1_539 => {
            let data = (case as u32).to_le_bytes();
            make_zip(&[("same.bin", &data), ("same.bin", &data)])
        }
        1_540..=1_795 => {
            let mut nested = make_zip(&[("leaf.bin", b"ok")]);
            let depth = 1 + case % 3;
            for level in 0..depth {
                nested = make_zip(&[("level.zip", &nested), ("level-id.bin", &[level as u8])]);
            }
            nested
        }
        _ => mutate_bytes(seed, case, 0x5a17_5eed_9f01_0001),
    }
}

fn mutate_zip_length_fields(seed: &[u8], case: usize) -> Vec<u8> {
    let mut bytes = seed.to_vec();
    let local_name_len = u16::from_le_bytes([bytes[26], bytes[27]]) as usize;
    let local_data_len = u32::from_le_bytes([bytes[18], bytes[19], bytes[20], bytes[21]]) as usize;
    let central = 30 + local_name_len + local_data_len;
    let eocd = bytes.len().saturating_sub(22);
    let fields = [
        (18usize, 4usize),
        (22, 4),
        (26, 2),
        (central + 20, 4),
        (central + 24, 4),
        (central + 28, 2),
        (central + 30, 2),
        (central + 32, 2),
        (central + 42, 4),
        (eocd + 8, 2),
        (eocd + 10, 2),
        (eocd + 12, 4),
        (eocd + 16, 4),
        (eocd + 20, 2),
    ];
    let (offset, width) = fields[(case - 516) % fields.len()];
    let variants = [0u32, 1, 0x7fff, u32::MAX, case as u32];
    let value = variants[(case / fields.len()) % variants.len()];
    if width == 2 {
        bytes[offset..offset + 2].copy_from_slice(&(value as u16).to_le_bytes());
    } else {
        bytes[offset..offset + 4].copy_from_slice(&value.to_le_bytes());
    }
    bytes
}

fn xml_case(seed: &[u8], case: usize) -> Vec<u8> {
    match case {
        0 => seed.to_vec(),
        1..=512 => {
            let keep = (case - 1) % seed.len();
            seed[..keep].to_vec()
        }
        513..=1_024 => format!("<root a=\"{case}\" a=\"duplicate\"/>").into_bytes(),
        1_025..=1_536 => {
            let depth = 1 + (case * 37 % 95);
            let mut xml = format!("<root id=\"{case}\">");
            for _ in 0..depth {
                xml.push_str("<n>");
            }
            xml.push_str("text");
            for _ in 0..depth {
                xml.push_str("</n>");
            }
            xml.push_str("</root>");
            xml.into_bytes()
        }
        1_537..=2_048 => {
            let mut bytes = seed.to_vec();
            let suffix = (case - 1_537) * 4;
            bytes
                .extend(std::iter::repeat_n(b'x', suffix.min(MAX_MUTATION_BYTES - bytes.len())));
            bytes
        }
        _ => mutate_bytes(seed, case, 0x58a1_0000_51ed_0002),
    }
}

fn minimal_pdf() -> Vec<u8> {
    let mut pdf = b"%PDF-1.7\n".to_vec();
    let xref_offset = pdf.len();
    pdf.extend_from_slice(b"xref\n0 1\n0000000000 65535 f \ntrailer\n<< /Size 1 >>\nstartxref\n");
    pdf.extend_from_slice(xref_offset.to_string().as_bytes());
    pdf.extend_from_slice(b"\n%%EOF\n");
    pdf
}

fn pdf_case(seed: &[u8], case: usize) -> Vec<u8> {
    match case {
        0 => seed.to_vec(),
        1..=512 => {
            let keep = (case - 1) % seed.len();
            seed[..keep].to_vec()
        }
        513..=1_024 => {
            let variants = [
                b"0".as_slice(),
                b"1",
                b"999999",
                b"18446744073709551615",
                b"999999999999999999999",
            ];
            replace_pdf_xref(seed, variants[(case - 513) % variants.len()])
        }
        1_025..=1_536 => {
            let marker = seed
                .windows(5)
                .rposition(|window| window == b"%%EOF")
                .unwrap_or(seed.len());
            let mut bytes = seed[..marker].to_vec();
            bytes.extend_from_slice(format!("startxref\n{}\n", case - 1_025).as_bytes());
            bytes.extend_from_slice(&seed[marker..]);
            bytes
        }
        _ => mutate_bytes(seed, case, 0x5044_462d_5852_4546),
    }
}

fn replace_pdf_xref(seed: &[u8], replacement: &[u8]) -> Vec<u8> {
    let Some(marker) = seed
        .windows(b"startxref".len())
        .rposition(|window| window == b"startxref")
    else {
        return seed.to_vec();
    };
    let digits_start = seed[marker + b"startxref".len()..]
        .iter()
        .position(|byte| byte.is_ascii_digit())
        .map(|offset| marker + b"startxref".len() + offset);
    let Some(digits_start) = digits_start else {
        return seed.to_vec();
    };
    let digits_end = seed[digits_start..]
        .iter()
        .position(|byte| !byte.is_ascii_digit())
        .map(|offset| digits_start + offset)
        .unwrap_or(seed.len());
    let mut bytes = seed.to_vec();
    replace_range(&mut bytes, digits_start..digits_end, replacement);
    bytes
}

fn relationship_case(case: usize) -> Vec<u8> {
    match case {
        0 => VALID_RELATIONSHIPS.to_vec(),
        1..=512 => {
            let keep = (case - 1) % VALID_RELATIONSHIPS.len();
            VALID_RELATIONSHIPS[..keep].to_vec()
        }
        513..=1_024 => {
            const TARGETS: &[&str] = &[
                "word/document.xml",
                "../escape.xml",
                "%2e%2e/%2e%2e/escape.xml",
                "https://example.invalid/remote.xml",
                "/word/document.xml",
                "word\\document.xml",
                "",
                "?query=1",
                "missing.xml",
                "%00.xml",
            ];
            relationship_xml(TARGETS[(case - 513) % TARGETS.len()], None)
        }
        1_025..=1_536 => {
            let count = 2 + (case % 5);
            let mut body = String::from("<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">");
            for index in 0..count {
                body.push_str(&format!("<Relationship Id=\"rId1\" Type=\"urn:duplicate:{case}:{index}\" Target=\"word/document.xml\"/>"));
            }
            body.push_str("</Relationships>");
            body.into_bytes()
        }
        1_537..=2_048 => {
            let depth = 1 + case % 32;
            let mut body = String::from("<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">");
            for level in 0..depth {
                body.push_str(&format!("<Wrapper level=\"{level}\">"));
            }
            body.push_str(&format!(
                "<Relationship Id=\"rId{case}\" Type=\"urn:nested\" Target=\"word/document.xml\"/>"
            ));
            for _ in 0..depth {
                body.push_str("</Wrapper>");
            }
            body.push_str("</Relationships>");
            body.into_bytes()
        }
        _ => mutate_bytes(VALID_RELATIONSHIPS, case, 0x5245_4c41_5449_4f4e),
    }
}

fn relationship_xml(target: &str, mode: Option<&str>) -> Vec<u8> {
    let target_mode = mode
        .map(|value| format!(" TargetMode=\"{value}\""))
        .unwrap_or_default();
    format!(
        "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"urn:document\" Target=\"{target}\"{target_mode}/></Relationships>"
    )
    .into_bytes()
}

fn json_case(seed: &[u8], case: usize) -> Vec<u8> {
    match case {
        0 => seed.to_vec(),
        1..=512 => {
            let keep = (case - 1) % seed.len();
            seed[..keep].to_vec()
        }
        513..=1_024 => {
            let depth = 1 + (case - 513) % 180;
            let mut json = String::from("{\"nested\":");
            json.extend(std::iter::repeat_n('[', depth));
            json.push('0');
            json.extend(std::iter::repeat_n(']', depth));
            json.push('}');
            json.into_bytes()
        }
        1_025..=1_536 => format!(
            "{{\"duplicate\":{case},\"duplicate\":{{\"n\":{}}}}}",
            case * 31
        )
        .into_bytes(),
        1_537..=2_048 => {
            let mut json = b"{\"n\":".to_vec();
            json.extend(std::iter::repeat_n(b'9', case - 1_536));
            json.extend_from_slice(b"}");
            json
        }
        _ => mutate_bytes(seed, case, 0x4a53_4f4e_0000_0005),
    }
}

fn make_zip(entries: &[(&str, &[u8])]) -> Vec<u8> {
    let mut archive = Vec::<u8>::new();
    let mut central_entries = Vec::<Vec<u8>>::new();

    for (name, data) in entries {
        let name_bytes = name.as_bytes();
        let name_len = u16::try_from(name_bytes.len()).expect("test ZIP name stays bounded");
        let data_len = u32::try_from(data.len()).expect("test ZIP content stays bounded");
        let crc = crc32fast::hash(data);
        let local_offset = u32::try_from(archive.len()).expect("test ZIP offset stays bounded");

        push_u32(&mut archive, 0x0403_4b50);
        push_u16(&mut archive, 20);
        push_u16(&mut archive, 0);
        push_u16(&mut archive, 0);
        push_u16(&mut archive, 0);
        push_u16(&mut archive, 0);
        push_u32(&mut archive, crc);
        push_u32(&mut archive, data_len);
        push_u32(&mut archive, data_len);
        push_u16(&mut archive, name_len);
        push_u16(&mut archive, 0);
        archive.extend_from_slice(name_bytes);
        archive.extend_from_slice(data);

        let mut central = Vec::new();
        push_u32(&mut central, 0x0201_4b50);
        push_u16(&mut central, 20);
        push_u16(&mut central, 20);
        push_u16(&mut central, 0);
        push_u16(&mut central, 0);
        push_u16(&mut central, 0);
        push_u16(&mut central, 0);
        push_u32(&mut central, crc);
        push_u32(&mut central, data_len);
        push_u32(&mut central, data_len);
        push_u16(&mut central, name_len);
        push_u16(&mut central, 0);
        push_u16(&mut central, 0);
        push_u16(&mut central, 0);
        push_u16(&mut central, 0);
        push_u32(&mut central, 0);
        push_u32(&mut central, local_offset);
        central.extend_from_slice(name_bytes);
        central_entries.push(central);
    }

    let central_offset = u32::try_from(archive.len()).expect("test ZIP central offset bounded");
    let mut central_size = 0usize;
    for entry in central_entries {
        central_size += entry.len();
        archive.extend_from_slice(&entry);
    }
    let central_size = u32::try_from(central_size).expect("test ZIP central size bounded");
    let count = u16::try_from(entries.len()).expect("test ZIP entry count bounded");
    push_u32(&mut archive, 0x0605_4b50);
    push_u16(&mut archive, 0);
    push_u16(&mut archive, 0);
    push_u16(&mut archive, count);
    push_u16(&mut archive, count);
    push_u32(&mut archive, central_size);
    push_u32(&mut archive, central_offset);
    push_u16(&mut archive, 0);
    archive.truncate(MAX_MUTATION_BYTES);
    archive
}

fn push_u16(output: &mut Vec<u8>, value: u16) {
    output.extend_from_slice(&value.to_le_bytes());
}

fn push_u32(output: &mut Vec<u8>, value: u32) {
    output.extend_from_slice(&value.to_le_bytes());
}
