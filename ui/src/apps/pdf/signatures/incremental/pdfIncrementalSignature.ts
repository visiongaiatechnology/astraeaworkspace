// STATUS: DIAMANT VGT SUPREME
// Astraea PDF Studio — bounded classic-xref incremental PDF signing writer.

import { bytesToHex } from '../cms/pdfCmsDer';
import { pdfMetadataTextString } from '../../../../platform/interop/pdf/pdfTextStrings';
import { PDF_SIGNATURE_METADATA_LIMITS } from '../pdfSignatureContracts';
import type { PdfSignatureMetadata, PdfSigningProvider, SignedPdfResult } from '../pdfSignatureContracts';

const MAX_PDF_BYTES = 512 * 1024 * 1024;
const MAX_CLASSIC_OBJECTS = 500_000;
const DEFAULT_SIGNATURE_PLACEHOLDER_BYTES = 32 * 1024;
const BYTE_RANGE_WIDTH = 10;

interface PdfObjectRef {
  id: number;
  generation: number;
}

interface ParsedAcroForm extends PdfObjectRef {
  body: string;
}

interface ParsedPdfRevision {
  rootObjectId: number;
  rootGeneration: number;
  rootBody: string;
  previousXrefOffset: number;
  trailerSize: number;
  trailerIdEntry: string;
  maxObjectId: number;
  pages: PdfObjectRef[];
  acroForm?: ParsedAcroForm;
  nextSignatureIndex: number;
}

// Metadata slots (`/Name`, `/Reason`, `/Location`) are text strings. The rule for a *bounded* metadata text
// string lives in `platform/interop/pdf/pdfTextStrings.ts` next to the other string rules (W-301): this module
// used to own a second function with the name `escapePdfLiteral` — a name that module already uses for delimiter
// escaping — and it cut over-long values silently. The widths come from `PDF_SIGNATURE_METADATA_LIMITS`.

function parseLastMatch(pattern: RegExp, input: string): RegExpExecArray | null {
  let match: RegExpExecArray | null = null;
  let current: RegExpExecArray | null;
  pattern.lastIndex = 0;
  while ((current = pattern.exec(input)) !== null) {
    match = current;
    if (current[0].length === 0) pattern.lastIndex += 1;
  }
  return match;
}

function findPlainObjectBody(text: string, id: number, generation: number): string {
  const pattern = new RegExp(`(?:^|[\\r\\n])${id}\\s+${generation}\\s+obj\\b([\\s\\S]*?)\\bendobj\\b`, 'gu');
  const match = parseLastMatch(pattern, text);
  if (!match) throw new Error(`PDF object ${id} ${generation} could not be located`);
  const body = match[1]!.trim();
  if (body.length > 2 * 1024 * 1024) throw new Error(`PDF object ${id} exceeds the signing rewrite bound`);
  if (/\bstream[\r\n]/u.test(body)) throw new Error(`PDF object ${id} is a stream and cannot be rewritten by the classic signing adapter`);
  return body;
}

function enumeratePageObjects(text: string): PdfObjectRef[] {
  const output: PdfObjectRef[] = [];
  const headers = /(?:^|[\r\n])(\d{1,10})\s+(\d{1,5})\s+obj\b/gu;
  let match: RegExpExecArray | null;
  while ((match = headers.exec(text))) {
    if (output.length > MAX_CLASSIC_OBJECTS) throw new Error('PDF object count exceeds signing bounds');
    const bodyStart = headers.lastIndex;
    const end = text.indexOf('endobj', bodyStart);
    if (end < 0) continue;
    const body = text.slice(bodyStart, Math.min(end, bodyStart + 2 * 1024 * 1024));
    const dictionary = body.slice(0, body.search(/\bstream[\r\n]/u) >= 0 ? body.search(/\bstream[\r\n]/u) : body.length);
    if (/\/Type\s*\/Page\b/u.test(dictionary) && !/\/Type\s*\/Pages\b/u.test(dictionary)) {
      output.push({ id: Number(match[1]), generation: Number(match[2]) });
    }
    headers.lastIndex = end + 'endobj'.length;
  }
  if (output.length === 0) throw new Error('PDF has no plain Page object for the signature widget');
  return output;
}

