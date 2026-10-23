// STATUS: DIAMANT VGT SUPREME — the acceptance fixture: a business letter
//
// Paket 48 acceptance: "Geschäftsbrief mit Überschriften, Tabelle, Bild, mehrseitigem Text und
// PDF/DOCX erstellen."
//
// This is that letter as a real `WorkspaceDocument`, built from the canonical contracts:
//   • heading level 1 (sender line/letterhead), heading level 2 for "Betreff" and the sections,
//   • body text long enough to run over several pages,
//   • a table anchored to a paragraph, the way the Writer stores one,
//   • an image anchored to a paragraph, with a real (tiny) PNG data URL,
//   • page setup, header and footer as a business letter would have them.
//
// The fixture is a **document**, not a mock: everything in it goes through the same export paths the
// application uses. `LETTER_PNG_DATA_URL` is a 2×2 pixel PNG — small enough to keep the test fast and
// real enough that the bytes must actually be embedded.
import type {
  Paragraph,
  WriterImageBlockData,
  WriterPageSetupConfig,
  WriterTableCellData,
  WriterTableBlockData,
  WriterTableRowData,
  WorkspaceDocument,
} from '../../../../shared/contracts/workspace';

/** A real 2×2 PNG (red, green, blue, white) — decoded, not a placeholder string. */
export const LETTER_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8Dwn4GBgYGJAQ0AAB6nAgHq0C4gAAAAAElFTkSuQmCC';

export const LETTER_PAGE_SETUP: WriterPageSetupConfig = {
  paperSize: 'A4',
  orientation: 'portrait',
  margins: 'normal',
  paperColor: 'white',
  showPageNumbers: true,
  headerText: 'VisionGaia Technology GmbH · Musterstraße 1 · 12345 Musterstadt',
  footerText: 'Seite {PAGE} von {NUMPAGES}',
};

export function letterParagraph(id: string, text: string, style: Record<string, unknown> = {}): Paragraph {
  return {
    id,
    spans: [{ text }],
    style: {
      style_name: 'normal',
      alignment: 'left',
      line_height: 1.25,
      space_before: 0,
      space_after: 4,
      ...style,
    },
  } as unknown as Paragraph;
}

const heading = (id: string, level: number, text: string): Paragraph =>
  letterParagraph(id, text, { style_name: `Heading ${level}`, heading_level: level });

/** Body text that realistically fills more than one A4 page. */
const BODY_PARAGRAPHS: readonly string[] = [
  'vielen Dank für Ihre Anfrage und das angenehme Gespräch am vergangenen Dienstag. Gern fasse ich unseren aktuellen Stand zusammen und gehe auf die Punkte ein, die Sie besonders hervorgehoben haben.',
  'Die von Ihnen gewünschte Auswertung liegt vollständig vor. Wir haben die Kennzahlen der vergangenen vier Quartale gegenübergestellt, die Auffälligkeiten einzeln geprüft und die Abweichungen dokumentiert, die einer Erklärung bedurften.',
  'Für die Umsetzung schlage ich ein Vorgehen in drei Abschnitten vor. Der erste Abschnitt umfasst die Aufnahme des Ist-Zustands, der zweite die Überführung in die neue Struktur und der dritte die Abnahme mit einer gemeinsamen Durchsicht der Ergebnisse.',
  'Bitte prüfen Sie die beigefügte Aufstellung und teilen Sie mir mit, ob die Annahmen zu den Mengen und Preisen aus Ihrer Sicht zutreffend sind. Sobald Ihre Rückmeldung vorliegt, erstelle ich das verbindliche Angebot.',
  'Für Rückfragen stehe ich Ihnen gern zur Verfügung. Sie erreichen mich werktags zwischen acht und achtzehn Uhr unter der bekannten Durchwahl oder jederzeit per E-Mail.',
];

