// STATUS: DIAMANT VGT SUPREME
//! # VGT SyncGraph
//!
//! Causal graph synchronization engine for peer-to-peer and self-hosted collaboration.
//!
//! Principles:
//! - Doktrin 22 & 23: Self-hosting is a first-class deployment. Zero-server-trust.
//! - Doktrin 85: Operations are causality-tracked via Lamport logical timestamps.
//! - Deterministic convergence across concurrent offline edits regardless of delivery order.

use chrono::Utc;
use std::collections::{BTreeSet, HashMap, HashSet};
use uuid::Uuid;
use vgt_object_model::{SecurityProfile, WorkspaceDocument};
use vgt_operations::{OperationError, WorkspaceOperation};

pub mod lifecycle;
pub mod model;
pub mod snapshot;
pub mod transfer;
pub mod transport;

pub use lifecycle::*;
pub use model::*;
pub use snapshot::*;
pub use transfer::*;
pub use transport::*;

/// Deterministic comparison key for ready nodes in Kahn's algorithm
#[derive(Eq, PartialEq)]
struct DeterministicNodeKey<'a> {
    lamport_time: u64,
    actor_id: &'a str,
    op_id: &'a str,
}

impl<'a> Ord for DeterministicNodeKey<'a> {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        self.lamport_time
            .cmp(&other.lamport_time)
            .then_with(|| self.actor_id.cmp(other.actor_id))
            .then_with(|| self.op_id.cmp(other.op_id))
    }
}

impl<'a> PartialOrd for DeterministicNodeKey<'a> {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

/// The collaborative SyncGraph engine
pub struct SyncGraphEngine {
    pub local_actor_id: String,
    pub local_device_id: String,
    pub local_lamport_time: u64,
    pub vector_clock: VectorClock,
    pub nodes: HashMap<String, SyncNode>,
    pub heads: HashSet<String>,
    pub base_document: Option<WorkspaceDocument>,
    pub causal_buffer: Vec<SyncNode>,
    pub membership: MembershipState,
    pub tombstones: TombstoneRegistry,
}

impl SyncGraphEngine {
    pub fn new(local_actor_id: &str) -> Self {
        Self {
            local_actor_id: local_actor_id.to_string(),
            local_device_id: local_actor_id.to_string(),
            local_lamport_time: 0,
            vector_clock: VectorClock::new(),
            nodes: HashMap::new(),
            heads: HashSet::new(),
            base_document: None,
            causal_buffer: Vec::new(),
            membership: MembershipState::default(),
            tombstones: TombstoneRegistry::default(),
        }
    }

    pub fn new_with_base(local_actor_id: &str, base_document: WorkspaceDocument) -> Self {
        Self {
            local_actor_id: local_actor_id.to_string(),
            local_device_id: local_actor_id.to_string(),
            local_lamport_time: 0,
            vector_clock: VectorClock::new(),
            nodes: HashMap::new(),
            heads: HashSet::new(),
            base_document: Some(base_document),
            causal_buffer: Vec::new(),
            membership: MembershipState::default(),
            tombstones: TombstoneRegistry::default(),
        }
    }

    pub fn set_local_device_id(&mut self, device_id: &str) -> Result<(), SyncError> {
        let trimmed = device_id.trim();
        if trimmed.is_empty() || trimmed.len() > 256 || trimmed.chars().any(char::is_control) {
            return Err(SyncError::ResourceBoundary);
        }
        self.local_device_id = trimmed.to_string();
        Ok(())
    }

    pub fn set_base_document(&mut self, doc: WorkspaceDocument) {
        self.base_document = Some(doc);
    }

    pub fn pending_buffer_count(&self) -> usize {
        self.causal_buffer.len()
    }

    /// Record a local operation produced on this device.
    pub fn record_local_operation(
        &mut self,
        doc: &mut WorkspaceDocument,
        op: WorkspaceOperation,
    ) -> Result<SyncNode, SyncError> {
        let (node, _) = self.record_local_operation_with_report(doc, op)?;
        Ok(node)
    }

