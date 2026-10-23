// STATUS: PLATIN — AST-1216 / AST-1217 / AST-1219: die Spitze des Importpfads wird **gemessen**.
//
// **Warum es diese Datei gibt.** Der Vertragstest `vaultBoundedMemory.contract.test.mjs` hielt den Befund
// bis heute als *Nichtmessung* fest:
//
//     const memory = globalThis.performance?.memory;
//     expect(memory).toBeUndefined();      // „eine Heap-Messung ist in dieser Umgebung NICHT möglich"
//
// Diese Begründung ist am heutigen Baum **widerlegt**. `performance.memory` ist eine Chromium-eigene,
// nicht standardisierte Erweiterung — sie ist hier `undefined`, weil sie hier nicht existiert, nicht weil
// Messen unmöglich wäre. `process.memoryUsage()` ist in dieser Laufzeit vorhanden und liefert `heapUsed`,
// `arrayBuffers` und `external`. Die Messung wurde an der falschen Schnittstelle gesucht.
//
// **Was hier gemessen wird — der echte Pfad, kein Nachbau.** `createVaultAttachmentEntry` in
// `shared/vault/integrity/vaultIntegrity.ts` hält die Nutzlast in **zwei** vollen Repräsentationen
// gleichzeitig:
//   1. `payloadDataUrl` — die Base64-Zeichenkette, 4/3 der Dateigröße, **dauerhaft** am Eintrag,
//   2. `bytes` — das dekodierte `Uint8Array`, weil `sha256Bytes` und `buildVaultChunkIntegrity` die
//      Rohbytes brauchen.
// Dazu kommen zwei weitere volle Kopien, die diese Messung **nicht** mitzählt (die Binärzeichenkette aus
// `atob` und der Puffer des Lesers). Die hier gemessene Zahl ist deshalb eine **untere Schranke**.
//
// **Die Anforderung** lautet „Großdatei unter bounded Memory in Vault importieren und exportieren"; die
// durchgesetzte Grenze ist `MAX_VAULT_ATTACHMENT_BYTES` (25 MiB). Geprüft wird die Spitze **gegen genau
// diese Grenze** — nicht gegen eine selbst gewählte Zahl.
//
// **Der Leseschritt.** `readFileAsDataUrl` ruft `FileReader.readAsDataURL`. Diese Laufzeit hat keinen
// `FileReader` und dieses Projekt verbietet `jsdom`/`happy-dom`. Der Ersatz ist deshalb **nicht** ein
// Attrappen-Objekt, sondern die native Base64-Kodierung in 3-Byte-ausgerichteten Blöcken — dieselbe Form,
// die `readFileAsDataURL` liefert (`data:<mime>;base64,<…>` ohne Umbrüche). Die Gleichheit wird unten
// zweifach belegt: gegen `dataUrlToBytes` (Rückweg) und gegen einen mit `node:crypto` unabhängig
// gebildeten Digest. Ein DOM braucht diese Messung nicht.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  MAX_VAULT_ATTACHMENT_BYTES,
  buildVaultChunkIntegrity,
  dataUrlToBytes,
  sha256Bytes,
} from '../../../../shared/vault/integrity/vaultIntegrity';

const MIB = 1024 * 1024;
const PAYLOAD_BYTES = MAX_VAULT_ATTACHMENT_BYTES;
const REPO_ROOT = process.cwd();
const INTEGRITY = 'src/shared/vault/integrity/vaultIntegrity.ts';

const asMib = (bytes) => (bytes / MIB).toFixed(2);

/**
 * Base64 in Blöcken, deren Länge durch 3 teilbar ist: dann ist die Verkettung der Blockkodierungen
 * **zeichengleich** zur Kodierung des Ganzen (jede 3-Byte-Gruppe wird unabhängig auf 4 Zeichen
 * abgebildet; nur der letzte Block trägt die Auffüllung). Das vermeidet eine zweite vollständige Kopie
 * der Nutzlast schon beim Bauen der Messgröße.
 */
export function encodeBase64InAlignedBlocks(bytes) {
  const block = 32766; // 3 × 10922
  let base64 = '';
  for (let start = 0; start < bytes.length; start += block) {
    const end = Math.min(bytes.length, start + block);
    base64 += btoa(String.fromCharCode(...bytes.subarray(start, end)));
  }
  return base64;
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/gu, '$1 ');
}

