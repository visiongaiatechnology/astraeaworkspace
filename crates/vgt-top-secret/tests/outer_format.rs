use std::fs;
use tempfile::tempdir;
use vgt_top_secret::{inspect_outer_file, verify_outer_file, wrap_infinity_file, INFINITY_PINNED_COMMIT, INFINITY_SUITE, OUTER_SUITE};

#[test]
fn outer_wrapper_roundtrip_is_minimal_and_pinned() {
    let dir = tempdir().unwrap();
    let infinity = dir.path().join("opaque.vgti");
    let outer = dir.path().join("sealed.vgts");
    fs::write(&infinity, b"VGTINF02opaque-infinity-payload").unwrap();
    wrap_infinity_file(&infinity, &outer).unwrap();
    let inspected = verify_outer_file(&outer).unwrap();
    assert_eq!(inspected.header.suite, OUTER_SUITE);
    assert_eq!(inspected.header.infinity_suite, INFINITY_SUITE);
    assert_eq!(inspected.header.infinity_commit, INFINITY_PINNED_COMMIT);
    let text = String::from_utf8_lossy(&fs::read(&outer).unwrap()).to_string();
    assert!(!text.contains("Writer"));
    assert!(!text.contains("document_id"));
    assert!(!text.contains("workspace"));
}

#[test]
fn exact_eof_and_payload_mutation_are_rejected() {
    let dir = tempdir().unwrap();
    let infinity = dir.path().join("opaque.vgti");
    fs::write(&infinity, b"VGTINF02signed-looking-payload").unwrap();

    let trailing = dir.path().join("trailing.vgts");
    wrap_infinity_file(&infinity, &trailing).unwrap();
    let mut bytes = fs::read(&trailing).unwrap();
    bytes.push(0x41);
    fs::write(&trailing, &bytes).unwrap();
    assert!(inspect_outer_file(&trailing).is_err());

    let mutated = dir.path().join("mutated.vgts");
    wrap_infinity_file(&infinity, &mutated).unwrap();
    let inspected = inspect_outer_file(&mutated).unwrap();
    let mut bytes = fs::read(&mutated).unwrap();
    bytes[inspected.payload_offset as usize] ^= 0x80;
    fs::write(&mutated, &bytes).unwrap();
    assert!(verify_outer_file(&mutated).is_err());
}

#[test]
fn existing_target_is_never_overwritten() {
    let dir = tempdir().unwrap();
    let infinity = dir.path().join("opaque.vgti");
    let target = dir.path().join("existing.vgts");
    fs::write(&infinity, b"VGTINF02payload").unwrap();
    fs::write(&target, b"previous-valid-container").unwrap();
    assert!(wrap_infinity_file(&infinity, &target).is_err());
    assert_eq!(fs::read(&target).unwrap(), b"previous-valid-container");
}
