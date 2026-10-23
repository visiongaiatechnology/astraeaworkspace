// @vitest-environment happy-dom
// STATUS: DIAMANT VGT SUPREME — Tastaturbedienung und Screenreader-Semantik des Writers.
import { describe, expect, it } from 'vitest';
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { WorkspaceDocument } from '../../../../../shared/contracts/workspace';
import { WriterEditor } from '../../../editor/WriterEditor';

/**
 * M01-Z0297 verlangt: „Tastaturbedienung, Screenreader-Semantik, High-Contrast,
 * Fokusfuehrung und skalierbare UI gehoeren zum Definition-of-Done."
 *
 * WARUM DIESER TEST NOETIG WAR, und der Vorgaenger sagt es selbst
 * (`writerEditorRenderWitness.test.tsx:13-15`):
 *
 *   „This repository runs Vitest in the node environment with no jsdom or
 *    happy-dom, so `window` did not exist. A recording facade (round 80)
 *    showed those are the only properties touched, so a shim of exactly that
 *    shape is enough — measured, not guessed."
 *
 * Und der Shim steht in :21-25:
 *
 *   Object.defineProperty(globalThis, 'window', {
 *     value: { location: { search: '', href: 'http://localhost/', pathname: '/' } },
 *     ...
 *   });
 *
 * Der Vorgaenger rendert darum mit `renderToStaticMarkup` und prueft mit
 * `toContain` auf dem HTML-STRING (:76, :80):
 *
 *   expect(pageBody![0]).toContain('tabindex="0"');
 *   expect(pageBody![0]).toContain('focus-visible:ring-2');
 *
 * DAS IST DIE LUECKE: `tabindex="0"` IM STRING heisst nicht, dass das Element
 * den Fokus ANNIMMT. Zwischen beidem liegt alles, was schiefgehen kann — ein
 * `display:none` in der Kette, ein `inert` am Vorfahren, ein `pointer-events`,
 * ein Element das beim Fokussieren sofort wieder verliert.
 *
 * DIESER Test rendert in ein ECHTES DOM und liest `document.activeElement`.
 * Er braucht KEINEN `window`-Shim mehr.
 */

function frischesDokument(id: string, titel: string): WorkspaceDocument {
  return {
    id,
    title: titel,
    kind: 'Writer',
    created_at: 0,
    modified_at: 0,
    version: 1,
    theme_id: 'default',
    root_object_ids: [],
    objects: {},
  };
}

interface Aufzeichnung {
  readonly aktualisiert: WorkspaceDocument[];
  readonly geoeffnet: string[];
}

/**
 * DER WRITER IST KONTROLLIERT: er liest `document` als Prop und meldet
 * Aenderungen ueber `onUpdateDocument`. Ein Test, der die Meldung nur
 * protokolliert, laesst das Dokument LEER — und dann kann kein Absatz
 * fokussiert werden, den es nicht gibt.
 *
 * GEMESSEN: mit einem protokollierenden `onUpdateDocument` meldete der Klick
 * `onUpdateDocument = 1`, aber das DOM blieb ohne Absatz und ohne
 * `contenteditable`; `document.activeElement` blieb `body`. Der Test war rot,
 * weil er den kontrollierten Zustand nicht gefuehrt hat.
 *
 * Dieser Wrapper fuehrt ihn: die Meldung wird zum neuen Prop-Wert.
 */
function KontrollierterWriter({
  start,
  protokoll,
}: {
  readonly start: WorkspaceDocument;
  readonly protokoll: Aufzeichnung;
}) {
  const [dokument, setDokument] = useState<WorkspaceDocument>(start);
  return createElement(WriterEditor, {
    document: dokument,
    // ZWEI PFLICHTPROPS, DIE DER BESTANDSTEST MIT `as never` UNTERDRUECKT:
    // `WriterEditorProps` (`types.ts:141-147`) verlangt `workspaceDocuments`
    // und `onSelectSelectionType`. Der Vorgaenger
    // (`writerEditorRenderWitness.test.tsx:48`) schreibt
    // `} as never)` und hat damit nie erfahren, dass seine Props unvollstaendig
    // sind. Hier stehen sie, damit der Typecheck die Naht wirklich prueft.
    workspaceDocuments: [],
    onSelectSelectionType: () => undefined,
    onUpdateDocument: (naechstes: WorkspaceDocument) => {
      protokoll.aktualisiert.push(naechstes);
      setDokument(naechstes);
    },
    onOpenDocument: (id: string) => {
      protokoll.geoeffnet.push(id);
    },
    onOpenExternalUrl: () => undefined,
  });
}

