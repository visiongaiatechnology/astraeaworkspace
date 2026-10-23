// STATUS: DIAMANT VGT SUPREME
// Paket 34 — Quellvertrag: die geschützte Handlung scheitert **benannt**, nicht still.
//
// Warum das ein Quellvertrag ist und kein Verhaltenstest: die beiden Wächter (`persistVaultData`,
// `assertVaultWritable`) sind **lokale Konstanten** in `VaultFreeRuntime` und werden nicht exportiert. Sie
// lassen sich ohne DOM und ohne Tauri-Laufzeit nicht aufrufen. Die Zusage, die hier geprüft wird, ist die
// **Gestalt des Wächters**: sein erster Satz ist die benannte Ablehnung. Genau daran hing der Befund — eine
// Sperre, die nur Panels ausblendet, meldet nichts.
//
// Absichtlich `.mjs`: TypeScript-Testdateien haben in diesem Projekt keine Node-Typdeklarationen
// (`node:fs` → TS2307). Der Wurzelpfad kommt aus `import.meta.url`, nicht aus `process.cwd()` — damit ist
// dieser Vertrag unabhängig davon, aus welchem Verzeichnis vitest gestartet wird.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const projectRoot = fileURLToPath(new URL('../../../..', import.meta.url));
const read = (relative) => readFileSync(path.join(projectRoot, relative), 'utf8').replace(/\r\n/gu, '\n');
/** Kommentare entfernen, damit ein entferntes Verhalten nicht über einen Kommentar „besteht". */
const stripComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//gu, '')
  .replace(/(^|[^:])\/\/[^\n]*/gu, '$1');
const normalise = (text) => text.replace(/\s+/gu, ' ').trim();

/** Schneidet den Körper einer Arrow-Funktion über **Klammerbilanz** aus, nicht über ein Zeichenfenster. */
function arrowBody(source, anchor) {
  const start = source.indexOf(anchor);
  expect(start, `Anker nicht gefunden: ${anchor}`).toBeGreaterThan(-1);
  const open = source.indexOf('{', source.indexOf('=>', start));
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open, index + 1);
    }
  }
  throw new Error(`Körper nicht abgeschlossen: ${anchor}`);
}

const RUNTIME = 'src/edition/open-core/apps/vault/VaultFreeRuntime.tsx';
const FILES_TAB = 'src/shared/vault/files/VaultFilesTab.tsx';

describe('Paket 34 — Quellvertrag: `vault_runtime_locked` ist der erste Satz beider Wächter', () => {
  const runtime = stripComments(read(RUNTIME));

  it('der Schreibpfad lehnt bei gesperrter Sitzung benannt ab, bevor er irgendetwas tut', () => {
    const body = arrowBody(runtime, 'const persistVaultData = (updated');
    expect(normalise(body)).toMatch(/^\{ if \(runtimeLocked\) throw new Error\('vault_runtime_locked'\); /u);
  });

  it('der Schreibwächter lehnt bei gesperrter Sitzung benannt ab, bevor er irgendetwas tut', () => {
    const body = arrowBody(runtime, 'const assertVaultWritable = ()');
    expect(normalise(body)).toMatch(/^\{ if \(runtimeLocked\) throw new Error\('vault_runtime_locked'\); /u);
  });

  it('es gibt genau zwei solcher Ablehnungen — nicht null, nicht mehr', () => {
    const sites = [...runtime.matchAll(/throw new Error\('vault_runtime_locked'\)/gu)];
    expect(sites).toHaveLength(2);
  });

  it('der Wächter wird auch **aufgerufen** — definiert allein wäre er keine Sperre', () => {
    // Definition + Aufrufe: erwartet werden mindestens drei Aufrufstellen (Open-With, Update, Create).
    const calls = [...runtime.matchAll(/(?:^|[^.\w])assertVaultWritable\(\)/gmu)];
    expect(calls.length).toBeGreaterThanOrEqual(3);
  });
});

describe('Paket 34 — Quellvertrag: die Sperre erreicht die Stelle, die Nutzlast hält', () => {
  const tab = stripComments(read(FILES_TAB));

  it('`VaultFileEntry` bekommt die Sperre — dort wird `payloadDataUrl` in ein `<img>` gerendert', () => {
    expect(tab).toMatch(/<VaultFileEntry[^>]*locked=\{locked\}/u);
  });

  it('der Aufräum-Effekt prüft **nach** dem Zurücksetzen, nicht davor', () => {
    const effect = tab.slice(tab.indexOf('useEffect(() => {'), tab.indexOf('}, [locked]);'));
    const lastReset = effect.lastIndexOf('setAddError(null);');
    const assertion = effect.indexOf('assertVaultSessionRevoked(');
    expect(lastReset).toBeGreaterThan(-1);
    expect(assertion).toBeGreaterThan(lastReset);
  });

  it('der gesperrte Zweig verlässt die Liste, statt sie auszugrauen', () => {
    expect(tab).toMatch(/if \(locked\) return <div[^>]*data-vault-locked="true"/u);
  });
});
