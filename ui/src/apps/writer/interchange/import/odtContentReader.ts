// STATUS: DIAMANT VGT SUPREME — ODF text reader that keeps layout and rich text
//
// Paket 37 acceptance: "Fremddatei öffnen, rich text ändern und wieder interoperabel
// exportieren" — with layout preserved.
//
// W-179: the previous reader ran one regex over `<text:p|h>` and stripped every tag:
//   const cleanText = inner.replace(/<[^>]+>/g, '').trim();
// Measured consequences on a foreign file:
//   • `<text:span text:style-name="T1">` lost bold/italic/underline/size/colour;
//   • `<text:s text:c="3"/>` — how ODF encodes runs of spaces — lost the spaces entirely,
//     because the tag was stripped and it carries no text;
//   • `<text:tab/>` and `<text:line-break/>` vanished;
//   • every heading became `heading1` regardless of `text:outline-level`, and was forced
//     bold instead of reading its style;
//   • `<text:list>` was not recognised, so numbered lists came back as plain paragraphs.
//
// This reader walks the content in order and keeps a stack of text styles, so structure is
// counted rather than guessed (the lesson from W-169).

export interface OdtRun {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  font_size_pt?: number;
  text_color?: string;
}

export interface OdtParagraph {
  alignment: 'left' | 'center' | 'right' | 'justify';
  headingLevel?: 1 | 2 | 3;
  listStyle?: 'bullet' | 'number';
  /** WR-042: `fo:margin-top` of the paragraph style, in points. */
  spaceBeforePt?: number;
  /** WR-042: `fo:margin-bottom` of the paragraph style, in points. */
  spaceAfterPt?: number;
  runs: OdtRun[];
}

interface TextStyle {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  font_size_pt?: number;
  text_color?: string;
}

interface ParagraphStyle {
  alignment?: OdtParagraph['alignment'];
  spaceBeforePt?: number;
  spaceAfterPt?: number;
}

interface ListStyle {
  numbered: boolean;
}

const BASE_TEXT_STYLE: TextStyle = { bold: false, italic: false, underline: false };

/**
 * The most spaces one `<text:s text:c="…"/>` may expand to (W-315).
 *
 * ODF encodes a run of consecutive spaces as one empty element with a repeat count, so the attribute is
 * a **memory instruction from the file**. `text:c="999999999"` asked for a ~1 GB string before any
 * paragraph limit could apply — the element expands inside `parseOdtContent`, which counts paragraphs
 * only afterwards. The bound is refused, not clamped: a foreign file that asks for a million spaces is
 * not a file whose spaces we should silently reinterpret.
 */
export const MAX_ODT_SPACE_RUN = 10_000;

/**
 * W-177 for ODT: the parts this reader walks past.
 *
 * Measured, not assumed: the reader keeps paragraphs, their runs and their styles, and nothing else.
 * `<table:table>`, `<draw:frame>`/`<draw:image>`, `<text:note>` and `<office:annotation>` carry no
 * paragraph text and are therefore dropped without a word.
 *
 * Deliberately **not** reported, because the reader handles them: paragraphs and headings (`text:p|h`),
 * their runs (`text:span`), spaces (`text:s`), tabs (`text:tab`) and line breaks (`text:line-break`),
 * lists (`text:list`) and their kinds. Reporting those would be a lie in the other direction.
 *
 * A separate pure function rather than a branch inside `parseOdtContent`, so the reader's output cannot
 * change and its signature stays as it is.
 */
export type OdtImportOmissionKind = 'image' | 'table' | 'note' | 'comment' | 'frame';

export interface OdtImportOmission {
  readonly kind: OdtImportOmissionKind;
  readonly count: number;
}

export interface OdtImportOmissions {
  readonly omissions: readonly OdtImportOmission[];
  readonly hasOmissions: boolean;
}

