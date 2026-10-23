use vgt_container::*;
use vgt_crypto::{x25519_public_from_private, KEY_SIZE};
use vgt_keyvault::VgtKeyVault;
use vgt_object_model::{DocumentKind, WorkspaceDocument};

#[test]
fn test_vwc_roundtrip_local_vault() {
    let mut vault = VgtKeyVault::new();
    vault
        .unlock_with_master_key([0x42u8; KEY_SIZE])
        .expect("test vault unlock should succeed");
    let doc = WorkspaceDocument::new("Strategic Analysis 2026", DocumentKind::Writer);

    let packed_bytes = VgtContainer::pack_document(
        &doc,
        &mut vault,
        SaveOptions {
            policy: None,
            pin: None,
            portable_password: None,
            recipient_public_key: None,
        },
    )
    .expect("pack failed");

    assert_eq!(&packed_bytes[0..4], b"VWC1");

    // Zero Plaintext Check: ensure document title does not appear anywhere in the binary container!
    let pattern = "Strategic Analysis 2026".as_bytes();
    let found = packed_bytes
        .windows(pattern.len())
        .any(|window| window == pattern);
    assert!(
        !found,
        "CRITICAL: Plaintext leak detected in container file!"
    );

    // Unpack
    let unpacked = VgtContainer::unpack_with_vault(&packed_bytes, &vault)
        .expect("unpack with local vault failed");
    assert_eq!(unpacked.id, doc.id);
    assert_eq!(unpacked.title, "Strategic Analysis 2026");
}

#[test]
fn test_vwc_roundtrip_pin_protected() {
    let mut vault = VgtKeyVault::new();
    vault
        .unlock_with_master_key([0x42u8; KEY_SIZE])
        .expect("test vault unlock should succeed");
    let doc = WorkspaceDocument::new("Confidential Financials", DocumentKind::Grid);

    let packed_bytes = VgtContainer::pack_document(
        &doc,
        &mut vault,
        SaveOptions {
            policy: None,
            pin: Some("7391"),
            portable_password: None,
            recipient_public_key: None,
        },
    )
    .expect("pack failed");

    // Correct PIN succeeds
    let unpacked = VgtContainer::unpack_with_pin(&packed_bytes, &mut vault, "7391")
        .expect("unpack with PIN failed");
    assert_eq!(unpacked.title, "Confidential Financials");

    // Wrong PIN fails
    let wrong_pin_res = VgtContainer::unpack_with_pin(&packed_bytes, &mut vault, "0000");
    assert!(wrong_pin_res.is_err());
}

#[test]
fn test_vwc_portable_password_without_vault() {
    let mut vault = VgtKeyVault::new();
    vault
        .unlock_with_master_key([0x42u8; KEY_SIZE])
        .expect("test vault unlock should succeed");
    let doc = WorkspaceDocument::new("External Presentation", DocumentKind::Present);

    let packed_bytes = VgtContainer::pack_document(
        &doc,
        &mut vault,
        SaveOptions {
            policy: None,
            pin: None,
            portable_password: Some("QuantumSafePassword$2026"),
            recipient_public_key: None,
        },
    )
    .expect("pack failed");

    let unpacked = VgtContainer::unpack_with_password(&packed_bytes, "QuantumSafePassword$2026")
        .expect("unpack with portable password failed");
    assert_eq!(unpacked.title, "External Presentation");
}

#[test]
fn test_resource_ceiling_rejection() {
    // Construct crafted header declaring a 2GB metadata length
    let mut malicious = Vec::new();
    malicious.extend_from_slice(MAGIC_BYTES);
    malicious.extend_from_slice(&CURRENT_FORMAT_VERSION.to_le_bytes());
    malicious.extend_from_slice(&CURRENT_CRYPTO_VERSION.to_le_bytes());
    malicious.extend_from_slice(&(2_000_000_000u32).to_le_bytes()); // 2 GB

    let res = VgtContainer::read_metadata(&malicious);
    assert!(matches!(res, Err(ContainerError::MetadataTooLarge(_, _))));
}

#[test]
fn test_header_tampering_fails_aead_verification() {
    let mut vault = VgtKeyVault::new();
    vault
        .unlock_with_master_key([0x42u8; KEY_SIZE])
        .expect("test vault unlock should succeed");
    let doc = WorkspaceDocument::new("Top Secret Roadmap", DocumentKind::Writer);

    let mut packed = VgtContainer::pack_document(
        &doc,
        &mut vault,
        SaveOptions {
            policy: Some(vgt_keyvault::UnlockPolicy::DeviceOnly),
            pin: None,
            portable_password: None,
            recipient_public_key: None,
        },
    )
    .unwrap();

    // Tamper with a byte in the metadata JSON region (e.g. at offset 20)
    packed[20] ^= 0x01;

    // Unpack must fail authentication due to AEAD AAD mismatch!
    let res = VgtContainer::unpack_with_vault(&packed, &vault);
    assert!(
        res.is_err(),
        "Tampered header metadata MUST be rejected by AEAD AAD!"
    );
}

