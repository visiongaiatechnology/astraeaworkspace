use serde_json::json;
use vgt_automation_runtime::{
    open_checkpoint_for_run, seal_checkpoint, AutomationRuntimeError, EncryptedCheckpoint,
    RunCheckpoint, AUTOMATION_CHECKPOINT_SCHEMA, MAX_CHECKPOINT_BYTES,
};

const KEY: [u8; 32] = [0xA5; 32];
const RUN_ID: &str = "run-17";
const FLOW_ID: &str = "flow-23";
const FLOW_VERSION: u64 = 4;

fn digest(byte: char) -> String {
    std::iter::repeat_n(byte, 64).collect()
}

fn valid_checkpoint() -> RunCheckpoint {
    RunCheckpoint {
        schema: AUTOMATION_CHECKPOINT_SCHEMA.to_owned(),
        run_id: RUN_ID.to_owned(),
        flow_id: FLOW_ID.to_owned(),
        flow_version: FLOW_VERSION,
        activation_digest: digest('a'),
        resume_node_id: "node-9".to_owned(),
        external_assumption_digest: digest('b'),
        created_at_ms: 1_759_176_000_000,
        state: json!({"cursor": 7, "record": {"ready": true}}),
    }
}

fn nested_arrays(depth: usize) -> serde_json::Value {
    let mut value = serde_json::Value::Null;
    for _ in 0..depth {
        value = serde_json::Value::Array(vec![value]);
    }
    value
}

fn encrypt_json(
    bytes: &[u8],
    flow_id: &str,
    flow_version: u64,
    run_id: &str,
) -> EncryptedCheckpoint {
    let aad = format!(
        "{}:{}:{}:{}",
        AUTOMATION_CHECKPOINT_SCHEMA, flow_id, flow_version, run_id
    );
    let (ciphertext, nonce) =
        vgt_crypto::encrypt_aes_gcm(bytes, &KEY, aad.as_bytes()).expect("test encryption succeeds");
    EncryptedCheckpoint {
        nonce: nonce.to_vec(),
        ciphertext,
    }
}

fn encrypt_checkpoint(checkpoint: &RunCheckpoint) -> EncryptedCheckpoint {
    let bytes = serde_json::to_vec(checkpoint).expect("checkpoint serialization succeeds");
    encrypt_json(
        &bytes,
        &checkpoint.flow_id,
        checkpoint.flow_version,
        &checkpoint.run_id,
    )
}

fn open(
    encrypted: &EncryptedCheckpoint,
    key: &[u8; 32],
    run_id: &str,
    flow_id: &str,
    flow_version: u64,
    activation_digest: &str,
    assumption_digest: &str,
) -> Result<RunCheckpoint, AutomationRuntimeError> {
    open_checkpoint_for_run(
        encrypted,
        key,
        run_id,
        flow_id,
        flow_version,
        activation_digest,
        assumption_digest,
    )
}

#[test]
fn authenticated_checkpoint_state_mutations_4096_reject_invalid_domains() {
    for case in 0..4_096_u32 {
        let mut checkpoint = valid_checkpoint();
        if case % 10 == 9 {
            let mut document = serde_json::to_value(&checkpoint).expect("checkpoint to value");
            document
                .as_object_mut()
                .expect("checkpoint serializes as an object")
                .insert("unrecognized".to_owned(), json!(case));
            let bytes = serde_json::to_vec(&document).expect("unknown-field JSON serializes");
            let encrypted = encrypt_json(
                &bytes,
                &checkpoint.flow_id,
                checkpoint.flow_version,
                &checkpoint.run_id,
            );
            assert!(
                matches!(
                    open(
                        &encrypted,
                        &KEY,
                        &checkpoint.run_id,
                        &checkpoint.flow_id,
                        checkpoint.flow_version,
                        &checkpoint.activation_digest,
                        &checkpoint.external_assumption_digest,
                    ),
                    Err(AutomationRuntimeError::CheckpointRejected)
                ),
                "unknown-field mutation {case} was accepted"
            );
            continue;
        }
        match case % 10 {
            0 => checkpoint.run_id = format!("run/{case}"),
            1 => checkpoint.flow_id = format!("flow/{case}"),
            2 => checkpoint.resume_node_id = format!("node/{case}"),
            3 => checkpoint.flow_version = 0,
            4 => checkpoint.activation_digest = format!("g{:063x}", case),
            5 => checkpoint.external_assumption_digest = format!("h{:063x}", case),
            6 => checkpoint.flow_id = "f".repeat(129),
            7 => checkpoint.resume_node_id.clear(),
            _ => checkpoint.schema = "vgt.workspace.automation-checkpoint/2".to_owned(),
        }

        assert!(
            seal_checkpoint(&checkpoint, &KEY).is_err(),
            "seal accepted invalid domain mutation {case}"
        );
        let encrypted = encrypt_checkpoint(&checkpoint);
        let result = open(
            &encrypted,
            &KEY,
            &checkpoint.run_id,
            &checkpoint.flow_id,
            checkpoint.flow_version,
            &checkpoint.activation_digest,
            &checkpoint.external_assumption_digest,
        );
        assert!(
            matches!(result, Err(AutomationRuntimeError::CheckpointRejected)),
            "mutation {case} unexpectedly produced {:?}",
            result.map(|value| value.resume_node_id)
        );
    }
}

