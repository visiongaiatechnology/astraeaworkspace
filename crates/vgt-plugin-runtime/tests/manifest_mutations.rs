// STATUS: PLATIN
#![forbid(unsafe_code)]

use std::panic::{catch_unwind, AssertUnwindSafe};

use vgt_plugin_runtime::{
    ApiCompatibility, ManifestError, PluginCapability, PluginEntrypoint, PluginManifest,
    PluginPackageSignature, PluginResourceLimits, PluginUpdateSource, MAX_PLUGIN_CAPABILITIES,
    MAX_PLUGIN_ENTRYPOINTS, PLUGIN_API_CURRENT, PLUGIN_MANIFEST_SCHEMA,
};

const CASE_COUNT: usize = 4_096;
const MANIFEST_BYTE_LIMIT: usize = 64 * 1024;
const MAX_CASE_BYTES: usize = MANIFEST_BYTE_LIMIT + 1;

#[test]
fn parse_bounded_json_survives_exactly_4096_hostile_mutations() {
    let seeds = hostile_seeds();
    let exact_limit_case = seeds.len() - 2;
    let over_limit_case = seeds.len() - 1;
    let mut success_count = 0usize;
    let mut error_counts = [0usize; 11];

    for case_index in 0..CASE_COUNT {
        let input = mutation_case(&seeds, case_index);
        assert!(
            input.len() <= MAX_CASE_BYTES,
            "case {case_index} exceeded bounded input size: {} bytes",
            input.len()
        );

        let result = catch_unwind(AssertUnwindSafe(|| {
            PluginManifest::parse_bounded_json(&input)
        }));
        assert!(
            result.is_ok(),
            "parse_bounded_json panicked in case {case_index}"
        );
        let result = result.expect("panic was checked above");

        if case_index == exact_limit_case {
            assert!(
                result.is_ok(),
                "valid manifest padded to the exact 64 KiB limit was rejected: {result:?}"
            );
        }
        if case_index == over_limit_case {
            assert_eq!(result, Err(ManifestError::Schema));
        }

        match result {
            Ok(manifest) => {
                success_count += 1;
                assert!(manifest.validate().is_ok());
                assert_eq!(manifest.schema_version, PLUGIN_MANIFEST_SCHEMA);
            }
            Err(error) => error_counts[error_bucket(&error)] += 1,
        }
    }

    let error_count: usize = error_counts.iter().sum();
    println!(
        "cases={CASE_COUNT} accepted={success_count} rejected={error_count} error_buckets={error_counts:?} max_input_bytes={MAX_CASE_BYTES} manifest_limit_bytes={MANIFEST_BYTE_LIMIT}"
    );
    assert_eq!(success_count + error_count, CASE_COUNT);
    assert!(success_count > 0, "valid manifest seed was never accepted");
    assert!(
        error_count > 0,
        "hostile manifest seeds produced no typed errors"
    );
}

