// @vitest-environment happy-dom
// STATUS: DIAMANT VGT SUPREME — der Verhaltensnachweis fuer M17-Z3392 im Betrieb.
//
// Die Anforderungszeile lautet:
//   „- Barrierefreiheit, Tastaturbedienung, High-Contrast, Skalierung und Screenreader-Semantik
//     gehören zum Definition-of-Done."
//   (`docs/module-specifications/17_Astraea_Publish_Full_Module_Spec.md:L96 -> Z3392`, ASR-1846)
//
// Der bisherige Nachweis war ein Markup-Vertrag: `testing/startup/publishViewRenderWitness.test.tsx`
// prueft `renderToStaticMarkup(...).length > 0` und Gleichheit zweier Strings. Ein String kennt keinen
// Fokus, keinen Tastendruck und kein `aria-pressed`.
//
// Diese Datei rendert die **echte** `PublishView` in ein DOM, setzt den Fokus auf einen echten
// Rahmenknoten und schickt echte `keydown`-Ereignisse. Geprueft wird am lebenden Knoten:
// `document.activeElement`, `defaultPrevented`, die Rahmenposition in `style.left` (0,1 mm je Taste,
// 10 mm mit Umschalt), das Verschwinden des Textfeldes beim Aufheben der Auswahl und die
// Bedienoberflaechennamen. Faellt `onFocus={() => handleFrameSelect(frame.id)}`
// (`canvas/PublishCanvas.tsx:417`), die Tastaturabsicht (`model/publishFrameOps.ts:56-65`) oder die
// Tastenverdrahtung (`PublishView.tsx:168-200`), wird diese Datei rot.

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';
import type { WorkspaceLocale } from '../../../../shell/localization/workspaceLocaleTypes';
import { PublishView } from '../../PublishView';
import { publishToolbarText } from '../../publishToolbarLocale';

/** Ohne `WorkspaceLocaleProvider` ist die Vorgabe `en-US`; der Katalog ist damit die eine Quelle der Namen. */
const EN: WorkspaceLocale = 'en-US';

/** Der erste Textrahmen der Vorgabeseite: 15 mm links, 180 mm breit (`model/publishDocumentEngine.ts`). */
const RAHMEN_ID = 'frame-header-1';
/** 3,78 px je mm bei Zoom 100 % (`canvas/PublishCanvas.tsx:57`). */
const PX_JE_MM = 3.78;

const DOKUMENT: WorkspaceDocument = {
  id: 'publish-keyboard-focus-witness',
  title: 'Publish Tastatur- und Fokuswitness',
  kind: 'Publish',
  created_at: 0,
  modified_at: 0,
  version: 1,
  theme_id: 'default',
  root_object_ids: [],
  objects: {},
};

const OHNE_WIRKUNG = (): void => undefined;

interface Gerendert {
  readonly container: HTMLElement;
  readonly abbauen: () => Promise<void>;
}

/** Rendert die echte Anwendung in ein haengendes DOM und laesst React und die Effekte durchlaufen. */
async function renderePublish(): Promise<Gerendert> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const reactWurzel = createRoot(container);
  await act(async () => {
    reactWurzel.render(<PublishView document={DOKUMENT} onUpdateDocument={OHNE_WIRKUNG} />);
  });
  await act(async () => {
    await new Promise((erfuellt) => setTimeout(erfuellt, 0));
  });
  if (!container.querySelector('[data-vgt-publish-root="true"]')) {
    throw new Error('die PublishView hat ihre Wurzel nicht gerendert.');
  }
  return {
    container,
    abbauen: async () => {
      await act(async () => {
        reactWurzel.unmount();
      });
      container.remove();
    },
  };
}

/** Schickt einen echten Tastendruck und laesst React durchlaufen. */
async function taste(ziel: EventTarget, init: KeyboardEventInit): Promise<KeyboardEvent> {
  const ereignis = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  await act(async () => {
    ziel.dispatchEvent(ereignis);
    await new Promise((erfuellt) => setTimeout(erfuellt, 0));
  });
  return ereignis;
}

/** Klickt einen echten Knoten und laesst React durchlaufen. */
async function klicke(ziel: Element | null | undefined): Promise<void> {
  if (!(ziel instanceof HTMLElement)) throw new Error('der zu klickende Knoten fehlt');
  await act(async () => {
    ziel.click();
    await new Promise((erfuellt) => setTimeout(erfuellt, 0));
  });
}

function rahmen(container: HTMLElement, id = RAHMEN_ID): HTMLElement {
  const knoten = container.querySelector<HTMLElement>(`[data-publish-frame="${id}"]`);
  if (!knoten) throw new Error(`der Rahmen ${id} wurde nicht gerendert`);
  return knoten;
}

/** Setzt den Fokus wirklich und laesst React und die Fokuswirkung durchlaufen. */
async function fokussiere(ziel: HTMLElement): Promise<void> {
  await act(async () => {
    ziel.focus();
    await new Promise((erfuellt) => setTimeout(erfuellt, 0));
  });
}