/** Counts what `parseOdtContent` leaves behind in an ODF `content.xml`. */
export function reportOdtImportOmissions(xml: string): OdtImportOmissions {
  if (typeof xml !== 'string' || xml.length === 0) return { omissions: [], hasOmissions: false };
  const count = (pattern: RegExp): number => {
    const matches = xml.match(pattern);
    return matches ? matches.length : 0;
  };
  // The `table:` namespace also names columns, rows, cells and styles; only `<table:table>` is a table.
  const tables = count(/<(?:[A-Za-z_][\w.-]*:)?table(?:\s|>)/gu);
  const images = count(/<(?:[A-Za-z_][\w.-]*:)?image(?:\s|>)/gu);
  const frames = count(/<(?:[A-Za-z_][\w.-]*:)?frame(?:\s|>)/gu);
  const notes = count(/<(?:[A-Za-z_][\w.-]*:)?note(?:\s|>)/gu);
  const comments = count(/<(?:[A-Za-z_][\w.-]*:)?annotation(?:\s|>)/gu);

  const omissions: OdtImportOmission[] = [];
  if (images > 0) omissions.push({ kind: 'image', count: images });
  if (tables > 0) omissions.push({ kind: 'table', count: tables });
  if (notes > 0) omissions.push({ kind: 'note', count: notes });
  if (comments > 0) omissions.push({ kind: 'comment', count: comments });
  // A frame without an image is still a positioned object the reader cannot carry; frames that merely
  // wrap an image are already counted as the image.
  const framesWithoutImage = Math.max(0, frames - images);
  if (framesWithoutImage > 0) omissions.push({ kind: 'frame', count: framesWithoutImage });

  return { omissions, hasOmissions: omissions.length > 0 };
}

function alignmentOf(value: string | null): OdtParagraph['alignment'] | undefined {
  if (value === 'center' || value === 'right' || value === 'justify' || value === 'left') return value;
  if (value === 'start') return 'left';
  if (value === 'end') return 'right';
  return undefined;
}

/** `12pt`, `10.5pt`, `1.2cm` → points. ODF allows several units. */
function lengthToPoints(value: string | null): number | undefined {
  if (!value) return undefined;
  const match = /^(-?\d+(?:\.\d+)?)(pt|px|cm|mm|in|pc)?$/u.exec(value.trim());
  if (!match) return undefined;
  const amount = Number.parseFloat(match[1]!);
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  switch (match[2]) {
    case 'cm': return Math.round(amount * 28.3465 * 100) / 100;
    case 'mm': return Math.round(amount * 2.83465 * 100) / 100;
    case 'in': return Math.round(amount * 72 * 100) / 100;
    case 'pc': return Math.round(amount * 12 * 100) / 100;
    case 'px': return Math.round(amount * 0.75 * 100) / 100;
    case 'pt':
    default: return amount;
  }
}

const ATTRIBUTE_PATTERN = /([\w:.-]+)\s*=\s*"([^"]*)"/gu;

function attributesOf(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  ATTRIBUTE_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ATTRIBUTE_PATTERN.exec(tag)) !== null) out[match[1]!] = match[2]!;
  return out;
}

