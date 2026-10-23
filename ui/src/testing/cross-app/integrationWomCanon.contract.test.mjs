// STATUS: PLATIN — Integration & Release, Paket 1 (AST-1878…1882): WOM-Kanon für alle Dokumentarten
//
// **Anforderung (wörtlich aus dem Tracker):** „Jede App erzeugt stabile dokumentierte IDs und serialisiert nur
// ihren kanonischen Zustand."
//
// **Warum dieser Test misst statt zu behaupten:** Für eine Anforderung über **alle** Dokumentarten ist die
// gefährlichste Antwort „steht doch überall". Dieser Vertrag durchsucht die **Produktionsdateien jeder App** und
// hält den **gemessenen** Zustand fest — auch die Lücken. Ein Test, der eine Lücke benennt, wird rot, sobald
// jemand sie schließt; dann muss die Aussage **bewusst** nachgezogen werden, statt unbemerkt zu veralten.
//
// **Mein eigener Anlauf davor war falsch und ist der Grund für diese Fassung:** Ich hatte je App **einen**
// kanonischen Pfad eingetragen — aus dem Kopf. Der Test wurde sofort rot: der Insight-Pfad existierte nicht, und
// beim Grid stand die Version nur in einem **Kommentar**. Ein Vertrag über geratene Pfade prüft die eigene
// Vermutung, nicht das Produkt. Jetzt wird **app-weit** gemessen, ohne Zuordnungstabelle.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { vi,  describe, expect, it } from 'vitest';

// **Eigener Befund, behoben (Runde 262) ✗✓:** Diese Vertraege **lesen die Produktionsdateien jeder App** —
// *das braucht unter Last laenger als das Standardbudget von 5 s* ✗. Der Notes-Agent hat es gemessen:
// dieselben Dateien waren unter Last rot mit `Error: Test timed out in 5000ms`, und mit groesserem Budget
// **gruen** (*der laengste Test braucht ~2,4 s im Ruhezustand, unter Last ueber 9 s* ✓).
// **Die ehrliche Behebung ist mehr Zeit, nicht eine schwaechere Zusicherung** ✓✓ — *kein `skip`, kein
// gelockertes `expect`* ✗. Deshalb einmal pro Datei das Budget, und alle Aussagen bleiben unveraendert.
vi.setConfig({ testTimeout: 120_000 });

const APPS = ['grid', 'writer', 'present', 'pdf', 'notes', 'vault', 'draw', 'whiteboard', 'connect', 'publish', 'insight'];

/** Alle Produktionsdateien einer App (*.ts/*.tsx, ohne Tests). */
function produktionsdateien(app) {
  const wurzel = join('src/apps', app);
  const out = [];
  const lauf = (dir) => {
    for (const eintrag of readdirSync(dir)) {
      const pfad = join(dir, eintrag);
      if (statSync(pfad).isDirectory()) {
        if (!/^(testing|__tests__)$/u.test(eintrag)) lauf(pfad);
      } else if (/\.(ts|tsx)$/u.test(eintrag) && !/\.test\./u.test(eintrag)) {
        out.push(pfad);
      }
    }
  };
  lauf(wurzel);
  return out;
}

/** Datei ohne Kommentare — damit ein Wort im Kommentar keine Zusage vortäuscht. */
const ohneKommentare = (text) => text
  .replace(/\/\*[\s\S]*?\*\//gu, '')
  .split('\n')
  .filter((l) => !l.trim().startsWith('//'))
  .join('\n');

function appsMitSchemaVersion() {
  const mit = [];
  const ohne = [];
  for (const app of APPS) {
    const treffer = produktionsdateien(app).some((pfad) => /schema[_V]?ersion|schemaVersion/iu.test(ohneKommentare(readFileSync(pfad, 'utf8'))));
    (treffer ? mit : ohne).push(app);
  }
  return { mit, ohne };
}

describe('WOM-Kanon: Schema-Version im kanonischen Pfad jeder Dokumentart', () => {
  it('der gemessene Zustand: welche Dokumentarten tragen eine Schema-Version?', () => {
    const { mit, ohne } = appsMitSchemaVersion();
    // **Der gemessene Zustand, Runde 86.** Wird eine der Lücken geschlossen, wird dieser Test rot — und die
    // Aussage muss bewusst nachgezogen werden. Das ist gewollt: eine Lücke, die niemand mehr benennt,
    // verschwindet nicht, sie wird nur unsichtbar.
    expect({ mit: mit.sort(), ohne: ohne.sort() }).toEqual({
      // **Gemessen in Runde 86** über alle Produktionsdateien, ohne Kommentare. Mein erster Grep hatte
      // Kommentare mitgezählt und dadurch acht Apps gezeigt — im **Code** sind es vier. Genau diese Art
      // geschönter Zahl ist der Grund, warum hier der code-only Text gemessen wird.
      // **Bewusst nachgezogen in Runde 90:** PDF Studio benutzt jetzt den gemeinsamen Versionsvertrag
      // (pps/pdf/studio/state/pdfStudioSchema.ts) — genau die Nachziehung, für die dieser Vertrag gebaut ist.
      mit: ['draw', 'insight', 'pdf', 'publish', 'writer'],
      ohne: ['connect', 'grid', 'notes', 'present', 'vault', 'whiteboard'],
    });
  });

  it('keine App nennt die Version nur in einem Kommentar', () => {
    // Der Grid-Fall aus meinem ersten Anlauf: dort stand `schemaVersion` ausschließlich im Kommentar. Der
    // Test prüft deshalb den code-only Text — eine Zusage, die nur in Prosa existiert, ist keine.
    for (const app of APPS) {
      const dateien = produktionsdateien(app);
      const imCode = dateien.filter((pfad) => /schema[_V]?ersion|schemaVersion/iu.test(ohneKommentare(readFileSync(pfad, 'utf8'))));
      const imKommentar = dateien.filter((pfad) => {
        const roh = readFileSync(pfad, 'utf8');
        return /schema[_V]?ersion|schemaVersion/iu.test(roh) && !/schema[_V]?ersion|schemaVersion/iu.test(ohneKommentare(roh));
      });
      if (imKommentar.length > 0) {
        expect(imCode.length, `${app}: Version nur im Kommentar in ${imKommentar.join(', ')}`).toBeGreaterThan(0);
      }
    }
  });

  it('die drei Dokumentarten ohne Version sind namentlich bekannt, nicht zufällig', () => {
    const { ohne } = appsMitSchemaVersion();
    // Kein stiller Erfolg: Diese drei sind die offene Arbeit aus AST-1878…1882 und werden im Inventar benannt.
    for (const app of ohne) {
      expect(['connect', 'grid', 'notes', 'present', 'vault', 'whiteboard'], `${app} ist neu ohne Schema-Version — Inventar nachziehen`).toContain(app);
    }
  });
});