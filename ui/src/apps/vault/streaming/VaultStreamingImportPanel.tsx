// STATUS: PLATIN — die Oberfläche. Sie ist DÜNN, und das ist eine Entscheidung, keine Bequemlichkeit.
//
// **Was hier NICHT liegt, und warum.** Jede Entscheidung dieses Imports liegt in
// `shared/vault/streaming/vaultStreamingEngine.ts`: der Übergang des Fortschritts, die Reihenfolge der
// Prüfungen, der Abbruch, der Fehlergrund, die Blockrechnung. Diese Datei **ruft** die Engine und
// **rendert**, was sie liefert. Es gibt hier keine zweite Fortschrittsrechnung, keine zweite Grenze und
// kein zweites Urteil über „ist das gültig" — eine zweite Wahrheit über dieselbe Datei wäre genau die
// Doppelung, die dieses Projekt mehrfach bezahlt hat.
//
// **Was hier liegen MUSS, und warum.** Zwei Dinge, die keine Engine leisten kann:
//   1. Der **Abbruch über die Tastatur und die Maus** — `AbortController` gehört an ein Ereignis.
//   2. Das **Textäquivalent des Fortschrittsbalkens**. Ein Balken ohne Zahl ist für einen Screenreader
//      nichts; die Zahl kommt aus der Engine (`percent`, `completedChunks`, `processedBytes`), aber sie
//      **sichtbar** zu machen ist eine Aufgabe der Oberfläche.
//
// **`role="progressbar"` mit allen drei Werten, und ein sichtbares Textäquivalent.** Das ist Pflicht und
// keine Verzierung. Zusätzlich: `aria-live` für den Status, damit ein Screenreader den Wechsel mitbekommt,
// ohne dass der Nutzer ihn suchen muss.
//
// **Die Senke kommt von aussen.** Diese Datei kennt keine `VaultFile`-Struktur und kein Plattform-API: sie
// bekommt eine `VaultStreamingTarget`-Quelle und drei Rückrufe. Damit ist sie ohne Tauri-Host, ohne
// Dateisystem und ohne `jsdom` prüfbar — und sie kann **nicht** versehentlich den 25-MiB-In-Memory-Leser
// benutzen, weil sie ihn nicht kennt.
//
// **Kein `dangerouslySetInnerHTML`, kein `innerHTML`, keine externe Ressource.** Der Dateiname kommt aus
// einer Nutzereingabe und wird als **Text** gerendert, nie als Markup — React tut das von sich aus, und
// diese Datei tut nichts, was es umgeht.
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileUp, ShieldAlert, Upload, XCircle } from 'lucide-react';
import { streamingDigestRecord, VAULT_STREAMING_WINDOW_BYTES, type VaultStreamingDigestRecord } from '../../../shared/vault/streaming/vaultStreamingHash';
import {
  assertVaultStreamingWritable,
  runVaultStreamingImport,
  vaultStreamingPlan,
  verifyVaultStreamingIntegrity,
  type VaultStreamingFailureReason,
  type VaultStreamingProgress,
  type VaultStreamingRunOutcome,
  type VaultStreamingSink,
  type VaultStreamingWritabilityFacts,
} from '../../../shared/vault/streaming/vaultStreamingEngine';
import type { VaultChunkIntegrityManifest } from '../../../shared/contracts/workspace';

/**
 * Was die Senke über den **fertigen** Bestand aussagt.
 *
 * **Warum der Digest hier noch einmal berechnet wird.** Die Engine liefert den Digest über die Bytes, die
 * sie **gelesen** hat. Ob die Senke genau diese Bytes **behalten** hat, ist eine andere Frage — eine Senke
 * kann kürzen, umbrechen oder verwerfen. Deshalb liest die Oberfläche den Bestand nach dem Abschluss über
 * `readBack` **zurück** und vergleicht. Das ist die einzige Stelle, an der „geschrieben" zu „nachweislich
 * angekommen" wird, und sie kostet einen Lesevorgang über eine Senke, keinen zweiten Puffer.
 */
export interface VaultStreamingImportedAsset {
  /** Der Digest über die **zurückgelesenen** Bytes. */
  readonly contentDigest: string;
  readonly chunkIntegrity: VaultChunkIntegrityManifest;
  readonly sizeBytes: number;
}

/** Die Quelle, die importiert werden soll. Strukturell — keine `File`-Abhängigkeit. */
export interface VaultStreamingTarget {
  readonly name: string;
  readonly sizeBytes: number;
  readonly mimeType: string;
  readChunk(offset: number, length: number): Promise<Uint8Array>;
}

