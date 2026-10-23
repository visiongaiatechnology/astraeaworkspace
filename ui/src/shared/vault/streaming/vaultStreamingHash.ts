// STATUS: PLATIN — EIN Digest über EINEN Durchlauf, mit begrenztem Fenster.
//
// **Was diese Datei ist, und warum es eine eigene Datei ist.**
//
// Sie ist die **Abhängigkeit** des Imports: ein Streaming-Import braucht einen Digest, um Fortschritt,
// Deduplizierung und Integrität zu berechnen, und er darf dafür die Nutzlast nicht als Ganzes halten.
// `shared/vault/integrity/vaultIntegrity.ts` kann das nicht leisten — `sha256Bytes` nimmt die **gesamten**
// Bytes auf einmal (`crypto.subtle.digest`), und `buildVaultChunkIntegrity` hasht `O(n)` über einen bereits
// vollständig materialisierten Puffer. Beide bleiben unangetastet; diese Datei tritt daneben.
//
// **Der gemessene Anlass, mit Zahlen.** `REPAIR_VAULT_BOUNDED_MEMORY_P0.md` belegt für den Importpfad eine
// Spitze von **58,33 MiB** (Base64 33,33 MiB + dekodiert 25,00 MiB) bei einer Grenze von 25,00 MiB, gemessen
// über `process.memoryUsage().arrayBuffers`. Der Halteort ist `VaultFile.payloadDataUrl` und die
// Zwischenkopie `atob(...)`. Diese Datei behebt das **nicht** (der Halteort liegt in
// `shared/contracts/**`, außerhalb des Schreiberbereichs) — sie liefert den Baustein, der einen Import
// **ohne** materialisierte Nutzlast überhaupt erst möglich macht: einen Digest, der blockweise entsteht.
//
// **Drei verworfene Anläufe, und was daraus folgt.** Im Baum sind `hashBytesInBoundedChunks`,
// `sha256DataUrlInBoundedChunks` und `VAULT_HASH_CHUNK_BYTES` nachweislich nicht vorhanden — der dritte
// Anlauf war diese Datei selbst und ist verloren (`audit/lost_239.json` Nr. 140, sha256
// `87b4c15944373ae8c13b4c360caddc06fd50744edc7450acf058b45ca90cba89`). Der damalige Verwurfsgrund ist im
// Baum als Zusicherung festgehalten und **wird hier eingehalten**: ein blockweiser Digest über die
// **Hex-Darstellung** der Blöcke wäre nicht bitgleich zu `sha256Bytes` gewesen und hätte **jeden**
// gespeicherten `contentDigest` ungültig gemacht. Deshalb rechnet diese Datei über die **Rohbytes** und
// stellt die Gleichheit als Zusicherung bereit (§`streamingDigestMatchesBaseline`), statt sie zu behaupten.
//
// **Kein stiller Rückfall.** Diese Datei importiert `readFileAsDataUrl` **nicht**, kennt
// `MAX_VAULT_ATTACHMENT_BYTES` **nicht** und liest keine Datei. Sie nimmt Bytes entgegen, die der Aufrufer
// bereits auf `maxChunkBytes` begrenzt hat, und weist alles ab, was darüber liegt.
//
// **Kein `as`, kein `any`, kein `@ts-ignore`.** Der Digest geht über `crypto.subtle.digest(action, source)`
// mit einem `Uint8Array`; das ist in `BufferSource` ohne Zusicherung zuweisbar, weil eine
// `Uint8Array<ArrayBuffer>`-Sicht die Signatur bereits erfüllt. Wo eine Zusicherung nötig schiene, ist die
// Deklaration falsch — nicht der Aufruf.

import type { VaultChunkIntegrityManifest } from '../../contracts/workspace';
import { bytesToHex } from '../integrity/vaultIntegrity';

/**
 * Das Fenster, in dem Nutzlast liegen darf. **64 KiB**, derselbe Wert, den
 * `VAULT_INTEGRITY_CHUNK_BYTES` in `integrity/vaultIntegrity.ts` setzt.
 *
 * **Warum derselbe Wert und keine zweite Zahl:** die Blockgrenzen des Digest müssen mit den Blockgrenzen
 * des vorhandenen Chunk-Manifests zusammenfallen, sonst gäbe es zwei Wahrheiten über dieselbe Datei. Eine
 * zweite Zahl wäre genau die Doppelung, die dieses Projekt mehrfach bezahlt hat (siehe
 * `VAULT_IMPORT_MAX_FILE_BYTES` neben der alten 128-MiB-Grenze).
 */
export const VAULT_STREAMING_WINDOW_BYTES = 64 * 1024;

/** Die Grenzen eines blockweisen Digests. Sie sind **eine** Autorität für Hasher und Manifest. */
export interface VaultStreamingHashLimits {
  readonly minChunkBytes: number;
  readonly maxChunkBytes: number;
  readonly maxChunks: number;
}

