use crate::{
    audit::KeyVaultAuditAction, domain::SecurityKeyNamespace, platform::memory::LockedKey, storage,
    KeyVaultError, VgtKeyVault,
};
use serde::{Deserialize, Serialize};
use vgt_crypto::{generate_random_bytes, hash_blake3};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
pub enum SecurityProfile {
    Standard,
    Pqc,
    VgtTopSecret,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ProfileTransitionPlan {
    pub version: u8,
    pub transition_id: String,
    pub from: SecurityProfile,
    pub to: SecurityProfile,
    pub requires_full_reseal: bool,
    pub requires_key_rewrap: bool,
    pub downgrade: bool,
    pub explicit_downgrade_approved: bool,
}

#[derive(Debug)]
pub struct ResealCommitProof {
    namespace: SecurityKeyNamespace,
    rewrapped_items: usize,
    operation_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RootRotationReceipt {
    pub namespace: SecurityKeyNamespace,
    pub operation_id: String,
    pub rewrapped_items: usize,
    pub previous_root_fingerprint_blake3: [u8; 32],
    pub new_root_fingerprint_blake3: [u8; 32],
}

impl VgtKeyVault {
    pub fn plan_profile_transition(
        &self,
        from: SecurityProfile,
        to: SecurityProfile,
        explicit_downgrade_approved: bool,
    ) -> Result<ProfileTransitionPlan, KeyVaultError> {
        if from == to {
            return Err(KeyVaultError::PolicyViolation);
        }
        let downgrade = to < from;
        if downgrade && !explicit_downgrade_approved {
            return Err(KeyVaultError::PolicyViolation);
        }
        Ok(ProfileTransitionPlan {
            version: 1,
            transition_id: random_operation_id(),
            from,
            to,
            requires_full_reseal: true,
            requires_key_rewrap: true,
            downgrade,
            explicit_downgrade_approved,
        })
    }

    pub fn validate_profile_transition_commit(
        &self,
        plan: &ProfileTransitionPlan,
        full_container_resealed: bool,
        key_material_rewrapped: bool,
    ) -> Result<(), KeyVaultError> {
        if plan.version != 1
            || !plan.requires_full_reseal
            || !plan.requires_key_rewrap
            || !full_container_resealed
            || !key_material_rewrapped
            || (plan.downgrade && !plan.explicit_downgrade_approved)
        {
            return Err(KeyVaultError::ResealRequired);
        }
        Ok(())
    }

    pub fn issue_reseal_commit_proof(
        &self,
        namespace: SecurityKeyNamespace,
        rewrapped_items: usize,
    ) -> Result<ResealCommitProof, KeyVaultError> {
        if rewrapped_items == 0 {
            return Err(KeyVaultError::ResealRequired);
        }
        Ok(ResealCommitProof {
            namespace,
            rewrapped_items,
            operation_id: random_operation_id(),
        })
    }

    pub fn rotate_persisted_domain_root(
        &mut self,
        proof: ResealCommitProof,
    ) -> Result<RootRotationReceipt, KeyVaultError> {
        if proof.namespace == SecurityKeyNamespace::VgtTopSecret {
            return Err(KeyVaultError::PolicyViolation);
        }
        let legacy_account = match proof.namespace {
            SecurityKeyNamespace::Standard => storage::STANDARD_ROOT_ACCOUNT,
            SecurityKeyNamespace::Pqc => storage::PQC_ROOT_ACCOUNT,
            SecurityKeyNamespace::VgtTopSecret => unreachable!(),
        };
        let (rotated, previous_fingerprint) =
            crate::rotation_history::rotate_current_root(proof.namespace, legacy_account)?;
        let new_fingerprint = hash_blake3(&rotated.root);
        match proof.namespace {
            SecurityKeyNamespace::Standard => {
                self.workspace_master_key = Some(LockedKey::new(rotated.root)?);
                self.is_unlocked = true;
            }
            SecurityKeyNamespace::Pqc => {
                self.pqc_root = Some(LockedKey::new(rotated.root)?);
            }
            SecurityKeyNamespace::VgtTopSecret => unreachable!(),
        }
        self.audit_slot_event(
            &format!("keyvault:rotation:{}", proof.namespace.label()),
            KeyVaultAuditAction::RootRotated,
            None,
            None,
            true,
            "KEYVAULT_ROOT_ROTATED",
        )?;
        Ok(RootRotationReceipt {
            namespace: proof.namespace,
            operation_id: proof.operation_id,
            rewrapped_items: proof.rewrapped_items,
            previous_root_fingerprint_blake3: previous_fingerprint,
            new_root_fingerprint_blake3: new_fingerprint,
        })
    }

    pub fn plan_recipient_change(&self, profile: SecurityProfile) -> ProfileTransitionPlan {
        ProfileTransitionPlan {
            version: 1,
            transition_id: random_operation_id(),
            from: profile,
            to: profile,
            requires_full_reseal: false,
            requires_key_rewrap: true,
            downgrade: false,
            explicit_downgrade_approved: false,
        }
    }
}

fn random_operation_id() -> String {
    let bytes = generate_random_bytes::<16>();
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut output = String::with_capacity(32);
    for byte in bytes {
        output.push(HEX[(byte >> 4) as usize] as char);
        output.push(HEX[(byte & 0x0f) as usize] as char);
    }
    output
}
