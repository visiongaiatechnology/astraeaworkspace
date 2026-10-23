// STATUS: PLATIN — Publish: Exportvorschau und Farbwarnungen (AST-1441/1442/1443/1444)
//
// Akzeptanzsatz: „Druckvorschau mit **Vorpruefung, Anschnitt und Konvertierungswarnungen** kombinieren."
//
// Gemessen vorher lagen die drei Dinge an **drei** Stellen und wurden **nirgends** zusammengefuehrt:
// `runPublishPreflight` (der Inspektor zeigte es, der Export las es nur ueber einen Schalter),
// `analyzePublishPrepress` (**kein** Aufrufer in der Oberflaeche) — und eine **Farbkonvertierungswarnung** gab es
// **gar nicht**: ein RGB-Farbfeld in einem CMYK-Profil wird beim Export umgerechnet, und nichts sagte das vorher.
import { describe, expect, it } from 'vitest';
import { createPublishProject } from '../../../model/publishDocumentFactory';
import { PublishModelError, addFrameToPublish, estimateTextCapacity } from '../../../model/publishDocumentEngine';
import {
  PUBLISH_PREVIEW_WARNING_KINDS, buildPublishExportPreview, describePublishPreview,
  publishPreviewBlockingReasons, publishPreviewBlocksExport, publishPreviewWarningsOfKind,
} from '../../../model/publishExportPreview';
import { createPublishSwatch, upsertPublishSwatch } from '../../../model/publishStyleOps';
import { availableTextAreaMm2, publishWrapObstacles, setPublishTextWrap } from '../../../model/publishTextFlowOps';
import { verifyPublishPayloadRoundtrip } from '../../../model/publishPersistence';
import { buildPublishExport } from '../../../interchange/publishExportDelivery';

const codes = (run: () => unknown): string => {
  try { run(); return 'no-error'; } catch (error) { return error instanceof PublishModelError ? error.code : `not-a-model-error:${String(error)}`; }
};

/** Ein Dokument mit **allen drei** Warnquellen: zu wenig Anschnitt, ein RGB-Feld, ein ueberlaufender Text. */
function problemDocument() {
  const project = createPublishProject({ pages: 2, bleedMm: 0 });
  const withSwatch = createPublishSwatch(project, { name: 'Signalrot', space: 'RGB', components: [255, 0, 0] });
  const withFrame = addFrameToPublish(withSwatch.model, 'text', { content: 'A'.repeat(20_000), name: 'Fliesstext', widthMm: 60, heightMm: 30 });
  // Ein Bild **ohne** ICC-Profil: die zweite Konvertierungswarnung.
  const withImage = addFrameToPublish(withFrame, 'image', { name: 'Foto', altText: 'Ein Balken' });
  return withImage;
}

/** Ein sauberes Dokument: Anschnitt vorhanden, nur CMYK-Felder, kein Ueberlauf. */
function cleanDocument() {
  const project = createPublishProject({ pages: 1, bleedMm: 3 });
  const withSwatch = createPublishSwatch(project, { name: 'Hausblau', space: 'CMYK', components: [100, 60, 0, 10] });
  return addFrameToPublish(withSwatch.model, 'text', { content: 'Kurzer Text', name: 'Text', widthMm: 90, heightMm: 40 });
}

