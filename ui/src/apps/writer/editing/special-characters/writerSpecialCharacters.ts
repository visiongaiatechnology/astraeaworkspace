// STATUS: PLATIN — Canonical Writer special-character catalog
export interface WriterSpecialCharacter {
  id: string;
  value: string;
  display: string;
  label: string;
  codePoint: string;
}

export interface WriterSymbolCategory {
  name: string;
  entries: readonly WriterSpecialCharacter[];
}

function entry(id: string, value: string, display: string, label: string): WriterSpecialCharacter {
  const scalar = value.codePointAt(0);
  if (scalar === undefined) throw new Error('Special-character entries require one Unicode scalar.');
  return { id, value, display, label, codePoint: `U+${scalar.toString(16).toUpperCase().padStart(4, '0')}` };
}

export const WRITER_SYMBOL_CATEGORIES: readonly WriterSymbolCategory[] = [
  {
    name: 'Geschützte Zeichen',
    entries: [
      entry('no-break-space', '\u00A0', 'NBSP', 'Geschütztes Leerzeichen'),
      entry('narrow-no-break-space', '\u202F', 'NNBSP', 'Schmales geschütztes Leerzeichen'),
      entry('non-breaking-hyphen', '\u2011', '‑', 'Geschützter Bindestrich'),
      entry('soft-hyphen', '\u00AD', 'SHY', 'Bedingter Trennstrich (Soft Hyphen)'),
      entry('word-joiner', '\u2060', 'WJ', 'Wortverbinder ohne sichtbares Zeichen'),
    ],
  },
  {
    name: 'Typografie',
    entries: [
      entry('em-dash', '—', '—', 'Geviertstrich'), entry('en-dash', '–', '–', 'Halbgeviertstrich'),
      entry('ellipsis', '…', '…', 'Auslassungspunkte'), entry('section', '§', '§', 'Paragraphenzeichen'),
      entry('pilcrow', '¶', '¶', 'Absatzmarke'), entry('bullet', '•', '•', 'Aufzählungspunkt'),
      entry('copyright', '©', '©', 'Copyright'), entry('registered', '®', '®', 'Eingetragene Marke'),
    ],
  },
  {
    name: 'Mathematik und Logik',
    entries: [
      entry('plus-minus', '±', '±', 'Plusminus'), entry('multiply', '×', '×', 'Multiplikation'),
      entry('divide', '÷', '÷', 'Division'), entry('not-equal', '≠', '≠', 'Ungleich'),
      entry('approximately', '≈', '≈', 'Ungefähr gleich'), entry('less-equal', '≤', '≤', 'Kleiner gleich'),
      entry('greater-equal', '≥', '≥', 'Größer gleich'), entry('infinity', '∞', '∞', 'Unendlich'),
      entry('sum', '∑', '∑', 'Summe'), entry('integral', '∫', '∫', 'Integral'), entry('pi', 'π', 'π', 'Pi'),
    ],
  },
  {
    name: 'Pfeile und Marken',
    entries: [
      entry('arrow-right', '→', '→', 'Pfeil rechts'), entry('arrow-left', '←', '←', 'Pfeil links'),
      entry('arrow-up', '↑', '↑', 'Pfeil oben'), entry('arrow-down', '↓', '↓', 'Pfeil unten'),
      entry('arrow-both', '↔', '↔', 'Pfeil beidseitig'), entry('check', '✓', '✓', 'Häkchen'),
      entry('star', '★', '★', 'Stern'), entry('empty-star', '☆', '☆', 'Leerer Stern'),
    ],
  },
] as const;

export function writerSpecialCharacter(id: string): WriterSpecialCharacter | undefined {
  return WRITER_SYMBOL_CATEGORIES.flatMap((category) => category.entries).find((item) => item.id === id);
}
