// STATUS: DIAMANT VGT SUPREME
//! Deterministic SEC-096 mutation coverage for VWC metadata, manifest, framing and stream readers.
//! The existing `fuzz_4096.rs` targets only `inspect_structure`; this suite targets other public
//! parsing boundaries and deliberately avoids adding another `inspect_structure` mutation loop.

use std::collections::HashMap;
use std::io::Cursor;
use std::panic::{catch_unwind, AssertUnwindSafe};
use vgt_container::{
    ChunkType, CompressionAlgorithm, ContainerCompatibility, ContainerError,
    ContainerHeaderMetadata, ContainerManifest, ManifestChunkEntry, VgtContainer,
    CHUNK_FLAG_CRITICAL, CURRENT_CRYPTO_VERSION, CURRENT_FORMAT_VERSION,
    CURRENT_HEADER_SCHEMA_VERSION, CURRENT_MANIFEST_SCHEMA_VERSION, MAGIC_BYTES, MAX_CHUNK_COUNT,
    MAX_MANIFEST_SIZE, MAX_METADATA_SIZE, MAX_TOTAL_PLAINTEXT_SIZE, STREAM_PLAINTEXT_CHUNK_SIZE,
};
use vgt_keyvault::{KeySlot, KeySlotType, UnlockPolicy};
use vgt_object_model::SecurityProfile;

const CASE_COUNT: usize = 4_096;
const MUTATION_BUCKETS: usize = 16;
const CASES_PER_BUCKET: usize = CASE_COUNT / MUTATION_BUCKETS;

/// Die 384-MiB-Grenze liegt KNAPP unter 97 Chunks a 4 MiB (388 MiB). Bucket 13 baut
/// `PlaintextTotalTooLarge` aus hoechstens 97 Chunks; haelt diese Beziehung nicht mehr, ist der Fall
/// nicht mehr konstruierbar.
///
/// **Warum als Kompilierzeit-Zusicherung und nicht als `assert!` in der Schleife** (Clippy:
/// `assertions_on_constants`): beide Seiten sind Konstanten, die Zusicherung kann zur Laufzeit nicht
/// variieren — sie stand dort 341-mal im Mutationsdurchlauf und pruefte jedes Mal dieselbe Zahl. Hier
/// faellt eine Verletzung beim BAUEN auf, statt beim Testlauf, und der Grund steht an einer Stelle.
const _: () = assert!(MAX_TOTAL_PLAINTEXT_SIZE < 97 * STREAM_PLAINTEXT_CHUNK_SIZE);
const MAX_CASE_BYTES: usize = 32 * 1024;
const NONCE_BYTES: usize = 12;
const KDF_SALT_BYTES: usize = 16;
const V3_CHUNK_HEADER_BYTES: usize = 18;

fn without_panicking<T>(boundary: &str, index: usize, operation: impl FnOnce() -> T) -> T {
    match catch_unwind(AssertUnwindSafe(operation)) {
        Ok(result) => result,
        Err(_) => panic!("{boundary} panicked on deterministic hostile case {index}"),
    }
}

fn assert_bucket_counts(counts: [usize; MUTATION_BUCKETS]) {
    assert_eq!(counts, [CASES_PER_BUCKET; MUTATION_BUCKETS]);
}

fn fixture_key_slot() -> KeySlot {
    KeySlot {
        slot_id: 0,
        slot_type: KeySlotType::LocalDevice,
        encrypted_dek: vec![0; 48],
        nonce: [0; NONCE_BYTES],
        kdf_params: None,
        recipient: None,
        hardware: None,
    }
}

fn fixture_metadata(serial: usize) -> ContainerHeaderMetadata {
    ContainerHeaderMetadata {
        header_schema_version: CURRENT_HEADER_SCHEMA_VERSION,
        key_slots: vec![fixture_key_slot()],
        document_id: format!("sec096-doc-{serial}"),
        document_kind: "Writer".to_string(),
        security_profile: SecurityProfile::Standard,
        unlock_policy: UnlockPolicy::DeviceOnly,
        compression: CompressionAlgorithm::None,
        chunk_kdf_salt: Some([0; KDF_SALT_BYTES]),
        extensions: HashMap::new(),
    }
}