    /// Record a local operation and return the deterministic reconciliation audit.
    pub fn record_local_operation_with_report(
        &mut self,
        doc: &mut WorkspaceDocument,
        op: WorkspaceOperation,
    ) -> Result<(SyncNode, ReconcileReport), SyncError> {
        if self.base_document.is_none() {
            self.base_document = Some(doc.clone());
        }

        if self.local_lamport_time >= MAX_LOGICAL_TIME
            || self.vector_clock.get(&self.local_actor_id) >= MAX_LOGICAL_TIME
        {
            return Err(SyncError::LogicalClockBoundary);
        }
        self.local_lamport_time += 1;
        self.vector_clock.increment(&self.local_actor_id);

        let op_id = format!("sg2-{:016x}-{}", self.local_lamport_time, Uuid::new_v4());
        let parent_ids: Vec<String> = self.heads.iter().cloned().collect();

        let object_ids = operation_object_ids(&op);
        let node = SyncNode {
            op_id: op_id.clone(),
            actor_id: self.local_actor_id.clone(),
            device_id: self.local_device_id.clone(),
            schema_version: SYNC_SCHEMA_VERSION,
            object_ids,
            lamport_time: self.local_lamport_time,
            parent_ids,
            timestamp_utc: Utc::now().timestamp_millis(),
            document_id: doc.id.clone(),
            signature: None,
            operation: op,
        };

        self.tombstones.observe_node(&node)?;
        self.nodes.insert(op_id.clone(), node.clone());
        self.heads.clear();
        self.heads.insert(op_id);

        let report = self.reconcile_document_with_report(doc)?;
        Ok((node, report))
    }

    /// Merge a remote operation received from LAN/P2P peer or self-hosted Hub.
    pub fn merge_remote_node(
        &mut self,
        doc: &mut WorkspaceDocument,
        node: SyncNode,
    ) -> Result<(), SyncError> {
        self.merge_remote_node_with_report(doc, node).map(|_| ())
    }

    /// Merge a remote operation and return an auditable reconciliation report.
    pub fn merge_remote_node_with_report(
        &mut self,
        doc: &mut WorkspaceDocument,
        node: SyncNode,
    ) -> Result<ReconcileReport, SyncError> {
        if doc.security_policy.profile != SecurityProfile::Standard || !self.membership.members.is_empty() {
            return Err(SyncError::ProtectedPeerRejected);
        }
        self.merge_remote_node_validated(doc, node)
    }

    /// Merge a remote operation after a trusted native transport has authenticated and
    /// suite-bound the peer. `peer` is a native policy assertion, not wire proof; callers must
    /// never construct it from renderer or other untrusted serialized input. The WebView IPC
    /// bridge deliberately does not expose this entry point until a verified transport exists.
    pub fn merge_authenticated_remote_node_with_report(
        &mut self,
        doc: &mut WorkspaceDocument,
        node: SyncNode,
        peer: &AuthenticatedPeerContext,
    ) -> Result<ReconcileReport, SyncError> {
        if !peer.permits_document(doc) {
            return Err(SyncError::ProtectedPeerRejected);
        }
        if !self.membership.members.is_empty() {
            self.membership.authorize_peer(peer, true)?;
        }
        self.merge_remote_node_validated(doc, node)
    }

    fn merge_remote_node_validated(
        &mut self,
        doc: &mut WorkspaceDocument,
        node: SyncNode,
    ) -> Result<ReconcileReport, SyncError> {
        if self.base_document.is_none() {
            self.base_document = Some(doc.clone());
        }

        if node.schema_version > SYNC_SCHEMA_VERSION {
            return Err(SyncError::UnsupportedSchema(node.schema_version));
        }
        if node.schema_version == 0 || node.device_id.trim().is_empty() || node.device_id.len() > 256
            || node.object_ids.is_empty() || node.object_ids.len() > 32
            || node.object_ids.iter().any(|value| value.is_empty() || value.len() > 512 || value.chars().any(char::is_control))
        {
            return Err(SyncError::ResourceBoundary);
        }
        if operation_object_ids(&node.operation) != node.object_ids {
            return Err(SyncError::Operation(OperationError::InvalidTarget(
                "Sync node object identity does not match operation targets".into(),
            )));
        }
        if !node.document_id.is_empty() && node.document_id != doc.id {
            return Err(SyncError::Operation(OperationError::InvalidTarget(
                "Sync node belongs to another document".into(),
            )));
        }

        if node.lamport_time == 0 || node.lamport_time > MAX_LOGICAL_TIME {
            return Err(SyncError::LogicalClockBoundary);
        }

        // Idempotent deduplication / replay protection.
        if self.nodes.contains_key(&node.op_id)
            || self.causal_buffer.iter().any(|buffered| buffered.op_id == node.op_id)
        {
            return Ok(ReconcileReport {
                buffered_count: self.causal_buffer.len(),
                ..ReconcileReport::default()
            });
        }

        // Buffer until every causal parent is available.
        let has_missing_parents = node
            .parent_ids
            .iter()
            .any(|parent| !self.nodes.contains_key(parent));
        if has_missing_parents {
            self.causal_buffer.push(node);
            return Ok(ReconcileReport {
                buffered_count: self.causal_buffer.len(),
                ..ReconcileReport::default()
            });
        }

        self.integrate_node(node)?;
        self.drain_causal_buffer()?;
        self.reconcile_document_with_report(doc)
    }

