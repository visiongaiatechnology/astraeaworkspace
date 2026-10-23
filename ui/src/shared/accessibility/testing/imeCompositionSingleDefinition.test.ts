// STATUS: PLATIN — Verhaltensprüfung der gemeinsamen IME-Regel (W-279, Batch 1)
//
// Die **Struktur**prüfung („diese Datei prüft nicht mehr selbst") liegt bewusst in der Schwesterdatei
// `imeCompositionSingleDefinition.contract.test.mjs`: dort wird mit `node:fs` gelesen, und das ist im
// UI-Typsichtbereich nicht erlaubt (`node:fs` ist dort kein bekanntes Modul). Diese Datei prüft nur Verhalten.
import { describe, expect, it } from 'vitest';
import { isImeCompositionEvent } from '../accessibilityPlatform';

describe('die gemeinsame Regel erkennt jede Form der IME-Komposition', () => {
  it('erkennt isComposing', () => {
    expect(isImeCompositionEvent({ isComposing: true })).toBe(true);
  });

  it('erkennt keyCode 229', () => {
    expect(isImeCompositionEvent({ keyCode: 229 })).toBe(true);
  });

  it('erkennt Process und Dead — genau das, was die Kopien verpassten', () => {
    // Der eigentliche Grund für W-279: eine Kopie mit nur `isComposing || keyCode === 229` lässt bei einer
    // laufenden Eingabekomposition (japanisch, chinesisch, koreanisch, Akzente) die Tastenkombination laufen.
    expect(isImeCompositionEvent({ key: 'Process' })).toBe(true);
    expect(isImeCompositionEvent({ key: 'Dead' })).toBe(true);
  });

  it('lässt eine gewöhnliche Tasteneingabe durch', () => {
    expect(isImeCompositionEvent({ key: 'z', keyCode: 90 })).toBe(false);
    expect(isImeCompositionEvent({})).toBe(false);
  });
});
