use vgt_keyvault::{KeyVaultError, SealedApplicationSecret, VgtKeyVault};

#[test]
fn application_secret_roundtrip_is_scope_bound_and_tamper_evident() {
    let mut vault = VgtKeyVault::new();
    vault.unlock_with_master_key([0x42; 32]).unwrap();
    let scope = "pdf-protection:550e8400-e29b-41d4-a716-446655440000";
    let secret = b"AstraeaOwner-2026!";

    let sealed = vault.seal_application_secret(scope, secret).expect("seal");
    assert_eq!(sealed.version, 1);
    assert_ne!(sealed.ciphertext, secret);
    assert!(sealed.ciphertext.len() > secret.len());

    let opened = vault
        .unseal_application_secret(scope, &sealed)
        .expect("unseal");
    assert_eq!(opened, secret);

    let wrong_scope = vault.unseal_application_secret("pdf-protection:other", &sealed);
    assert!(matches!(
        wrong_scope,
        Err(KeyVaultError::AuthenticationFailed)
    ));

    let mut tampered = sealed.clone();
    tampered.ciphertext[0] ^= 0x80;
    let tamper_result = vault.unseal_application_secret(scope, &tampered);
    assert!(matches!(
        tamper_result,
        Err(KeyVaultError::AuthenticationFailed)
    ));

    let mut wrong_version = sealed;
    wrong_version.version = 2;
    assert!(matches!(
        vault.unseal_application_secret(scope, &wrong_version),
        Err(KeyVaultError::InvalidCredentialFormat)
    ));
}

#[test]
fn application_secret_rejects_invalid_scope_and_size() {
    let mut vault = VgtKeyVault::new();
    vault.unlock_with_master_key([0x24; 32]).unwrap();
    assert!(matches!(
        vault.seal_application_secret("", b"secret"),
        Err(KeyVaultError::InvalidCredentialFormat)
    ));
    assert!(matches!(
        vault.seal_application_secret("contains spaces", b"secret"),
        Err(KeyVaultError::InvalidCredentialFormat)
    ));
    assert!(matches!(
        vault.seal_application_secret("pdf-protection:test", &[]),
        Err(KeyVaultError::InvalidCredentialFormat)
    ));
    assert!(matches!(
        vault.seal_application_secret("pdf-protection:test", &vec![0u8; 4097]),
        Err(KeyVaultError::InvalidCredentialFormat)
    ));
}

#[test]
fn application_secret_matches_cross_language_aes256gcm_vector() {
    // Independent Go + Node audit fixtures use the same AES-256-GCM vector. This
    // catches AAD/tag/nonce contract drift across the native KeyVault boundary.
    let mut vault = VgtKeyVault::new();
    let mut key = [0u8; 32];
    for (index, byte) in key.iter_mut().enumerate() {
        *byte = index as u8;
    }
    vault.unlock_with_master_key(key).unwrap();
    let sealed = SealedApplicationSecret {
        version: 1,
        nonce: [
            0xa0, 0xa1, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xab,
        ],
        ciphertext: vec![
            0xa7, 0x6b, 0x08, 0x5f, 0x24, 0xae, 0x63, 0xf0, 0x15, 0x0b, 0xe2, 0xa1, 0x2a, 0x48,
            0xf0, 0xec, 0x46, 0x8d, 0xc4, 0x5d, 0x67, 0x07, 0x98, 0xaa, 0x59, 0x7a, 0xb2, 0x81,
            0x99, 0x75, 0x60, 0xe2, 0xb0, 0xfb,
        ],
    };
    let opened = vault
        .unseal_application_secret(
            "pdf-protection:550e8400-e29b-41d4-a716-446655440000",
            &sealed,
        )
        .expect("known vector must open");
    assert_eq!(opened, b"AstraeaOwner-2026!");
}
