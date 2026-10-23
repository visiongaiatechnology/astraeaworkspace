// STATUS: PLATIN — bounded, validated local projections; source authorization remains caller-owned.
import type { WorkspaceDocument, WorkspaceObject } from '../../../shared/contracts/workspace';
import type { WhiteboardLiveObjectKind, WhiteboardLiveObjectMode, WhiteboardLiveObjectSnapshot } from '../../../shared/contracts/whiteboard/workspaceWhiteboard';
import { secureRandomId } from '../../../shared/crypto/secureRandom';
import type { WhiteboardItem } from '../types';

const MAX_LINES = 12;
const MAX_LABELS = 24;
const MAX_TEXT = 320;
const MAX_SELECTOR = 512;
const MAX_SOURCE_SCAN = 10_000;
const MAX_FORM_RESPONSES = 1_000;
const MAX_VALUES_PER_ANSWER = 24;
const LIVE_KINDS: readonly WhiteboardLiveObjectKind[] = [
  'grid-range', 'grid-chart', 'writer-excerpt', 'present-slide', 'project-milestone-timeline',
  'planner-board', 'task-card', 'form-result-chart', 'database-view', 'pdf-page', 'note-block', 'vault-asset',
];
const SUPPORTED: Readonly<Record<string, readonly WhiteboardLiveObjectKind[]>> = {
  Grid: ['grid-range', 'grid-chart'], Writer: ['writer-excerpt'], Present: ['present-slide'],
  Projects: ['project-milestone-timeline'], Planner: ['planner-board'], Tasks: ['task-card'],
  Forms: ['form-result-chart'], Database: ['database-view'], PdfStudio: ['pdf-page'],
  Notes: ['note-block'], Vault: ['vault-asset'],
};
type UnknownRecord = Readonly<Record<string, unknown>>;

const asRecord = (value: unknown): UnknownRecord | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value as UnknownRecord : undefined;
const field = (value: unknown, key: string): unknown => {
  const source = asRecord(value);
  return source && Object.prototype.hasOwnProperty.call(source, key) ? source[key] : undefined;
};
const asArray = (value: unknown): readonly unknown[] => Array.isArray(value) ? value : [];
const clean = (value: unknown, max = MAX_TEXT): string => {
  const bounded = Math.max(0, Math.min(MAX_TEXT * 16, Math.trunc(Number.isFinite(max) ? max : MAX_TEXT)));
  const text = typeof value === 'string' ? value : typeof value === 'boolean' ? String(value) : typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
  return text.slice(0, bounded * 4).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, bounded);
};
const numberValue = (value: unknown, fallback = 0, min = -1e12, max = 1e12): number => {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.length <= 64 ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
};
const selector = (value?: string): string | undefined => clean(value, MAX_SELECTOR) || undefined;
const list = (values: readonly unknown[], max = MAX_LINES): string[] => {
  const result: string[] = [];
  const limit = Math.max(0, Math.min(values.length, Math.trunc(numberValue(max, MAX_LINES, 0, MAX_LABELS))));
  for (let index = 0; index < limit; index += 1) {
    const text = clean(values[index]);
    if (text) result.push(text);
  }
  return result;
};
const supportedKinds = (source?: WorkspaceDocument | null): readonly WhiteboardLiveObjectKind[] => source ? (SUPPORTED[source.kind] ?? []) : [];
const validKind = (value: unknown): value is WhiteboardLiveObjectKind => typeof value === 'string' && LIVE_KINDS.includes(value as WhiteboardLiveObjectKind);
const validMode = (value: unknown): value is WhiteboardLiveObjectMode => value === 'Live' || value === 'Frozen' || value === 'Link';

