// STATUS: DIAMANT VGT SUPREME
//! Revision-safe root-key generation history.
//!
//! Root generations are immutable secure-provider records. A local metadata manifest
//! contains only identifiers/fingerprints and is authenticated with a separate HMAC
//! key held by the native secure-persistence provider. Deleting, reordering or
//! rewriting a generation record invalidates both the per-namespace chain and the
//! manifest MAC. Historical root material is loaded only for an explicit generation.

use crate::domain::SecurityKeyNamespace;
use crate::{storage, KeyVaultError};
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use std::fs::File;
use std::io::Read;
use std::path::Path;
use vgt_crypto::{generate_random_bytes, hash_blake3, zeroize_best_effort, KEY_SIZE};

type HmacSha256 = Hmac<Sha256>;

const MANIFEST_VERSION: u16 = 1;
const MAX_GENERATIONS_PER_NAMESPACE: usize = 1_000_000;
const MAX_MANIFEST_BYTES: usize = 4 * 1024 * 1024;
const MAX_MANIFEST_READ_BYTES: u64 = MAX_MANIFEST_BYTES as u64 + 1;
const HISTORY_INTEGRITY_ACCOUNT: &str = "workspace-rotation-history-integrity";
const MANIFEST_FILE: &str = "key-rotation-history-v1.json";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub(crate) struct RotationGenerationRecord {
    pub namespace: SecurityKeyNamespace,
    pub generation: u32,
    pub root_account: String,
    pub root_fingerprint_blake3: [u8; 32],
    pub previous_commitment: [u8; 32],
    pub commitment: [u8; 32],
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
struct NamespaceRotationState {
    namespace: SecurityKeyNamespace,
    current_generation: u32,
    records: Vec<RotationGenerationRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
struct ManifestPayload {
    namespaces: Vec<NamespaceRotationState>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
struct AuthenticatedManifest {
    version: u16,
    payload: ManifestPayload,
    hmac_sha256: [u8; 32],
}

pub(crate) struct LoadedRootGeneration {
    pub root: [u8; KEY_SIZE],
    pub generation: u32,
}

pub(crate) fn load_or_create_current_root(
    namespace: SecurityKeyNamespace,
    legacy_account: &str,
) -> Result<LoadedRootGeneration, KeyVaultError> {
    let mut integrity_key = load_or_create_integrity_key()?;
    let mut payload = load_verified_payload(&integrity_key)?;

    if let Some(state) = namespace_state(&payload, namespace) {
        let generation = state.current_generation;
        let account = state
            .records
            .iter()
            .find(|record| record.generation == generation)
            .ok_or(KeyVaultError::IntegrityFailed)?
            .root_account
            .clone();
        let root =
            storage::load_persistent_secret(&account)?.ok_or(KeyVaultError::IntegrityFailed)?;
        zeroize_best_effort(&mut integrity_key);
        return Ok(LoadedRootGeneration { root, generation });
    }

    let root = match storage::load_persistent_secret(legacy_account)? {
        Some(existing) => existing,
        None => {
            let fresh = generate_random_bytes::<KEY_SIZE>();
            storage::save_persistent_secret(legacy_account, &fresh)?;
            fresh
        }
    };
    let generation = 1;
    let account = generation_account(namespace, generation);
    storage::save_persistent_secret(&account, &root)?;
    append_generation(
        &mut payload,
        namespace,
        generation,
        &account,
        &root,
        &integrity_key,
    )?;
    save_payload(&payload, &integrity_key)?;
    zeroize_best_effort(&mut integrity_key);
    Ok(LoadedRootGeneration { root, generation })
}

pub(crate) fn current_generation(
    namespace: SecurityKeyNamespace,
) -> Result<Option<u32>, KeyVaultError> {
    let Some(mut integrity_key) = load_integrity_key()? else {
        return Ok(None);
    };
    let payload = load_verified_payload(&integrity_key)?;
    let generation = namespace_state(&payload, namespace).map(|state| state.current_generation);
    zeroize_best_effort(&mut integrity_key);
    Ok(generation)
}

pub(crate) fn load_generation_root(
    namespace: SecurityKeyNamespace,
    generation: u32,
) -> Result<[u8; KEY_SIZE], KeyVaultError> {
    if generation == 0 {
        return Err(KeyVaultError::IntegrityFailed);
    }
    let mut integrity_key = load_integrity_key()?.ok_or(KeyVaultError::IntegrityFailed)?;
    let payload = load_verified_payload(&integrity_key)?;
    let state = namespace_state(&payload, namespace).ok_or(KeyVaultError::IntegrityFailed)?;
    let record = state
        .records
        .iter()
        .find(|record| record.generation == generation)
        .ok_or(KeyVaultError::IntegrityFailed)?;
    let root = storage::load_persistent_secret(&record.root_account)?
        .ok_or(KeyVaultError::IntegrityFailed)?;
    if hash_blake3(&root) != record.root_fingerprint_blake3 {
        zeroize_best_effort(&mut integrity_key);
        return Err(KeyVaultError::IntegrityFailed);
    }
    zeroize_best_effort(&mut integrity_key);
    Ok(root)
}

pub(crate) fn rotate_current_root(
    namespace: SecurityKeyNamespace,
    legacy_account: &str,
) -> Result<(LoadedRootGeneration, [u8; 32]), KeyVaultError> {
    let current = load_or_create_current_root(namespace, legacy_account)?;
    let previous_fingerprint = hash_blake3(&current.root);
    let next_generation = current
        .generation
        .checked_add(1)
        .ok_or(KeyVaultError::PolicyViolation)?;
    if next_generation as usize > MAX_GENERATIONS_PER_NAMESPACE {
        return Err(KeyVaultError::PolicyViolation);
    }

    let next_root = generate_random_bytes::<KEY_SIZE>();
    let next_account = generation_account(namespace, next_generation);
    storage::save_persistent_secret(&next_account, &next_root)?;

    let mut integrity_key = load_or_create_integrity_key()?;
    let mut payload = load_verified_payload(&integrity_key)?;
    append_generation(
        &mut payload,
        namespace,
        next_generation,
        &next_account,
        &next_root,
        &integrity_key,
    )?;
    save_payload(&payload, &integrity_key)?;

    // The generation account + authenticated manifest are authoritative. The legacy
    // alias is updated only after commit for compatibility with older consumers.
    storage::save_persistent_secret(legacy_account, &next_root)?;
    zeroize_best_effort(&mut integrity_key);

    let result = LoadedRootGeneration {
        root: next_root,
        generation: next_generation,
    };
    // Ownership of next_root moved to the result; callers immediately transfer it to
    // LockedKey. The historical provider record remains immutable.
    Ok((result, previous_fingerprint))
}

fn load_integrity_key() -> Result<Option<[u8; KEY_SIZE]>, KeyVaultError> {
    storage::load_persistent_secret(HISTORY_INTEGRITY_ACCOUNT)
}

fn load_or_create_integrity_key() -> Result<[u8; KEY_SIZE], KeyVaultError> {
    if let Some(key) = load_integrity_key()? {
        return Ok(key);
    }
    let mut key = generate_random_bytes::<KEY_SIZE>();
    if let Err(error) = storage::save_persistent_secret(HISTORY_INTEGRITY_ACCOUNT, &key) {
        zeroize_best_effort(&mut key);
        return Err(error);
    }
    Ok(key)
}

fn manifest_path() -> Result<std::path::PathBuf, KeyVaultError> {
    Ok(storage::get_vault_dir()?.join(MANIFEST_FILE))
}

fn load_verified_payload(integrity_key: &[u8; KEY_SIZE]) -> Result<ManifestPayload, KeyVaultError> {
    let path = manifest_path()?;
    let Some(file) = open_manifest_file(&path)? else {
        return Ok(ManifestPayload::default());
    };
    load_verified_payload_from_file(file, integrity_key)
}

#[cfg(test)]
fn load_verified_payload_from_path(
    path: &Path,
    integrity_key: &[u8; KEY_SIZE],
) -> Result<ManifestPayload, KeyVaultError> {
    let file = open_manifest_file(path)?.ok_or(KeyVaultError::IntegrityFailed)?;
    load_verified_payload_from_file(file, integrity_key)
}

fn open_manifest_file(path: &Path) -> Result<Option<File>, KeyVaultError> {
    let path_metadata = match std::fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(KeyVaultError::StorageError(error.to_string())),
    };
    if path_metadata.file_type().is_symlink()
        || !path_metadata.is_file()
        || path_metadata.len() == 0
        || path_metadata.len() > MAX_MANIFEST_BYTES as u64
    {
        return Err(KeyVaultError::IntegrityFailed);
    }

    let file = File::open(path).map_err(|error| KeyVaultError::StorageError(error.to_string()))?;
    let opened_metadata = file
        .metadata()
        .map_err(|error| KeyVaultError::StorageError(error.to_string()))?;
    if !opened_metadata.is_file()
        || opened_metadata.len() == 0
        || opened_metadata.len() > MAX_MANIFEST_BYTES as u64
    {
        return Err(KeyVaultError::IntegrityFailed);
    }
    Ok(Some(file))
}

fn load_verified_payload_from_file(
    file: File,
    integrity_key: &[u8; KEY_SIZE],
) -> Result<ManifestPayload, KeyVaultError> {
    let metadata = file
        .metadata()
        .map_err(|error| KeyVaultError::StorageError(error.to_string()))?;
    if !metadata.is_file() || metadata.len() == 0 || metadata.len() > MAX_MANIFEST_BYTES as u64 {
        return Err(KeyVaultError::IntegrityFailed);
    }
    let capacity = usize::try_from(metadata.len()).map_err(|_| KeyVaultError::IntegrityFailed)?;
    let mut bytes = Vec::with_capacity(capacity);
    file.take(MAX_MANIFEST_READ_BYTES)
        .read_to_end(&mut bytes)
        .map_err(|error| KeyVaultError::StorageError(error.to_string()))?;
    if bytes.is_empty() || bytes.len() > MAX_MANIFEST_BYTES {
        return Err(KeyVaultError::IntegrityFailed);
    }
    load_verified_payload_from_bytes(&bytes, integrity_key)
}

fn load_verified_payload_from_bytes(
    bytes: &[u8],
    integrity_key: &[u8; KEY_SIZE],
) -> Result<ManifestPayload, KeyVaultError> {
    if bytes.is_empty() || bytes.len() > MAX_MANIFEST_BYTES {
        return Err(KeyVaultError::IntegrityFailed);
    }
    let manifest: AuthenticatedManifest =
        serde_json::from_slice(bytes).map_err(|_| KeyVaultError::IntegrityFailed)?;
    if manifest.version != MANIFEST_VERSION {
        return Err(KeyVaultError::IntegrityFailed);
    }
    let expected = manifest_mac(&manifest.payload, integrity_key)?;
    if !vgt_crypto::constant_time_eq(&expected, &manifest.hmac_sha256) {
        return Err(KeyVaultError::IntegrityFailed);
    }
    verify_payload(&manifest.payload, integrity_key)?;
    Ok(manifest.payload)
}

fn save_payload(
    payload: &ManifestPayload,
    integrity_key: &[u8; KEY_SIZE],
) -> Result<(), KeyVaultError> {
    verify_payload(payload, integrity_key)?;
    let manifest = AuthenticatedManifest {
        version: MANIFEST_VERSION,
        payload: payload.clone(),
        hmac_sha256: manifest_mac(payload, integrity_key)?,
    };
    let bytes = serde_json::to_vec(&manifest).map_err(|_| KeyVaultError::IntegrityFailed)?;
    storage::atomic_write(&manifest_path()?, &bytes)
}

fn namespace_state(
    payload: &ManifestPayload,
    namespace: SecurityKeyNamespace,
) -> Option<&NamespaceRotationState> {
    payload
        .namespaces
        .iter()
        .find(|state| state.namespace == namespace)
}

fn namespace_state_mut(
    payload: &mut ManifestPayload,
    namespace: SecurityKeyNamespace,
) -> Option<&mut NamespaceRotationState> {
    payload
        .namespaces
        .iter_mut()
        .find(|state| state.namespace == namespace)
}

fn append_generation(
    payload: &mut ManifestPayload,
    namespace: SecurityKeyNamespace,
    generation: u32,
    account: &str,
    root: &[u8; KEY_SIZE],
    integrity_key: &[u8; KEY_SIZE],
) -> Result<(), KeyVaultError> {
    if generation == 0 || account != generation_account(namespace, generation) {
        return Err(KeyVaultError::IntegrityFailed);
    }
    let previous_commitment = namespace_state(payload, namespace)
        .and_then(|state| state.records.last())
        .map(|record| record.commitment)
        .unwrap_or([0u8; 32]);
    if let Some(state) = namespace_state(payload, namespace) {
        if generation != state.current_generation.saturating_add(1) {
            return Err(KeyVaultError::IntegrityFailed);
        }
    } else if generation != 1 {
        return Err(KeyVaultError::IntegrityFailed);
    }
    let root_fingerprint = hash_blake3(root);
    let commitment = generation_commitment(
        namespace,
        generation,
        account,
        &root_fingerprint,
        &previous_commitment,
        integrity_key,
    )?;
    let record = RotationGenerationRecord {
        namespace,
        generation,
        root_account: account.to_owned(),
        root_fingerprint_blake3: root_fingerprint,
        previous_commitment,
        commitment,
    };
    if let Some(state) = namespace_state_mut(payload, namespace) {
        state.current_generation = generation;
        state.records.push(record);
    } else {
        payload.namespaces.push(NamespaceRotationState {
            namespace,
            current_generation: generation,
            records: vec![record],
        });
    }
    Ok(())
}

fn verify_payload(
    payload: &ManifestPayload,
    integrity_key: &[u8; KEY_SIZE],
) -> Result<(), KeyVaultError> {
    if payload.namespaces.len() > 3 {
        return Err(KeyVaultError::IntegrityFailed);
    }
    let mut seen = std::collections::HashSet::new();
    for state in &payload.namespaces {
        if !seen.insert(state.namespace)
            || state.records.is_empty()
            || state.records.len() > MAX_GENERATIONS_PER_NAMESPACE
            || state.current_generation != state.records.len() as u32
        {
            return Err(KeyVaultError::IntegrityFailed);
        }
        let mut previous = [0u8; 32];
        for (index, record) in state.records.iter().enumerate() {
            let expected_generation = index as u32 + 1;
            if record.namespace != state.namespace
                || record.generation != expected_generation
                || record.root_account != generation_account(state.namespace, expected_generation)
                || record.previous_commitment != previous
            {
                return Err(KeyVaultError::IntegrityFailed);
            }
            let expected = generation_commitment(
                record.namespace,
                record.generation,
                &record.root_account,
                &record.root_fingerprint_blake3,
                &record.previous_commitment,
                integrity_key,
            )?;
            if !vgt_crypto::constant_time_eq(&expected, &record.commitment) {
                return Err(KeyVaultError::IntegrityFailed);
            }
            previous = record.commitment;
        }
    }
    Ok(())
}

fn generation_commitment(
    namespace: SecurityKeyNamespace,
    generation: u32,
    account: &str,
    root_fingerprint: &[u8; 32],
    previous_commitment: &[u8; 32],
    integrity_key: &[u8; KEY_SIZE],
) -> Result<[u8; 32], KeyVaultError> {
    let mut mac =
        HmacSha256::new_from_slice(integrity_key).map_err(|_| KeyVaultError::IntegrityFailed)?;
    mac.update(b"VGT/KEYVAULT/ROTATION-HISTORY/v1\0");
    mac.update(namespace.label().as_bytes());
    mac.update(&generation.to_be_bytes());
    mac.update(&(account.len() as u32).to_be_bytes());
    mac.update(account.as_bytes());
    mac.update(root_fingerprint);
    mac.update(previous_commitment);
    let bytes = mac.finalize().into_bytes();
    let mut output = [0u8; 32];
    output.copy_from_slice(&bytes);
    Ok(output)
}

fn manifest_mac(
    payload: &ManifestPayload,
    integrity_key: &[u8; KEY_SIZE],
) -> Result<[u8; 32], KeyVaultError> {
    let encoded = serde_json::to_vec(payload).map_err(|_| KeyVaultError::IntegrityFailed)?;
    let mut mac =
        HmacSha256::new_from_slice(integrity_key).map_err(|_| KeyVaultError::IntegrityFailed)?;
    mac.update(b"VGT/KEYVAULT/ROTATION-MANIFEST/v1\0");
    mac.update(&encoded);
    let bytes = mac.finalize().into_bytes();
    let mut output = [0u8; 32];
    output.copy_from_slice(&bytes);
    Ok(output)
}

fn generation_account(namespace: SecurityKeyNamespace, generation: u32) -> String {
    format!(
        "workspace-history-{}-g{generation:010}",
        namespace.label().replace('-', "_")
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::{self, OpenOptions};
    use std::io::Write;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use vgt_crypto::{decrypt_aes_gcm, encrypt_aes_gcm};

    static TEST_DIRECTORY_COUNTER: AtomicUsize = AtomicUsize::new(0);

    struct TestDirectory(std::path::PathBuf);

    impl TestDirectory {
        fn new() -> Self {
            loop {
                let counter = TEST_DIRECTORY_COUNTER.fetch_add(1, Ordering::Relaxed);
                let path = std::env::temp_dir().join(format!(
                    "vgt-keyvault-rotation-history-{}-{counter}",
                    std::process::id()
                ));
                match fs::create_dir(&path) {
                    Ok(()) => return Self(path),
                    Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
                    Err(error) => panic!("create isolated test directory: {error}"),
                }
            }
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn authenticated_empty_manifest(integrity_key: &[u8; KEY_SIZE]) -> AuthenticatedManifest {
        let payload = ManifestPayload::default();
        AuthenticatedManifest {
            version: MANIFEST_VERSION,
            hmac_sha256: manifest_mac(&payload, integrity_key).expect("manifest MAC"),
            payload,
        }
    }

    #[test]
    fn sec017_generation_one_survives_ten_rotations() {
        let integrity_key = [0x71; KEY_SIZE];
        let namespace = SecurityKeyNamespace::Standard;
        let mut payload = ManifestPayload::default();
        let generation_one_root = [0x11; KEY_SIZE];
        let account = generation_account(namespace, 1);
        append_generation(
            &mut payload,
            namespace,
            1,
            &account,
            &generation_one_root,
            &integrity_key,
        )
        .unwrap();
        let aad = b"sec017-generation-one-document";
        let (ciphertext, nonce) =
            encrypt_aes_gcm(b"generation-one-readable", &generation_one_root, aad).unwrap();

        let mut roots = vec![generation_one_root];
        for generation in 2..=11 {
            let root = [generation as u8; KEY_SIZE];
            let account = generation_account(namespace, generation);
            append_generation(
                &mut payload,
                namespace,
                generation,
                &account,
                &root,
                &integrity_key,
            )
            .unwrap();
            roots.push(root);
        }
        verify_payload(&payload, &integrity_key).unwrap();
        assert_eq!(
            namespace_state(&payload, namespace)
                .unwrap()
                .current_generation,
            11
        );
        let opened = decrypt_aes_gcm(&ciphertext, &nonce, &roots[0], aad).unwrap();
        assert_eq!(opened, b"generation-one-readable");
    }

    #[test]
    fn sec017_deleting_middle_generation_breaks_chain() {
        let integrity_key = [0x72; KEY_SIZE];
        let namespace = SecurityKeyNamespace::Pqc;
        let mut payload = ManifestPayload::default();
        for generation in 1..=4 {
            let root = [generation as u8; KEY_SIZE];
            let account = generation_account(namespace, generation);
            append_generation(
                &mut payload,
                namespace,
                generation,
                &account,
                &root,
                &integrity_key,
            )
            .unwrap();
        }
        namespace_state_mut(&mut payload, namespace)
            .unwrap()
            .records
            .remove(1);
        assert!(verify_payload(&payload, &integrity_key).is_err());
    }

    #[test]
    fn manifest_file_cap_accepts_exact_limit_and_rejects_oversize() {
        let directory = TestDirectory::new();
        let path = directory.0.join(MANIFEST_FILE);
        let integrity_key = [0x93; KEY_SIZE];
        let manifest_bytes = serde_json::to_vec(&authenticated_empty_manifest(&integrity_key))
            .expect("serialize authenticated manifest");
        assert!(manifest_bytes.len() < MAX_MANIFEST_BYTES);

        let mut file = File::create(&path).expect("create manifest fixture");
        file.write_all(&manifest_bytes)
            .expect("write manifest body");
        let padding_len = MAX_MANIFEST_BYTES - manifest_bytes.len();
        let padding = vec![b' '; padding_len];
        file.write_all(&padding)
            .expect("pad manifest to exact limit");
        file.sync_all().expect("sync exact-limit manifest");
        drop(file);

        assert_eq!(
            fs::metadata(&path).expect("exact-limit metadata").len(),
            MAX_MANIFEST_BYTES as u64
        );
        assert_eq!(
            load_verified_payload_from_path(&path, &integrity_key)
                .expect("load exact-limit manifest"),
            ManifestPayload::default()
        );

        let file = OpenOptions::new()
            .write(true)
            .open(&path)
            .expect("reopen manifest fixture");
        file.set_len(MAX_MANIFEST_BYTES as u64 + 1)
            .expect("extend manifest over limit");
        assert!(matches!(
            load_verified_payload_from_path(&path, &integrity_key),
            Err(KeyVaultError::IntegrityFailed)
        ));
    }

    #[test]
    fn manifest_verification_survives_4096_bounded_mutations() {
        const CASES: usize = 4_096;
        const ACCEPTED_CASES: usize = CASES / 8;
        const MAX_CASE_BYTES: usize = 1_024;

        let integrity_key = [0x94; KEY_SIZE];
        let valid = serde_json::to_vec(&authenticated_empty_manifest(&integrity_key))
            .expect("serialize authenticated manifest");
        assert!(valid.len() <= MAX_CASE_BYTES);
        let mut accepted = 0usize;
        let mut rejected = 0usize;

        for case_index in 0..CASES {
            let family = case_index % 8;
            let variant = case_index / 8;
            let (input, expected_acceptance) = match family {
                0 => (valid.clone(), true),
                1 => {
                    let mut manifest = authenticated_empty_manifest(&integrity_key);
                    manifest.version = MANIFEST_VERSION + 1;
                    (
                        serde_json::to_vec(&manifest).expect("serialize version mutation"),
                        false,
                    )
                }
                2 => {
                    let mut manifest = authenticated_empty_manifest(&integrity_key);
                    let byte_index = variant % manifest.hmac_sha256.len();
                    manifest.hmac_sha256[byte_index] ^= 1 << (variant % 8);
                    (
                        serde_json::to_vec(&manifest).expect("serialize MAC mutation"),
                        false,
                    )
                }
                3 => (b"{".to_vec(), false),
                4 => (valid[..valid.len() - 1].to_vec(), false),
                5 => {
                    let mut bytes = valid.clone();
                    bytes.extend_from_slice(b"!");
                    (bytes, false)
                }
                6 => {
                    let mut bytes = valid[..valid.len() - 1].to_vec();
                    bytes.extend_from_slice(b",\"version\":1}");
                    (bytes, false)
                }
                _ => (
                    b"{\"version\":1,\"payload\":[],\"hmac_sha256\":[]}".to_vec(),
                    false,
                ),
            };

            assert!(
                input.len() <= MAX_CASE_BYTES,
                "case {case_index} exceeded corpus cap"
            );
            let outcome = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                load_verified_payload_from_bytes(&input, &integrity_key)
            }));
            let outcome =
                outcome.unwrap_or_else(|_| panic!("manifest parser panicked on case {case_index}"));
            match outcome {
                Ok(payload) => {
                    accepted += 1;
                    assert!(
                        expected_acceptance,
                        "invalid manifest case {case_index} accepted"
                    );
                    assert_eq!(payload, ManifestPayload::default());
                }
                Err(KeyVaultError::IntegrityFailed) => {
                    rejected += 1;
                    assert!(
                        !expected_acceptance,
                        "valid manifest case {case_index} rejected"
                    );
                }
                Err(error) => panic!("case {case_index} returned unclassified error: {error:?}"),
            }
        }

        assert_eq!(accepted, ACCEPTED_CASES);
        assert_eq!(rejected, CASES - ACCEPTED_CASES);
        assert_eq!(accepted + rejected, CASES);
    }
}