    fn integrate_node(&mut self, node: SyncNode) -> Result<(), SyncError> {
        self.local_lamport_time = self
            .local_lamport_time
            .max(node.lamport_time)
            .saturating_add(1)
            .min(MAX_LOGICAL_TIME + 1);
        let actor_time = self.vector_clock.get(&node.actor_id).max(node.lamport_time);
        self.vector_clock
            .clock
            .insert(node.actor_id.clone(), actor_time);

        for parent in &node.parent_ids {
            self.heads.remove(parent);
        }
        self.heads.insert(node.op_id.clone());
        self.tombstones.observe_node(&node)?;
        self.nodes.insert(node.op_id.clone(), node);
        Ok(())
    }

    fn drain_causal_buffer(&mut self) -> Result<(), SyncError> {
        let mut progress = true;
        while progress {
            progress = false;
            let mut ready_indices = Vec::new();

            for (idx, buffered) in self.causal_buffer.iter().enumerate() {
                let all_parents_present = buffered
                    .parent_ids
                    .iter()
                    .all(|p| self.nodes.contains_key(p));
                if all_parents_present {
                    ready_indices.push(idx);
                }
            }

            if !ready_indices.is_empty() {
                progress = true;
                ready_indices.sort_unstable();
                let mut ready_nodes: Vec<SyncNode> = ready_indices
                    .into_iter()
                    .rev()
                    .map(|i| self.causal_buffer.remove(i))
                    .collect();

                ready_nodes.sort_by(|a, b| {
                    a.lamport_time
                        .cmp(&b.lamport_time)
                        .then_with(|| a.actor_id.cmp(&b.actor_id))
                        .then_with(|| a.op_id.cmp(&b.op_id))
                });

                for node in ready_nodes {
                    self.integrate_node(node)?;
                }
            }
        }
        Ok(())
    }

    /// Deterministic topological sort with (lamport_time, actor_id, op_id) tie-breaking
    pub fn topological_sort(&self) -> Result<Vec<SyncNode>, SyncError> {
        let mut in_degrees: HashMap<&str, usize> = HashMap::new();
        let mut children_map: HashMap<&str, Vec<&str>> = HashMap::new();

        for (id, node) in &self.nodes {
            let active_parents_count = node
                .parent_ids
                .iter()
                .filter(|p| self.nodes.contains_key(*p))
                .count();
            in_degrees.insert(id.as_str(), active_parents_count);

            for parent in &node.parent_ids {
                if self.nodes.contains_key(parent) {
                    children_map
                        .entry(parent.as_str())
                        .or_default()
                        .push(id.as_str());
                }
            }
        }

        let mut ready: BTreeSet<DeterministicNodeKey> = BTreeSet::new();
        for (id, &deg) in &in_degrees {
            if deg == 0 {
                let node = &self.nodes[*id];
                ready.insert(DeterministicNodeKey {
                    lamport_time: node.lamport_time,
                    actor_id: &node.actor_id,
                    op_id: &node.op_id,
                });
            }
        }

        let mut ordered = Vec::with_capacity(self.nodes.len());

        while let Some(key) = ready.pop_first() {
            let node = self
                .nodes
                .get(key.op_id)
                .ok_or(SyncError::CausalCycleDetected)?
                .clone();
            ordered.push(node);

            if let Some(children) = children_map.get(key.op_id) {
                for child_id in children {
                    if let Some(deg) = in_degrees.get_mut(child_id) {
                        *deg -= 1;
                        if *deg == 0 {
                            let child_node = &self.nodes[*child_id];
                            ready.insert(DeterministicNodeKey {
                                lamport_time: child_node.lamport_time,
                                actor_id: &child_node.actor_id,
                                op_id: &child_node.op_id,
                            });
                        }
                    }
                }
            }
        }

        if ordered.len() != self.nodes.len() {
            return Err(SyncError::CausalCycleDetected);
        }

        Ok(ordered)
    }

