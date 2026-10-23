// STATUS: DIAMANT VGT SUPREME — stable cross-workspace Present live/frozen scene references
import type {
  PresentWorkspaceIntegrationKind,
  PresentWorkspaceSceneObject,
  PresentObjectGeometry,
  WorkspaceDocument,
  WriterWorkspaceEmbedSnapshot,
} from '../../../shared/contracts/workspace';
import { extractWorkspaceEmbedSnapshot, WorkspaceSnapshotError } from '../../../platform/workspace/integrations/workspaceSnapshot';
import type { PresentWorkspaceIntegrationRequest } from '../../../platform/workspace/integrations/presentWorkspaceIntegration';
import type { WorkspaceLocale } from '../../../shell/localization/workspaceLocaleTypes';
import type { PresentPercentRect } from '../canvas/model/presentRect';
import { isPlainPresentRecord } from '../canvas/model/presentScene';
import { PRESENT_OFFICE_COPY } from '../locale/presentOfficeLocale';

export type { PresentWorkspaceIntegrationRequest } from '../../../platform/workspace/integrations/presentWorkspaceIntegration';

const MAX_TEXT = 2_048;
const REFERENCE_WIDTH = 27;
const REFERENCE_HEIGHT = 18;
const REFERENCE_SLOTS = [
  { xPercent: 71, yPercent: 28 },
  { xPercent: 71, yPercent: 49 },
  { xPercent: 71, yPercent: 70 },
] as const;

function safeText(value: unknown, max = MAX_TEXT): string {
  return String(value ?? '').normalize('NFKC').slice(0, max);
}

function presentWorkspaceUri(documentId: string, kind: PresentWorkspaceIntegrationKind, objectId?: string, selector?: string): string {
  const query = new URLSearchParams();
  query.set('kind', kind);
  if (objectId) query.set('object', objectId);
  if (selector) query.set('selector', selector);
  return `vgt://workspace/document/${encodeURIComponent(documentId)}/present-reference?${query.toString()}`;
}

function writerSectionSnapshot(document: WorkspaceDocument, selector?: string): WriterWorkspaceEmbedSnapshot {
  if (document.kind !== 'Writer') throw new WorkspaceSnapshotError('Writer section requires a Writer document.');
  const blocks = document.root_object_ids
    .map((id) => document.objects[id])
    .filter((object) => object?.type === 'TextBlock');
  const paragraphs = blocks.flatMap((object) => object?.type === 'TextBlock' ? object.data.paragraphs : []);
  const startIndex = selector ? Math.max(0, paragraphs.findIndex((paragraph) => paragraph.id === selector)) : 0;
  const selected = paragraphs.slice(startIndex < 0 ? 0 : startIndex, (startIndex < 0 ? 0 : startIndex) + 32);
  const lines = selected.map((paragraph) => paragraph.spans.map((span) => span.text).join('')).filter(Boolean).map((line) => safeText(line, 1_024));
  return {
    type: 'summary',
    metrics: [
      { label: 'Document', value: safeText(document.title, 512) },
      { label: 'Version', value: String(document.version) },
      { label: 'Paragraphs', value: String(selected.length) },
    ],
    lines: lines.slice(0, 32),
  };
}

function gridKpiSnapshot(document: WorkspaceDocument, objectId?: string, selector?: string): WriterWorkspaceEmbedSnapshot {
  if (!objectId || !selector) throw new WorkspaceSnapshotError('Grid KPI requires a sheet and A1 range.');
  const snapshot = extractWorkspaceEmbedSnapshot(document, { kind: 'grid-range', sourceObjectId: objectId, sourceSelector: selector });
  if (snapshot.type !== 'table') throw new WorkspaceSnapshotError('Grid KPI range did not resolve to a table.');
  const values = snapshot.rows.flat().map((value) => Number(String(value).replace(',', '.'))).filter(Number.isFinite).slice(0, 10_000);
  const sum = values.reduce((total, value) => total + value, 0);
  const average = values.length ? sum / values.length : 0;
  return {
    type: 'summary',
    metrics: [
      { label: 'Range', value: selector.toUpperCase().slice(0, 64) },
      { label: 'Values', value: String(values.length) },
      { label: 'Sum', value: Number.isFinite(sum) ? sum.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '0' },
      { label: 'Average', value: Number.isFinite(average) ? average.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '0' },
    ],
    lines: snapshot.rows.slice(0, 6).map((row) => row.slice(0, 6).join(' · ')).map((line) => safeText(line, 512)),
  };
}

