import { describe, expect, it } from 'vitest';
import type { DrawObject } from '../../../../shared/contracts/draw/workspaceDraw';
import { DrawModelError } from '../../model/drawDocumentEngine';
import { createErdObjectsFromSchema, deriveSchemaPatchFromErd, type DrawDatabaseSchemaTable } from '../../model/drawErdSchemaEngine';

function schema(): DrawDatabaseSchemaTable[] {
  return [
    {
      id: 'customers',
      name: 'Customer',
      columns: [
        { id: 'id', name: 'id', type: 'uuid', primaryKey: true },
        { id: 'name', name: 'name', type: 'text' },
      ],
    },
    {
      id: 'orders',
      name: 'Order',
      columns: [
        { id: 'id', name: 'id', type: 'uuid', primaryKey: true },
        { id: 'customer_id', name: 'customer_id', type: 'uuid', foreignTableId: 'customers', foreignFieldId: 'id' },
      ],
    },
  ];
}

function entityObject(id: string, tableId: string, fields: unknown): DrawObject {
  return {
    id,
    pageId: 'page-1',
    layerId: 'layer-main',
    type: 'shape',
    name: tableId,
    x: 0,
    y: 0,
    width: 100,
    height: 80,
    rotation: 0,
    flipX: false,
    flipY: false,
    opacity: 1,
    locked: false,
    zIndex: 0,
    diagram: {
      family: 'erd',
      role: 'entity',
      entity: { tableId, fields } as unknown as NonNullable<DrawObject['diagram']>['entity'],
    },
  };
}

describe('Draw ERD/schema projection', () => {
  it('creates stable schema-backed ERD objects and roundtrips foreign-key metadata', () => {
    const tables = schema();
    const first = createErdObjectsFromSchema(tables, 'page-1', 'layer-main');
    const second = createErdObjectsFromSchema(tables, 'page-1', 'layer-main');

    expect(first).toEqual(second);
    expect(first.map((object) => object.id)).toEqual(['erd-customers', 'erd-orders']);
    expect(first.map(({ x, y }) => ({ x, y }))).toEqual([{ x: 80, y: 80 }, { x: 380, y: 80 }]);
    expect(first[1].diagram?.entity?.fields[1]).toMatchObject({
      id: 'customer_id',
      foreignKey: { tableId: 'customers', fieldId: 'id' },
    });
    expect(deriveSchemaPatchFromErd(first)).toEqual(tables);
  });

  it('rejects malformed schemas, duplicate IDs, incomplete foreign keys, and missing targets', () => {
    expect(() => createErdObjectsFromSchema(null, 'page-1', 'layer-main')).toThrowError(DrawModelError);
    expect(() => createErdObjectsFromSchema([
      ...schema(), { ...schema()[0] },
    ], 'page-1', 'layer-main')).toThrowError(DrawModelError);
    expect(() => createErdObjectsFromSchema([{
      id: 'items', name: 'Item', columns: [{ id: 'ref', name: 'Ref', type: 'uuid', foreignTableId: 'targets' }],
    }], 'page-1', 'layer-main')).toThrowError(DrawModelError);
    expect(() => createErdObjectsFromSchema([{
      id: 'items', name: 'Item', columns: [{ id: 'ref', name: 'Ref', type: 'uuid', foreignTableId: 'targets', foreignFieldId: 'missing' }],
    }], 'page-1', 'layer-main')).toThrowError(DrawModelError);
    expect(() => createErdObjectsFromSchema([{
      id: 'items', name: 'Item', columns: Array.from({ length: 257 }, (_, index) => ({ id: `c${index}`, name: `Column ${index}`, type: 'text' })),
    }], 'page-1', 'layer-main')).toThrowError(DrawModelError);
  });

  it('rejects malformed ERD entities instead of silently dropping schema fields', () => {
    const malformed = entityObject('entity-1', 'table-1', 'not-an-array');
    const tooManyFields = entityObject('entity-2', 'table-2', Array.from({ length: 257 }, (_, index) => ({
      id: `c${index}`, name: `Column ${index}`, type: 'text',
    })));

    expect(() => deriveSchemaPatchFromErd([malformed])).toThrowError(DrawModelError);
    expect(() => deriveSchemaPatchFromErd([tooManyFields])).toThrowError(DrawModelError);
    expect(() => deriveSchemaPatchFromErd([
      ...createErdObjectsFromSchema(schema(), 'page-1', 'layer-main'),
      ...createErdObjectsFromSchema(schema(), 'page-1', 'layer-main').map((object) => ({ ...object, id: `${object.id}-duplicate` })),
    ])).toThrowError(DrawModelError);
  });
});

