// STATUS: DIAMANT VGT SUPREME
// Read-only, bounded AcroForm field inventory for foreign PDFs.
// It never executes actions/JavaScript and never logs raw field values.

export const PDF_NATIVE_ACROFORM_LIMITS = Object.freeze({
  maxBytes: 64 * 1024 * 1024,
  maxObjects: 250_000,
  maxFields: 4_096,
  maxObjectDictionaryChars: 64 * 1024,
  maxFieldNameChars: 256,
  maxParentDepth: 16,
  maxScanMillis: 2_500,
});

export type PdfNativeFormInspectionStatus = 'none' | 'complete' | 'partial-object-stream' | 'unsupported-encrypted';
export type PdfNativeFormFieldKind = 'text' | 'checkbox' | 'radio' | 'button' | 'dropdown' | 'list' | 'signature' | 'unknown';

export interface PdfNativeFormFieldInventoryEntry {
  objectId: number;
  widgetObjectId: number | null;
  name: string;
  kind: PdfNativeFormFieldKind;
  flags: number;
  required: boolean;
  readOnly: boolean;
  hasValue: boolean;
  pageObjectId: number | null;
  rect: [number, number, number, number] | null;
}

export interface PdfNativeAcroFormInspection {
  status: PdfNativeFormInspectionStatus;
  fields: PdfNativeFormFieldInventoryEntry[];
  fieldCount: number;
  warnings: string[];
}

interface RawObject {
  id: number;
  generation: number;
  dictionary: string;
}

const ASCII = new TextDecoder('windows-1252', { fatal: false, ignoreBOM: true });

const parseInteger = (text: string, key: string): number | null => {
  const match = new RegExp(`/${key}\\s+(-?\\d{1,10})\\b`, 'u').exec(text);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) ? value : null;
};

const parseName = (text: string, key: string): string | null =>
  new RegExp(`/${key}\\s*/([A-Za-z0-9_.+-]{1,64})\\b`, 'u').exec(text)?.[1] ?? null;

const parseReference = (text: string, key: string): number | null => {
  const match = new RegExp(`/${key}\\s+(\\d{1,10})\\s+\\d{1,5}\\s+R\\b`, 'u').exec(text);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) ? value : null;
};

const parseRect = (text: string): [number, number, number, number] | null => {
  const match = /\/Rect\s*\[\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\]/u.exec(text);
  if (!match) return null;
  const values = match.slice(1).map(Number);
  return values.every(Number.isFinite) ? values as [number, number, number, number] : null;
};

const parseLiteralString = (text: string, key: string): string | null => {
  const startMatch = new RegExp(`/${key}\\s*\\(`, 'u').exec(text);
  if (!startMatch || startMatch.index === undefined) return null;
  let index = startMatch.index + startMatch[0].length;
  let depth = 1;
  let escaped = false;
  let out = '';
  while (index < text.length && depth > 0 && out.length < PDF_NATIVE_ACROFORM_LIMITS.maxFieldNameChars * 2) {
    const ch = text[index++];
    if (escaped) {
      escaped = false;
      if (ch === 'n') out += '\n';
      else if (ch === 'r') out += '\r';
      else if (ch === 't') out += '\t';
      else if (ch === 'b') out += '\b';
      else if (ch === 'f') out += '\f';
      else out += ch;
      continue;
    }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '(') { depth += 1; if (depth > 1) out += ch; continue; }
    if (ch === ')') { depth -= 1; if (depth > 0) out += ch; continue; }
    if (depth > 0) out += ch;
  }
  if (depth !== 0) return null;
  return out.replace(/[\x00-\x1F\x7F]/gu, ' ').trim().slice(0, PDF_NATIVE_ACROFORM_LIMITS.maxFieldNameChars);
};

function fieldKind(ft: string | null, flags: number): PdfNativeFormFieldKind {
  if (ft === 'Tx') return 'text';
  if (ft === 'Sig') return 'signature';
  if (ft === 'Btn') {
    if ((flags & 65536) !== 0) return 'button';
    if ((flags & 32768) !== 0) return 'radio';
    return 'checkbox';
  }
  if (ft === 'Ch') return (flags & 131072) !== 0 ? 'dropdown' : 'list';
  return 'unknown';
}

function scanObjects(text: string, started: number): Map<number, RawObject> {
  const map = new Map<number, RawObject>();
  const header = /(?:^|[\r\n])(\d{1,10})\s+(\d{1,5})\s+obj\b/gu;
  let match: RegExpExecArray | null;
  while ((match = header.exec(text))) {
    if (performance.now() - started > PDF_NATIVE_ACROFORM_LIMITS.maxScanMillis) throw new Error('AcroForm inspection exceeded the scan-time budget.');
    if (map.size >= PDF_NATIVE_ACROFORM_LIMITS.maxObjects) throw new Error('AcroForm inspection object budget exceeded.');
    const id = Number(match[1]);
    const generation = Number(match[2]);
    const bodyStart = header.lastIndex;
    let end = text.indexOf('endobj', bodyStart);
    if (end < 0) break;
    const stream = text.indexOf('stream', bodyStart);
    if (stream >= 0 && stream < end) {
      const endStream = text.indexOf('endstream', stream + 6);
      if (endStream < 0) continue;
      const actualEnd = text.indexOf('endobj', endStream + 9);
      if (actualEnd < 0) continue;
      end = actualEnd;
    }
    const rawBody = text.slice(bodyStart, Math.min(end, bodyStart + PDF_NATIVE_ACROFORM_LIMITS.maxObjectDictionaryChars));
    const dictionary = rawBody.split(/\bstream\b/u, 1)[0];
    if (!map.has(id)) map.set(id, { id, generation, dictionary });
    header.lastIndex = end + 6;
  }
  return map;
}

