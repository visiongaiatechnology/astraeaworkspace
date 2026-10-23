// STATUS: PLATIN — Notes · W-435: die Sichtbarkeits-Entscheidung der Tab-Falle ist **benannt**
//
// Vorher warf die Tab-Falle Elemente über `element.offsetParent !== null` aus der Liste. Das ist keine Aussage
// über Sichtbarkeit, sondern über Layout-Boxen: ein über `visibility: hidden` verstecktes Element **hat** eine
// Box. *Die Regel war nicht falsch — sie war nur nicht das, was sie zu sein behauptete.* Der Registereintrag
// nannte sie deshalb ehrlich eine **Heuristik**.
//
// Hier wird die Entscheidung als **reine Funktion** über ein Element-förmiges Objekt geprüft: kein DOM, kein
// Browser — nur die Regel. Der Plattform wird der Vorrang gegeben, wo sie die Frage selbst beantworten kann;
// der Rückfall bleibt und ist **benannt**.
import { describe, expect, it } from 'vitest';
import { notesDialogElementIsRendered } from '../../editor/useNotesDialogA11y';

describe('W-435 — die benannte Sichtbarkeits-Regel', () => {
  it('fragt die **Plattform**, wenn sie antworten kann', () => {
    const visible = { checkVisibility: () => true, offsetParent: null };
    const hidden = { checkVisibility: () => false, offsetParent: {} };
    expect(notesDialogElementIsRendered(visible)).toBe(true);
    // **Der Kernfall:** `visibility: hidden` hat eine Box — die Plattform sagt trotzdem „nein", und das gilt.
    expect(notesDialogElementIsRendered(hidden)).toBe(false);
  });

  it('reicht die Optionen durch, die die Frage wirklich stellen', () => {
    let seen: unknown = null;
    notesDialogElementIsRendered({ checkVisibility: (options?: unknown) => { seen = options; return true; } });
    // Deckkraft ist **keine** Sichtbarkeit für die Tastatur; die CSS-Sichtbarkeit ist die Frage.
    expect(seen).toEqual({ checkOpacity: false, checkVisibilityCSS: true });
  });

  it('der **benannte** Rückfall gilt nur ohne Plattform-Antwort', () => {
    // Eine Layout-Box ⇒ nach dem Rückfall sichtbar; ohne Box ⇒ nicht.
    expect(notesDialogElementIsRendered({ offsetParent: {} })).toBe(true);
    expect(notesDialogElementIsRendered({ offsetParent: null })).toBe(false);
  });

  it('eine werfende Plattform beantwortet die Frage **nicht** — dann gilt der Rückfall, nicht „sichtbar"', () => {
    const throwing = { checkVisibility: () => { throw new Error('nicht unterstützt'); }, offsetParent: null };
    expect(notesDialogElementIsRendered(throwing)).toBe(false);
    const throwingWithBox = { checkVisibility: () => { throw new Error('nicht unterstützt'); }, offsetParent: {} };
    expect(notesDialogElementIsRendered(throwingWithBox)).toBe(true);
  });

  it('Nichts ist nicht sichtbar — kein Wurf, keine Ausnahme', () => {
    expect(notesDialogElementIsRendered(null)).toBe(false);
    expect(notesDialogElementIsRendered(undefined)).toBe(false);
    expect(notesDialogElementIsRendered('kein Element')).toBe(false);
  });
});
