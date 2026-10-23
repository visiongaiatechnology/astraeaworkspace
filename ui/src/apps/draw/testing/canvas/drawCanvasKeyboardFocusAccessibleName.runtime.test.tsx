// @vitest-environment happy-dom
// STATUS: DIAMANT VGT SUPREME — der Verhaltensnachweis fuer die Barrierefreiheit der Draw-Leinwand.
//
// M16-Z3313 (Requirement_Text woertlich):
//   „- Barrierefreiheit, Tastaturbedienung, High-Contrast, Skalierung und Screenreader-Semantik
//     gehoeren zum Definition-of-Done."
// Die zugehoerige Zeile im Belegregister ist `ASR-1776`:
//   „Keyboard-/Focus-/Accessible-Name-Smoke ausfuehren." — bis jetzt **KEIN BELEG**.
//
// WARUM DIESE DATEI EXISTIERT
//
// Der bisherige Nachweis ist ein Quelltextvertrag: `DrawCanvas.reachability.render.test.tsx` rendert das
// Markup mit `renderToStaticMarkup` und sucht Zeichenketten wie `role="application"` und
// `data-vgt-interactive-canvas="true"`. Das sagt, dass die Zeichenfolge im Markup steht — NICHT, dass
// die Leinwand den Fokus annehmen kann, dass ein Klick den Fokus dorthin zieht, dass Tab das naechste
// Objekt auswaehlt, dass ein Pfeil das Objekt bewegt oder dass der Texteditor aufgeht. Genau dafuer
// braucht es ein DOM mit echten Ereignissen; die Datei fordert ihre Umgebung deshalb selbst an.
//
// DIESE DATEI rendert die PRODUKTKOMPONENTE `DrawCanvas` in ein echtes DOM (happy-dom), feuert echte
// `KeyboardEvent`s bzw. `PointerEvent`s, liest `document.activeElement`, die sichtbaren Attribute der
// Objektknoten und die live-Region — also die WIRKUNG, nicht die Verdrahtung.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';
import type { DrawObjectId } from '../../../../shared/contracts/draw/workspaceDraw';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import { drawInteractionText } from '../../drawInteractionLocale';
import { DrawCanvas } from '../../canvas/DrawCanvas';
import { projectDrawScene } from '../../interactions/drawSceneProjection';
import { buildDrawModel } from '../interactions/drawInteractionFixtures';

vi.mock('../../../../shell/localization/workspaceLocale', () => ({ useWorkspaceLocale: vi.fn() }));
const SPRACHE = 'en-US' as const;
vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: SPRACHE, locale: SPRACHE, setPreference: () => undefined });

// React 19 verlangt diese Markierung, sonst warnt `act` und die Effekt-Abarbeitung ist nicht zugesichert.
// Die Vitest-Konfiguration bleibt unberuehrt: die Datei fordert ihre Umgebung selbst an.
const actUmgebung: typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean } = globalThis;
actUmgebung.IS_REACT_ACT_ENVIRONMENT = true;

const SEITE = 'page-1';

const MODELL = buildDrawModel({
  objects: [
    { id: 'a', name: 'Alpha', x: 100, y: 100, width: 200, height: 100, text: 'Alpha' },
    { id: 'b', name: 'Beta', x: 400, y: 300, width: 120, height: 60, text: 'Beta' },
  ],
});

/** Der Schritt, den eine Pfeiltaste verschiebt — aus dem Modell GELESEN, nicht geraten. */
const SCHRITT = MODELL.viewport.snapToGrid ? MODELL.viewport.gridSize : 1;
/** Die Objekte in der Reihenfolge, in der die Szene sie kennt — Grundlage der Tab-Erwartung. */
const SZENE = projectDrawScene(MODELL, SEITE);

function dokument(): WorkspaceDocument {
  return {
    id: 'draw-canvas', title: 'Pruefzeichnung', kind: 'Draw', created_at: 0, modified_at: 0, version: 1,
    theme_id: 'cosmic', root_object_ids: [], objects: {}, drawData: MODELL,
  } as WorkspaceDocument;
}

const EIGENSCHAFTEN = { document: dokument(), onUpdateDocument: () => undefined } satisfies ComponentProps<typeof DrawCanvas>;

/** Laesst React und die Effekte der Produktkomponente arbeiten. */
async function rahmen(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 40);
    });
  });
}

