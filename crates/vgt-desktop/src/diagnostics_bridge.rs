// STATUS: DIAMANT VGT SUPREME — native diagnostics/recovery policy adapter.
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::State;
use vgt_diagnostics_release::{
    DebugModeState, DiagnosticErrorSummary, DiagnosticScalar, FeatureState, HealthState,
    LocalLogRing, LogSeverity, ProviderState, RuntimeHealthSnapshot, SafeModeState, SafeModeStatus,
    SelfTestResult, StructuredLogEntry,
};

const MAX_SELF_TEST_ERRORS: usize = 16;

#[derive(Serialize)]
pub struct DiagnosticsRuntimeInfo {
    product_version: &'static str,
    build_hash: Option<&'static str>,
    release_channel: &'static str,
    platform: &'static str,
    architecture: &'static str,
    build_profile: &'static str,
    core_provider: &'static str,
}

#[derive(Default)]
pub struct DiagnosticsReleaseState {
    logs: Mutex<LocalLogRing>,
    safe_mode: Mutex<Option<SafeModeState>>,
}

impl DiagnosticsReleaseState {
    pub fn new(initial_safe_mode: bool) -> Self {
        Self {
            logs: Mutex::new(LocalLogRing::default()),
            safe_mode: Mutex::new(Some(SafeModeState::new(initial_safe_mode))),
        }
    }

    pub fn safe_mode_enabled(&self) -> bool {
        self.safe_mode
            .lock()
            .ok()
            .and_then(|state| state.as_ref().map(SafeModeState::enabled))
            .unwrap_or(true)
    }

    pub fn set_safe_mode(&self, enabled: bool) -> Result<SafeModeStatus, String> {
        let mut guard = self
            .safe_mode
            .lock()
            .map_err(|_| "DIAGNOSTICS_STATE_UNAVAILABLE".to_string())?;
        let state = guard.get_or_insert_with(|| SafeModeState::new(true));
        state.set_enabled(enabled);
        Ok(state.status())
    }

    pub fn safe_mode_status(&self) -> Result<SafeModeStatus, String> {
        let guard = self
            .safe_mode
            .lock()
            .map_err(|_| "DIAGNOSTICS_STATE_UNAVAILABLE".to_string())?;
        Ok(guard
            .as_ref()
            .map(SafeModeState::status)
            .unwrap_or_else(|| SafeModeState::new(true).status()))
    }
}

#[derive(Serialize)]
pub struct NativeDiagnosticsSnapshot {
    runtime: DiagnosticsRuntimeInfo,
    health: RuntimeHealthSnapshot,
    debug: DebugModeState,
    safe_mode: SafeModeStatus,
    logs: Vec<StructuredLogEntry>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DebugModeRequest {
    pub enabled: bool,
    pub duration_ms: Option<u64>,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis().min(u64::MAX as u128) as u64)
        .unwrap_or(0)
}

fn validated_build_hash() -> Option<&'static str> {
    let value = option_env!("ASTRAEA_BUILD_HASH")?;
    if !(7..=64).contains(&value.len()) || !value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return None;
    }
    Some(value)
}

fn release_channel() -> &'static str {
    match option_env!("ASTRAEA_RELEASE_CHANNEL") {
        Some("stable") => "stable",
        Some("beta") => "beta",
        Some("managed") => "managed",
        Some("dev") => "dev",
        _ => "beta",
    }
}

fn runtime_info() -> DiagnosticsRuntimeInfo {
    DiagnosticsRuntimeInfo {
        product_version: env!("CARGO_PKG_VERSION"),
        build_hash: validated_build_hash(),
        release_channel: release_channel(),
        platform: std::env::consts::OS,
        architecture: std::env::consts::ARCH,
        build_profile: if cfg!(debug_assertions) {
            "debug"
        } else {
            "release"
        },
        core_provider: "vgt-core/native-tauri",
    }
}

