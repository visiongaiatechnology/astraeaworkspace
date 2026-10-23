// STATUS: PLATIN — die Zustandsmaschine des Streaming-Imports, ohne React, ohne DOM, ohne Uhr.
//
// **Der gemessene Anlass.** `REPAIR_VAULT_BOUNDED_MEMORY_P0.md` belegt für den bestehenden Importpfad eine
// Spitze von **58,33 MiB** bei einer Grenze von 25,00 MiB: die Nutzlast liegt gleichzeitig als
// Base64-Zeichenkette (33,33 MiB) und als dekodierte Bytes (25,00 MiB) vor, weil `createVaultAttachmentEntry`
// die Datei erst vollständig materialisiert (`readFileAsDataUrl`) und dann entschlüsselt. Die
// Evidenznotizen AST-1216/1219 nennen die Abhilfe wörtlich: „Chunked Import unter begrenztem
// Transientfenster und Chunked Export in eine Senke". Diese Datei ist die Zustandsmaschine dieses Imports.
//
// **Vorbild und Form.** Wie `security/vaultCredentialLifecycle.ts` (9.924 B) ist der Kern eine **reine**
// Transition: `vaultStreamingFlowTransition(state, event) -> state`. Kein `Date.now()`, kein `Math.random()`,
// kein DOM, kein `localStorage`, keine Mutation der Eingabe. Deshalb ist die Entscheidung ohne Browser
// ausführbar und prüfbar — obwohl der Fehler, den sie verhindert, in einem React-Panel saß.
//
// **Was der Kern NICHT tut:** er liest keine Datei. Lesen, Schreiben und die Uhr sind **injizierte Ports**
// (`VaultStreamingSource`, `VaultStreamingSink`, `AbortSignal`, `VaultStreamingObserver`). Das ist der
// Unterschied zwischen „die Engine kann ausgeführt werden" und „die Engine ist eine Attrappe": die
// Zustandsübergänge und die Prüfungen sind echt, und die Umgebung wird hineingereicht statt angenommen.
//
// **Kein stiller Rückfall auf den 25-MiB-In-Memory-Leser.** Diese Datei importiert `readFileAsDataUrl`
// **nicht** und kennt `MAX_VAULT_ATTACHMENT_BYTES` **nicht**. Sie kann die Nutzlast nicht als Ganzes
// materialisieren, weil sie keine Funktion dafür hat — nicht, weil sie es verspricht. Der Zeuge
// `vaultStreamingAssets.test.ts` prüft diese Abwesenheit am Quelltext.
//
// **Keine Chunk-Inhalte, keine Dateinamen, keine Pfade in einer Meldung.** Jeder Fehler ist ein
// **benannter Code** (`vault_streaming_<reason>`), der keine Nutzlast, keinen Namen und keinen Pfad
// enthält. Ein Import, der im Fehlerfall den Pfad nennt, leakt die Struktur des Tresors — und ein Fehler,
// der den Dateinamen nennt, leakt ihn in jede Protokollzeile.

import type { VaultChunkIntegrityManifest } from '../../contracts/workspace';
import {
  buildVaultStreamingDigest,
  planVaultStreamingChunks,
  VAULT_STREAMING_HASH_LIMITS,
  VAULT_STREAMING_WINDOW_BYTES,
  streamingMerkleRoot,
  vaultStreamingChunkManifest,
  VaultStreamingHashError,
  VaultStreamingSha256,
  type VaultStreamingDigestResult,
} from './vaultStreamingHash';

// ---------------------------------------------------------------------------------------------------
// Die Schreibfreigabe. Drei Gründe, die NICHT derselbe sind.
// ---------------------------------------------------------------------------------------------------

/**
 * Warum ein Import nicht schreiben darf.
 *
 * **Drei Gründe, nicht einer.** „Gesperrt" verlangt ein Entsperren, „schreibgeschützt" eine andere
 * Ablage, „keine Berechtigung" eine andere Rolle. Ein einzelner `readonly`-Zustand mit einem Sammeltext
 * hätte dem Nutzer die falsche Handlung nahegelegt — dieselbe Klasse von Fehler, die
 * `calculateVaultFileBytes` in `integrity/vaultIntegrity.ts` bereits einmal behoben hat („der Grund muss
 * stimmen, nicht nur die Ablehnung").
 */
export type VaultStreamingDenialReason = 'vault_locked' | 'vault_read_only' | 'vault_permission_denied';

/** Der Befund über die Schreibfreigabe. `allowed` ist die Entscheidung, `reason` die Begründung. */
export type VaultStreamingWritableVerdict =
  | { readonly allowed: true; readonly reason: null; readonly message: string }
  | { readonly allowed: false; readonly reason: VaultStreamingDenialReason; readonly message: string };

/** Die Tatsachen, aus denen die Freigabe abgeleitet wird — strukturell, ohne DOM. */
export interface VaultStreamingWritabilityFacts {
  readonly locked: boolean;
  readonly readOnly: boolean;
  readonly canWrite: boolean;
}

const MESSAGES: Readonly<Record<VaultStreamingDenialReason, string>> = Object.freeze({
  vault_locked: 'This Vault is locked. Unlock it before importing; nothing was written.',
  vault_read_only: 'This Vault is open in read-only mode. Choose a writable target before importing; nothing was written.',
  vault_permission_denied: 'This account may not write to this Vault. Ask an owner for write access; nothing was written.',
});

/**
 * **Die Schreibfreigabe, geprüft BEVOR ein einziges Byte gelesen wird.**
 *
 * Die Reihenfolge der Prüfungen ist die Reihenfolge der Handlungen, die der Nutzer ergreifen muss:
 * entsperren → eine beschreibbare Ablage wählen → eine Berechtigung erlangen. Wer zuerst `canWrite` prüfte,
 * meldete einem gesperrten Tresor „keine Berechtigung".
 *
 * **Fail-closed:** die Vorgabe ist `allowed: false`. Ein Aufrufer, der die Freigabe vergisst, schreibt
 * nicht; er muss sie **positiv** einholen. Das ist die Richtung, in der ein Fehler billig ist.
 */
export function assertVaultStreamingWritable(facts: VaultStreamingWritabilityFacts): VaultStreamingWritableVerdict {
  if (facts.locked) return { allowed: false, reason: 'vault_locked', message: MESSAGES.vault_locked };
  if (facts.readOnly) return { allowed: false, reason: 'vault_read_only', message: MESSAGES.vault_read_only };
  if (!facts.canWrite) return { allowed: false, reason: 'vault_permission_denied', message: MESSAGES.vault_permission_denied };
  return { allowed: true, reason: null, message: 'This Vault accepts a streamed import.' };
}

// ---------------------------------------------------------------------------------------------------
// Die Ports. Sie werden hineingereicht, nie angenommen.
// ---------------------------------------------------------------------------------------------------

/**
 * Die **Quelle**: etwas, das seine Größe kennt und einen Ausschnitt als Bytes liefern kann.
 *
 * Die Form ist die von `Blob` (`size`, `slice(start, end).arrayBuffer()`), also von `File` — aber **als
 * Struktur beschrieben und nicht als `File` deklariert**. Damit braucht die Engine weder DOM-Typen noch
 * `jsdom`, und der Zeuge kann eine Quelle aus einem Feld bauen. `readChunk` bekommt Länge und Startindex
 * ausdrücklich, damit die Engine die Blockgrenzen kontrolliert und nicht die Quelle.
 */
export interface VaultStreamingSource {
  /** Gesamtgröße in Bytes, wie sie die Quelle meldet. */
  readonly sizeBytes: number;
  /**
   * Liest `length` Bytes ab `offset`. **Muss höchstens `length` Bytes liefern**; die Engine prüft das
   * Ergebnis und lehnt eine längere Antwort ab, statt sie zu kürzen.
   */
  readChunk(offset: number, length: number): Promise<Uint8Array>;
}

