// STATUS: DIAMANT VGT SUPREME — anchoring a workspace object at the chosen paragraph
//
// Paket 45 acceptance: "Gültige Quellen durchsuchen, Vorschau anzeigen und **am gewählten Absatz
// verankern**."
//
// W-255, found by comparing the four sibling features: images, tables, equations and media objects all
// have an "unanchored" fallback — `!anchorParagraphId || !paragraphs.some((p) => p.id === …)` — and are
// still shown when their paragraph is gone. Workspace embeds had none. The page renderer matches an
// embed against a paragraph and the section partition drops it when the paragraph is unknown, so an
// embed with a stale anchor was **stored, counted and never rendered**: invisible, unreachable, and
// its delete button with it. The anchor is now checked before anything is written.
import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../../../../shared/contracts/workspace';
import {
  createWriterWorkspaceEmbed,
  refreshWriterWorkspaceEmbeds,
} from '../../../public/workspace/writerWorkspaceIntegration';
import { projectWriterWorkspaceSourceCandidates } from '../../../integrations/workspace/writerGridSourceCatalog';

const paragraph = (id: string) => ({
  id,
  style: { style_name: 'normal', alignment: 'left', line_height: 1.25, space_before: 0, space_after: 4 },
  spans: [{ text: `Absatz ${id}` }],
});

const writer = (paragraphIds: string[] = ['p-1', 'p-2']): WorkspaceDocument => ({
  schema_version: 1, id: 'writer-1', title: 'Bericht', kind: 'Writer', created_at: 1, modified_at: 1,
  version: 1, theme_id: 'default', root_object_ids: ['text-1'],
  objects: {
    'text-1': { type: 'TextBlock', data: { id: 'text-1', paragraphs: paragraphIds.map(paragraph) } },
  },
  writerData: {
    pageSetup: {
      paperSize: 'A4', orientation: 'portrait', margins: 'normal', paperColor: 'white',
      showPageNumbers: true, headerText: '', footerText: '',
    },
    tables: [],
  },
} as unknown as WorkspaceDocument);

const grid = (): WorkspaceDocument => ({
  schema_version: 1, id: 'grid-1', title: 'Zahlen', kind: 'Grid', created_at: 1, modified_at: 1,
  version: 1, theme_id: 'default', root_object_ids: ['table-1'],
  objects: {
    'table-1': {
      type: 'Table',
      data: {
        id: 'table-1', rows: 2, cols: 2,
        cells: { A1: { value: 'Name' }, B1: { value: 'Q1' }, A2: { value: 'Core' }, B2: { value: 42 } },
      },
    },
  },
} as unknown as WorkspaceDocument);

const request = (anchorParagraphId: string, writerDocument = writer()) => ({
  writerDocument, sourceDocument: grid(), kind: 'grid-range' as const,
  mode: 'Live' as const, anchorParagraphId, sourceObjectId: 'table-1', sourceSelector: 'A1:B2', now: 10,
});

describe('an embed is anchored at a paragraph that exists', () => {
  it('accepts the anchor of an existing paragraph', () => {
    const embed = createWriterWorkspaceEmbed(request('p-2'));
    expect(embed.anchorParagraphId).toBe('p-2');
    expect(embed.snapshot.type).toBe('table');
  });

  it('refuses an anchor whose paragraph is gone, with a message a user can act on', () => {
    // This used to succeed and produce an invisible embed.
    expect(() => createWriterWorkspaceEmbed(request('p-weg'))).toThrow(/existiert nicht mehr/u);
  });

  it('refuses every anchor when the document has no paragraphs at all', () => {
    expect(() => createWriterWorkspaceEmbed(request('p-1', writer([])))).toThrow(/existiert nicht mehr/u);
  });

  it('refuses an empty anchor before looking at the document', () => {
    expect(() => createWriterWorkspaceEmbed(request(''))).toThrow(/Absatzanker/u);
  });

  it('finds the paragraphs through a non-root text block too', () => {
    const document = writer();
    // The root id points elsewhere, so only the fallback scan can find the text block.
    const shuffled = { ...document, root_object_ids: ['nichts'] } as WorkspaceDocument;
    expect(createWriterWorkspaceEmbed(request('p-1', shuffled)).anchorParagraphId).toBe('p-1');
  });

  it('does not write anything when the anchor is refused', () => {
    const document = writer();
    expect(() => createWriterWorkspaceEmbed(request('p-weg', document))).toThrow();
    expect(document.writerData?.workspaceEmbeds).toBeUndefined();
  });

  it('keeps a refreshed embed on its anchor', () => {
    const embed = createWriterWorkspaceEmbed(request('p-2'));
    const base = writer();
    const withEmbed = { ...base, writerData: { ...base.writerData!, workspaceEmbeds: [embed] } };
    const changed = { ...grid(), version: 2 } as WorkspaceDocument;
    const refreshed = refreshWriterWorkspaceEmbeds(withEmbed, changed);
    expect(refreshed.updatedCount).toBe(1);
    expect(refreshed.document.writerData?.workspaceEmbeds?.[0]?.anchorParagraphId).toBe('p-2');
  });
});

describe('valid sources are found and projected', () => {
  it('offers open and stored documents of integrable kinds, never the Writer itself', () => {
    const candidates = projectWriterWorkspaceSourceCandidates(
      'writer-1',
      [writer(), grid(), { ...grid(), id: 'grid-2', title: 'Zweitgrid' } as WorkspaceDocument],
      [
        { id: 'writer-1', kind: 'Writer', title: 'Bericht', modified_at: 1 },
        { id: 'grid-1', kind: 'Grid', title: 'Zahlen', modified_at: 1 },
        { id: 'grid-3', kind: 'Grid', title: 'Nur gespeichert', modified_at: 1 },
        { id: 'notes-1', kind: 'Notes', title: 'Notizen', modified_at: 1 },
      ],
    );
    expect(candidates.map((candidate) => candidate.id)).toEqual(['grid-1', 'grid-2', 'grid-3']);
    expect(candidates.find((candidate) => candidate.id === 'grid-1')?.isOpen).toBe(true);
    expect(candidates.find((candidate) => candidate.id === 'grid-3')?.isOpen).toBe(false);
  });

  it('prefers the open document over the stored entry of the same id', () => {
    const candidates = projectWriterWorkspaceSourceCandidates('writer-1', [grid()], [
      { id: 'grid-1', kind: 'Grid', title: 'Zahlen (gespeichert)', modified_at: 1 },
    ]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.isOpen).toBe(true);
    expect(candidates[0]?.title).toBe('Zahlen');
  });

  it('offers nothing when there is no compatible source', () => {
    expect(projectWriterWorkspaceSourceCandidates('writer-1', [writer()], [])).toEqual([]);
  });
});
