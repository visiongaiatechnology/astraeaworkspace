// STATUS: PLATIN — BATCH-CONNECT-3: allowlist HTML sanitiser for untrusted mail bodies.
//
// DESCRIPTOR (verified before writing, with the probe kept in `testing/connectHtmlSanitizer.test.ts`):
// the previous implementation in `domain/connectMailCore.ts:264` sanitizeHtmlMail removed tags with
// blacklist regexes over the raw text. Measured bypasses of that implementation:
//
//   '<svg/onload=alert(1)>'                    => kept verbatim (on-handler without whitespace)
//   '<a href="javas\tcript:alert(1)">'         => kept verbatim (tab inside the scheme)
//   '<a href="java&#115;cript:alert(1)">'      => kept verbatim (entity-encoded scheme)
//   '<math><mtext>…<style><img src=x onerror=…>' => on-handler survived inside the truncated tag
//
// A regex cannot decide HTML: `<svg/onload=…>` is a real, executing attribute. This module therefore
// tokenises and rebuilds the document from an allowlist. It returns a report next to the markup, so a
// test can assert that a dangerous construct was *removed* instead of merely reworded.

import type { ConnectPhishingIndicator } from '../../../platform/connectors/connectCoreTypes';

export interface ConnectHtmlSanitizeResult {
  /** The rebuilt, allowlisted markup. */
  readonly html: string;
  readonly removedTags: string[];
  readonly removedAttributes: string[];
  /** Remote references replaced by `#remote-content-blocked`. */
  readonly blockedRemoteContent: number;
  /** `true` when at least one dangerous construct was found and removed. */
  readonly hadDangerousContent: boolean;
}

export const CONNECT_HTML_LIMITS = {
  maxChars: 5_000_000,
  maxNodes: 200_000,
  maxAttributesPerNode: 64,
  maxAttributeChars: 8192,
  maxDepth: 128,
} as const;

/** Structural and text markup a mail body may use. No script-capable element, no SVG/MathML. */
const ALLOWED_TAGS: Readonly<Record<string, ReadonlySet<string>>> = {
  a: new Set(['href', 'title', 'name']),
  abbr: new Set(['title']),
  address: new Set([]),
  b: new Set([]),
  blockquote: new Set(['cite']),
  br: new Set([]),
  caption: new Set([]),
  cite: new Set([]),
  code: new Set([]),
  col: new Set(['span', 'width']),
  colgroup: new Set(['span']),
  dd: new Set([]),
  del: new Set(['datetime']),
  div: new Set(['align', 'dir', 'lang']),
  dl: new Set([]),
  dt: new Set([]),
  em: new Set([]),
  figcaption: new Set([]),
  figure: new Set([]),
  h1: new Set(['align']), h2: new Set(['align']), h3: new Set(['align']), h4: new Set(['align']), h5: new Set(['align']), h6: new Set(['align']),
  hr: new Set([]),
  i: new Set([]),
  img: new Set(['src', 'alt', 'title', 'width', 'height', 'align', 'border']),
  ins: new Set(['datetime']),
  kbd: new Set([]),
  li: new Set(['value']),
  ol: new Set(['start', 'type']),
  p: new Set(['align', 'dir', 'lang']),
  pre: new Set([]),
  q: new Set(['cite']),
  s: new Set([]),
  samp: new Set([]),
  small: new Set([]),
  span: new Set(['dir', 'lang']),
  strong: new Set([]),
  sub: new Set([]),
  sup: new Set([]),
  table: new Set(['border', 'cellpadding', 'cellspacing', 'width', 'align', 'summary']),
  tbody: new Set([]), thead: new Set([]), tfoot: new Set([]),
  td: new Set(['colspan', 'rowspan', 'align', 'valign', 'width', 'height']),
  th: new Set(['colspan', 'rowspan', 'align', 'valign', 'width', 'height', 'scope']),
  tr: new Set(['align', 'valign']),
  u: new Set([]),
  ul: new Set(['type']),
};

/** Tags whose *raw text content* must be dropped together with the tag. */
const RAW_TEXT_TAGS = new Set(['script', 'style', 'iframe', 'object', 'embed', 'form', 'base', 'meta', 'link', 'svg', 'math', 'template', 'noscript', 'frame', 'frameset', 'applet', 'plaintext', 'xmp', 'title', 'head']);

const VOID_TAGS = new Set(['br', 'hr', 'img', 'col', 'wbr', 'area', 'base', 'embed', 'input', 'link', 'meta', 'param', 'source', 'track']);

const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'cid:', 'vgt:']);
const ALIGN_VALUES = new Set(['left', 'right', 'center', 'justify', 'top', 'middle', 'bottom', 'baseline']);
const NUMERIC_ATTRIBUTES = new Set(['width', 'height', 'border', 'cellpadding', 'cellspacing', 'span', 'colspan', 'rowspan', 'start', 'value']);