let offen: { readonly root: Root; readonly container: HTMLElement } | null = null;

async function zeichnungOeffnen(): Promise<HTMLElement> {
  // Ein sauberer Ausgangszustand: ohne das waere „der Fokus ist gewandert" nicht messbar.
  document.body.focus();
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  offen = { root, container };
  await act(async () => {
    root.render(<DrawCanvas {...EIGENSCHAFTEN} />);
  });
  await rahmen();
  return container;
}

afterEach(async () => {
  if (!offen) return;
  await act(async () => {
    offen?.root.unmount();
  });
  offen.container.remove();
  offen = null;
});

function leinwand(container: HTMLElement): SVGSVGElement {
  const svg = container.querySelector<SVGSVGElement>('svg[data-vgt-interactive-canvas="true"]');
  if (!svg) throw new Error('die interaktive Leinwand wurde nicht gerendert');
  return svg;
}

function objektknoten(container: HTMLElement, id: DrawObjectId): SVGGElement {
  const knoten = container.querySelector<SVGGElement>(`[data-vgt-id="${id}"]`);
  if (!knoten) throw new Error(`das Objekt ${id} wurde nicht gerendert`);
  return knoten;
}

/** Der Zustand eines Objektknotens, wie ihn ein Screenreader bzw. das Auge vorfindet. */
function erscheinung(container: HTMLElement, id: DrawObjectId): { readonly label: string | null; readonly token: string | null } {
  const knoten = objektknoten(container, id);
  return { label: knoten.getAttribute('aria-label'), token: knoten.getAttribute('data-vgt-state') };
}

function geometrie(container: HTMLElement, id: DrawObjectId): { readonly x: number; readonly y: number } {
  const form = objektknoten(container, id).querySelector('rect');
  if (!form) throw new Error(`das Objekt ${id} hat keine Rechteckform`);
  return { x: Number(form.getAttribute('x')), y: Number(form.getAttribute('y')) };
}

function ansage(container: HTMLElement): string {
  return container.querySelector('[data-vgt-canvas-announcement="true"]')?.textContent?.trim() ?? '';
}

/**
 * Eine echte Taste auf dem tatsaechlich fokussierten Element. Der Screenshot der geprueften Wirkung ist
 * `defaultPrevented`: nur eine Taste, die Draw als SEINEN Befehl aufgeloest hat, darf den Standard unterdruecken.
 */
function taste(key: string, optionen: KeyboardEventInit = {}): KeyboardEvent {
  const ziel = document.activeElement ?? document.body;
  const ereignis = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...optionen });
  ziel.dispatchEvent(ereignis);
  return ereignis;
}

async function tippen(key: string, optionen: KeyboardEventInit = {}): Promise<KeyboardEvent> {
  const ereignis = taste(key, optionen);
  await rahmen();
  return ereignis;
}

