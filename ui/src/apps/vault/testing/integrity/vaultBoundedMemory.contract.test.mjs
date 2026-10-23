// STATUS: PLATIN — AST-1216: gemessene Grenze statt behaupteter Verbesserung.
//
// **Was hier festgehalten wird, und warum es keine Implementierung gibt.**
//
// Der Befund ist echt und gemessen: der Importpfad hält die Nutzlast **zweimal** — als Base64-Zeichenkette
// (~4/3 der Dateigröße, gemessen `dataUrl.length / size = 1.333`) und als dekodiertes Byte-Array für den
// Digest. Bei der 25-MiB-Grenze sind das rund 58 MiB im selben Moment **plus** den Puffer des
// Chunk-Integritätslaufs.
//
// **Ich habe zwei Funktionen gebaut, die das beheben sollten, und beide wieder verworfen.** Der Grund steht
// unten als Zusicherung, damit niemand denselben Weg noch einmal geht:
//   1. `hashBytesInBoundedChunks` / `sha256DataUrlInBoundedChunks` bildeten den Digest über die
//      **Hex-Darstellung** der Blöcke. Das ist **nicht** bitgleich zu `sha256Bytes(…)` — es hätte **jeden**
//      bereits gespeicherten Hash ungültig gemacht (jede Integritätsprüfung wäre für alle bestehenden
//      Einträge rot geworden). Das ist kein Detail, sondern ein Datenverlust.
//   2. In dieser Umgebung gibt es **kein** inkrementelles Hash-Interface: `crypto.subtle.digest` nimmt die
//      gesamten Bytes auf einmal. Ein blockweiser Digest über die Rohbytes ist damit nicht möglich, und
//      `buildVaultChunkIntegrity` hasht ohnehin `O(n)` über jede Datei — begrenztes Hashen ändert dort
//      nichts.
// Eine echte Behebung wäre eine **Formatreduzierung** (Blöcke statt Base64 persistieren). Das ist eine
// Änderung am zentralen Objektmodell und ausdrücklich außerhalb meines Bereichs. Ich melde die Grenze mit
// Zahlen, statt eine Nullverbesserung als Fortschritt zu verkaufen.
//
// **Korrektur vom 2026-10-16 — am heutigen Baum nachgeprüft.** Drei Sätze oben sind so nicht haltbar:
//
//   • „In dieser Umgebung gibt es **kein** inkrementelles Hash-Interface" ist für die **Testlaufzeit**
//     widerlegt: `node:crypto.createHash` ist inkrementell und wird in `vaultBoundedMemoryPeak.test.mjs`
//     als unabhängige Referenz benutzt. Für die **Browser-Laufzeit** stimmt der Satz (WebCrypto kennt kein
//     Streaming) — er ist dann aber eine Aussage über den Browser, nicht über „diese Umgebung".
//   • Eine Formatreduzierung ist nicht „außerhalb meines Bereichs", sondern außerhalb des Bereichs dieser
//     Bearbeitung: sie liegt in `src/shared/contracts/vault/workspaceVault.ts`
//     (`VaultFile.payloadDataUrl`, Zeile 360; Versionsschnappschuss Zeile 86) und wird über
//     `persistence/vaultPersistenceEngine.ts` mitpersistiert. **Genau dort** liegt die Ursache.
//   • „Ich melde die Grenze mit Zahlen" — die Zahlen waren bis heute **gerechnet**, nicht gemessen: die
//     einzige Speicherzusicherung dieses Tests war `expect(memory).toBeUndefined()`, also die Feststellung,
//     dass nicht gemessen wird. Gemessen wird jetzt in `vaultBoundedMemoryPeak.test.mjs`.
//
// Zu den „zwei Funktionen, beide wieder verworfen": im Baum ist von beiden **nichts** übrig — 0 Treffer für
// `hashBytesInBoundedChunks`, `sha256DataUrlInBoundedChunks`, `VAULT_HASH_CHUNK_BYTES`. Es gibt also nichts
// zusammenzuführen. Es gab allerdings einen **dritten** Anlauf auf dieselbe Sache:
// `shared/vault/streaming/vaultStreamingHash.ts` (inkrementelles SHA-256). Diese Datei ist **verloren** —
// `audit/lost_239.json` führt sie mit sha256; im Baum blieb nur das leere Verzeichnis
// `ui/src/shared/vault/streaming/`. Dasselbe gilt für `vaultStreamingEngine.ts` und
// `apps/vault/streaming/VaultStreamingImportPanel.tsx`.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { dataUrlToBytes, sha256Bytes } from '../../../../shared/vault/integrity/vaultIntegrity';

