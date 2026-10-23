// @vitest-environment happy-dom
// STATUS: PLATIN — Release-Beta-0.1-Kernpfad des Writers als ausführbarer Zeuge.
//
// Der Nutzer verlangt für Release 0.1: „Text muss sich schreiben lassen. Formatieren,
// Bilder, Tabellen, Speichern/Wiederöffnen" — ohne Workaround und ohne stillen
// Datenverlust. Diese Datei führt genau diese eine Alltagshandlung durch die **echte**
// Oberfläche (`WriterEditor`) aus und prüft am **persistierten Dokument**:
//
//   1. Text tippen und Enter → zwei Absätze im Dokument (nicht nur im DOM),
//   2. Fett/Kursiv/Unterstrichen über die Werkzeugleiste,
//   3. Überschrift und Liste über die Werkzeugleiste,
//   4. Tabelle über `Einfügen ▾ → Tabelle` einfügen, Zelle bearbeiten, Zeile per Tab,
//   5. Bild über den Datei-Eingang einfügen und ein zu großes Bild mit sichtbarem Fehler
//      ablehnen (Grenze 20 MiB),
//   6. Speichern = `JSON`-Roundtrip des Dokuments, Wiederöffnen = Neumount damit —
//      Text, Formatierung, Tabelle und Bild müssen identisch zurückkommen.
//
// Die Grenze ist ehrlich benannt: der native Dateischreiber (Tauri/VWC-Container) ist in
// `happy-dom` nicht erreichbar. Geprüft wird der kanonische Dokument-Roundtrip, also die
// Daten, die der Writer besitzt — nicht, dass die Bytes auf einer echten Platte landen.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Paragraph, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { WriterEditor } from '../../editor/WriterEditor';
import { writeWriterSurfaceSelection } from '../../editor/surface/writerDomModelAdapter';
import { resetWriterCaretController } from '../../editing/caret/writerCaretController';
import type { ImageBlockData, TableBlockData } from '../../types';

// Der Decoder-Sandbox-Worker läuft in happy-dom nicht; der Import fällt dann auf die
// Signatur-/Dimensionsprüfung zurück. Das ist derselbe Pfad, den auch das native
// WebView2 nimmt, wenn der Worker nicht hochkommt (siehe `writerImageImport.ts`).
const preflight = vi.hoisted(() => vi.fn());
vi.mock('../../../../platform/import-sandbox/importExportSandbox', () => ({
  preflightIsolatedImageDecode: preflight,
}));

// Ein voller Editor-Mount paginiert und misst das Dokument; im Gesamt-Suite-Lauf mit
// vielen parallelen Workern darf das nicht am Standard-Timeout scheitern — der Test
// misst Verhalten, nicht CPU-Zeit.
vi.setConfig({ testTimeout: 60_000 });

const PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89,
  0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54,
  0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01,
  0x0d, 0x0a, 0x2d, 0xb4,
]);

function makeParagraph(id: string, spans: Paragraph['spans'], extra: Partial<Paragraph['style']> = {}): Paragraph {
  return {
    id,
    style: { alignment: 'left', line_height: 1.5, space_before: 0, space_after: 0, ...extra },
    spans,
  };
}

function documentWith(
  id: string,
  paragraphs: Paragraph[],
  extraWriterData: Partial<Exclude<WorkspaceDocument['writerData'], undefined>> = {},
): WorkspaceDocument {
  const textBlockId = 'tb-' + id;
  const baseWriterData = { pageSetup: pageSetup(), tables: [] };
  return {
    id,
    title: 'Release-Kernpfad',
    kind: 'Writer',
    created_at: 0,
    modified_at: 0,
    version: 1,
    theme_id: 'default',
    root_object_ids: [textBlockId],
    objects: { [textBlockId]: { type: 'TextBlock', data: { id: textBlockId, paragraphs } } },
    writerData: { ...baseWriterData, ...extraWriterData },
  } as WorkspaceDocument;
}

