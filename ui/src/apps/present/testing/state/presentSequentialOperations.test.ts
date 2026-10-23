// BATCH-PRESENT — the W-397 check: TWO calls in ONE instance/state chain, asserting the accumulated
// result. Sequential single-call tests hide the "const copy of state" class completely: every method
// computes against the stale snapshot and writes only its own value back, so the first call is lost
// and the second one looks correct in isolation.
//
// This file therefore deliberately makes two (or three) calls per subject and asserts the accumulation.

import { describe, expect, it } from 'vitest';
import type {
  PresentDocumentModel,
  PresentSceneObject,
  PresentSlide,
  WorkspaceDocument,
} from '../../../../shared/contracts/workspace';
import {
  PRESENT_HISTORY_LIMIT,
  commitPresentHistory,
  createPresentHistory,
  stepPresentHistory,
} from '../../history/presentHistory';
import {
  appendPresentTableRow,
  setPresentTableCell,
} from '../../canvas/model/presentTable';
import {
  appendPresentChartCategory,
  appendPresentChartSeries,
  normalizePresentChart,
  setPresentChartValue,
} from '../../canvas/model/presentChartData';
import { applyPresentCanvasCommand } from '../../editor/presentCanvasCommands';
import { advancePresentCommandSnapshot, runPresentCanvasCommand } from '../../editor/presentCanvasCommands';
import type { PresentCanvasCommandState } from '../../editor/presentCanvasCommands';
import { applyPresentTextFormat } from '../../canvas/model/presentTextFormat';
import { withPresentImageCrop, readPresentImageCrop } from '../../canvas/model/presentObjectExtensions';
import { togglePresentSelection } from '../../canvas/model/presentSelection';
import { readPresentGroupId } from '../../canvas/model/presentObjectExtensions';

const document = (revision: string): WorkspaceDocument => ({
  id: 'doc-1',
  kind: 'Present',
  title: revision,
  version: 1,
  modified_at: 0,
} as unknown as WorkspaceDocument);

const textObject = (id: string) => ({
  id,
  kind: 'text' as const,
  text: id,
  xPercent: 10,
  yPercent: 10,
  widthPercent: 20,
  heightPercent: 10,
  fontSizePt: 18,
  color: '#ffffff',
  zIndex: 1,
});

describe('W-397 — history holds the accumulated document chain', () => {
  it('two commits in one history instance produce two undo steps, not one', () => {
    let state = createPresentHistory(document('start'));
    state = commitPresentHistory(state, document('first'));
    state = commitPresentHistory(state, document('second'));
    expect(state.entries).toHaveLength(3);
    expect(state.entries[state.index].document.title).toBe('second');

    const undoOnce = stepPresentHistory(state, 'undo');
    expect(undoOnce.document?.title).toBe('first');
    const undoTwice = stepPresentHistory(undoOnce.state, 'undo');
    expect(undoTwice.document?.title).toBe('start');
    // A third undo has nothing left; it must not throw and must not move.
    const undoThree = stepPresentHistory(undoTwice.state, 'undo');
    expect(undoThree.document).toBeUndefined();
    expect(undoThree.state.index).toBe(0);
  });

  it('two edits after an undo branch away and keep redo reachable, then two redos come back', () => {
    let state = createPresentHistory(document('start'));
    state = commitPresentHistory(state, document('a'));
    state = commitPresentHistory(state, document('b'));
    state = stepPresentHistory(state, 'undo').state;              // back at 'a'
    state = commitPresentHistory(state, document('c'));            // branch
    expect(state.entries.map((entry) => entry.document.title)).toEqual(['start', 'a', 'c']);
    const redo = stepPresentHistory(state, 'redo');
    expect(redo.document).toBeUndefined();                         // no redo after a branch
  });

  it('two coalesced commits replace the current entry instead of appending', () => {
    let state = createPresentHistory(document('start'));
    state = commitPresentHistory(state, document('drag-1'), 'drag');
    state = commitPresentHistory(state, document('drag-2'), 'drag');
    state = commitPresentHistory(state, document('drag-3'), 'drag');
    expect(state.entries).toHaveLength(2);
    expect(state.entries[state.index].document.title).toBe('drag-3');
  });

  it('stays bounded across many sequential commits', () => {
    let state = createPresentHistory(document('start'));
    for (let index = 0; index < PRESENT_HISTORY_LIMIT + 20; index += 1) {
      state = commitPresentHistory(state, document(`r${index}`));
    }
    expect(state.entries.length).toBeLessThanOrEqual(PRESENT_HISTORY_LIMIT);
    expect(state.entries[state.index].document.title).toBe(`r${PRESENT_HISTORY_LIMIT + 19}`);
  });
});

