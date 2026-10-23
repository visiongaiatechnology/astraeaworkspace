// STATUS: DIAMANT VGT SUPREME
//! Typed IPC models and hostile-boundary validation for the native SyncGraph bridge.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use vgt_object_model::WorkspaceDocument;
use vgt_operations::WorkspaceOperation;
use vgt_syncgraph::{
    BackpressureDecision, MemberRole, MembershipState, ReconcileConflict, ReconcileReport,
    SyncDiagnostics, SyncNode, SyncSnapshot, VectorClock, MAX_LOGICAL_TIME, SYNC_SCHEMA_VERSION,
};

pub(crate) const MAX_AUDIT_ENTRIES: usize = 512;
pub(crate) const MAX_SYNC_SESSIONS: usize = 32;
pub(crate) const MAX_DOCUMENT_BYTES: usize = 32 * 1024 * 1024;
pub(crate) const MAX_OPERATION_BYTES: usize = 1024 * 1024;
const MAX_SYNC_NODE_BYTES: usize = 2 * 1024 * 1024;
const MAX_VECTOR_ACTORS: usize = 4_096;
const MAX_PARENT_IDS: usize = 64;
pub(crate) const MAX_GRAPH_NODES: usize = 50_000;
pub(crate) const MAX_CAUSAL_BUFFER_NODES: usize = 4_096;
pub(crate) const MAX_MISSING_BATCH: usize = 256;
pub(crate) const MAX_FUTURE_QUARANTINE: usize = 1_024;
pub(crate) const INGRESS_RATE_WINDOW_MS: u64 = 1_000;
pub(crate) const MAX_INGRESS_PER_WINDOW: u16 = 512;
pub(crate) const MAX_REPLAY_PER_WINDOW: u16 = 128;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncAuditEntry {
    pub(crate) id: String,
    pub(crate) timestamp_utc: i64,
    pub(crate) direction: SyncAuditDirection,
    pub(crate) op_id: Option<String>,
    pub(crate) actor_id: Option<String>,
    pub(crate) applied_count: usize,
    pub(crate) conflicts: Vec<ReconcileConflict>,
    pub(crate) buffered_count: usize,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum SyncAuditDirection {
    Local,
    Remote,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct SyncOpenRequest {
    pub(crate) document: WorkspaceDocument,
    pub(crate) actor_id: String,
    #[serde(default)]
    pub(crate) device_id: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct SyncRecordRequest {
    pub(crate) document_id: String,
    pub(crate) operation: WorkspaceOperation,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct SyncMergeRequest {
    pub(crate) document_id: String,
    pub(crate) node: SyncNode,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct SyncFutureQuarantineRequest {
    pub(crate) document_id: String,
    pub(crate) operation_id: String,
    pub(crate) schema_version: u16,
    pub(crate) raw: Value,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct SyncMissingRequest {
    pub(crate) document_id: String,
    pub(crate) peer_clock: VectorClock,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct SyncDocumentRequest {
    pub(crate) document_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct SyncSnapshotBootstrapRequest {
    pub(crate) document_id: String,
    pub(crate) snapshot: SyncSnapshot,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct SyncGarbageCollectRequest {
    pub(crate) document_id: String,
    pub(crate) acknowledged_frontier: VectorClock,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", tag = "action")]
pub enum SyncMembershipAction {
    AddMember {
        member_id: String,
        role: MemberRole,
    },
    AddDevice {
        member_id: String,
        device_id: String,
        key_id: String,
    },
    RevokeDevice {
        member_id: String,
        device_id: String,
    },
    RemoveMember {
        member_id: String,
    },
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct SyncMembershipRequest {
    pub(crate) document_id: String,
    pub(crate) change: SyncMembershipAction,
}

/// Only the first local owner and that owner's first local device may be initialized from the
/// trusted main-window code. This is local setup, not proof of an authenticated remote peer.
pub(crate) fn permits_local_membership_bootstrap(
    membership: &MembershipState,
    change: &SyncMembershipAction,
) -> bool {
    match change {
        SyncMembershipAction::AddMember {
            role: MemberRole::Owner,
            ..
        } => membership.members.is_empty(),
        SyncMembershipAction::AddDevice { member_id, .. } => {
            membership.permits_first_owner_device_bootstrap(member_id)
        }
        SyncMembershipAction::RevokeDevice { .. }
        | SyncMembershipAction::RemoveMember { .. }
        | SyncMembershipAction::AddMember { .. } => false,
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncStatusResponse {
    pub(crate) document: WorkspaceDocument,
    pub(crate) vector_clock: VectorClock,
    pub(crate) pending_buffer_count: usize,
    pub(crate) node_count: usize,
    pub(crate) audit: Vec<SyncAuditEntry>,
    pub(crate) offline_queue_count: usize,
    pub(crate) offline_queue_bytes: usize,
    pub(crate) queue_corrupt_recovered: bool,
    pub(crate) future_quarantine_count: usize,
    pub(crate) tombstone_count: usize,
    pub(crate) membership_epoch: u64,
    pub(crate) backpressure: BackpressureDecision,
    pub(crate) diagnostics: SyncDiagnostics,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncRecordResponse {
    pub(crate) document: WorkspaceDocument,
    pub(crate) node: SyncNode,
    pub(crate) vector_clock: VectorClock,
    pub(crate) report: ReconcileReport,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncMergeResponse {
    pub(crate) document: WorkspaceDocument,
    pub(crate) vector_clock: VectorClock,
    pub(crate) report: ReconcileReport,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncMissingResponse {
    pub(crate) nodes: Vec<SyncNode>,
    pub(crate) has_more: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncFutureQuarantineResponse {
    pub(crate) future_quarantine_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncMembershipResponse {
    pub(crate) membership_epoch: u64,
    pub(crate) queue_rekey_required: bool,
}

pub(crate) fn validate_identifier(value: &str, label: &str) -> Result<(), String> {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed.len() > 256 || trimmed.chars().any(char::is_control) {
        return Err(format!("Invalid {label}"));
    }
    Ok(())
}

pub(crate) fn validate_serialized_size<T: Serialize>(
    value: &T,
    label: &str,
    max_bytes: usize,
) -> Result<(), String> {
    let bytes =
        serde_json::to_vec(value).map_err(|_| format!("{label} could not be serialized"))?;
    if bytes.len() > max_bytes {
        return Err(format!("{label} exceeds the configured resource boundary"));
    }
    Ok(())
}

pub(crate) fn validate_vector_clock(clock: &VectorClock) -> Result<(), String> {
    if clock.clock.len() > MAX_VECTOR_ACTORS {
        return Err("Vector clock exceeds the configured actor boundary".to_string());
    }
    for (actor_id, logical_time) in &clock.clock {
        validate_identifier(actor_id, "vector-clock actor id")?;
        if *logical_time > MAX_LOGICAL_TIME {
            return Err("Vector clock exceeds the configured logical-time boundary".to_string());
        }
    }
    Ok(())
}

pub(crate) fn validate_sync_node(node: &SyncNode, document_id: &str) -> Result<(), String> {
    validate_serialized_size(node, "Sync node", MAX_SYNC_NODE_BYTES)?;
    validate_identifier(&node.op_id, "operation id")?;
    validate_identifier(&node.actor_id, "actor id")?;
    validate_identifier(&node.device_id, "device id")?;
    validate_identifier(&node.document_id, "node document id")?;
    if node.schema_version == 0 || node.schema_version > SYNC_SCHEMA_VERSION {
        return Err("Sync node schema is unsupported".to_string());
    }
    if node.object_ids.is_empty() || node.object_ids.len() > 32 {
        return Err("Sync node object identity boundary rejected".to_string());
    }
    let mut seen_objects = HashSet::with_capacity(node.object_ids.len());
    for object_id in &node.object_ids {
        validate_identifier(object_id, "node object id")?;
        if !seen_objects.insert(object_id) {
            return Err("Sync node has duplicate object identities".to_string());
        }
    }
    if node.document_id != document_id {
        return Err("Sync node belongs to another document".to_string());
    }
    if node.lamport_time == 0 || node.lamport_time > MAX_LOGICAL_TIME {
        return Err("Sync node has an invalid Lamport timestamp".to_string());
    }
    if node.parent_ids.len() > MAX_PARENT_IDS {
        return Err("Sync node exceeds the configured causal-parent boundary".to_string());
    }
    let mut seen_parents = HashSet::with_capacity(node.parent_ids.len());
    for parent_id in &node.parent_ids {
        validate_identifier(parent_id, "parent operation id")?;
        if parent_id == &node.op_id || !seen_parents.insert(parent_id) {
            return Err("Sync node has invalid or duplicate causal parents".to_string());
        }
    }
    if node
        .signature
        .as_ref()
        .is_some_and(|signature| signature.len() > 8_192)
    {
        return Err("Sync node signature exceeds the configured boundary".to_string());
    }
    validate_serialized_size(&node.operation, "Workspace operation", MAX_OPERATION_BYTES)
}

pub(crate) fn validate_future_quarantine_request(
    request: &SyncFutureQuarantineRequest,
) -> Result<usize, String> {
    validate_identifier(&request.document_id, "document id")?;
    validate_identifier(&request.operation_id, "operation id")?;
    if request.schema_version <= SYNC_SCHEMA_VERSION {
        return Err("SyncGraph future quarantine requires a newer schema version".to_string());
    }
    let bytes = serde_json::to_vec(&request.raw)
        .map_err(|_| "SyncGraph future operation could not be serialized".to_string())?;
    if bytes.is_empty() || bytes.len() > MAX_SYNC_NODE_BYTES {
        return Err("SyncGraph future operation exceeds the configured boundary".to_string());
    }
    Ok(bytes.len())
}

#[derive(Default)]
struct IngressWindow {
    started_at_ms: u64,
    ingress: u16,
    replay: u16,
}

#[derive(Default)]
pub(crate) struct SyncIngressRateLimiter {
    windows: HashMap<String, IngressWindow>,
}

impl SyncIngressRateLimiter {
    pub(crate) fn check(
        &mut self,
        device_id: &str,
        now_ms: u64,
        replay: bool,
    ) -> Result<(), String> {
        validate_identifier(device_id, "ingress device id")?;
        if self.windows.len() > 8_192 {
            self.windows.retain(|_, window| {
                now_ms.saturating_sub(window.started_at_ms) < INGRESS_RATE_WINDOW_MS * 4
            });
        }
        let window = self.windows.entry(device_id.to_string()).or_default();
        if now_ms < window.started_at_ms
            || now_ms.saturating_sub(window.started_at_ms) >= INGRESS_RATE_WINDOW_MS
        {
            *window = IngressWindow {
                started_at_ms: now_ms,
                ingress: 0,
                replay: 0,
            };
        }
        window.ingress = window.ingress.saturating_add(1);
        if replay {
            window.replay = window.replay.saturating_add(1);
        }
        if window.ingress > MAX_INGRESS_PER_WINDOW || window.replay > MAX_REPLAY_PER_WINDOW {
            return Err("SyncGraph ingress rate limit exceeded".to_string());
        }
        Ok(())
    }
}

#[cfg(test)]
mod trust_boundary_tests {
    use super::{
        permits_local_membership_bootstrap, SyncMembershipAction, SyncMembershipRequest,
        SyncMergeRequest,
    };
    use vgt_syncgraph::{MemberRole, MembershipState};

    #[test]
    fn merge_ipc_rejects_renderer_supplied_authenticated_peer() {
        let error = serde_json::from_str::<SyncMergeRequest>(
            r#"{"documentId":"doc-main","peer":{"authenticated":true,"member_id":"owner","device_id":"device-main","key_id":"owner-key","membership_epoch":1},"node":{}}"#,
        )
        .err()
        .expect("the WebView merge DTO must reject unknown peer context");

        assert!(
            error.to_string().contains("unknown field `peer`"),
            "{error}"
        );
    }

    #[test]
    fn membership_ipc_rejects_renderer_supplied_owner_authorizer() {
        let error = serde_json::from_str::<SyncMembershipRequest>(
            r#"{"documentId":"doc-main","authorizer":{"authenticated":true,"member_id":"owner","device_id":"device-main","key_id":"owner-key","membership_epoch":1},"change":{"action":"removeMember","member_id":"victim"}}"#,
        )
        .err()
        .expect("the WebView membership DTO must reject unknown authorizer context");

        assert!(
            error.to_string().contains("unknown field `authorizer`"),
            "{error}"
        );
    }

    #[test]
    fn renderer_membership_bootstrap_is_limited_to_first_owner_and_device() {
        let empty = MembershipState::default();
        assert!(permits_local_membership_bootstrap(
            &empty,
            &SyncMembershipAction::AddMember {
                member_id: "owner".into(),
                role: MemberRole::Owner,
            },
        ));
        assert!(!permits_local_membership_bootstrap(
            &empty,
            &SyncMembershipAction::AddMember {
                member_id: "editor".into(),
                role: MemberRole::Editor,
            },
        ));

        let mut initialized = MembershipState::default();
        initialized.add_member("owner", MemberRole::Owner).unwrap();
        assert!(permits_local_membership_bootstrap(
            &initialized,
            &SyncMembershipAction::AddDevice {
                member_id: "owner".into(),
                device_id: "device-main".into(),
                key_id: "owner-key".into(),
            },
        ));
        initialized
            .add_device("owner", "device-main", "owner-key")
            .unwrap();
        assert!(!permits_local_membership_bootstrap(
            &initialized,
            &SyncMembershipAction::AddMember {
                member_id: "attacker".into(),
                role: MemberRole::Owner,
            },
        ));
        assert!(!permits_local_membership_bootstrap(
            &initialized,
            &SyncMembershipAction::RevokeDevice {
                member_id: "owner".into(),
                device_id: "device-main".into(),
            },
        ));
    }
}
