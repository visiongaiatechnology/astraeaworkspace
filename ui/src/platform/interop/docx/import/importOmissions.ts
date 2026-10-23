// STATUS: DIAMANT VGT SUPREME — what a DOCX import reads and what it must admit it does not
//
// W-177 (import half): the importer returns paragraphs, tables, images, equations, styles and
// header/footer — and says **nothing** about the parts it walked past. A foreign document with footnotes,
// comments or tracked changes imported "successfully" and the user only learned of the loss from the
// missing content.
//
// Design constraints, set by the orchestrator when this scope was widened:
//
//   * **Public signatures stay compatible.** Nothing in this module is called from `importDocx`, so no
//     importer's output can change. The reporter is a separate, pure function over the document XML.
//   * **Report, do not reinterpret.** Nothing here converts a skipped part into content; it only counts.
//   * The Writer's existing loss mechanism consumes the result — there is no second loss vocabulary.
//
// Deliberately *not* reported, because the measured importer **does** handle them: tables
// (`parseTables`), images (`parseDocxImages`), equations (`parseEquations`), headers/footers
// (`importSectionHeaderFooter`) and styles (`parseWriterStyles`). Reporting those would be a lie in the
// other direction.
//
// The counts come from the **reference markers** the reader skips (`w:footnoteReference`,
// `w:commentReference`, `w:ins`, `w:del`), not from the part files: counting definitions in
// `word/footnotes.xml` would also count the two separator entries every Word file carries.

/** One part of a DOCX this importer reads past. */
export type DocxImportOmissionKind = 'footnote' | 'endnote' | 'comment' | 'tracked-change';

export interface DocxImportOmission {
  readonly kind: DocxImportOmissionKind;
  /** How many markers of this kind the document body carries. */
  readonly count: number;
}

export interface DocxImportOmissions {
  readonly omissions: readonly DocxImportOmission[];
  /** True when the document carries at least one part this import does not read. */
  readonly hasOmissions: boolean;
  /**
   * True when `word/footnotes.xml` or `word/endnotes.xml` exists in the package.
   *
   * The document body can reference a note without the package part being present and vice versa, so
   * both signals are reported; `count` stays the number of markers the reader actually walked past.
   */
  readonly hasNoteParts: boolean;
}

/**
 * Counts the parts a DOCX import leaves behind.
 *
 * `xml` is `word/document.xml`. The function is pure, never throws on malformed input (a broken file is
 * refused earlier by `ensureXmlSize`/`importDocx`, not here) and makes no claim about content it cannot
 * see.
 */
export function reportDocxImportOmissions(
  xml: string,
  options: { readonly hasNoteParts?: boolean } = {},
): DocxImportOmissions {
  if (typeof xml !== 'string' || xml.length === 0) {
    return { omissions: [], hasOmissions: false, hasNoteParts: options.hasNoteParts === true };
  }

  const count = (pattern: RegExp): number => {
    const matches = xml.match(pattern);
    return matches ? matches.length : 0;
  };

  const footnoteMarkers = count(/<(?:[A-Za-z_][\w.-]*:)?footnoteReference\b/gu);
  const endnoteMarkers = count(/<(?:[A-Za-z_][\w.-]*:)?endnoteReference\b/gu);
  const commentMarkers = count(/<(?:[A-Za-z_][\w.-]*:)?commentReference\b/gu)
    + count(/<(?:[A-Za-z_][\w.-]*:)?annotationRef\b/gu);
  // Tracked changes: an insertion or deletion the reader keeps as plain text without marking it. Both
  // spellings OOXML uses are counted (`w:ins`/`w:del` and the `-s`-less variants some producers emit).
  const trackedChanges = count(/<(?:[A-Za-z_][\w.-]*:)?ins\b/gu)
    + count(/<(?:[A-Za-z_][\w.-]*:)?del\b/gu)
    + count(/<(?:[A-Za-z_][\w.-]*:)?moveFrom\b/gu)
    + count(/<(?:[A-Za-z_][\w.-]*:)?moveTo\b/gu);

  const omissions: DocxImportOmission[] = [];
  if (footnoteMarkers > 0) omissions.push({ kind: 'footnote', count: footnoteMarkers });
  if (endnoteMarkers > 0) omissions.push({ kind: 'endnote', count: endnoteMarkers });
  if (commentMarkers > 0) omissions.push({ kind: 'comment', count: commentMarkers });
  if (trackedChanges > 0) omissions.push({ kind: 'tracked-change', count: trackedChanges });

  return {
    omissions,
    hasOmissions: omissions.length > 0,
    hasNoteParts: options.hasNoteParts === true,
  };
}
