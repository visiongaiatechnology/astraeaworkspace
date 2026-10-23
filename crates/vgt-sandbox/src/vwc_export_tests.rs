// STATUS: PLATIN — Release Beta 0.1: VWC (encrypted Astraea Workspace container) export boundary.
//
// The atomic user-facing save path validates every export artifact through
// `validate_export_bytes`. Native workspace containers are opaque encrypted bytes with the VWC v3
// magic, so the sandbox must recognize the framing while refusing anything that only pretends to
// be a container. These tests pin that boundary.
use crate::{
    inspect_bytes, validate_export_bytes, ActiveContentDisposition, ForeignFormat, SandboxLimits,
};

fn vwc_bytes(extra: usize) -> Vec<u8> {
    let mut bytes = b"VWC1".to_vec();
    // Plausible framing bytes (version + lengths + tag); the payload itself is opaque here.
    bytes.extend(vec![0x41u8; extra]);
    bytes
}

#[test]
fn vwc_container_framing_is_recognized_as_opaque_export_format() {
    let bytes = vwc_bytes(64);
    let report = inspect_bytes(&bytes, "Meine_Notizen.vwc", SandboxLimits::default())
        .expect("VWC framing must be recognized");
    assert_eq!(report.format, ForeignFormat::Vwc);
    assert_eq!(report.format.label(), "VWC");
    assert_eq!(report.active_content, ActiveContentDisposition::None);
    assert!(report.integrity_verified, "framing check counts as verified structure");
    assert_eq!(report.size_bytes, bytes.len() as u64);
    assert_eq!(report.file_name_hint, "Meine_Notizen.vwc");
}

#[test]
fn vwc_container_can_be_emitted_by_the_atomic_export_boundary() {
    let bytes = vwc_bytes(128);
    let report = validate_export_bytes(&bytes, "Deck.vwc", SandboxLimits::default())
        .expect("a native VWC container must be exportable through the atomic save path");
    assert_eq!(report.format, ForeignFormat::Vwc);
    assert_eq!(report.active_content, ActiveContentDisposition::None);
    assert!(report.integrity_verified);
}

#[test]
fn truncated_vwc_framing_is_rejected_instead_of_exported() {
    let truncated = vwc_bytes(8);
    assert!(inspect_bytes(&truncated, "kaputt.vwc", SandboxLimits::default()).is_err());
    assert!(validate_export_bytes(&truncated, "kaputt.vwc", SandboxLimits::default()).is_err());
    assert!(inspect_bytes(b"VWC1", "leer.vwc", SandboxLimits::default()).is_err());
}

#[test]
fn non_container_bytes_are_not_smuggled_through_the_vwc_branch() {
    // Executables or arbitrary payloads never start with the VWC magic; they stay unsupported.
    assert!(validate_export_bytes(b"MZ\x90\x00payload that is not a container", "evil.vwc", SandboxLimits::default()).is_err());
    assert!(validate_export_bytes(b"VWC0not-a-real-container", "evil.vwc", SandboxLimits::default()).is_err());
}

#[test]
fn vwc_size_budget_still_applies() {
    let limits = SandboxLimits {
        max_input_bytes: 16,
        ..SandboxLimits::default()
    };
    assert!(inspect_bytes(&vwc_bytes(64), "gross.vwc", limits).is_err());
}