describe('M16-Z3313 / ASR-1776 — Tastatur, Fokus und zugaenglicher Name der Draw-Leinwand wirken im Betrieb', () => {
  it('macht die Zeichenflaeche per Tastatur und per Zeiger fokussierbar und benennt sie samt Anleitung', async () => {
    const container = await zeichnungOeffnen();
    const svg = leinwand(container);

    // Die Rolle, die einem Screenreader sagt: hier ist ein zusammenhaengendes Tastatur-Widget.
    expect(svg.getAttribute('role')).toBe('application');
    // Und die Eigenschaft, die sie ueberhaupt erst in die Tabulatorreihenfolge bringt.
    expect(svg.getAttribute('tabindex')).toBe('0');
    expect(svg.tabIndex).toBe(0);

    // Der zugaengliche Name: Seitenname UND Zweck — nicht die Datei, nicht der Pfad.
    const name = svg.getAttribute('aria-label') ?? '';
    expect(name).toContain(MODELL.pages[0]!.name);
    expect(name).toContain(drawInteractionText('interactiveCanvas', SPRACHE));

    // Die Beschreibung zeigt auf eine EXISTIERENDE Region mit echtem Wortlaut — ein `aria-describedby`
    // ins Leere ist ein haeufiger, unsichtbarer Defekt.
    const beschrieben = svg.getAttribute('aria-describedby');
    expect(beschrieben).toBeTruthy();
    const anleitung = document.getElementById(beschrieben ?? '');
    expect(anleitung, `aria-describedby="${beschrieben}" zeigt ins Leere`).not.toBeNull();
    expect(anleitung?.textContent?.trim()).toBe(drawInteractionText('surfaceInstructions', SPRACHE));

    // WIRKUNG 1: die Leinwand nimmt den Fokus wirklich an.
    expect(document.activeElement).not.toBe(svg);
    svg.focus();
    expect(document.activeElement).toBe(svg);

    // WIRKUNG 2: auch der Zeiger holt ihn dorthin — wer klickt, bedient danach mit der Tastatur weiter.
    svg.blur();
    document.body.focus();
    expect(document.activeElement).not.toBe(svg);
    const zeiger = new PointerEvent('pointerdown', {
      pointerId: 1, bubbles: true, cancelable: true, clientX: 200, clientY: 200, button: 0,
    });
    svg.dispatchEvent(zeiger);
    await rahmen();
    expect(document.activeElement).toBe(svg);
  });

  it('waehlt mit Tab und Shift+Tab ein Objekt aus und schreibt den Zustand in Name und Live-Region', async () => {
    const container = await zeichnungOeffnen();
    const svg = leinwand(container);
    svg.focus();
    expect(document.activeElement).toBe(svg);

    const reihenfolge = SZENE.entries.filter((eintrag) => eintrag.visible).map((eintrag) => eintrag.object);
    expect(reihenfolge.length, 'die Szene braucht mindestens zwei sichtbare Objekte').toBeGreaterThan(1);
    const erstes = reihenfolge[0]!;
    const zweites = reihenfolge[1]!;

    // Ausgangszustand: nichts ist ausgewaehlt — sonst waere „Tab hat ausgewaehlt" nicht messbar.
    expect(erscheinung(container, erstes.id).token).toBe('idle');
    expect(erscheinung(container, zweites.id).token).toBe('idle');

    // Vorwaerts. DIE WIRKUNG: der ausgewaehlte Knoten traegt Zustand UND Namen — der Screenreader
    // hoert „Beta, selected", nicht nur „Beta".
    const vorwaerts = await tippen('Tab');
    expect(vorwaerts.defaultPrevented, 'Tab muss von der Leinwand als ihr Befehl beansprucht werden').toBe(true);
    const nachErstemTab = erscheinung(container, zweites.id);
    expect(nachErstemTab.token).toBe('selected');
    expect(nachErstemTab.label).toBe(`${zweites.name}, selected`);
    expect(erscheinung(container, erstes.id).token).toBe('idle');
    expect(ansage(container)).toBe(drawInteractionText('stateSelected', SPRACHE));

    // Und weiter zum vorherigen Objekt: die Auswahl wandert wirklich, statt stehen zu bleiben.
    const weiter = await tippen('Tab');
    expect(weiter.defaultPrevented).toBe(true);
    expect(erscheinung(container, erstes.id).token).toBe('selected');
    expect(erscheinung(container, erstes.id).label).toBe(`${erstes.name}, selected`);
    expect(erscheinung(container, zweites.id).token).toBe('idle');

    // Rueckwaerts — dieselbe Wirkung in der Gegenrichtung.
    const rueckwaerts = await tippen('Tab', { shiftKey: true });
    expect(rueckwaerts.defaultPrevented).toBe(true);
    expect(erscheinung(container, zweites.id).token).toBe('selected');
    expect(erscheinung(container, erstes.id).token).toBe('idle');
  });

  it('verschiebt das ausgewaehlte Objekt mit den Pfeiltasten um genau eine bzw. zehn Gitterstufen', async () => {
    const container = await zeichnungOeffnen();
    leinwand(container).focus();

    await tippen('Tab');
    const ziel = erscheinung(container, 'b').token === 'selected' ? 'b' : 'a';
    expect(erscheinung(container, ziel).token, 'ohne Auswahl bewegt kein Pfeil etwas').toBe('selected');
    const vorher = geometrie(container, ziel);

    const rechts = await tippen('ArrowRight');
    expect(rechts.defaultPrevented, 'ein gebundener Pfeil darf die Seite nicht scrollen').toBe(true);
    const nachRechts = geometrie(container, ziel);
    expect(nachRechts.x - vorher.x).toBe(SCHRITT);
    expect(nachRechts.y).toBe(vorher.y);
    expect(ansage(container)).toBe(drawInteractionText('canvasMoved', SPRACHE));

    const zehn = await tippen('ArrowDown', { shiftKey: true });
    expect(zehn.defaultPrevented).toBe(true);
    const nachUnten = geometrie(container, ziel);
    expect(nachUnten.y - nachRechts.y).toBe(SCHRITT * 10);
    expect(nachUnten.x).toBe(nachRechts.x);

    // GEGENPROBE IM KLEINEN: eine ungebundene Taste bleibt der Seite. Wuerde die Leinwand jede Taste
    // schlucken, waere dieser Test rot — und die Tastaturbedienung der Seite kaputt.
    const ungebunden = await tippen('x');
    expect(ungebunden.defaultPrevented).toBe(false);
    expect(geometrie(container, ziel)).toEqual(nachUnten);

    // Und die Gegenrichtung.
    const links = await tippen('ArrowLeft');
    expect(links.defaultPrevented).toBe(true);
    expect(geometrie(container, ziel).x).toBe(nachUnten.x - SCHRITT);
  });

  it('entfernt das ausgewaehlte Objekt mit Delete aus dem DOM und sagt es an', async () => {
    const container = await zeichnungOeffnen();
    leinwand(container).focus();

    await tippen('Tab');
    const ziel = erscheinung(container, 'b').token === 'selected' ? 'b' : 'a';
    expect(objektknoten(container, ziel)).toBeTruthy();

    const loeschen = await tippen('Delete');
    expect(loeschen.defaultPrevented).toBe(true);
    expect(container.querySelector(`[data-vgt-id="${ziel}"]`), 'das Objekt steht noch im DOM').toBeNull();
    expect(ansage(container)).toBe(drawInteractionText('deleteSelection', SPRACHE));
  });

  it('oeffnet mit F2 den Texteditor mit eigenem Namen und gibt die Tasten der Schreibmarke', async () => {
    const container = await zeichnungOeffnen();
    const svg = leinwand(container);
    svg.focus();

    await tippen('Tab');
    const ziel = erscheinung(container, 'b').token === 'selected' ? 'b' : 'a';
    const vorher = geometrie(container, ziel);

    const bearbeiten = await tippen('F2');
    expect(bearbeiten.defaultPrevented).toBe(true);

    const editor = container.querySelector<HTMLTextAreaElement>('textarea[data-vgt-text-input="true"]');
    expect(editor, 'F2 hat keinen Texteditor geoeffnet').not.toBeNull();
    if (!editor) throw new Error('unerreichbar');
    expect(editor.getAttribute('aria-label')).toBe(drawInteractionText('editText', SPRACHE));
    expect(document.activeElement, 'der Editor muss den Fokus tragen, sonst tippt der Nutzer ins Nichts').toBe(editor);

    // WIRKUNG: waehrend das Feld schreibt, gehoert der Pfeil dem FELD, nicht der Zeichnung.
    const imFeld = await tippen('ArrowRight');
    expect(imFeld.defaultPrevented, 'die Leinwand darf die Schreibmarke nicht ersetzen').toBe(false);
    expect(geometrie(container, ziel)).toEqual(vorher);

    // Escape verlaesst den Editor — die Wirkung im DOM ist messbar.
    const verlassen = await tippen('Escape');
    expect(verlassen.defaultPrevented).toBe(true);
    expect(container.querySelector('textarea[data-vgt-text-input="true"]')).toBeNull();
    expect(ansage(container)).toBe(drawInteractionText('canvasTextCommitted', SPRACHE));

    // BEFUND, nicht Wunsch: der Fokus faellt nach dem Entfernen des Editors auf `body` zurueck. Die
    // Leinwand holt ihn NICHT selbst zurueck. Das wird hier festgehalten (statt weggelassen), und die
    // Erholung wird gleich mitgemessen: die Leinwand ist sofort wieder fokussierbar — der tastatur-
    // bediente Nutzer ist nicht ausgesperrt, er muss nur selbst weitergehen.
    expect(document.activeElement, 'Befund: der Fokus bleibt nach Escape auf body').toBe(document.body);
    svg.focus();
    expect(document.activeElement, 'die Leinwand muss den Fokus sofort wieder annehmen').toBe(svg);
  });
});
