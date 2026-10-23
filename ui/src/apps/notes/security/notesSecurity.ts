// STATUS: DIAMANT VGT SUPREME — Notes protection policy, additional-unlock verifier and sensitive-data projection
import type { NoteNotebook, NotePage, NoteProtectionPolicy, NoteSection } from '../../../shared/contracts/workspace';
import { toOwnedArrayBuffer } from '../../../shared/binary/ownedBufferSource';

const MIN_ITERATIONS = 210_000;
const MAX_ITERATIONS = 1_000_000;
const MAX_SECRET_BYTES = 512;

function bytesToBase64(bytes: Uint8Array): string {
  let value = '';
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value);
}
function base64ToBytes(value: string): Uint8Array {
  const raw = atob(value);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}
function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left[i]! ^ right[i]!;
  return diff === 0;
}
async function deriveVerifier(secret: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const encoded = new TextEncoder().encode(secret.normalize('NFKC'));
  if (!encoded.length || encoded.length > MAX_SECRET_BYTES) throw new Error('Unlock secret must be 1-512 UTF-8 bytes.');
  const material = await crypto.subtle.importKey('raw', encoded, 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: toOwnedArrayBuffer(salt), iterations }, material, 256);
  return new Uint8Array(bits);
}


export function normalizeNoteProtectionPolicy(policy: NoteProtectionPolicy | undefined): NoteProtectionPolicy | undefined {
  if (!policy || !['none', 'workspace', 'additional-unlock'].includes(policy.mode)) return undefined;
  if (policy.mode !== 'additional-unlock') return { mode: policy.mode };
  const verifier = policy.verifier;
  if (!verifier || verifier.algorithm !== 'PBKDF2-SHA256' || !Number.isFinite(verifier.iterations)) return undefined;
  const iterations = Math.max(MIN_ITERATIONS, Math.min(MAX_ITERATIONS, Math.floor(verifier.iterations)));
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(verifier.saltBase64) || !/^[A-Za-z0-9+/]+={0,2}$/.test(verifier.verifierBase64)) return undefined;
  return { mode: 'additional-unlock', autoLockMinutes: Math.max(1, Math.min(240, Math.floor(policy.autoLockMinutes ?? 10))), verifier: { ...verifier, iterations, saltBase64: verifier.saltBase64.slice(0, 128), verifierBase64: verifier.verifierBase64.slice(0, 128) } };
}

export async function createAdditionalUnlockPolicy(secret: string, autoLockMinutes = 10): Promise<NoteProtectionPolicy> {
  if (!crypto?.subtle) throw new Error('WebCrypto is unavailable. Additional unlock cannot be configured safely.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iterations = MIN_ITERATIONS;
  const verifier = await deriveVerifier(secret, salt, iterations);
  return {
    mode: 'additional-unlock',
    autoLockMinutes: Math.max(1, Math.min(240, Math.floor(autoLockMinutes))),
    verifier: { algorithm: 'PBKDF2-SHA256', iterations, saltBase64: bytesToBase64(salt), verifierBase64: bytesToBase64(verifier) },
  };
}

export async function verifyAdditionalUnlock(policy: NoteProtectionPolicy | undefined, secret: string): Promise<boolean> {
  if (policy?.mode !== 'additional-unlock' || !policy.verifier || policy.verifier.algorithm !== 'PBKDF2-SHA256') return false;
  if (!crypto?.subtle) return false;
  const iterations = Math.max(MIN_ITERATIONS, Math.min(MAX_ITERATIONS, Math.floor(policy.verifier.iterations)));
  try {
    const expected = base64ToBytes(policy.verifier.verifierBase64);
    const actual = await deriveVerifier(secret, base64ToBytes(policy.verifier.saltBase64), iterations);
    return constantTimeEqual(expected, actual);
  } catch { return false; }
}

export function protectionKey(kind: 'notebook' | 'section' | 'page', id: string): string { return `${kind}:${id}`; }

export function pageRequiresUnlock(notebook: NoteNotebook, section: NoteSection, page: NotePage, unlocked: ReadonlySet<string>): boolean {
  const protectedEntities: Array<['notebook' | 'section' | 'page', string, NoteProtectionPolicy | undefined]> = [
    ['notebook', notebook.id, notebook.protection], ['section', section.id, section.protection], ['page', page.id, page.protection],
  ];
  return protectedEntities.some(([kind, id, policy]) => policy?.mode === 'additional-unlock' && !unlocked.has(protectionKey(kind, id)));
}

export function projectUnlockedNotebooks(notebooks: readonly NoteNotebook[], unlocked: ReadonlySet<string>): NoteNotebook[] {
  return notebooks.map((notebook) => ({
    ...notebook,
    sections: notebook.sections.map((section) => ({
      ...section,
      pages: section.pages.filter((page) => !pageRequiresUnlock(notebook, section, page, unlocked)),
    })),
  }));
}

export function sensitiveNotePreview(page: NotePage): { title: string; snippet: string; allowThumbnail: boolean } {
  if (page.sensitiveMode) return { title: page.title, snippet: 'Sensitive note preview hidden', allowThumbnail: false };
  return { title: page.title, snippet: page.content.replace(/\s+/g, ' ').trim().slice(0, 240), allowThumbnail: true };
}

export interface NotesSearchIndexBoundary {
  /** Pages visible to the search index. */
  indexedPages: number;
  /** Pages withheld because their additional-unlock policy is not satisfied. */
  lockedPages: number;
  /** Sensitive notes that are indexed but never expose a preview. */
  sensitivePages: number;
}

/**
 * AST-0751/AST-0754: the search index boundary is measured and shown, so "gesperrte Inhalte nicht
 * indexieren" is visible instead of an invisible assumption. `searchable` must be the projected notebook
 * set (`projectUnlockedNotebooks`), never the raw documents.
 */
export function measureNotesSearchIndexBoundary(
  allNotebooks: readonly NoteNotebook[],
  searchable: readonly NoteNotebook[],
): NotesSearchIndexBoundary {
  const count = (notebooks: readonly NoteNotebook[]): { pages: number; sensitive: number } => {
    let pages = 0;
    let sensitive = 0;
    for (const notebook of notebooks) {
      for (const section of notebook.sections) {
        for (const page of section.pages) {
          pages += 1;
          if (page.sensitiveMode) sensitive += 1;
        }
      }
    }
    return { pages, sensitive };
  };
  const all = count(allNotebooks);
  const visible = count(searchable);
  return {
    indexedPages: visible.pages,
    lockedPages: Math.max(0, all.pages - visible.pages),
    sensitivePages: visible.sensitive,
  };
}