fn fixture_manifest() -> ContainerManifest {
    ContainerManifest::new(
        1,
        vec![ManifestChunkEntry::known(0, ChunkType::DocumentTree, 0)],
    )
    .expect("valid SEC-096 manifest fixture")
}

fn frame_v3(metadata_json: &[u8], manifest_json: &[u8], format_version: u16) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(
        12 + metadata_json.len() + 4 + manifest_json.len() + 4 + V3_CHUNK_HEADER_BYTES + 16,
    );
    bytes.extend_from_slice(MAGIC_BYTES);
    bytes.extend_from_slice(&format_version.to_le_bytes());
    bytes.extend_from_slice(&CURRENT_CRYPTO_VERSION.to_le_bytes());
    bytes.extend_from_slice(&(metadata_json.len() as u32).to_le_bytes());
    bytes.extend_from_slice(metadata_json);
    bytes.extend_from_slice(&(manifest_json.len() as u32).to_le_bytes());
    bytes.extend_from_slice(manifest_json);
    bytes.extend_from_slice(&1u32.to_le_bytes());
    bytes.push(0);
    bytes.push(CHUNK_FLAG_CRITICAL);
    bytes.extend_from_slice(&[0; NONCE_BYTES]);
    bytes.extend_from_slice(&16u32.to_le_bytes());
    bytes.extend_from_slice(&[0; 16]);
    bytes
}

fn valid_v3_fixture(serial: usize) -> Vec<u8> {
    let metadata = serde_json::to_vec(&fixture_metadata(serial)).expect("metadata JSON fixture");
    let manifest = serde_json::to_vec(&fixture_manifest()).expect("manifest JSON fixture");
    frame_v3(&metadata, &manifest, CURRENT_FORMAT_VERSION)
}

#[derive(Clone, Copy)]
struct FixtureOffsets {
    metadata_start: usize,
    manifest_len_offset: usize,
    manifest_start: usize,
    chunk_count_offset: usize,
    chunk_header_offset: usize,
    payload_offset: usize,
}

fn fixture_offsets(bytes: &[u8]) -> FixtureOffsets {
    assert!(bytes.len() >= 12);
    let metadata_len = u32::from_le_bytes(
        bytes[8..12]
            .try_into()
            .expect("fixture metadata length field"),
    ) as usize;
    let metadata_start = 12;
    let metadata_end = metadata_start + metadata_len;
    let manifest_len_offset = metadata_end;
    let manifest_len = u32::from_le_bytes(
        bytes[manifest_len_offset..manifest_len_offset + 4]
            .try_into()
            .expect("fixture manifest length field"),
    ) as usize;
    let manifest_start = manifest_len_offset + 4;
    let manifest_end = manifest_start + manifest_len;
    let chunk_count_offset = manifest_end;
    let chunk_header_offset = chunk_count_offset + 4;
    let payload_offset = chunk_header_offset + V3_CHUNK_HEADER_BYTES;
    assert!(payload_offset + 16 <= bytes.len());
    FixtureOffsets {
        metadata_start,
        manifest_len_offset,
        manifest_start,
        chunk_count_offset,
        chunk_header_offset,
        payload_offset,
    }
}

fn mutate_framing_fixture(base: &[u8], offsets: FixtureOffsets, index: usize) -> Vec<u8> {
    let bucket = index % MUTATION_BUCKETS;
    let serial = index / MUTATION_BUCKETS;
    let mut bytes = base.to_vec();
    match bucket {
        0 => bytes[serial % 4] = b'X' + (serial % 8) as u8,
        1 => bytes[4..6].copy_from_slice(&(u16::MAX - serial as u16).to_le_bytes()),
        2 => bytes[6..8].copy_from_slice(&(2 + serial as u16).to_le_bytes()),
        3 => bytes[8..12].copy_from_slice(&0u32.to_le_bytes()),
        4 => bytes[8..12].copy_from_slice(&((MAX_METADATA_SIZE + 1 + serial) as u32).to_le_bytes()),
        5 => bytes[offsets.metadata_start] = b'!',
        6 => bytes[offsets.metadata_start] = 0xff,
        7 => bytes[offsets.manifest_len_offset..offsets.manifest_len_offset + 4]
            .copy_from_slice(&0u32.to_le_bytes()),
        8 => bytes[offsets.manifest_len_offset..offsets.manifest_len_offset + 4]
            .copy_from_slice(&((MAX_MANIFEST_SIZE + 1 + serial) as u32).to_le_bytes()),
        9 => bytes[offsets.manifest_start] = b'!',
        10 => bytes[offsets.chunk_count_offset..offsets.chunk_count_offset + 4]
            .copy_from_slice(&0u32.to_le_bytes()),
        11 => bytes[offsets.chunk_count_offset..offsets.chunk_count_offset + 4]
            .copy_from_slice(&(MAX_CHUNK_COUNT + 1 + serial as u32).to_le_bytes()),
        12 => bytes[offsets.chunk_header_offset + 14..offsets.chunk_header_offset + 18]
            .copy_from_slice(&0u32.to_le_bytes()),
        13 => bytes.truncate(offsets.payload_offset + serial % 16),
        14 => bytes.extend_from_slice(&[0xfe, serial as u8]),
        15 => {
            bytes[offsets.payload_offset] = serial as u8;
            bytes[offsets.payload_offset + 1] = (255 - serial) as u8;
        }
        _ => unreachable!(),
    }
    assert!(bytes.len() <= MAX_CASE_BYTES);
    assert_ne!(bytes, base, "case {index} must mutate the fixture");
    bytes
}

