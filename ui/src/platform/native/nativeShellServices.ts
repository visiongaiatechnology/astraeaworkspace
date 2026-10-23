// STATUS: DIAMANT VGT SUPREME — capability-gated process-bound native shell service bridge.
import { invokeNative, isNativeDesktop } from './nativeBridge';
import { nativeOpenedPayloadToFile, type NativeOpenedFile } from './nativeOpen';
import { assertShellNativeCapability, type ShellNativeCapability, type ShellNativePolicy } from '../../shell/home/workspaceShellHomeCore';

export const DEFAULT_SHELL_NATIVE_POLICY: ShellNativePolicy = { allowed: ['dialog.open', 'dialog.save'] };

export async function configureNativeShellPolicy(policy: ShellNativePolicy): Promise<void> {
  if (!isNativeDesktop()) return;
  const allowed = [...new Set(policy.allowed)].slice(0, 6);
  await invokeNative<boolean>('vgt_shell_set_native_policy', { request: { allowed } });
}

export async function nativeShellOpenFile(policy: ShellNativePolicy, signal?: AbortSignal): Promise<File | null> {
  assertShellNativeCapability(policy, 'dialog.open');
  if (signal?.aborted) throw new DOMException('Native open cancelled', 'AbortError');
  if (!isNativeDesktop()) return null;
  const payload = await invokeNative<NativeOpenedFile>('vgt_shell_open_dialog');
  if (signal?.aborted) throw new DOMException('Native open cancelled', 'AbortError');
  return nativeOpenedPayloadToFile(payload);
}

export interface NativeSaveDialogGrant {
  token: string;
  file_name: string;
}

/**
 * Round 41 (native user finding): the save dialog used to open **without a file name and without
 * any file-type filter**, so the returned grant was an extension-less name and the atomic export
 * wrote a file the operating system could not associate ("no file type"). The dialog now receives
 * a suggested name and the validated extension whitelist; the desktop enforces the default
 * extension again before it issues the grant.
 */
export interface NativeSaveDialogOptions {
  readonly suggestedName?: string;
  readonly extensions?: readonly string[];
}

const NATIVE_SAVE_NAME_PATTERN = /^[^/\\\u0000-\u001f]{1,255}$/u;
const NATIVE_SAVE_EXTENSION_PATTERN = /^[A-Za-z0-9]{1,12}$/u;

function normalizeSaveDialogOptions(options: NativeSaveDialogOptions): { suggestedName?: string; extensions: string[] } {
  const suggestedName = options.suggestedName?.trim();
  if (suggestedName && (!NATIVE_SAVE_NAME_PATTERN.test(suggestedName) || suggestedName.startsWith('-'))) {
    throw new Error('Native save file name is invalid');
  }
  const extensions = [...new Set((options.extensions ?? []).map((value) => value.trim().toLowerCase()).filter(Boolean))];
  if (extensions.length > 8) throw new Error('Native save file type list is too long');
  for (const extension of extensions) {
    if (!NATIVE_SAVE_EXTENSION_PATTERN.test(extension)) throw new Error('Native save file type is invalid');
  }
  return suggestedName ? { suggestedName, extensions } : { extensions };
}

export async function nativeShellSavePath(
  policy: ShellNativePolicy,
  options: NativeSaveDialogOptions = {},
): Promise<NativeSaveDialogGrant | null> {
  assertShellNativeCapability(policy, 'dialog.save');
  if (!isNativeDesktop()) return null;
  const request = normalizeSaveDialogOptions(options);
  const grant = await invokeNative<NativeSaveDialogGrant>('vgt_shell_save_dialog', { request });
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(grant.token)) throw new Error('Native save authorization is invalid');
  if (!grant.file_name || grant.file_name.length > 255 || /[\/\\\u0000-\u001f]/u.test(grant.file_name)) throw new Error('Native save file name is invalid');

  return grant;
}

/** Chunked, because a spread over 25 MB of bytes would overflow the call stack. */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunk, bytes.length)));
  }
  return btoa(binary);
}

