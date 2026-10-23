// @vitest-environment happy-dom
// STATUS: GOLD — Present M1: selection/edit-mode state coherence (Round 18)
//
// The document is the persistence owner; the editor owns selection + the single edit mode. This file
// proves that both stay coherent across delete/undo/redo, slide switches and caret undo — including
// the DOM markers: no stale `data-present-object-selected` for an id that no longer exists, no
// transform handles on the wrong slide, no orphaned editor after a delete.
//
// Documented PR-008 contract used below: while the caret (textarea) has focus, Ctrl+Z is text undo
// and is NOT resolved as a document undo; outside the caret, Ctrl+Z is the document history.
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PresentSlide, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { PresentCanvas } from '../../PresentCanvas';

vi.setConfig({ testTimeout: 60_000 });

const textObject = (id: string, text: string, xPercent: number): Record<string, unknown> => ({
  id,
  kind: 'text',
  text,
  xPercent,
  yPercent: 20,
  widthPercent: 28,
  heightPercent: 18,
  fontSizePt: 22,
  fontWeight: 'semibold',
  color: '#ffffff',
  textAlign: 'left',
  opacity: 1,
  zIndex: 10,
});

function slideWith(id: string, sceneObjects: unknown[] = []): PresentSlide {
  return {
    id,
    title: '',
    subtitle: '',
    layout: 'blank',
    cards: [],
    speakerNotes: '',
    sceneObjects: sceneObjects as never,
  } as PresentSlide;
}

const SLIDE_ONE = slideWith('slide-1', [textObject('text-1', 'First text', 10), textObject('text-2', 'Second text', 55)]);
const SLIDE_TWO = slideWith('slide-2', [textObject('text-3', 'Other slide', 20)]);

function documentWith(slides: PresentSlide[]): WorkspaceDocument {
  return {
    id: 'present-selection-coherence',
    title: 'Present selection coherence',
    kind: 'Present',
    created_at: 0,
    modified_at: 0,
    version: 1,
    theme_id: 'default',
    root_object_ids: [],
    objects: {},
    presentData: { slides, theme: 'dark', aspectRatio: '16:9' },
  } as WorkspaceDocument;
}

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;
let latest: WorkspaceDocument | null = null;

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

async function mount(): Promise<HTMLElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(ControlledPresenter, { start: documentWith([SLIDE_ONE, SLIDE_TWO]) }));
  });
  return container;
}

async function settle(): Promise<void> {
  await act(async () => { await new Promise<void>((resolve) => { setTimeout(resolve, 0); }); });
}

function slides(): PresentSlide[] {
  return (latest?.presentData?.slides ?? []) as PresentSlide[];
}

function sceneObjectsOf(slideIndex: number): Array<Record<string, unknown>> {
  return (slides()[slideIndex]?.sceneObjects ?? []) as unknown as Array<Record<string, unknown>>;
}

function objectInDocument(id: string): Record<string, unknown> | undefined {
  return sceneObjectsOf(0).find((object) => object.id === id);
}

function textInDocument(id: string): string | undefined {
  return objectInDocument(id)?.text as string | undefined;
}

function sceneObjectElement(host: HTMLElement, id: string): HTMLElement | null {
  return host.querySelector<HTMLElement>(`[data-present-object-id="${id}"]`);
}

function selectedIdsInDom(host: HTMLElement): string[] {
  return Array.from(host.querySelectorAll<HTMLElement>('[data-present-object-id]'))
    .filter((element) => element.getAttribute('data-present-object-selected') === 'true')
    .map((element) => element.dataset.presentObjectId ?? '');
}

function handles(host: HTMLElement): HTMLElement[] {
  return Array.from(host.querySelectorAll<HTMLElement>('[data-present-handle]'));
}

function selectionStatus(host: HTMLElement): string {
  return host.querySelector<HTMLElement>('[data-present-selection-status="true"]')?.textContent?.trim() ?? '';
}

function editorFor(host: HTMLElement, id: string): HTMLTextAreaElement | null {
  return host.querySelector<HTMLTextAreaElement>(`[data-present-object-id="${id}"] textarea`);
}

async function pressKey(target: Element | Window, init: KeyboardEventInit): Promise<KeyboardEvent> {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  await act(async () => {
    target.dispatchEvent(event);
    await settle();
  });
  return event;
}

async function clickElement(target: Element): Promise<void> {
  await act(async () => {
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await settle();
  });
}

/**
 * happy-dom does not implement the browser's pointer-focus rule (a press moves focus to the hit
 * target). The tests that need the real focus/blur chain model it explicitly instead of relying on
 * a DOM behavior the environment does not have.
 */
