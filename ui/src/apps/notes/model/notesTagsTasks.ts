// STATUS: DIAMANT VGT SUPREME — canonical Notes tags, smart collections and Task bridge
import type {
  NoteNotebook,
  NotePage,
  NotePropertyValue,
  NoteSmartCollection,
  NoteSmartCollectionQuery,
  NoteTagDefinition,
  NoteTaskBinding,
  TaskItem,
} from '../../../shared/contracts/workspace';

export const NOTES_MAX_CUSTOM_TAGS = 128;
export const NOTES_MAX_SMART_COLLECTIONS = 128;
export const NOTES_MAX_TASK_BINDINGS_PER_PAGE = 256;
const TAG_NAME_MAX = 64;
const ICON_MAX = 8;
const COLLECTION_NAME_MAX = 96;
const TASK_TITLE_MAX = 240;

export const BUILT_IN_NOTE_TAGS: readonly NoteTagDefinition[] = Object.freeze([
  { id: 'builtin-todo', name: 'To Do', icon: '☑', color: '#60a5fa', builtIn: true },
  { id: 'builtin-important', name: 'Important', icon: '!', color: '#f59e0b', builtIn: true },
  { id: 'builtin-question', name: 'Question', icon: '?', color: '#a78bfa', builtIn: true },
  { id: 'builtin-idea', name: 'Idea', icon: '✦', color: '#facc15', builtIn: true },
  { id: 'builtin-contact', name: 'Contact', icon: '@', color: '#34d399', builtIn: true },
  { id: 'builtin-definition', name: 'Definition', icon: '≡', color: '#22d3ee', builtIn: true },
  { id: 'builtin-source', name: 'Source', icon: '↗', color: '#94a3b8', builtIn: true },
]);

export interface MarkdownChecklistItem {
  lineIndex: number;
  checked: boolean;
  text: string;
  indent: string;
  sourceKey: string | null;
}

export interface NoteTaskConversionResult {
  page: NotePage;
  task: TaskItem;
}

export interface NoteSmartCollectionMatch {
  pageId: string;
  notebookId: string;
  sectionId: string;
}