#[test]
fn test_vwc_recipient_only_roundtrip_and_no_local_bypass() {
    let mut vault = VgtKeyVault::new();
    vault
        .unlock_with_master_key([0x42u8; KEY_SIZE])
        .expect("test vault unlock should succeed");
    let recipient_private_key = [0x31u8; 32];
    let recipient_public_key = x25519_public_from_private(&recipient_private_key);
    let wrong_private_key = [0x77u8; 32];
    let doc = WorkspaceDocument::new("Recipient Restricted", DocumentKind::Writer);

    let packed = VgtContainer::pack_document(
        &doc,
        &mut vault,
        SaveOptions {
            policy: Some(vgt_keyvault::UnlockPolicy::RecipientOnly),
            pin: None,
            portable_password: None,
            recipient_public_key: Some(&recipient_public_key),
        },
    )
    .expect("recipient-only pack failed");

    let metadata = VgtContainer::read_metadata(&packed).expect("recipient-only metadata failed");
    assert_eq!(
        metadata.unlock_policy,
        vgt_keyvault::UnlockPolicy::RecipientOnly
    );
    assert_eq!(metadata.key_slots.len(), 1);
    assert_eq!(
        metadata.key_slots[0].slot_type,
        vgt_keyvault::KeySlotType::RecipientPublicKey
    );

    let unpacked = VgtContainer::unpack_with_recipient(&packed, &recipient_private_key)
        .expect("recipient-only unpack failed");
    assert_eq!(unpacked.id, doc.id);

    assert!(VgtContainer::unpack_with_recipient(&packed, &wrong_private_key).is_err());
    assert!(VgtContainer::unpack_with_vault(&packed, &vault).is_err());
    assert!(VgtContainer::unpack_with_password(&packed, "NotTheRecipientKey").is_err());
}

#[test]
fn test_vwc_v2_structure_and_fuzz_parser() {
    let mut vault = VgtKeyVault::new();
    vault
        .unlock_with_master_key([0x42u8; KEY_SIZE])
        .expect("test vault unlock should succeed");
    let doc = WorkspaceDocument::new("Structure probe", DocumentKind::Writer);
    let packed = VgtContainer::pack_document(&doc, &mut vault, SaveOptions::default()).unwrap();
    let structure = VgtContainer::inspect_structure(&packed).expect("structure should parse");
    assert_eq!(structure.format_version, CURRENT_FORMAT_VERSION);
    assert!(structure.chunk_count >= 1);
    let metadata = VgtContainer::read_metadata(&packed).unwrap();
    assert_eq!(
        metadata.header_schema_version,
        CURRENT_HEADER_SCHEMA_VERSION
    );
    assert!(VgtContainer::fuzz_parse(&packed).is_ok());
}

#[test]
fn test_vwc_stream_chunk_count_boundaries() {
    assert_eq!(required_stream_chunks(0).unwrap(), 1);
    assert_eq!(
        required_stream_chunks(STREAM_PLAINTEXT_CHUNK_SIZE as u64).unwrap(),
        1
    );
    assert_eq!(
        required_stream_chunks(STREAM_PLAINTEXT_CHUNK_SIZE as u64 + 1).unwrap(),
        2
    );
}

#[test]
fn test_vwc_rejects_trailing_bytes_structurally() {
    let mut vault = VgtKeyVault::new();
    vault
        .unlock_with_master_key([0x42u8; KEY_SIZE])
        .expect("test vault unlock should succeed");
    let doc = WorkspaceDocument::new("Trailing bytes", DocumentKind::Grid);
    let mut packed = VgtContainer::pack_document(&doc, &mut vault, SaveOptions::default()).unwrap();
    packed.push(0x7f);
    assert!(matches!(
        VgtContainer::inspect_structure(&packed),
        Err(ContainerError::TrailingBytes)
    ));
}

#[test]
fn test_vwc_compression_policy_is_secret_aware() {
    let input = vec![b'A'; 96 * 1024];
    let (secret_algorithm, secret_bytes) = compress_safe_asset_before_encryption(&input, true);
    assert_eq!(secret_algorithm, CompressionAlgorithm::None);
    assert_eq!(secret_bytes, input);
    let (asset_algorithm, asset_bytes) = compress_safe_asset_before_encryption(&input, false);
    assert_eq!(asset_algorithm, CompressionAlgorithm::PackBitsV1);
    assert!(asset_bytes.len() < input.len());
}

