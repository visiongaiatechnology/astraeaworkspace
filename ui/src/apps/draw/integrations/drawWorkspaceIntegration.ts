// STATUS: PLATIN — bounded Draw adapters; product UI reachability remains separately gated.
import type { WorkspaceDocument, WorkspaceObject } from '../../../shared/contracts/workspace';
import type { WorkspaceReferenceObject } from '../../../shared/contracts/visualization/workspaceShapesCharts';
import type { WhiteboardDocumentModel, WhiteboardObjectModel, WhiteboardObjectType } from '../../../shared/contracts/whiteboard/workspaceWhiteboard';
import type {
  DrawDataBinding,
  DrawDataGraphicRule,
  DrawDocumentModel,
  DrawObject,
  DrawRichText,
  DrawShapeKind,
} from '../../../shared/contracts/draw/workspaceDraw';
import {
  assertStableWorkspaceId,
  validateWorkspaceDocumentInvariants,
  workspaceObjectUri,
} from '../../../platform/workspace/model/workspaceObjectModel';
import { assertDrawDocument, DrawModelError } from '../model/drawDocumentEngine';
import { isRecord, MAX_OBJECTS, safeId, safeText } from '../model/drawDocumentValidation';
import { createVectorShape } from '../model/drawVectorEngine';
import {
  normalizeDrawTable,
  resolveDrawHyperlink,
  setObjectRichText,
  setObjectTable,
} from '../model/drawContentEngine';
import { deriveSchemaPatchFromErd, type DrawDatabaseSchemaTable } from '../model/drawErdSchemaEngine';
import { upsertDataBinding } from '../model/drawDataEngine';

const clone = <T>(value: T): T => structuredClone(value);

const WHITEBOARD_OBJECT_TYPES: ReadonlySet<string> = new Set<WhiteboardObjectType>([
  'sticky', 'process', 'decision', 'terminal', 'connector', 'text', 'frame', 'image', 'ink',
  'shape', 'icon', 'table', 'card', 'document', 'chart', 'code', 'media', 'reaction', 'live',
]);

const fnv = (value: string): string => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

const stableLocalId = (prefix: string, value: string): string => {
  const safe = value.replace(/[^A-Za-z0-9._:@-]/g, '-').replace(/-+/g, '-').slice(0, 88) || 'item';
  return `${prefix}-${safe}-${fnv(value)}`;
};

export type DrawEmbedTarget = { kind: 'page' | 'frame'; id: string };

export interface DrawEmbedRegistration {
  source: WorkspaceDocument;
  reference: WorkspaceReferenceObject;
  anchorObjectId: string;
}

function targetBounds(
  model: DrawDocumentModel,
  target: DrawEmbedTarget,
): { x: number; y: number; width: number; height: number; text: string } {
  if (!isRecord(target) || typeof target.id !== 'string') throw new DrawModelError('embed-target-invalid');
  if (target.kind === 'page') {
    const page = model.pages.find((candidate) => candidate.id === target.id);
    if (!page) throw new DrawModelError('embed-page-missing');
    return { x: 0, y: 0, width: page.width, height: page.height, text: page.name };
  }
  if (target.kind !== 'frame') throw new DrawModelError('embed-target-invalid');
  if (!Object.hasOwn(model.objects, target.id)) throw new DrawModelError('embed-frame-missing');
  const frame = model.objects[target.id];
  if (!frame || frame.type !== 'frame') throw new DrawModelError('embed-frame-missing');
  return { x: frame.x, y: frame.y, width: frame.width, height: frame.height, text: frame.name };
}

/**
 * Der **stabile** Anker-Bezeichner eines Draw-Elements — **eine** Definition.
 *
 * Der Träger (Paket 23/19) muss die Quelle **benennen** können, *auch bevor* der Anker existiert: die
 * Ableitung ist deterministisch, also nennt der Träger dieselbe Kennung, die `registerDrawEmbedAnchor`
 * später schreibt. Eine zweite Ableitung im Aufrufer wäre eine zweite Wahrheit über dieselbe Kennung.
 */
