// STATUS: DIAMANT VGT SUPREME
// Explicit recipient/certificate-encryption adapter target. No browser fallback may weaken this boundary.

import { fetchKeyVaultRuntimeStatus } from '../../../../platform/operations/appContainerOps';

export interface PdfRecipientEncryptionAvailability {
  adapterId: 'vgt-native-keyvault-pdf-recipient-v1';
  keyVaultConnected: boolean;
  keyVaultUnlocked: boolean;
  hardwareBacked: boolean;
  platform: string;
  ready: boolean;
  reason: string;
}

export async function inspectPdfRecipientEncryptionAvailability(): Promise<PdfRecipientEncryptionAvailability> {
  const status = await fetchKeyVaultRuntimeStatus();
  const ready = false; // Native PDF CMS/recipient encryption command is intentionally not implemented yet.
  return {
    adapterId: 'vgt-native-keyvault-pdf-recipient-v1',
    keyVaultConnected: status.connected,
    keyVaultUnlocked: status.isUnlocked,
    hardwareBacked: status.hardwareBacked,
    platform: status.platform,
    ready,
    reason: status.connected
      ? 'KeyVault is reachable, but the native PDF recipient-encryption provider is not installed. Astraea fails closed rather than exporting a weaker substitute.'
      : 'Native KeyVault provider is unavailable. Recipient/certificate PDF encryption remains disabled and no browser fallback is permitted.',
  };
}

export async function encryptPdfForRecipientsFailClosed(): Promise<never> {
  const availability = await inspectPdfRecipientEncryptionAvailability();
  throw new Error(availability.reason);
}
