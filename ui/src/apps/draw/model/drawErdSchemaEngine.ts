// STATUS: PLATIN — bounded, deterministic Draw ERD/schema projection.
import type { DrawObject } from '../../../shared/contracts/draw/workspaceDraw';
import { assertDrawObject, DrawModelError, isRecord, safeId, safeText } from './drawDocumentValidation';
import { createVectorShape } from './drawVectorEngine';

const MAX_SCHEMA_TABLES = 512;
const MAX_SCHEMA_COLUMNS = 256;

export interface DrawDatabaseSchemaColumn {
  id: string;
  name: string;
  type: string;
  primaryKey?: boolean;
  foreignTableId?: string;
  foreignFieldId?: string;
}

export interface DrawDatabaseSchemaTable {
  id: string;
  name: string;
  columns: DrawDatabaseSchemaColumn[];
}

function validateSchemaTables(input: unknown): DrawDatabaseSchemaTable[] {
  if (!Array.isArray(input) || input.length > MAX_SCHEMA_TABLES) throw new DrawModelError('erd-table-limit');
  const tables = new Map<string, DrawDatabaseSchemaTable>();

  for (const rawTable of input as unknown[]) {
    if (!isRecord(rawTable)) throw new DrawModelError('erd-table-invalid');
    const id = safeId(rawTable.id, 'erd-table-id-invalid');
    const name = safeText(rawTable.name, 'erd-table-name-invalid');
    if (!name.trim() || tables.has(id)) throw new DrawModelError('erd-table-duplicate-or-empty');
    if (!Array.isArray(rawTable.columns) || rawTable.columns.length > MAX_SCHEMA_COLUMNS) {
      throw new DrawModelError('erd-column-limit');
    }

    const columnIds = new Set<string>();
    const columns: DrawDatabaseSchemaColumn[] = [];
    for (const rawColumn of rawTable.columns as unknown[]) {
      if (!isRecord(rawColumn)) throw new DrawModelError('erd-column-invalid');
      const columnId = safeId(rawColumn.id, 'erd-column-id-invalid');
      const columnName = safeText(rawColumn.name, 'erd-column-name-invalid');
      const type = safeText(rawColumn.type, 'erd-column-type-invalid');
      if (!columnName.trim() || !type.trim() || columnIds.has(columnId)) {
        throw new DrawModelError('erd-column-duplicate-or-empty');
      }
      columnIds.add(columnId);

      const primaryKey = rawColumn.primaryKey;
      if (primaryKey !== undefined && typeof primaryKey !== 'boolean') throw new DrawModelError('erd-column-primary-key-invalid');
      const foreignTableId = rawColumn.foreignTableId === undefined
        ? undefined
        : safeId(rawColumn.foreignTableId, 'erd-foreign-table-id-invalid');
      const foreignFieldId = rawColumn.foreignFieldId === undefined
        ? undefined
        : safeId(rawColumn.foreignFieldId, 'erd-foreign-field-id-invalid');
      if ((foreignTableId === undefined) !== (foreignFieldId === undefined)) {
        throw new DrawModelError('erd-foreign-key-incomplete');
      }
      columns.push({ id: columnId, name: columnName, type, primaryKey, foreignTableId, foreignFieldId });
    }
    tables.set(id, { id, name, columns });
  }

  for (const table of tables.values()) {
    for (const column of table.columns) {
      if (!column.foreignTableId || !column.foreignFieldId) continue;
      const referencedTable = tables.get(column.foreignTableId);
      if (!referencedTable?.columns.some((candidate) => candidate.id === column.foreignFieldId)) {
        throw new DrawModelError('erd-foreign-key-target-missing');
      }
    }
  }
  return [...tables.values()];
}