fn metadata_case(index: usize, manifest_json: &[u8]) -> Vec<u8> {
    let bucket = index % MUTATION_BUCKETS;
    let serial = index / MUTATION_BUCKETS;
    let mut value = serde_json::to_value(fixture_metadata(serial)).expect("metadata JSON value");
    let format_version = if bucket == 15 {
        CURRENT_FORMAT_VERSION + 1
    } else {
        CURRENT_FORMAT_VERSION
    };
    let raw = match bucket {
        0 | 15 => serde_json::to_vec(&value).expect("metadata JSON"),
        1 => {
            value["key_slots"] = serde_json::json!([]);
            serde_json::to_vec(&value).expect("empty key slots JSON")
        }
        2 => {
            let slot = serde_json::to_value(fixture_key_slot()).expect("key slot JSON");
            value["key_slots"] = serde_json::Value::Array(vec![slot; 65]);
            serde_json::to_vec(&value).expect("excessive key slots JSON")
        }
        3 => {
            value["header_schema_version"] = serde_json::json!(1);
            serde_json::to_vec(&value).expect("old schema JSON")
        }
        4 => {
            value["chunk_kdf_salt"] = serde_json::Value::Null;
            serde_json::to_vec(&value).expect("missing salt JSON")
        }
        5 => b"{".to_vec(),
        6 => vec![0xff],
        7 => {
            value
                .as_object_mut()
                .expect("metadata object")
                .remove("document_id");
            serde_json::to_vec(&value).expect("missing document id JSON")
        }
        8 => {
            value["key_slots"] = serde_json::json!("not-an-array");
            serde_json::to_vec(&value).expect("invalid slot collection JSON")
        }
        9 => {
            value["key_slots"][0]["nonce"] =
                serde_json::Value::Array(vec![serde_json::json!(0); 11]);
            serde_json::to_vec(&value).expect("invalid nonce length JSON")
        }
        10 => {
            value["key_slots"][0]["unexpected"] = serde_json::json!(serial);
            serde_json::to_vec(&value).expect("unknown slot field JSON")
        }
        11 => {
            value["document_kind"] =
                serde_json::json!(format!("Writer-{serial}-{}", "x".repeat(120)));
            serde_json::to_vec(&value).expect("long document kind JSON")
        }
        12 => {
            value["vendor_extension"] = serde_json::json!({"serial": serial});
            serde_json::to_vec(&value).expect("flattened extension JSON")
        }
        13 => {
            value["document_kind"] = serde_json::json!(format!("Writer\u{0001}-{serial}"));
            serde_json::to_vec(&value).expect("control label JSON")
        }
        14 => {
            value["compression"] = serde_json::json!("unregistered_compression");
            serde_json::to_vec(&value).expect("invalid compression JSON")
        }
        _ => unreachable!(),
    };
    let bytes = frame_v3(&raw, manifest_json, format_version);
    assert!(bytes.len() <= MAX_CASE_BYTES);
    bytes
}

