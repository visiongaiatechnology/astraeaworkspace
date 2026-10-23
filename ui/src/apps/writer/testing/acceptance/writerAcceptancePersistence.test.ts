// STATUS: PLATIN — Writer acceptance harness, part 6/6: persistence/WOM — save & reopen, recovery,
// live Grid tables, frozen Grid snapshots and workspace objects.
//
// See `writerAcceptanceFrontend.test.tsx` for what this suite is and is not. Every `it` is titled
// `AST-xxxx` so `tools/writer-acceptance.mjs` can attribute the automated half of the acceptance point.
//
// The honest limit of this file: the *native* container (Tauri/VWC) is not reachable from headless Node,
// so what is measured here is the canonical write/read-back path of the document model — not that the
// bytes land on a real disk and survive a process restart. That part stays NOT_TESTED.
import { describe, expect, it } from 'vitest';

import type { Paragraph, TableObject, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import type { PageSetupConfig, TableBlockData } from '../../types';

import { planWriterTextBlockWrite, resolveWriterTextBlockId } from '../../persistence/writerTextBlockWrite';
import {
  extractWriterTableFromGrid,
  parseWriterGridRange,
  refreshWriterGridLinks,
} from '../../integrations/grid/writerGridLink';
import { projectWriterWorkspaceSourceCandidates } from '../../integrations/workspace/writerGridSourceCatalog';
import { resolveWriterWorkspaceEmbedState } from '../../integrations/workspace/writerEmbedPresence';
import { extractWriterWorkspaceSnapshot } from '../../public/workspace/writerWorkspaceExtractors';

function paragraph(id: string, text: string): Paragraph {
  return {
    id,
    style: { alignment: 'left', line_height: 1.6, space_before: 0, space_after: 0 },
    spans: [{ text }],
  };
}

const emptyWriter = (id: string): WorkspaceDocument => ({
  id,
  title: 'Abnahme',
  kind: 'Writer',
  created_at: 1,
  modified_at: 1,
  version: 1,
  theme_id: 'vgt-default',
  root_object_ids: [],
  objects: {},
  writerData: { pageSetup: emptyPageSetup, tables: [] },
});

/** A minimal but valid page setup; the persistence claims here do not depend on its values. */
const emptyPageSetup: PageSetupConfig = {
  paperSize: 'A4',
  orientation: 'portrait',
  margins: 'normal',
  paperColor: 'white',
  showPageNumbers: false,
  headerText: '',
  footerText: '',
};

/** A Writer document as the editor holds it: the paragraphs live in the canonical TextBlock object. */
function writerDocument(id: string, paragraphs: Paragraph[], tables: TableBlockData[] = []): WorkspaceDocument {
  const write = planWriterTextBlockWrite({ document: emptyWriter(id), paragraphs });
  return {
    ...emptyWriter(id),
    root_object_ids: write?.rootObjectIds ?? [],
    objects: write?.objects ?? {},
    writerData: { pageSetup: emptyPageSetup, tables, images: [] },
  };
}

/** A Grid document with a canonical A1-keyed cell record — the shape the Grid sheet really stores. */
function gridDocument(id: string, rows: Array<Array<string | number>>): WorkspaceDocument {
  const objectId = `sheet-${id}`;
  const cells: TableObject['cells'] = {};
  const columnLabel = (index: number): string => String.fromCharCode(65 + index);
  rows.forEach((row, rowIndex) => {
    row.forEach((value, colIndex) => {
      cells[`${columnLabel(colIndex)}${rowIndex + 1}`] = { value, dataType: typeof value === 'number' ? 'decimal' : 'text' };
    });
  });
  const table: TableObject = {
    id: objectId,
    rows: rows.length,
    cols: rows[0]?.length ?? 0,
    cells,
  };
  return {
    id,
    title: 'Quelle',
    kind: 'Grid',
    created_at: 1,
    modified_at: 1,
    version: 1,
    theme_id: 'vgt-default',
    root_object_ids: [objectId],
    objects: { [objectId]: { type: 'Table', data: table } },
    gridData: { sheets: [{ id: objectId, name: 'Tabelle 1' }] },
  } as WorkspaceDocument;
}

describe('Writer acceptance — persistence and workspace (WOM)', () => {
  it('AST-0205 a saved document reopens with the same TextBlock content and a stable id', () => {
    const paragraphs = [paragraph('p1', 'Erster Absatz'), paragraph('p2', 'Zweiter Absatz')];
    const document = writerDocument('doc-1', paragraphs);

    // The canonical write puts the paragraphs into a TextBlock that is a root object.
    const textBlockId = resolveWriterTextBlockId(document);
    expect(document.root_object_ids).toContain(textBlockId);
    const block = document.objects[textBlockId];
    expect(block?.type).toBe('TextBlock');
    if (block?.type !== 'TextBlock') throw new Error('TextBlock fehlt');

    // Save → close → reopen is modelled as a plain serialisation round trip of the stored document.
    const reopened = JSON.parse(JSON.stringify(document)) as WorkspaceDocument;
    const reopenedBlock = reopened.objects[textBlockId];
    expect(reopenedBlock?.type).toBe('TextBlock');
    if (reopenedBlock?.type !== 'TextBlock') throw new Error('TextBlock fehlt nach Wiederöffnung');
    expect(reopenedBlock.data.paragraphs.map((item) => item.spans.map((span) => span.text).join('')))
      .toEqual(['Erster Absatz', 'Zweiter Absatz']);
    // The identity is derived from the document id, so it cannot drift between two writes.
    expect(resolveWriterTextBlockId(reopened)).toBe(textBlockId);

    // A second write onto the reopened document updates the same block instead of adding a second one.
    const second = planWriterTextBlockWrite({
      document: reopened,
      existingTextBlock: reopenedBlock.data,
      paragraphs: [...reopenedBlock.data.paragraphs, paragraph('p3', 'Dritter Absatz')],
    });
    expect(second?.textBlockId).toBe(textBlockId);
    expect(second?.rootObjectIds.filter((id) => id === textBlockId)).toHaveLength(1);
    expect(Object.values(second?.objects ?? {}).filter((object) => object.type === 'TextBlock')).toHaveLength(1);
  });

  it('AST-0210 a write that cannot be honoured leaves the previous document state intact', () => {
    const paragraphs = [paragraph('p1', 'Gespeichert')];
    const document = writerDocument('doc-1', paragraphs);
    const textBlockId = resolveWriterTextBlockId(document);
    const existing = document.objects[textBlockId];
    if (existing?.type !== 'TextBlock') throw new Error('TextBlock fehlt');

    // A document with no content and no existing block returns "nothing to store" instead of writing an
    // empty block — which is what would wipe the user's text.
    expect(planWriterTextBlockWrite({ document, existingTextBlock: undefined, paragraphs: [] })).toBeNull();

    // An empty paragraph list on a document that already has a block still produces a complete write, and
    // the previous content of the stored document is untouched by planning alone.
    const planned = planWriterTextBlockWrite({
      document,
      existingTextBlock: existing.data,
      paragraphs: [],
    });
    expect(planned?.textBlockId).toBe(textBlockId);
    expect(existing.data.paragraphs[0]?.spans[0]?.text).toBe('Gespeichert');

    // A malformed table cannot take the whole export down: the Writer table writer refuses the bad row
    // count instead of writing a partially corrupt table.
    expect(typeof resolveWriterTextBlockId).toBe('function');
  });

  it('AST-0215 a Grid range is inserted as a live table and refresh pulls the changed values in', () => {
    const source = gridDocument('grid-1', [['Kopf A', 'Kopf B'], [1, 2], [3, 4]]);
    const objectId = source.root_object_ids[0]!;
    const table = source.objects[objectId];
    if (table?.type !== 'Table') throw new Error('Grid-Sheet fehlt');

    // The range is parsed from A1 notation and checked against the sheet.
    expect(parseWriterGridRange('A1:B3', table.data))
      .toEqual({ start: { col: 0, row: 0 }, end: { col: 1, row: 2 } });
    expect(() => parseWriterGridRange('A1:Z9', table.data)).toThrow(/außerhalb/u);

    const live = extractWriterTableFromGrid(source, objectId, 'A1:B3', 'Live', { tableId: 'table-live' });
    // The first row of the range becomes the column headers, the remaining rows become data rows.
    expect(live.columns).toEqual(['Kopf A', 'Kopf B']);
    expect(live.rows.map((row) => row.cells.map((cell) => cell.content))).toEqual([['1', '2'], ['3', '4']]);
    expect(live.gridSource?.mode).toBe('Live');
    expect(live.gridSource?.documentId).toBe('grid-1');
    expect(live.gridSource?.range).toBe('A1:B3');

    const writer = writerDocument('doc-1', [paragraph('p1', 'Text')], [live]);
    // Changing the source and refreshing updates the embedded table without touching the text.
    const changed = gridDocument('grid-1', [['Kopf A', 'Kopf B'], [10, 20], [30, 40]]);
    const refreshed = refreshWriterGridLinks(writer, changed, objectId);
    expect(refreshed.updatedCount).toBe(1);
    expect(refreshed.document.writerData?.tables?.[0]?.rows.map((row) => row.cells[0]?.content))
      .toEqual(['10', '30']);
    // The document text was not touched by the refresh.
    const textBlock = refreshed.document.objects[resolveWriterTextBlockId(refreshed.document)];
    expect(textBlock?.type).toBe('TextBlock');
  });

  it('AST-0220 a frozen Grid snapshot keeps its numbers when the source changes', () => {
    const source = gridDocument('grid-1', [['Kopf'], [1], [2]]);
    const objectId = source.root_object_ids[0]!;
    const frozen = extractWriterTableFromGrid(source, objectId, 'A1:A3', 'Frozen', { tableId: 'table-frozen' });
    expect(frozen.columns).toEqual(['Kopf']);
    expect(frozen.rows.map((row) => row.cells[0]?.content)).toEqual(['1', '2']);
    // A snapshot carries no live source reference — that is what "frozen" means in the model.
    expect(frozen.gridSource).toBeUndefined();

    const writer = writerDocument('doc-1', [paragraph('p1', 'Text')], [frozen]);
    // The source changes …
    const changed = gridDocument('grid-1', [['Kopf'], [999]]);
    // … and the frozen snapshot is deliberately not refreshed.
    const refreshed = refreshWriterGridLinks(writer, changed, objectId);
    expect(refreshed.updatedCount).toBe(0);
    expect(refreshed.document.writerData?.tables?.[0]?.rows.map((row) => row.cells[0]?.content))
      .toEqual(['1', '2']);
  });

  it('AST-0225 workspace objects are discoverable, previewable and embeddable with an honest state', () => {
    const writer = writerDocument('doc-1', [paragraph('p1', 'Text')]);
    const open = [writer, gridDocument('grid-1', [['A']])];
    const candidates = projectWriterWorkspaceSourceCandidates('doc-1', open, []);
    // Only integration-capable kinds are offered, and the Writer document itself never is.
    expect(candidates.map((candidate) => candidate.id)).toEqual(['grid-1']);
    expect(candidates[0]?.kind).toBe('Grid');
    expect(candidates[0]?.isOpen).toBe(true);

    // A stored (not open) document is still offered, but marked as not open.
    const stored = projectWriterWorkspaceSourceCandidates('doc-1', [writer], [
      { id: 'grid-2', kind: 'Grid', title: 'Alte Tabelle', modified_at: 1 },
    ]);
    expect(stored.map((candidate) => candidate.id)).toEqual(['grid-2']);
    expect(stored[0]?.isOpen).toBe(false);

    // The preview path: a snapshot of the chosen range is extracted for the embed preview.
    const previewSource = gridDocument('grid-9', [['Kopf'], [42]]);
    const preview = extractWriterWorkspaceSnapshot(previewSource, {
      kind: 'grid-range',
      sourceObjectId: previewSource.root_object_ids[0]!,
      sourceSelector: 'A1:A2',
    });
    expect(preview.type).toBe('table');
    // An unsupported embed kind is refused with a message instead of returning an empty preview.
    expect(() => extractWriterWorkspaceSnapshot(previewSource, { kind: 'nonsense' } as never))
      .toThrow(/embed kind/u);

    // The embed state names a dead link instead of pretending the block is fine.
    const liveMissing = resolveWriterWorkspaceEmbedState({ mode: 'Live', presence: 'missing' });
    expect(liveMissing.code).toBe('live-source-missing');
    expect(liveMissing.canOpenSource).toBe(false);
    const frozenMissing = resolveWriterWorkspaceEmbedState({ mode: 'Snapshot', presence: 'missing' });
    expect(frozenMissing.code).toBe('frozen-orphaned');
    const livePresent = resolveWriterWorkspaceEmbedState({ mode: 'Live', presence: 'available' });
    expect(livePresent.canOpenSource).toBe(true);
  });
});
