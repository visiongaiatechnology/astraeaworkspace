//! VGT Workspace Fabric / Live Object Linking authoritative core.
//!
//! Security invariants:
//! - live references never require embedded source payloads;
//! - permission loss never falls back to an implicit cached secret snapshot;
//! - remote retrieval requires an explicit transport capability;
//! - every live edge participates in cycle detection;
//! - propagation is coalesced by source identity/version;
//! - exported foreign representations never contain private Workspace metadata.

use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use thiserror::Error;
use vgt_object_model::{ReferenceMode, WorkspaceDocument, WorkspaceObject, WorkspaceReferenceObject};

pub const FABRIC_CONTRACT: &str = "VGT-WORKSPACE-FABRIC-1";
pub const MAX_LINKS: usize = 100_000;
pub const MAX_BATCH_CHANGES: usize = 16_384;
pub const MAX_IDENTIFIER_BYTES: usize = 192;
pub const MAX_EXTERNAL_TEXT_BYTES: usize = 1_048_576;

#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum FabricError {
    #[error("fabric-input-invalid")]
    InvalidInput,
    #[error("fabric-link-limit")]
    LinkLimit,
    #[error("fabric-cycle")]
    Cycle,
    #[error("fabric-permission-denied")]
    PermissionDenied,
    #[error("fabric-transport-capability-required")]
    TransportCapabilityRequired,
    #[error("fabric-source-unavailable")]
    SourceUnavailable,
    #[error("fabric-source-broken")]
    SourceBroken,
    #[error("fabric-type-mismatch")]
    TypeMismatch,
    #[error("fabric-snapshot-required")]
    SnapshotRequired,
    #[error("fabric-export-policy-denied")]
    ExportPolicyDenied,
}

fn valid_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= MAX_IDENTIFIER_BYTES
        && value.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b':' | b'~'))
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "kebab-case")]
pub enum PermissionRole {
    None,
    Viewer,
    Commenter,
    Editor,
    Owner,
}