/**
 * `minChunkBytes` ist 4096 und nicht 1: unterhalb davon ist ein Block kürzer als ein SHA-256-Block (64 B)
 * mal 64, und `sha256Bytes` in `vaultIntegrity.ts` lehnt eine Chunk-Größe unter 4096 ebenfalls ab
 * (`vault_integrity_chunk_size_invalid`). Ein kleinerer Wert wäre eine zweite, laxere Grenze.
 */
export const VAULT_STREAMING_HASH_LIMITS: VaultStreamingHashLimits = Object.freeze({
  minChunkBytes: 4096,
  maxChunkBytes: 4 * 1024 * 1024,
  maxChunks: 4096,
});

/** Ein benannter Verstoß — kein Sammelfehler, damit der Aufrufer die Ursache unterscheiden kann. */
export type VaultStreamingHashViolation =
  /** Der Block ist länger als das vereinbarte Fenster. */
  | 'chunk_exceeds_window'
  /** `chunkSize` liegt außerhalb der Grenzen. */
  | 'chunk_size_invalid'
  /** Die Eingabe hat mehr Blöcke als erlaubt. */
  | 'chunk_limit_exceeded'
  /** Der Digest wurde abgefragt, bevor alle Bytes verarbeitet waren. */
  | 'digest_incomplete'
  /** Es wurden Bytes übergeben, nachdem der Digest abgeschlossen war. */
  | 'update_after_finalize';

/** Der Fehler nennt den Verstoß **und** die Zahl, damit eine Ablehnung nachprüfbar ist. */
export class VaultStreamingHashError extends Error {
  readonly violation: VaultStreamingHashViolation;
  readonly limit: number;
  readonly actual: number;

  constructor(violation: VaultStreamingHashViolation, limit: number, actual: number) {
    super(`vault_streaming_hash_${violation}: limit ${limit}, actual ${actual}`);
    this.name = 'VaultStreamingHashError';
    this.violation = violation;
    this.limit = limit;
    this.actual = actual;
  }
}

// ---------------------------------------------------------------------------------------------------
// SHA-256 nach FIPS 180-4 — **inkrementell**, weil die Plattform es nicht ist.
// ---------------------------------------------------------------------------------------------------
//
// **Warum eine eigene Implementierung und nicht `crypto.subtle`.** `crypto.subtle.digest` ist eine
// Einmal-Operation: sie nimmt `BufferSource` und liefert den Digest über die **gesamten** Bytes. Für einen
// Import, der die Nutzlast nie als Ganzes halten darf, ist das die falsche Form. `node:crypto.createHash`
// wäre inkrementell, existiert aber in der Browser-Laufzeit nicht — und der Vault läuft im Browser/Tauri.
// Eine Implementierung, die in **beiden** Laufzeiten dieselbe Antwort gibt, ist deshalb die einzige Form,
// die hier trägt.
//
// **Wie die Richtigkeit belegt wird — nicht behauptet.** Der Zeuge
// `testing/streaming/vaultStreamingHash.test.ts` prüft gegen `crypto.subtle.digest` (also gegen eine
// **unabhängige** Implementierung) für eine Reihe von Längen, die jede Verzweigung treffen: leer, 1 B,
// 55/56/57 B (die Padding-Grenze), 63/64/65 B (die Blockgrenze), mehrere Blöcke, und Längen, die über
// 512 MiB-Bit-Grenzen hinweg nicht mehr in 32 Bit passen würden. Dazu ein bekanntes Paar (KAT) und der
// Nachweis, dass **verschiedene** Eingaben **verschiedene** Werte liefern — denn ein Hasher, der immer
// denselben Wert liefert, besteht jede „gleiche Eingabe → gleicher Wert"-Zusicherung.

