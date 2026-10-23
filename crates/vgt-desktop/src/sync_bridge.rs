// STATUS: DIAMANT VGT SUPREME
//! Native Workspace SyncGraph bridge for configured collaboration transports.
//!
//! The desktop process owns causal graph state. The trusted same-origin main window is the local
//! Standard/no-membership merge trust boundary; protected profiles and established membership
//! fail closed. No authenticated network receive adapter is currently wired into this bridge.

use crate::security_gate_bridge::require_trusted_main_window;
use crate::sync_bridge_support::*;
use crate::{sync_queue_storage, AppState};
use std::collections::{HashMap, VecDeque};
use std::sync::Mutex;
use tauri::{AppHandle, State, WebviewWindow};
use vgt_object_model::WorkspaceDocument;
use vgt_syncgraph::{
    backpressure_decision, BackpressureDecision, OfflineQueueState, QuarantinedFutureOperation,
    ReconcileReport, SyncDiagnostics, SyncGraphEngine, SyncNode, SyncSnapshot,
};

pub struct SyncBridgeState {
    sessions: Mutex<HashMap<String, NativeSyncSession>>,
}

impl Default for SyncBridgeState {
    fn default() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }
}

struct NativeSyncSession {
    actor_id: String,
    document: WorkspaceDocument,
    engine: SyncGraphEngine,
    audit: VecDeque<SyncAuditEntry>,
    offline_queue: OfflineQueueState,
    queue_corrupt_recovered: bool,
    last_report: ReconcileReport,
    ingress_rate: SyncIngressRateLimiter,
}

fn push_audit(
    session: &mut NativeSyncSession,
    direction: SyncAuditDirection,
    node: Option<&SyncNode>,
    report: &ReconcileReport,
) {
    let entry = SyncAuditEntry {
        id: format!(
            "{}:{}:{}",
            node.map(|value| value.op_id.as_str()).unwrap_or("replay"),
            session.audit.len(),
            report.buffered_count
        ),
        timestamp_utc: node.map(|value| value.timestamp_utc).unwrap_or_else(|| {
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|value| value.as_millis() as i64)
                .unwrap_or_default()
        }),
        direction,
        op_id: node.map(|value| value.op_id.clone()),
        actor_id: node.map(|value| value.actor_id.clone()),
        applied_count: report.applied_operation_ids.len(),
        conflicts: report.conflicts.clone(),
        buffered_count: report.buffered_count,
    };
    session.audit.push_back(entry);
    while session.audit.len() > MAX_AUDIT_ENTRIES {
        session.audit.pop_front();
    }
}

fn status(session: &NativeSyncSession) -> SyncStatusResponse {
    let diagnostics = SyncDiagnostics::from_engine(
        &session.engine,
        &session.last_report,
        session.offline_queue.outbound.len(),
        session.offline_queue.total_bytes,
        session.engine.tombstones.len(),
        session.engine.membership.epoch,
        0,
    );
    SyncStatusResponse {
        document: session.document.clone(),
        vector_clock: session.engine.vector_clock.clone(),
        pending_buffer_count: session.engine.pending_buffer_count(),
        node_count: session.engine.nodes.len(),
        audit: session.audit.iter().cloned().collect(),
        offline_queue_count: session.offline_queue.outbound.len(),
        offline_queue_bytes: session.offline_queue.total_bytes,
        queue_corrupt_recovered: session.queue_corrupt_recovered,
        future_quarantine_count: session.offline_queue.future_quarantine.len(),
        tombstone_count: session.engine.tombstones.len(),
        membership_epoch: session.engine.membership.epoch,
        backpressure: backpressure_decision(
            session.offline_queue.outbound.len(),
            session.offline_queue.total_bytes,
            0,
        ),
        diagnostics,
    }
}

fn now_ms_u64() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|value| value.as_millis().min(u128::from(u64::MAX)) as u64)
        .unwrap_or_default()
}

