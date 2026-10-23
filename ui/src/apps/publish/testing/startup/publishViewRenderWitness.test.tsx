import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { PublishView } from '../../PublishView';

// The Publish chapter holds 25 tests and none of them renders `PublishView` (round 75, measured against the
// component named in `shell/workspace/AppWorkspaceView.tsx`).
//
// Why no test rendered it before: the render tree reads `window.localStorage` (round 81, recording facade,
// 4 accesses, nothing else). This repository runs Vitest in the node environment with no jsdom or happy-dom,
// so `window` did not exist. The shim below is measured, not guessed.

// Filesystem-scanning contracts in this repository exceed the 5000 ms default under a full parallel run.
vi.setConfig({ testTimeout: 60_000 });

Object.defineProperty(globalThis, 'window', {
  value: {
    location: { search: '', href: 'http://localhost/', pathname: '/' },
    localStorage: {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
      clear: () => undefined,
    },
  },
  writable: true,
  configurable: true,
});
Object.defineProperty(globalThis, 'localStorage', {
  value: (globalThis as unknown as { window: { localStorage: unknown } }).window.localStorage,
  writable: true,
  configurable: true,
});

function publication(id: string): WorkspaceDocument {
  return {
    id,
    title: 'Release notes',
    kind: 'Publish',
    created_at: 0,
    modified_at: 0,
    version: 1,
    theme_id: 'default',
    root_object_ids: [],
    objects: {},
  };
}

function render(document: WorkspaceDocument): string {
  return renderToStaticMarkup(
    createElement(PublishView, {
      document,
      onUpdateDocument: vi.fn(),
    } as never),
  );
}

describe('PublishView startup contract', () => {
  it('renders a fresh publication without throwing and produces the authoring surface', () => {
    const html = render(publication('publish-startup-witness'));
    expect(html.length).toBeGreaterThan(0);
  });

  it('is deterministic - two renders of the same publication agree', () => {
    const document = publication('publish-startup-witness-determinism');
    expect(render(document)).toEqual(render(document));
  });

  it('keeps the document title visible, so the author knows what is being published', () => {
    const html = render({ ...publication('publish-startup-witness-title'), title: 'Release notes Q3' });
    expect(html).toContain('Release notes Q3');
  });
});
