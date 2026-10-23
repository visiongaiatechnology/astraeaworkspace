// STATUS: DIAMANT VGT SUPREME — voluntary local diagnostics and reproduction bundles.

import type { DocumentKind, KeyVaultStatus, WorkspaceDocument } from '../../shared/contracts/workspace';
import { ALPHA_KNOWN_ISSUES, ALPHA_VERSION } from '../release/alphaStatus';
import { DIAGNOSTIC_EXPORT_LOG_LIMIT, DIAGNOSTIC_RING_CAPACITY, latestCrashId, listDiagnosticLogs, type DiagnosticLogEntry } from './diagnosticLog';
import { containsLikelySecretMaterial, redactDiagnosticText, sanitizeDiagnosticValue } from './diagnosticsRedaction';
import { BoundedJsonSerializationError, stringifyJsonWithinUtf8ByteLimit } from './boundedJsonStringify';
import { invokeNative, isNativeDesktop } from '../native/nativeBridge';
import { DEFAULT_SHELL_NATIVE_POLICY, nativeShellSaveBytes } from '../native/nativeShellServices';
import { recoverySupported, type RecoverySnapshotInfo } from '../recovery/recovery';
import { securityPolicyForDocument } from '../security/securityProfiles';

const DIAGNOSTIC_EXPORT_MAX_BYTES = 5 * 1024 * 1024;

export interface NativeDiagnosticsRuntimeInfo {
  product_version: string;
  build_hash: string | null;
  release_channel: string;
  platform: string;
  architecture: string;
  build_profile: 'debug' | 'release' | 'unknown';
  core_provider: string;
  feature_states?: Array<{ id: string; state: 'pass' | 'warn' | 'fail' | 'unavailable' }>;
  self_tests?: Array<{ id: string; state: 'pass' | 'warn' | 'fail' | 'unavailable'; error_id: string | null }>;
  debug_mode?: { enabled: boolean; enabled_until_ms: number | null };
  safe_mode?: { enabled: boolean; third_party_plugins_enabled: boolean; automations_enabled: boolean; network_enabled: boolean };
}

export interface DiagnosticReport {
  schema: 'astraea-workspace-diagnostics/v2';
  product: 'Astraea Workspace';
  generated_at: string;
  privacy: {
    local_only: true;
    automatic_upload: false;
    includes_document_bodies: false;
    includes_document_names: false;
    includes_document_ids: false;
    includes_secrets_keys_tokens: false;
    paths_redacted: true;
  };
  build: {
    version: string;
    build_hash: string | null;
    release_channel: string;
    build_profile: NativeDiagnosticsRuntimeInfo['build_profile'];
  };
  runtime: {
    surface: 'native-desktop' | 'browser';
    platform: string;
    architecture: string;
    language: string;
  };
  workspace: {
    open_document_count: number;
    kinds: Partial<Record<DocumentKind, number>>;
    top_secret_redaction: boolean;
  };
  providers: {
    core: { connected: boolean; provider: string; platform: string };
    keyvault: {
      name: string;
      available: boolean;
      secure_persistence: boolean;
      hardware_interface_detected: boolean;
      hardware_slot_supported: boolean;
      capabilities: string[];
      locked: boolean;
      hardware_backed: boolean;
      hardware_attestation_verified: boolean;
      pqc_unlocked: boolean;
      top_secret_enrolled: boolean;
      top_secret_unlocked: boolean;
    };
    recovery: { supported: boolean; snapshot_count: number };
  };
  crash: { last_crash_id: string | null };
  health: {
    feature_states: Array<{ id: string; state: 'pass' | 'warn' | 'fail' | 'unavailable' }>;
    self_tests: Array<{ id: string; state: 'pass' | 'warn' | 'fail' | 'unavailable'; error_id: string | null }>;
    debug_mode: { enabled: boolean; enabled_until_ms: number | null };
    safe_mode: { enabled: boolean; third_party_plugins_enabled: boolean; automations_enabled: boolean; network_enabled: boolean };
  };
  logging: {
    levels: readonly ['debug', 'info', 'warn', 'error'];
    retention: 'local-ring-buffer';
    capacity: number;
    exported_entries: number;
  };
  beta_boundaries: Array<{ id: string; area: string; summary: string }>;
}

