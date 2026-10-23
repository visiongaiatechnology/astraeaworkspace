// @vitest-environment happy-dom
// STATUS: DIAMANT VGT SUPREME — der Nachweis fuer GAP-0050 (die Mail-Zeilen).
//
// DER BEFUND, gemessen in Runde 276:
//
//   `ConnectMailList.tsx:66-76` rendert jede Nachricht als
//       <div key={msg.id} onClick={() => handleSelect(msg.id)}
//            className="p-3 cursor-pointer ...">
//   — mit `cursor-pointer`, aber OHNE `role`, OHNE `tabIndex` und OHNE
//   `onKeyDown`. Die Zeile SIEHT bedienbar aus und ist es mit der Maus; mit
//   der Tastatur ist sie es nicht. M19-Z3546 verlangt "Tastaturbedienung"
//   ausdruecklich als Teil des Definition-of-Done.
//
// GEFUNDEN HAT IHN NICHT MEIN AUDIT, sondern der Agent, der den
// Verhaltensnachweis fuer M19-Z3546 geschrieben hat. Er hat ihn ausdruecklich
// NICHT als Zusicherung formuliert — ein Test auf einen Mangel wird nach
// dessen Behebung rot. Genau deshalb steht er hier: JETZT ist er behoben, und
// dieser Test haelt die Behebung fest.
//
// WAS DIESER TEST MISST — und was nicht:
//   * Gemessen: die Zeile ist ein `role="option"` mit `tabIndex === 0` in
//     einer `role="listbox"`, traegt `aria-selected`, und ein echtes
//     Enter-/Leertaste-Ereignis auf der fokussierten Zeile WAEHLT SIE AUS.
//   * NICHT gemessen: dass der Browser sie per Tab anspringt — happy-dom hat
//     keine Tab-Navigation. `tabIndex === 0` ist die Bedingung dafuer, nicht
//     der Beweis; das bleibt ein NATIVE Release-Gate.
//   * NICHT gemessen: die native Tastenaktivierung, die happy-dom nicht
//     nachbildet — deshalb wird `onKeyDown` hier DIREKT gemessen.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import { ConnectView } from '../components/ConnectView';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const CONNECT_DOKUMENT: WorkspaceDocument = {
  id: 'connect-gap0050-document',
  title: 'Connect',
  kind: 'Connect',
  created_at: 1,
  modified_at: 1,
  version: 1,
  theme_id: 'cosmic-obsidian',
  root_object_ids: [],
  objects: {},
};

async function mitGerendertemConnect(
  pruefung: (container: HTMLElement) => Promise<void>,
): Promise<void> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<ConnectView document={CONNECT_DOKUMENT} onUpdateDocument={() => undefined} />);
  });
  await act(async () => {
    await new Promise((resolve) => {
      requestAnimationFrame(() => resolve(undefined));
    });
  });
  try {
    await pruefung(container);
  } finally {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  }
}

/** Die Nachrichtenzeilen der Liste. */
function zeilen(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[role="option"]'));
}

describe('die Mail-Zeilen in Connect sind tastaturbedienbar (GAP-0050)', () => {
  it('rendert die Liste als listbox und die Zeilen als Optionen', async () => {
    await mitGerendertemConnect(async (container) => {
      const liste = container.querySelector<HTMLElement>('[role="listbox"]');
      expect(liste, 'die Nachrichtenliste braucht role="listbox"').not.toBeNull();
      expect(
        (liste?.getAttribute('aria-label') ?? '').length,
        'die Liste braucht einen zugaenglichen Namen',
      ).toBeGreaterThan(0);

      const gefunden = zeilen(container);
      expect(gefunden.length, 'die Vorgabemodelle liefern Nachrichten').toBeGreaterThan(0);
    });
  });

  it('gibt jeder Zeile eine Tab-Position und einen Auswahlzustand', async () => {
    await mitGerendertemConnect(async (container) => {
      for (const zeile of zeilen(container)) {
        // `tabIndex === 0` ist die BEDINGUNG dafuer, dass die sequenzielle
        // Fokusnavigation die Zeile erreicht. Ein negativer Wert waere per
        // Skript fokussierbar, aber nicht per Tab.
        expect(zeile.tabIndex, 'jede Zeile muss in der Tab-Reihenfolge liegen').toBe(0);
        expect(
          zeile.hasAttribute('aria-selected'),
          'jede Zeile muss ihren Auswahlzustand tragen',
        ).toBe(true);
      }
    });
  });

  it('waehlt eine Zeile per Enter aus', async () => {
    await mitGerendertemConnect(async (container) => {
      const gefunden = zeilen(container);
      const erste = gefunden[0];
      const zweite = gefunden[1];
      expect(zweite, 'fuer diesen Test braucht es mindestens zwei Nachrichten').toBeDefined();

      // Ausgangszustand herstellen und BELEGEN: die erste Zeile ist gewaehlt.
      // Ohne diesen Beleg waere der Test gruen, wenn gar nichts ausgewaehlt ist.
      await act(async () => {
        erste.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        await Promise.resolve();
      });
      const nachKlick = zeilen(container);
      expect(nachKlick[0]?.getAttribute('aria-selected')).toBe('true');

      // UND JETZT DER TASTENWEG: Enter auf der ZWEITEN Zeile.
      await act(async () => {
        zweite.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
        );
        await Promise.resolve();
      });
      const nachEnter = zeilen(container);
      expect(
        nachEnter[1]?.getAttribute('aria-selected'),
        'Enter muss die Zeile auswaehlen',
      ).toBe('true');
      expect(
        nachEnter[0]?.getAttribute('aria-selected'),
        'die vorher gewaehlte Zeile darf nicht gewaehlt bleiben',
      ).toBe('false');
    });
  });

  it('waehlt eine Zeile per Leertaste aus und verhindert das Scrollen', async () => {
    await mitGerendertemConnect(async (container) => {
      const gefunden = zeilen(container);
      const zweite = gefunden[1];
      expect(zweite).toBeDefined();

      let verhindert = false;
      await act(async () => {
        const ereignis = new KeyboardEvent('keydown', {
          key: ' ',
          bubbles: true,
          cancelable: true,
        });
        zweite.dispatchEvent(ereignis);
        verhindert = ereignis.defaultPrevented;
        await Promise.resolve();
      });

      // Die Leertaste scrollt von sich aus. Wird sie nicht abgefangen, springt
      // die Liste statt auszuwaehlen.
      expect(verhindert, 'die Leertaste muss abgefangen werden').toBe(true);
      expect(zeilen(container)[1]?.getAttribute('aria-selected')).toBe('true');
    });
  });

  it('laesst eine fremde Taste die Auswahl unberuehrt', async () => {
    await mitGerendertemConnect(async (container) => {
      const gefunden = zeilen(container);
      const zweite = gefunden[1];
      expect(zweite).toBeDefined();
      const vorher = zweite.getAttribute('aria-selected');

      await act(async () => {
        zweite.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'x', bubbles: true, cancelable: true }),
        );
        await Promise.resolve();
      });
      expect(
        zeilen(container)[1]?.getAttribute('aria-selected'),
        'die Taste x darf nichts auswaehlen',
      ).toBe(vorher);
    });
  });
});