fn expect_metadata_error(error: ContainerError, bucket: usize) {
    match bucket {
        1 | 2 => assert!(matches!(error, ContainerError::InvalidKeySlotCount(_))),
        3 | 4 => assert!(matches!(error, ContainerError::CorruptedData)),
        5 | 6 | 7 | 8 | 9 | 10 | 14 => {
            assert!(matches!(error, ContainerError::Serialization(_)))
        }
        15 => assert!(matches!(error, ContainerError::UnsupportedFormatVersion(_))),
        _ => panic!("unexpected metadata rejection in bucket {bucket}: {error:?}"),
    }
}

#[test]
fn sec096_metadata_readers_survive_4096_bounded_mutations_each() {
    let manifest_json = serde_json::to_vec(&fixture_manifest()).expect("manifest JSON fixture");
    let mut buckets = [0usize; MUTATION_BUCKETS];
    let mut metadata_accepted = 0usize;
    let mut metadata_rejected = 0usize;
    let mut probe_accepted = 0usize;
    let mut probe_rejected = 0usize;

    for index in 0..CASE_COUNT {
        let bucket = index % MUTATION_BUCKETS;
        buckets[bucket] += 1;
        let bytes = metadata_case(index, &manifest_json);
        assert!(bytes.len() <= MAX_CASE_BYTES);

        match without_panicking("VgtContainer::read_metadata", index, || {
            VgtContainer::read_metadata(&bytes)
        }) {
            Ok(metadata) => {
                metadata_accepted += 1;
                assert!(matches!(bucket, 0 | 11 | 12 | 13));
                assert_eq!(
                    metadata.header_schema_version,
                    CURRENT_HEADER_SCHEMA_VERSION
                );
                assert!((1..=64).contains(&metadata.key_slots.len()));
                assert!(metadata.chunk_kdf_salt.is_some());
            }
            Err(error) => {
                metadata_rejected += 1;
                expect_metadata_error(error, bucket);
            }
        }

        match without_panicking("VgtContainer::recovery_probe", index, || {
            VgtContainer::recovery_probe(&bytes)
        }) {
            Ok(probe) => {
                probe_accepted += 1;
                assert!(matches!(bucket, 0 | 11 | 12 | 13));
                assert_eq!(probe.format_version, CURRENT_FORMAT_VERSION);
                assert!(probe.document_kind.chars().count() <= 48);
                assert!(!probe.document_kind.chars().any(char::is_control));
                assert!(probe.security_profile.chars().count() <= 48);
                assert!(probe.protection.chars().count() <= 48);
            }
            Err(error) => {
                probe_rejected += 1;
                expect_metadata_error(error, bucket);
            }
        }
    }

    assert_bucket_counts(buckets);
    assert_eq!(metadata_accepted, 4 * CASES_PER_BUCKET);
    assert_eq!(metadata_rejected, 12 * CASES_PER_BUCKET);
    assert_eq!(probe_accepted, 4 * CASES_PER_BUCKET);
    assert_eq!(probe_rejected, 12 * CASES_PER_BUCKET);
}

fn expect_framing_error_code(error: &ContainerError, bucket: usize) {
    let expected = match bucket {
        0 => "invalid-magic",
        1 => "unsupported-format-version",
        2 => "unsupported-crypto-version",
        3 => "manifest-too-large",
        4 => "metadata-too-large",
        7 | 8 => "manifest-too-large",
        9 => "serialization-error",
        10 | 11 => "too-many-chunks",
        _ => panic!("unexpected framing rejection in bucket {bucket}: {error:?}"),
    };
    assert_eq!(error.code(), expected, "bucket {bucket}: {error:?}");
}

