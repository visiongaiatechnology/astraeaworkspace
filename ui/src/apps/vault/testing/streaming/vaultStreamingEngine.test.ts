// STATUS: PLATIN — die Zustandsmaschine: Fortschritt, Abbruch, Fehler, Wiederaufnahme.
//
// **Die Regel, die diesen Zeugen formt.** „Eine Rundlauf-Prüfung, die nur den Serialisierer prüft, ist
// wertlos" — belegt bei AST-0478, wo genau das der Grund war, dass der Defekt durchging. Und: „ein Test,
// der Anwesenheit prüft, ist wertlos" — belegt mit Zahlen, wo vier Anwesenheits- und zwei
// Wirkungs-Zusicherungen bei der Mutation „Element behalten, Wirkung entfernt" mit **allen vier**
// Anwesenheits-Zusicherungen grün blieben.
//
// Dieser Zeuge prüft deshalb **die Kette**: erzeugen → verarbeiten → **Zustand verwerfen** →
// wiederherstellen → vergleichen. Und der Vergleich umfasst **alle Felder**, nicht nur den Digest.
//
// **Und er führt den Import wirklich aus.** Die Engine ist keine Attrappe und der Zeuge behandelt sie nicht
// wie eine: es gibt eine echte Quelle (`readChunk` liefert Bytes aus einem Feld), eine echte Senke
// (`write` sammelt die Bytes), und am Ende wird geprüft, dass die **tatsächlich geschriebenen** Bytes die
// sind, deren Digest im Manifest steht. Ein Import, der Blöcke zählt, ohne sie zu verarbeiten, fällt hier
// durch — weil die geschriebenen Bytes fehlen würden.
//
// **Kein `jsdom`, kein `happy-dom`, kein `@testing-library`.** Die Engine ist reine Logik mit injizierten
// Ports und wird ausgeführt, nicht gerendert. Die Bedienung des Panels bleibt `NOT_TESTED`.
import { describe, expect, it } from 'vitest';
import type { VaultChunkIntegrityManifest } from '../../../../shared/contracts/workspace';
import {
  assertVaultStreamingWritable,
  deserializeVaultStreamingState,
  IDLE_VAULT_STREAMING_STATE,
  resolveVaultStreamingResume,
  runVaultStreamingImport,
  serializeVaultStreamingState,
  vaultStreamingChunkRange,
  vaultStreamingFlowTransition,
  vaultStreamingPlan,
  VaultStreamingError,
  verifyVaultStreamingCheckpoint,
  verifyVaultStreamingIntegrity,
  type VaultStreamingCheckpoint,
  type VaultStreamingFlowEvent,
  type VaultStreamingImportState,
  type VaultStreamingSink,
  type VaultStreamingSource,
} from '../../../../shared/vault/streaming/vaultStreamingEngine';
import { incrementalSha256Hex, streamingMerkleRoot, VAULT_STREAMING_WINDOW_BYTES, vaultStreamingChunkManifest } from '../../../../shared/vault/streaming/vaultStreamingHash';
import { buildVaultChunkIntegrity } from '../../../../shared/vault/integrity/vaultIntegrity';

const CHUNK = 4096;
const HEX_64 = /^[0-9a-f]{64}$/u;

/** Deterministische Nutzlast ohne Zufall — derselbe Lauf liefert dieselben Bytes. */
const payload = (length: number, seed = 13): Uint8Array => {
  const bytes = new Uint8Array(length);
  let value = seed;
  for (let index = 0; index < length; index += 1) {
    value = (value * 1103515245 + 12345) >>> 0;
    bytes[index] = (value >>> 16) & 0xff;
  }
  return bytes;
};

/** Eine **echte** Quelle. `readChunk` schneidet wirklich aus den Bytes. */
const sourceOf = (bytes: Uint8Array, readCounter?: { count: number }): VaultStreamingSource => ({
  sizeBytes: bytes.byteLength,
  readChunk: (offset, length) => {
    if (readCounter) readCounter.count += 1;
    return Promise.resolve(bytes.slice(offset, Math.min(bytes.byteLength, offset + length)));
  },
});

/** Eine **echte** Senke. `write` sammelt die Bytes — der Zeuge kann sie danach prüfen. */
interface CollectingSink extends VaultStreamingSink {
  readonly written: Uint8Array[];
  readonly events: string[];
  readonly committed: { value: boolean };
  readonly abortedWith: { value: string | null };
  /** Wenn gesetzt, bestätigt die Senke einen **falschen** Index — der Fehlerpfad. */
  misreportIndex?: number;
}

const sinkOf = (): CollectingSink => {
  const written: Uint8Array[] = [];
  const events: string[] = [];
  const committed = { value: false };
  const abortedWith: { value: string | null } = { value: null };
  const sink: CollectingSink = {
    written,
    events,
    committed,
    abortedWith,
    begin: (totalBytes) => {
      events.push(`begin:${totalBytes}`);
      return Promise.resolve();
    },
    write: (chunk, index) => {
      written.push(Uint8Array.from(chunk));
      events.push(`write:${index}`);
      return Promise.resolve(sink.misreportIndex === undefined ? index : sink.misreportIndex);
    },
    commit: () => {
      committed.value = true;
      events.push('commit');
      return Promise.resolve();
    },
    abort: (reason) => {
      abortedWith.value = reason;
      events.push(`abort:${reason}`);
      return Promise.resolve();
    },
  };
  return sink;
};

const concat = (parts: readonly Uint8Array[]): Uint8Array => {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
};

/** Treibt die Zustandsmaschine durch eine Ereignisfolge — ohne eine einzige Zusicherung dazwischen. */
const drive = (events: readonly VaultStreamingFlowEvent[]): VaultStreamingImportState =>
  events.reduce<VaultStreamingImportState>((state, event) => vaultStreamingFlowTransition(state, event), IDLE_VAULT_STREAMING_STATE);

