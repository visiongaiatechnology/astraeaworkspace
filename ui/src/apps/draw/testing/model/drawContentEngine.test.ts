import { describe, expect, it } from 'vitest';
import type {
  DrawObject,
  DrawRichText,
  DrawReviewAnnotation,
  DrawTableData,
} from '../../../../shared/contracts/draw/workspaceDraw';
import { DrawModelError } from '../../model/drawDocumentEngine';
import {
  addDrawAnnotation,
  autoFitDrawText,
  normalizeDrawRichText,
  normalizeDrawTable,
  resolveDrawHyperlink,
  setObjectRichText,
  setObjectTable,
} from '../../model/drawContentEngine';

function richText(overrides: Partial<DrawRichText> = {}): DrawRichText {
  return {
    runs: [{ text: 'Astraea', fontSize: 20, bold: true }],
    autoFit: 'none',
    padding: { top: 5, right: 5, bottom: 5, left: 5 },
    verticalAlign: 'middle',
    rotation: 0,
    ...overrides,
  };
}

function drawObject(overrides: Partial<DrawObject> = {}): DrawObject {
  return {
    id: 'shape-1',
    pageId: 'page-1',
    layerId: 'layer-main',
    type: 'shape',
    name: 'Text shape',
    x: 0,
    y: 0,
    width: 100,
    height: 50,
    rotation: 0,
    flipX: false,
    flipY: false,
    opacity: 1,
    locked: false,
    zIndex: 0,
    ...overrides,
  };
}

describe('Draw rich text content', () => {
  it('normalizes rich text into a detached value and rejects sparse or invalid runs', () => {
    const input = richText();
    const normalized = normalizeDrawRichText(input);
    normalized.runs[0]!.text = 'changed';

    expect(input.runs[0]?.text).toBe('Astraea');
    expect(() => normalizeDrawRichText({ ...input, runs: new Array(1) as DrawRichText['runs'] })).toThrow('richtext-run-invalid');
    expect(() => normalizeDrawRichText(richText({ rotation: Number.POSITIVE_INFINITY }))).toThrow('text-rotation-invalid');
    expect(() => normalizeDrawRichText(richText({ padding: { top: -1, right: 0, bottom: 0, left: 0 } }))).toThrow('text-padding-invalid');
  });

  it('shrinks text to available bounds and rejects invalid measurement results', () => {
    const object = drawObject({ richText: richText({ autoFit: 'shrink' }) });
    const result = autoFitDrawText(object, () => ({ width: 200, height: 50 }));

    expect(result.richText?.runs[0]?.fontSize).toBe(9);
    expect(object.richText?.runs[0]?.fontSize).toBe(20);
    expect(() => autoFitDrawText(object, () => ({ width: Number.POSITIVE_INFINITY, height: 20 }))).toThrow('text-measurement-invalid');
  });

  it('resizes shapes using bounded measurement output', () => {
    const object = drawObject({ richText: richText({ autoFit: 'resize-shape' }) });
    const result = autoFitDrawText(object, () => ({ width: 240, height: 90 }));

    expect(result.width).toBe(250);
    expect(result.height).toBe(100);
  });

  it('sets rich text without mutating the original object', () => {
    const original = drawObject();
    const updated = setObjectRichText(original, richText());

    expect(updated.richText).toEqual(richText());
    expect(original.richText).toBeUndefined();
  });
});

describe('Draw table content', () => {
  const validTable: DrawTableData = {
    columns: ['Name', 'Status'],
    rows: [['Explorer', 'Ready']],
    headerRows: 1,
  };

  it('normalizes rectangular data into detached rows', () => {
    const normalized = normalizeDrawTable(validTable);
    normalized.rows[0]![0] = 'changed';

    expect(validTable.rows[0]?.[0]).toBe('Explorer');
    expect(() => normalizeDrawTable({ ...validTable, rows: [['too short']] })).toThrow('table-column-mismatch');
    const sparseRow = new Array<string>(2);
    sparseRow[0] = 'Explorer';
    expect(() => normalizeDrawTable({ ...validTable, rows: [sparseRow] })).toThrow('table-cell-size-limit');
  });

  it('attaches validated tables without changing the source object', () => {
    const original = drawObject();
    const updated = setObjectTable(original, validTable);

    expect(updated.table).toEqual(validTable);
    expect(original.table).toBeUndefined();
  });
});

describe('Draw review annotations', () => {
  const annotation: DrawReviewAnnotation = {
    id: 'review-1',
    kind: 'comment',
    author: 'Reviewer',
    text: 'Confirm this step.',
    createdAt: 1,
  };

  it('adds a bounded annotation immutably and rejects duplicate identities', () => {
    const original = drawObject();
    const updated = addDrawAnnotation(original, annotation);

    expect(updated.annotations).toEqual([annotation]);
    expect(original.annotations).toBeUndefined();
    expect(() => addDrawAnnotation(updated, annotation)).toThrow('annotation-duplicate');
  });
});

describe('Draw hyperlinks', () => {
  it('allows canonical Workspace links and rejects dot-segment traversal', () => {
    expect(resolveDrawHyperlink(
      { kind: 'workspace', uri: 'vgt://workspace/document/doc-1/object/shape-1' },
      { allowExternalHttps: false },
    )).toEqual({ action: 'workspace', uri: 'vgt://workspace/document/doc-1/object/shape-1' });
    expect(() => resolveDrawHyperlink(
      { kind: 'workspace', uri: 'vgt://workspace/document/../private' },
      { allowExternalHttps: false },
    )).toThrow(DrawModelError);
  });

  it('requires explicit external HTTPS permission and rejects credentials or insecure schemes', () => {
    expect(resolveDrawHyperlink(
      { kind: 'external', uri: 'https://example.com/path' },
      { allowExternalHttps: true },
    )).toEqual({ action: 'external', uri: 'https://example.com/path' });
    expect(() => resolveDrawHyperlink(
      { kind: 'external', uri: 'http://example.com/path' },
      { allowExternalHttps: true },
    )).toThrow('external-link-invalid');
    expect(() => resolveDrawHyperlink(
      { kind: 'external', uri: 'https://user:password@example.com/path' },
      { allowExternalHttps: true },
    )).toThrow('external-link-invalid');
    expect(() => resolveDrawHyperlink(
      { kind: 'external', uri: 'https://example.com/path' },
      { allowExternalHttps: false },
    )).toThrow('external-link-policy-denied');
  });
});
