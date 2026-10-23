// STATUS: DIAMANT VGT SUPREME — one definition of "what this export cannot carry"
//
// Findings closed by this module (all three are the same disease: content was dropped and nobody said
// so — the register calls it "never let a failure be silent"):
//
//   W-177  the import never reports what it left out: images, notes, comments and revisions disappear
//          without a notice, so the user only learns of it from the missing content.
//   W-181  tables, images, footnotes and headers/footers do not survive ODT/RTF; the exporters do not
//          write them and the readers do not look for them, and nothing is reported.
//   W-196  exporting to Markdown or TXT does not report what is lost (alignment, font size, colour,
//          underline).
//
// The point of a single module: "does this format carry images?" used to be answered implicitly by each
// exporter (by simply not writing them). One table answers it for every format, and the exporters and
// the surface read the same answer — so a format that gains a capability cannot leave a stale warning
// behind, and a format that lacks one cannot stay silent.
//
// Deliberately **not** a generic diff engine: it describes what the *format* cannot carry plus what the
// *document* actually contains. Nothing is inferred from the produced bytes.
import type { Paragraph } from '../../../../shared/contracts/workspace';
import type { ImageBlockData, TableBlockData, EquationBlockData, FootnoteItem } from '../../types';
import type { WriterPortableFormat } from './writerPortableTypes';

/** How bad the loss is. `content` means data is gone; `formatting` means it still reads, differently. */
export type WriterInterchangeLossSeverity = 'content' | 'formatting';

export type WriterInterchangeLossKind =
  | 'image'
  | 'table'
  | 'equation'
  | 'note'
  | 'header-footer'
  | 'comment'
  | 'revision'
  /** WR-042: free vector shapes have no exporter in any portable format. */
  | 'shape'
  /** WR-042: embedded audio/video objects have no exporter either. */
  | 'media-object'
  | 'alignment'
  | 'font-size'
  | 'color'
  | 'underline'
  /** WR-042: paragraph spacing (`space_before`/`space_after`) is not carried by every format. */
  | 'paragraph-spacing'
  | 'list-numbering';

export interface WriterInterchangeLoss {
  readonly kind: WriterInterchangeLossKind;
  readonly severity: WriterInterchangeLossSeverity;
  /** How many items of this kind the document contains — the number the user can check. */
  readonly count: number;
  /** One sentence, ready to show. Names the format and the count. */
  readonly message: string;
}

export interface WriterInterchangeLossReport {
  readonly format: WriterPortableFormat;
  readonly losses: readonly WriterInterchangeLoss[];
  /** True when at least one loss is of severity `content` — the export is incomplete. */
  readonly hasContentLoss: boolean;
  /** True when there is anything to say at all. */
  readonly hasLosses: boolean;
}

/**
 * What each export format can carry.
 *
 * `false` means "the exporter does not write this and the reader does not look for it", which is the
 * measured state of the interop code — not an intention. Changing an entry without changing the
 * exporter would be a claim, so the contract test pins the two together.
 */
export interface WriterFormatCapabilities {
  readonly images: boolean;
  readonly tables: boolean;
  readonly equations: boolean;
  readonly notes: boolean;
  readonly headerFooter: boolean;
  readonly comments: boolean;
  readonly revisions: boolean;
  readonly alignment: boolean;
  readonly fontSize: boolean;
  readonly color: boolean;
  readonly underline: boolean;
  readonly listNumbering: boolean;
  /** WR-042: measured — no portable exporter writes free shapes. */
  readonly shapes: boolean;
  /** WR-042: measured — no portable exporter writes audio/video objects. */
  readonly mediaObjects: boolean;
  /** WR-042: DOCX and ODT write `space_before`/`space_after`; the other formats do not. */
  readonly paragraphSpacing: boolean;
}