export interface DiagnosticBundle {
  schema: 'astraea-workspace-repro-bundle/v1';
  generated_at: string;
  report: DiagnosticReport;
  logs: DiagnosticLogEntry[];
  selected_document: unknown | null;
  selected_document_inclusion: 'not_requested' | 'approved' | 'blocked_top_secret';
  sharing: {
    automatic_upload: false;
    authorized: false;
    requires_explicit_opt_in: true;
  };
}

export interface AuthorizedDiagnosticShare {
  schema: 'astraea-workspace-authorized-share/v1';
  authorized_at: string;
  explicit_user_opt_in: true;
  bundle: DiagnosticBundle;
}

function countKinds(documents: readonly WorkspaceDocument[]): Partial<Record<DocumentKind, number>> {
  const counts: Partial<Record<DocumentKind, number>> = {};
  for (const document of documents) counts[document.kind] = (counts[document.kind] ?? 0) + 1;
  return counts;
}

function browserRuntimeInfo(): NativeDiagnosticsRuntimeInfo {
  return {
    product_version: ALPHA_VERSION,
    build_hash: null,
    release_channel: 'beta',
    platform: typeof navigator === 'undefined' ? 'unknown-browser-platform' : (navigator.platform || 'browser'),
    architecture: 'unknown',
    build_profile: 'unknown',
    core_provider: 'browser-local-core',
  };
}

function readDataRecord(value: unknown, requiredKeys: readonly string[]): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of requiredKeys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) return null;
      result[key] = descriptor.value as unknown;
    }
    return result;
  } catch {
    return null;
  }
}

function boundedNativeText(value: unknown, maximum: number, allowEmpty = false): value is string {
  return typeof value === 'string' && value.length <= maximum && (allowEmpty || value.length > 0) && !/[\u0000-\u001f\u007f]/u.test(value);
}

function validNativeId(value: unknown): value is string {
  return boundedNativeText(value, 96) && /^[A-Za-z0-9._:-]+$/u.test(value);
}

function validHealthState(value: unknown): value is 'pass' | 'warn' | 'fail' | 'unavailable' {
  return value === 'pass' || value === 'warn' || value === 'fail' || value === 'unavailable';
}

function readBoundedArray(value: unknown, maximum: number): unknown[] | null {
  if (!Array.isArray(value)) return null;
  try {
    if (Object.getPrototypeOf(value) !== Array.prototype) return null;
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
    if (!lengthDescriptor || !Object.prototype.hasOwnProperty.call(lengthDescriptor, 'value') ||
      typeof lengthDescriptor.value !== 'number' || lengthDescriptor.value > maximum) return null;
    const length = lengthDescriptor.value;
    const result: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) return null;
      result.push(descriptor.value as unknown);
    }
    return result;
  } catch {
    return null;
  }
}

function readAllDataRecord(value: unknown, maximumKeys: number): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  try {
    const keys = Object.keys(value);
    if (keys.length > maximumKeys) return null;
    return readDataRecord(value, keys);
  } catch {
    return null;
  }
}

function validateDiagnosticLogs(value: unknown): boolean {
  const entries = readBoundedArray(value, 128);
  if (!entries) return false;
  for (const entry of entries) {
    const log = readDataRecord(entry, ['sequence', 'timestamp_ms', 'severity', 'component', 'event_id', 'message', 'fields']);
    if (!log || !Number.isSafeInteger(log.sequence) || (log.sequence as number) < 0 ||
      !Number.isSafeInteger(log.timestamp_ms) || (log.timestamp_ms as number) < 0 ||
      !['Debug', 'Info', 'Warn', 'Error'].includes(String(log.severity)) ||
      !validNativeId(log.component) || !validNativeId(log.event_id) || !boundedNativeText(log.message, 512)) return false;
    const fields = readAllDataRecord(log.fields, 32);
    if (!fields) return false;
    const keys = Object.keys(fields);
    for (const key of keys) {
      if (!validNativeId(key)) return false;
      const field = fields[key];
      if (typeof field === 'string') {
        if (!boundedNativeText(field, 256, true)) return false;
      } else if (typeof field === 'number') {
        if (!Number.isFinite(field)) return false;
      } else if (typeof field !== 'boolean') {
        return false;
      }
    }
  }
  return true;
}