fn hostile_seeds() -> Vec<Vec<u8>> {
    let baseline = valid_manifest();
    let valid = serde_json::to_vec(&baseline).expect("test manifest serialization is infallible");
    let mut seeds = vec![
        valid.clone(),
        Vec::new(),
        b"{".to_vec(),
        b"[]".to_vec(),
        b"null".to_vec(),
        b"{\"schemaVersion\":2}".to_vec(),
        replace_once(
            &valid,
            b",\"pluginId\":",
            b",\"unknown\":true,\"pluginId\":",
        ),
        replace_once(
            &valid,
            b",\"pluginId\":",
            b",\"pluginId\":\"duplicate.plugin\",\"pluginId\":",
        ),
        replace_once(
            &valid,
            b"\"minimumInclusive\":",
            b"\"unknown\":0,\"minimumInclusive\":",
        ),
        replace_once(&valid, b"\"version\":\"1.2.3\"", b"\"version\":\"invalid\""),
        replace_once(
            &valid,
            b"\"packageSha256\":",
            b"\"packageSha256\":7,\"discarded\":",
        ),
        replace_once(&valid, b"\"kind\":\"wasm\"", b"\"kind\":\"native\""),
        replace_once(
            &valid,
            b"\"requestedCapabilities\":[]",
            b"\"requestedCapabilities\":[\"unknown.capability\"]",
        ),
        replace_once(
            &valid,
            b"\"signature\":null",
            b"\"signature\":{\"algorithm\":\"Ed25519\"}",
        ),
        replace_once(
            &valid,
            b"\"kind\":\"offline-file\"",
            b"\"kind\":\"unknown-source\"",
        ),
        nested_unknown_field(&valid, 192),
        invalid_utf8_insertion(&valid),
        b"{\"schemaVersion\":\"\\uD800\"}".to_vec(),
    ];

    let mut oversized_identifier = baseline.clone();
    oversized_identifier.plugin_id = format!("a{}", "b".repeat(128));
    seeds.push(serde_json::to_vec(&oversized_identifier).expect("oversized test ID serializes"));

    let mut oversized_name = baseline.clone();
    oversized_name.name = "N".repeat(129);
    seeds.push(serde_json::to_vec(&oversized_name).expect("oversized test name serializes"));

    let mut invalid_publisher = baseline.clone();
    invalid_publisher.publisher = "publisher\ncontrol".to_owned();
    seeds.push(serde_json::to_vec(&invalid_publisher).expect("control-character test serializes"));

    let mut oversized_signature = baseline.clone();
    oversized_signature.signature = Some(PluginPackageSignature {
        algorithm: "Ed25519".to_owned(),
        key_id: "key-1".to_owned(),
        public_key_base64: "A".repeat(129),
        signature_base64: "B".to_owned(),
    });
    seeds.push(serde_json::to_vec(&oversized_signature).expect("signature boundary serializes"));

    let mut too_many_entrypoints = baseline.clone();
    too_many_entrypoints.entrypoints = vec![
        PluginEntrypoint::Wasm {
            export_name: "entry".to_owned(),
        };
        MAX_PLUGIN_ENTRYPOINTS + 1
    ];
    seeds.push(serde_json::to_vec(&too_many_entrypoints).expect("entrypoint boundary serializes"));

    let mut too_many_capabilities = baseline.clone();
    too_many_capabilities.requested_capabilities =
        vec![PluginCapability::DocumentRead; MAX_PLUGIN_CAPABILITIES + 1];
    seeds.push(serde_json::to_vec(&too_many_capabilities).expect("capability boundary serializes"));

    let mut invalid_resources = baseline.clone();
    invalid_resources.resource_limits = PluginResourceLimits {
        max_linear_memory_bytes: u64::MAX,
        ..PluginResourceLimits::default()
    };
    seeds.push(serde_json::to_vec(&invalid_resources).expect("resource boundary serializes"));

    let mut exact_limit = valid.clone();
    exact_limit.resize(MANIFEST_BYTE_LIMIT, b' ');
    seeds.push(exact_limit);
    seeds.push(vec![b' '; MANIFEST_BYTE_LIMIT + 1]);

    seeds.retain(|seed| seed.len() <= MAX_CASE_BYTES);
    seeds
}

fn valid_manifest() -> PluginManifest {
    PluginManifest {
        schema_version: PLUGIN_MANIFEST_SCHEMA.to_owned(),
        plugin_id: "vgt.test.plugin".to_owned(),
        name: "Test Plugin".to_owned(),
        publisher: "VGT Test Publisher".to_owned(),
        version: "1.2.3".to_owned(),
        api_compatibility: ApiCompatibility {
            minimum_inclusive: PLUGIN_API_CURRENT.to_owned(),
            maximum_exclusive: Some("vgt.workspace.plugin/2".to_owned()),
        },
        package_sha256: "a".repeat(64),
        signature: None,
        entrypoints: vec![PluginEntrypoint::Wasm {
            export_name: "entry".to_owned(),
        }],
        requested_capabilities: Vec::new(),
        resource_limits: PluginResourceLimits::default(),
        update_source: PluginUpdateSource::OfflineFile {
            source_id: "manual-import".to_owned(),
        },
    }
}

