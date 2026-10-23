use std::panic::{catch_unwind, AssertUnwindSafe};

use vgt_keyvault::{parse_offline_factor_hex, parse_x25519_key_material, KeyVaultError};

const CASE_COUNT: usize = 4_096;
const MAX_INPUT_BYTES: usize = 160;

fn deterministic_key(case_index: usize) -> [u8; 32] {
    let mut state = 0x9e37_79b9_7f4a_7c15_u64 ^ case_index as u64;
    let mut key = [0_u8; 32];

    for byte in &mut key {
        state ^= state << 13;
        state ^= state >> 7;
        state ^= state << 17;
        *byte = state as u8;
    }

    if key.iter().all(|byte| *byte == 0) {
        key[case_index % key.len()] = 1;
    }
    key
}

fn encode_hex(key: &[u8; 32], mode: usize) -> String {
    let mut encoded = String::with_capacity(64);
    for (index, byte) in key.iter().enumerate() {
        let pair = format!("{byte:02x}");
        match mode {
            0 => encoded.push_str(&pair),
            1 => encoded.push_str(&pair.to_ascii_uppercase()),
            _ if index % 2 == 0 => encoded.push_str(&pair.to_ascii_uppercase()),
            _ => encoded.push_str(&pair),
        }
    }
    encoded
}

fn replace_ascii_at(value: &mut String, byte_index: usize, replacement: &str) {
    value.replace_range(byte_index..byte_index + 1, replacement);
}

fn mutation_case(case_index: usize, x25519_parser: bool) -> (String, Option<[u8; 32]>) {
    let key = deterministic_key(case_index);
    let encoded = encode_hex(&key, 0);

    match case_index / 512 {
        0 => (encoded, Some(key)),
        1 => {
            let mode = if case_index.is_multiple_of(2) { 1 } else { 2 };
            (encode_hex(&key, mode), Some(key))
        }
        2 => (format!(" \t\r\n{encoded}\n\t "), Some(key)),
        3 if x25519_parser => (format!(" \t x25519:{encoded}\r\n "), Some(key)),
        3 => (format!("x25519:{encoded}"), None),
        4 => ("00".repeat(32), None),
        5 => {
            let mutation = case_index % 8;
            let value = match mutation {
                0 => String::new(),
                1 => encoded[..1].to_owned(),
                2 => encoded[..31].to_owned(),
                3 => encoded[..62].to_owned(),
                4 => encoded[..63].to_owned(),
                5 => format!("{encoded}0"),
                6 => format!("{encoded}00"),
                _ => "a".repeat(128),
            };
            (value, None)
        }
        6 => {
            let mut value = encoded;
            let position = case_index % value.len();
            let replacement = match case_index % 8 {
                0 => "g",
                1 => "G",
                2 => "z",
                3 => "/",
                4 => "+",
                5 => "-",
                6 => ":",
                _ => "_",
            };
            replace_ascii_at(&mut value, position, replacement);
            (value, None)
        }
        _ => {
            let mutation = case_index % 8;
            let mut value = encoded;
            let position = case_index % value.len();
            match mutation {
                0 => replace_ascii_at(&mut value, position, "é"),
                1 => replace_ascii_at(&mut value, position, "０"),
                2 => value.insert(position, '\u{200b}'),
                3 => value.insert(position, ' '),
                4 => value = format!("X25519:{value}"),
                5 => value = format!("x25519={value}"),
                6 => value = format!("0x{value}"),
                _ => {
                    value.insert(16, '-');
                    value.push('\0');
                }
            }
            (value, None)
        }
    }
}

fn assert_parser_cases(
    parser_name: &str,
    parse: impl Fn(&str) -> Result<[u8; 32], KeyVaultError>,
    x25519_parser: bool,
    expected_accepts: usize,
) {
    let mut accepted = 0_usize;
    let mut rejected = 0_usize;

    for case_index in 0..CASE_COUNT {
        let (input, expected_key) = mutation_case(case_index, x25519_parser);
        assert!(
            input.len() <= MAX_INPUT_BYTES,
            "{parser_name} corpus input exceeded the fixed byte ceiling"
        );

        let result = catch_unwind(AssertUnwindSafe(|| parse(&input))).unwrap_or_else(|_| {
            panic!("{parser_name} panicked at deterministic case {case_index}")
        });

        match (expected_key, result) {
            (Some(expected), Ok(actual)) => {
                assert_eq!(actual, expected, "{parser_name} changed valid key bytes");
                assert!(actual.iter().any(|byte| *byte != 0));
                accepted += 1;
            }
            (None, Err(KeyVaultError::InvalidCredentialFormat)) => rejected += 1,
            (Some(_), Err(_)) => panic!("{parser_name} rejected an expected valid key"),
            (None, Ok(actual)) => {
                assert!(actual.iter().any(|byte| *byte != 0));
                panic!("{parser_name} accepted a malformed credential at case {case_index}");
            }
            (None, Err(other)) => {
                panic!("{parser_name} returned an unexpected typed error: {other:?}")
            }
        }
    }

    assert_eq!(accepted, expected_accepts);
    assert_eq!(rejected, CASE_COUNT - expected_accepts);
}

#[test]
fn offline_factor_parser_rejects_deterministic_hostile_mutations_without_panicking() {
    assert_parser_cases(
        "parse_offline_factor_hex",
        parse_offline_factor_hex,
        false,
        1_536,
    );
}

#[test]
fn x25519_parser_rejects_deterministic_hostile_mutations_without_panicking() {
    assert_parser_cases(
        "parse_x25519_key_material",
        parse_x25519_key_material,
        true,
        2_048,
    );
}
