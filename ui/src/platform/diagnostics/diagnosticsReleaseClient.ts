// STATUS: DIAMANT VGT SUPREME — UI adapter for native diagnostics/recovery policy truth.
import { invokeNative, isNativeDesktop } from '../native/nativeBridge';
import { setAutomationSafeMode } from '../automation/automationRuntime';
import { diagnosticDebugModeState, setLocalDiagnosticDebugMode, type DiagnosticDebugModeState } from './diagnosticLog';

export interface RecoverySafeModeStatus {
  enabled: boolean;
  third_party_plugins_enabled: boolean;
  automations_enabled: boolean;
  network_enabled: boolean;
}

export async function readRecoverySafeMode(): Promise<RecoverySafeModeStatus> {
  if (!isNativeDesktop()) return { enabled: false, third_party_plugins_enabled: true, automations_enabled: true, network_enabled: true };
  return invokeNative<RecoverySafeModeStatus>('vgt_safe_mode_status');
}

export async function setRecoverySafeMode(enabled: boolean): Promise<RecoverySafeModeStatus> {
  if (!isNativeDesktop()) {
    setAutomationSafeMode(enabled);
    return { enabled, third_party_plugins_enabled: !enabled, automations_enabled: !enabled, network_enabled: !enabled };
  }
  const status = await invokeNative<RecoverySafeModeStatus>('vgt_safe_mode_set', { enabled });
  setAutomationSafeMode(status.enabled);
  return status;
}

export async function initializeDiagnosticsReleaseSafety(): Promise<RecoverySafeModeStatus> {
  try {
    const status = await readRecoverySafeMode();
    setAutomationSafeMode(status.enabled);
    return status;
  } catch {
    if (isNativeDesktop()) {
      setAutomationSafeMode(true);
      return { enabled: true, third_party_plugins_enabled: false, automations_enabled: false, network_enabled: false };
    }
    setAutomationSafeMode(false);
    return { enabled: false, third_party_plugins_enabled: true, automations_enabled: true, network_enabled: true };
  }
}

export async function setDiagnosticDebugMode(enabled: boolean, durationMs = 15 * 60 * 1000): Promise<DiagnosticDebugModeState> {
  const local = setLocalDiagnosticDebugMode(enabled, durationMs);
  if (!isNativeDesktop()) return local;
  const native = await invokeNative<{ enabled: boolean; enabled_until_ms: number | null }>('vgt_diagnostics_debug_mode', { request: { enabled, duration_ms: enabled ? durationMs : null } });
  if (native.enabled !== local.enabled) {
    setLocalDiagnosticDebugMode(native.enabled, native.enabled_until_ms ? Math.max(1, native.enabled_until_ms - Date.now()) : durationMs);
  }
  return diagnosticDebugModeState();
}
