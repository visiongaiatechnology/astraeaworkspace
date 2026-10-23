use std::collections::HashSet;
use vgt_crypto::{decrypt_aes_gcm, encrypt_aes_gcm, CryptoError, KEY_SIZE};

#[test]
fn sec010_2048_ciphertext_corruptions_have_one_public_auth_outcome() {
    let key = [0x42u8; KEY_SIZE];
    let aad = b"VGT-SEC-010";
    let plaintext = b"opaque-error-oracle-test";
    let (ciphertext, nonce) = encrypt_aes_gcm(plaintext, &key, aad).unwrap();
    let mut codes = HashSet::new();
    for i in 0..2048usize {
        let mut bad = ciphertext.clone();
        let idx = i % bad.len();
        bad[idx] ^= 1u8 << (i % 8);
        let err = decrypt_aes_gcm(&bad, &nonce, &key, aad).unwrap_err();
        assert!(matches!(err, CryptoError::DecryptionFailed));
        codes.insert(err.diagnostic_code());
    }
    assert_eq!(codes.len(), 1);
    assert!(codes.contains("CRYPTO_AUTHENTICATION_FAILED"));
}
