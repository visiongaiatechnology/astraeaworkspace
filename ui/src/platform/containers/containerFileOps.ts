// STATUS: PLATIN — container file operations preserve bounded open and transactional save contracts.
import type { WorkspaceDocument, KeyVaultStatus } from '../../shared/contracts/workspace';
import { packContainer, unpackContainer } from './container';
import { extensionForDocumentKind, filenameMatchesDocumentKind, VWC_MAX_CONTAINER_BYTES, VwcBoundedError } from './vwcStorage';
import { assertWorkspaceContainerMagic } from './workspaceContainerBoundary';
import { DEFAULT_SHELL_NATIVE_POLICY, nativeShellSaveBytes } from '../native/nativeShellServices';

export { extensionForDocumentKind };

export interface SaveContainerOptions {
  activeDoc: WorkspaceDocument;
  vaultStatus: KeyVaultStatus;
  activeDocumentPin: string | null;
  activeDocumentPassword?: string | null;
  /**
   * Injectable desktop write (tests / future backends). Defaults to the native save dialog plus the
   * atomic sandbox export. `null` means "not running natively" and keeps the download fallback.
   */
  writeFile?: (bytes: Uint8Array, suggestedName: string, extension: string) => Promise<string | null>;
  /**
   * Release Beta 0.1 (blocker #1): success is reported **after** a confirmed write. `file` means the
   * desktop validated and committed the container; `download` means a browser download was only
   * started — the browser cannot confirm that a file reached the disk.
   */
  onSuccess: (fileName: string, mode: 'file' | 'download') => void;
  onError: (error: unknown) => void;
}

/** Why a container save was refused, in the terms a user can act on. */
export type VwcSaveFailureReason =
  | 'provider-unavailable'
  | 'credential-required'
  | 'container-too-large'
  | 'storage-unavailable'
  | 'unknown';

function readErrorText(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return typeof error === 'string' ? error : '';
}

/**
 * The **public** reason a save failed.
 *
 * `onError` used to be answered with a constant string ("Error saving container"),
 * which hid every cause behind the same sentence — a healthy TPM was reported
 * exactly like a refused credential. The classification below is derived from
 * codes and exception *names*, never from a raw message that could carry a path or
 * a document name into the UI.
 */
export function resolveVwcSaveFailureReason(error: unknown): VwcSaveFailureReason {
  if (error instanceof VwcBoundedError) {
    return error.code === 'container-too-large' ? 'container-too-large' : 'unknown';
  }
  const text = readErrorText(error).toLowerCase();
  if (text.includes('providerunavailable') || text.includes('provider_unavailable') || text.includes('provider unavailable')) {
    return 'provider-unavailable';
  }
  if (text.includes('pin_required') || text.includes('password_required') || text.includes('pin required') || text.includes('password required')) {
    return 'credential-required';
  }
  if (text.includes('quota') || text.includes('storage') || text.includes('indexeddb')) {
    return 'storage-unavailable';
  }
  return 'unknown';
}

/** The user-facing sentence for a failed save. Never contains the raw error. */
export function resolveVwcSaveFailureMessage(error: unknown): string {
  switch (resolveVwcSaveFailureReason(error)) {
    case 'provider-unavailable':
      return 'Nativ speichern nicht möglich: Der sichere Speicher dieses Geräts ist nicht verfügbar.';
    case 'credential-required':
      return 'Nativ speichern nicht möglich: PIN oder Passwort fehlt.';
    case 'container-too-large':
      return 'Nativ speichern nicht möglich: Der Container ist zu groß.';
    case 'storage-unavailable':
      return 'Nativ speichern nicht möglich: Der lokale Speicher ist nicht erreichbar.';
    default:
      return 'Container konnte nicht gespeichert werden.';
  }
}

/** File-name-safe container name (falls back to a neutral stem, never a path). */
export function safeContainerFileName(title: string, extension: string, privacyMode: boolean): string {
  if (privacyMode) return `6f84d81a7e2b.${extension}`;
  const safeTitle = (title || 'document').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim().slice(0, 120) || 'document';
  return `${safeTitle}.${extension}`;
}

/**
 * „Speichern unter…" for the encrypted container.
 *
 * On the desktop the bytes travel through the save dialog and the atomic sandbox export, which now
 * recognises the `VWC1` container framing (Lead round "Option A"): the file exists before success is
 * reported. In the browser the download-link fallback is kept, but the success mode is `download` —
 * a started download is not a confirmed file and the caller must say so.
 */
