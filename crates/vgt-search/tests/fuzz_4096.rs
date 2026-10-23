// STATUS: PLATIN
//! Deterministic bounded hostile-input coverage for public search parsers.

use std::panic::{catch_unwind, AssertUnwindSafe};
use vgt_search::{
    parse_query, tokenize, ParsedSearchQuery, SearchError, MAX_QUERY_BYTES, MAX_TOKEN_CHARS,
};

const CASES: usize = 4_096;
const MAX_CASE_BYTES: usize = MAX_QUERY_BYTES + 32;

#[test]
fn parse_query_survives_4096_deterministic_hostile_strings() {
    let mut failures = Vec::new();
    let mut attempted = 0usize;

    for case in 0..CASES {
        let query = query_case(case);
        attempted += 1;
        if query.len() > MAX_CASE_BYTES {
            failures.push(format!(
                "case {case} exceeded input cap: {} bytes",
                query.len()
            ));
            continue;
        }

        let parsed = catch_unwind(AssertUnwindSafe(|| parse_query(&query)));
        let parsed = match parsed {
            Ok(parsed) => parsed,
            Err(_) => {
                failures.push(format!("case {case} panicked ({} bytes)", query.len()));
                continue;
            }
        };

        let over_limit = query.trim().len() > MAX_QUERY_BYTES;
        if over_limit {
            if parsed != Err(SearchError::QueryTooLarge) {
                failures.push(format!(
                    "case {case} is {} bytes after trim but returned {parsed:?}",
                    query.trim().len()
                ));
            }
            continue;
        }

        match parsed {
            Ok(result) => {
                if let Err(reason) = validate_query_result(&query, &result) {
                    failures.push(format!("case {case}: {reason}"));
                }
            }
            Err(SearchError::EmptyQuery | SearchError::InvalidQuery(_)) => {}
            Err(error) => failures.push(format!("case {case} returned unexpected error {error:?}")),
        }
    }

    assert_eq!(attempted, CASES, "the full query mutation corpus must run");
    assert!(
        failures.is_empty(),
        "query parser mutation failures: {failures:?}"
    );
}

#[test]
fn tokenizer_survives_4096_deterministic_hostile_strings_with_bounded_results() {
    let mut failures = Vec::new();
    let mut attempted = 0usize;

    for case in 0..CASES {
        let text = tokenizer_case(case);
        attempted += 1;
        if text.len() > MAX_QUERY_BYTES {
            failures.push(format!(
                "case {case} exceeded input cap: {} bytes",
                text.len()
            ));
            continue;
        }

        let tokens = match catch_unwind(AssertUnwindSafe(|| tokenize(&text))) {
            Ok(tokens) => tokens,
            Err(_) => {
                failures.push(format!("case {case} panicked ({} bytes)", text.len()));
                continue;
            }
        };
        if tokens.len() > text.chars().count() {
            failures.push(format!(
                "case {case} produced more tokens than input characters"
            ));
        }
        if tokens.iter().any(String::is_empty) {
            failures.push(format!("case {case} produced an empty token"));
        }
        let output_bytes = tokens.iter().map(String::len).sum::<usize>();
        if output_bytes > text.len().saturating_mul(12) {
            failures.push(format!("case {case} exceeded bounded tokenizer output"));
        }
    }

    assert_eq!(
        attempted, CASES,
        "the full tokenizer mutation corpus must run"
    );
    assert!(
        failures.is_empty(),
        "tokenizer mutation failures: {failures:?}"
    );
}

#[test]
fn tokenizer_keeps_normalized_tokens_within_the_declared_character_limit() {
    let expansion_input = "İ".repeat(MAX_TOKEN_CHARS + 1);
    let tokens = tokenize(&expansion_input);

    assert_eq!(tokens.len(), 1);
    assert!(
        tokens[0].chars().count() <= MAX_TOKEN_CHARS,
        "one {MAX_TOKEN_CHARS}-character input token expanded to {} output characters after lowercase normalization",
        tokens[0].chars().count()
    );
}

fn validate_query_result(input: &str, query: &ParsedSearchQuery) -> Result<(), String> {
    let max_items = input.chars().count().saturating_add(1);
    let collection_lengths = [
        query.terms.len(),
        query.phrases.len(),
        query.filters.document_kinds.len(),
        query.filters.fields.len(),
        query.filters.tags.len(),
        query.filters.object_types.len(),
    ];
    if collection_lengths.iter().any(|length| *length > max_items) {
        return Err("parsed collection grew beyond the bounded input-derived count".to_string());
    }
    if query.terms.iter().any(String::is_empty)
        || query.phrases.iter().any(String::is_empty)
        || query.filters.tags.iter().any(String::is_empty)
        || query.filters.object_types.iter().any(String::is_empty)
    {
        return Err("successful query contains an empty parsed value".to_string());
    }
    if query.terms.windows(2).any(|pair| pair[0] > pair[1])
        || query.phrases.windows(2).any(|pair| pair[0] > pair[1])
    {
        return Err("terms or phrases are not in canonical sorted order".to_string());
    }
    if query
        .proximity
        .is_some_and(|distance| !(1..=64).contains(&distance))
    {
        return Err("proximity escaped its accepted 1..=64 range".to_string());
    }

    let parsed_text_bytes = query
        .terms
        .iter()
        .chain(query.phrases.iter())
        .chain(query.filters.tags.iter())
        .chain(query.filters.object_types.iter())
        .map(String::len)
        .sum::<usize>();
    if parsed_text_bytes > input.len().saturating_mul(12) {
        return Err("parsed text exceeded the bounded Unicode expansion ceiling".to_string());
    }
    let has_content = !query.terms.is_empty()
        || !query.phrases.is_empty()
        || query.filters != Default::default()
        || query.proximity.is_some();
    if !has_content {
        return Err("successful parse produced an empty query".to_string());
    }
    Ok(())
}

