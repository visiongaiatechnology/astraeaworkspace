// STATUS: DIAMANT VGT SUPREME — bounded passive spreadsheet XML roundtrip preservation.
import type { GridInteropPreservation } from '../../../shared/contracts/workspace';
import { decodeUtf8, type ZipEntry, utf8 } from '../../../platform/interop/zip';
import { inspectBoundedForeignXml } from '../../../shared/interoperability/xml';

const MAX_PARTS = 96;
const MAX_PART_BYTES = 256 * 1024;
const MAX_TOTAL_BYTES = 4 * 1024 * 1024;

function safeXmlPart(name: string): boolean {
  if (!name.endsWith('.xml') || name.length > 512 || name.includes('\0')) return false;
  if (name.startsWith('/') || name.split('/').some((part) => part === '..')) return false;
  return !/(?:^|\/)(?:vbaProject|activeX|embeddings|oleObject|externalLinks)(?:\/|\.|$)/iu.test(name);
}

function passiveXml(text: string): boolean {
  if (text.length > MAX_PART_BYTES || /<script\b/iu.test(text)) return false;
  try { inspectBoundedForeignXml(text, { maxBytes: MAX_PART_BYTES }); return true; } catch { return false; }
}

export function captureGridXmlPreservation(
  entries: ReadonlyMap<string, Uint8Array>,
  sourceFormat: GridInteropPreservation['sourceFormat'],
  excludedParts: ReadonlySet<string>,
): GridInteropPreservation {
  const preservedXmlParts: Record<string, string> = {};
  let total = 0;
  for (const [name, bytes] of entries) {
    if (Object.keys(preservedXmlParts).length >= MAX_PARTS) break;
    if (excludedParts.has(name) || !safeXmlPart(name) || bytes.byteLength > MAX_PART_BYTES) continue;
    if (total + bytes.byteLength > MAX_TOTAL_BYTES) break;
    try {
      const text = decodeUtf8(bytes);
      if (!passiveXml(text)) continue;
      preservedXmlParts[name] = text;
      total += bytes.byteLength;
    } catch {
      // Binary, malformed or non-UTF8 data is deliberately not preserved.
    }
  }
  return { sourceFormat, preservedXmlParts };
}

export function appendGridPreservedXmlEntries(
  entries: ZipEntry[],
  preservation: GridInteropPreservation | undefined,
  sourceFormat: GridInteropPreservation['sourceFormat'],
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