function pageSetup() {
  return {
    paperSize: 'A4' as const,
    orientation: 'portrait' as const,
    margins: 'normal' as const,
    paperColor: 'white' as const,
    showPageNumbers: false,
    headerText: '',
    footerText: '',
  };
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

function readTables(doc: WorkspaceDocument): TableBlockData[] {
  return (doc.writerData?.tables ?? []) as TableBlockData[];
}

function readImages(doc: WorkspaceDocument): ImageBlockData[] {
  return (doc.writerData?.images ?? []) as ImageBlockData[];
}

function texts(paragraphs: Paragraph[]): string[] {
  return paragraphs.map((paragraph) => paragraph.spans.map((span) => span.text).join(''));
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

async function settle(hops = 4): Promise<void> {
  for (let hop = 0; hop < hops; hop += 1) {
    await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
  }
}

async function mount(journal: Journal, start: WorkspaceDocument): Promise<HTMLElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(ControlledWriter, { start, journal }));
  });
  const surface = container.querySelector<HTMLElement>('[data-writer-rich-surface="true"]');
  expect(surface, 'die Schreibfläche muss im DOM stehen').not.toBeNull();
  return surface!;
}

async function remount(journal: Journal, start: WorkspaceDocument): Promise<{ surface: HTMLElement; container: HTMLDivElement }> {
  if (root) {
    await act(async () => { root!.unmount(); });
    root = null;
  }
  if (container) {
    container.remove();
    container = null;
  }
  document.getSelection()?.removeAllRanges();
  resetWriterCaretController();
  const surface = await mount(journal, start);
  return { surface, container: container! };
}

function lastDocument(journal: Journal): WorkspaceDocument {
  const document = journal.documents[journal.documents.length - 1];
  if (!document) throw new Error('Der Editor hat kein Dokument veröffentlicht.');
  return document;
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

async function select(surface: HTMLElement, paragraphId: string, from: number, to: number): Promise<void> {
  await act(async () => {
    writeWriterSurfaceSelection(surface, {
      anchor: { paragraphId, offset: from },
      focus: { paragraphId, offset: to },
    });
    document.dispatchEvent(new Event('selectionchange'));
    await settle(1);
  });
}

async function key(surface: HTMLElement, value: string, modifiers: KeyboardEventInit = {}): Promise<void> {
  const target = surface.querySelector<HTMLElement>('[data-writer-surface-paragraph]') ?? surface;
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true, ...modifiers }));
    await settle(2);
  });
}

async function type(surface: HTMLElement, text: string): Promise<void> {
  for (const character of text) await key(surface, character === ' ' ? ' ' : character);
}

/** Klickt das erste Element, dessen `aria-label`/`title` den Text enthält. */
async function clickByLabel(haystack: ParentNode, labelPart: string): Promise<HTMLElement> {
  const candidates = Array.from(haystack.querySelectorAll<HTMLElement>('button, [role="menuitem"]'));
  const match = candidates.find((element) => {
    const label = `${element.getAttribute('aria-label') ?? ''} ${element.getAttribute('title') ?? ''}`;
    return label.includes(labelPart);
  });
  expect(match, `Bedienelement mit „${labelPart}" muss existieren`).toBeTruthy();
  await act(async () => {
    match!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await settle(2);
  });
  return match!;
}

/** Klickt ein Element per CSS-Selektor (für Werkzeugleisten-Menüs und Rasterzellen). */
async function clickSelector(haystack: ParentNode, selector: string): Promise<HTMLElement> {
  const element = haystack.querySelector<HTMLElement>(selector);
  expect(element, `Element ${selector} muss existieren`).not.toBeNull();
  await act(async () => {
    element!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await settle(2);
  });
  return element!;
}

/**
 * Ein minimaler 2D-Kontext für beide Canvas-Rollen im Writer.
 *
 * `happy-dom` liefert keinen 2D-Kontext; der Layout-Pfad (`textShaping.ts`) fällt dann
 * auf eine Breitenschätzung zurück, aber der Bildimport braucht einen Kontext zum
 * Zeichnen und `toBlob` zum Neukodieren. Beide Fähigkeiten stehen deshalb auf dem
 * Prototyp — nicht `document.createElement` global, damit der Layout-Fallback des
 * Paginators unangetastet bleibt.
 */
