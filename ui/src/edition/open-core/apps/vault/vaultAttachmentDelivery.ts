// STATUS: PLATIN — Open-Core Vault attachment delivery (Release Beta 0.1).
import type { VaultFile } from '../../../../shared/contracts/workspace';
import { deliverExportDataUrl, type ExportDeliveryResult } from '../../../../shared/interchange/exportDelivery';

/**
 * Release Beta 0.1: A Vault attachment is written through the native save path on the desktop; the
 * browser fallback stays a download and must be reported as such by the caller. A missing payload is
 * an error by name — never a silent no-op.
 */
export async function deliverVaultAttachment(file: VaultFile): Promise<ExportDeliveryResult> {
  if (file.sourceType !== 'attachment' || !file.payloadDataUrl) throw new Error('Vault attachment payload is unavailable.');
  const extension = /\.[A-Za-z0-9]{1,12}$/u.test(file.name) ? file.name.split('.').pop()!.toLowerCase() : 'bin';
  return deliverExportDataUrl(file.payloadDataUrl, { suggestedName: file.name, extensions: [extension] });
}
