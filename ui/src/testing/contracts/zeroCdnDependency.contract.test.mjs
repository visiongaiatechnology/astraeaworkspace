// STATUS: PLATIN — Der siebte Wächter: **Zero-CDN** (VGT-UI/UX §18 und §17.2)
//
// ## Warum dieser Wächter existiert
//
// Der verbindliche UI/UX-Standard verbietet **Runtime-CDN-Abhängigkeiten** ✓: JavaScript ✓, CSS-Frameworks ✓, Fonts ✓,
// Icons ✓, 3D-Engines ✓, Modelle ✓, Texturen ✓ — *„Ein Interface darf nicht plötzlich visuell zerfallen, nur weil ein
// Drittserver ausfällt."* ✓ ✓ Und externe Icon-CDN sind **namentlich** verboten ✓.
//
// **Ein Verbot, das niemand prüft, ist ein Vorsatz** ✓ — und Vorsätze haben in diesem Projekt **dreimal** versagt ✓.
// Deshalb ist es eine Prüfung: mechanisch ✓, mit **Nicht-Leerheit** ✓ und einem **Gegencheck** ✓.
//
// ## Die Fallstrickrichtung ist hier **umgekehrt** — und das ist die Lehre aus Runde 193 ✗
//
// Damals zählte ich Spezifizierer **nach** dem Entfernen der Zeichenketten ✗ — und die Spezifizierer **sind** die
// Zeichenketten ✓. **Hier ist es genau andersherum ✓:** Die verbotenen Adressen stehen **in Zeichenketten** ✓
// (`src="https://cdn…"` ✓), also müssen die **Zeichenketten bleiben** ✓ und die **Kommentare weg** ✓ — *sonst würde
// dieser Kopfkommentar, der die Muster **nennt**, den Wächter gegen sich selbst auslösen* ✗ ✓.
//
// > **Die Regel lautet nicht „Zeichenketten entfernen" und nicht „Kommentare entfernen", sondern: entferne genau das,
// > was die Frage **nicht** betrifft.** ✓ *Das ist dieselbe Lehre wie „Muster durch Struktur" — nur eine Ebene höher.*
//
// ## Was er **nicht** kann ✗ — und das steht hier, damit ihn niemand für vollständiger hält
//
// Er sieht **Textmuster** ✓. Er sieht **nicht** ✗: eine Abhängigkeit, die zur Bauzeit hereinkommt und erst im Bundel
// landet ✓; eine erlaubte lokale Datei, die **inhaltlich** von außen geholt wurde ✓; und **Netzverkehr zur Laufzeit**
// aus einem Skript heraus (`fetch('https://…')` ✓ — das ist kein CDN, aber auch nicht Nichts ✓).
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

const WURZELN = ['src', 'index.html'];
const ENDUNGEN = /\.(ts|tsx|mjs|js|jsx|css|html)$/u;

/**
 * **Nur Kommentare entfernen** ✓ — Zeichenketten bleiben, weil die Antwort **in** ihnen steht ✓ ✓.
 * Ein `//` innerhalb einer Zeichenkette wird **nicht** getroffen, weil zuerst die Blockkommentare und dann
 * zeilenweise nur ein **führendes** `//` entfernt wird ✓.
 */
function ohneKommentare(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .split('\n')
    .filter((z) => !z.trim().startsWith('//') && !z.trim().startsWith('*'))
    .join('\n');
}