export function validateNativeDiagnosticsSnapshot(value: unknown): NativeDiagnosticsRuntimeInfo | null {
  const snapshot = readDataRecord(value, ['runtime', 'health', 'debug', 'safe_mode', 'logs']);
  if (!snapshot || !validateDiagnosticLogs(snapshot.logs)) return null;

  const runtime = readDataRecord(snapshot.runtime, [
    'product_version', 'build_hash', 'release_channel', 'platform', 'architecture', 'build_profile', 'core_provider',
  ]);
  if (!runtime || !boundedNativeText(runtime.product_version, 64) ||
    (runtime.build_hash !== null && (typeof runtime.build_hash !== 'string' || !/^[0-9a-f]{7,64}$/iu.test(runtime.build_hash))) ||
    (runtime.release_channel !== 'stable' && runtime.release_channel !== 'beta' && runtime.release_channel !== 'managed' && runtime.release_channel !== 'dev') ||
    !boundedNativeText(runtime.platform, 32) || !/^[A-Za-z0-9._-]+$/u.test(runtime.platform) ||
    !boundedNativeText(runtime.architecture, 32) || !/^[A-Za-z0-9._-]+$/u.test(runtime.architecture) ||
    (runtime.build_profile !== 'debug' && runtime.build_profile !== 'release') ||
    !boundedNativeText(runtime.core_provider, 64)) return null;

  const health = readDataRecord(snapshot.health, ['schema', 'features', 'providers', 'self_tests', 'recent_errors']);
  const features = health ? readBoundedArray(health.features, 64) : null;
  const providers = health ? readBoundedArray(health.providers, 32) : null;
  const selfTestValues = health ? readBoundedArray(health.self_tests, 64) : null;
  const recentErrors = health ? readBoundedArray(health.recent_errors, 32) : null;
  if (!health || health.schema !== 'vgt.diagnostics.runtime-health/1' ||
    !features || !providers || !selfTestValues || !recentErrors) return null;

  const featureStates: NonNullable<NativeDiagnosticsRuntimeInfo['feature_states']> = [];
  for (const value of features) {
    const feature = readDataRecord(value, ['id', 'state']);
    if (!feature || !validNativeId(feature.id) || !validHealthState(feature.state)) return null;
    featureStates.push({ id: feature.id, state: feature.state });
  }
  for (const value of providers) {
    const provider = readDataRecord(value, ['id', 'available', 'hardware_backed_verified']);
    if (!provider || !validNativeId(provider.id) || typeof provider.available !== 'boolean' || typeof provider.hardware_backed_verified !== 'boolean') return null;
  }

  const selfTests: NonNullable<NativeDiagnosticsRuntimeInfo['self_tests']> = [];
  for (const value of selfTestValues) {
    const selfTest = readDataRecord(value, ['id', 'state', 'error_id']);
    if (!selfTest || !validNativeId(selfTest.id) || !validHealthState(selfTest.state) ||
      (selfTest.error_id !== null && !validNativeId(selfTest.error_id))) return null;
    selfTests.push({ id: selfTest.id, state: selfTest.state, error_id: selfTest.error_id as string | null });
  }
  for (const value of recentErrors) {
    const recentError = readDataRecord(value, ['error_id', 'component', 'summary']);
    if (!recentError || !validNativeId(recentError.error_id) || !validNativeId(recentError.component) || !boundedNativeText(recentError.summary, 256)) return null;
  }

  const debug = readDataRecord(snapshot.debug, ['enabled', 'enabled_until_ms']);
  if (!debug || typeof debug.enabled !== 'boolean' ||
    (debug.enabled_until_ms !== null && (!Number.isSafeInteger(debug.enabled_until_ms) || (debug.enabled_until_ms as number) < 0))) return null;
  const safeMode = readDataRecord(snapshot.safe_mode, ['enabled', 'third_party_plugins_enabled', 'automations_enabled', 'network_enabled']);
  if (!safeMode || typeof safeMode.enabled !== 'boolean' || typeof safeMode.third_party_plugins_enabled !== 'boolean' ||
    typeof safeMode.automations_enabled !== 'boolean' || typeof safeMode.network_enabled !== 'boolean') return null;

  return {
    product_version: runtime.product_version,
    build_hash: runtime.build_hash as string | null,
    release_channel: runtime.release_channel,
    platform: runtime.platform,
    architecture: runtime.architecture,
    build_profile: runtime.build_profile,
    core_provider: runtime.core_provider,
    feature_states: featureStates,
    self_tests: selfTests,
    debug_mode: { enabled: debug.enabled, enabled_until_ms: debug.enabled_until_ms as number | null },
    safe_mode: {
      enabled: safeMode.enabled,
      third_party_plugins_enabled: safeMode.third_party_plugins_enabled,
      automations_enabled: safeMode.automations_enabled,
      network_enabled: safeMode.network_enabled,
    },
  };
}

