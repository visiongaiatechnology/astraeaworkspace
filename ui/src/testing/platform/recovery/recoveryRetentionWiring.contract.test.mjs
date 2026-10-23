// STATUS: PLATIN — W-230 Wächter: die Aufbewahrung der Wiederherstellungs-Schnappschüsse ist verdrahtet.
//
// Die reine Regel liegt in `versionRecoveryEngine.ts` und ist in `recoverySnapshotRetention.test.ts` gemessen.
// Hier steht die **Verknüpfung**, die eine reine Funktion nicht beweisen kann: dass der Speicherpfad der
// Auswahl **dieselbe Uhr** gibt, mit der er den Schnappschuss stempelt (sonst entscheidet die Auswahl über ein
// Alter, das sie gegen eine zweite `Date.now()`-Lesung misst), und dass die Byte-Grenze nicht mehr als
// Zahlenliteral im Funktionskörper versteckt ist.
//
// Als `.mjs`, weil hier mit `node:fs` gelesen wird und der UI-Typsichtbereich `node:fs` nicht kennt.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** Kommentare entfernen: eine Erwähnung im Kommentar ist **kein** Aufruf. */
const ohneKommentare = (text) => text
  .replace(/\/\*[\s\S]*?\*\//gu, '')
  .split('\n')
  .filter((line) => !line.trim().startsWith('//'))
  .join('\n');

const storage = ohneKommentare(readFileSync('src/platform/workspace/persistence/workspaceStorageRecovery.ts', 'utf8'));
const engine = ohneKommentare(readFileSync('src/platform/recovery/versionRecoveryEngine.ts', 'utf8'));

describe('W-230 — die Auswahl bekommt die Uhr des Stempels und eine benannte Grenze', () => {
  it('übergibt `now` an `selectRecoveryRetention`', () => {
    const callIndex = storage.indexOf('selectRecoveryRetention(');
    expect(callIndex).toBeGreaterThan(-1);
    const call = storage.slice(callIndex, storage.indexOf(';', callIndex));
    expect(call).toContain('], now)');
  });

  it('hält die Byte-Grenze nicht mehr als Literal im Funktionskörper', () => {
    expect(engine).not.toContain('const maxBytes = 256');
    expect(engine).toContain('maxRecoverySnapshotBytesPerDocument');
    expect(engine).toContain('maxRecoverySnapshotAgeMs');
  });
});