fn persist_session_queue(
    app: &AppHandle,
    app_state: &State<'_, AppState>,
    document_id: &str,
    session: &mut NativeSyncSession,
) -> Result<(), String> {
    session.offline_queue.membership = session.engine.membership.clone();
    session
        .offline_queue
        .replace_inbound_causal(&session.engine.causal_buffer)
        .map_err(|_| "SyncGraph inbound queue exceeds configured bounds".to_string())?;
    sync_queue_storage::persist_queue(
        app,
        app_state,
        document_id,
        session.engine.membership.epoch,
        &session.offline_queue,
    )
}

fn lock_sessions<'a>(
    state: &'a State<'_, SyncBridgeState>,
) -> Result<std::sync::MutexGuard<'a, HashMap<String, NativeSyncSession>>, String> {
    state
        .sessions
        .lock()
        .map_err(|_| "SyncGraph session state is unavailable".to_string())
}

#[tauri::command]
pub fn vgt_sync_open(
    window: WebviewWindow,
    app: AppHandle,
    app_state: State<'_, AppState>,
    state: State<'_, SyncBridgeState>,
    request: SyncOpenRequest,
) -> Result<SyncStatusResponse, String> {
    require_trusted_main_window(&window)?;
    validate_identifier(&request.document.id, "document id")?;
    validate_identifier(&request.actor_id, "actor id")?;
    if let Some(device_id) = request.device_id.as_ref() {
        validate_identifier(device_id, "device id")?;
    }
    validate_serialized_size(&request.document, "Workspace document", MAX_DOCUMENT_BYTES)?;

    let mut sessions = lock_sessions(&state)?;
    if let Some(session) = sessions.get(&request.document.id) {
        if session.actor_id != request.actor_id {
            return Err("SyncGraph session is already owned by another local actor".to_string());
        }
        return Ok(status(session));
    }
    if sessions.len() >= MAX_SYNC_SESSIONS {
        return Err("Maximum number of local SyncGraph sessions reached".to_string());
    }

    let document_id = request.document.id.clone();
    let (offline_queue, queue_corrupt_recovered) =
        sync_queue_storage::load_queue(&app, &app_state, &document_id)?;
    let mut engine = SyncGraphEngine::new_with_base(&request.actor_id, request.document.clone());
    let local_device_id = request.device_id.as_deref().unwrap_or(&request.actor_id);
    engine
        .set_local_device_id(local_device_id)
        .map_err(|_| "SyncGraph local device identity rejected".to_string())?;
    engine.membership = offline_queue.membership.clone();
    engine.causal_buffer = offline_queue.inbound_causal.iter().cloned().collect();
    sessions.insert(
        document_id.clone(),
        NativeSyncSession {
            actor_id: request.actor_id,
            document: request.document,
            engine,
            audit: VecDeque::new(),
            offline_queue,
            queue_corrupt_recovered,
            last_report: ReconcileReport::default(),
            ingress_rate: SyncIngressRateLimiter::default(),
        },
    );
    sessions
        .get(&document_id)
        .map(status)
        .ok_or_else(|| "SyncGraph session could not be initialized".to_string())
}

#[tauri::command]
pub fn vgt_sync_record(
    window: WebviewWindow,
    app: AppHandle,
    app_state: State<'_, AppState>,
    state: State<'_, SyncBridgeState>,
    request: SyncRecordRequest,
) -> Result<SyncRecordResponse, String> {
    require_trusted_main_window(&window)?;
    validate_identifier(&request.document_id, "document id")?;
    validate_serialized_size(
        &request.operation,
        "Workspace operation",
        MAX_OPERATION_BYTES,
    )?;
    let mut sessions = lock_sessions(&state)?;
    let session = sessions
        .get_mut(&request.document_id)
        .ok_or_else(|| "SyncGraph session is not open".to_string())?;
    if session.engine.nodes.len() >= MAX_GRAPH_NODES {
        return Err("SyncGraph operation history reached the configured boundary".to_string());
    }
    if backpressure_decision(
        session.offline_queue.outbound.len(),
        session.offline_queue.total_bytes,
        0,
    ) == BackpressureDecision::Pause
    {
        return Err("SyncGraph offline queue is applying backpressure".to_string());
    }

    let (node, report) = session
        .engine
        .record_local_operation_with_report(&mut session.document, request.operation)
        .map_err(|error| format!("SyncGraph local operation rejected: {error}"))?;
    session
        .offline_queue
        .enqueue(node.clone(), now_ms_u64())
        .map_err(|_| "SyncGraph offline queue boundary reached".to_string())?;
    session.last_report = report.clone();
    push_audit(session, SyncAuditDirection::Local, Some(&node), &report);
    persist_session_queue(&app, &app_state, &request.document_id, session)?;

    Ok(SyncRecordResponse {
        document: session.document.clone(),
        node,
        vector_clock: session.engine.vector_clock.clone(),
        report,
    })
}

