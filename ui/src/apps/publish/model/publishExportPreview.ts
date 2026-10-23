// STATUS: PLATIN — Astraea Publish: Exportvorschau und Farbwarnungen, **eine** Quelle (AST-1441/1442/1443/1444)
//
// ## Der Befund, gemessen vor dieser Datei
//
// Der Akzeptanzsatz lautet: „Druckvorschau mit Vorpruefung, Anschnitt und **Konvertierungswarnungen**
// kombinieren." Gemessen lagen die drei Dinge an **drei** Stellen und wurden **nirgends** zusammengefuehrt:
//
//   * `runPublishPreflight` liefert Befunde (Font, Aufloesung, Anschnitt) — der Inspektor zeigte sie, der
//     **Export** las sie nur ueber den Schalter `blockOnPreflightErrors` in `publishPdfExportEngine`.
//   * `analyzePublishPrepress` rechnet TIC und Separationen — **kein** Aufrufer in der Oberflaeche.
//   * Eine **Farbkonvertierungswarnung** gab es **gar nicht**: ein RGB-Farbfeld oder ein RGB-Bild in einem
//     CMYK-Ausgabeprofil wird beim Export umgerechnet, und **nichts** sagte das vorher.
//
// Die Folge war die schlimmste Art von Ueberraschung: *die Vorschau sah gut aus, und der Druck kam anders.*
//
// ## Was hier entsteht — **eine** Quelle
//
// `buildPublishExportPreview` fuehrt die vorhandenen Messungen **zusammen**, statt sie nachzurechnen ✓. Sie
// benutzt `buildPublishPreflightReport` (das seinerseits `runPublishPreflight` benutzt) und
// `analyzePublishPrepregs`… genauer: `analyzePublishPrepress` — **keine** zweite TIC-Rechnung, **keine** zweite
// Befundliste. Die Vorschau **und** der Export lesen **dieselbe** Funktion ✓✓.
//
// ## Der Akzeptanzsatz der A11y-Schicht (`AST-1444`)
//
// „Zustaende sind **ohne Farbe** unterscheidbar." Deshalb traegt **jede** Warnung `kind`, `severity` und einen
// **Satz** — und der Bericht zusaetzlich Zahlen. *Wer nur die Farbe sieht, sieht nichts; wer die Zahlen und die
// Woerter sieht, sieht alles.*
//
// ## Fail-closed mit benanntem Grund
//
// Unbekanntes Ziel ✓, unbekanntes Ausgabeprofil ✓, eine Vorschau ohne Blockierentscheidung ✓ → benannt.
import type { PublishDocumentModel } from '../../../shared/contracts/publish/workspacePublish';
import { PublishModelError } from './publishDocumentEngine';
import {
  AVAILABLE_ICC_PROFILES, analyzePublishPrepress, createDefaultPreflightProfile, type IccProfileId,
} from '../prepress/publishPrepressEngine';
import { activePublishPreflightProfile, buildPublishPreflightReport, type PublishPreflightReport } from './publishPresetOps';
import { resolvePublishExportPreset } from './publishPresetOps';
import type { PublishExportTarget } from '../interchange/publishExportDelivery';
import { detectOversetFramesWithWrap } from './publishTextFlowOps';
import { describePublishOutputProfile, type PublishOutputProfileView } from '../prepress/publishPrepressEngine';

/**
 * Die **Arten** einer Warnung — geschlossene Liste.
 *
 * Sie ist die Grundlage der Unterscheidung **ohne Farbe** (`AST-1444`): jede Warnung nennt ihre Art und ihren
 * Grad in **Worten**, und die Oberflaeche kann sie damit auch fuer einen Screenreader und in Graustufen trennen.
 */
export const PUBLISH_PREVIEW_WARNING_KINDS = ['bleed', 'conversion', 'tic', 'preflight', 'overflow', 'link'] as const;
export type PublishPreviewWarningKind = (typeof PUBLISH_PREVIEW_WARNING_KINDS)[number];

export type PublishPreviewSeverity = 'error' | 'warning' | 'info';

export interface PublishPreviewWarning {
  readonly id: string;
  readonly kind: PublishPreviewWarningKind;
  readonly severity: PublishPreviewSeverity;
  /** Der Satz — **immer** vorhanden, damit die Warnung nicht nur ein Symbol ist. */
  readonly text: string;
  readonly pageId?: string;
  readonly frameId?: string;
  /** Traegt die Warnung ein Sprungziel? — dieselbe Frage wie bei den Vorpruefungsbefunden. */
  readonly navigable: boolean;
}

