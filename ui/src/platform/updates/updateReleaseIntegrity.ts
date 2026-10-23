// STATUS: DIAMANT VGT SUPREME — update policy is explicit; signature/hash/rollback truth remains native.

import { invokeNative, isNativeDesktop } from '../native/nativeBridge';

export type UpdateChannel = 'stable' | 'beta' | 'managed';
export type UpdateSourceKind = 'official' | 'self_hosted' | 'managed' | 'offline_manual';

export interface UpdateSourcePolicy {
  kind: UpdateSourceKind;
  endpoint: string | null;
}

export interface UpdatePolicy {
  enabled: boolean;
  channel: UpdateChannel;
  source: UpdateSourcePolicy;
  networkDownload: 'disabled' | 'manual' | 'managed';
  automaticInstall: false;
  allowDelta: boolean;
  allowOfflineManual: boolean;
}

export interface NativeUpdateReleaseStatus {
  configured: boolean;
  current_version: string;
  current_sequence: number | null;
  release_channel: string | null;
  key_id: string | null;
  network_download_default: false;
  automatic_install_default: false;
}

export interface UpdateRecoveryJournal {
  schema: 'astraea-update-recovery/v1';
  pending_version: string;
  pending_sequence: number;
  pending_sha256: string;
  pending_cached_path: string;
  previous_version: string;
  previous_sequence: number;
  previous_sha256: string | null;
  previous_cached_path: string | null;
  phase: 'verified_staged' | 'installing' | 'install_failed';
  install_attempts: number;
}

export interface VerifiedOfflineUpdate {
  verified: true;
  version: string;
  sequence: number;
  channel: UpdateChannel;
  artifact_kind: 'full' | 'delta';
  artifact_file_name: string;
  artifact_sha256: string;
  cached_path: string;
  rollback_authorized: boolean;
  security_advisory_url: string;
  journal: UpdateRecoveryJournal;
}

export const DEFAULT_UPDATE_POLICY: Readonly<UpdatePolicy> = {
  enabled: false,
  channel: 'stable',
  source: { kind: 'official', endpoint: null },
  networkDownload: 'disabled',
  automaticInstall: false,
  allowDelta: true,
  allowOfflineManual: true,
};

function validHttpsEndpoint(endpoint: string): boolean {
  try {
    const parsed = new URL(endpoint);
    return parsed.protocol === 'https:' && parsed.username === '' && parsed.password === '' && parsed.hash === '';
  } catch {
    return false;
  }
}

export function normalizeUpdatePolicy(input: Partial<UpdatePolicy> | null | undefined): UpdatePolicy {
  const source = input?.source ?? DEFAULT_UPDATE_POLICY.source;
  const sourceKind: UpdateSourceKind = ['official', 'self_hosted', 'managed', 'offline_manual'].includes(source.kind) ? source.kind : 'official';
  const endpoint = source.endpoint?.trim() || null;
  if (endpoint !== null && !validHttpsEndpoint(endpoint)) throw new Error('UPDATE_SOURCE_ENDPOINT_REJECTED');
  if (sourceKind === 'offline_manual' && endpoint !== null) throw new Error('UPDATE_OFFLINE_SOURCE_ENDPOINT_REJECTED');
  if ((sourceKind === 'self_hosted' || sourceKind === 'managed') && endpoint === null) throw new Error('UPDATE_SOURCE_ENDPOINT_REQUIRED');
  const channel: UpdateChannel = input?.channel === 'beta' || input?.channel === 'managed' ? input.channel : 'stable';
  const networkDownload = input?.networkDownload === 'manual' || input?.networkDownload === 'managed' ? input.networkDownload : 'disabled';
  if (networkDownload === 'managed' && sourceKind !== 'managed') throw new Error('UPDATE_MANAGED_DOWNLOAD_SOURCE_REQUIRED');
  return {
    enabled: input?.enabled === true,
    channel,
    source: { kind: sourceKind, endpoint },
    networkDownload,
    automaticInstall: false,
    allowDelta: input?.allowDelta !== false,
    allowOfflineManual: input?.allowOfflineManual !== false,
  };
}

