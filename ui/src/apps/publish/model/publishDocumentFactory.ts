// STATUS: DIAMANT VGT SUPREME — Astraea Publish: EINE Definition fuer „neues Layoutdokument"
//
// Befund vor dieser Datei (gemessen, Runde Publish-1): Es gab **keinen** Einstieg, der ein neues
// Publish-Dokument erzeugt. `createEmptyPublishDocument()` lieferte immer dieselbe hartkodierte
// Beispielbroschuere mit Beispieltexten — kein leerer Zustand, keine Seitenzahl, kein Format, keine
// Fehlermeldung. Die Toolbar konnte nur „Seite anhaengen". Eine Broschuere mit zwei Seiten aus leerer
// Vorlage zu beginnen war damit nicht ausfuehrbar.
//
// Diese Datei besitzt **alle** Regeln fuer die Dokumenterzeugung: Format, Seitenzahl, Ausrichtung,
// Anschnitt und Rand. Ein zweiter Satz dieser Regeln existiert nicht — wer sie aendern will, aendert sie
// hier, und `assertPublishDocument` (die kanonische Invariante) prueft das Ergebnis anschliessend.
import type {
  PublishDocumentModel, PublishFrame, PublishMasterPage, PublishPage, PublishPageGeometry,
  PublishPageOrientation, PublishRectMm,
} from '../../../shared/contracts/publish/workspacePublish';
import {
  PUBLISH_LIMITS, PublishModelError, assertPublishDocument, createDefaultPublishGeometry,
  createDefaultTextOptions, createDefaultPublishTypography, createPublishFrame, deepClonePublish,
  getActivePublishPage, pageLabel, publishStableId, syncPublishCompatibility,
} from './publishDocumentEngine';

/** Die vier Druckformate, die die Oberflaeche anbietet. `Custom` hat bewusst keine eigenen Masse. */
export type PublishPaperStandard = 'A4' | 'A3' | 'A5' | 'Letter' | 'Custom';
export type PublishPageOrientationAxis = PublishPageOrientation;

export interface PublishPaperSize { widthMm: number; heightMm: number; }

/** Eine Quelle fuer Formatmasse. `A4` ist der Vorgabewert, weil er der Vorgabe der Geometrie entspricht. */
export const PUBLISH_PAPER_SIZES: Readonly<Record<Exclude<PublishPaperStandard, 'Custom'>, PublishPaperSize>> = {
  A4: { widthMm: 210, heightMm: 297 },
  A3: { widthMm: 297, heightMm: 420 },
  A5: { widthMm: 148, heightMm: 210 },
  Letter: { widthMm: 215.9, heightMm: 279.4 },
};

/** Obergrenzen der Erzeugung. Jede Zahl ist eine Entscheidung, keine Schaetzung. */
export const PUBLISH_CREATION_LIMITS = {
  /** Untere Grenze: ein Dokument ohne Seite ist kein Dokument (assertPublishDocument verbietet es). */
  minPages: 1,
  maxPages: PUBLISH_LIMITS.maxPages,
  minMarginMm: 0,
  /** Ein Rand von mehr als einem Drittel der Seite liesse keine Nutzflaeche uebrig. */
  maxMarginMm: 1000,
  minBleedMm: 0,
  maxBleedMm: PUBLISH_LIMITS.maxBleedMm,
} as const;

/** Der Vertrag des Dialogs „Neues Layoutdokument". Alles optional: die Vorgabe ist eine leere A4-Seite. */
export interface PublishCreationSpec {
  /** Dokumenttitel; wird auf 512 Zeichen begrenzt, weil er im Fenster und im Dateinamen erscheint. */
  title?: string;
  paper?: PublishPaperStandard;
  /** Nur bei `paper: 'Custom'` gelesen — sonst kommen die Masse aus `PUBLISH_PAPER_SIZES`. */
  widthMm?: number;
  heightMm?: number;
  orientation?: PublishPageOrientationAxis;
  pages?: number;
  bleedMm?: number;
  marginMm?: number;
}