#[test]
fn sec096_manifest_readers_survive_4096_bounded_mutations_each() {
    let base = valid_v3_fixture(0);
    let offsets = fixture_offsets(&base);
    let mut buckets = [0usize; MUTATION_BUCKETS];
    let mut manifest_accepted = 0usize;
    let mut manifest_rejected = 0usize;
    let mut migration_accepted = 0usize;
    let mut migration_rejected = 0usize;

    for index in 0..CASE_COUNT {
        let bucket = index % MUTATION_BUCKETS;
        buckets[bucket] += 1;
        let bytes = mutate_framing_fixture(&base, offsets, index);
        assert!(bytes.len() <= MAX_CASE_BYTES);

        match without_panicking("VgtContainer::read_manifest", index, || {
            VgtContainer::read_manifest(&bytes)
        }) {
            Ok(Some(manifest)) => {
                manifest_accepted += 1;
                assert!(matches!(bucket, 5 | 6 | 12 | 13 | 14 | 15));
                assert_eq!(manifest.chunks.len(), 1);
                assert!(manifest.validate().is_ok());
            }
            Ok(None) => panic!("VWC v3 manifest unexpectedly absent in case {index}"),
            Err(error) => {
                manifest_rejected += 1;
                expect_framing_error_code(&error, bucket);
            }
        }

        match without_panicking("VgtContainer::migration_plan_for_bytes", index, || {
            VgtContainer::migration_plan_for_bytes(&bytes)
        }) {
            Ok(plan) => {
                migration_accepted += 1;
                assert!(matches!(bucket, 5 | 6 | 12 | 13 | 14 | 15));
                assert_eq!(plan.source_format_version, CURRENT_FORMAT_VERSION);
                assert_eq!(plan.target_format_version, CURRENT_FORMAT_VERSION);
                assert_eq!(plan.payload_schema_version, Some(1));
            }
            Err(error) => {
                migration_rejected += 1;
                expect_framing_error_code(&error, bucket);
            }
        }
    }

    assert_bucket_counts(buckets);
    assert_eq!(manifest_accepted, 6 * CASES_PER_BUCKET);
    assert_eq!(manifest_rejected, 10 * CASES_PER_BUCKET);
    assert_eq!(migration_accepted, 6 * CASES_PER_BUCKET);
    assert_eq!(migration_rejected, 10 * CASES_PER_BUCKET);
}

fn manifest_case(index: usize) -> ContainerManifest {
    let bucket = index % MUTATION_BUCKETS;
    let serial = index / MUTATION_BUCKETS;
    let mut manifest = fixture_manifest();
    match bucket {
        0 => {}
        1 => {
            manifest
                .extensions
                .insert(format!("vendor-{serial}"), serde_json::json!({"ok": true}));
        }
        2 => manifest.manifest_schema_version = CURRENT_MANIFEST_SCHEMA_VERSION + 1,
        3 => manifest.compatibility.container_format_version = CURRENT_FORMAT_VERSION - 1,
        4 => manifest.compatibility.minimum_reader_implementation = CURRENT_FORMAT_VERSION + 1,
        5 => manifest.compatibility.payload_schema_namespace.clear(),
        6 => manifest.compatibility.payload_schema_namespace = "n".repeat(65),
        7 => manifest.chunks.clear(),
        8 => manifest.chunks[0].index = 1,
        9 => manifest.chunks[0].flags = 0x80,
        10 => manifest.chunks[0].plaintext_len = STREAM_PLAINTEXT_CHUNK_SIZE as u64 + 1,
        11 => {
            manifest.chunks[0].chunk_type = 254;
            manifest.chunks[0].flags = CHUNK_FLAG_CRITICAL;
        }
        12 => {
            manifest.chunks[0] = ManifestChunkEntry::known(0, ChunkType::Asset, 0);
        }
        13 => {
            manifest.chunks = (0..97)
                .map(|index| {
                    ManifestChunkEntry::known(
                        index,
                        if index == 0 {
                            ChunkType::DocumentTree
                        } else {
                            ChunkType::Asset
                        },
                        STREAM_PLAINTEXT_CHUNK_SIZE as u64,
                    )
                })
                .collect();
        }
        14 => manifest.chunks.push(ManifestChunkEntry {
            index: 1,
            chunk_type: 254,
            flags: 0,
            plaintext_len: 0,
            extensions: Default::default(),
        }),
        15 => {
            manifest.compatibility = ContainerCompatibility {
                container_format_version: CURRENT_FORMAT_VERSION,
                minimum_reader_implementation: 3,
                minimum_writer_implementation: 3,
                payload_schema_namespace: format!("vendor.schema.{serial}"),
                payload_schema_version: 1,
            };
        }
        _ => unreachable!(),
    }
    manifest
}

