// STATUS: DIAMANT VGT SUPREME — Markdown inline text, escaped and unescaped by one definition
//
// Paket 38 acceptance: "Markdown-Struktur importieren, normalen Text bearbeiten und sauber
// exportieren."
//
// W-187/W-188, measured: the writer escaped **every** `.` and `-` anywhere
// (`z.B.` → `z\.B\.`, `E-Mail` → `E\-Mail`) and the reader never undid it, so
//   Export 1  "Siehe z\.B\. Abb\. 1\.2 \- die E\-Mail …"
//   Import 1  "Siehe z\.B\. Abb\. 1\.2 \- die E\-Mail …"   ← backslashes stay in the text
//   Export 2  "Siehe z\\.B\\. …"                          ← and are escaped again
//   Import 2  "Siehe z\\.B\\. …"                          ← the document text grows for ever
// `*Stern*` came back as `\Stern\`: the escape survived while the asterisks were eaten by the
// inline parser. A round trip has to be able to undo what it wrote, and it has to escape only
// what would otherwise change the meaning.

/** Characters that are special **anywhere** and must always be escaped in text. */
const INLINE_SPECIAL = /[\\`*_[\]<>|~]/gu;

/** Characters that only start a block when they begin a line. */
const LINE_START_MARKER = /^(#{1,6}|>|[-+*]|\d+[.)]|=+)\s?/u;

/**
 * Escapes a run of document text for Markdown.
 *
 * `atLineStart` says whether this text begins a line; only then can `#`, `>`, `-`, `+`, `=`
 * or `1.` turn into a block marker. Everywhere else they stay as they are, which is what
 * makes the output clean instead of peppered with backslashes.
 */
export function escapeMarkdownText(value: string, atLineStart: boolean): string {
  const escaped = value.replace(INLINE_SPECIAL, '\\$&');
  if (!atLineStart) return escaped;
  const marker = LINE_START_MARKER.exec(escaped);
  if (!marker) return escaped;
  const head = marker[0];
  // Escape only the marker character itself, leaving any following space alone.
  const markerIndex = head.search(/[#>\-+=]|\d/u);
  if (markerIndex < 0) return escaped;
  if (/\d/u.test(head[markerIndex] ?? '')) {
    // `1.` / `1)` — escape the punctuation, not the digit.
    const punctuation = head.indexOf('.') >= 0 ? '.' : ')';
    return escaped.replace(punctuation, `\\${punctuation}`);
  }
  return `${escaped.slice(0, markerIndex)}\\${escaped.slice(markerIndex)}`;
}

/**
 * Finds the closing `**` of a strong run.
 *
 * A run of three or more stars closes the **inner** emphasis first: in
 * `**fett *auch kursiv***` the last two stars close the bold and the one before them closes
 * the italic. Taking the first two stars of that run — which `indexOf('**')` does — left the
 * italic unparsed and a stray `*` in the text.
 */
function findClosingStrong(input: string, from: number): number {
  let search = from;
  while (search < input.length) {
    const at = input.indexOf('**', search);
    if (at < 0) return -1;
    let runEnd = at;
    while (input[runEnd] === '*') runEnd += 1;
    if (runEnd - at >= 2) return runEnd - 2;
    search = runEnd;
  }
  return -1;
}

export interface MarkdownInlineRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  strikethrough?: boolean;
}

/**
 * Reads inline Markdown into runs.
 *
 * Every character of the input ends up in exactly one run: a backslash escape yields the
 * literal character, `**fett**` yields a bold run, `*kursiv*` and `_kursiv_` yield italic,
 * `~~weg~~` yields strikethrough and `` `code` `` yields plain text without its backticks.
 * Unmatched markers stay as literal text instead of being swallowed — the old parser ate the
 * asterisks of `\*Stern\*` and left the backslashes behind.
 */
export function parseMarkdownInline(input: string): MarkdownInlineRun[] {
  const runs: MarkdownInlineRun[] = [];
  let buffer = '';
  let index = 0;

  const flush = (marks: { bold?: boolean; italic?: boolean; strikethrough?: boolean } = {}) => {
    if (buffer.length === 0) return;
    runs.push({ text: buffer, ...marks });
    buffer = '';
  };

  while (index < input.length) {
    const character = input[index]!;

    if (character === '\\' && index + 1 < input.length) {
      const next = input[index + 1]!;
      // A backslash only escapes punctuation; before anything else it is a literal backslash.
      if (/[!-/:-@[-`{-~]/u.test(next)) {
        buffer += next;
        index += 2;
        continue;
      }
      buffer += character;
      index += 1;
      continue;
    }

    if (character === '`') {
      const end = input.indexOf('`', index + 1);
      if (end > index) {
        buffer += input.slice(index + 1, end);
        index = end + 1;
        continue;
      }
      buffer += character;
      index += 1;
      continue;
    }

    if (input.startsWith('**', index) || input.startsWith('__', index)) {
      const marker = input.slice(index, index + 2);
      const end = marker === '**' ? findClosingStrong(input, index + 2) : input.indexOf(marker, index + 2);
      if (end > index + 1) {
        const inner = input.slice(index + 2, end);
        if (inner.length > 0) {
          flush();
          // Nested emphasis inside bold is read as well, so `**fett *kursiv***` keeps both.
          const nested = parseMarkdownInline(inner);
          for (const run of nested) runs.push({ ...run, bold: true });
          index = end + 2;
          continue;
        }
      }
    }

    if (input.startsWith('~~', index)) {
      const end = input.indexOf('~~', index + 2);
      if (end > index + 1) {
        const inner = input.slice(index + 2, end);
        if (inner.length > 0) {
          flush();
          runs.push({ text: inner, strikethrough: true });
          index = end + 2;
          continue;
        }
      }
    }

    if (character === '*' || character === '_') {
      const end = input.indexOf(character, index + 1);
      if (end > index + 1) {
        const inner = input.slice(index + 1, end);
        if (inner.length > 0) {
          flush();
          runs.push({ text: inner, italic: true });
          index = end + 1;
          continue;
        }
      }
    }

    buffer += character;
    index += 1;
  }

  flush();
  return runs.length > 0 ? runs : [{ text: '' }];
}
