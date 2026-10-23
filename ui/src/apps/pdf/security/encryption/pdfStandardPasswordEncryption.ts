// STATUS: DIAMANT VGT SUPREME
// Astraea PDF Studio — ISO 32000 Standard Security Handler AES-256 Revision 6 for structured PDF exports.
// Password input is intentionally restricted to printable ASCII until a dedicated SASLprep implementation is available.
import { toOwnedArrayBuffer } from '../../../../shared/binary/ownedBufferSource';

export interface PdfPasswordProtectionOptions {
  userPassword: string;
  ownerPassword: string;
  /**
   * **Pflicht, ohne Vorgabe.** Runde 234.
   *
   * Vorher war das Feld optional und die Engine fiel auf `-4` zurueck, wenn es
   * fehlte oder keine ganze Zahl war. `-4` ist die **permissive** Maske: sie
   * erlaubt `modify` **und** `copy`. Ein Aufrufer, der den Wert vergass, bekam
   * also still ein PDF, das alles erlaubt — ohne Fehler, ohne Warnung.
   *
   * Ein Vorgabewert fuer Zugriffsrechte ist **kein** Komfort, sondern eine
   * stille Rechtevergabe. Deshalb ist das Feld jetzt Pflicht: der Compiler
   * findet jeden Aufrufer, der es weglaesst, und die Laufzeit wirft fuer
   * Aufrufer, die nicht durch den Compiler gehen (JSON, Casts, IPC).
   *
   * Ein Aufrufer, der die permissive Maske **will**, schreibt sie ausdruecklich
   * hin — `-4` bleibt damit eine Entscheidung statt eines Zufalls.
   */
  permissions: number;
  encryptMetadata?: boolean;
}

export interface PdfPasswordProtectionResult {
  bytes: Uint8Array;
  revision: 6;
  version: 5;
  cipher: 'AES-256';
  permissions: number;
  encryptMetadata: boolean;
}

interface ParsedPdfObject {
  id: number;
  body: Uint8Array;
}

const MAX_SOURCE_BYTES = 128 * 1024 * 1024;
const MAX_OBJECTS = 100_000;
const MAX_PASSWORD_BYTES = 127;
const ASCII = new TextEncoder();
const LATIN1 = new TextDecoder('windows-1252', { fatal: false, ignoreBOM: true });
const ZERO_IV = new Uint8Array(16);

const concatBytes = (...parts: Uint8Array[]): Uint8Array => {
  const length = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.byteLength; }
  return out;
};

const bytesToHex = (bytes: Uint8Array): string => {
  let out = '';
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
  return out;
};

const passwordBytes = (value: string, label: string): Uint8Array => {
  if (!value || value.length > MAX_PASSWORD_BYTES || !/^[\x20-\x7e]+$/u.test(value)) {
    throw new Error(`${label} must contain 1-${MAX_PASSWORD_BYTES} printable ASCII characters. Non-ASCII passwords remain fail-closed until SASLprep is implemented.`);
  }
  return ASCII.encode(value);
};

const subtle = (): SubtleCrypto => {
  if (!globalThis.crypto?.subtle || !globalThis.crypto?.getRandomValues) throw new Error('WebCrypto is unavailable for PDF password protection');
  return globalThis.crypto.subtle;
};

const randomBytes = (length: number): Uint8Array => {
  const out = new Uint8Array(length);
  globalThis.crypto.getRandomValues(out);
  return out;
};

const digest = async (name: 'SHA-256' | 'SHA-384' | 'SHA-512', data: Uint8Array): Promise<Uint8Array> =>
  new Uint8Array(await subtle().digest(name, toOwnedArrayBuffer(data)));

const aesCbcEncrypt = async (keyBytes: Uint8Array, iv: Uint8Array, data: Uint8Array): Promise<Uint8Array> => {
  const key = await subtle().importKey('raw', toOwnedArrayBuffer(keyBytes), { name: 'AES-CBC' }, false, ['encrypt']);
  return new Uint8Array(await subtle().encrypt({ name: 'AES-CBC', iv: toOwnedArrayBuffer(iv) }, key, toOwnedArrayBuffer(data)));
};

