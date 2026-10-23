// Native UI adapter only. The Rust vgt-plugin-runtime Core owns all security decisions.
import { invokeNative } from '../native/nativeBridge';
import type { PluginCapabilityManifest, PluginExecutionPermit, PluginInstallReview } from './pluginRuntimePolicy';

export interface PluginRuntimeStatus {
  pluginId: string;
  version: string;
  userEnabled: boolean;
  adminEnabled: boolean;
  safeMode: boolean;
  quarantined: boolean;
  consecutiveCrashes: number;
  signatureState: string;
  signerFingerprintSha256?: string;
  capabilities: string[];
}

export async function reviewOfflinePluginPackage(
  manifest: PluginCapabilityManifest,
  packageBytes: Uint8Array,
  sourceLabel: string,
): Promise<PluginInstallReview> {
  return invokeNative<PluginInstallReview>('vgt_plugin_runtime_review_offline', {
    request: { manifest, packageBase64: toBase64(packageBytes), sourceLabel },
  });
}

export async function installOfflinePluginPackage(
  manifest: PluginCapabilityManifest,
  packageBytes: Uint8Array,
  sourceLabel: string,
  explicitConsent: boolean,
): Promise<PluginInstallReview> {
  return invokeNative<PluginInstallReview>('vgt_plugin_runtime_install_offline', {
    request: { manifest, packageBase64: toBase64(packageBytes), sourceLabel, explicitConsent },
  });
}

export async function requestPluginExecutionPermit(pluginId: string): Promise<PluginExecutionPermit> {
  const permit = await invokeNative<Omit<PluginExecutionPermit, 'authority'>>('vgt_plugin_runtime_execution_permit', { pluginId });
  return { ...permit, authority: 'native-core' };
}

export async function pluginRuntimeStatus(pluginId: string): Promise<PluginRuntimeStatus> {
  return invokeNative<PluginRuntimeStatus>('vgt_plugin_runtime_status', { pluginId });
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + 0x8000)));
  }
  return btoa(binary);
}

export async function grantPluginDocumentAccess(
  pluginId: string,
  documentId: string,
  explicitUserConfirmation: boolean,
): Promise<boolean> {
  return invokeNative<boolean>('vgt_plugin_runtime_grant_document_access', {
    request: { pluginId, documentId, explicitUserConfirmation },
  });
}

export async function trustPluginDeveloperSigner(
  signerFingerprintSha256: string,
  explicitUserConfirmation: boolean,
): Promise<boolean> {
  return invokeNative<boolean>('vgt_plugin_runtime_trust_signer', {
    request: { signerFingerprintSha256, explicitUserConfirmation },
  });
}