describe('vaultStreamingEngine: die Schreibfreigabe — drei Gründe, nicht einer', () => {
  it('gesperrt, schreibgeschützt und ohne Berechtigung sind UNTERSCHEIDBAR, und alle drei lehnen ab', () => {
    /*
     * **Der Unterschied, auf den es ankommt.** „Gesperrt" verlangt ein Entsperren, „schreibgeschützt" eine
     * andere Ablage, „keine Berechtigung" eine andere Rolle. Ein Sammeltext hätte dem Nutzer die falsche
     * Handlung nahegelegt — dieselbe Fehlerklasse, die `calculateVaultFileBytes` in `vaultIntegrity.ts`
     * schon einmal behoben hat („der Grund muss stimmen, nicht nur die Ablehnung").
     */
    const locked = assertVaultStreamingWritable({ locked: true, readOnly: true, canWrite: true });
    const readOnly = assertVaultStreamingWritable({ locked: false, readOnly: true, canWrite: true });
    const denied = assertVaultStreamingWritable({ locked: false, readOnly: false, canWrite: false });
    const allowed = assertVaultStreamingWritable({ locked: false, readOnly: false, canWrite: true });

    expect(locked.allowed).toBe(false);
    expect(readOnly.allowed).toBe(false);
    expect(denied.allowed).toBe(false);
    expect(allowed.allowed).toBe(true);

    // **Die Wirkung:** drei verschiedene Gründe, drei verschiedene Texte — und kein Text ist leer.
    const reasons = [locked.reason, readOnly.reason, denied.reason];
    expect(reasons).toEqual(['vault_locked', 'vault_read_only', 'vault_permission_denied']);
    expect(new Set(reasons).size).toBe(3);
    const messages = [locked.message, readOnly.message, denied.message];
    expect(new Set(messages).size).toBe(3);
    for (const message of messages) expect(message.length).toBeGreaterThan(20);
    expect(allowed.reason).toBeNull();

    // **Fail-closed:** die Reihenfolge ist „entsperren → Ablage → Rolle". Ein gesperrter Tresor meldet
    // NIEMALS „keine Berechtigung", auch wenn beides zutrifft.
    expect(locked.reason).not.toBe('vault_permission_denied');
  });

  it('jeder Ablehnungstext sagt, dass NICHTS geschrieben wurde — und nennt keinen Pfad', () => {
    /*
     * Eine Ablehnung, die den Nutzer im Unklaren lässt, ob ein Teilimport stattgefunden hat, ist teuer.
     * Und ein Text, der einen Pfad oder Dateinamen nennt, leakt die Struktur des Tresors in jedes Protokoll.
     */
    for (const facts of [{ locked: true, readOnly: false, canWrite: true }, { locked: false, readOnly: true, canWrite: true }, { locked: false, readOnly: false, canWrite: false }]) {
      const verdict = assertVaultStreamingWritable(facts);
      expect(verdict.message).toContain('nothing was written');
      // Kein Pfadtrenner, keine Dateiendung, kein Laufwerksbuchstabe.
      expect(verdict.message).not.toMatch(/[\\/]|\.tsx?\b|[A-Z]:/u);
    }
  });
});

describe('vaultStreamingEngine: die Reihenfolge ist bindend — jeder Verstoß hat seinen eigenen Grund', () => {
  it('Fortschritt ohne begonnenen Lauf, Block nach dem Abschluss, Scheitern nach dem Abschluss', () => {
    /*
     * Ein Übergang, der ohne begonnenen Lauf **nichts tut**, würde einen Verdrahtungsfehler verdecken. Jeder
     * dieser Fälle ist deshalb ein eigener, benannter Grund.
     */
    const idleProgress = vaultStreamingFlowTransition(IDLE_VAULT_STREAMING_STATE, { type: 'stream.progress', chunkIndex: 0, chunkBytes: 100 });
    expect(idleProgress.status).toBe('failed');
    expect(idleProgress.failureReason).toBe('chunk_gap');

    const idleChunk = vaultStreamingFlowTransition(IDLE_VAULT_STREAMING_STATE, { type: 'stream.chunk', chunkIndex: 0, hash: 'a'.repeat(64) });
    expect(idleChunk.failureReason).toBe('chunk_after_done');

    /*
     * **EIN Block, EIN Block — und ein gemessener Zeugenfehler.** Meine erste Fassung setzte hier
     * `totalChunks: 2` und schickte nur **einen** Block. Die Prüfung wies das mit `verify_not_ready` ab, und
     * zwar **zu Recht**: `stream.verify` lässt sich nicht über einem halben Bestand ausführen — eine Wurzel
     * über einen Block, die zwei behauptet, wäre eine falsche Aussage über den Bestand. Der Zeuge war falsch,
     * nicht die Engine.
     */
    const begun = drive([{ type: 'stream.begin', totalChunks: 1, totalBytes: CHUNK, chunkSize: CHUNK }]);
    expect(begun.status).toBe('streaming');
    const afterBegin = vaultStreamingFlowTransition(begun, { type: 'stream.progress', chunkIndex: 0, chunkBytes: CHUNK });
    const withChunk = vaultStreamingFlowTransition(afterBegin, { type: 'stream.chunk', chunkIndex: 0, hash: 'b'.repeat(64) });
    /*
     * `stream.verify` über einem einzelnen Block: `merkleRoot` MUSS der eigene Digest sein — die Prüfung
     * prüft sich selbst mit.
     */
    const verified = vaultStreamingFlowTransition(withChunk, { type: 'stream.verify', merkleRoot: 'b'.repeat(64), contentDigest: 'c'.repeat(64) });
    expect(verified.status).toBe('verifying');
    const done = vaultStreamingFlowTransition(verified, { type: 'stream.done' });
    expect(done.status).toBe('done');
    expect(done.contentDigest).toBe('c'.repeat(64));

    // Nach dem Abschluss: fünf verschiedene Verstöße, fünf verschiedene Gründe.
    expect(vaultStreamingFlowTransition(done, { type: 'stream.chunk', chunkIndex: 1, hash: 'd'.repeat(64) }).failureReason).toBe('chunk_after_done');
    expect(vaultStreamingFlowTransition(done, { type: 'stream.fail', reason: 'source_unavailable' }).failureReason).toBe('failure_after_done');
    expect(vaultStreamingFlowTransition(done, { type: 'stream.cancel' }).failureReason).toBe('cancel_after_done');
    expect(vaultStreamingFlowTransition(done, { type: 'stream.resume', checkpoint: { totalChunks: 1, totalBytes: CHUNK, chunkSize: CHUNK, completedChunks: 1, processedBytes: CHUNK, lastChunkHash: 'b'.repeat(64), chunkHashes: ['b'.repeat(64)] } }).failureReason).toBe('resume_after_done');
    expect(vaultStreamingFlowTransition(done, { type: 'stream.begin', totalChunks: 1, totalBytes: CHUNK, chunkSize: CHUNK }).failureReason).toBe('begin_gap');
  });

  it('ein SPRUNG im Fortschritt, ein Fortschritt ohne Bytes und ein falscher Blockindex sind eigene Gründe', () => {
    const begun = drive([{ type: 'stream.begin', totalChunks: 4, totalBytes: CHUNK * 4, chunkSize: CHUNK }]);
    // Index 2 statt 0 — ein Loch in der Summe wäre ein Fortschritt, der mehr behauptet, als geschrieben wurde.
    expect(vaultStreamingFlowTransition(begun, { type: 'stream.progress', chunkIndex: 2, chunkBytes: CHUNK }).failureReason).toBe('chunk_gap');
    // Mehr Bytes als die Gesamtgröße.
    expect(vaultStreamingFlowTransition(begun, { type: 'stream.progress', chunkIndex: 0, chunkBytes: CHUNK * 5 }).failureReason).toBe('chunk_gap');
    // Ein Fortschritt **ohne Bytes** ist keiner.
    expect(vaultStreamingFlowTransition(begun, { type: 'stream.progress', chunkIndex: 0, chunkBytes: 0 }).failureReason).toBe('chunk_gap');
    /*
     * **Gemessene Korrektur eines Zeugenfehlers.** Hier stand zuerst:
     *     expect(vaultStreamingFlowTransition(begun, { type: 'stream.chunk', chunkIndex: 0, hash: 'a'.repeat(64) }).failureReason).toBe('chunk_mismatch');
     * Der Übergang war **nicht** rot, und das ist richtig: `chunkHashes.length === 0` und `chunkIndex === 0`
     * passen zusammen. Ein Block **vor** seinem Fortschritt ist im Zustandsmodell zulässig — die Summe wird
     * aus den Blöcken gebildet, nicht aus der Reihenfolge zweier Ereignisse. Was **wirklich** ein Widerspruch
     * ist, ist ein Block mit einem Index, der nicht der nächste ist:
     */
    const progressed = vaultStreamingFlowTransition(begun, { type: 'stream.progress', chunkIndex: 0, chunkBytes: CHUNK });
    expect(vaultStreamingFlowTransition(progressed, { type: 'stream.chunk', chunkIndex: 3, hash: 'a'.repeat(64) }).failureReason).toBe('chunk_mismatch');
    // **Ein Digest, der kein Digest ist, wird abgewiesen** — nicht gespeichert.
    expect(vaultStreamingFlowTransition(progressed, { type: 'stream.chunk', chunkIndex: 0, hash: 'zu-kurz' }).failureReason).toBe('chunk_mismatch');
    expect(vaultStreamingFlowTransition(progressed, { type: 'stream.chunk', chunkIndex: 0, hash: 'A'.repeat(64) }).failureReason).toBe('chunk_mismatch');
  });

  it('`stream.verify` prüft die übergebene Wurzel gegen die EIGENEN Blöcke', () => {
    /*
     * **Eine übergebene Wurzel, die nicht zu den eigenen Blöcken gehört, ist ein Widerspruch.** Sie zu
     * übernehmen hieße, eine fremde Aussage über den eigenen Bestand zu speichern.
     */
    const state = drive([
      { type: 'stream.begin', totalChunks: 1, totalBytes: CHUNK, chunkSize: CHUNK },
      { type: 'stream.progress', chunkIndex: 0, chunkBytes: CHUNK },
      { type: 'stream.chunk', chunkIndex: 0, hash: 'e'.repeat(64) },
    ]);
    const wrongRoot = vaultStreamingFlowTransition(state, { type: 'stream.verify', merkleRoot: 'f'.repeat(64), contentDigest: 'a'.repeat(64) });
    expect(wrongRoot.status).toBe('failed');
    expect(wrongRoot.failureReason).toBe('tamper_detected');
    // Die richtige Wurzel eines einzelnen Blocks ist der Block selbst.
    const rightRoot = vaultStreamingFlowTransition(state, { type: 'stream.verify', merkleRoot: 'e'.repeat(64), contentDigest: 'a'.repeat(64) });
    expect(rightRoot.status).toBe('verifying');
  });
});