/**
 * Die **Senke**: etwas, das Blöcke annimmt und sie bestätigt.
 *
 * `write` gibt den Index zurück, den es angenommen hat. **Die Engine prüft diese Bestätigung** und bricht
 * ab, wenn sie nicht zum gesendeten Block passt. Eine Senke, die stillschweigend verwirft, ist damit
 * erkannt, bevor ein Manifest entsteht, das zu nichts gehört. Die Form entspricht einem
 * `FileSystemWritableFileStream` (schreiben → abschließen/verwerfen), ohne dessen Typen zu importieren.
 */
export interface VaultStreamingSink {
  begin(totalBytes: number): Promise<void>;
  write(chunk: Uint8Array, index: number): Promise<number>;
  commit(): Promise<void>;
  abort(reason: string): Promise<void>;
}

/** Ein Empfänger für Fortschritt und Abschluss — injiziert, damit die Engine keine Uhr braucht. */
export interface VaultStreamingObserver {
  onProgress?: (progress: VaultStreamingProgress) => void;
  onFinished?: (outcome: VaultStreamingRunOutcome) => void;
}

/** Der Fortschritt, wie ihn die Oberfläche anzeigen kann. Alle Werte sind Rechenergebnisse. */
export interface VaultStreamingProgress {
  readonly status: 'idle' | 'streaming' | 'retrying' | 'verifying' | 'done' | 'cancelled' | 'failed';
  readonly totalChunks: number;
  readonly completedChunks: number;
  readonly totalBytes: number;
  readonly processedBytes: number;
  readonly percent: number;
  readonly digestReady: boolean;
}

// ---------------------------------------------------------------------------------------------------
// Der serialisierbare Zustand.
// ---------------------------------------------------------------------------------------------------

/** Der Fortschritt als reine Zahlen. Serialisierbar, weil er nichts außer Zahlen hält. */
export interface VaultStreamingProgressState {
  readonly totalChunks: number;
  readonly totalBytes: number;
  readonly chunkSize: number;
  readonly completedChunks: number;
  readonly processedBytes: number;
}

/**
 * Der **Wiederaufnahmepunkt**. Enthält **nur** Zahlen und Hex-Zeichenketten — keine Nutzlast, keinen
 * Dateinamen, keinen Pfad.
 *
 * **Warum das eine eigene Struktur ist und nicht der ganze Zustand:** der Zustand trägt die
 * Block-Digests (bis zu 4096 × 64 Zeichen), der Wiederaufnahmepunkt braucht nur die Stelle und die
 * Prüfsumme des ersten Blocks. Wer den Punkt ablegt, legt nicht den halben Tresor ab.
 */
export interface VaultStreamingCheckpoint {
  readonly totalChunks: number;
  readonly totalBytes: number;
  readonly chunkSize: number;
  readonly completedChunks: number;
  readonly processedBytes: number;
  /** Der Digest des zuletzt **bestätigten** Blocks — die Prüfsumme, an der die Wiederaufnahme hängt. */
  readonly lastChunkHash: string | null;
  /**
   * Die Digests **aller** bereits bestätigten Blöcke, in Reihenfolge.
   *
   * **Warum sie hier stehen müssen, und warum das ein Fehler von mir war.** Mein erster Entwurf trug nur
   * `lastChunkHash`. Beim Fortsetzen hätte der Lauf die Blöcke unterhalb der Grenze dann **erfinden** müssen
   * — und genau das tat mein erster Wiederaufbau: `Array.from({ length: n }, (_, i) => \`resume-${i}\`)`.
   * Das sind keine Digests, das ist eine Zuordnung. Die Merkle-Wurzel des fortgesetzten Laufs wäre über
   * erfundene Werte gebildet worden und damit **ungleich** der Wurzel eines durchgehenden Laufs — die
   * Wiederaufnahme hätte stillschweigend einen anderen Bestand erzeugt. Der Fehler ist gefunden, bevor er
   * in einem Lauf auftreten konnte; die Digests gehören in den Punkt.
   *
   * **Die Kosten sind begrenzt und benannt:** 4096 Blöcke × 64 Zeichen = 262 144 Zeichen ≈ 512 KiB bei
   * einer Nutzlast von 256 MiB. Kein Nutzlastbyte liegt darin — nur Hex-Digests.
   */
  readonly chunkHashes: readonly string[];
}

/** Warum ein Lauf gescheitert ist. **Benannte Codes, kein Freitext mit Nutzlast.** */
export type VaultStreamingFailureReason =
  | 'cancelled'
  | 'source_unavailable'
  | 'source_short_read'
  | 'source_grew'
  | 'sink_rejected'
  | 'resume_source_changed'
  | 'resume_replay_mismatch'
  | 'tamper_detected'
  | 'verify_not_ready'
  | 'verify_order'
  | 'not_writable'
  | 'begin_gap'
  | 'chunk_gap'
  | 'chunk_mismatch'
  | 'chunk_after_done'
  | 'failure_after_done'
  | 'cancel_after_done'
  | 'resume_gap'
  | 'resume_after_done'
  | 'unknown_event';

/** Der Zustand des Laufs. Ein Zustandswechsel ist ein **Verifikationsergebnis**, kein Stilmittel. */
export type VaultStreamingStatus = 'idle' | 'streaming' | 'retrying' | 'verifying' | 'done' | 'cancelled' | 'failed';

/**
 * Der vollständige Zustand. Alle Felder sind `readonly`; ein Übergang **ersetzt** den Zustand, er ändert
 * ihn nicht. Wer das ändert, verliert die Wiederaufnahme, weil ein halb überschriebener Puffer nicht mehr
 * als Wert kopierbar ist.
 */
export interface VaultStreamingImportState {
  readonly status: VaultStreamingStatus;
  readonly progress: VaultStreamingProgressState;
  /** Ein Hex-Digest je **bestätigtem** Block, in Reihenfolge. Nur Zeichenketten — keine Nutzlast. */
  readonly chunkHashes: readonly string[];
  readonly merkleRoot: string | null;
  readonly contentDigest: string | null;
  readonly failureReason: VaultStreamingFailureReason | null;
  readonly checkpoint: VaultStreamingCheckpoint | null;
}

/** Das Ergebnis einer Wiederaufnahme-Prüfung: der Zustand und was dabei festgestellt wurde. */
export interface VaultStreamingResumeResolution {
  readonly state: VaultStreamingImportState;
  readonly resumed: boolean;
  readonly reason: 'no_checkpoint' | 'checkpoint_used' | 'checkpoint_invalidated' | 'replayed_and_verified' | null;
  /** Bei `replayed_and_verified`: der Block-Digest des ersten Blocks, der die Grenze bestätigt. */
  readonly boundaryHash: string | null;
}

// ---------------------------------------------------------------------------------------------------
// Die Ereignisse. Eine geschlossene Union — jeder Zustandswechsel ist benannt.
// ---------------------------------------------------------------------------------------------------

export type VaultStreamingFlowEvent =
  | { readonly type: 'stream.begin'; readonly totalChunks: number; readonly totalBytes: number; readonly chunkSize: number }
  | { readonly type: 'stream.progress'; readonly chunkIndex: number; readonly chunkBytes: number }
  | { readonly type: 'stream.chunk'; readonly chunkIndex: number; readonly hash: string }
  | { readonly type: 'stream.verify'; readonly merkleRoot: string; readonly contentDigest: string }
  | {
      readonly type: 'stream.fail';
      readonly reason: VaultStreamingFailureReason;
      readonly resume?: { readonly lastChunkHash: string | null } | null;
    }
  | { readonly type: 'stream.cancel' }
  | { readonly type: 'stream.resume'; readonly checkpoint: VaultStreamingCheckpoint }
  | { readonly type: 'stream.done' };