export function extractPresentWorkspaceSnapshot(request: PresentWorkspaceIntegrationRequest): WriterWorkspaceEmbedSnapshot {
  const source = request.sourceDocument;
  switch (request.integrationKind) {
    case 'grid-range':
      return extractWorkspaceEmbedSnapshot(source, { kind: 'grid-range', sourceObjectId: request.sourceObjectId, sourceSelector: request.sourceSelector });
    case 'grid-chart':
      return extractWorkspaceEmbedSnapshot(source, { kind: 'grid-chart', sourceObjectId: request.sourceObjectId });
    case 'grid-kpi':
      return gridKpiSnapshot(source, request.sourceObjectId, request.sourceSelector);
    case 'task-list':
      return extractWorkspaceEmbedSnapshot(source, { kind: 'task-list' });
    case 'task-kpi':
      return extractWorkspaceEmbedSnapshot(source, { kind: 'task-kpi' });
    case 'whiteboard-frame':
      return extractWorkspaceEmbedSnapshot(source, { kind: 'whiteboard-frame', sourceObjectId: request.sourceObjectId });
    case 'writer-section':
      return writerSectionSnapshot(source, request.sourceSelector);
    case 'pdf-page':
      return extractWorkspaceEmbedSnapshot(source, { kind: 'pdf-page', sourceSelector: request.sourceSelector });
    case 'vault-asset':
      return extractWorkspaceEmbedSnapshot(source, { kind: 'vault-asset', sourceObjectId: request.sourceObjectId });
  }
  throw new WorkspaceSnapshotError('Unsupported Present workspace integration.');
}

function referencePlacement(existingObjects: readonly PresentObjectGeometry[]): { xPercent: number; yPercent: number } {
  const slot = REFERENCE_SLOTS.find((candidate) => !existingObjects.some((object) => {
    if (object.hidden) return false;
    const values = [object.xPercent, object.yPercent, object.widthPercent, object.heightPercent];
    if (values.some((value) => !Number.isFinite(value))) return true;
    return candidate.xPercent < object.xPercent + object.widthPercent + 1
      && candidate.xPercent + REFERENCE_WIDTH + 1 > object.xPercent
      && candidate.yPercent < object.yPercent + object.heightPercent + 1
      && candidate.yPercent + REFERENCE_HEIGHT + 1 > object.yPercent;
  }));
  if (!slot) throw new WorkspaceSnapshotError('No collision-free region is available for a Workspace reference.');
  return slot;
}

export function createPresentWorkspaceObject(
  request: PresentWorkspaceIntegrationRequest,
  id = `present-workspace-${crypto.randomUUID()}`,
  existingObjects: readonly PresentObjectGeometry[] = [],
): PresentWorkspaceSceneObject {
  const placement = referencePlacement(existingObjects);
  const snapshot = extractPresentWorkspaceSnapshot(request);
  const title = safeText(request.title || `${request.sourceDocument.title} · ${request.integrationKind}`, 512);
  return {
    id,
    kind: 'workspace',
    integrationKind: request.integrationKind,
    mode: request.mode,
    sourceDocumentId: request.sourceDocument.id,
    sourceObjectId: request.sourceObjectId,
    sourceSelector: request.sourceSelector,
    sourceVersion: request.sourceDocument.version,
    uri: presentWorkspaceUri(request.sourceDocument.id, request.integrationKind, request.sourceObjectId, request.sourceSelector),
    title,
    snapshot,
    ...placement,
    widthPercent: REFERENCE_WIDTH,
    heightPercent: REFERENCE_HEIGHT,
    rotation: 0,
    opacity: 1,
    zIndex: 30,
  };
}

