// STATUS: DIAMANT VGT SUPREME — pure quick-insert (slash) model for the Notes body
//
// AST-0656 acceptance: "Slash auf leerer Zeile zeigt sinnvolle Text-/Medienbausteine."
// One pure module owns the trigger rule, the catalogue and the text a chosen item inserts; the component
// only renders the list, keeps the highlight index and executes the returned plan.

import { insertMarkdownTable } from './markdown/notesMarkdownEditing';

export type NotesQuickInsertGroup = 'text' | 'structure' | 'insert' | 'media';

/** Items that need an editor entry point (file picker, ink canvas, voice memo, …) instead of a text snippet. */
export type NotesQuickInsertAction = 'image' | 'file' | 'voice' | 'ink' | 'ocr' | 'embed';

export interface NotesQuickInsertSnippet {
  text: string;
  /** Caret position relative to the insertion start. */
  caretOffset: number;
}

export interface NotesQuickInsertItem {
  id: string;
  label: string;
  description: string;
  group: NotesQuickInsertGroup;
  /** Additional search terms beyond label and description. */
  keywords: readonly string[];
  /** Text building blocks insert a snippet; media entries hand over an action. */
  snippet?: () => NotesQuickInsertSnippet;
  action?: NotesQuickInsertAction;
}

export const NOTES_MAX_SLASH_QUERY = 32;

/** Bounded catalogue: the menu never scans an unbounded list and never grows with document size. */
export const NOTES_QUICK_INSERT_ITEMS: readonly NotesQuickInsertItem[] = Object.freeze([
  { id: 'h1', label: 'Heading 1', description: 'Top-level section title', group: 'text', keywords: ['title', 'headline'], snippet: () => ({ text: '# ', caretOffset: 2 }) },
  { id: 'h2', label: 'Heading 2', description: 'Second-level heading', group: 'text', keywords: ['subtitle'], snippet: () => ({ text: '## ', caretOffset: 3 }) },
  { id: 'h3', label: 'Heading 3', description: 'Third-level heading', group: 'text', keywords: ['section'], snippet: () => ({ text: '### ', caretOffset: 4 }) },
  { id: 'bullet', label: 'Bullet list', description: 'Unordered list item', group: 'structure', keywords: ['list', 'ul', 'punkt'], snippet: () => ({ text: '- ', caretOffset: 2 }) },
  { id: 'numbered', label: 'Numbered list', description: 'Ordered list item', group: 'structure', keywords: ['ol', 'list', 'nummer'], snippet: () => ({ text: '1. ', caretOffset: 3 }) },
  { id: 'checklist', label: 'Checklist', description: 'Task item that can become a canonical task', group: 'structure', keywords: ['todo', 'task', 'aufgabe', 'checkbox'], snippet: () => ({ text: '- [ ] ', caretOffset: 6 }) },
  { id: 'quote', label: 'Quote', description: 'Quoted paragraph', group: 'structure', keywords: ['blockquote', 'zitat'], snippet: () => ({ text: '> ', caretOffset: 2 }) },
  { id: 'callout', label: 'Callout', description: 'Highlighted note, tip or warning', group: 'structure', keywords: ['admonition', 'note', 'warning', 'hinweis'], snippet: () => ({ text: '> [!NOTE] ', caretOffset: 10 }) },
  { id: 'code', label: 'Code block', description: 'Fenced code block', group: 'structure', keywords: ['fence', 'snippet', 'quelltext'], snippet: () => ({ text: '```\n\n```\n', caretOffset: 4 }) },
  { id: 'table', label: 'Table', description: 'Markdown table with header row', group: 'insert', keywords: ['grid', 'tabelle'], snippet: () => { const text = `\n${insertMarkdownTable()}\n`; return { text, caretOffset: text.length }; } },
  { id: 'divider', label: 'Divider', description: 'Horizontal rule', group: 'insert', keywords: ['rule', 'hr', 'trenner'], snippet: () => ({ text: '\n---\n', caretOffset: 5 }) },
  { id: 'footnote', label: 'Footnote', description: 'Footnote definition', group: 'insert', keywords: ['note', 'fussnote'], snippet: () => { const text = '\n[^1]: Footnote text\n'; return { text, caretOffset: text.length }; } },
  { id: 'wikilink', label: 'Link to note', description: 'Internal [[link]] to another note', group: 'insert', keywords: ['backlink', 'reference', 'verweis'], snippet: () => ({ text: '[[', caretOffset: 2 }) },
  { id: 'image', label: 'Image', description: 'Attach a local PNG, JPEG or WebP and reference it', group: 'media', keywords: ['picture', 'foto', 'bild'], action: 'image' },
  { id: 'file', label: 'File attachment', description: 'Attach a local file to this note', group: 'media', keywords: ['attachment', 'anhang', 'pdf', 'datei'], action: 'file' },
  { id: 'voice', label: 'Voice memo', description: 'Record a local audio memo', group: 'media', keywords: ['audio', 'memo', 'sprache'], action: 'voice' },
  { id: 'ink', label: 'Ink sketch', description: 'Draw with pen, touch or mouse', group: 'media', keywords: ['pen', 'draw', 'sketch', 'stift'], action: 'ink' },
  { id: 'ocr', label: 'Local OCR', description: 'Recognise text in a local image', group: 'media', keywords: ['scan', 'text', 'erfassung'], action: 'ocr' },
  { id: 'embed', label: 'Workspace reference', description: 'Embed a local Workspace object', group: 'media', keywords: ['reference', 'fabric', 'embed'], action: 'embed' },
]);