export async function collectRuntimeDiagnosticsInfo(): Promise<NativeDiagnosticsRuntimeInfo> {
  if (!isNativeDesktop()) return browserRuntimeInfo();
  try {
    const snapshot = await invokeNative<unknown>('vgt_diagnostics_snapshot');
    const validated = validateNativeDiagnosticsSnapshot(snapshot);
    if (!validated) throw new Error('DIAGNOSTICS_NATIVE_RESPONSE_REJECTED');
    return validated;
  } catch {
    return { ...browserRuntimeInfo(), core_provider: 'native-provider-unavailable', platform: 'native-provider-unavailable' };
  }
}

export function buildDiagnosticReport(
  documents: readonly WorkspaceDocument[],
  vaultStatus: KeyVaultStatus,
  recoverySnapshots: readonly RecoverySnapshotInfo[],
  runtimeInfo: NativeDiagnosticsRuntimeInfo = browserRuntimeInfo(),
  logs: readonly DiagnosticLogEntry[] = listDiagnosticLogs(),
  now: Date = new Date(),
): DiagnosticReport {
  const language = typeof navigator === 'undefined' ? 'unknown' : navigator.language || 'unknown';
  const topSecretRedaction = documents.some((document) => securityPolicyForDocument(document).profile === 'VGT_TOP_SECRET');
  return {
    schema: 'astraea-workspace-diagnostics/v2',
    product: 'Astraea Workspace',
    generated_at: now.toISOString(),
    privacy: {
      local_only: true,
      automatic_upload: false,
      includes_document_bodies: false,
      includes_document_names: false,
      includes_document_ids: false,
      includes_secrets_keys_tokens: false,
      paths_redacted: true,
    },
    build: {
      version: runtimeInfo.product_version || ALPHA_VERSION,
      build_hash: runtimeInfo.build_hash,
      release_channel: redactDiagnosticText(runtimeInfo.release_channel),
      build_profile: runtimeInfo.build_profile,
    },
    runtime: {
      surface: isNativeDesktop() ? 'native-desktop' : 'browser',
      platform: redactDiagnosticText(runtimeInfo.platform),
      architecture: runtimeInfo.architecture,
      language,
    },
    workspace: {
      open_document_count: documents.length,
      kinds: topSecretRedaction ? {} : countKinds(documents),
      top_secret_redaction: topSecretRedaction,
    },
    providers: {
      core: {
        connected: vaultStatus.coreConnected === true,
        provider: redactDiagnosticText(runtimeInfo.core_provider),
        platform: redactDiagnosticText(vaultStatus.platform),
      },
      keyvault: {
        name: redactDiagnosticText(vaultStatus.providerName || 'unknown'),
        available: vaultStatus.providerAvailable === true,
        secure_persistence: vaultStatus.securePersistence === true,
        hardware_interface_detected: vaultStatus.hardwareInterfaceDetected === true,
        hardware_slot_supported: vaultStatus.hardwareSlotSupported === true,
        capabilities: (vaultStatus.providerCapabilities ?? []).slice(0, 32).map(redactDiagnosticText),
        locked: vaultStatus.isLocked,
        hardware_backed: vaultStatus.hardwareBacked === true,
        hardware_attestation_verified: vaultStatus.hardwareAttestationVerified === true,
        pqc_unlocked: vaultStatus.pqcUnlocked === true,
        top_secret_enrolled: vaultStatus.topSecretEnrolled === true,
        top_secret_unlocked: vaultStatus.topSecretUnlocked === true,
      },
      recovery: {
        supported: recoverySupported(),
        snapshot_count: recoverySnapshots.length,
      },
    },
    crash: { last_crash_id: latestCrashId() },
    health: {
      feature_states: (runtimeInfo.feature_states ?? []).slice(0, 64),
      self_tests: (runtimeInfo.self_tests ?? []).slice(0, 64),
      debug_mode: runtimeInfo.debug_mode ?? { enabled: false, enabled_until_ms: null },
      safe_mode: runtimeInfo.safe_mode ?? { enabled: false, third_party_plugins_enabled: true, automations_enabled: true, network_enabled: true },
    },
    logging: {
      levels: ['debug', 'info', 'warn', 'error'],
      retention: 'local-ring-buffer',
      capacity: DIAGNOSTIC_RING_CAPACITY,
      exported_entries: Math.min(logs.length, DIAGNOSTIC_EXPORT_LOG_LIMIT),
    },
    beta_boundaries: ALPHA_KNOWN_ISSUES.map((issue) => ({ id: issue.id, area: issue.area, summary: issue.summary })),
  };
}