export function noteTagKey(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

export const NOTES_MAX_TAGS_PER_PAGE = 64;

export type NoteTagValidation =
  | { ok: true; tag: string }
  | { ok: false; message: string };

/**
 * AST-0679: the tag identity rule is one pure function shared by the editor path, so `" Research "` can
 * never become a second tag next to `"research"` and every refusal carries a message the UI can show.
 */
export function validateNoteTagInput(page: Pick<NotePage, 'tags'>, rawTag: string): NoteTagValidation {
  const name = String(rawTag ?? '').replace(/^#+/, '').normalize('NFKC').trim().replace(/\s+/g, ' ');
  const key = noteTagKey(name);
  if (!key) return { ok: false, message: 'A tag needs at least one visible character.' };
  if (name.length > TAG_NAME_MAX) return { ok: false, message: `Tags are limited to ${TAG_NAME_MAX} characters.` };
  const tags = page.tags ?? [];
  if (tags.some((entry) => noteTagKey(entry) === key)) return { ok: false, message: `“${name}” is already on this note.` };
  if (tags.length >= NOTES_MAX_TAGS_PER_PAGE) return { ok: false, message: `This note already carries the maximum of ${NOTES_MAX_TAGS_PER_PAGE} tags.` };
  return { ok: true, tag: name };
}

function createStableId(prefix: string): string {
  if (typeof crypto === 'undefined' || typeof crypto.randomUUID !== 'function') throw new Error('Cryptographic random UUID support is required.');
  return `${prefix}-${crypto.randomUUID()}`;
}

function sanitizeTagName(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').slice(0, TAG_NAME_MAX);
}

function sanitizeTagIcon(value: string): string {
  return Array.from(value.normalize('NFKC').trim()).slice(0, ICON_MAX).join('') || '•';
}

function sanitizeTagColor(value: string): string {
  const normalized = value.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : '#64748b';
}

export function allNoteTagDefinitions(notebook: Pick<NoteNotebook, 'tagDefinitions'>): NoteTagDefinition[] {
  const seen = new Set(BUILT_IN_NOTE_TAGS.map((tag) => noteTagKey(tag.name)));
  const custom: NoteTagDefinition[] = [];
  for (const raw of (notebook.tagDefinitions ?? []).slice(0, NOTES_MAX_CUSTOM_TAGS * 2)) {
    if (raw.builtIn) continue;
    const name = sanitizeTagName(raw.name);
    const key = noteTagKey(name);
    if (!name || seen.has(key)) continue;
    seen.add(key);
    custom.push({ id: raw.id || createStableId('tag'), name, icon: sanitizeTagIcon(raw.icon), color: sanitizeTagColor(raw.color), builtIn: false });
    if (custom.length >= NOTES_MAX_CUSTOM_TAGS) break;
  }
  return [...BUILT_IN_NOTE_TAGS, ...custom];
}

export function upsertCustomNoteTag(notebook: NoteNotebook, input: { id?: string; name: string; icon: string; color: string }): NoteNotebook {
  const name = sanitizeTagName(input.name);
  if (!name) return notebook;
  const key = noteTagKey(name);
  if (BUILT_IN_NOTE_TAGS.some((tag) => noteTagKey(tag.name) === key)) return notebook;
  const existing = (notebook.tagDefinitions ?? []).filter((tag) => !tag.builtIn);
  const id = input.id ?? createStableId('tag');
  const next: NoteTagDefinition = { id, name, icon: sanitizeTagIcon(input.icon), color: sanitizeTagColor(input.color), builtIn: false };
  const replaced = existing.some((tag) => tag.id === id || noteTagKey(tag.name) === key)
    ? existing.map((tag) => tag.id === id || noteTagKey(tag.name) === key ? next : tag)
    : [...existing, next];
  return { ...notebook, tagDefinitions: replaced.slice(-NOTES_MAX_CUSTOM_TAGS) };
}

export function deleteCustomNoteTag(notebook: NoteNotebook, tagId: string): NoteNotebook {
  return { ...notebook, tagDefinitions: (notebook.tagDefinitions ?? []).filter((tag) => tag.id !== tagId || tag.builtIn) };
}

export function parseMarkdownChecklistItems(content: string): MarkdownChecklistItem[] {
  const items: MarkdownChecklistItem[] = [];
  const lines = content.split('\n').slice(0, 50_000);
  lines.forEach((line, lineIndex) => {
    const match = line.match(/^(\s*)- \[([ xX])\]\s+(.+?)\s*$/);
    if (!match) return;
    const marker = match[3].match(/^(.*?)\s+\^(task-[A-Za-z0-9_-]{1,128})\s*$/);
    const text = (marker ? marker[1] : match[3]).trim().slice(0, TASK_TITLE_MAX);
    if (!text) return;
    items.push({ lineIndex, checked: match[2].toLocaleLowerCase() === 'x', text, indent: match[1], sourceKey: marker?.[2] ?? null });
  });
  return items.slice(0, NOTES_MAX_TASK_BINDINGS_PER_PAGE * 2);
}

function canonicalNotePageUri(documentId: string, pageId: string): string {
  const safeDocumentId = encodeURIComponent(documentId).replace(/%2F/gi, '%252F');
  const safePageId = encodeURIComponent(pageId).replace(/%2F/gi, '%252F');
  return `vgt://workspace/document/${safeDocumentId}/page/${safePageId}`;
}

export function convertChecklistToCanonicalTask(
  page: NotePage,
  lineIndex: number,
  documentId: string,
  existingTasks: readonly TaskItem[],
  now = Date.now(),
): NoteTaskConversionResult | null {
  const item = parseMarkdownChecklistItems(page.content).find((candidate) => candidate.lineIndex === lineIndex);
  if (!item) return null;
  const existingBinding = item.sourceKey ? (page.taskBindings ?? []).find((binding) => binding.sourceKey === item.sourceKey) : null;
  const existingTask = existingBinding ? existingTasks.find((task) => task.id === existingBinding.taskId) : null;
  if (existingBinding && existingTask) return { page, task: existingTask };

  const bindingId = item.sourceKey ?? createStableId('task');
  const taskId = createStableId('task');
  const lines = page.content.split('\n');
  lines[lineIndex] = `${item.indent}- [${item.checked ? 'x' : ' '}] ${item.text} ^${bindingId}`;
  const binding: NoteTaskBinding = { id: createStableId('binding'), taskId, source: 'markdown', sourceKey: bindingId, sync: 'bidirectional', createdAt: now };
  const task: TaskItem = {
    id: taskId,
    title: item.text,
    completed: item.checked,
    progress: item.checked ? 100 : 0,
    priority: 'medium',
    tags: [...page.tags],
    description: `Linked from Astraea Notes page “${page.title}”.`,
    plannerColumn: item.checked ? 'done' : 'todo',
    linkedWorkspaceUris: [canonicalNotePageUri(documentId, page.id)],
  };
  return {
    page: { ...page, content: lines.join('\n'), taskBindings: [...(page.taskBindings ?? []).filter((entry) => entry.sourceKey !== bindingId), binding].slice(-NOTES_MAX_TASK_BINDINGS_PER_PAGE), last_modified: now },
    task,
  };
}

function updateChecklistLine(content: string, sourceKey: string, checked: boolean): string {
  const lines = content.split('\n');
  const index = lines.findIndex((line) => line.includes(`^${sourceKey}`));
  if (index < 0) return content;
  lines[index] = lines[index].replace(/^(\s*)- \[[ xX]\]/, `$1- [${checked ? 'x' : ' '}]`);
  return lines.join('\n');
}

export function synchronizePageFromCanonicalTasks(page: NotePage, tasks: readonly TaskItem[]): NotePage {
  let content = page.content;
  for (const binding of (page.taskBindings ?? []).slice(0, NOTES_MAX_TASK_BINDINGS_PER_PAGE)) {
    if (binding.source !== 'markdown' || binding.sync === 'note-to-task') continue;
    const task = tasks.find((candidate) => candidate.id === binding.taskId);
    if (!task) continue;
    content = updateChecklistLine(content, binding.sourceKey, task.completed);
  }
  return content === page.content ? page : { ...page, content };
}

export function synchronizeNotebooksFromCanonicalTasks(notebooks: readonly NoteNotebook[], tasks: readonly TaskItem[]): NoteNotebook[] {
  if (!tasks.length) return notebooks.map((notebook) => ({ ...notebook }));
  return notebooks.map((notebook) => ({ ...notebook, sections: notebook.sections.map((section) => ({ ...section, pages: section.pages.map((page) => synchronizePageFromCanonicalTasks(page, tasks)) })) }));
}

export function synchronizeCanonicalTasksFromNotebooks(notebooks: readonly NoteNotebook[], tasks: readonly TaskItem[]): TaskItem[] {
  const bindingState = new Map<string, boolean>();
  for (const notebook of notebooks) for (const section of notebook.sections) for (const page of section.pages) {
    const checklist = new Map(parseMarkdownChecklistItems(page.content).filter((item) => item.sourceKey).map((item) => [item.sourceKey!, item.checked]));
    for (const binding of (page.taskBindings ?? []).slice(0, NOTES_MAX_TASK_BINDINGS_PER_PAGE)) {
      if (binding.source !== 'markdown' || binding.sync === 'task-to-note') continue;
      const checked = checklist.get(binding.sourceKey);
      if (checked !== undefined) bindingState.set(binding.taskId, checked);
    }
  }
  return tasks.map((task) => {
    const checked = bindingState.get(task.id);
    if (checked === undefined || checked === task.completed) return task;
    return { ...task, completed: checked, progress: checked ? 100 : 0, plannerColumn: checked ? 'done' : task.plannerColumn === 'done' ? 'todo' : task.plannerColumn };
  });
}

function propertyMatches(actual: NotePropertyValue | undefined, expected: NotePropertyValue): boolean {
  if (expected === null) return actual === null || actual === undefined;
  if (typeof expected === 'string') return String(actual ?? '').normalize('NFKC').toLocaleLowerCase().includes(expected.normalize('NFKC').toLocaleLowerCase());
  return actual === expected;
}

export function pageMatchesSmartQuery(page: NotePage, query: NoteSmartCollectionQuery): boolean {
  const tests: boolean[] = [];
  if (query.text?.trim()) {
    const needle = query.text.normalize('NFKC').trim().toLocaleLowerCase();
    const haystack = `${page.title}\n${page.content}\n${page.tags.join(' ')}\n${(page.aliases ?? []).join(' ')}`.normalize('NFKC').toLocaleLowerCase();
    tests.push(haystack.includes(needle));
  }
  for (const tag of query.tags ?? []) tests.push(page.tags.some((entry) => noteTagKey(entry) === noteTagKey(tag)));
  for (const [key, value] of Object.entries(query.properties ?? {})) tests.push(propertyMatches(page.properties?.[key], value));
  if (!tests.length) return true;
  return query.match === 'any' ? tests.some(Boolean) : tests.every(Boolean);
}

export function queryNotesBySmartCollection(notebooks: readonly NoteNotebook[], collection: NoteSmartCollection): NoteSmartCollectionMatch[] {
  const matches: NoteSmartCollectionMatch[] = [];
  for (const notebook of notebooks) for (const section of notebook.sections) for (const page of section.pages) {
    if (page.trashedAt || page.archived) continue;
    if (pageMatchesSmartQuery(page, collection.query)) matches.push({ pageId: page.id, notebookId: notebook.id, sectionId: section.id });
  }
  return matches.slice(0, 10_000);
}

export function createSmartCollection(name: string, query: NoteSmartCollectionQuery, now = Date.now()): NoteSmartCollection {
  const safeName = name.normalize('NFKC').trim().replace(/\s+/g, ' ').slice(0, COLLECTION_NAME_MAX) || 'Smart Collection';
  const tags = Array.from(new Set((query.tags ?? []).map(sanitizeTagName).filter(Boolean))).slice(0, 32);
  const properties = Object.fromEntries(Object.entries(query.properties ?? {}).slice(0, 32).map(([key, value]) => [key.normalize('NFKC').trim().slice(0, 64), value]).filter(([key]) => Boolean(key)));
  return { id: createStableId('smart'), name: safeName, query: { text: query.text?.slice(0, 256), tags, properties, match: query.match === 'any' ? 'any' : 'all' }, createdAt: now, updatedAt: now };
}