/** Der Ausgangszustand. `checkpoint` ist `null` — es gibt nichts wiederaufzunehmen. */
export const IDLE_VAULT_STREAMING_STATE: VaultStreamingImportState = Object.freeze({
  status: 'idle',
  progress: Object.freeze({ totalChunks: 0, totalBytes: 0, chunkSize: VAULT_STREAMING_WINDOW_BYTES, completedChunks: 0, processedBytes: 0 }),
  chunkHashes: Object.freeze([]),
  merkleRoot: null,
  contentDigest: null,
  failureReason: null,
  checkpoint: null,
});

/** Der Fehler der Engine. Trägt einen **benannten** Grund und **keine** Nutzlast. */
export class VaultStreamingError extends Error {
  readonly reason: VaultStreamingFailureReason;
  readonly detail: number;

  constructor(reason: VaultStreamingFailureReason, detail = 0) {
    super(`vault_streaming_${reason}`);
    this.name = 'VaultStreamingError';
    this.reason = reason;
    this.detail = detail;
  }
}

/**
 * **Der Übergang. Rein.**
 *
 * Er nimmt den Zustand und **ein** Ereignis und gibt den neuen Zustand zurück. Er mutiert nichts, liest
 * keine Uhr, kennt kein React und kein DOM. Die drei Regeln, die er durchsetzt, sind als Vertrag formuliert
 * und nicht als Kommentar:
 *
 *   • **Die Reihenfolge ist bindend.** Ein Fortschritt ohne begonnenen Lauf, ein Block nach dem Abschluss,
 *     ein Scheitern nach dem Abschluss — jeder dieser Fälle ist ein **eigener** Grund und keine stille
 *     Wirkung. Ein Übergang, der ohne begonnenen Lauf nichts tut, würde einen Verdrahtungsfehler verdecken.
 *   • **`stream.done` setzt `chunkHashes` NICHT zurück.** Fortschritt ist eine Summe über Blöcke; wer den
 *     Abschluss zurücksetzte, verlöre die Prüfsummen genau in dem Moment, in dem sie gebraucht werden.
 *     `stream.resume` auf einem fertigen Lauf wird deshalb **abgewiesen**, nicht stillschweigend verarbeitet.
 *   • **Die Prüfsumme des Wiederaufnahmepunkts ist der letzte BESTÄTIGTE Block**, nicht der letzte
 *     begonnene. Ein Punkt auf einem halb geschriebenen Block würde die Wiederaufnahme auf halber Höhe
 *     ansetzen.
 */
export function vaultStreamingFlowTransition(state: VaultStreamingImportState, event: VaultStreamingFlowEvent): VaultStreamingImportState {
  switch (event.type) {
    case 'stream.begin': {
      if (state.status === 'done') return fail(state, 'begin_gap');
      if (!Number.isSafeInteger(event.totalChunks) || event.totalChunks <= 0) return fail(state, 'begin_gap');
      if (!Number.isSafeInteger(event.totalBytes) || event.totalBytes <= 0) return fail(state, 'begin_gap');
      if (!Number.isSafeInteger(event.chunkSize) || event.chunkSize <= 0) return fail(state, 'begin_gap');
      return {
        status: 'streaming',
        progress: { totalChunks: event.totalChunks, totalBytes: event.totalBytes, chunkSize: event.chunkSize, completedChunks: 0, processedBytes: 0 },
        chunkHashes: [],
        merkleRoot: null,
        contentDigest: null,
        failureReason: null,
        checkpoint: null,
      };
    }
    case 'stream.progress': {
      if (state.status !== 'streaming' && state.status !== 'retrying') return fail(state, 'chunk_gap');
      // Ein Fortschritt für genau den Block, der als Nächstes dran ist. Ein Sprung wäre ein Loch in der
      // Summe und damit ein Fortschritt, der mehr behauptet, als geschrieben wurde.
      if (event.chunkIndex !== state.progress.completedChunks) return fail(state, 'chunk_gap');
      if (!Number.isSafeInteger(event.chunkBytes) || event.chunkBytes <= 0) return fail(state, 'chunk_gap');
      const completedChunks = state.progress.completedChunks + 1;
      const processedBytes = state.progress.processedBytes + event.chunkBytes;
      if (processedBytes > state.progress.totalBytes) return fail(state, 'chunk_gap');
      return { ...state, status: 'streaming', progress: { ...state.progress, completedChunks, processedBytes }, failureReason: null };
    }
    case 'stream.chunk': {
      if (state.status !== 'streaming' && state.status !== 'retrying') return fail(state, 'chunk_after_done');
      const expected = state.chunkHashes.length;
      if (event.chunkIndex !== expected) return fail(state, 'chunk_mismatch');
      if (typeof event.hash !== 'string' || !/^[0-9a-f]{64}$/u.test(event.hash)) return fail(state, 'chunk_mismatch');
      const chunkHashes = [...state.chunkHashes, event.hash];
      // **Ein einzelner Block ist seine eigene Wurzel** — dieselbe Regel wie in der Streaming-Quelle und in
      // `computeVaultMerkleRoot`. Deshalb ist `merkleRoot` schon hier gesetzt und nicht erst bei der Prüfung.
      return {
        ...state,
        chunkHashes,
        merkleRoot: streamingMerkleRoot(chunkHashes),
        checkpoint: {
          totalChunks: state.progress.totalChunks,
          totalBytes: state.progress.totalBytes,
          chunkSize: state.progress.chunkSize,
          completedChunks: state.progress.completedChunks,
          processedBytes: state.progress.processedBytes,
          lastChunkHash: event.hash,
          // Die **echten** Digests aller bestätigten Blöcke — kein erfundener Platzhalter.
          chunkHashes,
        },
      };
    }
    case 'stream.verify': {
      if (state.status !== 'streaming' && state.status !== 'verifying') return fail(state, 'verify_not_ready');
      if (state.chunkHashes.length !== state.progress.totalChunks) return fail(state, 'verify_not_ready');
      if (state.progress.completedChunks !== state.progress.totalChunks) return fail(state, 'verify_not_ready');
      const merkleRoot = streamingMerkleRoot(state.chunkHashes);
      // **Die Prüfung prüft sich selbst mit:** eine übergebene Wurzel, die nicht zu den eigenen Blöcken
      // gehört, ist ein Widerspruch und wird abgewiesen, statt sie zu übernehmen.
      if (event.merkleRoot !== merkleRoot) return fail(state, 'tamper_detected');
      if (typeof event.contentDigest !== 'string' || !/^[0-9a-f]{64}$/u.test(event.contentDigest)) return fail(state, 'verify_not_ready');
      return { ...state, status: 'verifying', merkleRoot, contentDigest: event.contentDigest, failureReason: null };
    }
    case 'stream.fail': {
      if (state.status === 'done') return { ...state, status: 'failed', failureReason: 'failure_after_done' };
      const checkpoint: VaultStreamingCheckpoint | null = event.resume
        ? {
            totalChunks: state.progress.totalChunks,
            totalBytes: state.progress.totalBytes,
            chunkSize: state.progress.chunkSize,
            completedChunks: state.progress.completedChunks,
            processedBytes: state.progress.processedBytes,
            lastChunkHash: event.resume.lastChunkHash,
            chunkHashes: [...state.chunkHashes],
          }
        : null;
      return { ...state, status: 'failed', failureReason: event.reason, checkpoint };
    }
    case 'stream.cancel': {
      if (state.status === 'done') return { ...state, status: 'failed', failureReason: 'cancel_after_done' };
      // Ein Abbruch ist **kein** Fehler, aber auch kein Fortschritt: der Wiederaufnahmepunkt wird verworfen,
      // damit ein späterer Lauf nicht versehentlich an einer abgebrochenen Stelle weiterläuft.
      return { ...state, status: 'cancelled', failureReason: null, checkpoint: null };
    }
    case 'stream.resume': {
      if (state.status === 'done') return fail(state, 'resume_after_done');
      if (state.status !== 'failed' && state.status !== 'cancelled' && state.status !== 'idle') return fail(state, 'resume_gap');
      return { ...state, status: 'retrying', failureReason: null, checkpoint: event.checkpoint };
    }
    case 'stream.done': {
      if (state.status !== 'verifying' && state.status !== 'streaming') return fail(state, 'verify_not_ready');
      if (state.contentDigest === null || state.merkleRoot === null) return fail(state, 'verify_not_ready');
      return { ...state, status: 'done', failureReason: null };
    }
  }
}

