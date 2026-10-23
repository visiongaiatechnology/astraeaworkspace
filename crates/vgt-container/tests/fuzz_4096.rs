//! Deterministic, bounded byte-mutation coverage for VWC structure inspection.
//! This is a repeatable regression battery, not a replacement for coverage-guided
//! fuzzing or parser coverage elsewhere in the workspace.

use std::panic::catch_unwind;

use vgt_container::{VgtContainer, CURRENT_CRYPTO_VERSION, MAGIC_BYTES};

const MUTATION_CASES: usize = 4_096;
const MAX_MUTATED_BYTES: usize = 1_024;
const NONCE_BYTES: usize = 12;
const AUTHENTICATED_TAG_BYTES: u32 = 16;

const HOSTILE_BYTES: &[u8] = &[
    0x00, 0x01, 0x09, 0x0a, 0x0d, 0x1b, 0x22, 0x27, 0x2c, 0x2e, 0x3a, 0x3b, 0x3d, 0x5b, 0x5c, 0x5d,
    0x7f, 0x80, 0xff,
];

const VALID_MANIFEST: &[u8] = br#"{"manifest_schema_version":1,"compatibility":{"container_format_version":3,"minimum_reader_implementation":3,"minimum_writer_implementation":3,"payload_schema_namespace":"vgt.wom","payload_schema_version":1},"chunks":[{"index":0,"chunk_type":0,"flags":1,"plaintext_len":0}]}"#;

fn next_random(state: &mut u64) -> u64 {
    *state ^= *state << 13;
    *state ^= *state >> 7;
    *state ^= *state << 17;
    *state
}

fn legacy_container_seed(format_version: u16) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(12 + 4 + 1 + NONCE_BYTES + 4 + 16);
    bytes.extend_from_slice(MAGIC_BYTES);
    bytes.extend_from_slice(&format_version.to_le_bytes());
    bytes.extend_from_slice(&CURRENT_CRYPTO_VERSION.to_le_bytes());
    bytes.extend_from_slice(&0u32.to_le_bytes());
    bytes.extend_from_slice(&1u32.to_le_bytes());
    bytes.push(0);
    bytes.extend_from_slice(&[0; NONCE_BYTES]);
    bytes.extend_from_slice(&AUTHENTICATED_TAG_BYTES.to_le_bytes());
    bytes.extend_from_slice(&[0; AUTHENTICATED_TAG_BYTES as usize]);
    bytes
}

fn v3_container_seed() -> Vec<u8> {
    let metadata = b"{}";
    let mut bytes = Vec::with_capacity(32 + metadata.len() + VALID_MANIFEST.len());
    bytes.extend_from_slice(MAGIC_BYTES);
    bytes.extend_from_slice(&3u16.to_le_bytes());
    bytes.extend_from_slice(&CURRENT_CRYPTO_VERSION.to_le_bytes());
    bytes.extend_from_slice(&(metadata.len() as u32).to_le_bytes());
    bytes.extend_from_slice(metadata);
    bytes.extend_from_slice(&(VALID_MANIFEST.len() as u32).to_le_bytes());
    bytes.extend_from_slice(VALID_MANIFEST);
    bytes.extend_from_slice(&1u32.to_le_bytes());
    bytes.push(0);
    bytes.push(1);
    bytes.extend_from_slice(&[0; NONCE_BYTES]);
    bytes.extend_from_slice(&AUTHENTICATED_TAG_BYTES.to_le_bytes());
    bytes.extend_from_slice(&[0; AUTHENTICATED_TAG_BYTES as usize]);
    bytes
}

