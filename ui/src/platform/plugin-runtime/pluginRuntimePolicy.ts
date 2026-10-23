// STATUS: PLATIN — UI types for the authoritative native vgt-plugin-runtime Core.
// Security decisions are not made here. Production install/signature/capability truth lives in Rust.

export const PLUGIN_MANIFEST_SCHEMA = 'vgt.workspace.plugin-manifest/2' as const;
export const PLUGIN_API_VERSION = 'vgt.workspace.plugin/1' as const;
export const MAX_PLUGIN_WASM_BYTES = 4 * 1024 * 1024;

export const LEGACY_ACTIVE_CODE_COMPATIBILITY = Object.freeze({
  vba: false,
  activeX: false,
  nativeDynamicLibraries: false,
  installShellHooks: false,
});

export type PluginCapability =
  | 'document.read'
  | 'document.propose-operations'
  | 'commands.register'
  | 'panels.register'
  | 'import-export.transform'
  | 'automation.action'
  | 'data.connector'
  | 'network.request'
  | 'storage.scoped'
  | 'clipboard.read'
  | 'clipboard.write'
  | 'secrets.use-handle';

export interface PluginResourceLimits {
  maxLinearMemoryBytes: number;
  maxCpuMs: number;
  maxExecutionMs: number;
  maxInputBytes: number;
  maxOutputBytes: number;
  maxStorageBytes: number;
}

export interface PluginPackageSignature {
  algorithm: 'Ed25519';
  keyId: string;
  publicKeyBase64: string;
  signatureBase64: string;
}

export interface PluginCapabilityManifest {
  schemaVersion: typeof PLUGIN_MANIFEST_SCHEMA;
  pluginId: string;
  name: string;
  publisher: string;
  version: string;
  apiCompatibility: { minimumInclusive: typeof PLUGIN_API_VERSION; maximumExclusive?: string };
  packageSha256: string;
  signature?: PluginPackageSignature;
  entrypoints: Array<{ kind: 'wasm'; exportName: string }>;
  requestedCapabilities: PluginCapability[];
  resourceLimits: PluginResourceLimits;
  updateSource: { kind: 'offline-file'; sourceId: string } | { kind: 'managed-channel'; channelId: string } | { kind: 'disabled' };
}

export interface ScopedSecretHandle {
  handleId: string;
  pluginId: string;
  scope: string;
  expiresAtUnixMs: number;
}

export interface PluginExecutionPermit {
  pluginId: string;
  version: string;
  packageSha256: string;
  negotiatedApiVersion: string;
  entrypointExport: string;
  resourceLimits: PluginResourceLimits;
  hostCapabilities: PluginCapability[];
  standardTierImportlessWasm: boolean;
  authority: 'native-core' | 'unprivileged-demo';
}

export interface PluginInstallReview {
  pluginId: string;
  name: string;
  publisher: string;
  version: string;
  signatureState: 'UNSIGNED_EXPLICIT_REVIEW' | 'VERIFIED_UNPINNED' | 'VERIFIED_PINNED' | 'REJECTED';
  signerFingerprintSha256?: string;
  requestedCapabilities: PluginCapability[];
  updateSource: string;
  negotiatedApiVersion: string;
  reconsentRequired: boolean;
}

/**
 * Development/demo convenience only. It never grants a host capability and cannot authorize IPC.
 * Production permits come from vgt-plugin-runtime through the native bridge.
 */
export function createUnprivilegedDemoPermit(manifest: PluginCapabilityManifest): PluginExecutionPermit {
  const entrypoint = manifest.entrypoints[0];
  if (!entrypoint || entrypoint.kind !== 'wasm') throw new Error('PLUGIN_DEMO_ENTRYPOINT_REJECTED');
  return {
    pluginId: manifest.pluginId,
    version: manifest.version,
    packageSha256: manifest.packageSha256,
    negotiatedApiVersion: PLUGIN_API_VERSION,
    entrypointExport: entrypoint.exportName,
    resourceLimits: { ...manifest.resourceLimits },
    hostCapabilities: [],
    standardTierImportlessWasm: true,
    authority: 'unprivileged-demo',
  };
}

export function pluginUpdateSourceLabel(manifest: PluginCapabilityManifest): string {
  if (manifest.updateSource.kind === 'offline-file') return `Offline: ${manifest.updateSource.sourceId}`;
  if (manifest.updateSource.kind === 'managed-channel') return `Managed: ${manifest.updateSource.channelId}`;
  return 'Updates disabled';
}
