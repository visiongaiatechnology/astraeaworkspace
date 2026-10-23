// STATUS: DIAMANT VGT SUPREME — how text becomes a string in a PDF, in one place
//
// W-198 and W-298. Both findings are the same mistake in different clothes: a PDF writer escaped its
// strings with `normalize('NFKD').replace(/[^\x20-\x7E]/g, '?')`, so every character outside ASCII was
// **destroyed**. For the Writer that meant a German business letter was drawn as a picture (W-198); for
// PDF Studio, the shared PDF creation, attachments, edit rendering, bookmarks and Present it means
// umlauts in titles, names and labels come out as `?` (W-298).
//
// There are exactly **two** correct answers, and which one applies depends on whether a font is involved:
//
//   1. **Content text**, drawn with a base font → WinAnsi bytes with octal escapes, and the font declares
//      `/Encoding /WinAnsiEncoding`. See `pdfWinAnsiLiteral`.
//   2. **Metadata and labels** (document title, outline titles, annotation contents, form field names,
//      signer name, attachment names) → a PDF **text string**: UTF-16BE with a byte-order mark, written in
//      hex form. That needs no font at all and is understood by every conforming reader, so it cannot be
//      lost. See `pdfUnicodeTextString`.
//
// A quiet third case is the **byte string** slot (`/F` of a file specification), where the specification
// really does expect bytes; `pdfByteStringLiteral` escapes for that and keeps the ASCII-only rule, with
// `/UF` carrying the Unicode name next to it.
//
// Six call sites used to escape on their own, and none of them could be fixed by editing one of the others.
// They all ask this module now.

/**
 * The code points where CP1252 differs from Latin-1: 0x80–0x9F.
 *
 * Everything else is identity — `0x20`–`0x7E` and `0xA0`–`0xFF` map to themselves, which is exactly why
 * German umlauts (`0xE4`, `0xF6`, `0xFC`, `0xDF`) survive a round trip through a PDF string.
 */
const WIN_ANSI_SPECIALS: Readonly<Record<string, number>> = Object.freeze({
  '\u20AC': 0x80, // €
  '\u201A': 0x82, // ‚
  '\u0192': 0x83, // ƒ
  '\u201E': 0x84, // „
  '\u2026': 0x85, // …
  '\u2020': 0x86, // †
  '\u2021': 0x87, // ‡
  '\u02C6': 0x88, // ˆ
  '\u2030': 0x89, // ‰
  '\u0160': 0x8A, // Š
  '\u2039': 0x8B, // ‹
  '\u0152': 0x8C, // Œ
  '\u017D': 0x8E, // Ž
  '\u2018': 0x91, // '
  '\u2019': 0x92, // '
  '\u201C': 0x93, // "
  '\u201D': 0x94, // "
  '\u2022': 0x95, // •
  '\u2013': 0x96, // –
  '\u2014': 0x97, // —
  '\u02DC': 0x98, // ˜
  '\u2122': 0x99, // ™
  '\u0161': 0x9A, // š
  '\u203A': 0x9B, // ›
  '\u0153': 0x9C, // œ
  '\u017E': 0x9E, // ž
  '\u0178': 0x9F, // Ÿ
});

/** The byte CP1252 assigns to a code point, or `null` when the code point is outside it. */
function winAnsiByte(codePoint: number): number | null {
  if (codePoint >= 0x20 && codePoint <= 0x7E) return codePoint;
  if (codePoint >= 0xA0 && codePoint <= 0xFF) return codePoint;
  return WIN_ANSI_SPECIALS[String.fromCodePoint(codePoint)] ?? null;
}

/**
 * The WinAnsi byte string for `text` — one character per byte, code units ≤ 0xFF — or `null` when at least
 * one character cannot be carried (CJK, Cyrillic, Greek, Hebrew, emoji, …).
 */
export function encodePdfWinAnsi(text: string): string | null {
  let encoded = '';
  for (const character of text) {
    const byte = winAnsiByte(character.codePointAt(0) ?? 0);
    if (byte === null) return null;
    encoded += String.fromCharCode(byte);
  }
  return encoded;
}

export function isPdfWinAnsiRepresentable(text: string): boolean {
  return encodePdfWinAnsi(text) !== null;
}

/**
 * A PDF literal for **content text** drawn with a base font that declares `/Encoding /WinAnsiEncoding`.
 *
 * Bytes outside printable ASCII become octal escapes (`\374` for `ü`). That is not cosmetic: PDF streams
 * are serialised as UTF-8 in this codebase, so a raw `ü` would leave as two bytes and a reader would show
 * mojibake. Octal escapes keep the stream pure ASCII, the `/Length` values stay correct, and the font
 * encoding maps the byte back to the character.
 *
 * A character outside WinAnsi becomes `?` **per character** — visible, never silent. Callers that own a
 * rasteriser (the Writer PDF) ask `encodePdfWinAnsi` first and draw a picture instead.
 */
export function pdfWinAnsiLiteral(text: string): string {
  // Per character, never per string: a line that mixes German with Japanese keeps its umlauts and marks
  // only what it cannot carry. My first version fell back to `?` for the whole string, which the test
  // caught by expecting `Gr\374\337e ??` and receiving `Gr??e ??`.
  let bytes = '';
  for (const character of text) {
    const encoded = encodePdfWinAnsi(character);
    bytes += encoded ?? '?';
  }
  // Order matters: the literal escaping runs first, the octal escapes last, so the backslashes they
  // introduce are not escaped again.
  return escapePdfLiteral(bytes).replace(
    /[^\x20-\x7E]/g,
    (character) => `\\${(character.charCodeAt(0) & 0xFF).toString(8).padStart(3, '0')}`,
  );
}