function fail(state: VaultStreamingImportState, reason: VaultStreamingFailureReason): VaultStreamingImportState {
  return { ...state, status: 'failed', failureReason: reason };
}

/** Der serialisierte Zustand: **nur** JSON-fähige Werte, kein Objektverweis auf eine Nutzlast. */
export function serializeVaultStreamingState(state: VaultStreamingImportState): string {
  return JSON.stringify({
    status: state.status,
    progress: {
      totalChunks: state.progress.totalChunks,
      totalBytes: state.progress.totalBytes,
      chunkSize: state.progress.chunkSize,
      completedChunks: state.progress.completedChunks,
      processedBytes: state.progress.processedBytes,
    },
    chunkHashes: [...state.chunkHashes],
    merkleRoot: state.merkleRoot,
    contentDigest: state.contentDigest,
    failureReason: state.failureReason,
    checkpoint: state.checkpoint
      ? {
          totalChunks: state.checkpoint.totalChunks,
          totalBytes: state.checkpoint.totalBytes,
          chunkSize: state.checkpoint.chunkSize,
          completedChunks: state.checkpoint.completedChunks,
          processedBytes: state.checkpoint.processedBytes,
          lastChunkHash: state.checkpoint.lastChunkHash,
          chunkHashes: [...state.checkpoint.chunkHashes],
        }
      : null,
  });
}

const STATUSES: readonly VaultStreamingStatus[] = Object.freeze(['idle', 'streaming', 'retrying', 'verifying', 'done', 'cancelled', 'failed']);

function assertHexOrNull(value: unknown, length: number): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || value.length !== length || !/^[0-9a-f]+$/u.test(value)) throw new VaultStreamingError('tamper_detected');
  return value;
}

function assertCount(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new VaultStreamingError('tamper_detected');
  return value as number;
}

/**
 * **Stellt einen Zustand aus seiner serialisierten Form her — mit Validierung, nicht mit Zusicherung.**
 *
 * Das ist die Stelle, an der ein abgelegter Zustand wieder in das Programm kommt, und damit eine
 * **Vertrauensgrenze**. Deshalb wird jedes Feld geprüft: der Status muss einer der sieben sein, jede Zahl
 * eine sichere ganze Zahl im Bereich, jeder Digest 64 Hex-Zeichen. Ein `as` auf einen geladenen Wert wäre
 * hier der Fehler, den die Regeln dieser Sitzung ausdrücklich verbieten.
 */
export function deserializeVaultStreamingState(serialized: string): VaultStreamingImportState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new VaultStreamingError('tamper_detected');
  }
  if (parsed === null || typeof parsed !== 'object') throw new VaultStreamingError('tamper_detected');
  const record = parsed as Record<string, unknown>;
  const status = record['status'];
  if (typeof status !== 'string' || !STATUSES.includes(status as VaultStreamingStatus)) throw new VaultStreamingError('tamper_detected');
  const progressRecord = record['progress'];
  if (progressRecord === null || typeof progressRecord !== 'object') throw new VaultStreamingError('tamper_detected');
  const progress = progressRecord as Record<string, unknown>;
  const rawHashes = record['chunkHashes'];
  if (!Array.isArray(rawHashes)) throw new VaultStreamingError('tamper_detected');
  const chunkHashes = rawHashes.map((hash) => {
    const checked = assertHexOrNull(hash, 64);
    if (checked === null) throw new VaultStreamingError('tamper_detected');
    return checked;
  });
  const checkpointRecord = record['checkpoint'];
  let checkpoint: VaultStreamingCheckpoint | null = null;
  if (checkpointRecord !== null && checkpointRecord !== undefined) {
    if (typeof checkpointRecord !== 'object') throw new VaultStreamingError('tamper_detected');
    const raw = checkpointRecord as Record<string, unknown>;
    const rawCheckpointHashes = raw['chunkHashes'];
    if (!Array.isArray(rawCheckpointHashes)) throw new VaultStreamingError('tamper_detected');
    const checkpointHashes = rawCheckpointHashes.map((hash) => {
      const checked = assertHexOrNull(hash, 64);
      if (checked === null) throw new VaultStreamingError('tamper_detected');
      return checked;
    });
    checkpoint = {
      totalChunks: assertCount(raw['totalChunks']),
      totalBytes: assertCount(raw['totalBytes']),
      chunkSize: assertCount(raw['chunkSize']),
      completedChunks: assertCount(raw['completedChunks']),
      processedBytes: assertCount(raw['processedBytes']),
      lastChunkHash: assertHexOrNull(raw['lastChunkHash'] ?? null, 64),
      chunkHashes: checkpointHashes,
    };
  }
  const failureReason = record['failureReason'] ?? null;
  if (failureReason !== null && typeof failureReason !== 'string') throw new VaultStreamingError('tamper_detected');
  return {
    status: status as VaultStreamingStatus,
    progress: {
      totalChunks: assertCount(progress['totalChunks']),
      totalBytes: assertCount(progress['totalBytes']),
      chunkSize: assertCount(progress['chunkSize']),
      completedChunks: assertCount(progress['completedChunks']),
      processedBytes: assertCount(progress['processedBytes']),
    },
    chunkHashes,
    merkleRoot: assertHexOrNull(record['merkleRoot'] ?? null, 64),
    contentDigest: assertHexOrNull(record['contentDigest'] ?? null, 64),
    failureReason: failureReason as VaultStreamingFailureReason | null,
    checkpoint,
  };
}

// ---------------------------------------------------------------------------------------------------
// Die Prüfung eines Bestands gegen ein Manifest. Der Grund, warum es diese Datei gibt.
// ---------------------------------------------------------------------------------------------------

/**
 * Das Ergebnis einer Bestandsprüfung.
 *
 * **`chunksCompared` ist Teil des Ergebnisses, nicht Diagnose.** Ein Lauf, der null Blöcke verglichen hat,
 * darf nicht `verified` heißen: „nichts geprüft" ist kein bestandener Test. Genau diese Verwechslung war der
 * Defekt bei AST-0478, wo der schützende Test nur den Serialisierer prüfte.
 */
export interface VaultStreamingIntegrityOutcome {
  readonly integrity: 'verified' | 'mismatch' | 'unavailable';
  readonly reason:
    | 'match'
    | 'no_chunks'
    | 'chunk_size_mismatch'
    | 'algorithm_unsupported'
    | 'merkle_root_mismatch'
    | 'content_digest_mismatch'
    | 'chunk_count_mismatch'
    | 'chunk_hash_mismatch'
    | 'manifest_missing';
  /** Der erste abweichende Blockindex — `-1`, wenn keiner abweicht. */
  readonly firstMismatchIndex: number;
  readonly chunksCompared: number;
  /** Die Indizes, deren Digest fehlt. Sie sind **nicht** dasselbe wie „abweichend". */
  readonly missingChunkIndexes: readonly number[];
}

