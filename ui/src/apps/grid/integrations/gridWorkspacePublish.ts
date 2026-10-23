// STATUS: DIAMANT VGT SUPREME
// Canonical Grid -> Workspace live object publishing. No network access and no parallel crypto layer.

import type {
  GridCell,
  GridPublishObjectDefinition,
  GridPublishObjectKind,
  GridStructuredTable,
  ReferenceMode,
  TableObject,
  WorkspaceDocument,
  WorkspaceObject,
} from '../../../shared/contracts/workspace';
import { toA1 } from '../formulas/formula';
import { appendWriterWorkspaceEmbed, createWriterWorkspaceEmbed } from '../../../platform/workspace/integrations/writerWorkspaceIntegration';
import { parseGridRange } from '../compat/gridProfessional';
import { createGridSecureId } from '../security/gridWebCryptoIntegrity';
import { ensureStableGridRangeForObject, resolveStableGridRangeForObject } from '../workbook/gridWorkbookStructure';

const MAX_PUBLISH_OBJECTS = 128;
const MAX_PUBLISH_CELLS = 10_000;
const MAX_TITLE = 256;

/**
 * Target kinds this module can actually publish into. `Spaces` used to be offered by
 * `listGridWorkspacePublishTargets` while `publishGridObjectToWorkspaceTarget` always rejected it,
 * i.e. the UI presented a target that could never succeed.
 */
export const GRID_WORKSPACE_PUBLISH_TARGET_KINDS: readonly GridWorkspacePublishTargetKind[] =
  Object.freeze(['Writer', 'Present', 'Whiteboard', 'Draw']);
/** Kinds that receive a canonical `WorkspaceReference` instead of a Writer embed. */
const REFERENCE_TARGET_KINDS: readonly GridWorkspacePublishTargetKind[] = Object.freeze(['Present', 'Whiteboard', 'Draw']);

export type GridWorkspacePublishTargetKind = 'Writer' | 'Present' | 'Whiteboard' | 'Draw' | 'Spaces';

export interface GridWorkspacePublishTarget {
  id: string;
  title: string;
  kind: GridWorkspacePublishTargetKind;
}

/**
 * What the published snapshot keeps and what it deliberately drops.
 * Kept next to the publisher so the UI can state it instead of implying a lossless export.
 */
export interface GridPublishPreservationRecord {
  kind: GridPublishObjectKind;
  title: string;
  sourceRange: string;
  rows: number;
  cols: number;
  cellCount: number;
  /** Cells whose formula was replaced by its cached value. */
  formulasDropped: number;
  /** Cells that carried a stable identity or comment link which the snapshot does not copy. */
  metadataDropped: number;
  preserved: readonly string[];
  notPreserved: readonly string[];
}

export interface GridPublishCreationResult {
  document: WorkspaceDocument;
  definition: GridPublishObjectDefinition;
  record: GridPublishPreservationRecord;
}

const NOT_PRESERVED_PUBLISH = Object.freeze([
  'Formeln der Quellzellen (nur der zwischengespeicherte Wert wird veröffentlicht)',
  'Zellkommentare, Zell-Identitäten und Notizen',
  'bedingte Formatierung, Datenvalidierung und Pivot-/Diagrammobjekte',
  'Schutz- und Berechtigungseinstellungen des Quellblatts',
]);

export interface GridPublishRequest {
  kind: GridPublishObjectKind;
  title: string;
  sourceSheetId: string;
  sourceRange?: string;
  sourceTableId?: string;
  sourcePivotId?: string;
}

function normalizeTitle(value: string, fallback: string): string {
  const normalized = value.trim().normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ');
  return (normalized || fallback).slice(0, MAX_TITLE);
}

function clonePublishedCell(cell: GridCell | undefined): GridCell {
  if (!cell) return { value: '' };
  const { formula: _formula, stableId: _stableId, commentId: _commentId, ...passive } = cell;
  return { ...passive, value: cell.value };
}

