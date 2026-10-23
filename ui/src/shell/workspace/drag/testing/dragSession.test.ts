// STATUS: PLATIN — Paket 5: die Zieh-Session, **kopflos** geprüft (Schwelle, Abbruch, Übergänge)
//
// Diese Prüfung braucht **kein** DOM ✓ — genau deshalb ist sie hier möglich ✓ und genau deshalb kommt die
// Zustandsmaschine **vor** dem DOM-Teil ✓. *Wer den prüfbaren Teil zuerst baut, hat einen abnehmbaren Increment;
// wer mit dem unprüfbaren beginnt, hat am Ende eine Behauptung.*
import { describe, expect, it } from 'vitest';
import {
  DRAG_THRESHOLD_PX,
  beginDrag,
  cancelDrag,
  createDragSession,
  endDrag,
  hasCrossedThreshold,
  isDragActive,
  moveDrag,
} from '../dragSession' // eigener Fehler, korrigiert: aus drag/testing/ ist es EINE Ebene hoch;

const P = (x: number, y: number, pointerId = 1) => ({ pointerId, x, y });

describe('Paket 5: die Zieh-Session', () => {
  it('**Nicht-Leerheit:** die Maschine durchläuft wirklich alle vier Phasen', () => {
    const gesehen = new Set<string>([createDragSession().phase]);
    let s = beginDrag(createDragSession(), P(0, 0), { id: 'x' }).state;
    gesehen.add(s.phase);
    s = moveDrag(s, P(20, 0)).state;
    gesehen.add(s.phase);
    s = endDrag(s).state;
    gesehen.add(s.phase);
    expect([...gesehen].sort()).toEqual(['armed', 'dragging', 'dropped', 'idle']);
  });

  it('**ein Druck ist noch kein Zug** — unter der Schwelle bleibt es `armed`, nicht `dragging`', () => {
    const gedrueckt = beginDrag(createDragSession(), P(10, 10), { id: 'a' }).state;
    expect(gedrueckt.phase).toBe('armed');
    // Ein Schritt **unter** der Schwelle ändert die Phase **nicht** ✓.
    const klein = moveDrag(gedrueckt, P(10 + DRAG_THRESHOLD_PX - 1, 10)).state;
    expect(klein.phase).toBe('armed');
    // Genau **auf** der Schwelle wird gezogen ✓ (die Grenze gehört zum Zug ✓).
    const genau = moveDrag(gedrueckt, P(10 + DRAG_THRESHOLD_PX, 10)).state;
    expect(genau.phase).toBe('dragging');
  });

  it('die Schwelle gilt **ab dem Ursprung** — kleine Zittern-Schritte umgehen sie nicht', () => {
    let s = beginDrag(createDragSession(), P(0, 0), null).state;
    // Zehn Schritte von je 1 px: am Ende 10 px vom Ursprung → **über** der Schwelle ✓.
    for (let i = 1; i <= 10; i += 1) s = moveDrag(s, P(i, 0)).state;
    expect(s.phase, 'Zittern in kleinen Schritten hat die Schwelle umgangen').toBe('dragging');
    expect(hasCrossedThreshold(s)).toBe(true);
  });

  it('**ein Ende im `armed`-Zustand ist ein Klick**, kein Drop — und es wird als solcher benannt', () => {
    const gedrueckt = beginDrag(createDragSession(), P(5, 5), { id: 'b' }).state;
    const ende = endDrag(gedrueckt).state;
    // Kein Zug → **kein** `dropped` ✗, sondern `cancelled` **mit Grund** ✓.
    expect(ende.phase).toBe('cancelled');
    expect(ende.endReason).toBe('cancelled');
  });

  it('**ein Zug endet genau einmal** — ein zweites Ende ist ein benannter No-op', () => {
    let s = beginDrag(createDragSession(), P(0, 0), { id: 'c' }).state;
    s = moveDrag(s, P(50, 50)).state;
    const erstes = endDrag(s);
    expect(erstes.ok).toBe(true);
    expect(erstes.state.phase).toBe('dropped');
    expect(erstes.state.endReason).toBe('dropped');
    // Das zweite Ende: abgelehnt ✓ und **mit Grund** ✓ — kein stiller zweiter Abschluss ✗.
    const zweites = endDrag(erstes.state);
    expect(zweites.ok).toBe(false);
    expect(zweites.reason).toBe('drag-not-active');
    // Und der Zustand bleibt der des **ersten** Endes ✓ — kein Zurücksetzen ✗.
    expect(zweites.state.phase).toBe('dropped');
    expect(zweites.state.endReason).toBe('dropped');
  });

  it('**Abbruch gewinnt** — aus jedem laufenden Zustand, mit dem übergebenen Grund', () => {
    const gedrueckt = beginDrag(createDragSession(), P(0, 0), null).state;
    const gezogen = moveDrag(gedrueckt, P(30, 30)).state;
    for (const grund of ['escape', 'pointer-lost', 'window-blur'] as const) {
      const abgebrochen = cancelDrag(gezogen, grund);
      expect(abgebrochen.ok).toBe(true);
      expect(abgebrochen.state.phase).toBe('cancelled');
      expect(abgebrochen.state.endReason).toBe(grund);
      // **Und danach ist kein Ende mehr gültig** ✓ — der Abbruch ist endgültig ✓.
      expect(endDrag(abgebrochen.state).ok).toBe(false);
    }
  });

  it('**nur ein Zeiger** — ein zweiter Druck während eines Zuges wird abgelehnt', () => {
    const erster = beginDrag(createDragSession(), P(0, 0, 1), { id: 'd' });
    expect(erster.ok).toBe(true);
    const zweiter = beginDrag(erster.state, P(5, 5, 2), { id: 'e' });
    expect(zweiter.ok).toBe(false);
    expect(zweiter.reason).toBe('drag-already-active');
    // Und der **erste** Zug lebt weiter ✓ — sein Träger ist unangetastet ✓.
    expect(zweiter.state.payload).toEqual({ id: 'd' });
    expect(isDragActive(zweiter.state)).toBe(true);
  });

  it('**fail-closed:** Bewegung ohne Druck, fremder Zeiger, unbrauchbare Werte', () => {
    const leer = createDragSession();
    expect(moveDrag(leer, P(1, 1)).reason).toBe('drag-not-active');
    const laufend = moveDrag(beginDrag(leer, P(0, 0, 7), null).state, P(10, 10, 7)).state;
    // Fremder Zeiger mitten im Zug ✓.
    expect(moveDrag(laufend, P(10, 10, 8)).reason).toBe('drag-pointer-mismatch');
    // Unbrauchbare Koordinaten ✓ — `NaN` und `Infinity` sind keine Positionen ✓.
    for (const kaputt of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(beginDrag(leer, P(kaputt, 0), null).reason, String(kaputt)).toBe('drag-point-invalid');
      expect(moveDrag(laufend, P(kaputt, 0)).reason, String(kaputt)).toBe('drag-point-invalid');
    }
    // Unbrauchbare Zeiger-ID ✓ und unbrauchbare Schwelle ✓.
    expect(beginDrag(leer, { pointerId: 1.5, x: 0, y: 0 }, null).reason).toBe('drag-point-invalid');
    expect(beginDrag(leer, P(0, 0), null, Number.NaN).reason).toBe('drag-threshold-invalid');
    expect(beginDrag(leer, P(0, 0), null, -1).reason).toBe('drag-threshold-invalid');
  });

  it('**derselbe Ausgangszustand ergibt dieselbe Folge** — und zwei Aufrufe in einer Instanz sammeln sich', () => {
    // Determinismus ✓ — die Maschine hat keinen versteckten Zustand ✓.
    const folge = () => {
      let s = beginDrag(createDragSession(), P(0, 0), { id: 'f' }).state;
      s = moveDrag(s, P(100, 0)).state;
      return endDrag(s).state;
    };
    expect(folge()).toEqual(folge());
    // **Zwei Aufrufe in EINER Instanz** (die W-397-Regel ✓): Der zweite Schritt rechnet gegen den **ersten** Zustand ✓,
    // nicht gegen den Ursprung ✓ — sonst wäre der zweite Schritt still wirkungslos ✗.
    let s = beginDrag(createDragSession(), P(0, 0), null).state;
    s = moveDrag(s, P(3, 0)).state;
    s = moveDrag(s, P(6, 0)).state;
    expect(s.current).toEqual({ x: 6, y: 0 });
    expect(s.phase).toBe('dragging');
  });
});
