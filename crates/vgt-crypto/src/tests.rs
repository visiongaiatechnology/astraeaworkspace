
use super::*;

#[test]
fn test_encryption_and_decryption() {
    let key = generate_dek();
    let message = b"VGT Sovereign Productivity. Encrypted by Default.";
    let aad = b"header_v1";

    let (ciphertext, nonce) = encrypt_aes_gcm(message, &key, aad).expect("encryption failed");
    assert_ne!(ciphertext.as_slice(), message);

    let decrypted = decrypt_aes_gcm(&ciphertext, &nonce, &key, aad).expect("decryption failed");
    assert_eq!(decrypted.as_slice(), message);
}

#[test]
fn test_tampered_ciphertext_fails() {
    let key = generate_dek();
    let message = b"Secret Financial Data";
    let aad = b"header_v1";

    let (mut ciphertext, nonce) = encrypt_aes_gcm(message, &key, aad).unwrap();
    // Flip one bit
    if let Some(first) = ciphertext.first_mut() {
        *first ^= 0x01;
    }

    let result = decrypt_aes_gcm(&ciphertext, &nonce, &key, aad);
    assert!(matches!(result, Err(CryptoError::DecryptionFailed)));
}

#[test]
fn test_wrong_key_fails() {
    let key1 = generate_dek();
    let key2 = generate_dek();
    let message = b"Confidential Document";
    let aad = b"";

    let (ciphertext, nonce) = encrypt_aes_gcm(message, &key1, aad).unwrap();
    let result = decrypt_aes_gcm(&ciphertext, &nonce, &key2, aad);
    assert!(matches!(result, Err(CryptoError::DecryptionFailed)));
}

#[test]
fn test_pin_derivation_and_envelope() {
    let params = CryptoParameters {
        kdf_memory_cost_kb: MIN_ARGON_MEMORY_KB,
        kdf_time_cost_iters: MIN_ARGON_TIME_ITERS,
        kdf_parallelism: MIN_ARGON_PARALLELISM,
        ..CryptoParameters::default()
    };
    // SEC-015: exercise the productive minimum instead of a test-only downgrade.
    let pin = "5829";
    let pin_key = derive_key_from_pin(pin, &params.kdf_salt, &params).unwrap();

    let wmk = generate_random_bytes::<32>();
    let doc_unlock_key = derive_envelope_unlock_key(&wmk, &pin_key, b"vgt_doc_v1").unwrap();

    assert_eq!(doc_unlock_key.len(), 32);

    // Deriving with wrong PIN produces a different key
    let wrong_pin_key = derive_key_from_pin("0000", &params.kdf_salt, &params).unwrap();
    let wrong_unlock_key = derive_envelope_unlock_key(&wmk, &wrong_pin_key, b"vgt_doc_v1").unwrap();
    assert_ne!(doc_unlock_key, wrong_unlock_key);
}

#[test]
fn test_x25519_recipient_wrap_roundtrip_and_wrong_key_rejection() {
    let recipient_private = generate_random_bytes::<32>();
    let recipient_secret = X25519StaticSecret::from(recipient_private);
    let recipient_public = X25519PublicKey::from(&recipient_secret).to_bytes();
    let dek = generate_dek();
    let envelope = wrap_dek_for_x25519_recipient(&dek, &recipient_public).unwrap();
    let unwrapped = unwrap_dek_for_x25519_recipient(&envelope, &recipient_private).unwrap();
    assert_eq!(dek, unwrapped);

    let wrong_private = generate_random_bytes::<32>();
    assert!(unwrap_dek_for_x25519_recipient(&envelope, &wrong_private).is_err());
}

#[test]
fn test_blake3_hashing() {
    let data1 = b"VGT Workspace Document Chunk 1";
    let data2 = b"VGT Workspace Document Chunk 2";

    let h1 = hash_blake3(data1);
    let h2 = hash_blake3(data2);
    assert_ne!(h1, h2);

    let h1_again = hash_blake3(data1);
    assert_eq!(h1, h1_again);

    let hex = hash_blake3_hex(data1);
    assert_eq!(hex.len(), 64);
}

#[test]
fn test_kdf_parameter_bounds_rejection() {
    let params = CryptoParameters {
        kdf_memory_cost_kb: 1024 * 1024, // 1 GB, exceeds 256 MB ceiling
        ..CryptoParameters::default()
    };
    let res = derive_key_from_pin("password", &params.kdf_salt, &params);
    assert!(matches!(res, Err(CryptoError::KeyDerivationFailed(_))));

    let params = CryptoParameters {
        kdf_memory_cost_kb: MIN_ARGON_MEMORY_KB - 1, // below hardened minimum
        ..params
    };
    let res = derive_key_from_pin("password", &params.kdf_salt, &params);
    assert!(matches!(res, Err(CryptoError::KeyDerivationFailed(_))));
}

