use vgt_container::{ChunkType, SaveOptions, VgtContainer};
use vgt_crypto::KEY_SIZE;
use vgt_keyvault::{UnlockPolicy, VgtKeyVault};
use vgt_object_model::{DocumentKind, WorkspaceDocument};

#[test]
fn metadata_probe_accepts_but_authenticated_verifier_rejects_payload_tampering() {
    let mut vault = VgtKeyVault::new();
    vault
        .unlock_with_master_key([0x42u8; KEY_SIZE])
        .expect("test vault unlock should succeed");
    let document = WorkspaceDocument::new("Recovery integrity", DocumentKind::Writer);
    let mut packed = VgtContainer::pack_document(
        &document,
        &mut vault,
        SaveOptions {
            policy: Some(UnlockPolicy::DeviceOnly),
            ..SaveOptions::default()
        },
    )
    .expect("device-only recovery snapshot should pack");

    assert!(VgtContainer::verify_authenticated_chunks_with_vault(&packed, &vault).is_ok());
    assert!(VgtContainer::recovery_probe(&packed).is_ok());
    let structure = VgtContainer::inspect_structure(&packed)
        .expect("valid recovery snapshot structure should parse");
    let document_chunk = structure
        .chunks
        .iter()
        .find(|chunk| chunk.chunk_type == ChunkType::DocumentTree)
        .expect("packed snapshot should contain its document tree");
    let payload_offset = document_chunk.payload_offset + document_chunk.encrypted_len / 2;
    packed[payload_offset] ^= 0x01;

    assert!(
        VgtContainer::recovery_probe(&packed).is_ok(),
        "metadata-only recovery probe reproduces the list-filtering defect"
    );
    assert!(
        VgtContainer::verify_authenticated_chunks_with_vault(&packed, &vault).is_err(),
        "authenticated content verification must reject a modified encrypted payload"
    );
}

#[test]
fn authenticated_verifier_requires_an_unlocked_device_key() {
    let mut vault = VgtKeyVault::new();
    vault
        .unlock_with_master_key([0x42u8; KEY_SIZE])
        .expect("test vault unlock should succeed");
    let document = WorkspaceDocument::new("Locked recovery", DocumentKind::Writer);
    let packed = VgtContainer::pack_document(
        &document,
        &mut vault,
        SaveOptions {
            policy: Some(UnlockPolicy::DeviceOnly),
            ..SaveOptions::default()
        },
    )
    .expect("device-only recovery snapshot should pack");

    vault.lock();
    assert!(VgtContainer::verify_authenticated_chunks_with_vault(&packed, &vault).is_err());
}
