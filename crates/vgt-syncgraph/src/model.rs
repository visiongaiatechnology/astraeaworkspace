// STATUS: DIAMANT VGT SUPREME
//! Wire/domain models for the canonical SyncGraph engine.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use thiserror::Error;
use vgt_object_model::{SecurityProfile, WorkspaceDocument, WorkspaceObject};
use vgt_operations::{OperationError, WorkspaceOperation};

/// Highest Lamport/vector-clock value accepted across the JSON/JavaScript bridge.
/// One additional internal Lamport tick remains available when integrating a remote node.
pub const MAX_LOGICAL_TIME: u64 = 9_007_199_254_740_990;
pub const SYNC_SCHEMA_VERSION: u16 = 2;

#[derive(Error, Debug, PartialEq)]
pub enum SyncError {
    #[error("Operation error: {0}")]
    Operation(#[from] OperationError),
    #[error("Duplicate operation '{0}' received")]
    DuplicateOperation(String),
    #[error("Missing causal parent operation '{0}'")]
    MissingParent(String),
    #[error("Causal cycle detected in SyncGraph")]
    CausalCycleDetected,
    #[error("Invalid operation signature")]
    InvalidSignature,
    #[error("Logical clock reached or exceeded the configured safe boundary")]
    LogicalClockBoundary,
    #[error("Protected remote operation requires an authenticated compatible peer")]
    ProtectedPeerRejected,
    #[error("SyncGraph membership/device is revoked or unknown")]
    MembershipRejected,
    #[error("SyncGraph resource boundary exceeded")]
    ResourceBoundary,
    #[error("SyncGraph encrypted envelope authentication failed")]
    EnvelopeAuthentication,
    #[error("SyncGraph snapshot is incompatible with the local causal frontier")]
    SnapshotRejected,
    #[error("Unsupported future SyncGraph operation schema version {0}")]
    UnsupportedSchema(u16),
}

/// A durable node in the directed acyclic causal graph of operations.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SyncNode {
    pub op_id: String,
    pub actor_id: String,
    #[serde(default)]
    pub device_id: String,
    #[serde(default = "current_sync_schema_version")]
    pub schema_version: u16,
    #[serde(default)]
    pub object_ids: Vec<String>,
    pub lamport_time: u64,
    pub parent_ids: Vec<String>,
    pub timestamp_utc: i64,
    pub operation: WorkspaceOperation,
    #[serde(default)]
    pub document_id: String,
    #[serde(default)]
    pub signature: Option<String>,
}

fn current_sync_schema_version() -> u16 { SYNC_SCHEMA_VERSION }