const ENTITY = /&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z][a-z0-9]{1,31});/gi;
const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', tab: '\t', newline: '\n', colon: ':', sol: '/', period: '.', commat: '@', lpar: '(', rpar: ')',
};

/** Decode entities so `java&#115;cript:` is classified as the scheme it really is. */
export function decodeHtmlEntities(input: string): string {
  return input.replace(ENTITY, (match, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    if (body.startsWith('#')) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named ?? match;
  });
}

/**
 * Normalise a value for scheme inspection: decode entities, drop every character an HTML parser
 * ignores inside a URL (tab, newline, carriage return — the classic `javas\tcript:` bypass), then
 * strip all whitespace and control characters.
 */
export function normalizeForSchemeCheck(value: string): string {
  return decodeHtmlEntities(value)
    .replace(/[\u0000-\u0020\u007f-\u009f]/g, '')
    .toLowerCase();
}

/** Escape text for safe insertion into the rebuilt markup. */
export function escapeHtmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/'/g, '&#39;');
}

interface AttributeToken {
  readonly name: string;
  readonly value: string;
}

interface TagToken {
  readonly closing: boolean;
  readonly selfClosing: boolean;
  readonly name: string;
  readonly attributes: AttributeToken[];
  readonly raw: string;
}

/**
 * Read one tag starting at `index`. Handles quoted values, unquoted values, valueless attributes and
 * the `<name/attr=value>` form (which is why `onload` was missed by the old whitespace-based regex).
 */
function readTag(source: string, index: number): { token: TagToken; end: number } | null {
  if (source[index] !== '<') return null;
  let cursor = index + 1;
  let closing = false;
  if (source[cursor] === '/') {
    closing = true;
    cursor += 1;
  }
  else if (source[cursor] === '!' || source[cursor] === '?') return null;
  const nameMatch = /^[a-zA-Z][a-zA-Z0-9:-]*/.exec(source.slice(cursor));
  if (!nameMatch) return null;
  const name = nameMatch[0].toLowerCase();
  cursor += nameMatch[0].length;
  const attributes: AttributeToken[] = [];
  let selfClosing = false;
  let guard = 0;
  while (cursor < source.length && guard < CONNECT_HTML_LIMITS.maxAttributesPerNode + 4) {
    guard += 1;
    while (cursor < source.length && /[\s/]/.test(source[cursor])) {
      if (source[cursor] === '/') selfClosing = true;
      cursor += 1;
    }
    if (source[cursor] === '>') { cursor += 1; break; }
    if (cursor >= source.length) break;
    const attrMatch = /^[^\s/>=]+/.exec(source.slice(cursor));
    if (!attrMatch) { cursor += 1; continue; }
    const attrName = attrMatch[0].toLowerCase();
    cursor += attrMatch[0].length;
    while (cursor < source.length && /\s/.test(source[cursor])) cursor += 1;
    let value = '';
    if (source[cursor] === '=') {
      cursor += 1;
      while (cursor < source.length && /\s/.test(source[cursor])) cursor += 1;
      const quote = source[cursor];
      if (quote === '"' || quote === "'") {
        const end = source.indexOf(quote, cursor + 1);
        if (end === -1) { value = source.slice(cursor + 1); cursor = source.length; }
        else { value = source.slice(cursor + 1, end); cursor = end + 1; }
      } else {
        const bare = /^[^\s>]*/.exec(source.slice(cursor));
        value = bare ? bare[0] : '';
        cursor += value.length;
      }
    }
    if (value.length > CONNECT_HTML_LIMITS.maxAttributeChars) value = value.slice(0, CONNECT_HTML_LIMITS.maxAttributeChars);
    attributes.push({ name: attrName, value });
  }
  return { token: { closing, selfClosing, name, attributes, raw: source.slice(index, cursor) }, end: cursor };
}

/** Is this attribute value a URL/dangerous-value carrier? */
function needsUrlValidation(name: string): boolean {
  return name === 'href' || name === 'src' || name === 'cite' || name === 'background' || name === 'srcset' || name === 'data' || name === 'action' || name === 'formaction';
}

export type ConnectUrlVerdict = 'safe' | 'remote-blocked' | 'unsafe-scheme' | 'malformed';

/**
 * Classify a URL from a mail body. Anything that is not an explicit safe scheme is *unsafe*, which is
 * what makes `javascript:`, `vbscript:`, `data:text/html` and entity/tab-obfuscated variants fail
 * closed instead of relying on a blacklist being complete.
 */
