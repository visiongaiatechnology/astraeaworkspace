// STATUS: DIAMANT VGT SUPREME — pure module-recovery state/export contract.
import type { WorkspaceDocument } from '../../shared/contracts/workspace';
import { securityPolicyForDocument } from '../../platform/security/securityProfiles';

export interface ModuleRecoveryState { error: Error | null; incidentId: string | null; }

export function moduleRecoveryStateFromError(error: Error, now = Date.now()): ModuleRecoveryState {
  const safeName = error instanceof Error && error.name ? error.name : 'Error';
  return { error: error instanceof Error ? error : new Error(safeName), incidentId: `ui-${Math.max(0, Math.trunc(now)).toString(36)}` };
}

/**
 * WR-044 — a recovery export must not become a plaintext leak.
 *
 * The button used to serialize the **whole document** as pretty-printed JSON, including every
 * paragraph, comment and writer payload, for any document. For an encrypted, PQC or Top-Secret
 * document that is exactly the "sensitive payload outside the authorised export path" the plan
 * forbids: the recovery file is a plain download with no container, no encryption and no policy.
 *
 * A document is exportable only when both its security profile is `STANDARD` and its protection
 * classification is `standard`. Everything else exports **metadata only** — enough to identify
 * the document for support, without a single character of its content.
 */
export function isModuleRecoveryExportRedacted(document: WorkspaceDocument): boolean {
  const profile = securityPolicyForDocument(document).profile;
  const classification = document.protection?.classification ?? 'standard';
  return profile !== 'STANDARD' || classification !== 'standard';
}

export function moduleRecoveryPayload(document: WorkspaceDocument, now = Date.now()): string {
  const exportedAt = Math.max(0, Math.trunc(now));
  if (isModuleRecoveryExportRedacted(document)) {
    return JSON.stringify({
      schema: 'vgt.workspace.recovery/1',
      exportedAt,
      redacted: true,
      redactionReason: 'protected-document',
      document: {
        id: document.id,
        kind: document.kind,
        title: document.title,
        version: document.version,
        modified_at: document.modified_at,
        schema_version: document.schema_version,
        securityProfile: securityPolicyForDocument(document).profile,
        protectionClassification: document.protection?.classification ?? 'standard',
      },
    }, null, 2);
  }
  return JSON.stringify({ schema: 'vgt.workspace.recovery/1', exportedAt, document }, null, 2);
}

/* ------------------------------------------------------------------------- *
 * GR-001 — the module crash was undiagnosable because the boundary discarded
 * the error.
 *
 * `componentDidCatch` logged `error.name` and nothing else. The native Grid
 * startup showed the recovery surface and left **no stack, no message and no
 * component path** anywhere — ADR D-GR-001 is exactly this gap ("kein Beleg in
 * der ZIP; DeepSeek erheben Runtime-Trace vor Patch").
 *
 * The record below is that runtime trace: bounded, local, and content-free by
 * construction (it only ever receives the exception and React's component
 * stack — never the document).
 * ------------------------------------------------------------------------- */

export interface ModuleRecoveryDiagnostic {
  readonly schema: 'vgt.module-recovery/1';
  readonly incidentId: string;
  readonly recordedAt: number;
  readonly name: string;
  /** Sanitised, truncated error message (an exception message may embed content). */
  readonly message: string;
  /** Stack frames, newest first, each truncated; the first frame is the throw site. */
  readonly stack: readonly string[];
  /** React component path, outermost last, truncated per frame. */
  readonly componentStack: readonly string[];
}

export const MODULE_RECOVERY_MAX_DIAGNOSTICS = 8;
export const MODULE_RECOVERY_MAX_MESSAGE = 400;
export const MODULE_RECOVERY_MAX_FRAMES = 12;
export const MODULE_RECOVERY_MAX_FRAME_LENGTH = 200;

/** No control characters, no runaway whitespace — a log line, not a payload. */
function sanitizeDiagnosticText(value: unknown, limit: number): string {
  if (typeof value !== 'string') return '';
  const cleaned = value
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  return cleaned.length > limit ? `${cleaned.slice(0, limit - 1)}…` : cleaned;
}

function diagnosticFrames(value: unknown): string[] {
  if (typeof value !== 'string' || value.trim().length === 0) return [];
  return value
    .split('\n')
    .map((line) => sanitizeDiagnosticText(line, MODULE_RECOVERY_MAX_FRAME_LENGTH))
    .filter((line) => line.length > 0)
    .slice(0, MODULE_RECOVERY_MAX_FRAMES);
}

/**
 * Builds the local diagnostic record for one containment.
 *
 * Deliberately takes only `Error` and React's `componentStack`: there is no
 * parameter through which document content could enter the record.
 */
export function moduleRecoveryDiagnosticFromError(
  error: unknown,
  componentStack?: string | null,
  now = Date.now(),
): ModuleRecoveryDiagnostic {
  const asError = error instanceof Error ? error : null;
  const recordedAt = Math.max(0, Math.trunc(now));
  return {
    schema: 'vgt.module-recovery/1',
    incidentId: `ui-${recordedAt.toString(36)}`,
    recordedAt,
    name: sanitizeDiagnosticText(asError?.name ?? 'Error', 64) || 'Error',
    message: sanitizeDiagnosticText(asError?.message ?? String(error ?? ''), MODULE_RECOVERY_MAX_MESSAGE),
    stack: diagnosticFrames(asError?.stack ?? ''),
    componentStack: diagnosticFrames(componentStack ?? ''),
  };
}

const diagnostics: ModuleRecoveryDiagnostic[] = [];

/** Bounded in-session ring buffer: the last `MODULE_RECOVERY_MAX_DIAGNOSTICS` containments. */
export function recordModuleRecoveryDiagnostic(diagnostic: ModuleRecoveryDiagnostic): void {
  diagnostics.push(diagnostic);
  while (diagnostics.length > MODULE_RECOVERY_MAX_DIAGNOSTICS) diagnostics.shift();
}

export function readModuleRecoveryDiagnostics(): readonly ModuleRecoveryDiagnostic[] {
  return [...diagnostics];
}

export function serializeModuleRecoveryDiagnostics(now = Date.now()): string {
  return JSON.stringify({
    schema: 'vgt.module-recovery/1',
    exportedAt: Math.max(0, Math.trunc(now)),
    note: 'Local module diagnostics only. Contains no document content by construction.',
    diagnostics: [...diagnostics],
  }, null, 2);
}

/** Test seam: the buffer is process-global on purpose (a crash survives a re-render). */
export function resetModuleRecoveryDiagnostics(): void {
  diagnostics.length = 0;
}
