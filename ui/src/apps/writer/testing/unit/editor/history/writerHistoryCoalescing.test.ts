// STATUS: PLATIN — Writer history coalescing and branching contracts
import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../../../../../shared/contracts/workspace';
import {
  commitWriterHistory,
  createWriterHistory,
  replaceWriterHistoryCurrent,
  stepWriterHistory,
} from '../../../../editor/history/writerHistory';

const doc = (version: number): WorkspaceDocument => ({
  id: 'writer-history-doc', title: `v${version}`, kind: 'Writer', theme_id: 'modern-indigo', version, created_at: 1, modified_at: version,
  root_object_ids: [], objects: {}, writerData: { pageSetup: { paperSize: 'A4', orientation: 'portrait', margins: 'normal', paperColor: 'white', showPageNumbers: true, headerText: '', footerText: '', columns: 1, columnGapMm: 8 }, tables: [] },
});

const versions = (history: { entries: WorkspaceDocument[] }) => history.entries.map((entry) => entry.version);

describe('Writer history coalescing', () => {
  it('extends an entry while the same edit kind keeps running', () => {
    let history = createWriterHistory(doc(1));
    history = commitWriterHistory(history, doc(2), 'typing:p1');
    history = commitWriterHistory(history, doc(3), 'typing:p1');
    history = commitWriterHistory(history, doc(4), 'typing:p1');
    expect(versions(history)).toEqual([1, 4]);
    expect(history.index).toBe(1);
  });

  it('starts a new step when another kind of edit interrupts', () => {
    let history = createWriterHistory(doc(1));
    history = commitWriterHistory(history, doc(2), 'typing:p1');
    // Enter/Backspace/split carry no coalescing key and must stay their own step.
    history = commitWriterHistory(history, doc(3));
    history = commitWriterHistory(history, doc(4), 'typing:p1');
    expect(versions(history)).toEqual([1, 2, 3, 4]);
  });

  it('starts a new step when typing continues in another paragraph', () => {
    let history = createWriterHistory(doc(1));
    history = commitWriterHistory(history, doc(2), 'typing:p1');
    history = commitWriterHistory(history, doc(3), 'typing:p2');
    expect(versions(history)).toEqual([1, 2, 3]);
  });

  it('never destroys a restored snapshot after an undo', () => {
    let history = createWriterHistory(doc(1));
    history = commitWriterHistory(history, doc(2), 'typing:p1');
    history = commitWriterHistory(history, doc(3), 'typing:p1');
    expect(versions(history)).toEqual([1, 3]);

    const undo = stepWriterHistory(history, 'undo');
    expect(undo.document?.version).toBe(1);
    history = undo.state;

    // A coalescing write after stepping back must branch, not rewrite entry 1
    // — the old implementation mutated the restored snapshot in place.
    history = commitWriterHistory(history, doc(9), 'typing:p1');
    expect(versions(history)).toEqual([1, 9]);
    expect(history.entries[0]?.version).toBe(1);
  });

  it('drops the redo branch when a coalescing write follows an undo', () => {
    let history = createWriterHistory(doc(1));
    history = commitWriterHistory(history, doc(2), 'typing:p1');
    history = commitWriterHistory(history, doc(3), 'typing:p1');
    const undo = stepWriterHistory(history, 'undo');
    history = undo.state;
    expect(stepWriterHistory(history, 'redo').document?.version).toBe(3);

    const undoAgain = stepWriterHistory(history, 'undo');
    history = undoAgain.state;
    history = commitWriterHistory(history, doc(4), 'typing:p1');
    expect(versions(history)).toEqual([1, 4]);
    expect(stepWriterHistory(history, 'redo').document).toBeUndefined();
  });

  it('refuses to coalesce into the very first snapshot', () => {
    let history = createWriterHistory(doc(1));
    history = commitWriterHistory(history, doc(2), 'typing:p1');
    expect(versions(history)).toEqual([1, 2]);
  });

  it('treats a boolean request as the generic key', () => {
    let history = createWriterHistory(doc(1));
    history = commitWriterHistory(history, doc(2), true);
    history = commitWriterHistory(history, doc(3), true);
    expect(versions(history)).toEqual([1, 3]);
    history = commitWriterHistory(history, doc(4), false);
    expect(versions(history)).toEqual([1, 3, 4]);
  });

  it('ignores an empty key instead of coalescing blindly', () => {
    let history = createWriterHistory(doc(1));
    history = commitWriterHistory(history, doc(2), '');
    history = commitWriterHistory(history, doc(3), '');
    expect(versions(history)).toEqual([1, 2, 3]);
  });

  it('ends the running edit on undo and on redo', () => {
    let history = createWriterHistory(doc(1));
    history = commitWriterHistory(history, doc(2), 'typing:p1');
    history = commitWriterHistory(history, doc(3), 'typing:p1');
    const undo = stepWriterHistory(history, 'undo');
    expect(undo.state.coalesceKey).toBeNull();
    const redo = stepWriterHistory(undo.state, 'redo');
    expect(redo.state.coalesceKey).toBeNull();
  });

  it('keeps the running edit when a snapshot is replaced in place', () => {
    let history = createWriterHistory(doc(1));
    history = commitWriterHistory(history, doc(2), 'typing:p1');
    history = replaceWriterHistoryCurrent(history, doc(20));
    expect(versions(history)).toEqual([1, 20]);
    expect(history.coalesceKey).toBe('typing:p1');
    history = commitWriterHistory(history, doc(3), 'typing:p1');
    expect(versions(history)).toEqual([1, 3]);
  });

  it('walks a full typing, structural, typing sequence back and forward', () => {
    let history = createWriterHistory(doc(1));
    history = commitWriterHistory(history, doc(2), 'typing:p1');
    history = commitWriterHistory(history, doc(3), 'typing:p1');
    history = commitWriterHistory(history, doc(4));
    history = commitWriterHistory(history, doc(5), 'typing:p2');
    expect(versions(history)).toEqual([1, 3, 4, 5]);

    const back = stepWriterHistory(history, 'undo');
    expect(back.document?.version).toBe(4);
    const backAgain = stepWriterHistory(back.state, 'undo');
    expect(backAgain.document?.version).toBe(3);
    const toStart = stepWriterHistory(backAgain.state, 'undo');
    expect(toStart.document?.version).toBe(1);
    expect(stepWriterHistory(toStart.state, 'undo').document).toBeUndefined();
  });
});