function publicationRecord(
  definition: GridPublishObjectDefinition,
  published: GridPublishSourceSnapshot,
): GridPublishPreservationRecord {
  const { snapshot, sourceCells } = published;
  let formulasDropped = 0;
  let metadataDropped = 0;
  // Counted on the *source* cells: the snapshot already had them stripped, so counting the snapshot
  // would always report zero losses.
  for (const cell of sourceCells) {
    if (typeof cell.formula === 'string' && cell.formula.trim() !== '') formulasDropped += 1;
    if (cell.stableId !== undefined || cell.commentId !== undefined) metadataDropped += 1;
  }
  return {
    kind: definition.kind,
    title: definition.title,
    sourceRange: definition.sourceRange,
    rows: snapshot.rows,
    cols: snapshot.cols,
    cellCount: Object.keys(snapshot.cells).length,
    formulasDropped,
    metadataDropped,
    preserved: [
      'Zellwerte (Text, Zahl, Wahrheitswert) des gewählten Bereichs',
      'Zeilige/spaltige Anordnung und leere Zellen',
      'Formatattribute der Zelle (Zahlenformat, Ausrichtung, Farbe)',
      'stabile Bereichsidentität über `stableRangeId` für Live-Aktualisierung',
    ],
    notPreserved: NOT_PRESERVED_PUBLISH,
  };
}

function sheetTable(document: WorkspaceDocument, sheetId: string): { table: TableObject; objectId: string } {
  if (document.kind !== 'Grid' || !document.gridData) throw new Error('grid_publish_source_not_grid');
  const sheet = document.gridData.sheets.find((candidate) => candidate.id === sheetId);
  if (!sheet) throw new Error('grid_publish_sheet_missing');
  const object = document.objects[sheet.tableObjectId];
  if (!object || object.type !== 'Table') throw new Error('grid_publish_sheet_table_missing');
  return { table: object.data, objectId: sheet.tableObjectId };
}

function structuredTable(document: WorkspaceDocument, tableId: string): { table: GridStructuredTable; sheetId: string } {
  for (const sheet of document.gridData?.sheets ?? []) {
    const table = sheet.tables?.find((candidate) => candidate.id === tableId);
    if (table) return { table, sheetId: sheet.id };
  }
  throw new Error('grid_publish_structured_table_missing');
}

function pivotSource(document: WorkspaceDocument, pivotId: string): { table: TableObject; sheetId: string; range: string } {
  const derivedObjectId = `grid-pivot-table-${pivotId}`;
  const object = document.objects[derivedObjectId];
  if (!object || object.type !== 'Table') throw new Error('grid_publish_pivot_table_missing');
  const derivedSheet = document.gridData?.sheets.find((sheet) => sheet.tableObjectId === derivedObjectId);
  const end = toA1(Math.max(0, object.data.cols - 1), Math.max(0, object.data.rows - 1));
  return { table: object.data, sheetId: derivedSheet?.id ?? `grid-pivot-sheet-${pivotId}`, range: `A1:${end}` };
}

interface GridPublishSourceSnapshot {
  snapshot: TableObject;
  /** Cells of the *source* range, before formulas and identities were stripped. */
  sourceCells: GridCell[];
}

function tableRangeSnapshot(table: TableObject, range: string, objectId: string): GridPublishSourceSnapshot {
  const bounds = parseGridRange(range.trim().toUpperCase());
  if (!bounds) throw new Error('grid_publish_range_invalid');
  if (bounds.startRow < 0 || bounds.startCol < 0 || bounds.endRow >= table.rows || bounds.endCol >= table.cols) {
    throw new Error('grid_publish_range_out_of_bounds');
  }
  const rows = bounds.endRow - bounds.startRow + 1;
  const cols = bounds.endCol - bounds.startCol + 1;
  const count = rows * cols;
  if (count <= 0 || count > MAX_PUBLISH_CELLS) throw new Error('grid_publish_range_limit');
  const cells: Record<string, GridCell> = {};
  const sourceCells: GridCell[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const sourceCoord = toA1(bounds.startCol + col, bounds.startRow + row);
      const targetCoord = toA1(col, row);
      const source = table.cells[sourceCoord];
      if (source) sourceCells.push(source);
      cells[targetCoord] = clonePublishedCell(source);
    }
  }
  return { snapshot: { id: objectId, rows, cols, cells }, sourceCells };
}