#[test]
fn sec096_manifest_validator_survives_4096_bounded_mutations() {
    let mut buckets = [0usize; MUTATION_BUCKETS];
    let mut accepted = 0usize;
    let mut rejected = 0usize;

    for index in 0..CASE_COUNT {
        let bucket = index % MUTATION_BUCKETS;
        buckets[bucket] += 1;
        let manifest = manifest_case(index);
        let serialized = serde_json::to_vec(&manifest).expect("bounded manifest fixture");
        assert!(serialized.len() <= MAX_CASE_BYTES);

        match without_panicking("ContainerManifest::validate", index, || manifest.validate()) {
            Ok(()) => {
                accepted += 1;
                assert!(matches!(bucket, 0 | 1 | 14 | 15));
                assert!(!manifest.chunks.is_empty());
                assert!(manifest.chunks.len() <= MAX_CHUNK_COUNT as usize);
            }
            Err(ContainerError::UnsupportedManifestVersion(_)) => {
                rejected += 1;
                assert_eq!(bucket, 2);
            }
            Err(ContainerError::IncompatibleManifest) => {
                rejected += 1;
                assert!(matches!(bucket, 3..=6));
            }
            Err(ContainerError::TooManyChunks(_, _)) => {
                rejected += 1;
                assert_eq!(bucket, 7);
            }
            Err(ContainerError::CorruptedManifest) => {
                rejected += 1;
                assert!(matches!(bucket, 8 | 9));
            }
            Err(ContainerError::ChunkPlaintextTooLarge(_, _)) => {
                rejected += 1;
                assert_eq!(bucket, 10);
            }
            Err(ContainerError::UnknownCriticalChunk(_)) => {
                rejected += 1;
                assert_eq!(bucket, 11);
            }
            Err(ContainerError::MissingDocumentTree) => {
                rejected += 1;
                assert_eq!(bucket, 12);
            }
            Err(ContainerError::PlaintextTotalTooLarge(_)) => {
                rejected += 1;
                assert_eq!(bucket, 13);
            }
            Err(error) => panic!("manifest validator returned unexpected error: {error:?}"),
        }
    }

    assert_bucket_counts(buckets);
    assert_eq!(accepted, 4 * CASES_PER_BUCKET);
    assert_eq!(rejected, 12 * CASES_PER_BUCKET);
}

fn stream_error_code(bucket: usize) -> &'static str {
    match bucket {
        0 => "invalid-magic",
        1 => "api-version-mismatch",
        2 => "unsupported-crypto-version",
        3 | 4 => "metadata-too-large",
        5 | 6 | 9 => "serialization-error",
        7 | 8 => "manifest-too-large",
        10..=12 => "manifest-rejected",
        13 => "truncated",
        14 => "trailing-bytes",
        _ => panic!("unexpected stream-reader error bucket {bucket}"),
    }
}

#[test]
fn sec096_stream_structure_reader_survives_4096_bounded_mutations() {
    let base = valid_v3_fixture(0);
    let offsets = fixture_offsets(&base);
    let mut buckets = [0usize; MUTATION_BUCKETS];
    let mut accepted = 0usize;
    let mut rejected = 0usize;

    for index in 0..CASE_COUNT {
        let bucket = index % MUTATION_BUCKETS;
        buckets[bucket] += 1;
        let bytes = mutate_framing_fixture(&base, offsets, index);
        assert!(bytes.len() <= MAX_CASE_BYTES);
        let mut reader = Cursor::new(bytes.as_slice());

        match without_panicking("VgtContainer::inspect_structure_reader", index, || {
            VgtContainer::inspect_structure_reader(&mut reader)
        }) {
            Ok(structure) => {
                accepted += 1;
                assert_eq!(bucket, 15);
                assert_eq!(structure.format_version, CURRENT_FORMAT_VERSION);
                assert_eq!(structure.crypto_version, CURRENT_CRYPTO_VERSION);
                assert_eq!(structure.chunk_count, 1);
                assert_eq!(structure.chunks.len(), 1);
                let chunk = &structure.chunks[0];
                assert_eq!(chunk.index, 0);
                assert_eq!(chunk.chunk_type, ChunkType::DocumentTree);
                assert_eq!(chunk.flags, CHUNK_FLAG_CRITICAL);
                assert_eq!(chunk.encrypted_len, 16);
                assert!(chunk.payload_offset + chunk.encrypted_len <= bytes.len());
            }
            Err(error) => {
                rejected += 1;
                assert_eq!(
                    error.code(),
                    stream_error_code(bucket),
                    "case {index}: {error:?}"
                );
            }
        }
    }

    assert_bucket_counts(buckets);
    assert_eq!(accepted, CASES_PER_BUCKET);
    assert_eq!(rejected, 15 * CASES_PER_BUCKET);
}
