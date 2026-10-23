//! Document key hierarchy for Astraea Workspace.
//!
//! Workspace/device master material is used only as wrapping material. Content and
//! metadata encryption use document-local random DEKs and domain-separated subkeys.

use serde::{Deserialize, Serialize};
use zeroize::ZeroizeOnDrop;

use crate::{
    decrypt_aes_gcm, derive_domain_subkey, encrypt_aes_gcm, generate_dek, generate_random_bytes,
    zeroize_best_effort, CryptoDomain, CryptoError, KEY_SIZE, NONCE_SIZE, SALT_SIZE,
};

pub const DOCUMENT_KEY_HIERARCHY_VERSION: u16 = 1;
pub const DOCUMENT_ID_BYTES: usize = 16;
pub const KEY_SLOT_ID_BYTES: usize = 16;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DocumentSubkeyPurpose {
    Content,
    Metadata,
    SearchIndex,
    RecipientEnvelope,
    FutureExtension,
}

impl DocumentSubkeyPurpose {
    const fn domain(self) -> CryptoDomain {
        match self {
            Self::Content => CryptoDomain::ContainerChunk,
            Self::Metadata => CryptoDomain::DocumentMetadata,
            Self::SearchIndex => CryptoDomain::SearchIndex,
            Self::RecipientEnvelope => CryptoDomain::RecipientEnvelope,
            Self::FutureExtension => CryptoDomain::FutureExtension,
        }
    }
}

/// In-memory document key hierarchy. Deliberately not Serialize/Deserialize/Debug/Clone:
/// callers must not accidentally persist or log the raw DEK.
#[derive(ZeroizeOnDrop)]
pub struct DocumentKeyHierarchy {
    document_id: [u8; DOCUMENT_ID_BYTES],
    dek: [u8; KEY_SIZE],
    derivation_salt: [u8; SALT_SIZE],
}

impl DocumentKeyHierarchy {
    pub fn generate(document_id: [u8; DOCUMENT_ID_BYTES]) -> Self {
        Self {
            document_id,
            dek: generate_dek(),
            derivation_salt: generate_random_bytes::<SALT_SIZE>(),
        }
    }

    pub fn from_existing_dek(
        document_id: [u8; DOCUMENT_ID_BYTES],
        dek: [u8; KEY_SIZE],
        derivation_salt: [u8; SALT_SIZE],
    ) -> Self {
        Self {
            document_id,
            dek,
            derivation_salt,
        }
    }

    pub const fn document_id(&self) -> [u8; DOCUMENT_ID_BYTES] {
        self.document_id
    }
    pub const fn derivation_salt(&self) -> [u8; SALT_SIZE] {
        self.derivation_salt
    }

    pub fn derive_subkey(
        &self,
        purpose: DocumentSubkeyPurpose,
        bounded_context: &[u8],
    ) -> Result<[u8; KEY_SIZE], CryptoError> {
        let mut context = Vec::with_capacity(DOCUMENT_ID_BYTES + bounded_context.len());
        context.extend_from_slice(&self.document_id);
        context.extend_from_slice(bounded_context);
        derive_domain_subkey(&self.dek, &self.derivation_salt, purpose.domain(), &context)
    }

    pub fn wrap_for_root(
        &self,
        root_wrapping_key: &[u8; KEY_SIZE],
        slot_id: [u8; KEY_SLOT_ID_BYTES],
    ) -> Result<WrappedDocumentDek, CryptoError> {
        wrap_document_dek(
            &self.dek,
            self.document_id,
            self.derivation_salt,
            root_wrapping_key,
            slot_id,
        )
    }
}

/// Serializable wrapped DEK. This structure never contains workspace/device root material.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct WrappedDocumentDek {
    pub version: u16,
    pub suite_version: u16,
    pub document_id: [u8; DOCUMENT_ID_BYTES],
    pub slot_id: [u8; KEY_SLOT_ID_BYTES],
    pub derivation_salt: [u8; SALT_SIZE],
    pub wrap_salt: [u8; SALT_SIZE],
    pub nonce: [u8; NONCE_SIZE],
    pub encrypted_dek: Vec<u8>,
}

fn wrapping_context(
    document_id: &[u8; DOCUMENT_ID_BYTES],
    slot_id: &[u8; KEY_SLOT_ID_BYTES],
) -> [u8; DOCUMENT_ID_BYTES + KEY_SLOT_ID_BYTES] {
    let mut context = [0u8; DOCUMENT_ID_BYTES + KEY_SLOT_ID_BYTES];
    context[..DOCUMENT_ID_BYTES].copy_from_slice(document_id);
    context[DOCUMENT_ID_BYTES..].copy_from_slice(slot_id);
    context
}

