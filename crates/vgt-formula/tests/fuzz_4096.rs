//! Deterministic, bounded byte-mutation coverage for the production formula parser.
//! This is a repeatable regression battery, not a substitute for coverage of every
//! parser elsewhere in the workspace or a long-running coverage-guided fuzzer.

use std::borrow::Cow;
use std::panic::catch_unwind;

use vgt_formula::{FormulaError, FormulaLimits, Parser};

const MUTATION_CASES: usize = 4_096;
const MAX_MUTATED_BYTES: usize = 1_024;

const SEEDS: &[&[u8]] = &[
    b"=A1+42",
    b"=SUM(A1:B3,42,\"text\")",
    b"='Sheet 2'!$C$4>=FALSE()",
    b"=Table1[Amount]*2",
    b"=IF(A1<0,\"negative\",\"ok\")",
    b"=1.25e-10^2&\"suffix\"",
    b"=A1:B2",
    b"=\"unterminated",
    b"=((((A1))))",
    b"=SUM(,A1,,)",
];

const HOSTILE_BYTES: &[u8] = &[
    0x00, 0x01, 0x09, 0x0a, 0x0d, 0x1b, 0x22, 0x27, 0x2c, 0x2e, 0x3a, 0x3b, 0x3d, 0x5b, 0x5c, 0x5d,
    0x7f, 0x80, 0xff,
];

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
            let suffixes: [&[u8]; 6] = [b"!", b"\0", b"'!A1", b"[[", b")))", b"\xff\xfe"];
            let suffix = suffixes[(next_random(state) as usize) % suffixes.len()];
            let available = MAX_MUTATED_BYTES.saturating_sub(bytes.len());
            bytes.extend_from_slice(&suffix[..suffix.len().min(available)]);
        }
    }

    if bytes.len() > MAX_MUTATED_BYTES {
        bytes.truncate(MAX_MUTATED_BYTES);
    }
    if bytes.as_slice() == seed {
        let replacement = bytes.first_mut().expect("all fuzz seeds are non-empty");
        *replacement ^= 0xff;
    }
    debug_assert_ne!(
        bytes.as_slice(),
        seed,
        "case {case_index} must mutate its seed"
    );
    bytes
}

fn parse_without_panicking(input: &str, case_index: usize) -> Result<(), String> {
    match catch_unwind(|| Parser::parse(input)) {
        Ok(_parse_result) => Ok(()),
        Err(_) => Err(format!("formula parser panicked on case {case_index}")),
    }
}

fn lossy_text(bytes: &[u8]) -> Cow<'_, str> {
    // Parser::parse accepts UTF-8 text, not arbitrary bytes. Lossy decoding makes
    // malformed byte mutations representable while retaining a deterministic input.
    String::from_utf8_lossy(bytes)
}

#[test]
fn deterministic_formula_parser_byte_mutations_4096_are_bounded_and_never_panic() {
    let mut state = 0x5647_5446_4f52_4d55_u64;
    let mut parsed_cases = 0usize;

    for case_index in 0..MUTATION_CASES {
        let seed = SEEDS[case_index % SEEDS.len()];
        let mutation = mutate(seed, &mut state, case_index);
        assert!(mutation.len() <= MAX_MUTATED_BYTES);
        let formula = lossy_text(&mutation);
        if let Err(message) = parse_without_panicking(formula.as_ref(), case_index) {
            panic!("{message}");
        }
        parsed_cases += 1;
    }
    assert_eq!(parsed_cases, MUTATION_CASES);

    let limits = FormulaLimits::DEFAULT;
    let deep_parentheses = format!(
        "={}A1{}",
        "(".repeat(limits.max_parse_depth + 32),
        ")".repeat(limits.max_parse_depth + 32)
    );
    assert!(matches!(
        Parser::parse(&deep_parentheses),
        Err(FormulaError::ResourceLimit(_))
    ));

    let oversized = "A".repeat(limits.max_formula_bytes + 1);
    assert!(matches!(
        Parser::parse(&oversized),
        Err(FormulaError::ResourceLimit(_))
    ));

    let over_token_limit = format!("={}1+", "1+".repeat(limits.max_tokens / 2));
    assert!(matches!(
        Parser::parse(&over_token_limit),
        Err(FormulaError::ResourceLimit(_))
    ));

    let over_argument_limit = format!("=SUM({})", vec!["1"; 256].join(","));
    assert!(matches!(
        Parser::parse(&over_argument_limit),
        Err(FormulaError::ResourceLimit(_))
    ));
}