/** Die **gemessenen** Zahlen, aus denen die Warnungen entstehen — damit die Vorschau nachpruefbar bleibt. */
export interface PublishExportPreviewMeasurements {
  readonly pages: number;
  readonly bleedPages: number;
  readonly missingBleedPages: number;
  readonly bleedRequiredMm: number;
  readonly smallestBleedMm: number;
  readonly ticMaxPercent: number;
  readonly ticLimitPercent: number;
  readonly separations: number;
  readonly spotSeparations: number;
  readonly processSeparations: number;
  readonly oversetFrames: number;
  readonly missingAltText: number;
  readonly imageFrames: number;
  readonly linkedFrames: number;
  readonly swatches: number;
  readonly nonCmykSwatches: number;
  readonly spotSwatches: number;
}

export interface PublishExportPreview {
  readonly profileId: IccProfileId;
  readonly profile: PublishOutputProfileView;
  /** Das Ziel, fuer das die Vorschau gilt — `null`, wenn keines gewaehlt ist (dann ist der Bericht zielunabhaengig). */
  readonly target: PublishExportTarget | null;
  readonly warnings: readonly PublishPreviewWarning[];
  readonly errorCount: number;
  readonly warningCount: number;
  readonly infoCount: number;
  /** Blockiert diese Vorschau den Export? — die eine Entscheidung, und sie ist **aus den Zahlen** abgeleitet. */
  readonly blocking: boolean;
  readonly measurements: PublishExportPreviewMeasurements;
  readonly preflight: PublishPreflightReport;
  /** Der Satz fuer die Oberflaeche — nennt **beide** Tatsachen: was gemessen wurde und was blockiert. */
  readonly summary: string;
}

export interface PublishExportPreviewRequest {
  target?: PublishExportTarget;
  profileId?: IccProfileId;
  /** Eine gespeicherte Ausgabevorgabe (`AST-1428`) — ihre Profilkennung gewinnt, wenn nichts gesetzt ist. */
  presetId?: string;
  /** Verfuegbare Schriften; fehlt die Menge, gilt die Vorgabe der Vorpruefung. */
  availableFonts?: ReadonlySet<string>;
  blockOnErrors?: boolean;
}

/**
 * **Die kombinierte Vorschau** ✓✓ — die eine Stelle, an der Vorpruefung, Anschnitt und Konvertierung
 * zusammenkommen. Vorschau **und** Export lesen sie.
 */
