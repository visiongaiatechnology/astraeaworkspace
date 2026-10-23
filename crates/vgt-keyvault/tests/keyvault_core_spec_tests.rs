use std::time::Duration;
use vgt_crypto::{generate_dek, x25519_public_from_private, ARGON2ID_PARAMETERS_VERSION, KEY_SIZE};
use vgt_keyvault::{
    KeySlotType, KeyVaultAuditAction, KeyVaultError, LockReason, ProviderRequirement, RecoveryMode,
    RecoveryPolicy, SecurityKeyNamespace, UnlockPolicy, VgtKeyVault,
};

fn test_vault() -> VgtKeyVault {
    let mut vault = VgtKeyVault::new();
    vault.unlock_with_master_key([0x42u8; KEY_SIZE]).unwrap();
    vault
}

#[test]
fn provider_health_never_equates_interface_presence_with_hardware_backing() {
    let vault = VgtKeyVault::new();
    let health = vault.provider_health();
    if health.hardware_backed {
        assert!(health.hardware_attestation_verified);
        assert!(health.hardware_slot_supported);
    }
    if vault
        .require_provider(ProviderRequirement::VerifiedHardwareBackedSlot)
        .is_ok()
    {
        assert!(health.hardware_backed);
        assert!(health.hardware_attestation_verified);
    }
}

#[test]
fn explicit_slot_types_and_device_pin_and_semantics_hold() {
    let mut vault = test_vault();
    let dek = generate_dek();
    let slots = vault
        .create_slots_for_policy(&dek, UnlockPolicy::DeviceAndPin, Some("5829"), None)
        .unwrap();
    assert_eq!(slots.len(), 1);
    assert_eq!(slots[0].slot_type, KeySlotType::MasterWithPin);
    assert!(vault.unlock_dek_local(&slots).is_err());
    assert_eq!(
        vault
            .unlock_dek_with_pin_for_document("doc-and", &slots, "5829")
            .unwrap(),
        dek
    );
    assert_eq!(
        slots[0].kdf_params.as_ref().unwrap().kdf_params_version,
        ARGON2ID_PARAMETERS_VERSION
    );
}

#[test]
fn credential_validation_is_core_enforced() {
    let mut vault = test_vault();
    let dek = generate_dek();
    assert!(matches!(
        vault.create_slots_for_policy(&dek, UnlockPolicy::DeviceAndPin, Some(" 5829"), None),
        Err(KeyVaultError::InvalidCredentialFormat)
    ));
    assert!(matches!(
        vault.create_slots_for_policy(
            &dek,
            UnlockPolicy::PortablePasswordOnly,
            None,
            Some("short")
        ),
        Err(KeyVaultError::InvalidCredentialFormat)
    ));
    assert!(matches!(
        vault.create_slots_for_policy(
            &dek,
            UnlockPolicy::PortablePasswordOnly,
            None,
            Some("validpass\n")
        ),
        Err(KeyVaultError::InvalidCredentialFormat)
    ));
}

#[test]
fn document_key_handles_are_document_scoped_and_lockable() {
    let mut vault = test_vault();
    let key = [0x77u8; KEY_SIZE];
    let handle = vault
        .activate_document_key("doc-alpha", key, Some(Duration::from_secs(60)))
        .unwrap();
    assert_eq!(vault.active_document_key_count(), 1);
    let seen = vault
        .with_document_key("doc-alpha", &handle, |value| Ok(value[0]))
        .unwrap();
    assert_eq!(seen, 0x77);
    assert!(vault
        .with_document_key("doc-beta", &handle, |_| Ok(()))
        .is_err());
    assert!(vault
        .lock_document("doc-alpha", LockReason::Manual)
        .unwrap());
    assert_eq!(vault.active_document_key_count(), 0);
    assert!(vault
        .with_document_key("doc-alpha", &handle, |_| Ok(()))
        .is_err());
}

#[test]
fn suspend_and_session_lock_clear_document_handles() {
    let mut vault = test_vault();
    let handle = vault
        .activate_document_key(
            "doc-suspend",
            [0x11u8; KEY_SIZE],
            Some(Duration::from_secs(60)),
        )
        .unwrap();
    assert_eq!(vault.active_document_key_count(), 1);
    vault.handle_suspend();
    assert!(vault
        .with_document_key("doc-suspend", &handle, |_| Ok(()))
        .is_err());

    let _handle2 = vault
        .activate_document_key(
            "doc-session",
            [0x22u8; KEY_SIZE],
            Some(Duration::from_secs(60)),
        )
        .unwrap();
    vault.handle_session_lock();
    assert_eq!(vault.active_document_key_count(), 0);
}

#[test]
fn local_pin_attempts_back_off_without_claiming_offline_password_protection() {
    let mut vault = test_vault();
    let dek = generate_dek();
    let slots = vault
        .create_slots_for_policy(&dek, UnlockPolicy::DeviceAndPin, Some("5829"), None)
        .unwrap();
    for _ in 0..3 {
        assert!(vault
            .unlock_dek_with_pin_for_document("doc-throttle", &slots, "0000")
            .is_err());
    }
    assert!(matches!(
        vault.unlock_dek_with_pin_for_document("doc-throttle", &slots, "5829"),
        Err(KeyVaultError::AuthenticationFailed)
    ));
    // Portable-password unlock remains a self-contained exported-slot operation; no claim
    // is made that local process throttling can prevent an attacker from copying it offline.
}