export function drawEmbedAnchorObjectId(target: DrawEmbedTarget): string {
  if (!isRecord(target) || typeof target.id !== 'string') throw new DrawModelError('embed-target-invalid');
  if (target.kind !== 'page' && target.kind !== 'frame') throw new DrawModelError('embed-target-invalid');
  return stableLocalId(`draw-${target.kind}`, target.id);
}

/**
 * Der **stabile** Verweis-Bezeichner eines Elements in einem **Zieldokument** — **eine** Definition.
 * Dieselbe Ableitung wird beim Anker-Erzeugen und beim Senden benutzt; *zwei Ableitungen wären zwei
 * Wahrheiten über dieselbe Kennung* (meine erste Sender-Fassung baute sie nach — gefunden vom Sendetest).
 */
export function drawEmbedReferenceId(sourceDocumentId: string, target: DrawEmbedTarget): string {
  if (!isRecord(target) || typeof target.id !== 'string') throw new DrawModelError('embed-target-invalid');
  if (target.kind !== 'page' && target.kind !== 'frame') throw new DrawModelError('embed-target-invalid');
  return stableLocalId('draw-ref', `${sourceDocumentId}:${target.kind}:${target.id}`);
}

/**
 * Creates a canonical WOM anchor and a Live/Frozen reference for Writer/Present/Spaces.
 *
 * `reuseAnchor` macht das **erneute** Senden desselben Elements möglich (ein zweites Ziel oder ein
 * Moduswechsel): ist der Anker bereits vorhanden **und identisch**, wird er nicht ersetzt und nicht
 * abgelehnt — *ein einmal erzeugter Anker ist keine zweite Wahrheit, sondern dieselbe.* Ohne die Option
 * bleibt das alte, strenge Verhalten (`embed-anchor-identity-conflict`) erhalten.
 */
export function registerDrawEmbedAnchor(
  source: WorkspaceDocument,
  target: DrawEmbedTarget,
  mode: 'Live' | 'Frozen',
  now: number,
  options?: { readonly reuseAnchor?: boolean },
): DrawEmbedRegistration {
  if (!source || source.kind !== 'Draw' || !source.drawData) throw new DrawModelError('draw-source-required');
  if (mode !== 'Live' && mode !== 'Frozen') throw new DrawModelError('embed-mode-invalid');
  if (!Number.isSafeInteger(now) || now < 0) throw new DrawModelError('embed-time-invalid');
  validateWorkspaceDocumentInvariants(source);
  assertDrawDocument(source.drawData);
  assertStableWorkspaceId(source.id, 'Draw document id');
  if (source.version >= Number.MAX_SAFE_INTEGER) throw new DrawModelError('embed-version-exhausted');

  const bounds = targetBounds(source.drawData, target);
  const anchorObjectId = drawEmbedAnchorObjectId(target);
  assertStableWorkspaceId(anchorObjectId, 'Draw anchor id');
  const existing = source.objects[anchorObjectId];
  if (existing && options?.reuseAnchor !== true) throw new DrawModelError('embed-anchor-identity-conflict');
  if (existing && existing.type !== 'Shape') throw new DrawModelError('embed-anchor-identity-conflict');

  const anchor: WorkspaceObject = existing ?? {
    type: 'Shape',
    data: {
      id: anchorObjectId,
      shape_type: 'rectangle',
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      rotation: 0,
      fill: 'transparent',
      stroke: 'transparent',
      stroke_width: 0,
      text: bounds.text,
    },
  };
  const next = clone(source);
  next.objects[anchorObjectId] = anchor;
  if (!next.root_object_ids.includes(anchorObjectId)) next.root_object_ids.push(anchorObjectId);
  next.modified_at = Math.max(next.modified_at, now);
  // Ein wiederverwendeter Anker ist **keine** Änderung: die Version steigt nur, wenn wirklich geschrieben wird.
  if (!existing) next.version = source.version + 1;
  validateWorkspaceDocumentInvariants(next);

  const reference: WorkspaceReferenceObject = {
    id: drawEmbedReferenceId(source.id, target),
    uri: workspaceObjectUri(source.id, anchorObjectId),
    mode,
    expected_type: 'Shape',
    source_version: next.version,
    resolved_source_version: next.version,
    fabric_status: mode === 'Frozen' ? 'frozen' : 'current',
    // **Die Eigentümerschaft ist keine Verzierung** (Befund dieser Runde): `validateObjectMetadata` leitet für
    // einen `WorkspaceReference` **ohne** `common` immer `ExternalLive` ab, und `validateTypedObject` verlangt
    // für `mode: 'Frozen'` **`ExternalFrozen`** (`workspaceObjectModelValidation.ts:369-370`). Ohne diese
    // Zeile war ein eingefrorener Verweis **nicht validierbar** — der Frozen-Weg der geteilten Einfügung
    // scheitert aus genau diesem Grund (siehe Bericht: `insertFromWorkspace` setzt `common` nicht).
    common: { ownership: mode === 'Frozen' ? 'ExternalFrozen' : 'ExternalLive' },
    permission_provenance: {
      source_document_id: source.id,
      source_policy_version: source.permissions?.policyVersion,
      snapshot_explicitly_embedded: mode === 'Frozen',
    },
    ...(mode === 'Frozen'
      ? {
        cached_snapshot: clone(anchor),
        // **Dieselben Felder wie die geteilte Einfügung** (`insertFromWorkspace`, Frozen-Zweig): ein
        // eingefrorener Verweis, der je nach Weg anders aussieht, wäre eine zweite Bedeutung von „frozen".
        fallback_snapshot: clone(anchor),
        fallback_policy: 'allowed' as const,
        source_snapshot_id: `snapshot-${next.version}-${anchorObjectId}`,
        frozen_at: now,
      }
      : { fallback_policy: 'forbidden' as const }),
  };
  return { source: next, reference, anchorObjectId };
}

