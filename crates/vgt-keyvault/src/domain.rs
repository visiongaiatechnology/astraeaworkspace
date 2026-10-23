// STATUS: DIAMANT VGT SUPREME
//! Cryptographic domain isolation for security profiles and administrative authority.
//! Personal and enterprise authority domains use independently generated roots and
//! independent authenticated capability tokens. No authority token is implicitly
//! transferable across domains.

use crate::{
    audit::KeyVaultAuditAction, platform::memory::LockedKey, storage, KeyVaultError, VgtKeyVault,
};
use serde::{Deserialize, Serialize};
use vgt_crypto::{
    decrypt_aes_gcm, encrypt_aes_gcm, generate_random_bytes, zeroize_best_effort, KEY_SIZE,
    NONCE_SIZE,
};

const MAX_DOMAIN_SECRET_BYTES: usize = 1024 * 1024;
const MAX_DOMAIN_SCOPE_BYTES: usize = 192;
const MAX_AUTH_SUBJECT_BYTES: usize = 192;
const AUTH_SENTINEL: &[u8] = b"VGT-DOMAIN-AUTHORIZED-V1";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum SecurityKeyNamespace {
    Standard,
    Pqc,
    VgtTopSecret,
}

impl SecurityKeyNamespace {
    pub fn label(self) -> &'static str {
        match self {
            Self::Standard => "standard",
            Self::Pqc => "pqc",
            Self::VgtTopSecret => "vgt-top-secret",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum AuthorityDomain {
    PersonalDomain,
    EnterpriseDomain,
}

impl AuthorityDomain {
    pub const fn label(self) -> &'static str {
        match self {
            Self::PersonalDomain => "personal",
            Self::EnterpriseDomain => "enterprise",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SealedDomainSecret {
    pub version: u8,
    pub namespace: SecurityKeyNamespace,
    #[serde(default = "default_key_generation")]
    pub key_generation: u32,
    pub nonce: [u8; NONCE_SIZE],
    pub ciphertext: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SealedAuthorityDomainSecret {
    pub version: u8,
    pub domain: AuthorityDomain,
    pub nonce: [u8; NONCE_SIZE],
    pub ciphertext: Vec<u8>,
}

/// Opaque cryptographic proof that authentication for exactly one authority domain
/// was completed by the caller's trusted authentication boundary. The token carries
/// no key bytes and cannot authorize the other domain.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DomainAuthorizationToken {
    version: u8,
    domain: AuthorityDomain,
    nonce: [u8; NONCE_SIZE],
    ciphertext: Vec<u8>,
}

impl DomainAuthorizationToken {
    pub const fn domain(&self) -> AuthorityDomain {
        self.domain
    }
}

impl VgtKeyVault {
    pub(crate) fn domain_root(
        &mut self,
        namespace: SecurityKeyNamespace,
    ) -> Result<&[u8; KEY_SIZE], KeyVaultError> {
        match namespace {
            SecurityKeyNamespace::Standard => self.workspace_root(),
            SecurityKeyNamespace::Pqc => {
                if self.pqc_root.is_none() {
                    self.require_provider(crate::ProviderRequirement::NativeSecurePersistence)?;
                    let loaded = crate::rotation_history::load_or_create_current_root(
                        SecurityKeyNamespace::Pqc,
                        storage::PQC_ROOT_ACCOUNT,
                    )?;
                    self.pqc_root = Some(LockedKey::new(loaded.root)?);
                }
                self.pqc_root
                    .as_ref()
                    .map(LockedKey::as_bytes)
                    .ok_or(KeyVaultError::VaultLocked)
            }
            SecurityKeyNamespace::VgtTopSecret => self
                .top_secret_root
                .as_ref()
                .map(LockedKey::as_bytes)
                .ok_or(KeyVaultError::TopSecretLocked),
        }
    }

    pub(crate) fn authority_domain_root(
        &mut self,
        domain: AuthorityDomain,
    ) -> Result<&[u8; KEY_SIZE], KeyVaultError> {
        let missing = match domain {
            AuthorityDomain::PersonalDomain => self.personal_domain_root.is_none(),
            AuthorityDomain::EnterpriseDomain => self.enterprise_domain_root.is_none(),
        };
        if missing {
            self.require_provider(crate::ProviderRequirement::NativeSecurePersistence)?;
            let account = match domain {
                AuthorityDomain::PersonalDomain => storage::PERSONAL_DOMAIN_ROOT_ACCOUNT,
                AuthorityDomain::EnterpriseDomain => storage::ENTERPRISE_DOMAIN_ROOT_ACCOUNT,
            };
            let root = match storage::load_persistent_secret(account)? {
                Some(existing) => existing,
                None => {
                    let fresh = generate_random_bytes::<KEY_SIZE>();
                    storage::save_persistent_secret(account, &fresh)?;
                    fresh
                }
            };
            let protected = LockedKey::new(root)?;
            match domain {
                AuthorityDomain::PersonalDomain => self.personal_domain_root = Some(protected),
                AuthorityDomain::EnterpriseDomain => self.enterprise_domain_root = Some(protected),
            }
        }
        match domain {
            AuthorityDomain::PersonalDomain => self.personal_domain_root.as_ref(),
            AuthorityDomain::EnterpriseDomain => self.enterprise_domain_root.as_ref(),
        }
        .map(LockedKey::as_bytes)
        .ok_or(KeyVaultError::VaultLocked)
    }

    pub fn seal_domain_secret(
        &mut self,
        namespace: SecurityKeyNamespace,
        scope: &str,
        secret: &[u8],
    ) -> Result<SealedDomainSecret, KeyVaultError> {
        if secret.is_empty() || secret.len() > MAX_DOMAIN_SECRET_BYTES {
            return Err(KeyVaultError::InvalidCredentialFormat);
        }
        let root = self.domain_root(namespace)?;
        let key_generation = match namespace {
            SecurityKeyNamespace::VgtTopSecret => 1,
            _ => crate::rotation_history::current_generation(namespace)?.unwrap_or(1),
        };
        let aad = domain_aad(namespace, scope, key_generation)?;
        let result =
            encrypt_aes_gcm(secret, root, &aad).map(|(ciphertext, nonce)| SealedDomainSecret {
                version: 1,
                namespace,
                key_generation,
                nonce,
                ciphertext,
            });
        let result = result.map_err(Into::into);
        self.audit_slot_event(
            &audit_resource("domain", namespace.label(), scope),
            KeyVaultAuditAction::DomainSecretSealed,
            None,
            None,
            result.is_ok(),
            if result.is_ok() {
                "KEYVAULT_DOMAIN_SEALED"
            } else {
                "KEYVAULT_DOMAIN_SEAL_REJECTED"
            },
        )?;
        result
    }

    pub fn unseal_domain_secret(
        &mut self,
        namespace: SecurityKeyNamespace,
        scope: &str,
        sealed: &SealedDomainSecret,
    ) -> Result<Vec<u8>, KeyVaultError> {
        if sealed.version != 1
            || sealed.namespace != namespace
            || sealed.ciphertext.is_empty()
            || sealed.ciphertext.len() > MAX_DOMAIN_SECRET_BYTES + 32
        {
            return Err(KeyVaultError::IntegrityFailed);
        }
        if sealed.key_generation == 0 {
            return Err(KeyVaultError::IntegrityFailed);
        }
        let aad = domain_aad(namespace, scope, sealed.key_generation)?;
        let result = if namespace == SecurityKeyNamespace::VgtTopSecret
            || sealed.key_generation == 1
                && crate::rotation_history::current_generation(namespace)?.is_none()
        {
            let root = self.domain_root(namespace)?;
            decrypt_aes_gcm(&sealed.ciphertext, &sealed.nonce, root, &aad)
        } else {
            let current = crate::rotation_history::current_generation(namespace)?
                .ok_or(KeyVaultError::IntegrityFailed)?;
            if sealed.key_generation == current {
                let root = self.domain_root(namespace)?;
                decrypt_aes_gcm(&sealed.ciphertext, &sealed.nonce, root, &aad)
            } else if sealed.key_generation < current {
                let root = crate::rotation_history::load_generation_root(
                    namespace,
                    sealed.key_generation,
                )?;
                let protected = LockedKey::new(root)?;
                decrypt_aes_gcm(
                    &sealed.ciphertext,
                    &sealed.nonce,
                    protected.as_bytes(),
                    &aad,
                )
            } else {
                return Err(KeyVaultError::IntegrityFailed);
            }
        };
        let result = result.map_err(|_| KeyVaultError::AuthenticationFailed);
        self.audit_slot_event(
            &audit_resource("domain", namespace.label(), scope),
            KeyVaultAuditAction::DomainSecretUnsealed,
            None,
            None,
            result.is_ok(),
            if result.is_ok() {
                "KEYVAULT_DOMAIN_UNSEALED"
            } else {
                "KEYVAULT_DOMAIN_UNSEAL_REJECTED"
            },
        )?;
        result
    }

    pub fn seal_authority_domain_secret(
        &mut self,
        domain: AuthorityDomain,
        scope: &str,
        secret: &[u8],
    ) -> Result<SealedAuthorityDomainSecret, KeyVaultError> {
        if secret.is_empty() || secret.len() > MAX_DOMAIN_SECRET_BYTES {
            return Err(KeyVaultError::InvalidCredentialFormat);
        }
        let root = self.authority_domain_root(domain)?;
        let aad = authority_domain_aad(domain, scope)?;
        let result = encrypt_aes_gcm(secret, root, &aad).map(|(ciphertext, nonce)| {
            SealedAuthorityDomainSecret {
                version: 1,
                domain,
                nonce,
                ciphertext,
            }
        });
        let result = result.map_err(Into::into);
        self.audit_slot_event(
            &audit_resource("authority", domain.label(), scope),
            KeyVaultAuditAction::DomainSecretSealed,
            None,
            None,
            result.is_ok(),
            if result.is_ok() {
                "KEYVAULT_AUTHORITY_SEALED"
            } else {
                "KEYVAULT_AUTHORITY_SEAL_REJECTED"
            },
        )?;
        result
    }

    pub fn unseal_authority_domain_secret(
        &mut self,
        domain: AuthorityDomain,
        scope: &str,
        sealed: &SealedAuthorityDomainSecret,
    ) -> Result<Vec<u8>, KeyVaultError> {
        if sealed.version != 1
            || sealed.domain != domain
            || sealed.ciphertext.is_empty()
            || sealed.ciphertext.len() > MAX_DOMAIN_SECRET_BYTES + 32
        {
            return Err(KeyVaultError::AuthenticationFailed);
        }
        let root = self.authority_domain_root(domain)?;
        let aad = authority_domain_aad(domain, scope)?;
        let result = decrypt_aes_gcm(&sealed.ciphertext, &sealed.nonce, root, &aad)
            .map_err(|_| KeyVaultError::AuthenticationFailed);
        self.audit_slot_event(
            &audit_resource("authority", domain.label(), scope),
            KeyVaultAuditAction::DomainSecretUnsealed,
            None,
            None,
            result.is_ok(),
            if result.is_ok() {
                "KEYVAULT_AUTHORITY_UNSEALED"
            } else {
                "KEYVAULT_AUTHORITY_UNSEAL_REJECTED"
            },
        )?;
        result
    }

    /// Mints a domain-bound authorization capability after the trusted caller has
    /// completed its own user/admin authentication ceremony. This method does not
    /// accept a target domain different from the token domain during verification.
    pub fn mint_domain_authorization_token(
        &mut self,
        domain: AuthorityDomain,
        subject: &str,
    ) -> Result<DomainAuthorizationToken, KeyVaultError> {
        validate_subject(subject)?;
        let root = self.authority_domain_root(domain)?;
        let aad = authorization_aad(domain, subject);
        let result = encrypt_aes_gcm(AUTH_SENTINEL, root, &aad).map(|(ciphertext, nonce)| {
            DomainAuthorizationToken {
                version: 1,
                domain,
                nonce,
                ciphertext,
            }
        });
        let result = result.map_err(Into::into);
        self.audit_slot_event(
            &audit_resource("authorization", domain.label(), subject),
            KeyVaultAuditAction::AuthorizationMinted,
            None,
            None,
            result.is_ok(),
            if result.is_ok() {
                "KEYVAULT_AUTH_MINTED"
            } else {
                "KEYVAULT_AUTH_MINT_REJECTED"
            },
        )?;
        result
    }

    pub fn validate_domain_authorization_token(
        &mut self,
        expected_domain: AuthorityDomain,
        subject: &str,
        token: &DomainAuthorizationToken,
    ) -> Result<(), KeyVaultError> {
        validate_subject(subject)?;
        if token.version != 1 || token.domain != expected_domain || token.ciphertext.is_empty() {
            return Err(KeyVaultError::AuthenticationFailed);
        }
        let root = self.authority_domain_root(expected_domain)?;
        let aad = authorization_aad(expected_domain, subject);
        let mut opened = decrypt_aes_gcm(&token.ciphertext, &token.nonce, root, &aad)
            .map_err(|_| KeyVaultError::AuthenticationFailed)?;
        let valid = opened.as_slice() == AUTH_SENTINEL;
        zeroize_best_effort(&mut opened);
        let result = if valid {
            Ok(())
        } else {
            Err(KeyVaultError::AuthenticationFailed)
        };
        self.audit_slot_event(
            &audit_resource("authorization", expected_domain.label(), subject),
            KeyVaultAuditAction::AuthorizationVerified,
            None,
            None,
            result.is_ok(),
            if result.is_ok() {
                "KEYVAULT_AUTH_VERIFIED"
            } else {
                "KEYVAULT_AUTH_VERIFY_REJECTED"
            },
        )?;
        result
    }

    /// Cross-domain movement is never implicit: both independently authenticated
    /// domains must authorize the same operation before a higher layer may rewrap data.
    pub fn authorize_cross_domain_transfer(
        &mut self,
        personal_subject: &str,
        personal_token: &DomainAuthorizationToken,
        enterprise_subject: &str,
        enterprise_token: &DomainAuthorizationToken,
    ) -> Result<(), KeyVaultError> {
        self.validate_domain_authorization_token(
            AuthorityDomain::PersonalDomain,
            personal_subject,
            personal_token,
        )?;
        self.validate_domain_authorization_token(
            AuthorityDomain::EnterpriseDomain,
            enterprise_subject,
            enterprise_token,
        )?;
        Ok(())
    }
}

fn domain_aad(
    namespace: SecurityKeyNamespace,
    scope: &str,
    key_generation: u32,
) -> Result<Vec<u8>, KeyVaultError> {
    validate_scope(scope)?;
    if key_generation == 0 {
        return Err(KeyVaultError::IntegrityFailed);
    }
    Ok(format!(
        "VGT/KEYVAULT/DOMAIN/v1/{}/{key_generation}/{}",
        namespace.label(),
        scope
    )
    .into_bytes())
}

const fn default_key_generation() -> u32 {
    1
}

fn authority_domain_aad(domain: AuthorityDomain, scope: &str) -> Result<Vec<u8>, KeyVaultError> {
    validate_scope(scope)?;
    Ok(format!(
        "VGT/KEYVAULT/AUTHORITY-DOMAIN/v1/{}/{}",
        domain.label(),
        scope
    )
    .into_bytes())
}

fn authorization_aad(domain: AuthorityDomain, subject: &str) -> Vec<u8> {
    format!(
        "VGT/KEYVAULT/AUTHORIZATION/v1/{}/{}",
        domain.label(),
        subject
    )
    .into_bytes()
}

fn audit_resource(kind: &str, domain: &str, subject: &str) -> String {
    // All inputs are bounded by the public validators; the composed audit identifier
    // remains below the DocumentCredentialRegistry 256-byte identifier limit.
    format!("keyvault:{kind}:{domain}:{subject}")
}

fn validate_scope(scope: &str) -> Result<(), KeyVaultError> {
    if scope.is_empty()
        || scope.len() > MAX_DOMAIN_SCOPE_BYTES
        || !scope.bytes().all(|byte| {
            byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b':' | b'.' | b'/')
        })
    {
        return Err(KeyVaultError::InvalidCredentialFormat);
    }
    Ok(())
}

fn validate_subject(subject: &str) -> Result<(), KeyVaultError> {
    if subject.is_empty()
        || subject.len() > MAX_AUTH_SUBJECT_BYTES
        || !subject.bytes().all(|byte| {
            byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b':' | b'.' | b'@' | b'/')
        })
    {
        return Err(KeyVaultError::InvalidCredentialFormat);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn isolated_vault() -> VgtKeyVault {
        let mut vault = VgtKeyVault::new();
        vault.personal_domain_root = Some(LockedKey::new([0x11; KEY_SIZE]).unwrap());
        vault.enterprise_domain_root = Some(LockedKey::new([0x22; KEY_SIZE]).unwrap());
        vault
    }

    #[test]
    fn sec011_enterprise_token_cannot_authorize_personal_domain() {
        let mut vault = isolated_vault();
        let enterprise = vault
            .mint_domain_authorization_token(AuthorityDomain::EnterpriseDomain, "enterprise-admin")
            .unwrap();
        assert!(matches!(
            vault.validate_domain_authorization_token(
                AuthorityDomain::PersonalDomain,
                "personal-owner",
                &enterprise,
            ),
            Err(KeyVaultError::AuthenticationFailed)
        ));
    }

    #[test]
    fn sec011_cross_domain_transfer_requires_both_domain_tokens() {
        let mut vault = isolated_vault();
        let personal = vault
            .mint_domain_authorization_token(AuthorityDomain::PersonalDomain, "personal-owner")
            .unwrap();
        let enterprise = vault
            .mint_domain_authorization_token(AuthorityDomain::EnterpriseDomain, "enterprise-admin")
            .unwrap();
        vault
            .authorize_cross_domain_transfer(
                "personal-owner",
                &personal,
                "enterprise-admin",
                &enterprise,
            )
            .unwrap();
        assert!(vault
            .authorize_cross_domain_transfer(
                "personal-owner",
                &enterprise,
                "enterprise-admin",
                &personal,
            )
            .is_err());
    }

    #[test]
    fn sec011_ciphertext_is_cryptographically_domain_bound() {
        let mut vault = isolated_vault();
        let sealed = vault
            .seal_authority_domain_secret(
                AuthorityDomain::PersonalDomain,
                "signing-key/test",
                b"personal-signing-material",
            )
            .unwrap();
        assert!(vault
            .unseal_authority_domain_secret(
                AuthorityDomain::EnterpriseDomain,
                "signing-key/test",
                &sealed,
            )
            .is_err());
        assert_eq!(
            vault
                .unseal_authority_domain_secret(
                    AuthorityDomain::PersonalDomain,
                    "signing-key/test",
                    &sealed,
                )
                .unwrap(),
            b"personal-signing-material"
        );
    }
}

#[cfg(test)]
mod sec020_domain_audit_tests {
    use super::*;

    #[test]
    fn sec020_key_accesses_emit_verifiable_chain() {
        let mut vault = VgtKeyVault::new();
        vault.personal_domain_root = Some(LockedKey::new([0x31; KEY_SIZE]).unwrap());
        let sealed = vault
            .seal_authority_domain_secret(
                AuthorityDomain::PersonalDomain,
                "audit/signing-key",
                b"non-exported-test-material",
            )
            .unwrap();
        vault
            .unseal_authority_domain_secret(
                AuthorityDomain::PersonalDomain,
                "audit/signing-key",
                &sealed,
            )
            .unwrap();
        let snapshot = vault.audit_chain_snapshot();
        assert_eq!(snapshot.records.len(), 2);
        assert_eq!(
            snapshot.records[0].action,
            KeyVaultAuditAction::DomainSecretSealed
        );
        assert_eq!(
            snapshot.records[1].action,
            KeyVaultAuditAction::DomainSecretUnsealed
        );
        vault.verify_audit_chain(&snapshot).unwrap();
    }
}
