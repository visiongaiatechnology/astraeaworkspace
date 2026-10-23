// STATUS: PLATIN
import type { TaskAttachment } from '../../../shared/contracts/work-management/workspaceWork';
import { createStableTaskId, TASK_ATTACHMENT_MAX_BYTES, validateTaskAttachment } from '../model/taskModel';
// A Vault-backed attachment is a reference; the guard that recognises one lives beside this module. Importing
// it here is what makes that rule reachable from the download path a user actually takes.
import { isVaultBackedTaskAttachment } from './taskVaultAttachments';
import { deliverExportBytes } from '../../../shared/interchange/exportDelivery';

export const TASK_ATTACHMENT_DATA_URL_MAX_CHARS = 4 * Math.ceil(TASK_ATTACHMENT_MAX_BYTES / 3) + 256;

export interface ParsedTaskAttachmentDataUrl {
  mimeType: string;
  encodedPayload: string;
  byteLength: number;
}

export function parseTaskAttachmentDataUrl(value: unknown): ParsedTaskAttachmentDataUrl | undefined {
  if (typeof value !== 'string' || value.length > TASK_ATTACHMENT_DATA_URL_MAX_CHARS) return undefined;
  const match = /^data:([a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+)(?:;[a-z0-9!#$&^_.+-]+=[a-z0-9!#$&^_.+-]+)*;base64,([a-z0-9+/]*={0,2})$/iu.exec(value);
  const mimeType = match?.[1];
  const encodedPayload = match?.[2];
  if (!mimeType || !encodedPayload || encodedPayload.length === 0 || encodedPayload.length % 4 !== 0) return undefined;
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(encodedPayload)) return undefined;
  const padding = encodedPayload.endsWith('==') ? 2 : encodedPayload.endsWith('=') ? 1 : 0;
  const byteLength = (encodedPayload.length / 4) * 3 - padding;
  if (byteLength <= 0 || byteLength > TASK_ATTACHMENT_MAX_BYTES) return undefined;
  return { mimeType, encodedPayload, byteLength };
}

export function decodeTaskAttachmentForDownload(attachment: TaskAttachment): Uint8Array | undefined {
  // **A Vault-backed attachment is a reference and must never be inlined.** Materialising it here would write
  // exactly the plaintext the reference exists to avoid, and it would do so on the one path a user reaches by
  // clicking download. The caller has to route through the Vault instead, which serves the payload under its
  // own permission gate. Checked before the payload is looked at, so a Vault-backed attachment that somehow
  // also carries a `dataUrl` still cannot be materialised through this function.
  if (isVaultBackedTaskAttachment(attachment)) return undefined;
  const parsed = parseTaskAttachmentDataUrl(attachment.dataUrl);
  if (!parsed || !Number.isSafeInteger(attachment.sizeBytes) || parsed.byteLength !== attachment.sizeBytes) return undefined;
  try {
    const decoded = globalThis.atob(parsed.encodedPayload);
    const bytes = new Uint8Array(decoded.length);
    for (let index = 0; index < decoded.length; index += 1) bytes[index] = decoded.charCodeAt(index);
    return bytes;
  } catch {
    return undefined;
  }
}

export function readTaskAttachment(file: File, existing: TaskAttachment[] = []): Promise<TaskAttachment> {
  const error = validateTaskAttachment(existing, file.size);
  if (error) return Promise.reject(new Error(error));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.onload = () => {
      if (typeof reader.result !== 'string' || !reader.result.startsWith('data:')) {
        reject(new Error('Attachment could not be encoded locally.'));
        return;
      }
      resolve({
        id: createStableTaskId('attachment'),
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
        dataUrl: reader.result,
        createdAt: Date.now(),
        createdBy: 'Local User',
      });
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Delivers the decoded attachment (Release Beta 0.1): native save on the desktop, download fallback
 * in the browser. An empty/undecodable attachment is named instead of silently doing nothing.
 */
export async function downloadTaskAttachment(attachment: TaskAttachment): Promise<void> {
  const bytes = decodeTaskAttachmentForDownload(attachment);
  if (!bytes) throw new Error('Attachment payload could not be decoded — no file was written.');
  const safeName = attachment.name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_') || 'attachment';
  const extension = /\.[A-Za-z0-9]{1,12}$/u.test(safeName) ? safeName.split('.').pop()!.toLowerCase() : 'bin';
  await deliverExportBytes(bytes, {
    suggestedName: safeName,
    extensions: [extension],
    mimeType: 'application/octet-stream',
  });
}