fn wrapped_dek_aad(
    version: u16,
    suite_version: u16,
    document_id: &[u8; DOCUMENT_ID_BYTES],
    slot_id: &[u8; KEY_SLOT_ID_BYTES],
    derivation_salt: &[u8; SALT_SIZE],
    wrap_salt: &[u8; SALT_SIZE],
) -> Vec<u8> {
    let mut aad =
        Vec::with_capacity(16 + 2 + 2 + DOCUMENT_ID_BYTES + KEY_SLOT_ID_BYTES + SALT_SIZE * 2);
    aad.extend_from_slice(b"VGT-WRAPPED-DEK\0");
    aad.extend_from_slice(&version.to_be_bytes());
    aad.extend_from_slice(&suite_version.to_be_bytes());
    aad.extend_from_slice(document_id);
    aad.extend_from_slice(slot_id);
    aad.extend_from_slice(derivation_salt);
    aad.extend_from_slice(wrap_salt);
    aad
}

pub fn wrap_document_dek(
    dek: &[u8; KEY_SIZE],
    document_id: [u8; DOCUMENT_ID_BYTES],
    derivation_salt: [u8; SALT_SIZE],
    root_wrapping_key: &[u8; KEY_SIZE],
    slot_id: [u8; KEY_SLOT_ID_BYTES],
) -> Result<WrappedDocumentDek, CryptoError> {
    let wrap_salt = generate_random_bytes::<SALT_SIZE>();
    let context = wrapping_context(&document_id, &slot_id);
    let mut wrap_key = derive_domain_subkey(
        root_wrapping_key,
        &wrap_salt,
        CryptoDomain::LocalKeySlot,
        &context,
    )?;
    let suite_version = crate::PRODUCTION_CRYPTO_SUITE_VERSION;
    let aad = wrapped_dek_aad(
        DOCUMENT_KEY_HIERARCHY_VERSION,
        suite_version,
        &document_id,
        &slot_id,
        &derivation_salt,
        &wrap_salt,
    );
    let encrypted = encrypt_aes_gcm(dek, &wrap_key, &aad);
    zeroize_best_effort(&mut wrap_key);
    let (encrypted_dek, nonce) = encrypted?;
    Ok(WrappedDocumentDek {
        version: DOCUMENT_KEY_HIERARCHY_VERSION,
        suite_version,
        document_id,
        slot_id,
        derivation_salt,
        wrap_salt,
        nonce,
        encrypted_dek,
    })
}

pub fn open_wrapped_document_dek(
    wrapped: &WrappedDocumentDek,
    root_wrapping_key: &[u8; KEY_SIZE],
) -> Result<DocumentKeyHierarchy, CryptoError> {
    if wrapped.version != DOCUMENT_KEY_HIERARCHY_VERSION {
        return Err(CryptoError::UnsupportedKeyHierarchyVersion(wrapped.version));
    }
    crate::crypto_suite(wrapped.suite_version)?;
    let context = wrapping_context(&wrapped.document_id, &wrapped.slot_id);
    let mut wrap_key = derive_domain_subkey(
        root_wrapping_key,
        &wrapped.wrap_salt,
        CryptoDomain::LocalKeySlot,
        &context,
    )?;
    let aad = wrapped_dek_aad(
        wrapped.version,
        wrapped.suite_version,
        &wrapped.document_id,
        &wrapped.slot_id,
        &wrapped.derivation_salt,
        &wrapped.wrap_salt,
    );
    let decrypted = decrypt_aes_gcm(&wrapped.encrypted_dek, &wrapped.nonce, &wrap_key, &aad);
    zeroize_best_effort(&mut wrap_key);
    let mut plaintext = decrypted?;
    if plaintext.len() != KEY_SIZE {
        zeroize_best_effort(&mut plaintext);
        return Err(CryptoError::DecryptionFailed);
    }
    let mut dek = [0u8; KEY_SIZE];
    dek.copy_from_slice(&plaintext);
    zeroize_best_effort(&mut plaintext);
    Ok(DocumentKeyHierarchy::from_existing_dek(
        wrapped.document_id,
        dek,
        wrapped.derivation_salt,
    ))
}

/// Rotate only wrapping material. Document content stays encrypted under the same DEK.
pub fn rewrap_document_dek(
    wrapped: &WrappedDocumentDek,
    previous_root: &[u8; KEY_SIZE],
    next_root: &[u8; KEY_SIZE],
    next_slot_id: [u8; KEY_SLOT_ID_BYTES],
) -> Result<WrappedDocumentDek, CryptoError> {
    let hierarchy = open_wrapped_document_dek(wrapped, previous_root)?;
    hierarchy.wrap_for_root(next_root, next_slot_id)
}
