// STATUS: PLATIN — Quellvertrag mit Ausführung: **jedes** Feld der Vault-Nutzdaten ist im Laufzeitpfad
// verdrahtet — beim Schreiben und beim Lesen.
//
// **Warum diese Datei neben dem Roundtrip-Zeugen nötig ist.** Der Roundtrip-Zeuge
// (`persistence/vaultSaveReopenRoundtrip.test.ts`) übergibt seine Nutzdaten an
// `persistVaultSnapshotInWorkspaceDocument` — also **hinter** der Projektion. Genau dort, in
// `VaultFreeRuntime.persistVaultData`, baut der Laufzeitpfad aus `vaultData` + `updated` das `next`-Objekt,
// das geschrieben wird (und in der `vaultData`-Memo liest er es wieder). Ein Feld, das diese Projektion
// **vergisst**, ist ein stiller Datenverlust, den kein Roundtrip sehen kann, der selbst schon mit
// vollständigen Nutzdaten beginnt.
//
// **Warum das ein Quellvertrag sein muss und kein Laufzeittest.** Die Projektion ist eine Closure in einer
// React-Komponente **eine Ebene über** dem Eigentumsbereich dieser Aufgabe
// (`edition/open-core/apps/vault/`); ohne DOM (`kein jsdom`, kein `happy-dom`) lässt sie sich nicht
// aufrufen. Der vorhandene Sperrvertrag sagt dasselbe (`vaultLockPersistence.test.ts:9-10`). Ein
// Quellvertrag, der nur **nachsieht**, wäre aber genau die Fehlerart, die dieses Projekt als Nullmessung
// kennt: deshalb wird hier **ausgeführt** — die Feldliste wird aus dem Vertrag **gelesen** und mit der
// Projektion **gezählt und verglichen**. Ein neues Feld im Vertrag ohne Feld in der Projektion wird rot.
//
// Absichtlich als `.mjs`: TypeScript-Testdateien haben in diesem Projekt keine Node-Typdeklarationen.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();
/** Zeilenenden werden auf `\n` normalisiert — ein CRLF-Anker traf sonst nie. */
const read = (relative) => readFileSync(path.join(repoRoot, relative), 'utf8').replace(/\r\n/gu, '\n');
/** Kommentare entfernen, damit ein entferntes Verhalten nicht über einen Kommentar „besteht". */
const stripComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//gu, '')
  .replace(/(^|[^:])\/\/[^\n]*/gu, '$1');

const CONTRACT = 'src/shared/contracts/vaultSpaces.ts';
const RUNTIME = 'src/edition/open-core/apps/vault/VaultFreeRuntime.tsx';
const PERSISTENCE = 'src/shared/vault/persistence/vaultPersistenceEngine.ts';

/** Schneidet einen Klammerblock ab der öffnenden Klammer aus — über **Bilanz**, nicht über ein Fenster. */
function braceBlock(source, startIndex) {
  const open = source.indexOf('{', startIndex);
  if (open < 0) throw new Error('kein Block gefunden');
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open, index + 1);
    }
  }
  throw new Error('Block nicht abgeschlossen');
}

/** Die Feldnamen von `StoredVaultData`, gelesen aus dem Vertrag. */
function storedVaultDataFields() {
  const source = stripComments(read(CONTRACT));
  const start = source.indexOf('export interface StoredVaultData {');
  if (start < 0) throw new Error('StoredVaultData nicht gefunden');
  const block = braceBlock(source, start);
  return block
    .split('\n')
    .slice(1)
    .map((line) => (line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\??\s*:/u) ?? [])[1])
    .filter(Boolean);
}

/**
 * Die Schlüssel eines Objektliterals — **nur auf der ersten Ebene**. Eine tiefere Ebene wäre ein
 * verschachteltes Literal und kein Feld der Nutzdaten.
 */
function literalKeys(block) {
  const keys = [];
  let depth = 0;
  for (const line of block.split('\n')) {
    const key = depth === 1 ? (line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/u) ?? [])[1] : undefined;
    if (key) keys.push(key);
    for (const character of line) {
      if (character === '{') depth += 1;
      else if (character === '}') depth -= 1;
    }
  }
  return keys;
}

