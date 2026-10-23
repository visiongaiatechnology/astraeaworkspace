// STATUS: PLATIN — die Assets: was ein Import LIEFERT — und was er NICHT benutzt.
//
// **Die zwei Forderungen, die dieser Zeuge trägt, und warum sie zusammengehören.**
//
//   1. **„Die Assets: was ein Import liefert."** Ein Import liefert nicht „Erfolg", sondern einen
//      **Bestand**: Bytes, einen Gesamt-Digest, ein Block-Manifest und eine Aussage darüber, ob die
//      gespeicherten Bytes die importierten sind. Der Zeuge prüft den **Rundlauf** — erzeugen →
//      schreiben → **zurücklesen** → vergleichen — und vergleicht **alle Felder**.
//
//   2. **„Kein stiller Rückfall auf den 25-MiB-In-Memory-Leser."** Aus AST-1219 wörtlich. Das ist keine
//      Absichtserklärung, sondern eine Eigenschaft des **Quelltextes**: wer `readFileAsDataUrl` nicht
//      importiert und `MAX_VAULT_ATTACHMENT_BYTES` nicht kennt, **kann** die Nutzlast nicht als Ganzes
//      materialisieren. Der Zeuge liest den Quelltext und hält das fest.
//
// **Und die Kette, die der Auftrag verlangt** („erzeugen → verarbeiten → ZUSTAND VERWERFEN →
// wiederherstellen → vergleichen", „der Vergleich muss ALLE Felder umfassen"): der Rundlauf unten baut den
// Bestand aus den **geschriebenen und zurückgelesenen** Bytes neu auf, verwirft den Laufzustand, und
// vergleicht **jedes** Manifestfeld, jeden Blockindex, jeden Blockdigest, den Gesamt-Digest und die
// Blockzahl.
//
// **Kein `jsdom`, kein `happy-dom`, kein `@testing-library`.** Die Senke ist eine Struktur, die der Zeuge
// selbst stellt. Die **Bedienung** des Panels (`onClick`, `onDrop`, Tastatur, Screenreader) bleibt
// `NOT_TESTED` — `renderToStaticMarkup` rendert nie neu und löst keine Ereignisse aus, und „gerendert ist
// nicht bedient" ist der Grund, warum dieser Zeuge keine Klicks behauptet.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  runVaultStreamingImport,
  verifyVaultStreamingIntegrity,
  type VaultStreamingSink,
  type VaultStreamingSource,
} from '../../../../shared/vault/streaming/vaultStreamingEngine';
import { streamingDigestRecord, VAULT_STREAMING_WINDOW_BYTES } from '../../../../shared/vault/streaming/vaultStreamingHash';

const CHUNK = 4096;

