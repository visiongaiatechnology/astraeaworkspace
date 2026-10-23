// STATUS: DIAMANT VGT SUPREME — Platform-neutral WOM semantic boundary declaration
export type WomSupportedPlatform = 'windows' | 'linux' | 'macos' | 'astraeaos';

export interface WomPlatformContract {
  platform: WomSupportedPlatform;
  semanticEncoding: 'utf-8-canonical-json';
  timestampUnit: 'unix-ms';
  pathSemantics: 'outside-wom';
  cryptoContainerBoundary: 'vgt-container';
}

/**
 * WOM deliberately has no per-OS semantic fork. Filesystem, secure storage and windowing
 * differences terminate at their platform adapters before/after the canonical WOM bytes.
 */
export const WOM_PLATFORM_CONTRACTS: Readonly<Record<WomSupportedPlatform, WomPlatformContract>> = Object.freeze({
  windows: { platform: 'windows', semanticEncoding: 'utf-8-canonical-json', timestampUnit: 'unix-ms', pathSemantics: 'outside-wom', cryptoContainerBoundary: 'vgt-container' },
  linux: { platform: 'linux', semanticEncoding: 'utf-8-canonical-json', timestampUnit: 'unix-ms', pathSemantics: 'outside-wom', cryptoContainerBoundary: 'vgt-container' },
  macos: { platform: 'macos', semanticEncoding: 'utf-8-canonical-json', timestampUnit: 'unix-ms', pathSemantics: 'outside-wom', cryptoContainerBoundary: 'vgt-container' },
  astraeaos: { platform: 'astraeaos', semanticEncoding: 'utf-8-canonical-json', timestampUnit: 'unix-ms', pathSemantics: 'outside-wom', cryptoContainerBoundary: 'vgt-container' },
});

export function assertPlatformNeutralWomContract(): void {
  const baseline = WOM_PLATFORM_CONTRACTS.windows;
  for (const contract of Object.values(WOM_PLATFORM_CONTRACTS)) {
    if (contract.semanticEncoding !== baseline.semanticEncoding || contract.timestampUnit !== baseline.timestampUnit || contract.pathSemantics !== baseline.pathSemantics || contract.cryptoContainerBoundary !== baseline.cryptoContainerBoundary) {
      throw new Error(`WOM_PLATFORM_SEMANTIC_DRIFT:${contract.platform}`);
    }
  }
}
