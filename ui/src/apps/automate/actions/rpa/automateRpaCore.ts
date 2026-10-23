// STATUS: DIAMANT VGT SUPREME — High-risk desktop/RPA contract with hard emergency stop and explicit consent.
import type { JsonValue } from '../../model/types';

export type RpaSelector =
  | { kind: 'accessibility'; automationId: string; role?: string; name?: string }
  | { kind: 'uia'; automationId: string; controlType?: string }
  | { kind: 'image'; assetDigest: string; threshold: number; maxPixels: number; localOnly: true }
  | { kind: 'ocr'; text: string; language: string; maxPixels: number; timeoutMs: number; localOnly: true }
  | { kind: 'coordinate'; x: number; y: number; fragile: true };

export type RpaStep =
  | { id: string; kind: 'click'; selector: RpaSelector }
  | { id: string; kind: 'type'; selector: RpaSelector; text: string }
  | { id: string; kind: 'key'; key: string; modifiers: ('Ctrl' | 'Alt' | 'Shift' | 'Meta')[] }
  | { id: string; kind: 'window'; operation: 'focus' | 'minimize' | 'maximize' | 'close'; selector: RpaSelector }
  | { id: string; kind: 'credential'; selector: RpaSelector; secretHandle: string };

export interface RpaRecording { schema: 'vgt.rpa/1'; applicationId: string; steps: RpaStep[]; }
export interface RpaMachinePolicy { enabled: boolean; unattendedAllowed: boolean; lockedDownProfileId?: string; maxSteps: number; maxOcrPixels: number; maxOcrTimeoutMs: number; }
export interface RpaAuditEvent { recordingId: string; stepId: string; selectorKind: RpaSelector['kind']; outcome: 'success' | 'failed'; at: number; safeCode?: string; }

export interface RpaEmergencyKeyEvent {
  readonly key: string;
  readonly repeat?: boolean;
  preventDefault?(): void;
}

export interface RpaEmergencyKeyTarget {
  addEventListener(type: 'keydown', listener: (event: RpaEmergencyKeyEvent) => void): void;
  removeEventListener(type: 'keydown', listener: (event: RpaEmergencyKeyEvent) => void): void;
}

export type RpaStepAdapter = (step: RpaStep, signal: AbortSignal) => Promise<void>;
export type RpaSensitiveConfirmation = (step: RpaStep) => Promise<boolean> | boolean;

export class AutomateRpaError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'AutomateRpaError';
  }
}

export class RpaEmergencyStopController {
  private readonly abortController = new AbortController();
  private triggered = false;

  public get signal(): AbortSignal { return this.abortController.signal; }
  public get stopped(): boolean { return this.triggered || this.abortController.signal.aborted; }

  public trigger(reason = 'rpa-emergency-stop'): void {
    if (this.stopped) return;
    this.triggered = true;
    this.abortController.abort(new AutomateRpaError(reason));
  }

  public throwIfStopped(): void {
    if (this.stopped) throw new AutomateRpaError('rpa-emergency-stop');
  }
}

export function installRpaEscapeEmergencyStop(
  target: RpaEmergencyKeyTarget,
  controller: RpaEmergencyStopController,
): () => void {
  const listener = (event: RpaEmergencyKeyEvent): void => {
    if (event.key !== 'Escape' || event.repeat === true) return;
    event.preventDefault?.();
    controller.trigger();
  };
  target.addEventListener('keydown', listener);
  return () => target.removeEventListener('keydown', listener);
}

export function isSensitiveRpaStep(step: RpaStep): boolean {
  if (step.kind === 'click' || step.kind === 'type' || step.kind === 'key' || step.kind === 'credential') return true;
  return step.kind === 'window' && step.operation === 'close';
}

export async function executeRpaRecording(
  recording: RpaRecording,
  policy: RpaMachinePolicy,
  keyTarget: RpaEmergencyKeyTarget,
  adapter: RpaStepAdapter,
  confirmSensitive: RpaSensitiveConfirmation,
  at: () => number = Date.now,
): Promise<RpaAuditEvent[]> {
  validateRpaRecording(recording, policy);
  const emergency = new RpaEmergencyStopController();
  const disposeEmergencyStop = installRpaEscapeEmergencyStop(keyTarget, emergency);
  const audit: RpaAuditEvent[] = [];
  try {
    for (const step of recording.steps) {
      emergency.throwIfStopped();
      if (isSensitiveRpaStep(step) && !(await confirmSensitive(step))) {
        throw new AutomateRpaError('rpa-sensitive-action-confirmation-required');
      }
      try {
        await adapter(step, emergency.signal);
        emergency.throwIfStopped();
        audit.push(createRpaAudit(recording.applicationId, step, 'success', undefined, at()));
      } catch (error) {
        const code = emergency.stopped
          ? 'rpa-emergency-stop'
          : error instanceof AutomateRpaError ? error.code : 'rpa-step-failed';
        audit.push(createRpaAudit(recording.applicationId, step, 'failed', code, at()));
        throw new AutomateRpaError(code);
      }
    }
    return audit;
  } finally {
    disposeEmergencyStop();
  }
}

