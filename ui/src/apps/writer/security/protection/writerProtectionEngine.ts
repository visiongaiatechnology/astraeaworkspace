// STATUS: DIAMANT VGT SUPREME — Sovereign Document Protection & Permissions Engine
import type { WriterDocumentData, WriterProtectionMode } from '../../types';
import { toOwnedArrayBuffer } from '../../../../shared/binary/ownedBufferSource';

const PBKDF2_PREFIX = 'vgt-pbkdf2-sha256';
const PBKDF2_ITERATIONS = 310_000;
const PBKDF2_SALT_BYTES = 16;
const PBKDF2_OUTPUT_BITS = 256;

const COMMENT_ONLY_WRITER_FIELDS = new Set<keyof WriterDocumentData>(['comments']);
const FORM_FILLING_WRITER_FIELDS = new Set<keyof WriterDocumentData>(['contentControls']);
const REVIEW_UNTRACKED_WRITER_FIELDS = new Set<keyof WriterDocumentData>(['comments']);

function patchKeys(patch: Partial<WriterDocumentData>): (keyof WriterDocumentData)[] {
  return Object.keys(patch) as (keyof WriterDocumentData)[];
}

function onlyAllowedFields(
  patch: Partial<WriterDocumentData>,
  allowed: ReadonlySet<keyof WriterDocumentData>,
): boolean {
  const keys = patchKeys(patch);
  return keys.length > 0 && keys.every((key) => allowed.has(key));
}

export function canPersistWriterPatch(
  mode: WriterProtectionMode | undefined,
  patch: Partial<WriterDocumentData>,
): boolean {
  if (!mode || mode === 'none') return true;
  if (mode === 'read_only') return false;
  if (mode === 'comments_only') return onlyAllowedFields(patch, COMMENT_ONLY_WRITER_FIELDS);
  if (mode === 'form_filling') return onlyAllowedFields(patch, FORM_FILLING_WRITER_FIELDS);
  if (mode === 'review') {
    if (onlyAllowedFields(patch, REVIEW_UNTRACKED_WRITER_FIELDS)) return true;
    return Object.prototype.hasOwnProperty.call(patch, 'revisions');
  }
  return false;
}

export function canPersistParagraphMutation(
  mode: WriterProtectionMode | undefined,
  writerPatch?: Partial<WriterDocumentData>,
): boolean {
  if (!mode || mode === 'none') return true;
  if (mode !== 'review') return false;
  return Boolean(writerPatch && Object.prototype.hasOwnProperty.call(writerPatch, 'revisions'));
}

export function canEditText(mode?: WriterProtectionMode): boolean {
  return !mode || mode === 'none' || mode === 'review';
}

export function canFormat(mode?: WriterProtectionMode): boolean {
  return !mode || mode === 'none' || mode === 'review';
}

export function canComment(mode?: WriterProtectionMode): boolean {
  return !mode || mode === 'none' || mode === 'review' || mode === 'comments_only';
}

export function canFillForms(mode?: WriterProtectionMode): boolean {
  return !mode || mode === 'none' || mode === 'form_filling';
}

export function requiresTrackedChanges(mode?: WriterProtectionMode): boolean {
  return mode === 'review';
}

export function canManageRevisions(mode?: WriterProtectionMode): boolean {
  return !mode || mode === 'none';
}

export function getProtectionModeLabel(mode?: WriterProtectionMode): string {
  switch (mode) {
    case 'review': return 'Review (Änderungen erzwingen)';
    case 'read_only': return 'Schreibgeschützt';
    case 'comments_only': return 'Nur Kommentare';
    case 'form_filling': return 'Formularausfüllung';
    case 'none':
    default: return 'Vollzugriff (Ungeschützt)';
  }
}

function requireWebCrypto(): Crypto {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.subtle || typeof cryptoApi.getRandomValues !== 'function') {
    throw new Error('Sichere Web-Crypto-Unterstützung ist für den Dokumentschutz erforderlich.');
  }
  return cryptoApi;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index++) diff |= left[index] ^ right[index];
  return diff === 0;
}

function legacyFNVHash(password: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < password.length; index++) {
    hash ^= password.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `vgt-hash-${(hash >>> 0).toString(16)}`;
}

async function derivePasswordKey(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const cryptoApi = requireWebCrypto();
  const keyMaterial = await cryptoApi.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await cryptoApi.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: toOwnedArrayBuffer(salt), iterations },
    keyMaterial,
    PBKDF2_OUTPUT_BITS,
  );
  return new Uint8Array(bits);
}

export function isLegacyProtectionHash(storedHash?: string): boolean {
  return Boolean(storedHash?.startsWith('vgt-hash-'));
}

export async function hashProtectionPassword(password: string): Promise<string> {
  if (!password) throw new Error('Ein leeres Kennwort darf nicht gehasht werden.');
  const cryptoApi = requireWebCrypto();
  const salt = cryptoApi.getRandomValues(new Uint8Array(PBKDF2_SALT_BYTES));
  const derived = await derivePasswordKey(password, salt, PBKDF2_ITERATIONS);
  return `${PBKDF2_PREFIX}$${PBKDF2_ITERATIONS}$${bytesToBase64Url(salt)}$${bytesToBase64Url(derived)}`;
}

export async function verifyProtectionPassword(password: string, storedHash?: string): Promise<boolean> {
  if (!storedHash) return true;
  if (isLegacyProtectionHash(storedHash)) {
    const expected = new TextEncoder().encode(storedHash);
    const actual = new TextEncoder().encode(legacyFNVHash(password));
    return constantTimeEqual(actual, expected);
  }

  const parts = storedHash.split('$');
  if (parts.length !== 4 || parts[0] !== PBKDF2_PREFIX) return false;
  const iterations = Number(parts[1]);
  if (!Number.isSafeInteger(iterations) || iterations < 100_000 || iterations > 2_000_000) return false;

  try {
    const salt = base64UrlToBytes(parts[2]);
    const expected = base64UrlToBytes(parts[3]);
    if (salt.length < PBKDF2_SALT_BYTES || expected.length !== PBKDF2_OUTPUT_BITS / 8) return false;
    const actual = await derivePasswordKey(password, salt, iterations);
    return constantTimeEqual(actual, expected);
  } catch {
    return false;
  }
}