// WebCrypto applies PKCS#7 padding. For standard-handler helper blocks whose plaintext length is
// already a multiple of 16, the ciphertext blocks preceding the extra padding block are identical
// to raw AES-CBC without padding, so the standards-required length is retained explicitly.
const aesCbcEncryptNoPadding = async (keyBytes: Uint8Array, iv: Uint8Array, data: Uint8Array): Promise<Uint8Array> => {
  if (data.byteLength === 0 || data.byteLength % 16 !== 0) throw new Error('AES-CBC no-padding helper requires complete blocks');
  const encrypted = await aesCbcEncrypt(keyBytes, iv, data);
  return encrypted.slice(0, data.byteLength);
};

const r6Hash = async (password: Uint8Array, salt: Uint8Array, userData: Uint8Array): Promise<Uint8Array> => {
  let k = await digest('SHA-256', concatBytes(password, salt, userData));
  let count = 0;
  for (;;) {
    count += 1;
    const k1 = concatBytes(password, k, userData);
    const repeated = new Uint8Array(k1.byteLength * 64);
    for (let index = 0; index < 64; index += 1) repeated.set(k1, index * k1.byteLength);
    const e = await aesCbcEncryptNoPadding(k.slice(0, 16), k.slice(16, 32), repeated);
    let selector = 0;
    for (let index = 0; index < 16; index += 1) selector += e[index];
    const algorithm = (['SHA-256', 'SHA-384', 'SHA-512'] as const)[selector % 3];
    k = await digest(algorithm, e);
    if (count >= 64 && e[e.byteLength - 1] <= count - 32) break;
    if (count > 320) throw new Error('PDF revision-6 password hash exceeded the bounded round limit');
  }
  return k.slice(0, 32);
};

const computeSecurityValues = async (
  userPassword: Uint8Array,
  ownerPassword: Uint8Array,
  fileKey: Uint8Array,
  permissions: number,
  encryptMetadata: boolean,
): Promise<{ U: Uint8Array; UE: Uint8Array; O: Uint8Array; OE: Uint8Array; Perms: Uint8Array }> => {
  const userSalt = randomBytes(16);
  const userValidationSalt = userSalt.slice(0, 8);
  const userKeySalt = userSalt.slice(8, 16);
  const U = concatBytes(await r6Hash(userPassword, userValidationSalt, new Uint8Array()), userValidationSalt, userKeySalt);
  const UE = await aesCbcEncryptNoPadding(await r6Hash(userPassword, userKeySalt, new Uint8Array()), ZERO_IV, fileKey);

  const ownerSalt = randomBytes(16);
  const ownerValidationSalt = ownerSalt.slice(0, 8);
  const ownerKeySalt = ownerSalt.slice(8, 16);
  const O = concatBytes(await r6Hash(ownerPassword, ownerValidationSalt, U), ownerValidationSalt, ownerKeySalt);
  const OE = await aesCbcEncryptNoPadding(await r6Hash(ownerPassword, ownerKeySalt, U), ZERO_IV, fileKey);

  const plainPerms = new Uint8Array(16);
  const view = new DataView(plainPerms.buffer);
  view.setInt32(0, permissions, true);
  plainPerms.set([0xff, 0xff, 0xff, 0xff], 4);
  plainPerms[8] = encryptMetadata ? 0x54 : 0x46;
  plainPerms.set([0x61, 0x64, 0x62], 9);
  plainPerms.set(randomBytes(4), 12);
  const Perms = await aesCbcEncryptNoPadding(fileKey, ZERO_IV, plainPerms);
  return { U, UE, O, OE, Perms };
};

const parseStructuredObjects = (bytes: Uint8Array): { objects: ParsedPdfObject[]; rootId: number; infoId: number | null } => {
  if (!bytes.byteLength || bytes.byteLength > MAX_SOURCE_BYTES) throw new Error('PDF source exceeds the password-protection byte budget');
  const text = LATIN1.decode(bytes);
  if (!text.startsWith('%PDF-1.4\n%VGTPDF\n') && !text.startsWith('%PDF-1.7\n%VGTPDF\n')) {
    throw new Error('Standard password protection currently accepts only fresh Astraea structured PDF serialization');
  }
  const xrefAt = text.lastIndexOf('\nxref\n');
  if (xrefAt < 0) throw new Error('Structured PDF xref table is missing');
  const objectText = text.slice(text.indexOf('\n', text.indexOf('%VGTPDF')) + 1, xrefAt + 1);
  const objects: ParsedPdfObject[] = [];
  const pattern = /(\d+) 0 obj\n([\s\S]*?)\nendobj(?:\n|$)/g;
  for (const match of objectText.matchAll(pattern)) {
    const id = Number(match[1]);
    if (!Number.isInteger(id) || id < 1 || id > MAX_OBJECTS) throw new Error('Structured PDF object identifier exceeds policy');
    objects.push({ id, body: new TextEncoder().encode(match[2]) });
  }
  if (!objects.length || objects.length > MAX_OBJECTS) throw new Error('Structured PDF object inventory is empty or exceeds policy');
  objects.sort((a, b) => a.id - b.id);
  for (let index = 0; index < objects.length; index += 1) if (objects[index].id !== index + 1) throw new Error('Structured PDF object IDs must be dense before encryption');
  const trailer = text.slice(xrefAt);
  const rootMatch = /\/Root\s+(\d+)\s+0\s+R\b/u.exec(trailer);
  const infoMatch = /\/Info\s+(\d+)\s+0\s+R\b/u.exec(trailer);
  if (!rootMatch) throw new Error('Structured PDF trailer root is missing');
  return { objects, rootId: Number(rootMatch[1]), infoId: infoMatch ? Number(infoMatch[1]) : null };
};