describe('vaultStreamingEngine: der Import wird WIRKLICH ausgeführt', () => {
  it('lesen → verarbeiten → schreiben → Digest: die geschriebenen Bytes sind die, deren Digest im Manifest steht', async () => {
    /*
     * **Das ist die Zusicherung gegen die Attrappe.** Ein Import, der Blöcke zählt, ohne sie zu verarbeiten,
     * würde hier durchfallen: die Senke bliebe leer oder enthielte andere Bytes. Geprüft wird gegen die
     * **unabhängige** Fassung `buildVaultChunkIntegrity` aus `vaultIntegrity.ts`.
     */
    const bytes = payload(CHUNK * 3 + 777, 41);
    const source = sourceOf(bytes);
    const sink = sinkOf();
    const controller = new AbortController();
    const progress: number[] = [];

    const { state, outcome } = await runVaultStreamingImport(source, sink, controller.signal, CHUNK, {
      onProgress: (event) => progress.push(event.percent),
    });

    expect(state.status).toBe('done');
    expect(outcome.status).toBe('done');
    expect(outcome.failureReason).toBeNull();
    expect(outcome.manifest).not.toBeNull();
    expect(outcome.totalChunks).toBe(4);
    expect(outcome.totalBytes).toBe(bytes.byteLength);

    // **Die Senke hat genau diese Bytes bekommen** — und zwar vollständig, in Reihenfolge.
    expect(sink.written.length).toBe(4);
    const writtenBytes = concat(sink.written);
    expect(writtenBytes.byteLength).toBe(bytes.byteLength);
    expect(Array.from(writtenBytes)).toEqual(Array.from(bytes));
    expect(sink.committed.value).toBe(true);
    expect(sink.abortedWith.value).toBeNull();
    // **Und die Reihenfolge der Senken-Aufrufe beweist, dass geschrieben wurde, bevor abgeschlossen wurde.**
    expect(sink.events[0]).toBe(`begin:${bytes.byteLength}`);
    expect(sink.events[1]).toBe('write:0');
    expect(sink.events[sink.events.length - 1]).toBe('commit');

    // **Der Digest über die GESCHRIEBENEN Bytes** — nicht über eine behauptete Zahl.
    const writtenBaseline = await buildVaultChunkIntegrity(writtenBytes, CHUNK);
    expect(outcome.manifest?.merkleRoot).toBe(writtenBaseline.merkleRoot);
    expect(outcome.manifest?.totalChunks).toBe(writtenBaseline.totalChunks);
    expect(outcome.contentDigest).toBe(incrementalSha256Hex(bytes));
    expect(outcome.contentDigest).toMatch(HEX_64);
    if (outcome.manifest === null) throw new Error('kein Manifest');
    expect(vaultStreamingChunkManifest({ contentDigest: outcome.contentDigest, chunkSize: CHUNK, totalChunks: outcome.totalChunks, chunkHashes: outcome.manifest.chunks.map((chunk) => chunk.hash), merkleRoot: outcome.merkleRoot })).toEqual(outcome.manifest);

    // **Der Fortschritt endet bei 100 und ist monoton** — kein Sprung, kein Rückschritt.
    expect(progress[progress.length - 1]).toBe(100);
    for (let index = 1; index < progress.length; index += 1) expect(progress[index] ?? 0).toBeGreaterThanOrEqual(progress[index - 1] ?? 0);
  });

  it('ein Block, der im Bestand fehlt oder abweicht, wird BENANNT erkannt', async () => {
    const bytes = payload(CHUNK * 2, 43);
    const sink = sinkOf();
    const { outcome } = await runVaultStreamingImport(sourceOf(bytes), sink, new AbortController().signal, CHUNK);
    if (outcome.manifest === null) throw new Error('kein Manifest');

    // **Manipulation eines einzigen Bytes** — dieselbe Länge, andere Nutzlast.
    const tampered = Uint8Array.from(bytes);
    tampered[5000] = (tampered[5000] ?? 0) ^ 0x01;
    expect(incrementalSha256Hex(tampered)).not.toBe(outcome.contentDigest);

    // **Die Rollen sind getrennt: `expected` ist das Gespeicherte, `computed` das aus den Bytes Gebildete.**
    const stored = outcome.manifest;
    const computedClean = { contentDigest: outcome.contentDigest, digestAlgorithm: 'SHA-256', computed: stored };
    const clean = verifyVaultStreamingIntegrity(computedClean, stored, outcome.contentDigest);
    expect(clean.integrity).toBe('verified');
    expect(clean.reason).toBe('match');
    expect(clean.chunksCompared).toBe(2);
    expect(clean.firstMismatchIndex).toBe(-1);

    // **Der Bestand hat sich geändert, das Gespeicherte nicht** — das ist der echte Manipulationsfall und
    // die Prüfung MUSS ihn sehen. Genau das konnte mein erster, zirkulärer Entwurf nicht.
    const computedTampered = { contentDigest: incrementalSha256Hex(tampered), digestAlgorithm: 'SHA-256', computed: await buildVaultChunkIntegrity(tampered, CHUNK) };
    const mismatch = verifyVaultStreamingIntegrity(computedTampered, stored, outcome.contentDigest);
    expect(mismatch.integrity).toBe('mismatch');
    expect(mismatch.reason).toBe('chunk_hash_mismatch');
    expect(mismatch.firstMismatchIndex).toBe(1);
    expect(mismatch.chunksCompared).toBe(2);

    // Und der Fall „Gespeichertes wurde verfälscht, Bytes sind echt" ist der zweite Weg in denselben Befund.
    const storedTampered = { ...stored, chunks: stored.chunks.map((chunk, index) => index === 1 ? { index, hash: 'a'.repeat(64) } : chunk) };
    const storedMismatch = verifyVaultStreamingIntegrity({ ...computedClean, computed: stored }, storedTampered, outcome.contentDigest);
    expect(storedMismatch.integrity).toBe('mismatch');
    // Die Wurzel im verfälschten Gespeicherten passt nicht mehr zu seinen eigenen Blöcken — das wird VOR
    // jedem Blockvergleich gemeldet.
    expect(storedMismatch.reason).toBe('merkle_root_mismatch');
  });

  it('die Quelle wird WIRKLICH gelesen — die Zahl der Lesevorgänge stimmt mit der Blockzahl überein', async () => {
    /*
     * **Eine Wirkungs-Zusicherung gegen „Blöcke zählen ohne sie zu verarbeiten".** Wenn die Engine die Bytes
     * nie anforderte, wäre der Zähler 0 — und die geschriebenen Bytes gäbe es nicht.
     */
    const bytes = payload(CHUNK * 5 + 1, 47);
    const counter = { count: 0 };
    const sink = sinkOf();
    const { outcome } = await runVaultStreamingImport(sourceOf(bytes, counter), sink, new AbortController().signal, CHUNK);
    expect(outcome.totalChunks).toBe(6);
    expect(counter.count).toBe(6);
    expect(sink.written.length).toBe(6);
    expect(sink.written[5]?.byteLength).toBe(1);
    expect(concat(sink.written).byteLength).toBe(bytes.byteLength);
  });
});

