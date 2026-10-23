// @vitest-environment happy-dom
// STATUS: PLATIN — PR-008 (Present M1): Ctrl+Z belongs to the caret while typing
//
// Measured contract change of this milestone (`presentEditorCommands.ts`): inside a focused text
// field the resolver returns `null` for Ctrl+Z/Y, so the document history must NOT undo the whole
// slide operation while the user expects native text undo. Outside the caret the document history
// keeps the keys. This witness observes the **document**, not the resolver unit.
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PresentSlide, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { PresentCanvas } from '../../PresentCanvas';

vi.setConfig({ testTimeout: 60_000 });

const STAGE = { width: 960, height: 540 };

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;
let latest: WorkspaceDocument | null = null;
let originalRect: typeof Element.prototype.getBoundingClientRect;

function documentWithText(): WorkspaceDocument {
  return {
    id: 'present-pr008',
    title: 'PR-008',
    kind: 'Present',
    created_at: 0,
    modified_at: 0,
    version: 1,
    theme_id: 'default',
    root_object_ids: [],
    objects: {},
    presentData: {
      slides: [{
        id: 'slide-1', title: '', subtitle: '', layout: 'blank', cards: [], speakerNotes: '',
        sceneObjects: [{
          id: 'text-1', kind: 'text',
          xPercent: 20, yPercent: 20, widthPercent: 40, heightPercent: 20,
          text: 'Hallo', fontSizePt: 24, fontWeight: 'normal', color: '#ffffff', textAlign: 'left',
          opacity: 1, zIndex: 20,
        }],
      } as PresentSlide],
      theme: 'dark',
      aspectRatio: '16:9',
    },
  } as WorkspaceDocument;
}

afterEach(async () => {
  Element.prototype.getBoundingClientRect = originalRect;
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

async function mount(): Promise<HTMLElement> {
  originalRect = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (): DOMRect {
    return {
      x: 0, y: 0, width: STAGE.width, height: STAGE.height,
      top: 0, left: 0, right: STAGE.width, bottom: STAGE.height,
      toJSON: () => ({}),
    } as DOMRect;
  };
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(ControlledPresenter, { start: documentWithText() }));
  });
  return container;
}

function text(): string {
  const objects = (latest?.presentData?.slides[0]?.sceneObjects ?? []) as unknown as Array<Record<string, unknown>>;
  return String(objects.find((object) => object.id === 'text-1')?.text ?? '');
}

async function flush(ms = 40): Promise<void> {
  await act(async () => { await new Promise<void>((resolve) => { setTimeout(resolve, ms); }); });
}

async function enterEditMode(host: HTMLElement): Promise<HTMLTextAreaElement> {
  const object = host.querySelector<HTMLElement>('[data-present-object-id="text-1"]');
  expect(object).not.toBeNull();
  await act(async () => {
    object!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
  });
  await flush();
  const editor = host.querySelector<HTMLTextAreaElement>('[data-present-object-id="text-1"] textarea');
  expect(editor, 'Doppelklick öffnet den Editor').not.toBeNull();
  return editor!;
}

describe('PR-008 — Ctrl+Z inside the caret vs. outside', () => {
  it('does not run the document history while the caret is in the text field', async () => {
    const host = await mount();
    const editor = await enterEditMode(host);

    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
    await act(async () => {
      setter?.call(editor, 'Hallo Welt');
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await flush();
    expect(text(), 'der Text ist im Dokument').toBe('Hallo Welt');

    // Ctrl+Z inside the caret: the field owns the key, so the slide model keeps the new text.
    await act(async () => {
      editor.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'z', ctrlKey: true, bubbles: true, cancelable: true,
      }));
    });
    await flush();
    expect(text(), 'das Dokument-Undo greift im Caret NICHT').toBe('Hallo Welt');
  });

  it('keeps the document history for Ctrl+Z outside the caret', async () => {
    const host = await mount();
    const editor = await enterEditMode(host);
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
    await act(async () => {
      setter?.call(editor, 'Hallo Welt');
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await flush();
    expect(text()).toBe('Hallo Welt');

    // Leave the field, then undo from the canvas: the commit is reverted.
    await act(async () => {
      editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    await flush();
    const stage = host.querySelector<HTMLElement>('[data-present-stage="true"]');
    expect(stage).not.toBeNull();
    await act(async () => {
      stage!.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'z', ctrlKey: true, bubbles: true, cancelable: true,
      }));
    });
    await flush(80);
    expect(text(), 'außerhalb des Carets macht Strg+Z das Edit rückgängig').toBe('Hallo');
  });
});
