// STATUS: PLATIN — bounded, inert XML parsing for the supported Visio subset.
import { decodeXmlEntities } from '../../interoperability/xml';

export const MAX_VISIO_XML_BYTES = 24 * 1024 * 1024;
export const VDX_NAMESPACE_URI = 'http://schemas.microsoft.com/visio/2003/core';
const MAX_VISIO_XML_ELEMENTS = 350_000;
const MAX_VISIO_XML_DEPTH = 96;
const MAX_ATTRIBUTES_PER_ELEMENT = 256;

export class VisioXmlParseError extends Error {
  constructor(readonly code: string) {
    super(`Visio XML rejected: ${code}`);
    this.name = 'VisioXmlParseError';
  }
}

export interface VisioXmlElement {
  readonly name: string;
  readonly localName: string;
  readonly namespaceUri: string;
  readonly attributes: ReadonlyMap<string, string>;
  readonly content: Array<string | VisioXmlElement>;
}

interface MutableVisioXmlElement extends VisioXmlElement {
  readonly attributes: Map<string, string>;
}

function isXmlCharacter(codePoint: number): boolean {
  return codePoint === 0x9 || codePoint === 0xa || codePoint === 0xd
    || (codePoint >= 0x20 && codePoint <= 0xd7ff)
    || (codePoint >= 0xe000 && codePoint <= 0xfffd)
    || (codePoint >= 0x10000 && codePoint <= 0x10ffff);
}

