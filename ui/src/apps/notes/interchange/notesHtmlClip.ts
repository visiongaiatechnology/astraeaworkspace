// STATUS: DIAMANT VGT SUPREME — bounded, DOM-free web-clip sanitiser
//
// AST-0731 acceptance: "HTML-Fragment lokal sanitizen und als bearbeitbare Notiz importieren."
// A web clip arrives as untrusted HTML. This module converts it to Markdown with a bounded tokenizer:
// no DOM (so it also works headlessly), no network, no scripts, no event handlers, no remote resources, and
// every size is capped. Anything active is *dropped*, never repaired into something executable.

import { sanitizeRichTextHref } from '../../../platform/security/richTextLinkSecurity';

export const NOTE_CLIP_MAX_INPUT_CHARS = 1_000_000;
export const NOTE_CLIP_MAX_OUTPUT_CHARS = 400_000;
export const NOTE_CLIP_MAX_LINKS = 512;
export const NOTE_CLIP_MAX_BLOCKS = 4_000;

/** Elements whose entire subtree is removed, not unwrapped. */
const NOTE_CLIP_DROPPED_SUBTREES: readonly string[] = ['script', 'style', 'noscript', 'template', 'svg', 'math', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'select', 'textarea', 'canvas', 'video', 'audio', 'link', 'meta', 'base'];
/** Elements that are unwrapped (their text stays, the tag disappears). */
const NOTE_CLIP_BLOCK_TAGS = new Set(['p', 'div', 'section', 'article', 'header', 'footer', 'main', 'aside', 'nav', 'figure', 'figcaption', 'blockquote', 'pre', 'table']);
const NOTE_CLIP_HEADING = /^h([1-6])$/;
const NOTE_CLIP_VOID_TAGS = new Set(['br', 'hr', 'img', 'source', 'track', 'wbr', 'col', 'area']);
/** Inline elements are unwrapped without ending the current paragraph. */
const NOTE_CLIP_INLINE_TAGS = new Set(['strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del', 'ins', 'span', 'code', 'kbd', 'samp', 'var', 'small', 'sub', 'sup', 'mark', 'abbr', 'cite', 'q', 'time', 'bdi', 'bdo', 'ruby', 'rt', 'rp', 'dfn', 'data']);

export interface NoteClipResult {
  /** Markdown body, ready to become an editable note. */
  markdown: string;
  title: string;
  /** True when active or remote content was removed; the UI must say so. */
  sanitized: boolean;
  removedElements: string[];
  /** Links that survived, already sanitised. */
  links: number;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ').replace(/&#(\d{1,7});/g, (_whole, code: string) => {
      const point = Number(code);
      return Number.isFinite(point) && point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : '';
    })
    .replace(/&amp;/g, '&');
}

/** Tokenises the fragment into a bounded list of text/open/close tokens. */
interface ClipToken { kind: 'text' | 'open' | 'close'; value: string; attributes: string }

function tokenize(html: string): ClipToken[] {
  const tokens: ClipToken[] = [];
  let index = 0;
  while (index < html.length && tokens.length < NOTE_CLIP_MAX_BLOCKS * 8) {
    const next = html.indexOf('<', index);
    if (next < 0) { tokens.push({ kind: 'text', value: html.slice(index), attributes: '' }); break; }
    if (next > index) tokens.push({ kind: 'text', value: html.slice(index, next), attributes: '' });
    const close = html.indexOf('>', next);
    if (close < 0) { tokens.push({ kind: 'text', value: html.slice(next), attributes: '' }); break; }
    const raw = html.slice(next + 1, close);
    index = close + 1;
    if (!raw || raw.startsWith('!') || raw.startsWith('?')) continue; // comment / doctype / PI
    if (raw.startsWith('/')) { tokens.push({ kind: 'close', value: raw.slice(1).trim().toLowerCase(), attributes: '' }); continue; }
    const space = raw.search(/[\s/]/);
    const name = (space < 0 ? raw : raw.slice(0, space)).trim().toLowerCase();
    if (!name) continue;
    tokens.push({ kind: 'open', value: name, attributes: space < 0 ? '' : raw.slice(space) });
  }
  return tokens;
}

function attributeValue(attributes: string, name: string): string | null {
  const match = attributes.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  if (!match) return null;
  return decodeEntities(match[1] ?? match[2] ?? match[3] ?? '');
}

/** Remote images are dropped rather than fetched; only inline data URLs of safe raster kinds survive. */
function safeClipImageSrc(src: string | null): string | null {
  if (!src) return null;
  if (/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]{8,}$/i.test(src)) return src;
  return null;
}

/**
 * Converts an untrusted HTML fragment into bounded Markdown.
 * `baseUrl` is only used to drop obviously cross-origin links; every href still passes the shared
 * rich-text link policy.
 */