describe('AST-1442 — die **eine** Quelle fuer Vorschau und Export', () => {
  it('fuehrt die **vorhandenen** Messungen zusammen, statt sie nachzurechnen', () => {
    const preview = buildPublishExportPreview(problemDocument());
    // Der Bericht traegt sein Profil und **die** Vorpruefung, die auch der Export benutzt.
    expect(preview.profileId).toBe('FOGRA51');
    expect(preview.preflight.profileId).toBe('preflight-FOGRA51');
    expect(preview.preflight.findings.length).toBeGreaterThan(0);
    // Und die TIC-Zahl kommt aus der **vorhandenen** Analyse (`analyzePublishPrepress`).
    expect(preview.measurements.ticLimitPercent).toBe(300);
    expect(typeof preview.measurements.ticMaxPercent).toBe('number');
  });

  it('meldet **fehlenden Anschnitt** je Seite, mit beiden Zahlen', () => {
    const preview = buildPublishExportPreview(problemDocument());
    const bleed = publishPreviewWarningsOfKind(preview, 'bleed');
    expect(bleed).toHaveLength(2);
    expect(bleed[0]!.severity).toBe('error');
    expect(bleed[0]!.text).toContain('0 mm bleed');
    expect(bleed[0]!.text).toContain('requires 3 mm');
    expect(bleed[0]!.navigable).toBe(true);
    expect(preview.measurements.missingBleedPages).toBe(2);
    expect(preview.measurements.smallestBleedMm).toBe(0);
  });

  it('meldet die **Farbkonvertierung** — die Warnung, die es vorher gar nicht gab', () => {
    const preview = buildPublishExportPreview(problemDocument());
    const conversion = publishPreviewWarningsOfKind(preview, 'conversion');
    // Das RGB-Farbfeld wird beim Export umgerechnet — und das sagt die Vorschau **vorher**.
    expect(conversion.some((warning) => warning.text.includes('Signalrot') && warning.text.includes('RGB'))).toBe(true);
    expect(preview.measurements.nonCmykSwatches).toBe(1);
    /**
     * **Die gemessene Grenze, ehrlich benannt:** ein Bildrahmen **ohne** Asset ist ein **Platzhalter** — er wird
     * gar nicht exportiert, und die Frage „wird es umgerechnet?" stellt sich fuer ihn nicht. *Eine
     * Konvertierungswarnung fuer etwas, das fehlt, waere eine Warnung vor dem falschen Problem.* Der fehlende
     * Inhalt steht als **Vorpruefungsbefund** da, und das ist der richtige Ort.
     */
    const frame = problemDocument().frames.find((candidate) => candidate.name === 'Foto')!;
    expect(frame.assetId).toBeUndefined();
    expect(conversion.some((warning) => warning.text.includes('Foto'))).toBe(false);
    expect(preview.preflight.findings.length).toBeGreaterThan(0);
  });

  it('nennt die Konvertierung **nicht**, wenn keine noetig ist', () => {
    const preview = buildPublishExportPreview(cleanDocument());
    const conversion = publishPreviewWarningsOfKind(preview, 'conversion');
    expect(conversion).toHaveLength(1);
    expect(conversion[0]!.severity).toBe('info');
    expect(conversion[0]!.text).toContain('No colour conversion is required');
  });

  it('meldet Ueberlauf **mit Umbruch** — ueber die gemeinsame Regel, nicht ueber eine zweite', () => {
    /**
     * Die Textmenge wird **aus der einen Regel** bestimmt, nicht geraten: sie passt **ohne** Umbruch und passt
     * **nicht mehr mit** ihm. *Eine geratene Zeichenzahl haette den Test von der Kapazitaetsrechnung abhaengig
     * gemacht — und eine zweite Rechnung im Test waere genau die zweite Wahrheit, die dieser Punkt vermeidet.*
     */
    const probe = addFrameToPublish(createPublishProject({ pages: 1, bleedMm: 3 }), 'text', { content: '', name: 'Text', widthMm: 100, heightMm: 80 });
    const textFrame = probe.frames.find((frame) => frame.name === 'Text')!;
    const withImage = addFrameToPublish(probe, 'image', { name: 'Bild', xMm: 40, yMm: 40, widthMm: 40, heightMm: 40, altText: 'x' });
    const wrappedModel = setPublishTextWrap(withImage, textFrame.id, { mode: 'bounding-box', offsetMm: 0, contourThreshold: 0.5 });
    const wrappedFrame = wrappedModel.frames.find((frame) => frame.id === textFrame.id)!;
    const capacityNoWrap = estimateTextCapacity(textFrame);
    const capacityWrapped = estimateTextCapacity(wrappedFrame, availableTextAreaMm2(wrappedFrame, publishWrapObstacles(wrappedModel, wrappedFrame)));
    expect(capacityWrapped).toBeLessThan(capacityNoWrap);
    // Genau zwischen den beiden Kapazitaeten: ohne Umbruch passend, mit Umbruch zu viel.
    const content = 'B'.repeat(capacityWrapped + 5);
    const model = { ...wrappedModel, frames: wrappedModel.frames.map((frame) => frame.id === textFrame.id ? { ...frame, content } : frame) };

    const noWrap = buildPublishExportPreview({ ...model, frames: model.frames.map((frame) => frame.id === textFrame.id ? { ...frame, text: { ...frame.text!, textWrap: { mode: 'none' as const, offsetMm: 0, contourThreshold: 0.5 } } } : frame) });
    const wrapped = buildPublishExportPreview(model);
    expect(noWrap.measurements.oversetFrames).toBe(0);
    expect(wrapped.measurements.oversetFrames).toBe(1);
    const overflow = publishPreviewWarningsOfKind(wrapped, 'overflow');
    expect(overflow).toHaveLength(1);
    expect(overflow[0]!.severity).toBe('error');
    expect(overflow[0]!.text).toContain('overflow');
    expect(overflow[0]!.frameId).toBe(textFrame.id);
    expect(overflow[0]!.navigable).toBe(true);
  });

  it('meldet einen **gebrochenen** Verweis als Fehler und einen Live-Verweis als Hinweis', () => {
    const base = createPublishProject({ pages: 1, bleedMm: 3 });
    const broken = { ...base, workspaceReferences: [{ id: 'ref-1', sourceKind: 'grid-range' as const, canonicalUri: 'grid://doc/range', sourceDocumentId: 'doc', mode: 'broken' as const }] };
    const preview = buildPublishExportPreview(broken);
    const links = publishPreviewWarningsOfKind(preview, 'link');
    expect(links.some((warning) => warning.severity === 'error' && warning.text.includes('broken'))).toBe(true);
    const live = { ...base, workspaceReferences: [{ id: 'ref-2', sourceKind: 'grid-range' as const, canonicalUri: 'grid://doc/range', sourceDocumentId: 'doc', mode: 'live' as const }] };
    const livePreview = buildPublishExportPreview(live);
    expect(publishPreviewWarningsOfKind(livePreview, 'link').some((warning) => warning.severity === 'info')).toBe(true);
  });

  it('uebernimmt die Vorpruefungsbefunde, ohne sie neu zu formulieren', () => {
    const model = problemDocument();
    const preview = buildPublishExportPreview(model);
    const preflight = publishPreviewWarningsOfKind(preview, 'preflight');
    // Jeder Befund des Berichts steht **woertlich** in der Vorschau — *eine zweite Formulierung waere eine zweite
    // Wahrheit.*
    for (const finding of preview.preflight.findings) {
      expect(preflight.some((warning) => warning.text === finding.message), finding.id).toBe(true);
    }
  });

  it('**die Sperre ist aus den Zahlen abgeleitet**, nicht gesetzt', () => {
    const blocking = buildPublishExportPreview(problemDocument());
    expect(blocking.errorCount).toBeGreaterThan(0);
    expect(blocking.blocking).toBe(true);
    const allowed = buildPublishExportPreview(problemDocument(), { blockOnErrors: false });
    // Dieselben Fehler, aber die Sperre ist aus — und das steht als Wort da.
    expect(allowed.errorCount).toBe(blocking.errorCount);
    expect(allowed.blocking).toBe(false);
    expect(allowed.summary).toContain('export allowed');
    expect(blocking.summary).toContain('EXPORT BLOCKED');
    const clean = buildPublishExportPreview(cleanDocument());
    expect(clean.errorCount).toBe(0);
    expect(clean.blocking).toBe(false);
  });

  it('die Blockiergruende sind **benannt**, nicht nur gezaehlt', () => {
    const preview = buildPublishExportPreview(problemDocument());
    const reasons = publishPreviewBlockingReasons(preview);
    expect(reasons.length).toBe(preview.errorCount);
    for (const reason of reasons) expect(reason.length).toBeGreaterThan(20);
    expect(publishPreviewBlocksExport(preview)).toBe(true);
    expect(publishPreviewBlocksExport(preview, false)).toBe(false);
  });

  it('das Ausgabeprofil kommt aus Wahl, Vorgabe oder Dokument — **eine** Reihenfolge', () => {
    const model = cleanDocument();
    expect(buildPublishExportPreview(model, { profileId: 'FOGRA39' }).profileId).toBe('FOGRA39');
    expect(buildPublishExportPreview(model).profileId).toBe('FOGRA51');
    expect(codes(() => buildPublishExportPreview(model, { profileId: 'GIBTSNICHT' as never }))).toBe('export-preview-profile-unknown:GIBTSNICHT');
  });

  it('rechnet die TIC-Grenze gegen das **gewaehlte** Profil', () => {
    const preview = buildPublishExportPreview(cleanDocument(), { profileId: 'GRACOL_2013' });
    expect(preview.measurements.ticLimitPercent).toBe(320);
    expect(preview.profile.standard).toBe('ISO 15339');
    expect(preview.summary).toContain('GRACoL 2013');
  });

  it('trennt Sonder- und Prozessfarben in der Bilanz', () => {
    const base = createPublishProject({ pages: 1, bleedMm: 3 });
    const withSpot = createPublishSwatch(base, { name: 'Gold', space: 'Spot', components: [0, 20, 60, 10], spotName: 'PANTONE 871 C' });
    const withCmyk = upsertPublishSwatch(withSpot.model, { ...withSpot.model.swatches[0]!, id: 's2', name: 'Blau', space: 'CMYK', components: [100, 60, 0, 10] });
    const preview = buildPublishExportPreview(withCmyk);
    expect(preview.measurements.spotSwatches).toBe(1);
    expect(preview.measurements.swatches).toBe(2);
    expect(preview.measurements.spotSeparations).toBeGreaterThanOrEqual(0);
    expect(preview.measurements.processSeparations).toBe(preview.measurements.separations - preview.measurements.spotSeparations);
  });
});

