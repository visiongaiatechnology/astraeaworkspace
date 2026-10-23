//! Native Automation Runtime bridge. The WebView designs flows; activation and queue policy live here.
use crate::diagnostics_bridge::DiagnosticsReleaseState;
use crate::policy_bridge::PolicyRuntimeState;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::sync::Mutex;
use tauri::State;
use vgt_automation_runtime::{
    validate_and_activate, ActivatedFlow, DeliverySemantics, FlowIr, QueuedRun, Scheduler,
    SchedulerConfig, MAX_CONCURRENCY,
};
use vgt_policy::ActionBoundary;

pub struct AutomationRuntimeState {
    scheduler: Mutex<Scheduler>,
}
impl AutomationRuntimeState {
    pub fn new() -> Self {
        Self {
            scheduler: Mutex::new(
                Scheduler::new(SchedulerConfig {
                    max_concurrency: 16,
                    semantics: DeliverySemantics::AtLeastOnce,
                })
                .expect("valid automation scheduler config"),
            ),
        }
    }
}

#[derive(Debug, Serialize)]
pub struct AutomationRuntimeStatus {
    pub safe_mode_blocked: bool,
    pub queued_runs: usize,
    pub max_concurrency: u16,
    pub delivery_semantics: &'static str,
}
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ActivateRequest {
    pub flow: FlowIr,
}
#[derive(Debug, Serialize)]
pub struct ActivateResponse {
    pub activated: ActivatedFlow,
}

fn supported_versions() -> BTreeMap<String, u16> {
    [
        "trigger",
        "action",
        "condition",
        "switch",
        "parallel",
        "approval",
        "transform",
        "subflow",
        "boundedloop",
        "finally",
    ]
    .into_iter()
    .map(|kind| (kind.to_string(), 1))
    .collect()
}

#[tauri::command]
pub fn vgt_automation_runtime_activate(
    policy: State<'_, PolicyRuntimeState>,
    diagnostics: State<'_, DiagnosticsReleaseState>,
    request: ActivateRequest,
) -> Result<ActivateResponse, String> {
    policy.require(ActionBoundary::AutomationActivate, "automation:flow")?;
    if diagnostics.safe_mode_enabled() {
        return Err("AUTOMATION_SAFE_MODE_BLOCKED".into());
    }
    let activated =
        validate_and_activate(&request.flow, &supported_versions()).map_err(|e| e.to_string())?;
    Ok(ActivateResponse { activated })
}

#[tauri::command]
pub fn vgt_automation_runtime_enqueue(
    policy: State<'_, PolicyRuntimeState>,
    state: State<'_, AutomationRuntimeState>,
    diagnostics: State<'_, DiagnosticsReleaseState>,
    run: QueuedRun,
) -> Result<(), String> {
    policy.require(ActionBoundary::AutomationDispatch, "automation:run")?;
    if diagnostics.safe_mode_enabled() {
        return Err("AUTOMATION_SAFE_MODE_BLOCKED".into());
    }
    state
        .scheduler
        .lock()
        .map_err(|_| "AUTOMATION_SCHEDULER_UNAVAILABLE".to_string())?
        .enqueue(run)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn vgt_automation_runtime_cancel(
    state: State<'_, AutomationRuntimeState>,
    run_id: String,
) -> Result<(), String> {
    state
        .scheduler
        .lock()
        .map_err(|_| "AUTOMATION_SCHEDULER_UNAVAILABLE".to_string())?
        .cancel(&run_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn vgt_automation_runtime_next(
    state: State<'_, AutomationRuntimeState>,
    diagnostics: State<'_, DiagnosticsReleaseState>,
) -> Result<Option<QueuedRun>, String> {
    if diagnostics.safe_mode_enabled() {
        return Err("AUTOMATION_SAFE_MODE_BLOCKED".into());
    }
    Ok(state
        .scheduler
        .lock()
        .map_err(|_| "AUTOMATION_SCHEDULER_UNAVAILABLE".to_string())?
        .dequeue_next())
}

#[tauri::command]
pub fn vgt_automation_runtime_status(
    state: State<'_, AutomationRuntimeState>,
    diagnostics: State<'_, DiagnosticsReleaseState>,
) -> Result<AutomationRuntimeStatus, String> {
    let scheduler = state
        .scheduler
        .lock()
        .map_err(|_| "AUTOMATION_SCHEDULER_UNAVAILABLE".to_string())?;
    Ok(AutomationRuntimeStatus {
        safe_mode_blocked: diagnostics.safe_mode_enabled(),
        queued_runs: scheduler.len(),
        max_concurrency: scheduler.max_concurrency().min(MAX_CONCURRENCY),
        delivery_semantics: "at-least-once",
    })
}