/// Stable identities touched by one operation. Document-level payload mutations use an explicit
/// synthetic identity instead of pretending they have no target.
pub fn operation_object_ids(operation: &WorkspaceOperation) -> Vec<String> {
    match operation {
        WorkspaceOperation::InsertText { block_id, .. }
        | WorkspaceOperation::DeleteText { block_id, .. }
        | WorkspaceOperation::InsertParagraph { block_id, .. }
        | WorkspaceOperation::DeleteParagraph { block_id, .. }
        | WorkspaceOperation::ReplaceParagraph { block_id, .. }
        | WorkspaceOperation::MoveParagraph { block_id, .. } => vec![block_id.clone()],
        WorkspaceOperation::SetWriterData { .. } => vec!["$document:writer".to_string()],
        WorkspaceOperation::SetWriterDataField { field, .. } => vec![format!("$document:writer:{field}")],
        WorkspaceOperation::InsertPresentSlide { slide, .. } => vec![slide.get("id").and_then(serde_json::Value::as_str).unwrap_or("$document:present").to_string()],
        WorkspaceOperation::DeletePresentSlide { slide_id, .. }
        | WorkspaceOperation::ReplacePresentSlide { slide_id, .. }
        | WorkspaceOperation::MovePresentSlide { slide_id, .. } => vec![slide_id.clone()],
        WorkspaceOperation::SetPresentDataField { field, .. } => vec![format!("$document:present:{field}")],
        WorkspaceOperation::SetCell { table_id, coord, .. } => vec![table_id.clone(), format!("{table_id}#cell:{coord}")],
        WorkspaceOperation::MoveShape { shape_id, .. } => vec![shape_id.clone()],
        WorkspaceOperation::AddObject { object, .. } => vec![object.id().to_string()],
        WorkspaceOperation::RemoveObject { object_id, .. } => vec![object_id.clone()],
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct VectorClock {
    pub clock: BTreeMap<String, u64>,
}

impl VectorClock {
    pub fn new() -> Self { Self::default() }
    pub fn increment(&mut self, actor_id: &str) -> u64 {
        let entry = self.clock.entry(actor_id.to_string()).or_insert(0);
        *entry = entry.saturating_add(1);
        *entry
    }
    pub fn get(&self, actor_id: &str) -> u64 { self.clock.get(actor_id).copied().unwrap_or(0) }
    pub fn merge(&mut self, other: &VectorClock) {
        for (actor, time) in &other.clock {
            let entry = self.clock.entry(actor.clone()).or_insert(0);
            *entry = (*entry).max(*time);
        }
    }
    /// Returns true when this frontier includes every actor/time in `other`.
    pub fn dominates(&self, other: &VectorClock) -> bool {
        other.clock.iter().all(|(actor, time)| self.get(actor) >= *time)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ReconcileConflict {
    pub op_id: String,
    pub actor_id: String,
    pub lamport_time: u64,
    pub reason: String,
}

/// Native transport assertion required before protected operations may enter SyncGraph.
/// This is policy input, not cryptographic proof; it is intentionally not serializable or
/// deserializable and must never be populated from renderer-controlled data.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuthenticatedPeerContext {
    pub authenticated: bool,
    pub security_profile: SecurityProfile,
    pub infinity_suite: Option<String>,
    pub infinity_commit: Option<String>,
    pub member_id: String,
    pub device_id: String,
    pub key_id: String,
    pub membership_epoch: u64,
}

impl AuthenticatedPeerContext {
    pub fn permits_document(&self, doc: &WorkspaceDocument) -> bool {
        match doc.security_policy.profile {
            SecurityProfile::Standard => self.authenticated,
            SecurityProfile::Pqc => self.authenticated && self.security_profile == SecurityProfile::Pqc,
            SecurityProfile::VgtTopSecret => {
                self.authenticated
                    && self.security_profile == SecurityProfile::VgtTopSecret
                    && self.infinity_suite.as_deref() == doc.security_policy.infinity_suite.as_deref()
                    && self.infinity_commit.as_deref() == doc.security_policy.infinity_commit.as_deref()
            }
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct ReconcileReport {
    pub applied_operation_ids: Vec<String>,
    pub conflicts: Vec<ReconcileConflict>,
    pub buffered_count: usize,
    #[serde(default)]
    pub quarantined_future_count: usize,
}

/// Merge family is selected by operation/object semantics, never by one fake universal CRDT.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MergeSemantics {
    TextSequence,
    OrderedStableSequence,
    OptimisticRegister,
    TableCellRegister,
    GeometryRegister,
    BinaryAssetRegister,
    DurableReviewObject,
    ObservedRemoveObjectSet,
}

pub fn merge_semantics_for_operation(operation: &WorkspaceOperation) -> MergeSemantics {
    match operation {
        WorkspaceOperation::InsertText { .. } | WorkspaceOperation::DeleteText { .. } => MergeSemantics::TextSequence,
        WorkspaceOperation::InsertParagraph { .. }
        | WorkspaceOperation::DeleteParagraph { .. }
        | WorkspaceOperation::MoveParagraph { .. }
        | WorkspaceOperation::InsertPresentSlide { .. }
        | WorkspaceOperation::DeletePresentSlide { .. }
        | WorkspaceOperation::MovePresentSlide { .. } => MergeSemantics::OrderedStableSequence,
        WorkspaceOperation::ReplaceParagraph { .. }
        | WorkspaceOperation::SetWriterData { .. }
        | WorkspaceOperation::SetWriterDataField { .. }
        | WorkspaceOperation::ReplacePresentSlide { .. }
        | WorkspaceOperation::SetPresentDataField { .. } => MergeSemantics::OptimisticRegister,
        WorkspaceOperation::SetCell { .. } => MergeSemantics::TableCellRegister,
        WorkspaceOperation::MoveShape { .. } => MergeSemantics::GeometryRegister,
        WorkspaceOperation::AddObject { object: WorkspaceObject::MediaAsset(_), .. }
        | WorkspaceOperation::RemoveObject { cached_object: WorkspaceObject::MediaAsset(_), .. } => MergeSemantics::BinaryAssetRegister,
        WorkspaceOperation::AddObject { object: WorkspaceObject::CommentReview(_), .. }
        | WorkspaceOperation::RemoveObject { cached_object: WorkspaceObject::CommentReview(_), .. } => MergeSemantics::DurableReviewObject,
        WorkspaceOperation::AddObject { .. } | WorkspaceOperation::RemoveObject { .. } => MergeSemantics::ObservedRemoveObjectSet,
    }
}
