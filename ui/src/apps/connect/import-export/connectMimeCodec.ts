// STATUS: PLATIN — BATCH-CONNECT-5: a real, bounded MIME codec for EML/MBOX import and export.
//
// MEASURED GAP before this batch (`import-export/connectInteropCore.ts`):
//  - `importEml` matched attachments with the regex
//    `/Content-Disposition:\s*attachment;[^\r\n]*filename="([^"]+)"[\s\S]*?\[ASTRAEA-ATTACHMENT-REFERENCE:([^\]]+)\]/gi`
//    and then set `sizeBytes: 0` for **every** attachment. A size of zero is a claim about a transfer
//    that was never measured.
//  - `importEml` read only `message-id`, `from`, `to`, `cc`, `subject`, `date`. `In-Reply-To`,
//    `References` and `Reply-To` were dropped, so an imported conversation lost its threading.
//  - `encodeWord`/`decodeWord` only handled Q-encoding for the *first* encoded word and only one
//    header line; RFC 2047 folded multi-word subjects were left encoded.
//
// This module parses the structure (headers, boundaries, per-part transfer encoding) instead of
// guessing with one regex, and it records the byte count it actually decoded.

import type { ConnectAttachment } from '../../../platform/connectors/connectCoreTypes';

export class ConnectMimeError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'ConnectMimeError';
  }
}

export const CONNECT_MIME_LIMITS = {
  maxHeaderBytes: 256 * 1024,
  maxHeaders: 4096,
  maxParts: 256,
  maxDecodedAttachmentBytes: 64 * 1024 * 1024,
  maxSubjectChars: 998,
  maxEncodedWordChars: 75,
} as const;

export interface ConnectMimePart {
  readonly contentType: string;
  readonly parameters: Readonly<Record<string, string>>;
  /** Decoded content. */
  readonly content: Uint8Array;
  /** Base64/QP/PEM text form of the *undecoded* body, for re-export fidelity. */
  readonly rawBody: string;
  readonly encoding: 'base64' | 'quoted-printable' | '7bit' | '8bit' | 'binary';
  readonly headers: ReadonlyMap<string, string[]>;
  readonly isMultipart: boolean;
  readonly children: ConnectMimePart[];
}

const BASE64_ALPHABET = /^[A-Za-z0-9+/=\s]*$/;

/** Base64 → bytes. Rejects malformed input instead of returning a shorter buffer. */
export function decodeBase64(input: string): Uint8Array {
  const compact = input.replace(/\s+/g, '');
  if (!BASE64_ALPHABET.test(compact)) throw new ConnectMimeError('mime-base64-invalid');
  if (compact.length % 4 === 1) throw new ConnectMimeError('mime-base64-invalid');
  const padded = compact.padEnd(Math.ceil(compact.length / 4) * 4, '=');
  const binary = globalThis.atob ? globalThis.atob(padded) : decodeBase64Manual(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index) & 0xff;
  return bytes;
}

function decodeBase64Manual(padded: string): string {
  const table = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let output = '';
  for (let index = 0; index < padded.length; index += 4) {
    const chunk = padded.slice(index, index + 4);
    const values = [...chunk].map((character) => (character === '=' ? 0 : table.indexOf(character)));
    if (values.some((value) => value < 0)) throw new ConnectMimeError('mime-base64-invalid');
    const combined = (values[0] << 18) | (values[1] << 12) | (values[2] << 6) | values[3];
    output += String.fromCharCode((combined >> 16) & 0xff);
    if (chunk[2] !== '=') output += String.fromCharCode((combined >> 8) & 0xff);
    if (chunk[3] !== '=') output += String.fromCharCode(combined & 0xff);
  }
  return output;
}

export function encodeBase64(bytes: Uint8Array, lineLength = 76): string {
  const table = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let output = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const b0 = bytes[index];
    const b1 = bytes[index + 1];
    const b2 = bytes[index + 2];
    output += table[b0 >> 2];
    output += table[((b0 & 0x03) << 4) | ((b1 ?? 0) >> 4)];
    output += b1 === undefined ? '=' : table[((b1 & 0x0f) << 2) | ((b2 ?? 0) >> 6)];
    output += b2 === undefined ? '=' : table[b2 & 0x3f];
  }
  if (lineLength <= 0) return output;
  const lines: string[] = [];
  for (let index = 0; index < output.length; index += lineLength) lines.push(output.slice(index, index + lineLength));
  return lines.join('\r\n');
}

