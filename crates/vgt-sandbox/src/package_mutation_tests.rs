// STATUS: PLATIN
//! Direct mutations of package relationship target resolution.

use super::{resolve_relationship_target, validate_ooxml_relationships, MAX_RELATIONSHIPS};
use crate::mutation_support::{assert_panic_free, bounded_limits, mutate_bytes, MUTATION_CASES};
use crate::xml::{collect_xml_start_elements, MAX_XML_COLLECTION_ELEMENTS};
use crate::{ArchiveEntry, Budget, ValidatedArchive};
use std::collections::BTreeMap;

const VALID_RELATIONSHIPS: &[u8] = br#"<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="urn:document" Target="https://example.invalid/document.xml" TargetMode="External"/></Relationships>"#;
const _: () = assert!(MAX_RELATIONSHIPS > MAX_XML_COLLECTION_ELEMENTS);

#[test]
fn relationship_target_resolver_survives_4096_deterministic_hostile_mutations() {
    assert_eq!(
        resolve_relationship_target("_rels/.rels", "word/document.xml")
            .expect("valid root relationship target resolves"),
        "word/document.xml"
    );

    let cases = (0..MUTATION_CASES).map(target_case);
    assert_panic_free("OOXML relationship target resolution", cases, |bytes| {
        let target = String::from_utf8_lossy(bytes);
        resolve_relationship_target("_rels/.rels", &target)
    });
}

#[test]
fn relationship_validator_uses_the_xml_ceiling_and_accepts_valid_parts() {
    let budget = Budget::new(bounded_limits()).expect("valid bounded test limits");
    let parsed_at_collector_ceiling = collect_xml_start_elements(
        VALID_RELATIONSHIPS,
        &budget,
        &["Relationship"],
        MAX_XML_COLLECTION_ELEMENTS,
    )
    .expect("valid relationship XML fits the collector ceiling");
    assert_eq!(parsed_at_collector_ceiling.len(), 1);
    assert_eq!(MAX_RELATIONSHIPS, 100_000);
    assert_eq!(
        validate_ooxml_relationships(&relationship_archive(VALID_RELATIONSHIPS), &budget)
            .expect("valid relationship part must pass bounded package validation"),
        1,
        "one declared external relationship is counted"
    );
}

#[test]
fn relationship_package_validator_survives_4096_deterministic_mutations() {
    let budget = Budget::new(bounded_limits()).expect("valid bounded test limits");
    let cases = (0..MUTATION_CASES)
        .map(|case| mutate_bytes(VALID_RELATIONSHIPS, case, 0x5041_434b_5245_4c53));

    assert_panic_free("OOXML relationship package validator", cases, |bytes| {
        let _ = validate_ooxml_relationships(&relationship_archive(bytes), &budget);
    });
}

fn relationship_archive(bytes: &[u8]) -> ValidatedArchive {
    let mut entries = BTreeMap::new();
    entries.insert(
        "_rels/.rels".to_string(),
        ArchiveEntry {
            name: "_rels/.rels".to_string(),
            compressed_size: bytes.len() as u64,
            uncompressed_size: bytes.len() as u64,
            crc32: 0,
            method: 0,
            data: bytes.to_vec(),
        },
    );
    ValidatedArchive {
        entries,
        entry_order: vec!["_rels/.rels".to_string()],
        expanded_bytes: bytes.len() as u64,
        max_ratio_milli: 1_000,
    }
}

fn target_case(case: usize) -> Vec<u8> {
    match case {
        0 => b"word/document.xml".to_vec(),
        1..=512 => {
            let seed = b"word/document.xml";
            let keep = (case - 1) % seed.len();
            seed[..keep].to_vec()
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
                "%2fetc/passwd",
                "%zz",
            ];
            TARGETS[(case - 513) % TARGETS.len()].as_bytes().to_vec()
        }
        1_025..=1_536 => {
            let depth = 1 + case - 1_025;
            format!("{}leaf.xml", "../".repeat(depth)).into_bytes()
        }
        1_537..=2_048 => {
            let payloads = ["%", "%0", "%GG", "%FF", "%00", "%2e", "%2f"];
            format!(
                "word/{}-{}.xml",
                payloads[(case - 1_537) % payloads.len()],
                case
            )
            .into_bytes()
        }
        _ => mutate_bytes(b"word/document.xml", case, 0x5245_4c5f_5441_5247),
    }
}