export function refreshPresentWorkspaceObject(object: PresentWorkspaceSceneObject, sourceDocument: WorkspaceDocument): PresentWorkspaceSceneObject {
  if (object.mode !== 'Live' || object.sourceDocumentId !== sourceDocument.id || object.sourceVersion === sourceDocument.version) return object;
  const snapshot = extractPresentWorkspaceSnapshot({
    sourceDocument,
    integrationKind: object.integrationKind,
    mode: object.mode,
    sourceObjectId: object.sourceObjectId,
    sourceSelector: object.sourceSelector,
    title: object.title,
  });
  return { ...object, sourceVersion: sourceDocument.version, snapshot };
}

export function refreshPresentWorkspaceObjects(objects: readonly PresentWorkspaceSceneObject[], documents: readonly WorkspaceDocument[]): PresentWorkspaceSceneObject[] {
  const byId = new Map(documents.map((document) => [document.id, document]));
  return objects.map((object) => {
    if (object.mode !== 'Live') return object;
    const source = byId.get(object.sourceDocumentId);
    return source ? refreshPresentWorkspaceObject(object, source) : object;
  });
}

export interface PresentWorkspaceIntegrationTarget {
  id: string;
  label: string;
  description: string;
  integrationKind: PresentWorkspaceIntegrationKind;
  sourceObjectId?: string;
  sourceSelector?: string;
}

function spreadsheetColumnLabel(index: number): string {
  let value = Math.max(1, Math.floor(index));
  let label = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label;
}

function gridDefaultRange(document: WorkspaceDocument, tableObjectId: string): string {
  const object = document.objects[tableObjectId];
  if (!object || object.type !== 'Table') return 'A1:D10';
  const endColumn = spreadsheetColumnLabel(Math.max(1, Math.min(4, object.data.cols)));
  const endRow = Math.max(1, Math.min(10, object.data.rows));
  return `A1:${endColumn}${endRow}`;
}

export function listPresentWorkspaceIntegrationTargets(document: WorkspaceDocument, locale: WorkspaceLocale = 'en-US'): PresentWorkspaceIntegrationTarget[] {
  const copy = PRESENT_OFFICE_COPY[locale].workspaceIntegration;
  const targets: PresentWorkspaceIntegrationTarget[] = [];
  if (document.kind === 'Grid') {
    for (const sheet of document.gridData?.sheets ?? []) {
      const range = gridDefaultRange(document, sheet.tableObjectId);
      targets.push({ id: `grid-range:${sheet.id}`, label: copy.gridRange(sheet.name, range), description: copy.gridRangeDescription(range), integrationKind: 'grid-range', sourceObjectId: sheet.tableObjectId, sourceSelector: range });
      targets.push({ id: `grid-kpi:${sheet.id}`, label: copy.gridKpi(sheet.name), description: copy.gridKpiDescription(range), integrationKind: 'grid-kpi', sourceObjectId: sheet.tableObjectId, sourceSelector: range });
    }
    for (const [objectId, object] of Object.entries(document.objects)) {
      if (object.type === 'Chart') targets.push({ id: `grid-chart:${objectId}`, label: safeText(object.data.title || copy.gridChartFallback, 160), description: copy.gridChartDescription, integrationKind: 'grid-chart', sourceObjectId: objectId });
    }
  } else if (document.kind === 'Tasks') {
    targets.push({ id: 'task-list', label: copy.taskList, description: copy.taskListDescription, integrationKind: 'task-list' });
    targets.push({ id: 'task-kpi', label: copy.taskKpi, description: copy.taskKpiDescription, integrationKind: 'task-kpi' });
  } else if (document.kind === 'Whiteboard') {
    for (const frame of (document.whiteboardData?.items ?? []).filter((item) => item.type === 'frame')) {
      targets.push({ id: `whiteboard-frame:${frame.id}`, label: safeText(frame.name || frame.text || copy.whiteboardFrameFallback, 160), description: copy.whiteboardFrameDescription, integrationKind: 'whiteboard-frame', sourceObjectId: frame.id });
    }
  } else if (document.kind === 'Draw') {
    for (const frame of Object.values(document.drawData?.objects ?? {}).filter((item) => item.type === 'frame')) {
      targets.push({ id: `whiteboard-frame:${frame.id}`, label: safeText(frame.name || copy.drawFrameFallback, 160), description: copy.drawFrameDescription, integrationKind: 'whiteboard-frame', sourceObjectId: frame.id });
    }
  } else if (document.kind === 'Writer') {
    const paragraphs = document.root_object_ids.flatMap((id) => {
      const object = document.objects[id];
      return object?.type === 'TextBlock' ? object.data.paragraphs : [];
    });
    if (!paragraphs.length) targets.push({ id: 'writer-section:start', label: copy.writerDocumentFallback, description: copy.writerSectionDescription, integrationKind: 'writer-section' });
    paragraphs.slice(0, 64).forEach((paragraph, index) => {
      const text = paragraph.spans.map((span) => span.text).join('').trim();
      targets.push({ id: `writer-section:${paragraph.id}`, label: text ? safeText(text, 96) : copy.writerParagraphFallback(index + 1), description: copy.writerSectionDescription, integrationKind: 'writer-section', sourceSelector: paragraph.id });
    });
  } else if (document.kind === 'PdfStudio') {
    for (const page of document.pdfData?.pages ?? []) {
      targets.push({ id: `pdf-page:${page.pageNumber}`, label: copy.pdfPage(page.pageNumber, safeText(page.title, 128)), description: copy.pdfPageDescription, integrationKind: 'pdf-page', sourceSelector: String(page.pageNumber) });
    }
  } else if (document.kind === 'Vault') {
    for (const file of document.vaultData?.files ?? []) {
      targets.push({ id: `vault-asset:${file.id}`, label: safeText(file.name, 160) || copy.vaultAssetFallback, description: copy.vaultAssetDescription(file.mimeType || file.kind, Math.max(0, file.sizeBytes)), integrationKind: 'vault-asset', sourceObjectId: file.id });
    }
  }
  return targets.slice(0, 512);
}

