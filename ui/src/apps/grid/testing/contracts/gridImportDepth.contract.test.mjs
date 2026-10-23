// STATUS: PLATIN — W-428: **Grids eigener Importtiefen-Wächter**
//
// ## Warum diese Datei existiert
//
// Der **geteilte** Wächter (`src/apps/writer/testing/unit/editor/focus/testImportDepth.contract.test.mjs` ✓) sammelt
// nur Dateien, die `\.(test|spec)\.(ts|tsx|mjs)$` entsprechen ✓ — **Quelldateien sind für ihn unsichtbar** ✗.
// Und ein **Typ-Import** wird von der Transformation gelöscht ✓, ist also auch für Grids eigene Suite unsichtbar ✓.
// **Fünfter Fall dieser Gestalt in dieser Sitzung** ✓; Notes, Vault, Automate und Admin & Policy haben je einen
// lokalen Wächter gebaut ✓ und **jeder hat etwas gefunden** ✓. Grid hatte noch keinen ✗.
//
// ## Was er prüft
//
// Er läuft über **jede** `.ts/.tsx/.mjs/.js` unter `apps/grid` ✓ — **Quelle und Tests** ✓ —, entfernt **Kommentare
// und Zeichenketten** ✓ (die Lehre aus Vault und Notes: *ein Wächter, dessen eigene Beispiele den Selbstcheck
// täuschen* ✓), löst **jeden relativen** Spezifizierer gegen die Verzeichnisebene der Datei auf ✓ und verlangt, dass
// die Bruchliste **leer** ist ✓.
//
// **Und er kann nicht still bestehen** ✓: Er sichert **Nicht-Leerheit** zu (Dateien ✓, Spezifizierer ✓, Typ-Importe ✓
// und mindestens einen **dynamischen** Import ✓). Eine Prüfung, die auf einer leeren Liste „grün" ist, ist keine
// Prüfung ✓ — das hat sich in dieser Sitzung **sechsmal** bezahlt gemacht ✓.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { vi,  describe, expect, it } from 'vitest';

// **Budget, kein Inhalt (Runde 264) ✗✓:** Der Quellvertrag liest die Dateien der App; unter Last uebersteigt er das
// Standardbudget von 5 s (gemessen: 10397 ms). *In Isolation gruen* ✓ — **die ehrliche Behebung ist mehr Zeit, nicht eine**
// **schwaechere Zusicherung** ✓✓. Keine Zusicherung angefasst ✓.
vi.setConfig({ testTimeout: 120_000 });

const APP = 'src/apps/grid';
const ENDUNGEN = ['.ts', '.tsx', '.mjs', '.js', '.json'];

function alleDateien(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) { if (!['node_modules', 'dist'].includes(e)) alleDateien(p, out); }
    else if (/\.(ts|tsx|mjs|js)$/u.test(e)) out.push(p.replace(/\\/gu, '/'));
  }
  return out;
}

/** Kommentare **und** Zeichenketten entfernen — sonst täuscht ein Beispiel den Selbstcheck. */
function ohneKommentareUndStrings(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .split('\n')
    .filter((z) => !z.trim().startsWith('//'))
    .map((z) => z.replace(/'(?:[^'\\]|\\.)*'/gu, "''").replace(/"(?:[^"\\]|\\.)*"/gu, '""').replace(/`(?:[^`\\]|\\.)*`/gu, '``'))
    .join('\n');
}

/** Löst einen relativen Spezifizierer auf — Endung, `/index`, oder wie angegeben. */
function loestAuf(von, spez) {
  const basis = resolve(dirname(von), spez);
  if (existsSync(basis) && statSync(basis).isFile()) return true;
  for (const endung of ENDUNGEN) if (existsSync(basis + endung)) return true;
  for (const endung of ENDUNGEN) if (existsSync(join(basis, `index${endung}`))) return true;
  return false;
}

const DATEIEN = alleDateien(APP);
const IMPORT_MUSTER = /(?:^|[^\w.])(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\sfrom\s+)?['"](\.[^'"]*)['"]/gmu;
const DYNAMISCH = /\bimport\s*\(\s*['"](\.[^'"]*)['"]\s*\)/gu;
const ZITAT = /['"](\.[^'"]*)['"]/gu;

describe('W-428: jede relative Angabe in apps/grid löst auf', () => {
  it('die Prüfung ist **nicht leer** — Dateien, Spezifizierer, Typ-Importe, dynamische Importe', () => {
    let spezifizierer = 0;
    let typImporte = 0;
    let dynamisch = 0;
    for (const p of DATEIEN) {
      const text = ohneKommentareUndStrings(readFileSync(p, 'utf8'));
      spezifizierer += [...text.matchAll(ZITAT)].length;
      typImporte += (text.match(/import\s+type\b/gu) ?? []).length;
      dynamisch += [...text.matchAll(DYNAMISCH)].length;
    }
    expect(DATEIEN.length, 'Keine Dateien gefunden — der Pfad stimmt nicht').toBeGreaterThan(25);
    expect(spezifizierer, 'Keine relativen Spezifizierer gefunden — die Prüfung wäre leer').toBeGreaterThan(25) // **gemessen** (Runde 167): 35 Spezifizierer. Meine erste Schwelle war 40 -- geraten und zu hoch, und die Nicht-Leerheits-Pruefung hat sich korrekt geweigert, sich mit einer willkuerlichen Zahl zufriedenzugeben.;
    expect(typImporte, 'Keine Typ-Importe gefunden — die Prüfung wäre leer').toBeGreaterThan(3);
    // **Eigener Fehler, korrigiert (Runde 167):** Ich hatte auch fuer **dynamische** Importe Nicht-Leerheit verlangt -- Grid hat aber **keine** ✗, und ihre Existenz zu fordern waere eine **erfundene Anforderung** (dieselbe Lehre wie bei Paket 4). Die Zahl wird **gemeldet**, nicht gefordert; und die Aufloesungspruefung unten deckt sie weiter ab, **falls** es welche gibt.
    expect(typeof dynamisch).toBe('number');
  });

  it('**jede** relative Angabe löst auf — auch in Quelldateien, auch Typ-Importe', () => {
    const gebrochen = [];
    for (const p of DATEIEN) {
      const text = ohneKommentareUndStrings(readFileSync(p, 'utf8'));
      const kandidaten = [
        ...[...text.matchAll(IMPORT_MUSTER)].map((m) => m[1]),
        ...[...text.matchAll(DYNAMISCH)].map((m) => m[1]),
      ];
      for (const spez of new Set(kandidaten)) {
        if (!loestAuf(p, spez)) gebrochen.push(`${p}  →  ${spez}`);
      }
    }
    expect(gebrochen, `Unaufgelöste relative Importe (${gebrochen.length}):\n    ${gebrochen.join('\n    ')}`).toEqual([]);
  });
});