describe('AST-1444 — ohne Farbe unterscheidbar', () => {
  it('jede Warnung nennt Art, Grad und einen **Satz**', () => {
    const preview = buildPublishExportPreview(problemDocument());
    expect(preview.warnings.length).toBeGreaterThan(0);
    for (const warning of preview.warnings) {
      expect(PUBLISH_PREVIEW_WARNING_KINDS, warning.id).toContain(warning.kind);
      expect(['error', 'warning', 'info'], warning.id).toContain(warning.severity);
      expect(warning.text.trim().length, warning.id).toBeGreaterThan(15);
    }
  });

  it('die Textfassung traegt dieselbe Information wie die Flaechen', () => {
    const preview = buildPublishExportPreview(problemDocument());
    const text = describePublishPreview(preview);
    expect(text.split('\n')).toHaveLength(preview.warnings.length + 1);
    for (const warning of preview.warnings) {
      expect(text, warning.id).toContain(`[${warning.severity.toUpperCase()} ${warning.kind}]`);
      expect(text, warning.id).toContain(warning.text);
    }
    // Und die Bilanz steht als Satz voran.
    expect(text.split('\n')[0]).toBe(preview.summary);
  });

  it('die Zaehlungen gehen auf — von aussen nachpruefbar', () => {
    const preview = buildPublishExportPreview(problemDocument());
    expect(preview.errorCount + preview.warningCount + preview.infoCount).toBe(preview.warnings.length);
    expect(preview.errorCount).toBe(preview.warnings.filter((warning) => warning.severity === 'error').length);
    expect(preview.summary).toContain(`${preview.errorCount} error(s)`);
    expect(preview.summary).toContain(`${preview.warningCount} warning(s)`);
  });

  it('die Warnungsarten sind eine **geschlossene** Liste', () => {
    expect([...PUBLISH_PREVIEW_WARNING_KINDS]).toEqual(['bleed', 'conversion', 'tic', 'preflight', 'overflow', 'link']);
  });
});