export function validateRpaRecording(r: RpaRecording, p: RpaMachinePolicy): { fragileStepIds: string[] } {
  if (!p.enabled) throw new AutomateRpaError('rpa-machine-disabled');
  if (r.schema !== 'vgt.rpa/1' || !r.applicationId || r.applicationId.length > 256 || r.steps.length === 0 || r.steps.length > p.maxSteps) throw new AutomateRpaError('rpa-recording-boundary');
  const fragile: string[] = [];
  const ids = new Set<string>();
  for (const step of r.steps) {
    if (!/^[A-Za-z0-9._:-]{1,128}$/.test(step.id) || ids.has(step.id)) throw new AutomateRpaError('rpa-step-id-invalid');
    ids.add(step.id);
    if ('selector' in step) {
      validateSelector(step.selector, p);
      if (step.selector.kind === 'coordinate') fragile.push(step.id);
    } else if (step.kind === 'key') {
      if (!step.key || step.key.length > 64 || step.modifiers.length > 4) throw new AutomateRpaError('rpa-key-boundary');
    }
    if (step.kind === 'type' && step.text.length > 65_536) throw new AutomateRpaError('rpa-type-text-boundary');
    if (step.kind === 'credential' && !/^keyvault:\/[A-Za-z0-9._~:/-]{4,256}$/.test(step.secretHandle)) throw new AutomateRpaError('rpa-credential-handle-required');
  }
  return { fragileStepIds: fragile };
}

function validateSelector(s: RpaSelector, p: RpaMachinePolicy): void {
  switch (s.kind) {
    case 'accessibility':
    case 'uia':
      if (!s.automationId || s.automationId.length > 512) throw new AutomateRpaError('rpa-stable-selector-invalid');
      return;
    case 'coordinate':
      if (!Number.isFinite(s.x) || !Number.isFinite(s.y) || Math.abs(s.x) > 100_000 || Math.abs(s.y) > 100_000 || s.fragile !== true) throw new AutomateRpaError('rpa-coordinate-invalid');
      return;
    case 'image':
      if (s.localOnly !== true || !/^sha256:[a-f0-9]{64}$/.test(s.assetDigest) || s.threshold < 0.5 || s.threshold > 1 || s.maxPixels < 1 || s.maxPixels > p.maxOcrPixels) throw new AutomateRpaError('rpa-image-selector-boundary');
      return;
    case 'ocr':
      if (s.localOnly !== true || !s.text || s.text.length > 4096 || s.maxPixels < 1 || s.maxPixels > p.maxOcrPixels || s.timeoutMs < 1 || s.timeoutMs > p.maxOcrTimeoutMs) throw new AutomateRpaError('rpa-ocr-selector-boundary');
      return;
  }
}

export function preferredSelector(selectors: readonly RpaSelector[]): RpaSelector {
  if (selectors.length === 0) throw new AutomateRpaError('rpa-selector-required');
  const order: { [K in RpaSelector['kind']]: number } = { accessibility: 0, uia: 1, image: 2, ocr: 3, coordinate: 4 };
  return [...selectors].sort((a, b) => order[a.kind] - order[b.kind])[0];
}

export function validateUnattendedRun(p: RpaMachinePolicy, profileId: string | undefined): void {
  if (!p.enabled || !p.unattendedAllowed || !p.lockedDownProfileId || profileId !== p.lockedDownProfileId) throw new AutomateRpaError('rpa-unattended-policy-denied');
}

export function createRpaAudit(recordingId: string, step: RpaStep, outcome: RpaAuditEvent['outcome'], safeCode?: string, at = Date.now()): RpaAuditEvent {
  return { recordingId, stepId: step.id, selectorKind: 'selector' in step ? step.selector.kind : 'accessibility', outcome, at, safeCode };
}

export function sanitizedRpaStep(step: RpaStep): JsonValue {
  if (step.kind === 'credential') return { id: step.id, kind: step.kind, selector: step.selector, secretHandle: '[KEYVAULT_HANDLE]' } as unknown as JsonValue;
  return structuredClone(step) as unknown as JsonValue;
}
