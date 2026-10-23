use vgt_crypto::{generate_dek, KEY_SIZE};
use vgt_keyvault::{KeySlotType, KeyVaultError, UnlockPolicy, VgtKeyVault};

#[test]
fn test_device_and_pin_cryptographic_and() {
    let mut vault = VgtKeyVault::new();
    vault.unlock_with_master_key([0x42u8; KEY_SIZE]).unwrap();
    let dek = generate_dek();

    let slots = vault
        .create_slots_for_policy(&dek, UnlockPolicy::DeviceAndPin, Some("5829"), None)
        .expect("slot creation failed");

    assert_eq!(slots.len(), 1);
    assert_eq!(slots[0].slot_type, KeySlotType::MasterWithPin);
    assert!(matches!(
        vault.unlock_dek_local(&slots),
        Err(KeyVaultError::AuthenticationFailed)
    ));

    let unlocked = vault
        .unlock_dek_with_pin_for_document("doc-pin", &slots, "5829")
        .expect("PIN unlock failed");
    assert_eq!(unlocked, dek);

    assert!(matches!(
        vault.unlock_dek_with_pin_for_document("doc-pin-wrong", &slots, "0000"),
        Err(KeyVaultError::AuthenticationFailed)
    ));

    let mut different_vault = VgtKeyVault::new();
    different_vault
        .unlock_with_master_key([0x99u8; KEY_SIZE])
        .unwrap();
    assert!(matches!(
        different_vault.unlock_dek_with_pin_for_document("doc-pin", &slots, "5829"),
        Err(KeyVaultError::AuthenticationFailed)
    ));
}

#[test]
fn test_portable_password_policy() {
    let mut vault = VgtKeyVault::new();
    let dek = generate_dek();

    let slots = vault
        .create_slots_for_policy(
            &dek,
            UnlockPolicy::PortablePasswordOnly,
            None,
            Some("Passphrase#2026"),
        )
        .expect("slot creation failed");

    assert_eq!(slots.len(), 1);
    assert_eq!(slots[0].slot_type, KeySlotType::PortablePassword);
    assert_eq!(
        VgtKeyVault::unlock_dek_with_password(&slots, "Passphrase#2026").unwrap(),
        dek
    );
    assert!(matches!(
        VgtKeyVault::unlock_dek_with_password(&slots, "WrongPassword"),
        Err(KeyVaultError::AuthenticationFailed)
    ));
}

#[test]
fn rejects_invalid_pin_and_password_formats() {
    let mut vault = VgtKeyVault::new();
    vault.unlock_with_master_key([0x42u8; KEY_SIZE]).unwrap();
    let dek = generate_dek();

    assert!(matches!(
        vault.create_slots_for_policy(&dek, UnlockPolicy::DeviceAndPin, Some("12ab"), None),
        Err(KeyVaultError::InvalidCredentialFormat)
    ));
    assert!(matches!(
        vault.create_slots_for_policy(&dek, UnlockPolicy::DeviceAndPin, Some("123456789"), None),
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
}

#[test]
fn test_persistent_wmk_lifecycle_when_native_provider_is_explicitly_enabled() {
    if std::env::var("VGT_TEST_NATIVE_KEYVAULT").ok().as_deref() != Some("1") {
        return;
    }
    let mut vault1 = VgtKeyVault::new();
    vault1
        .ensure_workspace_root()
        .expect("WMK initialization failed");
    let sealed = vault1
        .seal_application_secret("persistence-test", b"persistent-root-proof")
        .expect("seal failed");

    let mut vault2 = VgtKeyVault::new();
    let opened = vault2
        .unseal_application_secret("persistence-test", &sealed)
        .expect("persistent WMK must remain consistent across process lifecycles");
    assert_eq!(opened, b"persistent-root-proof");
}