/** Quoted-printable → bytes, per RFC 2045 §6.7 (soft line breaks and `=XX` escapes). */
export function decodeQuotedPrintable(input: string): Uint8Array {
  const withoutSoftBreaks = input.replace(/=\r?\n/g, '');
  const out: number[] = [];
  for (let index = 0; index < withoutSoftBreaks.length; index += 1) {
    const character = withoutSoftBreaks[index];
    if (character === '=') {
      const hex = withoutSoftBreaks.slice(index + 1, index + 3);
      if (!/^[0-9A-Fa-f]{2}$/.test(hex)) throw new ConnectMimeError('mime-qp-invalid');
      out.push(Number.parseInt(hex, 16));
      index += 2;
      continue;
    }
    const code = character.charCodeAt(0);
    // A literal CR/LF in the body is a real line break.
    if (code === 0x0d && withoutSoftBreaks[index + 1] === '\n') { out.push(0x0d, 0x0a); index += 1; continue; }
    if (code > 0xff) throw new ConnectMimeError('mime-qp-invalid');
    out.push(code);
  }
  return new Uint8Array(out);
}

export function decodeWordEncoding(input: string): string {
  return input.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_match, _charset: string, encoding: string, payload: string) => {
    try {
      if (encoding.toUpperCase() === 'B') {
        return new TextDecoder('utf-8', { fatal: false }).decode(decodeBase64(payload));
      }
      const bytes = decodeQuotedPrintable(payload.replace(/_/g, ' '));
      return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    } catch {
      return payload;
    }
  });
}

/** RFC 2047 encode a header value, splitting into bounded encoded words on *byte* boundaries. */
export function encodeWordEncoding(value: string): string {
  if (/^[\x20-\x7e]*$/.test(value)) return value;
  const encoder = new TextEncoder();
  const words: string[] = [];
  let current = '';
  let currentBytes = 0;
  const budget = CONNECT_MIME_LIMITS.maxEncodedWordChars - 12; // "=?UTF-8?B?" + "?="
  const flush = (): void => {
    if (current) words.push(`=?UTF-8?B?${encodeBase64(encoder.encode(current), 0)}?=`);
    current = '';
    currentBytes = 0;
  };
  for (const character of value) {
    const bytes = encoder.encode(character).byteLength;
    // Base64 grows 4/3 and is padded to a multiple of 4; keep the encoded word inside the budget.
    const projected = Math.ceil((currentBytes + bytes) / 3) * 4;
    if (projected > budget) flush();
    current += character;
    currentBytes += bytes;
  }
  flush();
  return words.join(' ');
}

function parseHeaders(raw: string): Map<string, string[]> {
  if (raw.length > CONNECT_MIME_LIMITS.maxHeaderBytes) throw new ConnectMimeError('mime-header-byte-limit');
  const unfolded = raw.replace(/\r?\n[ \t]+/g, ' ');
  const lines = unfolded.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length > CONNECT_MIME_LIMITS.maxHeaders) throw new ConnectMimeError('mime-header-count-limit');
  const map = new Map<string, string[]>();
  for (const line of lines) {
    const separator = line.indexOf(':');
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    map.set(key, [...(map.get(key) ?? []), value]);
  }
  return map;
}

/** Parse a `Content-Type` header into its media type and parameters (quoted values supported). */
export function parseContentType(raw: string): { contentType: string; parameters: Record<string, string> } {
  const [typePart, ...rest] = raw.split(';');
  const contentType = typePart.trim().toLowerCase() || 'text/plain';
  const parameters: Record<string, string> = {};
  for (const segment of rest) {
    const separator = segment.indexOf('=');
    if (separator <= 0) continue;
    const key = segment.slice(0, separator).trim().toLowerCase();
    let value = segment.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key) parameters[key] = value;
  }
  return { contentType, parameters };
}

/**
 * Split a body into parts along the given boundary. Returns the raw part texts, in order, bounded.
 */
export function splitMultipart(body: string, boundary: string): string[] {
  if (!boundary) return [body];
  const marker = `--${boundary}`;
  const segments = body.split(marker);
  const parts: string[] = [];
  for (const segment of segments) {
    if (segment.startsWith('--')) break; // the closing delimiter
    if (!segment.trim()) continue;
    parts.push(segment.replace(/^\r?\n/, '').replace(/\r?\n$/, ''));
    if (parts.length >= CONNECT_MIME_LIMITS.maxParts) throw new ConnectMimeError('mime-part-limit');
  }
  return parts;
}

