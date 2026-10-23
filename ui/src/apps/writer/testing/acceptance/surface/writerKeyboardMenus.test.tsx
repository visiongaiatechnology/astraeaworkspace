// @vitest-environment happy-dom
// STATUS: PLATIN — Keyboard operability of the text menu and the toolbar menus (WR-025)
//
// The native M4 probe ended with "context menu and toolbar are mouse-only". These
// tests drive the real editor with real key events: `Shift+F10` / `ContextMenu` opens
// the text menu at the caret, the arrows walk it, a disclosure opens with `ArrowRight`,
// `Esc` closes it and the writing surface gets the focus back so typing continues where
// it stopped — plus the clipboard commands acting on the **marked range** (WR-021).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Paragraph, WorkspaceDocument } from '../../../../../shared/contracts/workspace';
import { WriterEditor } from '../../../editor/WriterEditor';
import { WriterFormattingToolbar } from '../../../formatting/toolbar/WriterFormattingToolbar';
import {
  readWriterSurfaceSelection,
  writeWriterSurfaceSelection,
} from '../../../editor/surface/writerDomModelAdapter';
import { resetWriterCaretController } from '../../../editing/caret/writerCaretController';

function paragraph(id: string, spans: Paragraph['spans']): Paragraph {
  return {
    id,
    style: { alignment: 'left', line_height: 1.5, space_before: 0, space_after: 0 },
    spans,
  };
}

function documentWith(id: string, paragraphs: Paragraph[]): WorkspaceDocument {
  const textBlockId = 'tb-' + id;
  return {
    id,
    title: 'Tastatur-Zeuge',
    kind: 'Writer',
    created_at: 0,
    modified_at: 0,
    version: 1,
    theme_id: 'default',
    root_object_ids: [textBlockId],
    objects: { [textBlockId]: { type: 'TextBlock', data: { id: textBlockId, paragraphs } } },
  } as WorkspaceDocument;
}

function readParagraphs(doc: WorkspaceDocument): Paragraph[] {
  for (const object of Object.values(doc.objects ?? {})) {
    const candidate = object as { type?: string; data?: { paragraphs?: Paragraph[] } };
    if (candidate.type === 'TextBlock' && Array.isArray(candidate.data?.paragraphs)) {
      return candidate.data!.paragraphs!;
    }
  }
  return [];
}

function texts(paragraphs: Paragraph[]): string[] {
  return paragraphs.map((item) => item.spans.map((span) => span.text).join(''));
}

interface Journal {
  readonly documents: WorkspaceDocument[];
}

function ControlledWriter({ start, journal }: { start: WorkspaceDocument; journal: Journal }) {
  const [document, setDocument] = useState<WorkspaceDocument>(start);
  return createElement(WriterEditor, {
    document,
    workspaceDocuments: [],
    onSelectSelectionType: () => undefined,
    onUpdateDocument: (next: WorkspaceDocument) => {
      journal.documents.push(next);
      setDocument(next);
    },
    onOpenDocument: () => undefined,
    onOpenExternalUrl: () => undefined,
  });
}

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;
let clipboardStore: Map<string, string> | null = null;

async function settle(hops = 3): Promise<void> {
  for (let hop = 0; hop < hops; hop += 1) {
    await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
  }
}

async function mount(paragraphs: Paragraph[]): Promise<{
  surface: HTMLElement;
  journal: Journal;
  initial: Paragraph[];
}> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const journal: Journal = { documents: [] };
  await act(async () => {
    root!.render(createElement(ControlledWriter, { start: documentWith('doc-keys', paragraphs), journal }));
  });
  const surface = container.querySelector<HTMLElement>('[data-writer-rich-surface="true"]');
  expect(surface, 'die Schreibfläche muss im DOM stehen').not.toBeNull();
  // In a real window the editing host has the focus before a shortcut arrives.
  await act(async () => {
    surface!.focus();
    await settle(1);
  });
  return { surface: surface!, journal, initial: paragraphs };
}

function current(journal: Journal, fallback: Paragraph[]): Paragraph[] {
  for (let index = journal.documents.length - 1; index >= 0; index -= 1) {
    const paragraphs = readParagraphs(journal.documents[index]!);
    if (paragraphs.length > 0) return paragraphs;
  }
  return fallback;
}