export function buildBusinessLetter(): WorkspaceDocument {
  const paragraphs: Paragraph[] = [
    heading('letter-h1', 1, 'VisionGaia Technology GmbH'),
    letterParagraph('letter-date', 'Musterstadt, 10. Oktober 2026', { alignment: 'right' }),
    heading('letter-h2-subject', 2, 'Betreff: Auswertung Ihrer Anfrage vom 28. September 2026'),
    letterParagraph('letter-salutation', 'Sehr geehrte Frau Beispiel,'),
    ...BODY_PARAGRAPHS.map((text, index) => letterParagraph(`letter-body-${index + 1}`, text)),
    heading('letter-h2-table', 2, 'Aufstellung der Positionen'),
    letterParagraph('letter-table-anchor', 'Die folgende Aufstellung fasst die besprochenen Positionen zusammen:'),
    heading('letter-h2-figure', 2, 'Schaubild'),
    letterParagraph('letter-image-anchor', 'Das Schaubild zeigt den Verlauf über die vier Quartale:'),
    letterParagraph('letter-closing', 'Mit freundlichen Grüßen'),
    letterParagraph('letter-signature', 'Anna Beispiel\nGeschäftsführung'),
    ...Array.from({ length: 18 }, (_, index) =>
      letterParagraph(`letter-appendix-${index + 1}`, `Anlage ${index + 1}: ergänzende Angaben zur Auswertung, Abschnitt ${index + 1}.`),
    ),
  ];

  const cell = (id: string, content: string): WriterTableCellData => ({ id, content });
  const row = (id: string, contents: readonly string[]): WriterTableRowData => ({
    id,
    cells: contents.map((content, index) => cell(`${id}-c${index + 1}`, content)),
  });
  // The shape is checked by the compiler, not asserted away: my first version used `{ text }` and a
  // `as unknown as` cast, and the PDF export crashed on the missing `content` (W-289).
  const table: WriterTableBlockData = {
    id: 'letter-table-1',
    anchorParagraphId: 'letter-table-anchor',
    columns: ['Position', 'Menge', 'Einzelpreis', 'Summe'],
    // `columns` is the header row — the exporter writes it bold and (with `repeatHeaderRow`) repeats it
    // on every page. My first version added a header row of its own as well, and the letter showed the
    // header twice. `rows` carries data only.
    rows: [
      row('letter-row-1', ['Auswertung', '1', '1.200,00 €', '1.200,00 €']),
      row('letter-row-2', ['Dokumentation', '4', '180,00 €', '720,00 €']),
      row('letter-row-3', ['Abnahme', '1', '350,00 €', '350,00 €']),
    ],
    repeatHeaderRow: true,
    headerRowHighlight: true,
    firstColumnHighlight: true,
  };

  const image: WriterImageBlockData = {
    id: 'letter-image-1',
    name: 'verlauf.png',
    dataUrl: LETTER_PNG_DATA_URL,
    intrinsicWidth: 2,
    intrinsicHeight: 2,
    widthPercent: 60,
    alignment: 'center',
    altText: 'Verlauf der Kennzahlen über vier Quartale',
    caption: 'Abbildung 1: Verlauf der Kennzahlen',
    captionPosition: 'below',
    anchorParagraphId: 'letter-image-anchor',
    placement: 'block',
  };

  return {
    schema_version: 2,
    id: 'acceptance-business-letter',
    title: 'Geschäftsbrief – Auswertung Ihrer Anfrage',
    kind: 'Writer',
    created_at: 1_760_000_000_000,
    modified_at: 1_760_000_000_000,
    version: 1,
    theme_id: 'default',
    root_object_ids: ['letter-text'],
    objects: {
      'letter-text': {
        type: 'TextBlock',
        data: { id: 'letter-text', paragraphs },
      },
    },
    writerData: {
      pageSetup: LETTER_PAGE_SETUP,
      tables: [table],
      images: [image],
      sections: [],
      comments: [],
      footnotes: [],
      endnotes: [],
      equations: [],
      bookmarks: [],
      namedVersions: [],
    },
  } as unknown as WorkspaceDocument;
}