export interface VaultStreamingImportPanelProps {
  readonly writability: VaultStreamingWritabilityFacts;
  /**
   * Öffnet ein Ziel und gibt die Senke zurück. Der Aufrufer entscheidet, **wohin** geschrieben wird —
   * diese Komponente kennt keinen Pfad und nennt keinen in einer Meldung.
   */
  openSink(target: VaultStreamingTarget): Promise<VaultStreamingSink>;
  /**
   * Liest den **fertigen** Bestand zurück. Ohne diese Funktion ist die Prüfung `unavailable` und **nicht**
   * `verified` — „nicht geprüft" ist kein bestandener Test.
   */
  readBack?(): Promise<Uint8Array>;
  /** Wird **nur** nach einer bestandenen Prüfung gerufen. */
  onImported?(asset: VaultStreamingImportedAsset): void;
  showToast?(message: string): void;
  /** Wie viele Blöcke gleichzeitig in Arbeit sein dürfen. Vorgabe: einer. */
  windowBytes?: number;
}

type PanelPhase = 'idle' | 'running' | 'cancelling' | 'done' | 'failed' | 'denied';

/** Die Meldung zu einem Fehlergrund. **Kein Pfad, kein Dateiname, keine Nutzlast — nur die Ursache.** */
const FAILURE_TEXT: Readonly<Record<VaultStreamingFailureReason, string>> = Object.freeze({
  cancelled: 'The import was cancelled. The target was discarded; nothing was kept.',
  source_unavailable: 'The source could not be read any more. Nothing was written.',
  source_short_read: 'The source returned fewer bytes than it announced. The import was stopped and the target discarded.',
  source_grew: 'The source returned more bytes than it announced. The import was stopped and the target discarded, because a digest over unexpected bytes would be meaningless.',
  sink_rejected: 'The target did not confirm the block it accepted. The import was stopped.',
  resume_source_changed: 'The source changed since the last attempt. The import was restarted from the beginning.',
  resume_replay_mismatch: 'The source no longer matches the point where the last attempt stopped. It was verified against the stored digests and did not match, so nothing was resumed.',
  tamper_detected: 'The import contradicted itself. Nothing was kept.',
  verify_not_ready: 'The import ended before it could be sealed. Nothing was kept.',
  verify_order: 'The import steps were out of order. Nothing was kept.',
  not_writable: 'This Vault does not accept a write right now.',
  begin_gap: 'The import could not be started for this source.',
  chunk_gap: 'A block of the import was missing. The import was stopped.',
  chunk_mismatch: 'A block did not match the expected position. The import was stopped.',
  chunk_after_done: 'A block arrived after the import was sealed. It was refused.',
  failure_after_done: 'A failure was reported after the import was sealed. The seal stands; the report is refused.',
  cancel_after_done: 'A cancellation arrived after the import was sealed. The seal stands.',
  resume_gap: 'The import cannot be resumed from this state.',
  resume_after_done: 'The import is already sealed; resuming it would rewrite a verified asset.',
  unknown_event: 'The import received a step it does not know. Nothing was written.',
});

/**
 * Die sichtbare Zahl. **Das Textäquivalent, ohne das ein Fortschrittsbalken für einen Screenreader leer
 * ist.** Gerundet wird auf ganze Prozent, und der Nenner ist immer sichtbar — „73 %" ohne „von 25,0 MiB"
 * lässt den Nutzer die Größe raten.
 */
export function formatVaultStreamingProgress(progress: VaultStreamingProgress): string {
  return `${progress.percent}% · Block ${progress.completedChunks} von ${progress.totalChunks} · ${formatBytes(progress.processedBytes)} von ${formatBytes(progress.totalBytes)}`;
}

/** Bytes als lesbare Zahl, mit fester Einheit statt geratener. Reine Arithmetik, keine Formatierungslocale. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ['KiB', 'MiB', 'GiB'] as const;
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unit]}`;
}

const EMPTY_PROGRESS: VaultStreamingProgress = Object.freeze({
  status: 'idle', totalChunks: 0, completedChunks: 0, totalBytes: 0, processedBytes: 0, percent: 0, digestReady: false,
});

/**
 * Bildet den Datensatz über die **zurückgelesenen** Bytes — über **dieselbe** Funktion, die den Datensatz
 * des Imports bildet.
 *
 * **Warum das hier stehen darf, obwohl diese Datei dünn sein soll.** Es ist **keine** Entscheidung — es ist
 * die Anwendung **derselben** Funktion auf einen zweiten Bestand, und genau das macht den Vergleich
 * „geschrieben gegen gelesen" überhaupt möglich. Eine eigene Blockaufteilung wäre eine zweite Wahrheit;
 * eine Wiederverwendung ist eine. **Eine Sicht, keine Kopie:** die Blöcke entstehen über `subarray`.
 */
