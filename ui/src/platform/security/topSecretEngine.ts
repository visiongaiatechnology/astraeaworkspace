import { secureRandomId } from '../../shared/crypto/secureRandom';
// STATUS: DIAMANT VGT SUPREME — native-only VGT Top Secret bridge
import type { WorkspaceDocument } from '../../shared/contracts/workspace';
import { invokeNative, isNativeDesktop, listenNative } from '../native/nativeBridge';
import { INFINITY_PINNED_COMMIT, INFINITY_SUITE } from './securityProfiles';

export const TOP_SECRET_OUTER_MAGIC = 'VGATS001' as const;
export const TOP_SECRET_OUTER_SUITE = 'VGT-ASTRAEA-TS-1' as const;
export const INFINITY_CONTAINER_MAGIC = 'VGTINF02' as const;

export type TopSecretPhase =
  | 'PREPARING_INNER_VWC'
  | 'KEM_ENCAPSULATION'
  | 'INFINITY_CASCADE'
  | 'PQ_SIGNATURES'
  | 'ATOMIC_WRITE'
  | 'VERIFYING_OUTER'
  | 'VERIFY_PQ_SIGNATURES'
  | 'OPEN_INFINITY_LAYERS'
  | 'AUTHENTICATE_INNER_VWC'
  | 'COMPLETE';

export interface TopSecretProgressEvent {
  operation_id: string;
  phase: TopSecretPhase;
  bytes_completed: number;
  bytes_total?: number | null;
  chunks_completed: number;
  chunks_total?: number | null;
  cancellable: boolean;
}

export interface TopSecretRuntimeStatus {
  connected: boolean;
  providerReady: boolean;
  identityReady: boolean;
  topSecretUnlocked: boolean;
  outerSuite: string;
  infinitySuite: string;
  infinityCommit: string;
  assurance: string;
  errorCode?: string;
}

interface TopSecretStatusPayload {
  success?: boolean;
  provider_ready?: boolean;
  identity_ready?: boolean;
  top_secret_unlocked?: boolean;
  outer_suite?: string;
  infinity_suite?: string;
  infinity_commit?: string;
  assurance?: string;
  error_code?: string | null;
}

export async function fetchTopSecretStatus(): Promise<TopSecretRuntimeStatus> {
  if (!isNativeDesktop()) return disconnectedTopSecretStatus();
  try {
    const data = await invokeNative<TopSecretStatusPayload>('vgt_top_secret_status');
    return {
      connected: data.success === true,
      providerReady: data.provider_ready === true,
      identityReady: data.identity_ready === true,
      topSecretUnlocked: data.top_secret_unlocked === true,
      outerSuite: data.outer_suite || TOP_SECRET_OUTER_SUITE,
      infinitySuite: data.infinity_suite || INFINITY_SUITE,
      infinityCommit: data.infinity_commit || INFINITY_PINNED_COMMIT,
      assurance: data.assurance || 'VGT security profile; not a governmental classification or certification',
      errorCode: data.error_code || undefined,
    };
  } catch {
    return disconnectedTopSecretStatus();
  }
}

function disconnectedTopSecretStatus(): TopSecretRuntimeStatus {
  return {
    connected: false,
    providerReady: false,
    identityReady: false,
    topSecretUnlocked: false,
    outerSuite: TOP_SECRET_OUTER_SUITE,
    infinitySuite: INFINITY_SUITE,
    infinityCommit: INFINITY_PINNED_COMMIT,
    assurance: 'Native Top Secret provider unavailable',
    errorCode: 'TS_PROVIDER_UNAVAILABLE',
  };
}

export async function initializeTopSecretIdentity(): Promise<TopSecretRuntimeStatus> {
  if (!isNativeDesktop()) throw new Error('TS_PROVIDER_UNAVAILABLE');
  const data = await invokeNative<TopSecretStatusPayload>('vgt_top_secret_initialize_identity');
  if (data.success !== true) throw new Error(data.error_code || 'TS_IDENTITY_INITIALIZATION_FAILED');
  return fetchTopSecretStatus();
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunk, bytes.length)));
  }
  return btoa(binary);
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

export function isTopSecretOuterContainer(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 8) return false;
  return new TextDecoder('ascii').decode(bytes.subarray(0, 8)) === TOP_SECRET_OUTER_MAGIC;
}

export function isStandaloneInfinityContainer(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 8) return false;
  return new TextDecoder('ascii').decode(bytes.subarray(0, 8)) === INFINITY_CONTAINER_MAGIC;
}