export function classifyMailUrl(rawValue: string): { verdict: ConnectUrlVerdict; normalized: string; displayHost?: string } {
  const raw = rawValue.trim();
  if (raw.length === 0) return { verdict: 'safe', normalized: '' };
  const probe = normalizeForSchemeCheck(raw);
  if (probe.startsWith('#')) return { verdict: 'safe', normalized: raw };
  const schemeMatch = /^([a-z][a-z0-9+.-]*):/.exec(probe);
  if (schemeMatch) {
    const scheme = `${schemeMatch[1]}:`;
    if (!SAFE_PROTOCOLS.has(scheme)) return { verdict: 'unsafe-scheme', normalized: '' };
    if (scheme === 'cid:' || scheme === 'vgt:') return { verdict: 'safe', normalized: raw };
    // A colon inside the *authority* is a port, not a scheme; only http(s)/mailto keep a real one.
    try {
      const url = new URL(raw.startsWith('//') ? `https:${raw}` : raw);
      const remote = url.protocol === 'http:' || url.protocol === 'https:';
      if (remote) {
        const tracking = /(?:^|[?&#/_-])(?:utm_[^=&#]*|pixel|track(?:ing)?|beacon)(?:[=&#/_-]|$)/i.test(url.href);
        return { verdict: tracking ? 'remote-blocked' : 'safe', normalized: url.toString(), displayHost: url.hostname.toLowerCase() };
      }
      return { verdict: 'safe', normalized: url.toString() };
    } catch {
      return { verdict: 'malformed', normalized: '' };
    }
  }
  if (probe.startsWith('//')) {
    // Protocol-relative: a remote reference, which the default policy blocks.
    const host = probe.slice(2).split(/[/?#]/)[0];
    return { verdict: 'remote-blocked', normalized: '', displayHost: host };
  }
  // Relative URL: stays inside the message, accepted as-is.
  return { verdict: 'safe', normalized: raw };
}

export interface ConnectHtmlSanitizeOptions {
  /** `false` (default) rewrites every remote reference to `#remote-content-blocked`. */
  readonly allowRemote?: boolean;
  /** Maximum accepted input length; larger input is rejected, never truncated silently. */
  readonly maxChars?: number;
  /** Extra phishing indicators discovered while parsing (remote references, non-HTTPS links). */
  readonly collectIndicators?: boolean;
}

export interface ConnectHtmlSanitizeOutcome extends ConnectHtmlSanitizeResult {
  readonly indicators: ConnectPhishingIndicator[];
}

export class ConnectHtmlError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'ConnectHtmlError';
  }
}

/**
 * Rebuild an untrusted HTML mail body from the allowlist. Throws `html-size` instead of truncating,
 * because a silently shortened mail is a wrong mail.
 */
export function sanitizeMailHtmlDetailed(input: string, options: ConnectHtmlSanitizeOptions = {}): ConnectHtmlSanitizeOutcome {
  const maxChars = options.maxChars ?? CONNECT_HTML_LIMITS.maxChars;
  if (input.length > maxChars) throw new ConnectHtmlError('html-size');
  const allowRemote = options.allowRemote === true;
  const removedTags: string[] = [];
  const removedAttributes: string[] = [];
  const indicators: ConnectPhishingIndicator[] = [];

  const out: string[] = [];
  const openStack: string[] = [];
  let blockedRemoteContent = 0;
  let hadDangerousContent = false;
  let nodes = 0;
  let cursor = 0;

  const noteRemovedTag = (name: string): void => {
    if (!removedTags.includes(name)) removedTags.push(name);
  };
  const noteRemovedAttribute = (name: string): void => {
    const key = name.startsWith('on') ? 'on*' : name;
    if (!removedAttributes.includes(key)) removedAttributes.push(key);
  };

  while (cursor < input.length) {
    nodes += 1;
    if (nodes > CONNECT_HTML_LIMITS.maxNodes) throw new ConnectHtmlError('html-node-limit');
    const next = input.indexOf('<', cursor);
    if (next === -1) {
      out.push(escapeHtmlText(input.slice(cursor)));
      break;
    }
    out.push(escapeHtmlText(input.slice(cursor, next)));

    // Comments, CDATA and doctypes are dropped entirely.
    if (input.startsWith('<!--', next)) {
      const end = input.indexOf('-->', next + 4);
      cursor = end === -1 ? input.length : end + 3;
      hadDangerousContent = hadDangerousContent || /<script|on\w+\s*=/i.test(input.slice(next, cursor));
      continue;
    }
    if (/^<[!?]/.test(input.slice(next, next + 2))) {
      const end = input.indexOf('>', next);
      cursor = end === -1 ? input.length : end + 1;
      noteRemovedTag('declaration');
      continue;
    }

    const read = readTag(input, next);
    if (!read) {
      // A bare `<` in text is literal content.
      out.push('&lt;');
      cursor = next + 1;
      continue;
    }
    const { token, end } = read;
    cursor = end;

    if (RAW_TEXT_TAGS.has(token.name) && !token.closing && !token.selfClosing) {
      // Drop the element *and its raw content*, which is where style/script payloads live.
      const closeRe = new RegExp(`</\\s*${token.name}\\s*>`, 'i');
      const closeMatch = closeRe.exec(input.slice(cursor));
      cursor = closeMatch ? cursor + closeMatch.index + closeMatch[0].length : input.length;
      noteRemovedTag(token.name);
      hadDangerousContent = true;
      continue;
    }

    const allowedAttributes = ALLOWED_TAGS[token.name];
    if (!allowedAttributes) {
      noteRemovedTag(token.name);
      hadDangerousContent = true;
      continue;
    }
    // Guard against a closing tag for an element that was never opened (parser-state confusion).
    if (token.closing && !openStack.includes(token.name)) {
      noteRemovedTag(token.name);
      continue;
    }
    if (!token.closing && openStack.length >= CONNECT_HTML_LIMITS.maxDepth) throw new ConnectHtmlError('html-depth-limit');

    const rendered: string[] = [];
    for (const attribute of token.attributes) {
      if (attribute.name.startsWith('on')) {
        noteRemovedAttribute(attribute.name);
        hadDangerousContent = true;
        continue;
      }
      if (attribute.name === 'style') {
        // Inline CSS can smuggle `url(javascript:…)` and `@import`; it is dropped, not rewritten.
        noteRemovedAttribute('style');
        hadDangerousContent = true;
        continue;
      }
      if (!allowedAttributes.has(attribute.name)) {
        noteRemovedAttribute(attribute.name);
        continue;
      }
      if (needsUrlValidation(attribute.name)) {
        const verdict = classifyMailUrl(attribute.value);
        if (verdict.verdict === 'unsafe-scheme' || verdict.verdict === 'malformed') {
          noteRemovedAttribute(attribute.name);
          hadDangerousContent = true;
          continue;
        }
        if (verdict.verdict === 'remote-blocked') {
          noteRemovedAttribute(attribute.name);
          blockedRemoteContent += 1;
          if (options.collectIndicators) {
            indicators.push({ kind: 'remote-tracker', severity: 'info', explanation: `Remote reference blocked: ${verdict.displayHost ?? 'unknown host'}` });
          }
          rendered.push(`${attribute.name}="#remote-content-blocked"`);
          continue;
        }
        if (!allowRemote && verdict.displayHost) {
          blockedRemoteContent += 1;
          rendered.push(`${attribute.name}="#remote-content-blocked"`);
          continue;
        }
        rendered.push(`${attribute.name}="${escapeHtmlAttribute(verdict.normalized)}"`);
        continue;
      }
      if (NUMERIC_ATTRIBUTES.has(attribute.name)) {
        if (!/^\d{1,6}$/.test(attribute.value.trim())) {
          noteRemovedAttribute(attribute.name);
          continue;
        }
        rendered.push(`${attribute.name}="${escapeHtmlAttribute(attribute.value.trim())}"`);
        continue;
      }
      if (attribute.name === 'align' || attribute.name === 'valign') {
        const value = attribute.value.trim().toLowerCase();
        if (!ALIGN_VALUES.has(value)) {
          noteRemovedAttribute(attribute.name);
          continue;
        }
        rendered.push(`${attribute.name}="${value}"`);
        continue;
      }
      if (attribute.name === 'dir') {
        const value = attribute.value.trim().toLowerCase();
        if (value !== 'ltr' && value !== 'rtl' && value !== 'auto') {
          noteRemovedAttribute(attribute.name);
          continue;
        }
        rendered.push(`${attribute.name}="${value}"`);
        continue;
      }
      rendered.push(`${attribute.name}="${escapeHtmlAttribute(attribute.value)}"`);
    }

    if (token.closing) {
      out.push(`</${token.name}>`);
      const last = openStack.lastIndexOf(token.name);
      if (last !== -1) openStack.splice(last, 1);
    } else {
      out.push(`<${token.name}${rendered.length ? ` ${rendered.join(' ')}` : ''}>`);
      if (!token.selfClosing && !VOID_TAGS.has(token.name)) openStack.push(token.name);
    }
  }

  // Close everything that the hostile input left open, so following UI markup cannot be captured.
  while (openStack.length) out.push(`</${openStack.pop()}>`);

  return {
    html: out.join(''),
    removedTags,
    removedAttributes,
    blockedRemoteContent,
    hadDangerousContent,
    indicators: indicators.slice(0, 64),
  };
}
