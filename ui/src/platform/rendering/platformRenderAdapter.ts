// STATUS: DIAMANT VGT SUPREME — isolated platform metric contracts with identical semantic units
export type RenderPlatform = 'windows' | 'linux' | 'macos' | 'astraeaos';

export interface PlatformRenderAdapterContract {
  platform: RenderPlatform;
  canonicalUnit: 'css-px-96dpi';
  textMetricSource: 'system-font-metrics';
  fontDiscovery: 'local-system-only';
  devicePixelRatioBounded: true;
  noNetworkFontResolution: true;
}

export function platformRenderAdapterContract(platform: RenderPlatform): PlatformRenderAdapterContract {
  return { platform, canonicalUnit: 'css-px-96dpi', textMetricSource: 'system-font-metrics', fontDiscovery: 'local-system-only', devicePixelRatioBounded: true, noNetworkFontResolution: true };
}
