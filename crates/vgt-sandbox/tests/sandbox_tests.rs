// STATUS: DIAMANT VGT SUPREME
use vgt_sandbox::{inspect_bytes, ForeignFormat, SandboxError, SandboxLimits};

#[test]
fn json_is_detected_with_bounded_parser() {
    let report = inspect_bytes(
        br#"{"name":"Astraea","safe":true}"#,
        "renamed.bin",
        SandboxLimits::default(),
    )
    .expect("json inspection");
    assert_eq!(report.format, ForeignFormat::Json);
    assert!(report.integrity_verified);
}

#[test]
fn csv_is_detected_from_content_not_extension() {
    let report = inspect_bytes(
        b"name,value\nalpha,1\nbeta,2\n",
        "totally-not-a-table.dat",
        SandboxLimits::default(),
    )
    .expect("csv inspection");
    assert_eq!(report.format, ForeignFormat::Csv);
}

#[test]
fn png_pixel_budget_is_checked_from_header_before_decode() {
    let mut png = vec![0_u8; 24];
    png[..8].copy_from_slice(b"\x89PNG\r\n\x1a\n");
    png[12..16].copy_from_slice(b"IHDR");
    png[16..20].copy_from_slice(&20_000_u32.to_be_bytes());
    png[20..24].copy_from_slice(&20_000_u32.to_be_bytes());
    let result = inspect_bytes(&png, "large.png", SandboxLimits::default());
    assert!(matches!(result, Err(SandboxError::Resource(_))));
}

#[test]
fn unsupported_binary_is_rejected_even_with_trusted_looking_extension() {
    let result = inspect_bytes(
        b"MZ\x90\x00this-is-not-a-document",
        "report.docx",
        SandboxLimits::default(),
    );
    assert!(matches!(result, Err(SandboxError::Unsupported)));
}

#[test]
fn invalid_zero_limits_fail_closed() {
    let limits = SandboxLimits {
        max_input_bytes: 0,
        ..SandboxLimits::default()
    };
    let result = inspect_bytes(b"a,b\n1,2\n", "table.csv", limits);
    assert!(matches!(result, Err(SandboxError::Resource(_))));
}

#[test]
fn png_oversized_edge_is_rejected_before_decode() {
    let mut png = vec![0_u8; 24];
    png[..8].copy_from_slice(b"\x89PNG\r\n\x1a\n");
    png[12..16].copy_from_slice(b"IHDR");
    png[16..20].copy_from_slice(&16_385_u32.to_be_bytes());
    png[20..24].copy_from_slice(&1_u32.to_be_bytes());
    let result = inspect_bytes(&png, "edge-bomb.png", SandboxLimits::default());
    assert!(matches!(result, Err(SandboxError::Resource(_))));
}

#[test]
fn png_hundred_thousand_square_bomb_is_rejected_from_header() {
    let mut png = vec![0_u8; 24];
    png[..8].copy_from_slice(b"\x89PNG\r\n\x1a\n");
    png[12..16].copy_from_slice(b"IHDR");
    png[16..20].copy_from_slice(&100_000_u32.to_be_bytes());
    png[20..24].copy_from_slice(&100_000_u32.to_be_bytes());
    let result = inspect_bytes(&png, "pixel-bomb.png", SandboxLimits::default());
    assert!(matches!(result, Err(SandboxError::Resource(_))));
}
