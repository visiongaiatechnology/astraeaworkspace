// STATUS: DIAMANT VGT SUPREME
//! Truthful secure-storage capability reporting. Native persistence, hardware-interface
//! detection and key-bound hardware attestation are separate facts and never conflated.

use crate::{storage, KeyVaultError, VaultPlatform, VgtKeyVault};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum ProviderRequirement {
    NativeSecurePersistence,
    VerifiedHardwareBackedSlot,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ProviderHealth {
    pub platform: VaultPlatform,
    pub available: bool,
    pub secure_persistence: bool,
    pub hardware_interface_detected: bool,
    pub hardware_slot_supported: bool,
    pub hardware_backed: bool,
    pub hardware_attestation_verified: bool,
    pub provider_name: String,
    pub capabilities: Vec<String>,
    pub detail: String,
}

impl VgtKeyVault {
    pub fn provider_health(&self) -> ProviderHealth {
        if self.platform() == VaultPlatform::SoftwareEncrypted {
            let configured = VgtKeyVault::software_provider_configured();
            return ProviderHealth {
                platform: VaultPlatform::SoftwareEncrypted,
                available: true,
                secure_persistence: true,
                hardware_interface_detected: false,
                hardware_slot_supported: false,
                hardware_backed: false,
                hardware_attestation_verified: false,
                provider_name: "Passphrase-protected software key".into(),
                capabilities: vec![
                    "SoftwareEncrypted".into(),
                    "Argon2id".into(),
                    "AES-256-GCM key wrapping".into(),
                ],
                detail: if configured {
                    "A software-provider record exists. Standard Workspace key access uses authenticated passphrase wrapping; no hardware-backed or attestation claim is made.".into()
                } else {
                    "The software provider is selected, but its wrapped Standard Workspace root is unavailable.".into()
                },
            };
        }
        let probe = storage::provider_capabilities();
        provider_health_from_probe(self.platform(), &probe)
    }

    pub fn require_provider(
        &self,
        requirement: ProviderRequirement,
    ) -> Result<ProviderHealth, KeyVaultError> {
        let probe = storage::provider_capabilities();
        let health = provider_health_from_probe(self.platform(), &probe);
        if provider_requirement_satisfied(&probe, requirement) {
            Ok(health)
        } else {
            Err(KeyVaultError::ProviderUnavailable)
        }
    }
}

fn provider_requirement_satisfied(
    probe: &storage::StorageCapabilityProbe,
    requirement: ProviderRequirement,
) -> bool {
    match requirement {
        ProviderRequirement::NativeSecurePersistence => probe.available && probe.secure_persistence,
        ProviderRequirement::VerifiedHardwareBackedSlot => {
            probe.available
                && probe.secure_persistence
                && probe.hardware_interface_detected
                && probe.hardware_slot_supported
                && probe.hardware_backed
                && probe.attestation_verified
                && !probe.hardware_interface_probe_indeterminate
        }
    }
}

fn provider_health_from_probe(
    platform: VaultPlatform,
    probe: &storage::StorageCapabilityProbe,
) -> ProviderHealth {
    let capabilities = probe
        .features
        .iter()
        .map(|feature| format!("{feature:?}"))
        .collect::<Vec<_>>();
    ProviderHealth {
        platform,
        available: probe.available,
        secure_persistence: probe.secure_persistence,
        hardware_interface_detected: probe.hardware_interface_detected,
        hardware_slot_supported: probe.hardware_slot_supported,
        hardware_backed: probe.hardware_backed,
        hardware_attestation_verified: probe.attestation_verified,
        provider_name: probe.provider_name.clone(),
        capabilities,
        detail: provider_detail(probe),
    }
}

fn provider_detail(probe: &storage::StorageCapabilityProbe) -> String {
    if probe.hardware_interface_probe_indeterminate {
        let status = probe
            .hardware_provider_probe_status
            .map(|value| format!("status 0x{:08X}", value as u32))
            .unwrap_or_else(|| "no status code".into());
        return format!(
            "Native secure-persistence capability is not sufficient to classify the hardware provider: the platform provider probe returned {status}. Root-key persistence fails closed and no hardware claim is made."
        );
    }
    if !probe.available || !probe.secure_persistence {
        return "No supported native secure-persistence provider is available; policies requiring persistent roots fail closed.".into();
    }
    if probe.hardware_backed && probe.attestation_verified && probe.hardware_slot_supported {
        return "Native secure persistence is available and the provider supplied key-bound hardware attestation for hardware-slot operations.".into();
    }
    if probe.hardware_interface_detected {
        return "Native secure persistence is available and a hardware security interface was detected, but the Workspace key is not claimed hardware-backed without key-bound attestation.".into();
    }
    "Native secure persistence is available; no key-bound hardware-backed claim is made.".into()
}

#[cfg(test)]
mod sec012_live_tests {
    use super::*;

    #[test]
    fn sec012_live_provider_never_silently_upgrades_interface_presence() {
        let vault = VgtKeyVault::new();
        let health = vault.provider_health();
        println!(
            "SEC012_LIVE_PROVIDER platform={:?} provider={} available={} secure_persistence={} interface={} slot={} backed={} attested={}",
            health.platform,
            health.provider_name,
            health.available,
            health.secure_persistence,
            health.hardware_interface_detected,
            health.hardware_slot_supported,
            health.hardware_backed,
            health.hardware_attestation_verified
        );
        let verified = health.available
            && health.secure_persistence
            && health.hardware_interface_detected
            && health.hardware_slot_supported
            && health.hardware_backed
            && health.hardware_attestation_verified;
        if verified {
            vault
                .require_provider(ProviderRequirement::VerifiedHardwareBackedSlot)
                .expect("fully attested live provider must satisfy hardware policy");
        } else {
            assert!(matches!(
                vault.require_provider(ProviderRequirement::VerifiedHardwareBackedSlot),
                Err(KeyVaultError::ProviderUnavailable)
            ));
        }
    }

    #[test]
    fn sec012_hardware_requirement_needs_interface_and_definitive_probe() {
        // Synthetic capability values exercise only the policy predicate; they are not
        // hardware or attestation evidence and must never be counted as such.
        let mut probe = storage::StorageCapabilityProbe {
            provider: crate::storage::StorageProvider::WindowsDpapi,
            available: true,
            secure_persistence: true,
            hardware_interface_detected: true,
            hardware_slot_supported: true,
            hardware_backed: true,
            attestation_verified: true,
            hardware_interface_probe_indeterminate: false,
            hardware_provider_probe_status: None,
            provider_name: "policy fixture".into(),
            features: Vec::new(),
        };
        assert!(provider_requirement_satisfied(
            &probe,
            ProviderRequirement::VerifiedHardwareBackedSlot
        ));
        probe.hardware_interface_detected = false;
        assert!(!provider_requirement_satisfied(
            &probe,
            ProviderRequirement::VerifiedHardwareBackedSlot
        ));
        probe.hardware_interface_detected = true;
        probe.hardware_interface_probe_indeterminate = true;
        assert!(!provider_requirement_satisfied(
            &probe,
            ProviderRequirement::VerifiedHardwareBackedSlot
        ));
    }
}
