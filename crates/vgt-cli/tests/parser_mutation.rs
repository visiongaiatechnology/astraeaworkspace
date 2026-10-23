//! Bounded deterministic mutation coverage for the CLI's pure decoding boundaries.

#[path = "../src/base64.rs"]
mod base64;
#[path = "../src/ipc_auth.rs"]
mod ipc_auth;

use ipc_auth::{IpcAuthError, IpcAuthState};
use std::panic::{catch_unwind, AssertUnwindSafe};

const MUTATION_CASES: usize = 4_096;
const HEX: &[u8; 16] = b"0123456789abcdef";

fn next_byte(state: &mut u64) -> u8 {
    *state = state.wrapping_add(0x9e37_79b9_7f4a_7c15);
    let mut value = *state;
    value = (value ^ (value >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
    value = (value ^ (value >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
    (value ^ (value >> 31)) as u8
}

fn deterministic_bytes(state: &mut u64, length: usize) -> Vec<u8> {
    (0..length).map(|_| next_byte(state)).collect()
}

fn token_hex(bytes: &[u8; 32], uppercase: bool) -> String {
    let mut token = String::with_capacity(64);
    for byte in bytes {
        token.push(HEX[(byte >> 4) as usize] as char);
        token.push(HEX[(byte & 0x0f) as usize] as char);
    }
    if uppercase {
        token.make_ascii_uppercase();
    }
    token
}

#[test]
fn base64_canonical_roundtrips_preserve_all_bytes_across_4096_bounded_cases() {
    let mut state = 0x6173_7472_6165_6131;

    for case in 0..MUTATION_CASES {
        let length = case % 513;
        let input = deterministic_bytes(&mut state, length);
        let encoded = base64::encode(&input);
        let decoded = catch_unwind(|| base64::decode(&encoded));

        assert!(decoded.is_ok(), "canonical case {case} panicked");
        let decoded = decoded.expect("panic was checked");
        assert_eq!(decoded, Ok(input), "canonical case {case} changed bytes");
    }
}

#[test]
fn base64_invalid_lengths_and_alphabet_are_rejected_without_panics_across_4096_cases() {
    let mut state = 0x626f_756e_6465_6432;

    for case in 0..MUTATION_CASES {
        let length = case % 64 + 1;
        let bytes = deterministic_bytes(&mut state, length);
        let mut malformed = base64::encode(&bytes);
        match case % 4 {
            0 => {
                malformed.pop();
            }
            1 => malformed.push('A'),
            2 => malformed.replace_range(0..1, "!"),
            _ => {
                let last = malformed.len() - 1;
                malformed.replace_range(last.., "-");
            }
        }

        let decoded = catch_unwind(|| base64::decode(&malformed));
        assert!(decoded.is_ok(), "malformed base64 case {case} panicked");
        assert!(
            decoded.expect("panic was checked").is_err(),
            "case {case} was accepted"
        );
    }
}

#[test]
fn base64_rejects_padding_before_the_final_sextet_across_4096_cases() {
    let mut state = 0x7061_6464_696e_6733;
    let mut panicked = 0usize;
    let mut accepted = 0usize;
    let mut first_accepted = None;

    for case in 0..MUTATION_CASES {
        let malformed = if case == 0 {
            "AA=A".to_string()
        } else {
            let bytes = deterministic_bytes(&mut state, 3);
            let mut encoded = base64::encode(&bytes);
            encoded.replace_range(2..3, "=");
            encoded
        };

        match catch_unwind(|| base64::decode(&malformed)) {
            Err(_) => panicked += 1,
            Ok(Err(_)) => {}
            Ok(Ok(_)) => {
                accepted += 1;
                if first_accepted.is_none() {
                    first_accepted = Some(malformed.clone());
                }
            }
        }
        assert_eq!(malformed.len(), 4, "fixture {case} escaped its bound");
    }

    assert_eq!(panicked, 0, "decoder panicked on malformed padding");
    assert_eq!(
        accepted, 0,
        "decoder accepted {accepted} of {MUTATION_CASES} inputs with padding in position 3 and data in position 4; first accepted sample: {first_accepted:?}"
    );
}

#[test]
fn base64_accepts_canonical_padding_and_rejects_non_canonical_pad_bits() {
    assert_eq!(base64::decode("AA=="), Ok(vec![0]));
    assert_eq!(base64::decode("AAA="), Ok(vec![0, 0]));
    assert!(base64::decode("AB==").is_err());
    assert!(base64::decode("AAB=").is_err());
    assert!(base64::decode("AAAAAA==AAAA").is_err());
}

#[test]
fn ipc_tokens_decode_and_authorize_exactly_across_4096_cases() {
    assert_eq!(ipc_auth::IPC_AUTH_HEADER, "x-vgt-ipc-token");
    let mut state_seed = 0x6970_632d_6175_7468;

    for case in 0..MUTATION_CASES {
        let mut bytes = [0u8; 32];
        for byte in &mut bytes {
            *byte = next_byte(&mut state_seed);
        }
        let token = token_hex(&bytes, case % 2 == 1);
        let mut auth = IpcAuthState::default();

        let paired = catch_unwind(AssertUnwindSafe(|| auth.pair(&token)));
        assert!(
            paired.is_ok(),
            "valid IPC token case {case} panicked while pairing"
        );
        assert_eq!(paired.expect("panic was checked"), Ok(()));
        assert_eq!(
            auth.paired_count(),
            1,
            "valid token case {case} changed cardinality"
        );

        let authorized = catch_unwind(AssertUnwindSafe(|| auth.authorize(Some(&token))));
        assert!(
            authorized.is_ok(),
            "valid IPC token case {case} panicked while authorizing"
        );
        assert_eq!(authorized.expect("panic was checked"), Ok(()));

        bytes[case % 32] ^= 1;
        let different = token_hex(&bytes, case % 2 == 0);
        let rejected = catch_unwind(AssertUnwindSafe(|| auth.authorize(Some(&different))));
        assert!(rejected.is_ok(), "different IPC token case {case} panicked");
        assert_eq!(
            rejected.expect("panic was checked"),
            Err(IpcAuthError::Unauthorized),
            "different valid token case {case} was not rejected as unauthorized"
        );
    }
}

#[test]
fn ipc_tokens_reject_invalid_lengths_and_hex_without_panics_across_4096_cases() {
    let mut state_seed = 0x6970_632d_626f_756e;

    for case in 0..MUTATION_CASES {
        let mut bytes = [0u8; 32];
        for byte in &mut bytes {
            *byte = next_byte(&mut state_seed);
        }
        let mut malformed = token_hex(&bytes, false);
        if case % 2 == 0 {
            malformed.replace_range(case % 64..case % 64 + 1, "g");
        } else {
            malformed.truncate(case % 64);
        }

        let auth = IpcAuthState::default();
        let rejected = catch_unwind(AssertUnwindSafe(|| auth.authorize(Some(&malformed))));
        assert!(rejected.is_ok(), "malformed IPC token case {case} panicked");
        assert_eq!(
            rejected.expect("panic was checked"),
            Err(IpcAuthError::InvalidToken),
            "malformed IPC token case {case} was not rejected at decoding"
        );
    }
}