function digestRecordOf(stored: Uint8Array, windowBytes: number): VaultStreamingDigestRecord {
  return streamingDigestRecord(stored, windowBytes);
}

export const VaultStreamingImportPanel: React.FC<VaultStreamingImportPanelProps> = ({
  writability,
  openSink,
  readBack,
  onImported,
  showToast,
  windowBytes = VAULT_STREAMING_WINDOW_BYTES,
}) => {
  const [targets, setTargets] = useState<readonly VaultStreamingTarget[]>([]);
  const [phase, setPhase] = useState<PanelPhase>('idle');
  const [progress, setProgress] = useState<VaultStreamingProgress>(EMPTY_PROGRESS);
  const [outcome, setOutcome] = useState<VaultStreamingRunOutcome | null>(null);
  const [verification, setVerification] = useState<'unverified' | 'verified' | 'mismatch' | 'unavailable'>('unverified');
  const [message, setMessage] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Die Freigabe wird aus **einer** Quelle abgeleitet: der Engine. Kein zweites Urteil in der Oberfläche.
  const writable = useMemo(() => assertVaultStreamingWritable(writability), [writability]);
  const totalBytes = useMemo(() => targets.reduce((sum, target) => sum + target.sizeBytes, 0), [targets]);
  const plan = useMemo(() => (totalBytes > 0 ? vaultStreamingPlan(totalBytes, windowBytes) : { totalChunks: 0, lastChunkBytes: 0 }), [totalBytes, windowBytes]);

  const acceptFiles = useCallback((files: readonly File[]) => {
    // **Eine Datei, ein Lauf.** Mehrere Dateien in einem Lauf wären mehrere Digests in einem Manifest; die
    // Engine bildet **einen** Bestand. Was nicht hineinpasst, wird benannt abgelehnt statt still verschluckt.
    const usable = files.filter((file) => file.size > 0 && Number.isSafeInteger(file.size));
    if (usable.length === 0) {
      setMessage('No readable file was selected. A file needs at least one byte.');
      return;
    }
    const selected = usable.slice(0, 1);
    setTargets(selected.map((file) => ({
      name: file.name,
      sizeBytes: file.size,
      mimeType: file.type || 'application/octet-stream',
      readChunk: async (offset, length) => new Uint8Array(await file.slice(offset, Math.min(file.size, offset + length)).arrayBuffer()),
    })));
    setOutcome(null);
    setVerification('unverified');
    setProgress(EMPTY_PROGRESS);
    setPhase('idle');
    setMessage(usable.length > 1
      ? `${usable.length} files were selected. This import handles one file at a time; ${selected[0]?.name ?? 'the first'} was kept.`
      : null);
  }, []);

  const beginImport = useCallback(async () => {
    const target = targets[0];
    if (!target) {
      setMessage('Choose a file first.');
      return;
    }
    if (!writable.allowed) {
      setPhase('denied');
      setMessage(writable.message);
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase('running');
    setMessage(null);
    setOutcome(null);
    setVerification('unverified');
    setProgress({ ...EMPTY_PROGRESS, totalBytes: target.sizeBytes, status: 'streaming' });

    try {
      const sink = await openSink(target);
      const run = await runVaultStreamingImport(
        target,
        sink,
        controller.signal,
        windowBytes,
        { onProgress: (next) => setProgress(next) },
      );
      setOutcome(run.outcome);

      if (run.outcome.status === 'cancelled') {
        setPhase('failed');
        setMessage(FAILURE_TEXT.cancelled);
        return;
      }
      if (run.outcome.status !== 'done' || run.outcome.manifest === null) {
        setPhase('failed');
        setMessage(FAILURE_TEXT[run.outcome.failureReason ?? 'source_unavailable']);
        return;
      }

      /*
       * **Die Prüfung der Kette: geschrieben → ZURÜCKGELESEN → verglichen.**
       *
       * Ohne `readBack` bleibt es bei `unavailable` — und `unavailable` ist **nicht** `verified`. Eine
       * Oberfläche, die ohne Rückweg „bestanden" meldet, wäre genau die Anwesenheits-Zusicherung, die der
       * Auftrag mit Zahlen widerlegt hat.
       */
      if (!readBack) {
        setVerification('unavailable');
        setPhase('done');
        setMessage('The import finished. This build cannot read the target back, so the stored bytes could not be compared — the result is not verified, only sealed.');
        showToast?.('Import finished, unverified.');
        return;
      }
      const stored = await readBack();
      const record = digestRecordOf(stored, windowBytes);
      const verdict = verifyVaultStreamingIntegrity(
        { contentDigest: record.contentDigest, digestAlgorithm: 'SHA-256', computed: record.chunkIntegrity },
        run.outcome.manifest,
        run.outcome.contentDigest,
      );
      if (verdict.integrity === 'verified') {
        setVerification('verified');
        setPhase('done');
        setMessage(null);
        onImported?.({ contentDigest: run.outcome.contentDigest, chunkIntegrity: run.outcome.manifest, sizeBytes: stored.byteLength });
        showToast?.('Import verified against the stored bytes.');
      } else {
        setVerification(verdict.integrity === 'mismatch' ? 'mismatch' : 'unavailable');
        setPhase('failed');
        setMessage(verdict.integrity === 'mismatch'
          ? `The stored bytes do not match the import (${verdict.reason}, first difference at block ${verdict.firstMismatchIndex}). Nothing was accepted.`
          : `The stored bytes could not be compared (${verdict.reason}). The result is not verified.`);
      }
    } catch (error) {
      // **Keine Nutzlast in der Meldung:** nur der Fehler**name** wird genannt, nie sein Text — ein Text
      // könnte einen Pfad oder einen Dateinamen enthalten.
      setPhase('failed');
      setMessage(error instanceof Error && error.message.startsWith('vault_streaming_')
        ? 'The import was stopped by the streaming layer. Nothing was kept.'
        : 'The import was stopped before it could be sealed. Nothing was kept.');
    } finally {
      abortRef.current = null;
    }
  }, [targets, writable, openSink, windowBytes, readBack, onImported, showToast]);

  const cancel = useCallback(() => {
    setPhase('cancelling');
    abortRef.current?.abort();
  }, []);

  const busy = phase === 'running' || phase === 'cancelling';
  const canStart = targets.length > 0 && !busy && writable.allowed;
  const percent = Math.max(0, Math.min(100, progress.percent));

  return (
    <section
      className="rounded-2xl border border-white/10 bg-slate-900/60 p-5"
      aria-label="Streamed Vault import"
      data-vault-streaming-import="root"
      data-vault-streaming-phase={phase}
    >
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
        <FileUp aria-hidden="true" className="h-4 w-4 text-cyan-300" />
        Import a large asset in blocks
      </h2>
      <p className="mt-1 text-[0.6875rem] text-slate-400">
        The file is read and written one block at a time. It is never held as a whole, so the import works
        for assets that would not fit in the transient window.
      </p>

      {/* --------------------------------------------------------------------------------------------- */}
      {/* Die Ablehnung. Sie steht VOR dem Auswahlbereich, damit sie nicht übersehen wird — und sie
          nennt den Grund, nicht nur die Ablehnung. */}
      {/* --------------------------------------------------------------------------------------------- */}
      {!writable.allowed && (
        <p role="alert" data-vault-streaming-denial={writable.reason} className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[0.6875rem] text-amber-100">
          <ShieldAlert aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{writable.message}</span>
        </p>
      )}

      {/* --------------------------------------------------------------------------------------------- */}
      {/* Auswahl: Datei-Knopf + Drop-Ziel. BEIDE Wege, weil ein Drop-Ziel allein nicht bedienbar ist. */}
      {/* --------------------------------------------------------------------------------------------- */}
      <div
        className={`mt-3 rounded-xl border border-dashed p-4 text-center transition-colors ${dragging ? 'border-cyan-400/70 bg-cyan-500/5' : 'border-white/15 bg-black/20'}`}
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (busy) return;
          acceptFiles(Array.from(event.dataTransfer.files));
        }}
        data-vault-streaming-dropzone={dragging ? 'active' : 'idle'}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="sr-only"
          aria-label="Choose a file to import in blocks"
          disabled={busy || !writable.allowed}
          onChange={(event) => {
            acceptFiles(Array.from(event.target.files ?? []));
            // Damit dieselbe Datei nach einem Fehlversuch erneut gewählt werden kann.
            if (fileInputRef.current) fileInputRef.current.value = '';
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy || !writable.allowed}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-100 transition-colors hover:border-cyan-400/50 hover:bg-cyan-500/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.02] disabled:text-slate-500"
          data-vault-streaming-action="choose"
        >
          <Upload aria-hidden="true" className="h-3.5 w-3.5" />
          Choose a file
        </button>
        <p className="mt-2 text-[0.625rem] text-slate-500">…or drop one here. One file per import.</p>

        {targets[0] && (
          <p className="mt-2 truncate font-mono text-[0.6875rem] text-slate-200" title={targets[0].name} data-vault-streaming-target>
            {targets[0].name} · {formatBytes(targets[0].sizeBytes)} · {plan.totalChunks} blocks
          </p>
        )}
      </div>

      {/* --------------------------------------------------------------------------------------------- */}
      {/* Der Fortschritt. role="progressbar" mit ALLEN drei Werten UND einem sichtbaren Textäquivalent. */}
      {/* --------------------------------------------------------------------------------------------- */}
      <div className="mt-4">
        <div className="flex items-center justify-between text-[0.625rem] text-slate-400">
          <span>Progress</span>
          <span className="font-mono tabular-nums" data-vault-streaming-percent>{percent.toFixed(1)}%</span>
        </div>
        <div
          role="progressbar"
          aria-label="Import progress"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuetext={formatVaultStreamingProgress(progress)}
          data-vault-streaming-progressbar
          className="mt-1 h-2 overflow-hidden rounded-full bg-black/40"
        >
          <div
            className={`h-full rounded-full transition-[width] duration-150 ${phase === 'failed' ? 'bg-rose-500/70' : phase === 'done' ? 'bg-emerald-500/70' : 'bg-cyan-500/70'}`}
            style={{ width: `${percent}%` }}
          />
        </div>
        {/* **Das Textäquivalent.** Ein Balken ohne diese Zeile ist für einen Screenreader nichts. */}
        <p className="mt-1 font-mono text-[0.625rem] tabular-nums text-slate-400" data-vault-streaming-progress-text>
          {formatVaultStreamingProgress(progress)}
        </p>
      </div>

      {/* --------------------------------------------------------------------------------------------- */}
      {/* Aktionen. Abbrechen ist nur während eines Laufs aktiv — ein Abbruch ohne Lauf wäre eine Lüge. */}
      {/* --------------------------------------------------------------------------------------------- */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => { void beginImport(); }}
          disabled={!canStart}
          className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-cyan-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
          data-vault-streaming-action="start"
        >
          <Upload aria-hidden="true" className="h-3.5 w-3.5" />
          {phase === 'done' ? 'Import again' : 'Start import'}
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={phase !== 'running'}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 transition-colors hover:border-rose-400/50 hover:bg-rose-500/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-slate-500"
          data-vault-streaming-action="cancel"
        >
          <XCircle aria-hidden="true" className="h-3.5 w-3.5" />
          Cancel
        </button>
        {/* **Ein gesperrter Knopf braucht den Grund daneben** — eine stumme Ablehnung ist eine Zumutung. */}
        {!canStart && !busy && (
          <span className="text-[0.625rem] text-slate-500">
            {writable.allowed ? 'Choose a file to enable the import.' : 'The import is unavailable for the reason above.'}
          </span>
        )}
      </div>

      {/* --------------------------------------------------------------------------------------------- */}
      {/* Status und Fehler. `aria-live` für den Wechsel, `role="alert"` für den Fehler. */}
      {/* --------------------------------------------------------------------------------------------- */}
      <div aria-live="polite" aria-atomic="true" data-vault-streaming-status={phase}>
        {phase === 'done' && verification === 'verified' && (
          <p className="mt-3 flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[0.6875rem] text-emerald-100" data-vault-streaming-verification="verified">
            <CheckCircle2 aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Import sealed and verified against the stored bytes: {outcome?.totalChunks ?? 0} blocks,{' '}
              {outcome ? formatBytes(outcome.totalBytes) : '—'}. Digest <code className="font-mono">{outcome?.contentDigest.slice(0, 16) ?? ''}…</code>
            </span>
          </p>
        )}
        {phase === 'done' && verification === 'unavailable' && (
          <p className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[0.6875rem] text-amber-100" data-vault-streaming-verification="unavailable">
            <AlertTriangle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{message ?? 'The import finished but could not be verified.'}</span>
          </p>
        )}
        {phase === 'failed' && message && (
          <p role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[0.6875rem] text-rose-100" data-vault-streaming-verification={verification === 'mismatch' ? 'mismatch' : 'failed'}>
            <XCircle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{message}</span>
          </p>
        )}
        {phase !== 'failed' && phase !== 'done' && message && (
          <p role="status" className="mt-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[0.6875rem] text-slate-300">{message}</p>
        )}
      </div>
    </section>
  );
};

export default VaultStreamingImportPanel;