/** Aufgeloeste, geprueste Erzeugungsanweisung. Nach `validatePublishCreationSpec` ist sie gueltig. */
export interface PublishCreationPlan {
  title: string;
  pages: number;
  geometry: PublishPageGeometry;
}

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

function boundInt(value: unknown, fallback: number, min: number, max: number, code: string): number {
  if (value === undefined || value === null) return fallback;
  if (!finite(value) || !Number.isInteger(value)) throw new PublishModelError(`${code}-not-an-integer`);
  if (value < min) throw new PublishModelError(`${code}-below-minimum:${min}`);
  if (value > max) throw new PublishModelError(`${code}-above-maximum:${max}`);
  return value;
}

function boundMm(value: unknown, fallback: number, min: number, max: number, code: string): number {
  if (value === undefined || value === null) return fallback;
  if (!finite(value)) throw new PublishModelError(`${code}-not-a-number`);
  if (value < min) throw new PublishModelError(`${code}-below-minimum:${min}`);
  if (value > max) throw new PublishModelError(`${code}-above-maximum:${max}`);
  // Auf 0,01 mm gerundet: mehr Nachkommastellen sind in keinem Druckprozess bedeutsam und machen
  // Fingerabdruecke (Snapshots, Hashes) unnoetig instabil.
  return Math.round(value * 100) / 100;
}

/**
 * Prueft und vervollstaendigt eine Erzeugungsanweisung.
 *
 * Fail-closed: eine unsinnige Seitenzahl oder ein zu grosser Rand wird **abgelehnt**, nicht stillschweigend
 * auf den Grenzwert gestutzt. Ein stumm gekapptes Dokument waere genau der Fehler, den dieses Projekt
 * schon mehrfach bezahlt hat.
 */
export function validatePublishCreationSpec(spec: PublishCreationSpec = {}): PublishCreationPlan {
  const paper: PublishPaperStandard = spec.paper ?? 'A4';
  if (paper !== 'Custom' && !(paper in PUBLISH_PAPER_SIZES)) throw new PublishModelError(`paper-standard-unknown:${String(paper)}`);

  const base = createDefaultPublishGeometry();
  let widthMm: number;
  let heightMm: number;
  if (paper === 'Custom') {
    widthMm = boundMm(spec.widthMm, base.widthMm, PUBLISH_LIMITS.minPageMm, PUBLISH_LIMITS.maxPageMm, 'page-width');
    heightMm = boundMm(spec.heightMm, base.heightMm, PUBLISH_LIMITS.minPageMm, PUBLISH_LIMITS.maxPageMm, 'page-height');
  } else {
    const size = PUBLISH_PAPER_SIZES[paper];
    widthMm = size.widthMm;
    heightMm = size.heightMm;
  }

  const orientation: PublishPageOrientationAxis = spec.orientation ?? 'portrait';
  if (orientation !== 'portrait' && orientation !== 'landscape') throw new PublishModelError(`page-orientation-unknown:${String(orientation)}`);
  // Querformat ist eine Drehung der Masse, keine zweite Formatdefinition.
  if (orientation === 'landscape') [widthMm, heightMm] = [heightMm, widthMm];

  const marginMm = boundMm(spec.marginMm, base.marginsMm.top, PUBLISH_CREATION_LIMITS.minMarginMm, PUBLISH_CREATION_LIMITS.maxMarginMm, 'page-margin');
  // Die Nutzflaeche muss positiv bleiben — dieselbe Regel wie `validateGeometry`, hier frueh und benannt.
  if (marginMm * 2 >= widthMm || marginMm * 2 >= heightMm) throw new PublishModelError('page-margin-exceeds-page');

  const bleedMm = boundMm(spec.bleedMm, base.bleedMm, PUBLISH_CREATION_LIMITS.minBleedMm, PUBLISH_CREATION_LIMITS.maxBleedMm, 'page-bleed');
  const pages = boundInt(spec.pages, 1, PUBLISH_CREATION_LIMITS.minPages, PUBLISH_CREATION_LIMITS.maxPages, 'page-count');

  const title = (spec.title ?? '').trim().slice(0, 512);

  return {
    title,
    pages,
    geometry: {
      ...base,
      widthMm,
      heightMm,
      orientation,
      marginsMm: { top: marginMm, right: marginMm, bottom: marginMm, left: marginMm },
      bleedMm,
    },
  };
}