export const WRITER_FORMAT_CAPABILITIES: Readonly<Record<WriterPortableFormat, WriterFormatCapabilities>> = Object.freeze({
  // DOCX carries everything the model has: images, tables, headings **and equations**
  // (`platform/interop/docx/exporter.ts` writes OMML, the importer reads it back).
  docx: {
    images: true, tables: true, equations: true, notes: false, headerFooter: true,
    comments: false, revisions: false, alignment: true, fontSize: true, color: true,
    underline: true, listNumbering: true, shapes: false, mediaObjects: false, paragraphSpacing: true,
  },
  // ODT: paragraphs, runs, headings, alignment and paragraph spacing (W-181/W-184).
  odt: {
    images: false, tables: false, equations: false, notes: false, headerFooter: false,
    comments: false, revisions: false, alignment: true, fontSize: true, color: true,
    underline: true, listNumbering: false, shapes: false, mediaObjects: false, paragraphSpacing: true,
  },
  rtf: {
    images: false, tables: false, equations: false, notes: false, headerFooter: false,
    comments: false, revisions: false, alignment: true, fontSize: true, color: false,
    underline: true, listNumbering: false, shapes: false, mediaObjects: false, paragraphSpacing: false,
  },
  html: {
    images: false, tables: false, equations: false, notes: false, headerFooter: false,
    comments: false, revisions: false, alignment: false, fontSize: false, color: false,
    underline: true, listNumbering: true, shapes: false, mediaObjects: false, paragraphSpacing: false,
  },
  markdown: {
    images: false, tables: false, equations: false, notes: false, headerFooter: false,
    comments: false, revisions: false, alignment: false, fontSize: false, color: false,
    underline: false, listNumbering: true, shapes: false, mediaObjects: false, paragraphSpacing: false,
  },
  txt: {
    images: false, tables: false, equations: false, notes: false, headerFooter: false,
    comments: false, revisions: false, alignment: false, fontSize: false, color: false,
    underline: false, listNumbering: false, shapes: false, mediaObjects: false, paragraphSpacing: false,
  },
});

/** What a document of this shape contains, as counts the report can quote. */
export interface WriterInterchangeDocumentContent {
  readonly images: number;
  readonly tables: number;
  readonly equations: number;
  readonly notes: number;
  readonly hasHeaderFooter: boolean;
  readonly comments: number;
  readonly revisions: number;
  readonly alignedParagraphs: number;
  readonly colouredSpans: number;
  readonly sizedSpans: number;
  readonly underlinedSpans: number;
  readonly numberedItems: number;
  /** WR-042: objects no portable exporter can write. */
  readonly shapes?: number;
  readonly mediaObjects?: number;
  /** WR-042: paragraphs that carry a semantic `space_before`/`space_after`. */
  readonly spacedParagraphs?: number;
}

const FORMAT_LABEL: Readonly<Record<WriterPortableFormat, string>> = {
  docx: 'DOCX',
  odt: 'ODT',
  rtf: 'RTF',
  html: 'HTML',
  markdown: 'Markdown',
  txt: 'TXT',
};

/** Counts what the document carries, from the parts the export actually has at hand. */
export function measureWriterInterchangeContent(input: {
  paragraphs: readonly Paragraph[];
  images?: readonly ImageBlockData[];
  tables?: readonly TableBlockData[];
  equations?: readonly EquationBlockData[];
  notes?: readonly FootnoteItem[];
  comments?: number;
  revisions?: number;
  headerText?: string;
  footerText?: string;
  /** WR-042: shapes and media objects are objects no portable format writes. */
  shapes?: readonly unknown[];
  mediaObjects?: readonly unknown[];
}): WriterInterchangeDocumentContent {
  const paragraphs = input.paragraphs;
  let colouredSpans = 0;
  let sizedSpans = 0;
  let underlinedSpans = 0;
  for (const paragraph of paragraphs) {
    for (const span of paragraph.spans) {
      if (span.text_color || span.background_color || span.highlight_color) colouredSpans += 1;
      if (typeof span.font_size_pt === 'number') sizedSpans += 1;
      if (span.underline) underlinedSpans += 1;
    }
  }
  return {
    images: input.images?.length ?? 0,
    tables: input.tables?.length ?? 0,
    equations: input.equations?.length ?? 0,
    notes: input.notes?.length ?? 0,
    hasHeaderFooter: Boolean((input.headerText ?? '').trim() || (input.footerText ?? '').trim()),
    comments: input.comments ?? 0,
    revisions: input.revisions ?? 0,
    alignedParagraphs: paragraphs.filter((paragraph) => (paragraph.style.alignment ?? 'left') !== 'left').length,
    colouredSpans,
    sizedSpans,
    underlinedSpans,
    numberedItems: paragraphs.filter((paragraph) => paragraph.style.list_style === 'number').length,
    shapes: input.shapes?.length ?? 0,
    mediaObjects: input.mediaObjects?.length ?? 0,
    spacedParagraphs: paragraphs.filter((paragraph) => (
      Number.isFinite(paragraph.style.space_before) && (paragraph.style.space_before ?? 0) > 0
    )).length,
  };
}