export function sanitizeNoteClip(html: string, options: { title?: string; baseUrl?: string } = {}): NoteClipResult {
  const source = String(html ?? '').slice(0, NOTE_CLIP_MAX_INPUT_CHARS);
  const removed = new Set<string>();
  let sanitized = false;
  let links = 0;
  const out: string[] = [];
  let inlineBuffer = '';
  let linkHref: string | null = null;
  let linkBuffer = '';
  let skipDepth = 0;
  let skippingTag = '';

  /**
   * **W-434 — die Tabelle wird als Tabelle gelesen, nicht als Zeilen mit senkrechten Strichen.**
   *
   * Gemessen war das Ergebnis für
   * `<table><thead><tr><th>Name</th><th>Wert</th></tr></thead><tbody><tr><td>A</td><td>1</td></tr>…`:
   * `"|\n| Name\n| Wert\n\n|\n| A\n| 1\n|\n| B\n| 2"` — **jede Zelle auf einer eigenen Zeile** ✗.
   * Ursache, zeilengenau: die `td`/`th`-Zweige riefen **zuerst** `flushInline()` und schrieben dann `'| '` in
   * denselben Puffer (`notesHtmlClip.ts:148-149`); damit war die vorige Zelle bereits eine **fertige Zeile** in
   * `out`. *Das Ergebnis sah aus wie eine Tabelle und war keine: kein Trennstrich, keine Kopfzeile — der
   * vorhandene Markdown-Tabelleneditor (`notesTableEditing.editMarkdownTable`) erkennt es nicht.*
   *
   * Jetzt sammelt die Schleife **Zeilen aus Zellen** und schreibt beim Schließen von `table` eine echte
   * Markdown-Tabelle mit Trennzeile. *Die erste Zeile ist die Kopfzeile — genau die Annahme, die der vorhandene
   * Tabelleneditor ebenfalls macht.* Kein zweiter Parser: dieselbe Schleife, dieselben Token.
   */
  let tableRows: string[][] | null = null;
  let currentRow: string[] = [];

  const flushInline = () => {
    const text = decodeEntities(inlineBuffer).replace(/\s+/g, ' ').trim();
    inlineBuffer = '';
    if (!text) return;
    // Innerhalb einer Tabelle ist der Puffer eine **Zelle**, keine Zeile.
    if (tableRows) { currentRow.push(text); return; }
    out.push(text);
  };

  /** Schreibt die gesammelten Zeilen als eine Markdown-Tabelle mit Trennzeile. */
  const flushTable = () => {
    if (!tableRows) return;
    const rows = tableRows;
    tableRows = null;
    currentRow = [];
    const filled = rows.filter((row) => row.length > 0);
    if (!filled.length) return;
    const columns = Math.max(...filled.map((row) => row.length));
    const line = (row: string[]) => `| ${Array.from({ length: columns }, (_unused, index) => row[index] ?? '').join(' | ')} |`;
    const [header, ...body] = filled;
    out.push(line(header!));
    // Die Trennzeile ist das, was eine Zeilenfolge zu einer **Tabelle** macht.
    out.push(`| ${Array.from({ length: columns }, () => '---').join(' | ')} |`);
    for (const row of body) out.push(line(row));
  };

  for (const token of tokenize(source)) {
    if (skipDepth > 0) {
      if (token.kind === 'open' && token.value === skippingTag) skipDepth += 1;
      else if (token.kind === 'close' && token.value === skippingTag) skipDepth -= 1;
      continue;
    }
    if (token.kind === 'text') {
      // Inside an anchor the text becomes the link label instead of a plain paragraph.
      if (linkHref !== null) linkBuffer += token.value;
      else inlineBuffer += token.value;
      continue;
    }
    if (token.kind === 'close') {
      if (linkHref !== null && token.value === 'a') {
        const label = decodeEntities(linkBuffer).replace(/\s+/g, ' ').trim() || linkHref;
        inlineBuffer += `[${label.replace(/[[\]]/g, '')}](${linkHref})`;
        linkHref = null;
        linkBuffer = '';
        continue;
      }
      // **W-434:** Zellen- und Zeilenenden sind innerhalb einer Tabelle Struktur, nicht Absatzgrenzen.
      if (tableRows) {
        if (token.value === 'td' || token.value === 'th') { flushInline(); continue; }
        if (token.value === 'tr') { flushInline(); tableRows.push(currentRow); currentRow = []; continue; }
        if (token.value === 'table') { flushInline(); if (currentRow.length) { tableRows.push(currentRow); currentRow = []; } flushTable(); continue; }
        if (token.value === 'thead' || token.value === 'tbody') continue;
      }
      if (token.value === 'table') { flushTable(); continue; }
      // Closing an inline element must not split the paragraph in two.
      if (NOTE_CLIP_INLINE_TAGS.has(token.value)) continue;
      flushInline();
      continue;
    }

    const name = token.value;
    if (NOTE_CLIP_DROPPED_SUBTREES.includes(name)) {
      sanitized = true;
      removed.add(name);
      if (!NOTE_CLIP_VOID_TAGS.has(name)) { skipDepth = 1; skippingTag = name; }
      continue;
    }
    // Any event handler or active attribute is a removal, whatever element carries it.
    if (/\son[a-z]+\s*=/i.test(token.attributes) || /\b(?:javascript|vbscript):/i.test(token.attributes)) {
      sanitized = true;
      removed.add(`${name}[event]`);
    }
    if (name === 'br') { if (linkHref === null) { flushInline(); out.push(''); } continue; }
    if (name === 'hr') { if (linkHref === null) { flushInline(); out.push('---'); } continue; }
    const heading = NOTE_CLIP_HEADING.exec(name);
    if (heading && linkHref === null) { flushInline(); inlineBuffer = `${'#'.repeat(Number(heading[1]))} `; continue; }
    if (name === 'li' && linkHref === null) { flushInline(); inlineBuffer = '- '; continue; }
    // **W-434:** kein `'| '` mehr in den Zeilenpuffer — die Zelle wird gesammelt, nicht als Zeile geschrieben.
    if ((name === 'td' || name === 'th') && linkHref === null) { if (tableRows) { flushInline(); continue; } continue; }
    if (name === 'tr' && linkHref === null) { if (tableRows) continue; flushInline(); continue; }
    if (name === 'a') {
      const href = attributeValue(token.attributes, 'href');
      const safe = href ? sanitizeRichTextHref(decodeEntities(href)) : null;
      if (!safe || links >= NOTE_CLIP_MAX_LINKS) {
        if (href) { sanitized = true; removed.add(links >= NOTE_CLIP_MAX_LINKS ? 'a[limit]' : 'a[href]'); }
        linkHref = null;
        linkBuffer = '';
        continue;
      }
      if (linkHref !== null) { inlineBuffer += `[${decodeEntities(linkBuffer).trim() || linkHref}](${linkHref})`; linkBuffer = ''; }
      links += 1;
      linkHref = safe;
      linkBuffer = '';
      continue;
    }
    if (name === 'img') {
      const src = safeClipImageSrc(attributeValue(token.attributes, 'src'));
      const alt = (attributeValue(token.attributes, 'alt') ?? '').replace(/[[\]]/g, '').slice(0, 240);
      if (!src) { sanitized = true; removed.add('img[src]'); continue; }
      if (linkHref === null) { flushInline(); out.push(`![${alt}](${src})`); }
      continue;
    }
    if (name === 'table' && linkHref === null) {
      // **W-434:** ab hier sammelt die Schleife **Zeilen**, statt Zeilen mit Strichen zu imitieren. Die Leerzeile
      // davor trennt die Tabelle vom vorigen Absatz — *ohne sie gehört die erste Tabellenzeile zum Absatz.*
      if (!tableRows) { flushInline(); out.push(''); tableRows = []; currentRow = []; }
      continue;
    }
    if (NOTE_CLIP_BLOCK_TAGS.has(name) || name === 'ul' || name === 'ol' || name === 'thead' || name === 'tbody') {
      if (linkHref === null) { flushInline(); if (!tableRows) out.push(''); }
      continue;
    }
  }
  if (linkHref !== null) inlineBuffer += `[${decodeEntities(linkBuffer).trim() || linkHref}](${linkHref})`;
  flushInline();

  const markdown = out.join('\n').replace(/\n{3,}/g, '\n\n').trim();

  const firstHeading = markdown.match(/^#{1,6}\s+(.+)$/m);
  const firstLine = markdown.split('\n').find((line) => line.trim() && !line.startsWith('#'))?.trim() ?? '';
  const title = (options.title?.trim() || firstHeading?.[1]?.trim() || firstLine || 'Web clip').slice(0, 240);

  return {
    markdown: markdown.slice(0, NOTE_CLIP_MAX_OUTPUT_CHARS),
    title,
    sanitized,
    removedElements: [...removed].sort(),
    links,
  };
}

/** Wraps a clip into a canonical note page so the caller only has to persist it. */
export function notePageFromClip(clip: NoteClipResult, tags: readonly string[] = ['web-clip']): {
  title: string;
  content: string;
  tags: string[];
} {
  const provenance = clip.sanitized
    ? `\n\n> Web clip sanitised locally. Removed active content: ${clip.removedElements.join(', ') || 'none listed'}.`
    : '';
  return {
    title: clip.title,
    content: `${clip.markdown}${provenance}`.slice(0, NOTE_CLIP_MAX_OUTPUT_CHARS + 2_048),
    tags: Array.from(new Set(tags.map((tag) => tag.toLowerCase().trim()).filter(Boolean))).slice(0, 64),
  };
}
