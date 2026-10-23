// STATUS: DIAMANT VGT SUPREME — RTF reader that keeps rich text
//
// Paket 37 acceptance: "Fremddatei öffnen, rich text ändern und wieder interoperabel
// exportieren" — with layout preserved.
//
// W-178: the previous reader threw the formatting away. It split on `\par`, deleted every
// `{…}` group **including its text**, dropped all control words and emitted exactly one
// plain span per paragraph with style `normal`. Measured consequences on a foreign file:
//   • `{\b fett}` lost the word "fett" entirely;
//   • `\'e4` (how Word writes "ä" under \ansicpg1252) stayed in the text as `\'e4`;
//   • bold, italic, underline, font size, alignment and headings were gone.
// Re-exporting therefore could not be interoperable: the information no longer existed.
//
// This reader walks the file character by character, keeps a **stack of formatting
// states** for nested groups, and skips only genuine destinations (font tables, style
// sheets, pictures …). Structure is counted, not guessed — the lesson from W-169.

export interface RtfRun {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  font_size_pt?: number;
  /** W-182: resolved from the colour table, so a colour survives the trip through RTF. */
  text_color?: string;
}

export interface RtfParagraph {
  alignment: 'left' | 'center' | 'right' | 'justify';
  headingLevel?: 1 | 2 | 3;
  runs: RtfRun[];
}

/** Groups whose content is not document text. */
const SKIPPED_DESTINATIONS = new Set([
  'fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'header', 'headerl', 'headerr',
  'headerf', 'footer', 'footerl', 'footerr', 'footerf', 'footnote', 'listtable',
  'listoverridetable', 'rsidtbl', 'generator', 'themedata', 'colorschememapping',
  'latentstyles', 'datastore', 'xmlnstbl', 'filetbl', 'revtbl', 'protusertbl',
]);

/** Windows-1252 differs from Latin-1 exactly in 0x80–0x9F. */
const CP1252_HIGH = [
  '\u20ac', '\u0081', '\u201a', '\u0192', '\u201e', '\u2026', '\u2020', '\u2021',
  '\u02c6', '\u2030', '\u0160', '\u2039', '\u0152', '\u008d', '\u017d', '\u008f',
  '\u0090', '\u2018', '\u2019', '\u201c', '\u201d', '\u2022', '\u2013', '\u2014',
  '\u02dc', '\u2122', '\u0161', '\u203a', '\u0153', '\u009d', '\u017e', '\u0178',
];

function cp1252(byte: number): string {
  if (byte >= 0x80 && byte <= 0x9f) return CP1252_HIGH[byte - 0x80] ?? '?';
  return String.fromCharCode(byte);
}

interface FormatState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  font_size_pt?: number;
  /** W-182: the colour resolved from `\cfN` through the document's colour table. */
  text_color?: string;
  alignment: RtfParagraph['alignment'];
  headingLevel?: 1 | 2 | 3;
}

const BASE_STATE: FormatState = { bold: false, italic: false, underline: false, alignment: 'left' };

function clone(state: FormatState): FormatState {
  return { ...state };
}