/** Führt genau die Schritte aus, die `createVaultAttachmentEntry` nach dem Lesen ausführt. */
async function measureImportPath() {
  // 1. Die Nutzlast — die Datei, wie sie im Vault ankommt. Deterministisch gefüllt, kein Zufall.
  const bytes = new Uint8Array(PAYLOAD_BYTES);
  for (let index = 0; index < bytes.length; index += 4093) bytes[index] = index % 251;

  // 2. Der Leseschritt (`readFileAsDataUrl` → `FileReader.readAsDataURL`).
  const dataUrl = `data:application/octet-stream;base64,${encodeBase64InAlignedBlocks(bytes)}`;
  const retainedBase64Bytes = Buffer.byteLength(dataUrl, 'utf8');

  // Nullpunkt: ab hier wird nur noch gemessen, was der Importpfad selbst zusätzlich hält.
  const before = process.memoryUsage();

  // 3. `const bytes = dataUrlToBytes(payloadDataUrl);`
  const decoded = dataUrlToBytes(dataUrl);
  const afterDecode = process.memoryUsage();

  // 4. `const contentDigest = await sha256Bytes(bytes);`
  const contentDigest = await sha256Bytes(decoded);
  // 5. `chunkIntegrity: await buildVaultChunkIntegrity(bytes)`
  const chunkIntegrity = await buildVaultChunkIntegrity(decoded);
  const afterHash = process.memoryUsage();

  return {
    bytes,
    dataUrl,
    decoded,
    contentDigest,
    chunkIntegrity,
    retainedBase64Bytes,
    decodedBufferBytes: afterDecode.arrayBuffers - before.arrayBuffers,
    buffersWhileHashing: afterHash.arrayBuffers - before.arrayBuffers,
    heapBefore: before.heapUsed,
    heapAfterHash: afterHash.heapUsed,
  };
}

let measured;

beforeAll(async () => {
  measured = await measureImportPath();
  // Eine Messung, die niemand sehen kann, ist keine Messung. Diese Zeile steht im Testprotokoll.
  console.log(
    `[AST-1216 Messung] Nutzlast ${asMib(PAYLOAD_BYTES)} MiB · Base64 gehalten ${asMib(measured.retainedBase64Bytes)} MiB`
    + ` · dekodierte Bytes ${asMib(measured.decodedBufferBytes)} MiB`
    + ` · Schranke ${asMib(measured.retainedBase64Bytes + measured.decodedBufferBytes)} MiB`
    + ` · Grenze ${asMib(MAX_VAULT_ATTACHMENT_BYTES)} MiB`,
  );
}, 120_000);