function tableObjectId(tableId: string): string {
  const direct = `erd-${tableId}`;
  if (direct.length <= 128) return direct;
  let hash = 0x811c9dc5;
  for (let index = 0; index < tableId.length; index += 1) {
    hash ^= tableId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `erd-${tableId.slice(0, 114)}-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function createErdObjectsFromSchema(input: unknown, pageId: string, layerId: string): DrawObject[] {
  const safePageId = safeId(pageId, 'erd-page-id-invalid');
  const safeLayerId = safeId(layerId, 'erd-layer-id-invalid');
  const tables = validateSchemaTables(input);
  const generatedIds = new Set<string>();

  return tables.map((table, index) => {
    const id = tableObjectId(table.id);
    if (generatedIds.has(id)) throw new DrawModelError('erd-object-id-collision');
    generatedIds.add(id);
    const object = createVectorShape({
      id,
      pageId: safePageId,
      layerId: safeLayerId,
      name: table.name,
      x: 80 + (index % 4) * 300,
      y: 80 + Math.floor(index / 4) * 240,
      width: 240,
      height: 180,
      rotation: 0,
      flipX: false,
      flipY: false,
      opacity: 1,
      locked: false,
      zIndex: index,
      diagram: {
        family: 'erd',
        role: 'entity',
        entity: {
          tableId: table.id,
          fields: table.columns.map((column) => ({
            id: column.id,
            name: column.name,
            type: column.type,
            primaryKey: column.primaryKey,
            foreignKey: column.foreignTableId && column.foreignFieldId
              ? { tableId: column.foreignTableId, fieldId: column.foreignFieldId }
              : undefined,
          })),
        },
      },
      vector: { kind: 'rectangle' },
    });
    assertDrawObject(object, id);
    return object;
  });
}

export function deriveSchemaPatchFromErd(input: unknown): DrawDatabaseSchemaTable[] {
  if (!Array.isArray(input) || input.length > 100_000) throw new DrawModelError('erd-object-list-invalid');
  const tables = new Map<string, DrawDatabaseSchemaTable>();

  for (const rawObject of input as unknown[]) {
    assertDrawObject(rawObject);
    const object = rawObject as DrawObject;
    const diagram = object.diagram;
    if (!diagram || diagram.family !== 'erd') continue;
    const entity = diagram.entity;
    if (!entity?.tableId || !Array.isArray(entity.fields)) throw new DrawModelError('erd-entity-invalid');
    const id = safeId(entity.tableId, 'erd-table-id-invalid');
    if (tables.has(id)) throw new DrawModelError('erd-table-duplicate-or-empty');
    if (!Array.isArray(entity.fields) || entity.fields.length > MAX_SCHEMA_COLUMNS) {
      throw new DrawModelError('erd-column-limit');
    }

    const columnIds = new Set<string>();
    const columns = entity.fields.map((field) => {
      if (!isRecord(field)) throw new DrawModelError('erd-column-invalid');
      const columnId = safeId(field.id, 'erd-column-id-invalid');
      const name = safeText(field.name, 'erd-column-name-invalid');
      const type = safeText(field.type, 'erd-column-type-invalid');
      if (!name.trim() || !type.trim() || columnIds.has(columnId)) {
        throw new DrawModelError('erd-column-duplicate-or-empty');
      }
      columnIds.add(columnId);
      if (field.primaryKey !== undefined && typeof field.primaryKey !== 'boolean') {
        throw new DrawModelError('erd-column-primary-key-invalid');
      }
      const foreignKey = field.foreignKey;
      if (foreignKey !== undefined && !isRecord(foreignKey)) throw new DrawModelError('erd-foreign-key-invalid');
      const foreignTableId = foreignKey ? safeId(foreignKey.tableId, 'erd-foreign-table-id-invalid') : undefined;
      const foreignFieldId = foreignKey ? safeId(foreignKey.fieldId, 'erd-foreign-field-id-invalid') : undefined;
      return { id: columnId, name, type, primaryKey: field.primaryKey, foreignTableId, foreignFieldId };
    });
    const name = safeText(object.name, 'erd-table-name-invalid');
    if (!name.trim()) throw new DrawModelError('erd-table-name-invalid');
    tables.set(id, { id, name, columns });
  }

  return [...tables.values()]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((table) => ({ ...table, columns: [...table.columns] }));
}

