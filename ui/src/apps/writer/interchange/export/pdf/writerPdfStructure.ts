import type { WriterBookmark, WriterTextLink } from '../../../../../shared/contracts/workspace';
import { evaluateRichTextLink } from '../../../../../platform/security/richTextLinkSecurity';

export interface WriterPdfDocumentMetadata {
  language?: string;
  author?: string;
  subject?: string;
  keywords?: string[];
  createdAt?: number;
  modifiedAt?: number;
  bookmarks?: readonly WriterBookmark[];
}

export interface WriterPdfSemanticTag {
  mcid: number;
  role: 'P' | `H${1 | 2 | 3 | 4 | 5 | 6}`;
  paragraphId?: string;
}

export interface WriterPdfPageSemantics {
  pageId: number;
  structParents: number;
  tags: WriterPdfSemanticTag[];
}

export interface WriterPdfDestination {
  paragraphId: string;
  pageId: number;
  y: number;
}

export interface WriterPdfOutlineTarget {
  title: string;
  paragraphId: string;
  level: number;
}

export function pdfLiteralString(input: string): string {
  return input
    .replace(/\\/gu, '\\\\')
    .replace(/\(/gu, '\\(')
    .replace(/\)/gu, '\\)')
    .replace(/[\r\n]+/gu, ' ');
}

export function pdfUnicodeString(input: string): string {
  const units: number[] = [0xfe, 0xff];
  for (const char of input.normalize('NFC')) {
    const codePoint = char.codePointAt(0) ?? 0xfffd;
    if (codePoint <= 0xffff) {
      units.push((codePoint >>> 8) & 0xff, codePoint & 0xff);
      continue;
    }
    const scalar = codePoint - 0x10000;
    const high = 0xd800 + (scalar >>> 10);
    const low = 0xdc00 + (scalar & 0x3ff);
    units.push((high >>> 8) & 0xff, high & 0xff, (low >>> 8) & 0xff, low & 0xff);
  }
  return `<${units.map((value) => value.toString(16).padStart(2, '0').toUpperCase()).join('')}>`;
}

export function writerPdfDestinationName(paragraphId: string): string {
  const normalized = paragraphId.normalize('NFKC').replace(/[^A-Za-z0-9_.:-]/gu, '_').slice(0, 160);
  return `writer:${normalized || 'paragraph'}`;
}

export function sanitizeWriterPdfLink(link: WriterTextLink | undefined): WriterTextLink | null {
  if (!link) return null;
  if (link.kind === 'internal') {
    const paragraphId = link.paragraphId.normalize('NFKC').trim().slice(0, 256);
    return paragraphId ? { kind: 'internal', paragraphId } : null;
  }
  const decision = evaluateRichTextLink(link.url);
  if (!decision.allowed) return null;
  return { kind: 'external', url: decision.normalizedUrl };
}

function xmlEscape(value: string): string {
  return value.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;').replace(/'/gu, '&apos;');
}

function isoDate(value?: number): string {
  const timestamp = Number.isFinite(value) ? Number(value) : 0;
  return new Date(Math.max(0, timestamp)).toISOString();
}

export function buildWriterPdfXmp(title: string, metadata: WriterPdfDocumentMetadata = {}, archiveProfile?: 'pdfa-2b'): string {
  const keywords = (metadata.keywords ?? []).map((value) => value.normalize('NFKC').trim()).filter(Boolean).slice(0, 32).join(', ');
  return `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>\n` +
    `<x:xmpmeta xmlns:x="adobe:ns:meta/">\n` +
    `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n` +
    `<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:pdf="http://ns.adobe.com/pdf/1.3/"${archiveProfile ? ' xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/"' : ''}>\n` +
    `<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${xmlEscape(title)}</rdf:li></rdf:Alt></dc:title>` +
    `${metadata.author ? `<dc:creator><rdf:Seq><rdf:li>${xmlEscape(metadata.author)}</rdf:li></rdf:Seq></dc:creator>` : ''}` +
    `${metadata.subject ? `<dc:description><rdf:Alt><rdf:li xml:lang="x-default">${xmlEscape(metadata.subject)}</rdf:li></rdf:Alt></dc:description>` : ''}` +
    `${metadata.language ? `<dc:language><rdf:Bag><rdf:li>${xmlEscape(metadata.language)}</rdf:li></rdf:Bag></dc:language>` : ''}` +
    `${keywords ? `<pdf:Keywords>${xmlEscape(keywords)}</pdf:Keywords>` : ''}` +
    `${archiveProfile ? '<pdfaid:part>2</pdfaid:part><pdfaid:conformance>B</pdfaid:conformance>' : ''}` +
    `<pdf:Producer>VGT Workspace Writer</pdf:Producer>` +
    `<xmp:CreatorTool>Astraea Writer</xmp:CreatorTool>` +
    `<xmp:CreateDate>${isoDate(metadata.createdAt)}</xmp:CreateDate>` +
    `<xmp:ModifyDate>${isoDate(metadata.modifiedAt ?? metadata.createdAt)}</xmp:ModifyDate>` +
    `</rdf:Description></rdf:RDF></x:xmpmeta>\n<?xpacket end="w"?>`;
}

export function pdfDateString(value?: number): string {
  const date = new Date(Math.max(0, Number.isFinite(value) ? Number(value) : 0));
  const pad = (num: number) => String(num).padStart(2, '0');
  return `D:${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}
