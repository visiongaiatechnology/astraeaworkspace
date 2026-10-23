import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';
import {
  changeWhiteboardLiveObjectMode,
  createWhiteboardLiveObject,
  extractWhiteboardLiveSnapshot,
  liveObjectKindsForDocument,
  makeWhiteboardLiveSourceUri,
  resolveWhiteboardLiveObject,
} from '../../live-objects/whiteboardLiveObjectEngine';
import type { WhiteboardLiveObjectSnapshot } from '../../../../shared/contracts/whiteboard/workspaceWhiteboard';

const makeDocument = (kind: WorkspaceDocument['kind'], overrides: Partial<WorkspaceDocument> = {}): WorkspaceDocument => ({
  id: 'source-document', title: 'Source document', kind, version: 7, objects: {}, ...overrides,
} as WorkspaceDocument);

describe('Whiteboard live object engine', () => {
  it('exposes source kinds only for the supported document kind', () => {
    expect(liveObjectKindsForDocument(makeDocument('Vault'))).toEqual(['vault-asset']);
    expect(liveObjectKindsForDocument(makeDocument('Whiteboard'))).toEqual([]);
  });

  it('bounds Present slide extraction and discloses omitted content', () => {
    const source = makeDocument('Present', {
      presentData: { slides: [{ id: 'slide-1', title: '  Main\u0000 slide  ', subtitle: '', layout: 'default', bulletPoints: Array.from({ length: 40 }, (_, index) => `Bullet ${index}`), cards: Array.from({ length: 40 }, (_, index) => ({ id: `card-${index}`, title: `Card ${index}`, value: 'value' })) }] } as unknown as WorkspaceDocument['presentData'],
    });

    const snapshot = extractWhiteboardLiveSnapshot(source, 'present-slide', 'slide-1');

    expect(snapshot.title).toBe('Main slide');
    expect(snapshot.lines).toHaveLength(12);
    expect(snapshot.lines.at(-1)).toBe('Additional slide content omitted.');
    expect(snapshot.lines.every((line) => line.length <= 320)).toBe(true);
  });

  it('bounds Grid object scanning and cell output', () => {
    const cells = Object.fromEntries(Array.from({ length: 30 }, (_, index) => [`C${index}`, { value: `value-${index}` }]));
    const source = makeDocument('Grid', {
      objects: { table: { type: 'Table', data: { id: 'table', rows: 30, cols: 1, cells } } } as WorkspaceDocument['objects'],
    });

    const snapshot = extractWhiteboardLiveSnapshot(source, 'grid-range', 'table');

    expect(snapshot.lines).toHaveLength(12);
    expect(snapshot.lines.at(-1)).toBe('Additional cells omitted.');
    expect(snapshot.status).toBe('partial');
  });

  it('bounds Planner scans and labels without presenting a partial count as complete', () => {
    const cards = Array.from({ length: 10_001 }, (_, index) => ({ id: `card-${index}`, column: 'Doing' }));
    const source = makeDocument('Planner', { workData: { cards } } as Partial<WorkspaceDocument>);

    const snapshot = extractWhiteboardLiveSnapshot(source, 'planner-board');

    expect(snapshot.status).toBe('partial');
    expect(snapshot.subtitle).toBe('First 10000 of 10001 cards');
    expect(snapshot.values).toEqual([10_000]);
  });

  it('bounds form response and answer aggregation and labels the sample', () => {
    const answers = Array.from({ length: 40 }, (_, index) => `answer-${index}`);
    const responses = Array.from({ length: 1_001 }, (_, index) => ({ id: `response-${index}`, answers: { field: answers } }));
    const source = makeDocument('Forms', { formsData: { fields: [{ id: 'field', type: 'select', label: 'Category', required: false }], responses } } as unknown as Partial<WorkspaceDocument>);

    const snapshot = extractWhiteboardLiveSnapshot(source, 'form-result-chart', 'field');

    expect(snapshot.status).toBe('partial');
    expect(snapshot.lines).toContain('Results use a bounded sample.');
    expect(snapshot.values?.length).toBeLessThanOrEqual(24);
  });

  it('does not project an explicitly unavailable Vault entry by selector', () => {
    const source = makeDocument('Vault', {
      vaultData: { files: [{ id: 'quarantined-file', name: 'secret-name.pdf', kind: 'PdfStudio', sizeBytes: 90, status: 'quarantined' }] } as WorkspaceDocument['vaultData'],
    });

    const snapshot = extractWhiteboardLiveSnapshot(source, 'vault-asset', 'quarantined-file');

    expect(snapshot.status).toBe('missing');
    expect(snapshot.title).toBe('Source document');
    expect(snapshot.lines).toEqual(['No safe Vault asset is available.']);
    expect(snapshot.lines.join(' ')).not.toContain('secret-name.pdf');
  });

  it('fails closed instead of substituting the first source record for an unknown selector', () => {
    const source = makeDocument('PdfStudio', {
      pdfData: { pages: [{ id: 'page-1', pageNumber: 1, title: 'Private first page', subtitle: '', ocrLayer: { lines: [{ text: 'first page text' }] } }] } as unknown as WorkspaceDocument['pdfData'],
    });

    const snapshot = extractWhiteboardLiveSnapshot(source, 'pdf-page', 'unknown-page');

    expect(snapshot.status).toBe('missing');
    expect(snapshot.lines).toEqual(['No PDF page is available.']);
    expect(snapshot.lines.join(' ')).not.toContain('first page text');
  });

  it('treats malformed source objects as unavailable instead of reading missing data', () => {
    const source = makeDocument('Grid', { objects: { invalid: { type: 'Table' } } as unknown as WorkspaceDocument['objects'] });

    const snapshot = extractWhiteboardLiveSnapshot(source, 'grid-range', 'invalid');

    expect(snapshot.status).toBe('missing');
  });

  it('sanitizes hostile persisted frozen snapshots into bounded primitive display data', () => {
    const item = createWhiteboardLiveObject({ source: makeDocument('Present'), kind: 'present-slide', mode: 'Live', x: 0, y: 0 });
    const hostile = { toString: () => { throw new Error('must not stringify object input'); } };
    item.liveObject!.mode = 'Frozen';
    item.liveObject!.frozenSnapshot = {
      sourceVersion: Number.POSITIVE_INFINITY,
      capturedAt: Number.NaN,
      title: hostile,
      lines: [hostile, ...Array.from({ length: 30 }, (_, index) => `line-${index}`)],
      labels: Array.from({ length: 40 }, (_, index) => `label-${index}`),
      values: [...Array.from({ length: 30 }, (_, index) => index), Number.NaN],
    } as unknown as WhiteboardLiveObjectSnapshot;

    const resolved = resolveWhiteboardLiveObject(item, {});

    expect(resolved?.available).toBe(true);
    expect(resolved?.snapshot.title).toBe('Source document');
    expect(resolved?.snapshot.lines.length).toBeLessThanOrEqual(12);
    expect(resolved?.snapshot.lines).not.toContain(hostile);
    expect(resolved?.snapshot.labels).toHaveLength(24);
    expect(resolved?.snapshot.values).toHaveLength(24);
    expect(Number.isFinite(resolved?.snapshot.sourceVersion)).toBe(true);
    expect(Number.isFinite(resolved?.snapshot.capturedAt)).toBe(true);
  });

  it('uses finite coordinates, bounded identity, and canonical source URIs', () => {
    const source = makeDocument('Present');
    const item = createWhiteboardLiveObject({ source, kind: 'present-slide', mode: 'Link', selector: 'slide one', x: Number.NaN, y: Number.POSITIVE_INFINITY });

    expect(item.x).toBe(0);
    expect(item.y).toBe(0);
    expect(item.id).toMatch(/^live-/);
    expect(item.liveObject?.sourceUri).toBe(makeWhiteboardLiveSourceUri(source.id, 'present-slide', 'slide one'));
  });

  it('rejects a document-map identity mismatch and freezes only an available matching source', () => {
    const source = makeDocument('Present');
    const item = createWhiteboardLiveObject({ source, kind: 'present-slide', mode: 'Live', x: 1, y: 2 });
    const mismatched = { ...source, id: 'different-document' };

    expect(resolveWhiteboardLiveObject(item, { [source.id]: mismatched })?.available).toBe(false);
    expect(() => changeWhiteboardLiveObjectMode(item, 'Frozen', { [source.id]: mismatched })).toThrow('whiteboard_live_freeze_source_unavailable');
    expect(changeWhiteboardLiveObjectMode(item, 'Frozen', { [source.id]: source }).liveObject?.mode).toBe('Frozen');
  });
});