#[test]
fn test_hkdf_rfc5869_case_1_vector() {
    let ikm = [0x0bu8; 22];
    let salt = hex_bytes("000102030405060708090a0b0c");
    let info = hex_bytes("f0f1f2f3f4f5f6f7f8f9");
    let expected = hex_bytes(
        "3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865",
    );
    let actual = derive_hkdf_sha256::<42>(&ikm, &salt, &info).unwrap();
    assert_eq!(actual.as_slice(), expected.as_slice());
}

#[test]
fn test_aes256_gcm_fixed_vector() {
    let key = [0u8; KEY_SIZE];
    let nonce = [0u8; NONCE_SIZE];
    let plaintext = [0u8; 16];
    let expected = hex_bytes("cea7403d4d606b6e074ec5d3baf39d18d0d1c8a799996bf0265b98b5d48ab919");
    let actual = encrypt_aes_gcm_with_nonce(&plaintext, &key, b"", &nonce).unwrap();
    assert_eq!(actual, expected);
}

#[test]
fn test_domain_separation_and_suite_rejection() {
    let root = [7u8; KEY_SIZE];
    let salt = [9u8; 16];
    let a = derive_domain_subkey(&root, &salt, CryptoDomain::ContainerChunk, b"doc-1").unwrap();
    let b = derive_domain_subkey(&root, &salt, CryptoDomain::Backup, b"doc-1").unwrap();
    assert_ne!(a, b);
    assert_eq!(
        crypto_suite(PRODUCTION_CRYPTO_SUITE_VERSION).unwrap(),
        PRODUCTION_CRYPTO_SUITE
    );
    assert!(matches!(
        crypto_suite(999),
        Err(CryptoError::UnsupportedCryptoSuite(999))
    ));
}

#[test]
fn test_kdf_suite_metadata_is_fail_closed() {
    let params = CryptoParameters {
        kdf_memory_cost_kb: MIN_ARGON_MEMORY_KB,
        kdf_time_cost_iters: MIN_ARGON_TIME_ITERS,
        suite_version: 999,
        ..CryptoParameters::default()
    };
    assert!(matches!(
        derive_key_from_pin("password", &params.kdf_salt, &params),
        Err(CryptoError::UnsupportedCryptoSuite(999))
    ));
    let params = CryptoParameters {
        suite_version: PRODUCTION_CRYPTO_SUITE_VERSION,
        kdf_algorithm: "PBKDF2".to_string(),
        ..params
    };
    assert!(matches!(
        derive_key_from_pin("password", &params.kdf_salt, &params),
        Err(CryptoError::KeyDerivationFailed(_))
    ));
}

#[test]
fn test_constant_time_compare_and_best_effort_zeroize() {
    assert!(constant_time_eq(&[1, 2, 3, 4], &[1, 2, 3, 4]));
    assert!(!constant_time_eq(&[1, 2, 3, 4], &[1, 2, 3, 5]));
    let mut secret = [0xA5u8; 32];
    zeroize_best_effort(&mut secret);
    assert!(secret.iter().all(|byte| *byte == 0));
}

fn hex_bytes(value: &str) -> Vec<u8> {
    assert!(value.len().is_multiple_of(2));
    (0..value.len())
        .step_by(2)
        .map(|index| u8::from_str_radix(&value[index..index + 2], 16).unwrap())
        .collect()
}

#[test]
fn test_argon2_parameter_version_is_fail_closed() {
    let params = CryptoParameters {
        kdf_memory_cost_kb: MIN_ARGON_MEMORY_KB,
        kdf_time_cost_iters: MIN_ARGON_TIME_ITERS,
        kdf_params_version: 77,
        ..CryptoParameters::default()
    };
    assert!(matches!(
        derive_key_from_pin("password", &params.kdf_salt, &params),
        Err(CryptoError::UnsupportedKdfParameters(77))
    ));
}

