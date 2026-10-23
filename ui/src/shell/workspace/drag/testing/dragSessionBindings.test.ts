// STATUS: PLATIN — Paket 5: der Übersetzer und die Bindung, **kopflos** geprüft
//
// Der Hook selbst ist hier **nicht** auslösbar ✗ (kein DOM ✓) — aber die **Bindung** ist eine reine Funktion ✓, und
// ihre Rückrufe sind **auslösbar** ✓, weil sie nur den Übersetzer rufen ✓ ✓. *Genau deshalb liegt die Substanz
// außerhalb des Hooks.*
import { describe, expect, it } from 'vitest';
import { DRAG_THRESHOLD_PX, createDragSession } from '../dragSession';
import {
  createDragSessionBindings,
  dragPointFromEvent,
  reduceDragEvent,
} from '../dragSessionBindings';

const E = (x: number, y: number, pointerId = 3) => ({ pointerId, clientX: x, clientY: y });

describe('Paket 5: die DOM-Anbindung', () => {
  it('**Nicht-Leerheit:** der Übersetzer kennt jede Ereignisart und weist eine unbekannte ab', () => {
    const leer = createDragSession();
    for (const art of ['down', 'move', 'up', 'cancel', 'lost', 'blur'] as const) {
      const step = reduceDragEvent(leer, art, E(0, 0));
      // Im `idle`-Zustand ist **nur** `down` gültig ✓ — die übrigen werden **benannt** abgelehnt ✓.
      if (art === 'down') expect(step.ok, art).toBe(true);
      else expect(step.ok, art).toBe(false);
    }
    expect(reduceDragEvent(leer, 'flip' as never, E(0, 0)).reason).toBe('drag-event-unknown');
  });

  it('**der Übersetzer wählt aus** — nur Zeiger-ID und Koordinaten kommen durch', () => {
    // Alles andere am Ereignis (Tasten, Druck, Zeigerart ✓) wird **weggeworfen** ✓.
    // **Der Test will zeigen, dass überzählige Eigenschaften ignoriert werden** ✓ — TypeScript lehnt das Literal
    // gegen `DragPointerLike` ab ✗, deshalb der **ausdrückliche** Cast: *die Absicht steht im Code, nicht in einem Trick.*
    const ueberzaehlig = { pointerId: 3, clientX: 10, clientY: 20, buttons: 1, pressure: 0.5, pointerType: 'mouse' };
    const punkt = dragPointFromEvent(ueberzaehlig as Parameters<typeof dragPointFromEvent>[0]);
    expect(punkt).toEqual({ pointerId: 3, x: 10, y: 20 });
    // Unbrauchbares ergibt `null` ✓ — **nicht** einen geratenen Punkt ✗.
    for (const kaputt of [null, undefined, {}, { pointerId: 3 }, { pointerId: 1.5, clientX: 0, clientY: 0 },
      { pointerId: 3, clientX: Number.NaN, clientY: 0 }, { pointerId: 3, clientX: 0, clientY: Number.POSITIVE_INFINITY },
      { pointerId: -1, clientX: 0, clientY: 0 }]) {
      expect(dragPointFromEvent(kaputt as never), JSON.stringify(kaputt)).toBeNull();
    }
  });

  it('**ein Ende im `armed`-Zustand wird von der MASCHINE als Klick erkannt**, nicht vom Übersetzer', () => {
    // Der Übersetzer sagt bei `up` immer `dropped` ✓ — die Maschine entscheidet anhand der Phase ✓.
    const leer = createDragSession();
    const gedrueckt = reduceDragEvent(leer, 'down', E(0, 0)).state;
    const ende = reduceDragEvent(gedrueckt, 'up', E(0, 0)).state;
    // Kein Zug → **kein** `dropped` ✗, sondern `cancelled` ✓.
    expect(ende.phase).toBe('cancelled');
    expect(ende.endReason).toBe('cancelled');
    // Und **mit** Zug → `dropped` ✓.
    const gezogen = reduceDragEvent(gedrueckt, 'move', E(0 + DRAG_THRESHOLD_PX + 1, 0)).state;
    const drop = reduceDragEvent(gezogen, 'up', E(0 + DRAG_THRESHOLD_PX + 1, 0)).state;
    expect(drop.phase).toBe('dropped');
    expect(drop.endReason).toBe('dropped');
  });

  it('die Bindung hält **einen** Zustand und sammelt sich über mehrere Rückrufe', () => {
    // **Zwei Aufrufe in einer Instanz** ✓ (die W-397-Regel ✓): Der Zustand wächst über **mehrere** Ereignisse ✓.
    const gesehen: string[] = [];
    const b = createDragSessionBindings((s) => gesehen.push(s.phase));
    b.onPointerDown(E(0, 0), { id: 'payload' });
    b.onPointerMove(E(3, 0));      // unter der Schwelle ✓
    b.onPointerMove(E(50, 0));     // über der Schwelle ✓
    b.onPointerUp(E(50, 0));
    expect(gesehen).toEqual(['armed', 'armed', 'dragging', 'dropped']);
    expect(b.state.phase).toBe('dropped');
    // Der Träger reist mit ✓ — die Bindung kennt ihn nicht, sie reicht ihn durch ✓.
    expect(b.state.payload).toEqual({ id: 'payload' });
  });

  it('**Abbruch über die Bindung** — Zeigerverlust und Fensterfokus enden den Zug **benannt**', () => {
    for (const [art, grund] of [['onLostPointerCapture', 'pointer-lost'], ['onWindowBlur', 'window-blur']] as const) {
      const b = createDragSessionBindings();
      b.onPointerDown(E(0, 0), null);
      b.onPointerMove(E(100, 0));
      expect(b.state.phase).toBe('dragging');
      (b as unknown as Record<string, () => void>)[art]();
      expect(b.state.phase, art).toBe('cancelled');
      expect(b.state.endReason, art).toBe(grund);
      // **Und danach ist kein Ende mehr gültig** ✓.
      b.onPointerUp(E(100, 0));
      expect(b.state.phase).toBe('cancelled');
      expect(b.state.endReason).toBe(grund);
    }
  });

  it('**fail-closed über die Bindung:** ein unbrauchbares Ereignis ändert **nichts**', () => {
    const b = createDragSessionBindings();
    b.onPointerDown({ pointerId: 3, clientX: Number.NaN, clientY: 0 });
    // Der Zustand bleibt `idle` ✓ — **kein** geratener Zug ✗.
    expect(b.state.phase).toBe('idle');
    b.onPointerDown(E(0, 0), { id: 'x' });
    b.onPointerMove({ pointerId: 3, clientX: 5, clientY: Number.NaN });
    // Ein unbrauchbarer Zwischenschritt lässt den **laufenden** Zug unangetastet ✓.
    expect(b.state.phase).toBe('armed');
    expect(b.state.payload).toEqual({ id: 'x' });
  });
});