function nowSnapshot(source: WorkspaceDocument, title: unknown, lines: readonly unknown[], extra: Partial<WhiteboardLiveObjectSnapshot> = {}): WhiteboardLiveObjectSnapshot {
  const safeTitle = clean(title) || clean(source.title) || clean(source.kind);
  const snapshot: WhiteboardLiveObjectSnapshot = {
    sourceVersion: Math.max(0, numberValue(source.version, 0, 0, Number.MAX_SAFE_INTEGER)),
    capturedAt: Date.now(),
    title: safeTitle,
    lines: list(lines),
  };
  const safeSubtitle = clean(extra.subtitle);
  if (safeSubtitle) snapshot.subtitle = safeSubtitle;
  if (extra.labels) snapshot.labels = list(extra.labels, MAX_LABELS);
  if (extra.values) snapshot.values = extra.values.slice(0, MAX_LABELS).map((value) => numberValue(value));
  const safeStatus = clean(extra.status, 64);
  if (safeStatus) snapshot.status = safeStatus;
  return snapshot;
}

function snapshotFromUnknown(value: unknown, fallbackTitle: unknown): WhiteboardLiveObjectSnapshot | undefined {
  const source = asRecord(value);
  if (!source) return undefined;
  const lines = list(asArray(source.lines));
  const snapshot: WhiteboardLiveObjectSnapshot = {
    sourceVersion: Math.max(0, numberValue(source.sourceVersion, 0, 0, Number.MAX_SAFE_INTEGER)),
    capturedAt: Math.max(0, numberValue(source.capturedAt, 0, 0, Number.MAX_SAFE_INTEGER)),
    title: clean(source.title) || clean(fallbackTitle),
    lines,
  };
  const subtitle = clean(source.subtitle);
  if (subtitle) snapshot.subtitle = subtitle;
  const labels = list(asArray(source.labels), MAX_LABELS);
  const values = asArray(source.values).slice(0, MAX_LABELS).map((entry) => numberValue(entry));
  if (labels.length) snapshot.labels = labels;
  if (values.length) snapshot.values = values;
  const status = clean(source.status, 64);
  if (status) snapshot.status = status;
  return snapshot;
}

function objectByIdOrType(source: WorkspaceDocument, objectId: string | undefined, type: WorkspaceObject['type']): WorkspaceObject | undefined {
  const objects = asRecord(source.objects);
  if (!objects) return undefined;
  const matchingObject = (candidate: unknown): candidate is WorkspaceObject => {
    const value = asRecord(candidate);
    return value?.type === type && asRecord(value.data) !== undefined;
  };
  if (objectId) {
    const selected = objects[objectId];
    return matchingObject(selected) ? selected : undefined;
  }
  let inspected = 0;
  for (const id in objects) {
    if (!Object.prototype.hasOwnProperty.call(objects, id)) continue;
    if (inspected >= MAX_SOURCE_SCAN) break;
    inspected += 1;
    const candidate = objects[id];
    if (matchingObject(candidate)) return candidate;
  }
  return undefined;
}

function findById(values: readonly unknown[], id: string | undefined, scanLimit = MAX_SOURCE_SCAN): UnknownRecord | undefined {
  const count = Math.min(values.length, scanLimit);
  if (id) {
    for (let index = 0; index < count; index += 1) {
      const candidate = asRecord(values[index]);
      if (candidate && clean(candidate.id, MAX_SELECTOR) === id) return candidate;
    }
  }
  return id ? undefined : asRecord(values[0]);
}

function paragraphText(paragraph: unknown): string {
  const spans = asArray(field(paragraph, 'spans'));
  const parts: string[] = [];
  for (let index = 0; index < Math.min(spans.length, 32); index += 1) {
    const text = clean(field(spans[index], 'text'), 80);
    if (text) parts.push(text);
  }
  return clean(parts.join(' '));
}

function appendTextValues(lines: string[], values: readonly unknown[], mapper: (value: unknown) => string, max = MAX_LINES): boolean {
  const limit = Math.min(values.length, Math.max(0, max));
  let index = 0;
  for (; index < limit && lines.length < MAX_LINES - 1; index += 1) {
    const text = mapper(values[index]);
    if (text) lines.push(text);
  }
  return index < values.length;
}