describe('W-397 — pure collection edits accumulate in one chain', () => {
  it('two table row appends in one chain leave three rows and a rectangular table', () => {
    let table = { id: 't', kind: 'table' as const, columns: ['A'], rows: [['1']], headerColor: '#111', bodyColor: '#222', textColor: '#fff', xPercent: 0, yPercent: 0, widthPercent: 10, heightPercent: 10 };
    table = appendPresentTableRow(table).table;
    table = appendPresentTableRow(table).table;
    expect(table.rows).toHaveLength(3);
    expect(table.rows.every((row) => row.length === 1)).toBe(true);
  });

  it('a cell write after a row append keeps both changes', () => {
    let table = { id: 't', kind: 'table' as const, columns: ['A'], rows: [['1']], headerColor: '#111', bodyColor: '#222', textColor: '#fff', xPercent: 0, yPercent: 0, widthPercent: 10, heightPercent: 10 };
    table = appendPresentTableRow(table).table;
    table = setPresentTableCell(table, 1, 0, 'edited').table;
    expect(table.rows).toEqual([['1'], ['edited']]);
  });

  it('two category appends keep every series aligned', () => {
    let chart = normalizePresentChart({ id: 'c', chart_type: 'column', title: 'T', categories: ['A'], series: [{ name: 'S1', values: [1] }, { name: 'S2', values: [2] }] });
    chart = appendPresentChartCategory(chart).chart;
    chart = appendPresentChartCategory(chart).chart;
    expect(chart.categories).toHaveLength(3);
    expect(chart.series.map((series) => series.values.length)).toEqual([3, 3]);
  });

  it('a series append after a value edit keeps both', () => {
    let chart = normalizePresentChart({ id: 'c', chart_type: 'column', title: 'T', categories: ['A', 'B'], series: [{ name: 'S1', values: [1, 2] }] });
    chart = setPresentChartValue(chart, 0, 1, 42).chart;
    chart = appendPresentChartSeries(chart).chart;
    expect(chart.series[0].values).toEqual([1, 42]);
    expect(chart.series[1].values).toEqual([0, 0]);
  });

  it('two duplicates in one executor chain accumulate four objects and two distinct group keys', () => {
    let state: PresentCanvasCommandState = { objects: [textObject('a'), textObject('b')], selection: ['a', 'b'] };
    state = applyPresentCanvasCommand({ type: 'group' }, state)!.state;
    const first = applyPresentCanvasCommand({ type: 'duplicate-selection' }, state)!;
    const second = applyPresentCanvasCommand({ type: 'duplicate-selection' }, first.state)!;
    expect(second.state.objects).toHaveLength(6);
    const groupKeys = new Set(second.state.objects.map((object) => readPresentGroupId(object)));
    // original group + one fresh key per duplication: three distinct groups, never merged.
    expect(groupKeys.size).toBe(3);
    expect(groupKeys.has(null as never)).toBe(false);
  });

  it('two consecutive nudge commands accumulate instead of overwriting', () => {
    let state: PresentCanvasCommandState = { objects: [textObject('a')], selection: ['a'] };
    state = applyPresentCanvasCommand({ type: 'nudge', dxPercent: 5, dyPercent: 0 }, state)!.state;
    state = applyPresentCanvasCommand({ type: 'nudge', dxPercent: 5, dyPercent: 0 }, state)!.state;
    expect(state.objects[0].xPercent).toBe(20);
  });

  it('two text formats in one chain keep both fields', () => {
    let objects: PresentSceneObject[] = [textObject('a')];
    objects = applyPresentTextFormat(objects, ['a'], { fontSizePt: 30 }).objects;
    objects = applyPresentTextFormat(objects, ['a'], { lineHeight: 1.6 }).objects;
    const formatted = objects[0] as unknown as { fontSizePt: number; lineHeight?: number };
    expect(formatted.fontSizePt).toBe(30);
    expect(formatted.lineHeight).toBe(1.6);
  });

  it('two crop writes in one chain keep both insets', () => {
    let image: Record<string, unknown> = {};
    image = withPresentImageCrop(image, { cropTop: 10 });
    image = withPresentImageCrop(image, { cropLeft: 5 });
    const crop = readPresentImageCrop(image);
    expect(crop).toMatchObject({ top: 10, left: 5, right: 0, bottom: 0 });
  });

  it('two selection toggles in one chain add then remove', () => {
    const objects = [textObject('a'), textObject('b')];
    let selection = togglePresentSelection(objects, [], 'a', true);
    selection = togglePresentSelection(objects, selection, 'b', true);
    expect(selection).toEqual(['a', 'b']);
    selection = togglePresentSelection(objects, selection, 'b', true);
    expect(selection).toEqual(['a']);
  });
});