async function setCaret(surface: HTMLElement, paragraphId: string, offset: number): Promise<void> {
  await act(async () => {
    writeWriterSurfaceSelection(surface, {
      anchor: { paragraphId, offset },
      focus: { paragraphId, offset },
    });
    document.dispatchEvent(new Event('selectionchange'));
    await settle(1);
  });
}

async function press(target: HTMLElement, key: string, init: KeyboardEventInit = {}): Promise<void> {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
    await settle(2);
  });
}

const menu = (): HTMLElement | null => container!.querySelector<HTMLElement>('[data-writer-context-menu="open"]');
const menuItems = (): HTMLElement[] => Array.from(
  container!.querySelectorAll<HTMLElement>('[data-writer-context-menu="open"] [role="menuitem"]'),
).filter((item) => item.closest('[hidden]') === null);

beforeEach(() => {
  resetWriterCaretController();
  // A deterministic clipboard: the Writer reads `navigator.clipboard` at call time.
  clipboardStore = new Map();
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: async (text: string) => { clipboardStore!.set('text', text); },
      readText: async () => clipboardStore!.get('text') ?? '',
    },
  });
});

afterEach(async () => {
  if (root) {
    await act(async () => { root!.unmount(); });
    root = null;
  }
  if (container) {
    container.remove();
    container = null;
  }
  document.getSelection()?.removeAllRanges();
  Reflect.deleteProperty(navigator, 'clipboard');
});