async function mitEditor(
  titel: string,
  pruefung: (container: HTMLElement, protokoll: Aufzeichnung) => void | Promise<void>,
): Promise<void> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const protokoll: Aufzeichnung = { aktualisiert: [], geoeffnet: [] };
  await act(async () => {
    root.render(
      createElement(KontrollierterWriter, {
        start: frischesDokument('doc-1', titel),
        protokoll,
      }),
    );
  });
  try {
    await pruefung(container, protokoll);
  } finally {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  }
}

describe('die Tastaturbedienung des Writers wirkt im Betrieb', () => {
  it('nimmt mit dem Seitentext den Fokus wirklich an', async () => {
    await mitEditor('Bericht Q3', (container) => {
      // ASTRAEA WRITER 50 V2 · M1 (WR-001/WR-010): the keyboard/tab stop of the
      // document is the **one** rich-text surface, not the paper body. The paper
      // body is a layout box; making it focusable created a second stop between
      // the click and the caret, which is exactly how a user ended up with no
      // visible caret after the first click.
      const surface = container.querySelector<HTMLElement>(
        '[data-writer-rich-surface="true"]',
      );
      expect(surface, 'die Rich-Text-Schreibflaeche muss im DOM stehen').not.toBeNull();

      // GEMESSEN, UND ES AENDERT DIESEN TEST: happy-dom fokussiert JEDES
      // Element. Eine Sonde hat fuenf Arten geprueft — `div` ohne tabindex,
      // `span`, `div` mit tabindex=-1, `p` und `button` —, und bei ALLEN
      // ergab `el.focus()` danach `document.activeElement === el` und
      // `el.matches(':focus') === true`, auch bei tabIndex -1.
      //
      // DESHALB STEHT HIER NICHT MEHR:
      //     surface?.focus();
      //     expect(document.activeElement).toBe(surface);
      // Das waere auch fuer ein nicht fokussierbares Element gruen gewesen.
      //
      // WAS HAPPY-DOM NICHT FAELSCHT, ist die TAB-ERREICHBARKEIT: der
      // tabIndex, ein `disabled` und ein `inert`-Vorfahre sind Attribute und
      // werden nicht simuliert. Das ist die pruefbare Eigenschaft.
      expect(surface?.tabIndex).toBe(0);
      expect(surface?.hasAttribute('disabled')).toBe(false);
      expect(surface?.closest('[inert]')).toBeNull();
      // Genau EIN Tab-Stop fuer das ganze Dokument — nicht einer pro Absatz.
      expect(container.querySelectorAll('[data-writer-rich-surface="true"]')).toHaveLength(1);
    });
  });

  it('haelt den Fokus, wenn ein Klick auf die leere Seite faellt (DEF-RE-001)', async () => {
    // Der Vorgaenger-Kommentar (:8-9) nennt genau dieses Verhalten als den
    // Anlass der Datei: „DEF-RE-001 was a behaviour of exactly this component:
    // clicking into the empty page area had to place the caret."
    //
    // UND WARUM DAS WARTEN NOETIG IST: `handlePageBackgroundClick`
    // (`useWriterState.ts:689-700`) setzt KEINEN DOM-Fokus. Er setzt
    // `activeParagraphId`, `textSelection` und ruft `requestWriterCaret`, und
    // das PUBLIZIERT nur an Abonnenten (`writerCaretController.ts:85-89`):
    //
    //   export function requestWriterCaret(input) {
    //     const request = buildRequest(input);
    //     publish(request);          <== kein DOM
    //     return request;
    //   }
    //
    // Der Fokus entsteht erst, wenn ein Abonnent auf die Anfrage reagiert.
    // GEMESSEN: mit einer synchronen Pruefung direkt nach dem `dispatchEvent`
    // war der Test rot — nicht weil der Fokus fehlt, sondern weil er zu diesem
    // Zeitpunkt noch nicht gesetzt sein KANN.
    await mitEditor('Bericht Q3', async (container) => {
      const seitenkoerper = container.querySelector<HTMLElement>(
        '[data-writer-page-body="true"]',
      );
      expect(seitenkoerper).not.toBeNull();

      await act(async () => {
        seitenkoerper?.dispatchEvent(
          new MouseEvent('click', { bubbles: true, cancelable: true }),
        );
        // Ein Microtask genuegt nicht: der Fokus entsteht erst, wenn ein
        // Abonnent der Caret-Anfrage gerendert hat.
        await new Promise((resolve) => {
          setTimeout(resolve, 120);
        });
      });

      // Nach dem Klick liegt der Fokus in der Schreibflaeche — das Caret hat einen Ort.
      const surface = container.querySelector<HTMLElement>('[data-writer-rich-surface="true"]');
      expect(surface).not.toBeNull();
      const aktiv = document.activeElement;
      expect(aktiv).not.toBe(document.body);
      expect(
        aktiv === surface || surface?.contains(aktiv) || seitenkoerper?.contains(aktiv),
        'nach dem Klick muss der Fokus in der Schreibflaeche liegen',
      ).toBe(true);
    });
  });

  it('ist ueber die Tastatur erreichbar, nicht nur ueber die Maus', async () => {
    await mitEditor('Bericht Q3', (container) => {
      const surface = container.querySelector<HTMLElement>(
        '[data-writer-rich-surface="true"]',
      );
      expect(surface).not.toBeNull();

      // `tabIndex === 0` ist die Bedingung dafuer, dass die sequenzielle
      // Fokusnavigation das Element erreicht. Ein negativer Wert waere per
      // Skript fokussierbar, aber NICHT per Tab.
      expect(surface?.tabIndex).toBe(0);
      expect(surface?.hasAttribute('disabled')).toBe(false);
      expect(surface?.closest('[inert]')).toBeNull();
    });
  });
});

