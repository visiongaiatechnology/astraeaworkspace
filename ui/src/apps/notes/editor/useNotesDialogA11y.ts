// STATUS: PLATIN — one accessible-dialog contract for every Notes modal
//
// AST-0746/AST-0749: a modal that cannot be left with Escape, that never takes focus and that lets Tab walk
// into the page behind it is not operable from the keyboard. This hook owns that contract once, so no modal
// can forget half of it. It is a hook (not a component) so the existing modal markup stays untouched.
//
// ## W-432 — die sieben Dialoge, die den Vertrag nicht hatten
//
// Der Vertrag **existierte** und wurde von drei Dialogen benutzt (`KnowledgeGraphModal`, `NotesVersionHistoryModal`,
// `NotesImportExportModal`). Gemessen fehlten ihm aber **dreizehn** Produktionsdialoge mit `role="dialog"`,
// `aria-modal="true"` — nicht sieben. *Ein Vertrag, den zwei Drittel der Fläche nicht ruft, ist eine Zusage ohne
// Deckung; und eine Zählung, die niemand nachmisst, ist auch eine.* Die Zahl ist jetzt gemessen und durch den
// Wächter `testing/editor/notesDialogContract.contract.test.mjs` festgehalten.
//
// ## W-435 — die Tab-Falle benutzte eine **unbenannte** Heuristik
//
// `element.offsetParent !== null` ist keine Aussage über Sichtbarkeit: es ist eine Aussage über Layout-Boxen.
// Ein Element, das über `visibility: hidden` versteckt ist, hat eine Box; ein `position: fixed`-Kind in einem
// versteckten Elternteil kann ebenfalls eine haben. *Die Regel war nicht falsch — sie war nur nicht das, was sie
// zu sein behauptete.* Jetzt entscheidet die Plattform selbst, wo sie es kann (`checkVisibility`), und der
// Rückfall ist **benannt** (`notesDialogElementIsRendered`) statt implizit.
import { useEffect, useRef } from 'react';

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * **Die eine Sichtbarkeits-Entscheidung der Tab-Falle.**
 *
 * Zuerst die Antwort der Plattform (`Element.checkVisibility`), weil sie die einzige ist, die CSS wirklich
 * auswertet. Nur wenn sie fehlt, gilt der **benannte** Rückfall: eine Layout-Box (`offsetParent`) oder das
 * gerade fokussierte Element. Das ist eine **Heuristik** und heißt hier auch so — *kein Vertrag.*
 */
export function notesDialogElementIsRendered(element: unknown): boolean {
  const candidate = element as {
    checkVisibility?: (options?: { checkOpacity?: boolean; checkVisibilityCSS?: boolean }) => boolean;
    offsetParent?: unknown;
  } | null;
  if (!candidate || typeof candidate !== 'object') return false;
  if (typeof candidate.checkVisibility === 'function') {
    try {
      return candidate.checkVisibility({ checkOpacity: false, checkVisibilityCSS: true }) !== false;
    } catch {
      // Eine Plattform, die wirft, beantwortet die Frage nicht — dann gilt der Rückfall, nicht „sichtbar".
    }
  }
  return candidate.offsetParent !== null && candidate.offsetParent !== undefined;
}

export interface NotesDialogA11y {
  /** Attach to the dialog's outermost element. */
  ref: React.RefObject<HTMLDivElement | null>;
  /** Attach to the same element's `onKeyDown`. */
  onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
}

/**
 * Der **benannte** Eintrittspunkt eines Dialogs.
 *
 * Ohne ihn fokussiert der Vertrag das *erste* fokussierbare Element — in diesen Dialogen ist das der
 * Schließen-Knopf in der Kopfzeile. *Ein Fokusvertrag, der den Nutzer auf „Abbrechen" setzt, ist formal erfüllt
 * und praktisch falsch.* Die Dialoge, die vorher `autoFocus` auf ihr Eingabefeld setzten, behalten damit genau
 * den Eintritt, den sie schon hatten.
 */
export const NOTES_DIALOG_INITIAL_FOCUS_ATTRIBUTE = 'data-notes-dialog-initial-focus';
const INITIAL_FOCUS_SELECTOR = `[${NOTES_DIALOG_INITIAL_FOCUS_ATTRIBUTE}]`;

/**
 * Focus entry, Escape-to-close and a Tab trap for one open dialog.
 * `isOpen === false` is a no-op, so the caller can call the hook unconditionally.
 */
export function useNotesDialogA11y(isOpen: boolean, onClose: () => void): NotesDialogA11y {
  const ref = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return;
    previouslyFocused.current = (document.activeElement as HTMLElement | null) ?? null;
    const container = ref.current;
    const target = container?.querySelector<HTMLElement>(INITIAL_FOCUS_SELECTOR)
      ?? container?.querySelector<HTMLElement>(FOCUSABLE)
      ?? container;
    target?.focus();
    return () => {
      // Returning focus to the opener is what makes a keyboard-only flow usable at all.
      previouslyFocused.current?.focus?.();
      previouslyFocused.current = null;
    };
  }, [isOpen]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isOpen) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const container = ref.current;
    if (!container) return;
    // **W-435:** die benannte Sichtbarkeits-Regel — nicht mehr der nackte `offsetParent`-Vergleich.
    const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE))
      .filter((element) => notesDialogElementIsRendered(element) || element === container);
    if (!focusable.length) { container.focus(); event.preventDefault(); return; }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === container)) { event.preventDefault(); last.focus(); return; }
    if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
  };

  return { ref, onKeyDown };
}