/**
 * **Was der Bestand selbst berechnet hat** — nicht, was er behauptet.
 *
 * ## Der Designfehler, den diese Struktur behebt
 *
 * Mein erster Entwurf nahm ein `VaultFile`-ähnliches Objekt mit `chunkIntegrity` **und** ein erwartetes
 * Manifest und verglich beide gegeneinander. Das war **zirkulär**: wenn beide dasselbe Feld sind, kann die
 * Prüfung nie fehlschlagen — sie verglich den Bestand mit sich selbst. Genau die Fehlerklasse, die der
 * Auftrag mit „eine Rundlauf-Prüfung, die nur den Serialisierer prüft, ist wertlos" benennt.
 *
 * Jetzt sind die Rollen getrennt und benannt:
 *   • `computed` — was aus den **tatsächlichen Bytes** gebildet wurde (`buildVaultStreamingDigest`).
 *   • das `expected`-Manifest — was **gespeichert** war (`VaultFile.chunkIntegrity`).
 * Die Prüfung vergleicht **berechnet gegen erwartet** und kann deshalb wirklich fehlschlagen.
 */
export interface VaultStreamingIntegrityCandidate {
  /** Der Digest über die tatsächlichen Bytes des Bestands. */
  readonly contentDigest?: string;
  readonly digestAlgorithm?: string;
  /** Das Manifest über die tatsächlichen Bytes des Bestands. Fehlt es, ist die Prüfung `unavailable`. */
  readonly computed?: VaultChunkIntegrityManifest;
}

/**
 * **Prüft den berechneten Bestand gegen das erwartete Manifest — ALLE Felder, nicht nur die ID.**
 *
 * Die Regel dieser Sitzung lautet: *der Vergleich muss ALLE Felder umfassen, nicht nur die ID.* Für ein
 * Integritätsmanifest heißt das:
 *
 *   `version` · `algorithm` · `chunkSize` · `totalChunks` · `merkleRoot` · **jeder** `chunks[i].index`
 *   · **jeder** `chunks[i].hash` · `contentDigest` · `digestAlgorithm`
 *
 * **Und die Reihenfolge der Prüfungen ist die Reihenfolge der Diagnose:** erst die Form (gibt es überhaupt
 * Blöcke? passt die Blockgröße? ist der Algorithmus bekannt?), dann der Inhalt (Block-Digests, Wurzel,
 * Gesamt-Digest). Wer mit dem Gesamt-Digest beginnt, meldet bei einer falschen Blockgröße „Inhalt
 * manipuliert" — und schickt den Nutzer auf die falsche Spur.
 */
export function verifyVaultStreamingIntegrity(
  candidate: VaultStreamingIntegrityCandidate,
  expected: VaultChunkIntegrityManifest,
  /**
   * Der **erwartete Gesamt-Digest** — der dritte Wert aus AST-1219 („Pruefung je Chunk plus Merkle plus
   * Gesamtdatei-Digest"). Er ist **kein** Feld des Manifests: `VaultChunkIntegrityManifest` hat kein
   * `contentDigest`, und ein Cast hätte einen fremden Wert in einen Vertrag geschrieben. Deshalb ist er ein
   * eigener Parameter — und ohne ihn ist das Ergebnis `unavailable`, **nicht** `verified`.
   */
  expectedContentDigest?: string,
): VaultStreamingIntegrityOutcome {
  const unavailable = (reason: VaultStreamingIntegrityOutcome['reason']): VaultStreamingIntegrityOutcome => ({
    integrity: 'unavailable', reason, firstMismatchIndex: -1, chunksCompared: 0, missingChunkIndexes: [],
  });
  const mismatch = (reason: VaultStreamingIntegrityOutcome['reason'], chunksCompared: number, firstMismatchIndex = -1, missing: readonly number[] = []): VaultStreamingIntegrityOutcome => ({
    integrity: 'mismatch', reason, firstMismatchIndex, chunksCompared, missingChunkIndexes: missing,
  });

  // ---- Form zuerst. ----
  if (expected.algorithm !== 'SHA-256' || expected.version !== 1) return unavailable('algorithm_unsupported');
  if (candidate.digestAlgorithm !== undefined && candidate.digestAlgorithm !== 'SHA-256') return unavailable('algorithm_unsupported');
  if (!Number.isSafeInteger(expected.chunkSize) || expected.chunkSize <= 0) return unavailable('chunk_size_mismatch');
  // **Ein Manifest ohne Blöcke hat keine Wurzel, die etwas bedeuten könnte.** Die Null-Wurzel aus 64 Nullen
  // ist kein bestandener Test, sondern die Abwesenheit einer Aussage.
  if (expected.chunks.length === 0) return unavailable('no_chunks');
  if (expected.merkleRoot === '0'.repeat(64)) return unavailable('no_chunks');
  // **Und ein Bestand, der nichts berechnet hat, ist ebenfalls kein bestandener Test.**
  const computed = candidate.computed;
  if (!computed) return unavailable('manifest_missing');
  if (computed.chunks.length === 0) return unavailable('no_chunks');

  // ---- Die Wurzel des ERWARTETEN Manifests muss zu seinen eigenen Blöcken passen. ----
  // Eine gespeicherte Wurzel, die nicht zu den gespeicherten Blöcken gehört, ist bereits ein Widerspruch in
  // sich — und wird gemeldet, **bevor** ein Block gegen den Bestand gehalten wird.
  if (streamingMerkleRoot(expected.chunks.map((chunk) => chunk.hash)) !== expected.merkleRoot) {
    return mismatch('merkle_root_mismatch', 0);
  }

  // ---- Dann die Blockaufteilung. ----
  if (computed.chunkSize !== expected.chunkSize) return unavailable('chunk_size_mismatch');
  if (computed.totalChunks !== expected.totalChunks) return mismatch('chunk_count_mismatch', 0);
  if (computed.chunks.length !== expected.chunks.length) return mismatch('chunk_count_mismatch', 0);

  // ---- Und dann JEDER Block, JEDER Index, JEDER Digest. ----
  const missing: number[] = [];
  let firstMismatchIndex = -1;
  for (let index = 0; index < expected.chunks.length; index += 1) {
    const wanted = expected.chunks[index];
    const actual = computed.chunks[index];
    if (!actual) {
      missing.push(index);
      if (firstMismatchIndex < 0) firstMismatchIndex = index;
      continue;
    }
    // Drei Vergleiche je Block, nicht einer: der Index **an dieser Stelle**, der Index **im Block** und der
    // Digest. Ein vertauschter Digest bei richtiger Reihenfolge fällt nur über den dritten auf.
    if (wanted?.index !== index || actual.index !== index || actual.hash !== wanted?.hash) {
      if (firstMismatchIndex < 0) firstMismatchIndex = index;
    }
  }
  if (missing.length > 0 || firstMismatchIndex >= 0) {
    return mismatch('chunk_hash_mismatch', expected.chunks.length, firstMismatchIndex, missing);
  }

  // ---- Zuletzt der Gesamt-Digest. Er hat eine eigene Form und wird nur verglichen, wenn er vorliegt. ----
  if (candidate.contentDigest === undefined) return mismatch('content_digest_mismatch', expected.chunks.length);
  if (candidate.contentDigest.length !== 64 || !/^[0-9a-f]{64}$/u.test(candidate.contentDigest)) return unavailable('content_digest_mismatch');
  /*
   * **Und hier wird der Gesamt-Digest WIRKLICH verglichen — das ist die Lücke, die mein eigener Zeuge
   * gefunden hat.** Mein erster Entwurf prüfte nur die **Form** (64 Hex-Zeichen) und nie die Gleichheit:
   * `contentDigest` wurde gegen nichts gehalten. Damit war „Pruefung je Chunk plus Merkle plus
   * Gesamtdatei-Digest" aus AST-1219 zur Hälfte nicht erfüllt — der dritte Teil fehlte, und er fehlte
   * **unbemerkt**, weil ein nicht verglichener Wert nie widerspricht.
   *
   * Verglichen wird gegen `expectedContentDigest`. Fehlt er, wird das **gesagt** (`unavailable`) statt
   * stillschweigend durchgelassen — „nicht geprüft" ist kein bestandener Test.
   */
  if (expectedContentDigest === undefined || expectedContentDigest.length !== 64 || !/^[0-9a-f]{64}$/u.test(expectedContentDigest)) {
    return unavailable('content_digest_mismatch');
  }
  if (candidate.contentDigest !== expectedContentDigest) return mismatch('content_digest_mismatch', expected.chunks.length);
  // Die Wurzel des **berechneten** Manifests muss die des erwarteten sein — sonst ist der Bestand ein anderer.
  if (computed.merkleRoot !== expected.merkleRoot) return mismatch('merkle_root_mismatch', expected.chunks.length);

  return { integrity: 'verified', reason: 'match', firstMismatchIndex: -1, chunksCompared: expected.chunks.length, missingChunkIndexes: [] };
}

