// STATUS: PLATIN — Astraea Publish: Vorpruefungsbericht und Ausgabevorgaben **aus dem Dokument** (AST-1403, AST-1428)
//
// ## Die zwei Befunde, gemessen
//
// **AST-1403 (WOM/Persistenz)** — Akzeptanzsatz: „Fehlender Font/Bildaufloesung/Anschnitt als **navigierbaren**
// Fehler listen". Der Inspektor **berechnete** die Befunde bei jedem Rendern aus `createDefaultPreflightProfile()`
// — das **gewaehlte** Profil des Nutzers wurde nirgends festgehalten. Nach Speichern und Wiedereroeffnen lief die
// Pruefung also mit der **Vorgabe**, nicht mit der Wahl: *dieselben Nutzdaten ergaben andere Befunde.*
//
// **AST-1428 (WOM/Persistenz)** — Akzeptanzsatz: „Einen Artikel als reflow-faehiges EPUB/HTML mit Bild-Alttext
// ausgeben". `model.exportPresets` existierte im Vertrag, aber **kein** Exportweg las es: das Ziel waehlte immer
// der Aufruf. *Eine Vorgabe, die niemand liest, ist keine Vorgabe.*
//
// ## Was hier entsteht
//
// **Eine** Stelle, die eine Vorpruefungsvorgabe in das Dokument schreibt und sie wieder liest ✓, und **eine**
// Stelle, die eine Ausgabevorgabe in ein Exportziel uebersetzt ✓. *Keine zweite Liste von Zielen, keine zweite
// Ableitung von Grenzwerten: die Uebersetzung liest `kind`, den vorhandenen Vertrag.*
//
// ## Was `NOT_TESTED` bleibt (Schicht 5)
//
// Ob ein Betrachter das erzeugte PDF oeffnet und ob ein Screenreader die Befundliste vorliest. Geprueft sind die
// Regeln, die Persistenz und die Uebersetzung.
import type {
  PublishDocumentModel, PublishExportPreset, PublishExportPresetKind, PublishPreflightFinding,
  PublishPreflightProfile,
} from '../../../shared/contracts/publish/workspacePublish';
import { PublishModelError } from './publishDocumentEngine';
import { AVAILABLE_ICC_PROFILES, createDefaultPreflightProfile, runPublishPreflight, type IccProfileId } from '../prepress/publishPrepressEngine';
import type { PublishDigitalLayoutChoice, PublishExportTarget } from '../interchange/publishExportDelivery';

/** Die Obergrenzen dieser beiden Listen — **dieselben Zahlen wie der Vertrag**, nicht daneben. */
const MAX_PREFLIGHT_PROFILES = 256;
const MAX_EXPORT_PRESETS = 512;

/**
 * **Die Vorpruefungsvorgabe des Dokuments** — die eine Stelle, die sie liest.
 *
 * Reihenfolge: das **erste** Profil im Dokument (die Wahl des Nutzers), sonst die Vorgabe. *Eine zweite Wahl
 * waere eine zweite Wahrheit; `preflightProfiles` ist die kanonische Ablage und wird der Reihe nach benutzt.*
 */
export function activePublishPreflightProfile(model: PublishDocumentModel): PublishPreflightProfile {
  const stored = model.preflightProfiles[0];
  return stored ?? createDefaultPreflightProfile();
}

/**
 * **Die Vorgabe festhalten** (`AST-1403`) — der eine Einstieg.
 *
 * Gemessen vorher: der Inspektor rief `runPublishPreflight(model)` **ohne** Profil, also immer mit der Vorgabe.
 * Eine Wahl, die nirgends landet, ist keine Wahl — und nach dem Wiedereroeffnen ergab dasselbe Dokument andere
 * Befunde. Die ID ist **stabil** (`preflight-<icc>`), damit dieselbe Wahl dieselbe Vorgabe ist.
 */