/** Escape a byte string for a PDF literal: backslash and both parentheses. */
export function escapePdfLiteral(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

/**
 * A PDF literal for a **byte string** slot — `/F` of a file specification and the like.
 *
 * The PDF specification expects bytes there, so non-ASCII cannot be carried; `?` is the visible marker. A
 * Unicode name belongs in the neighbouring `/UF` entry, which takes a text string.
 */
export function pdfByteStringLiteral(text: string): string {
  return escapePdfLiteral(text.normalize('NFC').replace(/[^\x20-\x7E]/gu, '?'));
}

/**
 * A PDF literal for a **URI** action — canonicalised, not question-marked (W-302).
 *
 * W-302, measured: writers put a link target into `/URI (...)`, and two of them damaged it — PDF Studio's
 * direct-edit annotations turned `größe` into `gr??e`, and Publish's `vgt://` URIs lost spaces and umlauts.
 * In both cases the document shipped a link to a **different address**, silently. (The Writer was already
 * safe: it routes every link through `evaluateRichTextLink`, which canonicalises with `new URL`.)
 *
 * A URI is a byte string in the PDF, but non-ASCII belongs in it as UTF-8 percent-encoding (RFC 3986).
 *
 * **`new URL(value).toString()` does that mapping, and it is idempotent** — measured: an already encoded
 * `%C3%B6` stays as it is, a raw `ö` becomes `%C3%B6`, a space becomes `%20`. My first version used
 * `encodeURI`, which encodes the `%` of an already encoded URI **again** (`%C3%B6` → `%25C3%25B6`) and would
 * therefore have broken every link that was already correct. A test I wrote for that case caught it.
 *
 * For a URI that does not parse (a relative path, say) the characters are encoded one by one: everything
 * outside printable ASCII **except the space** keeps its meaning, while the space and every non-ASCII
 * character are percent-encoded. A space is not legal in a URI either, which my first fallback got wrong.
 */
export function pdfUriByteStringLiteral(uri: string): string {
  const normalized = uri.normalize('NFC');
  let canonical: string;
  try {
    canonical = new URL(normalized).toString();
  } catch {
    canonical = normalized.replace(/[^\x21-\x7E]/gu, (character) => encodeURIComponent(character));
  }
  return escapePdfLiteral(canonical);
}

/**
 * A PDF **text string** for metadata and labels: UTF-16BE with a byte-order mark, in hex form.
 *
 * `<FEFF00470072...>` needs no font and no encoding entry, so a title, an outline entry, a form field name,
 * an annotation text, a signer name or an attachment name keeps every character — including the ones
 * WinAnsi cannot carry at all.
 */
export function pdfUnicodeTextString(text: string): string {
  let hex = 'FEFF';
  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint > 0xFFFF) {
      // A surrogate pair: UTF-16BE wants both halves.
      const offset = codePoint - 0x10000;
      const high = 0xD800 + (offset >> 10);
      const low = 0xDC00 + (offset & 0x3FF);
      hex += high.toString(16).padStart(4, '0').toUpperCase();
      hex += low.toString(16).padStart(4, '0').toUpperCase();
      continue;
    }
    hex += codePoint.toString(16).padStart(4, '0').toUpperCase();
  }
  return `<${hex}>`;
}

/** A metadata slot refused its value because of its length. Concrete on purpose: it names field and limit. */
export class PdfMetadataTextLimitError extends Error {
  constructor(readonly field: string, readonly length: number, readonly maxCharacters: number) {
    super(`${field} exceeds the ${maxCharacters}-character PDF metadata limit (${length} characters).`);
    this.name = 'PdfMetadataTextLimitError';
  }
}

/**
 * A PDF **text string** for a metadata slot that also has a delivery limit (`/Name`, `/Reason`, `/Location` of a
 * signature dictionary, for example) — the one rule for that case, next to `pdfUnicodeTextString`.
 *
 * Two decisions are written down because the previous code got both wrong in a way nobody could see:
 *
 *   1. **It refuses instead of cutting.** `apps/pdf/signatures/incremental/pdfIncrementalSignature.ts` had its
 *      own function — misleadingly named `escapePdfLiteral`, the name this module already uses for delimiter
 *      escaping — that ran `value.slice(0, maxLength)`; a caller outside the dialog (a programmatic signer, a
 *      future plugin) lost the tail of a reason or a name without any signal. An over-long value now throws a
 *      `PdfMetadataTextLimitError` that names the field and the limit.
 *   2. **It does not strip control characters.** The old path removed `[\x00-\x1F\x7F]` silently. Those code
 *      units are ordinary content of a PDF **text string** — the output here is hex (`<FEFF...>`), never a
 *      literal `(...)`, so a newline in a reason is carried, not deleted.
 */
export function pdfMetadataTextString(value: string, maxCharacters: number, field: string): string {
  if (!Number.isSafeInteger(maxCharacters) || maxCharacters < 1) {
    throw new TypeError('PDF metadata limit must be a positive integer');
  }
  if (value.length > maxCharacters) throw new PdfMetadataTextLimitError(field, value.length, maxCharacters);
  return pdfUnicodeTextString(value);
}
