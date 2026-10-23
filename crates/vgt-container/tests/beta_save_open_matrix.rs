// STATUS: PLATIN
use vgt_container::{SaveOptions, VgtContainer};
use vgt_crypto::KEY_SIZE;
use vgt_keyvault::{UnlockPolicy, VgtKeyVault};
use vgt_object_model::{DocumentKind, WorkspaceDocument};

fn test_vault() -> VgtKeyVault {
    let mut vault = VgtKeyVault::new();
    vault
        .unlock_with_master_key([0x5Au8; KEY_SIZE])
        .expect("test vault unlock should succeed");
    vault
}

fn beta_kinds() -> [DocumentKind; 14] {
    [
        DocumentKind::Writer,
        DocumentKind::Grid,
        DocumentKind::Present,
        DocumentKind::Notes,
        DocumentKind::PdfStudio,
        DocumentKind::Tasks,
        DocumentKind::Planner,
        DocumentKind::Projects,
        DocumentKind::Whiteboard,
        DocumentKind::Forms,
        DocumentKind::Database,
        DocumentKind::Vault,
        DocumentKind::Spaces,
        DocumentKind::GaiaCom,
    ]
}

#[test]
fn beta_all_document_kinds_roundtrip_under_device_only() {
    let mut vault = test_vault();
    for kind in beta_kinds() {
        let title = format!("Beta roundtrip {:?}", kind);
        let doc = WorkspaceDocument::new(&title, kind);
        let bytes = VgtContainer::pack_document(
            &doc,
            &mut vault,
            SaveOptions {
                policy: Some(UnlockPolicy::DeviceOnly),
                pin: None,
                portable_password: None,
                recipient_public_key: None,
            },
        )
        .expect("Beta document should pack");
        let restored =
            VgtContainer::unpack_with_vault(&bytes, &vault).expect("Beta document should unpack");
        assert_eq!(restored.id, doc.id);
        assert_eq!(restored.kind, doc.kind);
        assert_eq!(restored.title, doc.title);
    }
}

#[test]
fn beta_device_and_pin_requires_both_factors() {
    let mut vault = test_vault();
    let doc = WorkspaceDocument::new("PIN matrix", DocumentKind::Writer);
    let bytes = VgtContainer::pack_document(
        &doc,
        &mut vault,
        SaveOptions {
            policy: Some(UnlockPolicy::DeviceAndPin),
            pin: Some("7391"),
            portable_password: None,
            recipient_public_key: None,
        },
    )
    .expect("PIN document should pack");
    assert!(VgtContainer::unpack_with_pin(&bytes, &mut vault, "7391").is_ok());
    assert!(VgtContainer::unpack_with_pin(&bytes, &mut vault, "0000").is_err());
    assert!(VgtContainer::unpack_with_vault(&bytes, &vault).is_err());
}

#[test]
fn beta_portable_password_rejects_wrong_password() {
    let mut vault = test_vault();
    let doc = WorkspaceDocument::new("Portable matrix", DocumentKind::Present);
    let bytes = VgtContainer::pack_document(
        &doc,
        &mut vault,
        SaveOptions {
            policy: Some(UnlockPolicy::PortablePasswordOnly),
            pin: None,
            portable_password: Some("SovereignBetaPassword-2026"),
            recipient_public_key: None,
        },
    )
    .expect("Portable document should pack");
    assert!(VgtContainer::unpack_with_password(&bytes, "SovereignBetaPassword-2026").is_ok());
    assert!(VgtContainer::unpack_with_password(&bytes, "wrong-password").is_err());
}

#[test]
fn beta_truncation_and_ciphertext_mutation_fail_closed() {
    let mut vault = test_vault();
    let doc = WorkspaceDocument::new("Failure injection", DocumentKind::Grid);
    let bytes = VgtContainer::pack_document(
        &doc,
        &mut vault,
        SaveOptions {
            policy: Some(UnlockPolicy::DeviceOnly),
            pin: None,
            portable_password: None,
            recipient_public_key: None,
        },
    )
    .expect("Document should pack");

    for cut in [0usize, 1, 4, 8, 12, bytes.len().saturating_sub(1)] {
        let truncated = &bytes[..cut.min(bytes.len())];
        assert!(VgtContainer::unpack_with_vault(truncated, &vault).is_err());
    }

    let mut mutated = bytes.clone();
    let index = mutated.len().saturating_sub(8);
    mutated[index] ^= 0x80;
    assert!(VgtContainer::unpack_with_vault(&mutated, &vault).is_err());
}
