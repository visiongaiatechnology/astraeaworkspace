// STATUS: PLATIN — strict, bounded validation for OPC and ODF package graphs.
import { decodeXmlEntities, inspectBoundedForeignXml } from '../../shared/interoperability/xml';
import { decodeUtf8 } from './zip';

const CONTENT_TYPES_NS = 'http://schemas.openxmlformats.org/package/2006/content-types';
const PACKAGE_RELATIONSHIPS_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const ODF_MANIFEST_NS = 'urn:oasis:names:tc:opendocument:xmlns:manifest:1.0';
const MAX_GRAPH_XML_BYTES = 4 * 1024 * 1024;
const XML_TOKEN = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<\/[A-Za-z_][\w.:-]*\s*>|<[A-Za-z_][\w.:-]*(?:\s[^<>]*?)?\s*\/?>/gu;
const XML_NAME = /^[A-Za-z_][\w.-]*(?::[A-Za-z_][\w.-]*)?$/u;
const XML_ATTRIBUTE = /^([A-Za-z_][\w.:-]*)\s*=\s*("(?:[^"<&]|&(?:lt|gt|amp|quot|apos|#\d+|#x[0-9a-fA-F]+);)*"|'(?:[^'&<]|&(?:lt|gt|amp|quot|apos|#\d+|#x[0-9a-fA-F]+);)*')/u;

interface GraphXmlElement {
  readonly name: string;
  readonly localName: string;
  readonly depth: number;
  readonly namespace: string;
  readonly attributes: ReadonlyMap<string, string>;
  readonly attributeNamespaces: ReadonlyMap<string, string>;
}

interface ElementFrame {
  readonly name: string;
  readonly namespaces: ReadonlyMap<string, string>;
}

interface ParsedGraphXml {
  readonly elements: readonly GraphXmlElement[];
  readonly root: GraphXmlElement;
}

function localName(name: string): string {
  const colon = name.indexOf(':');
  return colon < 0 ? name : name.slice(colon + 1);
}

function parseStartTag(token: string): { name: string; attributes: Map<string, string>; selfClosing: boolean } {
  const body = token.slice(1, -1);
  const selfClosing = /\/\s*$/u.test(body);
  const content = selfClosing ? body.replace(/\/\s*$/u, '') : body;
  const nameMatch = /^([A-Za-z_][\w.:-]*)/u.exec(content);
  if (!nameMatch || !XML_NAME.test(nameMatch[1])) throw new Error('Office package graph contains an invalid XML name.');
  let rest = content.slice(nameMatch[0].length);
  const attributes = new Map<string, string>();
  while (rest.length > 0) {
    const whitespace = /^\s+/u.exec(rest);
    if (!whitespace) throw new Error('Office package graph contains malformed XML attributes.');
    rest = rest.slice(whitespace[0].length);
    if (!rest) break;
    const match = XML_ATTRIBUTE.exec(rest);
    if (!match) throw new Error('Office package graph contains malformed XML attributes.');
    const attributeName = match[1];
    if (!XML_NAME.test(attributeName) || attributes.has(attributeName)) {
      throw new Error('Office package graph contains duplicate or invalid XML attributes.');
    }
    const rawValue = match[2].slice(1, -1);
    if (/&(?!lt;|gt;|amp;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/u.test(rawValue)) {
      throw new Error('Office package graph contains an invalid XML entity reference.');
    }
    attributes.set(attributeName, decodeXmlEntities(rawValue));
    rest = rest.slice(match[0].length);
  }
  return { name: nameMatch[1], attributes, selfClosing };
}

function namespaceFor(name: string, namespaces: ReadonlyMap<string, string>): string {
  const colon = name.indexOf(':');
  const prefix = colon < 0 ? '' : name.slice(0, colon);
  return namespaces.get(prefix) ?? '';
}

function parseGraphXml(bytes: Uint8Array, label: string, expectedRoot: string, expectedNamespace: string): ParsedGraphXml {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_GRAPH_XML_BYTES) {
    throw new Error(`${label} exceeds the package graph XML size boundary.`);
  }
  const xml = decodeUtf8(bytes);
  inspectBoundedForeignXml(xml, { maxBytes: MAX_GRAPH_XML_BYTES });

  const stack: ElementFrame[] = [];
  const elements: GraphXmlElement[] = [];
  let offset = 0;
  let root: GraphXmlElement | null = null;
  let rootCount = 0;
  let match: RegExpExecArray | null;
  XML_TOKEN.lastIndex = 0;
  while ((match = XML_TOKEN.exec(xml)) !== null) {
    const text = xml.slice(offset, match.index);
    if (text.includes('<') || text.includes(']]>')) throw new Error(`${label} is not well-formed XML.`);
    const token = match[0];
    offset = match.index + token.length;
    if (token.startsWith('<!--') || token.startsWith('<?')) continue;
    if (token.startsWith('<![CDATA[')) {
      if (stack.length === 0) throw new Error(`${label} has CDATA outside its root element.`);
      continue;
    }
    if (token.startsWith('</')) {
      const close = /^<\/([A-Za-z_][\w.:-]*)\s*>$/u.exec(token);
      const frame = stack.pop();
      if (!close || !frame || frame.name !== close[1]) throw new Error(`${label} has mismatched XML elements.`);
      continue;
    }

    const parsed = parseStartTag(token);
    const depth = stack.length;
    const namespaces = new Map(stack.at(-1)?.namespaces ?? []);
    for (const [name, value] of parsed.attributes) {
      if (name === 'xmlns') namespaces.set('', value);
      else if (name.startsWith('xmlns:')) namespaces.set(name.slice(6), value);
    }
    const namespace = namespaceFor(parsed.name, namespaces);
    if (parsed.name.includes(':') && !namespace) throw new Error(`${label} uses an undeclared XML namespace prefix.`);
    for (const name of parsed.attributes.keys()) {
      if (name.includes(':') && !name.startsWith('xmlns:') && !name.startsWith('xml:') && !namespaceFor(name, namespaces)) {
        throw new Error(`${label} uses an undeclared XML attribute namespace prefix.`);
      }
    }
    if (depth === 0) {
      rootCount += 1;
      if (rootCount !== 1 || localName(parsed.name) !== expectedRoot || namespace !== expectedNamespace) {
        throw new Error(`${label} has an unexpected XML root element.`);
      }
    }
    const element: GraphXmlElement = {
      name: parsed.name,
      localName: localName(parsed.name),
      depth,
      namespace,
      attributes: parsed.attributes,
      attributeNamespaces: new Map([...parsed.attributes.keys()].map((name) => {
        if (name === 'xmlns' || name.startsWith('xmlns:')) return [name, 'http://www.w3.org/2000/xmlns/'] as const;
        const colon = name.indexOf(':');
        if (colon < 0) return [name, ''] as const;
        const prefix = name.slice(0, colon);
        return [name, prefix === 'xml' ? 'http://www.w3.org/XML/1998/namespace' : (namespaces.get(prefix) ?? '')] as const;
      })),
    };
    elements.push(element);
    if (elements.length > 10_000) throw new Error(`${label} exceeds the package graph element limit.`);
    if (depth === 0) root = element;
    if (!parsed.selfClosing) stack.push({ name: parsed.name, namespaces });
  }
  const trailing = xml.slice(offset);
  if (trailing.includes('<') || trailing.includes(']]>') || stack.length !== 0 || rootCount !== 1 || !root) {
    throw new Error(`${label} is not well-formed XML.`);
  }
  return { elements, root };
}

function requiredAttribute(element: GraphXmlElement, name: string, label: string): string {
  const value = element.attributes.get(name);
  if (!value || value.trim() !== value || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new Error(`${label} has a missing or invalid ${name} attribute.`);
  }
  return value;
}

function requiredOdfAttribute(element: GraphXmlElement, name: string, allowEmpty: boolean): string {
  const matches = [...element.attributes]
    .filter(([attributeName]) => localName(attributeName) === name && element.attributeNamespaces.get(attributeName) === ODF_MANIFEST_NS)
    .map(([, value]) => value);
  if (matches.length !== 1 || (!allowEmpty && !matches[0]) || /[\u0000-\u001f\u007f]/u.test(matches[0] ?? '')) {
    throw new Error(`ODF manifest has a missing, duplicate, or invalid ${name} attribute.`);
  }
  return matches[0];
}

function decodeUriSegment(segment: string, label: string): string {
  if (/%(?:2f|5c)/iu.test(segment)) throw new Error(`${label} contains an encoded path separator.`);
  let decoded: string;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    throw new Error(`${label} contains invalid percent encoding.`);
  }
  if (!decoded || decoded === '.' || decoded === '..' || decoded.includes('/') || decoded.includes('\\') || /[\u0000-\u001f\u007f:]/u.test(decoded)) {
    throw new Error(`${label} contains a non-canonical package path segment.`);
  }
  return decoded;
}