fn sec022_manifest_bounds(bytes: &[u8]) -> (usize, usize) {
    assert!(bytes.len() >= 16, "VWC v3 framing too short");
    let metadata_len =
        u32::from_le_bytes(bytes[8..12].try_into().expect("metadata length")) as usize;
    let manifest_len_offset = 12usize
        .checked_add(metadata_len)
        .expect("manifest length offset");
    let manifest_len_end = manifest_len_offset
        .checked_add(4)
        .expect("manifest length field");
    assert!(
        manifest_len_end <= bytes.len(),
        "manifest length outside container"
    );
    let manifest_len = u32::from_le_bytes(
        bytes[manifest_len_offset..manifest_len_end]
            .try_into()
            .expect("manifest length bytes"),
    ) as usize;
    let manifest_start = manifest_len_end;
    let manifest_end = manifest_start
        .checked_add(manifest_len)
        .expect("manifest end");
    assert!(manifest_end <= bytes.len(), "manifest outside container");
    (manifest_start, manifest_end)
}

#[test]
fn sec022_authenticated_container_enveloping_rejects_payload_bit_flip() {
    let mut vault = VgtKeyVault::new();
    vault
        .unlock_with_master_key([0x22u8; KEY_SIZE])
        .expect("test vault unlock should succeed");
    let doc = WorkspaceDocument::new("SEC022 payload authentication", DocumentKind::Writer);
    let mut packed = VgtContainer::pack_document(&doc, &mut vault, SaveOptions::default())
        .expect("SEC022 container should pack");

    let structure =
        VgtContainer::inspect_structure(&packed).expect("SEC022 structure should parse");
    let first = structure.chunks.first().expect("SEC022 document chunk");
    assert!(
        first.encrypted_len > 16,
        "SEC022 chunk must contain authenticated ciphertext"
    );
    let tamper_offset = first.payload_offset + (first.encrypted_len / 2);
    packed[tamper_offset] ^= 0x01;

    let error = VgtContainer::unpack_with_vault(&packed, &vault)
        .expect_err("SEC022 payload bit flip must fail closed");
    assert_eq!(error.code(), "authentication-failed");
    println!("SEC022_PAYLOAD_BIT_FLIP_REJECTED code={}", error.code());
}

#[test]
fn sec022_authenticated_container_enveloping_binds_valid_manifest_json_to_ciphertext() {
    let mut vault = VgtKeyVault::new();
    vault
        .unlock_with_master_key([0x23u8; KEY_SIZE])
        .expect("test vault unlock should succeed");
    let doc = WorkspaceDocument::new("SEC022 manifest authentication", DocumentKind::Grid);
    let mut packed = VgtContainer::pack_document(&doc, &mut vault, SaveOptions::default())
        .expect("SEC022 container should pack");

    let (manifest_start, manifest_end) = sec022_manifest_bounds(&packed);
    let needle = format!("\"payload_schema_version\":{}", doc.schema_version);
    let replacement_version = doc.schema_version + 1;
    assert!(
        replacement_version < 10,
        "SEC022 fixture expects single-digit schema version"
    );
    let replacement = format!("\"payload_schema_version\":{}", replacement_version);
    assert_eq!(
        needle.len(),
        replacement.len(),
        "SEC022 tamper must preserve framing length"
    );

    let relative = packed[manifest_start..manifest_end]
        .windows(needle.len())
        .position(|window| window == needle.as_bytes())
        .expect("SEC022 payload schema field must exist in manifest");
    let absolute = manifest_start + relative;
    packed[absolute..absolute + replacement.len()].copy_from_slice(replacement.as_bytes());

    let parsed = VgtContainer::read_manifest(&packed)
        .expect("SEC022 tampered manifest remains syntactically and structurally valid")
        .expect("SEC022 VWC v3 manifest");
    assert_eq!(
        parsed.compatibility.payload_schema_version,
        replacement_version
    );

    let error = VgtContainer::unpack_with_vault(&packed, &vault)
        .expect_err("SEC022 authenticated open must reject semantically modified manifest");
    assert_eq!(error.code(), "authentication-failed");
    println!("SEC022_MANIFEST_TAMPER_REJECTED code={}", error.code());
}

#[test]
fn sec029_rejects_executable_magic_even_with_workspace_extension_hint() {
    let elf = b"\x7fELF\x02\x01\x01\x00malicious";
    let pe = b"MZ\x90\x00malicious";
    assert!(matches!(
        VgtContainer::read_metadata(elf),
        Err(ContainerError::InvalidMagic)
    ));
    assert!(matches!(
        VgtContainer::read_metadata(pe),
        Err(ContainerError::InvalidMagic)
    ));
}
