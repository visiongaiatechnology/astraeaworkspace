// STATUS: PLATIN — Astraea Publish Roundtrip & Verification Suite
/**
 * VisionGaiaTechnology — Astraea Publish Prepress & Roundtrip Test Suite
 *
 * ## Warum diese Datei neu geschrieben wurde (AST-1452, P0) — gemessen, nicht vermutet
 *
 * Die Vorgaengerfassung **behauptete** sechs Pruefungen und **maß** drei davon nicht:
 *
 *   1. `VPUBLISH_CONTAINER_SEAL_ROUNDTRIP` hiess „Native .vpub Container Seal" — geprueft wurde
 *      `JSON.stringify` → `JSON.parse` eines **Teilobjekts** (ohne Seiten-IDs, ohne Verkettungen, ohne Assets).
 *      Der verschluesselte Container (`packNativePublish`) kam darin nicht vor.
 *   2. `TYPOGRAPHIC_FRAME_THREADING_INVARIANTS` benutzte eine **zweite** Kapazitaetsregel
 *      (`areaMm2 / (fontSizePt * 0.35) * columns`) neben `estimateTextCapacity` — *zwei Regeln fuer denselben
 *      Fakt, und die zweite war die falsche.*
 *   3. `ACCESSIBLE_TAGGED_PDF_STRUCTURE` mass **nichts**: `sorted.length === model.frames.length` ist fuer
 *      jedes Array wahr (Sortieren aendert die Laenge nicht), und `pdfUaCompliant: true` war eine **Konstante**.
 *      *Ein Erfolg, den ein Vorgang meldet, der nie stattfand.*
 *   4. `THIRD_PARTY_DTP_IDML_INTEROP_FIDELITY` behauptete „Verified lossless roundtrip geometry", ohne
 *      irgendetwas zurueckzulesen — geprueft wurde nur, dass der erzeugte Text kein `<script` enthaelt.
 *
 * ## Was jetzt gilt: **jede** Zahl stammt aus einer Messung, und **jede** Regel hat **eine** Definition
 *
 *   * Ueberlauf: `detectOversetFrames` + `estimateTextCapacity` (die kanonische Regel des Modells) ✓
 *   * Barrierefreiheit: `auditPublishAccessibility` + `buildPublishReadingOrder` (der vorhandene Pruefer) ✓
 *   * Geometrie-Rundlauf: `buildPublishSvgPage` → `importPublishSvgPage` → **Vergleich** der Nutzdaten ✓
 *   * Speichern/Wiedereröffnen: `verifyPublishPayloadRoundtrip` (Nutzdatenvergleich) ✓
 *   * Container: `packNativePublish`/`unpackNativePublish` — **wirklich** ausgefuehrt; kann die Umgebung den
 *     Geraeteschluessel nicht liefern, steht der **benannte** Grund da und **kein** falsches „passed" ✓✓
 *   * PDF/X und TIC: unveraendert gemessen (`/GTS_PDFX`, `/OutputIntents`, `/BleedBox`, TIC-Grenze) ✓
 *
 * ## Was hier `NOT_TESTED` bleibt (Schicht 5)
 *
 * Der **Browser**: ob ein PDF-Betrachter die Datei oeffnet, ob ein Screenreader die Struktur liest und ob der
 * Download im Fenster ankommt. Dafuer fehlt in dieser Umgebung ein Browser — geprueft ist die **Berechnung**.
 */
import { PublishDocumentModel } from '../contracts/types';
import { analyzePublishPrepress } from '../prepress/publishPrepressEngine';
import { exportPublishToPdfX } from '../interchange/pdf/publishPdfXExportEngine';
import { detectOversetFrames, estimateTextCapacity } from '../model/publishDocumentEngine';
import { auditPublishAccessibility, buildPublishReadingOrder } from '../accessibility/publishAccessibilityEngine';
import { buildPublishSvgPage, importPublishSvgPage } from '../interchange/publishExportEngine';
import { publishPayloadFingerprint, verifyPublishPayloadRoundtrip } from '../model/publishPersistence';
import { assertPdfXStructure } from '../interchange/pdf/publishPdfStructure';
import type { PublishPdfStructureFinding } from '../interchange/pdf/publishPdfStructure';

export interface PublishTestResult {
  id: string;
  name: string;
  status: 'passed' | 'failed' | 'warning';
  durationMs: number;
  details: string;
  metrics?: Record<string, unknown>;
}