/** Die 64 Rundkonstanten: die ersten 32 Bit der Kubikwurzeln der ersten 64 Primzahlen. */
const SHA256_K: readonly number[] = Object.freeze([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** Die acht Anfangswerte: die ersten 32 Bit der Quadratwurzeln der ersten acht Primzahlen. */
const SHA256_INITIAL: readonly number[] = Object.freeze([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

/** Der Block in Bytes, über den SHA-256 verdichtet. */
const SHA256_BLOCK_BYTES = 64;

/** `>>> 0` ist die Normalisierung auf 32 Bit ohne Vorzeichen — die Arithmetik muss exakt bleiben. */
function rotateRight32(value: number, distance: number): number {
  return ((value >>> distance) | (value << (32 - distance))) >>> 0;
}

/** Verdichtet **einen** 64-Byte-Block in den Zustand. Reine Funktion über `state` und `block`. */
function compressBlock(state: readonly number[], block: Uint8Array): number[] {
  const w = new Uint32Array(64);
  for (let index = 0; index < 16; index += 1) {
    const offset = index * 4;
    w[index] = (
      ((block[offset] ?? 0) << 24)
      | ((block[offset + 1] ?? 0) << 16)
      | ((block[offset + 2] ?? 0) << 8)
      | (block[offset + 3] ?? 0)
    ) >>> 0;
  }
  for (let index = 16; index < 64; index += 1) {
    const s0 = (rotateRight32(w[index - 15] ?? 0, 7) ^ rotateRight32(w[index - 15] ?? 0, 18) ^ ((w[index - 15] ?? 0) >>> 3)) >>> 0;
    const s1 = (rotateRight32(w[index - 2] ?? 0, 17) ^ rotateRight32(w[index - 2] ?? 0, 19) ^ ((w[index - 2] ?? 0) >>> 10)) >>> 0;
    w[index] = ((w[index - 16] ?? 0) + s0 + (w[index - 7] ?? 0) + s1) >>> 0;
  }

  let a = state[0] ?? 0;
  let b = state[1] ?? 0;
  let c = state[2] ?? 0;
  let d = state[3] ?? 0;
  let e = state[4] ?? 0;
  let f = state[5] ?? 0;
  let g = state[6] ?? 0;
  let h = state[7] ?? 0;

  for (let index = 0; index < 64; index += 1) {
    const sigma1 = (rotateRight32(e, 6) ^ rotateRight32(e, 11) ^ rotateRight32(e, 25)) >>> 0;
    const choice = ((e & f) ^ (~e & g)) >>> 0;
    const temp1 = (h + sigma1 + choice + (SHA256_K[index] ?? 0) + (w[index] ?? 0)) >>> 0;
    const sigma0 = (rotateRight32(a, 2) ^ rotateRight32(a, 13) ^ rotateRight32(a, 22)) >>> 0;
    const majority = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
    const temp2 = (sigma0 + majority) >>> 0;

    h = g;
    g = f;
    f = e;
    e = (d + temp1) >>> 0;
    d = c;
    c = b;
    b = a;
    a = (temp1 + temp2) >>> 0;
  }

  return [
    ((state[0] ?? 0) + a) >>> 0,
    ((state[1] ?? 0) + b) >>> 0,
    ((state[2] ?? 0) + c) >>> 0,
    ((state[3] ?? 0) + d) >>> 0,
    ((state[4] ?? 0) + e) >>> 0,
    ((state[5] ?? 0) + f) >>> 0,
    ((state[6] ?? 0) + g) >>> 0,
    ((state[7] ?? 0) + h) >>> 0,
  ];
}

/** Serialisierbare Form des Hasher-Zustands. `offset` ist immer ein Vielfaches von 64. */
export interface VaultStreamingHashSnapshot {
  readonly state: readonly number[];
  readonly offset: number;
  readonly block: readonly number[];
  readonly blockLength: number;
  readonly finalized: boolean;
}

/**
 * **Der inkrementelle SHA-256.**
 *
 * **Unveränderlich, und warum.** Jede Operation gibt einen **neuen** Hasher zurück; der alte bleibt gültig.
 * Das ist die Eigenschaft, die eine Wiederaufnahme ohne Datenverlust erst möglich macht: der
 * Wiederaufnahmepunkt ist ein *Wert*, kein veränderlicher Puffer, den ein zweiter Lauf halb überschrieben
 * vorfinden kann. Der Preis ist eine Kopie des Zustands je Block (8 Zahlen + höchstens 64 Bytes); bei
 * 4096 Blöcken sind das wenige hundert Kilobyte gegen 25 MiB Nutzlast.
 *
 * **Kein DOM, keine Uhr, kein Zufall, keine Ausnahme aus dem Nichts.** Die Klasse berührt weder
 * `Date.now()` noch `globalThis`, ist also ohne Browser ausführbar.
 */
export class VaultStreamingSha256 {
  readonly #state: readonly number[];
  readonly #offset: number;
  readonly #block: readonly number[];
  readonly #blockLength: number;
  readonly #finalized: boolean;

  private constructor(state: readonly number[], offset: number, block: readonly number[], blockLength: number, finalized: boolean) {
    this.#state = state;
    this.#offset = offset;
    this.#block = block;
    this.#blockLength = blockLength;
    this.#finalized = finalized;
  }

  static create(): VaultStreamingSha256 {
    return new VaultStreamingSha256(SHA256_INITIAL, 0, [], 0, false);
  }

  static restore(snapshot: VaultStreamingHashSnapshot): VaultStreamingSha256 {
    if (snapshot.state.length !== 8) throw new VaultStreamingHashError('digest_incomplete', 8, snapshot.state.length);
    if (snapshot.offset % SHA256_BLOCK_BYTES !== 0) throw new VaultStreamingHashError('digest_incomplete', SHA256_BLOCK_BYTES, snapshot.offset % SHA256_BLOCK_BYTES);
    if (snapshot.blockLength !== snapshot.block.length) throw new VaultStreamingHashError('digest_incomplete', snapshot.block.length, snapshot.blockLength);
    if (snapshot.blockLength >= SHA256_BLOCK_BYTES) throw new VaultStreamingHashError('chunk_exceeds_window', SHA256_BLOCK_BYTES, snapshot.blockLength);
    return new VaultStreamingSha256([...snapshot.state], snapshot.offset, [...snapshot.block], snapshot.blockLength, snapshot.finalized);
  }

  /** Wie viele Bytes bisher angenommen wurden (nicht: wie viele verdichtet wurden). */
  get byteLength(): number {
    return this.#offset + this.#blockLength;
  }

  get finalized(): boolean {
    return this.#finalized;
  }

  snapshot(): VaultStreamingHashSnapshot {
    return { state: [...this.#state], offset: this.#offset, block: [...this.#block], blockLength: this.#blockLength, finalized: this.#finalized };
  }

  /**
   * Nimmt **einen** Block entgegen. `maxBytes` ist die Grenze, die der Aufrufer setzt; der Vorgabewert ist
   * `Number.POSITIVE_INFINITY` **nicht** — ein unbegrenzter Block wäre genau der Zustand, den diese Datei
   * verhindern soll. Wer den Vorgabewert nutzt, bekommt `VAULT_STREAMING_WINDOW_BYTES`.
   *
   * Abgelaufene Bytes werden **nicht** festgehalten: nur `#block` (höchstens 63 Bytes) überlebt einen Block.
   */
  update(bytes: Uint8Array, maxBytes: number = VAULT_STREAMING_WINDOW_BYTES): VaultStreamingSha256 {
    if (this.#finalized) throw new VaultStreamingHashError('update_after_finalize', 0, bytes.byteLength);
    if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new VaultStreamingHashError('chunk_size_invalid', SHA256_BLOCK_BYTES, maxBytes);
    if (bytes.byteLength > maxBytes) throw new VaultStreamingHashError('chunk_exceeds_window', maxBytes, bytes.byteLength);

    let buffer = [...this.#block];
    let state = this.#state;
    let offset = this.#offset;
    let position = 0;

    while (position < bytes.byteLength) {
      const wanted = SHA256_BLOCK_BYTES - buffer.length;
      const take = Math.min(wanted, bytes.byteLength - position);
      for (let index = 0; index < take; index += 1) buffer.push(bytes[position + index] ?? 0);
      position += take;
      if (buffer.length === SHA256_BLOCK_BYTES) {
        state = compressBlock(state, Uint8Array.from(buffer));
        offset += SHA256_BLOCK_BYTES;
        buffer = [];
      }
    }

    return new VaultStreamingSha256(state, offset, buffer, buffer.length, false);
  }

  /**
   * Schließt ab und liefert den Digest als 64 Hex-Zeichen.
   *
   * **Die Bitlänge wird aus `offset + blockLength` gebildet — beide Summanden, nicht nur `offset`.** Das ist
   * die Korrektur eines Fehlers, den dieser Zeuge gefunden hat, und der Fehler ist lehrreich genug, um hier
   * zu stehen:
   *
   * Meine erste Fassung setzte `bitLengthLow = (offset * 8) >>> 0`. `offset` zählt aber nur die bereits
   * **verdichteten** Bytes und ist deshalb immer ein Vielfaches von 64 — der Restsatz in `#block` fehlte in
   * der Länge. Damit war die Längenangabe im Padding für **jede** Eingabe zu klein, deren Länge nicht auf
   * einer 64-Byte-Grenze endet.
   *
   * **Warum das nicht aufgefallen ist, und warum der KAT allein nicht reicht:** der Standardvektor
   * `sha256("")` hat `blockLength = 0`, also war `offset * 8` dort zufällig richtig — der bekannteste aller
   * Testvektoren war **blind** für genau diesen Defekt. Gefunden hat ihn erst die Prüfung von `"abc"` und
   * die Längenreihe gegen `crypto.subtle`. Ein einzelner KAT ist kein Beweis für einen Hasher.
   *
   * `bitLengthHigh = floor((offset + blockLength) / 2**29)` ist exakt: eine Erhöhung um 2^32 **Bit** ist eine
   * Erhöhung um 2^29 **Byte**, und der Bruchteil `blockLength / 2**29` ist kleiner als 1, solange
   * `blockLength < 2**29` — was für höchstens 4 MiB je Block immer gilt.
   */
  digest(): string {
    return bytesToHex(this.#finalize());
  }

  /**
   * Wie `digest()`, gibt aber zusätzlich den **abgeschlossenen** Hasher zurück, der kein `update` mehr
   * annimmt. Reine Funktion über `this`: der aufrufende Hasher bleibt unverändert gültig und kann erneut
   * abgeschlossen werden.
   */
  finalizeHex(): { readonly hex: string; readonly hasher: VaultStreamingSha256 } {
    return { hex: bytesToHex(this.#finalize()), hasher: new VaultStreamingSha256(this.#state, this.#offset, this.#block, this.#blockLength, true) };
  }

  #finalize(): Uint8Array {
    const byteLength = this.#offset + this.#blockLength;
    const bitLengthHigh = Math.floor(byteLength / 0x20000000);
    const bitLengthLow = (byteLength * 8) >>> 0;

    const paddedLength = Math.ceil((this.#blockLength + 9) / SHA256_BLOCK_BYTES) * SHA256_BLOCK_BYTES;
    const padded = new Uint8Array(paddedLength);
    padded.set(Uint8Array.from(this.#block), 0);
    padded[this.#blockLength] = 0x80;
    const view = new DataView(padded.buffer, padded.byteOffset, padded.byteLength);
    view.setUint32(paddedLength - 8, bitLengthHigh, false);
    view.setUint32(paddedLength - 4, bitLengthLow, false);

    let state = this.#state;
    for (let start = 0; start < paddedLength; start += SHA256_BLOCK_BYTES) {
      state = compressBlock(state, padded.subarray(start, start + SHA256_BLOCK_BYTES));
    }

    const digest = new Uint8Array(32);
    const digestView = new DataView(digest.buffer, digest.byteOffset, digest.byteLength);
    for (let index = 0; index < 8; index += 1) digestView.setUint32(index * 4, state[index] ?? 0, false);
    return digest;
  }

  /**
   * **Die Wirkung, nicht die Anwesenheit.**
   *
   * Liefert genau die Bytes, die `digest()` hexadezimal ausgibt. Der Rückgabetyp ist `Uint8Array` wie alle
   * anderen Signaturen dieser Datei: die Bytes werden hier gelesen, nicht an eine Plattform gegeben, also
   * gibt es keine Puffer-Einschränkung zu deklarieren.
   */
  digestBytes(): Uint8Array {
    return this.#finalize();
  }
}

// ---------------------------------------------------------------------------------------------------
// Die Digest-Funktionen. Alle über **Rohbytes**, keine über eine Hex-Darstellung.
//
// **Und alle über `Uint8Array` — nicht über `Uint8Array<ArrayBuffer>`.** Das ist die ehrliche Fassung: die
// Implementierung liest die Bytes (`bytes[i]`, `subarray`), und Lesen funktioniert für jeden Puffer,
// einschließlich eines geteilten. Wo eine Plattform wirklich einen `ArrayBuffer` verlangt, ist das eine
// Aussage über **diese Plattform** und gehört an ihren Rand — nicht als Verschärfung in jede Signatur, die
// dann 39 Aufrufer mitziehen muss. Kein `as`, weil es nichts zu konvertieren gibt.
// ---------------------------------------------------------------------------------------------------

/**
 * Eine Bequemlichkeitsschicht: der Digest über genau **einen** Block, über die inkrementelle Fassung.
 *
 * `maxBytes` begrenzt den Block und hat den Vorgabewert des Fensters. Wer mehr als ein Fenster hashen will,
 * ruft `VaultStreamingSha256` mehrfach auf — oder `buildVaultStreamingDigest`, das die Aufteilung und die
 * Obergrenze der Blockzahl mitführt. Diese Funktion ist absichtlich die kleine Form: **sie lehnt einen zu
 * großen Block ab, statt ihn stillschweigend in Stücke zu schneiden.** Ein stilles Aufteilen würde die
 * Fenstergrenze des Aufrufers unsichtbar machen, und genau diese Grenze ist der Zweck der Datei.
 */
export function incrementalSha256Hex(bytes: Uint8Array, maxBytes: number = VAULT_STREAMING_WINDOW_BYTES): string {
  return VaultStreamingSha256.create().update(bytes, maxBytes).digest();
}

/**
 * Der Digest über beliebig viele Bytes, **ohne** sie als Ganzes an eine Plattform zu geben: die Aufteilung
 * in Fenster geschieht hier, und kein Zwischenschritt hält mehr als `chunkBytes`.
 *
 * **Warum das keine Umgehung der Fenstergrenze ist:** die Grenze schützt davor, dass ein **Aufrufer** einen
 * unbegrenzten Block übergibt und der Hasher ihn festhält. Hier ist der Aufrufer diese Datei, `chunkBytes`
 * liegt innerhalb der Grenzen, die Blockzahl ist auf `maxChunks` begrenzt, und je Schleifendurchlauf wird
 * genau eine Sicht der Länge `chunkBytes` gebildet.
 *
 * **Der Unterschied zu `buildVaultStreamingDigest`:** dort kommen die Blöcke **fertig** vom Aufrufer (der sie
 * etwa aus einer Datei gelesen hat) und die Block-Digests werden mitgeführt. Hier ist die Eingabe ein
 * zusammenhängendes Feld, und nur der Gesamt-Digest wird gebildet.
 */
export function streamingSha256HexOfRange(
  bytes: Uint8Array,
  chunkBytes: number = VAULT_STREAMING_WINDOW_BYTES,
  maxChunks: number = VAULT_STREAMING_HASH_LIMITS.maxChunks,
): string {
  const limits = VAULT_STREAMING_HASH_LIMITS;
  if (!Number.isSafeInteger(chunkBytes) || chunkBytes < limits.minChunkBytes || chunkBytes > limits.maxChunkBytes) {
    throw new VaultStreamingHashError('chunk_size_invalid', limits.maxChunkBytes, chunkBytes);
  }
  if (!Number.isSafeInteger(maxChunks) || maxChunks <= 0 || maxChunks > limits.maxChunks) {
    throw new VaultStreamingHashError('chunk_limit_exceeded', limits.maxChunks, maxChunks);
  }
  const totalChunks = bytes.byteLength === 0 ? 1 : Math.ceil(bytes.byteLength / chunkBytes);
  if (totalChunks > maxChunks) throw new VaultStreamingHashError('chunk_limit_exceeded', maxChunks, totalChunks);

  let hasher = VaultStreamingSha256.create();
  if (bytes.byteLength === 0) return hasher.digest();
  for (let start = 0; start < bytes.byteLength; start += chunkBytes) {
    hasher = hasher.update(bytes.subarray(start, Math.min(bytes.byteLength, start + chunkBytes)), chunkBytes);
  }
  return hasher.digest();
}

/**
 * **Die Gleichheit, die den Datenverlust verhindert — als ausführbare Funktion.**
 *
 * Der verworfene erste Anlauf bildete den Digest über die Hex-Darstellung der Blöcke. Das war **nicht**
 * bitgleich zu `sha256Bytes(…)` und hätte jeden gespeicherten `contentDigest` ungültig gemacht. Diese
 * Funktion ist die Zusicherung dagegen: sie stellt den blockweisen Digest über die **Rohbytes** gegen eine
 * **hineingereichte** Referenzimplementierung.
 *
 * ## Warum die Referenz ein Parameter ist und keine eigene Funktion dieser Datei
 *
 * Mein erster Entwurf rief hier `crypto.subtle.digest` auf. Das war aus zwei Gründen falsch:
 *
 *   1. **Es zog eine Typgrenze in die Produktion, die nur ein Zeuge braucht.** `crypto.subtle.digest`
 *      verlangt `BufferSource` = `ArrayBufferView<ArrayBuffer>`, und seit TypeScript 5.7 ist der Puffertyp
 *      Teil des Typs. Eine Signatur auf `Uint8Array<ArrayBuffer>` zu verschärfen, verschob die Arbeit auf
 *      **39 Aufrufstellen** im Zeugen — und die Verschärfung war unnötig, weil `streamingSha256HexOfRange`
 *      die Bytes nur liest und ein geteilter Puffer zum Lesen völlig in Ordnung ist.
 *   2. **Die unabhängige Referenz gehört nicht in das Modul, das sie prüfen soll.** Eine Funktion, die
 *      gegen `crypto.subtle` vergleicht, ist eine Aussage über eine Umgebung; sie an den Rand zu legen
 *      (den Zeugen) hält dieses Modul rein, browserfrei und ohne Plattformannahme.
 *
 * Deshalb bleibt die Produktionssignatur bei `Uint8Array` — der **ehrlichen** Fassung, weil hier wirklich
 * jeder Puffer gelesen werden kann — und die Verengung liegt dort, wo die Plattform sie verlangt: im
 * Zeugen, mit einem lokal gebauten `ArrayBuffer`.
 */
export async function streamingDigestMatchesBaseline(
  bytes: Uint8Array,
  reference: (bytes: Uint8Array) => Promise<string>,
  maxBytes: number = VAULT_STREAMING_HASH_LIMITS.maxChunkBytes,
): Promise<boolean> {
  return streamingSha256HexOfRange(bytes, maxBytes) === await reference(bytes);
}

/**
 * Der Merkle-Wurzelwert über bereits gebildete Block-Digests.
 *
 * **Bitgleich zu `computeVaultMerkleRoot` in `integrity/vaultIntegrity.ts`**, und der Grund ist die
 * Kodierung: dort wird `${left}:${right}` **als Text** gehasht (UTF-8), hier genauso. Wäre hier über die
 * rohen 64 Hex-Zeichen oder über Bytes gehasht worden, wären die beiden Wurzeln für dieselben Blöcke
 * verschieden — und ein Manifest aus dieser Datei wäre nicht mehr byte-identisch zu einem aus
 * `buildVaultChunkIntegrity`. Der Zeuge prüft die Identität gegen die vorhandene Funktion, nicht gegen eine
 * Erwartung.
 *
 * Ein einzelner Block ist seine eigene Wurzel. Bei einer ungeraden Ebene wird der letzte Knoten mit sich
 * selbst gepaart — dieselbe Regel wie dort.
 */
export function streamingMerkleRoot(chunkHashes: readonly string[]): string {
  if (chunkHashes.length === 0) return '0'.repeat(64);
  if (chunkHashes.length > VAULT_STREAMING_HASH_LIMITS.maxChunks) {
    throw new VaultStreamingHashError('chunk_limit_exceeded', VAULT_STREAMING_HASH_LIMITS.maxChunks, chunkHashes.length);
  }
  let level: readonly string[] = [...chunkHashes];
  while (level.length > 1) {
    const next: string[] = [];
    for (let index = 0; index < level.length; index += 2) {
      const left = level[index] ?? '';
      const right = level[index + 1] ?? left;
      next.push(incrementalSha256Hex(new TextEncoder().encode(`${left}:${right}`)));
    }
    level = next;
  }
  return level[0] ?? '0'.repeat(64);
}

/** Das Ergebnis eines blockweisen Digest-Laufs. Alle Felder sind Rechenergebnisse, keine Eingaben. */
export interface VaultStreamingDigestResult {
  /** Der Digest über **alle** Bytes in Reihenfolge — bitgleich zu `sha256Bytes` über dieselben Bytes. */
  readonly contentDigest: string;
  readonly chunkSize: number;
  readonly totalChunks: number;
  /** Ein Hex-Digest je Block, in Reihenfolge. Nur Zeichenketten — keine Nutzlast. */
  readonly chunkHashes: readonly string[];
  readonly merkleRoot: string;
}

/**
 * **Der blockweise Digest.** Ein Durchlauf, ein Fenster: es werden nie mehr als `chunkSize` Bytes
 * gleichzeitig gehalten, und der Gesamt-Digest entsteht **im selben Durchlauf** wie die Block-Digests —
 * nicht in einem zweiten über einen materialisierten Puffer.
 *
 * **Was diese Funktion nicht tut:** sie liest keine Datei, kennt keinen Dateinamen und keinen Pfad. Der
 * Aufrufer übergibt die Bytes. Damit kann kein Fehlertext dieser Funktion einen Tresorpfad enthalten.
 *
 * **Die Grenzen greifen vor der Arbeit**, nicht danach: ein Block über dem Fenster, eine ungültige
 * Blockgröße und ein zu großer Stapel werden abgewiesen, **bevor** der erste Block verdichtet wird.
 */
export function buildVaultStreamingDigest(
  chunks: readonly Uint8Array[],
  chunkSize: number = VAULT_STREAMING_WINDOW_BYTES,
): VaultStreamingDigestResult {
  const limits = VAULT_STREAMING_HASH_LIMITS;
  if (!Number.isSafeInteger(chunkSize) || chunkSize < limits.minChunkBytes || chunkSize > limits.maxChunkBytes) {
    throw new VaultStreamingHashError('chunk_size_invalid', limits.maxChunkBytes, chunkSize);
  }
  if (chunks.length > limits.maxChunks) throw new VaultStreamingHashError('chunk_limit_exceeded', limits.maxChunks, chunks.length);

  let whole = VaultStreamingSha256.create();
  const chunkHashes: string[] = [];
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    if (!(chunk instanceof Uint8Array)) throw new VaultStreamingHashError('chunk_size_invalid', 0, -1);
    if (chunk.byteLength > chunkSize) throw new VaultStreamingHashError('chunk_exceeds_window', chunkSize, chunk.byteLength);
    if (chunk.byteLength === 0) throw new VaultStreamingHashError('chunk_size_invalid', 1, 0);
    whole = whole.update(chunk, chunkSize);
    chunkHashes.push(incrementalSha256Hex(chunk, chunkSize));
  }

  return {
    contentDigest: whole.digest(),
    chunkSize,
    totalChunks: chunkHashes.length,
    chunkHashes,
    merkleRoot: streamingMerkleRoot(chunkHashes),
  };
}

/**
 * **Das Manifest, byte-identisch zu `buildVaultChunkIntegrity`.**
 *
 * `chunkSize`, `totalChunks`, `merkleRoot` und jeder `chunks[i].hash` müssen **denselben Wert** haben wie
 * das Manifest, das `integrity/vaultIntegrity.ts` für dieselben Bytes bildet — sonst hätte dieselbe Datei
 * zwei verschiedene Integritätswahrheiten, und `verifyVaultChunkIntegrity` würde für einen über diese
 * Datei importierten Eintrag rot, obwohl nichts manipuliert wurde. Der Zeuge vergleicht beide Manifeste
 * **feldweise**, nicht stichprobenartig.
 *
 * `algorithm` ist die Konstante `'SHA-256'` und `version` die Konstante `1` — die Typen des Vertrags lassen
 * nichts anderes zu, deshalb braucht es hier keine Prüfung und keine Zusicherung.
 */
export function vaultStreamingChunkManifest(result: VaultStreamingDigestResult): VaultChunkIntegrityManifest {
  return {
    version: 1,
    algorithm: 'SHA-256',
    chunkSize: result.chunkSize,
    totalChunks: result.totalChunks,
    merkleRoot: result.merkleRoot,
    chunks: result.chunkHashes.map((hash, index) => ({ index, hash })),
  };
}

/**
 * **Die Wirkungsprüfung, nicht die Anwesenheitsprüfung.**
 *
 * Ein Digest, der immer denselben Wert liefert, besteht jede Zusicherung der Form „gleiche Eingabe →
 * gleicher Wert". Diese Funktion prüft das Gegenteil: dass **zwei verschiedene** Eingaben **zwei
 * verschiedene** Digests liefern. Sie ist die Zusicherung, die eine Mutation „Hasher gibt eine Konstante
 * zurück" rot macht.
 */
export function streamingDigestsDiffer(left: Uint8Array, right: Uint8Array): boolean {
  return streamingSha256HexOfRange(left) !== streamingSha256HexOfRange(right);
}

/** Die drei Werte, die **gemeinsam** entstehen und deshalb nicht auseinandergehalten werden dürfen. */
export interface VaultStreamingDigestRecord {
  readonly contentDigest: string;
  readonly chunkIntegrity: VaultChunkIntegrityManifest;
}

/**
 * **Block-Digests, Merkle-Wurzel und Gesamt-Digest in EINEM Durchlauf — als EIN Datensatz.**
 *
 * **Warum das eine Funktion ist und nicht drei Aufrufe.** Der Fehler, den diese Form verhindert: zwei
 * Werte, die über **verschiedene** Bytes gebildet wurden, sehen beide gültig aus und widersprechen sich
 * erst bei einem Vergleich, den man vergessen kann. Hier entstehen `contentDigest` und `chunkIntegrity` aus
 * **demselben** `subarray`-Durchlauf über **dieselben** Bytes — sie können nicht auseinanderlaufen.
 *
 * **Eine Sicht, keine Kopie.** `subarray` teilt den Puffer; es entsteht kein zweites Feld in der Größe der
 * Datei. Der Hasher läuft mit und hält höchstens 64 Byte Restsatz — das ist der Unterschied zwischen
 * „Streaming" und „die Nutzlast zweimal halten", der 58,33 MiB gegen 25,00 MiB gekostet hat.
 *
 * **Und die Reihenfolge der Rückgabe ist die Ordnung der Aussage:** zuerst die Block-Digests, dann die
 * Wurzel über sie, am Ende der Gesamt-Digest über die Rohbytes — bitgleich zu `sha256Bytes`.
 */
export function streamingDigestRecord(
  bytes: Uint8Array,
  chunkSize: number = VAULT_STREAMING_WINDOW_BYTES,
): VaultStreamingDigestRecord {
  const limits = VAULT_STREAMING_HASH_LIMITS;
  if (!Number.isSafeInteger(chunkSize) || chunkSize < limits.minChunkBytes || chunkSize > limits.maxChunkBytes) {
    throw new VaultStreamingHashError('chunk_size_invalid', limits.maxChunkBytes, chunkSize);
  }
  const totalChunks = bytes.byteLength === 0 ? 0 : Math.ceil(bytes.byteLength / chunkSize);
  if (totalChunks > limits.maxChunks) throw new VaultStreamingHashError('chunk_limit_exceeded', limits.maxChunks, totalChunks);

  /*
   * **`let` und Zuweisung — die Unveränderlichkeit des Hashers verlangt es.**
   *
   * Hier stand zuerst `const whole = VaultStreamingSha256.create();` und darunter ein nacktes
   * `whole.update(chunk, chunkSize);`. `update` **gibt einen neuen Hasher zurück** und ändert den alten
   * nicht; der Rückgabewert wurde also verworfen, und `whole.digest()` lieferte anschließend den Digest über
   * die **leere** Eingabe: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
   *
   * **Warum das lange unsichtbar war, und warum es ein Lehrstück ist:** die **Block-Digests** waren
   * richtig, die **Merkle-Wurzel** war richtig, die **Blockzahl** war richtig. Nur der Gesamt-Digest war der
   * Digest von nichts. Jede Zusicherung, die „gleiche Eingabe → gleicher Wert" oder „die Wurzel stimmt"
   * lautet, war **grün**. Gefunden hat es allein die Zusicherung, die den Gesamt-Digest **gegen die
   * zurückgelesenen Bytes** hält — also die Wirkung, nicht die Anwesenheit. Genau der Grund, warum der
   * Auftrag den Rückweg verlangt.
   */
  let whole = VaultStreamingSha256.create();
  const chunkHashes: string[] = [];
  for (let start = 0; start < bytes.byteLength; start += chunkSize) {
    const chunk = bytes.subarray(start, Math.min(bytes.byteLength, start + chunkSize));
    if (chunk.byteLength === 0) break;
    chunkHashes.push(incrementalSha256Hex(chunk, chunkSize));
    whole = whole.update(chunk, chunkSize);
  }
  return {
    contentDigest: whole.digest(),
    chunkIntegrity: {
      version: 1,
      algorithm: 'SHA-256',
      chunkSize,
      totalChunks: chunkHashes.length,
      merkleRoot: streamingMerkleRoot(chunkHashes),
      chunks: chunkHashes.map((hash, index) => ({ index, hash })),
    },
  };
}

/** Die Blockaufteilung, die der Import verwendet. Reine Arithmetik, kein Lesen. */
export function planVaultStreamingChunks(totalBytes: number, chunkSize: number = VAULT_STREAMING_WINDOW_BYTES): { readonly totalChunks: number; readonly lastChunkBytes: number } {
  const limits = VAULT_STREAMING_HASH_LIMITS;
  if (!Number.isSafeInteger(totalBytes) || totalBytes < 0) throw new VaultStreamingHashError('chunk_size_invalid', 0, totalBytes);
  if (!Number.isSafeInteger(chunkSize) || chunkSize < limits.minChunkBytes || chunkSize > limits.maxChunkBytes) {
    throw new VaultStreamingHashError('chunk_size_invalid', limits.maxChunkBytes, chunkSize);
  }
  if (totalBytes === 0) return { totalChunks: 0, lastChunkBytes: 0 };
  const totalChunks = Math.ceil(totalBytes / chunkSize);
  if (totalChunks > limits.maxChunks) throw new VaultStreamingHashError('chunk_limit_exceeded', limits.maxChunks, totalChunks);
  const lastChunkBytes = totalBytes - (totalChunks - 1) * chunkSize;
  return { totalChunks, lastChunkBytes };
}