export function canDownloadUpdate(policy: UpdatePolicy, explicitUserAction: boolean): boolean {
  if (!policy.enabled || policy.networkDownload === 'disabled' || policy.source.kind === 'offline_manual') return false;
  return explicitUserAction === true;
}

export function canCheckForUpdates(policy: UpdatePolicy, explicitUserAction: boolean): boolean {
  if (!policy.enabled || policy.source.kind === 'offline_manual') return false;
  return explicitUserAction === true;
}

export async function readNativeUpdateReleaseStatus(): Promise<NativeUpdateReleaseStatus> {
  if (!isNativeDesktop()) {
    return {
      configured: false,
      current_version: 'browser',
      current_sequence: null,
      release_channel: null,
      key_id: null,
      network_download_default: false,
      automatic_install_default: false,
    };
  }
  return invokeNative<NativeUpdateReleaseStatus>('vgt_update_release_status');
}

export async function verifyAndStageOfflineUpdate(input: {
  signedManifestJson: string;
  packagePath: string;
  policy: UpdatePolicy;
  recoveryMode?: boolean;
}): Promise<VerifiedOfflineUpdate> {
  if (!isNativeDesktop()) throw new Error('UPDATE_NATIVE_DESKTOP_REQUIRED');
  if (!input.policy.enabled) throw new Error('UPDATE_EXPLICIT_POLICY_REQUIRED');
  if (!input.policy.allowOfflineManual) throw new Error('UPDATE_OFFLINE_POLICY_REJECTED');
  if (input.signedManifestJson.length === 0 || input.signedManifestJson.length > 256 * 1024) throw new Error('UPDATE_MANIFEST_SIZE_REJECTED');
  if (input.packagePath.length === 0 || input.packagePath.length > 4096) throw new Error('UPDATE_PACKAGE_PATH_REJECTED');
  return invokeNative<VerifiedOfflineUpdate>('vgt_update_verify_and_stage_offline', {
    request: {
      signed_manifest_json: input.signedManifestJson,
      package_path: input.packagePath,
      expected_channel: input.policy.channel,
      explicit_update_policy: true,
      allow_offline_manual: input.policy.allowOfflineManual,
      allow_delta: input.policy.allowDelta,
      recovery_mode: input.recoveryMode === true,
    },
  });
}

export async function readUpdateRecoveryStatus(): Promise<UpdateRecoveryJournal | null> {
  if (!isNativeDesktop()) return null;
  return invokeNative<UpdateRecoveryJournal | null>('vgt_update_recovery_status');
}

export async function markUpdateInstallStarted(): Promise<UpdateRecoveryJournal> {
  if (!isNativeDesktop()) throw new Error('UPDATE_NATIVE_DESKTOP_REQUIRED');
  return invokeNative<UpdateRecoveryJournal>('vgt_update_mark_install_started');
}

export async function markUpdateInstallFailed(): Promise<UpdateRecoveryJournal> {
  if (!isNativeDesktop()) throw new Error('UPDATE_NATIVE_DESKTOP_REQUIRED');
  return invokeNative<UpdateRecoveryJournal>('vgt_update_mark_install_failed');
}

export async function clearUpdateRecoveryState(): Promise<boolean> {
  if (!isNativeDesktop()) return false;
  return invokeNative<boolean>('vgt_update_clear_recovery');
}

export interface UpdateTransferCheckpoint {
  schema: 'vgt.update.transfer/1';
  transfer_id: string;
  payload_kind: 'full' | 'delta';
  artifact_file_name: string;
  expected_bytes: number;
  received_bytes: number;
  expected_sha256: string;
  phase: 'active' | 'paused' | 'complete';
  requires_manifest_signature_verification: true;
  requires_package_signature_verification: true;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + chunk)));
  }
  return btoa(binary);
}

export function updateManifestEndpoint(policy: UpdatePolicy): string | null {
  const normalized = normalizeUpdatePolicy(policy);
  if (!normalized.enabled || normalized.source.kind === 'offline_manual') return null;
  if (normalized.source.kind === 'official') return normalized.source.endpoint;
  if (normalized.source.kind === 'self_hosted' || normalized.source.kind === 'managed') return normalized.source.endpoint;
  return null;
}