describe('die Screenreader-Semantik des Writers steht im DOM', () => {
  it('benennt die Flaeche mit dem Dokumenttitel', async () => {
    await mitEditor('Bericht Q3', (container) => {
      // Der Vorgaenger prueft `html.toContain('Bericht Q3')` — das kann ein
      // beliebiger Textknoten sein. Hier wird geprueft, dass der Titel in einer
      // BENENNUNG steht.
      const benannt = Array.from(
        container.querySelectorAll<HTMLElement>('[aria-label], [aria-labelledby], [title]'),
      ).filter((element) => {
        const eigen = element.getAttribute('aria-label') ?? element.getAttribute('title') ?? '';
        if (eigen.includes('Bericht Q3')) return true;
        const verweis = element.getAttribute('aria-labelledby');
        if (!verweis) return false;
        return verweis
          .split(/\s+/u)
          .some((id) => container.querySelector(`#${id}`)?.textContent?.includes('Bericht Q3'));
      });
      expect(
        benannt.length,
        'der Dokumenttitel muss in einer Zugaenglichkeits-Benennung stehen, nicht nur als Textknoten',
      ).toBeGreaterThan(0);
    });
  });

  it('gibt der Bearbeitungsflaeche eine Rolle, die ein Screenreader ansagen kann', async () => {
    await mitEditor('Bericht Q3', (container) => {
      const rollen = new Set(
        Array.from(container.querySelectorAll<HTMLElement>('[role]')).map(
          (element) => element.getAttribute('role') ?? '',
        ),
      );
      // Der Seitenkoerper traegt `tabindex="0"` und ist der Einstieg. Ein
      // fokussierbares Element ohne Rolle wird von Screenreadern als
      // generisches Element angesagt.
      const seitenkoerper = container.querySelector<HTMLElement>(
        '[data-writer-page-body="true"]',
      );
      const rolle = seitenkoerper?.getAttribute('role') ?? '';
      const umschliessend = seitenkoerper?.closest('[role]')?.getAttribute('role') ?? '';
      expect(
        rolle.length > 0 || umschliessend.length > 0 || rollen.has('textbox') || rollen.has('document'),
        `der fokussierbare Seitenkoerper braucht eine ansagbare Rolle; gefunden: ${[...rollen].join(', ') || '(keine)'}`,
      ).toBe(true);
    });
  });
});
