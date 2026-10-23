use vgt_infinity_core::{crypto::LAYERS, model::{DOMAIN, FORMAT_VERSION, MAGIC, SUITE}};
use vgt_top_secret::{INFINITY_PINNED_COMMIT, INFINITY_SUITE, OUTER_FORMAT_VERSION, OUTER_MAGIC, OUTER_SUITE};

#[test]
fn pinned_infinity_contract_matches_astraea_adapter() {
    assert_eq!(INFINITY_PINNED_COMMIT, "55b05a697a189d0ec583cdcf340beeba1efc9130");
    assert_eq!(SUITE, INFINITY_SUITE);
    assert_eq!(FORMAT_VERSION, 2);
    assert_eq!(MAGIC, b"VGTINF02");
    assert_eq!(DOMAIN, b"VGT/INFINITY/1");
    assert_eq!(LAYERS, ["SERPENT-256-EAX", "TWOFISH-256-EAX", "XCHACHA20-POLY1305", "AES-256-GCM-SIV"]);
    assert_eq!(OUTER_SUITE, "VGT-ASTRAEA-TS-1");
    assert_eq!(OUTER_FORMAT_VERSION, 1);
    assert_eq!(OUTER_MAGIC, b"VGATS001");
}