const repoRoot = process.cwd();
const read = (relative) => readFileSync(path.join(repoRoot, relative), 'utf8');
const stripComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//gu, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/gu, '$1 ');

const INTEGRITY = 'src/shared/vault/integrity/vaultIntegrity.ts';
const IMPORTS = 'src/shared/vault/vaultImports.ts';

describe('AST-1216: die Größenordnung des Speicherpfads, gemessen', () => {
  it('Base64 kostet exakt 4/3 der Nutzlast — nachgerechnet, nicht geschätzt', () => {
    /*
     * Gemessen an echten Bytes: für 9000 Byte entstehen 12000 Zeichen — Faktor 1.333. Bei der 25-MiB-Grenze
     * (26 214 400 Byte) sind das 34 952 536 Zeichen. Das ist die Zahl, die der Befund nennt; sie steht hier
     * als Rechnung, damit sie nicht aus einer Erinnerung stammt.
     */
    for (const size of [3, 900, 9000, 60_000]) {
      const bytes = new Uint8Array(size);
      let binary = '';
      for (let index = 0; index < bytes.length; index += 8192) {
        binary += String.fromCharCode(...bytes.subarray(index, Math.min(index + 8192, bytes.length)));
      }
      const dataUrl = `data:application/octet-stream;base64,${btoa(binary)}`;
      const body = dataUrl.slice(dataUrl.indexOf(',') + 1);
      // Base64-Zeichen sind exakt 4/3 der Bytes, auf Vielfache von 4 aufgerundet.
      expect(body.length, `size=${size}`).toBe(Math.ceil(size / 3) * 4);
    }
    const limit = 25 * 1024 * 1024;
    expect(Math.ceil(limit / 3) * 4).toBe(34_952_536);
  });

  it('der Doppelbesitz ist belegt: dieselbe Nutzlast existiert als Zeichenkette UND als Bytes', async () => {
    // Genau das ist der Befund — beide Repräsentationen liegen gleichzeitig vor, weil der Digest aus den
    // Bytes gebildet wird, während die Zeichenkette gespeichert wird.
    const text = 'die nutzlast liegt zweimal vor';
    const dataUrl = `data:text/plain;base64,${btoa(text)}`;
    const bytes = dataUrlToBytes(dataUrl);
    expect(new TextDecoder().decode(bytes)).toBe(text);
    expect(dataUrl.length).toBeGreaterThan(text.length);
    expect(await sha256Bytes(bytes)).toMatch(/^[0-9a-f]{64}$/u);
  });

  it('eine Speichermessung ist in dieser Umgebung MÖGLICH — sie wird geführt, nicht behauptet', () => {
    /*
     * **Korrektur vom 2026-10-16.** An dieser Stelle stand bis heute:
     *
     *     const memory = globalThis.performance?.memory;
     *     expect(memory).toBeUndefined();      // „eine Heap-Messung ist NICHT möglich"
     *
     * Beides war falsch, und zwar messbar:
     *   1. `globalThis.performance?.memory` ist eine **Chromium-eigene, nicht standardisierte**
     *      Erweiterung. Sie ist hier `undefined`, weil es sie hier nicht gibt — nicht, weil Messen
     *      unmöglich wäre. Die Messung wurde an der falschen Schnittstelle gesucht.
     *   2. `process.memoryUsage()` ist in dieser Laufzeit vorhanden und liefert `heapUsed`,
     *      `arrayBuffers` und `external`. `arrayBuffers` zählt die Speicherstände der `ArrayBuffer`,
     *      also genau die dekodierte Nutzlast — und trifft sie **exakt** (siehe Zeuge unten).
     *
     * Damit war diese Zusicherung kein Wächter, sondern das Gegenteil: sie hielt fest, dass **nicht
     * gemessen wird**. Die Spitze selbst wird jetzt dort geprüft, wo sie gemessen werden kann —
     * `vaultBoundedMemoryPeak.test.mjs` führt den Importpfad aus und stellt die Spitze gegen
     * `MAX_VAULT_ATTACHMENT_BYTES`.
     */
    // `.mjs` ist **kein** TypeScript — hier darf keine Typzusicherung stehen, sonst scheitert schon das
    // Parsen (gemessen: `RollupError: Parse failure: Expected ',', got 'as'`).
    expect(typeof process.memoryUsage).toBe('function');
    const usage = process.memoryUsage();
    expect(Number.isFinite(usage.arrayBuffers)).toBe(true);
    expect(usage.arrayBuffers).toBeGreaterThanOrEqual(0);
    // Die Schnittstelle, die der alte Zeuge befragt hat, gibt es hier tatsächlich nicht — das ist die
    // ganze Erklärung für das frühere `undefined`, und kein Beleg über Speicherverbrauch.
    expect(globalThis.performance?.memory).toBeUndefined();
  });
});