export interface NotesSlashMenuContext {
  /** Index of the `/` that opened the menu. */
  start: number;
  /** Caret index when the menu was opened (end of the query). */
  end: number;
  query: string;
}

/**
 * Resolves the slash menu at a caret position.
 * A `/` opens the menu only at the start of a line or after whitespace, so dates, paths and URLs never
 * trigger it, and the query is bounded so the menu cannot be opened by a hostile long line.
 */
export function resolveSlashMenu(content: string, caret: number): NotesSlashMenuContext | null {
  if (typeof content !== 'string') return null;
  const position = Math.max(0, Math.min(content.length, Number.isFinite(caret) ? caret : 0));
  const lineStart = content.lastIndexOf('\n', position - 1) + 1;
  const line = content.slice(lineStart, position);
  const slashIndex = line.lastIndexOf('/');
  if (slashIndex < 0) return null;
  const before = slashIndex === 0 ? '' : line[slashIndex - 1];
  if (before && !/\s/.test(before)) return null;
  const query = line.slice(slashIndex + 1);
  if (query.length > NOTES_MAX_SLASH_QUERY) return null;
  if (query.includes('\n')) return null;
  return { start: lineStart + slashIndex, end: position, query };
}

/** Case-insensitive filter over label, description and keywords. */
export function filterQuickInsertItems(
  query: string,
  items: readonly NotesQuickInsertItem[] = NOTES_QUICK_INSERT_ITEMS,
): NotesQuickInsertItem[] {
  const needle = query.normalize('NFKC').trim().toLocaleLowerCase();
  if (!needle) return [...items];
  return items.filter((item) => `${item.label} ${item.description} ${item.keywords.join(' ')}`
    .normalize('NFKC')
    .toLocaleLowerCase()
    .includes(needle));
}

export interface QuickInsertApplyResult {
  content: string;
  caret: number;
  /** Present when the caller must open the matching entry point instead of inserting text. */
  action?: NotesQuickInsertAction;
}

/**
 * Removes the typed slash query and inserts the chosen item.
 * Returns the new content and caret; text items place the caret inside or after the snippet, media items
 * only remove the query and report the action the caller has to perform.
 */
export function applyQuickInsertItem(
  context: Pick<NotesSlashMenuContext, 'start' | 'end'>,
  item: NotesQuickInsertItem,
  content: string,
): QuickInsertApplyResult {
  const start = Math.max(0, Math.min(content.length, context.start));
  const end = Math.max(start, Math.min(content.length, context.end));
  const head = content.slice(0, start);
  const tail = content.slice(end);
  if (item.action) return { content: head + tail, caret: start, action: item.action };
  if (!item.snippet) return { content: head + tail, caret: start };
  const snippet = item.snippet();
  return { content: head + snippet.text + tail, caret: start + snippet.caretOffset };
}

/** Highlight index arithmetic for ArrowUp/ArrowDown over a bounded list. */
export function moveQuickInsertIndex(current: number, delta: number, length: number): number {
  if (!Number.isFinite(length) || length <= 0) return 0;
  const safeCurrent = Number.isFinite(current) ? Math.trunc(current) : 0;
  const size = Math.trunc(length);
  return ((safeCurrent + delta) % size + size) % size;
}