/**
 * **Das Platzierungsrechteck** — dieselbe Geometrie, die `createPresentWorkspaceObject` beim Einfügen
 * wirklich belegt (Paket 10, Ablageziel).
 *
 * Diese Funktion **erfindet keine** zweite Platzierung ✗: sie ruft `referencePlacement` ✓ — die eine
 * Stelle, die den kollisionsfreien Platz und die Größe einer Workspace-Referenz bestimmt ✓. Damit kann
 * die Vorschau während des Ziehens **nicht** von dem abweichen, was nach der Ablage entsteht.
 *
 * `null` heißt **benannt**: die Folie hat keinen freien Platz mehr ✓ (die Einfügung würde werfen ✓,
 * also wird sie **vorher** verweigert und nicht still versucht ✗).
 */
export function presentReferencePlacementRect(existingObjects: readonly PresentObjectGeometry[]): PresentPercentRect | null {
  try {
    const slot = referencePlacement(existingObjects);
    return { xPercent: slot.xPercent, yPercent: slot.yPercent, widthPercent: REFERENCE_WIDTH, heightPercent: REFERENCE_HEIGHT };
  } catch {
    return null;
  }
}

/**
 * **Die belegten Objekte einer Folie** — **eine** Definition für Einfügung **und** Ablage.
 *
 * Der Einfügevorgang (`createPresentWorkspaceObject`) und das Ablageziel (Paket 10) müssen **dieselbe**
 * Liste als Hindernisse sehen: *zwei Listen wären zwei Platzierungen — und die Vorschau während des
 * Ziehens könnte dann von dem abweichen, was nach dem Ablegen wirklich entsteht.*
 */
export function presentOccupiedSlideObjects(slide: {
  readonly sceneObjects?: readonly PresentObjectGeometry[] | null;
  readonly images?: readonly PresentObjectGeometry[] | null;
}): readonly PresentObjectGeometry[] {
  // Round 16 (malformed document): a hostile payload can carry non-array lists; the drop-zone
  // projection runs at every canvas mount and must not throw on them.
  // Round 24: entries inside the lists can be null/primitives — filtered for this projection only.
  const sceneObjects: readonly PresentObjectGeometry[] = Array.isArray(slide.sceneObjects)
    ? (slide.sceneObjects as readonly unknown[]).filter(isPlainPresentRecord) as unknown as readonly PresentObjectGeometry[]
    : [];
  const images: readonly PresentObjectGeometry[] = Array.isArray(slide.images)
    ? (slide.images as readonly unknown[]).filter(isPlainPresentRecord) as unknown as readonly PresentObjectGeometry[]
    : [];
  return [...sceneObjects, ...images];
}