export interface DrawSchemaChangeProposal {
  sourceRevision: number;
  tables: DrawDatabaseSchemaTable[];
  requiresExplicitApply: true;
  destructive: boolean;
  summary: string[];
}

function validateSchemaBaseline(input: unknown): DrawDatabaseSchemaTable[] {
  if (!Array.isArray(input) || input.length > 512) throw new DrawModelError('schema-baseline-invalid');
  const tableIds = new Set<string>();
  const tables: DrawDatabaseSchemaTable[] = [];
  let totalColumns = 0;

  for (const rawTable of input) {
    if (!isRecord(rawTable)) throw new DrawModelError('schema-baseline-invalid');
    const id = safeId(rawTable.id, 'schema-baseline-invalid');
    const name = safeText(rawTable.name, 'schema-baseline-invalid');
    if (!name.trim() || tableIds.has(id) || !Array.isArray(rawTable.columns) || rawTable.columns.length > 256) {
      throw new DrawModelError('schema-baseline-invalid');
    }
    tableIds.add(id);
    totalColumns += rawTable.columns.length;
    if (totalColumns > 131_072) throw new DrawModelError('schema-baseline-limit');

    const columnIds = new Set<string>();
    const columns: DrawDatabaseSchemaTable['columns'] = [];
    for (const rawColumn of rawTable.columns) {
      if (!isRecord(rawColumn)) throw new DrawModelError('schema-baseline-invalid');
      const columnId = safeId(rawColumn.id, 'schema-baseline-invalid');
      const columnName = safeText(rawColumn.name, 'schema-baseline-invalid');
      const type = safeText(rawColumn.type, 'schema-baseline-invalid');
      if (!columnName.trim() || !type.trim() || columnIds.has(columnId)) throw new DrawModelError('schema-baseline-invalid');
      columnIds.add(columnId);
      if (rawColumn.primaryKey !== undefined && typeof rawColumn.primaryKey !== 'boolean') {
        throw new DrawModelError('schema-baseline-invalid');
      }
      const foreignTableId = rawColumn.foreignTableId === undefined
        ? undefined
        : safeId(rawColumn.foreignTableId, 'schema-baseline-invalid');
      const foreignFieldId = rawColumn.foreignFieldId === undefined
        ? undefined
        : safeId(rawColumn.foreignFieldId, 'schema-baseline-invalid');
      if ((foreignTableId === undefined) !== (foreignFieldId === undefined)) throw new DrawModelError('schema-baseline-invalid');
      columns.push({ id: columnId, name: columnName, type, primaryKey: rawColumn.primaryKey, foreignTableId, foreignFieldId });
    }
    tables.push({ id, name, columns });
  }

  const byId = new Map(tables.map((table) => [table.id, table]));
  for (const table of tables) for (const column of table.columns) {
    if (!column.foreignTableId || !column.foreignFieldId) continue;
    const target = byId.get(column.foreignTableId);
    if (!target?.columns.some((candidate) => candidate.id === column.foreignFieldId)) {
      throw new DrawModelError('schema-baseline-reference-missing');
    }
  }
  return tables;
}

