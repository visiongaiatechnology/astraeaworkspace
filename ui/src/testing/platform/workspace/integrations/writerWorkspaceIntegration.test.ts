// STATUS: PLATIN — verifies the fail-closed neutral Writer integration contract.
import { afterEach, describe, expect, it } from 'vitest';
import type { WriterWorkspaceEmbed, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import {
  appendWriterWorkspaceEmbed,
  createWriterWorkspaceEmbed,
  registerWriterWorkspaceIntegrationHost,
  WriterWorkspaceIntegrationHostUnavailableError,
  type CreateWriterWorkspaceEmbedRequest,
  type WriterWorkspaceIntegrationHost,
} from '../../../../platform/workspace/integrations/writerWorkspaceIntegration';
import { WorkspaceSnapshotBudgetExceededError } from '../../../../platform/workspace/integrations/workspaceSnapshot';

const writerDocument = { id: 'writer-1', kind: 'Writer', version: 3, title: 'Writer' } as WorkspaceDocument;
const gridDocument = { id: 'grid-1', kind: 'Grid', version: 7, title: 'Grid' } as WorkspaceDocument;
const embed: WriterWorkspaceEmbed = {
  id: 'embed-1', kind: 'grid-range', mode: 'Snapshot', sourceDocumentId: gridDocument.id,
  sourceObjectId: 'sheet-1', sourceSelector: 'A1:B2', uri: 'vgt://workspace/document/grid-1/writer-embed/grid-range',
  sourceVersion: gridDocument.version, anchorParagraphId: 'paragraph-1', title: 'Grid range', createdAt: 10, updatedAt: 10,
  snapshot: { type: 'table', columns: ['A', 'B'], rows: [['1', '2'], ['3', '4']] },
};
const request: CreateWriterWorkspaceEmbedRequest = {
  writerDocument, sourceDocument: gridDocument, kind: 'grid-range', mode: 'Snapshot',
  anchorParagraphId: 'paragraph-1', sourceObjectId: 'sheet-1', sourceSelector: 'A1:B2', id: 'embed-1', now: 10,
};

let unregister: (() => void) | undefined;

afterEach(() => {
  unregister?.();
  unregister = undefined;
});

function installHost(overrides: Partial<WriterWorkspaceIntegrationHost> = {}): void {
  const host: WriterWorkspaceIntegrationHost = {
    createEmbed: () => embed,
    appendEmbed: (current, next) => [...current.filter((item) => item.id !== next.id), next],
    ...overrides,
  };
  unregister = registerWriterWorkspaceIntegrationHost(host);
}

describe('neutral Writer workspace integration port', () => {
  it('fails closed when the Writer-owned host is not installed', () => {
    expect(() => createWriterWorkspaceEmbed(request)).toThrow(WriterWorkspaceIntegrationHostUnavailableError);
    expect(() => appendWriterWorkspaceEmbed([], embed)).toThrow(WriterWorkspaceIntegrationHostUnavailableError);
  });

  it('forwards canonical requests and returns bounded Writer projection results', () => {
    let received: CreateWriterWorkspaceEmbedRequest | undefined;
    installHost({ createEmbed: (value) => { received = value; return embed; } });

    expect(createWriterWorkspaceEmbed(request)).toEqual(embed);
    expect(received).toBe(request);
    expect(appendWriterWorkspaceEmbed([], embed)).toEqual([embed]);
  });

  it('rejects non-Writer targets and host results that change source identity', () => {
    installHost({ createEmbed: () => ({ ...embed, sourceDocumentId: 'other-source' }) });
    expect(() => createWriterWorkspaceEmbed(request)).toThrow('writer_workspace_integration_result_invalid');
    expect(() => createWriterWorkspaceEmbed({ ...request, writerDocument: gridDocument })).toThrow('writer_workspace_integration_document_invalid');
  });

  it('rejects host append results that omit the requested embed', () => {
    installHost({ appendEmbed: () => [] });
    expect(() => appendWriterWorkspaceEmbed([], embed)).toThrow('writer_workspace_integration_append_result_invalid');
  });

  // W-253: the count of embeds was bounded and the size of one snapshot was not. Both paths that can put an
  // embed into a document are measured here, with the public signatures of this module unchanged.
  it('rejects a created embed whose snapshot exceeds the one-megabyte budget', () => {
    const oversized = {
      ...embed,
      snapshot: {
        type: 'table' as const,
        columns: Array.from({ length: 100 }, (_, index) => `C${index}`),
        rows: Array.from({ length: 100 }, () => Array.from({ length: 100 }, () => 'x'.repeat(2_048))),
      },
    };
    installHost({ createEmbed: () => oversized });

    expect(() => createWriterWorkspaceEmbed(request)).toThrow(WorkspaceSnapshotBudgetExceededError);
    expect(() => createWriterWorkspaceEmbed(request)).toThrow('1048576-byte budget');
  });

  it('rejects an appended embed whose snapshot exceeds the budget', () => {
    installHost();
    const oversized = {
      ...embed,
      snapshot: {
        type: 'table' as const,
        columns: Array.from({ length: 100 }, (_, index) => `C${index}`),
        rows: Array.from({ length: 100 }, () => Array.from({ length: 100 }, () => 'x'.repeat(2_048))),
      },
    };

    expect(() => appendWriterWorkspaceEmbed([], oversized)).toThrow(WorkspaceSnapshotBudgetExceededError);
  });

  it('still accepts an ordinary snapshot through both paths', () => {
    installHost();
    expect(createWriterWorkspaceEmbed(request)).toEqual(embed);
    expect(appendWriterWorkspaceEmbed([], embed)).toEqual([embed]);
  });

});
