// @vitest-environment happy-dom
// STATUS: DIAMANT VGT SUPREME — VERHALTENSNACHWEIS fuer M19-Z3546 (Modul 19, Astraea Connect).
//
// DIE ANFORDERUNG steht in `audit/coverage_3334.csv` (Punkt M19-Z3546, Quelle
// `docs/module-specifications/19_Astraea_Connect_Full_Module_Spec.md:97`):
//
//   "- Barrierefreiheit, Tastaturbedienung, High-Contrast, Skalierung und
//      Screenreader-Semantik gehoeren zum Definition-of-Done."
//
// und die zugehoerige ASR-Zeile `testing/ASR_BELEGZUORDNUNG.md:71` (ASR-1986,
// "Keyboard-/Focus-/Accessible-Name-Smoke ausfuehren") fuehrte sie bis hierher
// als "**KEIN BELEG**".
//
// WAS VORHER DA WAR: Quelltextvertraege. `connectUiContract.test.mjs` liest die
// Komponenten als Zeichenkette (`readFileSync` + `toContain`, dort :44-54:
// "jedes <button> traegt onClick") und `connectUiWiring.test.tsx` prueft
// `renderToStaticMarkup`-Markup. Beide bleiben wahr, wenn nie ein Tastendruck
// ankommt: ein `aria-live`-Attribut im Markup ist noch keine Meldung, und ein
// Handler im Quelltext ist noch keine Wirkung.
//
// WAS DIESE DATEI MISST: sie rendert den echten Einstiegspunkt des Moduls
// (`ConnectView`, derselbe Aufruf wie in der Shell), loest echte
// `KeyboardEvent`s, echte Klicks und `document.activeElement` aus und liest das
// Ergebnis aus dem DOM. Die Umgebung fordert sie in Zeile 1 selbst an, weil
// `ui/vite.config.ts` bewusst KEIN globales `environment` setzt.
//
// GEMESSEN UND DESHALB NICHT BEHAUPTET (siehe auch ASR-Zeile 72):
//   * High-Contrast / `@media (forced-colors)`: happy-dom hat keine
//     CSS-Engine. Diese Datei sagt dazu nichts.
//   * Die native Tastenaktivierung von `<button>` (Enter/Leertaste) bildet
//     happy-dom NICHT nach: gemessen loeste `keydown{key:'Enter'}` am
//     Abgleich-Knopf 0 Klick-Ereignisse aus. Tastaturbedienung wird darum an
//     den Stellen gemessen, an denen CONNECT selbst auf Tasten reagiert
//     (Strg+Z / Strg+Shift+Z, IME-Schutz, Tab im Dialog).
//   * `element.focus()` allein sagt nichts: gemessen verschiebt happy-dom
//     `document.activeElement` auch bei einem `<div>` ohne `tabindex`. Wo
//     Erreichbarkeit behauptet wird, steht darum die Fokusfaelligkeit
//     (`button:not([disabled])`) und die gemessene Fokusbewegung.
//   * Ob die Kindtexte beim Skalieren wirklich mitwachsen, haengt an der
//     CSS-Engine (rem/em) und ist hier NICHT gemessen.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import { installLogicalDialogFocusManager } from '../../../shared/accessibility/accessibilityPlatform';
import { ConnectView } from '../components/ConnectView';
import { connectCopy } from '../locale/connectLocale';
import { connectExtraCopy } from '../locale/connectLocaleExtra';

// Ohne dieses Kennzeichen warnt React bei jedem `act` ("not configured to
// support act"), weil Vitest hier keinen eigenen Test-Setup-Loader hat. Kein
// `any`, kein Cast: die Deklaration des globalen Kennzeichens steht darunter.
declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Die Beschriftungen kommen aus den echten Katalogen, nicht aus dem Test. Die
 * Shell liefert ohne Provider die Vorgabe `en-US` (`workspaceLocale.tsx:52-58`);
 * die erste Zusicherung in `benennt jedes Bedienelement` belegt genau das,
 * damit hier keine erfundene Zeichenkette steht.
 */
const COPY = connectCopy('en-US');
const EXTRA = connectExtraCopy('en-US');

/**
 * Ein echtes Workspace-Dokument der Sorte `Connect`. `ConnectView` liest
 * `document.connectData` und faellt ohne dieses Feld auf
 * `DEFAULT_CONNECT_MODEL` zurueck (`ConnectView.tsx:44`) — der Test bedient
 * also den oeffentlichen Einstiegspunkt mit dem ausgelieferten Vorgabemodell.
 */