    /// Reconciles the given document from base_document by applying all nodes in canonical order.
    pub fn reconcile_document(&self, doc: &mut WorkspaceDocument) -> Result<(), SyncError> {
        self.reconcile_document_with_report(doc).map(|_| ())
    }

    /// Reconcile and expose every benign operation conflict instead of silently discarding it.
    pub fn reconcile_document_with_report(
        &self,
        doc: &mut WorkspaceDocument,
    ) -> Result<ReconcileReport, SyncError> {
        let base = match &self.base_document {
            Some(base) => base.clone(),
            None => doc.clone(),
        };

        let base_version = base.version;
        let base_modified_at = base.modified_at;
        let ordered_nodes = self.topological_sort()?;
        let mut draft = base;
        let mut report = ReconcileReport::default();
        let mut latest_applied_timestamp = base_modified_at;

        for node in ordered_nodes {
            match node.operation.apply_to_draft(&mut draft) {
                Ok(()) => {
                    latest_applied_timestamp = latest_applied_timestamp.max(node.timestamp_utc);
                    report.applied_operation_ids.push(node.op_id.clone());
                }
                Err(error @ OperationError::ObjectNotFound(_))
                | Err(error @ OperationError::InvalidTarget(_))
                | Err(error @ OperationError::Conflict(_)) => {
                    report.conflicts.push(ReconcileConflict {
                        op_id: node.op_id.clone(),
                        actor_id: node.actor_id.clone(),
                        lamport_time: node.lamport_time,
                        reason: error.to_string(),
                    });
                }
                Err(error) => return Err(SyncError::Operation(error)),
            }
        }

        report.buffered_count = self.causal_buffer.len();
        draft.version = base_version.saturating_add(report.applied_operation_ids.len() as u64);
        draft.modified_at = latest_applied_timestamp;
        *doc = draft;
        Ok(report)
    }

    /// Garbage-collect delete tombstones only after every relevant delete is causally acknowledged.
    pub fn garbage_collect_tombstones(&mut self, acknowledged_frontier: &VectorClock) -> usize {
        self.tombstones.garbage_collect(acknowledged_frontier)
    }

    /// Install a snapshot only when it dominates the local causal frontier. Existing graph history is
    /// compacted because the snapshot itself becomes the new authoritative base/checkpoint.
    pub fn bootstrap_from_snapshot(
        &mut self,
        doc: &mut WorkspaceDocument,
        snapshot: &SyncSnapshot,
    ) -> Result<(), SyncError> {
        snapshot.permits_bootstrap_over(&self.vector_clock)?;
        *doc = snapshot.document.clone();
        self.base_document = Some(snapshot.document.clone());
        self.vector_clock = snapshot.frontier.clone();
        self.local_lamport_time = self.vector_clock.clock.values().copied().max().unwrap_or(0);
        self.nodes.clear();
        self.heads.clear();
        self.causal_buffer.clear();
        self.tombstones = TombstoneRegistry::default();
        Ok(())
    }

    /// Compute operations needed by a remote peer based on their vector clock
    pub fn get_missing_operations_for_peer(&self, peer_clock: &VectorClock) -> Vec<SyncNode> {
        let mut missing = Vec::new();
        for node in self.nodes.values() {
            let peer_time = peer_clock.get(&node.actor_id);
            if node.lamport_time > peer_time {
                missing.push(node.clone());
            }
        }
        missing.sort_by(|a, b| {
            a.lamport_time
                .cmp(&b.lamport_time)
                .then_with(|| a.actor_id.cmp(&b.actor_id))
                .then_with(|| a.op_id.cmp(&b.op_id))
        });
        missing
    }
}