function parsePdfRevision(pdfBytes: Uint8Array): ParsedPdfRevision {
  if (pdfBytes.byteLength < 32 || pdfBytes.byteLength > MAX_PDF_BYTES) throw new Error('PDF size is outside supported signing bounds');
  const text = new TextDecoder('latin1').decode(pdfBytes);
  if (!text.startsWith('%PDF-')) throw new Error('Input is not a PDF document');
  if (/\/Encrypt\b/u.test(text)) throw new Error('Encrypted PDFs must be decrypted before signing');
  if (/\/ObjStm\b|\/Type\s*\/XRef\b/u.test(text)) throw new Error('Object-stream/xref-stream PDFs require the native signing adapter');
  const startXrefMatch = parseLastMatch(/startxref\s+(\d+)\s+%%EOF/gu, text);
  if (!startXrefMatch) throw new Error('PDF startxref could not be located');
  const previousXrefOffset = Number(startXrefMatch[1]);
  if (!Number.isSafeInteger(previousXrefOffset) || previousXrefOffset < 0 || previousXrefOffset >= pdfBytes.byteLength) throw new Error('PDF startxref is invalid');
  const trailerMatch = parseLastMatch(/trailer\s*<<(.*?)>>\s*startxref/gsu, text);
  if (!trailerMatch) throw new Error('Classic PDF trailer could not be located');
  const trailer = trailerMatch[1]!;
  const rootMatch = /\/Root\s+(\d+)\s+(\d+)\s+R/u.exec(trailer);
  const sizeMatch = /\/Size\s+(\d+)/u.exec(trailer);
  if (!rootMatch || !sizeMatch) throw new Error('PDF trailer is missing Root or Size');
  const rootObjectId = Number(rootMatch[1]);
  const rootGeneration = Number(rootMatch[2]);
  const trailerSize = Number(sizeMatch[1]);
  const rootBody = findPlainObjectBody(text, rootObjectId, rootGeneration);
  if (!/^<<[\s\S]*>>$/u.test(rootBody) || !/\/Type\s*\/Catalog\b/u.test(rootBody)) throw new Error('PDF Root is not a plain Catalog dictionary');
  const objectMatches = [...text.matchAll(/(?:^|[\r\n])(\d+)\s+(\d+)\s+obj\b/gu)];
  if (objectMatches.length > MAX_CLASSIC_OBJECTS) throw new Error('PDF object count exceeds signing bounds');
  const maxObjectId = objectMatches.reduce((max, match) => Math.max(max, Number(match[1])), 0);
  const pages = enumeratePageObjects(text);

  let acroForm: ParsedAcroForm | undefined;
  const acroFormRef = /\/AcroForm\s+(\d+)\s+(\d+)\s+R\b/u.exec(rootBody);
  if (acroFormRef) {
    const id = Number(acroFormRef[1]);
    const generation = Number(acroFormRef[2]);
    const body = findPlainObjectBody(text, id, generation);
    if (!/^<<[\s\S]*>>$/u.test(body)) throw new Error('Existing AcroForm is not a plain dictionary');
    if (!/\/Fields\s*\[[\s\S]*?\]/u.test(body)) throw new Error('Existing AcroForm Fields must be a direct array for incremental signing');
    acroForm = { id, generation, body };
  } else if (/\/AcroForm\b/u.test(rootBody)) {
    throw new Error('Inline/unsupported AcroForm requires the native signing adapter');
  }

  let highestSignatureIndex = 0;
  for (const match of text.matchAll(/\/T\s*\(AstraeaSignature(\d{1,6})\)/gu)) highestSignatureIndex = Math.max(highestSignatureIndex, Number(match[1]));
  const trailerIdMatch = /\/ID\s*(\[[\s\S]*?\])/u.exec(trailer);
  return {
    rootObjectId,
    rootGeneration,
    rootBody,
    previousXrefOffset,
    trailerSize,
    trailerIdEntry: trailerIdMatch ? ` /ID ${trailerIdMatch[1]}` : '',
    maxObjectId,
    pages,
    acroForm,
    nextSignatureIndex: highestSignatureIndex + 1,
  };
}

