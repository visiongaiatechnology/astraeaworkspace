//! STATUS: PLATIN
//! Deterministic, bounded adversarial byte mutations for the real recipient-bundle JSON parser.
//! This covers one parser boundary and is not a claim that all workspace parsers are fuzzed.

use std::panic::catch_unwind;

use serde_json::json;
use vgt_crypto::{
    assurance::MAX_SERIALIZED_RECIPIENT_BUNDLE_BYTES, parse_recipient_bundle_json, CryptoError,
};

const MUTATION_CASES: usize = 4_096;
const MAX_MUTATED_BYTES: usize = 1_024;
const HOSTILE_BYTES: &[u8] = &[
    0x00, 0x01, 0x09, 0x0a, 0x0d, 0x1b, 0x22, 0x27, 0x2c, 0x2e, 0x3a, 0x3b, 0x3d, 0x5b, 0x5c, 0x5d,
    0x7f, 0x80, 0xff,
];

const STATIC_SEEDS: &[&[u8]] = &[
    b"{\"version\":1,\"profile\":\"STANDARD_V1\",\"slots\":[]}",
    b"{\"version\":1,\"profile\":\"VGT_TOP_SECRET_V1\",\"slots\":[{}]}",
    b"{\"version\":1,\"profile\":\"STANDARD_V1\",\"slots\":[",
    b"null",
    b"[]",
    b"{\"version\":1,\"profile\":\"STANDARD_V1\",\"slots\":[],\"unexpected\":true}",
    b"\xff\xfe\x00\x80",
];

fn valid_bundle_seed() -> Vec<u8> {
    let fingerprint = vec![0_u8; 32];
    serde_json::to_vec(&json!({
        "version": 1,
        "profile": "STANDARD_V1",
        "slots": [{
            "label": "fuzz-seed",
            "recipient_public_key_fingerprint_sha256": fingerprint,
            "envelope": {
                "version": 1,
                "ephemeral_public_key": vec![0_u8; 32],
                "recipient_public_key_fingerprint_sha256": vec![0_u8; 32],
                "hkdf_salt": vec![0_u8; 16],
                "nonce": vec![0_u8; 12],
                "encrypted_dek": vec![0_u8; 48],
            }
        }]
    }))
    .expect("synthetic public metadata seed must serialize")
}

fn seeds() -> Vec<Vec<u8>> {
    let mut all = STATIC_SEEDS
        .iter()
        .map(|seed| seed.to_vec())
        .collect::<Vec<_>>();
    all.push(valid_bundle_seed());
    all
}

fn next_random(state: &mut u64) -> u64 {
    *state ^= *state << 13;
    *state ^= *state >> 7;
    *state ^= *state << 17;
    *state
}

fn mutate(seed: &[u8], state: &mut u64, case_index: usize) -> Vec<u8> {
    let mut bytes = seed.to_vec();
    let operation = (next_random(state) % 7) as usize;

    match operation {
        0 => {
            let position = (next_random(state) as usize) % bytes.len();
            let replacement = HOSTILE_BYTES[(next_random(state) as usize) % HOSTILE_BYTES.len()];
            bytes[position] = replacement;
        }
        1 => {
            let position = (next_random(state) as usize) % (bytes.len() + 1);
            let inserted = HOSTILE_BYTES[(next_random(state) as usize) % HOSTILE_BYTES.len()];
            bytes.insert(position, inserted);
        }
        2 => {
            let position = (next_random(state) as usize) % bytes.len();
            bytes.remove(position);
        }
        3 => {
            let position = (next_random(state) as usize) % bytes.len();
            let mask = [0x01, 0x08, 0x20, 0x7f, 0x80, 0xff][(next_random(state) as usize) % 6];
            bytes[position] ^= mask;
        }
        4 => {
            let start = (next_random(state) as usize) % bytes.len();
            let end = (start + 1 + (next_random(state) as usize % 16)).min(bytes.len());
            let insertion = (next_random(state) as usize) % (bytes.len() + 1);
            let duplicated = bytes[start..end].to_vec();
            bytes.splice(insertion..insertion, duplicated);
        }
        5 => {
            let new_length = (next_random(state) as usize) % bytes.len();
            bytes.truncate(new_length);
        }
        _ => {
            let suffixes: [&[u8]; 6] = [
                b"!",
                b"\0",
                b"\"slots\":[]",
                b"}}}",
                b"\xff\xfe",
                b"\\u0000",
            ];
            let suffix = suffixes[(next_random(state) as usize) % suffixes.len()];
            let available = MAX_MUTATED_BYTES.saturating_sub(bytes.len());
            bytes.extend_from_slice(&suffix[..suffix.len().min(available)]);
        }
    }

    bytes.truncate(MAX_MUTATED_BYTES);
    if bytes.as_slice() == seed {
        let replacement = bytes.first_mut().expect("all parser seeds are non-empty");
        *replacement ^= 0xff;
    }
    debug_assert_ne!(
        bytes.as_slice(),
        seed,
        "case {case_index} must mutate its seed"
    );
    bytes
}

fn parse_without_panicking(input: &[u8], case_index: usize) -> Result<(), String> {
    match catch_unwind(|| parse_recipient_bundle_json(input)) {
        Ok(_parse_result) => Ok(()),
        Err(_) => Err(format!(
            "recipient bundle parser panicked on case {case_index}"
        )),
    }
}

#[test]
fn deterministic_recipient_bundle_parser_byte_mutations_4096_are_bounded_and_never_panic() {
    let all_seeds = seeds();
    let mut state = 0x5647_5443_5259_5054_u64;
    let mut parsed_cases = 0usize;

    for case_index in 0..MUTATION_CASES {
        let seed = &all_seeds[case_index % all_seeds.len()];
        let mutation = mutate(seed, &mut state, case_index);
        assert!(mutation.len() <= MAX_MUTATED_BYTES);
        if let Err(message) = parse_without_panicking(&mutation, case_index) {
            panic!("{message}");
        }
        parsed_cases += 1;
    }
    assert_eq!(parsed_cases, MUTATION_CASES);

    let oversized = vec![b' '; MAX_SERIALIZED_RECIPIENT_BUNDLE_BYTES + 1];
    assert!(matches!(
        parse_recipient_bundle_json(&oversized),
        Err(CryptoError::BoundaryViolation("public crypto input size"))
    ));
    assert!(matches!(
        parse_recipient_bundle_json(STATIC_SEEDS[0]),
        Err(CryptoError::BoundaryViolation("recipient bundle"))
    ));
}