/** Die Schreibprojektion: `const next: StoredVaultData = { … }` in `VaultFreeRuntime`. */
function writeProjection() {
  const source = stripComments(read(RUNTIME));
  const start = source.indexOf('const next: StoredVaultData = {');
  if (start < 0) throw new Error('Schreibprojektion (`const next: StoredVaultData`) nicht gefunden');
  return literalKeys(braceBlock(source, start));
}

/**
 * Der Lesepfad: die Rückgabeobjekte der `vaultData`-Memo. Beide Zweige werden über
 * **Klammerbilanz** ausgeschnitten — nicht über ein Zeichenfenster und nicht über Einrückung.
 * Ein Fenster liefe in den Nachbarzweig hinein und meldete fremde Felder.
 */
function readProjectionLiterals() {
  const source = stripComments(read(RUNTIME));
  const start = source.indexOf('const vaultData: StoredVaultData = useMemo(');
  if (start < 0) throw new Error('Leseprojektion (`vaultData`-Memo) nicht gefunden');
  const end = source.indexOf('}, [', start);
  if (end < 0) throw new Error('Abhängigkeitsliste der `vaultData`-Memo nicht gefunden');
  const region = source.slice(start, end);
  expect(region.length).toBeGreaterThan(500);
  const blocks = [];
  let cursor = region.indexOf('return {');
  while (cursor >= 0) {
    blocks.push(literalKeys(braceBlock(region, cursor + 'return '.length)));
    cursor = region.indexOf('return {', cursor + 1);
  }
  return blocks;
}

const FIELDS = storedVaultDataFields();

/** Die eine Vergleichsregel, die der echte Vertrag **und** seine Selbstprüfung unten benutzen. */
function missingFields(expected, keys) {
  return expected.filter((field) => !keys.includes(field));
}

describe('Der Vertrag selbst ist gelesen, nicht behauptet', () => {
  it('die Feldliste ist nicht-trivial und frei von Dopplungen', () => {
    // Ein Vertrag, der nichts liest, wäre still grün — die Nullmessung, die dieses Projekt benannt hat.
    expect(FIELDS.length).toBeGreaterThan(15);
    expect(new Set(FIELDS).size).toBe(FIELDS.length);
    for (const expected of ['files', 'folders', 'trash', 'keyPolicy', 'backupPolicy', 'backupCatalog', 'shareGrants', 'storageHealth']) {
      expect(FIELDS, expected).toContain(expected);
    }
  });
});

describe('Die Schreibprojektion trägt jedes Feld der Nutzdaten', () => {
  it('`persistVaultData` lässt kein Feld fallen und hat keinen doppelten Schlüssel', () => {
    const keys = writeProjection();
    expect(keys.length).toBeGreaterThan(15);
    const missing = missingFields(FIELDS, keys);
    expect(missing, `Feld fehlt in der Schreibprojektion: ${missing.join(', ')}`).toEqual([]);
    const duplicated = keys.filter((key, index) => keys.indexOf(key) !== index);
    expect(duplicated, `doppelter Schlüssel in der Schreibprojektion: ${duplicated.join(', ')}`).toEqual([]);
    // Und die Richtung stimmt: die Projektion erfindet kein Feld, das der Vertrag nicht kennt.
    const invented = keys.filter((key) => !FIELDS.includes(key));
    expect(invented, `Feld ohne Vertrag in der Schreibprojektion: ${invented.join(', ')}`).toEqual([]);
  });

  it('die Projektion wird an die kanonische Persistenzfunktion übergeben — nicht an einen zweiten Speicher', () => {
    const runtime = stripComments(read(RUNTIME));
    expect(runtime).toMatch(/onUpdateDocument\(persistVaultSnapshotInWorkspaceDocument\(document, next\)\)/u);
    const persistence = stripComments(read(PERSISTENCE));
    expect(persistence).toMatch(/export function persistVaultSnapshotInWorkspaceDocument/u);
    // Genau eine Quelle der Wahrheit: `document.vaultData`. Der alte Zweitspeicher wird entfernt, nicht gefüllt.
    expect(persistence).toMatch(/delete objects\.vault_gaiacom_payload/u);
    expect(persistence).not.toMatch(/vault_gaiacom_payload\s*=/u);
  });
});