export function inspectNativePdfAcroFormFields(bytes: Uint8Array): PdfNativeAcroFormInspection {
  if (bytes.byteLength <= 0) throw new Error('AcroForm inspection rejected an empty PDF.');
  if (bytes.byteLength > PDF_NATIVE_ACROFORM_LIMITS.maxBytes) throw new Error('AcroForm inspection byte budget exceeded.');
  const started = performance.now();
  const text = ASCII.decode(bytes);
  if (!/%PDF-(?:1\.[0-7]|2\.0)/u.test(text.slice(0, 1024))) throw new Error('AcroForm inspection requires PDF bytes.');
  if (!/\/AcroForm\b/u.test(text)) return { status: 'none', fields: [], fieldCount: 0, warnings: [] };
  if (/\/Encrypt\b/u.test(text)) {
    return { status: 'unsupported-encrypted', fields: [], fieldCount: 0, warnings: ['Encrypted AcroForm detected. Field inventory requires successful standards-compliant decryption first.'] };
  }

  const hasObjectStreams = /\/Type\s*\/ObjStm\b|\/ObjStm\b/u.test(text);
  const objects = scanObjects(text, started);
  const fields = new Map<number, PdfNativeFormFieldInventoryEntry>();
  const widgetGeometry = new Map<number, { widgetObjectId: number; pageObjectId: number | null; rect: [number, number, number, number] | null }>();

  const resolveFieldOwner = (objectId: number): number | null => {
    let current = objectId;
    const visited = new Set<number>();
    for (let depth = 0; depth < PDF_NATIVE_ACROFORM_LIMITS.maxParentDepth; depth += 1) {
      if (visited.has(current)) return null;
      visited.add(current);
      const object = objects.get(current);
      if (!object) return null;
      if (/\/FT\s*\//u.test(object.dictionary)) return current;
      const parent = parseReference(object.dictionary, 'Parent');
      if (parent === null) return null;
      current = parent;
    }
    return null;
  };

  for (const object of objects.values()) {
    if (!/\/FT\s*\/|\/Subtype\s*\/Widget\b/u.test(object.dictionary)) continue;
    const isWidget = /\/Subtype\s*\/Widget\b/u.test(object.dictionary);
    const parentId = isWidget ? parseReference(object.dictionary, 'Parent') : null;
    // Widget annotations may repeat /FT even when the logical field lives in /Parent
    // (notably radio-button kids). Parent ownership wins to avoid inventing fields.
    const ownerId = parentId !== null
      ? resolveFieldOwner(parentId)
      : (/\/FT\s*\//u.test(object.dictionary) ? object.id : resolveFieldOwner(object.id));
    if (ownerId === null) continue;
    const owner = objects.get(ownerId);
    if (!owner) continue;
    const flags = parseInteger(owner.dictionary, 'Ff') ?? 0;
    const ft = parseName(owner.dictionary, 'FT');
    const name = parseLiteralString(owner.dictionary, 'T') || `field-${ownerId}`;
    const ownerGeometry = { widgetObjectId: object.id, pageObjectId: parseReference(object.dictionary, 'P'), rect: parseRect(object.dictionary) };
    if (/\/Subtype\s*\/Widget\b/u.test(object.dictionary)) widgetGeometry.set(ownerId, ownerGeometry);
    const geometry = widgetGeometry.get(ownerId) ?? { widgetObjectId: /\/Subtype\s*\/Widget\b/u.test(owner.dictionary) ? ownerId : null, pageObjectId: parseReference(owner.dictionary, 'P'), rect: parseRect(owner.dictionary) };
    fields.set(ownerId, {
      objectId: ownerId,
      widgetObjectId: geometry.widgetObjectId,
      name,
      kind: fieldKind(ft, flags),
      flags,
      required: (flags & 2) !== 0,
      readOnly: (flags & 1) !== 0,
      hasValue: /\/V(?:\s|\[|\(|<|\/)/u.test(owner.dictionary),
      pageObjectId: geometry.pageObjectId,
      rect: geometry.rect,
    });
    if (fields.size > PDF_NATIVE_ACROFORM_LIMITS.maxFields) throw new Error('AcroForm inspection field budget exceeded.');
  }

  // Second pass lets child widgets provide geometry to parent field dictionaries encountered first.
  for (const object of objects.values()) {
    if (!/\/Subtype\s*\/Widget\b/u.test(object.dictionary)) continue;
    const ownerId = resolveFieldOwner(object.id);
    if (ownerId === null) continue;
    const entry = fields.get(ownerId);
    if (!entry || entry.widgetObjectId !== null) continue;
    entry.widgetObjectId = object.id;
    entry.pageObjectId = parseReference(object.dictionary, 'P');
    entry.rect = parseRect(object.dictionary);
  }

  const sorted = [...fields.values()].sort((a, b) => a.name.localeCompare(b.name) || a.objectId - b.objectId);
  const warnings: string[] = [];
  if (hasObjectStreams) warnings.push('Object streams are present. Direct field dictionaries were inventoried, but compressed fields are not silently assumed to be absent.');
  if (sorted.length === 0) warnings.push('AcroForm exists, but no direct field dictionaries were safely inventoried.');
  return {
    status: hasObjectStreams ? 'partial-object-stream' : 'complete',
    fields: sorted,
    fieldCount: sorted.length,
    warnings,
  };
}
