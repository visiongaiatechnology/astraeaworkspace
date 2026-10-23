use std::panic::{catch_unwind, AssertUnwindSafe};
use vgt_object_model::WorkspaceReferenceObject;

const CASES: usize = 4_096;
const MAX_INPUT_BYTES: usize = 4_096;
const VALID_URI: &str = "vgt://workspace/document/doc-2026/object/object-7";
const HOSTILE_FRAGMENTS: &[&str] = &[
    "../",
    "%2e%2e%2f",
    "/object/",
    "?query=1",
    "#fragment",
    "\\",
    "\u{0000}",
    "https://invalid.example/",
];

#[test]
fn workspace_reference_uri_parser_survives_4096_bounded_mutations() {
    let (document_id, object_id) =
        WorkspaceReferenceObject::parse_uri(VALID_URI).expect("valid reference URI is accepted");
    assert_eq!(document_id, "doc-2026");
    assert_eq!(object_id, "object-7");

    for case_index in 0..CASES {
        let input = mutate_uri(VALID_URI, case_index);
        assert!(
            input.len() <= MAX_INPUT_BYTES,
            "case {case_index} exceeded the bounded input limit"
        );

        let outcome = catch_unwind(AssertUnwindSafe(|| {
            WorkspaceReferenceObject::parse_uri(&input)
        }));
        let parsed = outcome.unwrap_or_else(|_| {
            panic!(
                "WorkspaceReferenceObject::parse_uri panicked on case {case_index} ({} bytes)",
                input.len()
            )
        });

        if let Ok((document_id, object_id)) = parsed {
            assert!(
                !document_id.is_empty(),
                "case {case_index} accepted an empty document id"
            );
            assert!(
                !object_id.is_empty(),
                "case {case_index} accepted an empty object id"
            );
            assert!(input.starts_with("vgt://workspace/document/"));
            assert!(input.contains("/object/"));
        }
    }
}

fn mutate_uri(seed: &str, case_index: usize) -> String {
    let mut state = (case_index as u32)
        .wrapping_mul(0x9e37_79b9)
        .wrapping_add(0x51f1_5eed);
    state ^= state << 13;
    state ^= state >> 17;
    state ^= state << 5;
    let fragment = HOSTILE_FRAGMENTS[(state as usize) % HOSTILE_FRAGMENTS.len()];
    let seed_bytes = seed.as_bytes();
    let position = (state as usize) % seed_bytes.len();

    let candidate = match case_index % 8 {
        0 => String::from_utf8_lossy(&seed_bytes[..position]).into_owned(),
        1 => {
            let mut bytes = seed_bytes.to_vec();
            bytes[position] ^= 1 << ((state >> 8) % 8);
            String::from_utf8_lossy(&bytes).into_owned()
        }
        2 => format!("{}{}{}", &seed[..position], fragment, &seed[position..]),
        3 => format!("{fragment}{seed}"),
        4 => format!("{seed}{fragment}"),
        5 => format!("{seed}/object/{case_index}"),
        6 => format!(
            "vgt://workspace/document/{}/object/{seed}",
            "/../".repeat(1 + case_index % 32)
        ),
        _ => {
            let target_len = 1 + (state as usize % MAX_INPUT_BYTES);
            let mut value = String::with_capacity(target_len.min(MAX_INPUT_BYTES));
            value.extend(std::iter::repeat_n('x', target_len.saturating_sub(seed.len())));
            value.push_str(seed);
            value
        }
    };

    candidate.chars().take(MAX_INPUT_BYTES).collect()
}
