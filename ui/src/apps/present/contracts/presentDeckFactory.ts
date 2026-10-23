// STATUS: PLATIN — deterministic slide/deck factories for Present.
//
// Paket 1 "Leeres Foliendeck beginnen" and Paket 2 "Folien hinzufügen und Layout wählen".
//
// Before this module `PresentCanvas.handleAddSlide` hard-coded one slide shape (`layout: 'cards'`
// with two seed cards), so a "Titel-", "Text-", "Zweispalten-" or "Blanko-" slide could not be
// created from the toolbar at all, and `layout: 'split'` was declared in the contract, validated
// by the interop model check and never rendered. These factories are the single definition of
// "what a new slide of kind X contains".

import type {
  PresentDocumentModel,
  PresentSceneObject,
  PresentSlide,
  PresentSlideCard,
} from '../../../shared/contracts/workspace';
import { readPresentGroupId, withPresentGroupId } from '../canvas/model/presentObjectExtensions';

/** Editing ceiling for one deck. Interop has its own, stricter 512-slide ceiling. */
export const PRESENT_DECK_SLIDE_LIMIT = 2048;

export type PresentSlideLayoutKind = 'title' | 'title-content' | 'two-column' | 'cards' | 'blank';

export interface PresentSlideLayoutPreset {
  kind: PresentSlideLayoutKind;
  /** Layout value actually stored on the slide. */
  layout: PresentSlide['layout'];
  label: string;
  description: string;
}

export const PRESENT_SLIDE_LAYOUT_PRESETS: readonly PresentSlideLayoutPreset[] = [
  { kind: 'title', layout: 'blank', label: 'Title slide', description: 'Title and subtitle placeholder only' },
  { kind: 'title-content', layout: 'bullet-list', label: 'Title and content', description: 'Title, subtitle and one bullet placeholder' },
  { kind: 'two-column', layout: 'split', label: 'Two content', description: 'Title and two side-by-side content placeholders' },
  { kind: 'cards', layout: 'cards', label: 'Cards', description: 'Title and a row of content cards' },
  { kind: 'blank', layout: 'blank', label: 'Blank', description: 'No placeholder at all' },
];

/**
 * Round 35 (M1 user finding): a new slide is a **freeform blank sheet**, not the fixed
 * "Title and content" placeholder arrangement. The layout presets stay available in the toolbar;
 * only the default for "+ New Slide" changed.
 */
export const PRESENT_DEFAULT_SLIDE_LAYOUT_KIND: PresentSlideLayoutKind = 'blank';

export function presentSlideLayoutPreset(kind: PresentSlideLayoutKind): PresentSlideLayoutPreset {
  return PRESENT_SLIDE_LAYOUT_PRESETS.find((preset) => preset.kind === kind)
    ?? (PRESENT_SLIDE_LAYOUT_PRESETS[1] as PresentSlideLayoutPreset);
}

/** Reverse mapping used by the toolbar to show which preset an existing slide corresponds to. */
export function presentSlideLayoutKind(layout: PresentSlide['layout'] | undefined): PresentSlideLayoutKind {
  if (layout === 'split') return 'two-column';
  if (layout === 'cards') return 'cards';
  if (layout === 'bullet-list' || layout === 'chart') return 'title-content';
  return 'blank';
}

export interface CreatePresentSlideOptions {
  /** Stable slide id. The caller owns id generation so this factory stays pure. */
  id: string;
  /** 1-based position, used for the placeholder text. */
  sequence: number;
  sectionId?: string;
  /** Localised placeholder texts; defaults are the English editor placeholders. */
  placeholderTitle?: string;
  placeholderBody?: string;
}

/**
 * Builds one slide of the requested kind. Pure and deterministic: identical options produce an
 * identical slide, so it is directly testable and safe to use inside a coalesced commit.
 */
export function createPresentSlide(
  kind: PresentSlideLayoutKind,
  options: CreatePresentSlideOptions,
): PresentSlide {
  const preset = presentSlideLayoutPreset(kind);
  const sequence = Number.isFinite(options.sequence) ? Math.max(1, Math.floor(options.sequence)) : 1;
  const title = options.placeholderTitle ?? `Slide ${sequence}`;
  const body = options.placeholderBody ?? 'Click to add text';
  const base: PresentSlide = {
    id: options.id,
    title,
    subtitle: '',
    category: '',
    categoryTag: '',
    layout: preset.layout,
    speakerNotes: '',
  };
  if (options.sectionId) base.sectionId = options.sectionId;

  if (kind === 'blank') {
    return { ...base, title: '', subtitle: '', layout: 'blank' };
  }
  if (kind === 'title') {
    return { ...base, subtitle: body };
  }
  if (kind === 'title-content') {
    return { ...base, subtitle: body, bulletPoints: [`${body} 1`] };
  }
  if (kind === 'two-column') {
    return {
      ...base,
      subtitle: body,
      cards: [
        { id: `${options.id}-left`, title: 'Left column', description: body, colorTheme: 'blue' },
        { id: `${options.id}-right`, title: 'Right column', description: body, colorTheme: 'emerald' },
      ],
    };
  }
  return {
    ...base,
    subtitle: body,
    cards: [
      { id: `${options.id}-card-1`, title: 'Point 1', description: body, colorTheme: 'blue' },
      { id: `${options.id}-card-2`, title: 'Point 2', description: body, colorTheme: 'emerald' },
    ],
  };
}

