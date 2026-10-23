// AST-0001 · P0 · Masterplan Zeile 117 fordert für „Leeres Dokument unmittelbar beschreiben"
// ausdrücklich **Maus-/Tastatursteuerung**. Der Mausweg ist über `resolveWriterPageClickTarget` belegt
// (mutationsgeprüft), der Tastaturweg fehlte an allen drei geprüften Stellen (Runde 89/90).
//
// Diese Datei ist die reine Entscheidungsschicht dafür — nach demselben Muster wie
// `resolveWriterPageClickTarget` und `resolveWriterEnterIntent`: kein DOM, kein React, damit sie ohne
// Browserumgebung prüfbar ist.
//
// Sie beantwortet genau eine Frage: **Soll ein Tastendruck den Cursor in ein leeres Dokument setzen, und
// welcher Text entsteht dabei?**

/** Taste, die den Cursor setzt, ohne selbst Text zu erzeugen. */
const CARET_ONLY_KEYS = new Set(['Enter', 'Space', ' ']);

export interface WriterKeyboardEntryInput {
  /**
   * Trägt das Dokument **Text**? Nicht die Absatzzahl entscheidet, sondern der Inhalt.
   *
   * AST-0001 verlangt den Einstieg in ein vollständig leeres Dokument (null Absätze). AST-0006 verlangt ihn in
   * den **einen leeren Absatz**, der nach „alle übrigen Absätze entfernen" übrig bleibt. Eine Prüfung auf
   * `paragraphCount > 0` verweigerte dort den Einstieg und ließ die Tastaturhälfte von AST-0006 offen.
   */
  readonly hasTextContent: boolean;
  readonly key: string;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly altKey?: boolean;
  /** Ein bereits gesetztes Caret bedeutet: der Einstieg ist geschehen, der normale Editor übernimmt. */
  readonly hasCaret: boolean;
}

export type WriterKeyboardEntryIntent =
  | { readonly action: 'ignore'; readonly reason: 'modifier' | 'not-empty' | 'caret-present' | 'no-entry-key' }
  | { readonly action: 'enter-and-type'; readonly text: string }
  | { readonly action: 'enter-and-place-caret' };

/**
 * Ein einzelnes druckbares Zeichen — genau ein Codepoint, keine Steuer- oder Funktionstaste.
 *
 * `key` ist bei Buchstaben `'a'`, bei Leerzeichen `' '` und bei Enter `'Enter'`. Mehrzeichenwerte wie
 * `'Shift'`, `'ArrowLeft'` oder `'F5'` sind keine Eingabe.
 */
function printableText(key: string): string | null {
  if (key.length === 1) {
    const code = key.codePointAt(0) ?? 0;
    if (code >= 0x20 && code !== 0x7f) return key;
  }
  return null;
}

export function resolveWriterKeyboardEntryIntent(
  input: WriterKeyboardEntryInput,
): WriterKeyboardEntryIntent {
  // Tastenkürzel gehören dem Kurzbefehlmodul, nicht dem Einstieg.
  if (input.ctrlKey || input.metaKey || input.altKey) {
    return { action: 'ignore', reason: 'modifier' };
  }
  // Der Einstieg gilt nur, solange **kein Text** dasteht; danach führt der Editor selbst. Ein Dokument mit
  // einem leeren Absatz ist leer im hier gemeinten Sinn.
  if (input.hasTextContent) {
    return { action: 'ignore', reason: 'not-empty' };
  }
  if (input.hasCaret) {
    return { action: 'ignore', reason: 'caret-present' };
  }

  const text = printableText(input.key);
  if (text !== null) {
    return { action: 'enter-and-type', text };
  }
  if (CARET_ONLY_KEYS.has(input.key)) {
    return { action: 'enter-and-place-caret' };
  }
  return { action: 'ignore', reason: 'no-entry-key' };
}