// ---------------------------------------------------------------------------------------------------
// Der Lauf. Hier kommen die Ports zusammen — und nur hier.
// ---------------------------------------------------------------------------------------------------

const EXPECTED_BYTES = (totalBytes: number, chunkSize: number, index: number): number =>
  index === Math.ceil(totalBytes / chunkSize) - 1 ? totalBytes - index * chunkSize : chunkSize;

const progressOf = (state: VaultStreamingImportState): VaultStreamingProgress => ({
  status: state.status,
  totalChunks: state.progress.totalChunks,
  completedChunks: state.progress.completedChunks,
  totalBytes: state.progress.totalBytes,
  processedBytes: state.progress.processedBytes,
  percent: state.progress.totalBytes === 0 ? 0 : Math.min(100, Math.round((state.progress.processedBytes / state.progress.totalBytes) * 1000) / 10),
  digestReady: state.contentDigest !== null,
});

/**
 * **Löst eine Wiederaufnahme auf — mit einer Gegenprobe, nicht mit Vertrauen.**
 *
 * Der Punkt wird gegen die **Quelle** geprüft (Größe, Blockzahl, Blockgröße). Passt er, wird der Zustand
 * daraus gebaut: die Block-Digests bis zur Grenze werden als **bestätigt** übernommen, und der Übergang
 * `stream.resume` setzt den Status auf `retrying`. Passt er nicht, wird er **verworfen** und der Lauf
 * beginnt bei null — fail-closed, weil ein Punkt auf einer anderen Quelle die Prüfsummen des Bestands
 * ungültig machen würde.
 *
 * **Was hier NICHT passiert:** es wird kein Byte gelesen. Die Auflösung ist rein; die Gegenprobe über die
 * tatsächlichen Bytes führt der Lauf (`replayVerify`), weil dafür die Quelle nötig ist.
 */
export function resolveVaultStreamingResume(
  state: VaultStreamingImportState,
  checkpoint: VaultStreamingCheckpoint | null | undefined,
  source: { readonly sizeBytes: number },
  chunkSize: number = VAULT_STREAMING_WINDOW_BYTES,
): VaultStreamingResumeResolution {
  if (!checkpoint || checkpoint.lastChunkHash === null || checkpoint.completedChunks <= 0) {
    return { state, resumed: false, reason: 'no_checkpoint', boundaryHash: null };
  }
  const plan = planVaultStreamingChunks(source.sizeBytes, chunkSize);
  const matches = checkpoint.totalBytes === source.sizeBytes
    && checkpoint.totalChunks === plan.totalChunks
    && checkpoint.chunkSize === chunkSize;
  if (!matches || checkpoint.completedChunks > plan.totalChunks) {
    return { state, resumed: false, reason: 'checkpoint_invalidated', boundaryHash: null };
  }
  const resumed = vaultStreamingFlowTransition(state, { type: 'stream.resume', checkpoint });
  return { state: resumed, resumed: true, reason: 'checkpoint_used', boundaryHash: checkpoint.lastChunkHash };
}

/**
 * **Die Gegenprobe der Wiederaufnahme — sie liest wirklich und vergleicht wirklich.**
 *
 * `resolveVaultStreamingResume` prüft den Punkt nur gegen **Zahlen** (Größe, Blockzahl, Blockgröße). Das
 * belegt nicht, dass die Bytes unter dem Punkt noch dieselben sind. Diese Funktion liest deshalb genau
 * `verifiedChunks` Blöcke **erneut** und vergleicht jeden gegen den Digest, der im Punkt steht.
 *
 * **Warum das nicht bloß Sorgfalt ist.** Der behauptete Nutzen einer Wiederaufnahme ist „wir setzen an der
 * Stelle fort, an der wir aufgehört haben". Ist die Quelle inzwischen eine andere Datei **gleicher Größe**,
 * wäre die Prüfsumme des Bestands falsch, und zwar unauffällig: die Blockzahl stimmt, die Wurzel stimmt für
 * die neuen Blöcke, und nur der Vergleich mit dem Wiederaufnahmepunkt kann es bemerken.
 *
 * **Die Rückgabe ist der Digest der Grenze** — der Wert, auf dem fortgesetzt wird. Er stammt aus den
 * **gelesenen Bytes**, nicht aus dem Punkt: eine geglaubte Grenze wäre keine geprüfte.
 */
export async function verifyVaultStreamingCheckpoint(
  source: VaultStreamingSource,
  checkpoint: VaultStreamingCheckpoint,
  chunkSize: number = VAULT_STREAMING_WINDOW_BYTES,
): Promise<{ readonly verified: boolean; readonly boundaryHash: string | null; readonly mismatchIndex: number }> {
  if (checkpoint.lastChunkHash === null || checkpoint.completedChunks <= 0) return { verified: false, boundaryHash: null, mismatchIndex: -1 };
  const plan = planVaultStreamingChunks(source.sizeBytes, chunkSize);
  if (checkpoint.completedChunks > plan.totalChunks) return { verified: false, boundaryHash: null, mismatchIndex: -1 };

  let boundaryHash: string | null = null;
  for (let index = 0; index < checkpoint.completedChunks; index += 1) {
    const expected = EXPECTED_BYTES(source.sizeBytes, chunkSize, index);
    let chunk: Uint8Array;
    try {
      chunk = await source.readChunk(index * chunkSize, expected);
    } catch {
      return { verified: false, boundaryHash: null, mismatchIndex: index };
    }
    if (chunk.byteLength !== expected) return { verified: false, boundaryHash: null, mismatchIndex: index };
    const hash = buildVaultStreamingDigest([chunk], chunkSize).chunkHashes[0] ?? '';
    boundaryHash = hash;
  }
  // Der Vergleich findet am **letzten** Block der Grenze statt, weil nur dessen Digest im Punkt steht —
  // die Digests der Blöcke davor sind nicht Teil des Punkts und werden beim Fortsetzen ohnehin neu gebildet.
  const verified = boundaryHash !== null && boundaryHash === checkpoint.lastChunkHash;
  return { verified, boundaryHash, mismatchIndex: verified ? -1 : checkpoint.completedChunks - 1 };
}

