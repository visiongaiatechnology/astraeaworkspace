import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { PdfStudio } from '../../studio/PdfStudio';

// DEF-RE-002 — "Grid und PDF Studio starten zuverlässig" (Ergänzung 7, verbindlich).
//
// Gemessen in Runde 140: von 29 Komponenten, die die PDF-Tests rendern, ist **PdfStudio nicht darunter**.
// Die Tests decken PdfToolbar, PdfThumbnailsSidebar und 26 weitere Bausteine ab — den **Einstieg** nicht.
// Grid hat für dieselbe Anforderung seit Runde 72 einen Witness (`gridSheetStartupWitness`); PDF nie.
//
// ## Der Shim — gemessen, nicht geraten
//
// Der erste Lauf (Runde 141) scheiterte mit `ReferenceError: window is not defined`. Die Messung danach
// ergab, dass `PdfStudio` selbst `window` nur **außerhalb** des Renderpfads berührt:
//
//   :146-149  window.getSelection / window.document.addEventListener   in einem useEffect (mit Cleanup)
//   :227-228  window.addEventListener / removeEventListener            in einem useEffect (mit Cleanup)
//   :282      window.alert                                             in einem .catch()
//
// Effects laufen unter `renderToStaticMarkup` nicht. Der Fehler kam also aus einem **importierten Modul**.
// Der Shim ist die Vereinigung dessen, was diese Sitzung an vier früheren Witnesses als nötig gemessen hat:
//
//   window.location.search        WriterEditor                     (Runde 80, recording facade)
//   window.__TAURI__              WriterEditor                     (Runde 80, harmlos abgefragt)
//   window.localStorage.getItem   WhiteboardCanvas, PublishView    (Runden 80-84)
//   window.document + Listener    PdfStudio                        (Runde 142)
//   window.addEventListener      PdfStudio                        (Runde 142)
//   window.alert                  PdfStudio                        (Runde 142)
//
// ## Was diese Datei zusichert
//
// `gridSheetStartupWitness` prüft `html.length > 0` — richtig für seinen Zweck (ein werfendes Rendern liefert
// gar kein Markup), aber blind für "eine leere Hülle rendert". Diese Datei prüft deshalb zusätzlich
// **Struktur**: das Markup muss PDF-eigene Anker tragen (37 `data-pdf-*` im Baum, gemessen in Runde 140).

// Filesystem-scanning contracts in this repository exceed the 5000 ms default under a full parallel run.
vi.setConfig({ testTimeout: 60_000 });

const noop = () => undefined;

// Installed before the component renders; `window` is absent in the node environment.
Object.defineProperty(globalThis, 'window', {
  value: {
    location: { search: '', href: 'http://localhost/', pathname: '/' },
    document: {
      addEventListener: noop,
      removeEventListener: noop,
      querySelector: () => null,
    },
    addEventListener: noop,
    removeEventListener: noop,
    getSelection: () => null,
    alert: noop,
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop, clear: noop },
  },
  writable: true,
  configurable: true,
});

const document: WorkspaceDocument = {
  id: 'pdf-startup-witness',
  title: 'PDF startup witness',
  kind: 'PdfStudio',
  created_at: 0,
  modified_at: 0,
  version: 1,
  theme_id: 'default',
  root_object_ids: [],
  objects: {},
};

function render(props: Record<string, unknown> = {}): string {
  return renderToStaticMarkup(
    createElement(PdfStudio, {
      document,
      onUpdateDocument: vi.fn(),
      workspaceDocuments: [],
      networkCapability: 'offline',
      keyVaultUnlocked: false,
      ...props,
    } as never),
  );
}

describe('PdfStudio startup contract (DEF-RE-002)', () => {
  it('renders without throwing', () => {
    const html = render();
    expect(html.length).toBeGreaterThan(0);
  });

  it('is deterministic — two renders of the same document agree', () => {
    expect(render()).toEqual(render());
  });

  it('renders the studio chrome, not an empty shell', () => {
    const html = render();
    // At least one PDF-own anchor must be present. A passenger shell would carry none.
    expect(html).toMatch(/data-pdf-[a-z-]+/);
  });
});