async function sha256HexText(value:string):Promise<string>{const d=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));return Array.from(d,b=>b.toString(16).padStart(2,'0')).join('');}
async function sanitizeApprovedDocument(document: WorkspaceDocument): Promise<unknown> {
  let serialized: string;
  try {
    serialized = stringifyJsonWithinUtf8ByteLimit(document, 16 * 1024 * 1024);
  } catch (error) {
    if (error instanceof BoundedJsonSerializationError && error.code === 'SIZE_LIMIT') {
      throw new Error('DIAGNOSTIC_SELECTED_DOCUMENT_TOO_LARGE');
    }
    throw new Error('DIAGNOSTIC_SELECTED_DOCUMENT_SERIALIZATION_REJECTED');
  }
  return {schema:'astraea-workspace-diagnostic-document-fingerprint/v1',kind:document.kind,sha256:await sha256HexText(serialized)};
}

export async function buildDiagnosticBundle(input: {
  report: DiagnosticReport;
  logs?: readonly DiagnosticLogEntry[];
  selectedDocument?: WorkspaceDocument | null;
  includeSelectedDocument?: boolean;
  explicitDocumentApproval?: boolean;
}): Promise<DiagnosticBundle> {
  const logs = await Promise.all((input.logs ?? listDiagnosticLogs()).slice(-DIAGNOSTIC_EXPORT_LOG_LIMIT).map(async(entry):Promise<DiagnosticLogEntry>=>({sequence:entry.sequence,timestamp:entry.timestamp,level:entry.level,component:redactDiagnosticText(entry.component),event_id:redactDiagnosticText(entry.event_id),message:`[REDACTED_MESSAGE_SHA256:${await sha256HexText(entry.message)}]`,...(entry.crash_id?{crash_id:`crash_sha256_${(await sha256HexText(entry.crash_id)).slice(0,24)}`}:{ }),...(entry.context!==undefined?{context:{sha256:await sha256HexText(JSON.stringify(sanitizeDiagnosticValue(entry.context)))}}:{})})));
  let selectedDocument: unknown | null = null;
  let inclusion: DiagnosticBundle['selected_document_inclusion'] = 'not_requested';

  if (input.includeSelectedDocument === true) {
    if (input.explicitDocumentApproval !== true) throw new Error('DIAGNOSTIC_DOCUMENT_APPROVAL_REQUIRED');
    if (!input.selectedDocument) throw new Error('DIAGNOSTIC_SELECTED_DOCUMENT_REQUIRED');
    if (securityPolicyForDocument(input.selectedDocument).profile === 'VGT_TOP_SECRET') {
      inclusion = 'blocked_top_secret';
    } else {
      selectedDocument = await sanitizeApprovedDocument(input.selectedDocument);
      inclusion = 'approved';
    }
  }

  return {
    schema: 'astraea-workspace-repro-bundle/v1',
    generated_at: input.report.generated_at,
    report: input.report,
    logs,
    selected_document: selectedDocument,
    selected_document_inclusion: inclusion,
    sharing: { automatic_upload: false, authorized: false, requires_explicit_opt_in: true },
  };
}

