// STATUS: PLATIN — bounded, deterministic Draw diagram generation.
import type { DrawObject } from '../../../shared/contracts/draw/workspaceDraw';
import { DrawModelError } from './drawDocumentEngine';
import { createVectorShape } from './drawVectorEngine';

const MAX_RECORD_FIELDS = 2_048;
const MAX_TEXT = 1_000_000;
const MAX_FIELD_TEXT = 8_192;
const MAX_FIELD_ID = /^[A-Za-z0-9._:@ -]{1,256}$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boundedString(value: unknown, maximum: number, code: string): string {
  if (typeof value !== 'string' || value.length > maximum) throw new DrawModelError(code);
  return value;
}

function safeId(value: unknown, code: string): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9._:@-]{1,128}$/u.test(value)) throw new DrawModelError(code);
  return value;
}
export interface AutoDiagramRow {
  id: string;
  label: string;
  parentId?: string;
  fields?: Record<string, string | number | boolean | null>;
}

function stableGeneratedObjectId(rowId: string): string {
  const candidate = `auto-${rowId}`;
  if (candidate.length <= 128) return candidate;
  let hash = 0x811c9dc5;
  for (let index = 0; index < rowId.length; index += 1) {
    hash ^= rowId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `auto-${rowId.slice(0, 110)}-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function validateDiagramRows(rows: readonly AutoDiagramRow[]): Map<string, AutoDiagramRow> {
  if (!Array.isArray(rows) || rows.length > 10_000) throw new DrawModelError('auto-diagram-row-limit');
  const byId = new Map<string, AutoDiagramRow>();
  let totalText = 0;
  let totalFields = 0;
  for (const value of rows) {
    if (!isRecord(value)) throw new DrawModelError('auto-diagram-row-invalid');
    const id = safeId(value.id, 'auto-diagram-id-invalid');
    const label = boundedString(value.label, 512, 'auto-diagram-label-invalid');
    if (byId.has(id)) throw new DrawModelError('auto-diagram-id-invalid');
    if (value.parentId !== undefined) safeId(value.parentId, 'auto-diagram-parent-invalid');
    totalText += label.length;

    const fields = Object.create(null) as Record<string, string | number | boolean | null>;
    if (value.fields !== undefined) {
      if (!isRecord(value.fields)) throw new DrawModelError('auto-diagram-fields-invalid');
      const entries = Object.entries(value.fields);
      if (entries.length > MAX_RECORD_FIELDS) throw new DrawModelError('auto-diagram-field-limit');
      totalFields += entries.length;
      if (totalFields > 100_000) throw new DrawModelError('auto-diagram-field-limit');
      for (const [field, fieldValue] of entries) {
        if (!MAX_FIELD_ID.test(field)) throw new DrawModelError('auto-diagram-field-invalid');
        if (typeof fieldValue === 'string') {
          if (fieldValue.length > MAX_FIELD_TEXT) throw new DrawModelError('auto-diagram-field-invalid');
          totalText += fieldValue.length;
        } else if (typeof fieldValue === 'number') {
          if (!Number.isFinite(fieldValue)) throw new DrawModelError('auto-diagram-field-invalid');
        } else if (typeof fieldValue !== 'boolean' && fieldValue !== null) {
          throw new DrawModelError('auto-diagram-field-invalid');
        }
        fields[field] = fieldValue;
      }
    }
    if (totalText > MAX_TEXT) throw new DrawModelError('auto-diagram-text-limit');
    byId.set(id, { id, label, parentId: value.parentId as string | undefined, fields });
  }
  return byId;
}

function hierarchyDepths(rows: readonly AutoDiagramRow[], byId: ReadonlyMap<string, AutoDiagramRow>): Map<string, number> {
  const depths = new Map<string, number>();
  for (const row of rows) {
    if (depths.has(row.id)) continue;
    const path: string[] = [];
    const active = new Set<string>();
    let cursor: AutoDiagramRow | undefined = row;
    let depth = -1;

    while (cursor) {
      const knownDepth = depths.get(cursor.id);
      if (knownDepth !== undefined) {
        depth = knownDepth;
        break;
      }
      if (active.has(cursor.id)) throw new DrawModelError('hierarchy-cycle');
      active.add(cursor.id);
      path.push(cursor.id);
      if (!cursor.parentId) break;
      cursor = byId.get(cursor.parentId);
      if (!cursor) throw new DrawModelError('hierarchy-parent-missing');
    }

    for (let index = path.length - 1; index >= 0; index -= 1) {
      depth += 1;
      if (depth > 1_024) throw new DrawModelError('hierarchy-depth-limit');
      depths.set(path[index]!, depth);
    }
  }
  return depths;
}

export function generateDeterministicDiagram(
  rows: readonly AutoDiagramRow[],
  pageId: string,
  layerId: string,
  layout: 'table' | 'hierarchy' = 'table',
): DrawObject[] {
  safeId(pageId, 'auto-diagram-page-invalid');
  safeId(layerId, 'auto-diagram-layer-invalid');
  if (layout !== 'table' && layout !== 'hierarchy') throw new DrawModelError('auto-diagram-layout-invalid');
  const byId = validateDiagramRows(rows);
  const sorted = [...byId.values()].sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  const depths = layout === 'hierarchy' ? hierarchyDepths(sorted, byId) : undefined;
  const columnsAtDepth = new Map<number, number>();

  return sorted.map((row, index) => {
    const depth = depths?.get(row.id) ?? Math.floor(index / 5);
    const column = depths
      ? columnsAtDepth.get(depth) ?? 0
      : index % 5;
    if (depths) columnsAtDepth.set(depth, column + 1);

    const customProperties: Record<string, string | number | boolean> = {
      sourceRowId: row.id,
      generatedLayout: layout,
    };
    for (const [field, value] of Object.entries(row.fields ?? {})) {
      if (value !== null) customProperties[`data:${field}`] = value;
    }

    return createVectorShape({
      id: stableGeneratedObjectId(row.id),
      pageId,
      layerId,
      name: row.label,
      x: 80 + column * 220,
      y: 80 + depth * 160,
      width: 180,
      height: 90,
      rotation: 0,
      flipX: false,
      flipY: false,
      opacity: 1,
      locked: false,
      zIndex: index,
      customProperties,
      vector: { kind: 'rectangle' },
    });
  });
}
