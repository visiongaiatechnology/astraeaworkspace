// @vitest-environment happy-dom
// STATUS: DIAMANT VGT SUPREME — der Verhaltensnachweis fuer die Fokusfuehrung des Whiteboard-Dialogs.
import { describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { WorkspaceLocaleProvider } from '../../../../shell/localization/workspaceLocale';
import { WhiteboardInteropModal } from '../../integrations/WhiteboardInteropModal';
import { useWhiteboardDialogFocus } from '../../integrations/useWhiteboardDialogFocus';
import type { WhiteboardItem } from '../../types';

/**
 * M09-Z1802 — „Tastaturbedienung, Screenreader-Semantik, High-Contrast, Fokusfuehrung und skalierbare
 * UI gehoeren zum Definition-of-Done."
 *
 * WARUM DIESE DATEI EXISTIERT
 *
 * Der bisherige Nachweis fuer die Fokusfuehrung ist
 * `testing/integration/useWhiteboardDialogFocus.test.ts`. Er baut sich sein DOM SELBST: `DocumentHarness`
 * und `FocusHarnessElement` sind handgeschriebene Attrappen (`documentRef` wird per Doppel-Cast aus
 * einem Objektliteral gebogen), `fireKeydown` erzeugt ein Objektliteral
 * statt eines `KeyboardEvent`, und `matches(':disabled')` ist auf den einen Selektor hartcodiert, den
 * die Attrappe kennt. Das ist ein Verdrahtungsnachweis: er zeigt, dass `attachWhiteboardDialogFocus`
 * mit SEINER EIGENEN Attrappe so umgeht, wie die Attrappe es erlaubt. Ob ein echter Browser — und damit
 * ein echter Screenreader-Nutzer — den Fokus wirklich im Dialog haelt, steht dort nicht.
 *
 * DIESE DATEI rendert die ECHTE Komponente (`WhiteboardInteropModal`, der einzige Aufrufer von
 * `useWhiteboardDialogFocus`) in ein echtes DOM, feuert echte `KeyboardEvent`s und liest
 * `document.activeElement`. Geprueft wird die Wirkung: wo der Fokus liegt und wohin er wandert.
 */

const LOCALE_STORAGE_KEY = 'astraea.workspace.locale.v1';

// React 19 verlangt diese Markierung, sonst warnt `act` („The current testing environment is not
// configured to support act(...)") und die Effekt-Abarbeitung ist nicht zugesichert. Die
// Vitest-Konfiguration bleibt unberuehrt: die Datei fordert ihre Umgebung selbst an.
const actUmgebung: typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean } = globalThis;
actUmgebung.IS_REACT_ACT_ENVIRONMENT = true;

const DOKUMENT: WorkspaceDocument = {
  id: 'board-1',
  title: 'Pruefboard',
  kind: 'Whiteboard',
  created_at: 0,
  modified_at: 0,
  version: 1,
  theme_id: 'default',
  root_object_ids: [],
  objects: {},
};

const ITEMS: WhiteboardItem[] = [
  { id: 'frame-1', type: 'frame', x: 0, y: 0, width: 400, height: 300, text: 'Architektur', zIndex: 1 },
  { id: 'sticky-1', type: 'sticky', x: 20, y: 20, width: 180, height: 140, text: 'Werkstattnotiz', zIndex: 2 },
];

/** Die Haltepunkte, die ein Tastaturnutzer im Dialog erwartet — unabhaengig vom Hook formuliert. */
const HALTE_PUNKT_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]',
].join(',');

function sichtbarerHaltepunkt(element: HTMLElement): boolean {
  if (element.tabIndex < 0) return false;
  for (let knoten: HTMLElement | null = element; knoten; knoten = knoten.parentElement) {
    if (knoten.hasAttribute('hidden') || knoten.hasAttribute('inert')) return false;
    const stil = window.getComputedStyle(knoten);
    if (stil.display === 'none' || stil.visibility === 'hidden' || stil.visibility === 'collapse') return false;
  }
  return true;
}

function haltepunkteImDialog(dialog: HTMLElement): HTMLElement[] {
  return [...dialog.querySelectorAll<HTMLElement>(HALTE_PUNKT_SELECTOR)].filter(sichtbarerHaltepunkt);
}

/** Ein echtes Tastaturereignis auf dem gerade fokussierten Element. */
function taste(key: string, shiftKey = false): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true });
  (document.activeElement ?? document).dispatchEvent(event);
  return event;
}

