// @vitest-environment happy-dom
// STATUS: DIAMANT VGT SUPREME — die Fokusfuehrung des Writers, im Betrieb gemessen.
import { describe, expect, it } from 'vitest';
import { act, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useWriterFocusMode } from '../../../../editor/focus/useWriterFocusMode';
import type { ViewMode } from '../../../../types';

/**
 * M01-Z0297 verlangt: „Tastaturbedienung, Screenreader-Semantik, High-Contrast,
 * **Fokusfuehrung** und skalierbare UI gehoeren zum Definition-of-Done."
 *
 * Der GAP-Text sagt: „Zusaetzlich fehlt ein ausfuehrender Nachweis mit
 * Rot-bei-Entfernung."
 *
 * UND DER BESTEHENDE TEST IST KEINER. Er steht in
 * `testing/unit/editor/focus/useWriterFocusMode.test.ts` und mockt genau das,
 * was er nachweisen soll (:12-25):
 *
 *   const previousElement = previousElementState as unknown as HTMLElement;
 *   const exitButton = { focus: vi.fn() } as unknown as HTMLButtonElement;
 *   scheduleFocus: (callback) => { scheduled.push(callback); },
 *
 * und prueft dann (:65):
 *
 *   expect(fixture.exitButton.focus).toHaveBeenCalledOnce();
 *
 * Das ist die Aussage „die Methode `focus` wurde gerufen" — NICHT „der Fokus
 * ist dort". Dazwischen liegt alles, was schiefgehen kann: ein Element, das
 * nicht fokussierbar ist, eines das beim Fokussieren sofort wieder verliert,
 * ein `requestAnimationFrame`, das nie laeuft.
 *
 * DIESER Test rendert den Hook, laesst das ECHTE `requestAnimationFrame`
 * laufen und liest `document.activeElement`.
 */

interface Steuerung {
  readonly setzeModus: (modus: ViewMode) => void;
  readonly verlasseFokus: () => void;
}

function FokusHost({ bereit }: { readonly bereit: (steuerung: Steuerung) => void }) {
  const [modus, setModus] = useState<ViewMode>('reading');
  const { focusExitButtonRef, handleSetViewMode, handleExitFocusMode } = useWriterFocusMode(
    modus,
    setModus,
    () => {
      setModus('reading');
    },
  );
  // Die Steuerung wird ueber ein Ref nach aussen gegeben, damit der Test nicht
  // bei jedem Render eine neue Funktion bekommt.
  const neueste = useRef({ handleSetViewMode, handleExitFocusMode });
  neueste.current = { handleSetViewMode, handleExitFocusMode };
  useEffect(() => {
    bereit({
      setzeModus: (ziel: ViewMode) => {
        neueste.current.handleSetViewMode(ziel);
      },
      verlasseFokus: () => {
        neueste.current.handleExitFocusMode();
      },
    });
  }, [bereit]);
  return (
    <div>
      <button type="button" data-testid="vorher">
        Ein anderes Element
      </button>
      <button type="button" ref={focusExitButtonRef} data-testid="exit">
        Fokus verlassen
      </button>
    </div>
  );
}

/** Rendert den Host, gibt die Steuerung heraus und raeumt am Ende auf. */
async function mitHost(
  pruefung: (container: HTMLElement, steuerung: Steuerung) => Promise<void>,
): Promise<void> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  let steuerung: Steuerung | null = null;
  const bereit = (s: Steuerung) => {
    steuerung = s;
  };
  await act(async () => {
    root.render(<FokusHost bereit={bereit} />);
  });
  if (!steuerung) {
    throw new Error('die Steuerung wurde nicht herausgegeben');
  }
  try {
    await pruefung(container, steuerung);
  } finally {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  }
}

/** Laesst das echte `requestAnimationFrame` des Hooks laufen. */
async function naechstenFrame(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 80);
    });
  });
}

describe('die Fokusfuehrung des Writers wirkt im Betrieb', () => {
  it('setzt den Fokus beim Betreten auf den Verlassen-Knopf', async () => {
    await mitHost(async (container, steuerung) => {
      const vorher = container.querySelector<HTMLElement>('[data-testid="vorher"]');
      const exit = container.querySelector<HTMLElement>('[data-testid="exit"]');
      expect(vorher).not.toBeNull();
      expect(exit).not.toBeNull();

      // Der Nutzer steht auf einem anderen Element, wenn er den Fokusmodus waehlt.
      vorher?.focus();
      expect(document.activeElement).toBe(vorher);

      await act(async () => {
        steuerung.setzeModus('focus');
      });
      await naechstenFrame();

      // UND DAS IST DER UNTERSCHIED ZUM MOCK-TEST: nicht „focus wurde gerufen",
      // sondern „der Fokus IST dort".
      expect(document.activeElement).toBe(exit);
    });
  });

  it('gibt den Fokus beim Verlassen an das vorherige Element zurueck', async () => {
    await mitHost(async (container, steuerung) => {
      const vorher = container.querySelector<HTMLElement>('[data-testid="vorher"]');
      const exit = container.querySelector<HTMLElement>('[data-testid="exit"]');
      vorher?.focus();

      await act(async () => {
        steuerung.setzeModus('focus');
      });
      await naechstenFrame();

      // DER AUSGANGSZUSTAND MUSS BELEGT SEIN, sonst ist die Rueckgabe nicht
      // messbar. GEMESSEN: ohne diese Zusicherung blieb der Test GRUEN, als
      // der Fokus-GEWINN entfernt war — der Fokus stand dann nie auf dem
      // Exit-Knopf, und „er ist wieder bei `vorher`" war aus dem falschen
      // Grund wahr. Ein Test, der den Ausgangszustand nicht belegt, prueft
      // die Rueckkehr eines Fokus, der nie weg war.
      expect(document.activeElement).toBe(exit);

      await act(async () => {
        steuerung.verlasseFokus();
      });
      await naechstenFrame();

      expect(document.activeElement).toBe(vorher);
    });
  });

  it('wechselt bei einem gewoehnlichen Moduswechsel den Fokus nicht', async () => {
    await mitHost(async (container, steuerung) => {
      const vorher = container.querySelector<HTMLElement>('[data-testid="vorher"]');
      vorher?.focus();

      await act(async () => {
        steuerung.setzeModus('reading');
      });
      await naechstenFrame();

      // Wer nicht in den Fokusmodus wechselt, verliert seinen Platz nicht.
      expect(document.activeElement).toBe(vorher);
    });
  });
});
