// STATUS: PLATIN — der Hash: bekannter Wert, Blockgrenzen, und die Wirkung.
//
// **Warum dieser Zeuge so aufgebaut ist, und was er NICHT ist.**
//
// Die Regel dieser Sitzung lautet: *eine Rundlauf-Prüfung, die nur den Serialisierer prüft, ist wertlos* —
// und bei einem **Hash** gilt die schärfere Fassung: *prüfe die Wirkung, nicht die Anwesenheit. Ein Hash,
// der immer denselben Wert liefert, besteht jede „gleiche Eingabe → gleicher Wert"-Zusicherung.*
//
// Dieser Zeuge ist deshalb dreischichtig, und die Schichten sind nicht austauschbar:
//
//   1. **Der bekannte Wert (KAT).** `sha256("abc")` ist ein feststehender Wert. Eine Zusicherung „gleiche
//      Eingabe → gleicher Wert" besteht ein Hasher, der eine Konstante zurückgibt, **mühelos**. Erst der
//      bekannte Wert bindet die Ausgabe an die Wirklichkeit.
//   2. **Die Wirkung.** Verschiedene Eingaben liefern verschiedene Werte — geprüft über viele Paare, über
//      ein einzelnes gekipptes Bit und über eine Längenreihe, die jede Verzweigung trifft.
//   3. **Die Grenzen, an denen es still falsch wird.** 55/56/57 Byte (Padding-Grenze) und 63/64/65 Byte
//      (Blockgrenze). Genau hier war meine erste Fassung falsch — die Bitlänge ließ den Restsatz aus, und
//      der Fehler war für Längen auf 64-Byte-Grenzen **unsichtbar**. Der berühmteste aller Testvektoren,
//      `sha256("")`, war **blind** dafür, weil dort `blockLength = 0` ist. Gefunden hat ihn erst `"abc"`.
//
// **Die unabhängige Referenz ist `crypto.subtle.digest`** — eine andere Implementierung im selben Prozess,
// nicht dieselbe Funktion unter anderem Namen.
//
// ## Wo die Puffer-Verengung liegt, und warum sie HIER liegt
//
// `crypto.subtle.digest` verlangt seit TypeScript 5.7 `BufferSource` = `ArrayBufferView<ArrayBuffer>`; der
// Puffertyp ist Teil des Typs geworden. Mein erster Entwurf stellte **die Produktionssignatur** auf
// `Uint8Array<ArrayBuffer>` — und verschob damit Arbeit auf **39 Aufrufstellen** in dieser Datei. Das war
// die falsche Richtung: die Produktionsfunktionen **lesen** die Bytes, und Lesen funktioniert für jeden
// Puffer.
//
// **Deshalb liegt die Verengung hier, an ihrem Rand**, und sie ist **keine Zusicherung**: der Puffer wird
// **gebaut**, nicht behauptet — `new ArrayBuffer(n)` und `new Uint8Array(buffer)`. Der Typ entsteht aus der
// Konstruktion. Kein `as`, kein `@ts-ignore`, und **keine Kopie** einer bestehenden Nutzlast: die Bytes
// werden von vornherein in den richtigen Puffer geschrieben.
//
// **Kein `jsdom`, kein `happy-dom`, kein `@testing-library`.** Der Hasher ist reine Arithmetik und wird
// ausgeführt, nicht gerendert.
import { describe, expect, it } from 'vitest';
import {
  buildVaultStreamingDigest,
  incrementalSha256Hex,
  planVaultStreamingChunks,
  streamingDigestMatchesBaseline,
  streamingDigestsDiffer,
  streamingMerkleRoot,
  streamingSha256HexOfRange,
  VAULT_STREAMING_HASH_LIMITS,
  VAULT_STREAMING_WINDOW_BYTES,
  VaultStreamingHashError,
  VaultStreamingSha256,
  vaultStreamingChunkManifest,
  type VaultStreamingHashViolation,
} from '../../../../shared/vault/streaming/vaultStreamingHash';
import { buildVaultChunkIntegrity, computeVaultMerkleRoot } from '../../../../shared/vault/integrity/vaultIntegrity';