function loss(
  format: WriterPortableFormat,
  kind: WriterInterchangeLossKind,
  severity: WriterInterchangeLossSeverity,
  count: number,
  noun: string,
): WriterInterchangeLoss {
  const label = FORMAT_LABEL[format];
  const what = count === 1 ? `1 ${noun}` : `${count} ${noun}`;
  return {
    kind,
    severity,
    count,
    message: severity === 'content'
      ? `${label} kann ${what} nicht speichern; ${count === 1 ? 'es fehlt' : 'sie fehlen'} in der exportierten Datei.`
      : `${label} speichert die Formatierung von ${what} nicht.`,
  };
}

/**
 * Builds the report for one export.
 *
 * Order is fixed (content losses first, then formatting) so two runs on the same document produce the
 * same list, and the surface does not reshuffle between exports.
 */
export function buildWriterInterchangeLossReport(
  format: WriterPortableFormat,
  content: WriterInterchangeDocumentContent,
): WriterInterchangeLossReport {
  const capabilities = WRITER_FORMAT_CAPABILITIES[format];
  const losses: WriterInterchangeLoss[] = [];
  const contentLoss = (kind: WriterInterchangeLossKind, count: number, noun: string): void => {
    if (count > 0) losses.push(loss(format, kind, 'content', count, noun));
  };
  const formattingLoss = (kind: WriterInterchangeLossKind, count: number, noun: string): void => {
    if (count > 0) losses.push(loss(format, kind, 'formatting', count, noun));
  };

  if (!capabilities.images) contentLoss('image', content.images, 'Bild(er)');
  if (!capabilities.tables) contentLoss('table', content.tables, 'Tabelle(n)');
  if (!capabilities.equations) contentLoss('equation', content.equations, 'Formel(n)');
  if (!capabilities.notes) contentLoss('note', content.notes, 'Fußnote(n)');
  contentLoss('header-footer', capabilities.headerFooter || !content.hasHeaderFooter ? 0 : 1, 'Kopf-/Fußzeile');
  contentLoss('comment', capabilities.comments ? 0 : content.comments, 'Kommentar(e)');
  contentLoss('revision', capabilities.revisions ? 0 : content.revisions, 'Revision(en)');
  // WR-042: shapes and media objects had no vocabulary at all, so "vollständig" was printed for
  // documents whose drawings and audio/video vanished.
  if (!capabilities.shapes) contentLoss('shape', content.shapes ?? 0, 'Vektorform(en)');
  if (!capabilities.mediaObjects) contentLoss('media-object', content.mediaObjects ?? 0, 'Medienobjekt(e)');

  if (!capabilities.alignment) formattingLoss('alignment', content.alignedParagraphs, 'ausgerichtete(n) Absatz/Absätze');
  if (!capabilities.fontSize) formattingLoss('font-size', content.sizedSpans, 'Textlauf/Textläufe mit Schriftgröße');
  if (!capabilities.color) formattingLoss('color', content.colouredSpans, 'eingefärbte(r) Textlauf/Textläufe');
  if (!capabilities.underline) formattingLoss('underline', content.underlinedSpans, 'unterstrichene(r) Textlauf/Textläufe');
  if (!capabilities.paragraphSpacing) formattingLoss('paragraph-spacing', content.spacedParagraphs ?? 0, 'Absatz/Absätze mit Abstand');
  if (!capabilities.listNumbering) formattingLoss('list-numbering', content.numberedItems, 'nummerierte(r) Absatz/Absätze');

  return {
    format,
    losses,
    hasContentLoss: losses.some((entry) => entry.severity === 'content'),
    hasLosses: losses.length > 0,
  };
}

/** One line for the surface: either "nothing lost" or the first content loss plus a count of the rest. */
export function describeWriterInterchangeLoss(report: WriterInterchangeLossReport): string {
  if (!report.hasLosses) return `${FORMAT_LABEL[report.format]}-Export vollständig.`;
  const content = report.losses.filter((entry) => entry.severity === 'content');
  const first = content[0] ?? report.losses[0];
  if (!first) return `${FORMAT_LABEL[report.format]}-Export vollständig.`;
  const rest = report.losses.length - 1;
  return rest === 0 ? first.message : `${first.message} (und ${rest} weitere Angabe(n) zum Verlust)`;
}

