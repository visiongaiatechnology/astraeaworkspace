import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { WriterEditor } from '../../editor/WriterEditor';

// The Writer chapter holds 194 tests - the most of any chapter - and none of them renders `WriterEditor`
// (round 75). DEF-RE-001 was a behaviour of exactly this component: clicking into the empty page area had to
// place the caret. `resolveWriterPageClickTarget` is proven by the round-71 mutation check; this file covers
// the component that calls it.
//
// Why no test rendered it before: the render tree touches `window.location.search` and probes
// `window.__TAURI__`. This repository runs Vitest in the node environment with no jsdom or happy-dom, so
// `window` did not exist. A recording facade (round 80) showed those are the only properties touched, so a
// shim of exactly that shape is enough - measured, not guessed.

// Filesystem-scanning contracts in this repository exceed the 5000 ms default under a full parallel run.
vi.setConfig({ testTimeout: 60_000 });

// Installed before the component renders; `window` is absent in the node environment.
Object.defineProperty(globalThis, 'window', {
  value: { location: { search: '', href: 'http://localhost/', pathname: '/' } },
  writable: true,
  configurable: true,
});

function freshDocument(id: string): WorkspaceDocument {
  return {
    id,
    title: 'Untitled document',
    kind: 'Writer',
    created_at: 0,
    modified_at: 0,
    version: 1,
    theme_id: 'default',
    root_object_ids: [],
    objects: {},
  };
}

function renderWriter(document: WorkspaceDocument): string {
  return renderToStaticMarkup(
    createElement(WriterEditor, {
      document,
      onUpdateDocument: vi.fn(),
      onOpenDocument: vi.fn(),
      onOpenExternalUrl: vi.fn(),
    } as never),
  );
}

describe('WriterEditor startup contract', () => {
  it('renders a fresh empty document without throwing and produces the editing surface', () => {
    const html = renderWriter(freshDocument('writer-startup-witness'));
    expect(html.length).toBeGreaterThan(0);
  });

  it('is deterministic - two renders of the same document agree', () => {
    const document = freshDocument('writer-startup-witness-determinism');
    expect(renderWriter(document)).toEqual(renderWriter(document));
  });

  it('names the document in an accessible label, so the surface is reachable', () => {
    const html = renderWriter({ ...freshDocument('writer-startup-witness-label'), title: 'Bericht Q3' });
    expect(html).toContain('Bericht Q3');
  });

  // AST-0001 · Masterplan Zeile 117 fordert Maus- **und** Tastatursteuerung. Der Mausweg war immer da; der
  // Tastaturweg wurde in Runde 112 verdrahtet. Die Entscheidungslogik selbst ist durch die 15 Tests in
  // `writerKeyboardEntry.test.ts` belegt — hier wird geprüft, dass die **Verdrahtung** das DOM erreicht:
  // ohne `tabIndex` ist die Seite nicht fokussierbar und es gibt keinen Tastaturweg in ein leeres Dokument.
  //
  // ASTRAEA WRITER 50 V2 · M1 (WR-001/WR-010): the reachable element is now the **one**
  // rich-text surface that wraps the pages, not the paper body. That is the
  // improvement, not a regression: before, the body and every paragraph were
  // separate focus stops, so the first click focused a wrapper and left the user
  // without a visible caret. The contract "the document is reachable by keyboard
  // and the focus is visible" is unchanged and asserted against the new host.
  it('makes the document body keyboard reachable through the one rich-text surface (AST-0001)', () => {
    const html = renderWriter(freshDocument('writer-startup-witness-keyboard'));
    const surface = html.match(/<div[^>]*data-writer-rich-surface="true"[^>]*>/);
    expect(surface, 'the rich-text surface element must exist in the markup').not.toBeNull();
    expect(surface![0]).toContain('tabindex="0"');
    expect(surface![0]).toMatch(/contenteditable="true"/iu);
    expect(surface![0]).toContain('role="textbox"');
    // A single focus stop for the whole document, not one per paragraph fragment.
    expect((html.match(/data-writer-rich-surface="true"/g) ?? []).length).toBe(1);
    // Fokussierbar ist die halbe Miete. Der VGT-Standard (SECTION 12.1) verlangt im Gate
    // "Focus States sind sichtbar" - ein tabIndex ohne gestalteten Ring laesst den Nutzer nicht sehen,
    // wo er ist. Die Klasse folgt der Konvention des Baums (306 Vorkommen von focus-visible:ring-2).
    expect(surface![0]).toContain('focus-visible:ring-2');
  });
});