function resolveDefinitionSnapshot(document: WorkspaceDocument, definition: GridPublishObjectDefinition): GridPublishSourceSnapshot {
  if (definition.kind === 'pivot') {
    if (!definition.sourcePivotId) throw new Error('grid_publish_pivot_id_missing');
    const pivot = pivotSource(document, definition.sourcePivotId);
    return tableRangeSnapshot(pivot.table, pivot.range, definition.objectId);
  }
  if (definition.kind === 'table') {
    if (!definition.sourceTableId) throw new Error('grid_publish_table_id_missing');
    const resolved = structuredTable(document, definition.sourceTableId);
    const source = sheetTable(document, resolved.sheetId);
    return tableRangeSnapshot(source.table, resolved.table.range, definition.objectId);
  }
  const source = sheetTable(document, definition.sourceSheetId);
  const range = definition.stableRangeId
    ? resolveStableGridRangeForObject(document, source.objectId, definition.stableRangeId)
    : definition.sourceRange;
  if (!range) throw new Error('grid_publish_stable_range_unresolved');
  return tableRangeSnapshot(source.table, range, definition.objectId);
}

export function createGridPublishObject(document: WorkspaceDocument, request: GridPublishRequest, now = Date.now()): WorkspaceDocument {
  return createGridPublishObjectDetailed(document, request, now).document;
}

/** Same as `createGridPublishObject` but also returns the honest preservation record for the UI. */
export function createGridPublishObjectDetailed(
  document: WorkspaceDocument,
  request: GridPublishRequest,
  now = Date.now(),
): GridPublishCreationResult {
  if (document.kind !== 'Grid' || !document.gridData) throw new Error('grid_publish_source_not_grid');
  if ((document.gridData.publishObjects?.length ?? 0) >= MAX_PUBLISH_OBJECTS) throw new Error('grid_publish_object_limit');

  let workingDocument = document;
  let sourceSheetId = request.sourceSheetId;
  let sourceRange = request.sourceRange?.trim().toUpperCase() ?? '';
  let sourceTableId = request.sourceTableId;
  let sourcePivotId = request.sourcePivotId;
  let stableRangeId: string | undefined;

  if (request.kind === 'table') {
    if (!sourceTableId) throw new Error('grid_publish_table_id_missing');
    const resolved = structuredTable(document, sourceTableId);
    sourceSheetId = resolved.sheetId;
    sourceRange = resolved.table.range.toUpperCase();
  } else if (request.kind === 'pivot') {
    if (!sourcePivotId) throw new Error('grid_publish_pivot_id_missing');
    const pivot = pivotSource(document, sourcePivotId);
    sourceSheetId = pivot.sheetId;
    sourceRange = pivot.range;
  } else {
    if (!sourceRange) throw new Error('grid_publish_range_missing');
    if ((request.kind === 'cell' || request.kind === 'kpi') && sourceRange.includes(':')) throw new Error('grid_publish_single_cell_required');
    // Validate the range here so a malformed range produces an explicit publish error instead of the
    // stable-range helper's generic "Invalid stable range." message.
    if (!parseGridRange(sourceRange)) throw new Error('grid_publish_range_invalid');
    const source = sheetTable(document, sourceSheetId);
    const stable = ensureStableGridRangeForObject(document, source.objectId, sourceRange, request.title);
    workingDocument = stable.document;
    stableRangeId = stable.stableRangeId;
  }

  const id = createGridSecureId('grid-publish');
  const objectId = createGridSecureId('grid-publish-table');
  const definition: GridPublishObjectDefinition = {
    id,
    objectId,
    kind: request.kind,
    title: normalizeTitle(request.title, `${request.kind.toUpperCase()} ${sourceRange}`),
    sourceSheetId,
    sourceRange,
    stableRangeId,
    sourceTableId,
    sourcePivotId,
    createdAt: now,
    updatedAt: now,
  };
  const published = resolveDefinitionSnapshot(workingDocument, definition);
  const nextDocument: WorkspaceDocument = {
    ...workingDocument,
    version: document.version + 1,
    modified_at: now,
    root_object_ids: workingDocument.root_object_ids.includes(objectId) ? workingDocument.root_object_ids : [...workingDocument.root_object_ids, objectId],
    objects: { ...workingDocument.objects, [objectId]: { type: 'Table', data: published.snapshot } },
    gridData: { ...workingDocument.gridData!, publishObjects: [...(workingDocument.gridData!.publishObjects ?? []), definition] },
  };
  return { document: nextDocument, definition, record: publicationRecord(definition, published) };
}

