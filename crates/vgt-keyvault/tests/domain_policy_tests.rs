use vgt_keyvault::{
    RecoveryMode, RecoveryPolicy, SecurityKeyNamespace, SecurityProfile, VgtKeyVault,
};

#[test]
fn downgrade_requires_explicit_approval_and_reseal() {
    let vault = VgtKeyVault::new();
    assert!(vault
        .plan_profile_transition(
            SecurityProfile::VgtTopSecret,
            SecurityProfile::Standard,
            false
        )
        .is_err());
    let plan = vault
        .plan_profile_transition(
            SecurityProfile::VgtTopSecret,
            SecurityProfile::Standard,
            true,
        )
        .expect("approved downgrade plan");
    assert!(plan.requires_full_reseal);
    assert!(plan.requires_key_rewrap);
    assert!(vault
        .validate_profile_transition_commit(&plan, false, true)
        .is_err());
    assert!(vault
        .validate_profile_transition_commit(&plan, true, false)
        .is_err());
    vault
        .validate_profile_transition_commit(&plan, true, true)
        .expect("full reseal plus rewrap should commit");
}

#[test]
fn recovery_artifact_is_single_domain_only() {
    let vault = VgtKeyVault::new();
    let policy = RecoveryPolicy {
        namespace: SecurityKeyNamespace::VgtTopSecret,
        mode: RecoveryMode::ExplicitUserExport,
        recipient_fingerprints: vec![],
        require_separate_artifact: true,
        explicit_opt_in: true,
    };
    let descriptor = vault
        .create_recovery_artifact_descriptor(&policy)
        .expect("descriptor");
    assert!(!descriptor.contains_cross_domain_material);
    vault
        .validate_recovery_artifact(&descriptor, SecurityKeyNamespace::VgtTopSecret)
        .expect("same domain");
    assert!(vault
        .validate_recovery_artifact(&descriptor, SecurityKeyNamespace::Standard)
        .is_err());
}

#[test]
fn recipient_change_is_not_metadata_only() {
    let vault = VgtKeyVault::new();
    let plan = vault.plan_recipient_change(SecurityProfile::VgtTopSecret);
    assert!(plan.requires_key_rewrap);
    assert!(!plan.requires_full_reseal);
}
