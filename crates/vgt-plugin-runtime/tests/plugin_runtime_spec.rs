use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use ed25519_dalek::{Signer, SigningKey};
use rand::rngs::OsRng;
use serde_json::json;
use vgt_plugin_runtime::*;

fn wasm_constant() -> Vec<u8> {
    vec![
        0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 127, 3, 2, 1, 0, 7, 10, 1, 6, 97, 110, 115,
        119, 101, 114, 0, 0, 10, 6, 1, 4, 0, 65, 42, 11,
    ]
}

fn leb_u32(mut value: u32) -> Vec<u8> {
    let mut out = Vec::new();
    loop {
        let mut byte = (value & 0x7f) as u8;
        value >>= 7;
        if value != 0 {
            byte |= 0x80;
        }
        out.push(byte);
        if value == 0 {
            return out;
        }
    }
}

fn wasm_with_memory(minimum_pages: u32, maximum_pages: u32) -> Vec<u8> {
    let mut payload = vec![1, 1]; // one memory, explicit maximum
    payload.extend(leb_u32(minimum_pages));
    payload.extend(leb_u32(maximum_pages));
    let mut out = b"\0asm\x01\0\0\0".to_vec();
    out.push(5);
    out.extend(leb_u32(payload.len() as u32));
    out.extend(payload);
    out
}
fn manifest(bytes: &[u8], version: &str, caps: Vec<PluginCapability>) -> PluginManifest {
    PluginManifest {
        schema_version: PLUGIN_MANIFEST_SCHEMA.into(),
        plugin_id: "vgt.test.plugin".into(),
        name: "Test Plugin".into(),
        publisher: "VGT Test".into(),
        version: version.into(),
        api_compatibility: ApiCompatibility {
            minimum_inclusive: PLUGIN_API_CURRENT.into(),
            maximum_exclusive: Some("vgt.workspace.plugin/2".into()),
        },
        package_sha256: sha256_hex(bytes),
        signature: None,
        entrypoints: vec![PluginEntrypoint::Wasm {
            export_name: "answer".into(),
        }],
        requested_capabilities: caps,
        resource_limits: PluginResourceLimits::default(),
        update_source: PluginUpdateSource::OfflineFile {
            source_id: "manual-import".into(),
        },
    }
}

fn signer_fingerprint(key: &SigningKey) -> String {
    sha256_hex(&key.verifying_key().to_bytes())
}

fn trust_signer(runtime: &mut PluginRuntime, key: &SigningKey) {
    runtime
        .trust_developer_signer(&signer_fingerprint(key), true)
        .unwrap();
}

fn sign(mut manifest: PluginManifest, key: &SigningKey) -> PluginManifest {
    let public = key.verifying_key().to_bytes();
    manifest.signature = Some(PluginPackageSignature {
        algorithm: "Ed25519".into(),
        key_id: "vgt.test.signer".into(),
        public_key_base64: BASE64.encode(public),
        signature_base64: String::new(),
    });
    let signature = key.sign(&signing_payload(&manifest));
    manifest.signature.as_mut().unwrap().signature_base64 = BASE64.encode(signature.to_bytes());
    manifest
}

