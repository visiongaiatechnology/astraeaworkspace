// Native Automation Runtime adapter. Security/runtime truth lives in vgt-automation-runtime.
import { invoke } from '@tauri-apps/api/core';

export type NativeQueueKind = 'manual' | 'event' | 'schedule';
export interface NativeQueuedRun {
  run_id: string; flow_id: string; flow_version: number; queue: NativeQueueKind;
  priority: number; enqueued_at_ms: number; idempotency_key?: string | null;
}
export interface NativeAutomationStatus { safe_mode_blocked: boolean; queued_runs: number; max_concurrency: number; delivery_semantics: 'at-least-once'; }
export interface NativeActivatedFlow { flow_id: string; flow_version: number; activation_digest: string; deterministic_order: string[]; }

export async function activateNativeAutomation(flow: unknown): Promise<NativeActivatedFlow> {
  const response = await invoke<{ activated: NativeActivatedFlow }>('vgt_automation_runtime_activate', { request: { flow } });
  return response.activated;
}
export const enqueueNativeAutomation = (run: NativeQueuedRun) => invoke<void>('vgt_automation_runtime_enqueue', { run });
export const cancelNativeAutomation = (runId: string) => invoke<void>('vgt_automation_runtime_cancel', { runId });
export const nextNativeAutomation = () => invoke<NativeQueuedRun | null>('vgt_automation_runtime_next');
export const nativeAutomationStatus = () => invoke<NativeAutomationStatus>('vgt_automation_runtime_status');