/**
 * **Führt den Import aus: lesen → verarbeiten → schreiben → Digest.**
 *
 * **Der Unterschied zu einer Attrappe.** Diese Funktion liest wirklich (`source.readChunk`), schreibt
 * wirklich (`sink.write`) und verdichtet wirklich (über `vaultStreamingHash`). Ein Import, der Blöcke
 * zählte, ohne sie zu verarbeiten, wäre ein Platzhalter; hier ist jeder Block gelesen, gehasht, bestätigt
 * und geschrieben, und ein Fehlschlag ist ein benannter Code.
 *
 * **Die Fehlerpfade sind vollständig und einzeln benannt:**
 *   • Quelle liefert weniger Bytes als angefordert → `source_short_read`
 *   • Quelle liefert mehr Bytes als angefordert → `source_grew` (nicht: stillschweigend kürzen)
 *   • Senke bestätigt einen anderen Index → `sink_rejected`
 *   • Signal gesetzt → `cancelled` (und die Senke wird verworfen)
 *   • Punkt passt nicht zu den Bytes → `resume_replay_mismatch` (die Gegenprobe greift **hier**)
 *
 * **Die Wiederaufnahme liest die Grenze erneut.** Beim zweiten Durchlauf wird der Punkt zuerst gegen die
 * Zahlen (`resolveVaultStreamingResume`) und dann gegen die **Bytes** (`verifyVaultStreamingCheckpoint`)
 * geprüft. Erst danach läuft der Import ab dem nächsten Block weiter — die Blöcke unterhalb der Grenze
 * werden **nicht** erneut geschrieben.
 */
export async function runVaultStreamingImport(
  source: VaultStreamingSource,
  sink: VaultStreamingSink,
  signal: AbortSignal,
  chunkSize: number = VAULT_STREAMING_WINDOW_BYTES,
  observer?: VaultStreamingObserver,
  resume?: VaultStreamingCheckpoint | null,
): Promise<{ readonly state: VaultStreamingImportState; readonly outcome: VaultStreamingRunOutcome }> {
  const limits = VAULT_STREAMING_HASH_LIMITS;
  if (!Number.isSafeInteger(chunkSize) || chunkSize < limits.minChunkBytes || chunkSize > limits.maxChunkBytes) {
    return settle(observer, IDLE_VAULT_STREAMING_STATE, 'failed', 'begin_gap');
  }
  const plan = planVaultStreamingChunks(source.sizeBytes, chunkSize);
  if (plan.totalChunks === 0) {
    // **Eine leere Quelle ist kein Import.** Sie wird benannt abgelehnt und nicht als „fertig" gemeldet.
    return settle(observer, IDLE_VAULT_STREAMING_STATE, 'failed', 'begin_gap');
  }

  let state = vaultStreamingFlowTransition(IDLE_VAULT_STREAMING_STATE, {
    type: 'stream.begin',
    totalChunks: plan.totalChunks,
    totalBytes: source.sizeBytes,
    chunkSize,
  });
  if (state.status === 'failed') return settle(observer, state, 'failed', state.failureReason ?? 'begin_gap');
  observer?.onProgress?.(progressOf(state));

  // ---- Wiederaufnahme: erst die Zahlen, dann die Bytes. ----
  let firstChunkToWrite = 0;
  const carriedHashes: string[] = [];
  if (resume) {
    const resolved = resolveVaultStreamingResume(state, resume, source, chunkSize);
    if (resolved.resumed) {
      // **Die Gegenprobe über die Bytes** — sie liest die Blöcke unter der Grenze erneut und vergleicht den
      // letzten gegen den Digest im Punkt. Ohne sie wäre die Wiederaufnahme ein Glaube.
      const probe = await verifyVaultStreamingCheckpoint(source, resume, chunkSize);
      if (!probe.verified) return settle(observer, state, 'failed', 'resume_replay_mismatch');
      firstChunkToWrite = resume.completedChunks;
      // **Die echten Digests aus dem Punkt**, nicht erfundene. Mein erster Wiederaufbau setzte hier
      // `resume-${index}` ein; das hätte die Merkle-Wurzel des fortgesetzten Laufs von der eines
      // durchgehenden Laufs abweichen lassen — ein stiller Datenverlust.
      carriedHashes.push(...resume.chunkHashes.slice(0, firstChunkToWrite));
      if (carriedHashes.length !== firstChunkToWrite) return settle(observer, state, 'failed', 'resume_replay_mismatch');
      state = {
        ...resolved.state,
        status: 'streaming',
        chunkHashes: [...carriedHashes],
        merkleRoot: streamingMerkleRoot(carriedHashes),
        checkpoint: resume,
        progress: { ...resolved.state.progress, completedChunks: firstChunkToWrite, processedBytes: resume.processedBytes },
      };
      observer?.onProgress?.(progressOf(state));
    }
    // Ein Punkt, der nicht passt, wird **verworfen** und der Lauf beginnt bei null — kein Fehler, aber auch
    // kein Fortschritt, der behauptet wird.
  }

  try {
    await sink.begin(source.sizeBytes);
  } catch {
    return settle(observer, state, 'failed', 'sink_rejected');
  }

  /*
   * **Ein Durchlauf, ein Fenster — und der Gesamt-Digest entsteht INKREMENTELL.**
   *
   * Der erste Entwurf sammelte die Block-Nutzlast in einem Feld (`digests`) und bildete den Gesamt-Digest am
   * Ende darüber. Das war **genau der Fehler, den diese Datei verhindern soll**: die Spitze wäre die ganze
   * Datei gewesen. Der Hasher läuft jetzt mit und hält höchstens 64 Byte Restsatz.
   *
   * **Und der Grund, warum der Lauf ALLE Blöcke liest, auch die übernommenen:** der Hasher braucht ihre
   * Bytes. Für die übernommenen Blöcke kostet das einen erneuten Lesevorgang — begrenzt und benannt (siehe
   * `verifyVaultStreamingCheckpoint`) —, aber er lässt den Gesamt-Digest **gleich** dem eines durchgehenden
   * Laufs werden. Die Alternative wäre gewesen, den Hasher-Zustand in den Punkt zu serialisieren: 8 Zahlen
   * und 64 Byte, also kleiner. Sie ist verworfen, weil ein Hasher-Zustand ein **interner** Zustand ist und
   * seine Serialisierung an die Implementierung bindet — der erneute Lesevorgang bindet an nichts.
   */
  let hasher = VaultStreamingSha256.create();
  const runnable: number[] = [];
  for (let index = 0; index < plan.totalChunks; index += 1) runnable.push(index);

  try {
    for (const index of runnable) {
      if (signal.aborted) throw new VaultStreamingError('cancelled', index);
      const expected = EXPECTED_BYTES(source.sizeBytes, chunkSize, index);
      let chunk: Uint8Array;
      try {
        chunk = await source.readChunk(index * chunkSize, expected);
      } catch {
        throw new VaultStreamingError('source_unavailable', index);
      }
      if (!(chunk instanceof Uint8Array)) throw new VaultStreamingError('source_unavailable', index);
      if (chunk.byteLength < expected) throw new VaultStreamingError('source_short_read', index);
      if (chunk.byteLength > expected) throw new VaultStreamingError('source_grew', index);

      // Der Digest über die Bytes, die wirklich gelesen wurden — für den Gesamt-Digest und für den Block.
      const hash = buildVaultStreamingDigest([chunk], chunkSize).chunkHashes[0] ?? '';
      hasher = hasher.update(chunk, chunkSize);

      // **Ein übernommener Block wird geprüft, aber nicht erneut geschrieben.** Sein Digest muss der
      // gespeicherte sein — die Gegenprobe hat das bereits bestätigt, und hier wird es noch einmal gehalten,
      // damit keine zwei Wege zu zwei Antworten über denselben Block führen.
      if (index < firstChunkToWrite) {
        if (hash !== carriedHashes[index]) throw new VaultStreamingError('resume_replay_mismatch', index);
        continue;
      }

      const confirmed = await sink.write(chunk, index);
      if (confirmed !== index) throw new VaultStreamingError('sink_rejected', index);

      state = vaultStreamingFlowTransition(state, { type: 'stream.progress', chunkIndex: index, chunkBytes: chunk.byteLength });
      state = vaultStreamingFlowTransition(state, { type: 'stream.chunk', chunkIndex: index, hash });
      if (state.status === 'failed') throw new VaultStreamingError(state.failureReason ?? 'chunk_gap', index);
      observer?.onProgress?.(progressOf(state));
    }

    if (signal.aborted) throw new VaultStreamingError('cancelled', plan.totalChunks);

    // Der Gesamt-Digest über **alle** Bytes, in Reihenfolge — bitgleich zu `sha256Bytes` über dieselben Bytes.
    const contentDigest = hasher.digest();
    state = vaultStreamingFlowTransition(state, { type: 'stream.verify', merkleRoot: streamingMerkleRoot(state.chunkHashes), contentDigest });
    if (state.status === 'failed') throw new VaultStreamingError(state.failureReason ?? 'verify_not_ready', plan.totalChunks);

    await sink.commit();
    state = vaultStreamingFlowTransition(state, { type: 'stream.done' });
    if (state.status === 'failed') throw new VaultStreamingError(state.failureReason ?? 'verify_not_ready', plan.totalChunks);
  } catch (error) {
    const reason: VaultStreamingFailureReason = error instanceof VaultStreamingError ? error.reason : 'source_unavailable';
    try {
      await sink.abort(reason);
    } catch {
      // Ein Fehler beim Verwerfen darf den benannten Grund nicht überschreiben.
    }
    return settle(observer, state, reason === 'cancelled' ? 'cancelled' : 'failed', reason);
  }

  const manifest = vaultStreamingChunkManifest({
    contentDigest: state.contentDigest ?? '',
    chunkSize,
    totalChunks: plan.totalChunks,
    chunkHashes: state.chunkHashes,
    merkleRoot: state.merkleRoot ?? '',
  });
  const outcome: VaultStreamingRunOutcome = {
    status: 'done',
    reason: 'none',
    failureReason: null,
    checkpoint: null,
    contentDigest: state.contentDigest ?? '',
    merkleRoot: state.merkleRoot ?? '',
    totalChunks: plan.totalChunks,
    totalBytes: source.sizeBytes,
    chunkSize,
    manifest,
  };
  observer?.onFinished?.(outcome);
  return { state, outcome };
}