function decodeXmlValue(value: string): string {
  const referencePattern = /&([^;]*);/gu;
  let match: RegExpExecArray | null;
  while ((match = referencePattern.exec(value)) !== null) {
    const token = match[1];
    if (token === undefined) throw new VisioXmlParseError('entity-invalid');
    if (/^(?:lt|gt|amp|quot|apos)$/u.test(token)) continue;
    const numeric = token.match(/^#(?:x([\da-f]{1,6})|(\d{1,7}))$/iu);
    if (!numeric) throw new VisioXmlParseError('entity-unsupported');
    const codePoint = numeric[1] !== undefined
      ? Number.parseInt(numeric[1], 16)
      : Number.parseInt(numeric[2] ?? '', 10);
    if (!Number.isInteger(codePoint) || !isXmlCharacter(codePoint)) throw new VisioXmlParseError('character-invalid');
  }
  if (/&(?![A-Za-z_][\w.:-]*;|#(?:x[\da-f]{1,6}|\d{1,7});)/iu.test(value)) {
    throw new VisioXmlParseError('entity-invalid');
  }
  const decoded = decodeXmlEntities(value);
  for (const character of decoded) {
    if (!isXmlCharacter(character.codePointAt(0) ?? -1)) throw new VisioXmlParseError('character-invalid');
  }
  return decoded;
}

function isNameStart(character: string | undefined): boolean {
  return character !== undefined && /[A-Za-z_:]/u.test(character);
}

function isNamePart(character: string | undefined): boolean {
  return character !== undefined && /[A-Za-z0-9_.:-]/u.test(character);
}

function qualifiedName(name: string): { localName: string; prefix: string | undefined } {
  const parts = name.split(':');
  if (parts.length > 2 || parts.some((part) => part.length === 0)) throw new VisioXmlParseError('name-invalid');
  if (!isNameStart(parts[0]?.[0])) throw new VisioXmlParseError('name-invalid');
  for (const part of parts) {
    if (!isNameStart(part[0])) throw new VisioXmlParseError('name-invalid');
    for (let index = 1; index < part.length; index += 1) if (!isNamePart(part[index])) throw new VisioXmlParseError('name-invalid');
  }
  return { localName: parts.at(-1) ?? name, prefix: parts.length === 2 ? parts[0] : undefined };
}

function skipWhitespace(source: string, position: number): number {
  let cursor = position;
  while (cursor < source.length && /\s/u.test(source[cursor] ?? '')) cursor += 1;
  return cursor;
}

function findTagEnd(source: string, start: number): number {
  let quote: '"' | "'" | undefined;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (quote !== undefined) {
      if (character === quote) quote = undefined;
      else if (character === '<') throw new VisioXmlParseError('attribute-invalid');
    } else if (character === '"' || character === "'") quote = character;
    else if (character === '<') throw new VisioXmlParseError('tag-invalid');
    else if (character === '>') return index;
  }
  throw new VisioXmlParseError('tag-unclosed');
}

function parseStartTag(
  source: string,
  start: number,
  end: number,
  inheritedNamespaces: ReadonlyMap<string, string>,
): { node: MutableVisioXmlElement; selfClosing: boolean; namespaces: Map<string, string> } {
  let cursor = start + 1;
  if (!isNameStart(source[cursor])) throw new VisioXmlParseError('name-invalid');
  const nameStart = cursor;
  while (isNamePart(source[cursor])) cursor += 1;
  const name = source.slice(nameStart, cursor);
  const parsedName = qualifiedName(name);
  const attributes = new Map<string, string>();
  let selfClosing = false;

  while (cursor < end) {
    cursor = skipWhitespace(source, cursor);
    if (cursor === end) break;
    if (source[cursor] === '/') {
      if (cursor + 1 !== end) throw new VisioXmlParseError('tag-invalid');
      selfClosing = true;
      cursor += 1;
      break;
    }
    if (attributes.size >= MAX_ATTRIBUTES_PER_ELEMENT || !isNameStart(source[cursor])) {
      throw new VisioXmlParseError('attribute-limit-or-name-invalid');
    }
    const attributeStart = cursor;
    while (isNamePart(source[cursor])) cursor += 1;
    const attributeName = source.slice(attributeStart, cursor);
    qualifiedName(attributeName);
    cursor = skipWhitespace(source, cursor);
    if (source[cursor] !== '=') throw new VisioXmlParseError('attribute-value-missing');
    cursor = skipWhitespace(source, cursor + 1);
    const quote = source[cursor];
    if (quote !== '"' && quote !== "'") throw new VisioXmlParseError('attribute-quote-missing');
    cursor += 1;
    const valueStart = cursor;
    while (cursor < end && source[cursor] !== quote) {
      if (source[cursor] === '<') throw new VisioXmlParseError('attribute-invalid');
      cursor += 1;
    }
    if (cursor >= end) throw new VisioXmlParseError('attribute-unclosed');
    if (attributes.has(attributeName)) throw new VisioXmlParseError('attribute-duplicate');
    attributes.set(attributeName, decodeXmlValue(source.slice(valueStart, cursor)));
    cursor += 1;
  }

  const namespaces = new Map(inheritedNamespaces);
  namespaces.set('xml', 'http://www.w3.org/XML/1998/namespace');
  for (const [attributeName, value] of attributes) {
    if (attributeName === 'xmlns') {
      if (value === 'http://www.w3.org/2000/xmlns/' || value === 'http://www.w3.org/XML/1998/namespace') {
        throw new VisioXmlParseError('namespace-invalid');
      }
      namespaces.set('', value);
    } else if (attributeName.startsWith('xmlns:')) {
      const prefix = attributeName.slice('xmlns:'.length);
      if (!prefix || prefix === 'xmlns' || (prefix === 'xml' && value !== 'http://www.w3.org/XML/1998/namespace')
        || (prefix !== 'xml' && value.length === 0)
        || value === 'http://www.w3.org/2000/xmlns/'
        || (value === 'http://www.w3.org/XML/1998/namespace' && prefix !== 'xml')) {
        throw new VisioXmlParseError('namespace-invalid');
      }
      namespaces.set(prefix, value);
    }
  }

  const namespaceUri = parsedName.prefix === undefined ? (namespaces.get('') ?? '') : namespaces.get(parsedName.prefix);
  if (namespaceUri === undefined) throw new VisioXmlParseError('namespace-prefix-unbound');
  for (const [attributeName] of attributes) {
    if (attributeName === 'xmlns' || attributeName.startsWith('xmlns:')) continue;
    const parsedAttribute = qualifiedName(attributeName);
    if (parsedAttribute.prefix !== undefined && !namespaces.has(parsedAttribute.prefix)) {
      throw new VisioXmlParseError('namespace-prefix-unbound');
    }
  }

  return {
    node: { name, localName: parsedName.localName, namespaceUri, attributes, content: [] },
    selfClosing,
    namespaces,
  };
}

function appendText(stack: MutableVisioXmlElement[], text: string, outsideRoot: boolean): void {
  if (stack.length === 0) {
    if (outsideRoot && text.trim().length > 0) throw new VisioXmlParseError('text-outside-root');
    return;
  }
  const parent = stack.at(-1);
  if (!parent) throw new VisioXmlParseError('structure-invalid');
  parent.content.push(decodeXmlValue(text));
}

export function parseVisioXml(source: string): VisioXmlElement {
  if (typeof source !== 'string') throw new VisioXmlParseError('input-invalid');
  if (new TextEncoder().encode(source).byteLength > MAX_VISIO_XML_BYTES) throw new VisioXmlParseError('byte-limit');

  let position = source.charCodeAt(0) === 0xfeff ? 1 : 0;
  if (/^<\?xml\s/u.test(source.slice(position))) {
    const declarationEnd = source.indexOf('?>', position + 5);
    if (declarationEnd < 0 || declarationEnd - position > 256) throw new VisioXmlParseError('xml-declaration-invalid');
    const declaration = source.slice(position + 2, declarationEnd);
    if (!/^xml\s+version=(['"])1\.0\1(?:\s+encoding=(['"])UTF-8\2)?(?:\s+standalone=(['"])(?:yes|no)\3)?\s*$/iu.test(declaration)) {
      throw new VisioXmlParseError('xml-declaration-unsupported');
    }
    position = declarationEnd + 2;
  }
  let elementCount = 0;
  let root: MutableVisioXmlElement | undefined;
  const stack: MutableVisioXmlElement[] = [];
  const namespaceStack: Map<string, string>[] = [];
  const rootNamespaces = new Map<string, string>([['xml', 'http://www.w3.org/XML/1998/namespace']]);

  while (position < source.length) {
    if (source[position] !== '<') {
      const nextTag = source.indexOf('<', position);
      const textEnd = nextTag < 0 ? source.length : nextTag;
      appendText(stack, source.slice(position, textEnd), root === undefined || stack.length === 0);
      position = textEnd;
      continue;
    }

    if (source.startsWith('<!--', position)) {
      const end = source.indexOf('-->', position + 4);
      if (end < 0 || source.slice(position + 4, end).includes('--')) throw new VisioXmlParseError('comment-invalid');
      for (const character of source.slice(position + 4, end)) {
        if (!isXmlCharacter(character.codePointAt(0) ?? -1)) throw new VisioXmlParseError('character-invalid');
      }
      position = end + 3;
      continue;
    }
    if (source.startsWith('<![CDATA[', position)) {
      if (stack.length === 0) throw new VisioXmlParseError('cdata-outside-root');
      const end = source.indexOf(']]>', position + 9);
      if (end < 0) throw new VisioXmlParseError('cdata-unclosed');
      const parent = stack.at(-1);
      if (!parent) throw new VisioXmlParseError('structure-invalid');
      const content = source.slice(position + 9, end);
      for (const character of content) if (!isXmlCharacter(character.codePointAt(0) ?? -1)) throw new VisioXmlParseError('character-invalid');
      parent.content.push(content);
      position = end + 3;
      continue;
    }
    if (source.startsWith('<?', position)) {
      const end = source.indexOf('?>', position + 2);
      if (end < 0 || end - position > 1024) throw new VisioXmlParseError('processing-instruction-invalid');
      const instruction = source.slice(position + 2, end);
      const target = /^([A-Za-z_:][A-Za-z0-9_.:-]*)/u.exec(instruction)?.[1];
      if (!target || target.toLowerCase() === 'xml') throw new VisioXmlParseError('processing-instruction-invalid');
      for (const character of instruction) {
        if (!isXmlCharacter(character.codePointAt(0) ?? -1)) throw new VisioXmlParseError('character-invalid');
      }
      position = end + 2;
      continue;
    }
    if (source.startsWith('<!', position)) throw new VisioXmlParseError('declaration-unsupported');
    if (source.startsWith('</', position)) {
      const end = findTagEnd(source, position + 2);
      const name = source.slice(position + 2, end).trim();
      qualifiedName(name);
      const open = stack.pop();
      if (!open || open.name !== name) throw new VisioXmlParseError('closing-tag-mismatch');
      namespaceStack.pop();
      position = end + 1;
      continue;
    }

    const end = findTagEnd(source, position + 1);
    const inheritedNamespaces = namespaceStack.at(-1) ?? rootNamespaces;
    const { node, selfClosing, namespaces } = parseStartTag(source, position, end, inheritedNamespaces);
    elementCount += 1;
    if (elementCount > MAX_VISIO_XML_ELEMENTS) throw new VisioXmlParseError('element-limit');
    if (stack.length >= MAX_VISIO_XML_DEPTH) throw new VisioXmlParseError('depth-limit');
    const parent = stack.at(-1);
    if (parent) parent.content.push(node);
    else if (root === undefined) root = node;
    else throw new VisioXmlParseError('multiple-roots');
    if (!selfClosing) {
      stack.push(node);
      namespaceStack.push(namespaces);
    }
    position = end + 1;
  }

  if (stack.length !== 0 || root === undefined) throw new VisioXmlParseError('document-incomplete');
  if (root.localName !== 'VisioDocument') throw new VisioXmlParseError('root-not-visio-document');
  if (root.namespaceUri !== VDX_NAMESPACE_URI) throw new VisioXmlParseError('namespace-unsupported');
  return root;
}
