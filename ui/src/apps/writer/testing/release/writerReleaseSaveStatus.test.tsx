// @vitest-environment happy-dom
// STATUS: PLATIN — Release 0.1: ein fehlgeschlagenes Speichern bleibt sichtbar,
// egal in welchem Ansichtsmodus der Nutzer gerade schreibt.
//
// Befund beim Release-Audit: `WriterEditor` blendete den Speicher-Status zusammen mit
// der Werkzeugleiste im Fokus-Modus aus (`state.viewMode !== 'focus'`). Damit war ein
// Schreibfehler beim konzentrierten Schreiben **unsichtbar** — das Dokument blieb zwar
// dirty, aber niemand sagte es dem Nutzer. Fokus-Modus ist eine Anzeige-Option, kein
// Grund, eine Datenverlust-Warnung zu verstecken.
//
// Der Zeuge mountet den echten `WriterEditor` mit den Props, die die Shell liefert
// (`saveStatus`, `saveFailure`), schaltet über die echte Werkzeugleiste in den
// Fokus-Modus und prüft, dass der Alarm dort weiterhin im DOM steht und dass
// Weitertippen das Dokument weiterhin ändert (nichts wird still verworfen).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Paragraph, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { WriterEditor } from '../../editor/WriterEditor';
import { writeWriterSurfaceSelection } from '../../editor/surface/writerDomModelAdapter';
import { resetWriterCaretController } from '../../editing/caret/writerCaretController';
import type { WriterEditorProps } from '../../types';

vi.setConfig({ testTimeout: 30_000 });

function makeParagraph(id: string, text: string): Paragraph {
  return {
    id,
    style: { alignment: 'left', line_height: 1.5, space_before: 0, space_after: 0 },
    spans: [{ text }],
  };
}

function documentWith(id: string, paragraphs: Paragraph[]): WorkspaceDocument {
  const textBlockId = 'tb-' + id;
  return {
    id,
    title: 'Speicherstatus-Zeuge',
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

interface Journal {
  readonly documents: WorkspaceDocument[];
}

function ControlledWriter({
  start,
  journal,
  saveStatus,
  saveFailure,
}: {
  start: WorkspaceDocument;
  journal: Journal;
  saveStatus?: WriterEditorProps['saveStatus'];
  saveFailure?: WriterEditorProps['saveFailure'];
}) {
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
    saveStatus,
    saveFailure,
  });
}

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

async function settle(hops = 4): Promise<void> {
  for (let hop = 0; hop < hops; hop += 1) {
    await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
  }
}

async function mount(
  journal: Journal,
  options: { saveStatus?: WriterEditorProps['saveStatus']; saveFailure?: WriterEditorProps['saveFailure'] } = {},
): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(ControlledWriter, {
      start: documentWith('save-status', [makeParagraph('p1', 'Text')]),
      journal,
      ...options,
    }));
  });
}

async function click(target: ParentNode, selector: string): Promise<HTMLElement> {
  const element = target.querySelector<HTMLElement>(selector);
  expect(element, `Element ${selector} muss existieren`).not.toBeNull();
  await act(async () => {
    element!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await settle(2);
  });
  return element!;
}

async function enterFocusMode(): Promise<void> {
  await click(container!, '[data-writer-toolbar-menu-trigger="writer-toolbar-menu-tools"]');
  await click(container!, '[data-writer-view-mode="focus"]');
  // Der Fokus-Modus entfernt die Werkzeugleiste — das ist der sichtbare Beweis, dass
  // der Wechsel wirklich stattgefunden hat.
  expect(container!.querySelector('[data-writer-toolbar-menu-trigger="writer-toolbar-menu-tools"]')).toBeNull();
}

beforeEach(() => {
  resetWriterCaretController();
  try {
    window.localStorage.clear();
  } catch {
    // kein Storage in dieser Umgebung: für den Fall irrelevant
  }
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
});

describe('Release 0.1 — Speicherfehler werden nicht versteckt', () => {
  it('zeigt den klassifizierten Grund im normalen Modus als Alarm', async () => {
    await mount({ documents: [] }, {
      saveStatus: 'error',
      saveFailure: { code: 'storage-full', at: 1 },
    });
    const alert = container!.querySelector<HTMLElement>('[data-writer-save-notice="error"]');
    expect(alert, 'der Speicherfehler muss sichtbar sein').not.toBeNull();
    expect(alert!.getAttribute('role')).toBe('alert');
    expect(alert!.textContent).toContain('Speicher ist voll');
  });

  it('schweigt bei normalem Speichern', async () => {
    await mount({ documents: [] }, { saveStatus: 'saved', saveFailure: null });
    expect(container!.querySelector('[data-writer-save-notice="error"]')).toBeNull();
  });

  it('bleibt im Fokus-Modus sichtbar und blockiert das Weiterschreiben nicht', async () => {
    const journal: Journal = { documents: [] };
    await mount(journal, {
      saveStatus: 'error',
      saveFailure: { code: 'save-blocked', at: 1 },
    });

    await enterFocusMode();

    const alert = container!.querySelector<HTMLElement>('[data-writer-save-notice="error"]');
    expect(alert, 'ein Speicherfehler darf im Fokus-Modus nicht verschwinden').not.toBeNull();
    expect(alert!.textContent).toContain('blockiert');

    // Trotz Fehler bleibt der Text schreibbar: der Fehler ist eine Warnung, kein Datenverlust.
    const surface = container!.querySelector<HTMLElement>('[data-writer-rich-surface="true"]');
    expect(surface).not.toBeNull();
    await act(async () => {
      writeWriterSurfaceSelection(surface!, {
        anchor: { paragraphId: 'p1', offset: 4 },
        focus: { paragraphId: 'p1', offset: 4 },
      });
      document.dispatchEvent(new Event('selectionchange'));
      await settle(1);
    });
    const target = surface!.querySelector<HTMLElement>('[data-writer-surface-paragraph]') ?? surface!;
    await act(async () => {
      target.dispatchEvent(new KeyboardEvent('keydown', { key: '!', bubbles: true, cancelable: true }));
      await settle(3);
    });
    expect(readParagraphs(journal.documents[journal.documents.length - 1]!)[0]!.spans.map((span) => span.text).join(''))
      .toBe('Text!');
  });
});