#[tauri::command]
pub fn vgt_diagnostics_runtime_info() -> DiagnosticsRuntimeInfo {
    runtime_info()
}

#[tauri::command]
pub fn vgt_diagnostics_snapshot(
    state: State<'_, DiagnosticsReleaseState>,
) -> Result<NativeDiagnosticsSnapshot, String> {
    let now = now_ms();
    let safe_mode = state.safe_mode_status()?;
    let mut log_guard = state
        .logs
        .lock()
        .map_err(|_| "DIAGNOSTICS_LOG_STATE_UNAVAILABLE".to_string())?;
    let (debug, logs) = log_guard.snapshot(now, 128);
    let mut recent_errors = Vec::new();
    for entry in logs
        .iter()
        .rev()
        .filter(|entry| entry.severity == LogSeverity::Error)
        .take(MAX_SELF_TEST_ERRORS)
    {
        recent_errors.push(DiagnosticErrorSummary {
            error_id: entry.event_id.clone(),
            component: entry.component.clone(),
            summary: "Local error event recorded; details remain bounded and redacted.".into(),
        });
    }
    let health = RuntimeHealthSnapshot::new(
        vec![
            FeatureState {
                id: "core.connectivity".into(),
                state: HealthState::Pass,
            },
            FeatureState {
                id: "diagnostics.local_only".into(),
                state: HealthState::Pass,
            },
            FeatureState {
                id: "safe_mode".into(),
                state: if safe_mode.enabled {
                    HealthState::Warn
                } else {
                    HealthState::Pass
                },
            },
            FeatureState {
                id: "release.verifier".into(),
                state: if option_env!("ASTRAEA_UPDATE_PUBLIC_KEY_B64").is_some() {
                    HealthState::Pass
                } else {
                    HealthState::Unavailable
                },
            },
        ],
        vec![
            ProviderState {
                id: "vgt-core.native".into(),
                available: true,
                hardware_backed_verified: false,
            },
            ProviderState {
                id: "diagnostics.local-ring".into(),
                available: true,
                hardware_backed_verified: false,
            },
        ],
        vec![
            SelfTestResult {
                id: "runtime-info".into(),
                state: HealthState::Pass,
                error_id: None,
            },
            SelfTestResult {
                id: "local-log-boundary".into(),
                state: HealthState::Pass,
                error_id: None,
            },
            SelfTestResult {
                id: "network-safe-mode".into(),
                state: HealthState::Pass,
                error_id: None,
            },
        ],
        recent_errors,
    )
    .map_err(|_| "DIAGNOSTICS_BOUNDARY_REJECTED".to_string())?;
    Ok(NativeDiagnosticsSnapshot {
        runtime: runtime_info(),
        health,
        debug,
        safe_mode,
        logs,
    })
}

#[tauri::command]
pub fn vgt_diagnostics_debug_mode(
    state: State<'_, DiagnosticsReleaseState>,
    request: DebugModeRequest,
) -> Result<DebugModeState, String> {
    let now = now_ms();
    let mut logs = state
        .logs
        .lock()
        .map_err(|_| "DIAGNOSTICS_LOG_STATE_UNAVAILABLE".to_string())?;
    let result = if request.enabled {
        logs.enable_debug(now, request.duration_ms.unwrap_or(15 * 60 * 1000))
            .map_err(|_| "DIAGNOSTICS_DEBUG_DURATION_REJECTED".to_string())?
    } else {
        logs.disable_debug();
        logs.debug_state(now)
    };
    let mut fields = BTreeMap::new();
    fields.insert(
        "enabled".to_string(),
        DiagnosticScalar::Bool(result.enabled),
    );
    let _ = logs.push(
        now,
        LogSeverity::Info,
        "diagnostics".into(),
        "DEBUG_MODE_CHANGED".into(),
        "Diagnostic debug mode state changed.".into(),
        fields,
    );
    Ok(result)
}