const CONNECT_DOCUMENT: WorkspaceDocument = {
  id: 'connect-runtime-document',
  title: 'Connect',
  kind: 'Connect',
  created_at: 1,
  modified_at: 1,
  version: 1,
  theme_id: 'cosmic-obsidian',
  root_object_ids: [],
  objects: {},
};

interface Zaehler {
  anzahl: number;
}

/** Ein Element ueber einen GEMESSENEN Selektor holen und sein Vorhandensein belegen. */
function bedienelement(container: HTMLElement, selektor: string): HTMLElement {
  const gefunden = container.querySelector<HTMLElement>(selektor);
  expect(gefunden, `kein Element fuer den Selektor ${selektor}`).not.toBeNull();
  return gefunden!;
}

/**
 * Der zugaengliche Name eines Bedienelements, in der Reihenfolge, in der ihn
 * eine Namensberechnung aufloest: ausdrueckliches `aria-label`, dann `title`,
 * dann der Inhalt. Nur so ist die Aussage "fuer einen Screenreader benannt"
 * ehrlich und nicht auf ein Attribut verkuerzt.
 */
function nameVon(element: HTMLElement): string {
  return (element.getAttribute('aria-label') ?? '').trim()
    || (element.getAttribute('title') ?? '').trim()
    || (element.textContent ?? '').trim();
}

/** React rendert Effekte, Fokusmanager und MutationObserver in mehreren Durchlaeufen. */
async function naechstenDurchlauf(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => {
      requestAnimationFrame(() => resolve(undefined));
    });
  });
}

/**
 * Rendert `ConnectView`, laesst React laufen, uebergibt das Wurzelelement an
 * die Pruefung und raeumt danach auf. Mit `fokusmanager` haengt der Test
 * denselben Fokusmanager an sein Wurzelelement, den die Shell in
 * `app/App.tsx:107-111` an ihr Shell-Wurzelelement haengt — der Dialog selbst
 * liefert dazu nur seine Deklaration (`role="dialog" aria-modal="true"`).
 */
async function mitGerendertemConnect(
  pruefung: (container: HTMLElement, zaehler: Zaehler) => Promise<void>,
  optionen: { readonly fokusmanager?: boolean } = {},
): Promise<void> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const zaehler: Zaehler = { anzahl: 0 };
  const aufraeumer = optionen.fokusmanager === true ? installLogicalDialogFocusManager(container) : null;
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <ConnectView document={CONNECT_DOCUMENT} onUpdateDocument={() => { zaehler.anzahl += 1; }} />,
    );
  });
  await naechstenDurchlauf();
  try {
    await pruefung(container, zaehler);
  } finally {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    aufraeumer?.();
  }
}

/** Eine echte Tastenfolge am Fenster — dort haengt der Handler von `ConnectView`. */
async function tasteAmFenster(
  init: KeyboardEventInit,
): Promise<{ readonly ereignis: KeyboardEvent; readonly abgebrochen: boolean }> {
  const ereignis = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  let abgebrochen = false;
  await act(async () => {
    abgebrochen = window.dispatchEvent(ereignis) === false;
  });
  return { ereignis, abgebrochen };
}

/** Ein echter Klick auf ein Element. */
async function klick(element: HTMLElement): Promise<void> {
  await act(async () => {
    element.click();
  });
  await naechstenDurchlauf();
}

/**
 * Zaehlt die Stern-Knoepfe einer Beschriftung. GEMESSEN: das Vorgabemodell
 * zeigt in der Mailansicht ZWEI Nachrichten — eine markierte und eine
 * unmarkierte —, also gibt es zwei Stern-Knoepfe. Eine Zusicherung auf ein
 * einzelnes Element waere darum falsch; die Zaehlung ist die ehrliche Aussage.
 */
function zaehleKnoepfe(container: HTMLElement, beschriftung: string): number {
  return container.querySelectorAll(`[aria-label="${beschriftung}"]`).length;
}

/** Jedes Bedienelement einer Ansicht muss ohne Maus einen Namen haben. */
function pruefeBenennung(container: HTMLElement, ansicht: string): number {
  const elemente = Array.from(container.querySelectorAll<HTMLElement>('button, input, textarea, select'));
  expect(elemente.length, `${ansicht}: es wurden keine Bedienelemente gefunden`).toBeGreaterThan(0);
  for (const element of elemente) {
    expect(
      nameVon(element),
      `${ansicht}: ein Bedienelement hat keinen zugaenglichen Namen: ${element.outerHTML.slice(0, 160)}`,
    ).not.toBe('');
  }
  return elemente.length;
}