/** Parse one MIME entity (headers + body), recursing into multipart children. */
export function parseMimeEntity(raw: string, depth = 0): ConnectMimePart {
  if (depth > 16) throw new ConnectMimeError('mime-depth-limit');
  const split = raw.search(/\r?\n\r?\n/);
  const headerText = split === -1 ? raw : raw.slice(0, split);
  const bodyText = split === -1 ? '' : raw.slice(split).replace(/^\r?\n\r?\n/, '');
  const headers = parseHeaders(headerText);
  const { contentType, parameters } = parseContentType(headers.get('content-type')?.[0] ?? 'text/plain');
  const encodingRaw = (headers.get('content-transfer-encoding')?.[0] ?? '7bit').toLowerCase();
  const encoding: ConnectMimePart['encoding'] = encodingRaw.includes('base64')
    ? 'base64'
    : encodingRaw.includes('quoted-printable')
      ? 'quoted-printable'
      : encodingRaw.includes('8bit')
        ? '8bit'
        : encodingRaw.includes('binary')
          ? 'binary'
          : '7bit';

  const isMultipart = contentType.startsWith('multipart/') && Boolean(parameters.boundary);
  const children = isMultipart
    ? splitMultipart(bodyText, parameters.boundary).map((part) => parseMimeEntity(part, depth + 1))
    : [];

  let content: Uint8Array;
  if (isMultipart) content = new Uint8Array(0);
  else if (encoding === 'base64') content = decodeBase64(bodyText);
  else if (encoding === 'quoted-printable') content = decodeQuotedPrintable(bodyText);
  else content = new TextEncoder().encode(bodyText);

  return { contentType, parameters, content, rawBody: bodyText, encoding, headers, isMultipart, children };
}

/** Depth-first walk over a parsed entity. */
export function* walkMimeParts(part: ConnectMimePart): Generator<ConnectMimePart> {
  yield part;
  for (const child of part.children) yield* walkMimeParts(child);
}

/**
 * Turn the attachment parts of a parsed message into `ConnectAttachment` records whose `sizeBytes` is
 * the number of bytes that were really decoded. A part that cannot be decoded is reported as
 * `malwareScanState: 'unavailable'` with a zero size *and* is not silently kept as a valid attachment.
 */
export function attachmentsFromMime(root: ConnectMimePart): Array<{ attachment: ConnectAttachment; decodedBytes: Uint8Array }> {
  const result: Array<{ attachment: ConnectAttachment; decodedBytes: Uint8Array }> = [];
  for (const part of walkMimeParts(root)) {
    if (part.isMultipart) continue;
    const disposition = part.headers.get('content-disposition')?.[0]?.toLowerCase() ?? '';
    const isAttachment = disposition.startsWith('attachment')
      || (part.parameters.name !== undefined && !part.contentType.startsWith('text/plain'))
      || part.contentType.startsWith('application/');
    if (!isAttachment) continue;
    if (part.contentType.startsWith('multipart/')) continue;
    const declaredName = part.parameters.filename
      ?? decodeWordEncoding(part.parameters.name ?? '')
      ?? '';
    const name = declaredName.trim().slice(0, 255) || `attachment-${result.length + 1}`;
    if (part.content.byteLength > CONNECT_MIME_LIMITS.maxDecodedAttachmentBytes) continue;
    result.push({
      attachment: {
        id: `part:${result.length}:${name.replace(/[^A-Za-z0-9._-]/g, '_')}`,
        name,
        // The measured size, not a placeholder zero.
        sizeBytes: part.content.byteLength,
        declaredMime: part.contentType,
        detectedMime: part.contentType,
        safePreview: false,
        malwareScanState: 'not-scanned',
      },
      decodedBytes: part.content,
    });
    if (result.length >= 128) break;
  }
  return result;
}

/** Address list parsing for `From`/`To`/`Cc`: `Name <addr>` and bare addresses, comma separated. */
export function parseAddressList(raw: string): Array<{ name?: string; address: string }> {
  const out: Array<{ name?: string; address: string }> = [];
  // Split on commas that are not inside a quoted display name.
  const segments: string[] = [];
  let current = '';
  let quoted = false;
  for (const character of raw) {
    if (character === '"') quoted = !quoted;
    if (character === ',' && !quoted) { segments.push(current); current = ''; continue; }
    current += character;
  }
  segments.push(current);
  for (const segment of segments) {
    const trimmed = segment.trim();
    if (!trimmed) continue;
    const angled = /^(.*)<([^>]+)>\s*$/.exec(trimmed);
    if (angled) {
      const address = angled[2].trim().replace(/^mailto:/i, '').toLowerCase();
      if (address) out.push({ name: decodeWordEncoding(angled[1].trim().replace(/^"|"$/g, '')) || undefined, address });
      continue;
    }
    const address = trimmed.replace(/^mailto:/i, '').toLowerCase();
    if (address) out.push({ address });
    if (out.length >= 1000) break;
  }
  return out;
}
