// STATUS: DIAMANT VGT SUPREME — Bounded Passive XML Roundtrip Preservation
import type { WriterInteropPreservation } from '../../shared/contracts/workspace';
import { decodeUtf8, type ZipEntry, utf8 } from './zip';
import { inspectBoundedForeignXml } from '../../shared/interoperability/xml';

const MAX_PARTS = 64;
const MAX_PART_BYTES = 256 * 1024;
const MAX_TOTAL_BYTES = 2 * 1024 * 1024;
const MAX_NAMESPACES = 64;

function safeXmlPart(name: string): boolean {
  if (!name.endsWith('.xml') || name.length > 512 || name.includes('\0')) return false;
  if (name.startsWith('/') || name.split('/').some((part) => part === '..')) return false;
  return !/(?:^|\/)(?:vbaProject|activeX|embeddings)(?:\/|\.|$)/iu.test(name);
}

function passiveXml(text: string): boolean {
  if (text.length > MAX_PART_BYTES) return false;
  try { inspectBoundedForeignXml(text, { maxBytes: MAX_PART_BYTES }); return true; } catch { return false; }
}

export function captureWriterXmlPreservation(
  entries: ReadonlyMap<string, Uint8Array>,
  sourceFormat: 'docx' | 'odt',
  primaryXml: string,
  excludedParts: ReadonlySet<string>,
): WriterInteropPreservation {
  const preservedXmlParts: Record<string, string> = {};
  let total = 0;
  for (const [name, bytes] of entries) {
    if (Object.keys(preservedXmlParts).length >= MAX_PARTS) break;
    if (excludedParts.has(name) || !safeXmlPart(name) || bytes.byteLength > MAX_PART_BYTES) continue;
    if (sourceFormat === 'docx' && /^word\/(?:header|footer)\d+\.xml$/iu.test(name)) continue;
    if (total + bytes.byteLength > MAX_TOTAL_BYTES) break;
    try {
      const text = decodeUtf8(bytes);
      if (!passiveXml(text)) continue;
      preservedXmlParts[name] = text;
      total += bytes.byteLength;
    } catch {
      // Non-UTF8 or malformed text is not safe to preserve as passive XML.
    }
  }

  const preservedNamespaces: Record<string, string> = {};
  const namespacePattern = /xmlns:([A-Za-z_][\w.-]*)="([^"]{1,1024})"/gu;
  let match: RegExpExecArray | null;
  while ((match = namespacePattern.exec(primaryXml)) !== null && Object.keys(preservedNamespaces).length < MAX_NAMESPACES) {
    const prefix = match[1];
    const uri = match[2];
    if (['w', 'r', 'mc', 'vgt', 'office', 'text', 'style', 'fo', 'manifest'].includes(prefix)) continue;
    preservedNamespaces[prefix] = uri;
  }
  return { sourceFormat, preservedXmlParts, preservedNamespaces };
}

export function mergeWriterPreservedNamespaces(
  xml: string,
  preservation: WriterInteropPreservation | undefined,
  sourceFormat: 'docx' | 'odt',
): string {
  if (!preservation || preservation.sourceFormat !== sourceFormat) return xml;
  const start = xml.indexOf('<', xml.indexOf('?>') >= 0 ? xml.indexOf('?>') + 2 : 0);
  const end = xml.indexOf('>', start);
  if (start < 0 || end < 0) return xml;
  let root = xml.slice(start, end);
  for (const [prefix, uri] of Object.entries(preservation.preservedNamespaces).slice(0, MAX_NAMESPACES)) {
    if (!/^[A-Za-z_][\w.-]*$/u.test(prefix) || uri.length > 1024 || root.includes(`xmlns:${prefix}=`)) continue;
    root += ` xmlns:${prefix}="${uri.replace(/&/gu, '&amp;').replace(/"/gu, '&quot;')}"`;
  }
  return `${xml.slice(0, start)}${root}>${xml.slice(end + 1)}`;
}


export function listWriterPreservedXmlPartNames(
  preservation: WriterInteropPreservation | undefined,
  sourceFormat: 'docx' | 'odt',
): string[] {
  if (!preservation || preservation.sourceFormat !== sourceFormat) return [];
  const names: string[] = [];
  let total = 0;
  for (const [name, text] of Object.entries(preservation.preservedXmlParts)) {
    if (names.length >= MAX_PARTS || !safeXmlPart(name) || !passiveXml(text)) continue;
    const data = utf8(text);
    if (data.byteLength > MAX_PART_BYTES || total + data.byteLength > MAX_TOTAL_BYTES) break;
    names.push(name);
    total += data.byteLength;
  }
  return names;
}

export function appendWriterPreservedXmlEntries(
  entries: ZipEntry[],
  preservation: WriterInteropPreservation | undefined,
  sourceFormat: 'docx' | 'odt',
): void {
  if (!preservation || preservation.sourceFormat !== sourceFormat) return;
  const occupied = new Set(entries.map((entry) => entry.name));
  let total = 0;
  let count = 0;
  for (const [name, text] of Object.entries(preservation.preservedXmlParts)) {
    if (count >= MAX_PARTS || occupied.has(name) || !safeXmlPart(name) || !passiveXml(text)) continue;
    const data = utf8(text);
    if (data.byteLength > MAX_PART_BYTES || total + data.byteLength > MAX_TOTAL_BYTES) break;
    entries.push({ name, data });
    occupied.add(name);
    total += data.byteLength;
    count += 1;
  }
}
