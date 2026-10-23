// @vitest-environment happy-dom
// STATUS: GOLD — Round 43: the Whiteboard "More tools" row is a real, inline disclosure.
//
// The old toolbar had `<details>` popovers that painted over the canvas and the ruler strip. The rebuilt
// toolbar keeps the secondary row inline (under the primary row) and toggles it with a chevron button:
//   - aria-expanded/aria-controls on the toggle, data-open on the row,
//   - state is deliberately session-local React state (no localStorage): toolbar preferences must not
//     become a second storage channel next to the central workspace envelope,
//   - collapsed rows are display:none but keep all actions/handlers in the DOM.
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceLocaleProvider } from '../../../../shell/localization/workspaceLocale';
import { WhiteboardToolbar } from '../../toolbar/WhiteboardToolbar';

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

function props() {
  return {
    activeTool: 'select' as const,
    setActiveTool: vi.fn(),
    selectedStickyColor: 'yellow' as const,
    setSelectedStickyColor: vi.fn(),
    selectedItemId: 'item-1',
    onDeleteSelected: vi.fn(),
    onExportPNG: vi.fn(),
    onRequestImage: vi.fn(),
    onOpenObjectPalette: vi.fn(),
    onExportToSlide: vi.fn(),
    onOpenInteropModal: vi.fn(),
    onOpenDrawModal: vi.fn(),
    canUndo: true,
    canRedo: true,
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    setConnectorStartId: vi.fn(),
    showToast: vi.fn(),
  };
}

async function mount(): Promise<HTMLElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(WorkspaceLocaleProvider, null, createElement(WhiteboardToolbar, props())));
  });
  return container;
}

async function unmount(): Promise<void> {
  await act(async () => { root?.unmount(); });
  root = null;
  container?.remove();
  container = null;
  document.body.innerHTML = '';
}

afterEach(async () => { await unmount(); });

describe('Whiteboard toolbar More disclosure (Round 43)', () => {
  it('toggles the inline More row with aria state and keeps every action in the DOM', async () => {
    const host = await mount();
    const toggle = host.querySelector<HTMLButtonElement>('[data-vgt-whiteboard-more-toggle="true"]')!;
    const moreRow = host.querySelector<HTMLElement>('[data-vgt-whiteboard-more="true"]')!;
    expect(toggle, 'More toggle rendered').not.toBeNull();
    expect(toggle.getAttribute('aria-expanded'), 'startet eingeklappt').toBe('false');
    expect(moreRow.dataset.open).toBe('false');
    expect(toggle.getAttribute('aria-controls'), 'kontrolliert die More-Zeile').toBe(moreRow.id);

    await act(async () => { toggle.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(toggle.getAttribute('aria-expanded'), 'aufgeklappt').toBe('true');
    expect(moreRow.dataset.open).toBe('true');

    // Every action stayed in the DOM while collapsed and is still wired.
    expect(moreRow.querySelectorAll('[data-vgt-whiteboard-action]').length, 'Aktionen bleiben im DOM').toBeGreaterThan(4);

    await act(async () => { toggle.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('starts collapsed again on a fresh mount (no hidden second storage channel)', async () => {
    const host = await mount();
    const toggle = host.querySelector<HTMLButtonElement>('[data-vgt-whiteboard-more-toggle="true"]')!;
    await act(async () => { toggle.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    await unmount();
    const remounted = await mount();
    const freshToggle = remounted.querySelector<HTMLButtonElement>('[data-vgt-whiteboard-more-toggle="true"]')!;
    expect(freshToggle.getAttribute('aria-expanded'), 'kein persistierter UI-Zustand').toBe('false');
  });
});