export function newTopSecretOperationId(prefix: 'seal' | 'open' | 'export' | 'recovery'): string {
  const suffix = secureRandomId(prefix);
  return `${prefix}-${suffix}`.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 96);
}

export async function packTopSecretContainer(
  document: WorkspaceDocument,
  options: { pin?: string; password?: string; operationId?: string } = {},
): Promise<Uint8Array> {
  if (!isNativeDesktop()) throw new Error('TS_PROVIDER_UNAVAILABLE');
  const operationId = options.operationId || newTopSecretOperationId('seal');
  const data = await invokeNative<{ success?: boolean; container_base64?: string | null; error_code?: string | null }>('vgt_top_secret_pack', {
    request: {
      operation_id: operationId,
      document,
      pin: options.pin || null,
      password: options.password || null,
    },
  });
  if (!data.success || !data.container_base64) throw new Error(data.error_code || 'TS_SEAL_FAILED');
  return decodeBase64(data.container_base64);
}

export async function unpackTopSecretContainer(
  bytes: Uint8Array,
  options: { pin?: string; password?: string; recipientPrivateKey?: string; operationId?: string } = {},
): Promise<WorkspaceDocument> {
  if (!isNativeDesktop()) throw new Error('TS_PROVIDER_UNAVAILABLE');
  const operationId = options.operationId || newTopSecretOperationId('open');
  const data = await invokeNative<{
    success?: boolean; document?: WorkspaceDocument | null; requires_pin?: boolean; requires_password?: boolean; error_code?: string | null;
  }>('vgt_top_secret_unpack', {
    request: {
      operation_id: operationId,
      container_base64: encodeBase64(bytes),
      pin: options.pin || null,
      password: options.password || null,
      recipient_private_key: options.recipientPrivateKey || null,
    },
  });
  if (data.requires_pin) throw new Error('PIN_REQUIRED');
  if (data.requires_password) throw new Error('PASSWORD_REQUIRED');
  if (!data.success || !data.document) throw new Error(data.error_code || 'TS_OPEN_FAILED');
  return data.document;
}

export async function exportAsVgtInfinity(
  document: WorkspaceDocument,
  options: { pin?: string; password?: string; operationId?: string } = {},
): Promise<Uint8Array> {
  if (!isNativeDesktop()) throw new Error('TS_PROVIDER_UNAVAILABLE');
  const operationId = options.operationId || newTopSecretOperationId('export');
  const data = await invokeNative<{ success?: boolean; container_base64?: string | null; error_code?: string | null }>('vgt_top_secret_export_infinity', {
    request: { operation_id: operationId, document, pin: options.pin || null, password: options.password || null },
  });
  if (!data.success || !data.container_base64) throw new Error(data.error_code || 'TS_INFINITY_EXPORT_FAILED');
  return decodeBase64(data.container_base64);
}

export async function importVgtInfinityContainer(
  bytes: Uint8Array,
  options: { pin?: string; password?: string; recipientPrivateKey?: string; operationId?: string } = {},
): Promise<WorkspaceDocument> {
  if (!isNativeDesktop()) throw new Error('TS_PROVIDER_UNAVAILABLE');
  const operationId = options.operationId || newTopSecretOperationId('open');
  const data = await invokeNative<{ success?: boolean; document?: WorkspaceDocument | null; requires_pin?: boolean; requires_password?: boolean; error_code?: string | null }>('vgt_top_secret_import_infinity', {
    request: {
      operation_id: operationId, container_base64: encodeBase64(bytes), pin: options.pin || null,
      password: options.password || null, recipient_private_key: options.recipientPrivateKey || null,
    },
  });
  if (data.requires_pin) throw new Error('PIN_REQUIRED');
  if (data.requires_password) throw new Error('PASSWORD_REQUIRED');
  if (!data.success || !data.document) throw new Error(data.error_code || 'TS_INFINITY_IMPORT_FAILED');
  return data.document;
}

export async function cancelTopSecretOperation(operationId: string): Promise<void> {
  if (!isNativeDesktop()) return;
  await invokeNative<boolean>('vgt_top_secret_cancel', { request: { operation_id: operationId } });
}

export async function listenTopSecretProgress(handler: (event: TopSecretProgressEvent) => void): Promise<() => void> {
  return listenNative<TopSecretProgressEvent>('vgt://top-secret/progress', handler);
}
