// STATUS: PLATIN — Draw export delivery (Release Beta 0.1: native write first, browser download fallback).
import { toOwnedArrayBuffer } from '../../../shared/binary/ownedBufferSource';
import { deliverExportBlob, type ExportDeliveryResult } from '../../../shared/interchange/exportDelivery';

export type DrawExportPart = BlobPart | Uint8Array<ArrayBufferLike>;

export function drawDeliveryText(result: ExportDeliveryResult): string {
  return result.mode === 'file'
    ? `${result.fileName} gespeichert.`
    : `Download gestartet: ${result.fileName} (Browser-Modus – keine Schreibbestätigung).`;
}

/**
 * Delivers one produced Draw artifact. On the desktop the save dialog + atomic export confirm the
 * write (`mode:'file'`); the browser build keeps the download fallback and is reported as such.
 */
export function deliverDrawExport(parts: readonly DrawExportPart[], type: string, name: string): Promise<ExportDeliveryResult> {
  const blobParts: BlobPart[] = parts.map((part) => (part instanceof Uint8Array ? toOwnedArrayBuffer(part) : part));
  const blob = new Blob(blobParts, { type });
  const extension = /\.[A-Za-z0-9]{1,12}$/u.test(name) ? name.split('.').pop()!.toLowerCase() : 'bin';
  return deliverExportBlob(blob, { suggestedName: name, extensions: [extension], mimeType: type });
}
