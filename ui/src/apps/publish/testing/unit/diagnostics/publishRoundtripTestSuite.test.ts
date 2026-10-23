// STATUS: PLATIN — die Verifikationssuite **misst**, statt zu behaupten (AST-1452, P0)
//
// Der P0-Befund, gemessen an der Vorgaengerfassung:
//
//   1. `ACCESSIBLE_TAGGED_PDF_STRUCTURE` mass **nichts**. `sorted.length === model.frames.length` ist für jedes
//      Array wahr (Sortieren ändert die Länge nicht), und `pdfUaCompliant: true` war eine **Konstante**.
//      *Ein Erfolg, den ein Vorgang meldet, der nie stattfand.*
//   2. `TYPOGRAPHIC_FRAME_THREADING_INVARIANTS` benutzte eine **zweite** Kapazitätsregel
//      (`areaMm2 / (fontSizePt * 0.35) * columns`) neben `estimateTextCapacity`.
//   3. `VPUBLISH_CONTAINER_SEAL_ROUNDTRIP` hiess „Container Seal" und prüfte einen JSON-Rundlauf eines
//      **Teilobjekts**; der verschlüsselte Container kam darin nicht vor.
//   4. `THIRD_PARTY_DTP_IDML_INTEROP_FIDELITY` behauptete „Verified lossless roundtrip geometry", ohne
//      etwas zurückzulesen.
//
// Diese Datei hält fest, was die neue Fassung **wirklich** tut: jede Zahl aus einer Messung, jede Regel mit
// **einer** Definition, und `pdfUaCompliant` **abgeleitet** statt gesetzt.
import { describe, expect, it } from 'vitest';
import { createPublishProject } from '../../../model/publishDocumentFactory';
import { addFrameToPublish } from '../../../model/publishDocumentEngine';
import { runPublishRoundtripTestSuite, describePublishBrochure } from '../../../diagnostics/publishRoundtripTestSuite';

/** Ein Dokument mit Text, damit die Punkte 4/5/6/7 echte Arbeit haben. */
function brochure() {
  const project = createPublishProject({ pages: 8, title: 'VGT Broschuere' });
  const withTitle = addFrameToPublish(project, 'text', { content: 'Astraea Architektur', name: 'Titel', semanticRole: 'H1', pageIndex: 0 } as never);
  return addFrameToPublish(withTitle, 'text', { content: 'Der erste Absatz der Broschuere.', name: 'Text' });
}

