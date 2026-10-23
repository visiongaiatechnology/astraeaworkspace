// STATUS: PLATIN
#![forbid(unsafe_code)]

use std::panic::{catch_unwind, AssertUnwindSafe};

use vgt_crypto::{hash_blake3, KEY_SIZE, NONCE_SIZE};
use vgt_syncgraph::transport::{
    open_transport_payload, OfflineQueueState, SealedSyncEnvelope, SyncEnvelopeContext,
    MAX_TRANSPORT_PAYLOAD_BYTES, SYNC_ENVELOPE_VERSION,
};

const CASE_COUNT: usize = 4_096;
const MAX_INPUT_BYTES: usize = 16 * 1024;

#[test]
fn transport_envelope_deserialization_survives_4096_bounded_hostile_cases() {
    let key = [0x33; KEY_SIZE];
    let baseline = minimal_envelope();
    let seeds = hostile_seeds(&baseline);
    let mut parsed_count = 0usize;
    let mut rejected_count = 0usize;
    let mut open_attempts = 0usize;
    let mut restore_attempts = 0usize;

    for case_index in 0..CASE_COUNT {
        let bytes = mutation_case(&seeds, case_index);
        assert!(
            bytes.len() <= MAX_INPUT_BYTES,
            "case {case_index} exceeded the input cap: {} bytes",
            bytes.len()
        );

        let parse_result = catch_unwind(AssertUnwindSafe(|| {
            serde_json::from_slice::<SealedSyncEnvelope>(&bytes)
        }));
        assert!(
            parse_result.is_ok(),
            "envelope deserializer panicked in case {case_index}"
        );

        match parse_result.expect("panic was checked above") {
            Err(error) => {
                rejected_count += 1;
                assert!(
                    !error.to_string().is_empty(),
                    "case {case_index} returned an empty parse error"
                );
            }
            Ok(envelope) => {
                parsed_count += 1;
                assert!(
                    envelope.ciphertext.len() <= MAX_INPUT_BYTES,
                    "bounded JSON case {case_index} produced oversized ciphertext"
                );

                let open_result =
                    catch_unwind(AssertUnwindSafe(|| open_transport_payload(&envelope, &key)));
                assert!(
                    open_result.is_ok(),
                    "open_transport_payload panicked in case {case_index}"
                );
                open_attempts += 1;
                if let Ok(plaintext) = open_result.expect("panic was checked above") {
                    assert!(
                        !plaintext.is_empty() && plaintext.len() <= MAX_TRANSPORT_PAYLOAD_BYTES,
                        "case {case_index} returned plaintext outside transport limits"
                    );
                }

                let restore_result = catch_unwind(AssertUnwindSafe(|| {
                    OfflineQueueState::restore_from_storage(&envelope, &key)
                }));
                assert!(
                    restore_result.is_ok(),
                    "restore_from_storage panicked in case {case_index}"
                );
                restore_attempts += 1;
                if let Ok(restored) = restore_result.expect("panic was checked above") {
                    assert!(restored.total_bytes <= vgt_syncgraph::transport::MAX_QUEUE_BYTES);
                }
            }
        }
    }

    println!(
        "cases={CASE_COUNT} parsed={parsed_count} rejected={rejected_count} open_attempts={open_attempts} restore_attempts={restore_attempts} max_input_bytes={MAX_INPUT_BYTES}"
    );
    assert_eq!(parsed_count + rejected_count, CASE_COUNT);
    assert!(
        parsed_count > 0,
        "the valid envelope seed was never accepted"
    );
    assert!(
        rejected_count > 0,
        "hostile inputs produced no controlled parse failures"
    );
    assert_eq!(open_attempts, parsed_count);
    assert_eq!(restore_attempts, parsed_count);
}

fn minimal_envelope() -> SealedSyncEnvelope {
    let ciphertext = vec![0u8; 17];
    SealedSyncEnvelope {
        version: SYNC_ENVELOPE_VERSION,
        context: SyncEnvelopeContext {
            document_id: "doc".to_owned(),
            session_id: "session".to_owned(),
            membership_epoch: 7,
            sender_device_id: "device".to_owned(),
        },
        nonce: [0u8; NONCE_SIZE],
        ciphertext_digest: hash_blake3(&ciphertext),
        ciphertext,
    }
}

