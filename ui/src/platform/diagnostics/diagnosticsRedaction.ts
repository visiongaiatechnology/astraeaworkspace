// STATUS: DIAMANT VGT SUPREME — bounded diagnostics redaction boundary.

const MAX_DIAGNOSTIC_TEXT = 2_048;
const SECRET_KEY_PATTERN = /(authorization|bearer|cookie|credential|password|passphrase|pin(hash)?|secret|token|private[_-]?key|sealed|session[_-]?key|api[_-]?key)/i;
const PATH_KEY_PATTERN = /(path|directory|folder|file(name)?|location)/i;
const WINDOWS_PATH_PATTERN = /(?:[A-Za-z]:\\|\\\\)[^\r\n\t"'<>|]+/g;
const POSIX_PATH_PATTERN = /\/(?:Users|home|var|tmp|private|opt|etc|mnt|Volumes|run|srv)\/[A-Za-z0-9._~!$&'()+,;=:@%\-/]+/g;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+\-/=]{8,}\b/gi;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const KEY_VALUE_SECRET_PATTERN = /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|secret|password|passphrase)\s*[:=]\s*[^\s,;]+/gi;
const PRIVATE_KEY_BLOCK_PATTERN = /-----BEGIN(?: [A-Z0-9]+)? PRIVATE KEY-----[\s\S]*?-----END(?: [A-Z0-9]+)? PRIVATE KEY-----/g;
const OPAQUE_TOKEN_PATTERN = /\b(?:sk|rk|pk)_[A-Za-z0-9_-]{16,}\b/g;
const EMAIL_PATTERN=/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const IPV4_PATTERN=/\b(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}\b/g;
const IPV6_PATTERN=/\b(?:[A-F0-9]{1,4}:){2,7}[A-F0-9]{0,4}\b/gi;
const IDENTITY_KEY_PATTERN=/(?:^|[_-])(name|user(name)?|display[_-]?name|email|ip|ip[_-]?address|hostname|actor|author|owner)(?:$|[_-])/i;

export interface DiagnosticSanitizeOptions {
  maxDepth?: number;
  maxArrayItems?: number;
  maxObjectKeys?: number;
  preserveDocumentContent?: boolean;
}

function redactTextWithLimit(input: string, limit: number): string {
  const bounded = input.slice(0, Math.max(1, limit));
  return bounded
    .replace(WINDOWS_PATH_PATTERN, '[REDACTED_PATH]')
    .replace(POSIX_PATH_PATTERN, '[REDACTED_PATH]')
    .replace(PRIVATE_KEY_BLOCK_PATTERN, '[REDACTED_PRIVATE_KEY]')
    .replace(BEARER_PATTERN, 'Bearer [REDACTED_SECRET]')
    .replace(JWT_PATTERN, '[REDACTED_TOKEN]')
    .replace(OPAQUE_TOKEN_PATTERN, '[REDACTED_TOKEN]')
    .replace(KEY_VALUE_SECRET_PATTERN, '$1=[REDACTED_SECRET]')
    .replace(EMAIL_PATTERN, '[REDACTED_EMAIL]')
    .replace(IPV4_PATTERN, '[REDACTED_IP]')
    .replace(IPV6_PATTERN, '[REDACTED_IP]');
}

export function redactDiagnosticText(input: string): string {
  return redactTextWithLimit(input, MAX_DIAGNOSTIC_TEXT);
}

function sanitizeInternal(
  value: unknown,
  options: Required<DiagnosticSanitizeOptions>,
  depth: number,
  keyHint: string | null,
): unknown {
  if (depth > options.maxDepth) return '[REDACTED_DEPTH_LIMIT]';
  if (keyHint && SECRET_KEY_PATTERN.test(keyHint)) return '[REDACTED_SECRET]';
  if (keyHint && IDENTITY_KEY_PATTERN.test(keyHint)) return '[REDACTED_IDENTITY]';

  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') {
    if (keyHint && PATH_KEY_PATTERN.test(keyHint)) return redactTextWithLimit(value, options.preserveDocumentContent ? 1_000_000 : MAX_DIAGNOSTIC_TEXT);
    return options.preserveDocumentContent ? redactTextWithLimit(value, 1_000_000) : redactDiagnosticText(value);
  }
  if (typeof value === 'bigint') return value.toString(10);
  if (typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol') return undefined;
  if (value instanceof Uint8Array || value instanceof ArrayBuffer) return '[REDACTED_BINARY]';

  if (Array.isArray(value)) {
    return value
      .slice(0, options.maxArrayItems)
      .map((item) => sanitizeInternal(item, options, depth + 1, null));
  }

  if (typeof value === 'object') {
    const output: Record<string, unknown> = {};
    const entries = Object.entries(value as Record<string, unknown>).slice(0, options.maxObjectKeys);
    for (const [key, child] of entries) {
      if (SECRET_KEY_PATTERN.test(key)) {
        output[key] = '[REDACTED_SECRET]';
        continue;
      }
      if (IDENTITY_KEY_PATTERN.test(key)) { output[key] = '[REDACTED_IDENTITY]'; continue; }
      if (/^(dataBase64|rawPdfDataUrl|ciphertext|nonce|salt|signature(Base64)?)$/i.test(key)) {
        output[key] = '[REDACTED_BINARY_OR_CRYPTO_MATERIAL]';
        continue;
      }
      const sanitized = sanitizeInternal(child, options, depth + 1, key);
      if (sanitized !== undefined) output[key] = sanitized;
    }
    return output;
  }

  return '[REDACTED_UNSUPPORTED]';
}

export function sanitizeDiagnosticValue(value: unknown, options: DiagnosticSanitizeOptions = {}): unknown {
  const normalized: Required<DiagnosticSanitizeOptions> = {
    maxDepth: Math.max(1, Math.min(options.maxDepth ?? 8, 16)),
    maxArrayItems: Math.max(1, Math.min(options.maxArrayItems ?? 256, 2_048)),
    maxObjectKeys: Math.max(1, Math.min(options.maxObjectKeys ?? 256, 2_048)),
    preserveDocumentContent: options.preserveDocumentContent === true,
  };
  return sanitizeInternal(value, normalized, 0, null);
}

export function containsLikelySecretMaterial(serialized: string): boolean {
  return /Bearer\s+(?!\[REDACTED_SECRET\])|eyJ[A-Za-z0-9_-]{8,}\.|-----BEGIN(?: [A-Z0-9]+)? PRIVATE KEY-----|\b(?:sk|rk|pk)_[A-Za-z0-9_-]{16,}\b|(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|passphrase)\s*[:=]\s*(?!\[REDACTED_SECRET\])/i.test(serialized);
}