/** Die linke Kante in Pixeln, wie sie am lebenden Knoten steht. */
function linkeKante(knoten: HTMLElement): number {
  const wert = Number.parseFloat(knoten.style.left);
  if (!Number.isFinite(wert)) throw new Error(`der Rahmen traegt keine linke Kante: "${knoten.style.left}"`);
  return wert;
}

function textfeld(container: HTMLElement, id = RAHMEN_ID): HTMLTextAreaElement | null {
  return container.querySelector<HTMLTextAreaElement>(`[data-publish-frame-textarea="${id}"]`);
}

function knopfMitNamen(container: HTMLElement, name: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find((knopf) => knopf.getAttribute('aria-label') === name);
}

describe('M17-Z3392 — Tastatur, Fokus, Namen und Skalierung wirken im Betrieb', () => {
  it('waehlt den Rahmen ueber den Fokus und verschiebt ihn mit Umschalt+Pfeil wirklich', async () => {
    const publish = await renderePublish();
    try {
      const ersterRahmen = rahmen(publish.container);

      // AUSGANGSZUSTAND BELEGEN: ohne ihn waere „der Fokus hat ausgewaehlt" nicht messbar — der
      // Textinhalt eines nicht ausgewaehlten Rahmens ist ein <div>, kein <textarea>.
      expect(ersterRahmen.getAttribute('tabindex')).toBe('0');
      expect(textfeld(publish.container)).toBeNull();
      expect(linkeKante(ersterRahmen)).toBeCloseTo(15 * PX_JE_MM, 6);

      await fokussiere(ersterRahmen);

      // Der Fokus IST dort — und die Auswahl ist die Folge: der Rahmen bekommt sein echtes Textfeld
      // (`canvas/PublishCanvas.tsx:113-130`, nur fuer den ausgewaehlten Rahmen).
      expect(document.activeElement).toBe(ersterRahmen);
      const feld = textfeld(publish.container);
      expect(feld).not.toBeNull();
      expect(feld?.getAttribute('aria-label')).toBe('Text content of Title');

      const ereignis = await taste(document.activeElement ?? window, { key: 'ArrowRight', shiftKey: true });

      expect(ereignis.defaultPrevented).toBe(true);
      // 10 mm mit Umschalt (`model/publishFrameOps.ts:68-76`) — nicht „irgendwie bewegt".
      expect(linkeKante(rahmen(publish.container))).toBeCloseTo(25 * PX_JE_MM, 6);
      expect(document.activeElement).toBe(ersterRahmen);
    } finally {
      await publish.abbauen();
    }
  });

  it('hebt die Auswahl mit Escape auf — danach bewegt die Pfeiltaste nichts mehr', async () => {
    const publish = await renderePublish();
    try {
      const ersterRahmen = rahmen(publish.container);
      await fokussiere(ersterRahmen);
      expect(textfeld(publish.container)).not.toBeNull();

      const hin = await taste(ersterRahmen, { key: 'ArrowRight', shiftKey: true });
      expect(hin.defaultPrevented).toBe(true);
      const nachDemZiehen = linkeKante(rahmen(publish.container));
      expect(nachDemZiehen).toBeCloseTo(25 * PX_JE_MM, 6);

      const escape = await taste(window, { key: 'Escape' });

      // Escape hebt die Auswahl auf; es ist keine Tastenkuerzung, die etwas verhindern muss.
      expect(escape.defaultPrevented).toBe(false);
      expect(textfeld(publish.container)).toBeNull();

      const danach = await taste(rahmen(publish.container), { key: 'ArrowRight', shiftKey: true });
      expect(danach.defaultPrevented).toBe(false);
      expect(linkeKante(rahmen(publish.container))).toBeCloseTo(nachDemZiehen, 6);
    } finally {
      await publish.abbauen();
    }
  });

  it('laesst einem Eingabefeld seine Tasten — ausser Strg wird gehalten', async () => {
    const publish = await renderePublish();
    try {
      await fokussiere(rahmen(publish.container));
      const feld = textfeld(publish.container);
      expect(feld).not.toBeNull();
      await fokussiere(feld ?? rahmen(publish.container));
      expect(document.activeElement).toBe(feld);
      const ausgang = linkeKante(rahmen(publish.container));

      const imText = await taste(document.activeElement ?? window, { key: 'ArrowRight' });

      // Im Textfeld gehoert die Pfeiltaste dem Text (`model/publishFrameOps.ts:58`).
      expect(imText.defaultPrevented).toBe(false);
      expect(linkeKante(rahmen(publish.container))).toBeCloseTo(ausgang, 6);

      const mitStrg = await taste(document.activeElement ?? window, { key: 'ArrowRight', ctrlKey: true });

      // Mit gehaltenem Strg ist die Taste wieder die der Anwendung: 0,1 mm.
      expect(mitStrg.defaultPrevented).toBe(true);
      expect(linkeKante(rahmen(publish.container))).toBeCloseTo(ausgang + 0.1 * PX_JE_MM, 6);
      expect(document.activeElement).toBe(feld);
    } finally {
      await publish.abbauen();
    }
  });

  it('nimmt mit Strg+Z die Verschiebung zurueck und stellt sie mit Strg+Umschalt+Z wieder her', async () => {
    const publish = await renderePublish();
    try {
      const ersterRahmen = rahmen(publish.container);
      await fokussiere(ersterRahmen);
      const ausgang = linkeKante(ersterRahmen);

      const hin = await taste(ersterRahmen, { key: 'ArrowRight', shiftKey: true });
      expect(hin.defaultPrevented).toBe(true);
      const verschoben = linkeKante(rahmen(publish.container));
      expect(verschoben).toBeCloseTo(ausgang + 10 * PX_JE_MM, 6);

      const zurueck = await taste(window, { key: 'z', ctrlKey: true });

      expect(zurueck.defaultPrevented).toBe(true);
      expect(linkeKante(rahmen(publish.container))).toBeCloseTo(ausgang, 6);

      const wieder = await taste(window, { key: 'Z', ctrlKey: true, shiftKey: true });

      expect(wieder.defaultPrevented).toBe(true);
      expect(linkeKante(rahmen(publish.container))).toBeCloseTo(verschoben, 6);
    } finally {
      await publish.abbauen();
    }
  });

  it('traegt die zugaenglichen Namen und Rollen am lebenden Knoten', async () => {
    const publish = await renderePublish();
    try {
      const wurzel = publish.container.querySelector('[data-vgt-publish-root="true"]');
      expect(wurzel).not.toBeNull();

      const werkzeugleiste = publish.container.querySelector('[role="toolbar"]');
      expect(werkzeugleiste?.getAttribute('aria-label')).toBe(publishToolbarText('toolbar', EN));
      expect(knopfMitNamen(publish.container, publishToolbarText('undo', EN))).toBeDefined();
      expect(knopfMitNamen(publish.container, publishToolbarText('redo', EN))).toBeDefined();
      expect(knopfMitNamen(publish.container, publishToolbarText('zoomIn', EN))).toBeDefined();
      expect(knopfMitNamen(publish.container, publishToolbarText('zoomOut', EN))).toBeDefined();

      const flaeche = publish.container.querySelector('[data-publish-canvas-page]');
      expect(flaeche?.getAttribute('role')).toBe('region');
      expect(flaeche?.getAttribute('aria-label')).toBe('Publish page 1 canvas');
      expect(flaeche?.getAttribute('tabindex')).toBe('0');
      expect(flaeche?.getAttribute('data-publish-canvas-page')).toBe('page-1');

      const rahmenDerAnsicht = Array.from(publish.container.querySelectorAll('[data-publish-frame]'));
      expect(rahmenDerAnsicht).toHaveLength(3);
      rahmenDerAnsicht.forEach((knoten) => {
        expect(knoten.getAttribute('role')).toBe('group');
        expect(knoten.getAttribute('tabindex')).toBe('0');
        expect(knoten.getAttribute('data-publish-frame-type')).toBe('text');
        // „text frame: <Name>" — der Typ und ein Name, nie ein leerer Name.
        expect(knoten.getAttribute('aria-label')).toMatch(/^text frame: \S/u);
      });
      expect(rahmen(publish.container).getAttribute('aria-label')).toBe('text frame: Title');

      await fokussiere(rahmen(publish.container));
      expect(textfeld(publish.container)?.getAttribute('aria-label')).toBe('Text content of Title');
    } finally {
      await publish.abbauen();
    }
  });

  it('skaliert die Seitenflaeche mit dem Zoom wirklich', async () => {
    const publish = await renderePublish();
    try {
      const ersterRahmen = rahmen(publish.container);
      const breiteVorher = Number.parseFloat(ersterRahmen.style.width);
      expect(breiteVorher).toBeCloseTo(180 * PX_JE_MM, 6);

      const anzeige = (): string => publish.container.querySelector('[role="toolbar"] output')?.textContent ?? '';
      expect(anzeige()).toBe('100%');
      const hinein = knopfMitNamen(publish.container, publishToolbarText('zoomIn', EN));
      const hinaus = knopfMitNamen(publish.container, publishToolbarText('zoomOut', EN));
      expect(hinein?.disabled).toBe(false);
      expect(hinaus?.disabled).toBe(true);

      await klicke(hinein);

      // 25 % mehr Zoom sind 25 % mehr Pixel: der Rahmen waechst mit der Seite, nicht nur die Zahl.
      expect(Number.parseFloat(rahmen(publish.container).style.width)).toBeCloseTo(breiteVorher * 1.25, 6);
      expect(anzeige()).toBe('125%');
      expect(hinaus?.disabled).toBe(false);

      await klicke(hinaus);

      expect(Number.parseFloat(rahmen(publish.container).style.width)).toBeCloseTo(breiteVorher, 6);
      expect(anzeige()).toBe('100%');
      expect(hinaus?.disabled).toBe(true);
    } finally {
      await publish.abbauen();
    }
  });
});
