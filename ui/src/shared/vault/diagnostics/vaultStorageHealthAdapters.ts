import type { VaultStorageCapacitySnapshot } from '../../contracts/workspace';
import { invokeNative, isNativeDesktop } from '../../../platform/native/nativeBridge';

export async function queryVaultStorageCapacity(now = Date.now()): Promise<VaultStorageCapacitySnapshot> {
  if (isNativeDesktop()) {
    try {
      const result = await invokeNative<{ total_bytes: number; free_bytes: number }>('vgt_vault_disk_space');
      const totalBytes = Number(result.total_bytes); const freeBytes = Number(result.free_bytes);
      if (Number.isFinite(totalBytes) && totalBytes > 0 && Number.isFinite(freeBytes) && freeBytes >= 0) {
        return { source: 'host_disk', totalBytes, freeBytes, usedBytes: Math.max(0, totalBytes - freeBytes), capturedAt: now };
      }
    } catch { /* truthful browser quota fallback below */ }
  }
  if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      const totalBytes = typeof estimate.quota === 'number' ? estimate.quota : undefined;
      const usedBytes = typeof estimate.usage === 'number' ? estimate.usage : undefined;
      if (totalBytes && totalBytes > 0) return { source: 'browser_quota', totalBytes, usedBytes, freeBytes: Math.max(0, totalBytes - (usedBytes ?? 0)), capturedAt: now };
    } catch { /* unavailable below */ }
  }
  return { source: 'unavailable', capturedAt: now };
}