describe('M19-Z3546 — Tastaturbedienung, Fokusfuehrung und Screenreader-Semantik von Connect wirken im Betrieb', () => {
  it('macht die letzte Aenderung mit Strg+Z rueckgaengig und wiederholt sie mit Strg+Shift+Z', async () => {
    await mitGerendertemConnect(async (container, zaehler) => {
      const rueckgaengig = bedienelement(container, `[role="toolbar"] button[aria-label="${COPY.undo}"]`);
      // Der Ausgangszustand muss belegt sein: ist der Verlauf nicht leer, waere
      // "Strg+Z hat etwas rueckgaengig gemacht" nicht messbar.
      expect(rueckgaengig.getAttribute('disabled'), 'der Verlauf muss zu Beginn leer sein').not.toBeNull();

      const unmarkiert = zaehleKnoepfe(container, COPY.unstar);
      const markiert = zaehleKnoepfe(container, COPY.star);
      expect(unmarkiert, 'das Vorgabemodell muss eine markierte Nachricht enthalten').toBeGreaterThan(0);
      expect(markiert, 'das Vorgabemodell muss eine unmarkierte Nachricht enthalten').toBeGreaterThan(0);

      const sternGesetzt = bedienelement(container, `[aria-label="${COPY.unstar}"]`);
      expect(sternGesetzt.tagName).toBe('BUTTON');
      // Die Fokusfaelligkeit ist das, was die Tabulatortaste braucht; `focus()`
      // allein beweist in dieser Umgebung nichts (siehe Kopfkommentar).
      expect(sternGesetzt.matches('button:not([disabled])'), 'der Stern-Knopf ist nicht per Tabulator erreichbar').toBe(true);

      await klick(sternGesetzt);
      expect(zaehleKnoepfe(container, COPY.unstar), 'die Markierung muss wirklich entfernt sein').toBe(unmarkiert - 1);
      expect(zaehleKnoepfe(container, COPY.star)).toBe(markiert + 1);
      expect(rueckgaengig.getAttribute('disabled'), 'der Verlauf muss die Aenderung jetzt kennen').toBeNull();
      const nachKlick = zaehler.anzahl;
      expect(nachKlick, 'die Aenderung muss als Dokument weitergereicht worden sein').toBeGreaterThan(0);

      const zurueck = await tasteAmFenster({ key: 'z', ctrlKey: true });
      expect(
        zurueck.abgebrochen,
        'Strg+Z ist ein Connect-Kuerzel und muss die Voreinstellung des Browsers abschalten',
      ).toBe(true);
      expect(zurueck.ereignis.defaultPrevented).toBe(true);
      expect(zaehleKnoepfe(container, COPY.unstar), 'die Markierung muss zurueck sein').toBe(unmarkiert);
      expect(zaehleKnoepfe(container, COPY.star)).toBe(markiert);
      expect(zaehler.anzahl, 'das Rueckgaengigmachen muss das Dokument fortschreiben').toBeGreaterThan(nachKlick);

      const wieder = await tasteAmFenster({ key: 'z', ctrlKey: true, shiftKey: true });
      expect(wieder.abgebrochen, 'Strg+Shift+Z muss ebenso die Voreinstellung abschalten').toBe(true);
      expect(zaehleKnoepfe(container, COPY.unstar), 'die Wiederholung muss die Aenderung erneut anwenden').toBe(unmarkiert - 1);
      expect(zaehleKnoepfe(container, COPY.star)).toBe(markiert + 1);

      // Strg+Alt+Z ist kein Connect-Kuerzel (`!e.altKey` in ConnectView.tsx:56):
      // es darf nichts rueckgaengig machen, obwohl der Verlauf es koennte.
      const mitAlt = await tasteAmFenster({ key: 'z', ctrlKey: true, altKey: true });
      expect(mitAlt.abgebrochen, 'Strg+Alt+Z gehoert nicht Connect').toBe(false);
      expect(
        zaehleKnoepfe(container, COPY.unstar),
        'ein Kuerzel mit Alt darf nichts rueckgaengig machen',
      ).toBe(unmarkiert - 1);
    });
  });

  it('laesst Tastenfolgen einer Eingabemethode unangetastet und greift danach weiter', async () => {
    await mitGerendertemConnect(async (container) => {
      const unmarkiert = zaehleKnoepfe(container, COPY.unstar);
      expect(unmarkiert, 'das Vorgabemodell muss eine markierte Nachricht enthalten').toBeGreaterThan(0);
      await klick(bedienelement(container, `[aria-label="${COPY.unstar}"]`));
      // Ausgangszustand: es GIBT etwas rueckgaengig zu machen.
      expect(zaehleKnoepfe(container, COPY.unstar)).toBe(unmarkiert - 1);

      const waehrendKomposition: ReadonlyArray<{ readonly name: string; readonly init: KeyboardEventInit }> = [
        { name: 'isComposing', init: { key: 'z', ctrlKey: true, isComposing: true } },
        { name: 'keyCode 229', init: { key: 'z', ctrlKey: true, keyCode: 229 } },
        { name: 'key Process', init: { key: 'Process', ctrlKey: true } },
      ];
      for (const fall of waehrendKomposition) {
        const gemessen = await tasteAmFenster(fall.init);
        expect(
          gemessen.abgebrochen,
          `${fall.name}: eine Tastenfolge der Eingabemethode darf Connect nicht wegnehmen`,
        ).toBe(false);
        expect(
          zaehleKnoepfe(container, COPY.unstar),
          `${fall.name}: waehrend einer Komposition darf nichts rueckgaengig gemacht werden`,
        ).toBe(unmarkiert - 1);
      }

      // Kontrolle: DASSELBE Kuerzel ohne Komposition greift — der Verlauf war
      // die ganze Zeit gefuellt. Ohne diese Zusicherung waere "nichts passiert"
      // auch dann wahr, wenn es nichts rueckgaengig zu machen gaebe.
      const echt = await tasteAmFenster({ key: 'z', ctrlKey: true });
      expect(echt.abgebrochen).toBe(true);
      expect(zaehleKnoepfe(container, COPY.unstar)).toBe(unmarkiert);
    });
  });

  it('skaliert die Wurzel der Oberflaeche ueber die Werkzeugleiste und meldet den Wert im Live-Bereich', async () => {
    await mitGerendertemConnect(async (container) => {
      const wurzel = bedienelement(container, '[data-vgt-connect-root="true"]');
      const anzeige = bedienelement(container, '[role="toolbar"] output');
      expect(anzeige.getAttribute('aria-live'), 'die Anzeige muss angesagt werden').toBe('polite');
      expect(wurzel.style.fontSize).toBe('100%');
      expect(anzeige.textContent).toBe('100%');

      const groesser = bedienelement(container, `[role="toolbar"] button[aria-label="${COPY.increaseScale}"]`);
      const kleiner = bedienelement(container, `[role="toolbar"] button[aria-label="${COPY.decreaseScale}"]`);
      expect(groesser.tagName).toBe('BUTTON');
      expect(kleiner.matches('button:not([disabled])'), 'der Verkleinern-Knopf ist nicht erreichbar').toBe(true);

      await klick(groesser);
      expect(wurzel.style.fontSize, 'die Stufe 125 muss an der Wurzel ankommen').toBe('125%');
      expect(anzeige.textContent).toBe('125%');
      await klick(groesser);
      expect(wurzel.style.fontSize).toBe('150%');

      await klick(kleiner);
      expect(wurzel.style.fontSize).toBe('125%');
      await klick(kleiner);
      expect(wurzel.style.fontSize).toBe('100%');
      // Untergrenze: unter 100 % geht es nicht.
      await klick(kleiner);
      expect(wurzel.style.fontSize, 'die Untergrenze von 100 % muss halten').toBe('100%');
      expect(anzeige.textContent).toBe('100%');

      // Obergrenze: SCALE_STEPS endet bei 300.
      for (let schritt = 0; schritt < 6; schritt += 1) await klick(groesser);
      expect(wurzel.style.fontSize).toBe('300%');
      expect(anzeige.textContent).toBe('300%');
      await klick(groesser);
      expect(wurzel.style.fontSize, 'die Obergrenze von 300 % muss halten').toBe('300%');
    });
  });

  it('meldet den blockierten Abgleich im Live-Bereich, statt still zu bleiben', async () => {
    await mitGerendertemConnect(async (container) => {
      const status = bedienelement(container, '[data-connect-sync-status]');
      expect(status.getAttribute('role')).toBe('status');
      expect(status.getAttribute('aria-live')).toBe('polite');
      expect(status.getAttribute('data-connect-sync-status')).toBe('idle');
      expect(status.textContent).toBe(EXTRA.syncNever);
      expect(container.querySelector('[role="progressbar"]'), 'ohne Abgleich darf kein Fortschritt erfunden werden').toBeNull();

      const eintrag = bedienelement(container, '[data-connect-sync-entry="true"]');
      expect(eintrag.tagName).toBe('BUTTON');
      expect(eintrag.getAttribute('aria-label')).toBe(EXTRA.syncNow);
      expect(eintrag.matches('button:not([disabled])'), 'der Abgleich-Eintrag ist nicht erreichbar').toBe(true);

      await klick(eintrag);
      // Ohne Transport wird nichts abgerufen — und genau das muss angesagt
      // werden, in der Wortwahl des Katalogs, nicht als Erfolgsmeldung.
      expect(status.getAttribute('data-connect-sync-status')).toBe('blocked');
      expect(status.textContent).toBe(EXTRA.syncNoCapability);
      expect(container.querySelector('[role="progressbar"]'), 'ein blockierter Abgleich hat keinen Fortschritt').toBeNull();

      // Der Zustand kommt auch im begrenzten Benachrichtigungsbereich an.
      const zaehlerAnzeige = bedienelement(container, '[data-connect-notification-count]');
      expect(zaehlerAnzeige.textContent).toBe('1');
      expect(zaehlerAnzeige.getAttribute('data-connect-notification-count')).toBe('1');
    });
  });

  it('benennt jedes Bedienelement in allen Ansichten, im Benachrichtigungsbereich und im Dialog', async () => {
    await mitGerendertemConnect(async (container) => {
      const wurzel = bedienelement(container, '[data-vgt-connect-root="true"]');
      expect(wurzel.getAttribute('role')).toBe('application');
      expect(wurzel.getAttribute('aria-label'), 'die Anwendung muss sich benennen').toBe(COPY.appLabel);

      expect(pruefeBenennung(container, 'Mail')).toBeGreaterThan(0);
      // Die drei Ansichtswechsel tragen nur ein Symbol; ihr Name kommt allein
      // aus `aria-label`/`title` und ist der einzige Kanal zu einem Screenreader.
      for (const beschriftung of [COPY.mail, COPY.calendar, COPY.contacts]) {
        expect(bedienelement(container, `button[aria-label="${beschriftung}"]`).tagName).toBe('BUTTON');
      }
      // Das Suchfeld traegt einen ausdruecklichen Namen, nicht nur einen Platzhalter.
      const suche = bedienelement(container, `input[aria-label="${COPY.searchAccessible}"]`);
      expect(suche.tagName).toBe('INPUT');

      await klick(bedienelement(container, `button[aria-label="${COPY.calendar}"]`));
      bedienelement(container, '[data-connect-action="calendar-new-event"]');
      pruefeBenennung(container, 'Kalender');

      await klick(bedienelement(container, `button[aria-label="${COPY.contacts}"]`));
      bedienelement(container, '[data-connect-contact-search="true"]');
      pruefeBenennung(container, 'Kontakte');

      await klick(bedienelement(container, `button[aria-label="${COPY.mail}"]`));
      await klick(bedienelement(container, '[data-connect-notification-entry="true"]'));
      bedienelement(container, '[data-connect-notification-tray="true"]');
      pruefeBenennung(container, 'Benachrichtigungen');
    });
  });

  it('verbindet jedes Feld des Kontodialogs mit einem Namen und einer Beschriftung', async () => {
    await mitGerendertemConnect(async (container) => {
      await klick(bedienelement(container, '[data-connect-account-entry="true"]'));
      const dialog = bedienelement(container, '[data-connect-account-dialog="true"]');
      expect(dialog.getAttribute('role')).toBe('dialog');
      expect(dialog.getAttribute('aria-label'), 'der Dialog muss einen Namen haben').toBe(EXTRA.accountSettings);

      const felder = Array.from(dialog.querySelectorAll<HTMLInputElement>('input[data-connect-account-field]'));
      expect(felder.length, 'der Dialog muss seine Felder ausweisen').toBeGreaterThan(0);
      for (const feld of felder) {
        expect(feld.getAttribute('aria-label')?.trim(), 'ein Feld ohne ausdruecklichen Namen').not.toBe('');
      }

      // Die sichtbare Beschriftung muss auf das Feld zeigen — sonst hoert ein
      // Screenreader beim Fokussieren den Feldnamen nicht.
      const beschriftungen = Array.from(dialog.querySelectorAll<HTMLLabelElement>('label[for]'));
      expect(beschriftungen.length, 'der Dialog muss seine Felder beschriften').toBe(felder.length);
      for (const beschriftung of beschriftungen) {
        const ziel = beschriftung.getAttribute('for') ?? '';
        expect(ziel, 'eine Beschriftung ohne Ziel').not.toBe('');
        expect(
          dialog.querySelector(`[id="${ziel}"]`),
          `die Beschriftung "${ziel}" zeigt auf kein Element`,
        ).not.toBeNull();
      }
    });
  });

  it('fuehrt den Fokus in den Kontodialog, haelt ihn dort und gibt ihn zurueck', async () => {
    await mitGerendertemConnect(async (container) => {
      // GEMESSEN (Hinweis der Pruefung, hier nachgemessen): happy-dom setzt
      // `document.activeElement` auf JEDES Element, auch auf ein `<div>` ohne
      // tabindex. `fokus(); expect(document.activeElement).toBe(X)` ist darum
      // ALLEIN WERTLOS. Tragen tut hier der WECHSEL zwischen zwei Elementen,
      // ausgeloest durch eine Handlung:
      //   A Ausloeser -> B erstes Dialogfeld -> C letzter Knopf -> A.
      // Die Erreichbarkeit steht als Attribut da (`button:not([disabled])`).
      const ausloeser = bedienelement(container, '[data-connect-account-entry="true"]');
      expect(ausloeser.tagName).toBe('BUTTON');
      expect(ausloeser.matches('button:not([disabled])'), 'der Konto-Eintrag ist nicht erreichbar').toBe(true);
      ausloeser.focus(); // nur der Ausgangspunkt A der Bewegung, kein Nachweis
      expect(document.activeElement, 'Ausgangspunkt A muss stehen, sonst ist der Wechsel nicht lesbar').toBe(ausloeser);

      await klick(ausloeser);
      const dialog = bedienelement(container, '[data-connect-account-dialog="true"]');
      expect(dialog.getAttribute('role')).toBe('dialog');
      expect(dialog.getAttribute('aria-modal'), 'ohne diese Deklaration findet der Fokusmanager den Dialog nicht').toBe('true');

      const erstesFeld = bedienelement(dialog, 'input[data-connect-account-field="displayName"]');
      // A -> B: der Fokus hat den Ausloeser verlassen und liegt jetzt im Dialog.
      expect(document.activeElement, 'der Anfangsfokus muss im Dialog liegen').toBe(erstesFeld);

      // B -> C: der Fokus wandert innerhalb des offenen Dialogs.
      const letzterKnopf = bedienelement(dialog, '[data-connect-account-create="true"]');
      letzterKnopf.focus();
      expect(document.activeElement).toBe(letzterKnopf);
      // C -> B: die Tabulatortaste darf den Dialog nicht verlassen.
      const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
      await act(async () => {
        letzterKnopf.dispatchEvent(tab);
      });
      expect(tab.defaultPrevented, 'Tab darf den Dialog nicht verlassen').toBe(true);
      expect(document.activeElement).toBe(erstesFeld);

      // B -> C rueckwaerts: auch Shift+Tab bleibt im Dialog.
      const rueckwaerts = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
      await act(async () => {
        erstesFeld.dispatchEvent(rueckwaerts);
      });
      expect(rueckwaerts.defaultPrevented, 'Shift+Tab darf den Dialog nicht verlassen').toBe(true);
      expect(document.activeElement).toBe(letzterKnopf);

      // C -> A: beim Schliessen kehrt der Fokus zum Ausloeser zurueck. Ohne
      // diese Rueckgabe stuende er noch auf dem letzten Knopf des Dialogs.
      const abbrechen = Array.from(dialog.querySelectorAll<HTMLButtonElement>('button'))
        .find((knopf) => knopf.textContent?.trim() === EXTRA.close);
      expect(abbrechen, `kein Knopf mit der Beschriftung "${EXTRA.close}" gefunden`).toBeDefined();
      await klick(abbrechen!);
      expect(container.querySelector('[data-connect-account-dialog="true"]'), 'der Dialog muss geschlossen sein').toBeNull();
      expect(document.activeElement, 'der Fokus muss zum ausloesenden Bedienelement zurueckkehren').toBe(ausloeser);
    }, { fokusmanager: true });
  });
});
