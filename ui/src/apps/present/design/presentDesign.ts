// STATUS: PLATIN — Present design resolution. `ensurePresentDesign` is a *read* repair, never a
// seed: it fills a field that is **absent** and leaves an authored empty collection empty.
import {
  PresentDocumentModel,
  PresentMasterSlideDefinition,
  PresentSlide,
  PresentThemeDefinition,
  PresentNotesMasterDefinition,
  PresentHandoutMasterDefinition,
} from '../../../shared/contracts/workspace';

export const DEFAULT_PRESENT_THEMES: PresentThemeDefinition[] = [
  {
    /**
     * Round 35 (M1 user finding): a new deck must open as a **white sheet** with dark text, like a
     * PowerPoint blank presentation. This light theme is the fallback for every deck that does not
     * name one of the explicit themes below (the historical seed stored `theme: 'dark'`, which was
     * never a real theme id) — legacy decks that name `midnight`/`nordic`/… keep their colours.
     */
    id: 'paper',
    name: 'Paper (light)',
    backgroundColor: '#ffffff',
    surfaceColor: '#f8fafc',
    titleColor: '#0f172a',
    bodyColor: '#1e293b',
    accentColor: '#2563eb',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  {
    id: 'midnight',
    name: 'Midnight Sovereign',
    backgroundColor: '#0c1222',
    surfaceColor: '#111827',
    titleColor: '#f8fafc',
    bodyColor: '#cbd5e1',
    accentColor: '#38bdf8',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  {
    id: 'nordic',
    name: 'Nordic Slate',
    backgroundColor: '#0f172a',
    surfaceColor: '#1e293b',
    titleColor: '#f1f5f9',
    bodyColor: '#94a3b8',
    accentColor: '#0ea5e9',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  {
    id: 'aurora',
    name: 'Emerald Aurora',
    backgroundColor: '#071a19',
    surfaceColor: '#0b2925',
    titleColor: '#ecfdf5',
    bodyColor: '#a7f3d0',
    accentColor: '#34d399',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  {
    id: 'executive',
    name: 'Executive Gold',
    backgroundColor: '#111111',
    surfaceColor: '#1c1917',
    titleColor: '#fef08a',
    bodyColor: '#d6d3d1',
    accentColor: '#eab308',
    fontFamily: 'Georgia, serif',
  },
  {
    id: 'ivory',
    name: 'Ivory Studio',
    backgroundColor: '#f8f5ed',
    surfaceColor: '#ffffff',
    titleColor: '#172033',
    bodyColor: '#475569',
    accentColor: '#b7791f',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
];


export const DEFAULT_PRESENT_NOTES_MASTER: PresentNotesMasterDefinition = {
  backgroundColor: '#ffffff',
  titleColor: '#0f172a',
  bodyColor: '#334155',
  fontFamily: 'Inter, system-ui, sans-serif',
  notesFontSizePt: 12,
  showSlideThumbnail: true,
  showHeader: true,
  headerText: 'Astraea Present · Speaker Notes',
  showFooter: true,
  footerText: 'VisionGaiaTechnology',
  showPageNumber: true,
};

export const DEFAULT_PRESENT_HANDOUT_MASTER: PresentHandoutMasterDefinition = {
  backgroundColor: '#ffffff',
  textColor: '#0f172a',
  fontFamily: 'Inter, system-ui, sans-serif',
  slidesPerPage: 3,
  orientation: 'portrait',
  showHeader: true,
  headerText: 'Astraea Present · Handout',
  showFooter: true,
  footerText: 'VisionGaiaTechnology',
  showPageNumber: true,
  includeNotesLines: true,
};

export const DEFAULT_PRESENT_MASTERS: PresentMasterSlideDefinition[] = [
  { id: 'master-clean', name: 'Clean Standard', showFooter: true, footerText: 'VisionGaiaTechnology · Sovereign Suite' },
  { id: 'master-focus', name: 'Focus / Minimal', showFooter: false },
  { id: 'master-board', name: 'Board Review', accentColor: '#eab308', showFooter: true, footerText: 'Board Review · Strictly Confidential' },
  { id: 'master-light', name: 'Light Handout', backgroundColor: '#ffffff', titleColor: '#111827', bodyColor: '#475569', accentColor: '#2563eb', showFooter: true, footerText: 'VGT Workspace Handout' },
];

/**
 * Total read repair for a Present model. It never throws on a partial document, and it never
 * *substitutes authored content*: a field that is **absent** gets the documented default, while an
 * authored **empty** collection stays empty — an empty collection is a valid state of the schema
 * (`themes: []`, `masters: []`), not a missing one.
 *
 * Why that distinction is not cosmetic (measured, AST-0478 shape): the previous form
 * (`model.themes?.length ? model.themes : DEFAULT_PRESENT_THEMES`) replaced an empty array with the
 * five built-in themes and the four built-in masters **on every read**. Since this function runs on
 * the reopen path (`PresentCanvas.tsx:51`), the model handed back after Save → Close → Reopen was
 * *not* the model that was saved: a deck persisted with `themes: []` or `masters: []` came back
 * carrying content the user never authored. Falling back is the job of the consumers, which already
 * do it at the point of use (`resolvePresentSlideDesign`, `resolvePresentMasterId`,
 * `PresentMasterThemeModal`), so nothing here needs to be pre-seeded.
 */
export function ensurePresentDesign(model: PresentDocumentModel): PresentDocumentModel {
  return {
    ...model,
    // `slides` is normalised too: a partial or hostile model (e.g. a freshly created document whose
    // presentData is `{}`) must not make the pure master/theme helpers throw on `.forEach`.
    slides: model.slides ?? [],
    themeId: model.themeId || model.theme || DEFAULT_PRESENT_THEMES[0].id,
    themes: model.themes ?? DEFAULT_PRESENT_THEMES,
    masters: model.masters ?? DEFAULT_PRESENT_MASTERS,
    notesMaster: model.notesMaster ?? DEFAULT_PRESENT_NOTES_MASTER,
    handoutMaster: model.handoutMaster ?? DEFAULT_PRESENT_HANDOUT_MASTER,
  };
}

export interface ResolvedPresentDesign {
  backgroundColor: string;
  surfaceColor: string;
  titleColor: string;
  bodyColor: string;
  accentColor: string;
  fontFamily: string;
  footerText: string;
  showFooter: boolean;
  /**
   * Round 41 (no unchangeable branding): the footer is authored on the slide master
   * (`footerText`, `showFooter`) and its alignment is the additive optional `footerPosition`
   * extension. The old hardcoded second footer string is gone.
   */
  footerPosition: 'left' | 'center' | 'right';
}

export function resolvePresentSlideDesign(slide: PresentSlide, model: PresentDocumentModel): ResolvedPresentDesign {
  const normalized = ensurePresentDesign(model);
  const theme =
    normalized.themes?.find((candidate) => candidate.id === normalized.themeId) || DEFAULT_PRESENT_THEMES[0];
  const master =
    normalized.masters?.find((candidate) => candidate.id === slide.masterId) ||
    normalized.masters?.[0] ||
    DEFAULT_PRESENT_MASTERS[0];
  // Round 41: additive optional footer alignment on the master; legacy masters default to left.
  const footerPositionValue = (master as { footerPosition?: unknown }).footerPosition;
  const footerPosition = footerPositionValue === 'center' || footerPositionValue === 'right' ? footerPositionValue : 'left';
  return {
    backgroundColor: slide.backgroundColor || master.backgroundColor || theme.backgroundColor,
    surfaceColor: theme.surfaceColor,
    titleColor: master.titleColor || theme.titleColor,
    bodyColor: master.bodyColor || theme.bodyColor,
    accentColor: master.accentColor || theme.accentColor,
    fontFamily: theme.fontFamily,
    footerText: master.footerText || 'VisionGaiaTechnology · Sovereign Suite',
    showFooter: master.showFooter !== false,
    footerPosition,
  };
}

export function updatePresentTheme(model: PresentDocumentModel, themeId: string): PresentDocumentModel {
  const normalized = ensurePresentDesign(model);
  if (!normalized.themes?.some((theme) => theme.id === themeId)) return normalized;
  return { ...normalized, themeId, theme: themeId };
}

export function addCustomTheme(model: PresentDocumentModel, newTheme: PresentThemeDefinition): PresentDocumentModel {
  const normalized = ensurePresentDesign(model);
  const themes = [...(normalized.themes || []), newTheme];
  return { ...normalized, themes, themeId: newTheme.id, theme: newTheme.id };
}

export function updateMasterDefinition(
  model: PresentDocumentModel,
  masterId: string,
  patch: Partial<PresentMasterSlideDefinition>
): PresentDocumentModel {
  const normalized = ensurePresentDesign(model);
  const masters = (normalized.masters || []).map((m) => (m.id === masterId ? { ...m, ...patch } : m));
  return { ...normalized, masters };
}

// ---------------------------------------------------------------------------------------------
// Paket 11 "Folienmaster und Themes": Master ändern und alle abhängigen Folien kontrolliert
// aktualisieren.
//
// Before this block a master could only be edited when a slide already carried a matching
// `masterId` - and nothing in the entire Present UI ever *set* `masterId`, so the master path was
// unreachable for every real deck. `resolvePresentSlideDesign` was already the single place that
// resolves slide -> master -> theme, and it stays that way; the functions below only describe and
// perform the controlled update around it.
// ---------------------------------------------------------------------------------------------

export interface PresentMasterDependents {
  masterId: string;
  masterName: string;
  slideIds: string[];
  slideIndexes: number[];
  /** Slides that carry explicit override values and therefore do not follow every master field. */
  overriddenSlideIds: string[];
}

/** The master a slide resolves to: its own `masterId`, otherwise the deck's first master. */
export function resolvePresentMasterId(model: PresentDocumentModel, slide: PresentSlide): string {
  const normalized = ensurePresentDesign(model);
  const masters = normalized.masters ?? [];
  const explicit = masters.find((candidate) => candidate.id === slide.masterId);
  if (explicit) return explicit.id;
  return masters[0]?.id ?? DEFAULT_PRESENT_MASTERS[0].id;
}

/** Per-master slide dependency list - what a "apply to all dependents" prompt must show. */
export function listPresentMasterDependents(model: PresentDocumentModel): PresentMasterDependents[] {
  const normalized = ensurePresentDesign(model);
  const masters = normalized.masters ?? [];
  const groups = new Map<string, PresentMasterDependents>();
  for (const master of masters) {
    groups.set(master.id, {
      masterId: master.id,
      masterName: master.name,
      slideIds: [],
      slideIndexes: [],
      overriddenSlideIds: [],
    });
  }
  normalized.slides.forEach((slide, index) => {
    const masterId = resolvePresentMasterId(normalized, slide);
    const group = groups.get(masterId);
    if (!group) return;
    group.slideIds.push(slide.id);
    group.slideIndexes.push(index);
    if (slide.backgroundColor || slide.backgroundGradient) group.overriddenSlideIds.push(slide.id);
  });
  return [...groups.values()];
}

export interface PresentMasterUpdateReport {
  masterId: string;
  dependentSlideIds: string[];
  /** Slides the master now applies to. */
  updatedSlideIds: string[];
  /** Slides the caller explicitly excluded from the update. */
  detachedSlideIds: string[];
  /** Slides that keep their own explicit background instead of the master's. */
  overriddenSlideIds: string[];
  unknownSlideIds: string[];
}

export interface PresentMasterUpdateOptions {
  /** Slides that must not follow this master update (the "controlled" part of the requirement). */
  detachSlideIds?: readonly string[];
}

/**
 * Updates a master definition and reports exactly which slides follow it. Per-slide overrides are
 * never rewritten: `slide.backgroundColor` keeps winning over `master.backgroundColor` because
 * `resolvePresentSlideDesign` resolves slide first. Detached slides are assigned a different
 * master, which is the only data-level way to make them independent.
 */
export function applyPresentMasterUpdate(
  model: PresentDocumentModel,
  masterId: string,
  patch: Partial<PresentMasterSlideDefinition>,
  options: PresentMasterUpdateOptions = {}
): { model: PresentDocumentModel; report: PresentMasterUpdateReport } {
  const normalized = ensurePresentDesign(model);
  const masters = normalized.masters ?? [];
  const target = masters.find((candidate) => candidate.id === masterId);
  if (!target) {
    return {
      model: normalized,
      report: {
        masterId,
        dependentSlideIds: [],
        updatedSlideIds: [],
        detachedSlideIds: [],
        overriddenSlideIds: [],
        unknownSlideIds: [...(options.detachSlideIds ?? [])],
      },
    };
  }
  const dependents = listPresentMasterDependents(normalized).find((group) => group.masterId === masterId);
  const dependentSlideIds = dependents?.slideIds ?? [];
  const detachRequested = new Set(options.detachSlideIds ?? []);
  const detachSlideIds = dependentSlideIds.filter((id) => detachRequested.has(id));
  const unknownSlideIds = [...detachRequested].filter((id) => !dependentSlideIds.includes(id));
  const detachedSet = new Set(detachSlideIds);

  const fallbackMasterId = masters.find((candidate) => candidate.id !== masterId)?.id ?? masterId;
  const slides = normalized.slides.map((slide) => {
    if (!detachedSet.has(slide.id)) return slide;
    return { ...slide, masterId: fallbackMasterId };
  });

  const updatedMasters = masters.map((candidate) => (candidate.id === masterId ? { ...candidate, ...patch } : candidate));
  return {
    model: { ...normalized, masters: updatedMasters, slides },
    report: {
      masterId,
      dependentSlideIds,
      updatedSlideIds: dependentSlideIds.filter((id) => !detachedSet.has(id)),
      detachedSlideIds: detachSlideIds,
      overriddenSlideIds: (dependents?.overriddenSlideIds ?? []).filter((id) => !detachedSet.has(id)),
      unknownSlideIds,
    },
  };
}

export type PresentMasterAssignment =
  | { ok: true; model: PresentDocumentModel; previousMasterId: string; masterId: string }
  | { ok: false; model: PresentDocumentModel; reason: 'unknown-slide' | 'unknown-master' | 'unchanged' };

/** Assigns a slide to a master. Fail-closed: an unknown slide or master changes nothing. */
export function assignPresentSlideMaster(
  model: PresentDocumentModel,
  slideId: string,
  masterId: string
): PresentMasterAssignment {
  const normalized = ensurePresentDesign(model);
  const slide = normalized.slides.find((candidate) => candidate.id === slideId);
  if (!slide) return { ok: false, model: normalized, reason: 'unknown-slide' };
  if (!(normalized.masters ?? []).some((master) => master.id === masterId)) {
    return { ok: false, model: normalized, reason: 'unknown-master' };
  }
  const previousMasterId = resolvePresentMasterId(normalized, slide);
  if (previousMasterId === masterId) return { ok: false, model: normalized, reason: 'unchanged' };
  return {
    ok: true,
    model: { ...normalized, slides: normalized.slides.map((candidate) => (candidate.id === slideId ? { ...candidate, masterId } : candidate)) },
    previousMasterId,
    masterId,
  };
}

export interface PresentThemeApplicationReport {
  themeId: string;
  /** Slides with an explicit background that keep it. */
  preservedSlideBackgrounds: number;
  /** Object-level colour overrides that are untouched by a theme change. */
  preservedObjectColors: number;
  /** Text objects with an explicit colour. */
  preservedTextObjects: number;
  changed: boolean;
}

const OBJECT_COLOR_FIELDS = ['color', 'fillColor', 'strokeColor', 'accentColor', 'headerColor', 'bodyColor', 'textColor'] as const;

/**
 * Paket 12: "Ein Theme anwenden ohne benutzerdefinierte Textformatierung zu zerstören".
 *
 * Applying a theme is a pure `themeId`/`theme` switch. It is deliberately *not* a "reset
 * formatting" operation: no slide and no object field is written. The report counts the
 * overrides that survive, so the UI can state what was preserved instead of claiming it.
 */
export function applyPresentTheme(
  model: PresentDocumentModel,
  themeId: string
): { model: PresentDocumentModel; report: PresentThemeApplicationReport } {
  const normalized = ensurePresentDesign(model);
  const known = (normalized.themes ?? []).some((theme) => theme.id === themeId);
  const current = normalized.themeId ?? normalized.theme ?? DEFAULT_PRESENT_THEMES[0].id;
  if (!known || current === themeId) {
    return {
      model: normalized,
      report: {
        themeId: current,
        preservedSlideBackgrounds: countSlidesWithBackground(normalized),
        preservedObjectColors: countObjectColors(normalized),
        preservedTextObjects: countTextObjects(normalized),
        changed: false,
      },
    };
  }
  return {
    model: updatePresentTheme(normalized, themeId),
    report: {
      themeId,
      preservedSlideBackgrounds: countSlidesWithBackground(normalized),
      preservedObjectColors: countObjectColors(normalized),
      preservedTextObjects: countTextObjects(normalized),
      changed: true,
    },
  };
}

function countSlidesWithBackground(model: PresentDocumentModel): number {
  return model.slides.filter((slide) => Boolean(slide.backgroundColor || slide.backgroundGradient)).length;
}

function countObjectColors(model: PresentDocumentModel): number {
  let count = 0;
  for (const slide of model.slides) {
    for (const object of slide.sceneObjects ?? []) {
      const record = object as unknown as Record<string, unknown>;
      for (const field of OBJECT_COLOR_FIELDS) if (typeof record[field] === 'string' && record[field]) count += 1;
    }
  }
  return count;
}

function countTextObjects(model: PresentDocumentModel): number {
  let count = 0;
  for (const slide of model.slides) {
    for (const object of slide.sceneObjects ?? []) if (object.kind === 'text' && object.color) count += 1;
  }
  return count;
}