#[test]
fn strict_manifest_rejects_install_hook() {
    let bytes = wasm_constant();
    let base = manifest(&bytes, "1.0.0", vec![]);
    let mut value = serde_json::to_value(base).unwrap();
    value["installHook"] = json!("/bin/sh");
    assert!(serde_json::from_value::<PluginManifest>(value).is_err());
}
#[test]
fn supreme_sec059_external_install_requires_signed_trusted_developer_and_rejects_tamper() {
    let bytes = wasm_constant();
    let key = SigningKey::generate(&mut OsRng);
    let mut runtime = PluginRuntime::new();

    let unsigned = manifest(&bytes, "1.0.0", vec![]);
    assert_eq!(
        runtime.install_initial(bytes.clone(), unsigned, true),
        Err(RuntimeError::SignerNotTrusted)
    );

    let signed = sign(manifest(&bytes, "1.0.0", vec![]), &key);
    assert_eq!(
        runtime.install_initial(bytes.clone(), signed.clone(), true),
        Err(RuntimeError::SignerNotTrusted)
    );
    assert_eq!(
        runtime.trust_developer_signer(&signer_fingerprint(&key), false),
        Err(RuntimeError::SignerTrustConfirmationRequired)
    );
    trust_signer(&mut runtime, &key);
    runtime
        .install_initial(bytes.clone(), signed, true)
        .unwrap();
    assert!(runtime.execution_permit("vgt.test.plugin").is_ok());
    runtime
        .revoke_developer_signer(&signer_fingerprint(&key))
        .unwrap();
    assert_eq!(
        runtime.execution_permit("vgt.test.plugin"),
        Err(RuntimeError::SignerNotTrusted)
    );
    trust_signer(&mut runtime, &key);
    assert!(runtime.execution_permit("vgt.test.plugin").is_ok());

    let mut tampered_bytes = bytes.clone();
    *tampered_bytes.last_mut().unwrap() ^= 0x01;
    let mut tampered_manifest = manifest(&tampered_bytes, "1.0.0", vec![]);
    tampered_manifest.signature = Some(PluginPackageSignature {
        algorithm: "Ed25519".into(),
        key_id: "vgt.test.signer".into(),
        public_key_base64: BASE64.encode(key.verifying_key().to_bytes()),
        signature_base64: BASE64.encode([0u8; 64]),
    });
    let mut attacker_runtime = PluginRuntime::new();
    trust_signer(&mut attacker_runtime, &key);
    assert_eq!(
        attacker_runtime.install_initial(tampered_bytes, tampered_manifest, true),
        Err(RuntimeError::Package)
    );
}
#[test]
fn signed_update_reconsent_and_signer_pin() {
    let bytes = wasm_constant();
    let key = SigningKey::generate(&mut OsRng);
    let mut runtime = PluginRuntime::new();
    trust_signer(&mut runtime, &key);
    let initial = sign(
        manifest(&bytes, "1.0.0", vec![PluginCapability::DocumentRead]),
        &key,
    );
    runtime
        .install_initial(bytes.clone(), initial, true)
        .unwrap();
    let update = sign(
        manifest(
            &bytes,
            "1.1.0",
            vec![
                PluginCapability::DocumentRead,
                PluginCapability::NetworkRequest,
            ],
        ),
        &key,
    );
    assert!(matches!(
        runtime.install_update(bytes.clone(), update.clone(), false),
        Err(RuntimeError::ReconsentRequired)
    ));
    runtime.install_update(bytes.clone(), update, true).unwrap();
    let attacker = SigningKey::generate(&mut OsRng);
    let swapped = sign(
        manifest(&bytes, "1.2.0", vec![PluginCapability::DocumentRead]),
        &attacker,
    );
    assert!(runtime.install_update(bytes, swapped, true).is_err());
}
#[test]
fn host_capability_and_document_commit_are_authoritative() {
    let bytes = wasm_constant();
    let key = SigningKey::generate(&mut OsRng);
    let mut runtime = PluginRuntime::new();
    trust_signer(&mut runtime, &key);
    let manifest = sign(
        manifest(
            &bytes,
            "1.0.0",
            vec![PluginCapability::DocumentProposeOperations],
        ),
        &key,
    );
    runtime
        .install_initial(bytes, manifest.clone(), true)
        .unwrap();
    let request = PluginHostRequest::ProposeOperations {
        document_id: "doc-1".into(),
        transaction_id: "tx-1".into(),
        operations: vec![json!({"kind":"SET_VALUE"})],
    };
    assert_eq!(
        runtime.authorize_host_api("vgt.test.plugin", &request),
        Err(RuntimeError::DocumentConsentRequired)
    );
    assert_eq!(
        runtime.grant_document_access("vgt.test.plugin", "doc-1", false),
        Err(RuntimeError::DocumentConsentRequired)
    );
    runtime
        .grant_document_access("vgt.test.plugin", "doc-1", true)
        .unwrap();
    runtime
        .authorize_host_api("vgt.test.plugin", &request)
        .unwrap();
    let other_document = PluginHostRequest::ProposeOperations {
        document_id: "doc-2".into(),
        transaction_id: "tx-2".into(),
        operations: vec![json!({"kind":"SET_VALUE"})],
    };
    assert_eq!(
        runtime.authorize_host_api("vgt.test.plugin", &other_document),
        Err(RuntimeError::DocumentConsentRequired)
    );
    assert!(validate_operation_proposal(&manifest, &request, |_doc, _ops| false).is_err());
    let denied = PluginHostRequest::ClipboardRead;
    assert!(runtime
        .authorize_host_api("vgt.test.plugin", &denied)
        .is_err());
}
#[test]
fn safe_mode_quarantine_and_rollback_fail_closed() {
    let bytes = wasm_constant();
    let key = SigningKey::generate(&mut OsRng);
    let mut runtime = PluginRuntime::new();
    trust_signer(&mut runtime, &key);
    runtime
        .install_initial(
            bytes.clone(),
            sign(manifest(&bytes, "1.0.0", vec![]), &key),
            true,
        )
        .unwrap();
    runtime
        .install_update(
            bytes.clone(),
            sign(manifest(&bytes, "1.1.0", vec![]), &key),
            true,
        )
        .unwrap();
    runtime.record_crash("vgt.test.plugin").unwrap();
    runtime.record_crash("vgt.test.plugin").unwrap();
    assert!(runtime.record_crash("vgt.test.plugin").unwrap().quarantined);
    assert!(runtime.execution_permit("vgt.test.plugin").is_err());
    assert_eq!(
        runtime.rollback("vgt.test.plugin").unwrap().version,
        "1.0.0"
    );
    runtime.set_safe_mode(true);
    assert!(runtime.execution_permit("vgt.test.plugin").is_err());
}

