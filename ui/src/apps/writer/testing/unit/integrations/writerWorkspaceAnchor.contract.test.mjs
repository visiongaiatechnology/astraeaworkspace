// STATUS: PLATIN — Source contract: an anchor is checked, and a refused insert says why
//
// W-255: an embed anchored to a paragraph that no longer exists was stored, counted and **never
// rendered** — the four sibling features (images, tables, equations, media objects) all have an
// "unanchored" fallback, embeds had none. W-257: the reference-insert handler called the factory
// without a try/catch, so a refusal escaped the click handler uncaught.
//
// A unit test proves the factory refuses a stale anchor; what it cannot see is that the check runs
// **before** the snapshot is built (so nothing is written) and that the click surfaces the message.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFileSync(path.resolve(here, relative), 'utf8');

const integration = read('../../../public/workspace/writerWorkspaceIntegration.ts');
const modal = read('../../../integrations/grid/WriterGridEmbedModal.tsx');
const pagePaper = read('../../../layout/pages/WriterPagePaper.tsx');
const specialBlocks = read('../../../editor/blocks/WriterSpecialBlocks.tsx');

const createBlock = () => integration.slice(
  integration.indexOf('export function createWriterWorkspaceEmbed'),
  integration.indexOf('export function appendWriterWorkspaceEmbed'),
);

describe('the anchor is checked before anything is written', () => {
  it('validates against the document paragraphs', () => {
    expect(integration).toContain('function writerParagraphIds(document: WorkspaceDocument): Set<string> {');
    expect(createBlock()).toContain('if (!writerParagraphIds(request.writerDocument).has(request.anchorParagraphId)) {');
    expect(createBlock()).toContain('Der gewählte Absatz existiert nicht mehr.');
  });

  it('checks the anchor before building the snapshot', () => {
    const block = createBlock();
    const check = block.indexOf('existiert nicht mehr');
    // W-316 moved the snapshot behind the per-snapshot budget assertion, so the call is no longer the
    // first token of a `const snapshot = …` line. The property this test cares about is the order, so
    // it matches the call itself and still requires the anchor check to come first.
    const snapshot = block.indexOf('extractWriterWorkspaceSnapshot(');
    expect(check).toBeGreaterThan(-1);
    expect(snapshot).toBeGreaterThan(check);
  });

  it('applies the snapshot budget where the snapshot is built (W-316)', () => {
    // The Writer's own creation path must not hand an unbounded snapshot to the document.
    const block = createBlock();
    expect(block).toContain('assertWorkspaceEmbedSnapshotBudget(extractWriterWorkspaceSnapshot(');
  });

  it('finds the paragraphs the way the rest of the application does', () => {
    // Root text block first, then any text block — the same order as the portable export.
    expect(integration).toContain('.find((object) => object?.type === \'TextBlock\');');
    expect(integration).toContain('Object.values(document.objects).find((object) => object.type === \'TextBlock\')');
  });
});

describe('the siblings still show what embeds cannot', () => {
  it('keeps the unanchored fallback for images, tables and equations', () => {
    // The comparison that produced the finding: those four have a fallback, embeds do not.
    expect(specialBlocks).toContain('const unanchoredImages = images.filter(');
    expect(specialBlocks).toContain('const unanchoredTables = tables.filter(');
    expect(specialBlocks).toContain('const unanchoredEquations = equations.filter(');
  });

  it('renders an embed only inside its anchor paragraph — which is why the check matters', () => {
    expect(pagePaper).toContain('.filter((embed) => embed.anchorParagraphId === p.id)');
    // There is still no unanchored surface for embeds: that part stays open (W-256).
    expect(pagePaper).not.toContain('unanchoredEmbeds');
  });
});

describe('a refused insert reports instead of escaping', () => {
  it('catches the factory error in the reference handler', () => {
    const handler = modal.slice(
      modal.indexOf('const handleInsertReference'),
      modal.indexOf('const handleInsertGridTable'),
    );
    expect(handler).toContain('try {');
    expect(handler).toContain('} catch (error: unknown) {');
    expect(handler).toContain('setInsertError(error instanceof Error ? error.message :');
    // The dialog must not close on a failure.
    expect(handler.indexOf('onClose();')).toBeGreaterThan(handler.indexOf('setInsertError(null);'));
  });

  it('shows the message as an alert', () => {
    expect(modal).toContain('{insertError && <div role="alert"');
  });
});

describe('the preview shows the content, not only its type', () => {
  it('renders the real embed block instead of a second preview renderer', () => {
    // W-261: the preview was computed and then discarded; the dialog showed title, uri and snapshot
    // type. Rendering the real block means the preview is the same view as the result.
    expect(modal).toContain("import { WriterWorkspaceEmbedBlock } from '../workspace/WriterWorkspaceEmbedBlock';");
    expect(modal).toContain('<WriterWorkspaceEmbedBlock embed={preview.embed} readOnly />');
    expect(modal).toContain('data-writer-workspace-embed-preview={preview.embed.id}');
  });

  it('keeps the delete button out of the dialog', () => {
    // `readOnly` is what suppresses it inside the block.
    expect(modal).toContain('<WriterWorkspaceEmbedBlock embed={preview.embed} readOnly />');
  });
});