function schemasDiffer(left: DrawDatabaseSchemaTable, right: DrawDatabaseSchemaTable): boolean {
  if (left.name !== right.name || left.columns.length !== right.columns.length) return true;
  return left.columns.some((column, index) => {
    const candidate = right.columns[index];
    return column.id !== candidate.id
      || column.name !== candidate.name
      || column.type !== candidate.type
      || column.primaryKey !== candidate.primaryKey
      || column.foreignTableId !== candidate.foreignTableId
      || column.foreignFieldId !== candidate.foreignFieldId;
  });
}

function isDestructiveSchemaChange(before: DrawDatabaseSchemaTable, after: DrawDatabaseSchemaTable): boolean {
  const afterColumns = new Map(after.columns.map((column) => [column.id, column]));
  return before.columns.some((column) => {
    const next = afterColumns.get(column.id);
    return !next || next.type !== column.type;
  });
}

/** Produces a review-only schema patch. Applying it belongs to Database and must be explicitly confirmed. */
export function proposeDatabaseSchemaChangesFromErd(
  model: DrawDocumentModel,
  baseline: readonly DrawDatabaseSchemaTable[],
): DrawSchemaChangeProposal {
  assertDrawDocument(model);
  const beforeTables = validateSchemaBaseline(baseline);
  const proposed = deriveSchemaPatchFromErd(Object.values(model.objects));
  const before = new Map(beforeTables.map((table) => [table.id, table]));
  const after = new Map(proposed.map((table) => [table.id, table]));
  const summary: string[] = [];
  let destructive = false;

  for (const table of proposed) {
    const old = before.get(table.id);
    if (!old) summary.push(`create-table:${table.id}`);
    else if (schemasDiffer(old, table)) {
      summary.push(`alter-table:${table.id}`);
      destructive ||= isDestructiveSchemaChange(old, table);
    }
  }
  for (const table of [...beforeTables].sort((left, right) => left.id.localeCompare(right.id))) {
    if (!after.has(table.id)) {
      summary.push(`drop-table:${table.id}`);
      destructive = true;
    }
  }
  return {
    sourceRevision: model.revision,
    tables: clone(proposed),
    requiresExplicitApply: true,
    destructive,
    summary,
  };
}

export function bindWorkspaceDataGraphic(
  model: DrawDocumentModel,
  input: {
    id: string;
    objectId: string;
    sourceKind: 'grid-range' | 'insight';
    sourceDocumentId: string;
    sourceObjectId: string;
    selector?: string;
    rules: DrawDataGraphicRule[];
  },
): DrawDocumentModel {
  if (!isRecord(input)) throw new DrawModelError('data-binding-input-invalid');
  assertStableWorkspaceId(input.sourceDocumentId, 'Source document id');
  assertStableWorkspaceId(input.sourceObjectId, 'Source object id');
  const binding: DrawDataBinding = {
    id: input.id,
    objectId: input.objectId,
    sourceKind: input.sourceKind,
    sourceDocumentId: input.sourceDocumentId,
    sourceUri: workspaceObjectUri(input.sourceDocumentId, input.sourceObjectId),
    selector: input.selector,
    mode: 'live',
    rules: clone(input.rules),
  };
  return upsertDataBinding(model, binding);
}