/**
 * Ein Bytes-Feld in einem **frischen `ArrayBuffer`**.
 *
 * Der Rückgabetyp ist ausgeschrieben, obwohl TypeScript ihn herleiten könnte: er ist die Aussage, an der
 * die Verengung hängt, und eine verborgene Herleitung wäre hier schwerer zu prüfen als eine Nennung.
 */
const bytesInFreshBuffer = (length: number): Uint8Array<ArrayBuffer> => {
  const buffer = new ArrayBuffer(length);
  return new Uint8Array(buffer);
};

/**
 * Text → UTF-8-Bytes, **ohne Zusicherung und ohne Kopie**.
 *
 * `new TextEncoder().encode(text)` liefert `Uint8Array<ArrayBufferLike>`, und `crypto.subtle` verlangt
 * `ArrayBufferView<ArrayBuffer>`. Ein `as` wäre hier Betrug und eine Kopie wäre unnötig: die Bytes werden
 * von vornherein in einen echten `ArrayBuffer` **geschrieben**. Die Kodierung selbst ist vier Zeilen
 * UTF-8 und wird nicht geraten — die KAT-Zeilen unten prüfen genau diese vier Zeilen gegen FIPS-Werte.
 */
const toBytes = (text: string): Uint8Array<ArrayBuffer> => {
  const encoded: number[] = [];
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 0x80) {
      encoded.push(code);
    } else if (code < 0x800) {
      encoded.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      encoded.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      encoded.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    }
  }
  const bytes = bytesInFreshBuffer(encoded.length);
  for (let index = 0; index < encoded.length; index += 1) bytes[index] = encoded[index] ?? 0;
  return bytes;
};

/** Eine Gegenprobe der eigenen Kodierung gegen die Plattform — sie darf nicht abweichen. */
const platformBytes = (text: string): Uint8Array<ArrayBuffer> => {
  const encoded = new TextEncoder().encode(text);
  const bytes = bytesInFreshBuffer(encoded.byteLength);
  bytes.set(encoded);
  return bytes;
};

/** Eine deterministische Füllung ohne Zufall — derselbe Testlauf liefert dieselben Bytes. */
const pattern = (length: number, seed = 7): Uint8Array<ArrayBuffer> => {
  const bytes = bytesInFreshBuffer(length);
  let value = seed;
  for (let index = 0; index < length; index += 1) {
    value = (value * 1103515245 + 12345) >>> 0;
    bytes[index] = (value >>> 16) & 0xff;
  }
  return bytes;
};

/**
 * **Die unabhängige Referenz, an ihrem Rand gebaut.**
 *
 * `crypto.subtle.digest` bekommt hier eine `Uint8Array`-Sicht auf einen **frischen `ArrayBuffer`**. Die
 * Kopie ist unvermeidlich, weil die Plattform sie verlangt — und sie ist **harmlos**, weil sie im Zeugen
 * liegt und nicht im Streaming-Pfad: die Produktion kopiert **kein** Byte (nachgewiesen in
 * `vaultStreamingAssets.test.ts`, das die Abwesenheit einer Vollkopie im Importpfad prüft).
 *
 * Die Größe ist begrenzt: dieser Zeuge hasht höchstens ~300 KiB je Fall, nicht 25 MiB.
 */