impl PermissionRole {
    pub fn bounded_by(self, source: Self) -> Self { std::cmp::min(self, source) }
    pub fn can_read(self) -> bool { self >= Self::Viewer }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PermissionProvenance {
    pub source_document_id: String,
    pub source_policy_version: Option<u64>,
    pub source_role_ceiling: PermissionRole,
    pub snapshot_explicitly_embedded: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct LinkIdentity {
    pub contract: String,
    pub source_document_id: String,
    pub source_object_id: String,
    pub source_version: Option<u64>,
    pub source_snapshot_id: Option<String>,
    pub expected_type: Option<String>,
    pub mode: ReferenceMode,
    pub permission_provenance: PermissionProvenance,
}

impl LinkIdentity {
    pub fn new(
        source_document_id: String,
        source_object_id: String,
        source_version: Option<u64>,
        source_snapshot_id: Option<String>,
        expected_type: Option<String>,
        mode: ReferenceMode,
        permission_provenance: PermissionProvenance,
    ) -> Result<Self, FabricError> {
        if !valid_id(&source_document_id) || !valid_id(&source_object_id) { return Err(FabricError::InvalidInput); }
        if let Some(id) = &source_snapshot_id { if !valid_id(id) { return Err(FabricError::InvalidInput); } }
        if let Some(kind) = &expected_type { if kind.is_empty() || kind.len() > 96 { return Err(FabricError::InvalidInput); } }
        if permission_provenance.source_document_id != source_document_id { return Err(FabricError::InvalidInput); }
        if mode == ReferenceMode::Live && permission_provenance.snapshot_explicitly_embedded {
            // Explicit live fallback snapshots are allowed only through the separate export/embed flow.
            // A newly-created live identity must not silently copy secret source content.
            return Err(FabricError::InvalidInput);
        }
        Ok(Self { contract: FABRIC_CONTRACT.into(), source_document_id, source_object_id, source_version, source_snapshot_id, expected_type, mode, permission_provenance })
    }

    pub fn canonical_uri(&self) -> String {
        format!("vgt://workspace/document/{}/object/{}", self.source_document_id, self.source_object_id)
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum LinkStatus { Current, Changed, Unavailable, PermissionLost, Broken, Frozen }

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TransportCapability {
    pub capability_id: String,
    pub source_document_id: String,
    pub expires_at_ms: Option<u64>,
}

impl TransportCapability {
    pub fn permits(&self, source_document_id: &str, now_ms: u64) -> bool {
        valid_id(&self.capability_id)
            && self.source_document_id == source_document_id
            && self.expires_at_ms.map(|value| value >= now_ms).unwrap_or(true)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ResolutionInput {
    pub identity: LinkIdentity,
    pub resolved_source_version: Option<u64>,
    pub source_document_version: Option<u64>,
    pub source_object_type: Option<String>,
    pub source_available_locally: bool,
    pub source_requires_transport: bool,
    pub transport_capability: Option<TransportCapability>,
    pub actor_source_role: PermissionRole,
    pub target_role: PermissionRole,
    pub explicit_snapshot_embedded: bool,
    pub snapshot_payload: Option<serde_json::Value>,
    pub now_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ResolutionOutcome {
    pub status: LinkStatus,
    pub effective_role: PermissionRole,
    pub source_version: Option<u64>,
    pub payload: Option<serde_json::Value>,
    pub stale: bool,
}

pub fn resolve(input: ResolutionInput) -> Result<ResolutionOutcome, FabricError> {
    let effective_role = input.target_role.bounded_by(input.actor_source_role);
    if input.identity.mode == ReferenceMode::Frozen {
        let payload = if input.explicit_snapshot_embedded { input.snapshot_payload } else { None };
        if payload.is_none() { return Err(FabricError::SnapshotRequired); }
        return Ok(ResolutionOutcome { status: LinkStatus::Frozen, effective_role, source_version: input.identity.source_version, payload, stale: false });
    }
    if !effective_role.can_read() {
        return Ok(ResolutionOutcome { status: LinkStatus::PermissionLost, effective_role, source_version: input.source_document_version, payload: None, stale: true });
    }
    if input.source_requires_transport {
        let allowed = input.transport_capability.as_ref().map(|cap| cap.permits(&input.identity.source_document_id, input.now_ms)).unwrap_or(false);
        if !allowed {
            return Ok(ResolutionOutcome { status: LinkStatus::Unavailable, effective_role, source_version: input.source_document_version, payload: None, stale: true });
        }
    }
    if !input.source_available_locally && !input.source_requires_transport {
        return Ok(ResolutionOutcome { status: LinkStatus::Unavailable, effective_role, source_version: input.source_document_version, payload: None, stale: true });
    }
    let source_type = match input.source_object_type {
        Some(value) => value,
        None => return Ok(ResolutionOutcome { status: LinkStatus::Broken, effective_role, source_version: input.source_document_version, payload: None, stale: true }),
    };
    if input.identity.expected_type.as_ref().map(|expected| expected != &source_type).unwrap_or(false) {
        return Ok(ResolutionOutcome { status: LinkStatus::Broken, effective_role, source_version: input.source_document_version, payload: None, stale: true });
    }
    let changed = match (input.resolved_source_version, input.source_document_version) {
        (Some(resolved), Some(current)) => current > resolved,
        (None, Some(_)) => true,
        _ => false,
    };
    Ok(ResolutionOutcome { status: if changed { LinkStatus::Changed } else { LinkStatus::Current }, effective_role, source_version: input.source_document_version, payload: None, stale: changed })
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct FabricUpdateNotice {
    pub source_doc_id: String,
    pub source_object_id: String,
    pub target_doc_id: String,
    pub target_reference_id: String,
    pub mode: ReferenceMode,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DependencyEdge {
    pub source_document_id: String,
    pub source_object_id: String,
    pub target_document_id: String,
    pub target_reference_id: String,
    pub mode: ReferenceMode,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct DependencyGraph {
    pub nodes: BTreeSet<String>,
    pub edges: Vec<DependencyEdge>,
    pub cycles: Vec<Vec<String>>,
}

impl DependencyGraph {
    pub fn from_edges(edges: Vec<DependencyEdge>) -> Result<Self, FabricError> {
        if edges.len() > MAX_LINKS { return Err(FabricError::LinkLimit); }
        let mut graph = Self::default();
        for edge in edges {
            if !valid_id(&edge.source_document_id) || !valid_id(&edge.source_object_id) || !valid_id(&edge.target_document_id) || !valid_id(&edge.target_reference_id) { return Err(FabricError::InvalidInput); }
            graph.nodes.insert(edge.source_document_id.clone());
            graph.nodes.insert(edge.target_document_id.clone());
            graph.edges.push(edge);
        }
        graph.cycles = detect_cycles(&graph.edges);
        Ok(graph)
    }

    pub fn assert_acyclic(&self) -> Result<(), FabricError> {
        if self.cycles.is_empty() { Ok(()) } else { Err(FabricError::Cycle) }
    }
}

fn detect_cycles(edges: &[DependencyEdge]) -> Vec<Vec<String>> {
    let mut adjacency: BTreeMap<&str, Vec<&str>> = BTreeMap::new();
    for edge in edges.iter().filter(|edge| edge.mode == ReferenceMode::Live) {
        adjacency.entry(&edge.source_document_id).or_default().push(&edge.target_document_id);
    }
    let mut cycles = Vec::new();
    let mut seen_keys = BTreeSet::new();
    fn walk<'a>(node: &'a str, adjacency: &BTreeMap<&'a str, Vec<&'a str>>, stack: &mut Vec<&'a str>, active: &mut BTreeSet<&'a str>, done: &mut BTreeSet<&'a str>, cycles: &mut Vec<Vec<String>>, seen_keys: &mut BTreeSet<String>) {
        if done.contains(node) { return; }
        if !active.insert(node) {
            if let Some(pos) = stack.iter().position(|item| *item == node) {
                let mut cycle: Vec<String> = stack[pos..].iter().map(|value| (*value).to_string()).collect();
                cycle.push(node.to_string());
                let key = cycle.join("->");
                if seen_keys.insert(key) { cycles.push(cycle); }
            }
            return;
        }
        stack.push(node);
        if let Some(next) = adjacency.get(node) {
            for child in next { walk(child, adjacency, stack, active, done, cycles, seen_keys); }
        }
        stack.pop(); active.remove(node); done.insert(node);
    }
    let mut active = BTreeSet::new(); let mut done = BTreeSet::new();
    for node in adjacency.keys().copied().collect::<Vec<_>>() { walk(node, &adjacency, &mut Vec::new(), &mut active, &mut done, &mut cycles, &mut seen_keys); }
    cycles
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SourceChange {
    pub source_document_id: String,
    pub source_object_id: String,
    pub source_version: u64,
}

pub fn coalesce_changes(changes: impl IntoIterator<Item = SourceChange>) -> Result<Vec<SourceChange>, FabricError> {
    let mut latest: BTreeMap<(String, String), SourceChange> = BTreeMap::new();
    for change in changes {
        if latest.len() >= MAX_BATCH_CHANGES && !latest.contains_key(&(change.source_document_id.clone(), change.source_object_id.clone())) { return Err(FabricError::LinkLimit); }
        if !valid_id(&change.source_document_id) || !valid_id(&change.source_object_id) { return Err(FabricError::InvalidInput); }
        let key = (change.source_document_id.clone(), change.source_object_id.clone());
        match latest.get(&key) {
            Some(previous) if previous.source_version >= change.source_version => {}
            _ => { latest.insert(key, change); }
        }
    }
    Ok(latest.into_values().collect())
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum TransferChoice { LiveLink, CopySnapshot }

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TransferPlan {
    pub source_document_id: String,
    pub source_object_id: String,
    pub target_document_id: String,
    pub source_type: String,
    pub allowed: Vec<TransferChoice>,
    pub preferred: TransferChoice,
}

pub fn plan_transfer(source_document_id: &str, source_object_id: &str, target_document_id: &str, source_type: &str, source_role: PermissionRole, target_role: PermissionRole) -> Result<TransferPlan, FabricError> {
    if !valid_id(source_document_id) || !valid_id(source_object_id) || !valid_id(target_document_id) || source_type.is_empty() || source_type.len() > 96 { return Err(FabricError::InvalidInput); }
    if !target_role.bounded_by(source_role).can_read() { return Err(FabricError::PermissionDenied); }
    let same_document = source_document_id == target_document_id;
    Ok(TransferPlan {
        source_document_id: source_document_id.into(), source_object_id: source_object_id.into(), target_document_id: target_document_id.into(), source_type: source_type.into(),
        allowed: if same_document { vec![TransferChoice::CopySnapshot] } else { vec![TransferChoice::LiveLink, TransferChoice::CopySnapshot] },
        preferred: if same_document { TransferChoice::CopySnapshot } else { TransferChoice::LiveLink },
    })
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ClipboardRepresentation { pub mime: String, pub text: String }

fn truncate_text(mut value: String) -> String {
    while value.len() > MAX_EXTERNAL_TEXT_BYTES { value.pop(); }
    value
}

fn escape_html(value: &str) -> String {
    value.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;").replace('\'', "&#39;")
}

/// Safe external clipboard deliberately emits only interoperable, non-secret representations.
/// Internal Workspace semantic transfer uses `TransferPlan`, never this payload.
pub fn external_clipboard(text: &str) -> Vec<ClipboardRepresentation> {
    let plain = truncate_text(text.replace('\0', ""));
    let html = truncate_text(format!("<p>{}</p>", escape_html(&plain)));
    vec![ClipboardRepresentation { mime: "text/plain".into(), text: plain }, ClipboardRepresentation { mime: "text/html".into(), text: html }]
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ExportLinkPolicy { RefreshThenFreeze, FreezeCurrent, PreserveLiveLocalOnly }

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ExportDecision {
    pub policy: ExportLinkPolicy,
    pub requires_refresh: bool,
    pub requires_snapshot: bool,
    pub may_preserve_live_link: bool,
}

pub fn export_decision(policy: ExportLinkPolicy, destination_is_workspace_native: bool, source_role: PermissionRole) -> Result<ExportDecision, FabricError> {
    if !source_role.can_read() { return Err(FabricError::PermissionDenied); }
    match policy {
        ExportLinkPolicy::RefreshThenFreeze => Ok(ExportDecision { policy, requires_refresh: true, requires_snapshot: true, may_preserve_live_link: false }),
        ExportLinkPolicy::FreezeCurrent => Ok(ExportDecision { policy, requires_refresh: false, requires_snapshot: true, may_preserve_live_link: false }),
        ExportLinkPolicy::PreserveLiveLocalOnly if destination_is_workspace_native => Ok(ExportDecision { policy, requires_refresh: false, requires_snapshot: false, may_preserve_live_link: true }),
        ExportLinkPolicy::PreserveLiveLocalOnly => Err(FabricError::ExportPolicyDenied),
    }
}

/// Runtime subscription index used by vgt-core. Security/permission decisions remain in the
/// pure functions above, keeping subscriptions free of copied source payloads.
#[derive(Default)]
pub struct WorkspaceFabric {
    subscriptions: HashMap<String, Vec<(String, String, ReferenceMode)>>,
}

impl WorkspaceFabric {
    pub fn new() -> Self { Self::default() }

    fn has_document_path(&self, from_doc_id: &str, to_doc_id: &str) -> bool {
        let mut stack = vec![from_doc_id.to_string()]; let mut visited = HashSet::new();
        while let Some(current) = stack.pop() {
            if current == to_doc_id { return true; }
            if !visited.insert(current.clone()) { continue; }
            for (source_uri, subscribers) in &self.subscriptions {
                let Ok((source_doc_id, _)) = WorkspaceReferenceObject::parse_uri(source_uri) else { continue; };
                if source_doc_id != current { continue; }
                for (target_doc_id, _, mode) in subscribers { if *mode == ReferenceMode::Live { stack.push(target_doc_id.clone()); } }
            }
        }
        false
    }

    pub fn would_create_cycle(&self, source_doc_id: &str, target_doc_id: &str) -> bool {
        source_doc_id == target_doc_id || self.has_document_path(target_doc_id, source_doc_id)
    }

    pub fn register_link(&mut self, target_doc_id: &str, target_reference_id: &str, source_uri: &str, mode: ReferenceMode) {
        if self.subscriptions.len() >= MAX_LINKS || !valid_id(target_doc_id) || !valid_id(target_reference_id) || WorkspaceReferenceObject::parse_uri(source_uri).is_err() { return; }
        let entry = self.subscriptions.entry(source_uri.to_string()).or_default();
        if !entry.iter().any(|(d, r, _)| d == target_doc_id && r == target_reference_id) { entry.push((target_doc_id.to_string(), target_reference_id.to_string(), mode)); }
    }

    pub fn notify_object_changed(&self, source_doc_id: &str, source_object_id: &str) -> Vec<FabricUpdateNotice> {
        let uri = format!("vgt://workspace/document/{}/object/{}", source_doc_id, source_object_id);
        self.subscriptions.get(&uri).into_iter().flat_map(|subscribers| subscribers.iter()).map(|(target_doc, target_ref, mode)| FabricUpdateNotice {
            source_doc_id: source_doc_id.to_string(), source_object_id: source_object_id.to_string(), target_doc_id: target_doc.clone(), target_reference_id: target_ref.clone(), mode: *mode,
            message: "source-changed".into(),
        }).collect()
    }
}

/// Helper that extracts a dependency graph from canonical WOM documents without copying payloads.
pub fn graph_from_documents(documents: &HashMap<String, WorkspaceDocument>) -> Result<DependencyGraph, FabricError> {
    let mut edges = Vec::new();
    for (target_document_id, document) in documents {
        for (target_reference_id, object) in &document.objects {
            if let WorkspaceObject::WorkspaceReference(reference) = object {
                let (source_document_id, source_object_id) = WorkspaceReferenceObject::parse_uri(&reference.uri).map_err(|_| FabricError::InvalidInput)?;
                edges.push(DependencyEdge { source_document_id, source_object_id, target_document_id: target_document_id.clone(), target_reference_id: target_reference_id.clone(), mode: reference.mode });
            }
        }
    }
    DependencyGraph::from_edges(edges)
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct LinkRecord {
    pub identity: LinkIdentity,
    pub resolved_source_version: Option<u64>,
    pub status: LinkStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ChangeView {
    pub source_document_id: String,
    pub source_object_id: String,
    pub from_version: Option<u64>,
    pub to_version: Option<u64>,
    pub status: LinkStatus,
    pub changed: bool,
}

impl LinkRecord {
    pub fn open_source(&self, effective_role: PermissionRole) -> Result<(&str, &str), FabricError> {
        if !effective_role.can_read() { return Err(FabricError::PermissionDenied); }
        if matches!(self.status, LinkStatus::Unavailable | LinkStatus::Broken) { return Err(FabricError::SourceUnavailable); }
        Ok((&self.identity.source_document_id, &self.identity.source_object_id))
    }

    pub fn view_changes(&self, source_version: Option<u64>) -> ChangeView {
        ChangeView {
            source_document_id: self.identity.source_document_id.clone(),
            source_object_id: self.identity.source_object_id.clone(),
            from_version: self.resolved_source_version,
            to_version: source_version,
            status: self.status,
            changed: source_version.zip(self.resolved_source_version).map(|(now, old)| now > old).unwrap_or(self.status == LinkStatus::Changed),
        }
    }

    pub fn refresh(&self, source_version: u64, source_type: &str, effective_role: PermissionRole) -> Result<Self, FabricError> {
        if self.identity.mode == ReferenceMode::Frozen { return Ok(self.clone()); }
        if !effective_role.can_read() { return Err(FabricError::PermissionDenied); }
        if self.identity.expected_type.as_deref().map(|expected| expected != source_type).unwrap_or(false) { return Err(FabricError::TypeMismatch); }
        let mut next = self.clone();
        next.identity.source_version = Some(source_version);
        next.identity.source_snapshot_id = None;
        next.identity.permission_provenance.snapshot_explicitly_embedded = false;
        next.resolved_source_version = Some(source_version);
        next.status = LinkStatus::Current;
        Ok(next)
    }

    pub fn freeze(&self, source_version: u64, source_type: &str, snapshot_id: &str, effective_role: PermissionRole) -> Result<Self, FabricError> {
        if !effective_role.can_read() || !valid_id(snapshot_id) { return Err(FabricError::PermissionDenied); }
        if self.identity.expected_type.as_deref().map(|expected| expected != source_type).unwrap_or(false) { return Err(FabricError::TypeMismatch); }
        let mut next = self.clone();
        next.identity.mode = ReferenceMode::Frozen;
        next.identity.source_version = Some(source_version);
        next.identity.source_snapshot_id = Some(snapshot_id.to_string());
        next.identity.permission_provenance.snapshot_explicitly_embedded = true;
        next.resolved_source_version = Some(source_version);
        next.status = LinkStatus::Frozen;
        Ok(next)
    }

    pub fn relink(&self, identity: LinkIdentity, source_version: u64, source_type: &str, effective_role: PermissionRole) -> Result<Self, FabricError> {
        if !effective_role.can_read() { return Err(FabricError::PermissionDenied); }
        if identity.expected_type.as_deref().map(|expected| expected != source_type).unwrap_or(false) { return Err(FabricError::TypeMismatch); }
        let status = if identity.mode == ReferenceMode::Frozen { LinkStatus::Frozen } else { LinkStatus::Current };
        Ok(Self { identity, resolved_source_version: Some(source_version), status })
    }

    pub fn can_break(&self, source_readable: bool, explicit_snapshot_available: bool) -> Result<(), FabricError> {
        if source_readable || explicit_snapshot_available { Ok(()) } else { Err(FabricError::SnapshotRequired) }
    }
}