function createBlankPage(id: string, index: number, geometry: PublishPageGeometry, masterPageId?: string): PublishPage {
  return {
    id,
    name: `Page ${index + 1}`,
    geometry: deepClonePublish(geometry),
    rotationDeg: 0,
    masterPageId,
    masterOverrides: {},
    frameIds: [],
    guides: [],
  };
}

/**
 * Ein **leeres** Layoutdokument: keine Beispielrahmen, kein Beispieltext, keine erfundene Broschuere.
 *
 * Die Master-Seite traegt keinen Kopf- und Fusstext — ein leerer Zustand, der leer aussieht, ist die
 * Voraussetzung dafuer, dass „Broschuere mit zwei Seiten aus leerer Vorlage beginnen" ein echtes Ergebnis
 * hat und nicht nur ein umbenanntes Beispiel.
 */
export function createPublishProject(spec: PublishCreationSpec = {}): PublishDocumentModel {
  const plan = validatePublishCreationPlan(validatePublishCreationSpec(spec));
  const masterId = publishStableId('master', `${plan.geometry.widthMm}x${plan.geometry.heightMm}:${plan.geometry.orientation}`);
  const master: PublishMasterPage = {
    id: masterId,
    name: 'A-Master',
    headerText: '',
    footerText: '',
    showPageNumbers: true,
    frameIds: [],
  };
  const pages = Array.from({ length: plan.pages }, (_, index) => createBlankPage(publishStableId('page', `new:${index}:${plan.geometry.widthMm}x${plan.geometry.heightMm}`), index, plan.geometry, master.id));
  const model: PublishDocumentModel = {
    schemaVersion: 1,
    revision: 1,
    geometry: deepClonePublish(plan.geometry),
    pagesCount: pages.length,
    activePageIndex: 0,
    pages,
    facingPages: true,
    startOnRight: true,
    masterPages: [master],
    sections: [{ id: 'section-main', name: 'Main', startPageId: pages[0].id, startNumber: 1, prefix: '', numberFormat: 'arabic', includePrefix: false }],
    frames: [],
    selectedFrameId: null,
    smartGuides: { enabled: true, snapToGuides: true, snapToGrid: true, snapToFrames: true, toleranceMm: 1.5 },
    cmykSimulated: false,
    overprintPreview: false,
    showGuides: true,
    showBleed: true,
    showDocumentGrid: false,
    styles: [],
    assets: [],
    brandKits: [],
    swatches: [],
    iccProfiles: [],
    preflightProfiles: [],
    books: [],
    toc: [],
    indexEntries: [],
    captions: [],
    crossReferences: [],
    variables: [],
    comments: [],
    layoutSnapshots: [],
    storyAssignments: [],
    dataMerges: [],
    tables: [],
    charts: [],
    barcodes: [],
    workspaceReferences: [],
    exportPresets: [],
  };
  assertPublishDocument(model);
  return model;
}

function validatePublishCreationPlan(plan: PublishCreationPlan): PublishCreationPlan {
  if (!Number.isInteger(plan.pages) || plan.pages < 1) throw new PublishModelError('page-count-not-an-integer');
  if (plan.geometry.marginsMm.left + plan.geometry.marginsMm.right >= plan.geometry.widthMm) throw new PublishModelError('page-live-area-empty');
  return plan;
}

