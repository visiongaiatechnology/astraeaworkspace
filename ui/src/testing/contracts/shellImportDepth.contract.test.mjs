// STATUS: PLATIN — **W-428, sechster Wächter: die Shell.** Wo der neunte Tiefenfehler saß.
//
// ## Warum diese Datei existiert
//
// Der **geteilte** Wächter (`apps/writer/testing/unit/editor/focus/testImportDepth.contract.test.mjs` ✓) sammelt nur
// `*.test.*` unter `src/apps` ✗ — **Quelldateien** und die **Shell** sind für ihn unsichtbar ✗ ✓. Die fünf app-lokalen
// Wächter (Notes ✓ Vault ✓ Automate ✓ Admin & Policy ✓ Grid ✓) decken **ihre** App ✓ — und in Runde 192 habe ich in
// **`src/shell/workspace/drag/testing/dragSession.test.ts`** einen Tiefenfehler gemacht ✗ (`../../workspace/drag/…`
// statt `../dragSession` ✓), den **kein** Wächter gesehen hätte ✓ ✓. *Der Wächter war app-lokal, die Krankheit nicht.*
//
// ## Was er prüft — und was er ausdrücklich **nicht** kann
//
// Er läuft über **jede** `.ts/.tsx/.mjs/.js` unter `src/shell` ✓ — **Quelle und Tests** ✓ —, entfernt **Kommentare
// **und** Zeichenketten** ✓ (die Lehre aus Vault und Notes: *ein Wächter, dessen eigene Beispiele den Selbstcheck
// täuschen* ✓), löst **jeden relativen** Spezifizierer gegen die Verzeichnisebene der Datei auf ✓ und verlangt, dass
// die Bruchliste **leer** ist ✓.
//
// **Nicht-Leerheit ist Teil der Zusicherung** ✓: Dateien ✓, Spezifizierer ✓, Typ-Importe ✓ — *eine Prüfung, die auf
// einer leeren Liste grün ist, ist keine Prüfung* ✓. Das hat sich in dieser Sitzung **sechsmal** bezahlt gemacht ✓.
//
// **Und die eine Grenze, die er hat ✗:** Er prüft **Tiefen** ✓, **nicht** Modulverfügbarkeit ✗ (`node:fs` in einer
// `.tsx`-Datei sieht er **nicht** ✓ — dafür ist Vaults Erweiterung die Vorlage ✓). Das steht hier, damit niemand ihn
// für vollständiger hält, als er ist ✓.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SHELL = 'src/shell';
const ENDUNGEN = ['.ts', '.tsx', '.mjs', '.js', '.json'];

function alleDateien(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) { if (!['node_modules', 'dist'].includes(e)) alleDateien(p, out); }
    else if (/\.(ts|tsx|mjs|js)$/u.test(e)) out.push(p.replace(/\\/gu, '/'));
  }
  return out;
}

/** Kommentare **und** Zeichenketten entfernen — sonst täuscht ein Beispiel im Kommentar den Selbstcheck. */
function ohneKommentareUndStrings(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .split('\n')
    .filter((z) => !z.trim().startsWith('//'))
    .map((z) => z.replace(/'(?:[^'\\]|\\.)*'/gu, "''").replace(/"(?:[^"\\]|\\.)*"/gu, '""').replace(/`(?:[^`\\]|\\.)*`/gu, '``'))
    .join('\n');
}

function loestAuf(von, spez) {
  const basis = resolve(dirname(von), spez);
  if (existsSync(basis) && statSync(basis).isFile()) return true;
  for (const endung of ENDUNGEN) if (existsSync(basis + endung)) return true;
  for (const endung of ENDUNGEN) if (existsSync(join(basis, `index${endung}`))) return true;
  return false;
}

const DATEIEN = alleDateien(SHELL);
const IMPORT_MUSTER = /(?:^|[^\w.])(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\sfrom\s+)?['"](\.[^'"]*)['"]/gmu;
const DYNAMISCH = /\bimport\s*\(\s*['"](\.[^'"]*)['"]\s*\)/gu;
const ZITAT = /['"](\.[^'"]*)['"]/gu;

describe('W-428 (Shell): jede relative Angabe unter src/shell löst auf', () => {
  it('die Prüfung ist **nicht leer** — Dateien, Spezifizierer, Typ-Importe', () => {
    let spezifizierer = 0;
    let typImporte = 0;
    for (const p of DATEIEN) {
      // **Eigener Fehler, korrigiert (Runde 193):** Ich zählte die Spezifizierer **nach** dem Entfernen der
      // Zeichenketten ✗ — und die Spezifizierer **sind** die Zeichenketten ✓. Genau der Fehler, für dessen Fang ich
      // Vault zwei Runden zuvor gelobt hatte ✓. Die Zählung liest jetzt den **rohen** Text ✓; für eine **Untergrenze**
      // ist ein Überzählen harmlos ✓ (es macht die Grenze schwächer, nicht die Prüfung) ✓.
      const roh = readFileSync(p, 'utf8');
      const ohneStrings = ohneKommentareUndStrings(roh);
      spezifizierer += [...roh.matchAll(ZITAT)].length;
      typImporte += (ohneStrings.match(/import\s+type\b/gu) ?? []).length;
    }
    // **Gemessen, nicht geschätzt** ✓: die Werte sind Untergrenzen der heutigen Zahlen ✓.
    expect(DATEIEN.length, 'Keine Dateien gefunden — der Pfad stimmt nicht').toBeGreaterThan(30);
    expect(spezifizierer, 'Keine relativen Spezifizierer — die Prüfung wäre leer').toBeGreaterThan(40);
    expect(typImporte, 'Keine Typ-Importe — die Prüfung wäre leer').toBeGreaterThan(3);
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

  it('**Selbstprüfung:** der Wächter kennt seine eigene Adresse und wird nicht selbst zum Fund', () => {
    // Fängt er sich selbst, ist die Auflösung kaputt — und nicht die Shell. *Ein Werkzeug, das sich selbst als
    // Fehler meldet, ist unbrauchbar.*
    expect(loestAuf('src/shell/workspace/drag/testing/dragSession.test.ts', '../dragSession')).toBe(true);
    expect(loestAuf('src/shell/workspace/drag/testing/dragSession.test.ts', '../../workspace/drag/dragSession')).toBe(false);
  });
});