#[test]
fn supreme_sec052_memory_contract_is_16mib_initial_64mib_maximum() {
    let base = PluginResourceLimits::default();
    assert_eq!(base.max_linear_memory_bytes, 64 * 1024 * 1024);
    assert_eq!(base.max_cpu_ms, 5_000);
    assert_eq!(base.max_execution_ms, 5_000);

    let valid_bytes = wasm_with_memory(256, 1024);
    let valid_manifest = manifest(&valid_bytes, "1.0.0", vec![]);
    assert_eq!(
        validate_standard_tier_wasm(&valid_bytes, &valid_manifest),
        Ok(())
    );

    let too_large_initial = wasm_with_memory(257, 1024);
    let too_large_initial_manifest = manifest(&too_large_initial, "1.0.0", vec![]);
    assert_eq!(
        validate_standard_tier_wasm(&too_large_initial, &too_large_initial_manifest),
        Err(WasmError::MemoryLimit)
    );

    let too_large_maximum = wasm_with_memory(256, 1025);
    let too_large_maximum_manifest = manifest(&too_large_maximum, "1.0.0", vec![]);
    assert_eq!(
        validate_standard_tier_wasm(&too_large_maximum, &too_large_maximum_manifest),
        Err(WasmError::MemoryLimit)
    );
}

#[test]
fn supreme_sec054_manifest_consent_and_document_scope_are_all_required() {
    let bytes = wasm_constant();
    let key = SigningKey::generate(&mut OsRng);
    let mut runtime = PluginRuntime::new();
    trust_signer(&mut runtime, &key);
    let privileged = sign(
        manifest(
            &bytes,
            "1.0.0",
            vec![
                PluginCapability::NetworkRequest,
                PluginCapability::ClipboardRead,
                PluginCapability::DocumentRead,
            ],
        ),
        &key,
    );
    assert_eq!(
        runtime.install_initial(bytes.clone(), privileged.clone(), false),
        Err(RuntimeError::ReconsentRequired)
    );
    runtime.install_initial(bytes, privileged, true).unwrap();

    let network = PluginHostRequest::NetworkRequest {
        request_id: "req-1".into(),
        payload_bytes: 1,
    };
    assert!(runtime
        .authorize_host_api("vgt.test.plugin", &network)
        .is_ok());
    assert!(runtime
        .authorize_host_api("vgt.test.plugin", &PluginHostRequest::ClipboardRead)
        .is_ok());

    let doc_a = PluginHostRequest::DocumentRead {
        document_id: "doc-a".into(),
        object_ids: vec![],
    };
    let doc_b = PluginHostRequest::DocumentRead {
        document_id: "doc-b".into(),
        object_ids: vec![],
    };
    assert_eq!(
        runtime.authorize_host_api("vgt.test.plugin", &doc_a),
        Err(RuntimeError::DocumentConsentRequired)
    );
    runtime
        .grant_document_access("vgt.test.plugin", "doc-a", true)
        .unwrap();
    assert!(runtime
        .authorize_host_api("vgt.test.plugin", &doc_a)
        .is_ok());
    assert_eq!(
        runtime.authorize_host_api("vgt.test.plugin", &doc_b),
        Err(RuntimeError::DocumentConsentRequired)
    );
    runtime
        .revoke_document_access("vgt.test.plugin", "doc-a")
        .unwrap();
    assert_eq!(
        runtime.authorize_host_api("vgt.test.plugin", &doc_a),
        Err(RuntimeError::DocumentConsentRequired)
    );
}
