// @vitest-environment happy-dom
// STATUS: PLATIN — The tab bar can give its height back to the page
//
// Shell ergonomics request from the M5 review: while writing, the open-document tab
// bar permanently costs vertical space. It is now collapsible, and the choice survives
// a re-render (the state belongs to the shell, not to the bar).
import { afterEach, describe, expect, it } from 'vitest';
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import { TabBar } from '../TabBar';

function documentWith(id: string, title: string): WorkspaceDocument {
  return {
    id,
    title,
    kind: 'Writer',
    created_at: 0,
    modified_at: 0,
    version: 1,
    theme_id: 'default',
    root_object_ids: [],
    objects: {},
  } as unknown as WorkspaceDocument;
}

const documents = [documentWith('doc-a', 'Bericht'), documentWith('doc-b', 'Notizen')];

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

function Harness({ initialCollapsed = false }: { initialCollapsed?: boolean }) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  return createElement(TabBar, {
    documents,
    activeDocId: 'doc-a',
    onSelectDoc: () => undefined,
    onCloseDoc: () => undefined,
    onCreateDoc: () => undefined,
    collapsed,
    onToggleCollapsed: () => setCollapsed((current) => !current),
  });
}

async function mount(initialCollapsed = false): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(Harness, { initialCollapsed }));
  });
  return container;
}

function bar(): HTMLElement {
  const element = container!.querySelector<HTMLElement>('[data-workspace-tabbar]');
  expect(element, 'die Tab-Leiste muss im DOM stehen').not.toBeNull();
  return element!;
}

afterEach(async () => {
  if (root) {
    await act(async () => { root!.unmount(); });
    root = null;
  }
  if (container) {
    container.remove();
    container = null;
  }
});

describe('shell — collapsible tab bar', () => {
  it('renders expanded by default with the full tab list', async () => {
    await mount();
    expect(bar().getAttribute('data-workspace-tabbar')).toBe('expanded');
    expect(container!.querySelector('[role="tablist"]')).not.toBeNull();
    expect(container!.querySelector('[data-workspace-tabbar-toggle="collapse"]')).not.toBeNull();
  });

  it('collapses to a slim strip and expands again, keeping the documents reachable', async () => {
    await mount();
    const toggle = container!.querySelector<HTMLButtonElement>('[data-workspace-tabbar-toggle="collapse"]')!;
    await act(async () => {
      toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(bar().getAttribute('data-workspace-tabbar')).toBe('collapsed');
    expect(bar().className).toContain('h-7');
    // The collapsed strip still names every open document and can switch to it.
    const tabs = Array.from(container!.querySelectorAll<HTMLElement>('[data-workspace-tab-id]'));
    expect(tabs.map((tab) => tab.getAttribute('data-workspace-tab-id'))).toEqual(['doc-a', 'doc-b']);
    expect(container!.querySelector('[role="tablist"]'), 'die volle Liste ist eingeklappt').toBeNull();

    const expand = container!.querySelector<HTMLButtonElement>('[data-workspace-tabbar-toggle="expand"]')!;
    await act(async () => {
      expand.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(bar().getAttribute('data-workspace-tabbar')).toBe('expanded');
    expect(container!.querySelector('[role="tablist"]')).not.toBeNull();
  });

  it('keeps a collapsed bar collapsed across re-renders', async () => {
    await mount(true);
    expect(bar().getAttribute('data-workspace-tabbar')).toBe('collapsed');
    // A re-render with the same state must not silently expand the bar.
    await act(async () => {
      root!.render(createElement(Harness, { initialCollapsed: true }));
    });
    expect(bar().getAttribute('data-workspace-tabbar')).toBe('collapsed');
  });
});
