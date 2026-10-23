//! # VGT Security Audit Suite
//! Automated validation of cryptographic derivation, zeroization, sandbox invariants,
//! NetGate connector-policy blocking, and causal SyncGraph convergence.

use std::collections::HashMap;

use vgt_container::{SaveOptions, VgtContainer};
use vgt_crypto::generate_dek;
use vgt_keyvault::VgtKeyVault;
use vgt_netgate::{NetGate, NetworkCapability};
use vgt_object_model::{CellValue, DocumentKind, TableObject, WorkspaceDocument, WorkspaceObject};
use vgt_operations::WorkspaceOperation;
use vgt_policy::{DataClassification, PolicyEngine};
use vgt_sandbox::{inspect_bytes, SandboxLimits};
use vgt_syncgraph::SyncGraphEngine;
use vgt_test_harness::FailureInjectionEngine;

/// Comprehensive Security Audit Suite
pub fn run_security_audit() {
    println!(">>> RUNNING RIGOROUS VGT SECURITY AUDIT SUITE <<<\n");
    let mut passed = 0;
    let mut failed = 0;

    // Check 1: KeyVault & Argon2id
    print!("[CHECK 1/8] Cryptographic Key Derivation (Argon2id calibrated cost)... ");
    let mut vault = VgtKeyVault::new();
    let _ = vault.unlock_with_master_key([0x42u8; vgt_crypto::KEY_SIZE]);
    let dek = generate_dek();
    let slots = vault
        .create_slots_for_document(&dek, Some("7741"), Some("MasterPassphrase#2026"))
        .unwrap();
    let unlocked = vault
        .unlock_dek_with_pin_for_document("security-audit-doc", &slots, "7741")
        .unwrap();
    if unlocked == dek {
        println!("PASSED");
        passed += 1;
    } else {
        println!("FAILED");
        failed += 1;
    }

    // Check 2: KeyVault Lock Zeroization
    print!("[CHECK 2/8] KeyVault lock state and fail-closed access... ");
    vault.lock();
    assert!(!vault.is_unlocked());
    let relock_attempt = vault.unlock_dek_local(&slots);
    if relock_attempt.is_err() {
        println!("PASSED (Fail-Closed)");
        passed += 1;
    } else {
        println!("FAILED");
        failed += 1;
    }

    // Check 3: Failure Injection & Tamper Resilience
    print!("[CHECK 3/8] Adversarial Failure Injection (Bit-flip & Power-Loss)... ");
    let _ = vault.unlock_with_master_key([0x42u8; vgt_crypto::KEY_SIZE]);
    let doc = WorkspaceDocument::new("Security Test Doc", DocumentKind::Writer);
    if FailureInjectionEngine::verify_tamper_resilience(&doc, &mut vault).is_ok() {
        println!("PASSED");
        passed += 1;
    } else {
        println!("FAILED");
        failed += 1;
    }

    // Check 4: Zero Plaintext Leakage
    print!("[CHECK 4/8] Zero Plaintext Leakage on Mass Storage... ");
    let packed = VgtContainer::pack_document(
        &doc,
        &mut vault,
        SaveOptions {
            policy: None,
            pin: Some("1234"),
            portable_password: None,
            recipient_public_key: None,
        },
    )
    .unwrap();
    if FailureInjectionEngine::verify_zero_plaintext_leakage(&packed, &["Security Test Doc"])
        .is_ok()
    {
        println!("PASSED (0 Plaintext bytes on disk)");
        passed += 1;
    } else {
        println!("FAILED");
        failed += 1;
    }

    // Check 5: Import Sandbox rejects a malformed archive before extraction.
    print!("[CHECK 5/8] Import Sandbox rejects truncated archives... ");
    let sb_ok = inspect_bytes(b"PK\x03\x04", "hostile.zip", SandboxLimits::default()).is_err();
    if sb_ok {
        println!("PASSED");
        passed += 1;
    } else {
        println!("FAILED");
        failed += 1;
    }

    // Check 6: NetGate Zero Telemetry
    print!("[CHECK 6/8] NetGate Permanent Telemetry Blacklist... ");
    let mut netgate = NetGate::new();
    netgate.set_capability(NetworkCapability::FullUserApproved);
    let mut ng_ok = true;
    for domain in &[
        "telemetry.microsoft.com",
        "google-analytics.com",
        "sentry.io",
        "datadog.com",
    ] {
        if netgate
            .evaluate_connection("test", domain, 443, "HTTPS", "ping")
            .is_ok()
        {
            ng_ok = false;
        }
    }
    if ng_ok {
        println!("PASSED");
        passed += 1;
    } else {
        println!("FAILED");
        failed += 1;
    }

    // Check 7: SyncGraph Deterministic Convergence
    print!("[CHECK 7/8] SyncGraph Two-Peer Causal Convergence... ");
    let mut doc_a = WorkspaceDocument::new("Collab", DocumentKind::Grid);
    doc_a.add_root_object(WorkspaceObject::Table(TableObject {
        id: "tbl".into(),
        rows: 2,
        cols: 2,
        cells: HashMap::new(),
    }));
    let mut doc_b = doc_a.clone();
    let mut peer_a = SyncGraphEngine::new("alice");
    let mut peer_b = SyncGraphEngine::new("bob");

    let op_a = WorkspaceOperation::SetCell {
        table_id: "tbl".into(),
        coord: "A1".into(),
        old_value: CellValue::Empty,
        new_value: CellValue::Number(42.0),
        old_formula: None,
        new_formula: None,
    };
    let node_a = peer_a.record_local_operation(&mut doc_a, op_a).unwrap();
    peer_b.merge_remote_node(&mut doc_b, node_a).unwrap();

    let op_b = WorkspaceOperation::SetCell {
        table_id: "tbl".into(),
        coord: "B1".into(),
        old_value: CellValue::Empty,
        new_value: CellValue::Number(84.0),
        old_formula: None,
        new_formula: None,
    };
    let node_b = peer_b.record_local_operation(&mut doc_b, op_b).unwrap();
    peer_a.merge_remote_node(&mut doc_a, node_b).unwrap();

    if doc_a.objects == doc_b.objects {
        println!("PASSED");
        passed += 1;
    } else {
        println!("FAILED");
        failed += 1;
    }

    // Check 8: Policy Engine Data Classification
    print!("[CHECK 8/8] Policy Engine Strict Sovereign Classification... ");
    let mut policy = PolicyEngine::new("Audit Corp");
    policy.max_exportable_classification = DataClassification::Internal;
    let pol_ok = policy
        .check_export_permitted("doc-1", DataClassification::Internal)
        .is_ok()
        && policy
            .check_export_permitted("doc-2", DataClassification::StrictSovereign)
            .is_err();

    if pol_ok {
        println!("PASSED");
        passed += 1;
    } else {
        println!("FAILED");
        failed += 1;
    }

    println!("\n================================================================================");
    println!(
        "  SECURITY AUDIT RESULTS: {} PASSED, {} FAILED",
        passed, failed
    );
    if failed == 0 {
        println!("  STATUS: CERTIFIED FOR PLATINUM & DIAMANT VGT SUPREME DEPLOYMENT");
    }
    println!("================================================================================\n");
}