fn hostile_seeds(baseline: &SealedSyncEnvelope) -> Vec<Vec<u8>> {
    let valid = serde_json::to_vec(baseline).expect("test envelope serialization is infallible");
    let mut seeds = vec![
        valid.clone(),
        Vec::new(),
        b"{".to_vec(),
        b"[]".to_vec(),
        b"null".to_vec(),
        b"{\"version\":1}".to_vec(),
        replace_once(&valid, b",\"context\":", b",\"version\":1,\"context\":"),
        replace_once(
            &valid,
            b",\"session_id\":",
            b",\"document_id\":\"duplicate\",\"session_id\":",
        ),
        replace_array_field(&valid, b"nonce", b"[]"),
        replace_once(
            &valid,
            b"\"version\":1",
            b"\"version\":18446744073709551616",
        ),
        replace_once(
            &valid,
            b"\"ciphertext\":[",
            b"\"ciphertext\":\"not-an-array\"",
        ),
        replace_once(
            &valid,
            b"\"ciphertext_digest\":[",
            b"\"ciphertext_digest\":[]",
        ),
        append_unknown_duplicate(&valid),
        nested_unknown_field(&valid, 192),
        invalid_utf8_insertion(&valid),
        b"{\"version\":1,\"context\":\"\\uD800\"}".to_vec(),
    ];

    let mut oversized_context = baseline.clone();
    oversized_context.context.document_id = "d".repeat(257);
    seeds.push(serde_json::to_vec(&oversized_context).expect("oversized test context serializes"));

    let mut multibyte_oversized_context = baseline.clone();
    multibyte_oversized_context.context.session_id = "é".repeat(129);
    seeds.push(
        serde_json::to_vec(&multibyte_oversized_context)
            .expect("multibyte oversized test context serializes"),
    );

    let mut empty_context = baseline.clone();
    empty_context.context.sender_device_id.clear();
    seeds.push(serde_json::to_vec(&empty_context).expect("empty test context serializes"));

    let mut large_bounded_ciphertext = baseline.clone();
    large_bounded_ciphertext.ciphertext = vec![0u8; 5_000];
    large_bounded_ciphertext.ciphertext_digest = hash_blake3(&large_bounded_ciphertext.ciphertext);
    seeds.push(
        serde_json::to_vec(&large_bounded_ciphertext)
            .expect("bounded large test ciphertext serializes"),
    );

    let mut padded_valid = valid;
    padded_valid.resize(MAX_INPUT_BYTES, b' ');
    seeds.push(padded_valid);

    seeds.retain(|seed| seed.len() <= MAX_INPUT_BYTES);
    seeds
}