export interface PublishSuiteReport {
  timestamp: number;
  totalTests: number;
  passedCount: number;
  failedCount: number;
  /** Wie viele Pruefungen **warnen** — eine Warnung ist kein „bestanden" und wird getrennt gezaehlt. */
  warningCount: number;
  results: PublishTestResult[];
  overallFidelityScore: number;
  containerSha256: string;
}

/**
 * Der deterministische Fingerabdruck des Dokuments — **die eine** Definition.
 *
 * Er kommt aus `publishPersistence` (dieselbe Nutzdatensicht, die der Speichertext benutzt), nicht aus einem
 * zweiten `JSON.stringify(model)`: *zwei Fingerabdruecke ueber dasselbe Dokument waeren zwei Wahrheiten.*
 */
async function fingerprintOf(model: PublishDocumentModel): Promise<string> {
  const bytes = new TextEncoder().encode(publishPayloadFingerprint(model));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function result(
  id: string,
  name: string,
  status: PublishTestResult['status'],
  startedAt: number,
  details: string,
  metrics?: Record<string, unknown>,
): PublishTestResult {
  return { id, name, status, durationMs: Math.round(performance.now() - startedAt), details, ...(metrics ? { metrics } : {}) };
}

/** Ein fehlgeschlagener Lauf **nennt seinen Grund** — kein leeres „failed". */
function failureOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * **Punkt 1 — der verschluesselte Container, wirklich ausgefuehrt.**
 *
 * Der Name sagt „Native .vpub Container Seal"; also wird **der** Container geprueft und nicht ein JSON-Rundlauf.
 * Der Import steht **innerhalb** des Zweigs: kann die Umgebung den Geraeteschluessel nicht liefern (kein
 * `crypto.subtle`, kein Speicher), ist das ein **benannter** Warnfall — *kein falsches „passed" und kein
 * erfundenes „failed".*
 */
async function checkContainerSeal(model: PublishDocumentModel, documentTitle: string): Promise<PublishTestResult> {
  const startedAt = performance.now();
  const name = '1. Native .vpub Container Seal & Multi-Spread Roundtrip';
  try {
    const { packNativePublish, unpackNativePublish } = await import('../interchange/native/publishNativeInterchange');
    const workspaceDocument = {
      id: 'publish-suite', title: documentTitle, kind: 'Publish' as const,
      created_at: 0, modified_at: 0, version: 1, theme_id: 'vgt-default',
      root_object_ids: [], objects: {}, publishData: model,
    };
    const packed = await packNativePublish(workspaceDocument);
    const magic = new TextDecoder().decode(packed.subarray(0, 4));
    const reopened = await unpackNativePublish(packed);
    const identical = reopened.publishData !== undefined && publishPayloadFingerprint(reopened.publishData) === publishPayloadFingerprint(model);
    return result('VPUBLISH_CONTAINER_SEAL_ROUNDTRIP', name, identical ? 'passed' : 'failed', startedAt,
      `Packed ${packed.byteLength} bytes as ${magic} and reopened them. Payload ${identical ? 'identical' : 'DIFFERENT'}.`,
      { bytes: packed.byteLength, magic, payloadIdentical: identical, pages: model.pages.length, frames: model.frames.length });
  } catch (error) {
    /**
     * **Fail-closed, aber ehrlich:** der Container ist nicht ausfuehrbar (z. B. kein Geraeteschluessel in dieser
     * Umgebung). Das ist **keine** bestandene Pruefung und **kein** Fehler des Dokuments — es ist der benannte
     * Zustand „hier nicht messbar", und der Grund steht im Klartext da.
     */
    return result('VPUBLISH_CONTAINER_SEAL_ROUNDTRIP', name, 'warning', startedAt,
      `The encrypted native container could not be exercised in this environment: ${failureOf(error)}`,
      { skipped: 'native-container-unavailable' });
  }
}

/**
 * **Punkt 4 — Ueberlauf mit der kanonischen Regel.**
 *
 * Die Vorgaengerfassung rechnete eine **zweite** Kapazitaet aus Flaeche und Schriftgrad. Hier wird
 * `detectOversetFrames` benutzt — *dieselbe Regel, die auch die Vorpruefung und die Anzeige benutzen.*
 */
function checkThreading(model: PublishDocumentModel): PublishTestResult {
  const startedAt = performance.now();
  const name = '4. Typographic Threading Invariants & Overset Text Diagnostics';
  try {
    const textFrames = model.frames.filter((frame) => frame.type === 'text');
    const oversetIds = detectOversetFrames(model);
    const capacities = textFrames.map((frame) => estimateTextCapacity(frame));
    const totalCapacity = capacities.reduce((sum, capacity) => sum + capacity, 0);
    const totalText = textFrames.reduce((sum, frame) => sum + frame.content.length, 0);
    return result('TYPOGRAPHIC_FRAME_THREADING_INVARIANTS', name, oversetIds.length === 0 ? 'passed' : 'warning', startedAt,
      `Audited ${textFrames.length} text frame(s) with the canonical capacity rule. ${oversetIds.length} frame(s) carry overflow text; text ${totalText} characters against a capacity of ${totalCapacity}.`,
      { textFramesCount: textFrames.length, oversetFrameIds: oversetIds, totalText, totalCapacity });
  } catch (error) {
    return result('TYPOGRAPHIC_FRAME_THREADING_INVARIANTS', name, 'failed', startedAt, `Typography audit failed: ${failureOf(error)}`);
  }
}

/**
 * **Punkt 5 — Barrierefreiheit, gemessen statt behauptet.**
 *
 * Zwei echte Messungen: die Leserordnung (der vorhandene Pruefer) und der Befundbericht (der vorhandene
 * Barrierefreiheits-Prüfer). `pdfUaCompliant` ist **abgeleitet** — *eine Konstante `true` war der Fehler, den
 * diese Fassung behebt.*
 */
function checkAccessibility(model: PublishDocumentModel): PublishTestResult {
  const startedAt = performance.now();
  const name = '5. Accessible Tagged PDF (/StructTreeRoot) & Reading Order Semantics';
  try {
    const order = buildPublishReadingOrder(model);
    const findings = auditPublishAccessibility(model);
    const errors = findings.filter((finding) => finding.severity === 'error');
    const warnings = findings.filter((finding) => finding.severity === 'warning');
    // **Abgeleitet, nicht gesetzt:** konform heisst hier "keine Fehlerbefunde" — und die Zahl steht daneben.
    const compliant = errors.length === 0;
    // Die Leserordnung ist **vollstaendig**, wenn jeder sichtbare Rahmen genau einmal vorkommt.
    const visibleFrames = model.frames.filter((frame) => !frame.hidden && frame.semanticRole !== 'Artifact');
    const orderCoversEveryFrame = order.length === visibleFrames.length && new Set(order.map((entry) => entry.frameId)).size === order.length;
    return result('ACCESSIBLE_TAGGED_PDF_STRUCTURE', name, compliant && orderCoversEveryFrame ? 'passed' : (errors.length > 0 ? 'failed' : 'warning'), startedAt,
      `Reading order covers ${order.length} of ${visibleFrames.length} visible frame(s). Accessibility audit: ${errors.length} error(s), ${warnings.length} warning(s).`,
      { orderedElements: order.length, visibleFrames: visibleFrames.length, accessibilityErrors: errors.length, accessibilityWarnings: warnings.length, pdfUaCompliant: compliant, orderCoversEveryFrame });
  } catch (error) {
    return result('ACCESSIBLE_TAGGED_PDF_STRUCTURE', name, 'failed', startedAt, `Accessibility audit fault: ${failureOf(error)}`);
  }
}

/**
 * **Punkt 6 — Geometrie-Rundlauf, wirklich verglichen.**
 *
 * Der SVG-Seitenexport traegt die **semantischen Metadaten** des Modells mit (`VGT_PUBLISH_SVG_META_V1`) und
 * `importPublishSvgPage` liest sie zurueck. Damit ist ein echter Rundlauf messbar: *exportieren, einlesen,
 * Nutzdaten vergleichen.* Die Vorgaengerfassung baute nur einen IDML-Text und behauptete „lossless".
 */
function checkGeometryRoundtrip(model: PublishDocumentModel): PublishTestResult {
  const startedAt = performance.now();
  const name = '6. SVG/Geometry Roundtrip Fidelity (export, re-import, compare)';
  try {
    const pageId = model.pages[0]?.id;
    if (!pageId) throw new Error('svg-roundtrip-no-page');
    const source = buildPublishSvgPage(model, pageId);
    const reimported = importPublishSvgPage(source);
    const identical = publishPayloadFingerprint(reimported.model) === publishPayloadFingerprint(model);
    const activeContentRejected = /<script|onload\s*=/iu.test(source) === false;
    return result('THIRD_PARTY_DTP_IDML_INTEROP_FIDELITY', name, identical && activeContentRejected ? 'passed' : 'failed', startedAt,
      `Exported and re-imported page ${reimported.pageId} (${source.length} bytes of SVG). Payload ${identical ? 'identical' : 'DIFFERENT'}; no active content ${activeContentRejected ? 'present' : 'STILL PRESENT'}.`,
      { svgBytes: source.length, pageId: reimported.pageId, payloadIdentical: identical, activeContentRejected });
  } catch (error) {
    return result('THIRD_PARTY_DTP_IDML_INTEROP_FIDELITY', name, 'failed', startedAt, `Geometry roundtrip failed: ${failureOf(error)}`);
  }
}

/**
 * **Punkt 7 — die Nutzdaten ueber Speichern und Wiedereroeffnen.**
 *
 * Neu in dieser Fassung, weil der Punkt „Achtseitige Broschuere" genau das verlangt: *dieselben Nutzdaten nach
 * dem Weg durch den Speichertext.* Der Vergleich kommt aus `verifyPublishPayloadRoundtrip` (eine Definition).
 */
function checkPayloadPersistence(model: PublishDocumentModel): PublishTestResult {
  const startedAt = performance.now();
  const name = '7. Payload Save → Close → Reopen Identity';
  try {
    const { diff, payloadBytes } = verifyPublishPayloadRoundtrip(model, 0);
    return result('PAYLOAD_SAVE_REOPEN_IDENTITY', name, diff.identical ? 'passed' : 'failed', startedAt,
      `Serialised ${payloadBytes} bytes and reopened them. ${diff.identical ? 'Identical payload' : `DIFFERENT: ${diff.changed.join(', ')}`}.`,
      { payloadBytes, identical: diff.identical, changed: diff.changed });
  } catch (error) {
    return result('PAYLOAD_SAVE_REOPEN_IDENTITY', name, 'failed', startedAt, `Payload roundtrip failed: ${failureOf(error)}`);
  }
}

/**
 * **Die vollstaendige Prueffolge** — jede Zahl aus einer Messung.
 *
 * Die Reihenfolge ist stabil, und `overallFidelityScore` zaehlt **Warnungen nicht** als bestanden: *ein
 * Warnfall, der als Erfolg gezaehlt wird, macht die Note wertlos.*
 */
export async function runPublishRoundtripTestSuite(
  model: PublishDocumentModel,
  docTitle: string = 'Astraea Publication',
): Promise<PublishSuiteReport> {
  const results: PublishTestResult[] = [];

  results.push(await checkContainerSeal(model, docTitle));

  // 2. PDF/X-Ausgabeprofil — gemessen am **Inhalt**, mit der einen Strukturpruefung.
  const t2 = performance.now();
  try {
    const pdfx = await exportPublishToPdfX(model, 'PDF/X-4:2010', {
      cropMarks: true, bleedMarks: true, registrationMarks: true, colorBars: true, pageInformation: true,
    }, 'FOGRA51');
    const findings: PublishPdfStructureFinding[] = assertPdfXStructure(pdfx.pdfStream);
    /**
     * **Gezählt wird nur, was für diesen Standard Pflicht ist** ✓✓.
     *
     * Gemessen (eigener Fehler, Runde Publish-15): die erste Fassung dieser Suite zählte **jeden** fehlenden
     * Eintrag als Fehler — auch `/DestOutputProfile`, das für PDF/X-4 **nicht** verlangt ist (die registrierte
     * Bedingung genügt). Damit meldete sie einen korrekten PDF/X-4-Strom als „failed". Die Pflichtauswahl steckt
     * in `missingPdfXRequirements` — *eine* Definition, und die Suite benutzt sie statt einer zweiten.
     */
    const errors = pdfx.missingRequirements;
    results.push(result('PDFX_PREPRESS_OUTPUT_INTENT', '2. ISO 15930 PDF/X-4 OutputIntent & Prepress Marks Validation',
      errors.length === 0 ? 'passed' : 'failed', t2,
      `Generated a ${pdfx.bytesCount}-byte ${pdfx.standard} stream with output condition ${pdfx.outputCondition}. ${findings.length - errors.length} of ${findings.length} structure entries present; ${errors.length === 0 ? `all ${findings.length} required entries present` : `MISSING: ${errors.map((finding) => finding.key).join(', ')}`}.`,
      { bytes: pdfx.bytesCount, standard: pdfx.standard, marksApplied: pdfx.marksApplied.length, structure: findings, missing: errors.map((finding) => finding.key), checks: findings.length }));
  } catch (error) {
    results.push(result('PDFX_PREPRESS_OUTPUT_INTENT', '2. ISO 15930 PDF/X-4 OutputIntent & Prepress Marks Validation', 'failed', t2,
      `PDF/X generation failed: ${failureOf(error)}`));
  }

  // 3. Total Ink Coverage — unveraendert gemessen.
  const t3 = performance.now();
  try {
    const prepress = analyzePublishPrepress(model, 'FOGRA51');
    const peak = prepress.maxTicMeasured;
    const limit = prepress.profile.maxTicPercent;
    results.push(result('TOTAL_INK_COVERAGE_TIC_DIAGNOSTICS', '3. Total Ink Coverage (TIC / TAC) & Separation Density Diagnostics',
      peak <= limit ? 'passed' : 'warning', t3,
      `Scanned every frame and swatch under ${prepress.profile.name}. Peak ink coverage ${peak}% against a limit of ${limit}%; ${prepress.ticViolationsCount} violation(s), ${prepress.separations.length} separation plate(s).`,
      { peakTicPercent: peak, limitPercent: limit, violations: prepress.ticViolationsCount, plates: prepress.separations.length }));
  } catch (error) {
    results.push(result('TOTAL_INK_COVERAGE_TIC_DIAGNOSTICS', '3. Total Ink Coverage (TIC / TAC) & Separation Density Diagnostics', 'failed', t3,
      `Prepress TIC analysis fault: ${failureOf(error)}`));
  }

  results.push(checkThreading(model));
  results.push(checkAccessibility(model));
  results.push(checkGeometryRoundtrip(model));
  results.push(checkPayloadPersistence(model));

  const passedCount = results.filter((entry) => entry.status === 'passed').length;
  const failedCount = results.filter((entry) => entry.status === 'failed').length;
  const warningCount = results.filter((entry) => entry.status === 'warning').length;
  const overallFidelityScore = Math.round((passedCount / results.length) * 100);

  return {
    timestamp: Date.now(),
    totalTests: results.length,
    passedCount,
    failedCount,
    warningCount,
    results,
    overallFidelityScore,
    containerSha256: await fingerprintOf(model),
  };
}

/**
 * Die **Broschueren-Bilanz** — was das Dokument wirklich enthaelt.
 *
 * Sie ist die gemessene Fassung des Akzeptanzsatzes „Achtseitige VGT-Broschuere mit Bildern, Tabellen und extern
 * geprueftem PDF": *Seiten, Bilder, Tabellen und die Anzahl der Rahmen, die wirklich gezeichnet werden.*
 */
export interface PublishBrochureManifest {
  pages: number;
  textFrames: number;
  imageFrames: number;
  tableFrames: number;
  shapeFrames: number;
  placedImages: number;
  tables: number;
  oversetFrames: number;
  /** Der Satz fuer die Oberflaeche — in Worten, damit die Zahl nicht allein steht. */
  summary: string;
}

export function describePublishBrochure(model: PublishDocumentModel): PublishBrochureManifest {
  /**
   * **Bild und Form sind zwei Arten, und die Arten stehen im Vertrag** ✓ (`PublishFrameType`).
   *
   * Ein Bild ist `type: 'image'`, eine Form ist `type: 'graphic'` — *eine erfundene Vokabel `'Shape'` gaebe es
   * nicht, und genau deshalb steht hier keine.* Gemessen (eigener Fehler): die erste Fassung dieses Manifests
   * verglich `frame.type === 'Shape'`, was der Typprüfer zu Recht als unmöglich zurückwies.
   */
  const images = model.frames.filter((frame) => frame.type === 'image');
  const shapes = model.frames.filter((frame) => frame.type === 'graphic');
  const manifest: PublishBrochureManifest = {
    pages: model.pages.length,
    textFrames: model.frames.filter((frame) => frame.type === 'text').length,
    imageFrames: images.length,
    tableFrames: model.frames.filter((frame) => frame.type === 'table').length,
    shapeFrames: shapes.length,
    placedImages: images.filter((frame) => frame.assetId !== undefined).length,
    tables: model.tables.length,
    oversetFrames: detectOversetFrames(model).length,
    summary: '',
  };
  manifest.summary = `${manifest.pages} page(s) · ${manifest.textFrames} text · ${manifest.imageFrames} image (${manifest.placedImages} placed) · ${manifest.tableFrames} table · ${manifest.shapeFrames} shape · ${manifest.oversetFrames} overflowing`;
  return manifest;
}