describe('Der Lesepfad trägt jedes Feld der Nutzdaten in beiden Zweigen', () => {
  it('beide Rückgabeobjekte der `vaultData`-Memo nennen jedes Feld', () => {
    const literals = readProjectionLiterals();
    // Genau zwei Zweige: „gespeicherte Nutzdaten vorhanden" und „frischer Tresor". Gäbe es nur einen,
    // wäre die Zusicherung unten still schwächer als sie behauptet.
    expect(literals).toHaveLength(2);
    for (const [index, keys] of literals.entries()) {
      expect(keys.length, `Zweig ${index + 1} ist leer`).toBeGreaterThan(15);
      const missing = missingFields(FIELDS, keys);
      // Ein frisch geöffneter Tresor verliert sonst genau dieses Feld beim ersten Betrachten.
      expect(missing, `Feld fehlt in Zweig ${index + 1} der Leseprojektion: ${missing.join(', ')}`).toEqual([]);
    }
  });
});

/**
 * **Der Wächter kann rot werden — gemessen, nicht behauptet.** Ein Vertrag, dessen Vergleichsregel
 * nichts unterscheidet, ist still grün: genau die Nullmessung, die dieses Projekt benannt hat. Hier
 * laufen die **echten** Ausschneide- und Vergleichsfunktionen gegen Quellen, denen ein Feld fehlt.
 */
describe('Der Wächter unterscheidet — sonst wäre sein Grün eine Nullmessung', () => {
  it('eine Projektion ohne ein Feld wird als fehlend gemeldet', () => {
    const complete = literalKeys(braceBlock('const next: StoredVaultData = {\n  files: [],\n  folders: [],\n  keyPolicy: undefined,\n};', 0));
    expect(complete).toEqual(['files', 'folders', 'keyPolicy']);
    expect(missingFields(['files', 'folders', 'keyPolicy'], complete)).toEqual([]);
    const hollowed = literalKeys(braceBlock('const next: StoredVaultData = {\n  files: [],\n  folders: [],\n};', 0));
    expect(missingFields(['files', 'folders', 'keyPolicy'], hollowed)).toEqual(['keyPolicy']);
  });

  it('verschachtelte Schlüssel zählen nicht als Feld der Nutzdaten', () => {
    const nested = literalKeys(braceBlock('const next: StoredVaultData = {\n  files: [\n    { id: "x", keyPolicy: null },\n  ],\n};', 0));
    expect(nested).toEqual(['files']);
    // Und das ist die Richtung, die zählt: der verschachtelte Schlüssel darf `keyPolicy` **nicht** decken.
    expect(missingFields(['files', 'keyPolicy'], nested)).toEqual(['keyPolicy']);
  });

  it('ein doppelter Schlüssel wird erkannt', () => {
    const doubled = literalKeys(braceBlock('const next: StoredVaultData = {\n  files: [],\n  files: [],\n};', 0));
    expect(doubled.filter((key, index) => doubled.indexOf(key) !== index)).toEqual(['files']);
  });

  it('die Feldliste des Vertrags wird wirklich gelesen — nicht aus einer Konstante im Test', () => {
    // Wäre `storedVaultDataFields` ein Nachbau, würde die Zusicherung bei einer Vertragsänderung
    // stillschweigend weiterlaufen. Gelesen wird die Datei; hier wird belegt, dass sie gelesen **wird**.
    expect(read(CONTRACT)).toContain('export interface StoredVaultData {');
    expect(FIELDS).not.toContain('vaultData');
    expect(FIELDS.length).toBe(23);
  });
});

describe('Der Roundtrip-Zeuge läuft auch ohne Canvas-, Fenster- oder Ereignisumgebung', () => {
  it('der Zeuge liest die Verschlüsselung des Speicherpfads, keinen Doppelgänger', () => {
    const witness = read('src/apps/vault/testing/persistence/vaultSaveReopenRoundtrip.test.ts');
    // Der Zeuge muss die echten Produktionsfunktionen benutzen — sonst prüft er einen Nachbau.
    expect(witness).toMatch(/from '\.\.\/\.\.\/\.\.\/\.\.\/platform\/containers\/container'/u);
    expect(witness).toMatch(/packLocalEncryptedContainer/u);
    expect(witness).toMatch(/unpackLocalEncryptedContainer/u);
    expect(witness).toMatch(/persistVaultSnapshotInWorkspaceDocument/u);
    // Und er darf keine Umgebung vortäuschen.
    expect(witness).not.toMatch(/jsdom|happy-dom|@testing-library/u);
    expect(witness).not.toMatch(/\bas any\b|\bas unknown as\b|@ts-ignore|@ts-nocheck/u);
  });
});
