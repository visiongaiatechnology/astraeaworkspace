// STATUS: DIAMANT VGT SUPREME — Writer history regression packet O
import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../../../../../shared/contracts/workspace';
import { commitWriterHistory, createWriterHistory, stepWriterHistory, WRITER_HISTORY_LIMIT } from '../../../../editor/history/writerHistory';

const doc = (version: number): WorkspaceDocument => ({
  id: 'writer-history-doc', title: `v${version}`, kind: 'Writer', theme_id: 'modern-indigo', version, created_at: 1, modified_at: version,
  root_object_ids: [], objects: {}, writerData: { pageSetup: { paperSize: 'A4', orientation: 'portrait', margins: 'normal', paperColor: 'white', showPageNumbers: true, headerText: '', footerText: '', columns: 1, columnGapMm: 8 }, tables: [] },
});

describe('writer history', () => {
  it('supports deterministic undo/redo and drops redo branches after a new edit', () => {
    let history = createWriterHistory(doc(1));
    history = commitWriterHistory(history, doc(2));
    history = commitWriterHistory(history, doc(3));
    const undo = stepWriterHistory(history, 'undo');
    expect(undo.document?.version).toBe(2);
    history = undo.state;
    history = commitWriterHistory(history, doc(4));
    expect(history.entries.map((entry) => entry.version)).toEqual([1, 2, 4]);
    expect(stepWriterHistory(history, 'redo').document).toBeUndefined();
  });

  it('coalesces continuous edits and enforces the bounded history limit', () => {
    let history = createWriterHistory(doc(1));
    // A coalescing edit only extends an entry that the same kind of edit
    // produced, so the run is opened with the same key.
    history = commitWriterHistory(history, doc(2), true);
    history = commitWriterHistory(history, doc(3), true);
    expect(history.entries.map((entry) => entry.version)).toEqual([1, 3]);
    for (let version = 4; version < WRITER_HISTORY_LIMIT + 20; version += 1) {
      history = commitWriterHistory(history, doc(version));
    }
    expect(history.entries).toHaveLength(WRITER_HISTORY_LIMIT);
  });
});
