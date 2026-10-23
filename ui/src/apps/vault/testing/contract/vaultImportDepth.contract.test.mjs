// STATUS: PLATIN — Importtiefen-Wächter für den **eigenen** Bereich, Quelle **und** Tests.
//
// **Warum es diese Datei gibt (gemessen, nicht vermutet):** Der geteilte Wächter
// (`src/apps/writer/testing/unit/editor/focus/testImportDepth.contract.test.mjs`) sammelt nur Dateien, die
// `\.(test|spec)\.(ts|tsx|mjs)$` entsprechen. Eine falsche relative Tiefe in einer **Quelldatei** unter
// `shared/vault/**` oder `apps/vault/**` wird dort also **nie** geprüft. Und sie ist auch für die eigene
// Testsuite unsichtbar, wenn der Import **typsch** ist: `import type { … } from '…'` wird vom Transform
// gelöscht, es gibt zur Laufzeit keinen Auflösungsfehler. In einem Bereich mit Sicherheits- und
// Autoritätscode ist eine falsche Tiefe genau die Art Fehler, die niemand bemerkt, bis sie jemand bemerkt.
//
// **Was hier geprüft wird, ohne der eigenen Sorgfalt zu vertrauen:**
//   1. **Jede** Datei im Bereich wird gescannt — `.ts/.tsx/.mjs/.js`, Quelle **und** Tests.
//   2. **Kommentare werden entfernt, Zeichenketten bleiben stehen.** Die Reihenfolge ist der ganze Trick und
//      war in meiner ersten Fassung falsch: ich hatte auch Zeichenketten entfernt — und damit **die
//      Importpfade selbst**, worauf der Scan 0 Spezifizierer fand und die Nicht-Trivialitätsprüfung ansprang.
//      Genau dafür ist diese Prüfung da. Kommentare müssen weg (ein auskommentierter Import darf nicht
//      zählen, und ein Kommentar, der einen entfernten Bezeichner erklärt, erst recht nicht); die
//      Spezifizierer selbst müssen bleiben.
//   3. **Jeder** relative Spezifizierer wird aufgelöst — mit den Endungen und `index`-Dateien, die
//      TypeScript/Vite tatsächlich verwenden.
//   4. Die kaputte Liste muss **leer** sein.
//   5. Der Scan muss **nicht-trivial** sein: Datei- und Spezifiziererzahlen werden auf Untergrenzen geprüft.
//      Ein Wächter, der versehentlich nichts scannt, wäre sonst still grün — die Fehlerart, die dieses
//      Projekt als „Nullmessung" kennt.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();
const SRC = path.join(repoRoot, 'src');
/** Der eigene Bereich: Vault-App, geteiltes Vault-Modell und der Laufzeiteinstieg der App. */
const OWNED_ROOTS = [
  path.join(SRC, 'apps', 'vault'),
  path.join(SRC, 'shared', 'vault'),
  path.join(SRC, 'edition', 'open-core', 'apps', 'vault'),
];
const EXTENSIONS = ['.ts', '.tsx', '.mjs', '.js'];

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      walk(full, out);
      continue;
    }
    if (EXTENSIONS.some((extension) => entry.name.endsWith(extension))) out.push(full);
  }
  return out;
}

/** Nur Kommentare entfernen — Zeichenketten bleiben, weil die Importpfade darin stehen. */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/gu, '$1 ');
}

/**
 * **Nur Template-Literale entfernen** — einfache und doppelte Zeichenketten bleiben.
 *
 * **Warum es diese zweite Funktion gibt (GAP-0043, Runde 345):** `stripComments` allein lässt
 * Meldungstexte stehen, und ein Meldungstext kann wie Code aussehen. Gemessen:
 *     ? `The stored bytes do not match the import (${verdict.reason}, first difference at block ${…`
 * — das Muster `/import\s*\(\s*[A-Za-z_$]/u` trifft dort, weil auf `import (` ein `$` folgt.
 *
 * **Warum nicht alle Zeichenketten entfernt werden:** der Kopf dieser Datei hält fest, dass eine frühere
 * Fassung genau das tat — und damit die **Importpfade selbst** entfernte, worauf der Scan 0 Spezifizierer
 * fand. Die Trennung ist deshalb: **Spezifizierer stehen in `'…'`, Meldungstexte in `` `…` ``.**
 *
 * **Grenze, benannt:** ein Backtick **innerhalb** einer einfachen Zeichenkette oder eines Kommentars würde
 * hier zu viel entfernen. Das ist in diesem Bereich nicht der Fall — und wenn es einer wäre, fiele es am
 * nächsten `stripComments`-Test auf, nicht still.
 */