export function buildPublishExportPreview(model: PublishDocumentModel, request: PublishExportPreviewRequest = {}): PublishExportPreview {
  /**
   * Das Ausgabeprofil: ausdrueckliche Wahl, sonst die gespeicherte Vorgabe, sonst die des Dokuments.
   * *Eine Reihenfolge, nicht drei.*
   */
  const presetProfile = request.presetId === undefined ? undefined : resolvePublishExportPreset(model, request.presetId).profileId;
  const chosen = request.profileId ?? presetProfile ?? (activePublishPreflightProfile(model).outputProfileId as IccProfileId);
  const icc = AVAILABLE_ICC_PROFILES[chosen];
  if (!icc) throw new PublishModelError(`export-preview-profile-unknown:${String(chosen)}`);
  const profile = describePublishOutputProfile(model, chosen);
  const preflightProfile = request.profileId === undefined && presetProfile === undefined
    ? activePublishPreflightProfile(model)
    : { ...createDefaultPreflightProfile(chosen), outputProfileId: chosen };

  const preflight = buildPublishPreflightReport(model, ...(request.availableFonts === undefined ? [] : [request.availableFonts] as const));
  // **Keine zweite TIC-Rechnung:** die vorhandene Analyse wird gelesen.
  const prepress = analyzePublishPrepress(model, chosen);

  const warnings: PublishPreviewWarning[] = [];
  const push = (warning: PublishPreviewWarning): void => { warnings.push(warning); };

  // ---- Anschnitt (`bleed`) ------------------------------------------------------------------------------
  const bleedRequired = preflightProfile.requireBleedMm;
  const bleeds = model.pages.map((page) => page.geometry.bleedMm ?? 0);
  const smallestBleed = bleeds.length === 0 ? 0 : Math.min(...bleeds);
  const missingBleed = model.pages.filter((page) => (page.geometry.bleedMm ?? 0) < bleedRequired);
  for (const page of missingBleed) {
    const actual = page.geometry.bleedMm ?? 0;
    push({
      id: `preview-bleed-${page.id}`, kind: 'bleed', severity: 'error',
      text: `Page ${page.id} has ${actual} mm bleed; the profile requires ${bleedRequired} mm.`,
      pageId: page.id, navigable: true,
    });
  }

  // ---- Farbkonvertierung (`conversion`) — **die Warnung, die es gar nicht gab** ---------------------------
  const nonCmyk = model.swatches.filter((swatch) => swatch.space !== 'CMYK' && swatch.space !== 'Spot');
  for (const swatch of nonCmyk) {
    push({
      id: `preview-convert-swatch-${swatch.id}`, kind: 'conversion', severity: 'warning',
      text: `Swatch "${swatch.name}" is ${swatch.space} and will be converted to CMYK for ${icc.name}.`,
      navigable: false,
    });
  }
  const imageFrames = model.frames.filter((frame) => frame.type === 'image');
  for (const frame of imageFrames) {
    const asset = frame.assetId === undefined ? undefined : model.assets.find((candidate) => candidate.id === frame.assetId);
    // Ein Bild **ohne** ICC-Profil wird beim Export umgerechnet — das ist eine Warnung, kein Fehler.
    if (asset && !asset.profileId) {
      push({
        id: `preview-convert-image-${frame.id}`, kind: 'conversion', severity: 'warning',
        text: `Image "${frame.name}" carries no ICC profile and will be converted to ${icc.name}.`,
        frameId: frame.id, navigable: true,
      });
    }
  }
  if (nonCmyk.length === 0 && imageFrames.length === 0) {
    push({ id: 'preview-conversion-none', kind: 'conversion', severity: 'info', text: 'No colour conversion is required for this document.', navigable: false });
  }

  // ---- TIC (`tic`) — aus der **vorhandenen** Analyse -----------------------------------------------------
  if (prepress.maxTicMeasured > icc.maxTicPercent) {
    push({
      id: 'preview-tic-exceeded', kind: 'tic', severity: 'error',
      text: `Total ink coverage is ${prepress.maxTicMeasured}% and exceeds the ${icc.maxTicPercent}% limit of ${icc.name}.`,
      navigable: false,
    });
  }
  for (const violation of prepress.violations) {
    push({
      id: `preview-tic-${violation.id}`, kind: 'tic', severity: 'warning',
      text: violation.description,
      /**
       * Das Sprungziel liegt hier am **Rahmen**: `TicViolation` fuehrt `frameId` und einen **Index**, aber
       * **keine** Seitenkennung. Der Index wird deshalb **nicht** in eine Kennung umgedeutet — *eine geratene
       * Kennung waere ein Sprung ins Falsche, und ein falscher Sprung ist schlimmer als keiner.*
       */
      ...(violation.frameId ? { frameId: violation.frameId } : {}),
      navigable: Boolean(violation.frameId),
    });
  }

  // ---- Ueberlauf (`overflow`) — **mit Umbruch**, nicht mit der vollen Flaeche ----------------------------
  const overset = detectOversetFramesWithWrap(model);
  if (overset.length > 0) {
    push({
      id: 'preview-overflow', kind: 'overflow', severity: 'error',
      text: `${overset.length} text frame(s) overflow — text will be lost in print.`,
      frameId: overset[0]!, navigable: true,
    });
  }

  // ---- Verweise (`link`) --------------------------------------------------------------------------------
  const broken = model.workspaceReferences.filter((reference) => reference.mode === 'broken');
  for (const reference of broken) {
    push({
      id: `preview-link-${reference.id}`, kind: 'link', severity: 'error',
      text: `The link to "${reference.canonicalUri}" is broken — the placed content is a stale snapshot.`,
      navigable: false,
    });
  }
  const live = model.workspaceReferences.filter((reference) => reference.mode === 'live');
  if (live.length > 0) {
    push({
      id: 'preview-link-live', kind: 'link', severity: 'info',
      text: `${live.length} live link(s) will be taken from their source at export time.`,
      navigable: false,
    });
  }

  // ---- Vorpruefung (`preflight`) — die **vorhandenen** Befunde, nicht neue ---------------------------------
  for (const finding of preflight.findings) {
    push({
      id: `preview-preflight-${finding.id}`, kind: 'preflight', severity: finding.severity, text: finding.message,
      ...(finding.pageId === undefined ? {} : { pageId: finding.pageId }),
      ...(finding.frameId === undefined ? {} : { frameId: finding.frameId }),
      navigable: finding.navigable,
    });
  }

  const errorCount = warnings.filter((warning) => warning.severity === 'error').length;
  const warningCount = warnings.filter((warning) => warning.severity === 'warning').length;
  const infoCount = warnings.filter((warning) => warning.severity === 'info').length;
  const blockOnErrors = request.blockOnErrors ?? true;
  /**
   * **Die Blockierentscheidung ist abgeleitet**, nicht gesetzt: sie folgt aus den **Fehlern** — und aus nichts
   * sonst. *Eine Vorschau, die warnt und trotzdem durchlaesst, ohne es zu sagen, waere die Ueberraschung, die
   * dieser Punkt gerade beseitigt.*
   */
  const blocking = blockOnErrors && errorCount > 0;

  const measurements: PublishExportPreviewMeasurements = {
    pages: model.pages.length,
    bleedPages: model.pages.length - missingBleed.length,
    missingBleedPages: missingBleed.length,
    bleedRequiredMm: bleedRequired,
    smallestBleedMm: smallestBleed,
    ticMaxPercent: prepress.maxTicMeasured,
    ticLimitPercent: icc.maxTicPercent,
    separations: prepress.separations.length,
    spotSeparations: prepress.separations.filter((plate) => plate.isSpot).length,
    processSeparations: prepress.separations.filter((plate) => !plate.isSpot).length,
    oversetFrames: overset.length,
    missingAltText: imageFrames.filter((frame) => !frame.altText?.trim()).length,
    imageFrames: imageFrames.length,
    linkedFrames: model.frames.filter((frame) => frame.workspaceReferenceId !== undefined).length,
    swatches: model.swatches.length,
    nonCmykSwatches: nonCmyk.length,
    spotSwatches: model.swatches.filter((swatch) => swatch.space === 'Spot').length,
  };

  return {
    profileId: chosen,
    profile,
    target: request.target ?? null,
    warnings,
    errorCount,
    warningCount,
    infoCount,
    blocking,
    measurements,
    preflight,
    summary: `${profile.name} · ${model.pages.length} page(s) · bleed ${smallestBleed}mm of ${bleedRequired}mm required · TIC ${prepress.maxTicMeasured}% of ${icc.maxTicPercent}% · ${measurements.separations} separation(s) (${measurements.spotSeparations} spot) · ${errorCount} error(s) · ${warningCount} warning(s) → ${blocking ? 'EXPORT BLOCKED' : 'export allowed'}`,
  };
}

