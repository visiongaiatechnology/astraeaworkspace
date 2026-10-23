// STATUS: PLATIN
//! Shared deterministic, size-bounded hostile-input test support.

use std::panic::{catch_unwind, AssertUnwindSafe};

pub(crate) const MUTATION_CASES: usize = 4_096;
pub(crate) const MAX_MUTATION_BYTES: usize = 4_096;

pub(crate) fn bounded_limits() -> crate::SandboxLimits {
    crate::SandboxLimits {
        max_input_bytes: MAX_MUTATION_BYTES as u64,
        max_entry_bytes: MAX_MUTATION_BYTES as u64,
        max_expanded_bytes: MAX_MUTATION_BYTES as u64,
        max_xml_text_bytes: 2_048,
        max_elapsed_ms: 60_000,
        ..crate::SandboxLimits::default()
    }
}

pub(crate) fn assert_panic_free<R>(
    parser_name: &str,
    cases: impl IntoIterator<Item = Vec<u8>>,
    mut parse: impl FnMut(&[u8]) -> R,
) {
    let mut count = 0usize;
    for (case_index, bytes) in cases.into_iter().enumerate() {
        assert!(
            bytes.len() <= MAX_MUTATION_BYTES,
            "{parser_name} case {case_index} exceeded the {}-byte fixture ceiling",
            MAX_MUTATION_BYTES
        );
        let result = catch_unwind(AssertUnwindSafe(|| parse(&bytes)));
        assert!(
            result.is_ok(),
            "{parser_name} panicked on deterministic mutation case {case_index} ({} bytes)",
            bytes.len()
        );
        count += 1;
    }
    assert_eq!(
        count, MUTATION_CASES,
        "{parser_name} did not execute the complete mutation corpus"
    );
}

/// Apply a stable mix of truncation, replacement, bit flips, insertion, and
/// bounded suffix mutations. Format-specific suites layer structural mutations
/// on top of this general byte-level corpus.
pub(crate) fn mutate_bytes(seed: &[u8], case_index: usize, salt: u64) -> Vec<u8> {
    let mut bytes = seed.to_vec();
    if case_index == 0 {
        return bytes;
    }

    let mut state = (case_index as u64)
        .wrapping_mul(0x9E37_79B9_7F4A_7C15)
        .wrapping_add(salt | 1);
    match case_index % 5 {
        0 => {
            let keep = next(&mut state) as usize % (bytes.len().saturating_add(1));
            bytes.truncate(keep);
        }
        1 => {
            if !bytes.is_empty() {
                let offset = next(&mut state) as usize % bytes.len();
                bytes[offset] = next(&mut state) as u8;
            }
        }
        2 => {
            let flips = 1 + (next(&mut state) as usize % 4);
            for _ in 0..flips {
                if bytes.is_empty() {
                    break;
                }
                let offset = next(&mut state) as usize % bytes.len();
                bytes[offset] ^= (next(&mut state) as u8) | 1;
            }
        }
        3 => {
            if !bytes.is_empty() && bytes.len() < MAX_MUTATION_BYTES {
                let start = next(&mut state) as usize % bytes.len();
                let available = bytes.len() - start;
                let length = 1 + (next(&mut state) as usize % available);
                let insertion = (next(&mut state) as usize % (bytes.len() + 1))
                    .min(MAX_MUTATION_BYTES.saturating_sub(length));
                let duplicate = bytes[start..start + length].to_vec();
                bytes.splice(insertion..insertion, duplicate);
            }
        }
        _ => {
            let remaining = MAX_MUTATION_BYTES.saturating_sub(bytes.len());
            let suffix_len = remaining.min(1 + (next(&mut state) as usize % 32));
            for _ in 0..suffix_len {
                bytes.push(next(&mut state) as u8);
            }
        }
    }
    bytes.truncate(MAX_MUTATION_BYTES);
    bytes
}

pub(crate) fn next(state: &mut u64) -> u64 {
    // xorshift64*: deterministic test data only; not used for secrets or security.
    *state ^= *state >> 12;
    *state ^= *state << 25;
    *state ^= *state >> 27;
    state.wrapping_mul(0x2545_F491_4F6C_DD1D)
}

pub(crate) fn replace_range(bytes: &mut Vec<u8>, range: std::ops::Range<usize>, value: &[u8]) {
    if range.start <= range.end && range.end <= bytes.len() {
        bytes.splice(range, value.iter().copied());
    }
    bytes.truncate(MAX_MUTATION_BYTES);
}