/** The formatting-only part, phrased as advice rather than as a failure. */
export function describeWriterInterchangeFormattingLoss(report: WriterInterchangeLossReport): string | null {
  const formatting = report.losses.filter((entry) => entry.severity === 'formatting');
  if (formatting.length === 0) return null;
  return formatting.map((entry) => entry.message).join(' ');
}

/**
 * W-177 (import half) — the DOCX import's omissions, in this module's vocabulary.
 *
 * The platform reporter (`platform/interop/docx/import/importOmissions`) counts what the reader walked
 * past; this function translates those counts into the **same** loss entries every export produces, so
 * the surface, the wording and the tests stay one mechanism. A second vocabulary would be the defect the
 * register keeps recording.
 */
export function buildWriterImportLossReport(
  omissions: {
    readonly omissions: readonly { readonly kind: string; readonly count: number }[];
    readonly hasOmissions: boolean;
  },
  /**
   * The format of the file that was read. Defaults to `docx`, so the existing DOCX call is unchanged.
   * The message names the reader that skipped the part, because "which import lost this" is the first
   * thing a user needs to know.
   */
  source: 'docx' | 'odt' = 'docx',
): WriterInterchangeLossReport {
  const sourceLabel = source === 'odt' ? 'ODT' : 'DOCX';
  const losses: WriterInterchangeLoss[] = [];
  for (const omission of omissions.omissions) {
    if (omission.count <= 0) continue;
    const count = omission.count;
    const what = count === 1 ? '1' : String(count);
    switch (omission.kind) {
      case 'footnote':
        losses.push({ kind: 'note', severity: 'content', count, message: `Der ${sourceLabel}-Import hat ${what} Fußnotenverweis(e) nicht gelesen; die Notiz fehlt im Dokument.` });
        break;
      case 'endnote':
        losses.push({ kind: 'note', severity: 'content', count, message: `Der ${sourceLabel}-Import hat ${what} Endnotenverweis(e) nicht gelesen; die Notiz fehlt im Dokument.` });
        break;
      case 'comment':
        losses.push({ kind: 'comment', severity: 'content', count, message: `Der ${sourceLabel}-Import hat ${what} Kommentar(e) nicht gelesen; ${count === 1 ? 'er fehlt' : 'sie fehlen'} im Dokument.` });
        break;
      case 'tracked-change':
        losses.push({ kind: 'revision', severity: 'content', count, message: `Der ${sourceLabel}-Import hat ${what} nachverfolgte Änderung(en) als gewöhnlichen Text übernommen; die Änderungshistorie fehlt.` });
        break;
      // The ODF reader skips different parts, so its kinds are named separately.
      case 'image':
        losses.push({ kind: 'image', severity: 'content', count, message: `Der ${sourceLabel}-Import hat ${what} Bild(er) nicht gelesen; ${count === 1 ? 'es fehlt' : 'sie fehlen'} im Dokument.` });
        break;
      case 'table':
        losses.push({ kind: 'table', severity: 'content', count, message: `Der ${sourceLabel}-Import hat ${what} Tabelle(n) nicht gelesen; ${count === 1 ? 'sie fehlt' : 'sie fehlen'} im Dokument.` });
        break;
      case 'note':
        losses.push({ kind: 'note', severity: 'content', count, message: `Der ${sourceLabel}-Import hat ${what} Fußnote(n) nicht gelesen; ${count === 1 ? 'sie fehlt' : 'sie fehlen'} im Dokument.` });
        break;
      case 'frame':
        losses.push({ kind: 'image', severity: 'content', count, message: `Der ${sourceLabel}-Import hat ${what} positionierte(s) Objekt(e) (Rahmen) nicht gelesen; ${count === 1 ? 'es fehlt' : 'sie fehlen'} im Dokument.` });
        break;
      default:
        // An unknown kind is named rather than dropped: a silent omission in the omission report would
        // be the same disease one level up.
        losses.push({
          kind: 'note',
          severity: 'content',
          count,
          message: `Der ${sourceLabel}-Import hat ${what} Inhalt(e) der Art „${omission.kind}" nicht gelesen.`,
        });
        break;
    }
  }
  return {
    // The format of the **source** file. There is no exported format to name here.
    format: source,
    losses,
    hasContentLoss: losses.some((entry) => entry.severity === 'content'),
    hasLosses: losses.length > 0,
  };
}