fn seed_corpus() -> Vec<Vec<u8>> {
    let mut invalid_magic = b"NOPE".to_vec();
    invalid_magic.extend_from_slice(&[0; 20]);

    let mut oversized_metadata_length = Vec::new();
    oversized_metadata_length.extend_from_slice(MAGIC_BYTES);
    oversized_metadata_length.extend_from_slice(&1u16.to_le_bytes());
    oversized_metadata_length.extend_from_slice(&CURRENT_CRYPTO_VERSION.to_le_bytes());
    oversized_metadata_length.extend_from_slice(&(10 * 1024 * 1024u32 + 1).to_le_bytes());

    let mut excessive_chunk_count = Vec::new();
    excessive_chunk_count.extend_from_slice(MAGIC_BYTES);
    excessive_chunk_count.extend_from_slice(&1u16.to_le_bytes());
    excessive_chunk_count.extend_from_slice(&CURRENT_CRYPTO_VERSION.to_le_bytes());
    excessive_chunk_count.extend_from_slice(&0u32.to_le_bytes());
    excessive_chunk_count.extend_from_slice(&10_001u32.to_le_bytes());

    vec![
        vec![0],
        b"VWC".to_vec(),
        invalid_magic,
        legacy_container_seed(1),
        legacy_container_seed(2),
        v3_container_seed(),
        oversized_metadata_length,
        excessive_chunk_count,
    ]
}

fn mutate(seed: &[u8], state: &mut u64, case_index: usize) -> Vec<u8> {
    assert!(!seed.is_empty(), "fuzz seeds must be non-empty");
    let mut bytes = seed.to_vec();
    let operation = (next_random(state) % 7) as usize;

    match operation {
        0 => {
            let position = (next_random(state) as usize) % bytes.len();
            let replacement = HOSTILE_BYTES[(next_random(state) as usize) % HOSTILE_BYTES.len()];
            bytes[position] = replacement;
        }
        1 => {
            if bytes.len() < MAX_MUTATED_BYTES {
                let position = (next_random(state) as usize) % (bytes.len() + 1);
                let inserted = HOSTILE_BYTES[(next_random(state) as usize) % HOSTILE_BYTES.len()];
                bytes.insert(position, inserted);
            }
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
            let available = MAX_MUTATED_BYTES.saturating_sub(bytes.len());
            if available > 0 {
                let start = (next_random(state) as usize) % bytes.len();
                let span = 1 + (next_random(state) as usize % 16);
                let duplicate_len = span.min(bytes.len() - start).min(available);
                let insertion = (next_random(state) as usize) % (bytes.len() + 1);
                let duplicated = bytes[start..start + duplicate_len].to_vec();
                bytes.splice(insertion..insertion, duplicated);
            }
        }
        5 => {
            let new_length = (next_random(state) as usize) % bytes.len();
            bytes.truncate(new_length);
        }
        _ => {
            let suffixes: [&[u8]; 6] = [b"!", b"\0", b"VWC1", b"\xff\xfe", b"\0\0\0\0", b"{}"];
            let suffix = suffixes[(next_random(state) as usize) % suffixes.len()];
            let available = MAX_MUTATED_BYTES.saturating_sub(bytes.len());
            bytes.extend_from_slice(&suffix[..suffix.len().min(available)]);
        }
    }

    if bytes.as_slice() == seed {
        bytes[0] ^= 0xff;
    }
    assert!(
        bytes.len() <= MAX_MUTATED_BYTES,
        "case {case_index} exceeded input cap"
    );
    debug_assert_ne!(
        bytes.as_slice(),
        seed,
        "case {case_index} must mutate its seed"
    );
    bytes
}

#[test]
fn deterministic_vwc_structure_parser_byte_mutations_4096_are_bounded_and_never_panic() {
    let seeds = seed_corpus();
    assert!(seeds
        .iter()
        .all(|seed| !seed.is_empty() && seed.len() <= MAX_MUTATED_BYTES));

    let mut state = 0x5647_5457_435f_4655_u64;
    let mut parsed_cases = 0usize;

    for case_index in 0..MUTATION_CASES {
        let seed = &seeds[case_index % seeds.len()];
        let mutation = mutate(seed, &mut state, case_index);
        assert!(mutation.len() <= MAX_MUTATED_BYTES);

        let result = catch_unwind(|| VgtContainer::inspect_structure(&mutation));
        assert!(
            result.is_ok(),
            "VWC structure parser panicked on mutation case {case_index}"
        );
        parsed_cases += 1;
    }

    assert_eq!(parsed_cases, MUTATION_CASES);
    assert!(VgtContainer::inspect_structure(&v3_container_seed()).is_ok());
    assert!(VgtContainer::inspect_structure(&legacy_container_seed(1)).is_ok());
    assert!(VgtContainer::inspect_structure(&legacy_container_seed(2)).is_ok());
}