#[test]
fn pin_rotation_rewraps_dek_and_authenticates_transaction() {
    let mut vault = test_vault();
    let dek = generate_dek();
    let slots = vault
        .create_slots_for_policy(&dek, UnlockPolicy::DeviceAndPin, Some("5829"), None)
        .unwrap();
    let (rotated, receipt) = vault
        .rotate_pin_slot("doc-rotate-pin", &slots, "5829", "7391")
        .unwrap();
    assert!(vault
        .unlock_dek_with_pin_for_document("doc-rotate-pin-old", &rotated, "5829")
        .is_err());
    assert_eq!(
        vault
            .unlock_dek_with_pin_for_document("doc-rotate-pin-new", &rotated, "7391")
            .unwrap(),
        dek
    );
    vault
        .verify_slot_transaction_receipt("doc-rotate-pin", &receipt, &dek)
        .unwrap();
    assert!(vault
        .verify_slot_transaction_receipt("doc-other", &receipt, &dek)
        .is_err());
}

#[test]
fn password_rotation_rewraps_without_content_reencryption() {
    let mut vault = test_vault();
    let dek = generate_dek();
    let slots = vault
        .create_slots_for_policy(
            &dek,
            UnlockPolicy::PortablePasswordOnly,
            None,
            Some("first-passphrase"),
        )
        .unwrap();
    let (rotated, receipt) = vault
        .rotate_password_slot(
            "doc-rotate-password",
            &slots,
            "first-passphrase",
            "second-passphrase",
        )
        .unwrap();
    assert!(VgtKeyVault::unlock_dek_with_password(&rotated, "first-passphrase").is_err());
    assert_eq!(
        VgtKeyVault::unlock_dek_with_password(&rotated, "second-passphrase").unwrap(),
        dek
    );
    vault
        .verify_slot_transaction_receipt("doc-rotate-password", &receipt, &dek)
        .unwrap();
}

#[test]
fn recipient_add_and_revoke_are_audited() {
    let mut vault = test_vault();
    let dek = generate_dek();
    let initial = vault
        .create_slots_for_policy(
            &dek,
            UnlockPolicy::DeviceOrPortablePassword,
            None,
            Some("portable-passphrase"),
        )
        .unwrap();
    let private = [0x31u8; 32];
    let public = x25519_public_from_private(&private);
    let (with_recipient, add_receipt) = vault
        .add_recipient_slot_authenticated("doc-audit", &initial, &dek, &public)
        .unwrap();
    vault
        .verify_slot_transaction_receipt("doc-audit", &add_receipt, &dek)
        .unwrap();
    let recipient_id = with_recipient
        .iter()
        .find(|slot| slot.slot_type == KeySlotType::RecipientPublicKey)
        .unwrap()
        .slot_id;
    let (after_revoke, revoke_receipt) = vault
        .remove_slot_authenticated("doc-audit", &with_recipient, &dek, recipient_id)
        .unwrap();
    assert!(after_revoke.iter().all(|slot| slot.slot_id != recipient_id));
    vault
        .verify_slot_transaction_receipt("doc-audit", &revoke_receipt, &dek)
        .unwrap();
    let audit = vault.audit_snapshot(16);
    assert!(audit
        .iter()
        .any(|event| event.action == KeyVaultAuditAction::SlotAdded));
    assert!(audit
        .iter()
        .any(|event| event.action == KeyVaultAuditAction::RecipientRevoked));
}

#[test]
fn enterprise_recovery_requires_explicit_opt_in_and_separate_artifact() {
    let vault = VgtKeyVault::new();
    let fingerprint = [0xA5u8; 32];
    let implicit = RecoveryPolicy {
        namespace: SecurityKeyNamespace::Standard,
        mode: RecoveryMode::ExplicitEnterpriseRecipient,
        recipient_fingerprints: vec![fingerprint],
        require_separate_artifact: true,
        explicit_opt_in: false,
    };
    assert!(implicit.validate().is_err());

    let explicit = RecoveryPolicy {
        explicit_opt_in: true,
        ..implicit
    };
    let descriptor = vault
        .create_recovery_artifact_descriptor(&explicit)
        .unwrap();
    assert!(!descriptor.contains_cross_domain_material);
}

#[test]
fn hardware_policy_is_fail_closed_without_verified_provider() {
    let mut vault = test_vault();
    let health = vault.provider_health();
    if !health.hardware_backed
        || !health.hardware_attestation_verified
        || !health.hardware_slot_supported
    {
        let result = vault.create_slots_for_policy_scoped(
            &generate_dek(),
            UnlockPolicy::HardwareBackedOnly,
            None,
            None,
            None,
            Some("doc-hardware"),
        );
        assert!(matches!(result, Err(KeyVaultError::ProviderUnavailable)));
    }
}