describe('vaultStreamingEngine: Abbruch und Fehler — benannte Gründe, keine Nutzlast in der Meldung', () => {
  it('ein gesetztes Abbruchsignal beendet den Lauf und VERWIRFT die Senke', async () => {
    const bytes = payload(CHUNK * 4, 51);
    const controller = new AbortController();
    controller.abort();
    const sink = sinkOf();
    const { state, outcome } = await runVaultStreamingImport(sourceOf(bytes), sink, controller.signal, CHUNK);
    expect(state.status).toBe('cancelled');
    expect(outcome.status).toBe('cancelled');
    expect(sink.written.length).toBe(0);
    expect(sink.committed.value).toBe(false);
    expect(sink.abortedWith.value).toBe('cancelled');
    // Ein Abbruch behält **keinen** Punkt: ein späterer Lauf darf nicht an einer abgebrochenen Stelle weiterlaufen.
    expect(outcome.checkpoint).toBeNull();
  });

  it('eine kurze Antwort der Quelle ist `source_short_read`, eine zu lange `source_grew` — nicht gekürzt', async () => {
    /*
     * **Der Unterschied, auf den es ankommt.** Ein stilles Auffüllen oder Kürzen würde einen Digest über
     * andere Bytes liefern — und der wäre von einem echten Digest nicht zu unterscheiden.
     */
    const bytes = payload(CHUNK * 2, 53);
    const shortSource: VaultStreamingSource = { sizeBytes: bytes.byteLength, readChunk: (offset, length) => Promise.resolve(bytes.slice(offset, offset + length - 1)) };
    const shortSink = sinkOf();
    const shortRun = await runVaultStreamingImport(shortSource, shortSink, new AbortController().signal, CHUNK);
    expect(shortRun.outcome.failureReason).toBe('source_short_read');
    expect(shortRun.state.status).toBe('failed');
    expect(shortSink.abortedWith.value).toBe('source_short_read');

    const longSource: VaultStreamingSource = { sizeBytes: bytes.byteLength, readChunk: (_offset, length) => Promise.resolve(payload(length + 1, 9)) };
    const longRun = await runVaultStreamingImport(longSource, sinkOf(), new AbortController().signal, CHUNK);
    expect(longRun.outcome.failureReason).toBe('source_grew');

    // Eine werfende Quelle ist `source_unavailable` — ein eigener Grund, nicht derselbe wie ein Kurzlesen.
    const throwingSource: VaultStreamingSource = { sizeBytes: bytes.byteLength, readChunk: () => Promise.reject(new Error('kaputt')) };
    const throwingRun = await runVaultStreamingImport(throwingSource, sinkOf(), new AbortController().signal, CHUNK);
    expect(throwingRun.outcome.failureReason).toBe('source_unavailable');
  });

  it('eine Senke, die einen FALSCHEN Index bestätigt, wird erkannt', async () => {
    /*
     * Eine Senke, die stillschweigend verwirft, wäre sonst erst an einem Manifest bemerkt worden, das zu
     * nichts gehört.
     */
    const bytes = payload(CHUNK * 2, 59);
    const sink = sinkOf();
    sink.misreportIndex = 99;
    const { outcome, state } = await runVaultStreamingImport(sourceOf(bytes), sink, new AbortController().signal, CHUNK);
    expect(outcome.failureReason).toBe('sink_rejected');
    expect(state.status).toBe('failed');
    expect(sink.committed.value).toBe(false);
    expect(sink.abortedWith.value).toBe('sink_rejected');
  });

  it('eine leere Quelle ist KEIN Import — sie wird abgewiesen, nicht als fertig gemeldet', async () => {
    const sink = sinkOf();
    const { outcome } = await runVaultStreamingImport(sourceOf(new Uint8Array(0)), sink, new AbortController().signal, CHUNK);
    expect(outcome.status).toBe('failed');
    expect(outcome.failureReason).toBe('begin_gap');
    expect(sink.written.length).toBe(0);
  });

  it('kein Fehlergrund trägt einen Pfad, einen Dateinamen oder eine Nutzlast', async () => {
    /*
     * **Beim Streaming besonders.** Ein Import, der im Fehlerfall den Pfad nennt, leakt die Struktur des
     * Tresors — und ein Fehler, der den Dateinamen nennt, leakt ihn in jede Protokollzeile.
     */
    const bytes = payload(CHUNK, 61);
    const scenarios: VaultStreamingFailureReasonProbe[] = [
      { source: { sizeBytes: bytes.byteLength, readChunk: () => Promise.reject(new Error('C:\\Tresor\\geheim.vgt')) } },
      { source: { sizeBytes: bytes.byteLength, readChunk: (offset, length) => Promise.resolve(bytes.slice(offset, offset + length - 1)) } },
      { source: { sizeBytes: bytes.byteLength, readChunk: (_offset, length) => Promise.resolve(payload(length + 1)) } },
    ];
    for (const scenario of scenarios) {
      const { outcome } = await runVaultStreamingImport(scenario.source, sinkOf(), new AbortController().signal, CHUNK);
      expect(outcome.failureReason).not.toBeNull();
      // Die Meldung ist ein benannter Code ohne Nutzlast.
      const error = new VaultStreamingError(outcome.failureReason ?? 'begin_gap', 7);
      expect(error.message).toMatch(/^vault_streaming_[a-z_]+$/u);
      expect(error.message).not.toMatch(/[\\/]|geheim|\.vgt|[A-Z]:/u);
    }
  });
});