#[tauri::command]
pub fn vgt_sync_merge(
    window: WebviewWindow,
    app: AppHandle,
    app_state: State<'_, AppState>,
    state: State<'_, SyncBridgeState>,
    request: SyncMergeRequest,
) -> Result<SyncMergeResponse, String> {
    require_trusted_main_window(&window)?;
    validate_identifier(&request.document_id, "document id")?;
    let mut sessions = lock_sessions(&state)?;
    let session = sessions
        .get_mut(&request.document_id)
        .ok_or_else(|| "SyncGraph session is not open".to_string())?;
    let node = request.node;
    let already_known = session.engine.nodes.contains_key(&node.op_id)
        || session
            .engine
            .causal_buffer
            .iter()
            .any(|buffered| buffered.op_id == node.op_id);
    session
        .ingress_rate
        .check(node.device_id.as_str(), now_ms_u64(), already_known)?;
    validate_sync_node(&node, &request.document_id)?;
    if !already_known && session.engine.nodes.len() >= MAX_GRAPH_NODES {
        return Err("SyncGraph operation history reached the configured boundary".to_string());
    }
    if !already_known && session.engine.causal_buffer.len() >= MAX_CAUSAL_BUFFER_NODES {
        return Err("SyncGraph causal buffer reached the configured boundary".to_string());
    }
    let report = session
        .engine
        .merge_remote_node_with_report(&mut session.document, node.clone())
        .map_err(|error| format!("SyncGraph remote operation rejected: {error}"))?;
    session.last_report = report.clone();
    push_audit(session, SyncAuditDirection::Remote, Some(&node), &report);
    persist_session_queue(&app, &app_state, &request.document_id, session)?;

    Ok(SyncMergeResponse {
        document: session.document.clone(),
        vector_clock: session.engine.vector_clock.clone(),
        report,
    })
}

#[tauri::command]
pub fn vgt_sync_missing(
    window: WebviewWindow,
    app: AppHandle,
    app_state: State<'_, AppState>,
    state: State<'_, SyncBridgeState>,
    request: SyncMissingRequest,
) -> Result<SyncMissingResponse, String> {
    require_trusted_main_window(&window)?;
    validate_identifier(&request.document_id, "document id")?;
    validate_vector_clock(&request.peer_clock)?;
    let mut sessions = lock_sessions(&state)?;
    let session = sessions
        .get_mut(&request.document_id)
        .ok_or_else(|| "SyncGraph session is not open".to_string())?;
    session.offline_queue.acknowledge(&request.peer_clock);
    let mut nodes = session
        .engine
        .get_missing_operations_for_peer(&request.peer_clock);
    let mut known: std::collections::HashSet<String> =
        nodes.iter().map(|node| node.op_id.clone()).collect();
    for queued in session
        .offline_queue
        .next_ready(now_ms_u64(), MAX_MISSING_BATCH * 2)
    {
        if request.peer_clock.get(&queued.actor_id) < queued.lamport_time
            && known.insert(queued.op_id.clone())
        {
            nodes.push(queued);
        }
    }
    nodes.sort_by(|left, right| {
        left.lamport_time
            .cmp(&right.lamport_time)
            .then_with(|| left.actor_id.cmp(&right.actor_id))
            .then_with(|| left.op_id.cmp(&right.op_id))
    });
    let has_more = nodes.len() > MAX_MISSING_BATCH;
    nodes.truncate(MAX_MISSING_BATCH);
    persist_session_queue(&app, &app_state, &request.document_id, session)?;
    Ok(SyncMissingResponse { nodes, has_more })
}

