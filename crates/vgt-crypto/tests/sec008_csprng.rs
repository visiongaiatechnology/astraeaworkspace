use std::collections::HashSet;
use vgt_crypto::fill_csprng;

#[test]
fn sec008_os_csprng_produces_unique_nonzero_security_ids() {
    let mut seen = HashSet::new();
    for _ in 0..1024 {
        let mut id = [0u8; 32];
        fill_csprng(&mut id);
        assert!(id.iter().any(|b| *b != 0));
        assert!(seen.insert(id), "duplicate 256-bit CSPRNG sample");
    }
}