async function focusElement(target: Element): Promise<void> {
  await act(async () => {
    (target as HTMLElement).focus();
    await settle();
  });
}

async function doubleClickElement(target: Element): Promise<void> {
  await act(async () => {
    target.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    await settle();
  });
}

async function typeIntoEditor(host: HTMLElement, id: string, value: string): Promise<HTMLTextAreaElement> {
  const editor = editorFor(host, id);
  if (!editor) throw new Error(`editor for ${id} not open`);
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(editor, value);
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
  });
  return editor;
}

describe('Present M1 — selection/edit-mode coherence (Round 18)', () => {
  it('Fall 1: delete + undo leaves no stale selection, no dead handles and no orphan editor', async () => {
    const host = await mount();
    await clickElement(sceneObjectElement(host, 'text-1')!);
    expect(selectedIdsInDom(host)).toEqual(['text-1']);
    expect(handles(host), 'Handles am selektierten Objekt').toHaveLength(9);

    // Delete the selected object.
    await pressKey(window, { key: 'Delete' });
    expect(objectInDocument('text-1'), 'Objekt gelöscht').toBeUndefined();
    expect(sceneObjectElement(host, 'text-1'), 'kein DOM mehr für die tote ID').toBeNull();
    expect(selectedIdsInDom(host), 'keine stale Selektionsmarkierung').toEqual([]);
    expect(handles(host), 'keine Handles an einer toten ID').toHaveLength(0);
    expect(editorFor(host, 'text-1'), 'kein Editor an einer toten ID').toBeNull();

    // Undo restores the object (document only — the selection is not resurrected, which is coherent).
    await pressKey(window, { key: 'z', ctrlKey: true });
    expect(objectInDocument('text-1'), 'Undo bringt das Objekt zurück').toBeDefined();
    expect(sceneObjectElement(host, 'text-1'), 'Objekt wieder gerendert').not.toBeNull();
    expect(selectedIdsInDom(host), 'wiederhergestelltes Objekt ist nicht selektiert').toEqual([]);
    expect(handles(host)).toHaveLength(0);

    // Re-selecting works.
    await clickElement(sceneObjectElement(host, 'text-1')!);
    expect(selectedIdsInDom(host)).toEqual(['text-1']);
    expect(handles(host)).toHaveLength(9);
  });

  it('Fall 2: Ctrl+Z in the caret is text undo (PR-008); outside it reverts the document text', async () => {
    const host = await mount();
    await doubleClickElement(sceneObjectElement(host, 'text-1')!);
    const editor = await typeIntoEditor(host, 'text-1', 'Edited while caret');
    expect(textInDocument('text-1')).toBe('Edited while caret');

    // While the caret has focus, Ctrl+Z must not fire the document undo (PR-008 contract).
    const inCaretUndo = await pressKey(editor, { key: 'z', ctrlKey: true });
    expect(inCaretUndo.defaultPrevented, 'Caret behält das native Text-Undo').toBe(false);
    expect(textInDocument('text-1'), 'kein Dokument-Undo im Caret').toBe('Edited while caret');

    // Escape leaves the edit mode; the caret disappears without touching the document.
    await pressKey(editor, { key: 'Escape' });
    expect(editorFor(host, 'text-1'), 'Editor nach Escape geschlossen').toBeNull();
    expect(textInDocument('text-1')).toBe('Edited while caret');

    // Outside the caret Ctrl+Z is the document undo and reverts the committed text.
    await pressKey(window, { key: 'z', ctrlKey: true });
    expect(textInDocument('text-1'), 'Dokument-Undo stellt den Originaltext wieder her').toBe('First text');
    expect(editorFor(host, 'text-1'), 'kein Editor auf einem zurückgerollten Commit').toBeNull();
    // The selection may stay on the (existing) object — it never points at a deleted state.
    expect(sceneObjectElement(host, 'text-1')).not.toBeNull();
    expect(selectedIdsInDom(host).every((id) => sceneObjectElement(host, id) !== null)).toBe(true);
  });

  it('Fall 3: deleting another object while one is in edit mode keeps that edit intact', async () => {
    const host = await mount();
    await doubleClickElement(sceneObjectElement(host, 'text-1')!);
    await typeIntoEditor(host, 'text-1', 'Editing first');
    expect(editorFor(host, 'text-1'), 'text-1 ist im Edit-Modus').not.toBeNull();

    // Select (and then delete) text-2: a real pointer press focuses the hit target, which blurs the
    // textarea and ends the single edit mode (PR-005). happy-dom lacks that focus rule, so the test
    // models it; the committed text-1 content must stay intact and nothing may crash.
    await focusElement(sceneObjectElement(host, 'text-2')!);
    await clickElement(sceneObjectElement(host, 'text-2')!);
    expect(selectedIdsInDom(host)).toEqual(['text-2']);
    expect(editorFor(host, 'text-1'), 'Escape durch Auswahlwechsel beendet den Editor').toBeNull();
    expect(textInDocument('text-1'), 'text-1-Inhalt bleibt erhalten').toBe('Editing first');

    await pressKey(window, { key: 'Delete' });
    expect(objectInDocument('text-2'), 'text-2 gelöscht').toBeUndefined();
    expect(textInDocument('text-1'), 'text-1 unbeschädigt').toBe('Editing first');
    expect(selectedIdsInDom(host)).toEqual([]);
    expect(handles(host)).toHaveLength(0);

    await pressKey(window, { key: 'z', ctrlKey: true });
    expect(objectInDocument('text-2'), 'Undo bringt text-2 zurück').toBeDefined();
    expect(textInDocument('text-2')).toBe('Second text');
    expect(textInDocument('text-1'), 'und text-1 bleibt ebenfalls intakt').toBe('Editing first');
    expect(sceneObjectElement(host, 'text-2')).not.toBeNull();
    expect(handles(host), 'keine Handles an einer nicht selektierten ID').toHaveLength(0);
  });

  it('Fall 4: slide switch does not leak selection or edit mode onto the other slide', async () => {
    const host = await mount();
    await clickElement(sceneObjectElement(host, 'text-1')!);
    expect(selectedIdsInDom(host)).toEqual(['text-1']);
    expect(handles(host)).toHaveLength(9);

    // Switch to slide 2.
    await pressKey(window, { key: 'PageDown' });
    expect(sceneObjectElement(host, 'text-3'), 'Slide 2 ist aktiv').not.toBeNull();
    expect(sceneObjectElement(host, 'text-1'), 'Slide-1-Objekte sind weg').toBeNull();
    expect(handles(host), 'kein Handle auf der falschen Folie').toHaveLength(0);
    expect(selectionStatus(host), 'Statuszeile behauptet keine Selektion auf Slide 2').toContain('No object selected');

    // Back to slide 1: the selection was cleared with the slide (documented behavior), so there is
    // no stale marker; re-selecting works and the content is untouched.
    await pressKey(window, { key: 'PageUp' });
    expect(sceneObjectElement(host, 'text-1')).not.toBeNull();
    expect(selectedIdsInDom(host), 'keine stale Auswahl nach Rückkehr').toEqual([]);
    expect(handles(host)).toHaveLength(0);
    await clickElement(sceneObjectElement(host, 'text-1')!);
    expect(selectedIdsInDom(host)).toEqual(['text-1']);
    expect(handles(host)).toHaveLength(9);

    // Undo after the navigation reverts the last document action only, not the slide state.
    await pressKey(window, { key: 'z', ctrlKey: true });
    expect(sceneObjectElement(host, 'text-1'), 'Undo zerstört die Folie nicht').not.toBeNull();
  });

  it('Fall 5: undo beyond the beginning is a no-op and never breaks the UI state', async () => {
    const host = await mount();
    const baseline = JSON.stringify(slides());

    // Empty history: undo must not throw and must not publish a changed document.
    await pressKey(window, { key: 'z', ctrlKey: true });
    expect(JSON.stringify(slides()), 'leere History: kein Dokument-Write').toBe(baseline);
    expect(sceneObjectElement(host, 'text-1')).not.toBeNull();

    // An open caret keeps its own undo; the document stays untouched.
    await doubleClickElement(sceneObjectElement(host, 'text-1')!);
    const editor = await typeIntoEditor(host, 'text-1', 'One commit');
    await pressKey(editor, { key: 'z', ctrlKey: true });
    expect(textInDocument('text-1'), 'Caret-Undo ändert das Dokument nicht').toBe('One commit');
    expect(editorFor(host, 'text-1'), 'Editor bleibt offen').not.toBeNull();

    // Outside the caret the first undo reverts the commit, the second one is a harmless no-op.
    await pressKey(editor, { key: 'Escape' });
    await pressKey(window, { key: 'z', ctrlKey: true });
    expect(textInDocument('text-1'), 'erster Undo revertiert den Commit').toBe('First text');
    await pressKey(window, { key: 'z', ctrlKey: true });
    expect(textInDocument('text-1'), 'zweiter Undo über den Anfang ist ein No-op').toBe('First text');
    expect(editorFor(host, 'text-1')).toBeNull();
    expect(sceneObjectElement(host, 'text-1')).not.toBeNull();
  });
});