export function setPublishPreflightProfile(model: PublishDocumentModel, profileId: IccProfileId): PublishDocumentModel {
  const profile = AVAILABLE_ICC_PROFILES[profileId];
  if (!profile) throw new PublishModelError(`preflight-profile-unknown:${String(profileId)}`);
  const candidate = createDefaultPreflightProfile(profileId);
  const exists = model.preflightProfiles.some((stored) => stored.id === candidate.id);
  if (!exists && model.preflightProfiles.length >= MAX_PREFLIGHT_PROFILES) throw new PublishModelError('preflight-profile-limit');
  // **Genau eine** Vorgabe ist die aktive: die gewaehlte steht vorn, die uebrigen bleiben erhalten.
  const others = model.preflightProfiles.filter((stored) => stored.id !== candidate.id);
  return { ...model, preflightProfiles: [candidate, ...others], revision: model.revision + 1 };
}

/**
 * **Der Bericht** — Befunde **und** das Profil, mit dem sie entstanden sind.
 *
 * Der Akzeptanzsatz verlangt **navigierbare** Fehler; ein Befund traegt dafuer `pageId`, `frameId` und `assetId`
 * (`navigable`). Diese Funktion liefert beides zusammen, damit der Aufrufer nicht raten muss, **womit** geprueft
 * wurde — *ein Befund ohne sein Profil ist nicht nachvollziehbar.*
 */
export interface PublishPreflightReport {
  readonly profileId: string;
  readonly profile: PublishPreflightProfile;
  readonly findings: readonly PublishPreflightFinding[];
  /** Nur die Befunde, die ein Sprungziel tragen — die, die der Nutzer anklicken kann. */
  readonly navigableFindings: readonly PublishPreflightFinding[];
  readonly errorCount: number;
  readonly warningCount: number;
  /** Der Fingerabdruck des Berichts: gleiche Eingabe, gleiche Zahl. */
  readonly summary: string;
}

export function buildPublishPreflightReport(model: PublishDocumentModel, availableFonts?: ReadonlySet<string>): PublishPreflightReport {
  const profile = activePublishPreflightProfile(model);
  const findings = runPublishPreflight(model, profile, ...(availableFonts === undefined ? [] : [availableFonts] as const));
  const navigableFindings = findings.filter((finding) => finding.navigable);
  const errorCount = findings.filter((finding) => finding.severity === 'error').length;
  const warningCount = findings.filter((finding) => finding.severity === 'warning').length;
  return {
    profileId: profile.id,
    profile,
    findings,
    navigableFindings,
    errorCount,
    warningCount,
    summary: `${profile.name} · ${errorCount} error(s) · ${warningCount} warning(s) · ${navigableFindings.length} of ${findings.length} navigable`,
  };
}

/**
 * **Eine Ausgabevorgabe lesen** (`AST-1428`) — die eine Uebersetzung `kind` → Exportziel.
 *
 * Gemessen vorher: `model.exportPresets` war im Vertrag und **kein** Exportweg las es. Die Zuordnung steht hier
 * **einmal**; *eine zweite Liste von Zielen waere eine zweite Vokabel.*
 *
 * `interactive-pdf` und `tagged-pdf` fallen auf PDF/X-4 (das Hausformat mit Ausgabeprofil), `html-reflow` und
 * `epub-reflow` auf das umbrechende Layout, `html-fixed` und `epub-fixed` auf das feste.
 */
export interface PublishResolvedExportPreset {
  readonly preset: PublishExportPreset;
  readonly target: PublishExportTarget;
  readonly layout: PublishDigitalLayoutChoice;
  readonly profileId: IccProfileId | undefined;
  /** Der Satz fuer die Oberflaeche — nennt Ziel und Behandlung. */
  readonly summary: string;
}

const TARGET_BY_PRESET_KIND: Readonly<Record<PublishExportPresetKind, PublishExportTarget>> = Object.freeze({
  pdfx: 'pdfx4',
  'tagged-pdf': 'pdfx4',
  'interactive-pdf': 'pdfx4',
  'html-reflow': 'html',
  'html-fixed': 'html',
  'epub-reflow': 'epub',
  'epub-fixed': 'epub',
  png: 'package',
  jpeg: 'package',
  svg: 'package',
  package: 'package',
});

