import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../../../../shared/contracts/workspace';
import { projectWriterWorkspaceSourceCandidates } from '../../../integrations/workspace/writerGridSourceCatalog';

function source(id: string, kind: WorkspaceDocument['kind'], title: string, modified_at = 1): WorkspaceDocument {
  return { id, kind, title, modified_at, created_at: 1, version: 1, objects: {} } as WorkspaceDocument;
}

describe('projectWriterWorkspaceSourceCandidates', () => {
  it('prefers live open versions, excludes the active Writer and unrelated app kinds', () => {
    const liveGrid = source('grid-a', 'Grid', 'Current Grid');
    const candidates = projectWriterWorkspaceSourceCandidates('writer-a', [
      source('writer-a', 'Writer', 'Writer'),
      liveGrid,
      source('notes-a', 'Notes', 'Notes'),
    ], [
      { id: 'grid-a', kind: 'Grid', title: 'Older saved title', modified_at: 0 },
      { id: 'grid-b', kind: 'Grid', title: 'Saved Grid', modified_at: 2 },
    ]);

    expect(candidates).toEqual([
      { id: 'grid-a', kind: 'Grid', title: 'Current Grid', isOpen: true },
      { id: 'grid-b', kind: 'Grid', title: 'Saved Grid', isOpen: false },
    ]);
  });

  it('returns metadata only for closed documents', () => {
    const candidate = projectWriterWorkspaceSourceCandidates('writer-a', [], [
      { id: 'grid-closed', kind: 'Grid', title: 'Saved Grid', modified_at: 10 },
    ])[0];

    expect(candidate).toEqual({ id: 'grid-closed', kind: 'Grid', title: 'Saved Grid', isOpen: false });
    expect(candidate).not.toHaveProperty('objects');
  });
});