/**
 * Native round 6 — an export is written by the **desktop**, not by a download link.
 *
 * `downloadOfficeDocument` built a `Blob`, clicked a synthetic `<a download>` and reported
 * success. Inside the desktop WebView the anchor does not reliably produce a file: the user
 * saw "Exported Office interoperability file: Untitled-Writer.docx" and found nothing usable
 * on disk. Every piece needed for a real write already exists — the save dialog grants a
 * one-shot token (`vgt_shell_save_dialog`) and `vgt_import_sandbox_atomic_export` validates
 * the bytes in the import sandbox and commits them atomically.
 *
 * Returns the granted file name, or `null` when the application does not run natively (the
 * browser build keeps the download-link path).
 */
export async function nativeShellSaveBytes(
  policy: ShellNativePolicy,
  bytes: Uint8Array,
  options: NativeSaveDialogOptions = {},
): Promise<string | null> {
  assertShellNativeCapability(policy, 'dialog.save');
  if (!isNativeDesktop()) return null;
  if (bytes.byteLength === 0) throw new Error('Der Export enthält keine Daten.');
  // Validate the caller's name/types before the dialog so a programming error cannot be
  // reported as a cancelled dialog (native round 41).
  const request = normalizeSaveDialogOptions(options);
  let grant: NativeSaveDialogGrant | null;
  try {
    grant = await nativeShellSavePath(policy, request);
  } catch (error) {
    // Keep the actionable root cause in the message. The previous constant hid whether the dialog
    // was denied, the request contract was rejected, or a native window issue occurred.
    const raw = typeof error === 'string' ? error : (error instanceof Error ? error.message : String(error ?? ''));
    const detail = raw ? ` (${raw})` : '';
    // A deliberate cancel is not an export failure. Callers map AbortError to the neutral
    // "Export abgebrochen" wording instead of an alarming native-error toast.
    if (/cancelled|abgebrochen/iu.test(raw)) {
      throw new DOMException('Export cancelled', 'AbortError');
    }
    throw new Error(`Der Speichern-Dialog lieferte kein Ziel (abgebrochen oder nicht verfügbar) — es wurde keine Datei geschrieben.${detail}`);
  }
  if (!grant) return null;
  // Defense in depth: the desktop appends the default extension, but an extension-less grant
  // must never silently produce another export without a file type.
  if (request.extensions.length > 0 && !/\.[A-Za-z0-9]{1,12}$/u.test(grant.file_name)) {
    throw new Error('Der Speicherdialog lieferte keinen Dateityp — es wurde keine Datei geschrieben.');
  }
  try {
    await invokeNative('vgt_import_sandbox_atomic_export', {
      request: {
        fileName: grant.file_name,
        saveToken: grant.token,
        bytesBase64: bytesToBase64(bytes),
      },
    });
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    if (/refuses to replace/i.test(text)) {
      throw new Error(`„${grant.file_name}“ existiert bereits. Der atomare Export überschreibt keine Datei — bitte einen neuen Namen wählen.`);
    }
    throw new Error(`Die Datei konnte nicht geschrieben werden: ${text}`);
  }
  return grant.file_name;
}

export async function nativeShellClipboardRead(policy: ShellNativePolicy): Promise<string> {
  assertShellNativeCapability(policy, 'clipboard.read');
  if (!isNativeDesktop()) throw new Error('Native clipboard is unavailable');
  const text = await invokeNative<string>('vgt_shell_clipboard_read');
  if (text.length > 1024 * 1024) throw new Error('Native clipboard result exceeds boundary');
  return text;
}

export async function nativeShellClipboardWrite(policy: ShellNativePolicy, text: string): Promise<void> {
  assertShellNativeCapability(policy, 'clipboard.write');
  if (!isNativeDesktop()) throw new Error('Native clipboard is unavailable');
  if (text.length > 1024 * 1024) throw new Error('Native clipboard input exceeds boundary');
  await invokeNative<boolean>('vgt_shell_clipboard_write', { request: { text } });
}

export async function nativeShellNotify(policy: ShellNativePolicy, title: string, body: string): Promise<void> {
  assertShellNativeCapability(policy, 'notification.show');
  if (!isNativeDesktop()) throw new Error('Native notifications are unavailable');
  if (!title.trim() || title.length > 512 || body.length > 512) throw new Error('Native notification input violates boundary');
  await invokeNative<boolean>('vgt_shell_notify', { request: { title, body } });
}

export function policyWithCapability(policy: ShellNativePolicy, capability: ShellNativeCapability, enabled: boolean): ShellNativePolicy {
  const set = new Set(policy.allowed);
  if (enabled) set.add(capability); else set.delete(capability);
  return { allowed: [...set] };
}