export async function beginUpdateTransfer(input: {
  transferId: string;
  payloadKind: 'full' | 'delta';
  artifactFileName: string;
  expectedBytes: number;
  expectedSha256: string;
}): Promise<UpdateTransferCheckpoint> {
  if (!isNativeDesktop()) throw new Error('UPDATE_NATIVE_DESKTOP_REQUIRED');
  if (!Number.isSafeInteger(input.expectedBytes) || input.expectedBytes <= 0 || input.expectedBytes > 4 * 1024 * 1024 * 1024) throw new Error('UPDATE_TRANSFER_SIZE_REJECTED');
  return invokeNative<UpdateTransferCheckpoint>('vgt_update_transfer_begin', {
    request: {
      transfer_id: input.transferId,
      payload_kind: input.payloadKind,
      artifact_file_name: input.artifactFileName,
      expected_bytes: input.expectedBytes,
      expected_sha256: input.expectedSha256,
    },
  });
}

export async function appendUpdateTransferChunk(transferId: string, offset: number, bytes: Uint8Array): Promise<UpdateTransferCheckpoint> {
  if (!isNativeDesktop()) throw new Error('UPDATE_NATIVE_DESKTOP_REQUIRED');
  if (!Number.isSafeInteger(offset) || offset < 0 || bytes.byteLength === 0 || bytes.byteLength > 4 * 1024 * 1024) throw new Error('UPDATE_TRANSFER_CHUNK_REJECTED');
  return invokeNative<UpdateTransferCheckpoint>('vgt_update_transfer_append', {
    request: { transfer_id: transferId, offset, chunk_base64: bytesToBase64(bytes) },
  });
}

export async function pauseUpdateTransfer(transferId: string): Promise<UpdateTransferCheckpoint> {
  if (!isNativeDesktop()) throw new Error('UPDATE_NATIVE_DESKTOP_REQUIRED');
  return invokeNative<UpdateTransferCheckpoint>('vgt_update_transfer_pause', { request: { transfer_id: transferId } });
}

export async function resumeUpdateTransfer(transferId: string): Promise<UpdateTransferCheckpoint> {
  if (!isNativeDesktop()) throw new Error('UPDATE_NATIVE_DESKTOP_REQUIRED');
  return invokeNative<UpdateTransferCheckpoint>('vgt_update_transfer_resume', { request: { transfer_id: transferId } });
}

export async function readUpdateTransferStatus(transferId: string): Promise<UpdateTransferCheckpoint> {
  if (!isNativeDesktop()) throw new Error('UPDATE_NATIVE_DESKTOP_REQUIRED');
  return invokeNative<UpdateTransferCheckpoint>('vgt_update_transfer_status', { request: { transfer_id: transferId } });
}

export async function verifyAndStageCompletedTransfer(input: {
  signedManifestJson: string;
  transferId: string;
  policy: UpdatePolicy;
  recoveryMode?: boolean;
}): Promise<VerifiedOfflineUpdate> {
  if (!isNativeDesktop()) throw new Error('UPDATE_NATIVE_DESKTOP_REQUIRED');
  if (!input.policy.enabled) throw new Error('UPDATE_EXPLICIT_POLICY_REQUIRED');
  if (input.signedManifestJson.length === 0 || input.signedManifestJson.length > 256 * 1024) throw new Error('UPDATE_MANIFEST_SIZE_REJECTED');
  return invokeNative<VerifiedOfflineUpdate>('vgt_update_verify_and_stage_transfer', {
    request: {
      signed_manifest_json: input.signedManifestJson,
      transfer_id: input.transferId,
      expected_channel: input.policy.channel,
      explicit_update_policy: true,
      allow_delta: input.policy.allowDelta,
      recovery_mode: input.recoveryMode === true,
    },
  });
}


export async function verifyAndStageAuthorizedRollback(input: {
  signedManifestJson: string;
  packagePath: string;
  policy: UpdatePolicy;
}): Promise<VerifiedOfflineUpdate> {
  return verifyAndStageOfflineUpdate({ ...input, recoveryMode: true });
}
