use crate::{
    audit::KeyVaultAuditAction, domain::SecurityKeyNamespace, platform::memory::LockedKey,
    KeyVaultError, VgtKeyVault,
};
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};
use vgt_crypto::{generate_random_bytes, hash_blake3, KEY_SIZE};

const MAX_RECOVERY_RECIPIENTS: usize = 32;
pub const BREAK_GLASS_THRESHOLD: u8 = 3;
pub const BREAK_GLASS_SHARE_COUNT: u8 = 5;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum RecoveryMode {
    Disabled,
    ExplicitUserExport,
    ExplicitEnterpriseRecipient,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RecoveryPolicy {
    pub namespace: SecurityKeyNamespace,
    pub mode: RecoveryMode,
    pub recipient_fingerprints: Vec<[u8; 32]>,
    pub require_separate_artifact: bool,
    #[serde(default)]
    pub explicit_opt_in: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RecoveryArtifactDescriptor {
    pub version: u8,
    pub namespace: SecurityKeyNamespace,
    pub artifact_id: String,
    pub created_unix: u64,
    pub policy_digest_blake3: [u8; 32],
    pub contains_cross_domain_material: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BreakGlassShare {
    pub version: u8,
    pub namespace: SecurityKeyNamespace,
    pub x: u8,
    pub threshold: u8,
    pub share_count: u8,
    pub bytes: [u8; KEY_SIZE],
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BreakGlassRecoveryReceipt {
    pub version: u8,
    pub namespace: SecurityKeyNamespace,
    pub recovered_with_shares: u8,
    pub root_fingerprint_blake3: [u8; 32],
}

fn gf_mul(mut a: u8, mut b: u8) -> u8 {
    let mut product = 0u8;
    for _ in 0..8 {
        if b & 1 != 0 {
            product ^= a;
        }
        let high = a & 0x80;
        a <<= 1;
        if high != 0 {
            a ^= 0x1b;
        }
        b >>= 1;
    }
    product
}

fn gf_pow(mut base: u8, mut exponent: u8) -> u8 {
    let mut result = 1u8;
    while exponent != 0 {
        if exponent & 1 != 0 {
            result = gf_mul(result, base);
        }
        base = gf_mul(base, base);
        exponent >>= 1;
    }
    result
}

fn gf_inv(value: u8) -> Result<u8, KeyVaultError> {
    if value == 0 {
        return Err(KeyVaultError::IntegrityFailed);
    }
    Ok(gf_pow(value, 254))
}

fn split_secret_3_of_5(
    namespace: SecurityKeyNamespace,
    secret: &[u8; KEY_SIZE],
) -> Vec<BreakGlassShare> {
    let coeff_a = generate_random_bytes::<KEY_SIZE>();
    let coeff_b = generate_random_bytes::<KEY_SIZE>();
    (1..=BREAK_GLASS_SHARE_COUNT)
        .map(|x| {
            let mut bytes = [0u8; KEY_SIZE];
            for index in 0..KEY_SIZE {
                let linear = gf_mul(coeff_a[index], x);
                let quadratic = gf_mul(coeff_b[index], gf_mul(x, x));
                bytes[index] = secret[index] ^ linear ^ quadratic;
            }
            BreakGlassShare {
                version: 1,
                namespace,
                x,
                threshold: BREAK_GLASS_THRESHOLD,
                share_count: BREAK_GLASS_SHARE_COUNT,
                bytes,
            }
        })
        .collect()
}

fn reconstruct_secret_3_of_5(
    namespace: SecurityKeyNamespace,
    shares: &[BreakGlassShare],
) -> Result<[u8; KEY_SIZE], KeyVaultError> {
    if shares.len() < BREAK_GLASS_THRESHOLD as usize {
        return Err(KeyVaultError::PolicyViolation);
    }
    let selected = &shares[..BREAK_GLASS_THRESHOLD as usize];
    let mut seen = [false; 256];
    for share in selected {
        if share.version != 1
            || share.namespace != namespace
            || share.x == 0
            || share.threshold != BREAK_GLASS_THRESHOLD
            || share.share_count != BREAK_GLASS_SHARE_COUNT
            || seen[share.x as usize]
        {
            return Err(KeyVaultError::IntegrityFailed);
        }
        seen[share.x as usize] = true;
    }

    let mut secret = [0u8; KEY_SIZE];
    for (byte_index, secret_byte) in secret.iter_mut().enumerate() {
        let mut value = 0u8;
        for (i, share_i) in selected.iter().enumerate() {
            let xi = share_i.x;
            let mut numerator = 1u8;
            let mut denominator = 1u8;
            for (j, share_j) in selected.iter().enumerate() {
                if i == j {
                    continue;
                }
                let xj = share_j.x;
                numerator = gf_mul(numerator, xj);
                denominator = gf_mul(denominator, xi ^ xj);
            }
            let basis = gf_mul(numerator, gf_inv(denominator)?);
            value ^= gf_mul(share_i.bytes[byte_index], basis);
        }
        *secret_byte = value;
    }
    Ok(secret)
}

impl RecoveryPolicy {
    pub fn validate(&self) -> Result<(), KeyVaultError> {
        if self.recipient_fingerprints.len() > MAX_RECOVERY_RECIPIENTS {
            return Err(KeyVaultError::PolicyViolation);
        }
        match self.mode {
            RecoveryMode::Disabled
                if self.explicit_opt_in || !self.recipient_fingerprints.is_empty() =>
            {
                Err(KeyVaultError::PolicyViolation)
            }
            RecoveryMode::ExplicitUserExport if !self.explicit_opt_in => {
                Err(KeyVaultError::PolicyViolation)
            }
            RecoveryMode::ExplicitEnterpriseRecipient
                if !self.explicit_opt_in
                    || self.recipient_fingerprints.is_empty()
                    || !self.require_separate_artifact =>
            {
                Err(KeyVaultError::PolicyViolation)
            }
            _ => Ok(()),
        }
    }
}

impl VgtKeyVault {
    pub fn create_break_glass_shares(
        &mut self,
        namespace: SecurityKeyNamespace,
    ) -> Result<Vec<BreakGlassShare>, KeyVaultError> {
        let shares = {
            let root = self.domain_root(namespace)?;
            split_secret_3_of_5(namespace, root)
        };
        self.audit_slot_event(
            &format!("keyvault:breakglass:{}", namespace.label()),
            KeyVaultAuditAction::BreakGlassSharesCreated,
            None,
            None,
            true,
            "KEYVAULT_BREAKGLASS_SHARES_CREATED",
        )?;
        Ok(shares)
    }

    pub fn recover_break_glass_root(
        &mut self,
        namespace: SecurityKeyNamespace,
        shares: &[BreakGlassShare],
    ) -> Result<BreakGlassRecoveryReceipt, KeyVaultError> {
        if namespace == SecurityKeyNamespace::VgtTopSecret {
            return Err(KeyVaultError::PolicyViolation);
        }
        let recovered = reconstruct_secret_3_of_5(namespace, shares)?;
        let fingerprint = hash_blake3(&recovered);
        let persist = match namespace {
            SecurityKeyNamespace::Standard => {
                crate::storage::save_persistent_wmk(&recovered)?;
                self.workspace_master_key = Some(LockedKey::new(recovered)?);
                self.is_unlocked = true;
                Ok(())
            }
            SecurityKeyNamespace::Pqc => {
                crate::storage::save_persistent_secret(
                    crate::storage::PQC_ROOT_ACCOUNT,
                    &recovered,
                )?;
                self.pqc_root = Some(LockedKey::new(recovered)?);
                Ok(())
            }
            SecurityKeyNamespace::VgtTopSecret => Err(KeyVaultError::PolicyViolation),
        };
        persist?;
        self.audit_slot_event(
            &format!("keyvault:breakglass:{}", namespace.label()),
            KeyVaultAuditAction::BreakGlassRecovered,
            None,
            None,
            true,
            "KEYVAULT_BREAKGLASS_RECOVERED",
        )?;
        Ok(BreakGlassRecoveryReceipt {
            version: 1,
            namespace,
            recovered_with_shares: BREAK_GLASS_THRESHOLD,
            root_fingerprint_blake3: fingerprint,
        })
    }

    pub fn create_recovery_artifact_descriptor(
        &self,
        policy: &RecoveryPolicy,
    ) -> Result<RecoveryArtifactDescriptor, KeyVaultError> {
        policy.validate()?;
        if policy.mode == RecoveryMode::Disabled || !policy.require_separate_artifact {
            return Err(KeyVaultError::PolicyViolation);
        }
        let canonical = serde_json::to_vec(policy).map_err(|_| KeyVaultError::IntegrityFailed)?;
        Ok(RecoveryArtifactDescriptor {
            version: 1,
            namespace: policy.namespace,
            artifact_id: random_artifact_id(),
            created_unix: unix_now(),
            policy_digest_blake3: hash_blake3(&canonical),
            // Design invariant: one recovery artifact may carry one domain only.
            contains_cross_domain_material: false,
        })
    }

    pub fn validate_recovery_artifact(
        &self,
        descriptor: &RecoveryArtifactDescriptor,
        expected_namespace: SecurityKeyNamespace,
    ) -> Result<(), KeyVaultError> {
        if descriptor.version != 1
            || descriptor.namespace != expected_namespace
            || descriptor.contains_cross_domain_material
            || descriptor.artifact_id.len() != 32
            || !descriptor
                .artifact_id
                .bytes()
                .all(|byte| byte.is_ascii_hexdigit())
        {
            return Err(KeyVaultError::PolicyViolation);
        }
        Ok(())
    }
}

fn random_artifact_id() -> String {
    let bytes = generate_random_bytes::<16>();
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut output = String::with_capacity(32);
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

#[cfg(test)]
mod break_glass_tests {
    use super::*;

    #[test]
    fn sec016_two_of_five_cannot_reconstruct() {
        let secret = [0xA7; KEY_SIZE];
        let shares = split_secret_3_of_5(SecurityKeyNamespace::Standard, &secret);
        assert!(matches!(
            reconstruct_secret_3_of_5(SecurityKeyNamespace::Standard, &shares[..2]),
            Err(KeyVaultError::PolicyViolation)
        ));
    }

    #[test]
    fn sec016_three_of_five_reconstructs_exact_secret() {
        let secret = generate_random_bytes::<KEY_SIZE>();
        let shares = split_secret_3_of_5(SecurityKeyNamespace::Pqc, &secret);
        for indices in [[0usize, 1, 2], [0, 2, 4], [1, 3, 4]] {
            let subset = [
                shares[indices[0]].clone(),
                shares[indices[1]].clone(),
                shares[indices[2]].clone(),
            ];
            assert_eq!(
                reconstruct_secret_3_of_5(SecurityKeyNamespace::Pqc, &subset).unwrap(),
                secret
            );
        }
    }

    #[test]
    fn sec016_duplicate_or_cross_domain_shares_fail_closed() {
        let secret = [0x5C; KEY_SIZE];
        let shares = split_secret_3_of_5(SecurityKeyNamespace::Standard, &secret);
        let duplicate = [shares[0].clone(), shares[0].clone(), shares[1].clone()];
        assert!(reconstruct_secret_3_of_5(SecurityKeyNamespace::Standard, &duplicate).is_err());
        assert!(reconstruct_secret_3_of_5(SecurityKeyNamespace::Pqc, &shares[..3]).is_err());
    }
}