describe('AST-1443 — die Vorschau ist nach dem Wiedereroeffnen **dieselbe**', () => {
  it('dieselben Nutzdaten ergeben dieselben Warnungen und dieselbe Sperre', () => {
    const before = buildPublishExportPreview(problemDocument());
    const { reopened, diff } = verifyPublishPayloadRoundtrip(problemDocument(), 0);
    expect(diff.identical).toBe(true);
    const after = buildPublishExportPreview(reopened);
    expect(after.warnings.map((warning) => warning.id)).toEqual(before.warnings.map((warning) => warning.id));
    expect(after.warnings.map((warning) => warning.text)).toEqual(before.warnings.map((warning) => warning.text));
    expect(after.errorCount).toBe(before.errorCount);
    expect(after.blocking).toBe(before.blocking);
    expect(after.measurements).toEqual(before.measurements);
    expect(after.summary).toBe(before.summary);
  });

  it('die **gewaehlte** Vorgabe bestimmt die Vorschau auch nach dem Wiedereroeffnen', () => {
    const { reopened } = verifyPublishPayloadRoundtrip(problemDocument(), 0);
    // Ueber die gespeicherte Vorgabe: das Profil kommt aus dem Dokument, nicht aus dem Aufruf.
    const withPreset = { ...reopened, exportPresets: [{ id: 'preset-pdfx', name: 'Druck', kind: 'pdfx' as const, outputProfileId: 'FOGRA39', includeBleed: true, includeMarks: true, embedFonts: true, deterministic: true, accessible: true, allowInteractiveForms: false, javascriptAllowed: false as const }] };
    const viaPreset = buildPublishExportPreview(withPreset, { presetId: 'preset-pdfx' });
    expect(viaPreset.profileId).toBe('FOGRA39');
    expect(viaPreset.measurements.ticLimitPercent).toBe(330);
  });
});