describe('die Suite meldet nur, was sie gemessen hat', () => {
  it('führt ihre Punkte aus und nennt die Zahlen', async () => {
    const report = await runPublishRoundtripTestSuite(brochure(), 'VGT Broschuere');
    expect(report.totalTests).toBe(7);
    expect(report.results.map((entry) => entry.id)).toEqual([
      'VPUBLISH_CONTAINER_SEAL_ROUNDTRIP',
      'PDFX_PREPRESS_OUTPUT_INTENT',
      'TOTAL_INK_COVERAGE_TIC_DIAGNOSTICS',
      'TYPOGRAPHIC_FRAME_THREADING_INVARIANTS',
      'ACCESSIBLE_TAGGED_PDF_STRUCTURE',
      'THIRD_PARTY_DTP_IDML_INTEROP_FIDELITY',
      'PAYLOAD_SAVE_REOPEN_IDENTITY',
    ]);
    // Die Zählungen sind **konsistent** — Warnungen werden getrennt gezählt, nicht als bestanden verbucht.
    expect(report.passedCount + report.failedCount + report.warningCount).toBe(report.totalTests);
    expect(report.overallFidelityScore).toBe(Math.round((report.passedCount / report.totalTests) * 100));
    expect(report.containerSha256).toMatch(/^[0-9a-f]{64}$/u);
  });

  it('zählt einen Warnfall **nicht** als bestanden', async () => {
    const report = await runPublishRoundtripTestSuite(brochure());
    const warned = report.results.filter((entry) => entry.status === 'warning');
    // Warnungen gibt es hier nur, wenn der Container in dieser Umgebung nicht ausführbar ist — und dann steht
    // der benannte Grund da, kein „passed".
    for (const entry of warned) expect(entry.details.length).toBeGreaterThan(20);
    expect(report.warningCount).toBe(warned.length);
  });

  it('misst den Ueberlauf mit der **kanonischen** Regel, nicht mit einer zweiten', async () => {
    const report = await runPublishRoundtripTestSuite(brochure());
    const threading = report.results.find((entry) => entry.id === 'TYPOGRAPHIC_FRAME_THREADING_INVARIANTS')!;
    const metrics = threading.metrics as Record<string, unknown>;
    // Die gemeldeten Zahlen stammen aus `estimateTextCapacity` — dieselbe Regel, die die Vorpruefung benutzt.
    expect(metrics.textFramesCount).toBe(2);
    expect(Array.isArray(metrics.oversetFrameIds)).toBe(true);
    expect(typeof metrics.totalCapacity).toBe('number');
    expect(metrics.totalText).toBe('Astraea Architektur'.length + 'Der erste Absatz der Broschuere.'.length);
    // Und die Vorgaengerfassung haette hier eine **andere** Zahl geliefert: ihre Regel war eine zweite Wahrheit.
    expect(threading.details).toContain('canonical capacity rule');
  });

  it('leitet `pdfUaCompliant` ab, statt es zu setzen', async () => {
    const report = await runPublishRoundtripTestSuite(brochure());
    const accessibility = report.results.find((entry) => entry.id === 'ACCESSIBLE_TAGGED_PDF_STRUCTURE')!;
    const metrics = accessibility.metrics as Record<string, unknown>;
    // Die drei Zahlen stehen **nebeneinander** — der Wert ist aus ihnen abgeleitet.
    expect(typeof metrics.accessibilityErrors).toBe('number');
    expect(typeof metrics.accessibilityWarnings).toBe('number');
    expect(typeof metrics.orderCoversEveryFrame).toBe('boolean');
    expect(metrics.pdfUaCompliant).toBe(metrics.accessibilityErrors === 0);
    // Ein Titel als H1 und ein Absatz als P: keine Barrierefreiheitsfehler, und die Ordnung deckt alle Rahmen.
    expect(metrics.accessibilityErrors).toBe(0);
    expect(metrics.orderCoversEveryFrame).toBe(true);
    expect(accessibility.status).toBe('passed');
  });

  it('meldet einen fehlenden Alternativtext als **Fehler**, nicht als bestanden', async () => {
    // Der alte Konstantenwert `pdfUaCompliant: true` hätte das verschluckt.
    const withImage = addFrameToPublish(brochure(), 'image', { name: 'Bild', altText: '' });
    const report = await runPublishRoundtripTestSuite(withImage);
    const accessibility = report.results.find((entry) => entry.id === 'ACCESSIBLE_TAGGED_PDF_STRUCTURE')!;
    expect((accessibility.metrics as Record<string, unknown>).accessibilityErrors).toBeGreaterThan(0);
    expect(accessibility.status).toBe('failed');
  });

  it('vergleicht den Geometrie-Rundlauf wirklich — Export, Re-Import, Nutzdaten', async () => {
    const report = await runPublishRoundtripTestSuite(brochure());
    const roundtrip = report.results.find((entry) => entry.id === 'THIRD_PARTY_DTP_IDML_INTEROP_FIDELITY')!;
    const metrics = roundtrip.metrics as Record<string, unknown>;
    expect(metrics.payloadIdentical).toBe(true);
    expect(metrics.activeContentRejected).toBe(true);
    expect(roundtrip.status).toBe('passed');
    expect(roundtrip.details).toContain('re-imported');
  });

  it('belegt Speichern und Wiedereroeffnen mit identischen Nutzdaten', async () => {
    const report = await runPublishRoundtripTestSuite(brochure());
    const persistence = report.results.find((entry) => entry.id === 'PAYLOAD_SAVE_REOPEN_IDENTITY')!;
    expect(persistence.status).toBe('passed');
    expect((persistence.metrics as Record<string, unknown>).identical).toBe(true);
  });

  it('prüft PDF/X am Inhalt, mit der einen Strukturdefinition', async () => {
    const report = await runPublishRoundtripTestSuite(brochure());
    const pdfx = report.results.find((entry) => entry.id === 'PDFX_PREPRESS_OUTPUT_INTENT')!;
    const metrics = pdfx.metrics as Record<string, unknown>;
    expect(metrics.standard).toBe('PDF/X-4:2010');
    // Die XMP-Identifikation und das Trapping sind da — das ist der Unterschied zu vorher.
    const structure = metrics.structure as Array<{ key: string; present: boolean }>;
    for (const key of ['xmp-version', 'xmp-conformance', 'catalog-metadata', 'trapped', 'output-intent']) {
      expect(structure.find((finding) => finding.key === key)!.present, key).toBe(true);
    }
    expect(pdfx.status).toBe('passed');
  });

  it('ist deterministisch bis auf den Zeitstempel', async () => {
    const model = brochure();
    const left = await runPublishRoundtripTestSuite(model);
    const right = await runPublishRoundtripTestSuite(model);
    expect(right.containerSha256).toBe(left.containerSha256);
    expect(right.results.map((entry) => entry.status)).toEqual(left.results.map((entry) => entry.status));
  });
});

describe('describePublishBrochure — die gemessene Bilanz des Akzeptanzsatzes', () => {
  it('zählt Seiten, Bilder, Tabellen und Ueberlauf getrennt', () => {
    const model = brochure();
    const manifest = describePublishBrochure(model);
    expect(manifest.pages).toBe(8);
    expect(manifest.textFrames).toBe(2);
    expect(manifest.imageFrames).toBe(0);
    expect(manifest.tableFrames).toBe(0);
    expect(manifest.shapeFrames).toBe(0);
    expect(manifest.summary).toContain('8 page(s)');
    expect(manifest.summary).toContain('2 text');
  });

  it('unterscheidet Bild und Form nach der Vertragsart, nicht nach einer erfundenen Vokabel', () => {
    const withBoth = addFrameToPublish(addFrameToPublish(brochure(), 'image', { name: 'Bild' }), 'graphic', { name: 'Form' });
    const manifest = describePublishBrochure(withBoth);
    expect(manifest.imageFrames).toBe(1);
    expect(manifest.shapeFrames).toBe(1);
  });
});