#[test]
fn test_document_key_hierarchy_wrap_open_and_rewrap() {
    let document_id = [0x11u8; key_hierarchy::DOCUMENT_ID_BYTES];
    let slot_a = [0x22u8; key_hierarchy::KEY_SLOT_ID_BYTES];
    let slot_b = [0x33u8; key_hierarchy::KEY_SLOT_ID_BYTES];
    let root_a = [0x44u8; KEY_SIZE];
    let root_b = [0x55u8; KEY_SIZE];
    let hierarchy = DocumentKeyHierarchy::generate(document_id);
    let content = hierarchy
        .derive_subkey(DocumentSubkeyPurpose::Content, b"chunk-0")
        .unwrap();
    let metadata = hierarchy
        .derive_subkey(DocumentSubkeyPurpose::Metadata, b"header")
        .unwrap();
    assert_ne!(content, metadata);
    assert_ne!(content, root_a);

    let wrapped = hierarchy.wrap_for_root(&root_a, slot_a).unwrap();
    let opened = open_wrapped_document_dek(&wrapped, &root_a).unwrap();
    assert_eq!(
        hierarchy
            .derive_subkey(DocumentSubkeyPurpose::Content, b"chunk-0")
            .unwrap(),
        opened
            .derive_subkey(DocumentSubkeyPurpose::Content, b"chunk-0")
            .unwrap()
    );
    assert!(open_wrapped_document_dek(&wrapped, &root_b).is_err());

    let rotated = rewrap_document_dek(&wrapped, &root_a, &root_b, slot_b).unwrap();
    assert!(open_wrapped_document_dek(&rotated, &root_a).is_err());
    let reopened = open_wrapped_document_dek(&rotated, &root_b).unwrap();
    assert_eq!(
        hierarchy
            .derive_subkey(DocumentSubkeyPurpose::Metadata, b"header")
            .unwrap(),
        reopened
            .derive_subkey(DocumentSubkeyPurpose::Metadata, b"header")
            .unwrap()
    );
}

#[test]
fn test_document_header_and_chunk_tamper_fail_closed() {
    let document_id = [0x61u8; key_hierarchy::DOCUMENT_ID_BYTES];
    let slot_id = [0x62u8; key_hierarchy::KEY_SLOT_ID_BYTES];
    let hierarchy = DocumentKeyHierarchy::generate(document_id);
    let header = DocumentAuthHeader::new(document_id, slot_id, 2).unwrap();
    let mut nonce_sequence = AesGcmNonceSequence::new();
    let dek = hierarchy
        .derive_subkey(DocumentSubkeyPurpose::FutureExtension, b"test-dek-view")
        .unwrap();
    let salt = hierarchy.derivation_salt();
    let chunk = seal_document_chunk(
        b"classified content",
        &dek,
        &salt,
        &header,
        7,
        b"content-type:application/vgt",
        &mut nonce_sequence,
    )
    .unwrap();
    let opened = open_document_chunk(
        &chunk,
        &dek,
        &salt,
        &header,
        b"content-type:application/vgt",
    )
    .unwrap();
    assert_eq!(opened, b"classified content");

    let mut tampered_header = header.clone();
    tampered_header.key_slot_count = 3;
    assert!(open_document_chunk(
        &chunk,
        &dek,
        &salt,
        &tampered_header,
        b"content-type:application/vgt",
    )
    .is_err());
    assert!(
        open_document_chunk(&chunk, &dek, &salt, &header, b"content-type:text/plain",).is_err()
    );
}

#[test]
fn test_nonce_sequence_and_confidential_fingerprint_policy() {
    let mut seq = AesGcmNonceSequence::new();
    let n1 = seq.next_nonce().unwrap();
    let n2 = seq.next_nonce().unwrap();
    assert_ne!(n1, n2);
    assert_eq!(&n1[..8], &n2[..8]);

    let data = b"same private document";
    let f1 = confidential_content_fingerprint(&[1u8; KEY_SIZE], data);
    let f2 = confidential_content_fingerprint(&[2u8; KEY_SIZE], data);
    assert_ne!(f1, f2);
    assert_ne!(f1, hash_blake3(data));
}

#[test]
fn test_nonce_exhaustion_requires_rekey_before_reuse() {
    let epoch = [0xA5u8; 8];
    let mut seq = AesGcmNonceSequence::with_test_state(epoch, MAX_NONCES_PER_KEY - 1);
    assert_eq!(seq.remaining_nonce_capacity(), 1);
    let last = seq.next_nonce().expect("last permitted nonce");
    assert_eq!(&last[..8], &epoch);
    assert_eq!(&last[8..], &u32::MAX.to_be_bytes());
    assert!(seq.rekey_required());
    assert!(matches!(seq.next_nonce(), Err(CryptoError::NonceExhausted)));
}

