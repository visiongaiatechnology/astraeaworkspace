// STATUS: DIAMANT VGT SUPREME
// Astraea PDF Studio — bounded, read-only PDF encryption/security policy inspection.
// This module never decrypts a PDF and never treats permission flags as DRM guarantees.

export const PDF_SECURITY_INSPECTION_LIMITS = Object.freeze({
  maxBytes: 96 * 1024 * 1024,
  maxScanMillis: 2_500,
  chunkBytes: 512 * 1024,
  overlapBytes: 32 * 1024,
  maxDictionaryChars: 64 * 1024,
});

export type PdfEncryptionHandler = 'none' | 'standard' | 'public-key' | 'unknown';
export type PdfEncryptionStrength = 'none' | 'weak' | 'legacy' | 'modern' | 'unknown';

export interface PdfPermissionFlags {
  print: boolean;
  modify: boolean;
  copy: boolean;
  annotate: boolean;
  fillForms: boolean;
  accessibility: boolean;
  assemble: boolean;
  highQualityPrint: boolean;
}

export interface PdfEncryptionSecuritySnapshot {
  encrypted: boolean;
  handler: PdfEncryptionHandler;
  filter: string | null;
  subFilter: string | null;
  version: number | null;
  revision: number | null;
  keyLengthBits: number | null;
  cipher: string;
  strength: PdfEncryptionStrength;
  permissionsRaw: number | null;
  permissions: PdfPermissionFlags | null;
  encryptMetadata: boolean | null;
  recipientBased: boolean;
  recommendSecureResave: boolean;
  warnings: string[];
  permissionDisclaimer: string;
}

const ASCII = new TextDecoder('windows-1252', { fatal: false, ignoreBOM: true });
const PERMISSION_DISCLAIMER = 'PDF permission flags are advisory viewer controls, not DRM. After legitimate decryption, Astraea does not claim that copying or redistribution can be cryptographically prevented.';

const parseName = (text: string, key: string): string | null => {
  const match = new RegExp(`/${key}\\s*/([A-Za-z0-9._+-]{1,64})\\b`, 'u').exec(text);
  return match?.[1] ?? null;
};

const parseInteger = (text: string, key: string): number | null => {
  const match = new RegExp(`/${key}\\s+(-?\\d{1,12})\\b`, 'u').exec(text);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) ? value : null;
};

const parseBoolean = (text: string, key: string): boolean | null => {
  const match = new RegExp(`/${key}\\s+(true|false)\\b`, 'u').exec(text);
  return match ? match[1] === 'true' : null;
};

export function decodePdfPermissionFlags(raw: number): PdfPermissionFlags {
  const bits = raw >>> 0;
  return {
    print: (bits & 0x0004) !== 0,
    modify: (bits & 0x0008) !== 0,
    copy: (bits & 0x0010) !== 0,
    annotate: (bits & 0x0020) !== 0,
    fillForms: (bits & 0x0100) !== 0,
    accessibility: (bits & 0x0200) !== 0,
    assemble: (bits & 0x0400) !== 0,
    highQualityPrint: (bits & 0x0800) !== 0,
  };
}

function classifyCipher(dictionary: string, version: number | null, revision: number | null, length: number | null): {
  cipher: string;
  strength: PdfEncryptionStrength;
  keyLengthBits: number | null;
  warnings: string[];
} {
  const warnings: string[] = [];
  const cfm = parseName(dictionary, 'CFM');
  let keyLengthBits = length;
  let cipher = 'Unknown PDF encryption';
  let strength: PdfEncryptionStrength = 'unknown';

  if (cfm === 'AESV3' || version === 5 || (revision !== null && revision >= 5)) {
    keyLengthBits = 256;
    cipher = revision === 5 ? 'AES-256 (revision 5)' : 'AES-256';
    strength = revision === 5 ? 'legacy' : 'modern';
    if (revision === 5) warnings.push('AES-256 revision 5 is an older PDF encryption revision. Prefer revision 6 when re-saving.');
  } else if (cfm === 'AESV2') {
    keyLengthBits = keyLengthBits ?? 128;
    cipher = 'AES-128';
    strength = 'legacy';
    warnings.push('AES-128 PDF encryption is legacy. Prefer AES-256 revision 6 for newly protected PDFs.');
  } else if (version === 1 || revision === 2) {
    keyLengthBits = 40;
    cipher = 'RC4-40';
    strength = 'weak';
    warnings.push('RC4-40 PDF encryption is cryptographically obsolete and must not be used for new protection.');
  } else if (version === 2 || cfm === 'V2' || revision === 3 || revision === 4) {
    keyLengthBits = keyLengthBits ?? 128;
    cipher = cfm === 'AESV2' ? 'AES-128' : `RC4-${keyLengthBits}`;
    strength = cfm === 'AESV2' ? 'legacy' : 'weak';
    warnings.push(cfm === 'AESV2' ? 'AES-128 PDF encryption is legacy.' : 'RC4 PDF encryption is cryptographically obsolete.');
  }

  return { cipher, strength, keyLengthBits, warnings };
}