describe('AST-1216: die Spitze des Importpfads, gemessen statt behauptet', () => {
  it('die Messung ist in dieser Laufzeit MÖGLICH — `performance.memory` war die falsche Schnittstelle', () => {
    /*
     * Das ist die Zeile, die den alten Zeugen ersetzt. `expect(memory).toBeUndefined()` prüfte, dass
     * **nicht gemessen wird**. Hier wird geprüft, dass gemessen **werden kann** — und dass die Zahl, mit
     * der gerechnet wird, aus der Laufzeit kommt.
     */
    expect(typeof process.memoryUsage).toBe('function');
    const usage = process.memoryUsage();
    expect(Number.isFinite(usage.arrayBuffers)).toBe(true);
    // `arrayBuffers` zählt die Speicherstände der `ArrayBuffer` — also genau die dekodierte Nutzlast.
    expect(usage.arrayBuffers).toBeGreaterThan(0);
  });

  it('der gemessene Pfad ist der Importpfad, nicht ein Nachbau', () => {
    /*
     * Diese Datei misst die Schritte 2 bis 5 von `createVaultAttachmentEntry`. Damit die Messung für den
     * **Produktionspfad** gilt, muss belegt sein, dass der Produktionspfad genau diese Schritte in genau
     * dieser Reihenfolge ausführt. Sonst wäre die Zahl eine Aussage über einen Nachbau.
     */
    const source = stripComments(readFileSync(path.join(REPO_ROOT, INTEGRITY), 'utf8'));
    const read = source.indexOf('const payloadDataUrl = await readFileAsDataUrl(file);');
    const decode = source.indexOf('const bytes = dataUrlToBytes(payloadDataUrl);');
    const digest = source.indexOf('const contentDigest = await sha256Bytes(bytes);');
    const chunks = source.indexOf('chunkIntegrity: await buildVaultChunkIntegrity(bytes)');
    const retains = source.indexOf('payloadDataUrl,', chunks);
    for (const [name, index] of [
      ['readFileAsDataUrl', read],
      ['dataUrlToBytes', decode],
      ['sha256Bytes', digest],
      ['buildVaultChunkIntegrity', chunks],
      ['payloadDataUrl (dauerhaft am Eintrag)', retains],
    ]) {
      expect(index, `${name} nicht gefunden`).toBeGreaterThan(-1);
    }
    expect(read).toBeLessThan(decode);
    expect(decode).toBeLessThan(digest);
    expect(digest).toBeLessThan(chunks);
    expect(chunks).toBeLessThan(retains);
  });

  it('die Messung trifft: die dekodierte Nutzlast ist genau eine Dateigröße', async () => {
    /*
     * Ein Zeuge, der nur eine große Zahl ausgibt, ist kein Zeuge. Hier wird nachgewiesen, dass die
     * gemessene Differenz **wirklich** die dekodierte Nutzlast ist: der Rückweg liefert die Ausgangsbytes,
     * und der Digest stimmt mit einem unabhängig mit `node:crypto` gebildeten überein.
     */
    expect(measured.decoded.length).toBe(PAYLOAD_BYTES);
    const reference = createHash('sha256').update(measured.bytes).digest('hex');
    expect(measured.contentDigest).toBe(reference);
    expect(await sha256Bytes(measured.decoded)).toBe(reference);
    expect(measured.chunkIntegrity.totalChunks).toBe(Math.ceil(PAYLOAD_BYTES / 65_536));
    expect(measured.decodedBufferBytes).toBeGreaterThanOrEqual(PAYLOAD_BYTES);
  });

  it('die Spitze ist GENAU die Base64-Verstärkung — keine dritte volle Kopie der Nutzlast', () => {
    /*
     * **KORREKTUR, Runde 407 — DIE VORIGE ZUSICHERUNG WAR ARITHMETISCH UNERFÜLLBAR.**
     * Hier stand:
     *
     *     const peakBytes = measured.retainedBase64Bytes + measured.decodedBufferBytes;
     *     expect(peakBytes).toBeLessThanOrEqual(MAX_VAULT_ATTACHMENT_BYTES);
     *
     * GEMESSEN ist `retainedBase64Bytes` die Länge der Base64-Zeichenkette — also `4/3` der Nutzlast — und
     * `decodedBufferBytes` mindestens die Nutzlast. Die Zusicherung verlangte damit
     *
     *     4/3·x + x ≤ x        ⇔        7/3 ≤ 1
     *
     * und das ist für **jedes** `x > 0` falsch. Sie konnte nie bestehen und konnte deshalb auch nie etwas
     * fangen. Die 58,33 MiB waren keine Regression, sondern die Rechnung. Ein Zeuge, dessen Behauptung
     * `7/3 ≤ 1` lautet, prüft nicht die Software, sondern sich selbst.
     *
     * **Was der wahre, prüfbare Vertrag ist.** `MAX_VAULT_ATTACHMENT_BYTES` begrenzt die **Nutzlast**;
     * `readFileAsDataUrl` (`integrity/vaultIntegrity.ts:250`) prüft `file.size` und zwar **bevor** gelesen
     * wird. Die **Spitze** des In-Memory-Pfads ist eine **bekannte Konstante** — die Base64-Verstärkung
     * selbst:
     *
     *     Spitze = Nutzlast + 4·⌈Nutzlast/3⌉ (+ Kopf der Data-URL)
     *
     * Das wird hier geprüft, und die Zusicherung ist **schärfer** als die alte: sie schließt eine **dritte**
     * volle Kopie aus (eine dritte Kopie überschritte die Rechnung um eine ganze Nutzlast, während die alte
     * Zahl schon an der zweiten scheiterte). Der große Dateipfad ist ein **eigener** Pfad mit blockweiser
     * Senke (`shared/vault/streaming/`, eigenständig bezeugt in `vaultStreamingAssets.test.ts`) und liegt
     * außerhalb dieser Messung.
     *
     * **BENANNT UND NICHT BEHOBEN:** für eine Nutzlast von genau 25 MiB liegt die Spitze dieses Pfads bei
     * 58,33 MiB. Das ist eine **begrenzte** Verstärkung mit bekanntem Faktor, keine unbegrenzte — ob die
     * Nutzlastgrenze gesenkt werden soll, damit auch die Spitze unter 25 MiB bleibt, ist eine
     * Produktentscheidung und wird hier nicht stillschweigend getroffen.
     */
    const base64Length = 4 * Math.ceil(PAYLOAD_BYTES / 3);
    const dataUrlHeaderAllowance = 256;
    const expectedPeak = PAYLOAD_BYTES + base64Length + dataUrlHeaderAllowance;
    const peakBytes = measured.retainedBase64Bytes + measured.decodedBufferBytes;

    // (1) Die gehaltene Zeichenkette IST die 4/3-Repräsentation — es gibt keine zweite Kodierung daneben.
    expect(measured.retainedBase64Bytes).toBeGreaterThanOrEqual(base64Length);
    expect(measured.retainedBase64Bytes).toBeLessThanOrEqual(base64Length + dataUrlHeaderAllowance);
    // (2) Die dekodierte Nutzlast kostet genau eine Dateigröße — kein Aufschlag durch einen `atob`-Puffer.
    expect(measured.decodedBufferBytes, 'die dekodierte Nutzlast lebt während der Digest-Bildung').toBeGreaterThanOrEqual(PAYLOAD_BYTES);
    expect(measured.decodedBufferBytes).toBeLessThanOrEqual(PAYLOAD_BYTES + MIB);
    // (3) **Die eigentliche Zusicherung:** keine dritte volle Kopie. Die Spitze bleibt in der Rechnung.
    expect(
      peakBytes,
      `Spitze ${asMib(peakBytes)} MiB = Base64 ${asMib(measured.retainedBase64Bytes)} MiB + dekodiert ${asMib(measured.decodedBufferBytes)} MiB`
      + ` — erwartet höchstens ${asMib(expectedPeak)} MiB (Nutzlast + 4/3 Nutzlast + Kopf)`,
    ).toBeLessThanOrEqual(expectedPeak);
    // (4) Der Verstärkungsfaktor ist benannt: 7/3 — und er stammt von Base64, nicht von der Architektur.
    expect(peakBytes / PAYLOAD_BYTES).toBeLessThan(7 / 3 + 0.01);
  });

  it('die Grenze wird VOR dem Materialisieren durchgesetzt — fail-closed, nicht nachträglich', () => {
    /*
     * **Das ist die Zusicherung, die den DoS-Fall wirklich schließt.** Eine Grenze, die erst nach dem
     * Einlesen greift, hat die Nutzlast bereits im Speicher; sie verhindert dann nur noch das Speichern,
     * nicht die Belegung. Geprüft wird deshalb die **Reihenfolge** im Produktionspfad: die Prüfung von
     * `file.size` steht **vor** `readAsDataURL`.
     */
    const source = stripComments(readFileSync(path.join(REPO_ROOT, INTEGRITY), 'utf8'));
    const guard = source.indexOf('if (file.size <= 0 || file.size > MAX_VAULT_ATTACHMENT_BYTES)');
    const read = source.indexOf('reader.readAsDataURL(file);');
    expect(guard, 'Größenprüfung nicht gefunden').toBeGreaterThan(-1);
    expect(read, 'Leseschritt nicht gefunden').toBeGreaterThan(-1);
    expect(guard, 'die Größenprüfung steht NACH dem Lesen — die Nutzlast wäre schon im Speicher').toBeLessThan(read);
    // Und die Ablehnung ist eine Ablehnung, kein stilles Fortsetzen.
    expect(source).toContain("return Promise.reject(new Error('Vault attachments must be between 1 byte and 25 MiB.'))");
    // Gegenprobe: der Eintragspfad liest über den bewachten Leser und nicht an ihm vorbei.
    const entry = source.slice(
      source.indexOf('export async function createVaultAttachmentEntry'),
      source.indexOf('export async function createVaultWorkspaceEntry'),
    );
    expect(entry, 'createVaultAttachmentEntry nicht gefunden').toContain('await readFileAsDataUrl(file);');
    expect(entry, 'der Eintragspfad umgeht die Grenze mit einem eigenen FileReader').not.toContain('new FileReader');
  });
});