export function refreshGridPublishObjectsInDocument<T extends WorkspaceDocument>(document: T, now = Date.now()): T {
  if (document.kind !== 'Grid' || !document.gridData?.publishObjects?.length) return document;
  let objects = document.objects;
  let changed = false;
  const publishObjects = document.gridData.publishObjects.map((definition) => {
    try {
      const published = resolveDefinitionSnapshot(document, definition);
      const previous = document.objects[definition.objectId];
      const nextObject: WorkspaceObject = { type: 'Table', data: published.snapshot };
      if (!previous || previous.type !== 'Table' || JSON.stringify(previous.data) !== JSON.stringify(published.snapshot)) {
        if (!changed) objects = { ...document.objects };
        objects[definition.objectId] = nextObject;
        changed = true;
        return { ...definition, updatedAt: now };
      }
      return definition;
    } catch {
      // Fail closed: keep the last good materialized snapshot and never silently retarget.
      return definition;
    }
  });
  if (!changed) return document;
  return { ...document, objects, gridData: { ...document.gridData, publishObjects } } as T;
}

export function deleteGridPublishObject(document: WorkspaceDocument, definitionId: string): WorkspaceDocument {
  if (document.kind !== 'Grid' || !document.gridData) return document;
  const definition = document.gridData.publishObjects?.find((candidate) => candidate.id === definitionId);
  if (!definition) return document;
  const objects = { ...document.objects };
  delete objects[definition.objectId];
  return {
    ...document,
    version: document.version + 1,
    modified_at: Date.now(),
    objects,
    root_object_ids: document.root_object_ids.filter((id) => id !== definition.objectId),
    gridData: { ...document.gridData, publishObjects: (document.gridData.publishObjects ?? []).filter((candidate) => candidate.id !== definitionId) },
  };
}

export function listGridWorkspacePublishTargets(documents: Record<string, WorkspaceDocument>, sourceId: string): GridWorkspacePublishTarget[] {
  return Object.values(documents)
    .filter((doc): doc is WorkspaceDocument & { kind: GridWorkspacePublishTargetKind } =>
      doc.id !== sourceId
      && (GRID_WORKSPACE_PUBLISH_TARGET_KINDS as readonly string[]).includes(doc.kind)
      && isGridWorkspacePublishTargetWritable(doc))
    .slice(0, 256)
    .map((doc) => ({ id: doc.id, title: doc.title.slice(0, MAX_TITLE), kind: doc.kind as GridWorkspacePublishTargetKind }));
}

/** Mirrors the fail-closed writability policy applied by the chart publisher. */
function isGridWorkspacePublishTargetWritable(target: WorkspaceDocument): boolean {
  if (target.protection?.locked || target.protection?.readOnly) return false;
  // No authenticated principal exists on this surface, so a document with explicit grants is refused.
  if (target.permissions) return false;
  if (target.kind === 'Writer' && target.writerData?.protectionMode && target.writerData.protectionMode !== 'none') return false;
  return true;
}