fn mutation_case(seeds: &[Vec<u8>], case_index: usize) -> Vec<u8> {
    let seed = &seeds[(case_index.wrapping_mul(7) + 3) % seeds.len()];
    if case_index < seeds.len() {
        return seeds[case_index].clone();
    }

    let mut bytes = seed.clone();
    let mut state = (case_index as u64).wrapping_add(0x9e37_79b9_7f4a_7c15);
    match case_index % 10 {
        0 => {
            let cut = next(&mut state) as usize % (bytes.len() + 1);
            bytes.truncate(cut);
        }
        1 => {
            if !bytes.is_empty() {
                let position = next(&mut state) as usize % bytes.len();
                bytes[position] ^= (next(&mut state) as u8) | 1;
            }
        }
        2 => {
            let position = next(&mut state) as usize % (bytes.len() + 1);
            let inserted = [b'{', b'}', b'[', b']', b'"', b'\\', b',', b':', 0xff]
                [next(&mut state) as usize % 9];
            bytes.insert(position, inserted);
        }
        3 => {
            let suffix = [b'0', b' ', b'}', b']', b'"', b'\\', 0, 0xff];
            bytes.extend_from_slice(&suffix[..(next(&mut state) as usize % (suffix.len() + 1))]);
        }
        4 => {
            let flip_count = (next(&mut state) as usize % 8).saturating_add(1);
            for _ in 0..flip_count {
                if bytes.is_empty() {
                    break;
                }
                let position = next(&mut state) as usize % bytes.len();
                bytes[position] ^= 1u8 << (next(&mut state) as u32 % 8);
            }
        }
        5 => {
            let target_len = next(&mut state) as usize % (MAX_INPUT_BYTES + 1);
            if target_len < bytes.len() {
                bytes.truncate(target_len);
            } else {
                bytes.resize(target_len, b' ');
            }
        }
        6 => {
            let nested = b",\"unknown\":[[[[0]]]]";
            insert_before_final_object_delimiter(&mut bytes, nested);
        }
        7 => {
            let hostile = [0xff, 0xfe, 0x00, b'\\', b'u', b'D', b'8', b'0', b'0'];
            let position = next(&mut state) as usize % (bytes.len() + 1);
            bytes.splice(position..position, hostile);
        }
        8 => {
            let repetitions = (next(&mut state) as usize % 256).saturating_add(1);
            let depth = vec![b'['; repetitions];
            bytes.extend_from_slice(b",\"nested\":");
            bytes.extend_from_slice(&depth);
            bytes.push(b'0');
            bytes.extend(std::iter::repeat_n(b']', repetitions));
            bytes.push(b'}');
        }
        _ => {
            if bytes.last() == Some(&b'}') {
                let insertion = b",\"version\":1";
                insert_before_final_object_delimiter(&mut bytes, insertion);
            } else {
                bytes.extend_from_slice(b"\\u0000");
            }
        }
    }

    bytes.truncate(MAX_INPUT_BYTES);
    bytes
}

fn replace_once(input: &[u8], needle: &[u8], replacement: &[u8]) -> Vec<u8> {
    let Some(position) = input
        .windows(needle.len())
        .position(|window| window == needle)
    else {
        return input.to_vec();
    };
    let mut output = Vec::with_capacity(input.len() + replacement.len());
    output.extend_from_slice(&input[..position]);
    output.extend_from_slice(replacement);
    output.extend_from_slice(&input[position + needle.len()..]);
    output
}

fn replace_array_field(input: &[u8], field: &[u8], replacement: &[u8]) -> Vec<u8> {
    let mut key = Vec::with_capacity(field.len() + 4);
    key.push(b'"');
    key.extend_from_slice(field);
    key.extend_from_slice(b"\":[");
    let Some(start) = input.windows(key.len()).position(|window| window == key) else {
        return input.to_vec();
    };
    let value_start = start + key.len() - 1;
    let Some(relative_end) = input[value_start..].iter().position(|byte| *byte == b']') else {
        return input.to_vec();
    };
    let end = value_start + relative_end + 1;
    let mut output = Vec::with_capacity(input.len() + replacement.len());
    output.extend_from_slice(&input[..value_start]);
    output.extend_from_slice(replacement);
    output.extend_from_slice(&input[end..]);
    output
}

fn append_unknown_duplicate(input: &[u8]) -> Vec<u8> {
    let mut output = input.to_vec();
    insert_before_final_object_delimiter(&mut output, b",\"extension\":1,\"extension\":2");
    output
}

fn nested_unknown_field(input: &[u8], depth: usize) -> Vec<u8> {
    let mut output = input.to_vec();
    let mut field = b",\"nested\":".to_vec();
    field.extend(std::iter::repeat_n(b'[', depth));
    field.push(b'0');
    field.extend(std::iter::repeat_n(b']', depth));
    insert_before_final_object_delimiter(&mut output, &field);
    output
}

fn invalid_utf8_insertion(input: &[u8]) -> Vec<u8> {
    let mut output = input.to_vec();
    let insertion = output.len().min(12);
    output.splice(insertion..insertion, [0xff, 0xfe]);
    output
}

fn insert_before_final_object_delimiter(bytes: &mut Vec<u8>, insertion: &[u8]) {
    if bytes.last() == Some(&b'}') {
        let end = bytes.len() - 1;
        bytes.splice(end..end, insertion.iter().copied());
    } else {
        bytes.extend_from_slice(insertion);
    }
}

fn next(state: &mut u64) -> u64 {
    *state ^= *state << 13;
    *state ^= *state >> 7;
    *state ^= *state << 17;
    *state
}
