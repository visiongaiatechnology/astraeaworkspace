// STATUS: PLATIN — Source contract: the embed states its state, and a dead link is not silent
//          (W-245, W-251, W-254)
//
// The decision itself is pinned by `writerEmbedPresence.test.ts`. This file pins that the block and the chain
// actually use it: the badge carries words instead of the internal enum value, the explanation is rendered,
// an action that cannot work is withdrawn, and the editor really hands the known source ids down.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const writer = path.resolve(here, '../../..');
const read = (relative) => readFileSync(path.resolve(writer, relative), 'utf8');
const code = (relative) => read(relative).replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, '');

const block = code('integrations/workspace/WriterWorkspaceEmbedBlock.tsx');
const editor = code('editor/WriterEditor.tsx');
const renderer = code('layout/pages/WriterPageRenderer.tsx');
const paper = code('layout/pages/WriterPagePaper.tsx');

describe('the block states its state instead of implying it', () => {
  it('asks the pure decision', () => {
    expect(block).toContain('resolveWriterWorkspaceEmbedState({ mode: embed.mode, presence: sourcePresence })');
  });

  it('replaces the internal enum value with words', () => {
    // The header used to render `{embed.mode}` — "Live" / "Snapshot", an internal token, and the two reasons
    // why an object "does not change" looked identical.
    expect(block).not.toContain('{embed.mode}</span>');
    expect(block).toContain('{state.badge}');
  });

  it('renders the explanation as text, not as colour', () => {
    expect(block).toContain('{state.detail && (');
    expect(block).toContain('role="status"');
    expect(block).toContain('data-writer-workspace-embed-detail={state.code}');
  });

  it('exposes the state for the guide and for tests', () => {
    expect(block).toContain('data-writer-workspace-embed-state={state.code}');
  });

  it('withdraws the action that cannot work', () => {
    expect(block).toContain('disabled={!state.canOpenSource}');
    expect(block).toContain('aria-disabled={!state.canOpenSource}');
    // …and says why, in the accessible name as well as in the visible sentence.
    expect(block).toContain('nicht verfügbar, die Quelldatei fehlt');
  });

  it('defaults to “nobody told me” rather than to “everything is fine”', () => {
    expect(block).toContain("sourcePresence = 'unknown'");
  });
});

describe('the chain really delivers the answer', () => {
  it('derives the known sources from the catalogue the dialog uses', () => {
    // One definition of "exists": the same projection the embed dialog offers as insertable sources.
    expect(editor).toContain('projectWriterWorkspaceSourceCandidates(document.id, workspaceDocuments, storedWorkspaceDocuments)');
  });

  it('passes the set through both intermediate components', () => {
    expect(editor).toContain('knownWorkspaceSourceIds={knownWorkspaceSourceIds}');
    expect(renderer).toContain('knownWorkspaceSourceIds?: ReadonlySet<string>;');
    expect(renderer).toContain('knownWorkspaceSourceIds={knownWorkspaceSourceIds}');
    expect(paper).toContain('knownWorkspaceSourceIds?: ReadonlySet<string>;');
  });

  it('turns membership into the presence the block expects, and keeps “unknown” honest', () => {
    expect(paper).toContain("knownWorkspaceSourceIds.has(embed.sourceDocumentId) ? 'available' : 'missing'");
    expect(paper).toContain(": 'unknown'");
    expect(paper).toContain('sourcePresence={');
  });

  it('does not leave the set in the pagination dependencies', () => {
    // It travels in the render path; putting it in the paginator deps would repaginate for a state change.
    // Extracted by index rather than by regex: my first attempt used `/}, \[([^\]]*)\]\);/u`, which is an
    // invalid pattern under the `u` flag and blew up the whole file instead of failing one test.
    const start = renderer.indexOf('}, [defaultLanguage');
    expect(start).toBeGreaterThan(0);
    const deps = renderer.slice(start, renderer.indexOf(']);', start));
    expect(deps).not.toContain('knownWorkspaceSourceIds');
  });
});