function gridRange(source: WorkspaceDocument, rawSelector?: string): WhiteboardLiveObjectSnapshot {
  const [objectId] = (selector(rawSelector) ?? '').split(/[?:#]/);
  const object = objectByIdOrType(source, objectId || undefined, 'Table');
  if (!object || object.type !== 'Table') return nowSnapshot(source, source.title, ['No Grid table is available.'], { status: 'missing' });
  const cells = asRecord(object.data.cells);
  const lines: string[] = [];
  let truncated = false;
  if (cells) {
    for (const key in cells) {
      if (!Object.prototype.hasOwnProperty.call(cells, key)) continue;
      if (lines.length >= MAX_LINES - 1) { truncated = true; break; }
      lines.push(`${clean(key, 80)}: ${clean(field(cells[key], 'value'), 80)}`);
    }
  }
  if (truncated) lines.push('Additional cells omitted.');
  return nowSnapshot(source, `${clean(source.title)} · Grid range`, lines.length ? lines : [`${numberValue(object.data.rows, 0, 0, 1e9)} rows × ${numberValue(object.data.cols, 0, 0, 1e9)} columns`], { subtitle: selector(rawSelector) ?? clean(object.data.id), status: truncated ? 'partial' : undefined });
}

function gridChart(source: WorkspaceDocument, rawSelector?: string): WhiteboardLiveObjectSnapshot {
  const object = objectByIdOrType(source, selector(rawSelector), 'Chart');
  if (!object || object.type !== 'Chart') return nowSnapshot(source, source.title, ['No Grid chart is available.'], { status: 'missing' });
  const chart = object.data;
  const series = asArray(chart.series);
  const numericValues: number[] = [];
  for (const value of asArray(field(series[0], 'values')).slice(0, MAX_LABELS)) {
    if (typeof value === 'number' && Number.isFinite(value)) numericValues.push(numberValue(value));
  }
  const labels = list(asArray(chart.categories).slice(0, numericValues.length), MAX_LABELS);
  const lines = [`${clean(chart.chart_type)} · ${Math.min(series.length, MAX_SOURCE_SCAN)} series`];
  return nowSnapshot(source, clean(chart.title) || `${clean(source.title)} · Chart`, lines, { subtitle: clean(chart.id), labels, values: numericValues });
}

function writerExcerpt(source: WorkspaceDocument, rawSelector?: string): WhiteboardLiveObjectSnapshot {
  const object = objectByIdOrType(source, selector(rawSelector), 'TextBlock');
  if (!object || object.type !== 'TextBlock') return nowSnapshot(source, source.title, ['No Writer text block is available.'], { status: 'missing' });
  const paragraphs = asArray(object.data.paragraphs);
  const lines: string[] = [];
  for (let index = 0; index < Math.min(paragraphs.length, MAX_LINES - 1); index += 1) {
    const text = paragraphText(paragraphs[index]);
    if (text) lines.push(text);
  }
  if (paragraphs.length > MAX_LINES - 1) lines.push('Additional excerpt content omitted.');
  return nowSnapshot(source, `${clean(source.title)} · Excerpt`, lines.length ? lines : ['Empty excerpt'], { subtitle: clean(object.data.id) });
}

function presentSlide(source: WorkspaceDocument, rawSelector?: string): WhiteboardLiveObjectSnapshot {
  const slides = asArray(source.presentData?.slides);
  const selected = findById(slides, selector(rawSelector));
  if (!selected) return nowSnapshot(source, source.title, ['No Present slide is available.'], { status: 'missing' });
  const lines: string[] = [];
  const subtitle = clean(selected.subtitle);
  if (subtitle) lines.push(subtitle);
  const bullets = asArray(selected.bulletPoints);
  const bulletTruncated = appendTextValues(lines, bullets, clean, MAX_LINES);
  const cards = asArray(selected.cards);
  const cardTruncated = appendTextValues(lines, cards, (card) => {
    const label = clean(field(card, 'title')) || clean(field(card, 'label'));
    const value = clean(field(card, 'value'));
    return label ? `${label}${value ? `: ${value}` : ''}` : value;
  }, MAX_LINES);
  if ((bulletTruncated || cardTruncated) && lines.length < MAX_LINES) lines.push('Additional slide content omitted.');
  return nowSnapshot(source, clean(selected.title) || `${clean(source.title)} · Slide`, lines, { subtitle: clean(selected.id) });
}

function projectTimeline(source: WorkspaceDocument, rawSelector?: string): WhiteboardLiveObjectSnapshot {
  const state = source.workManagementData ?? source.workData;
  const milestones = asArray(field(state, 'milestones'));
  const tasks = asArray(field(state, 'tasks'));
  const requestedMilestone = selector(rawSelector);
  const selected = findById(milestones, requestedMilestone);
  if (requestedMilestone && !selected) return nowSnapshot(source, source.title, ['Selected milestone is unavailable.'], { status: 'missing' });
  if (selected && requestedMilestone) {
    return nowSnapshot(source, field(selected, 'name'), [`${clean(field(selected, 'startDate'))} → ${clean(field(selected, 'endDate'))}`, `${Math.round(numberValue(field(selected, 'progress'), 0, 0, 100))}% complete`], { subtitle: `${clean(source.title)} · Milestone` });
  }
  const lines: string[] = [];
  let truncated = appendTextValues(lines, milestones, (item) => `${clean(field(item, 'name'))} · ${clean(field(item, 'startDate'))} → ${clean(field(item, 'endDate'))} · ${Math.round(numberValue(field(item, 'progress'), 0, 0, 100))}%`, 8);
  if (lines.length < 8) {
    const scanCount = Math.min(tasks.length, MAX_SOURCE_SCAN);
    let taskLines = 0;
    for (let index = 0; index < scanCount && lines.length < 8; index += 1) {
      const task = tasks[index];
      const startDate = clean(field(task, 'startDate'));
      const dueDate = clean(field(task, 'dueDate'));
      if (!startDate && !dueDate) continue;
      lines.push(`${clean(field(task, 'title'))} · ${startDate || '…'} → ${dueDate || '…'}`);
      taskLines += 1;
    }
    truncated = taskLines === 0 && tasks.length > scanCount || scanCount < tasks.length || taskLines >= 8 - lines.length || truncated;
  }
  if (!lines.length) lines.push('No scheduled milestones or tasks.');
  if (truncated && lines.length < MAX_LINES) lines.push('Additional schedule entries omitted.');
  return nowSnapshot(source, field(field(state, 'project'), 'name') || `${clean(source.title)} · Timeline`, lines, { status: truncated ? 'partial' : undefined });
}

function plannerBoard(source: WorkspaceDocument): WhiteboardLiveObjectSnapshot {
  const cards = asArray(field(source.workManagementData ?? source.workData, 'cards'));
  const counts = new Map<string, number>();
  const count = Math.min(cards.length, MAX_SOURCE_SCAN);
  for (let index = 0; index < count; index += 1) {
    const column = clean(field(cards[index], 'column'), 80) || 'Unassigned';
    counts.set(column, (counts.get(column) ?? 0) + 1);
  }
  const pairs = [...counts.entries()].slice(0, MAX_LINES);
  return nowSnapshot(source, `${clean(source.title)} · Planner board`, pairs.map(([column, total]) => `${column}: ${total} card${total === 1 ? '' : 's'}`), {
    labels: [...counts.keys()].slice(0, MAX_LABELS), values: [...counts.values()].slice(0, MAX_LABELS),
    subtitle: cards.length > count ? `First ${count} of ${cards.length} cards` : undefined,
    status: cards.length > count ? 'partial' : undefined,
  });
}

function taskCard(source: WorkspaceDocument, rawSelector?: string): WhiteboardLiveObjectSnapshot {
  const tasks = asArray(field(source.workManagementData ?? source.workData, 'tasks'));
  const task = findById(tasks, selector(rawSelector));
  if (!task) return nowSnapshot(source, source.title, ['No task is available.'], { status: 'missing' });
  const completed = field(task, 'completed') === true;
  const status = clean(field(task, 'status')) || (completed ? 'completed' : 'open');
  const tags = asArray(field(task, 'tags'));
  const lines = [clean(field(task, 'description')), `Status: ${status}`, `Priority: ${clean(field(task, 'priority'))}`];
  const dueDate = clean(field(task, 'dueDate'));
  if (dueDate) lines.push(`Due: ${dueDate}`);
  for (const tag of tags.slice(0, 4)) lines.push(`#${clean(tag, 64)}`);
  return nowSnapshot(source, field(task, 'title'), lines, { subtitle: `${clean(source.title)} · Task`, status });
}

function formResults(source: WorkspaceDocument, rawSelector?: string): WhiteboardLiveObjectSnapshot {
  const forms = asRecord(source.formsData);
  const fields = asArray(forms?.fields);
  const requestedId = selector(rawSelector);
  let fieldModel = findById(fields, requestedId);
  if (!requestedId || !fieldModel) {
    for (let index = 0; index < Math.min(fields.length, MAX_SOURCE_SCAN); index += 1) {
      const candidate = fields[index];
      if (!['section', 'description'].includes(clean(field(candidate, 'type')))) { fieldModel = asRecord(candidate); break; }
    }
  }
  if (requestedId && !fieldModel) return nowSnapshot(source, source.title, ['Selected form field is unavailable.'], { status: 'missing' });
  if (!forms || !fieldModel) return nowSnapshot(source, source.title, ['No form result field is available.'], { status: 'missing' });
  const fieldId = clean(field(fieldModel, 'id'), MAX_SELECTOR);
  const responses = asArray(forms.responses);
  const responsesCount = Math.min(responses.length, MAX_FORM_RESPONSES);
  const counts = new Map<string, number>();
  let truncated = responses.length > responsesCount;
  for (let index = 0; index < responsesCount; index += 1) {
    const answer = field(field(responses[index], 'answers'), fieldId);
    const values = Array.isArray(answer) ? answer : [answer];
    if (values.length > MAX_VALUES_PER_ANSWER) truncated = true;
    for (const value of values.slice(0, MAX_VALUES_PER_ANSWER)) {
      const label = clean(value, 64);
      if (label) counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }
  const pairs = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_LABELS);
  const lines = [`${responses.length} responses`, ...pairs.slice(0, truncated ? MAX_LINES - 2 : MAX_LINES - 1).map(([label, total]) => `${label}: ${total}`)];
  if (truncated && lines.length < MAX_LINES) lines.push('Results use a bounded sample.');
  return nowSnapshot(source, field(fieldModel, 'label'), lines, { subtitle: `${clean(source.title)} · Results`, labels: pairs.map(([label]) => label), values: pairs.map(([, total]) => total), status: truncated ? 'partial' : undefined });
}

function databaseView(source: WorkspaceDocument, rawSelector?: string): WhiteboardLiveObjectSnapshot {
  const db = asRecord(source.databaseData);
  const views = asArray(db?.savedViews);
  const requestedView = selector(rawSelector);
  const view = findById(views, requestedView);
  if (!db) return nowSnapshot(source, source.title, ['No Database model is available.'], { status: 'missing' });
  if (requestedView && !view) return nowSnapshot(source, source.title, ['Selected Database view is unavailable.'], { status: 'missing' });
  const allColumns = asArray(db.columns);
  const allRecords = asArray(db.records);
  const columns = allColumns.slice(0, 6);
  const records = allRecords.slice(0, 8);
  const lines = records.map((record) => columns.map((column) => `${clean(field(column, 'name'), 48)}: ${clean(field(field(record, 'fields'), clean(field(column, 'id'), MAX_SELECTOR)), 48)}`).join(' · '));
  return nowSnapshot(source, field(view, 'name') || `${clean(source.title)} · Database`, lines.length ? lines : ['No records'], { subtitle: `${records.length}/${allRecords.length} records · ${columns.length} shown columns` });
}

function pdfPage(source: WorkspaceDocument, rawSelector?: string): WhiteboardLiveObjectSnapshot {
  const pages = asArray(source.pdfData?.pages);
  const selectedId = selector(rawSelector);
  const page = selectedId ? findById(pages, selectedId) : asRecord(pages[0]);
  if (!page) return nowSnapshot(source, source.title, ['No PDF page is available.'], { status: 'missing' });
  const pageNumber = numberValue(field(page, 'pageNumber'), 1, 1, Number.MAX_SAFE_INTEGER);
  const ocrLines = asArray(field(field(page, 'ocrLayer'), 'lines'));
  const lines: string[] = [];
  const truncated = appendTextValues(lines, ocrLines, (line) => clean(field(line, 'text')), MAX_LINES);
  if (truncated) lines.push('Additional page text omitted.');
  return nowSnapshot(source, clean(field(page, 'title')) || `Page ${pageNumber}`, lines.length ? lines : [clean(field(page, 'subtitle')) || `PDF page ${pageNumber}`], { subtitle: `${clean(source.title)} · Page ${pageNumber}`, status: truncated ? 'partial' : undefined });
}

function findNotePage(source: WorkspaceDocument, requestedId?: string): UnknownRecord | undefined {
  const notebooks = asArray(source.notebooks);
  let inspected = 0;
  for (const notebook of notebooks.slice(0, 64)) {
    for (const section of asArray(field(notebook, 'sections')).slice(0, 128)) {
      for (const page of asArray(field(section, 'pages'))) {
        if (inspected++ >= MAX_SOURCE_SCAN) return undefined;
        const candidate = asRecord(page);
        if (candidate && requestedId && clean(candidate.id, MAX_SELECTOR) === requestedId) return candidate;
        if (!requestedId && candidate) return candidate;
      }
    }
  }
  for (const section of asArray(field(source.noteData, 'sections')).slice(0, 128)) {
    for (const page of asArray(field(section, 'pages'))) {
      if (inspected++ >= MAX_SOURCE_SCAN) return undefined;
      const candidate = asRecord(page);
      if (candidate && requestedId && clean(candidate.id, MAX_SELECTOR) === requestedId) return candidate;
      if (!requestedId && candidate) return candidate;
    }
  }
  return undefined;
}

function noteBlock(source: WorkspaceDocument, rawSelector?: string): WhiteboardLiveObjectSnapshot {
  const page = findNotePage(source, selector(rawSelector));
  if (!page) return nowSnapshot(source, source.title, ['No Note page is available.'], { status: 'missing' });
  const blocks = asArray(field(field(page, 'canvas'), 'blocks'));
  const lines: string[] = [];
  for (let index = 0; index < Math.min(blocks.length, MAX_LINES - 1); index += 1) {
    const block = blocks[index];
    const kind = clean(field(block, 'kind'));
    if (kind === 'text') lines.push(clean(field(block, 'text')));
    else if (kind === 'toggle') lines.push(`${clean(field(block, 'title'))}: ${clean(field(block, 'text'))}`);
    else if (kind === 'list') lines.push(list(asArray(field(block, 'items')), MAX_LABELS).join(' · '));
  }
  if (blocks.length > MAX_LINES - 1) lines.push('Additional note content omitted.');
  const content = clean(field(page, 'content'));
  return nowSnapshot(source, clean(field(page, 'title')) || `${clean(source.title)} · Note`, lines.filter(Boolean).length ? lines : [content || 'Empty note'], { subtitle: clean(field(page, 'id')) });
}

function vaultAsset(source: WorkspaceDocument, rawSelector?: string): WhiteboardLiveObjectSnapshot {
  const files = asArray(field(source.vaultData, 'files'));
  const requestedId = selector(rawSelector);
  let file: UnknownRecord | undefined;
  if (requestedId) {
    const count = Math.min(files.length, MAX_SOURCE_SCAN);
    for (let index = 0; index < count; index += 1) {
      const candidate = asRecord(files[index]);
      if (candidate && clean(candidate.id, MAX_SELECTOR) === requestedId) { file = candidate; break; }
    }
  } else {
    for (const candidateValue of files.slice(0, MAX_SOURCE_SCAN)) {
      const candidate = asRecord(candidateValue);
      const status = field(candidate, 'status');
      if (candidate && (status === undefined || status === 'available')) { file = candidate; break; }
    }
  }
  const status = field(file, 'status');
  if (!file || status !== undefined && status !== 'available') return nowSnapshot(source, source.title, ['No safe Vault asset is available.'], { status: 'missing' });
  const integrity = clean(field(file, 'integrityState')) || 'unverified';
  const mime = clean(field(file, 'mimeType')) || clean(field(file, 'kind'));
  const size = numberValue(field(file, 'sizeBytes'), 0, 0, Number.MAX_SAFE_INTEGER);
  const fileName = clean(field(file, 'name')) || 'Vault asset';
  return nowSnapshot(source, fileName, [`${mime} · ${size} B`, `Integrity: ${integrity}`], { subtitle: `${clean(source.title)} · Vault asset`, status: 'available' });
}

export const liveObjectKindsForDocument = (source?: WorkspaceDocument | null): WhiteboardLiveObjectKind[] => [...supportedKinds(source)];
export const isWhiteboardLiveSource = (source: WorkspaceDocument): boolean => supportedKinds(source).length > 0;
export const makeWhiteboardLiveSourceUri = (documentId: string, kind: WhiteboardLiveObjectKind, rawSelector?: string): string => {
  const base = `vgt://workspace/document/${encodeURIComponent(clean(documentId, 256))}`;
  const selected = selector(rawSelector);
  return `${base}?whiteboard=${encodeURIComponent(kind)}${selected ? `&selector=${encodeURIComponent(selected)}` : ''}`;
};

export function extractWhiteboardLiveSnapshot(source: WorkspaceDocument, kind: WhiteboardLiveObjectKind, rawSelector?: string): WhiteboardLiveObjectSnapshot {
  if (!supportedKinds(source).includes(kind)) return nowSnapshot(source, source.title, [`${clean(kind)} is incompatible with ${clean(source.kind)}.`], { status: 'incompatible' });
  switch (kind) {
    case 'grid-range': return gridRange(source, rawSelector);
    case 'grid-chart': return gridChart(source, rawSelector);
    case 'writer-excerpt': return writerExcerpt(source, rawSelector);
    case 'present-slide': return presentSlide(source, rawSelector);
    case 'project-milestone-timeline': return projectTimeline(source, rawSelector);
    case 'planner-board': return plannerBoard(source);
    case 'task-card': return taskCard(source, rawSelector);
    case 'form-result-chart': return formResults(source, rawSelector);
    case 'database-view': return databaseView(source, rawSelector);
    case 'pdf-page': return pdfPage(source, rawSelector);
    case 'note-block': return noteBlock(source, rawSelector);
    case 'vault-asset': return vaultAsset(source, rawSelector);
  }
}

export function createWhiteboardLiveObject(input: { source: WorkspaceDocument; kind: WhiteboardLiveObjectKind; mode: WhiteboardLiveObjectMode; selector?: string; x: number; y: number; id?: string }): WhiteboardItem {
  if (!supportedKinds(input.source).includes(input.kind)) throw new Error('whiteboard_live_source_kind_mismatch');
  if (!validKind(input.kind) || !validMode(input.mode)) throw new Error('whiteboard_live_contract_invalid');
  const documentId = clean(input.source.id, 256);
  if (!documentId) throw new Error('whiteboard_live_source_id_invalid');
  const selected = selector(input.selector);
  const frozenSnapshot = input.mode === 'Frozen' ? extractWhiteboardLiveSnapshot(input.source, input.kind, selected) : undefined;
  return {
    id: clean(input.id, 128) || secureRandomId('live'),
    type: 'live',
    x: numberValue(input.x, 0, -1e7, 1e7),
    y: numberValue(input.y, 0, -1e7, 1e7),
    width: 360,
    height: 220,
    text: clean(input.source.title),
    zIndex: 20,
    liveObject: { kind: input.kind, mode: input.mode, sourceDocumentId: documentId, sourceUri: makeWhiteboardLiveSourceUri(documentId, input.kind, selected), selector: selected, sourceTitle: clean(input.source.title, 160), frozenSnapshot },
  };
}

export function resolveWhiteboardLiveObject(item: WhiteboardItem, documents: Record<string, WorkspaceDocument>): { snapshot: WhiteboardLiveObjectSnapshot; available: boolean } | null {
  const data = asRecord(item.liveObject);
  if (item.type !== 'live' || !data) return null;
  const kind = field(data, 'kind');
  const mode = field(data, 'mode');
  const sourceDocumentId = clean(field(data, 'sourceDocumentId'), 256);
  const sourceTitle = clean(field(data, 'sourceTitle'));
  if (!validKind(kind) || !validMode(mode) || !sourceDocumentId) {
    return { snapshot: { sourceVersion: 0, capturedAt: 0, title: sourceTitle || 'Live object', lines: ['Live source contract is invalid.'], status: 'unavailable' }, available: false };
  }
  const selected = selector(typeof field(data, 'selector') === 'string' ? field(data, 'selector') as string : undefined);
  if (mode === 'Frozen') {
    const snapshot = snapshotFromUnknown(field(data, 'frozenSnapshot'), sourceTitle);
    return { snapshot: snapshot ?? { sourceVersion: 0, capturedAt: 0, title: sourceTitle || 'Frozen snapshot', lines: ['Frozen snapshot is unavailable.'], status: 'missing' }, available: Boolean(snapshot) };
  }
  const source = asRecord(documents)?.[sourceDocumentId] as WorkspaceDocument | undefined;
  if (!source || clean(source.id, 256) !== sourceDocumentId) {
    return { snapshot: { sourceVersion: 0, capturedAt: 0, title: sourceTitle || 'Live source', subtitle: kind, lines: ['Live source is not open in this Workspace.'], status: 'unavailable' }, available: false };
  }
  if (mode === 'Link') {
    return { snapshot: { sourceVersion: Math.max(0, numberValue(source.version, 0, 0, Number.MAX_SAFE_INTEGER)), capturedAt: 0, title: clean(source.title) || sourceTitle, subtitle: clean(source.kind) || kind, lines: [makeWhiteboardLiveSourceUri(sourceDocumentId, kind, selected)], status: 'linked' }, available: true };
  }
  const snapshot = extractWhiteboardLiveSnapshot(source, kind, selected);
  return { snapshot, available: snapshot.status !== 'incompatible' };
}

export function changeWhiteboardLiveObjectMode(item: WhiteboardItem, mode: WhiteboardLiveObjectMode, documents: Record<string, WorkspaceDocument>): WhiteboardItem {
  if (!validMode(mode)) throw new Error('whiteboard_live_mode_invalid');
  const data = asRecord(item.liveObject);
  if (item.type !== 'live' || !data) return item;
  const kind = field(data, 'kind');
  const sourceDocumentId = clean(field(data, 'sourceDocumentId'), 256);
  if (!validKind(kind) || !sourceDocumentId) throw new Error('whiteboard_live_contract_invalid');
  const source = asRecord(documents)?.[sourceDocumentId] as WorkspaceDocument | undefined;
  if (mode === 'Frozen' && (!source || clean(source.id, 256) !== sourceDocumentId || !supportedKinds(source).includes(kind))) {
    throw new Error('whiteboard_live_freeze_source_unavailable');
  }
  const selected = selector(typeof field(data, 'selector') === 'string' ? field(data, 'selector') as string : undefined);
  return { ...item, liveObject: { ...item.liveObject!, kind, mode, selector: selected, sourceUri: makeWhiteboardLiveSourceUri(sourceDocumentId, kind, selected), frozenSnapshot: mode === 'Frozen' && source ? extractWhiteboardLiveSnapshot(source, kind, selected) : undefined } };
}