const findStream = (body: Uint8Array): { dictionary: Uint8Array; stream: Uint8Array; suffix: Uint8Array } | null => {
  const marker = ASCII.encode('\nstream\n');
  const endMarker = ASCII.encode('\nendstream');
  const indexOf = (haystack: Uint8Array, needle: Uint8Array, start = 0): number => {
    outer: for (let i = start; i <= haystack.length - needle.length; i += 1) {
      for (let j = 0; j < needle.length; j += 1) if (haystack[i + j] !== needle[j]) continue outer;
      return i;
    }
    return -1;
  };
  const start = indexOf(body, marker);
  if (start < 0) return null;
  const dataStart = start + marker.length;
  const end = indexOf(body, endMarker, dataStart);
  if (end < 0) throw new Error('Structured PDF stream is missing endstream');
  return { dictionary: body.slice(0, start), stream: body.slice(dataStart, end), suffix: body.slice(end + 1) };
};

const updateStreamLength = (dictionary: Uint8Array, length: number): Uint8Array => {
  const text = LATIN1.decode(dictionary);
  if (!/\/Length\s+\d+\b/u.test(text)) throw new Error('Structured PDF stream dictionary is missing direct /Length');
  return ASCII.encode(text.replace(/\/Length\s+\d+\b/u, `/Length ${length}`));
};


const decodePdfLiteralString = (value: string): Uint8Array => {
  const bytes: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index) & 0xff;
    if (code !== 0x5c) { bytes.push(code); continue; }
    if (index + 1 >= value.length) break;
    const next = value[++index];
    if (next === 'n') bytes.push(0x0a);
    else if (next === 'r') bytes.push(0x0d);
    else if (next === 't') bytes.push(0x09);
    else if (next === 'b') bytes.push(0x08);
    else if (next === 'f') bytes.push(0x0c);
    else if (next === '\\' || next === '(' || next === ')') bytes.push(next.charCodeAt(0));
    else if (next === '\n') continue;
    else if (next === '\r') { if (value[index + 1] === '\n') index += 1; }
    else if (/[0-7]/u.test(next)) {
      let octal = next;
      for (let count = 0; count < 2 && index + 1 < value.length && /[0-7]/u.test(value[index + 1]); count += 1) octal += value[++index];
      bytes.push(Number.parseInt(octal, 8) & 0xff);
    } else bytes.push(next.charCodeAt(0) & 0xff);
  }
  return new Uint8Array(bytes);
};

