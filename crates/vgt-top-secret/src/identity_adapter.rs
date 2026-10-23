//! Astraea <-> pinned VGT Infinity identity adapter.

use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use rand::rngs::OsRng;
use std::fs;
use vgt_infinity_core::identity::LoadedIdentity;
use vgt_infinity_core::model::{PrivateMaterial, PublicComponent, PublicIdentity};
use vgt_keyvault::{TopSecretComponentKind, TopSecretIdentityLifecycle, VgtKeyVault};
use zeroize::{Zeroize, Zeroizing};

use crate::{TopSecretEngine, TopSecretError, INFINITY_SUITE};

pub(crate) fn load_infinity_identity(vault: &mut VgtKeyVault) -> Result<LoadedIdentity, TopSecretError> {
    if !vault.is_top_secret_unlocked() { return Err(TopSecretError::IdentityUnavailable); }
    let record = vault.top_secret_identity()?.ok_or(TopSecretError::IdentityUnavailable)?;
    if record.lifecycle != TopSecretIdentityLifecycle::Active || record.bundle.suite != INFINITY_SUITE { return Err(TopSecretError::IdentityRejected); }
    if record.bundle.components.len() != 7 { return Err(TopSecretError::IdentityRejected); }

    let find_public = |algorithm: &str| -> Result<&[u8], TopSecretError> {
        let mut found = record.bundle.components.iter().filter(|component| component.algorithm == algorithm);
        let item = found.next().ok_or(TopSecretError::IdentityRejected)?;
        if found.next().is_some() { return Err(TopSecretError::IdentityRejected); }
        Ok(item.public_key.as_slice())
    };
    let role = |algorithm: &str| -> &'static str { match algorithm { "ML-KEM-1024" => "USA", "FRODOKEM-1344-SHAKE" => "DIVERSITY", "HQC-256" => "EUROPE", "AIGIS-ENC-4" => "CHINA", _ => "" } };
    let provider = |algorithm: &str| -> &'static str { match algorithm { "ML-KEM-1024" => "RustCrypto", "FRODOKEM-1344-SHAKE" => "frodo-kem-rs", "HQC-256" => "PQClean/pqcrypto", "AIGIS-ENC-4" => "PQMagic", _ => "" } };
    let mut components = Vec::new();
    for algorithm in ["ML-KEM-1024", "FRODOKEM-1344-SHAKE", "HQC-256", "AIGIS-ENC-4"] {
        components.push(PublicComponent { role: role(algorithm).into(), algorithm: algorithm.into(), provider: provider(algorithm).into(), public_key: B64.encode(find_public(algorithm)?) });
    }
    for component in &record.bundle.components {
        match component.kind {
            TopSecretComponentKind::Kem | TopSecretComponentKind::Signature => {}
        }
    }
    let public = PublicIdentity {
        version: 2,
        suite: INFINITY_SUITE.to_owned(),
        identity_id: record.bundle.identity_id.clone(),
        created_unix: record.bundle.created_unix,
        components,
        x25519_public: B64.encode(find_public("X25519")?),
        ml_dsa_87_public: B64.encode(find_public("ML-DSA-87")?),
        slh_dsa_shake_256s_public: B64.encode(find_public("SLH-DSA-SHAKE-256s")?),
    };

    let mut private_parts = Vec::new();
    for algorithm in ["ML-KEM-1024", "FRODOKEM-1344-SHAKE", "HQC-256", "AIGIS-ENC-4", "X25519", "ML-DSA-87", "SLH-DSA-SHAKE-256s"] {
        private_parts.push((algorithm, Zeroizing::new(vault.unseal_top_secret_identity_component(algorithm)?)));
    }
    let private = PrivateMaterial {
        ml_kem_1024_seed: B64.encode(&*private_parts[0].1),
        frodo_kem_1344_private: B64.encode(&*private_parts[1].1),
        hqc_256_private: B64.encode(&*private_parts[2].1),
        aigis_enc_4_private: B64.encode(&*private_parts[3].1),
        x25519_private: B64.encode(&*private_parts[4].1),
        ml_dsa_87_seed: B64.encode(&*private_parts[5].1),
        slh_dsa_shake_256s_private: B64.encode(&*private_parts[6].1),
    };
    for (_, mut bytes) in private_parts { bytes.zeroize(); }
    Ok(LoadedIdentity { public, private: Zeroizing::new(private) })
}