export const executeSaveVwc = async ({
  activeDoc,
  vaultStatus,
  activeDocumentPin,
  activeDocumentPassword,
  writeFile,
  onSuccess,
  onError,
}: SaveContainerOptions): Promise<void> => {
  try {
    const bytes = await packContainer(activeDoc, {
      pin: vaultStatus.hasPin ? (activeDocumentPin || undefined) : undefined,
      password: vaultStatus.hasPortablePassword ? (activeDocumentPassword || undefined) : undefined,
    });
    const extension = extensionForDocumentKind(activeDoc.kind);
    const fileName = safeContainerFileName(activeDoc.title, extension, vaultStatus.privacyMode);
    // Defense in depth before the bytes reach any dialog: extension + magic + size boundary.
    assertWorkspaceContainerMagic(fileName, bytes);

    const write = writeFile ?? ((containerBytes: Uint8Array, suggestedName: string, fileExtension: string) =>
      nativeShellSaveBytes(DEFAULT_SHELL_NATIVE_POLICY, containerBytes, {
        suggestedName,
        extensions: [fileExtension],
      }));
    const writtenName = await write(bytes, fileName, extension);
    if (writtenName) {
      onSuccess(writtenName, 'file');
      return;
    }

    // Browser build: a download link can be started, never confirmed.
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    try {
      anchor.click();
    } finally {
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    }
    onSuccess(fileName, 'download');
  } catch (error: unknown) {
    console.error(error);
    onError(error);
  }
};

export interface OpenContainerResult {
  document: WorkspaceDocument;
  pinUsed: string | null;
  passwordUsed: string | null;
}

function assertOpenContainerFileSize(size: number): void {
  if (!Number.isSafeInteger(size) || size < 4) throw new VwcBoundedError('truncated');
  if (size > VWC_MAX_CONTAINER_BYTES) throw new VwcBoundedError('container-too-large');
}

/**
 * GR-006 (M1) — a specific workspace extension has to match the document inside.
 *
 * `.vgrid` and `.vpresent` share the same container envelope and magic, so a renamed file passed
 * the extension+magic boundary silently: measured by `gridContainerKindConfusion`, a Present
 * document opened as `.vgrid` was accepted. The shell routes by `document.kind` (no data loss on
 * open), but any consumer that trusts the file name instead of the kind would show the wrong app
 * and a later save from that context is the real risk. The generic `.vwc` container stays
 * kind-agnostic on purpose (backup/portable copies).
 */
function assertContainerFileNameMatchesDocumentKind(fileName: string, kind: WorkspaceDocument['kind']): void {
  const normalized = fileName.trim().toLocaleLowerCase('en-US');
  if (normalized.endsWith('.vwc')) return;
  if (!filenameMatchesDocumentKind(fileName, kind)) {
    throw new Error('Container file extension does not match the document kind');
  }
}

function readContainerUnlockCode(error: unknown): string | null {
  return error instanceof Error ? error.message : null;
}

export const executeOpenFile = async (
  file: File,
  onPromptPin: () => string | null,
  onPromptPassword: () => string | null,
): Promise<OpenContainerResult> => {
  assertOpenContainerFileSize(file.size);
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  assertWorkspaceContainerMagic(file.name, bytes);

  try {
    const document = await unpackContainer(bytes);
    assertContainerFileNameMatchesDocumentKind(file.name, document.kind);
    return { document, pinUsed: null, passwordUsed: null };
  } catch (error: unknown) {
    const unlockCode = readContainerUnlockCode(error);
    if (unlockCode === 'PIN_REQUIRED') {
      const rawPin = onPromptPin();
      const pin = rawPin?.trim() ?? '';
      if (!/^\d{4,8}$/u.test(pin)) {
        throw new Error(rawPin === null ? 'Decryption cancelled: PIN required' : 'PIN must contain 4-8 digits');
      }
      const document = await unpackContainer(bytes, { pin });
      assertContainerFileNameMatchesDocumentKind(file.name, document.kind);
      return { document, pinUsed: pin, passwordUsed: null };
    }
    if (unlockCode === 'PASSWORD_REQUIRED') {
      const rawPassword = onPromptPassword();
      const password = rawPassword ?? '';
      if (password.length < 8) {
        throw new Error(rawPassword === null ? 'Decryption cancelled: portable password required' : 'Portable password must contain at least 8 characters');
      }
      const document = await unpackContainer(bytes, { password });
      assertContainerFileNameMatchesDocumentKind(file.name, document.kind);
      return { document, pinUsed: null, passwordUsed: password };
    }
    throw error;
  }
};