function installCanvasStub(): void {
  const context = {
    font: '',
    fontKerning: 'normal',
    drawImage: () => undefined,
    measureText: (text: string) => ({ width: Array.from(text).length * 8 }),
  };
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: () => context,
  });
  Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
    configurable: true,
    value: (callback: (blob: Blob | null) => void) => {
      callback(new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' }));
    },
  });
}

function imageFile(name: string): File {
  return new File([PNG_BYTES as unknown as BlobPart], name, { type: 'image/png' });
}

/** Hängt eine Datei an den versteckten Bild-Eingang und feuert `change`. */
async function chooseImageFile(target: HTMLElement, file: File): Promise<void> {
  const input = target.querySelector<HTMLInputElement>('input[type="file"]');
  expect(input, 'der versteckte Bild-Eingang muss existieren').not.toBeNull();
  Object.defineProperty(input!, 'files', {
    configurable: true,
    value: { 0: file, length: 1, item: (index: number) => (index === 0 ? file : null) },
  });
  await act(async () => {
    input!.dispatchEvent(new Event('change', { bubbles: true }));
    await settle(8);
  });
}

/**
 * Zieht eine Datei auf den Seitenkörper — der Drop-Pfad, den der Nutzer am Fenster
 * benutzt. Der `drop` muss `preventDefault()` rufen, sonst navigiert WebView2 zur
 * Datei und die Anwendung ist weg (deshalb prüft der Test genau das mit).
 */
async function dropFileOnPage(target: HTMLElement, file: File): Promise<Event> {
  const pageBody = target.querySelector<HTMLElement>('[data-writer-page-body="true"]');
  expect(pageBody, 'der Seitenkörper muss im DOM stehen').not.toBeNull();
  const event = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', {
    configurable: true,
    value: {
      files: { 0: file, length: 1, item: (index: number) => (index === 0 ? file : null) },
      types: ['Files'],
      getData: () => '',
      setData: () => undefined,
    },
  });
  await act(async () => {
    pageBody!.dispatchEvent(event);
    await settle(8);
  });
  return event;
}