fn query_case(case: usize) -> String {
    const EDGE_QUERIES: &[&str] = &[
        "",
        " \t\n ",
        "\"",
        "\"\"",
        "\"first phrase\" \"second phrase\"",
        "type:writer field:title tag:research",
        "type:",
        "field:unknown",
        "type:unknown",
        "near:0",
        "near:64",
        "near:65",
        "near:65536",
        "after:-9223372036854775808",
        "before:9223372036854775808",
        "unknown:value",
        "\0hidden",
        "\u{0001}control",
        "tab\tnewline\nallowed",
        "İ dotted-capital-i",
    ];

    match case {
        0 => "type:writer \"safe phrase\" tag:security near:2".to_string(),
        1..=512 => {
            let seed = "alpha:type:writer \"safe phrase\" tag:security";
            seed.chars()
                .take((case - 1) % seed.chars().count())
                .collect()
        }
        513..=1_024 => EDGE_QUERIES[(case - 513) % EDGE_QUERIES.len()].to_string(),
        1_025..=1_536 => {
            let repetitions = 1 + (case - 1_025) % 192;
            format!(
                "tag:{}:{}:{}",
                "İ".repeat(repetitions),
                "e\u{0301}".repeat(repetitions),
                case
            )
        }
        1_537..=1_792 => {
            let control = char::from_u32((case - 1_537) as u32).unwrap_or('\u{0001}');
            format!("term{}type:notes \"quoted{}phrase\"", control, control)
        }
        1_793..=2_048 => {
            let quotes = 1 + (case - 1_793) % 64;
            format!("{}term{}", "\"".repeat(quotes), "\"".repeat(quotes / 2))
        }
        2_049..=2_560 => {
            let length = 4_080 + (case - 2_049) % 49;
            "x".repeat(length)
        }
        _ => mutate_text(
            "alpha type:writer \"search phrase\" near:4",
            case,
            0x5155_4552_5900_0001,
        ),
    }
}

fn tokenizer_case(case: usize) -> String {
    match case {
        0 => "Alpha-beta_ß 42 / searchable".to_string(),
        1..=512 => {
            let seed = "Alpha-beta_ß 42 / searchable";
            seed.chars()
                .take((case - 1) % seed.chars().count())
                .collect()
        }
        513..=1_024 => {
            let length = 257 + (case - 513) % 64;
            "İ".repeat(length)
        }
        1_025..=1_536 => {
            let count = 1 + (case - 1_025) % 1_000;
            format!(
                "{}{}{}",
                "a-".repeat(count),
                "İ".repeat(257),
                "z".repeat(count / 2)
            )
        }
        1_537..=2_048 => {
            let length = 256 + (case - 1_537) % 768;
            "界".repeat(length)
        }
        _ => mutate_text("Alpha-beta_ß 42 / searchable", case, 0x544f_4b45_4e00_0002),
    }
}

fn mutate_text(seed: &str, case: usize, salt: u64) -> String {
    const REPLACEMENTS: &[char] = &[
        ':', '"', '\\', '\0', '\u{007f}', 'İ', '\u{0307}', '\n', ' ', '9', '❤', '界',
    ];
    let mut chars = seed.chars().collect::<Vec<_>>();
    let mut state = (case as u64)
        .wrapping_mul(0x9E37_79B9_7F4A_7C15)
        .wrapping_add(salt | 1);
    for _ in 0..1 + case % 4 {
        if chars.is_empty() {
            chars.push(REPLACEMENTS[next(&mut state) as usize % REPLACEMENTS.len()]);
        } else {
            let offset = next(&mut state) as usize % chars.len();
            chars[offset] = REPLACEMENTS[next(&mut state) as usize % REPLACEMENTS.len()];
        }
    }
    if case & 1 == 0 {
        let offset = next(&mut state) as usize % (chars.len() + 1);
        chars.insert(
            offset,
            REPLACEMENTS[next(&mut state) as usize % REPLACEMENTS.len()],
        );
    }
    let mut output = chars.into_iter().collect::<String>();
    while output.len() > MAX_QUERY_BYTES {
        output.pop();
    }
    output
}

fn next(state: &mut u64) -> u64 {
    // xorshift64*: deterministic test data only, never used for security decisions.
    *state ^= *state >> 12;
    *state ^= *state << 25;
    *state ^= *state >> 27;
    state.wrapping_mul(0x2545_F491_4F6C_DD1D)
}