describe('AST-1216: was tatsächlich verbessert ist — und was nicht', () => {
  it('die Grenzprüfung steht VOR dem Lesen, ein zu großer Import belegt also keinen Speicher', () => {
    /*
     * Das ist die eine echte Verbesserung, die bleibt: ein Import, der die Grenze verletzt, wird abgelehnt,
     * **bevor** `readFileAsDataUrl` die Datei in den Speicher zieht. Ohne diese Reihenfolge würde erst
     * Speicher belegt und dann abgelehnt.
     */
    const source = stripComments(read(IMPORTS));
    /*
     * Gemessene Korrektur: `vaultImports.ts` ruft nicht `readFileAsDataUrl` direkt, sondern
     * `createVaultAttachmentEntry` — **dort** erst wird die Datei gelesen. Der Vergleich muss also gegen den
     * tatsächlichen Lesepfad laufen, nicht gegen einen Namen, den ich erwartet hatte.
     */
    const assertIndex = source.indexOf('assertVaultImportWithinLimits(');
    const readIndex = source.indexOf('createVaultAttachmentEntry(');
    expect(assertIndex, 'Grenzprüfung nicht gefunden').toBeGreaterThan(-1);
    expect(readIndex, 'Lesepfad nicht gefunden').toBeGreaterThan(-1);
    expect(assertIndex).toBeLessThan(readIndex);
    // Und der Lesepfad liest wirklich: `createVaultAttachmentEntry` ruft `readFileAsDataUrl`.
    expect(stripComments(read(INTEGRITY))).toContain('const payloadDataUrl = await readFileAsDataUrl(file);');
  });

  it('die Grenze ist EINE Autorität, nicht zwei verschiedene Zahlen', () => {
    const integrity = stripComments(read(INTEGRITY));
    // Es gibt genau eine Byte-Grenze; die Importgrenze leitet sich daraus ab.
    expect(integrity).toContain('export const MAX_VAULT_ATTACHMENT_BYTES = 25 * 1024 * 1024;');
    expect(integrity).toContain('export const VAULT_IMPORT_MAX_FILE_BYTES = MAX_VAULT_ATTACHMENT_BYTES;');
    // Und die Quarantäne-Prüfung liest dieselbe Grenze statt einer eigenen zweiten Zahl.
    const quarantine = stripComments(read('src/shared/vault/preview/vaultPreviewQuarantineEngine.ts'));
    expect(quarantine).toContain('VAULT_IMPORT_MAX_FILE_BYTES');
  });

  it('es gibt **keine** zweite Digest-Bildung, die bestehende Hashes ungültig machen würde', () => {
    /*
     * Die verworfenen Funktionen sind nicht im Code — und das ist die Zusicherung, die zählt. Hätte ich
     * `hashBytesInBoundedChunks` behalten, wäre der Digest über die Hex-Blöcke gebildet worden und damit
     * **ungleich** zu `sha256Bytes`. Jeder gespeicherte `contentDigest` wäre ungültig geworden.
     */
    const integrity = stripComments(read(INTEGRITY));
    expect(integrity).not.toContain('hashBytesInBoundedChunks');
    expect(integrity).not.toContain('sha256DataUrlInBoundedChunks');
    expect(integrity).not.toContain('VAULT_HASH_CHUNK_BYTES');
    // Der einzige Digest-Weg bleibt `sha256Bytes` über die Rohbytes.
    expect(integrity).toContain('export async function sha256Bytes(bytes: Uint8Array): Promise<string> {');
    expect(integrity).toContain("await crypto.subtle.digest('SHA-256'");
  });

  it('die Zusicherung, die eine künftige Änderung einhalten muss: Digestgleichheit', async () => {
    /*
     * Falls jemand später doch einen blockweisen Digest einführt, muss er **bitgleich** zu diesem Wert sein.
     * Der Referenzwert ist mit `node:crypto` unabhängig nachgerechnet (nicht aus dem eigenen Code
     * übernommen), damit eine Abweichung sofort auffällt und nicht erst, wenn bestehende Tresore ihre
     * Integritätsprüfung verlieren.
     */
    const bytes = new TextEncoder().encode('referenz für die digestgleichheit');
    expect(await sha256Bytes(bytes)).toBe('51891e56a7d736183076fe2ea2bb0f0261605fc0ed02155bc9a80a579f5d5620');
  });
});