function fullSnapshotRange(source: WorkspaceDocument, definition: GridPublishObjectDefinition): string {
  const object = source.objects[definition.objectId];
  if (!object || object.type !== 'Table') throw new Error('grid_publish_materialized_object_missing');
  return `A1:${toA1(Math.max(0, object.data.cols - 1), Math.max(0, object.data.rows - 1))}`;
}

function createWorkspaceReference(source: WorkspaceDocument, definition: GridPublishObjectDefinition, mode: ReferenceMode): { id: string; object: WorkspaceObject } {
  const sourceObject = source.objects[definition.objectId];
  if (!sourceObject || sourceObject.type !== 'Table') throw new Error('grid_publish_materialized_object_missing');
  const id = createGridSecureId('grid-workspace-ref');
  return {
    id,
    object: {
      type: 'WorkspaceReference',
      data: {
        id,
        uri: `vgt://workspace/document/${source.id}/object/${definition.objectId}`,
        mode,
        cached_snapshot: sourceObject,
      },
    },
  };
}

function firstWriterParagraphId(document: WorkspaceDocument): string {
  for (const id of document.root_object_ids) {
    const object = document.objects[id];
    if (object?.type === 'TextBlock' && object.data.paragraphs[0]?.id) return object.data.paragraphs[0].id;
  }
  for (const object of Object.values(document.objects)) {
    if (object.type === 'TextBlock' && object.data.paragraphs[0]?.id) return object.data.paragraphs[0].id;
  }
  throw new Error('grid_publish_writer_anchor_missing');
}

function publishToWriter(source: WorkspaceDocument, definition: GridPublishObjectDefinition, target: WorkspaceDocument, mode: ReferenceMode): WorkspaceDocument {
  if (target.kind !== 'Writer' || !target.writerData) throw new Error('grid_publish_writer_model_missing');
  const embed = createWriterWorkspaceEmbed({
    writerDocument: target,
    sourceDocument: source,
    kind: 'grid-range',
    mode: mode === 'Live' ? 'Live' : 'Snapshot',
    anchorParagraphId: firstWriterParagraphId(target),
    sourceObjectId: definition.objectId,
    sourceSelector: fullSnapshotRange(source, definition),
  });
  return {
    ...target,
    version: target.version + 1,
    modified_at: Date.now(),
    writerData: { ...target.writerData, workspaceEmbeds: appendWriterWorkspaceEmbed(target.writerData.workspaceEmbeds ?? [], embed) },
  };
}

function publishReferenceTarget(source: WorkspaceDocument, definition: GridPublishObjectDefinition, target: WorkspaceDocument, mode: ReferenceMode): WorkspaceDocument {
  const reference = createWorkspaceReference(source, definition, mode);
  const next: WorkspaceDocument = {
    ...target,
    version: target.version + 1,
    modified_at: Date.now(),
    root_object_ids: target.root_object_ids.includes(reference.id) ? target.root_object_ids : [...target.root_object_ids, reference.id],
    objects: { ...target.objects, [reference.id]: reference.object },
  };
  if (target.kind === 'Present' && target.presentData?.slides.length) {
    return { ...next, presentData: { ...target.presentData, slides: target.presentData.slides.map((slide, index) => index === 0 ? { ...slide, layout: 'chart' } : slide) } };
  }
  return next;
}

export function publishGridObjectToWorkspaceTarget(
  source: WorkspaceDocument,
  definitionId: string,
  target: WorkspaceDocument,
  mode: ReferenceMode = 'Live',
): WorkspaceDocument {
  if (source.kind !== 'Grid' || !source.gridData) throw new Error('grid_publish_source_not_grid');
  if (target.id === source.id) throw new Error('grid_publish_self_target');
  const definition = source.gridData.publishObjects?.find((candidate) => candidate.id === definitionId);
  if (!definition) throw new Error('grid_publish_definition_missing');
  if (target.kind === 'Writer') return publishToWriter(source, definition, target, mode);
  if ((REFERENCE_TARGET_KINDS as readonly string[]).includes(target.kind)) return publishReferenceTarget(source, definition, target, mode);
  throw new Error('grid_publish_target_unsupported');
}
