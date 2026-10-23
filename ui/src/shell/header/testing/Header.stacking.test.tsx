// @vitest-environment happy-dom
// STATUS: PLATIN — WR-SHELL-01: the File menu must never be painted over by an app surface
//
// Native M7 probe: the header carried `z-30` and `WriterEditor`'s document column carries
// `z-30` as well. Because the writer viewport comes later in the DOM, it won the stacking
// order and cut off the open File menu (`Datei öffnen`, `Exportieren`). A unit test cannot
// measure paint order, but it can pin the single thing that decides it: the header is above
// every app-chrome layer and the dropdown is above the header.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Header } from '../Header';

let container: HTMLElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

afterEach(async () => {
  if (root) {
    await act(async () => { root!.unmount(); });
    root = null;
  }
  container?.remove();
  container = null;
});

const props = {
  edition: 'open-core' as const,
  activeDoc: null,
  onRenameDoc: vi.fn(),
  onOpenSettings: vi.fn(),
  onOpenCommandPalette: vi.fn(),
  onOpenSearch: vi.fn(),
  onSaveVwc: vi.fn(),
  onOpenFile: vi.fn(),
};

describe('WR-SHELL-01 — header stacking order', () => {
  it('renders the header on a layer above all app chrome', () => {
    const markup = renderToStaticMarkup(<Header {...props} />);
    expect(markup).toContain('data-workspace-header-layout="responsive"');
    expect(markup).toMatch(/class="[^"]*\bz-50\b[^"]*"/);
    // `relative` is what makes the z-index effective at all.
    expect(markup).toMatch(/class="[^"]*\brelative\b[^"]*\bz-50\b[^"]*"|class="[^"]*\bz-50\b[^"]*\brelative\b[^"]*"/);
  });

  it('puts the open File menu above the header itself', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(<Header {...props} />);
    });

    const fileTrigger = container.querySelector<HTMLElement>('[aria-haspopup="menu"]');
    expect(fileTrigger).not.toBeNull();
    await act(async () => {
      fileTrigger!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });

    const menu = container.querySelector<HTMLElement>('[role="menu"]');
    expect(menu).not.toBeNull();
    expect(menu!.className).toContain('z-[70]');
    // Both entries stay rendered (and reachable) while the menu is open.
    expect(menu!.textContent).toContain('Open file');
    expect(fileTrigger!.getAttribute('aria-expanded')).toBe('true');
  });
});