interface VaultStreamingFailureReasonProbe {
  readonly source: VaultStreamingSource;
}

describe('vaultStreamingEngine: Wiederaufnahme — die Kette mit Zustandsverwerfung', () => {
  it('serialisieren → VERWERFEN → deserialisieren → ALLE Felder gleich', async () => {
    /*
     * **Die Kette, die der Auftrag verlangt, und der Vergleich über ALLE Felder.** Ein Vergleich nur über
     * den Digest ließe einen verlorenen Fortschritt, eine verlorene Blockzahl oder einen verlorenen
     * Wiederaufnahmepunkt durchgehen.
     */
    const bytes = payload(CHUNK * 3 + 123, 67);
    const first = await runVaultStreamingImport(sourceOf(bytes), sinkOf(), new AbortController().signal, CHUNK);
    expect(first.state.status).toBe('done');

    const serialized = serializeVaultStreamingState(first.state);
    // **Zustand verwerfen:** ab hier gibt es nur noch die Zeichenkette.
    const restored = deserializeVaultStreamingState(serialized);

    // ALLE Felder, einzeln.
    expect(restored.status).toBe(first.state.status);
    expect(restored.progress).toEqual(first.state.progress);
    expect(restored.chunkHashes).toEqual(first.state.chunkHashes);
    expect(restored.merkleRoot).toBe(first.state.merkleRoot);
    expect(restored.contentDigest).toBe(first.state.contentDigest);
    expect(restored.failureReason).toBe(first.state.failureReason);
    expect(restored.checkpoint).toEqual(first.state.checkpoint);
    // Und als Ganzes, und die Zeichenkette selbst ist stabil.
    expect(restored).toEqual(first.state);
    expect(serializeVaultStreamingState(restored)).toBe(serialized);
    // **Und die Blockzahl ist nicht null** — sonst wäre der Vergleich trivial erfüllt.
    expect(restored.chunkHashes.length).toBe(4);
    expect(restored.contentDigest).toMatch(HEX_64);
  });

  it('ein ABGELEHNTER Zustand wird nicht durchgelassen — die Vertrauensgrenze prüft jedes Feld', () => {
    /*
     * `deserializeVaultStreamingState` ist die Stelle, an der ein abgelegter Zustand wieder ins Programm
     * kommt — also eine Vertrauensgrenze. Ein `as` auf einen geladenen Wert wäre hier der Fehler. Sechs
     * Verfälschungen, sechs Ablehnungen.
     */
    const good = serializeVaultStreamingState({
      status: 'streaming',
      progress: { totalChunks: 2, totalBytes: 8192, chunkSize: CHUNK, completedChunks: 1, processedBytes: CHUNK },
      chunkHashes: ['a'.repeat(64)],
      merkleRoot: 'a'.repeat(64),
      contentDigest: null,
      failureReason: null,
      checkpoint: null,
    });
    expect(deserializeVaultStreamingState(good).progress.completedChunks).toBe(1);

    const corrupted = [
      good.replace('"streaming"', '"fast-fertig"'),
      good.replace('"chunkHashes":["', '"chunkHashes":["zu-kurz-'),
      good.replace('"totalChunks":2', '"totalChunks":-2'),
      good.replace('"totalChunks":2', '"totalChunks":2.5'),
      good.replace('"merkleRoot":"', '"merkleRoot":"nicht-hex-'),
      'kein json',
    ];
    for (const candidate of corrupted) {
      expect(() => deserializeVaultStreamingState(candidate), candidate.slice(0, 40)).toThrow(VaultStreamingError);
    }
  });

  it('der Wiederaufnahmepunkt trägt die ECHTEN Digests — nicht erfundene', async () => {
    /*
     * **Mein eigener Fehler, hier festgehalten.** Mein erster Entwurf setzte beim Fortsetzen
     * `resume-${index}` als Block-Digests ein. Die Merkle-Wurzel des fortgesetzten Laufs wäre damit ungleich
     * der eines durchgehenden Laufs gewesen — ein **stiller Datenverlust**. Diese Zusicherung hält fest,
     * dass der Punkt echte Digests trägt.
     */
    const bytes = payload(CHUNK * 3, 71);
    const controller = new AbortController();
    const sink = sinkOf();
    // Nach dem zweiten Block abbrechen: ein echter Teilzustand mit echtem Punkt.
    let seen = 0;
    const observing = {
      onProgress: () => {
        seen += 1;
        if (seen === 3) controller.abort();
      },
    };
    const partial = await runVaultStreamingImport(sourceOf(bytes), sink, controller.signal, CHUNK, observing);
    expect(partial.state.status).toBe('cancelled');
    // Ein Abbruch verwirft den Punkt — für den Fehlerfall gibt es den eigenen Weg:
    const failing: VaultStreamingSource = {
      sizeBytes: bytes.byteLength,
      readChunk: (offset, length) => offset >= CHUNK * 2 ? Promise.reject(new Error('weg')) : Promise.resolve(bytes.slice(offset, offset + length)),
    };
    const failed = await runVaultStreamingImport(failing, sinkOf(), new AbortController().signal, CHUNK);
    expect(failed.state.status).toBe('failed');
    expect(failed.outcome.failureReason).toBe('source_unavailable');
    const checkpoint = failed.outcome.checkpoint;
    expect(checkpoint).not.toBeNull();
    if (checkpoint === null) throw new Error('kein Punkt');
    expect(checkpoint.completedChunks).toBe(2);
    // **Jeder Digest im Punkt ist ein echter 64-Hex-Wert** — kein `resume-0`.
    expect(checkpoint.chunkHashes.length).toBe(2);
    for (const hash of checkpoint.chunkHashes) expect(hash).toMatch(HEX_64);
    expect(checkpoint.lastChunkHash).toBe(checkpoint.chunkHashes[1]);
    // Und die ersten beiden Digests sind die der ersten beiden echten Blöcke.
    expect(checkpoint.chunkHashes[0]).toBe(incrementalSha256Hex(bytes.slice(0, CHUNK)));
    expect(checkpoint.chunkHashes[1]).toBe(incrementalSha256Hex(bytes.slice(CHUNK, CHUNK * 2)));
  });

  it('eine Wiederaufnahme auf einer VERÄNDERTEN Quelle wird abgewiesen, nicht geglaubt', async () => {
    /*
     * Das ist der Zweck der Gegenprobe: eine andere Datei **gleicher Größe** hätte dieselbe Blockzahl und
     * für ihre eigenen Blöcke dieselbe Wurzel. Nur der Vergleich mit dem Punkt bemerkt es.
     */
    const bytes = payload(CHUNK * 3, 73);
    const checkpoint: VaultStreamingCheckpoint = {
      totalChunks: 3, totalBytes: bytes.byteLength, chunkSize: CHUNK,
      completedChunks: 2, processedBytes: CHUNK * 2,
      lastChunkHash: incrementalSha256Hex(bytes.slice(CHUNK, CHUNK * 2)),
      chunkHashes: [incrementalSha256Hex(bytes.slice(0, CHUNK)), incrementalSha256Hex(bytes.slice(CHUNK, CHUNK * 2))],
    };
    // Auf der echten Quelle bestätigt die Gegenprobe den Punkt.
    const good = await verifyVaultStreamingCheckpoint(sourceOf(bytes), checkpoint, CHUNK);
    expect(good.verified).toBe(true);
    expect(good.boundaryHash).toBe(checkpoint.lastChunkHash);
    expect(good.mismatchIndex).toBe(-1);

    // Verändert: dieselbe Länge, ein anderes Byte im zweiten Block.
    const altered = Uint8Array.from(bytes);
    altered[CHUNK + 10] = (altered[CHUNK + 10] ?? 0) ^ 0xff;
    const bad = await verifyVaultStreamingCheckpoint(sourceOf(altered), checkpoint, CHUNK);
    expect(bad.verified).toBe(false);
    expect(bad.mismatchIndex).toBe(1);

    // Und der Lauf setzt NICHT fort, sondern scheitert benannt.
    const run = await runVaultStreamingImport(sourceOf(altered), sinkOf(), new AbortController().signal, CHUNK, undefined, checkpoint);
    expect(run.outcome.failureReason).toBe('resume_replay_mismatch');
    expect(run.state.status).toBe('failed');
  });

  it('eine Wiederaufnahme auf der UNVERÄNDERTEN Quelle schreibt nur die fehlenden Blöcke — und ergibt dasselbe Ergebnis', async () => {
    /*
     * **Das ist die wichtigste Wirkungs-Zusicherung dieses Zeugen.** Der fortgesetzte Lauf muss
     *   • die Blöcke unter der Grenze NICHT erneut schreiben,
     *   • aber sehr wohl erneut lesen (die Gegenprobe und der Gesamt-Digest),
     *   • und in Digest, Wurzel und Manifest **identisch** zum durchgehenden Lauf enden.
     * Wäre die Wurzel über erfundene Digests gebildet worden, wäre der letzte Vergleich rot.
     *
     * **Die Zahl der Lesevorgänge ist 8, nicht 5 — und das ist die ehrliche Zahl.** Der fortgesetzte Lauf
     * liest die drei übernommenen Blöcke **zweimal** erneut: einmal in der Gegenprobe
     * (`verifyVaultStreamingCheckpoint`) und einmal, um den **inkrementellen** Gesamt-Digest zu bilden —
     * dessen Hasher braucht die Bytes, weil sein Zustand bewusst **nicht** im Punkt liegt. Dazu die zwei
     * neuen Blöcke. 3 + 3 + 2 = 8.
     */
    const bytes = payload(CHUNK * 4 + 55, 79);
    // Durchgehender Lauf als Referenz.
    const whole = await runVaultStreamingImport(sourceOf(bytes), sinkOf(), new AbortController().signal, CHUNK);
    expect(whole.outcome.status).toBe('done');

    const checkpoint: VaultStreamingCheckpoint = {
      totalChunks: whole.outcome.totalChunks, totalBytes: bytes.byteLength, chunkSize: CHUNK,
      completedChunks: 3, processedBytes: CHUNK * 3,
      lastChunkHash: incrementalSha256Hex(bytes.slice(CHUNK * 2, CHUNK * 3)),
      chunkHashes: [0, 1, 2].map((index) => incrementalSha256Hex(bytes.slice(index * CHUNK, (index + 1) * CHUNK))),
    };
    const counter = { count: 0 };
    const resumedSink = sinkOf();
    const resumed = await runVaultStreamingImport(sourceOf(bytes, counter), resumedSink, new AbortController().signal, CHUNK, undefined, checkpoint);

    expect(resumed.outcome.status).toBe('done');
    expect(resumed.outcome.totalChunks).toBe(whole.outcome.totalChunks);
    // **Nur die fehlenden Blöcke wurden geschrieben** — 5 Blöcke, 3 übernommen, 2 geschrieben.
    expect(whole.outcome.totalChunks).toBe(5);
    expect(resumedSink.written.length).toBe(2);
    expect(resumedSink.events.filter((event) => event.startsWith('write:'))).toEqual(['write:3', 'write:4']);
    // Gelesen wurde mehr: 3 (Gegenprobe) + 3 (Gesamt-Digest) + 2 (neue Blöcke) = 8.
    expect(counter.count).toBe(8);
    // **Und das Ergebnis ist identisch zum durchgehenden Lauf** — Digest, Wurzel, Blockzahl, jeder Block.
    expect(resumed.outcome.contentDigest).toBe(whole.outcome.contentDigest);
    expect(resumed.outcome.merkleRoot).toBe(whole.outcome.merkleRoot);
    expect(resumed.state.chunkHashes).toEqual(whole.state.chunkHashes);
    expect(resumed.outcome.manifest).toEqual(whole.outcome.manifest);
    // Und die geschriebenen Bytes der beiden Läufe sind zusammen die Nutzlast.
    expect(resumedSink.written[0]?.byteLength).toBe(CHUNK);
    expect(resumedSink.written[1]?.byteLength).toBe(55);
  });

  it('ein Punkt auf einer ANDEREN Grösse wird verworfen, nicht angewandt', () => {
    const bytes = payload(CHUNK * 3, 83);
    const checkpoint: VaultStreamingCheckpoint = {
      totalChunks: 9, totalBytes: CHUNK * 9, chunkSize: CHUNK,
      completedChunks: 2, processedBytes: CHUNK * 2,
      lastChunkHash: 'a'.repeat(64), chunkHashes: ['a'.repeat(64), 'a'.repeat(64)],
    };
    const resolution = resolveVaultStreamingResume(IDLE_VAULT_STREAMING_STATE, checkpoint, { sizeBytes: bytes.byteLength }, CHUNK);
    expect(resolution.resumed).toBe(false);
    expect(resolution.reason).toBe('checkpoint_invalidated');
    expect(resolution.state).toBe(IDLE_VAULT_STREAMING_STATE);

    // Ohne Punkt gibt es nichts wiederaufzunehmen — und `null` ist ein eigener Grund.
    expect(resolveVaultStreamingResume(IDLE_VAULT_STREAMING_STATE, null, { sizeBytes: bytes.byteLength }, CHUNK).reason).toBe('no_checkpoint');
    // Ein Punkt mit `lastChunkHash === null` ist kein Punkt.
    expect(resolveVaultStreamingResume(IDLE_VAULT_STREAMING_STATE, { ...checkpoint, lastChunkHash: null }, { sizeBytes: bytes.byteLength }, CHUNK).reason).toBe('no_checkpoint');
    // Und der passende Punkt wird angenommen.
    const matching: VaultStreamingCheckpoint = { ...checkpoint, totalChunks: 3, totalBytes: bytes.byteLength, completedChunks: 1, processedBytes: CHUNK };
    const accepted = resolveVaultStreamingResume(IDLE_VAULT_STREAMING_STATE, matching, { sizeBytes: bytes.byteLength }, CHUNK);
    expect(accepted.resumed).toBe(true);
    expect(accepted.reason).toBe('checkpoint_used');
    expect(accepted.state.status).toBe('retrying');
  });
});

