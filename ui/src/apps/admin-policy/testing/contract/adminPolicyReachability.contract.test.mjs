// STATUS: PLATIN — Vertragstest: kein Admin-&-Policy-Modul ist tot, und die Nachweis-Matrix ist
// vollständig und echt.
//
// **Warum diese Datei eine `.mjs`-Datei ist:** sie liest Quelldateien vom Datenträger. Eine `.ts`-Datei
// hätte in diesem Projekt keine Node-Typen (`TS2307: Cannot find module 'node:fs'`).
//
// **Warum es diesen Test gibt (gemessen, nicht vermutet):** `adminInterchangeCore`,
// `adminEncryptedStore` und `adminPolicySignatureCore` waren vollständig geprüfte, vollständig tote
// Module — von keinem Bauteil importiert. Ebenso `enforceDlpBoundary`, `assertRetentionDeletionAllowed`
// und `assignRole`. Ein Modul ohne Aufrufer kann unmöglich etwas durchsetzen. Dieser Test macht daraus
// einen mechanischen Fehler statt einer Beobachtung.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';


// This file walks the source tree with readdirSync. Measured isolated: the three files together finish in
// 1.8 s. Under a full 832-file parallel run the same work exceeded the 5 s default and failed with
// "Test timed out in 5000ms" — the test was measuring machine load, not correctness. The scan is the
// assertion, so it gets a window that does not depend on contention.
vi.setConfig({ testTimeout: 60_000 });

const here = path.dirname(fileURLToPath(import.meta.url));
// contract → testing → admin-policy → apps → src → open-core/ui
const uiRoot = path.resolve(here, '../../../../..');
const srcRoot = path.join(uiRoot, 'src');
const adminRoot = path.join(srcRoot, 'apps/admin-policy');

function collect(directory, found = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      collect(full, found);
    } else {
      found.push(full);
    }
  }
  return found;
}

const isTestFile = (file) => /\.(test|spec)\.(ts|tsx|mjs)$/u.test(file) || file.includes(`${path.sep}testing${path.sep}`);

const CODE_EXTENSIONS = ['', '.ts', '.tsx', '.mjs', '.js'];

/**
 * Die Wurzeln, in denen ein legitimer Importeur dieses Bereichs liegen kann.
 *
 * **Gemessen:** der erste Fassung scannte ganz `src` (2017 Dateien). Das war nicht nur langsam, es war
 * auch flatterhaft — andere Bereiche werden während eines Laufs verändert, und ein gerade neu
 * geschriebener Importeur konnte fehlen. Diese Wurzeln enthalten jeden Produktionsweg in die App
 * (Shell-Einstieg, App-Bootstrap, Edition-Katalog, Plattform, geteilte Verträge) und den Bereich selbst.
 */
const IMPORTER_ROOTS = ['shell', 'app', 'edition', 'platform', 'shared', 'apps/admin-policy'].map((segment) => path.join(srcRoot, segment));

/** Alle relativen Importe **von Nicht-Test-Dateien**, aufgelöst gegen das Dateisystem. */
function importedModules() {
  const imported = new Set();
  let scanned = 0;
  for (const root of IMPORTER_ROOTS) {
    for (const file of collect(root)) {
      if (!/\.(ts|tsx|mjs)$/u.test(file) || isTestFile(file)) continue;
      scanned += 1;
      const source = readFileSync(file, 'utf8');
      const specifiers = [
        ...source.matchAll(/\bfrom\s+'(\.[^']+)'/gu),
        ...source.matchAll(/\bimport\s+'(\.[^']+)'/gu),
        ...source.matchAll(/\bimport\(\s*'(\.[^']+)'\s*\)/gu),
      ];
      for (const [, specifier] of specifiers) {
        const base = path.resolve(path.dirname(file), specifier);
        for (const extension of CODE_EXTENSIONS) {
          if (existsSync(base + extension) && statSync(base + extension).isFile()) {
            imported.add(base + extension);
            break;
          }
          const indexFile = path.join(base, `index${extension}`);
          if (extension !== '' && existsSync(indexFile)) {
            imported.add(indexFile);
            break;
          }
        }
      }
    }
  }
  return { imported, scanned };
}