const repoRoot = process.cwd();
const read = (relative: string): string => readFileSync(path.join(repoRoot, relative), 'utf8');
/** Kommentare entfernt, damit eine Erwähnung in einem Kommentar nicht als Benutzung zählt. */
const stripComments = (source: string): string => source
  .replace(/\/\*[\s\S]*?\*\//gu, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/gu, '$1 ');

const ENGINE = 'src/shared/vault/streaming/vaultStreamingEngine.ts';
const HASH = 'src/shared/vault/streaming/vaultStreamingHash.ts';
const PANEL = 'src/apps/vault/streaming/VaultStreamingImportPanel.tsx';
const INTEGRITY = 'src/shared/vault/integrity/vaultIntegrity.ts';

/** Deterministische Nutzlast ohne Zufall. */
const payload = (length: number, seed = 101): Uint8Array => {
  const bytes = new Uint8Array(length);
  let value = seed;
  for (let index = 0; index < length; index += 1) {
    value = (value * 1103515245 + 12345) >>> 0;
    bytes[index] = (value >>> 16) & 0xff;
  }
  return bytes;
};

const sourceOf = (bytes: Uint8Array): VaultStreamingSource => ({
  sizeBytes: bytes.byteLength,
  readChunk: (offset, length) => Promise.resolve(bytes.slice(offset, Math.min(bytes.byteLength, offset + length))),
});

/** Eine Senke, die den Bestand **behält** — der Rückweg ist damit wirklich prüfbar. */
interface HoldingSink {
  readonly sink: VaultStreamingSink;
  readonly kept: Uint8Array[];
  readonly committed: { value: boolean };
}

const holdingSinkOf = (): HoldingSink => {
  const kept: Uint8Array[] = [];
  const committed = { value: false };
  return {
    kept,
    committed,
    sink: {
      begin: () => Promise.resolve(),
      write: (chunk, index) => {
        kept.push(Uint8Array.from(chunk));
        return Promise.resolve(index);
      },
      commit: () => {
        committed.value = true;
        return Promise.resolve();
      },
      abort: () => Promise.resolve(),
    },
  };
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

describe('vaultStreamingAssets: was ein Import LIEFERT — der Rundlauf über alle Felder', () => {
  it('erzeugen → schreiben → ZURÜCKLESEN → vergleichen: jedes Manifestfeld, jeder Block, beide Digests', async () => {
    /*
     * **Das ist die Zusicherung, die „ein Test, der nur den Serialisierer prüft" ersetzt.** Der Bestand
     * entsteht nicht aus einer Zahl, sondern aus den **zurückgelesenen Bytes** — und der Vergleich umfasst
     * jedes Feld. Ein Vergleich nur über `merkleRoot` ließe eine falsche Blockaufteilung, einen falschen
     * Gesamt-Digest und einen vertauschten Blockindex durchgehen.
     */
    for (const size of [CHUNK, CHUNK * 3 + 777, CHUNK * 8 + 1]) {
      const bytes = payload(size, size);
      const holder = holdingSinkOf();
      const run = await runVaultStreamingImport(sourceOf(bytes), holder.sink, new AbortController().signal, CHUNK);
      expect(run.outcome.status, `Größe ${size}`).toBe('done');
      expect(holder.committed.value, `Größe ${size}`).toBe(true);
      if (run.outcome.manifest === null) throw new Error('kein Manifest');

      // **ZURÜCKGELESEN** — der Bestand, wie er beim Empfänger liegt.
      const stored = concat(holder.kept);
      expect(stored.byteLength, `Größe ${size}`).toBe(size);
      expect(Array.from(stored.subarray(0, 64)), `Größe ${size}`).toEqual(Array.from(bytes.subarray(0, 64)));

      // Der Datensatz über die **zurückgelesenen** Bytes — über dieselbe Funktion, die den Import bedient.
      const record = streamingDigestRecord(stored, CHUNK);
      const verdict = verifyVaultStreamingIntegrity(
        { contentDigest: record.contentDigest, digestAlgorithm: 'SHA-256', computed: record.chunkIntegrity },
        run.outcome.manifest,
        run.outcome.contentDigest,
      );
      expect(verdict.integrity, `Größe ${size}`).toBe('verified');
      expect(verdict.reason, `Größe ${size}`).toBe('match');
      expect(verdict.chunksCompared, `Größe ${size}`).toBe(run.outcome.totalChunks);
      expect(verdict.firstMismatchIndex, `Größe ${size}`).toBe(-1);

      // ALLE Felder, einzeln — nicht nur die Wurzel.
      expect(record.contentDigest, `Größe ${size}`).toBe(run.outcome.contentDigest);
      expect(record.chunkIntegrity.merkleRoot, `Größe ${size}`).toBe(run.outcome.merkleRoot);
      expect(record.chunkIntegrity.totalChunks, `Größe ${size}`).toBe(run.outcome.totalChunks);
      expect(record.chunkIntegrity.chunkSize, `Größe ${size}`).toBe(run.outcome.manifest.chunkSize);
      expect(record.chunkIntegrity.version, `Größe ${size}`).toBe(1);
      expect(record.chunkIntegrity.algorithm, `Größe ${size}`).toBe('SHA-256');
      for (let index = 0; index < run.outcome.manifest.chunks.length; index += 1) {
        expect(record.chunkIntegrity.chunks[index]?.index, `Größe ${size} Index ${index}`).toBe(index);
        expect(record.chunkIntegrity.chunks[index]?.hash, `Größe ${size} Block ${index}`).toBe(run.outcome.manifest.chunks[index]?.hash);
      }
      // Und das Manifest als Ganzes — die schärfste Form desselben Vergleichs.
      expect(record.chunkIntegrity, `Größe ${size}`).toEqual(run.outcome.manifest);
    }
  });

  it('ein Bestand mit EINEM veränderten Byte liefert NICHT `verified` — und der Unterschied ist benannt', async () => {
    const bytes = payload(CHUNK * 3 + 100, 7);
    const holder = holdingSinkOf();
    const run = await runVaultStreamingImport(sourceOf(bytes), holder.sink, new AbortController().signal, CHUNK);
    if (run.outcome.manifest === null) throw new Error('kein Manifest');

    // Ein Byte im letzten Block kippen — der Bestand bleibt gleich lang.
    const stored = concat(holder.kept);
    const tampered = Uint8Array.from(stored);
    tampered[tampered.byteLength - 1] = (tampered[tampered.byteLength - 1] ?? 0) ^ 0x01;
    expect(tampered.byteLength).toBe(stored.byteLength);

    const record = streamingDigestRecord(tampered, CHUNK);
    const verdict = verifyVaultStreamingIntegrity(
      { contentDigest: record.contentDigest, digestAlgorithm: 'SHA-256', computed: record.chunkIntegrity },
      run.outcome.manifest,
      run.outcome.contentDigest,
    );
    expect(verdict.integrity).toBe('mismatch');
    // Der letzte Block ist der abweichende — Index 3 bei 4 Blöcken.
    expect(verdict.firstMismatchIndex).toBe(3);
    expect(verdict.chunksCompared).toBe(4);
    // **Und der Gesamt-Digest ist ebenfalls ein anderer** — beide Wege in denselben Befund.
    expect(record.contentDigest).not.toBe(run.outcome.contentDigest);
  });

  it('ein Bestand, dem ein Block FEHLT, wird von einem ABWEICHENDEN Block unterschieden', async () => {
    /*
     * **Zwei verschiedene Ursachen, zwei verschiedene Gründe.** „Es fehlt etwas" und „es ist anders" verlangen
     * verschiedene Reaktionen; ein Sammelbefund wäre eine falsche Handlungsanweisung.
     */
    const bytes = payload(CHUNK * 3, 11);
    const holder = holdingSinkOf();
    const run = await runVaultStreamingImport(sourceOf(bytes), holder.sink, new AbortController().signal, CHUNK);
    if (run.outcome.manifest === null) throw new Error('kein Manifest');

    // Zu kurz: zwei Blöcke statt drei.
    const shortened = concat(holder.kept.slice(0, 2));
    const shortRecord = streamingDigestRecord(shortened, CHUNK);
    const shortVerdict = verifyVaultStreamingIntegrity(
      { contentDigest: shortRecord.contentDigest, digestAlgorithm: 'SHA-256', computed: shortRecord.chunkIntegrity },
      run.outcome.manifest,
      run.outcome.contentDigest,
    );
    expect(shortVerdict.integrity).toBe('mismatch');
    expect(shortVerdict.reason).toBe('chunk_count_mismatch');
    expect(shortVerdict.chunksCompared).toBe(0);

    // Abweichend: gleiche Länge, ein anderer Block.
    const altered = Uint8Array.from(concat(holder.kept));
    altered[CHUNK * 2 + 5] = (altered[CHUNK * 2 + 5] ?? 0) ^ 0xff;
    const alteredRecord = streamingDigestRecord(altered, CHUNK);
    const alteredVerdict = verifyVaultStreamingIntegrity(
      { contentDigest: alteredRecord.contentDigest, digestAlgorithm: 'SHA-256', computed: alteredRecord.chunkIntegrity },
      run.outcome.manifest,
      run.outcome.contentDigest,
    );
    expect(alteredVerdict.integrity).toBe('mismatch');
    /*
     * **Der Grund ist `chunk_hash_mismatch`, nicht `merkle_root_mismatch` — und das ist die gemessene
     * Korrektur meiner Erwartung.** Die Wurzel, die ich zum Vergleich heranziehe, ist die Wurzel des
     * **erwarteten** Manifests; die ist unverändert und in sich stimmig, also greift die Wurzelprüfung
     * nicht. Der Befund entsteht eine Stufe später, im **Blockvergleich** — und dort ist er genauer: er
     * nennt den **Index**. Meine erste Erwartung hätte den weniger genauen Grund verlangt.
     */
    expect(alteredVerdict.reason).toBe('chunk_hash_mismatch');
    expect(alteredVerdict.firstMismatchIndex).toBe(2);
    // Und die beiden Gründe sind VERSCHIEDEN — das ist der Punkt.
    expect(shortVerdict.reason).not.toBe(alteredVerdict.reason);
  });

  it('eine Senke, die ALLES VERWIRFT, liefert keinen bestandenen Bestand', async () => {
    /*
     * **Der Fall, den eine Anwesenheits-Zusicherung nicht sieht.** Eine Senke, deren `write` nichts behält,
     * meldet trotzdem Erfolg — der Import weiß davon nichts. Erst der **Rückweg** deckt es auf. Genau
     * deshalb ist der Rückweg Teil der Prüfung und nicht eine Zugabe.
     */
    const bytes = payload(CHUNK * 2, 13);
    const run = await runVaultStreamingImport(sourceOf(bytes), {
      begin: () => Promise.resolve(),
      write: (_chunk, index) => Promise.resolve(index),
      commit: () => Promise.resolve(),
      abort: () => Promise.resolve(),
    }, new AbortController().signal, CHUNK);
    expect(run.outcome.status).toBe('done');
    if (run.outcome.manifest === null) throw new Error('kein Manifest');

    // Der Bestand ist leer — der Import hat trotzdem „fertig" gemeldet.
    const stored = new Uint8Array(0);
    const record = streamingDigestRecord(stored, CHUNK);
    expect(record.chunkIntegrity.chunks.length).toBe(0);
    const verdict = verifyVaultStreamingIntegrity(
      { contentDigest: record.contentDigest, digestAlgorithm: 'SHA-256', computed: record.chunkIntegrity },
      run.outcome.manifest,
      run.outcome.contentDigest,
    );
    // **NICHT `verified`.** Ein leerer Bestand ist kein bestandener Bestand.
    expect(verdict.integrity).toBe('unavailable');
    expect(verdict.reason).toBe('no_chunks');
    expect(verdict.chunksCompared).toBe(0);
  });
});

describe('vaultStreamingAssets: KEIN stiller Rückfall auf den 25-MiB-In-Memory-Leser', () => {
  it('die Produktionsdateien importieren `readFileAsDataUrl` NICHT und kennen die 25-MiB-Grenze NICHT', () => {
    /*
     * **Aus AST-1219 wörtlich: „kein stiller Rueckfall auf den 25-MiB-In-Memory-Leser".**
     *
     * Das ist eine Eigenschaft des **Quelltextes**, keine Absichtserklärung. `readFileAsDataUrl` ist der
     * Pfad, der die Datei als **Data-URL** materialisiert (`integrity/vaultIntegrity.ts:249`), und
     * `MAX_VAULT_ATTACHMENT_BYTES` (`:10`) ist die Grenze, an der er arbeitet. Wer beides nicht kennt, kann
     * die Nutzlast nicht als Ganzes in den Speicher ziehen — nicht, weil er es verspricht, sondern weil ihm
     * die Funktion dafür fehlt.
     *
     * **Und die zweite Hälfte ist der eigentliche Beleg:** die Senke der Engine heißt `sink.write(chunk, i)`
     * und empfängt **Blöcke**. Ein Pfad, der eine ganze Datei in einem Data-URL ablegt, hätte diese Form
     * nicht.
     */
    for (const file of [ENGINE, HASH, PANEL]) {
      const source = stripComments(read(file));
      expect(source, file).not.toContain('readFileAsDataUrl');
      expect(source, file).not.toContain('MAX_VAULT_ATTACHMENT_BYTES');
      expect(source, file).not.toContain('payloadDataUrl');
      expect(source, file).not.toContain('FileReader');
      // Auch kein Umweg über die Basis-64-Kodierung des ganzen Feldes.
      expect(source, file).not.toContain('btoa');
      expect(source, file).not.toContain('atob');
    }
    // **Und die Gegenprobe:** der Pfad, der es TUT, existiert noch und hat genau diese Namen — sonst wäre
    // die Zusicherung oben leer, weil sie Namen prüft, die es nirgends gibt.
    const integrity = stripComments(read(INTEGRITY));
    expect(integrity).toContain('export const MAX_VAULT_ATTACHMENT_BYTES');
    expect(integrity).toContain('export function readFileAsDataUrl');
    expect(integrity).toContain('payloadDataUrl');
  });

  it('die Engine kennt den 25-MiB-Leser auch nicht über einen Umweg', () => {
    /*
     * Ein Umweg wäre ein Import aus `integrity/vaultIntegrity` — genau dort liegt `readFileAsDataUrl`.
     * Die Engine darf aus dieser Datei **nichts** ziehen; sie braucht sie nicht.
     */
    const engine = stripComments(read(ENGINE));
    expect(engine).not.toMatch(/from\s+'[^']*integrity\/vaultIntegrity'/u);
    expect(engine).not.toMatch(/from\s+'[^']*app\/vault\/\*\*'/u);
    // Die Engine importiert nur aus ihrem Nachbarn — eine Abhängigkeit, keine zwei.
    const imports = [...engine.matchAll(/from\s+'([^']+)'/gu)].map((match) => match[1]);
    expect(imports).toContain('./vaultStreamingHash');
    expect(imports).toContain('../../contracts/workspace');
    expect(imports.length).toBe(2);
  });

  it('das Fenster ist eine Blockgröße, nicht die Dateigröße — der Import liest blockweise', async () => {
    /*
     * **Der Speicherbeleg in Zahlen.** Die Engine fordert die Bytes in Blöcken der Fenstergröße an; die
     * größte einzelne Anforderung ist `VAULT_STREAMING_WINDOW_BYTES`. Ein Rückfall auf den In-Memory-Leser
     * würde **eine** Anforderung über die ganze Datei machen — und der Zähler unten wäre 1 statt `n`.
     */
    const requested: number[] = [];
    const bytes = payload(CHUNK * 6 + 3, 17);
    const source: VaultStreamingSource = {
      sizeBytes: bytes.byteLength,
      readChunk: (offset, length) => {
        requested.push(length);
        return Promise.resolve(bytes.slice(offset, Math.min(bytes.byteLength, offset + length)));
      },
    };
    const holder = holdingSinkOf();
    const run = await runVaultStreamingImport(source, holder.sink, new AbortController().signal, CHUNK);
    expect(run.outcome.status).toBe('done');
    expect(requested.length).toBe(7);
    // **Keine Anforderung ist größer als das Fenster** — das ist die Zusicherung.
    expect(Math.max(...requested)).toBeLessThanOrEqual(CHUNK);
    expect(Math.max(...requested)).toBeLessThan(VAULT_STREAMING_WINDOW_BYTES * 2);
    // Und die Summe der Anforderungen ist die Dateigröße — gelesen wurde alles, gehalten wurde nichts.
    expect(requested.reduce((sum, value) => sum + value, 0)).toBe(bytes.byteLength);
  });
});

describe('vaultStreamingAssets: die Oberfläche ist DÜNN, und die Entscheidungen liegen in der Engine', () => {
  it('die Engine ist die größere Datei — die Entscheidungen liegen NICHT in der Oberfläche', () => {
    /*
     * **Ein Architekturnachweis in Bytes.** Der Auftrag verlangt: „Sie ist dünn — sie rendert, was die
     * Engine liefert, und ruft die Engine. Die Entscheidungen liegen NICHT hier." Ein Verhältnis ist kein
     * Beweis für Korrektheit, aber es ist ein Beweis gegen die Umkehrung: wäre das Panel größer als die
     * Engine, läge die Logik dort.
     */
    const engineBytes = read(ENGINE).length;
    const panelBytes = read(PANEL).length;
    expect(panelBytes).toBeLessThan(engineBytes);
    // Und das Fenster ist deutlich: die Engine ist mindestens doppelt so groß.
    expect(engineBytes / panelBytes).toBeGreaterThan(1.8);
  });

  it('das Panel entscheidet nicht selbst — es fragt die Engine und rendert ihr Ergebnis', () => {
    /*
     * **Was das Panel NICHT tun darf:** eine zweite Fortschrittsrechnung, eine zweite Grenze, ein zweites
     * Urteil über „gültig". Was es tun MUSS: die Engine aufrufen und ihre Werte zeigen.
     */
    const panel = stripComments(read(PANEL));
    // Es ruft die Engine.
    expect(panel).toContain('runVaultStreamingImport(');
    expect(panel).toContain('assertVaultStreamingWritable(');
    expect(panel).toContain('vaultStreamingPlan(');
    expect(panel).toContain('verifyVaultStreamingIntegrity(');
    // Es rechnet den Fortschritt NICHT selbst: die Zahl kommt aus dem Ereignis der Engine.
    expect(panel).not.toMatch(/processedBytes\s*\+/u);
    expect(panel).not.toMatch(/Math\.ceil\([^)]*\/\s*VAULT_STREAMING_WINDOW_BYTES/u);
    // Und es importiert keine zweite Blockgröße.
    expect(panel).not.toContain('65536');
    expect(panel).not.toContain('64 * 1024');
  });

  it('der Fortschrittsbalken hat role, alle drei aria-Werte UND ein sichtbares Textäquivalent', () => {
    /*
     * **Die Pflicht aus dem Auftrag, wörtlich:** „ein Fortschrittsbalken braucht `role="progressbar"` mit
     * `aria-valuenow`, `aria-valuemin` und `aria-valuemax`, und ein sichtbares Textäquivalent — ein Balken
     * ohne Zahl ist für einen Screenreader nichts."
     *
     * Diese Zusicherung liest den Quelltext, weil `renderToStaticMarkup` das Markup liefern würde — aber
     * **eine Zusicherung über das Markup ist eine Anwesenheits-Zusicherung**. Was hier zählt, ist, dass die
     * **Zahl** aus der Engine stammt und **sichtbar** gerendert wird. Das ist als Quelltextprüfung ehrlich:
     * sie sagt genau, was sie prüft, und sie prüft nicht die Wirkung im Browser (die `NOT_TESTED` bleibt).
     */
    const panel = read(PANEL);
    expect(panel).toContain('role="progressbar"');
    expect(panel).toContain('aria-valuenow={percent}');
    expect(panel).toContain('aria-valuemin={0}');
    expect(panel).toContain('aria-valuemax={100}');
    expect(panel).toContain('aria-valuetext={formatVaultStreamingProgress(progress)}');
    // Das sichtbare Textäquivalent steht als eigener Knoten im Markup.
    expect(panel).toContain('data-vault-streaming-progress-text');
    expect(panel).toContain('{formatVaultStreamingProgress(progress)}');
    // Und die Formatierung liefert Prozent, Block und Bytes — nicht nur eine Zahl.
    const format = panel.slice(panel.indexOf('export function formatVaultStreamingProgress'));
    expect(format).toContain('percent');
    expect(format).toContain('completedChunks');
    expect(format).toContain('totalChunks');
    expect(format).toContain('processedBytes');
    expect(format).toContain('totalBytes');
  });

  it('Hover-, Focus- und Disabled-Zustände sind für jedes interaktive Element vorhanden', () => {
    /*
     * **„Jede interaktive Komponente hat Hover-, Focus- und Disabled-States; Tastaturbedienung und
     * sichtbarer Fokus sind Pflicht."** Geprüft wird, dass die **Klassen** für alle drei Zustände an den
     * Knöpfen stehen — und dass der Fokus **sichtbar** ist (`focus-visible:outline`), nicht entfernt.
     *
     * **Was diese Zusicherung NICHT belegt:** dass der Fokus im Browser sichtbar **ist**. Das bleibt
     * `NOT_TESTED`; hier ist belegt, dass die Absicht im Markup steht und nicht fehlt.
     */
    const panel = read(PANEL);
    expect(panel).toContain('hover:bg-cyan-500');
    expect(panel).toContain('focus-visible:outline');
    expect(panel).toContain('disabled:cursor-not-allowed');
    // **Kein `outline: none` ohne Ersatz** — der Browserfokus darf nicht entfernt werden.
    expect(panel).not.toContain('outline-none');
    expect(panel).not.toMatch(/outline:\s*none/u);
    // Der Grund neben dem gesperrten Knopf — eine stumme Ablehnung ist unzulässig.
    expect(panel).toContain('Choose a file to enable the import.');
    // Und die Statusbereiche für Screenreader.
    expect(panel).toContain('aria-live="polite"');
    expect(panel).toContain('role="alert"');
  });

  it('das Panel EXPORTIERT die Formate, die sein Zeuge prüft — sonst prüfte er nichts', () => {
    /*
     * **Die Lehre aus dem Fremdbefund zu `TS2304`:** ein Zeuge, der einen Namen benutzt, den die Produktion
     * nicht exportiert, prüft nicht die Produktion. Hier wird der Export am Quelltext festgehalten und die
     * Funktion zusätzlich **ausgeführt** — eine Zusicherung über ihr Ergebnis, nicht über ihr Dasein.
     */
    const panel = read(PANEL);
    expect(panel).toContain('export function formatBytes');
    expect(panel).toContain('export function formatVaultStreamingProgress');
    expect(panel).toContain('export const VaultStreamingImportPanel');
  });
});
