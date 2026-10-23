use crate::{
    domain::{SealedDomainSecret, SecurityKeyNamespace},
    storage, KeyVaultError, VgtKeyVault,
};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
use std::fs;
use std::time::{SystemTime, UNIX_EPOCH};
use vgt_crypto::{generate_random_bytes, hash_blake3};

const IDENTITY_RECORD_VERSION: u8 = 1;
const IDENTITY_SUITE: &str = "VGT-INFINITY-1";
const MAX_COMPONENT_BYTES: usize = 1024 * 1024;
const MAX_IDENTITY_RECORD_BYTES: u64 = 16 * 1024 * 1024;
const MAX_PROVENANCE_SIGNATURE_BYTES: usize = 128 * 1024;

const REQUIRED_COMPONENTS: [(&str, TopSecretComponentKind); 7] = [
    ("ML-KEM-1024", TopSecretComponentKind::Kem),
    ("FRODOKEM-1344-SHAKE", TopSecretComponentKind::Kem),
    ("HQC-256", TopSecretComponentKind::Kem),
    ("AIGIS-ENC-4", TopSecretComponentKind::Kem),
    ("X25519", TopSecretComponentKind::Kem),
    ("ML-DSA-87", TopSecretComponentKind::Signature),
    ("SLH-DSA-SHAKE-256s", TopSecretComponentKind::Signature),
];

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
pub enum TopSecretComponentKind {
    Kem,
    Signature,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum TopSecretIdentityLifecycle {
    Active,
    Rotating,
    Revoked,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct TopSecretPublicComponent {
    pub role: String,
    pub algorithm: String,
    pub kind: TopSecretComponentKind,
    pub public_key: Vec<u8>,
    pub fingerprint_blake3: [u8; 32],
}

pub struct TopSecretPrivateComponentInput {
    pub algorithm: String,
    pub private_key: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct TopSecretRecipientBundle {
    pub version: u8,
    pub suite: String,
    pub identity_id: String,
    pub generation: u64,
    pub created_unix: u64,
    pub components: Vec<TopSecretPublicComponent>,
    pub canonical_digest_blake3: [u8; 32],
    pub provenance_algorithm: String,
    pub provenance_signature: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct SealedTopSecretIdentityComponent {
    pub algorithm: String,
    pub secret: SealedDomainSecret,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct TopSecretIdentityRecord {
    pub version: u8,
    pub lifecycle: TopSecretIdentityLifecycle,
    pub bundle: TopSecretRecipientBundle,
    pub sealed_private_components: Vec<SealedTopSecretIdentityComponent>,
}

impl VgtKeyVault {
    pub fn enroll_top_secret_identity<F>(
        &mut self,
        public_components: Vec<TopSecretPublicComponent>,
        private_components: Vec<TopSecretPrivateComponentInput>,
        provenance_signer: F,
    ) -> Result<TopSecretIdentityRecord, KeyVaultError>
    where
        F: FnOnce(&[u8]) -> Result<(String, Vec<u8>), KeyVaultError>,
    {
        if !self.is_top_secret_unlocked() {
            return Err(KeyVaultError::TopSecretLocked);
        }
        if identity_path()?.exists() {
            return Err(KeyVaultError::PolicyViolation);
        }
        create_identity_record(
            self,
            random_identity_id(),
            1,
            public_components,
            private_components,
            provenance_signer,
        )
    }

    pub fn rotate_top_secret_identity<F>(
        &mut self,
        public_components: Vec<TopSecretPublicComponent>,
        private_components: Vec<TopSecretPrivateComponentInput>,
        provenance_signer: F,
    ) -> Result<TopSecretIdentityRecord, KeyVaultError>
    where
        F: FnOnce(&[u8]) -> Result<(String, Vec<u8>), KeyVaultError>,
    {
        if !self.is_top_secret_unlocked() {
            return Err(KeyVaultError::TopSecretLocked);
        }
        let existing = load_identity_record()?.ok_or(KeyVaultError::TopSecretNotEnrolled)?;
        if existing.lifecycle == TopSecretIdentityLifecycle::Revoked
            || existing.bundle.generation == u64::MAX
        {
            return Err(KeyVaultError::PolicyViolation);
        }
        create_identity_record(
            self,
            existing.bundle.identity_id,
            existing.bundle.generation.saturating_add(1),
            public_components,
            private_components,
            provenance_signer,
        )
    }

    pub fn revoke_top_secret_identity(&self) -> Result<TopSecretIdentityRecord, KeyVaultError> {
        let mut record = load_identity_record()?.ok_or(KeyVaultError::TopSecretNotEnrolled)?;
        record.lifecycle = TopSecretIdentityLifecycle::Revoked;
        save_identity_record(&record)?;
        Ok(record)
    }

    pub fn top_secret_identity(&self) -> Result<Option<TopSecretIdentityRecord>, KeyVaultError> {
        load_identity_record()
    }

    pub fn unseal_top_secret_identity_component(
        &mut self,
        algorithm: &str,
    ) -> Result<Vec<u8>, KeyVaultError> {
        if !self.is_top_secret_unlocked() {
            return Err(KeyVaultError::TopSecretLocked);
        }
        let record = load_identity_record()?.ok_or(KeyVaultError::TopSecretNotEnrolled)?;
        if record.lifecycle != TopSecretIdentityLifecycle::Active
            || component_order(algorithm).is_none()
        {
            return Err(KeyVaultError::PolicyViolation);
        }
        let component = record
            .sealed_private_components
            .iter()
            .find(|component| component.algorithm == algorithm)
            .ok_or(KeyVaultError::IntegrityFailed)?;
        let scope = identity_component_scope(
            &record.bundle.identity_id,
            record.bundle.generation,
            algorithm,
        );
        self.unseal_domain_secret(
            SecurityKeyNamespace::VgtTopSecret,
            &scope,
            &component.secret,
        )
    }

    pub fn export_top_secret_recipient_bundle(
        &self,
    ) -> Result<TopSecretRecipientBundle, KeyVaultError> {
        let record = load_identity_record()?.ok_or(KeyVaultError::TopSecretNotEnrolled)?;
        if record.lifecycle != TopSecretIdentityLifecycle::Active {
            return Err(KeyVaultError::PolicyViolation);
        }
        validate_bundle(&record.bundle)?;
        Ok(record.bundle)
    }

    pub fn import_top_secret_recipient_bundle<F>(
        bundle: TopSecretRecipientBundle,
        provenance_verifier: F,
    ) -> Result<TopSecretRecipientBundle, KeyVaultError>
    where
        F: FnOnce(&str, &[u8], &[u8]) -> bool,
    {
        validate_bundle(&bundle)?;
        let canonical = canonical_bundle_bytes(
            &bundle.identity_id,
            bundle.generation,
            bundle.created_unix,
            &bundle.components,
        )?;
        if !provenance_verifier(
            &bundle.provenance_algorithm,
            &canonical,
            &bundle.provenance_signature,
        ) {
            return Err(KeyVaultError::ProvenanceRejected);
        }
        Ok(bundle)
    }
}

fn create_identity_record<F>(
    vault: &mut VgtKeyVault,
    identity_id: String,
    generation: u64,
    public_components: Vec<TopSecretPublicComponent>,
    private_components: Vec<TopSecretPrivateComponentInput>,
    provenance_signer: F,
) -> Result<TopSecretIdentityRecord, KeyVaultError>
where
    F: FnOnce(&[u8]) -> Result<(String, Vec<u8>), KeyVaultError>,
{
    validate_component_sets(&public_components, &private_components)?;
    if identity_id.len() != 48 || !identity_id.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(KeyVaultError::IntegrityFailed);
    }
    let created_unix = unix_now();
    let canonical =
        canonical_bundle_bytes(&identity_id, generation, created_unix, &public_components)?;
    let digest = hash_blake3(&canonical);
    let (provenance_algorithm, provenance_signature) = provenance_signer(&canonical)?;
    if provenance_algorithm.is_empty()
        || provenance_algorithm.len() > 64
        || provenance_signature.is_empty()
        || provenance_signature.len() > MAX_PROVENANCE_SIGNATURE_BYTES
    {
        return Err(KeyVaultError::ProvenanceRejected);
    }

    let bundle = TopSecretRecipientBundle {
        version: IDENTITY_RECORD_VERSION,
        suite: IDENTITY_SUITE.to_string(),
        identity_id: identity_id.clone(),
        generation,
        created_unix,
        components: public_components,
        canonical_digest_blake3: digest,
        provenance_algorithm,
        provenance_signature,
    };
    validate_bundle(&bundle)?;

    let mut sealed_private_components = Vec::with_capacity(private_components.len());
    for mut component in private_components {
        let scope = identity_component_scope(&identity_id, generation, &component.algorithm);
        let sealed = vault.seal_domain_secret(
            SecurityKeyNamespace::VgtTopSecret,
            &scope,
            &component.private_key,
        )?;
        component.private_key.fill(0);
        sealed_private_components.push(SealedTopSecretIdentityComponent {
            algorithm: component.algorithm,
            secret: sealed,
        });
    }

    let record = TopSecretIdentityRecord {
        version: IDENTITY_RECORD_VERSION,
        lifecycle: TopSecretIdentityLifecycle::Active,
        bundle,
        sealed_private_components,
    };
    save_identity_record(&record)?;
    Ok(record)
}

fn validate_component_sets(
    public_components: &[TopSecretPublicComponent],
    private_components: &[TopSecretPrivateComponentInput],
) -> Result<(), KeyVaultError> {
    if public_components.len() != REQUIRED_COMPONENTS.len()
        || private_components.len() != REQUIRED_COMPONENTS.len()
    {
        return Err(KeyVaultError::PolicyViolation);
    }
    let mut public_names = BTreeSet::new();
    for component in public_components {
        if component.role.is_empty()
            || component.role.len() > 64
            || component.public_key.is_empty()
            || component.public_key.len() > MAX_COMPONENT_BYTES
            || hash_blake3(&component.public_key) != component.fingerprint_blake3
            || !public_names.insert((component.algorithm.clone(), component.kind))
        {
            return Err(KeyVaultError::IntegrityFailed);
        }
    }
    let expected: BTreeSet<_> = REQUIRED_COMPONENTS
        .iter()
        .map(|(algorithm, kind)| ((*algorithm).to_string(), *kind))
        .collect();
    if public_names != expected {
        return Err(KeyVaultError::PolicyViolation);
    }
    let private_names: BTreeSet<_> = private_components
        .iter()
        .map(|component| component.algorithm.clone())
        .collect();
    let expected_private: BTreeSet<_> = REQUIRED_COMPONENTS
        .iter()
        .map(|(algorithm, _)| (*algorithm).to_string())
        .collect();
    if private_names != expected_private
        || private_components.iter().any(|component| {
            component.private_key.is_empty() || component.private_key.len() > MAX_COMPONENT_BYTES
        })
    {
        return Err(KeyVaultError::PolicyViolation);
    }
    Ok(())
}

fn validate_bundle(bundle: &TopSecretRecipientBundle) -> Result<(), KeyVaultError> {
    if bundle.version != IDENTITY_RECORD_VERSION
        || bundle.suite != IDENTITY_SUITE
        || bundle.identity_id.len() != 48
        || !bundle
            .identity_id
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit())
        || bundle.generation == 0
        || bundle.provenance_algorithm.is_empty()
        || bundle.provenance_signature.is_empty()
        || bundle.provenance_signature.len() > MAX_PROVENANCE_SIGNATURE_BYTES
    {
        return Err(KeyVaultError::IntegrityFailed);
    }
    let canonical = canonical_bundle_bytes(
        &bundle.identity_id,
        bundle.generation,
        bundle.created_unix,
        &bundle.components,
    )?;
    if hash_blake3(&canonical) != bundle.canonical_digest_blake3 {
        return Err(KeyVaultError::IntegrityFailed);
    }
    let private_placeholders: Vec<_> = bundle
        .components
        .iter()
        .map(|component| TopSecretPrivateComponentInput {
            algorithm: component.algorithm.clone(),
            private_key: vec![1],
        })
        .collect();
    validate_component_sets(&bundle.components, &private_placeholders)
}

#[derive(Serialize)]
struct CanonicalBundle<'a> {
    version: u8,
    suite: &'static str,
    identity_id: &'a str,
    generation: u64,
    created_unix: u64,
    components: &'a [TopSecretPublicComponent],
}

fn component_order(algorithm: &str) -> Option<usize> {
    REQUIRED_COMPONENTS
        .iter()
        .position(|(expected, _)| *expected == algorithm)
}

fn canonical_bundle_bytes(
    identity_id: &str,
    generation: u64,
    created_unix: u64,
    components: &[TopSecretPublicComponent],
) -> Result<Vec<u8>, KeyVaultError> {
    // Public input order must not change the recipient fingerprint or provenance message.
    // Canonical order is suite-defined and therefore stable across producers.
    let mut canonical_components = components.to_vec();
    canonical_components
        .sort_by_key(|component| component_order(&component.algorithm).unwrap_or(usize::MAX));
    if canonical_components
        .iter()
        .any(|component| component_order(&component.algorithm).is_none())
    {
        return Err(KeyVaultError::PolicyViolation);
    }
    serde_json::to_vec(&CanonicalBundle {
        version: IDENTITY_RECORD_VERSION,
        suite: IDENTITY_SUITE,
        identity_id,
        generation,
        created_unix,
        components: &canonical_components,
    })
    .map_err(|_| KeyVaultError::IntegrityFailed)
}

fn identity_component_scope(identity_id: &str, generation: u64, algorithm: &str) -> String {
    format!("top-secret-identity:{identity_id}:g{generation}:{algorithm}")
}

fn identity_path() -> Result<std::path::PathBuf, KeyVaultError> {
    Ok(storage::get_vault_dir()?.join("top-secret-identity.json"))
}

fn load_identity_record() -> Result<Option<TopSecretIdentityRecord>, KeyVaultError> {
    let path = identity_path()?;
    if !path.exists() {
        return Ok(None);
    }
    let metadata = fs::metadata(&path).map_err(|e| KeyVaultError::StorageError(e.to_string()))?;
    if metadata.len() == 0 || metadata.len() > MAX_IDENTITY_RECORD_BYTES {
        return Err(KeyVaultError::IntegrityFailed);
    }
    let bytes = fs::read(path).map_err(|e| KeyVaultError::StorageError(e.to_string()))?;
    let record: TopSecretIdentityRecord =
        serde_json::from_slice(&bytes).map_err(|_| KeyVaultError::IntegrityFailed)?;
    validate_identity_record(&record)?;
    Ok(Some(record))
}

fn validate_identity_record(record: &TopSecretIdentityRecord) -> Result<(), KeyVaultError> {
    if record.version != IDENTITY_RECORD_VERSION
        || record.sealed_private_components.len() != REQUIRED_COMPONENTS.len()
    {
        return Err(KeyVaultError::IntegrityFailed);
    }
    validate_bundle(&record.bundle)?;

    let expected: BTreeSet<_> = REQUIRED_COMPONENTS
        .iter()
        .map(|(algorithm, _)| (*algorithm).to_string())
        .collect();
    let mut actual = BTreeSet::new();
    for component in &record.sealed_private_components {
        if !actual.insert(component.algorithm.clone())
            || component.secret.version != 1
            || component.secret.namespace != SecurityKeyNamespace::VgtTopSecret
            || component.secret.ciphertext.is_empty()
            || component.secret.ciphertext.len() > MAX_COMPONENT_BYTES + 32
        {
            return Err(KeyVaultError::IntegrityFailed);
        }
    }
    if actual != expected {
        return Err(KeyVaultError::PolicyViolation);
    }
    Ok(())
}

fn save_identity_record(record: &TopSecretIdentityRecord) -> Result<(), KeyVaultError> {
    validate_identity_record(record)?;
    let bytes = serde_json::to_vec(record).map_err(|_| KeyVaultError::IntegrityFailed)?;
    if bytes.len() as u64 > MAX_IDENTITY_RECORD_BYTES {
        return Err(KeyVaultError::IntegrityFailed);
    }
    storage::atomic_write(&identity_path()?, &bytes)
}

fn random_identity_id() -> String {
    let bytes = generate_random_bytes::<24>();
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut output = String::with_capacity(48);
    for byte in bytes {
        output.push(HEX[(byte >> 4) as usize] as char);
        output.push(HEX[(byte & 0x0f) as usize] as char);
    }
    output
}

fn unix_now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}