/**
 * **Darf exportiert werden?** — die eine Frage, die die Ansicht **vor** dem Export stellt ✓✓.
 *
 * Sie ist absichtlich eine eigene, kleine Funktion: *so kann der Exportweg sie aufrufen, ohne die ganze Vorschau
 * zu bauen — und die Antwort ist trotzdem dieselbe.*
 */
export function publishPreviewBlocksExport(preview: PublishExportPreview, blockOnErrors = true): boolean {
  return blockOnErrors && preview.errorCount > 0;
}

/**
 * Die Warnungen, die den Export **verhindern** — mit ihrem **Satz**.
 *
 * Fuer die Oberflaeche: *eine Sperre ohne genannten Grund zwingt den Nutzer zum Raten.*
 */
export function publishPreviewBlockingReasons(preview: PublishExportPreview): string[] {
  return preview.warnings.filter((warning) => warning.severity === 'error').map((warning) => warning.text);
}

/** Nur die Warnungen einer **Art** — fuer die Filter der Vorschau, ohne zweite Liste. */
export function publishPreviewWarningsOfKind(preview: PublishExportPreview, kind: PublishPreviewWarningKind): PublishPreviewWarning[] {
  return preview.warnings.filter((warning) => warning.kind === kind);
}

/**
 * **Die Warnungen als Text** — die farbfreie Fassung (`AST-1444`) ✓.
 *
 * Der Akzeptanzsatz der A11y-Schicht verlangt, dass Zustaende **ohne Farbe** unterscheidbar sind. Diese Funktion
 * liefert **dieselbe** Information als Textzeilen — *fuer einen Screenreader, fuer einen Ausdruck und fuer den
 * Fall, dass jemand die Farben nicht unterscheiden kann.*
 */
export function describePublishPreview(preview: PublishExportPreview): string {
  const lines = [preview.summary];
  for (const warning of preview.warnings) {
    lines.push(`[${warning.severity.toUpperCase()} ${warning.kind}] ${warning.text}`);
  }
  return lines.join('\n');
}