fn mutation_case(seeds: &[Vec<u8>], case_index: usize) -> Vec<u8> {
    if case_index < seeds.len() {
        return seeds[case_index].clone();
    }

    let seed = &seeds[(case_index.wrapping_mul(31).wrapping_add(7)) % seeds.len()];
    let mut bytes = seed.clone();
    let mut state = (case_index as u64).wrapping_add(0x517c_c1b7_2722_0a95);

    match case_index % 11 {
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
            let punctuation = [b'{', b'}', b'[', b']', b'"', b'\\', b',', b':', 0, 0xff];
            let position = next(&mut state) as usize % (bytes.len() + 1);
            let value = punctuation[next(&mut state) as usize % punctuation.len()];
            bytes.insert(position, value);
        }
        3 => {
            let suffix = [b' ', b'"', b'\\', b'u', b'0', b'}', b']', 0xff];
            let count = next(&mut state) as usize % (suffix.len() + 1);
            bytes.extend_from_slice(&suffix[..count]);
        }
        4 => {
            let flips = (next(&mut state) as usize % 8).saturating_add(1);
            for _ in 0..flips {
                if bytes.is_empty() {
                    break;
                }
                let position = next(&mut state) as usize % bytes.len();
                bytes[position] ^= 1u8 << (next(&mut state) as u32 % 8);
            }
        }
        5 => {
            let target_len = next(&mut state) as usize % (MAX_CASE_BYTES + 1);
            if target_len < bytes.len() {
                bytes.truncate(target_len);
            } else {
                bytes.resize(target_len, b' ');
            }
        }
        6 => {
            insert_before_final_object_delimiter(&mut bytes, b",\"duplicate\":1,\"duplicate\":2");
        }
        7 => {
            let hostile = [0xff, 0xfe, 0x00, b'\\', b'u', b'D', b'8', b'0', b'0'];
            let position = next(&mut state) as usize % (bytes.len() + 1);
            bytes.splice(position..position, hostile);
        }
        8 => {
            let depth = (next(&mut state) as usize % 256).saturating_add(1);
            let mut nested = b",\"nested\":".to_vec();
            nested.extend(std::iter::repeat_n(b'[', depth));
            nested.push(b'0');
            nested.extend(std::iter::repeat_n(b']', depth));
            insert_before_final_object_delimiter(&mut bytes, &nested);
        }
        9 => {
            let needle = b"\"schemaVersion\":\"vgt.workspace.plugin-manifest/2\"";
            bytes = replace_once(&bytes, needle, b"\"schemaVersion\":false");
        }
        _ => {
            let count = next(&mut state) as usize % 1_024;
            bytes.extend(std::iter::repeat_n(b' ', count));
        }
    }

    bytes.truncate(MAX_CASE_BYTES);
    bytes
}

fn error_bucket(error: &ManifestError) -> usize {
    match error {
        ManifestError::Schema => 0,
        ManifestError::PluginId => 1,
        ManifestError::Publisher => 2,
        ManifestError::Version => 3,
        ManifestError::ApiCompatibility => 4,
        ManifestError::Entrypoint => 5,
        ManifestError::Capability => 6,
        ManifestError::ResourceLimit => 7,
        ManifestError::Digest => 8,
        ManifestError::Signature => 9,
        ManifestError::UpdateSource => 10,
    }
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

fn nested_unknown_field(input: &[u8], depth: usize) -> Vec<u8> {
    let mut nested = b",\"unknown\":".to_vec();
    nested.extend(std::iter::repeat_n(b'[', depth));
    nested.push(b'0');
    nested.extend(std::iter::repeat_n(b']', depth));
    let mut output = input.to_vec();
    insert_before_final_object_delimiter(&mut output, &nested);
    output
}

fn invalid_utf8_insertion(input: &[u8]) -> Vec<u8> {
    let mut output = input.to_vec();
    let insertion = output.len().min(16);
    output.splice(insertion..insertion, [0xff, 0xfe]);
    output
}

fn insert_before_final_object_delimiter(bytes: &mut Vec<u8>, insertion: &[u8]) {
    if let Some(end) = bytes.iter().rposition(|byte| !byte.is_ascii_whitespace()) {
        if bytes[end] == b'}' {
            bytes.splice(end..end, insertion.iter().copied());
            return;
        }
    }
    bytes.extend_from_slice(insertion);
}

fn next(state: &mut u64) -> u64 {
    *state ^= *state << 13;
    *state ^= *state >> 7;
    *state ^= *state << 17;
    *state
}