beforeEach(() => {
  resetWriterCaretController();
  preflight.mockReset();
  preflight.mockResolvedValue({ image_width: 1, image_height: 1 });
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 1, height: 1, close: () => undefined })));
  installCanvasStub();
  try {
    window.localStorage.clear();
  } catch {
    // happy-dom ohne Storage: der Cursor-Marker ist für diese Fälle nicht relevant.
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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Release 0.1 — Writer-Kernpfad durch die echte Oberfläche', () => {
  it('tippt Text, formatiert ihn und schreibt Überschrift und Liste in das Dokument', async () => {
    const journal: Journal = { documents: [] };
    const surface = await mount(journal, documentWith('release-1', [makeParagraph('p1', [{ text: '' }])]));

    await setCaret(surface, 'p1', 0);
    await type(surface, 'Bericht');
    await key(surface, 'Enter');
    await type(surface, 'Absatz');
    expect(texts(readParagraphs(lastDocument(journal)))).toEqual(['Bericht', 'Absatz']);

    // Fett/Kursiv/Unterstrichen über die Werkzeugleiste auf die ersten drei Zeichen.
    await select(surface, 'p1', 0, 3);
    await clickByLabel(container!, 'Bold');
    await clickByLabel(container!, 'Italic');
    await clickByLabel(container!, 'Underline');
    const formatted = readParagraphs(lastDocument(journal))[0]!;
    const firstRun = formatted.spans.find((span) => span.text.includes('Ber'));
    expect(firstRun, 'der formatierte Lauf muss im Dokument stehen').toBeTruthy();
    expect(firstRun!.bold).toBe(true);
    expect(firstRun!.italic).toBe(true);
    expect(firstRun!.underline).toBe(true);
    // Der Rest des Absatzes bleibt unformatiert.
    expect(formatted.spans.some((span) => span.text.includes('icht') && !span.bold)).toBe(true);

    // Absatzvorlage „Überschrift 1" über das Vorlagen-Auswahlfeld.
    await setCaret(surface, 'p1', 0);
    const styleSelect = container!.querySelector<HTMLSelectElement>('select');
    expect(styleSelect, 'die Absatzvorlagen-Auswahl muss existieren').not.toBeNull();
    await act(async () => {
      styleSelect!.value = 'heading1';
      styleSelect!.dispatchEvent(new Event('change', { bubbles: true }));
      await settle(2);
    });
    expect(readParagraphs(lastDocument(journal))[0]!.style.style_name).toBe('heading1');

    // Aufzählung über die Werkzeugleiste.
    await clickByLabel(container!, 'Bulleted list');
    expect(readParagraphs(lastDocument(journal))[0]!.style.list_style).toBe('bullet');
  });

  it('fügt eine Tabelle ein, bearbeitet eine Zelle und ergänzt per Tab eine Zeile', async () => {
    const journal: Journal = { documents: [] };
    const surface = await mount(journal, documentWith('release-2', [makeParagraph('p1', [{ text: 'Tabelle unten' }])]));
    await setCaret(surface, 'p1', 0);

    // Einfügen ▾ → Tabellenraster → 2 × 3.
    await clickSelector(container!, '[data-writer-toolbar-menu-trigger="writer-toolbar-menu-insert"]');
    await clickSelector(container!, '[data-writer-table-size-trigger="true"]');
    await clickSelector(container!, '[data-writer-table-size-cell="2x3"]');

    const inserted = readTables(lastDocument(journal));
    expect(inserted, 'die Tabelle muss im Dokument gespeichert sein').toHaveLength(1);
    expect(inserted[0]!.rows).toHaveLength(2);
    expect(inserted[0]!.rows[0]!.cells).toHaveLength(3);
    const tableId = inserted[0]!.id;
    const firstCellId = inserted[0]!.rows[0]!.cells[0]!.id;
    const lastCellId = inserted[0]!.rows[1]!.cells[2]!.id;

    // Zelle bearbeiten: der Eingang ist ein echtes Eingabefeld im Tabellenblock.
    const cellInput = container!.querySelector<HTMLInputElement>(`[data-writer-table-cell="${firstCellId}"] input`);
    expect(cellInput, 'die erste Zelle muss ein Eingabefeld haben').not.toBeNull();
    await act(async () => {
      // Der native Setter umgeht Reacts Value-Tracker; ohne ihn sieht React keinen
      // Unterschied und feuert kein `onChange` (klassische DOM-Test-Falle).
      const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      nativeSetter.call(cellInput!, 'Quartal');
      cellInput!.dispatchEvent(new Event('input', { bubbles: true }));
      await settle(2);
    });
    const afterEdit = readTables(lastDocument(journal)).find((table) => table.id === tableId)!;
    expect(afterEdit.rows[0]!.cells[0]!.content).toBe('Quartal');

    // Tab in der letzten Zelle hängt eine Zeile an, statt die Tabelle zu verlassen.
    const lastCellInput = container!.querySelector<HTMLInputElement>(`[data-writer-table-cell="${lastCellId}"] input`);
    expect(lastCellInput, 'die letzte Zelle muss ein Eingabefeld haben').not.toBeNull();
    await act(async () => {
      lastCellInput!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
      await settle(2);
    });
    const afterTab = readTables(lastDocument(journal)).find((table) => table.id === tableId)!;
    expect(afterTab.rows).toHaveLength(3);
    expect(afterTab.rows[0]!.cells[0]!.content).toBe('Quartal');

    // Zeile/Spalte ändern: die Werkzeuge des Tabellenblocks schreiben in dasselbe Dokument.
    await clickSelector(container!, 'button[title="Spalte hinzufügen"]');
    const afterColumn = readTables(lastDocument(journal)).find((table) => table.id === tableId)!;
    expect(afterColumn.rows[0]!.cells).toHaveLength(4);
    await clickSelector(container!, 'button[title="Zeile hinzufügen"]');
    const afterRow = readTables(lastDocument(journal)).find((table) => table.id === tableId)!;
    expect(afterRow.rows).toHaveLength(4);
    expect(afterRow.rows[0]!.cells[0]!.content).toBe('Quartal');
  }, 30_000);

  it('fügt ein Bild ein und lehnt ein zu großes Bild mit verständlicher Meldung ab', async () => {
    const journal: Journal = { documents: [] };
    const surface = await mount(journal, documentWith('release-3', [makeParagraph('p1', [{ text: 'Bild hier:' }])]));
    await setCaret(surface, 'p1', 0);

    await chooseImageFile(container!, imageFile('diagramm.png'));
    const images = readImages(lastDocument(journal));
    expect(images, 'das Bild muss im Dokument gespeichert sein').toHaveLength(1);
    expect(images[0]!.name).toBe('diagramm.png');
    expect(images[0]!.dataUrl.startsWith('data:image/png;base64,')).toBe(true);
    expect(images[0]!.anchorParagraphId).toBeTruthy();
    // Nach dem Einfügen steht der Caret im Text **unter** dem Bild — der nächste
    // Tastendruck landet nicht im Bildanker (native Runde 6 / WR-033).
    await type(surface, 'Unterschrift');
    expect(texts(readParagraphs(lastDocument(journal))).join('\n')).toContain('Unterschrift');

    // Ein Bild über der 20-MiB-Quellgrenze wird abgelehnt und sichtbar erklärt.
    const oversize = { size: 21 * 1024 * 1024, type: 'image/png', name: 'riesig.png' } as File;
    await chooseImageFile(container!, oversize);
    const alert = container!.querySelector<HTMLElement>('[role="alert"]');
    expect(alert, 'ein zu großes Bild muss sichtbar gemeldet werden').not.toBeNull();
    expect(alert!.textContent).toContain('20 MiB');
    expect(readImages(lastDocument(journal))).toHaveLength(1);
  }, 30_000);

  it('speichert und öffnet verlustfrei wieder: Text, Format, Tabelle und Bild überleben den Roundtrip', async () => {
    const journal: Journal = { documents: [] };
    const surface = await mount(journal, documentWith('release-4', [makeParagraph('p1', [{ text: '' }])]));
    await setCaret(surface, 'p1', 0);
    await type(surface, 'Projektbericht');
    await key(surface, 'Enter');
    await type(surface, 'Fazit: bereit für Beta.');
    await select(surface, 'p2', 0, 6);
    await clickByLabel(container!, 'Bold');
    await clickByLabel(container!, 'Italic');

    await setCaret(surface, 'p2', 0);
    await clickByLabel(container!, 'Bulleted list');

    await clickSelector(container!, '[data-writer-toolbar-menu-trigger="writer-toolbar-menu-insert"]');
    await clickSelector(container!, '[data-writer-table-size-trigger="true"]');
    await clickSelector(container!, '[data-writer-table-size-cell="2x2"]');

    await setCaret(surface, 'p1', 0);
    await chooseImageFile(container!, imageFile('bild.png'));

    const saved = lastDocument(journal);
    expect(texts(readParagraphs(saved))).toEqual(['Projektbericht', 'Fazit: bereit für Beta.']);
    expect(readTables(saved)).toHaveLength(1);
    expect(readImages(saved)).toHaveLength(1);

    // „Speichern" = vollständiger Serialisierungs-Roundtrip des Dokuments (das ist der
    // Vertrag, den der Container/Dateischreiber später bytegleich ablegt).
    const stored = JSON.parse(JSON.stringify(saved)) as WorkspaceDocument;
    // „Wiederöffnen" = neuer Editor mit dem gespeicherten Dokument.
    const reopenedJournal: Journal = { documents: [] };
    const { surface: reopenedSurface } = await remount(reopenedJournal, stored);

    const reopenedParagraphs = readParagraphs(stored);
    expect(texts(reopenedParagraphs)).toEqual(['Projektbericht', 'Fazit: bereit für Beta.']);
    const boldItalicRun = reopenedParagraphs[1]!.spans.find((span) => span.bold && span.italic);
    expect(boldItalicRun, 'Fett+Kursiv muss den Roundtrip überleben').toBeTruthy();
    expect(reopenedParagraphs[1]!.style.list_style).toBe('bullet');
    expect(readTables(stored)).toHaveLength(1);
    expect(readTables(stored)[0]!.rows).toHaveLength(2);
    expect(readImages(stored)).toHaveLength(1);
    expect(readImages(stored)[0]!.dataUrl).toBe(readImages(saved)[0]!.dataUrl);

    // Der wieder geöffnete Editor rendert den Text, die Formatierung, die Tabelle und das Bild.
    expect(reopenedSurface.textContent).toContain('Projektbericht');
    expect(reopenedSurface.querySelector('[data-writer-run-bold="true"]')).not.toBeNull();
    expect(reopenedSurface.querySelector('[data-writer-run-italic="true"]')).not.toBeNull();
    expect(reopenedSurface.querySelector('[data-writer-table-cell]')).not.toBeNull();
    expect(reopenedSurface.querySelector('[data-writer-image-id]')).not.toBeNull();
  }, 45_000);

  it('nimmt ein Bild mit einem einzigen Undo wieder zurück (Bild und Folgeabsatz)', async () => {
    const journal: Journal = { documents: [] };
    const start = documentWith('release-5', [makeParagraph('p1', [{ text: 'Anker' }])]);
    const surface = await mount(journal, start);
    await setCaret(surface, 'p1', 5);
    const before = start;

    await chooseImageFile(container!, imageFile('undo.png'));
    expect(readImages(lastDocument(journal))).toHaveLength(1);
    // Der Einfüger erzeugt den Folgeabsatz in derselben Transaktion; ein einziges
    // Undo muss den ganzen Einfügevorgang zurücknehmen.
    await key(surface, 'z', { ctrlKey: true });

    const afterUndo = journal.documents[journal.documents.length - 1]!;
    expect(readImages(afterUndo)).toHaveLength(0);
    expect(texts(readParagraphs(afterUndo))).toEqual(texts(readParagraphs(before)));
  }, 30_000);

  it('zieht ein Bild auf die Seite (Drop) und weist eine Nicht-Bild-Datei sichtbar ab', async () => {
    const journal: Journal = { documents: [] };
    const surface = await mount(journal, documentWith('release-6', [makeParagraph('p1', [{ text: 'Drop-Ziel' }])]));
    await setCaret(surface, 'p1', 9);

    // 1) Ein echtes PNG wird über den Drop-Pfad importiert.
    const accepted = await dropFileOnPage(container!, imageFile('gezogen.png'));
    expect(accepted.defaultPrevented, 'ein Drop darf die WebView nie zur Datei navigieren').toBe(true);
    const droppedImages = readImages(lastDocument(journal));
    expect(droppedImages).toHaveLength(1);
    expect(droppedImages[0]!.name).toBe('gezogen.png');

    // 2) Eine Nicht-Bild-Datei wird abgewiesen, sichtbar erklärt und nicht gespeichert.
    const rejected = await dropFileOnPage(container!, new File(['Notiz'], 'notiz.txt', { type: 'text/plain' }));
    expect(rejected.defaultPrevented, 'auch der abgewiesene Drop muss den Browser-Default stoppen').toBe(true);
    const alert = container!.querySelector<HTMLElement>('[role="alert"]');
    expect(alert, 'die Abweisung muss sichtbar gemeldet werden').not.toBeNull();
    expect(alert!.textContent).toContain('JPEG');
    expect(readImages(lastDocument(journal))).toHaveLength(1);
  }, 20_000);
});