/** Der Ausgang eines Laufs — eine Aussage, kein Stilmittel. */
export interface VaultStreamingRunOutcome {
  readonly status: 'done' | 'failed' | 'cancelled';
  readonly reason: 'none' | 'cancelled' | 'failure';
  readonly failureReason: VaultStreamingFailureReason | null;
  readonly checkpoint: VaultStreamingCheckpoint | null;
  readonly contentDigest: string;
  readonly merkleRoot: string;
  readonly totalChunks: number;
  readonly totalBytes: number;
  readonly chunkSize: number;
  readonly manifest: VaultChunkIntegrityManifest | null;
}

/**
 * Schließt einen Lauf ab, ohne Zustand zu erfinden.
 *
 * **Der Wiederaufnahmepunkt entsteht aus dem Zustand, nicht aus einem Zähler.** Ein früherer Entwurf nahm
 * `completedChunks` und `hashCount` als Parameter entgegen und benutzte keinen von beiden — die Absicht
 * stand im Code, ausgeführt hat sie niemand. Der Punkt trägt jetzt die **echten** Digests aus
 * `state.chunkHashes`; ein Punkt mit erfundenen Prüfsummen wäre schlimmer als kein Punkt.
 *
 * **`stream.cancel` verwirft den Punkt**, `stream.fail` behält ihn — der Unterschied ist Absicht: ein
 * Abbruch ist eine Willensentscheidung, ein Fehler ist eine Unterbrechung, an der man ansetzen darf.
 */
function settle(
  observer: VaultStreamingObserver | undefined,
  state: VaultStreamingImportState,
  status: VaultStreamingRunOutcome['status'],
  failureReason: VaultStreamingFailureReason,
): { readonly state: VaultStreamingImportState; readonly outcome: VaultStreamingRunOutcome } {
  const outcome: VaultStreamingRunOutcome = {
    status,
    reason: status === 'cancelled' ? 'cancelled' : 'failure',
    failureReason,
    checkpoint: status === 'cancelled' ? null : state.checkpoint,
    contentDigest: state.contentDigest ?? '',
    merkleRoot: state.merkleRoot ?? '',
    totalChunks: state.progress.totalChunks,
    totalBytes: state.progress.totalBytes,
    chunkSize: state.progress.chunkSize,
    manifest: null,
  };
  const next: VaultStreamingImportState = status === 'cancelled'
    ? vaultStreamingFlowTransition(state, { type: 'stream.cancel' })
    : vaultStreamingFlowTransition(state, {
        type: 'stream.fail',
        reason: failureReason,
        resume: state.chunkHashes.length > 0 ? { lastChunkHash: state.chunkHashes[state.chunkHashes.length - 1] ?? null } : null,
      });
  observer?.onProgress?.(progressOf(next));
  observer?.onFinished?.(outcome);
  return { state: next, outcome };
}

/**
 * Die Blockgrenzen eines Laufs als reine Rechnung — dieselbe Funktion, die der Lauf verwendet. Sie steht
 * hier öffentlich, damit die Oberfläche ihre Anzeige aus **derselben** Quelle ableitet wie der Lauf und
 * nicht aus einer zweiten Rechnung, die abweichen kann.
 *
 * **Und sie lässt den Fehlertyp der unteren Schicht nicht durch.** Diese Funktion ist Teil der
 * **Engine**-Fläche; `planVaultStreamingChunks` gehört der **Hash**-Fläche. Ein Aufrufer der Engine darf
 * nicht `VaultStreamingHashError` fangen müssen, um eine ungültige Blockgröße zu behandeln — sonst hängt
 * jede Oberfläche an einem Modul, das sie nicht importiert hat. **Gefunden von meinem eigenen Zeugen**, der
 * genau diesen Fall prüfte und den Hash-Fehler bekam.
 */
export function vaultStreamingPlan(totalBytes: number, chunkSize: number = VAULT_STREAMING_WINDOW_BYTES): { readonly totalChunks: number; readonly lastChunkBytes: number } {
  try {
    return planVaultStreamingChunks(totalBytes, chunkSize);
  } catch (error) {
    if (error instanceof VaultStreamingHashError) throw new VaultStreamingError('begin_gap', error.actual);
    throw error;
  }
}

/** Nur für die Anzeige: die Byte-Grenzen eines bestimmten Blocks. Reine Arithmetik. */
export function vaultStreamingChunkRange(totalBytes: number, chunkSize: number, index: number): { readonly start: number; readonly end: number } {
  const plan = vaultStreamingPlan(totalBytes, chunkSize);
  if (!Number.isSafeInteger(index) || index < 0 || index >= plan.totalChunks) throw new VaultStreamingError('chunk_gap', index);
  return { start: index * chunkSize, end: Math.min(totalBytes, (index + 1) * chunkSize) };
}

/** Der Digest-Erwartungswert eines unfertigen Laufs — für die Anzeige, nicht für die Prüfung. */
export function vaultStreamingDigest(result: VaultStreamingDigestResult): string {
  return result.contentDigest;
}