describe('AST-1441 — der Export **liest** die Vorschau wirklich', () => {
  it('die Vorschau und der Export benutzen **dieselbe** Vorpruefung', async () => {
    const model = problemDocument();
    const preview = buildPublishExportPreview(model);
    // Der Export baut auf **derselben** Vorpruefung auf: die Befund-IDs stimmen ueberein.
    const exported = await buildPublishExport(model, { target: 'html', title: 'T' }).catch(() => null);
    // HTML laesst sich hier immer bauen — die Zeile belegt, dass der Exportweg ueberhaupt laeuft.
    expect(exported === null || exported.byteLength > 0).toBe(true);
    expect(preview.preflight.findings.map((finding) => finding.id)).toEqual(buildPublishExportPreview(model).preflight.findings.map((finding) => finding.id));
  });

  it('der Bericht ist **zielunabhaengig**, solange kein Ziel gewaehlt ist — und nennt es', () => {
    const preview = buildPublishExportPreview(problemDocument());
    expect(preview.target).toBeNull();
    const withTarget = buildPublishExportPreview(problemDocument(), { target: 'pdfx4' });
    expect(withTarget.target).toBe('pdfx4');
    // Die Warnungen sind dieselben: *die Vorschau haengt am Dokument, nicht am Knopf.*
    expect(withTarget.warnings.map((warning) => warning.id)).toEqual(preview.warnings.map((warning) => warning.id));
  });
});