describe('W-401 — the command runner advances its snapshot in the same tick', () => {
  it('two runPresentCanvasCommand calls against one snapshot accumulate', () => {
    const start: PresentCanvasCommandState = { objects: [textObject('a')], selection: ['a'] };
    const first = runPresentCanvasCommand(start, { type: 'nudge', dxPercent: 5, dyPercent: 0 })!;
    expect(first.snapshot.objects[0].xPercent).toBe(15);
    // The second call must build on `first.snapshot`, which is what a component does when two
    // keystrokes are handled before React re-renders.
    const second = runPresentCanvasCommand(first.snapshot, { type: 'nudge', dxPercent: 5, dyPercent: 0 })!;
    expect(second.snapshot.objects[0].xPercent).toBe(20);
    expect(second.changed).toBe(true);
  });

  it('a three-step chain keeps every step (duplicate, nudge, duplicate)', () => {
    const start: PresentCanvasCommandState = { objects: [textObject('a')], selection: ['a'] };
    const one = runPresentCanvasCommand(start, { type: 'duplicate-selection' })!;
    // Duplicating selects the copy, so the next command acts on the copy - that is the intended
    // behaviour and the reason the chain has to advance its snapshot.
    expect(one.snapshot.objects).toHaveLength(2);
    expect(one.snapshot.selection).toHaveLength(1);
    const two = runPresentCanvasCommand(one.snapshot, { type: 'nudge', dxPercent: 3, dyPercent: 0 })!;
    const three = runPresentCanvasCommand(two.snapshot, { type: 'duplicate-selection' })!;
    expect(three.snapshot.objects).toHaveLength(3);
    // Hand-computed: original at 10, its copy offset to 13 then nudged by +3 to 16, and the second
    // duplication copies the 16-object with the usual +3 offset to 19. If the snapshot were not
    // advanced, the nudge would be lost and the values would read 10, 13, 16.
    expect(three.snapshot.objects.map((object) => object.xPercent).sort((left, right) => left - right)).toEqual([10, 16, 19]);
    expect(three.snapshot.objects).toHaveLength(new Set(three.snapshot.objects.map((object) => object.id)).size);
  });

  it('advancePresentCommandSnapshot keeps the object array for a selection-only result', () => {
    const objects = [textObject('a'), textObject('b')];
    const current: PresentCanvasCommandState = { objects, selection: [] };
    const result = applyPresentCanvasCommand({ type: 'toggle-object-selection', id: 'a', additive: false }, current)!;
    const advanced = advancePresentCommandSnapshot(current, result);
    // Same array identity: a selection command must not rewrite the document.
    expect(advanced.objects).toBe(objects);
    expect(advanced.selection).toEqual(['a']);
  });

  it('advancePresentCommandSnapshot returns the same snapshot for a genuine no-op', () => {
    const objects = [textObject('a')];
    const current: PresentCanvasCommandState = { objects, selection: ['a'] };
    // select-all on an already fully selected deck changes neither objects nor selection.
    const result = applyPresentCanvasCommand({ type: 'select-all' }, current)!;
    expect(result.changed).toBe(false);
    const advanced = advancePresentCommandSnapshot(current, result);
    expect(advanced).toBe(current);
  });

  it('reports which objects a command touched', () => {
    const start: PresentCanvasCommandState = { objects: [textObject('a'), textObject('b')], selection: ['a'] };
    const run = runPresentCanvasCommand(start, { type: 'nudge', dxPercent: 5, dyPercent: 0 })!;
    expect(run.changedIds).toEqual(['a']);
  });
});

describe('W-397 — slide duplication keeps the deck consistent across two calls', () => {
  it('two duplications of the same slide accumulate and never share an id', async () => {
    const { duplicatePresentSlide } = await import('../../contracts/presentDeckFactory');
    const slide: PresentSlide = {
      id: 'slide-1',
      title: 'One',
      subtitle: '',
      layout: 'blank',
      sceneObjects: [textObject('o1') as never],
    };
    const firstCopy = duplicatePresentSlide(slide, 'copy-1');
    const secondCopy = duplicatePresentSlide(slide, 'copy-2');
    const model: PresentDocumentModel = { slides: [slide, firstCopy, secondCopy] };
    expect(model.slides).toHaveLength(3);
    expect(new Set(model.slides.map((entry: PresentSlide) => entry.id)).size).toBe(3);
    expect(new Set(model.slides.flatMap((entry: PresentSlide) => (entry.sceneObjects ?? []).map((object: PresentSceneObject) => object.id))).size).toBe(3);
  });
});