/// Bootstrap the Astraea KeyVault Top Secret identity from the exact pinned Infinity key generators.
/// The upstream encrypted identity exists only in a short-lived private temp directory and is deleted
/// after its components are re-sealed into the Astraea Top Secret KeyVault domain.
pub fn enroll_identity_from_infinity(
    engine: &TopSecretEngine,
    vault: &mut VgtKeyVault,
) -> Result<vgt_keyvault::TopSecretIdentityRecord, TopSecretError> {
    use ml_dsa::{MlDsa87, SigningKey};
    use vgt_infinity_core::identity::{create_identity, load_identity};
    use vgt_keyvault::{TopSecretPrivateComponentInput, TopSecretPublicComponent};

    engine.validate_provider()?;
    if !vault.is_top_secret_unlocked() { return Err(TopSecretError::IdentityUnavailable); }
    if vault.top_secret_identity()?.is_some() { return Err(TopSecretError::IdentityRejected); }

    let temp_parent = std::env::temp_dir();
    let mut suffix_bytes = [0u8; 8];
    OsRng.fill_bytes(&mut suffix_bytes);
    let temp_dir = temp_parent.join(format!("astraea-ts-identity-{:016x}", u64::from_be_bytes(suffix_bytes)));
    fs::create_dir(&temp_dir)?;
    let mut password = Zeroizing::new([0u8; 32]);
    use rand::RngCore as _;
    let mut rng = rand::rngs::OsRng;
    rng.fill_bytes(password.as_mut());
    let result = (|| {
        create_identity(engine.provider_workspace(), &temp_dir, password.as_slice())?;
        let loaded = load_identity(&temp_dir, password.as_slice())?;
        let mut public_components = Vec::new();
        for item in &loaded.public.components {
            let decoded = B64.decode(item.public_key.as_bytes()).map_err(|_| TopSecretError::IdentityRejected)?;
            public_components.push(TopSecretPublicComponent {
                role: item.role.clone(),
                algorithm: item.algorithm.clone(),
                kind: TopSecretComponentKind::Kem,
                fingerprint_blake3: *blake3::hash(&decoded).as_bytes(),
                public_key: decoded,
            });
        }
        for (algorithm, role, encoded, kind) in [
            ("X25519", "CLASSICAL-HEDGE", loaded.public.x25519_public.as_str(), TopSecretComponentKind::Kem),
            ("ML-DSA-87", "SIGNATURE", loaded.public.ml_dsa_87_public.as_str(), TopSecretComponentKind::Signature),
            ("SLH-DSA-SHAKE-256s", "SIGNATURE-DIVERSITY", loaded.public.slh_dsa_shake_256s_public.as_str(), TopSecretComponentKind::Signature),
        ] {
            let decoded = B64.decode(encoded.as_bytes()).map_err(|_| TopSecretError::IdentityRejected)?;
            public_components.push(TopSecretPublicComponent {
                role: role.to_owned(), algorithm: algorithm.to_owned(), kind,
                fingerprint_blake3: *blake3::hash(&decoded).as_bytes(), public_key: decoded,
            });
        }
        let decode_private = |value: &str| -> Result<Vec<u8>, TopSecretError> {
            B64.decode(value.as_bytes()).map_err(|_| TopSecretError::IdentityRejected)
        };
        let private_components = vec![
            TopSecretPrivateComponentInput { algorithm: "ML-KEM-1024".into(), private_key: decode_private(&loaded.private.ml_kem_1024_seed)? },
            TopSecretPrivateComponentInput { algorithm: "FRODOKEM-1344-SHAKE".into(), private_key: decode_private(&loaded.private.frodo_kem_1344_private)? },
            TopSecretPrivateComponentInput { algorithm: "HQC-256".into(), private_key: decode_private(&loaded.private.hqc_256_private)? },
            TopSecretPrivateComponentInput { algorithm: "AIGIS-ENC-4".into(), private_key: decode_private(&loaded.private.aigis_enc_4_private)? },
            TopSecretPrivateComponentInput { algorithm: "X25519".into(), private_key: decode_private(&loaded.private.x25519_private)? },
            TopSecretPrivateComponentInput { algorithm: "ML-DSA-87".into(), private_key: decode_private(&loaded.private.ml_dsa_87_seed)? },
            TopSecretPrivateComponentInput { algorithm: "SLH-DSA-SHAKE-256s".into(), private_key: decode_private(&loaded.private.slh_dsa_shake_256s_private)? },
        ];
        let sign_seed_bytes = decode_private(&loaded.private.ml_dsa_87_seed)?;
        let sign_seed = ml_dsa::Seed::try_from(sign_seed_bytes.as_slice()).map_err(|_| TopSecretError::IdentityRejected)?;
        let signing = SigningKey::<MlDsa87>::from_seed(&sign_seed);
        vault.enroll_top_secret_identity(public_components, private_components, move |canonical| {
            let signature = signing.expanded_key().sign_deterministic(canonical, b"VGT/ASTRAEA/TS/IDENTITY-PROVENANCE")
                .map_err(|_| vgt_keyvault::KeyVaultError::ProvenanceRejected)?;
            Ok(("ML-DSA-87/VGT-ASTRAEA-TS-IDENTITY".into(), signature.encode().as_slice().to_vec()))
        }).map_err(TopSecretError::KeyVault)
    })();
    password.zeroize();
    let _ = fs::remove_dir_all(&temp_dir);
    result
}
