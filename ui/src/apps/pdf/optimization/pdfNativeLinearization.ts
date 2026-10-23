// STATUS: DIAMANT VGT SUPREME
// Optional native Fast Web View provider. No browser emulation or fake /Linearized dictionary fallback.

import { invokeNative, isNativeDesktop } from '../../../platform/native/nativeBridge';

export interface PdfLinearizationStatus {
  available: boolean;
  provider: string;
  reason: string;
}

interface NativeLinearizationResponse {
  success?: boolean;
  provider?: string;
  bytes?: number[] | Uint8Array | null;
  error?: string | null;
}

const MAX_PDF_BYTES = 128 * 1024 * 1024;

export async function inspectPdfLinearizationAvailability(): Promise<PdfLinearizationStatus> {
  if (!isNativeDesktop()) return { available: false, provider: 'Unavailable', reason: 'Fast Web View requires the native Astraea desktop provider.' };
  try {
    const result = await invokeNative<{ available?: boolean; provider?: string; reason?: string }>('vgt_pdf_linearization_status');
    return {
      available: result.available === true,
      provider: typeof result.provider === 'string' ? result.provider : 'Unknown native provider',
      reason: typeof result.reason === 'string' ? result.reason : 'Native Fast Web View provider returned no status reason.',
    };
  } catch {
    return { available: false, provider: 'Unavailable', reason: 'Native Fast Web View status could not be queried.' };
  }
}

export async function linearizePdfWithNativeProvider(bytes: Uint8Array): Promise<{ bytes: Uint8Array; provider: string }> {
  if (!isNativeDesktop()) throw new Error('Fast Web View requires Astraea Desktop. Browser fallback is intentionally unavailable.');
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0 || bytes.byteLength > MAX_PDF_BYTES) throw new Error('PDF violates the Fast Web View byte policy.');
  if (new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(bytes.length, 8192))).includes('/Encrypt')) throw new Error('Encrypted PDFs must be decrypted before Fast Web View linearization.');
  const result = await invokeNative<NativeLinearizationResponse>('vgt_pdf_linearize', { request: { bytes: Array.from(bytes) } });
  if (result.success !== true || !result.bytes) throw new Error(result.error || 'Native Fast Web View provider failed closed.');
  const output = result.bytes instanceof Uint8Array ? result.bytes : new Uint8Array(result.bytes);
  if (!output.byteLength || output.byteLength > MAX_PDF_BYTES || !new TextDecoder('latin1').decode(output.subarray(0, Math.min(output.length, 8192))).includes('/Linearized')) {
    throw new Error('Native Fast Web View output failed the linearization boundary check.');
  }
  return { bytes: output, provider: typeof result.provider === 'string' ? result.provider : 'Native Fast Web View provider' };
}
