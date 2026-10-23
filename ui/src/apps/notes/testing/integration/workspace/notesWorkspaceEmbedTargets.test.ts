// STATUS: PLATIN — AST-0696: Vault assets and Workspace objects appear as bounded local embed targets.
import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../../../../shared/contracts/workspace';
import { listNoteWorkspaceEmbedTargets } from '../../../integrations/notesWorkspaceEmbed';

function document(kind: WorkspaceDocument['kind'], extra: Partial<WorkspaceDocument> = {}): WorkspaceDocument {
  return { id: `doc-${kind}`, kind, title: kind, version: 3, objects: {}, root_object_ids: [], created_at: 1, modified_at: 1, ...extra } as WorkspaceDocument;
}

describe('AST-0696 local Workspace reference targets', () => {
  it('lists Vault assets so a Vault file can be linked into a note', () => {
    const vault = document('Vault', {
      vaultData: {
        files: [
          { id: 'vault-1', name: 'source-paper.pdf', kind: 'Vault', sizeBytes: 12, encryptedHash: 'a'.repeat(64), lastModified: 1, mimeType: 'application/pdf' },
          { id: 'vault-2', name: 'scan.png', kind: 'Vault', sizeBytes: 9, encryptedHash: 'b'.repeat(64), lastModified: 2, mimeType: 'image/png' },
        ],
      },
    } as Partial<WorkspaceDocument>);
    const targets = listNoteWorkspaceEmbedTargets(vault);
    expect(targets).toHaveLength(2);
    expect(targets[0]).toMatchObject({ kind: 'vault-asset', sourceObjectId: 'vault-1' });
    expect(targets[0].label).toContain('source-paper.pdf');
    expect(targets[0].label).toContain('application/pdf');
  });

  it('skips malformed Vault rows and bounds the list', () => {
    const vault = document('Vault', {
      vaultData: {
        files: [
          { id: '', name: 'broken', kind: 'Vault', sizeBytes: 1, encryptedHash: 'x', lastModified: 1 },
          ...Array.from({ length: 600 }, (_, index) => ({ id: `vault-${index}`, name: `f${index}`, kind: 'Vault' as const, sizeBytes: 1, encryptedHash: 'y', lastModified: index })),
        ],
      },
    } as Partial<WorkspaceDocument>);
    const targets = listNoteWorkspaceEmbedTargets(vault);
    expect(targets).toHaveLength(512);
    expect(targets.every((target) => target.sourceObjectId && target.sourceObjectId.length > 0)).toBe(true);
  });

  it('still lists the other app kinds and returns nothing for an unsupported kind', () => {
    expect(listNoteWorkspaceEmbedTargets(document('Writer'))).toEqual([{ id: 'writer', label: 'Writer document', kind: 'writer-live-link' }]);
    expect(listNoteWorkspaceEmbedTargets(document('Tasks')).map((target) => target.kind)).toEqual(['task-list', 'task-kpi']);
    expect(listNoteWorkspaceEmbedTargets(document('Notes'))).toEqual([]);
  });
});