/**
 * A deck with exactly one slide and no seeded content - the "ohne Seed-Zwang" start.
 * `title` and `subtitle` are empty on purpose; only the placeholder text of the title field is
 * visible while editing, and it is not part of the document.
 */
export function createEmptyPresentDeck(options: { slideId: string; aspectRatio?: string }): PresentDocumentModel {
  const model: PresentDocumentModel = {
    slides: [createPresentSlide('title', { id: options.slideId, sequence: 1, placeholderTitle: '', placeholderBody: '' })],
    aspectRatio: options.aspectRatio ?? '16:9',
  };
  return model;
}

/**
 * Duplicates one slide with a fresh id and fresh ids for everything that is *referenced by id*.
 *
 * This is Paket 3's "Folien duplizieren" rule and it lived inline in `PresentCanvas` before, where
 * it silently produced (a) two objects sharing a group key, (b) animations whose `targetId` pointed
 * at the original slide's objects, and (c) comments attached to objects that no longer exist in the
 * copy. The remapping is explicit here so a counter-test can prove it.
 *
 * Not remapped on purpose: `presenterInk` (slide-level strokes), `speakerNotes`, `transition`,
 * `recording` (a take belongs to the slide) and `sectionId` (the copy stays in its section).
 */
export function duplicatePresentSlide(slide: PresentSlide, newId: string): PresentSlide {
  const suffix = newId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) || 'copy';
  const sceneIdMap = new Map<string, string>();
  const sceneObjects = (slide.sceneObjects ?? []).map((object, index) => {
    const nextId = `present-${object.kind}-${suffix}-${index}`;
    sceneIdMap.set(object.id, nextId);
    return { ...object, morphKey: object.morphKey || object.id, id: nextId };
  });
  const imageIdMap = new Map<string, string>();
  const images = (slide.images ?? []).map((image, index) => {
    const nextId = `present-image-${suffix}-${index}`;
    imageIdMap.set(image.id, nextId);
    return { ...image, morphKey: image.morphKey || image.id, id: nextId };
  });
  // A duplicated group must become its own group, otherwise clicking one copy selects both slides'
  // objects (they would share the group key). The group key is read and written through the single
  // documented accessor pair, never by touching the property directly.
  const groupRemap = new Map<string, string>();
  const grouped = sceneObjects.filter((object) => Boolean(readPresentGroupId(object)));
  for (const object of grouped) {
    const groupId = readPresentGroupId(object) as string;
    if (!groupRemap.has(groupId)) groupRemap.set(groupId, `present-group-copy-${suffix}-${groupRemap.size}`);
  }
  const remappedObjects: PresentSceneObject[] = groupRemap.size
    ? sceneObjects.map((object) => {
        const groupId = readPresentGroupId(object);
        if (!groupId) return object;
        return withPresentGroupId(object, groupRemap.get(groupId) ?? groupId);
      })
    : sceneObjects;

  const mapObjectId = (id: string | undefined): string | undefined =>
    id === undefined ? undefined : sceneIdMap.get(id) ?? imageIdMap.get(id) ?? id;

  return {
    ...slide,
    id: newId,
    title: `${slide.title} (Copy)`,
    cards: slide.cards?.map((card, index) => ({ ...card, id: `${card.id}-copy-${index}` })),
    images,
    sceneObjects: remappedObjects,
    animations: (slide.animations ?? []).map((animation, index) => ({
      ...animation,
      id: `${animation.id}-copy-${index}`,
      targetId: mapObjectId(animation.targetId) ?? animation.targetId,
      triggerObjectId: animation.triggerObjectId ? mapObjectId(animation.triggerObjectId) : undefined,
    })),
    comments: slide.comments?.map((comment, index) => ({
      ...comment,
      id: `${comment.id}-copy-${index}`,
      slideId: newId,
      targetObjectId: comment.targetObjectId ? mapObjectId(comment.targetObjectId) : undefined,
    })),
  };
}

/**
 * Splits a list into two columns for the `split` layout: the first half left, the rest right.
 * An odd count puts the extra item in the left column, so the reader's eye order is preserved.
 */
export function splitPresentTwoColumn<T>(items: readonly T[]): { left: T[]; right: T[] } {
  const list = [...items];
  if (list.length <= 1) return { left: list, right: [] };
  const leftCount = Math.ceil(list.length / 2);
  return { left: list.slice(0, leftCount), right: list.slice(leftCount) };
}

/** Visible card list of a slide, normalised to a bounded array. */
export function presentSlideCards(slide: PresentSlide): PresentSlideCard[] {
  // Round 14 (malformed document): `cards` is hostile input; a non-array value used to crash the
  // stage on its two-column projection with `slide.cards.filter is not a function`.
  const cards: unknown = slide.cards;
  if (!Array.isArray(cards)) return [];
  return cards.filter((card): card is PresentSlideCard => Boolean(card) && typeof card === 'object');
}

/** True when the deck holds no user content at all (used for the visible empty state). */
export function isPresentDeckEmpty(model: PresentDocumentModel | undefined): boolean {
  const slides = model?.slides ?? [];
  if (slides.length > 1) return false;
  const slide = slides[0];
  if (!slide) return true;
  const hasText = Boolean(slide.title?.trim() || slide.subtitle?.trim() || slide.speakerNotes?.trim());
  const hasContent = Boolean(
    (slide.bulletPoints ?? []).length ||
      (slide.cards ?? []).length ||
      (slide.sceneObjects ?? []).length ||
      (slide.images ?? []).length,
  );
  return !hasText && !hasContent;
}