interface OffenerDialog {
  readonly dialog: HTMLElement;
  readonly schliessungen: () => number;
  readonly abraeumen: () => Promise<void>;
}

async function oeffneInteropDialog(): Promise<OffenerDialog> {
  window.localStorage.setItem(LOCALE_STORAGE_KEY, 'en-US');
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  let schliessungen = 0;

  await act(async () => {
    root.render(
      <WorkspaceLocaleProvider>
        <WhiteboardInteropModal
          isOpen
          onClose={() => {
            schliessungen += 1;
          }}
          workspaceDocument={DOKUMENT}
          documentTitle="Pruefboard"
          items={ITEMS}
          onUpdateItems={() => undefined}
          onImportDocument={() => undefined}
          onExportToPresent={() => undefined}
          showToast={() => undefined}
        />
      </WorkspaceLocaleProvider>,
    );
  });
  // Der Hook arbeitet in einem Effekt; ein Durchlauf plus Animationsfenster genuegt.
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 60);
    });
  });

  const dialog = container.querySelector<HTMLElement>('[role="dialog"]');
  if (!dialog) throw new Error('Whiteboard-Dialog wurde nicht gerendert');

  return {
    dialog,
    schliessungen: () => schliessungen,
    abraeumen: async () => {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
}

describe('Whiteboard-Dialog: Fokusfuehrung wirkt im Betrieb', () => {
  it('holt den Fokus beim Oeffnen in den Dialog und benennt ihn ueber die echte Ueberschrift', async () => {
    const offen = await oeffneInteropDialog();
    try {
      expect(offen.dialog.getAttribute('aria-modal')).toBe('true');

      const aktiv = document.activeElement;
      expect(aktiv, 'der Fokus darf nach dem Oeffnen nicht auf body liegen').not.toBe(document.body);
      expect(offen.dialog === aktiv || offen.dialog.contains(aktiv)).toBe(true);

      const labelledby = offen.dialog.getAttribute('aria-labelledby');
      expect(labelledby, 'der Dialog muss benannt sein').toBeTruthy();
      const ueberschrift = document.getElementById(labelledby ?? '');
      expect(ueberschrift, 'die referenzierte Ueberschrift muss im Dokument existieren').not.toBeNull();
      expect(offen.dialog.contains(ueberschrift)).toBe(true);
      expect(ueberschrift?.textContent?.trim().length ?? 0).toBeGreaterThan(0);
    } finally {
      await offen.abraeumen();
    }
  });

  it('haelt den Fokus beim Tab-Rundlauf im Dialog, rueckwaerts und vorwaerts', async () => {
    const offen = await oeffneInteropDialog();
    try {
      const haltepunkte = haltepunkteImDialog(offen.dialog);
      expect(haltepunkte.length, 'der Dialog braucht mehrere Haltepunkte').toBeGreaterThan(1);

      const erster = haltepunkte[0];
      erster.focus();
      expect(document.activeElement).toBe(erster);

      // Rueckwaerts vom ersten Haltepunkt: der Fokus darf den Dialog nicht verlassen.
      const rueckwaerts = taste('Tab', true);
      expect(rueckwaerts.defaultPrevented, 'der Rundlauf muss den Standard-Tab unterdruecken').toBe(true);
      const letzter = document.activeElement;
      expect(letzter).not.toBe(erster);
      expect(offen.dialog.contains(letzter)).toBe(true);
      expect(letzter).toBe(haltepunkte[haltepunkte.length - 1]);

      // Vorwaerts vom letzten Haltepunkt: zurueck auf den ersten.
      const vorwaerts = taste('Tab');
      expect(vorwaerts.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(erster);

      // Derselbe Rundlauf ein zweites Mal — die Wirkung ist reproduzierbar, kein Zufallstreffer.
      taste('Tab', true);
      expect(document.activeElement).toBe(letzter);
      taste('Tab');
      expect(document.activeElement).toBe(erster);
    } finally {
      await offen.abraeumen();
    }
  });

  it('schliesst den Dialog mit Escape ueber den echten Rueckruf', async () => {
    const offen = await oeffneInteropDialog();
    try {
      expect(offen.schliessungen()).toBe(0);

      const escape = taste('Escape');
      expect(escape.defaultPrevented, 'Escape muss den Standard unterdruecken').toBe(true);
      expect(offen.schliessungen()).toBe(1);

      // Der Rueckruf ist kein Einmalpfad: ein zweites Escape schliesst erneut.
      taste('Escape');
      expect(offen.schliessungen()).toBe(2);
    } finally {
      await offen.abraeumen();
    }
  });

  it('holt entkommenen Fokus zurueck und gibt ihn beim Aushaengen wieder frei', async () => {
    const aussen = document.createElement('button');
    aussen.type = 'button';
    aussen.textContent = 'ausserhalb des Dialogs';
    document.body.appendChild(aussen);
    aussen.focus();
    expect(document.activeElement).toBe(aussen);

    const offen = await oeffneInteropDialog();
    let fokusNachAbbau: Element | null = null;
    try {
      expect(offen.dialog.contains(document.activeElement)).toBe(true);

      // Der Fokus entkommt nach aussen — der Dialog holt ihn zurueck.
      aussen.focus();
      expect(offen.dialog.contains(document.activeElement)).toBe(true);
      expect(document.activeElement).not.toBe(aussen);
    } finally {
      await offen.abraeumen();
      fokusNachAbbau = document.activeElement;
      aussen.remove();
    }

    // Der Fokus kehrt an seinen Platz vor dem Dialog zurueck, statt auf body zu fallen.
    expect(fokusNachAbbau).toBe(aussen);
  });
});

/**
 * ZWEITER TEIL: der Filter, den die Produktkomponente unter happy-dom nicht zeigen kann.
 *
 * `WhiteboardInteropModal` versteckt seine Datei-Eingaben ueber die Tailwind-Klasse `hidden`. happy-dom
 * wendet kein CSS aus Stylesheets an, dort bleibt `getComputedStyle(...).display` also sichtbar — die
 * Klasse beweist in dieser Umgebung nichts. Dieser Host haengt DENSELBEN Produktions-Hook an ein echtes
 * DOM und versteckt einen Haltepunkt ueber einen Inline-Stil, den `getComputedStyle` auch hier liest.
 * Der versteckte Haltepunkt steht bewusst HINTER dem letzten sichtbaren: wuerde er mitgezaehlt, waere
 * `zwei` nicht mehr der letzte Haltepunkt und der vorwaerts-Rundlauf liefe ins Leere.
 */
function FokusHost() {
  const dialogRef = useWhiteboardDialogFocus(true, () => undefined);
  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" tabIndex={-1} data-testid="host-dialog">
      <button type="button" data-testid="sichtbar-1">
        eins
      </button>
      <button type="button" data-testid="sichtbar-2">
        zwei
      </button>
      <button type="button" data-testid="versteckt" style={{ display: 'none' }}>
        versteckt
      </button>
      <button type="button" data-testid="deaktiviert" disabled>
        deaktiviert
      </button>
    </div>
  );
}

async function mitFokusHost(): Promise<{ dialog: HTMLElement; abraeumen: () => Promise<void> }> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<FokusHost />);
  });
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 60);
    });
  });
  const dialog = container.querySelector<HTMLElement>('[data-testid="host-dialog"]');
  if (!dialog) throw new Error('Fokus-Host wurde nicht gerendert');
  return {
    dialog,
    abraeumen: async () => {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
}

describe('Whiteboard-Dialog: der Fokusfilter wirkt im echten DOM', () => {
  it('setzt den Anfangsfokus auf den Dialog selbst und ueberspringt versteckte Haltepunkte', async () => {
    const host = await mitFokusHost();
    try {
      expect(document.activeElement).toBe(host.dialog);

      const eins = host.dialog.querySelector<HTMLElement>('[data-testid="sichtbar-1"]');
      const zwei = host.dialog.querySelector<HTMLElement>('[data-testid="sichtbar-2"]');
      if (!eins || !zwei) throw new Error('der Fokus-Host rendert seine sichtbaren Haltepunkte nicht');

      const versteckt = host.dialog.querySelector<HTMLElement>('[data-testid="versteckt"]');
      expect(versteckt).not.toBeNull();
      expect(window.getComputedStyle(versteckt ?? host.dialog).display).toBe('none');

      zwei.focus();
      expect(document.activeElement).toBe(zwei);
      const vorwaerts = taste('Tab');
      expect(vorwaerts.defaultPrevented, 'zwei muss der letzte gezaehlte Haltepunkt sein').toBe(true);
      expect(document.activeElement).toBe(eins);

      const rueckwaerts = taste('Tab', true);
      expect(rueckwaerts.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(zwei);
      expect(document.activeElement).not.toBe(versteckt);
    } finally {
      await host.abraeumen();
    }
  });
});