function findEncryptionDictionary(bytes: Uint8Array): string | null {
  const { chunkBytes, overlapBytes, maxDictionaryChars, maxScanMillis } = PDF_SECURITY_INSPECTION_LIMITS;
  const started = performance.now();
  let previous = '';
  for (let offset = 0; offset < bytes.length; offset += chunkBytes) {
    if (performance.now() - started > maxScanMillis) throw new Error(`PDF security inspection exceeded ${maxScanMillis} ms.`);
    const current = ASCII.decode(bytes.subarray(offset, Math.min(bytes.length, offset + chunkBytes)));
    const text = previous + current;
    const candidates = ['/Filter /Standard', '/Filter/Standard', '/Filter /Adobe.PubSec', '/Filter/Adobe.PubSec'];
    let index = -1;
    for (const needle of candidates) {
      const found = text.indexOf(needle);
      if (found >= 0 && (index < 0 || found < index)) index = found;
    }
    if (index >= 0) {
      const start = Math.max(0, text.lastIndexOf('<<', index));
      const endMarker = text.indexOf('>>', index);
      const end = endMarker >= 0 ? Math.min(text.length, endMarker + 2) : Math.min(text.length, start + maxDictionaryChars);
      return text.slice(start, end).slice(0, maxDictionaryChars);
    }
    previous = current.slice(-overlapBytes);
  }
  return null;
}

export function inspectPdfEncryptionSecurity(bytes: Uint8Array): PdfEncryptionSecuritySnapshot {
  if (bytes.byteLength <= 0) throw new Error('PDF security inspection rejected an empty file.');
  if (bytes.byteLength > PDF_SECURITY_INSPECTION_LIMITS.maxBytes) throw new Error('PDF security inspection byte budget exceeded.');

  const dictionary = findEncryptionDictionary(bytes);
  if (!dictionary) {
    const hasEncryptReference = /\/Encrypt\b/u.test(ASCII.decode(bytes.subarray(0, Math.min(bytes.length, 4 * 1024 * 1024))));
    return {
      encrypted: hasEncryptReference,
      handler: hasEncryptReference ? 'unknown' : 'none',
      filter: null,
      subFilter: null,
      version: null,
      revision: null,
      keyLengthBits: null,
      cipher: hasEncryptReference ? 'Encryption dictionary not safely resolved' : 'None',
      strength: hasEncryptReference ? 'unknown' : 'none',
      permissionsRaw: null,
      permissions: null,
      encryptMetadata: null,
      recipientBased: false,
      recommendSecureResave: false,
      warnings: hasEncryptReference ? ['Encrypted PDF detected, but the bounded inspector could not safely resolve its encryption dictionary. No algorithm or permission claim is made.'] : [],
      permissionDisclaimer: PERMISSION_DISCLAIMER,
    };
  }

  const filter = parseName(dictionary, 'Filter');
  const subFilter = parseName(dictionary, 'SubFilter');
  const version = parseInteger(dictionary, 'V');
  const revision = parseInteger(dictionary, 'R');
  const length = parseInteger(dictionary, 'Length');
  const permissionsRaw = parseInteger(dictionary, 'P');
  const encryptMetadata = parseBoolean(dictionary, 'EncryptMetadata');
  const recipientBased = filter === 'Adobe.PubSec' || /\/Recipients\b/u.test(dictionary) || /^adbe\.pkcs7/u.test(subFilter ?? '');
  const handler: PdfEncryptionHandler = recipientBased ? 'public-key' : filter === 'Standard' ? 'standard' : 'unknown';
  const classified = recipientBased
    ? { cipher: 'Certificate/recipient encryption', strength: 'unknown' as PdfEncryptionStrength, keyLengthBits: length, warnings: [] as string[] }
    : classifyCipher(dictionary, version, revision, length);
  const warnings = [...classified.warnings];
  if (handler === 'unknown') warnings.push('Unknown PDF security handler. Astraea will not infer password semantics or trust from unrecognized encryption dictionaries.');
  if (permissionsRaw === null && handler === 'standard') warnings.push('Standard security handler detected without a safely readable /P permission value.');

  return {
    encrypted: true,
    handler,
    filter,
    subFilter,
    version,
    revision,
    keyLengthBits: classified.keyLengthBits,
    cipher: classified.cipher,
    strength: classified.strength,
    permissionsRaw,
    permissions: permissionsRaw === null ? null : decodePdfPermissionFlags(permissionsRaw),
    encryptMetadata,
    recipientBased,
    recommendSecureResave: classified.strength === 'weak' || classified.strength === 'legacy',
    warnings,
    permissionDisclaimer: PERMISSION_DISCLAIMER,
  };
}