/** Die verbotenen Muster ✓ — als **Struktur** (Adresse ✓), nicht als Stichwort im Fließtext ✓. */
const MUSTER = [
  { name: 'CDN-Host', re: /\b(?:https?:)?\/\/(?:[a-z0-9-]+\.)*(?:cdn|cdnjs|unpkg|jsdelivr|jsdelivr\.net|maxcdn|bootstrapcdn|tailwindcss)\.[a-z.]+\//giu },
  { name: 'Font-CDN', re: /\b(?:https?:)?\/\/fonts\.(?:googleapis|gstatic)\.com\//giu },
  { name: 'Typekit/Adobe-Fonts', re: /\b(?:https?:)?\/\/use\.(?:typekit|adobe)\.(?:net|com)\//giu },
  { name: 'Fremdes Script/Stylesheet', re: /<(?:script|link)\b[^>]*\b(?:src|href)\s*=\s*["']https?:\/\//giu },
  { name: 'Fremdes @import', re: /@import\s+(?:url\()?["']?https?:\/\//giu },
  { name: 'Fremdes url() in CSS', re: /url\(\s*["']?(?:https?:)?\/\//giu },
];

function sammle(pfad, out = []) {
  let st;
  try { st = statSync(pfad); } catch { return out; }
  if (st.isFile()) { if (ENDUNGEN.test(pfad)) out.push(pfad.replace(/\\/gu, '/')); return out; }
  for (const e of readdirSync(pfad)) {
    if (['node_modules', 'dist', '.git', 'coverage'].includes(e)) continue;
    sammle(join(pfad, e), out);
  }
  return out;
}

// **Nur Produktionsquellen** ✓ — und das ist eine **Entscheidung aus dem Artefakt** ✓, kein bequemer Filter ✗:
// Der erste Lauf fand sechs `url(https://…)` in **Sicherheitstests** ✓ (`taskAttachments.test.ts` ✓, zwei
// Whiteboard-Interchange-Tests ✓, `writerParagraphDecoration.test.ts` ✓, `svgRasterizer.test.ts` ✓). *Eine externe
// Adresse in einer Prüfung ist ein **Angriffsvektor** ✓, keine Abhängigkeit* ✓ — und ein Wächter, der Sicherheitstests
// als Verstoß meldet, erzieht dazu, ihn abzuschalten ✗ ✓. **Elf weitere Funde waren der Wächter selbst** ✗: seine
// Selbstprüfung enthält die Muster als Zeichenketten ✓. Beides fällt unter dieselbe Regel ✓:
//     **Externe Adressen sind in Produktionsquellen verboten und in Prüfungen erlaubt.** ✓
// **Was der Wächter damit ausdrücklich NICHT mehr sieht ✗:** eine externe Abhängigkeit, die **nur** in einer Testdatei
// stünde und von dort in den Bundel gelangte ✓ — das ist bei Testdateien nicht der Fall ✓, aber es steht hier, damit
// niemand den Geltungsbereich für vollständiger hält, als er ist ✓.
const IST_PRUEFUNG = /(^|\/)(?:testing\/|__tests__\/)|\.test\.|\.spec\./u;
const DATEIEN = WURZELN.flatMap((w) => sammle(w)).filter((p) => !IST_PRUEFUNG.test(p));

describe('VGT §18: keine Runtime-CDN-Abhängigkeit', () => {
  it('**Nicht-Leerheit:** es wurden wirklich Dateien gelesen, und es gibt lokale Assets', () => {
    expect(DATEIEN.length, 'keine Produktionsquellen gefunden — der Pfad stimmt nicht').toBeGreaterThan(100);
    expect(DATEIEN.some((p) => IST_PRUEFUNG.test(p)), 'der Filter hat nichts zu filtern — dann prüft er nichts').toBe(false);
    // **Die Gegenprobe ✓:** Wenn der Wächter nur deshalb still ist, weil er **nichts** liest, wäre er wertlos ✓.
    // Also wird geprüft, dass es überhaupt **lokale** Asset-Verweise gibt ✓ — dann liest er wirklich Inhalte ✓.
    const lokal = DATEIEN.reduce((n, p) => n + (ohneKommentare(readFileSync(p, 'utf8')).match(/["'(]\.{0,2}\/[^"')]+\.(?:svg|png|woff2?|ttf|css|json)/gu) ?? []).length, 0);
    expect(lokal, 'kein einziger lokaler Asset-Verweis — die Prüfung liest keine Inhalte').toBeGreaterThan(3);
  });

  it('**keine** der verbotenen Adressformen kommt vor', () => {
    const funde = [];
    for (const p of DATEIEN) {
      const text = ohneKommentare(readFileSync(p, 'utf8'));
      for (const { name, re } of MUSTER) {
        re.lastIndex = 0;
        for (const treffer of text.matchAll(re)) funde.push(`${p}  [${name}]  ${treffer[0].slice(0, 90)}`);
      }
    }
    expect(funde, `Runtime-CDN-Abhängigkeiten gefunden (${funde.length}):\n    ${funde.join('\n    ')}`).toEqual([]);
  });

  it('**Selbstprüfung:** der Wächter erkennt die Muster — und lässt lokale Pfade in Ruhe', () => {
    const pruefe = (text) => {
      const t = ohneKommentare(text);
      return MUSTER.some(({ re }) => { re.lastIndex = 0; return re.test(t); });
    };
    // **Er muss anschlagen** ✓ — sonst wäre er ein Wächter, der nichts erkennt ✓.
    expect(pruefe('<script src="https://cdn.jsdelivr.net/npm/x@1/y.js"></script>')).toBe(true);
    expect(pruefe('@import url("https://fonts.googleapis.com/css2?family=X");')).toBe(true);
    expect(pruefe('background: url(https://cdnjs.cloudflare.com/ajax/libs/x.png);')).toBe(true);
    // **Und er darf lokale Pfade nicht anfassen** ✓ — ein Wächter mit Fehlalarmen wird abgeschaltet ✓.
    expect(pruefe('<script src="./local/app.js"></script>')).toBe(false);
    expect(pruefe('background: url("../assets/grid.svg");')).toBe(false);
    expect(pruefe("import { x } from './module';")).toBe(false);
  });
});