/** Groups entered after a `\*` marker are ignorable by definition. */
function isIgnorableMarker(rtf: string, groupStart: number): boolean {
  // `{\*` — the marker appears as the group's first control symbol.
  return /^\{\\\*/u.test(rtf.slice(groupStart, groupStart + 4));
}

/** The destination name of a group, i.e. the control word right after `{`. */
function groupDestination(rtf: string, groupStart: number): string | null {
  const match = /^\{\\([a-zA-Z]+)/u.exec(rtf.slice(groupStart, groupStart + 24));
  return match ? match[1]!.toLowerCase() : null;
}

/**
 * Reads an RTF document into paragraphs with formatting.
 *
 * Never throws on malformed input: an unterminated group simply ends at the end of the
 * file, and an unterminated paragraph is flushed at the end. A foreign file that is
 * slightly broken still yields its text.
 */
/**
 * W-182 — the reader did not read a colour at all.
 *
 * RTF addresses colours by index into the document's `\colortbl`, so the table has to be parsed before the
 * body can be understood. The table lives in a group the tokeniser **skips** (`colortbl` is in
 * `SKIPPED_DESTINATIONS`, correctly: it carries no text), which is why colour was invisible rather than
 * merely unsupported.
 *
 * A table entry is `\redN\greenN\blueN;` — the first entry is the automatic colour and has no index of its
 * own (that is what `\cf0` means), so the entries after it are numbered from 1.
 */
export function parseRtfColorTable(rtf: string): string[] {
  const start = rtf.indexOf('{\\colortbl');
  if (start < 0) return [];
  // The table ends at its closing brace; tracking depth is unnecessary because an entry contains no braces.
  const end = rtf.indexOf('}', start);
  if (end < 0) return [];
  const body = rtf.slice(start + '{\\colortbl'.length, end);
  const colors: string[] = [];
  for (const entry of body.split(';')) {
    const red = /\bred(-?\d+)/u.exec(entry);
    const green = /\bgreen(-?\d+)/u.exec(entry);
    const blue = /\bblue(-?\d+)/u.exec(entry);
    if (!red || !green || !blue) continue;
    colors.push(toHexColor(Number(red[1]), Number(green[1]), Number(blue[1])));
  }
  return colors;
}

function toHexColor(red: number, green: number, blue: number): string {
  const clamp = (value: number): number => Math.max(0, Math.min(255, Number.isFinite(value) ? Math.trunc(value) : 0));
  return `#${[red, green, blue].map((value) => clamp(value).toString(16).padStart(2, '0')).join('')}`;
}

export function parseRtfDocument(rtf: string): RtfParagraph[] {
  const paragraphs: RtfParagraph[] = [];
  // W-182: `\cfN` refers to this table; entry N is the (N+1)-th colour because `\cf0` is automatic.
  const colorTable = parseRtfColorTable(rtf);
  const stack: FormatState[] = [];
  let state = clone(BASE_STATE);
  let runs: RtfRun[] = [];
  let current: RtfRun | null = null;
  let skippedDepth = 0;
  let ucSkip = 1;
  let index = 0;

  const flushRun = () => {
    if (current && current.text.length > 0) runs.push(current);
    current = null;
  };

  const addText = (text: string) => {
    if (skippedDepth > 0 || text.length === 0) return;
    if (
      !current
      || current.bold !== state.bold
      || current.italic !== state.italic
      || current.underline !== state.underline
      || current.font_size_pt !== state.font_size_pt
      || current.text_color !== state.text_color
    ) {
      flushRun();
      current = {
        text: '',
        bold: state.bold,
        italic: state.italic,
        underline: state.underline,
        ...(state.font_size_pt === undefined ? {} : { font_size_pt: state.font_size_pt }),
        ...(state.text_color === undefined ? {} : { text_color: state.text_color }),
      };
    }
    current.text += text;
  };

  const endParagraph = () => {
    flushRun();
    if (runs.length === 0) {
      // A `\par` with no text still closes the paragraph; the heading level is a
      // paragraph property and must not leak into the next one.
      state.headingLevel = undefined;
      return;
    }
    paragraphs.push({
      alignment: state.alignment,
      ...(state.headingLevel === undefined ? {} : { headingLevel: state.headingLevel }),
      runs,
    });
    runs = [];
    // Alignment persists until `\pard` (that is what the format says and what Word
    // emits), but the outline level belongs to the paragraph that declared it.
    state.headingLevel = undefined;
  };

  while (index < rtf.length) {
    const character = rtf[index]!;

    if (character === '{') {
      const start = index;
      stack.push(clone(state));
      if (skippedDepth === 0 && (isIgnorableMarker(rtf, start) || SKIPPED_DESTINATIONS.has(groupDestination(rtf, start) ?? ''))) {
        skippedDepth = stack.length;
      }
      index += 1;
      continue;
    }

    if (character === '}') {
      if (stack.length > 0) {
        state = stack.pop()!;
      }
      if (skippedDepth > 0 && stack.length < skippedDepth) skippedDepth = 0;
      index += 1;
      continue;
    }

    if (character === '\\') {
      const next = rtf[index + 1] ?? '';
      if (next === '\\' || next === '{' || next === '}') {
        addText(next);
        index += 2;
        continue;
      }
      if (next === "'") {
        const hex = rtf.slice(index + 2, index + 4);
        if (/^[0-9a-fA-F]{2}$/u.test(hex)) {
          addText(cp1252(parseInt(hex, 16)));
          index += 4;
          continue;
        }
        index += 2;
        continue;
      }
      if (next === '*') {
        index += 2;
        continue;
      }
      if (next === '~') { addText('\u00a0'); index += 2; continue; }
      if (next === '_') { addText('\u2011'); index += 2; continue; }
      if (next === '-') { index += 2; continue; }
      if (!/[a-zA-Z]/u.test(next)) {
        index += 2;
        continue;
      }

      const wordMatch = /^\\([a-zA-Z]+)(-?\d+)?[ ]?/u.exec(rtf.slice(index));
      if (!wordMatch) {
        index += 1;
        continue;
      }
      const word = wordMatch[1]!.toLowerCase();
      const parameter = wordMatch[2] === undefined ? undefined : Number.parseInt(wordMatch[2], 10);
      index += wordMatch[0].length;

      if (skippedDepth > 0) continue;

      switch (word) {
        case 'b': state.bold = parameter !== 0; break;
        case 'i': state.italic = parameter !== 0; break;
        case 'ul': state.underline = parameter === undefined || parameter !== 0; break;
        case 'ulnone': state.underline = false; break;
        case 'fs':
          if (parameter !== undefined && parameter > 0) state.font_size_pt = parameter / 2;
          break;
        case 'cf': {
          // W-182: `\cf0` is the automatic colour (no colour), `\cfN` is entry N of the table.
          if (parameter === undefined || parameter <= 0) {
            state.text_color = undefined;
            break;
          }
          const color = colorTable[parameter - 1];
          state.text_color = color;
          break;
        }
        case 'ql': state.alignment = 'left'; break;
        case 'qc': state.alignment = 'center'; break;
        case 'qr': state.alignment = 'right'; break;
        case 'qj': state.alignment = 'justify'; break;
        case 'pard':
          state = { ...clone(BASE_STATE), bold: state.bold, italic: state.italic, underline: state.underline, ...(state.font_size_pt === undefined ? {} : { font_size_pt: state.font_size_pt }) };
          break;
        case 'par': endParagraph(); break;
        case 'bin':
          /**
           * W-185 — `\binN` is followed by N **raw bytes** that are not RTF text.
           *
           * The reader ignored the word and then tokenised the bytes as if they were text, so an embedded
           * picture arrived as control characters and mojibake in the view. The bytes are now skipped
           * exactly. The count is bounded and clamped to what is left: a hostile file claiming
           * `\bin999999999` must not walk the parser past the end or hold it in a loop.
           */
          if (parameter !== undefined && parameter > 0) {
            index += Math.min(parameter, 8 * 1024 * 1024, Math.max(0, rtf.length - index));
          }
          break;
        case 'line': addText('\n'); break;
        case 'tab': addText('\t'); break;
        case 'uc':
          if (parameter !== undefined && parameter >= 0) ucSkip = parameter;
          break;
        case 'u': {
          if (parameter === undefined) break;
          addText(String.fromCharCode(parameter < 0 ? parameter + 0x10000 : parameter));
          // `\ucN` fallback characters follow and must not appear in the text.
          let skipped = 0;
          while (skipped < ucSkip && index < rtf.length) {
            const fallback = rtf[index]!;
            if (fallback === '\\' || fallback === '{' || fallback === '}') break;
            index += 1;
            skipped += 1;
          }
          break;
        }
        case 'outlinelevel':
          if (parameter !== undefined && parameter >= 0 && parameter <= 2) {
            state.headingLevel = (parameter + 1) as 1 | 2 | 3;
          }
          break;
        default:
          break;
      }
      continue;
    }

    if (character === '\n' || character === '\r') {
      // Line breaks in the RTF source are not document content.
      index += 1;
      continue;
    }

    addText(character);
    index += 1;
  }

  endParagraph();
  return paragraphs;
}