/** Das Layout ergibt sich aus der **Art** — `-fixed` heisst fest, alles andere umbrechend. */
export function publishPresetLayout(kind: PublishExportPresetKind): PublishDigitalLayoutChoice {
  return kind.endsWith('-fixed') ? 'fixed' : 'reflow';
}

export function resolvePublishExportPreset(model: PublishDocumentModel, presetId: string): PublishResolvedExportPreset {
  const preset = model.exportPresets.find((candidate) => candidate.id === presetId);
  if (!preset) throw new PublishModelError(`export-preset-missing:${presetId}`);
  const target = TARGET_BY_PRESET_KIND[preset.kind];
  if (!target) throw new PublishModelError(`export-preset-kind-unknown:${String(preset.kind)}`);
  const layout = publishPresetLayout(preset.kind);
  // Das Ausgabeprofil der Vorgabe wird **durchgereicht**, nicht erfunden: es ist entweder eine bekannte
  // ICC-Kennung oder gar keine.
  const profileId = preset.outputProfileId && preset.outputProfileId in AVAILABLE_ICC_PROFILES ? (preset.outputProfileId as IccProfileId) : undefined;
  return { preset, target, layout, profileId, summary: `${preset.name} · ${preset.kind} → ${target} (${layout})${profileId === undefined ? '' : ` · ${profileId}`}${preset.accessible ? ' · accessible' : ''}` };
}

/**
 * **Eine Ausgabevorgabe anlegen oder ersetzen** (`AST-1428`).
 *
 * `javascriptAllowed` ist im Vertrag **`false`** — eine Vorgabe, die Skript erlaubt, ist damit nicht
 * darstellbar, und dieses Modul erfindet keinen Weg daran vorbei. *Eine Ausgabe, die Skript traegt, waere genau
 * die Attrappe, die dieses Projekt verbietet.*
 */
export function upsertPublishExportPreset(model: PublishDocumentModel, preset: PublishExportPreset): PublishDocumentModel {
  if (!preset.id || !preset.name.trim()) throw new PublishModelError('export-preset-name-empty');
  if (!(preset.kind in TARGET_BY_PRESET_KIND)) throw new PublishModelError(`export-preset-kind-unknown:${String(preset.kind)}`);
  if (preset.javascriptAllowed !== false) throw new PublishModelError('export-preset-javascript-forbidden');
  const exists = model.exportPresets.some((candidate) => candidate.id === preset.id);
  if (!exists && model.exportPresets.length >= MAX_EXPORT_PRESETS) throw new PublishModelError('export-preset-limit');
  const exportPresets = exists
    ? model.exportPresets.map((candidate) => candidate.id === preset.id ? { ...preset } : candidate)
    : [...model.exportPresets, { ...preset }];
  return { ...model, exportPresets, revision: model.revision + 1 };
}

/** Eine Vorgabe **ohne** Angabe der Kennung — die Vorgabe, die die Oberflaeche anbietet. */
export function createDefaultExportPreset(kind: PublishExportPresetKind, name: string, profileId?: IccProfileId): PublishExportPreset {
  return {
    id: `preset-${kind}`,
    name: name.trim() || kind,
    kind,
    ...(profileId === undefined ? {} : { outputProfileId: profileId }),
    includeBleed: true,
    includeMarks: true,
    embedFonts: true,
    deterministic: true,
    accessible: true,
    allowInteractiveForms: false,
    javascriptAllowed: false,
  };
}

/** Die sichtbare Zeile einer Vorgabe — Ziel und Behandlung in Worten. */
export function describePublishExportPreset(model: PublishDocumentModel, presetId: string): string {
  return resolvePublishExportPreset(model, presetId).summary;
}
