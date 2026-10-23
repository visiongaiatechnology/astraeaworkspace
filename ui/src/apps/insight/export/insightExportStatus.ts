// STATUS: PLATIN — honest delivery wording for Insight exports (Release Beta 0.1).
import type { ExportDeliveryResult } from '../../../shared/interchange/exportDelivery';

export function insightDeliveryText(result: ExportDeliveryResult): string {
  return result.mode === 'file'
    ? `${result.fileName} saved.`
    : `Download started: ${result.fileName} (browser mode – no write confirmation).`;
}