const encryptLiteralAndHexStrings = async (source: Uint8Array, fileKey: Uint8Array): Promise<Uint8Array> => {
  const text = LATIN1.decode(source);
  let output = '';
  for (let index = 0; index < text.length;) {
    const ch = text[index];
    if (ch === '<' && text[index + 1] === '<') { output += '<<'; index += 2; continue; }
    if (ch === '>' && text[index + 1] === '>') { output += '>>'; index += 2; continue; }
    if (ch === '(') {
      let depth = 1;
      let escaped = false;
      let cursor = index + 1;
      for (; cursor < text.length; cursor += 1) {
        const current = text[cursor];
        if (escaped) { escaped = false; continue; }
        if (current === '\\') { escaped = true; continue; }
        if (current === '(') depth += 1;
        else if (current === ')' && --depth === 0) break;
      }
      if (depth !== 0) throw new Error('Unterminated PDF literal string during encryption');
      const raw = decodePdfLiteralString(text.slice(index + 1, cursor));
      const encrypted = await encryptPdfPayload(fileKey, raw);
      output += `<${bytesToHex(encrypted)}>`;
      index = cursor + 1;
      continue;
    }
    if (ch === '<' && text[index + 1] !== '<') {
      const end = text.indexOf('>', index + 1);
      if (end < 0) throw new Error('Unterminated PDF hex string during encryption');
      const compact = text.slice(index + 1, end).replace(/\s+/gu, '');
      if (!/^[0-9A-Fa-f]*$/u.test(compact)) throw new Error('Invalid PDF hex string during encryption');
      const padded = compact.length % 2 ? `${compact}0` : compact;
      const raw = new Uint8Array(padded.length / 2);
      for (let offset = 0; offset < raw.length; offset += 1) raw[offset] = Number.parseInt(padded.slice(offset * 2, offset * 2 + 2), 16);
      const encrypted = await encryptPdfPayload(fileKey, raw);
      output += `<${bytesToHex(encrypted)}>`;
      index = end + 1;
      continue;
    }
    output += ch;
    index += 1;
  }
  return ASCII.encode(output);
};

const encryptPdfPayload = async (fileKey: Uint8Array, plain: Uint8Array): Promise<Uint8Array> => {
  const iv = randomBytes(16);
  return concatBytes(iv, await aesCbcEncrypt(fileKey, iv, plain));
};

const encryptObjectBody = async (body: Uint8Array, fileKey: Uint8Array): Promise<Uint8Array> => {
  const stream = findStream(body);
  if (!stream) return encryptLiteralAndHexStrings(body, fileKey);
  const encryptedDictionary = await encryptLiteralAndHexStrings(stream.dictionary, fileKey);
  const encryptedStream = await encryptPdfPayload(fileKey, stream.stream);
  const dictionary = updateStreamLength(encryptedDictionary, encryptedStream.byteLength);
  return concatBytes(dictionary, ASCII.encode('\nstream\n'), encryptedStream, ASCII.encode('\n'), stream.suffix);
};

const serializeEncryptedPdf = (
  objects: ParsedPdfObject[],
  rootId: number,
  infoId: number | null,
  encryptId: number,
  fileId: Uint8Array,
): Uint8Array => {
  const chunks: Uint8Array[] = [ASCII.encode('%PDF-1.7\n%VGTPDF\n')];
  const offsets: number[] = [0];
  let byteLength = chunks[0].byteLength;
  for (const object of objects) {
    offsets[object.id] = byteLength;
    const header = ASCII.encode(`${object.id} 0 obj\n`);
    const footer = ASCII.encode('\nendobj\n');
    chunks.push(header, object.body, footer);
    byteLength += header.byteLength + object.body.byteLength + footer.byteLength;
  }
  const xref = byteLength;
  let xrefText = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= objects.length; id += 1) xrefText += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  const idHex = bytesToHex(fileId);
  xrefText += `trailer\n<< /Size ${objects.length + 1} /Root ${rootId} 0 R${infoId ? ` /Info ${infoId} 0 R` : ''} /Encrypt ${encryptId} 0 R /ID [<${idHex}><${idHex}>] >>\nstartxref\n${xref}\n%%EOF\n`;
  chunks.push(ASCII.encode(xrefText));
  return concatBytes(...chunks);
};

