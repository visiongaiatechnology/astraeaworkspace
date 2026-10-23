// STATUS: DIAMANT VGT SUPREME
// The one place that reads a classic PDF trailer dictionary out of serialized bytes.
//
// ## Why this module exists
//
// Two verification passes in this application asked questions about the document **structure** and answered
// them with file-wide regular expressions — and both were wrong in the same way, because a PDF key is not
// unique to one structure:
//
//   * `security/sanitization/pdfStructuredSanitization.ts` tested `/\/Prev\s+\d+/` to detect an incremental
//     revision. `/Prev` is also the standard key for the **previous sibling in an outline tree**, which the
//     same exporter writes for every document with more than one heading — so sanitizing any multi-page
//     document with bookmarks failed with "incremental revision history remains" on its own correct output.
//   * the same file tested `/\/(Title|Author|…)\b/` to detect descriptive Info metadata. Outline items carry
//     `/Title` too, so the sanitizer also rejected its own correct output with "descriptive Info metadata
//     remains".
//
// In a classic-xref PDF both questions have one correct answer, and it is scoped to the **trailer**: `/Prev`
// inside the trailer dictionary is the incremental-revision chain, and `/Info N 0 R` names the information
// dictionary whose keys are the descriptive metadata. This module resolves that trailer once; the two passes
// ask it instead of pattern-matching their own output.

/** The serialized trailer's `<< … >>` dictionary, or a named failure when the xref tail is unreadable. */
export function pdfTrailerDictionary(serialized: string): string {
  if (typeof serialized !== 'string' || serialized.length === 0) throw new Error('PDF xref trailer could not be verified.');
  const startXref = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(serialized);
  if (!startXref) throw new Error('PDF xref trailer could not be verified.');

  const xrefOffset = Number(startXref[1]);
  if (!Number.isSafeInteger(xrefOffset) || xrefOffset < 0 || !serialized.startsWith('xref\n', xrefOffset)) {
    throw new Error('PDF xref trailer could not be verified.');
  }

  const trailerOffset = serialized.indexOf('trailer\n', xrefOffset + 'xref\n'.length);
  const dictionaryStart = trailerOffset + 'trailer\n'.length;
  if (trailerOffset < 0 || !serialized.startsWith('<<', dictionaryStart)) {
    throw new Error('PDF xref trailer could not be verified.');
  }

  const dictionaryEnd = serialized.indexOf('>>', dictionaryStart + 2);
  if (dictionaryEnd < 0) throw new Error('PDF xref trailer could not be verified.');
  return serialized.slice(dictionaryStart, dictionaryEnd + 2);
}

/**
 * True when the trailer chains a second cross-reference section: the file carries an **incremental revision**.
 *
 * The test is scoped to the trailer dictionary on purpose — a `/Prev` inside an outline tree is a sibling
 * link, not a revision.
 */
export function hasPdfIncrementalRevisionPointer(serialized: string): boolean {
  return /\/Prev\s+\d+\b/u.test(pdfTrailerDictionary(serialized));
}

/**
 * The entries of the information dictionary the trailer points at (`/Info N 0 R`), or the empty string when
 * the document has no information dictionary.
 *
 * Only these entries are descriptive document metadata. A `/Title` anywhere else in the file — an outline
 * item, a form field's tooltip, a page label — is document content, not metadata.
 */
export function pdfInfoDictionaryEntries(serialized: string): string {
  const trailer = pdfTrailerDictionary(serialized);
  const info = /\/Info\s+(\d+)\s+\d+\s+R\b/u.exec(trailer);
  if (!info) return '';
  const objectStart = serialized.indexOf(`\n${info[1]} 0 obj`);
  if (objectStart < 0) throw new Error(`PDF information object ${info[1]} named by the trailer is missing.`);
  const objectEnd = serialized.indexOf('endobj', objectStart);
  const body = serialized.slice(objectStart, objectEnd < 0 ? serialized.length : objectEnd);
  const dictionaryStart = body.indexOf('<<');
  const dictionaryEnd = body.lastIndexOf('>>');
  if (dictionaryStart < 0 || dictionaryEnd <= dictionaryStart) throw new Error(`PDF information object ${info[1]} is not a dictionary.`);
  return body.slice(dictionaryStart, dictionaryEnd + 2);
}
