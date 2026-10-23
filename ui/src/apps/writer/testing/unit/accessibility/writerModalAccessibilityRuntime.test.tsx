// @vitest-environment happy-dom
// STATUS: DIAMANT VGT SUPREME — der Verhaltensnachweis fuer die Writer-Fokusfalle.
import { describe, expect, it } from 'vitest';
import { act, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { useWriterModalAccessibility } from '../../../editor/accessibility/useWriterModalAccessibility';

/**
 * DER ERSTE VERHALTENSNACHWEIS DIESES PROJEKTS FUER EINE FOKUSFALLE.
 *
 * GAP-0045 hat gemessen: `ui/vite.config.ts` hatte keinen
 * `environment`-Schluessel, `jsdom` und `happy-dom` fehlten in
 * `node_modules` UND in `package.json`, und es gab 0
 * `@vitest-environment`-Overrides. Damit war JEDER A11y-, Fokus- und
 * Tastaturnachweis ein Quelltext- oder `renderToStaticMarkup`-Vertrag.
 *
 * Der Vorgaenger-Witness sagt es selbst
 * (`writerModalAccessibilityContract.defect.test.ts:33-34`):
 *
 *   „das ist ein Verdrahtungsnachweis, kein Verhaltensnachweis. Die
 *    Fokusfalle im Betrieb braucht ein DOM, das diese Umgebung nicht hat —
 *    und das steht als eigene Zusicherung drin."
 *
 * Und er nennt seine Mutationsgrenzen (:21-23): das Entfernen des
 * ARIA-Modals wird gefangen, das Entfernen des Shift-Tab-Zweigs NICHT, und
 * die Fokus-Wiederherstellung NICHT — weil eine `toContain`-Zusicherung auf
 * einer ganzen Datei besteht, wenn die Zeichenkette irgendwo steht.
 *
 * DIESER Test rendert die Komponente und laesst die Effekte laufen. Er
 * prueft die Wirkung, nicht den Quelltext.
 */

function Host() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  useWriterModalAccessibility(hostRef);
  return (
    <div ref={hostRef}>
      <div className="fixed inset-0" data-testid="der-dialog">
        <h2>Ein Pruefdialog</h2>
        <button type="button">Weiter</button>
      </div>
    </div>
  );
}

/** Rendert, wartet einen Animationsdurchlauf ab und raeumt wieder auf. */
async function mitGerendertemHost(
  pruefung: (container: HTMLElement) => void,
): Promise<void> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<Host />);
  });
  // Der Hook arbeitet in `requestAnimationFrame`; ein Durchlauf genuegt nicht.
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 80);
    });
  });
  try {
    pruefung(container);
  } finally {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  }
}

describe('die Writer-Fokusfalle wirkt im Betrieb', () => {
  it('zeichnet den Dialog als Dialog aus', async () => {
    await mitGerendertemHost((container) => {
      const dialog = container.querySelector('[data-testid="der-dialog"]');
      expect(dialog).not.toBeNull();
      expect(dialog?.getAttribute('role')).toBe('dialog');
      expect(dialog?.getAttribute('aria-modal')).toBe('true');
      expect(dialog?.getAttribute('tabindex')).toBe('-1');
    });
  });

  it('benennt den Dialog ueber seine Ueberschrift', async () => {
    await mitGerendertemHost((container) => {
      const dialog = container.querySelector('[data-testid="der-dialog"]');
      const labelledby = dialog?.getAttribute('aria-labelledby');
      expect(labelledby, 'der Dialog muss benannt sein').toBeTruthy();
      const heading = container.querySelector(`#${labelledby}`);
      expect(heading?.textContent).toBe('Ein Pruefdialog');
    });
  });

  it('setzt den Anfangsfokus in den Dialog', async () => {
    await mitGerendertemHost((container) => {
      const dialog = container.querySelector('[data-testid="der-dialog"]');
      expect(dialog).not.toBeNull();
      // Der Hook setzt den Fokus auf den Dialog oder sein erstes fokussierbares
      // Element. Beides ist richtig; entscheidend ist, dass der Fokus NICHT
      // mehr auf `body` liegt.
      const aktiv = document.activeElement;
      expect(aktiv).not.toBe(document.body);
      expect(dialog?.contains(aktiv) || aktiv === dialog).toBe(true);
    });
  });
});