function collectTextStyles(xml: string): Map<string, TextStyle> {
  const styles = new Map<string, TextStyle>();
  const stylePattern = /<style:style\b[^>]*>[\s\S]*?<\/style:style>|<style:style\b[^>]*\/>/gu;
  let match: RegExpExecArray | null;
  while ((match = stylePattern.exec(xml)) !== null) {
    const tag = match[0];
    const head = tag.slice(0, tag.indexOf('>') + 1);
    const attributes = attributesOf(head);
    const name = attributes['style:name'];
    if (!name) continue;
    if (attributes['style:family'] && attributes['style:family'] !== 'text') continue;
    const properties = /<style:text-properties\b[^>]*\/?>/u.exec(tag)?.[0] ?? '';
    const propertyAttributes = attributesOf(properties);
    const weight = propertyAttributes['fo:font-weight'] ?? propertyAttributes['style:font-weight-asian'];
    const underlineStyle = propertyAttributes['style:text-underline-style'];
    const color = propertyAttributes['fo:color'];
    styles.set(name, {
      bold: weight === 'bold' || weight === '700' || weight === '800' || weight === '900',
      italic: propertyAttributes['fo:font-style'] === 'italic' || propertyAttributes['fo:font-style'] === 'oblique',
      underline: Boolean(underlineStyle && underlineStyle !== 'none'),
      ...(lengthToPoints(propertyAttributes['fo:font-size'] ?? null) === undefined
        ? {}
        : { font_size_pt: lengthToPoints(propertyAttributes['fo:font-size'] ?? null)! }),
      ...(color && /^#[0-9a-fA-F]{6}$/u.test(color) ? { text_color: color.toLowerCase() } : {}),
    });
  }
  return styles;
}

function collectParagraphStyles(xml: string): Map<string, ParagraphStyle> {
  const styles = new Map<string, ParagraphStyle>();
  const stylePattern = /<style:style\b[^>]*>[\s\S]*?<\/style:style>|<style:style\b[^>]*\/>/gu;
  let match: RegExpExecArray | null;
  while ((match = stylePattern.exec(xml)) !== null) {
    const tag = match[0];
    const attributes = attributesOf(tag.slice(0, tag.indexOf('>') + 1));
    const name = attributes['style:name'];
    if (!name || attributes['style:family'] !== 'paragraph') continue;
    const properties = /<style:paragraph-properties\b[^>]*\/?>/u.exec(tag)?.[0] ?? '';
    const propertyAttributes = attributesOf(properties);
    const alignment = alignmentOf(propertyAttributes['fo:text-align'] ?? null);
    // WR-042: the semantic paragraph spacing survives the ODT round trip.
    const spaceBeforePt = lengthToPoints(propertyAttributes['fo:margin-top'] ?? null);
    const spaceAfterPt = lengthToPoints(propertyAttributes['fo:margin-bottom'] ?? null);
    if (alignment || spaceBeforePt !== undefined || spaceAfterPt !== undefined) {
      styles.set(name, {
        ...(alignment ? { alignment } : {}),
        ...(spaceBeforePt === undefined ? {} : { spaceBeforePt }),
        ...(spaceAfterPt === undefined ? {} : { spaceAfterPt }),
      });
    }
  }
  return styles;
}

/** A list is numbered when its list style declares a numbering level. */
function collectListStyles(xml: string): Map<string, ListStyle> {
  const styles = new Map<string, ListStyle>();
  const stylePattern = /<text:list-style\b[^>]*>[\s\S]*?<\/text:list-style>/gu;
  let match: RegExpExecArray | null;
  while ((match = stylePattern.exec(xml)) !== null) {
    const name = attributesOf(match[0].slice(0, match[0].indexOf('>') + 1))['style:name'];
    if (!name) continue;
    styles.set(name, { numbered: /<text:list-level-style-number\b/u.test(match[0]) });
  }
  return styles;
}

/**
 * Reads the body of an ODF `content.xml`.
 *
 * Never throws on malformed input: unterminated elements end at the end of the input and
 * an open paragraph is flushed, so a slightly broken foreign file still yields its text.
 */
export function parseOdtContent(xml: string): OdtParagraph[] {
  const textStyles = collectTextStyles(xml);
  const paragraphStyles = collectParagraphStyles(xml);
  const listStyles = collectListStyles(xml);

  const paragraphs: OdtParagraph[] = [];
  const styleStack: TextStyle[] = [BASE_TEXT_STYLE];
  const listStack: OdtParagraph['listStyle'][] = [];
  let runs: OdtRun[] = [];
  let current: OdtRun | null = null;
  let paragraph: { alignment: OdtParagraph['alignment']; headingLevel?: 1 | 2 | 3; listStyle?: 'bullet' | 'number'; spaceBeforePt?: number; spaceAfterPt?: number } | null = null;

  const activeStyle = (): TextStyle => styleStack[styleStack.length - 1] ?? BASE_TEXT_STYLE;

  const flushRun = () => {
    if (current && current.text.length > 0) runs.push(current);
    current = null;
  };

  const addText = (text: string) => {
    if (text.length === 0 || !paragraph) return;
    const style = activeStyle();
    if (
      !current
      || current.bold !== style.bold
      || current.italic !== style.italic
      || current.underline !== style.underline
      || current.font_size_pt !== style.font_size_pt
      || current.text_color !== style.text_color
    ) {
      flushRun();
      current = {
        text: '',
        bold: style.bold,
        italic: style.italic,
        underline: style.underline,
        ...(style.font_size_pt === undefined ? {} : { font_size_pt: style.font_size_pt }),
        ...(style.text_color === undefined ? {} : { text_color: style.text_color }),
      };
    }
    current.text += text;
  };

  const endParagraph = () => {
    flushRun();
    if (!paragraph) return;
    const listStyle = paragraph.listStyle ?? listStack[listStack.length - 1];
    paragraphs.push({
      alignment: paragraph.alignment,
      ...(paragraph.headingLevel === undefined ? {} : { headingLevel: paragraph.headingLevel }),
      ...(paragraph.spaceBeforePt === undefined ? {} : { spaceBeforePt: paragraph.spaceBeforePt }),
      ...(paragraph.spaceAfterPt === undefined ? {} : { spaceAfterPt: paragraph.spaceAfterPt }),
      ...(listStyle === undefined ? {} : { listStyle }),
      runs,
    });
    runs = [];
    paragraph = null;
  };

  const tagPattern = /<(\/?)([\w:.-]+)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/gu;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = tagPattern.exec(xml)) !== null) {
    const text = xml.slice(cursor, match.index);
    if (text.length > 0) addText(text.replace(/&lt;/gu, '<').replace(/&gt;/gu, '>').replace(/&quot;/gu, '"').replace(/&apos;/gu, "'").replace(/&amp;/gu, '&'));
    cursor = match.index + match[0].length;

    const closing = match[1] === '/';
    const local = match[2]!.includes(':') ? match[2]!.slice(match[2]!.indexOf(':') + 1) : match[2]!;
    const selfClosing = match[4] === '/';
    const attributes = attributesOf(match[0]);

    switch (local) {
      case 'p':
      case 'h':
        if (closing) {
          endParagraph();
          break;
        }
        // A paragraph inside a paragraph closes the previous one rather than nesting.
        endParagraph();
        {
          const styleName = attributes['text:style-name'];
          const paragraphStyle = styleName ? paragraphStyles.get(styleName) : undefined;
          const outline = attributes['text:outline-level'];
          const level = outline === undefined ? Number.NaN : Number.parseInt(outline, 10);
          paragraph = {
            alignment: paragraphStyle?.alignment ?? 'left',
            ...(paragraphStyle?.spaceBeforePt === undefined ? {} : { spaceBeforePt: paragraphStyle.spaceBeforePt }),
            ...(paragraphStyle?.spaceAfterPt === undefined ? {} : { spaceAfterPt: paragraphStyle.spaceAfterPt }),
            ...(local === 'h' && Number.isFinite(level) && level >= 1
              ? { headingLevel: Math.min(3, Math.max(1, level)) as 1 | 2 | 3 }
              : {}),
          };
        }
        break;
      case 'span':
        if (closing) {
          if (styleStack.length > 1) styleStack.pop();
          break;
        }
        if (selfClosing) break;
        styleStack.push(textStyles.get(attributes['text:style-name'] ?? '') ?? BASE_TEXT_STYLE);
        break;
      case 's': {
        // W-315: the count comes from the file. It is checked **before** the string is built, and a
        // value above the bound is refused instead of being cut down to it.
        const raw = attributes['text:c'];
        const count = Number.parseInt(raw ?? '1', 10);
        if (Number.isFinite(count) && count > MAX_ODT_SPACE_RUN) {
          throw new Error(`ODT space run exceeds the ${MAX_ODT_SPACE_RUN}-space import limit (text:c="${raw}").`);
        }
        addText(' '.repeat(Number.isFinite(count) && count > 0 ? count : 1));
        break;
      }
      case 'tab':
        addText('\t');
        break;
      case 'line-break':
        addText('\n');
        break;
      case 'list':
        if (closing) {
          listStack.pop();
          break;
        }
        if (selfClosing) break;
        {
          const listStyleName = attributes['text:style-name'];
          // ODF: a nested list without a style name inherits the enclosing list kind.
          const inherited = listStack[listStack.length - 1];
          const numbered = listStyleName
            ? listStyles.get(listStyleName)?.numbered === true
            : inherited === 'number';
          listStack.push(numbered ? 'number' : (inherited ?? 'bullet'));
        }
        break;
      default:
        break;
    }
  }

  const trailing = xml.slice(cursor);
  if (trailing.length > 0) addText(trailing);
  endParagraph();
  return paragraphs;
}
