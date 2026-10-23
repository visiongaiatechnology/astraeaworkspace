// STATUS: PLATIN — Notes live/frozen Workspace projections use only the neutral snapshot port.
import { afterEach, describe, expect, it } from 'vitest';
import { initialDocs } from '../../../../../app/bootstrap/seedData';
import type { NoteWorkspaceEmbedData, WorkspaceDocument, WriterWorkspaceEmbedSnapshot } from '../../../../../shared/contracts/workspace';
import { registerWorkspaceSnapshotProvider } from '../../../../../platform/workspace/integrations/workspaceSnapshot';
import { createNoteWorkspaceEmbed, resolveNoteWorkspaceEmbed, type NoteWorkspaceEmbedTarget } from '../../../integrations/notesWorkspaceEmbed';

const writerDocument = Object.values(initialDocs).find((document) => document.kind === 'Writer');
if (!writerDocument) throw new Error('Notes snapshot tests require a canonical Writer source.');

const target: NoteWorkspaceEmbedTarget = { id: 'writer', label: 'Writer document', kind: 'writer-live-link' };
const snapshot: WriterWorkspaceEmbedSnapshot = { type: 'summary', metrics: [], lines: ['snapshot'] };
let release: (() => void) | undefined;

afterEach(() => {
  release?.();
  release = undefined;
});

describe('Notes Workspace embed snapshots', () => {
  it('creates a live reference through the neutral port without owning Writer extraction', () => {
    let received: WorkspaceDocument | undefined;
    release = registerWorkspaceSnapshotProvider((document) => { received = document; return snapshot; });

    const embed = createNoteWorkspaceEmbed(writerDocument, target, 'Live');

    expect(received).toBe(writerDocument);
    expect(embed.snapshot).toBe(snapshot);
    expect(embed.mode).toBe('Live');
    expect(embed.sourceVersion).toBe(writerDocument.version);
  });

  it('refreshes changed live sources, preserves frozen sources, and keeps stale data on provider failure', () => {
    let emitted: WriterWorkspaceEmbedSnapshot = snapshot;
    let shouldFail = false;
    release = registerWorkspaceSnapshotProvider(() => {
      if (shouldFail) throw new Error('snapshot_unavailable');
      return emitted;
    });
    const initial = createNoteWorkspaceEmbed(writerDocument, target, 'Live');
    const newerSource: WorkspaceDocument = { ...writerDocument, version: writerDocument.version + 1 };
    emitted = { type: 'summary', metrics: [], lines: ['updated'] };

    const refreshed = resolveNoteWorkspaceEmbed(initial, [newerSource]);
    expect(refreshed.snapshot).toBe(emitted);
    expect(refreshed.sourceVersion).toBe(newerSource.version);

    const frozen: NoteWorkspaceEmbedData = { ...initial, mode: 'Frozen' };
    expect(resolveNoteWorkspaceEmbed(frozen, [newerSource])).toBe(frozen);

    shouldFail = true;
    expect(resolveNoteWorkspaceEmbed(initial, [newerSource])).toBe(initial);
  });
});