describe('vaultStreamingEngine: die Bestandsprüfung prüft ALLE Felder', () => {
  it('neun Verfälschungen, neun Ablehnungen — und jede nennt ihren eigenen Grund', async () => {
    /*
     * **Der Vergleich muss ALLE Felder umfassen.** Ein Vergleich nur über den Gesamt-Digest würde eine
     * falsche Blockaufteilung, eine falsche Blockgröße und eine vertauschte Blockreihenfolge durchgehen
     * lassen. Neun Fälle, und jeder muss auffallen.
     */
    const bytes = payload(CHUNK * 3, 89);
    const manifest = await buildVaultChunkIntegrity(bytes, CHUNK);
    const digest = incrementalSha256Hex(bytes);
    const good = { contentDigest: digest, digestAlgorithm: 'SHA-256', computed: manifest };
    expect(verifyVaultStreamingIntegrity(good, manifest, digest).integrity).toBe('verified');

    // 1 · falscher Gesamt-Digest
    expect(verifyVaultStreamingIntegrity({ ...good, contentDigest: 'f'.repeat(63) }, manifest, digest).reason).toBe('content_digest_mismatch');
    // 2 · unbekannter Digest-Algorithmus
    expect(verifyVaultStreamingIntegrity({ ...good, digestAlgorithm: 'MD5' }, manifest, digest).reason).toBe('algorithm_unsupported');
    // 3 · Manifest mit unbekanntem Algorithmus. **Kein `as`:** der Vertrag lässt nur 'SHA-256' zu, also wird
    // der Fall über einen ehrlichen Datenträger gebildet — eine Zeichenkette, wie sie auch aus einer Ablage
    // käme, wird geparst und geprüft.
    const foreignAlgorithm = JSON.parse(JSON.stringify(manifest)) as VaultChunkIntegrityManifest;
    Object.assign(foreignAlgorithm, { algorithm: 'SHA-1' });
    expect(verifyVaultStreamingIntegrity(good, foreignAlgorithm, digest).reason).toBe('algorithm_unsupported');
    // 4 · falsche Blockgröße
    expect(verifyVaultStreamingIntegrity(good, { ...manifest, chunkSize: CHUNK * 2 }, digest).reason).toBe('chunk_size_mismatch');
    // 5 · falsche Blockzahl
    expect(verifyVaultStreamingIntegrity(good, { ...manifest, totalChunks: 99 }, digest).reason).toBe('chunk_count_mismatch');
    // 6 · vertauschter Blockdigest: die gespeicherte Wurzel passt dann nicht mehr zu den eigenen Blöcken —
    // das wird gemeldet, BEVOR ein Block gegen den Bestand gehalten wird.
    const swapped = { ...manifest, chunks: manifest.chunks.map((chunk, index) => index === 1 ? { index, hash: 'b'.repeat(64) } : chunk) };
    const swappedResult = verifyVaultStreamingIntegrity(good, swapped, digest);
    expect(swappedResult.integrity).toBe('mismatch');
    expect(swappedResult.reason).toBe('merkle_root_mismatch');
    expect(swappedResult.chunksCompared).toBe(0);
    // 6b · vertauschter Digest MIT neu berechneter Wurzel — jetzt greift der Blockvergleich, Index 1.
    const swappedWithRoot = { ...swapped, merkleRoot: streamingMerkleRoot(swapped.chunks.map((chunk) => chunk.hash)) };
    const swappedWithRootResult = verifyVaultStreamingIntegrity(good, swappedWithRoot, digest);
    expect(swappedWithRootResult.integrity).toBe('mismatch');
    expect(swappedWithRootResult.reason).toBe('chunk_hash_mismatch');
    expect(swappedWithRootResult.firstMismatchIndex).toBe(1);
    expect(swappedWithRootResult.chunksCompared).toBe(3);
    // 7 · falscher Index in einem Block
    const wrongIndex = { ...manifest, chunks: manifest.chunks.map((chunk, index) => index === 2 ? { index: 0, hash: chunk.hash } : chunk) };
    const wrongIndexResult = verifyVaultStreamingIntegrity(good, { ...wrongIndex, merkleRoot: streamingMerkleRoot(wrongIndex.chunks.map((chunk) => chunk.hash)) }, digest);
    expect(wrongIndexResult.firstMismatchIndex).toBe(2);
    // 8 · **kein Manifest am Bestand ist kein bestandener Test**
    expect(verifyVaultStreamingIntegrity({ contentDigest: digest }, manifest, digest).reason).toBe('manifest_missing');
    // 9 · **ein leeres Manifest ist kein bestandener Test** — 0 verglichene Blöcke
    const emptyManifest = { ...manifest, chunks: [], totalChunks: 0, merkleRoot: '0'.repeat(64) };
    const emptyResult = verifyVaultStreamingIntegrity(good, emptyManifest, digest);
    expect(emptyResult.integrity).toBe('unavailable');
    expect(emptyResult.chunksCompared).toBe(0);
    expect(emptyResult.reason).toBe('no_chunks');

    /*
     * 10 und 11 · **die Lücke, die mein eigener Zeuge gefunden hat.**
     *
     * Der dritte Wert aus AST-1219 lautet wörtlich „Pruefung je Chunk plus Merkle plus **Gesamtdatei-Digest**".
     * Mein erster Entwurf prüfte für den Gesamt-Digest nur die **Form** (64 Hex-Zeichen) und nie die
     * Gleichheit — ein nicht verglichener Wert widerspricht nie, und deshalb fiel es nicht auf. Diese beiden
     * Zusicherungen halten die Lücke zu, in **beide** Richtungen:
     *   • ein abweichender berechneter Digest MUSS auffallen, und
     *   • ein **fehlender** erwarteter Digest darf NICHT als „bestanden" durchgehen.
     */
    expect(verifyVaultStreamingIntegrity({ ...good, contentDigest: 'a'.repeat(64) }, manifest, digest).reason).toBe('content_digest_mismatch');
    expect(verifyVaultStreamingIntegrity({ ...good, contentDigest: 'a'.repeat(64) }, manifest, digest).integrity).toBe('mismatch');
    // Ohne den erwarteten Gesamt-Digest ist das Ergebnis `unavailable` — „nicht geprüft" ist kein bestandenes Ergebnis.
    expect(verifyVaultStreamingIntegrity(good, manifest).integrity).toBe('unavailable');
    expect(verifyVaultStreamingIntegrity(good, manifest).reason).toBe('content_digest_mismatch');
  });

  it('eine manipulierte Wurzel im Manifest fällt auf, BEVOR ein Block verglichen wird', async () => {
    const bytes = payload(CHUNK * 2, 97);
    const manifest = await buildVaultChunkIntegrity(bytes, CHUNK);
    const digest = incrementalSha256Hex(bytes);
    const tampered = { ...manifest, merkleRoot: 'c'.repeat(64) };
    const result = verifyVaultStreamingIntegrity({ contentDigest: digest, digestAlgorithm: 'SHA-256', computed: manifest }, tampered, digest);
    expect(result.integrity).toBe('mismatch');
    expect(result.reason).toBe('merkle_root_mismatch');
    expect(result.chunksCompared).toBe(0);
  });
});