function linkShapeToCanonicalObject(
  model: DrawDocumentModel,
  shapeId: string,
  key: 'projectRef' | 'taskRef',
  documentId: string,
  objectId: string,
): DrawDocumentModel {
  assertDrawDocument(model);
  assertStableWorkspaceId(documentId);
  assertStableWorkspaceId(objectId);
  if (typeof shapeId !== 'string' || !Object.hasOwn(model.objects, shapeId)) {
    throw new DrawModelError('shape-link-target-missing');
  }
  const object = model.objects[shapeId];
  if (!object || object.type === 'connector') throw new DrawModelError('shape-link-target-missing');
  const next = clone(model);
  next.objects[shapeId] = {
    ...clone(object),
    customProperties: { ...(object.customProperties ?? {}), [key]: workspaceObjectUri(documentId, objectId) },
  };
  next.revision += 1;
  assertDrawDocument(next);
  return next;
}

export const linkDrawShapeToProject = (
  model: DrawDocumentModel,
  shapeId: string,
  documentId: string,
  objectId: string,
): DrawDocumentModel => linkShapeToCanonicalObject(model, shapeId, 'projectRef', documentId, objectId);

export const linkDrawShapeToTask = (
  model: DrawDocumentModel,
  shapeId: string,
  documentId: string,
  objectId: string,
): DrawDocumentModel => linkShapeToCanonicalObject(model, shapeId, 'taskRef', documentId, objectId);

function whiteboardKind(item: WhiteboardObjectModel): DrawShapeKind {
  if (item.type === 'decision') return 'polygon';
  if (item.type === 'terminal') return 'ellipse';
  if (item.type === 'text') return 'text';
  if (item.type === 'icon') return 'icon';
  if (item.type === 'shape' && item.ink) return 'freehand';
  return 'rectangle';
}

function importedHyperlink(value: unknown): DrawObject['hyperlink'] {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string') throw new DrawModelError('whiteboard-link-invalid');
  const uri = value.trim();
  if (!uri) return undefined;
  const kind = uri.startsWith('vgt://') ? 'workspace' : 'external';
  const resolved = resolveDrawHyperlink({ kind, uri }, { allowExternalHttps: true });
  return { kind, uri: resolved.uri };
}

function whiteboardIdMap(items: readonly WhiteboardObjectModel[]): Record<string, string> {
  const idMap = Object.create(null) as Record<string, string>;
  const itemIds = new Set<string>();
  const generatedIdOwners = new Map<string, string>();
  for (const item of items) {
    if (!isRecord(item) || typeof item.id !== 'string' || item.id.length < 1 || item.id.length > 128) {
      throw new DrawModelError('whiteboard-object-id-invalid');
    }
    if (typeof item.type !== 'string' || !WHITEBOARD_OBJECT_TYPES.has(item.type)) {
      throw new DrawModelError('whiteboard-object-type-unknown');
    }
    if (itemIds.has(item.id)) throw new DrawModelError('whiteboard-object-id-duplicate');
    itemIds.add(item.id);
    const generatedId = stableLocalId('wb', item.id);
    const owner = generatedIdOwners.get(generatedId);
    if (owner !== undefined && owner !== item.id) throw new DrawModelError('whiteboard-object-id-collision');
    generatedIdOwners.set(generatedId, item.id);
    idMap[item.id] = generatedId;
  }
  return idMap;
}

