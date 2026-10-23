// @vitest-environment happy-dom
// STATUS: GOLD — Present Runde 42: the editor start flow opens the monitor dialog first and keeps the
// existing presenter mode as the explicit single-screen path.
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PresentSlide, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { PresentCanvas } from '../../PresentCanvas';

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

vi.setConfig({ testTimeout: 30_000 });

const SLIDES: PresentSlide[] = [
  {
    id: 'slide-1',
    title: 'Opening',
    subtitle: '',
    layout: 'blank',
    speakerNotes: '',
  } as PresentSlide,
  {
    id: 'slide-2',
    title: 'Closing',
    subtitle: '',
    layout: 'blank',
    speakerNotes: '',
  } as PresentSlide,
];

function deckDocument(): WorkspaceDocument {
  return {
    id: 'present-start-flow',
    title: 'Start flow',
    kind: 'Present',
    created_at: 0,
    modified_at: 0,
    version: 1,
    theme_id: 'default',
    root_object_ids: [],
    objects: {},
    presentData: { slides: SLIDES, theme: 'dark', aspectRatio: '16:9' },
  } as WorkspaceDocument;
}

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
    root = null;
  }
  container?.remove();
  container = null;
});

async function mountCanvas(): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(createElement(PresentCanvas, {
      document: deckDocument(),
      onUpdateDocument: vi.fn(),
      onSelectSelectionType: vi.fn(),
      workspaceDocuments: {},
    } as never));
  });
  await act(async () => undefined);
  return container;
}

function findButton(element: HTMLElement, label: string): HTMLButtonElement | null {
  return Array.from(element.querySelectorAll('button'))
    .find((button) => button.textContent?.trim() === label) as HTMLButtonElement | null;
}

describe('Present editor start flow', () => {
  it('opens the display setup dialog instead of jumping straight into presenter mode', async () => {
    const element = await mountCanvas();
    const startButton = findButton(element, 'Present Slides');
    expect(startButton).not.toBeNull();
    await act(async () => startButton?.click());

    expect(element.querySelector('[data-present-start-dialog="true"]')).not.toBeNull();
    // happy-dom has no native bridge: the dialog must state that and keep single-screen available.
    expect(element.querySelector('[data-present-native-unavailable="true"]')).not.toBeNull();
    expect(document.querySelector('[role="dialog"][aria-label="Presentation mode"]')).toBeNull();
  });

  it('starts the existing presenter mode from the single-screen option', async () => {
    const element = await mountCanvas();
    await act(async () => findButton(element, 'Present Slides')?.click());
    const submit = element.querySelector('[data-present-start-submit="true"]');
    expect(submit?.getAttribute('data-present-start-mode')).toBe('single');
    await act(async () => {
      if (submit instanceof HTMLElement) submit.click();
    });
    expect(element.querySelector('[data-present-start-dialog="true"]')).toBeNull();
    expect(document.querySelector('[role="dialog"][aria-label="Presentation mode"]')).not.toBeNull();
  });

  it('closes the dialog with Escape without starting anything', async () => {
    const element = await mountCanvas();
    await act(async () => findButton(element, 'Present Slides')?.click());
    const panel = element.querySelector('[data-present-start-dialog="true"]') as HTMLElement | null;
    expect(panel).not.toBeNull();
    await act(async () => {
      panel?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    expect(element.querySelector('[data-present-start-dialog="true"]')).toBeNull();
    expect(document.querySelector('[role="dialog"][aria-label="Presentation mode"]')).toBeNull();
  });
});
