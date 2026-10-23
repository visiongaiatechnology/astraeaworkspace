// STATUS: DIAMANT VGT SUPREME
//! Causal snapshot bootstrap and privacy-preserving diagnostics.

use crate::{ReconcileReport, SyncError, SyncGraphEngine, VectorClock, MAX_LOGICAL_TIME, SYNC_SCHEMA_VERSION};
use serde::{Deserialize, Serialize};
use vgt_crypto::hash_blake3;
use vgt_object_model::WorkspaceDocument;

pub const MAX_SNAPSHOT_BYTES: usize = 64 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SyncSnapshot {
    pub schema_version: u16,
    pub document: WorkspaceDocument,
    pub frontier: VectorClock,
    pub membership_epoch: u64,
    pub created_at_ms: i64,
    pub document_digest_blake3: [u8; 32],
}

impl SyncSnapshot {
    pub fn capture(
        document: &WorkspaceDocument,
        frontier: &VectorClock,
        membership_epoch: u64,
        created_at_ms: i64,
    ) -> Result<Self, SyncError> {
        let encoded = serde_json::to_vec(document).map_err(|_| SyncError::SnapshotRejected)?;
        if encoded.len() > MAX_SNAPSHOT_BYTES { return Err(SyncError::ResourceBoundary); }
        Ok(Self {
            schema_version: SYNC_SCHEMA_VERSION,
            document: document.clone(),
            frontier: frontier.clone(),
            membership_epoch,
            created_at_ms,
            document_digest_blake3: hash_blake3(&encoded),
        })
    }

    pub fn verify(&self) -> Result<(), SyncError> {
        if self.schema_version != SYNC_SCHEMA_VERSION { return Err(SyncError::UnsupportedSchema(self.schema_version)); }
        if self.frontier.clock.len() > 4_096
            || self.frontier.clock.iter().any(|(actor, time)| actor.is_empty() || actor.len() > 256 || *time > MAX_LOGICAL_TIME)
        {
            return Err(SyncError::SnapshotRejected);
        }
        let encoded = serde_json::to_vec(&self.document).map_err(|_| SyncError::SnapshotRejected)?;
        if encoded.len() > MAX_SNAPSHOT_BYTES || hash_blake3(&encoded) != self.document_digest_blake3 {
            return Err(SyncError::SnapshotRejected);
        }
        Ok(())
    }

    /// Installing a snapshot may never discard local acknowledged causal history.
    pub fn permits_bootstrap_over(&self, local_frontier: &VectorClock) -> Result<(), SyncError> {
        self.verify()?;
        if !self.frontier.dominates(local_frontier) { return Err(SyncError::SnapshotRejected); }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SyncDiagnostics {
    pub durable_node_count: usize,
    pub causal_buffer_count: usize,
    pub head_count: usize,
    pub actor_count: usize,
    pub applied_last_reconcile: usize,
    pub conflict_count: usize,
    pub offline_queue_count: usize,
    pub offline_queue_bytes: usize,
    pub tombstone_count: usize,
    pub membership_epoch: u64,
    pub active_presence_count: usize,
}

impl SyncDiagnostics {
    pub fn from_engine(
        engine: &SyncGraphEngine,
        report: &ReconcileReport,
        offline_queue_count: usize,
        offline_queue_bytes: usize,
        tombstone_count: usize,
        membership_epoch: u64,
        active_presence_count: usize,
    ) -> Self {
        Self {
            durable_node_count: engine.nodes.len(),
            causal_buffer_count: engine.causal_buffer.len(),
            head_count: engine.heads.len(),
            actor_count: engine.vector_clock.clock.len(),
            applied_last_reconcile: report.applied_operation_ids.len(),
            conflict_count: report.conflicts.len(),
            offline_queue_count,
            offline_queue_bytes,
            tombstone_count,
            membership_epoch,
            active_presence_count,
        }
    }
}
