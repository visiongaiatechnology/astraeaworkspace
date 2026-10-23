// STATUS: DIAMANT VGT SUPREME — centralized hostile-XML boundary
// Bounded XML text helpers for foreign OOXML/ODF/SVG/XML. DTDs and custom entities are rejected before parsing.

const XML_ENTITY_PATTERN = /&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-fA-F]+);/g;

export function decodeXmlEntities(value: string): string {
  return value.replace(XML_ENTITY_PATTERN, (entity, token: string) => {
    switch (token) {
      case 'lt': return '<';
      case 'gt': return '>';
      case 'amp': return '&';
      case 'quot': return '"';
      case 'apos': return "'";
      default: {
        const codePoint = token.startsWith('#x')
          ? Number.parseInt(token.slice(2), 16)
          : Number.parseInt(token.slice(1), 10);
        if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return entity;
        try { return String.fromCodePoint(codePoint); } catch { return entity; }
      }
    }
  });
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function stripXmlTags(fragment: string): string {
  return decodeXmlEntities(fragment.replace(/<[^>]*>/g, ''));
}

export function extractElementFragments(xml: string, localName: string): string[] {
  const safeName = localName.replace(/[^A-Za-z0-9_-]/g, '');
  if (safeName !== localName) throw new Error('Invalid XML local name');
  const pattern = new RegExp(`<(?:(?:[A-Za-z_][\\w.-]*):)?${safeName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:(?:[A-Za-z_][\\w.-]*):)?${safeName}\\s*>`, 'g');
  const out: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml)) !== null) {
    out.push(match[1]);
    if (out.length > FOREIGN_XML_SECURITY_HARD_CAPS.maxElements) throw new Error('XML element count exceeds limit');
  }
  return out;
}

export function extractTextNodes(xml: string, localName = 't'): string[] {
  return extractElementFragments(xml, localName).map(stripXmlTags);
}

export function readAttribute(tag: string, localName: string): string | null {
  const safeName = localName.replace(/[^A-Za-z0-9_-]/g, '');
  if (safeName !== localName) return null;
  const pattern = new RegExp(`(?:^|\\s)(?:(?:[A-Za-z_][\\w.-]*):)?${safeName}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`);
  const match = tag.match(pattern);
  return match ? decodeXmlEntities(match[1] ?? match[2] ?? '') : null;
}

export function extractStartTags(xml: string, localName: string): string[] {
  const safeName = localName.replace(/[^A-Za-z0-9_-]/g, '');
  if (safeName !== localName) throw new Error('Invalid XML local name');
  const pattern = new RegExp(`<(?:(?:[A-Za-z_][\\w.-]*):)?${safeName}(?:\\s[^>]*)?\\s*/?>`, 'g');
  const matches = xml.match(pattern) ?? [];
  if (matches.length > FOREIGN_XML_SECURITY_HARD_CAPS.maxElements) throw new Error('XML element count exceeds limit');
  return matches;
}

export interface BoundedXmlInspectionOptions {
  maxBytes?: number;
  maxDepth?: number;
  maxElements?: number;
}

export const FOREIGN_XML_SECURITY_HARD_CAPS = Object.freeze({
  maxBytes: 64 * 1024 * 1024,
  maxDepth: 96,
  maxElements: 10_000,
});

interface ResolvedXmlInspectionOptions {
  maxBytes: number;
  maxDepth: number;
  maxElements: number;
}

function resolveXmlInspectionOptions(options: BoundedXmlInspectionOptions): ResolvedXmlInspectionOptions {
  const resolved: ResolvedXmlInspectionOptions = {
    maxBytes: options.maxBytes ?? FOREIGN_XML_SECURITY_HARD_CAPS.maxBytes,
    maxDepth: options.maxDepth ?? FOREIGN_XML_SECURITY_HARD_CAPS.maxDepth,
    maxElements: options.maxElements ?? FOREIGN_XML_SECURITY_HARD_CAPS.maxElements,
  };
  for (const [name, value] of Object.entries(resolved)) {
    if (!Number.isFinite(value) || value <= 0 || !Number.isInteger(value)) {
      throw new Error(`Foreign XML ${name} must be a positive integer`);
    }
  }
  if (
    resolved.maxBytes > FOREIGN_XML_SECURITY_HARD_CAPS.maxBytes
    || resolved.maxDepth > FOREIGN_XML_SECURITY_HARD_CAPS.maxDepth
    || resolved.maxElements > FOREIGN_XML_SECURITY_HARD_CAPS.maxElements
  ) {
    throw new Error('Foreign XML policy exceeds immutable security hard caps');
  }
  return resolved;
}

function assertNoCustomEntityReferences(xml: string): void {
  const namedEntity = /&([A-Za-z_][\w.:-]*);/gu;
  const predefined = new Set(['lt', 'gt', 'amp', 'quot', 'apos']);
  let match: RegExpExecArray | null;
  while ((match = namedEntity.exec(xml)) !== null) {
    if (!predefined.has(match[1])) throw new Error('Foreign XML custom entity reference rejected');
  }
  if (/%[A-Za-z_][\w.:-]*;/u.test(xml)) throw new Error('Foreign XML parameter entity reference rejected');
}

/**
 * Security preflight for every foreign XML boundary.
 *
 * The parser never resolves a DTD/entity: declarations and non-predefined named
 * entity references are rejected before any DOM or semantic parser sees them.
 * Element/depth limits are immutable hard caps so callers cannot relax the
 * billion-laughs/expansion boundary above 10,000 nodes.
 */
export function inspectBoundedForeignXml(xml: string, options: BoundedXmlInspectionOptions = {}): void {
  const resolved = resolveXmlInspectionOptions(options);
  if (new TextEncoder().encode(xml).byteLength > resolved.maxBytes) throw new Error('Foreign XML exceeds byte limit');
  const securitySurface = xml
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/gu, '')
    .replace(/<!--[\s\S]*?-->/gu, '');
  if (/<\s*!\s*(?:DOCTYPE|ENTITY)\b/iu.test(securitySurface)) throw new Error('Foreign XML DTD/entity declaration rejected');
  assertNoCustomEntityReferences(securitySurface);

  const token = /<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<\/([A-Za-z_][\w.:-]*)\s*>|<([A-Za-z_][\w.:-]*)(?:\s[^<>]*?)?\s*(\/?)>/gu;
  const stack: string[] = [];
  let elements = 0;
  let match: RegExpExecArray | null;
  while ((match = token.exec(xml)) !== null) {
    if (match[1]) {
      const expected = stack.pop();
      if (expected === undefined || expected !== match[1]) throw new Error('Foreign XML closing tag mismatch');
      continue;
    }
    if (!match[2]) continue;
    elements += 1;
    if (elements > resolved.maxElements) throw new Error('Foreign XML element limit exceeded');
    if (match[3] !== '/') {
      stack.push(match[2]);
      if (stack.length > resolved.maxDepth) throw new Error('Foreign XML depth limit exceeded');
    }
  }
  if (stack.length !== 0) throw new Error('Foreign XML is structurally unbalanced');
}