describe('WR-025 — Shift+F10 and the ContextMenu key open the text menu', () => {
  it('opens at the caret, focuses the first command and walks with the arrows', async () => {
    const { surface } = await mount([paragraph('p1', [{ text: 'Hallo Welt' }])]);
    await setCaret(surface, 'p1', 5);

    await press(surface, 'F10', { shiftKey: true });
    expect(menu(), 'Shift+F10 öffnet das Kontextmenü').not.toBeNull();

    const items = menuItems();
    expect(items.length).toBeGreaterThan(3);
    // The first permitted command has the focus (and is the menu's single tab stop).
    expect(document.activeElement).toBe(items[0]);
    expect(items[0]!.tabIndex).toBe(0);
    expect(items[1]!.tabIndex).toBe(-1);

    await press(items[0]!, 'ArrowDown');
    expect(document.activeElement).toBe(items[1]);
    expect(items[1]!.tabIndex).toBe(0);
    expect(items[0]!.tabIndex).toBe(-1);
  });

  it('also opens on the dedicated ContextMenu key', async () => {
    const { surface } = await mount([paragraph('p1', [{ text: 'Hallo' }])]);
    await setCaret(surface, 'p1', 2);
    await press(surface, 'ContextMenu');
    expect(menu()).not.toBeNull();
  });

  it('opens the insert group with ArrowRight, closes it with ArrowLeft', async () => {
    const { surface } = await mount([paragraph('p1', [{ text: 'Hallo' }])]);
    await setCaret(surface, 'p1', 2);
    await press(surface, 'F10', { shiftKey: true });

    const disclosure = menuItems().find((item) => item.getAttribute('aria-expanded') === 'false');
    expect(disclosure, 'ein Disclosure-Eintrag muss vorhanden sein').toBeDefined();
    await press(disclosure!, 'ArrowRight');

    expect(disclosure!.getAttribute('aria-expanded')).toBe('true');
    const group = container!.querySelector<HTMLElement>('[data-writer-context-menu-group]');
    expect(group?.hasAttribute('hidden')).toBe(false);
    // Focus moved into the opened group.
    expect(group?.contains(document.activeElement)).toBe(true);

    await press(document.activeElement as HTMLElement, 'ArrowLeft');
    expect(disclosure!.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(disclosure);
  });

  it('closes on Esc, returns the focus to the surface and keeps typing at the caret', async () => {
    const { surface, journal, initial } = await mount([paragraph('p1', [{ text: 'Hallo' }])]);
    await setCaret(surface, 'p1', 5);

    await press(surface, 'F10', { shiftKey: true });
    expect(menu()).not.toBeNull();
    await press(document.activeElement as HTMLElement, 'Escape');
    expect(menu(), 'Esc schließt das Menü').toBeNull();
    expect(document.activeElement, 'der Fokus kehrt in die Schreibfläche zurück').toBe(surface);

    // Typing continues at the caret that was active before the menu opened.
    await press(surface, '!');
    expect(texts(current(journal, initial))).toEqual(['Hallo!']);
    expect(readWriterSurfaceSelection(surface)?.focus).toEqual({ paragraphId: 'p1', offset: 6 });
  });
});

describe('WR-021 — the context menu acts on the marked range', () => {
  it('cuts only the selection and writes it to the clipboard', async () => {
    const { surface, journal, initial } = await mount([paragraph('p1', [{ text: 'Hallo Welt Test' }])]);
    await act(async () => {
      writeWriterSurfaceSelection(surface, {
        anchor: { paragraphId: 'p1', offset: 6 },
        focus: { paragraphId: 'p1', offset: 10 },
      });
      document.dispatchEvent(new Event('selectionchange'));
      await settle(2);
    });

    await press(surface, 'F10', { shiftKey: true });
    const cut = menuItems().find((item) => (item.textContent ?? '').includes('Ausschneiden'));
    expect(cut, 'Ausschneiden muss im Menü stehen').toBeDefined();
    await act(async () => {
      cut!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await settle(4);
    });

    expect(clipboardStore?.get('text')).toBe('Welt');
    // Only the marked word is gone — the paragraph survives (WR-021).
    expect(texts(current(journal, initial))).toEqual(['Hallo  Test']);
  });

  it('pastes at the caret instead of overwriting the paragraph', async () => {
    const { surface, journal, initial } = await mount([paragraph('p1', [{ text: 'Hallo Welt' }])]);
    clipboardStore?.set('text', ' schöne');
    await setCaret(surface, 'p1', 5);

    await press(surface, 'F10', { shiftKey: true });
    const paste = menuItems().find((item) => (item.textContent ?? '').includes('Einfügen') && !(item.getAttribute('aria-controls')));
    expect(paste, 'Einfügen muss im Menü stehen').toBeDefined();
    await act(async () => {
      paste!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await settle(4);
    });

    expect(texts(current(journal, initial))).toEqual(['Hallo schöne Welt']);
  });
});

describe('WR-023 — the toolbar exposes labelled, keyboard-operable menus', () => {
  it('keeps every special action reachable inside the labelled menus', async () => {
    await mount([paragraph('p1', [{ text: 'Hallo' }])]);
    const triggers = Array.from(container!.querySelectorAll<HTMLElement>('[data-writer-toolbar-menu-trigger]'));
    expect(triggers.map((trigger) => trigger.getAttribute('data-writer-toolbar-menu-trigger')))
      .toEqual(['writer-toolbar-menu-insert', 'writer-toolbar-menu-format', 'writer-toolbar-menu-tools']);

    // Closed panels are `hidden`: no tab stop, no accessibility tree entry.
    for (const id of ['writer-toolbar-menu-insert', 'writer-toolbar-menu-format', 'writer-toolbar-menu-tools']) {
      const panel = container!.querySelector<HTMLElement>(`[data-writer-toolbar-menu="${id}"]`);
      expect(panel, `Panel ${id} muss existieren`).not.toBeNull();
      expect(panel!.hasAttribute('hidden')).toBe(true);
      expect(triggers.find((item) => item.getAttribute('data-writer-toolbar-menu-trigger') === id)!
        .getAttribute('aria-expanded')).toBe('false');
    }

    // The command surface is complete even while closed. The labels are localised,
    // so the assertions use the language-independent markers of the entries.
    const insert = container!.querySelector<HTMLElement>('[data-writer-toolbar-menu="writer-toolbar-menu-insert"]')!;
    const insertEntries = Array.from(insert.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    expect(insertEntries.length, 'Einfügen muss die Sonderaktionen vollständig enthalten').toBeGreaterThanOrEqual(12);
    expect(insert.querySelector('[data-writer-table-size-trigger="true"]'), 'Tabellenraster erreichbar').not.toBeNull();
    expect(insert.querySelector('[data-vgt-app-guide-anchor="Writer:embed"]'), 'Workspace-Einbettung erreichbar').not.toBeNull();
    const insertGlyphs = insert.textContent ?? '';
    for (const glyph of ['Ω', 'fn¹', '▶']) {
      expect(insertGlyphs.includes(glyph), `Einfügen muss "${glyph}" enthalten`).toBe(true);
    }
    // WR-034: the one hard-coded "▢" entry became seven labelled shape entries, one per
    // supported kind — the icon is now a real shape icon, not a placeholder glyph.
    const shapeActions = Array.from(insert.querySelectorAll<HTMLElement>('[data-writer-toolbar-menu-action^="insert-shape:"]'))
      .map((entry) => entry.getAttribute('data-writer-toolbar-menu-action'));
    expect(shapeActions).toEqual([
      'insert-shape:rectangle',
      'insert-shape:rounded-rectangle',
      'insert-shape:ellipse',
      'insert-shape:arrow',
      'insert-shape:line',
      'insert-shape:textbox',
      'insert-shape:callout',
    ]);

    const tools = container!.querySelector<HTMLElement>('[data-writer-toolbar-menu="writer-toolbar-menu-tools"]')!;
    const toolEntries = Array.from(tools.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    expect(toolEntries.length, 'Werkzeuge & Ansicht muss die Sonderaktionen enthalten').toBeGreaterThanOrEqual(5);

    const format = container!.querySelector<HTMLElement>('[data-writer-toolbar-menu="writer-toolbar-menu-format"]')!;
    expect(format.querySelector('[data-writer-toolbar-menu-group]'), 'Format hat beschriftete Gruppen').not.toBeNull();
  });
  it('opens with ArrowDown, moves with the arrows and closes with Esc', async () => {
    await mount([paragraph('p1', [{ text: 'Hallo' }])]);
    const trigger = container!.querySelector<HTMLElement>('[data-writer-toolbar-menu-trigger="writer-toolbar-menu-insert"]')!;
    const panel = container!.querySelector<HTMLElement>('[data-writer-toolbar-menu="writer-toolbar-menu-insert"]')!;

    await press(trigger, 'ArrowDown');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(panel.hasAttribute('hidden')).toBe(false);
    const entries = Array.from(panel.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    expect(document.activeElement).toBe(entries[0]);

    await press(document.activeElement as HTMLElement, 'ArrowDown');
    expect(document.activeElement).toBe(entries[1]);

    await press(document.activeElement as HTMLElement, 'Escape');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(panel.hasAttribute('hidden')).toBe(true);
    expect(document.activeElement, 'Esc gibt den Fokus an den Auslöser zurück').toBe(trigger);
  });
});

describe('WR-023 — the toolbar component stays renderable without state', () => {
  it('renders the labelled menus in static markup', () => {
    const props = {
      paragraph: paragraph('p1', [{ text: 'Hallo' }]),
      styles: [],
      onApplyStyle: () => undefined,
      onToggleSpan: () => undefined,
      onUpdateStyle: () => undefined,
      onSetFontFamily: () => undefined,
      onSetFontSizePt: () => undefined,
      onSetAlignment: () => undefined,
      onSetLineSpacing: () => undefined,
      onSetTextColor: () => undefined,
      onSetHighlightColor: () => undefined,
      onClearFormatting: () => undefined,
      onCopyFormat: () => undefined,
      onApplyCopiedFormat: () => undefined,
      onTransformCase: () => undefined,
      onToggleList: () => undefined,
      onInsertTable: () => undefined,
      onInsertImage: () => undefined,
      onInsertEquation: () => undefined,
      onOpenSymbolsModal: () => undefined,
      onOpenCitationModal: () => undefined,
      onOpenFootnoteModal: () => undefined,
      onOpenBookmarkModal: () => undefined,
      onOpenMailMergeModal: () => undefined,
      onOpenPageSetup: () => undefined,
      onInsertLineBreak: () => undefined,
      onInsertPageBreak: () => undefined,
      onInsertColumnBreak: () => undefined,
      onInsertSectionBreak: () => undefined,
      onUndo: () => undefined,
      onRedo: () => undefined,
      canUndo: true,
      canRedo: false,
    } as unknown as React.ComponentProps<typeof WriterFormattingToolbar>;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root!.render(createElement(WriterFormattingToolbar, props));
    });
    const html = container.innerHTML;
    expect(html).toContain('data-writer-toolbar-menu-trigger="writer-toolbar-menu-insert"');
    expect(html).toContain('data-writer-toolbar-menu-trigger="writer-toolbar-menu-format"');
    expect(html).toContain('data-writer-toolbar-menu-trigger="writer-toolbar-menu-tools"');
  });
});