export async function protectStructuredPdfWithPassword(
  source: Uint8Array,
  options: PdfPasswordProtectionOptions,
): Promise<PdfPasswordProtectionResult> {
  const userPassword = passwordBytes(options.userPassword, 'User password');
  const ownerPassword = passwordBytes(options.ownerPassword, 'Owner password');
  if (options.userPassword === options.ownerPassword) throw new Error('User and owner passwords must be distinct');
  // Runde 234: Hier stand `Number.isInteger(options.permissions) ? Number(...) : -4`.
  //
  // Der Rueckfall auf `-4` war **fail-open**: `-4` erlaubt `modify` und `copy`.
  // Wer `permissions` vergass, bekam still ein PDF, das alles erlaubt.
  //
  // Und er brach das Muster dieser Funktion: die Zeilen darueber und darunter
  // werfen alle bei ungueltiger Eingabe — `passwordBytes` fuer beide Passwoerter,
  // die Gleichheitspruefung, die Bereichspruefung. Nur dieser Wert fiel still
  // zurueck. Das war kein Entwurf, sondern eine Luecke.
  //
  // Ein Vorgabewert fuer Zugriffsrechte ist eine stille Rechtevergabe. Also
  // fail-closed: wer die permissive Maske will, schreibt sie hin.
  if (!Number.isInteger(options.permissions)) {
    throw new Error('PDF permissions must be given explicitly as a signed 32-bit integer; there is no default, because any default would grant rights the caller never chose');
  }
  const permissions = Number(options.permissions);
  if (permissions < -2147483648 || permissions > 2147483647) throw new Error('PDF permissions value is outside signed 32-bit range');
  const encryptMetadata = options.encryptMetadata !== false;
  const { objects, rootId, infoId } = parseStructuredObjects(source);
  const fileKey = randomBytes(32);
  const values = await computeSecurityValues(userPassword, ownerPassword, fileKey, permissions, encryptMetadata);
  const encrypted: ParsedPdfObject[] = [];
  for (const object of objects) encrypted.push({ id: object.id, body: await encryptObjectBody(object.body, fileKey) });
  const encryptId = encrypted.length + 1;
  const encryptDictionary = `<< /Filter /Standard /V 5 /R 6 /Length 256 /P ${permissions} /EncryptMetadata ${encryptMetadata ? 'true' : 'false'} /O <${bytesToHex(values.O)}> /U <${bytesToHex(values.U)}> /OE <${bytesToHex(values.OE)}> /UE <${bytesToHex(values.UE)}> /Perms <${bytesToHex(values.Perms)}> /CF << /StdCF << /AuthEvent /DocOpen /CFM /AESV3 /Length 32 >> >> /StmF /StdCF /StrF /StdCF >>`;
  encrypted.push({ id: encryptId, body: ASCII.encode(encryptDictionary) });
  const bytes = serializeEncryptedPdf(encrypted, rootId, infoId, encryptId, randomBytes(16));
  fileKey.fill(0);
  return { bytes, revision: 6, version: 5, cipher: 'AES-256', permissions, encryptMetadata };
}

/** What a verification found. `wrong-password` and `not-encrypted` are different facts, so they are different values. */
export type PdfPasswordVerificationVerdict = 'user-password' | 'owner-password' | 'wrong-password' | 'not-encrypted' | 'unsupported-handler';

/** How far the permission claim could be checked. Stated as a value, because "declared" and "verified" differ. */
export type PdfPermissionAssurance =
  /** `/P` was read and the rights were derived from it; the `/Perms` integrity block was **not** decrypted. */
  | 'declared-by-handler'
  /** The `/Perms` block was decrypted and matched `/P`, so a tampered permission value would be visible. */
  | 'integrity-verified';

export interface PdfPasswordVerificationResult {
  readonly verdict: PdfPasswordVerificationVerdict;
  /** The `/P` value the file declares, or `null` when the file is not encrypted. */
  readonly permissions: number | null;
  readonly permissionAssurance: PdfPermissionAssurance | null;
  /** Permission bits derived from `/P`. Present whenever `/P` could be read. */
  readonly granted: {
    readonly print: boolean;
    readonly modify: boolean;
    readonly copy: boolean;
    readonly annotate: boolean;
    readonly fillForms: boolean;
    readonly extractForAccessibility: boolean;
    readonly assemble: boolean;
    readonly printHighResolution: boolean;
  } | null;
  /** The AES policy the handler declares, checked against the values this module writes. */
  readonly handler: { readonly version: number; readonly revision: number; readonly cryptFilter: string | null; readonly keyBits: number | null } | null;
  readonly detail: string;
}