/** Converts a Whiteboard snapshot into a new structured Draw model. The input is never mutated. */
export function convertWhiteboardToDraw(
  source: WhiteboardDocumentModel,
  base: DrawDocumentModel,
): { model: DrawDocumentModel; idMap: Record<string, string>; warnings: string[] } {
  assertDrawDocument(base);
  if (!isRecord(source) || !Array.isArray(source.items) || source.items.length > MAX_OBJECTS) {
    throw new DrawModelError('whiteboard-object-limit');
  }
  if (Object.keys(base.objects).length + source.items.length > MAX_OBJECTS) {
    throw new DrawModelError('draw-object-limit');
  }
  const idMap = whiteboardIdMap(source.items);
  const model = clone(base);
  const page = model.pages.find((candidate) => candidate.id === model.activePageId);
  if (!page || page.layerIds.length === 0) throw new DrawModelError('active-page-missing');
  const layerId = page.layerIds[0];
  const warnings: string[] = [];

  for (const item of source.items) {
    const id = idMap[item.id];
    if (Object.hasOwn(model.objects, id)) throw new DrawModelError('whiteboard-object-target-collision');
  }

  const ordinary = source.items.filter((item) => item.type !== 'connector');
  for (const [index, item] of ordinary.entries()) {
    const id = idMap[item.id];
    const hidden = item.hidden ?? false;
    const locked = item.locked ?? false;
    if (typeof hidden !== 'boolean' || typeof locked !== 'boolean') throw new DrawModelError('whiteboard-object-state-invalid');
    let object: DrawObject;
    if (item.type === 'frame') {
      object = {
        id,
        pageId: page.id,
        layerId,
        type: 'frame',
        name: item.name || item.text || 'Frame',
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
        rotation: item.rotation ?? 0,
        flipX: false,
        flipY: false,
        opacity: hidden ? 0 : 1,
        locked,
        zIndex: item.zIndex ?? index,
        customProperties: { sourceWhiteboardObjectId: item.id, sourceWhiteboardType: item.type },
      };
    } else {
      const richText: DrawRichText = {
        runs: [{ text: item.text }],
        autoFit: 'shrink',
        padding: { top: 4, right: 4, bottom: 4, left: 4 },
        verticalAlign: 'middle',
        rotation: 0,
      };
      object = createVectorShape({
        id,
        pageId: page.id,
        layerId,
        name: item.name || item.text || item.type,
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
        rotation: item.rotation ?? 0,
        flipX: false,
        flipY: false,
        opacity: hidden ? 0 : 1,
        locked,
        zIndex: item.zIndex ?? index,
        vector: {
          kind: whiteboardKind(item),
          points: item.ink?.points?.map((point) => ({ x: point.x, y: point.y })) ?? [],
        },
        customProperties: { sourceWhiteboardObjectId: item.id, sourceWhiteboardType: item.type },
      });
      object = setObjectRichText(object, richText);
      const hyperlink = importedHyperlink(item.linkUri);
      if (hyperlink) object.hyperlink = hyperlink;
      if (item.table) {
        object = setObjectTable(object, normalizeDrawTable({ ...item.table, headerRows: 1 }));
      }
    }
    model.objects[id] = object;
    page.objectIds.push(id);
  }

  for (const [index, item] of source.items.filter((candidate) => candidate.type === 'connector').entries()) {
    const fromId = typeof item.fromId === 'string' && Object.hasOwn(idMap, item.fromId) ? idMap[item.fromId] : undefined;
    const toId = typeof item.toId === 'string' && Object.hasOwn(idMap, item.toId) ? idMap[item.toId] : undefined;
    if (!fromId || !toId || !item.fromId || !item.toId) {
      warnings.push(`connector-unresolved:${item.id}`);
      continue;
    }
    const id = idMap[item.id];
    const object: DrawObject = {
      id,
      pageId: page.id,
      layerId,
      type: 'connector',
      name: item.lineLabel || 'Connector',
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
      rotation: item.rotation ?? 0,
      flipX: false,
      flipY: false,
      opacity: item.hidden ? 0 : 1,
      locked: Boolean(item.locked),
      zIndex: item.zIndex ?? ordinary.length + index,
      customProperties: { sourceWhiteboardObjectId: item.id, sourceWhiteboardType: item.type },
      connector: {
        from: { objectId: fromId, anchor: item.fromAnchor ?? 'auto' },
        to: { objectId: toId, anchor: item.toAnchor ?? 'auto' },
        route: item.connectorStyle?.route ?? 'orthogonal',
        autoRoute: item.connectorStyle?.autoRoute ?? true,
        waypoints: [],
        obstacleAvoidance: true,
        routingPriority: 0,
        crossingStyle: 'jump',
        semantic: { label: item.lineLabel },
        arrowStart: 'none',
        arrowEnd: 'triangle',
      },
    };
    model.objects[id] = object;
    page.objectIds.push(id);
  }

  model.revision += 1;
  assertDrawDocument(model);
  return { model, idMap, warnings };
}