function stripTemplateLiterals(source) {
  return source.replace(/`(?:[^`\\]|\\.)*`/gu, '""');
}

const SPECIFIER = /(?:from|import|require)\s*\(?\s*'([^']+)'/gu;

function relativeSpecifiersOf(file) {
  const code = stripComments(readFileSync(file, 'utf8'));
  return [...code.matchAll(SPECIFIER)]
    .map((match) => match[1])
    .filter((specifier) => specifier.startsWith('.'));
}

function resolves(fromFile, specifier) {
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    base,
    ...EXTENSIONS.map((extension) => `${base}${extension}`),
    ...EXTENSIONS.map((extension) => path.join(base, `index${extension}`)),
  ];
  return candidates.some((candidate) => existsSync(candidate) && statSync(candidate).isFile());
}

const FILES = OWNED_ROOTS.flatMap((root) => walk(root));
const SCAN = FILES.map((file) => ({ file, specifiers: relativeSpecifiersOf(file) }));
const TOTAL_SPECIFIERS = SCAN.reduce((sum, entry) => sum + entry.specifiers.length, 0);
const BROKEN = SCAN.flatMap(({ file, specifiers }) => specifiers
  .filter((specifier) => !resolves(file, specifier))
  .map((specifier) => `${path.relative(repoRoot, file).replace(/\\/gu, '/')} → ${specifier}`));

const relative = (file) => path.relative(repoRoot, file).replace(/\\/gu, '/');
const sourceFiles = FILES.filter((file) => !/\.(test|spec)\./u.test(file));

describe('Importtiefen im eigenen Bereich: Quelle UND Tests', () => {
  it('der Scan ist nicht-trivial — sonst wäre ein grünes Ergebnis eine Nullmessung', () => {
    // Ein Wächter, der nichts scannt, ist still grün. Diese Zusicherungen machen das unmöglich. Genau hier
    // ist meine erste Fassung angesprungen, weil sie die Importpfade mit den Zeichenketten entfernt hatte.
    expect(FILES.length, 'keine Dateien gefunden').toBeGreaterThan(50);
    expect(TOTAL_SPECIFIERS, 'keine relativen Importe gefunden').toBeGreaterThan(100);
    // Und der Scan deckt **Quelldateien** ab, nicht nur Tests — das ist der eigentliche Punkt.
    expect(sourceFiles.length, 'keine Quelldateien im Scan').toBeGreaterThan(30);
    expect(sourceFiles.some((file) => relative(file).includes('shared/vault/'))).toBe(true);
    expect(sourceFiles.some((file) => relative(file).includes('apps/vault/'))).toBe(true);
    expect(sourceFiles.some((file) => relative(file).includes('edition/open-core/apps/vault/'))).toBe(true);
  });

  it('jeder relative Import löst auf — in Quell- und Testdateien', () => {
    // Die Liste wird vollständig ausgegeben, damit eine falsche Tiefe durch Abzählen behebbar ist.
    expect(BROKEN).toEqual([]);
  });

  it('auch **typsche** Importe werden geprüft (sie sind zur Laufzeit unsichtbar)', () => {
    // `import type … from '…'` wird vom Transform gelöscht: die Suite kann eine falsche Tiefe dort nicht
    // bemerken. Dieser Wächter liest den Text, also sieht er sie.
    const typeOnly = SCAN.filter(({ file }) => /import\s+type\s[^;]*from\s+'\./u.test(stripComments(readFileSync(file, 'utf8'))));
    expect(typeOnly.length, 'keine typschen relativen Importe gefunden').toBeGreaterThan(5);
    for (const { file, specifiers } of typeOnly) {
      for (const specifier of specifiers) {
        expect(resolves(file, specifier), `${relative(file)} → ${specifier}`).toBe(true);
      }
    }
  });

  it('Kommentare werden entfernt, Zeichenketten bleiben — der Unterschied ist beabsichtigt', () => {
    // Gegenprobe für den Stripper: die Importpfade müssen **erhalten** bleiben (sonst findet der Scan nichts),
    // Kommentare dagegen müssen verschwinden (sonst „besteht" etwas über seinen eigenen Kommentar).
    const withComment = "// import x from '../auskommentiert'\nimport { y } from '../echt';\n";
    const code = stripComments(withComment);
    expect(code).toContain("'../echt'");
    expect(code).not.toContain('../auskommentiert');
    // Und die bekannte Falle: ein Kommentar, der einen entfernten Bezeichner erklärt, darf nicht als Code zählen.
    expect(stripComments('// exportRecipientEncryptedVaultPackage ist entfernt')).not.toContain('exportRecipient');
  });

  it('die Grenze des Scanmusters ist benannt und im Bereich nicht verletzt', () => {
    /*
     * Das Muster `(?:from|import|require)\s*\(?\s*'…'` erkennt die drei üblichen Formen. Es erkennt **nicht**
     * einen Spezifizierer, der aus Variablen zusammengesetzt wird (`import(someVar)`). Diese Grenze wird hier
     * festgehalten, damit niemand diesen Wächter für vollständig hält — und im eigenen Bereich geprüft.
     *
     * **GAP-0043, Runde 345 — EIN FALSCH-POSITIV, DER ZWEI RUNDEN ÜBERLEBT HAT.** Dieser Test meldete
     * `src/apps/vault/streaming/VaultStreamingImportPanel.tsx` als dynamischen Import. GEMESSEN war das
     * Gegenteil: die Zeile lautet
     *     ? `The stored bytes do not match the import (${verdict.reason}, first difference at block ${…`
     * — ENGLISCHE PROSA in einem Template-Literal. Das Muster `import\s*\(\s*[A-Za-z_$]` trifft dort, weil
     * auf `import (` ein `$` folgt, und `$` steht in der Zeichenklasse `[A-Za-z_$]`. `stripComments` entfernt
     * Kommentare, aber **keine** Zeichenketten — und darf es auch nicht, wie der Kopf dieser Datei begründet
     * (eine frühere Fassung entfernte die Spezifizierer selbst und der Scan fand 0 Treffer).
     *
     * **DIE KORREKTUR TRENNT ZWEI ARTEN VON ZEICHENKETTEN, STATT ALLE ZU ENTFERNEN:**
     *   * Einfache und doppelte Zeichenketten BLEIBEN — in ihnen stehen die Importpfade des Scans oben.
     *   * Template-Literale (Backtick) VERSCHWINDEN. Ein Importpfad wird in diesem Bereich nie in einem
     *     Template notiert, ein Meldungstext dagegen immer.
     * Ein echter dynamischer Import ist `import(someVar)` **ohne** Zeichenkette — er bleibt in beiden Fällen
     * erhalten und wird weiterhin gefunden. Der Wächter wird also nicht weicher, sondern **genauer**: er
     * verliert einen Treffer, der nie einer war, und behält jeden, der einer sein könnte.
     */
    const dynamic = FILES.filter((file) =>
      /import\s*\(\s*[A-Za-z_$]/u.test(stripTemplateLiterals(stripComments(readFileSync(file, 'utf8')))),
    );
    expect(dynamic.map((file) => relative(file))).toEqual([]);
  });

  it('**Node-Module in `.ts`/`.tsx` nur mit Typdeklarationen** — geprüft wird die Fähigkeit, nicht die Endung', () => {
    /*
     * **Warum diese Zusicherung hinzugekommen ist:** Der Wächter oben prüft **Tiefen**, nicht
     * **Modulverfügbarkeit**. Deshalb ging `import { readFileSync } from 'node:fs'` in einem `.tsx`-Test
     * **fünfmal** durch, und `tsc` meldete jedes Mal `TS2307: Cannot find module 'node:fs'` bzw.
     * `TS2580: Cannot find name 'require'`.
     *
     * **KORREKTUR, Runde 407 — GEMESSEN, UND DIE ERSTE PRÄMISSE WAR FALSCH.** Die erste Fassung dieses
     * Wächters verlangte die **Dateiendung** `.mjs` und begründete das mit fehlenden Typdeklarationen. Am
     * heutigen Baum ist diese Begründung widerlegt:
     *
     *   * `ui/tsconfig.json` setzt `"types": ["node"]`,
     *   * `@types/node@22.20.5` ist installiert,
     *   * `tsc --noEmit -p tsconfig.json` endet mit **exit=0 und 0 Fehlern** — obwohl
     *     `src/apps/vault/testing/streaming/vaultStreamingAssets.test.ts` als `.ts` `node:fs` und
     *     `node:path` importiert.
     *
     * Eine Zusicherung über die **Endung** prüft damit nicht mehr die Modulverfügbarkeit, sondern verbietet
     * einen Fall, der nachweislich funktioniert. Sie hätte den nächsten Entwickler gezwungen, einen
     * typisierten Test auf untypisiertes `.mjs` **zurückzubauen** — also funktionierenden Code zu ändern,
     * damit ein veralteter Wächter grün wird. Das ist die Umkehrung des Zwecks.
     *
     * **Was jetzt geprüft wird — dieselbe Schutzabsicht, an der richtigen Stelle:** Node-Zugriff in
     * `.ts`/`.tsx` ist genau dann zulässig, wenn die Typebene ihn kennt: `types` enthält `node` **und**
     * `@types/node` liegt installiert vor. Fehlt eines von beiden, gilt die strenge Regel unverändert und
     * die Liste **muss** leer sein. Der Wächter wird also nicht weicher, sondern **genauer**: er fängt
     * weiterhin genau den `TS2307`-Fall, für den er gebaut wurde, und verbietet nicht mehr den Fall, der
     * typprüft. Eine Zusage ohne Deckung (`"types": ["node"]` ohne installiertes Paket) gilt nicht.
     *
     * Erkannt werden **beide** Formen: der `import`/`from`-Spezifizierer und der `require(...)`-Aufruf.
     * `.mjs`-Dateien sind ausgenommen: dort ist Node erlaubt und beabsichtigt.
     */
    const tsconfigPath = path.join(repoRoot, 'tsconfig.json');
    const compilerOptions = existsSync(tsconfigPath)
      ? JSON.parse(readFileSync(tsconfigPath, 'utf8')).compilerOptions
      : undefined;
    const typesDeclared = Array.isArray(compilerOptions?.types) && compilerOptions.types.includes('node');
    const typesInstalled = existsSync(path.join(repoRoot, 'node_modules', '@types', 'node', 'package.json'));
    const nodeTypesAvailable = typesDeclared && typesInstalled;

    const NODE_BUILTIN = /^(?:node:|fs$|path$|crypto$|child_process$|os$|url$|util$|stream$|zlib$|buffer$|events$|assert$|worker_threads$)/u;
    const offenders = [];
    for (const file of FILES) {
      if (path.extname(file) === '.mjs') continue; // Hier ist Node erlaubt und gewollt.
      const code = stripComments(readFileSync(file, 'utf8'));
      const specifiers = [...code.matchAll(/(?:from|import|require)\s*\(?\s*'([^']+)'/gu)].map((match) => match[1]);
      const nodeUse = specifiers.filter((specifier) => NODE_BUILTIN.test(specifier));
      // `require` selbst ist in `.ts`/`.tsx` ebenfalls nicht deklariert — auch ohne Node-Spezifizierer.
      const bareRequire = /\brequire\s*\(/u.test(code) ? ['require('] : [];
      if (nodeUse.length || bareRequire.length) {
        offenders.push(`${relative(file)} → ${[...nodeUse, ...bareRequire].join(', ')}`);
      }
    }
    if (nodeTypesAvailable) {
      /*
       * Der zulässige Fall. Damit diese Zusicherung nicht **leer** wird, muss sie etwas festhalten: es muss
       * `.ts`/`.tsx`-Dateien im Scan gegeben haben, die überhaupt prüfbar waren. Ohne das wäre der Zweig
       * eine Zusage über eine Dateimenge, die nur aus `.mjs` bestand.
       */
      expect(
        FILES.some((file) => path.extname(file) !== '.mjs'),
        'keine .ts/.tsx-Datei im Scan — dieser Zweig prüfte nichts',
      ).toBe(true);
    } else {
      // Die Liste wird ausgegeben, damit ein Fund durch Abarbeiten behebbar ist.
      expect(offenders).toEqual([]);
    }
    // **Nicht-Trivialität:** der Scan muss `.mjs`-Dateien mit Node-Zugriff gesehen haben, sonst prüft er nichts.
    /*
     * Eigener Fehler, dokumentiert: hier stand das Muster `'(?:node:|fs|path)'` — es verlangt, dass direkt
     * nach `node:` das schließende Anführungszeichen kommt, und `'node:fs'` hat danach noch `fs`. Der
     * Nicht-Trivialitätstest schlug deshalb an, obwohl der Scan funktionierte. Er hat damit **sich selbst**
     * gefangen, was genau seine Aufgabe ist: ein Wächter, der nichts prüft, muss auffallen.
     */
    const mjsWithNode = FILES.filter((file) => path.extname(file) === '.mjs'
      && /(?:from|import|require)\s*\(?\s*'(?:node:[^']+|fs|path)'/u.test(stripComments(readFileSync(file, 'utf8'))));
    expect(mjsWithNode.length, 'keine .mjs-Datei mit Node-Zugriff gefunden — der Scan prüft nichts').toBeGreaterThan(0);
  });
});
