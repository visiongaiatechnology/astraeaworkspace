// STATUS: PLATIN
//! Direct bounded mutations for text detection and image-header parsing.

use super::{inspect_image_header, looks_like_csv};
use crate::mutation_support::{
    assert_panic_free, bounded_limits, mutate_bytes, MAX_MUTATION_BYTES, MUTATION_CASES,
};
use crate::{Budget, ForeignFormat};

const CSV_SEED: &[u8] = b"name,value\nalpha,1\nbeta,2\n";

#[test]
fn csv_detector_survives_4096_deterministic_hostile_mutations() {
    assert!(
        looks_like_csv(CSV_SEED),
        "valid CSV seed was not recognized"
    );
    assert_eq!(
        crate::inspect_bytes(CSV_SEED, "mutation.csv", bounded_limits())
            .expect("public inspection accepts valid CSV")
            .format,
        ForeignFormat::Csv
    );

    let cases = (0..MUTATION_CASES).map(csv_case);
    assert_panic_free("CSV detector + inspection dispatch", cases, |bytes| {
        let _detected = looks_like_csv(bytes);
        let _ = crate::inspect_bytes(bytes, "mutation.csv", bounded_limits());
    });
}

#[test]
fn image_header_parser_survives_4096_deterministic_hostile_mutations() {
    let seeds = image_seeds();
    let budget = Budget::new(bounded_limits()).expect("valid bounded test limits");
    let expected = [
        ForeignFormat::Png,
        ForeignFormat::Gif,
        ForeignFormat::Webp,
        ForeignFormat::Jpeg,
    ];
    for (seed, format) in seeds.iter().zip(expected) {
        assert!(
            inspect_image_header(seed, &budget).is_ok_and(|header| header.is_some()),
            "valid {format:?} header seed rejected"
        );
        assert_eq!(
            crate::inspect_bytes(seed, "mutation-image.bin", bounded_limits())
                .expect("public inspection accepts valid image header")
                .format,
            format
        );
    }

    let cases = (0..MUTATION_CASES).map(|case| image_case(&seeds, case));
    assert_panic_free("PNG/GIF/WebP/JPEG image headers", cases, |bytes| {
        let _header = inspect_image_header(bytes, &budget);
        let _ = crate::inspect_bytes(bytes, "mutation-image.bin", bounded_limits());
    });
}

fn csv_case(case: usize) -> Vec<u8> {
    match case {
        0 => CSV_SEED.to_vec(),
        1..=512 => {
            let keep = (case - 1) % CSV_SEED.len();
            CSV_SEED[..keep].to_vec()
        }
        513..=1_024 => format!("duplicate,duplicate\nrow{case},value{case}\n").into_bytes(),
        1_025..=1_536 => {
            format!("name,notes\nrow{case},\"quote, comma and newline\nsecond line\"\n")
                .into_bytes()
        }
        1_537..=2_048 => {
            let mut bytes = CSV_SEED.to_vec();
            let suffix = (case - 1_536) * 4;
            let suffix_len = suffix.min(MAX_MUTATION_BYTES.saturating_sub(bytes.len()));
            bytes.extend(std::iter::repeat_n(b'x', suffix_len));
            bytes
        }
        _ => mutate_bytes(CSV_SEED, case, 0x4353_5600_0000_0001),
    }
}

fn image_seeds() -> Vec<Vec<u8>> {
    let mut png = vec![0_u8; 24];
    png[..8].copy_from_slice(b"\x89PNG\r\n\x1a\n");
    png[12..16].copy_from_slice(b"IHDR");
    png[16..20].copy_from_slice(&1_u32.to_be_bytes());
    png[20..24].copy_from_slice(&1_u32.to_be_bytes());

    let mut gif = b"GIF89a".to_vec();
    gif.extend_from_slice(&1_u16.to_le_bytes());
    gif.extend_from_slice(&1_u16.to_le_bytes());

    let mut webp = vec![0_u8; 30];
    webp[..4].copy_from_slice(b"RIFF");
    webp[8..12].copy_from_slice(b"WEBP");
    webp[12..16].copy_from_slice(b"VP8X");

    let jpeg = [
        0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00,
        0xff, 0xd9,
    ]
    .to_vec();
    vec![png, gif, webp, jpeg]
}

fn image_case(seeds: &[Vec<u8>], case: usize) -> Vec<u8> {
    let format_index = case % seeds.len();
    let seed = &seeds[format_index];
    match case {
        0..=3 => seed.clone(),
        4..=512 => {
            let keep = (case - 4) % (seed.len() + 1);
            seed[..keep].to_vec()
        }
        513..=1_024 => mutate_image_dimensions(seed, format_index, case),
        1_025..=1_536 => {
            let mut bytes = seed.clone();
            match format_index {
                0 => bytes.extend_from_slice(b"IHDR\0\0\0\x01\0\0\0\x01"),
                1 => bytes.extend_from_slice(b"GIF89a\x01\0\x01\0"),
                2 => bytes.extend_from_slice(b"VP8X\0\0\0\0\0\0"),
                _ => bytes.extend_from_slice(&seeds[3]),
            }
            bytes
        }
        _ => mutate_bytes(seed, case, 0x1a6e_0000_0000_0002 ^ format_index as u64),
    }
}

fn mutate_image_dimensions(seed: &[u8], format_index: usize, case: usize) -> Vec<u8> {
    let mut bytes = seed.to_vec();
    let values = [0u32, 1, 16_384, 16_385, u16::MAX as u32, u32::MAX];
    let value = values[(case - 513) % values.len()];
    match format_index {
        0 => {
            let field = if case & 1 == 0 { 16 } else { 20 };
            bytes[field..field + 4].copy_from_slice(&value.to_be_bytes());
        }
        1 => {
            let field = if case & 1 == 0 { 6 } else { 8 };
            bytes[field..field + 2].copy_from_slice(&(value as u16).to_le_bytes());
        }
        2 => {
            let field = if case & 1 == 0 { 24 } else { 27 };
            let packed = value.to_le_bytes();
            bytes[field..field + 3].copy_from_slice(&packed[..3]);
        }
        _ => {
            if case.is_multiple_of(3) {
                bytes[4..6].copy_from_slice(&(value as u16).to_be_bytes());
            } else {
                let field = if case & 1 == 0 { 7 } else { 9 };
                bytes[field..field + 2].copy_from_slice(&(value as u16).to_be_bytes());
            }
        }
    }
    bytes
}