#[tauri::command]
pub fn vgt_sync_quarantine_future(
    window: WebviewWindow,
    app: AppHandle,
    app_state: State<'_, AppState>,
    state: State<'_, SyncBridgeState>,
    request: SyncFutureQuarantineRequest,
) -> Result<SyncFutureQuarantineResponse, String> {
    require_trusted_main_window(&window)?;
    let encoded_bytes = validate_future_quarantine_request(&request)?;
    let mut sessions = lock_sessions(&state)?;
    let session = sessions
        .get_mut(&request.document_id)
        .ok_or_else(|| "SyncGraph session is not open".to_string())?;
    if session.offline_queue.future_quarantine.len() >= MAX_FUTURE_QUARANTINE {
        return Err("SyncGraph future-operation quarantine boundary reached".to_string());
    }
    let entry = QuarantinedFutureOperation {
        document_id: request.document_id.clone(),
        op_id: request.operation_id,
        schema_version: request.schema_version,
        received_at_ms: now_ms_u64(),
        raw: request.raw,
        encoded_bytes,
    };
    session
        .offline_queue
        .quarantine_future(entry)
        .map_err(|_| "SyncGraph future operation could not be quarantined".to_string())?;
    persist_session_queue(&app, &app_state, &request.document_id, session)?;
    Ok(SyncFutureQuarantineResponse {
        future_quarantine_count: session.offline_queue.future_quarantine.len(),
    })
}

#[tauri::command]
pub fn vgt_sync_status(
    window: WebviewWindow,
    state: State<'_, SyncBridgeState>,
    request: SyncDocumentRequest,
) -> Result<SyncStatusResponse, String> {
    require_trusted_main_window(&window)?;
    validate_identifier(&request.document_id, "document id")?;
    let sessions = lock_sessions(&state)?;
    sessions
        .get(&request.document_id)
        .map(status)
        .ok_or_else(|| "SyncGraph session is not open".to_string())
}

#[tauri::command]
pub fn vgt_sync_close(
    window: WebviewWindow,
    app: AppHandle,
    app_state: State<'_, AppState>,
    state: State<'_, SyncBridgeState>,
    request: SyncDocumentRequest,
) -> Result<bool, String> {
    require_trusted_main_window(&window)?;
    validate_identifier(&request.document_id, "document id")?;
    let mut sessions = lock_sessions(&state)?;
    if let Some(session) = sessions.get_mut(&request.document_id) {
        persist_session_queue(&app, &app_state, &request.document_id, session)?;
    }
    Ok(sessions.remove(&request.document_id).is_some())
}

#[tauri::command]
pub fn vgt_sync_snapshot(
    window: WebviewWindow,
    state: State<'_, SyncBridgeState>,
    request: SyncDocumentRequest,
) -> Result<SyncSnapshot, String> {
    require_trusted_main_window(&window)?;
    validate_identifier(&request.document_id, "document id")?;
    let sessions = lock_sessions(&state)?;
    let session = sessions
        .get(&request.document_id)
        .ok_or_else(|| "SyncGraph session is not open".to_string())?;
    SyncSnapshot::capture(
        &session.document,
        &session.engine.vector_clock,
        session.engine.membership.epoch,
        now_ms_u64().min(i64::MAX as u64) as i64,
    )
    .map_err(|_| "SyncGraph snapshot creation failed".to_string())
}