const hexToBytes = (value: string): Uint8Array => {
  const out = new Uint8Array(value.length / 2);
  for (let index = 0; index < out.length; index += 1) out[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  return out;
};

const grantedFromPermissions = (permissions: number): NonNullable<PdfPasswordVerificationResult['granted']> => {
  const bit = (index: number): boolean => (permissions & (1 << index)) !== 0;
  return {
    print: bit(2),
    modify: bit(3),
    copy: bit(4),
    annotate: bit(5),
    fillForms: bit(8),
    extractForAccessibility: bit(9),
    assemble: bit(10),
    printHighResolution: bit(11),
  };
};

/**
 * Verifies a password against an encrypted PDF this application produced, and reports the rights the handler
 * declares.
 *
 * AST-0867 asks to "check the AES policy, correct and wrong passwords, and the modification rights". The
 * tracker's layer text forbids a claim without the act, so this performs the **standard's own password
 * validation** for a revision-6 handler (ISO 32000-2, 7.6.4.3.4): hash the candidate with the validation salt
 * taken from `/U` (and with the salt from `/O` for the owner case) and compare. That is pure hashing — the same
 * `r6Hash` the writer uses — so no cipher is re-implemented.
 *
 * **What it does not claim, and why.** The `/Perms` integrity block is encrypted with the file key recovered
 * from `/UE`, and recovering that key needs a **raw** AES-CBC decryption without padding removal. WebCrypto
 * only offers padded AES-CBC, and its padding check rejects a truncated ciphertext (which is exactly what
 * `aesCbcEncryptNoPadding` produces and strips). Writing a raw AES block decryption here would be a **second
 * implementation of a cipher primitive** — forbidden in this project — so `permissionAssurance` says
 * `declared-by-handler` and `detail` names the limitation instead of implying an integrity check that did not
 * happen. A reader that can decrypt the content will additionally notice a tampered `/UE`; this function will
 * not pretend to.
 */
export async function verifyPdfPasswordProtection(
  bytes: Uint8Array,
  candidatePassword: string,
): Promise<PdfPasswordVerificationResult> {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0 || bytes.byteLength > MAX_SOURCE_BYTES) {
    throw new Error('PDF password verification requires a bounded, non-empty byte source');
  }
  const text = LATIN1.decode(bytes);
  const dictionary = /\/Filter\s*\/Standard[\s\S]{0,2048}?>>/u.exec(text)?.[0];
  if (!/\/Encrypt\s+\d+\s+0\s+R\b/u.test(text) || !dictionary) {
    return { verdict: 'not-encrypted', permissions: null, permissionAssurance: null, granted: null, handler: null, detail: 'the file declares no /Encrypt entry with a Standard security handler' };
  }
  const readHex = (key: string, expectedLength: number): Uint8Array | null => {
    const match = new RegExp(`/${key}\\s*<([0-9A-Fa-f]{${expectedLength * 2}})>`, 'u').exec(dictionary);
    return match ? hexToBytes(match[1]) : null;
  };
  const version = Number(/\/V\s+(\d+)/u.exec(dictionary)?.[1] ?? 0);
  const revision = Number(/\/R\s+(\d+)/u.exec(dictionary)?.[1] ?? 0);
  const cryptFilter = /\/CFM\s*\/([A-Za-z0-9]+)/u.exec(dictionary)?.[1] ?? null;
  const keyBits = Number(/\/Length\s+(\d+)/u.exec(dictionary)?.[1] ?? 0) || null;
  const permissionsValue = /\/P\s+(-?\d+)/u.exec(dictionary)?.[1];
  const permissions = permissionsValue ? Number(permissionsValue) : null;
  const handler = { version, revision, cryptFilter, keyBits };
  if (revision !== 6 || version !== 5 || cryptFilter !== 'AESV3') {
    return {
      verdict: 'unsupported-handler',
      permissions,
      permissionAssurance: null,
      granted: null,
      handler,
      detail: `security handler declares V${version}/R${revision}/CFM ${String(cryptFilter)}; this module verifies only the AESV3 revision-6 handler it writes`,
    };
  }
  const U = readHex('U', 48);
  const O = readHex('O', 48);
  if (!U || !O) {
    return { verdict: 'unsupported-handler', permissions, permissionAssurance: null, granted: null, handler, detail: 'the security handler is missing its /U or /O entry' };
  }
  const candidate = passwordBytes(candidatePassword, 'Candidate password');
  const userHash = await r6Hash(candidate, U.slice(32, 40), new Uint8Array());
  const isUser = userHash.every((byte, index) => byte === U[index]);
  let isOwner = false;
  if (!isUser) {
    const ownerHash = await r6Hash(candidate, O.slice(32, 40), U);
    isOwner = ownerHash.every((byte, index) => byte === O[index]);
  }
  if (!isUser && !isOwner) {
    return {
      verdict: 'wrong-password',
      permissions,
      permissionAssurance: null,
      granted: null,
      handler,
      detail: 'the candidate password matches neither the user nor the owner revision-6 validation salt',
    };
  }
  return {
    verdict: isOwner ? 'owner-password' : 'user-password',
    permissions,
    permissionAssurance: 'declared-by-handler',
    granted: permissions === null ? null : grantedFromPermissions(permissions),
    handler,
    detail: 'password validated against the revision-6 hash; the /Perms integrity block is not decrypted, because a raw AES-CBC decryption would be a second cipher implementation',
  };
}