function patchCatalog(rootBody: string, acroFormId: number): string {
  const closing = rootBody.lastIndexOf('>>');
  if (closing < 2) throw new Error('PDF Catalog dictionary boundary is invalid');
  return `${rootBody.slice(0, closing).trimEnd()} /AcroForm ${acroFormId} 0 R >>`;
}

function patchAcroForm(acroFormBody: string, signatureFieldId: number): string {
  const fields = /\/Fields\s*\[([\s\S]*?)\]/u.exec(acroFormBody);
  if (!fields) throw new Error('AcroForm direct Fields array is missing');
  const fieldBody = fields[1]!.trim();
  const appendedFields = `/Fields [${fieldBody ? `${fieldBody} ` : ''}${signatureFieldId} 0 R]`;
  let patched = acroFormBody.replace(fields[0], appendedFields);
  if (!/\/SigFlags\s+\d+/u.test(patched)) {
    const closing = patched.lastIndexOf('>>');
    if (closing < 2) throw new Error('AcroForm dictionary boundary is invalid');
    patched = `${patched.slice(0, closing).trimEnd()} /SigFlags 3 >>`;
  } else {
    patched = patched.replace(/\/SigFlags\s+\d+/u, '/SigFlags 3');
  }
  return patched;
}

function formatPdfDate(timestamp: number): string {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) throw new Error('Signature date is invalid');
  const pad = (value: number) => value.toString().padStart(2, '0');
  return `D:${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

function paddedNumber(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0 || value >= 10 ** BYTE_RANGE_WIDTH) throw new Error('PDF ByteRange exceeds supported width');
  return value.toString().padStart(BYTE_RANGE_WIDTH, '0');
}

function pdfNumber(value: number): string {
  if (!Number.isFinite(value) || Math.abs(value) > 1_000_000) throw new Error('Signature widget geometry is outside supported bounds');
  const normalized = Math.round(value * 1000) / 1000;
  return Number.isInteger(normalized) ? String(normalized) : normalized.toFixed(3).replace(/0+$/u, '').replace(/\.$/u, '');
}

function signatureRect(metadata: PdfSignatureMetadata): string {
  const { x, y, width, height } = metadata.bbox;
  if (width < 0 || height < 0) throw new Error('Signature widget width/height must be non-negative');
  return `[${pdfNumber(x)} ${pdfNumber(y)} ${pdfNumber(x + width)} ${pdfNumber(y + height)}]`;
}

function appendObject(baseOffset: number, chunks: string[], offsets: Map<number, number>, id: number, generation: number, body: string): void {
  const prefix = chunks.join('');
  offsets.set(id, baseOffset + new TextEncoder().encode(prefix).byteLength);
  chunks.push(`${id} ${generation} obj\n${body}\nendobj\n`);
}

function xrefEntry(offsets: Map<number, number>, id: number, generation: number): string {
  const offset = offsets.get(id);
  if (offset === undefined) throw new Error(`Missing xref offset for object ${id}`);
  return `${paddedNumber(offset)} ${String(generation).padStart(5, '0')} n \n`;
}

function buildUnsignedIncrementalRevision(pdfBytes: Uint8Array, metadata: PdfSignatureMetadata, placeholderBytes: number): {
  bytes: Uint8Array;
  byteRange: [number, number, number, number];
  contentsHexStart: number;
  contentsHexLength: number;
} {
  const parsed = parsePdfRevision(pdfBytes);
  if (!Number.isInteger(metadata.pageNumber) || metadata.pageNumber < 1 || metadata.pageNumber > parsed.pages.length) throw new Error('Signature page number is outside the document');
  const targetPage = parsed.pages[metadata.pageNumber - 1]!;
  const firstNewId = Math.max(parsed.trailerSize, parsed.maxObjectId + 1);
  const acroFormId = parsed.acroForm?.id ?? firstNewId;
  const signatureFieldId = parsed.acroForm ? firstNewId : firstNewId + 1;
  const signatureId = signatureFieldId + 1;
  const newSize = Math.max(parsed.trailerSize, signatureId + 1);
  const placeholderHex = '0'.repeat(placeholderBytes * 2);
  const byteRangePlaceholder = `[${'0'.repeat(BYTE_RANGE_WIDTH)} ${'0'.repeat(BYTE_RANGE_WIDTH)} ${'0'.repeat(BYTE_RANGE_WIDTH)} ${'0'.repeat(BYTE_RANGE_WIDTH)}]`;
  const signatureDictionary = [
    '<< /Type /Sig',
    '/Filter /Adobe.PPKLite',
    '/SubFilter /ETSI.CAdES.detached',
    `/Name (${pdfMetadataTextString(metadata.signerName, PDF_SIGNATURE_METADATA_LIMITS.signerName, 'Signer name')})`,
    `/Reason (${pdfMetadataTextString(metadata.reason, PDF_SIGNATURE_METADATA_LIMITS.reason, 'Signing reason')})`,
    `/Location (${pdfMetadataTextString(metadata.location, PDF_SIGNATURE_METADATA_LIMITS.location, 'Signing location')})`,
    `/M (${formatPdfDate(metadata.signDate)})`,
    `/ByteRange ${byteRangePlaceholder}`,
    `/Contents <${placeholderHex}> >>`,
  ].join('\n');

  const chunks: string[] = ['\n'];
  const offsets = new Map<number, number>();
  const rewrittenRefs: PdfObjectRef[] = [];
  if (parsed.acroForm) {
    appendObject(pdfBytes.byteLength, chunks, offsets, parsed.acroForm.id, parsed.acroForm.generation, patchAcroForm(parsed.acroForm.body, signatureFieldId));
    rewrittenRefs.push({ id: parsed.acroForm.id, generation: parsed.acroForm.generation });
  } else {
    appendObject(pdfBytes.byteLength, chunks, offsets, parsed.rootObjectId, parsed.rootGeneration, patchCatalog(parsed.rootBody, acroFormId));
    rewrittenRefs.push({ id: parsed.rootObjectId, generation: parsed.rootGeneration });
    appendObject(pdfBytes.byteLength, chunks, offsets, acroFormId, 0, `<< /SigFlags 3 /Fields [${signatureFieldId} 0 R] >>`);
  }
  appendObject(
    pdfBytes.byteLength,
    chunks,
    offsets,
    signatureFieldId,
    0,
    `<< /Type /Annot /Subtype /Widget /FT /Sig /T (AstraeaSignature${parsed.nextSignatureIndex}) /V ${signatureId} 0 R /Rect ${signatureRect(metadata)} /F 132 /P ${targetPage.id} ${targetPage.generation} R >>`,
  );
  appendObject(pdfBytes.byteLength, chunks, offsets, signatureId, 0, signatureDictionary);

  const beforeXref = chunks.join('');
  const xrefOffset = pdfBytes.byteLength + new TextEncoder().encode(beforeXref).byteLength;
  chunks.push('xref\n');
  for (const reference of rewrittenRefs) chunks.push(`${reference.id} 1\n${xrefEntry(offsets, reference.id, reference.generation)}`);
  if (!parsed.acroForm) chunks.push(`${acroFormId} 3\n${xrefEntry(offsets, acroFormId, 0)}${xrefEntry(offsets, signatureFieldId, 0)}${xrefEntry(offsets, signatureId, 0)}`);
  else chunks.push(`${signatureFieldId} 2\n${xrefEntry(offsets, signatureFieldId, 0)}${xrefEntry(offsets, signatureId, 0)}`);
  chunks.push(
    `trailer\n<< /Size ${newSize} /Root ${parsed.rootObjectId} ${parsed.rootGeneration} R /Prev ${parsed.previousXrefOffset}${parsed.trailerIdEntry} >>\n`,
    `startxref\n${xrefOffset}\n%%EOF\n`,
  );

  const appended = new TextEncoder().encode(chunks.join(''));
  const unsigned = new Uint8Array(pdfBytes.byteLength + appended.byteLength);
  unsigned.set(pdfBytes, 0);
  unsigned.set(appended, pdfBytes.byteLength);
  const latin = new TextDecoder('latin1').decode(unsigned);
  const contentsMarker = `/Contents <${placeholderHex}>`;
  const markerIndex = latin.lastIndexOf(contentsMarker);
  if (markerIndex < 0) throw new Error('Signature Contents placeholder could not be located');
  const openingBracket = markerIndex + '/Contents '.length;
  const closingBracketExclusive = openingBracket + 1 + placeholderHex.length + 1;
  const byteRange: [number, number, number, number] = [0, openingBracket, closingBracketExclusive, unsigned.byteLength - closingBracketExclusive];
  const byteRangeValue = `[${paddedNumber(byteRange[0])} ${paddedNumber(byteRange[1])} ${paddedNumber(byteRange[2])} ${paddedNumber(byteRange[3])}]`;
  const byteRangeMarker = `/ByteRange ${byteRangePlaceholder}`;
  const byteRangeIndex = latin.lastIndexOf(byteRangeMarker);
  if (byteRangeIndex < 0) throw new Error('Signature ByteRange placeholder could not be located');
  const patched = unsigned.slice();
  const replacement = new TextEncoder().encode(`/ByteRange ${byteRangeValue}`);
  const targetStart = byteRangeIndex;
  const targetLength = new TextEncoder().encode(byteRangeMarker).byteLength;
  if (replacement.byteLength !== targetLength) throw new Error('ByteRange replacement width changed unexpectedly');
  patched.set(replacement, targetStart);
  return { bytes: patched, byteRange, contentsHexStart: openingBracket + 1, contentsHexLength: placeholderHex.length };
}

async function sha256ByteRange(pdfBytes: Uint8Array, byteRange: [number, number, number, number]): Promise<Uint8Array> {
  if (!globalThis.crypto?.subtle) throw new Error('WebCrypto SubtleCrypto is unavailable');
  const [offset1, length1, offset2, length2] = byteRange;
  if (offset1 !== 0 || length1 < 0 || offset2 < length1 || length2 < 0 || offset2 + length2 !== pdfBytes.byteLength) throw new Error('PDF ByteRange is inconsistent');
  const combined = new Uint8Array(length1 + length2);
  combined.set(pdfBytes.subarray(0, length1), 0);
  combined.set(pdfBytes.subarray(offset2, offset2 + length2), length1);
  return new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', combined as unknown as BufferSource));
}

export async function signPdfIncrementally(
  pdfBytes: Uint8Array,
  metadata: PdfSignatureMetadata,
  provider: PdfSigningProvider,
): Promise<SignedPdfResult> {
  const unsigned = buildUnsignedIncrementalRevision(pdfBytes, metadata, DEFAULT_SIGNATURE_PLACEHOLDER_BYTES);
  const digest = await sha256ByteRange(unsigned.bytes, unsigned.byteRange);
  const response = await provider.signDetachedCms({
    profile: metadata.padesProfile,
    digestAlgorithm: 'SHA-256',
    pdfDigest: digest,
    signingTime: metadata.signDate,
  });
  if (!(response.cmsBytes instanceof Uint8Array) || response.cmsBytes.byteLength < 128) throw new Error('Signing provider returned an invalid CMS object');
  if (metadata.padesProfile === 'B-T' && !response.timestampAttested) throw new Error('PAdES-B-T requires a verified RFC 3161 signature timestamp');
  const cmsHex = bytesToHex(response.cmsBytes);
  if (cmsHex.length > unsigned.contentsHexLength) throw new Error('CMS signature exceeds reserved PDF Contents capacity');
  const finalBytes = unsigned.bytes.slice();
  const paddedCms = new TextEncoder().encode(cmsHex.padEnd(unsigned.contentsHexLength, '0'));
  finalBytes.set(paddedCms, unsigned.contentsHexStart);
  return {
    signedBytes: finalBytes,
    byteRange: unsigned.byteRange,
    contentDigestHex: bytesToHex(digest),
    signatureValueHex: cmsHex.slice(0, 96) + (cmsHex.length > 96 ? '…' : ''),
    timestampAttested: response.timestampAttested,
    signerSubject: metadata.signerName,
    providerLabel: provider.label,
    certificateFingerprintSha256: provider.certificate.fingerprintSha256,
  };
}