#[tauri::command]
pub fn vgt_sync_bootstrap(
    window: WebviewWindow,
    app: AppHandle,
    app_state: State<'_, AppState>,
    state: State<'_, SyncBridgeState>,
    request: SyncSnapshotBootstrapRequest,
) -> Result<SyncStatusResponse, String> {
    require_trusted_main_window(&window)?;
    validate_identifier(&request.document_id, "document id")?;
    validate_serialized_size(
        &request.snapshot,
        "Sync snapshot",
        MAX_DOCUMENT_BYTES + 2 * 1024 * 1024,
    )?;
    let mut sessions = lock_sessions(&state)?;
    let session = sessions
        .get_mut(&request.document_id)
        .ok_or_else(|| "SyncGraph session is not open".to_string())?;
    if request.snapshot.document.id != request.document_id {
        return Err("SyncGraph snapshot belongs to another document".to_string());
    }
    if request.snapshot.membership_epoch != session.engine.membership.epoch {
        return Err("SyncGraph snapshot membership epoch is stale or incompatible".to_string());
    }
    session
        .engine
        .bootstrap_from_snapshot(&mut session.document, &request.snapshot)
        .map_err(|_| "SyncGraph snapshot bootstrap rejected".to_string())?;
    session
        .offline_queue
        .acknowledge(&request.snapshot.frontier);
    session.offline_queue.frontier = request.snapshot.frontier;
    session.offline_queue.inbound_causal.clear();
    session.last_report = ReconcileReport::default();
    persist_session_queue(&app, &app_state, &request.document_id, session)?;
    Ok(status(session))
}

#[tauri::command]
pub fn vgt_sync_gc(
    window: WebviewWindow,
    state: State<'_, SyncBridgeState>,
    request: SyncGarbageCollectRequest,
) -> Result<usize, String> {
    require_trusted_main_window(&window)?;
    validate_identifier(&request.document_id, "document id")?;
    validate_vector_clock(&request.acknowledged_frontier)?;
    let mut sessions = lock_sessions(&state)?;
    let session = sessions
        .get_mut(&request.document_id)
        .ok_or_else(|| "SyncGraph session is not open".to_string())?;
    Ok(session
        .engine
        .garbage_collect_tombstones(&request.acknowledged_frontier))
}

#[tauri::command]
pub fn vgt_sync_membership_change(
    window: WebviewWindow,
    app: AppHandle,
    app_state: State<'_, AppState>,
    state: State<'_, SyncBridgeState>,
    request: SyncMembershipRequest,
) -> Result<SyncMembershipResponse, String> {
    require_trusted_main_window(&window)?;
    validate_identifier(&request.document_id, "document id")?;
    let mut sessions = lock_sessions(&state)?;
    let session = sessions
        .get_mut(&request.document_id)
        .ok_or_else(|| "SyncGraph session is not open".to_string())?;
    if !permits_local_membership_bootstrap(&session.engine.membership, &request.change) {
        return Err(
            "SyncGraph membership change requires native authenticated owner context".to_string(),
        );
    }
    let old_epoch = session.engine.membership.epoch;

    let new_epoch = match request.change {
        SyncMembershipAction::AddMember { member_id, role } => {
            validate_identifier(&member_id, "member id")?;
            session.engine.membership.add_member(&member_id, role)
        }
        SyncMembershipAction::AddDevice {
            member_id,
            device_id,
            key_id,
        } => {
            validate_identifier(&member_id, "member id")?;
            validate_identifier(&device_id, "device id")?;
            validate_identifier(&key_id, "key id")?;
            session
                .engine
                .membership
                .add_device(&member_id, &device_id, &key_id)
        }
        SyncMembershipAction::RevokeDevice {
            member_id,
            device_id,
        } => {
            validate_identifier(&member_id, "member id")?;
            validate_identifier(&device_id, "device id")?;
            session
                .engine
                .membership
                .revoke_device(&member_id, &device_id)
        }
        SyncMembershipAction::RemoveMember { member_id } => {
            validate_identifier(&member_id, "member id")?;
            session.engine.membership.remove_member(&member_id)
        }
    }
    .map_err(|_| "SyncGraph membership change rejected".to_string())?;

    // Membership epochs are authenticated in queue/transport envelopes. Old-epoch queued material
    // is intentionally not silently rebound to a new member set; rekey starts from a clean queue.
    let queue_rekey_required = new_epoch != old_epoch;
    if queue_rekey_required {
        session.offline_queue = OfflineQueueState::default();
        session.offline_queue.membership = session.engine.membership.clone();
        session.ingress_rate = SyncIngressRateLimiter::default();
        sync_queue_storage::delete_queue(&app, &request.document_id)?;
        persist_session_queue(&app, &app_state, &request.document_id, session)?;
    }
    Ok(SyncMembershipResponse {
        membership_epoch: new_epoch,
        queue_rekey_required,
    })
}