function canonicalContentTypePart(partName: string): string {
  if (!partName.startsWith('/') || partName.startsWith('//') || partName.includes('\\') || /[?#\u0000-\u001f\u007f]/u.test(partName)) {
    throw new Error('Office package content type has a non-canonical PartName.');
  }
  const parts = partName.slice(1).split('/');
  if (parts.length === 0 || parts.some((part) => !part)) throw new Error('Office package content type has an empty PartName segment.');
  return parts.map((part) => decodeUriSegment(part, 'Office package content type PartName')).join('/');
}

function validateContentTypes(entries: ReadonlyMap<string, Uint8Array>, expectedMainPart: string, expectedMainContentType: string): void {
  const bytes = entries.get('[Content_Types].xml');
  if (!bytes) throw new Error('Office package is missing [Content_Types].xml.');
  const document = parseGraphXml(bytes, '[Content_Types].xml', 'Types', CONTENT_TYPES_NS);
  const overrides = new Map<string, string>();
  const defaults = new Set<string>();
  for (const element of document.elements) {
    if (element.depth !== 1) continue;
    if (element.namespace !== CONTENT_TYPES_NS) throw new Error('[Content_Types].xml contains an element outside the content-types namespace.');
    if (element.localName === 'Default') {
      const extension = requiredAttribute(element, 'Extension', '[Content_Types].xml').toLowerCase();
      requiredAttribute(element, 'ContentType', '[Content_Types].xml');
      if (!/^[a-z0-9][a-z0-9._-]{0,63}$/u.test(extension) || defaults.has(extension)) {
        throw new Error('[Content_Types].xml contains an invalid or duplicate Default extension.');
      }
      defaults.add(extension);
      continue;
    }
    if (element.localName !== 'Override') throw new Error('[Content_Types].xml contains an unsupported direct child.');
    const path = canonicalContentTypePart(requiredAttribute(element, 'PartName', '[Content_Types].xml'));
    const contentType = requiredAttribute(element, 'ContentType', '[Content_Types].xml');
    if (!/^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/u.test(contentType)) {
      throw new Error('[Content_Types].xml contains an invalid ContentType value.');
    }
    const key = path.toLowerCase();
    if (overrides.has(key) || !entries.has(path)) throw new Error('[Content_Types].xml contains a duplicate or missing PartName target.');
    overrides.set(key, contentType);
  }
  if (overrides.get(expectedMainPart.toLowerCase()) !== expectedMainContentType) {
    throw new Error('[Content_Types].xml does not declare the required Office document part.');
  }
}

function resolveInternalTarget(sourcePart: string, target: string, entries: ReadonlyMap<string, Uint8Array>): string {
  if (!target || target.includes('\\') || /[\u0000-\u001f\u007f?]/u.test(target)) {
    throw new Error('Office relationship has an invalid internal Target.');
  }
  const withoutFragment = target.split('#', 1)[0];
  if (!withoutFragment) throw new Error('Office relationship has an empty internal Target.');
  const absolute = withoutFragment.startsWith('/');
  if (withoutFragment.startsWith('//')) throw new Error('Office relationship Target escapes the package root.');
  const stack = absolute ? [] : sourcePart.split('/').slice(0, -1);
  const segments = withoutFragment.slice(absolute ? 1 : 0).split('/');
  for (const segment of segments) {
    if (!segment) throw new Error('Office relationship Target has an empty path segment.');
    if (segment === '.') continue;
    if (segment === '..') {
      if (stack.length === 0) throw new Error('Office relationship Target escapes the package root.');
      stack.pop();
      continue;
    }
    stack.push(decodeUriSegment(segment, 'Office relationship Target'));
  }
  const resolved = stack.join('/');
  if (!resolved || !entries.has(resolved)) throw new Error('Office relationship Target does not resolve to a package part.');
  return resolved;
}

function relationshipSourcePart(path: string): string {
  if (path === '_rels/.rels') return '';
  const marker = path.lastIndexOf('/_rels/');
  if (marker < 0 || !path.endsWith('.rels')) throw new Error('Office relationship part has a non-canonical path.');
  const directory = path.slice(0, marker);
  const sourceName = path.slice(marker + '/_rels/'.length, -'.rels'.length);
  if (!sourceName || sourceName.includes('/')) throw new Error('Office relationship part has a non-canonical source path.');
  return directory ? `${directory}/${sourceName}` : sourceName;
}

interface ParsedRelationship {
  readonly id: string;
  readonly type: string;
  readonly target: string;
  readonly targetMode: string | null;
  readonly resolvedTarget: string | null;
}

function parseRelationshipPart(path: string, bytes: Uint8Array, entries: ReadonlyMap<string, Uint8Array>): ParsedRelationship[] {
  const document = parseGraphXml(bytes, path, 'Relationships', PACKAGE_RELATIONSHIPS_NS);
  const sourcePart = relationshipSourcePart(path);
  if (sourcePart && !entries.has(sourcePart)) throw new Error('Office relationship source part is missing.');
  const seenIds = new Set<string>();
  const relationships: ParsedRelationship[] = [];
  for (const element of document.elements) {
    if (element.depth !== 1) continue;
    if (element.namespace !== PACKAGE_RELATIONSHIPS_NS || element.localName !== 'Relationship') {
      throw new Error(`${path} contains an unsupported relationship child.`);
    }
    const id = requiredAttribute(element, 'Id', path);
    const type = requiredAttribute(element, 'Type', path);
    const target = requiredAttribute(element, 'Target', path);
    const targetMode = element.attributes.get('TargetMode') ?? null;
    if (!/^[A-Za-z_][A-Za-z0-9_.-]{0,254}$/u.test(id) || seenIds.has(id)) {
      throw new Error(`${path} contains an invalid or duplicate relationship Id.`);
    }
    if (targetMode !== null && targetMode !== 'Internal' && targetMode !== 'External') {
      throw new Error(`${path} contains an invalid TargetMode.`);
    }
    seenIds.add(id);
    relationships.push({
      id,
      type,
      target,
      targetMode,
      resolvedTarget: targetMode === 'External' ? null : resolveInternalTarget(sourcePart, target, entries),
    });
  }
  return relationships;
}

export function validateOpcPackageGraph(
  entries: ReadonlyMap<string, Uint8Array>,
  expectedMainPart: string,
  expectedMainContentType: string,
): void {
  validateContentTypes(entries, expectedMainPart, expectedMainContentType);
  const rootRelationshipsBytes = entries.get('_rels/.rels');
  if (!rootRelationshipsBytes) throw new Error('Office package is missing its root relationships.');
  const rootRelationships = parseRelationshipPart('_rels/.rels', rootRelationshipsBytes, entries);
  const officeDocuments = rootRelationships.filter((relationship) => relationship.type.endsWith('/officeDocument'));
  if (officeDocuments.length !== 1 || officeDocuments[0].resolvedTarget !== expectedMainPart) {
    throw new Error('Office package root relationships do not identify its main document part.');
  }

  for (const [path, bytes] of entries) {
    if (path === '_rels/.rels' || /(?:^|\/)_rels\/[^/]+\.rels$/u.test(path)) {
      parseRelationshipPart(path, bytes, entries);
    }
  }
}

function canonicalOdfPath(path: string): string {
  if (!path || path.startsWith('/') || path.startsWith('//') || path.includes('\\') || /[?#\u0000-\u001f\u007f]/u.test(path)) {
    throw new Error('ODF manifest contains a non-canonical package path.');
  }
  const directory = path.endsWith('/');
  const segments = path.slice(0, directory ? -1 : undefined).split('/');
  if (!segments.length || segments.some((segment) => !segment)) throw new Error('ODF manifest contains an empty path segment.');
  const normalized = segments.map((segment) => decodeUriSegment(segment, 'ODF manifest full-path')).join('/');
  return directory ? `${normalized}/` : normalized;
}

export function validateOdfPackageManifest(entries: ReadonlyMap<string, Uint8Array>): void {
  const bytes = entries.get('META-INF/manifest.xml');
  if (!bytes) throw new Error('ODF package is missing META-INF/manifest.xml.');
  const document = parseGraphXml(bytes, 'META-INF/manifest.xml', 'manifest', ODF_MANIFEST_NS);
  const paths = new Set<string>();
  let hasContent = false;
  for (const element of document.elements) {
    if (element.depth !== 1) continue;
    if (element.namespace !== ODF_MANIFEST_NS || element.localName !== 'file-entry') {
      throw new Error('ODF manifest contains an unsupported direct child.');
    }
    const rawPath = requiredOdfAttribute(element, 'full-path', false);
    requiredOdfAttribute(element, 'media-type', true);
    if (rawPath === '/') {
      if (paths.has('/')) throw new Error('ODF manifest contains a duplicate package root entry.');
      paths.add('/');
      continue;
    }
    const path = canonicalOdfPath(rawPath);
    const key = path.toLowerCase();
    if (paths.has(key)) throw new Error('ODF manifest contains a duplicate full-path.');
    paths.add(key);
    if (path === 'content.xml') hasContent = true;
    const isDirectory = path.endsWith('/');
    if (!isDirectory && !entries.has(path)) throw new Error('ODF manifest references a missing package part.');
    if (isDirectory && ![...entries.keys()].some((entry) => entry.startsWith(path))) {
      throw new Error('ODF manifest references a missing package directory.');
    }
  }
  if (!hasContent || !entries.has('content.xml')) throw new Error('ODF manifest does not declare content.xml.');
}