/**
 * Der sichtbare Zustand „Neues Dokument begonnen".
 *
 * Gemessen wurde vorher: nach dem Anlegen gab es **keine** Rueckmeldung. Der Nutzer sah dieselbe Flaeche
 * und konnte nicht unterscheiden, ob etwas passiert war. Diese Beschreibung ist reine Logik, damit sie
 * ein Test lesen kann, ohne eine Komponente zu rendern.
 */
export interface PublishCreationReport {
  title: string;
  pages: number;
  firstPageLabel: string;
  emptyFrames: number;
  summary: string;
}

export function describePublishCreation(model: PublishDocumentModel, title: string): PublishCreationReport {
  const first = model.pages[0];
  if (!first) throw new PublishModelError('pages-empty');
  const pages = model.pages.length;
  return {
    title,
    pages,
    firstPageLabel: pageLabel(model, first.id),
    emptyFrames: model.frames.filter(frame => frame.pageId === first.id).length,
    summary: `${title || 'Layoutdokument'} · ${pages} ${pages === 1 ? 'page' : 'pages'} · ${model.geometry.widthMm} x ${model.geometry.heightMm} mm · empty master`,
  };
}

/**
 * Ein Textrahmen, der sofort tippbar ist.
 *
 * Der Zustand „bereit zum Tippen" ist nicht „existiert", sondern: aktive Seite, ausgewaehlt, leerer Inhalt,
 * keine Verkettung, kein Ueberlauf. Diese Funktion ist die **eine** Definition davon, damit Canvas und
 * Inspector nicht zwei verschiedene Vorstellungen haben.
 */
export interface PublishFrameReadiness {
  frameId: string;
  pageId: string;
  ready: boolean;
  blockers: string[];
}

export function describeFrameReadiness(model: PublishDocumentModel, frameId: string): PublishFrameReadiness {
  const frame: PublishFrame | undefined = model.frames.find(candidate => candidate.id === frameId);
  if (!frame) throw new PublishModelError('frame-missing');
  const blockers: string[] = [];
  if (frame.type !== 'text') blockers.push('frame-not-text');
  if (frame.locked) blockers.push('frame-locked');
  if (frame.hidden) blockers.push('frame-hidden');
  if (frame.text?.previousFrameId) blockers.push('frame-is-thread-continuation');
  if (frame.text?.overset) blockers.push('frame-overset');
  const pageIndex = model.pages.findIndex(page => page.id === frame.pageId);
  if (pageIndex !== model.activePageIndex) blockers.push('frame-not-on-active-page');
  if (model.selectedFrameId !== frame.id) blockers.push('frame-not-selected');
  return { frameId: frame.id, pageId: frame.pageId, ready: blockers.length === 0, blockers };
}

/** Textmasse eines leeren Textrahmens an der Vorgabeposition — fuer „Rahmen auf Seite ziehen". */
export function createPublishTextFrame(model: PublishDocumentModel, rect: PublishRectMm, name = 'Text frame'): PublishFrame {
  const page = getActivePublishPage(model);
  return createPublishFrame('text', page.id, model.activePageIndex, {
    ...rect,
    name,
    content: '',
    semanticRole: 'P',
    text: createDefaultTextOptions(),
    typography: createDefaultPublishTypography(),
  });
}

/** Eine neue Seitengeometrie fuer eine konkrete Seite, ohne die anderen Seiten zu beruehren. */
export function applyPageSizeToModel(model: PublishDocumentModel, spec: PublishCreationSpec): PublishDocumentModel {
  const plan = validatePublishCreationPlan(validatePublishCreationSpec(spec));
  const pages = model.pages.map(page => ({ ...page, geometry: deepClonePublish(plan.geometry) }));
  const next = syncPublishCompatibility({ ...model, pages, revision: model.revision + 1 });
  assertPublishDocument(next);
  return next;
}