#[test]
fn checkpoint_json_parser_4096_bounded_malformed_and_nested_cases_reject() {
    let mut state = 0x9E37_79B9_u32;
    for case in 0..4_096_u32 {
        let bytes = if case % 2 == 0 {
            let len = (case as usize) % 257;
            let mut bytes = Vec::with_capacity(len);
            for _ in 0..len {
                state ^= state << 13;
                state ^= state >> 17;
                state ^= state << 5;
                bytes.push(state as u8);
            }
            bytes
        } else {
            let depth = 130 + (case as usize % 128);
            let mut bytes = vec![b'['; depth];
            bytes.push(b'0');
            bytes.extend(std::iter::repeat_n(b']', depth));
            bytes
        };
        let encrypted = encrypt_json(&bytes, FLOW_ID, FLOW_VERSION, RUN_ID);
        assert!(
            matches!(
                open(
                    &encrypted,
                    &KEY,
                    RUN_ID,
                    FLOW_ID,
                    FLOW_VERSION,
                    &digest('a'),
                    &digest('b'),
                ),
                Err(AutomationRuntimeError::CheckpointRejected)
            ),
            "malformed/nested JSON mutation {case} was accepted"
        );
    }
}

#[test]
fn encrypted_checkpoint_envelope_mutations_4096_are_rejected() {
    for case in 0..4_096_usize {
        let mut checkpoint = valid_checkpoint();
        checkpoint.state = json!({"case": case});
        let mut encrypted = seal_checkpoint(&checkpoint, &KEY).expect("valid checkpoint seals");
        let mut key = KEY;
        let mut run_id = RUN_ID.to_owned();
        let mut flow_id = FLOW_ID.to_owned();
        let mut flow_version = FLOW_VERSION;
        let mut activation = digest('a');
        let mut assumption = digest('b');
        match case % 9 {
            0 => {
                let index = case % encrypted.nonce.len();
                encrypted.nonce[index] ^= ((case % 255) + 1) as u8;
            }
            1 => {
                let index = case % encrypted.ciphertext.len();
                encrypted.ciphertext[index] ^= ((case % 255) + 1) as u8;
            }
            2 => {
                encrypted.nonce.pop();
            }
            3 => key[case % key.len()] ^= ((case % 255) + 1) as u8,
            4 => run_id.push('x'),
            5 => flow_id.push('x'),
            6 => flow_version += 1,
            7 => activation = digest('c'),
            _ => assumption = digest('c'),
        }
        assert!(
            open(
                &encrypted,
                &key,
                &run_id,
                &flow_id,
                flow_version,
                &activation,
                &assumption,
            )
            .is_err(),
            "envelope mutation {case} unexpectedly opened"
        );
    }
}

fn checkpoint_with_serialized_size(size: usize) -> RunCheckpoint {
    let mut checkpoint = valid_checkpoint();
    checkpoint.state = json!({"blob": ""});
    let empty_size = serde_json::to_vec(&checkpoint)
        .expect("empty checkpoint serialization succeeds")
        .len();
    checkpoint.state = json!({"blob": "x".repeat(size - empty_size)});
    assert_eq!(
        serde_json::to_vec(&checkpoint)
            .expect("sized checkpoint serialization succeeds")
            .len(),
        size
    );
    checkpoint
}

#[test]
fn checkpoint_serialization_and_decryption_enforce_exact_byte_ceiling() {
    let at_limit = checkpoint_with_serialized_size(MAX_CHECKPOINT_BYTES);
    let encrypted = seal_checkpoint(&at_limit, &KEY).expect("exact limit is accepted");
    let opened = open(
        &encrypted,
        &KEY,
        RUN_ID,
        FLOW_ID,
        FLOW_VERSION,
        &digest('a'),
        &digest('b'),
    )
    .expect("exact limit opens");
    assert_eq!(opened, at_limit);

    let over_limit = checkpoint_with_serialized_size(MAX_CHECKPOINT_BYTES + 1);
    assert_eq!(
        seal_checkpoint(&over_limit, &KEY),
        Err(AutomationRuntimeError::LimitExceeded)
    );

    let over_limit_bytes = serde_json::to_vec(&over_limit).expect("oversized bytes serialize");
    let encrypted_over_limit = encrypt_json(&over_limit_bytes, FLOW_ID, FLOW_VERSION, RUN_ID);
    assert_eq!(
        open(
            &encrypted_over_limit,
            &KEY,
            RUN_ID,
            FLOW_ID,
            FLOW_VERSION,
            &digest('a'),
            &digest('b'),
        ),
        Err(AutomationRuntimeError::CheckpointRejected)
    );
}

#[test]
fn checkpoint_seal_depth_limit_preserves_parser_roundtrip_symmetry() {
    let mut at_limit = valid_checkpoint();
    at_limit.state = nested_arrays(126);
    let encrypted = seal_checkpoint(&at_limit, &KEY).expect("depth 126 is within parser limit");
    let opened = open(
        &encrypted,
        &KEY,
        RUN_ID,
        FLOW_ID,
        FLOW_VERSION,
        &digest('a'),
        &digest('b'),
    )
    .expect("depth 126 reopens");
    assert_eq!(opened.state, at_limit.state);

    for case in 0..4_096_usize {
        let depth = 127 + case % 130;
        let mut checkpoint = valid_checkpoint();
        checkpoint.state = nested_arrays(depth);
        let authenticated = encrypt_checkpoint(&checkpoint);
        assert!(
            matches!(
                open(
                    &authenticated,
                    &KEY,
                    RUN_ID,
                    FLOW_ID,
                    FLOW_VERSION,
                    &digest('a'),
                    &digest('b'),
                ),
                Err(AutomationRuntimeError::CheckpointRejected)
            ),
            "authenticated state depth {depth} at mutation {case} unexpectedly opened"
        );
        assert_eq!(
            seal_checkpoint(&checkpoint, &KEY),
            Err(AutomationRuntimeError::LimitExceeded),
            "state depth {depth} at mutation {case} was not rejected before sealing"
        );
    }
}
