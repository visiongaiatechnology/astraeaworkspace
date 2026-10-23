// STATUS: DIAMANT VGT SUPREME — encrypted native/package export with bounded licensed font embedding
import type { PresentPackagedFont, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { packLocalEncryptedContainer } from '../../../../platform/containers/container';
import { downloadPresentBlob, safePresentFileName } from '../render/presentExport';
import type { ExportDeliveryResult } from '../../../../shared/interchange/exportDelivery';

const MAX_FONT_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_FONT_BYTES = 32 * 1024 * 1024;
const MAX_FONTS = 12;

const MIME_BY_EXTENSION: Record<string, PresentPackagedFont['mimeType']> = {
  ttf: 'font/ttf',
  otf: 'font/otf',
  woff: 'font/woff',
  woff2: 'font/woff2',
};

function bytesToDataUrl(bytes: Uint8Array, mimeType: string): string {
  let binary = '';
  for (let offset = 0; offset < bytes.byteLength; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.byteLength, offset + 0x8000)));
  return `data:${mimeType};base64,${globalThis.btoa(binary)}`;
}

function validateFontSignature(bytes: Uint8Array, mimeType: PresentPackagedFont['mimeType']): void {
  if (bytes.byteLength < 12) throw new Error('Font file is truncated.');
  const ascii4 = String.fromCharCode(...bytes.subarray(0, 4));
  const isTtf = bytes[0] === 0x00 && bytes[1] === 0x01 && bytes[2] === 0x00 && bytes[3] === 0x00;
  const isOtf = ascii4 === 'OTTO';
  const isWoff = ascii4 === 'wOFF';
  const isWoff2 = ascii4 === 'wOF2';
  const valid = mimeType === 'font/ttf' ? isTtf : mimeType === 'font/otf' ? isOtf : mimeType === 'font/woff' ? isWoff : isWoff2;
  if (!valid) throw new Error(`Font signature does not match ${mimeType}.`);
}

export async function presentPackagedFontFromFile(file: File, licenseConfirmed: boolean): Promise<PresentPackagedFont> {
  if (!licenseConfirmed) throw new Error('Font embedding requires explicit confirmation that the font license allows redistribution.');
  if (file.size <= 0 || file.size > MAX_FONT_BYTES) throw new Error('Font exceeds the 8 MiB per-file package limit.');
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  const mimeType = MIME_BY_EXTENSION[extension];
  if (!mimeType) throw new Error('Only TTF, OTF, WOFF and WOFF2 fonts can be packaged.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  validateFontSignature(bytes, mimeType);
  return {
    id: `font-${globalThis.crypto.randomUUID()}`,
    name: file.name.slice(0, 240),
    mimeType,
    dataUrl: bytesToDataUrl(bytes, mimeType),
    sizeBytes: bytes.byteLength,
    licenseConfirmedAt: Date.now(),
  };
}

function boundedFonts(fonts: readonly PresentPackagedFont[]): PresentPackagedFont[] {
  if (fonts.length > MAX_FONTS) throw new Error(`Presentation package supports at most ${MAX_FONTS} embedded fonts.`);
  let total = 0;
  return fonts.map((font) => {
    if (!font.licenseConfirmedAt || font.sizeBytes <= 0 || font.sizeBytes > MAX_FONT_BYTES) throw new Error('Packaged font failed license/size validation.');
    total += font.sizeBytes;
    if (total > MAX_TOTAL_FONT_BYTES) throw new Error('Packaged fonts exceed the 32 MiB aggregate limit.');
    if (!font.dataUrl.startsWith(`data:${font.mimeType};base64,`)) throw new Error('Packaged font MIME declaration mismatch.');
    return { ...font, name: font.name.slice(0, 240) };
  });
}

export function listPresentExternalMedia(document: WorkspaceDocument): Array<{ slideId: string; kind: 'audio' | 'video'; url: string }> {
  if (document.kind !== 'Present' || !document.presentData) return [];
  const out: Array<{ slideId: string; kind: 'audio' | 'video'; url: string }> = [];
  for (const slide of document.presentData.slides) {
    if (slide.audioMedia?.mode === 'external' && slide.audioMedia.externalUrl) out.push({ slideId: slide.id, kind: 'audio', url: slide.audioMedia.externalUrl });
    if (slide.videoMedia?.mode === 'external' && slide.videoMedia.externalUrl) out.push({ slideId: slide.id, kind: 'video', url: slide.videoMedia.externalUrl });
  }
  return out;
}

export async function buildEncryptedPresentContainer(document: WorkspaceDocument, password: string, fonts: readonly PresentPackagedFont[] = []): Promise<Uint8Array> {
  if (document.kind !== 'Present' || !document.presentData) throw new Error('Native Present export requires a Present document.');
  if (password.length < 12 || password.length > 256) throw new Error('Portable Present export requires a 12–256 character password.');
  const packagedFonts = boundedFonts(fonts);
  const packaged: WorkspaceDocument = {
    ...document,
    presentData: { ...document.presentData, packagedFonts },
  };
  return packLocalEncryptedContainer(packaged, { password });
}

export async function downloadNativeVpresent(document: WorkspaceDocument, password: string): Promise<ExportDeliveryResult> {
  const bytes = await buildEncryptedPresentContainer(document, password);
  return downloadPresentBlob(new Blob([bytes as unknown as BlobPart], { type: 'application/vnd.vgt.vpresent' }), `${safePresentFileName(document.title)}.vpresent`);
}

export async function downloadPresentPortablePackage(document: WorkspaceDocument, password: string, fonts: readonly PresentPackagedFont[]): Promise<ExportDeliveryResult> {
  const bytes = await buildEncryptedPresentContainer(document, password, fonts);
  return downloadPresentBlob(new Blob([bytes as unknown as BlobPart], { type: 'application/vnd.vgt.vpresent-package' }), `${safePresentFileName(document.title)}.vpresentpkg`);
}