const adminModules = collect(adminRoot)
  .filter((file) => /\.(ts|tsx)$/u.test(file))
  .filter((file) => !isTestFile(file))
  .filter((file) => statSync(file).isFile());

describe('admin-policy modules are reachable from non-test code', () => {
  it('has modules to check at all', () => {
    expect(adminModules.length).toBeGreaterThan(20);
  });

  it('imports every module of the app from at least one non-test file', () => {
    const { imported, scanned } = importedModules();
    // Der Scan muss nicht-trivial sein, sonst wäre „keine Waisen" eine leere Aussage.
    // Gemessen: 468 gescannte Produktionsdateien in den genannten Wurzeln.
    expect(scanned).toBeGreaterThan(300);
    expect(imported.size).toBeGreaterThan(150);
    const orphans = adminModules
      .filter((file) => !imported.has(file))
      .map((file) => path.relative(srcRoot, file));
    // Die Liste wird vollständig gedruckt: ein totes Modul wird entweder verdrahtet oder begründet
    // gelöscht — beides braucht seinen Namen.
    expect(orphans).toEqual([]);
  });
});

describe('enforcement matrix — complete, consistent and genuinely backed by source', () => {
  const coreSource = readFileSync(path.join(adminRoot, 'enforcement/adminEnforcementCore.ts'), 'utf8');

  const matrixBlock = coreSource.slice(coreSource.indexOf('ADMIN_ENFORCEMENT_MATRIX'), coreSource.indexOf('const MATRIX_BY_OPERATION'));
  const capabilityBlock = coreSource.slice(coreSource.indexOf('const REQUIRED_CAPABILITY'), coreSource.indexOf('const MAX_EVIDENCE'));
  const switchBlock = coreSource.slice(coreSource.indexOf('switch (operation)'), coreSource.indexOf('export class AdminOperationDenied'));

  const matrixOperations = [...matrixBlock.matchAll(/operation:\s*'([a-z.]+)'/gu)].map((match) => match[1]);
  const capabilityOperations = [...capabilityBlock.matchAll(/^\s*'([a-z.]+)':/gmu)].map((match) => match[1]);
  const switchOperations = [...switchBlock.matchAll(/^\s*case\s+'([a-z.]+)':/gmu)].map((match) => match[1]);

  it('covers every operation exactly once in the matrix', () => {
    expect(matrixOperations.length).toBeGreaterThanOrEqual(15);
    expect(new Set(matrixOperations).size).toBe(matrixOperations.length);
  });

  it('lists exactly the operations that have a required capability', () => {
    expect([...capabilityOperations].sort()).toEqual([...matrixOperations].sort());
  });

  it('routes every matrix operation through an explicit switch case', () => {
    for (const operation of matrixOperations) {
      expect(switchOperations).toContain(operation);
    }
  });

  it('names a hook that really exists in the named source file and a test file that exists', () => {
    for (const [, operation, policyId, hook, source, test] of matrixBlock.matchAll(
      /operation:\s*'([a-z.]+)',\s*policyId:\s*'([^']+)',\s*hook:\s*'([A-Za-z0-9_]+)',\s*source:\s*'([^']+)',\s*test:\s*'([^']+)'/gu,
    )) {
      expect(policyId.startsWith('POL-')).toBe(true);
      const sourceFile = path.join(adminRoot, source);
      expect(existsSync(sourceFile), `${operation}: ${source} fehlt`).toBe(true);
      const sourceText = readFileSync(sourceFile, 'utf8');
      const exported = new RegExp(`export\\s+(?:async\\s+)?(?:function|const|class)\\s+${hook}\\b`, 'u').test(sourceText);
      const declared = new RegExp(`(?:function|const)\\s+${hook}\\b`, 'u').test(sourceText);
      expect(exported || declared, `${operation}: ${hook} nicht in ${source}`).toBe(true);

      const testFile = path.join(here, '..', 'integration', test);
      const testExists = existsSync(testFile) || collect(adminRoot).some((file) => file.endsWith(`/${test}`));
      expect(testExists, `${operation}: Testfall ${test} fehlt`).toBe(true);
    }
  });
});
