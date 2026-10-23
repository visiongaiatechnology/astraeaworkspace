import { describe, expect, it } from 'vitest';
import { resolveWriterKeyboardEntryIntent } from '../../../../editing/caret/writerKeyboardEntry';

// AST-0001 · P0. Der Masterplan fordert „Maus-/Tastatursteuerung" für das unmittelbare Beschreiben eines
// leeren Dokuments. Der Mausweg ist über `resolveWriterPageClickTarget` belegt; diese Datei deckt die
// Tastaturhälfte ab, die in Runde 89/90 an drei Stellen nicht aufgefunden wurde.
//
// Die Grenzen sind bewusst scharf: der Einstieg gilt **nur** für das leere Dokument ohne gesetztes Caret und
// **nur** ohne Modifikatortasten. Sonst würde er dem Kurzbefehlmodul und dem Editor selbst in die Quere kommen.

describe('resolveWriterKeyboardEntryIntent', () => {
  it('enters an empty document on a printable character and carries that character', () => {
    expect(
      resolveWriterKeyboardEntryIntent({ hasTextContent: false, key: 'H', hasCaret: false }),
    ).toEqual({ action: 'enter-and-type', text: 'H' });
  });

  it('enters on the space bar without inventing text', () => {
    expect(
      resolveWriterKeyboardEntryIntent({ hasTextContent: false, key: ' ', hasCaret: false }),
    ).toEqual({ action: 'enter-and-type', text: ' ' });
  });

  it('enters on Enter and only places the caret', () => {
    expect(
      resolveWriterKeyboardEntryIntent({ hasTextContent: false, key: 'Enter', hasCaret: false }),
    ).toEqual({ action: 'enter-and-place-caret' });
  });

  // The name said "with content" while the body passed the number 1 and no content at all - it asserted the
  // opposite of its own name and pinned the AST-0006 defect. Two honest cases take its place.
  it('enters a document whose only paragraph is empty (AST-0006)', () => {
    expect(
      resolveWriterKeyboardEntryIntent({ hasTextContent: false, key: 'H', hasCaret: false }),
    ).toEqual({ action: 'enter-and-type', text: 'H' });
  });

  it('leaves a document that actually holds text alone', () => {
    expect(
      resolveWriterKeyboardEntryIntent({ hasTextContent: true, key: 'H', hasCaret: false }),
    ).toEqual({ action: 'ignore', reason: 'not-empty' });
  });

  it('leaves the editor alone once a caret exists', () => {
    expect(
      resolveWriterKeyboardEntryIntent({ hasTextContent: false, key: 'H', hasCaret: true }),
    ).toEqual({ action: 'ignore', reason: 'caret-present' });
  });

  it.each([['ctrlKey'], ['metaKey'], ['altKey']])('does not steal %s shortcuts', (modifier) => {
    expect(
      resolveWriterKeyboardEntryIntent({
        hasTextContent: false,
        key: 's',
        hasCaret: false,
        [modifier]: true,
      } as never),
    ).toEqual({ action: 'ignore', reason: 'modifier' });
  });

  it.each([['Shift'], ['ArrowLeft'], ['F5'], ['Backspace'], ['Escape'], ['Tab']])(
    'does not treat %s as an entry key',
    (key) => {
      expect(resolveWriterKeyboardEntryIntent({ hasTextContent: false, key, hasCaret: false })).toEqual({
        action: 'ignore',
        reason: 'no-entry-key',
      });
    },
  );

  it('is pure — the same input always yields the same answer', () => {
    const input = { hasTextContent: false, key: 'A', hasCaret: false } as const;
    expect(resolveWriterKeyboardEntryIntent(input)).toEqual(resolveWriterKeyboardEntryIntent(input));
  });
});