#[test]
fn test_multi_recipient_envelopes_are_independent_and_bound_to_fingerprints() {
    let private_a = generate_random_bytes::<32>();
    let private_b = generate_random_bytes::<32>();
    let public_a = x25519_public_from_private(&private_a);
    let public_b = x25519_public_from_private(&private_b);
    let fingerprint_a: [u8; 32] = Sha256::digest(public_a).into();
    let fingerprint_b: [u8; 32] = Sha256::digest(public_b).into();
    let recipients = vec![
        VerifiedX25519Recipient::from_expected_fingerprint("alice", public_a, fingerprint_a)
            .unwrap(),
        VerifiedX25519Recipient::from_expected_fingerprint("bob", public_b, fingerprint_b).unwrap(),
    ];
    let dek = generate_dek();
    let bundle = wrap_dek_for_recipients(&dek, &recipients).unwrap();
    assert_eq!(bundle.slots.len(), 2);
    assert_ne!(
        bundle.slots[0].envelope.ephemeral_public_key,
        bundle.slots[1].envelope.ephemeral_public_key
    );
    assert_ne!(
        bundle.slots[0].envelope.encrypted_dek,
        bundle.slots[1].envelope.encrypted_dek
    );
    assert_eq!(
        unwrap_dek_from_recipients(&bundle, &private_a).unwrap(),
        dek
    );
    assert_eq!(
        unwrap_dek_from_recipients(&bundle, &private_b).unwrap(),
        dek
    );

    let mut tampered = bundle.clone();
    tampered.slots[0].recipient_public_key_fingerprint_sha256[0] ^= 1;
    assert!(unwrap_dek_from_recipients(&tampered, &private_a).is_err());

    let mut wrong_fingerprint = fingerprint_a;
    wrong_fingerprint[0] ^= 1;
    assert!(VerifiedX25519Recipient::from_expected_fingerprint(
        "alice",
        public_a,
        wrong_fingerprint
    )
    .is_err());
}

#[test]
fn test_top_secret_is_delegated_not_reimplemented() {
    let standard = recipient_profile_descriptor(RecipientSecurityProfile::StandardV1);
    let top_secret = recipient_profile_descriptor(RecipientSecurityProfile::VgtTopSecretV1);
    assert_eq!(standard.implementation_owner, "vgt-crypto");
    assert_eq!(top_secret.implementation_owner, TOP_SECRET_PROVIDER_OWNER);
    assert_eq!(
        top_secret.external_suite,
        Some(TOP_SECRET_EXTERNAL_SUITE_ID)
    );
    assert!(!standard.forced_for_all_users && !top_secret.forced_for_all_users);
    assert!(
        validate_top_secret_delegation(TOP_SECRET_PROFILE_ID, TOP_SECRET_EXTERNAL_SUITE_ID).is_ok()
    );
    assert!(
        validate_top_secret_delegation(TOP_SECRET_PROFILE_ID, "VGT-INFINITY-DOWNGRADE").is_err()
    );
}

#[test]
fn test_registry_migration_and_public_bounds_fail_closed() {
    assert_eq!(migration_action(1, 1, 1), MigrationAction::AcceptCurrent);
    assert_eq!(migration_action(1, 1, 0), MigrationAction::RewrapOnWrite);
    assert_eq!(
        migration_action(2, 1, 1),
        MigrationAction::RejectUnsupported
    );
    assert_eq!(
        migration_action(1, 2, 1),
        MigrationAction::RejectUnsupported
    );
    assert_eq!(
        migration_action(1, 1, 99),
        MigrationAction::RejectUnsupported
    );
    assert!(validate_public_crypto_input(&[0u8; 32], 64).is_ok());
    assert!(validate_public_crypto_input(&[0u8; 65], 64).is_err());
    assert_eq!(supported_platforms().len(), 4);
    const { assert!(INDEPENDENT_REVIEW_REQUIRED); }
}

#[test]
fn test_password_salt_context_and_chunk_bounds_fail_closed() {
    let params = CryptoParameters {
        kdf_memory_cost_kb: MIN_ARGON_MEMORY_KB,
        kdf_time_cost_iters: MIN_ARGON_TIME_ITERS,
        ..CryptoParameters::default()
    };
    assert!(derive_key_from_pin("", &params.kdf_salt, &params).is_err());
    assert!(derive_key_from_pin(
        &"x".repeat(MAX_PASSWORD_BYTES + 1),
        &params.kdf_salt,
        &params
    )
    .is_err());
    let wrong_salt = vec![9u8; SALT_SIZE];
    assert!(derive_key_from_pin("password", &wrong_salt, &params).is_err());
    assert!(derive_envelope_unlock_key(&[1u8; KEY_SIZE], &[2u8; KEY_SIZE], b"").is_err());

    let document_id = [1u8; key_hierarchy::DOCUMENT_ID_BYTES];
    let slot_id = [2u8; key_hierarchy::KEY_SLOT_ID_BYTES];
    let header = DocumentAuthHeader::new(document_id, slot_id, 1).unwrap();
    let mut seq = AesGcmNonceSequence::new();
    assert!(seal_document_chunk(
        &vec![0u8; document_auth::MAX_DOCUMENT_CHUNK_BYTES + 1],
        &[3u8; KEY_SIZE],
        &[4u8; SALT_SIZE],
        &header,
        0,
        b"",
        &mut seq,
    )
    .is_err());
}