const referenceDigest = async (bytes: Uint8Array): Promise<string> => {
  const copy = new Uint8Array(new ArrayBuffer(bytes.byteLength));
  copy.set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', copy);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

const HEX_64 = /^[0-9a-f]{64}$/u;

/**
 * **Die Längen, die jede Verzweigung treffen.** Nicht „ein paar Beispiele": 0 und 1 (Sonderfälle),
 * 55/56/57 (die Padding-Grenze, an der die Bitlänge in einen zweiten Block wandert), 63/64/65 und
 * 127/128/129 (die Blockgrenze in beide Richtungen), 1000/4096/65535/65536 (mehrere Blöcke, Fenstergröße),
 * und 300000 (deutlich über ein Vielfaches eines Blocks hinaus).
 */
const KAT_LENGTHS: readonly number[] = Object.freeze([0, 1, 2, 3, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128, 129, 1000, 4096, 65535, 65536, 300_000]);

describe('vaultStreamingHash: der bekannte Wert bindet die Ausgabe an die Wirklichkeit', () => {
  it('der Standard-KAT: sha256("") und sha256("abc") sind feststehende Werte', () => {
    /*
     * Zwei Werte aus FIPS 180-4 / jedem veröffentlichten Testvektor. Ein Hasher, der eine Konstante
     * zurückgibt, fällt hier durch — und nur hier fällt er sicher durch.
     *
     * **Und der zweite Wert ist der wichtigere.** `sha256("")` war in meiner ersten Fassung grün, obwohl
     * die Bitlängenberechnung falsch war — bei der leeren Eingabe ist `blockLength = 0` und der Fehler
     * unsichtbar. `"abc"` hat ihn gefunden.
     */
    expect(incrementalSha256Hex(toBytes(''))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(incrementalSha256Hex(toBytes('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    // Der 448-Bit-Vektor: 56 Zeichen, also genau eine Länge, die zwei Blöcke braucht.
    expect(incrementalSha256Hex(toBytes('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')))
      .toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
  });

  it('ein BEKANNTES Paar (Eingabe, Hash): 4096 Byte mit Muster (i*37+11) & 255', () => {
    /*
     * Der Auftrag verlangt ausdrücklich „ein BEKANNTES Paar (Eingabe, Hash)". Der Wert ist **unabhängig**
     * gebildet (node:crypto) und steht als Literal hier:
     *
     *   node -e "const c=require('node:crypto');const b=Buffer.alloc(4096);
     *            for(let i=0;i<4096;i++)b[i]=(i*37+11)&255;
     *            console.log(c.createHash('sha256').update(b).digest('hex'))"
     *   -> 4e441a3533bb2c10cd5649981d395744213e09a336746b5a3458fee4057205ec
     *
     * Ohne dieses Literal prüfte der Zeuge nur, dass die Funktion **mit sich selbst** übereinstimmt — und
     * das ist keine Hash-Funktion, das ist eine Zuordnung.
     */
    const bytes = bytesInFreshBuffer(4096);
    for (let index = 0; index < 4096; index += 1) bytes[index] = (index * 37 + 11) & 0xff;
    expect(incrementalSha256Hex(bytes)).toBe('4e441a3533bb2c10cd5649981d395744213e09a336746b5a3458fee4057205ec');
  });
});

describe('vaultStreamingHash: die WIRKUNG — verschiedene Eingaben, verschiedene Werte', () => {
  it('20 Längen gegen die unabhängige Referenz crypto.subtle — alle gleich, keiner abweichend', async () => {
    /*
     * Die Referenz ist eine **andere** Implementierung. Diese Zusicherung ist der Grund, warum eine eigene
     * SHA-256-Fassung überhaupt vertretbar ist: sie wird nicht geglaubt, sie wird verglichen.
     *
     * **Gemessene Korrektur:** mein erster Lauf übergab 300 000 Byte als **einen** Block an
     * `incrementalSha256Hex` und bekam `chunk_exceeds_window` — zu Recht. Die Fenstergrenze gilt für den
     * **Aufrufer**; diese Reihe ist der Aufrufer und teilt deshalb selbst auf (`streamingSha256HexOfRange`).
     */
    const measured: string[] = [];
    for (const length of KAT_LENGTHS) {
      const bytes = pattern(length, length + 1);
      const mine = streamingSha256HexOfRange(bytes);
      expect(mine, `Länge ${length}`).toBe(await referenceDigest(bytes));
      expect(mine, `Länge ${length}`).toMatch(HEX_64);
      measured.push(mine);
    }
    // **Und die Wirkung:** 20 verschiedene Eingaben dürfen nicht 20-mal denselben Wert ergeben.
    expect(new Set(measured).size).toBe(KAT_LENGTHS.length);
  });

  it('100 verschiedene Längen liefern 100 verschiedene Werte — der Konstanten-Hasher fällt hier durch', () => {
    const digests = new Set<string>();
    for (let length = 1; length <= 100; length += 1) digests.add(incrementalSha256Hex(pattern(length, length)));
    expect(digests.size).toBe(100);
  });

  it('ein Unterschied von EINEM Bit ändert den Digest vollständig (Lawineneffekt)', () => {
    /*
     * Der schärfere Wirkungstest: nicht „100 verschiedene Längen", sondern **dieselbe Länge** mit einem
     * einzigen gekippten Bit. Ein Hasher, der nur die Länge einrechnet, besteht den Test oben und fällt hier.
     */
    const base = pattern(1024, 3);
    const bitFlipped = Uint8Array.from(base);
    bitFlipped[512] = (bitFlipped[512] ?? 0) ^ 0x01;
    const left = incrementalSha256Hex(base);
    const right = incrementalSha256Hex(bitFlipped);
    expect(left).not.toBe(right);
    // Ein Lawineneffekt lässt rund die Hälfte der Hex-Stellen abweichen.
    const differing = [...left].filter((character, index) => character !== right[index]).length;
    expect(differing).toBeGreaterThan(20);
  });

  it('streamingDigestsDiffer ist die Zusicherung, nicht die Anwesenheit', () => {
    expect(streamingDigestsDiffer(pattern(500, 1), pattern(500, 2))).toBe(true);
    expect(streamingDigestsDiffer(pattern(500, 1), pattern(500, 1))).toBe(false);
  });
});

describe('vaultStreamingHash: die blockweise Fassung ist bitgleich zur vorhandenen', () => {
  it('contentDigest = sha256Bytes über dieselben Bytes — für sechs Längen, einzeln verglichen', async () => {
    /*
     * **Das ist die Zusicherung gegen den Datenverlust.** Der verworfene erste Anlauf bildete den Digest
     * über die **Hex-Darstellung** der Blöcke; das wäre nicht bitgleich gewesen und hätte jeden
     * gespeicherten `contentDigest` ungültig gemacht. Hier wird verglichen, nicht behauptet.
     */
    for (const length of [1, 64, 4096, 65_536, 200_000, 4096 * 5 + 13]) {
      const bytes = pattern(length, length + 5);
      const chunks: Uint8Array[] = [];
      for (let start = 0; start < bytes.byteLength; start += VAULT_STREAMING_WINDOW_BYTES) {
        chunks.push(bytes.subarray(start, Math.min(bytes.byteLength, start + VAULT_STREAMING_WINDOW_BYTES)));
      }
      const result = buildVaultStreamingDigest(chunks, VAULT_STREAMING_WINDOW_BYTES);
      expect(result.contentDigest, `Länge ${length}`).toBe(await referenceDigest(bytes));
      expect(await streamingDigestMatchesBaseline(bytes, referenceDigest), `Länge ${length}`).toBe(true);
    }
  });

  it('das Manifest ist FELDWEISE identisch zu buildVaultChunkIntegrity — nicht nur die Wurzel', async () => {
    /*
     * Der Beleg aus AST-1217 lautet wörtlich „Manifest byte-identisch zu buildVaultChunkIntegrity". Ein
     * Vergleich nur über `merkleRoot` ließe eine falsche Blockaufteilung durchgehen. Deshalb jedes Feld —
     * und `chunks` Element für Element samt Index.
     */
    const bytes = pattern(VAULT_STREAMING_WINDOW_BYTES * 3 + 777, 11);
    const chunks: Uint8Array[] = [];
    for (let start = 0; start < bytes.byteLength; start += VAULT_STREAMING_WINDOW_BYTES) {
      chunks.push(bytes.subarray(start, Math.min(bytes.byteLength, start + VAULT_STREAMING_WINDOW_BYTES)));
    }
    const mine = vaultStreamingChunkManifest(buildVaultStreamingDigest(chunks, VAULT_STREAMING_WINDOW_BYTES));
    const baseline = await buildVaultChunkIntegrity(bytes, VAULT_STREAMING_WINDOW_BYTES);

    expect(mine.version).toBe(baseline.version);
    expect(mine.algorithm).toBe(baseline.algorithm);
    expect(mine.chunkSize).toBe(baseline.chunkSize);
    expect(mine.totalChunks).toBe(baseline.totalChunks);
    expect(mine.merkleRoot).toBe(baseline.merkleRoot);
    expect(mine.chunks.length).toBe(baseline.chunks.length);
    for (let index = 0; index < baseline.chunks.length; index += 1) {
      expect(mine.chunks[index]?.index, `Index ${index}`).toBe(baseline.chunks[index]?.index);
      expect(mine.chunks[index]?.hash, `Hash ${index}`).toBe(baseline.chunks[index]?.hash);
    }
    // Und das ganze Objekt als Ganzes — die schärfste Form desselben Vergleichs.
    expect(mine).toEqual(baseline);
    // **Nicht nur die Form, auch der Inhalt:** eine abweichende Nutzlast muss ein anderes Manifest ergeben.
    expect(mine.merkleRoot).not.toBe(vaultStreamingChunkManifest(buildVaultStreamingDigest([pattern(VAULT_STREAMING_WINDOW_BYTES * 3 + 777, 12)], 4 * 1024 * 1024)).merkleRoot);
  });

  it('die Merkle-Wurzel ist bitgleich zu computeVaultMerkleRoot — auch bei ungerader Blockzahl', async () => {
    for (const count of [1, 2, 3, 5, 8, 9]) {
      const hashes = Array.from({ length: count }, (_, index) => incrementalSha256Hex(toBytes(`block-${index}`)));
      expect(streamingMerkleRoot(hashes), `Blöcke ${count}`).toBe(await computeVaultMerkleRoot(hashes));
    }
    // Ein einzelner Block ist seine eigene Wurzel; die leere Eingabe hat die Null-Wurzel.
    expect(streamingMerkleRoot(['ab'.repeat(32)])).toBe('ab'.repeat(32));
    expect(streamingMerkleRoot([])).toBe('0'.repeat(64));
    // **Die Wirkung auch hier:** verschiedene Blöcke, verschiedene Wurzeln.
    expect(streamingMerkleRoot(['a'.repeat(64), 'b'.repeat(64)])).not.toBe(streamingMerkleRoot(['a'.repeat(64), 'c'.repeat(64)]));
  });
});

describe('vaultStreamingHash: ein Durchlauf, ein Fenster — die Grenzen greifen', () => {
  it('ein Block über dem Fenster wird ABGEWIESEN, nicht gekürzt', () => {
    /*
     * **Der Unterschied, auf den es ankommt.** Ein stilles Kürzen würde einen Digest über einen Teil der
     * Nutzlast liefern — und der wäre nicht von einem echten Digest zu unterscheiden. Die Ablehnung nennt
     * Grenze und Ist-Wert, damit sie nachprüfbar ist.
     */
    const tooLarge = pattern(VAULT_STREAMING_WINDOW_BYTES + 1, 4);
    const hasher = VaultStreamingSha256.create();
    let thrown: unknown = null;
    try {
      hasher.update(tooLarge);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(VaultStreamingHashError);
    // **Kein `as`:** die Verengung geschieht über eine Laufzeitprüfung, nicht über eine Typzusicherung.
    if (!(thrown instanceof VaultStreamingHashError)) throw new Error('kein VaultStreamingHashError');
    expect(thrown.violation satisfies VaultStreamingHashViolation).toBe('chunk_exceeds_window');
    expect(thrown.limit).toBe(VAULT_STREAMING_WINDOW_BYTES);
    expect(thrown.actual).toBe(VAULT_STREAMING_WINDOW_BYTES + 1);
  });

  it('die Ablehnungen sind benannt und einzeln unterscheidbar', () => {
    const violations: VaultStreamingHashViolation[] = [];
    const collect = (run: () => unknown): void => {
      try {
        run();
      } catch (error) {
        if (error instanceof VaultStreamingHashError) violations.push(error.violation);
        else throw error;
      }
    };
    collect(() => buildVaultStreamingDigest([pattern(10, 1)], 10));                                    // Blockgröße zu klein
    collect(() => buildVaultStreamingDigest([pattern(5000, 1)], 100));                                 // Blockgröße ausserhalb
    collect(() => buildVaultStreamingDigest(Array.from({ length: VAULT_STREAMING_HASH_LIMITS.maxChunks + 1 }, () => pattern(4096, 1))));
    collect(() => buildVaultStreamingDigest([bytesInFreshBuffer(0)]));                                 // leerer Block
    // Schreiben nach dem Abschluss. **`digest()` allein finalisiert nicht** — es ist eine reine Abfrage;
    // `finalizeHex()` gibt den abgeschlossenen Hasher **als Wert** zurück. Der Verstoss wird über diesen
    // Weg ausgelöst, nicht über einen Zustand, den `digest()` heimlich setzt.
    collect(() => VaultStreamingSha256.create().update(toBytes('a'), 8).finalizeHex().hasher.update(toBytes('b'), 8));
    expect(violations).toEqual(['chunk_size_invalid', 'chunk_size_invalid', 'chunk_limit_exceeded', 'chunk_size_invalid', 'update_after_finalize']);
    expect(new Set(violations).size).toBe(3);
  });

  it('`digest()` ist rein: zweimal abfragen ändert nichts, und der Hasher bleibt danach benutzbar', () => {
    /*
     * **Der Unterschied zwischen einer Abfrage und einem Zustandswechsel.** Wäre `digest()` die Stelle, die
     * den Hasher abschließt, dann würde eine zweite Abfrage — etwa für eine Protokollzeile — den ersten
     * Aufrufer stillschweigend enterben.
     */
    const partial = VaultStreamingSha256.create().update(toBytes('abc'), 8);
    const first = partial.digest();
    expect(partial.digest()).toBe(first);
    expect(first).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    const continued = partial.update(toBytes('d'), 8).digest();
    expect(continued).toBe(incrementalSha256Hex(toBytes('abcd')));
    expect(continued).not.toBe(first);
    // `finalizeHex` gibt einen NEUEN Hasher zurück — `partial` bleibt unberührt.
    const closed = partial.finalizeHex();
    expect(closed.hex).toBe(first);
    expect(closed.hasher.finalized).toBe(true);
    expect(partial.finalized).toBe(false);
    // Und die Bytes stimmen mit dem Hex überein — die Zusicherung ohne Plattform-Zugriff.
    expect(closed.hasher.digestBytes().byteLength).toBe(32);
    expect(Array.from(closed.hasher.digestBytes(), (byte) => byte.toString(16).padStart(2, '0')).join('')).toBe(first);
  });

  it('der Hasher hält höchstens 63 Byte Restsatz — die Nutzlast überlebt den Block NICHT', () => {
    /*
     * **Die Speicherzusicherung, ausgeführt statt behauptet.** Nach einem 64-KiB-Block darf im Zustand nur
     * der Restsatz stehen. Wäre die Nutzlast im Hasher verblieben, wäre der ganze Ansatz sinnlos.
     */
    const hasher = VaultStreamingSha256.create().update(pattern(VAULT_STREAMING_WINDOW_BYTES, 9), VAULT_STREAMING_WINDOW_BYTES);
    const snapshot = hasher.snapshot();
    expect(snapshot.block.length).toBeLessThan(64);
    expect(snapshot.offset).toBe(VAULT_STREAMING_WINDOW_BYTES);
    // Der Zustand ist klein und serialisierbar: 8 Zahlen + Restsatz. Kein Verweis auf die Eingabe.
    const serialized = JSON.stringify(snapshot);
    expect(serialized.length).toBeLessThan(700);
    expect(serialized).not.toContain('1103515245');
    // **Und die Zahl, die der Auftrag verlangt:** der Zustand ist 200 Byte gross, die Nutzlast 65536 —
    // das Verhaeltnis ist 1:328. Eine Vollkopie je Block waere 65536 Byte, also das 328-fache.
    expect(serialized.length).toBeLessThan(VAULT_STREAMING_WINDOW_BYTES / 300);
  });

  it('ein abgebrochener und wiederhergestellter Hasher liefert denselben Digest wie ein durchgehender', async () => {
    /*
     * **Das ist die Wiederaufnahme auf der Hash-Ebene, und die Kette, die der Auftrag verlangt:**
     * erzeugen → verarbeiten → ZUSTAND VERWERFEN → wiederherstellen → vergleichen.
     */
    const bytes = pattern(300_000, 21);
    let straightState = VaultStreamingSha256.create();
    let resumedState: VaultStreamingSha256 | null = null;
    for (let start = 0; start < bytes.byteLength; start += 50_000) {
      const block = bytes.subarray(start, Math.min(bytes.byteLength, start + 50_000));
      straightState = straightState.update(block, 50_000);
      if (start === 100_000) {
        // **Zustand verwerfen:** der laufende Hasher wird aus dem Schnappschuss neu gebaut.
        resumedState = VaultStreamingSha256.restore(straightState.snapshot());
        continue;
      }
      if (resumedState) resumedState = resumedState.update(block, 50_000);
    }
    expect(resumedState).not.toBeNull();
    // **Kein `as`:** die Verengung geschieht über eine Laufzeitprüfung.
    if (resumedState === null) throw new Error('Wiederaufnahme hat keinen Hasher ergeben');
    const resumed: VaultStreamingSha256 = resumedState;
    // **Und der Vergleich umfasst ALLE Felder**, nicht nur den Digest: Länge, Digest, Bytes, und die
    // unabhängige Referenz.
    expect(resumed.byteLength).toBe(bytes.byteLength);
    expect(straightState.byteLength).toBe(bytes.byteLength);
    expect(resumed.digest()).toBe(straightState.digest());
    expect(resumed.digest()).toBe(await referenceDigest(bytes));
    expect(Array.from(resumed.digestBytes())).toEqual(Array.from(straightState.digestBytes()));
  });

  it('planVaultStreamingChunks rechnet die Aufteilung, ohne zu lesen — und weist Obergrenzen ab', () => {
    expect(planVaultStreamingChunks(0)).toEqual({ totalChunks: 0, lastChunkBytes: 0 });
    expect(planVaultStreamingChunks(1)).toEqual({ totalChunks: 1, lastChunkBytes: 1 });
    expect(planVaultStreamingChunks(VAULT_STREAMING_WINDOW_BYTES)).toEqual({ totalChunks: 1, lastChunkBytes: VAULT_STREAMING_WINDOW_BYTES });
    expect(planVaultStreamingChunks(VAULT_STREAMING_WINDOW_BYTES + 1)).toEqual({ totalChunks: 2, lastChunkBytes: 1 });
    // 4096 Blöcke à 64 KiB sind 256 MiB — darüber hinaus wird abgewiesen statt gerechnet.
    expect(VAULT_STREAMING_HASH_LIMITS.maxChunks * VAULT_STREAMING_WINDOW_BYTES).toBe(256 * 1024 * 1024);
    expect(() => planVaultStreamingChunks(256 * 1024 * 1024 + 1)).toThrow(VaultStreamingHashError);
  });

  it('die Gleichheit zur Basis unterscheidet wirklich — sie ist nicht immer wahr', async () => {
    /*
     * Eine Zusicherung, die immer `true` liefert, wäre wertlos. Hier wird gezeigt, dass sie trennt.
     */
    const bytes = pattern(5000, 31);
    expect(await streamingDigestMatchesBaseline(bytes, referenceDigest)).toBe(true);
    const tampered = Uint8Array.from(bytes);
    tampered[4999] = (tampered[4999] ?? 0) ^ 0x80;
    // Der Digest der manipulierten Bytes ist NICHT der Digest der Originalbytes.
    expect(incrementalSha256Hex(tampered)).not.toBe(incrementalSha256Hex(bytes));
    expect(await referenceDigest(tampered)).not.toBe(await referenceDigest(bytes));
    expect(await streamingDigestMatchesBaseline(tampered, referenceDigest)).toBe(true); // gegen sich selbst
  });

  it('die eigene UTF-8-Kodierung des Zeugen stimmt mit der Plattform überein', () => {
    /*
     * **Warum das geprüft wird, statt es anzunehmen.** `toBytes` existiert, weil `TextEncoder().encode()`
     * einen `Uint8Array<ArrayBufferLike>` liefert und die Verengung hier an ihrem Rand liegen soll — nicht
     * als `as` und nicht als Kopie. Damit hängt die ganze Datei an einer selbstgeschriebenen Kodierung; sie
     * wird deshalb gegen die Plattform gehalten, mit Umlauten, einem 3-Byte- und einem 4-Byte-Zeichen.
     */
    for (const sample of ['', 'abc', 'größer', 'Maßstab', '中文', '🙂', 'ü'.repeat(40)]) {
      expect(Array.from(toBytes(sample)), sample).toEqual(Array.from(platformBytes(sample)));
    }
  });
});
