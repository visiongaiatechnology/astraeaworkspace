// STATUS: DIAMANT VGT SUPREME — bounded PDF EmbeddedFiles/FileAttachment serialization.
import type { PdfAnnotation } from '../../../../shared/contracts/workspace';
import { pdfByteStringLiteral, pdfUnicodeTextString } from '../../../../platform/interop/pdf/pdfTextStrings';

export interface StructuredPdfAttachmentAppendResult {
  annotationIds: number[];
  nameEntries: string[];
}

export const STRUCTURED_PDF_ATTACHMENT_LIMITS = Object.freeze({
  maxAttachmentsPerPage: 64,
  maxAttachmentBytes: 8 * 1024 * 1024,
  maxTotalBytesPerPage: 32 * 1024 * 1024,
});

const bytesToHex = (bytes: Uint8Array): string => { let out = ''; for (const byte of bytes) out += byte.toString(16).padStart(2, '0').toUpperCase(); return `${out}>`; };
const pdfName = (value: string): string => {
  const bytes = new TextEncoder().encode(value || 'application/octet-stream');
  let out = '';
  for (const byte of bytes) {
    const ch = String.fromCharCode(byte);
    out += /[A-Za-z0-9._+-]/u.test(ch) ? ch : `#${byte.toString(16).toUpperCase().padStart(2, '0')}`;
  }
  return out || 'application#2Foctet-stream';
};

function attachmentBytes(annotation: PdfAnnotation): { bytes: Uint8Array; mimeType: string } | null {
  const attachment = annotation.attachment;
  if (!attachment?.dataUrl) return null;
  const match = /^data:([^;,]{1,255});base64,([A-Za-z0-9+/=]+)$/u.exec(attachment.dataUrl);
  if (!match) throw new Error(`Attachment ${attachment.fileName} is not a bounded base64 data URL.`);
  if (match[2].length > Math.ceil(STRUCTURED_PDF_ATTACHMENT_LIMITS.maxAttachmentBytes * 4 / 3) + 8) throw new Error(`Attachment ${attachment.fileName} exceeds PDF embedding policy.`);
  const decoded = atob(match[2]);
  if (decoded.length < 1 || decoded.length > STRUCTURED_PDF_ATTACHMENT_LIMITS.maxAttachmentBytes) throw new Error(`Attachment ${attachment.fileName} exceeds PDF embedding policy.`);
  if (attachment.byteLength !== decoded.length) throw new Error(`Attachment ${attachment.fileName} byte length does not match its reviewed metadata.`);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) bytes[index] = decoded.charCodeAt(index);
  return { bytes, mimeType: match[1] };
}

export function appendStructuredPdfAttachments(
  annotations: readonly PdfAnnotation[],
  pageObjectId: number,
  add: (body: string) => number,
): StructuredPdfAttachmentAppendResult {
  const candidates = annotations.filter((annotation) => annotation.type === 'file-attachment' && annotation.attachment?.dataUrl);
  if (candidates.length > STRUCTURED_PDF_ATTACHMENT_LIMITS.maxAttachmentsPerPage) throw new Error('Page exceeds the structured PDF attachment-count policy.');
  let totalBytes = 0;
  const annotationIds: number[] = [];
  const nameEntries: string[] = [];
  for (const [index, annotation] of candidates.entries()) {
    const attachment = annotation.attachment!;
    const payload = attachmentBytes(annotation);
    if (!payload) continue;
    totalBytes += payload.bytes.byteLength;
    if (totalBytes > STRUCTURED_PDF_ATTACHMENT_LIMITS.maxTotalBytesPerPage) throw new Error('Page exceeds the structured PDF embedded-file byte budget.');
    const hex = bytesToHex(payload.bytes);
    const embeddedId = add(`<< /Type /EmbeddedFile /Subtype /${pdfName(payload.mimeType)} /Params << /Size ${payload.bytes.byteLength} >> /Filter /ASCIIHexDecode /Length ${hex.length} >>\nstream\n${hex}\nendstream`);
    // `/F` is a byte string per the specification, so it stays ASCII; `/UF` next to it carries the full
    // Unicode name as a text string, which is where an umlaut belongs.
    const safeFile = pdfByteStringLiteral((attachment.fileName.slice(0, 255) || `attachment-${index + 1}.bin`).normalize('NFC'));
    const unicodeFile = pdfUnicodeTextString(attachment.fileName.slice(0, 255) || `attachment-${index + 1}.bin`);
    const fileSpecId = add(`<< /Type /Filespec /F (${safeFile}) /UF ${unicodeFile} /Desc ${pdfUnicodeTextString(annotation.text || 'PDF attachment')} /EF << /F ${embeddedId} 0 R /UF ${embeddedId} 0 R >> >>`);
    const b = annotation.bounds ?? { x: 36 + index * 4, y: 36 + index * 4, width: 18, height: 18 };
    const x1 = Number.isFinite(b.x) ? b.x : 36;
    const y1 = Number.isFinite(b.y) ? b.y : 36;
    const width = Number.isFinite(b.width) && b.width > 0 ? b.width : 18;
    const height = Number.isFinite(b.height) && b.height > 0 ? b.height : 18;
    const annotId = add(`<< /Type /Annot /Subtype /FileAttachment /P ${pageObjectId} 0 R /Rect [${x1.toFixed(2)} ${y1.toFixed(2)} ${(x1 + width).toFixed(2)} ${(y1 + height).toFixed(2)}] /FS ${fileSpecId} 0 R /Name /PushPin /Contents ${pdfUnicodeTextString(annotation.text || attachment.fileName)} >>`);
    annotationIds.push(annotId);
    const treeKey = pdfByteStringLiteral(`${attachment.fileName.slice(0, 180)}#${annotation.id.slice(0, 48)}`);
    nameEntries.push(`(${treeKey}) ${fileSpecId} 0 R`);
  }
  return { annotationIds, nameEntries };
}
