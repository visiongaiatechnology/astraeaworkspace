// STATUS: PLATIN — W-229: Der Grund eines gescheiterten Speicherns ist erklärbar, ohne etwas zu verraten
//
// **Der Fund:** `useWorkspaceAutosave` setzte bei einem Fehler nur `'error'`. Die Statusleiste zeigte
// „Speichern: Fehler" — und **keine** Erklärung. Der Kommentar an der Stelle nennt den berechtigten Grund für
// die Stille: eine rohe Fehlermeldung kann Pfade oder Inhalte enthalten. Erklärbarkeit und Vertraulichkeit sind
// aber kein Widerspruch — das ist der Kern dieser Behebung.
//
// **Diese Datei prüft nur Verhalten.** Die Strukturprüfung (Hook setzt und löscht den Grund, Leiste zeigt ihn
// nur im Fehlerfall, Katalog kennt jeden Grund in jeder Sprache) liegt in der Schwesterdatei
// `workspaceSaveFailure.contract.test.mjs`: dort wird mit `node:fs` gelesen, und das ist im UI-Typsichtbereich
// nicht erlaubt (`node:fs` ist dort kein bekanntes Modul — dieselbe Trennung wie überall in diesem Projekt).
import { describe, expect, it } from 'vitest';
import { classifyWorkspaceSaveFailure } from '../workspaceSaveFailure';

describe('der Klassifizierer erkennt die unterscheidbaren Fälle', () => {
  it('erkennt einen vollen Ablageplatz', () => {
    expect(classifyWorkspaceSaveFailure(Object.assign(new Error('write failed'), { name: 'QuotaExceededError' }))).toBe('storage-full');
    expect(classifyWorkspaceSaveFailure({ code: 'ENOSPC' })).toBe('storage-full');
  });

  it('erkennt eine belegte Sperre', () => {
    expect(classifyWorkspaceSaveFailure(new Error('save lease is busy'))).toBe('save-blocked');
    expect(classifyWorkspaceSaveFailure({ code: 'LOCKED' })).toBe('save-blocked');
  });

  it('erkennt eine fehlende native Ablage', () => {
    expect(classifyWorkspaceSaveFailure(new Error('tauri ipc unavailable'))).toBe('native-unavailable');
  });

  it('fällt sonst auf unknown zurück — und verrät dabei nichts', () => {
    // Der wichtigste Fall: Ein Fehlertext **mit einem Pfad** darf nicht durchsickern, sondern wird zu `unknown`.
    expect(classifyWorkspaceSaveFailure(new Error('C:\\Users\\Someone\\Documents\\geheim.docx'))).toBe('unknown');
    expect(classifyWorkspaceSaveFailure(undefined)).toBe('unknown');
    expect(classifyWorkspaceSaveFailure('irgendwas')).toBe('unknown');
  });

  it('gibt niemals den Fehlertext zurück', () => {
    const geheim = 'C:\\Users\\Someone\\Documents\\geheim.docx';
    const ergebnis = classifyWorkspaceSaveFailure(new Error(geheim));
    expect(ergebnis).not.toContain('geheim');
    expect(ergebnis).not.toContain('\\');
  });
});
