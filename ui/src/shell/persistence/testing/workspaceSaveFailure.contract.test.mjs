// STATUS: PLATIN — W-229: Die Kette steht (Strukturprüfung als .mjs, weil hier Dateien gelesen werden)
//
// Die Verhaltensprüfung des Klassifizierers liegt in `workspaceSaveFailure.test.ts`. Hier wird geprüft, dass die
// **Kette** geschlossen ist — vom Hook über die Statusleiste bis in den Sprachkatalog. Ohne diese Prüfung kann
// ein späterer Umbau den Grund wieder verschwinden lassen, ohne dass ein Verhaltenstest das merkt.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ohneKommentare = (text) => text
  .replace(/\/\*[\s\S]*?\*\//gu, '')
  .split('\n')
  .filter((line) => !line.trim().startsWith('//'))
  .join('\n');

const HOOK = ohneKommentare(readFileSync('src/shell/persistence/useWorkspaceAutosave.ts', 'utf8'));
const BAR = ohneKommentare(readFileSync('src/shell/status/ShellStatusBar.tsx', 'utf8'));
const KATALOG = readFileSync('src/shell/i18n/shellChromeLocale.ts', 'utf8');

describe('die Kette steht', () => {
  it('der Hook setzt den Grund und löscht ihn bei Erfolg', () => {
    // Beta 0.1: der Grund wird mit **Stufe** klassifiziert (Datei / Cache), damit Statusleiste und
    // Banner die echte Persistenzschicht nennen können — der Code bleibt der kleine Wortschatz.
    expect(HOOK).toContain('classifyWorkspaceSaveFailureDetailed(error)');
    expect(HOOK, 'Stufe wird nicht durchgereicht').toMatch(/detail:/u);
    expect(HOOK, 'Grund wird beim Erfolg nicht gelöscht').toMatch(/setSaveFailure\(null\)/u);
    expect(HOOK, 'Grund wird nicht zurückgegeben').toMatch(/return \{\s*saveStatus, saveFailure,/u);
  });

  it('die Statusleiste zeigt ihn nur im Fehlerfall und für Hilfstechnik erreichbar', () => {
    expect(BAR).toMatch(/status\.save === 'error' && status\.saveFailure/u);
    expect(BAR).toMatch(/role="status"/u);
    expect(BAR).toMatch(/aria-live="polite"/u);
    // Der Katalogzugriff läuft über die **oberste** Katalogeebene, nicht über den `status`-Block: `saveFailure`
    // liegt dort, wo auch `saveState` liegt. Meine erste Fassung prüfte den falschen Zugriff und wurde nach der
    // Korrektur rot — die Ursache war der Test, nicht der Code.
    expect(BAR).toContain('saveFailureCopy[status.saveFailure.code]');
    expect(BAR).toContain('const saveFailureCopy = shellChromeCopy(locale).saveFailure;');
  });

  it('der Katalog kennt **jeden** Grund in **jeder** Sprache', () => {
    // Vier Gründe, sieben Sprachen — jede Sprache muss alle vier nennen, sonst bliebe ein Fehlerfall stumm.
    const sprachen = (KATALOG.match(/saveFailure: \{/gu) ?? []).length;
    expect(sprachen, 'nicht alle sieben Sprachen haben saveFailure').toBe(7);
    for (const grund of ['storage-full', 'save-blocked', 'native-unavailable', 'unknown']) {
      const treffer = (KATALOG.match(new RegExp(`'${grund}':`, 'gu')) ?? []).length;
      expect(treffer, `${grund} fehlt in mindestens einer Sprache`).toBe(7);
    }
  });

  it('jeder Grund nennt einen Ausweg, nicht nur den Zustand', () => {
    // „Der Grund ist nicht näher bestimmbar" allein wäre keine Hilfe; der Satz muss eine Handlung enthalten.
    const zeile = /saveFailure: \{([^}]*)\}/u.exec(KATALOG);
    expect(zeile, 'kein saveFailure-Eintrag gefunden').not.toBeNull();
    expect(zeile[1]).toMatch(/erneut|warten|freigeben|starten|prüfen|restart|wait|free|save again/iu);
  });
});
