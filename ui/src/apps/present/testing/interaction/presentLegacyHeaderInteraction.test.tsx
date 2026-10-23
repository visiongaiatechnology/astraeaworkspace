// @vitest-environment happy-dom
// STATUS: PLATIN — PR-002 (Present M1): the legacy header is gated by stored content and editable
//
// The audit kept PR-002 at PARTIAL because the header gate was only covered by a static render
// test. This witness drives the interaction: a deck **with** stored legacy content renders the
// three header fields and typing into them publishes the change; a blank deck renders none.
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PresentSlide, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { PresentCanvas } from '../../PresentCanvas';

vi.setConfig({ testTimeout: 60_000 });

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;
let latest: WorkspaceDocument | null = null;

function presentation(slide: Partial<PresentSlide>): WorkspaceDocument {
  return {
    id: 'present-legacy-header',
    title: 'Legacy Header',
    kind: 'Present',
    created_at: 0,
    modified_at: 0,
    version: 1,
    theme_id: 'default',
    root_object_ids: [],
    objects: {},
    presentData: {
      slides: [{
        id: 'slide-1', title: '', subtitle: '', category: '', layout: 'blank', cards: [], speakerNotes: '',
        sceneObjects: [],
        ...slide,
      } as PresentSlide],
      theme: 'dark',
      aspectRatio: '16:9',
    },
  } as WorkspaceDocument;
}

afterEach(async () => {
  if (root) {
    await act(async () => { root!.unmount(); });
    root = null;
  }
  container?.remove();
  container = null;
  latest = null;
});

function ControlledPresenter({ start }: { start: WorkspaceDocument }) {
  const [document, setDocument] = useState<WorkspaceDocument>(start);
  latest = document;
  return createElement(PresentCanvas, {
    document,
    onUpdateDocument: (next: WorkspaceDocument) => setDocument(next),
    workspaceDocuments: [],
    networkCapability: 'offline',
    keyVaultUnlocked: false,
    onSelectSelectionType: vi.fn(),
  } as never);
}

async function mount(slide: Partial<PresentSlide>): Promise<HTMLElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(ControlledPresenter, { start: presentation(slide) }));
  });
  return container;
}

function slideOf(): PresentSlide {
  return latest!.presentData!.slides[0]!;
}

describe('PR-002 — legacy header only with stored content, and it is editable', () => {
  it('renders the header fields for a deck with stored legacy content', async () => {
    const host = await mount({
      layout: 'cards',
      title: 'Quartalsbericht',
      subtitle: 'Q3 2026',
      category: 'Astraea',
      cards: [{ id: 'card-1', title: 'Thema', description: 'Beschreibung' }],
    });
    const header = host.querySelector('[data-present-legacy-header="true"]');
    expect(header, 'gespeicherter Legacy-Inhalt zeigt den Header').not.toBeNull();
    const inputs = header!.querySelectorAll('input[type="text"]');
    expect(inputs).toHaveLength(3);
    expect((inputs[1] as HTMLInputElement).value).toBe('Quartalsbericht');
  });

  it('writes a header edit into the document through the one slide mutation', async () => {
    const host = await mount({ layout: 'cards', title: 'Quartalsbericht', cards: [] });
    const titleInput = host.querySelectorAll<HTMLInputElement>('[data-present-legacy-header="true"] input')[1]!;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    await act(async () => {
      setter?.call(titleInput, 'Jahresbericht');
      titleInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => { await new Promise<void>((resolve) => { setTimeout(resolve, 30); }); });
    expect(slideOf().title, 'der Titel geht über onUpdateSlide ins Dokument').toBe('Jahresbericht');
  });

  it('keeps a blank deck clean — no empty legacy inputs, but a restrained hint', async () => {
    const host = await mount({ layout: 'blank' });
    expect(host.querySelector('[data-present-legacy-header="true"]'), 'keine leeren Platzhalter-Inputs').toBeNull();
    expect(host.querySelector('[data-present-blank-hint="true"]'), 'zurückhaltender Blank-Hinweis').not.toBeNull();
    expect(host.querySelectorAll('input[type="text"]')).toHaveLength(0);
  });

  it('follows the stored content, not the layout value', async () => {
    const host = await mount({ layout: 'blank', subtitle: 'gespeicherter Untertitel', cards: [] });
    const header = host.querySelector('[data-present-legacy-header="true"]');
    expect(header, 'gespeicherter Inhalt gewinnt gegen layout=blank').not.toBeNull();
    expect(host.querySelector('[data-present-blank-hint="true"]')).toBeNull();
  });
});