describe('vaultStreamingEngine: die Blockrechnung ist EINE Autorität', () => {
  it('die Anzeige rechnet mit derselben Funktion wie der Lauf — und weist ungültige Indizes ab', () => {
    /*
     * Eine zweite Rechnung in der Oberfläche wäre eine zweite Wahrheit über dieselbe Datei. Deshalb ist
     * `vaultStreamingChunkRange` dieselbe Funktion, die der Lauf verwendet.
     */
    /*
     * **Gemessene Korrektur eines Zeugenfehlers.** Hier stand `vaultStreamingPlan(CHUNK * 3 + 10)` **ohne**
     * die Blockgröße — die Funktion nahm ihren Vorgabewert `VAULT_STREAMING_WINDOW_BYTES` (64 KiB) und
     * rechnete deshalb 1 Block mit 12 298 Byte. Die Funktion war richtig, der Aufruf unvollständig. Und der
     * Vorgabewert ist der **richtige** Vorgabewert: er ist die Größe, die der Import verwendet.
     */
    expect(vaultStreamingPlan(0)).toEqual({ totalChunks: 0, lastChunkBytes: 0 });
    expect(vaultStreamingPlan(CHUNK * 3 + 10, CHUNK)).toEqual({ totalChunks: 4, lastChunkBytes: 10 });
    expect(vaultStreamingPlan(CHUNK * 3 + 10, VAULT_STREAMING_WINDOW_BYTES)).toEqual({ totalChunks: 1, lastChunkBytes: CHUNK * 3 + 10 });
    expect(vaultStreamingChunkRange(CHUNK * 3 + 10, CHUNK, 0)).toEqual({ start: 0, end: CHUNK });
    expect(vaultStreamingChunkRange(CHUNK * 3 + 10, CHUNK, 3)).toEqual({ start: CHUNK * 3, end: CHUNK * 3 + 10 });
    // Ausserhalb der Blockzahl: benannt abgewiesen, nicht geklemmt.
    expect(() => vaultStreamingChunkRange(CHUNK * 3 + 10, CHUNK, 4)).toThrow(VaultStreamingError);
    expect(() => vaultStreamingChunkRange(CHUNK * 3 + 10, CHUNK, -1)).toThrow(VaultStreamingError);
    // Und eine Blockgrösse unterhalb der Grenzen wird abgewiesen.
    expect(() => vaultStreamingPlan(CHUNK, 10)).toThrow(VaultStreamingError);
    expect(() => runVaultStreamingImport).toBeTypeOf('function');
    expect(VAULT_STREAMING_WINDOW_BYTES).toBeGreaterThan(0);
  });
});