export function authorizeDiagnosticSharing(bundle: DiagnosticBundle, explicitUserOptIn: boolean, now = new Date()): AuthorizedDiagnosticShare {
  if (explicitUserOptIn !== true) throw new Error('DIAGNOSTIC_SHARING_EXPLICIT_OPT_IN_REQUIRED');
  return {
    schema: 'astraea-workspace-authorized-share/v1',
    authorized_at: now.toISOString(),
    explicit_user_opt_in: true,
    bundle,
  };
}

export function serializeDiagnosticBundleExact(bundle: DiagnosticBundle): string {
  let serialized: string;
  try {
    serialized = stringifyJsonWithinUtf8ByteLimit(bundle, DIAGNOSTIC_EXPORT_MAX_BYTES - 1, 2);
  } catch (error) {
    if (error instanceof BoundedJsonSerializationError && error.code === 'SIZE_LIMIT') {
      throw new Error('DIAGNOSTIC_EXPORT_SIZE_REJECTED');
    }
    throw new Error('DIAGNOSTIC_EXPORT_SERIALIZATION_REJECTED');
  }
  const text = `${serialized}\n`;
  if (containsLikelySecretMaterial(text)) throw new Error('DIAGNOSTIC_EXPORT_SECRET_GUARD');
  return text;
}

export function openDiagnosticBundleExactPreview(serialized: string): () => void {
  if (!serialized.endsWith('\n') || serialized.length === 0) throw new Error('DIAGNOSTIC_PREVIEW_REJECTED');
  const blob = new Blob([serialized], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const preview = window.open(url, '_blank');
  if (!preview) {
    URL.revokeObjectURL(url);
    throw new Error('DIAGNOSTIC_EXACT_PREVIEW_REQUIRED');
  }
  try { preview.opener = null; } catch { /* best-effort opener isolation */ }
  return () => URL.revokeObjectURL(url);
}

/**
 * Export the exact approved diagnostic bytes.
 *
 * Release Beta 0.1: on the desktop the file is written through the native save dialog and the atomic
 * sandbox export (JSON is a supported sandbox format), so success is reported only after the file
 * exists. The browser keeps the download-link fallback.
 */
export async function downloadDiagnosticBundle(bundle: DiagnosticBundle, exactSerialized?: string): Promise<string> {
  const text = exactSerialized ?? serializeDiagnosticBundleExact(bundle);
  const canonical = serializeDiagnosticBundleExact(bundle);
  if (text !== canonical) throw new Error('DIAGNOSTIC_PREVIEW_EXPORT_MISMATCH');
  const fileName = `astraea-workspace-diagnostics-${bundle.generated_at.replace(/[:.]/g, '-')}.json`;
  const bytes = new TextEncoder().encode(text);
  if (bytes.byteLength === 0) throw new Error('DIAGNOSTIC_EXPORT_SIZE_REJECTED');
  const nativeName = await nativeShellSaveBytes(DEFAULT_SHELL_NATIVE_POLICY, bytes, {
    suggestedName: fileName,
    extensions: ['json'],
  });
  if (nativeName) return nativeName;
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const element = document.createElement('a');
  element.href = url;
  element.download = fileName;
  document.body.appendChild(element);
  element.click();
  element.remove();
  URL.revokeObjectURL(url);
  return fileName;
}
