import { secureRandomId } from '../../../shared/crypto/secureRandom';
// STATUS: DIAMANT VGT SUPREME — Present productivity, deck reuse, duplicate and master hygiene core
import type { PresentDocumentModel, PresentSceneObject, PresentSlide, PresentSlideCard } from '../../../shared/contracts/workspace';

const MAX_QUERY = 512;
const MAX_REPLACE = 8_192;
const MAX_SLIDES = 2_048;
const MAX_TEXT = 32_768;

/**
 * Round 24 (malformed entries): an array can still contain `null`/primitives. Readers filter those
 * entries; replacements preserve them untouched (no silent data repair, nothing is removed).
 */
function isPlainPresentRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export interface PresentSearchHit {
  slideId: string;
  slideIndex: number;
  field: 'title' | 'subtitle' | 'speakerNotes' | 'bullet' | 'card-title' | 'card-description' | 'scene-text' | 'table-cell' | 'chart-title';
  objectId?: string;
  matchCount: number;
}

function boundedText(value: unknown, max = MAX_TEXT): string {
  return String(value ?? '').normalize('NFKC').slice(0, max);
}

function countLiteral(value: string, query: string, caseSensitive: boolean): number {
  if (!query) return 0;
  const haystack = caseSensitive ? value : value.toLocaleLowerCase();
  const needle = caseSensitive ? query : query.toLocaleLowerCase();
  let count = 0;
  let offset = 0;
  while (offset <= haystack.length - needle.length) {
    const index = haystack.indexOf(needle, offset);
    if (index < 0) break;
    count += 1;
    offset = index + Math.max(1, needle.length);
  }
  return count;
}

function replaceLiteral(value: string, query: string, replacement: string, caseSensitive: boolean): string {
  if (!query) return value;
  if (caseSensitive) return value.split(query).join(replacement);
  const lower = value.toLocaleLowerCase();
  const needle = query.toLocaleLowerCase();
  const chunks: string[] = [];
  let cursor = 0;
  let index = lower.indexOf(needle);
  while (index >= 0) {
    chunks.push(value.slice(cursor, index), replacement);
    cursor = index + query.length;
    index = lower.indexOf(needle, cursor);
  }
  chunks.push(value.slice(cursor));
  return chunks.join('').slice(0, MAX_TEXT);
}

function sceneObjectTextEntries(object: PresentSceneObject): Array<{ field: PresentSearchHit['field']; value: string; key?: string }> {
  if (object.kind === 'text') return [{ field: 'scene-text', value: object.text }];
  if (object.kind === 'table') {
    // Round 24: the table's own lists can be malformed too; only real lists are read.
    if (!Array.isArray(object.columns) || !Array.isArray(object.rows)) return [];
    const entries: Array<{ field: PresentSearchHit['field']; value: string; key?: string }> = [];
    object.columns.forEach((value, index) => entries.push({ field: 'table-cell', value, key: `h:${index}` }));
    object.rows.forEach((row, rowIndex) => {
      if (!Array.isArray(row)) return;
      row.forEach((value, colIndex) => entries.push({ field: 'table-cell', value, key: `${rowIndex}:${colIndex}` }));
    });
    return entries;
  }
  if (object.kind === 'chart') {
    const chart = object.chart as { title?: unknown } | null | undefined;
    return [{ field: 'chart-title', value: isPlainPresentRecord(chart) ? (chart.title ?? '') as string : '' }];
  }
  return [];
}

export function searchPresentDeck(model: PresentDocumentModel, rawQuery: string, caseSensitive = false): PresentSearchHit[] {
  const query = boundedText(rawQuery, MAX_QUERY);
  if (!query) return [];
  const hits: PresentSearchHit[] = [];
  model.slides.slice(0, MAX_SLIDES).forEach((slide, slideIndex) => {
    const push = (field: PresentSearchHit['field'], value: string, objectId?: string) => {
      // Round 23 (malformed non-mount path): a hostile scalar can be non-string; it is coerced for
      // the match only (no document repair), so `countLiteral` never sees a non-string.
      const matchCount = countLiteral(typeof value === 'string' ? value : String(value ?? ''), query, caseSensitive);
      if (matchCount) hits.push({ slideId: slide.id, slideIndex, field, objectId, matchCount });
    };
    // Round 24: entries are hostile too — only plain objects are inspected; null/primitive entries
    // contribute no hit and are never written back.
    const bulletPoints = Array.isArray(slide.bulletPoints) ? slide.bulletPoints : [];
    const cards = Array.isArray(slide.cards) ? slide.cards.filter(isPlainPresentRecord) : [];
    const sceneObjects = Array.isArray(slide.sceneObjects) ? slide.sceneObjects.filter(isPlainPresentRecord) : [];
    push('title', slide.title);
    push('subtitle', slide.subtitle);
    push('speakerNotes', slide.speakerNotes ?? '');
    bulletPoints.forEach((value) => push('bullet', value));
    cards.forEach((card) => {
      push('card-title', card.title, card.id);
      push('card-description', card.description, card.id);
    });
    sceneObjects.forEach((object) => sceneObjectTextEntries(object).forEach((entry) => push(entry.field, entry.value, object.id)));
  });
  return hits;
}

export function replacePresentDeckText(
  model: PresentDocumentModel,
  rawQuery: string,
  rawReplacement: string,
  caseSensitive = false,
): { model: PresentDocumentModel; replacements: number } {
  const query = boundedText(rawQuery, MAX_QUERY);
  const replacement = boundedText(rawReplacement, MAX_REPLACE);
  if (!query) return { model, replacements: 0 };
  let replacements = 0;
  const replace = (value: string): string => {
    // Round 23 (malformed non-mount path): non-string scalars are returned unchanged; the helper is
    // also used on list entries that a hostile payload can fill with non-strings.
    if (typeof value !== 'string') return value;
    const count = countLiteral(value, query, caseSensitive);
    if (!count) return value;
    replacements += count;
    return replaceLiteral(value, query, replacement, caseSensitive);
  };
  const slides = model.slides.slice(0, MAX_SLIDES).map((slide) => ({
    ...slide,
    title: replace(slide.title),
    subtitle: replace(slide.subtitle),
    speakerNotes: slide.speakerNotes === undefined ? undefined : replace(slide.speakerNotes),
    // Round 23: only real lists are mapped; a non-array hostile value is passed through unchanged
    // (no schema repair, no throw).
    bulletPoints: Array.isArray(slide.bulletPoints) ? slide.bulletPoints.map((value) => replace(value)) : slide.bulletPoints,
    cards: Array.isArray(slide.cards)
      ? slide.cards.map((card) => (isPlainPresentRecord(card)
        ? { ...card, title: replace(card.title), description: replace(card.description) }
        : card))
      : slide.cards,
    sceneObjects: Array.isArray(slide.sceneObjects)
      ? slide.sceneObjects.map((object): PresentSceneObject => {
        // Round 24: null/primitive entries stay exactly as they are (no repair, no removal).
        if (!isPlainPresentRecord(object)) return object;
        if (object.kind === 'text') return { ...object, text: replace(object.text) };
        if (object.kind === 'table') {
          if (!Array.isArray(object.columns) || !Array.isArray(object.rows)) return object;
          return {
            ...object,
            columns: object.columns.map((value) => replace(value)),
            rows: object.rows.map((row) => (Array.isArray(row) ? row.map((value) => replace(value)) : row)),
          };
        }
        if (object.kind === 'chart') {
          const chart = object.chart;
          if (!isPlainPresentRecord(chart)) return object;
          return { ...object, chart: { ...chart, title: replace(chart.title ?? '') } };
        }
        return object;
      })
      : slide.sceneObjects,
  }));
  return { model: { ...model, slides }, replacements };
}

function stableObjectSignature(object: PresentSceneObject): unknown {
  const { id: _id, morphKey: _morphKey, ...rest } = object;
  return rest;
}

function stableSlideSignature(slide: PresentSlide): string {
  // Round 14 (malformed document): `cards`/`images` may be non-array hostile values. The duplicate
  // detector runs in an always-mounted modal preview, so a crash here would take the module down.
  const cards: readonly PresentSlideCard[] = Array.isArray(slide.cards) ? slide.cards.filter(isPlainPresentRecord) : [];
  const images = Array.isArray(slide.images) ? slide.images.filter(isPlainPresentRecord) : [];
  // Round 16: `sceneObjects` is hostile input too (non-array used to crash the always-mounted
  // duplicate detector with `.map is not a function`). Round 24: entries are filtered as well.
  const sceneObjects = Array.isArray(slide.sceneObjects) ? slide.sceneObjects.filter(isPlainPresentRecord) : [];
  return JSON.stringify({
    title: slide.title,
    subtitle: slide.subtitle,
    category: slide.category,
    categoryTag: slide.categoryTag,
    layout: slide.layout,
    cards: cards.map(({ id: _id, ...card }) => card),
    bulletPoints: slide.bulletPoints,
    speakerNotes: slide.speakerNotes,
    backgroundColor: slide.backgroundColor,
    backgroundGradient: slide.backgroundGradient,
    images: images.map(({ id: _id, morphKey: _morphKey, ...image }) => image),
    sceneObjects: sceneObjects.map(stableObjectSignature),
    masterId: slide.masterId,
    transition: slide.transition,
  });
}

export interface PresentDuplicateGroup {
  fingerprint: string;
  slideIds: string[];
  slideIndexes: number[];
}

export function findDuplicatePresentSlides(slides: readonly PresentSlide[]): PresentDuplicateGroup[] {
  const groups = new Map<string, { slideIds: string[]; slideIndexes: number[] }>();
  slides.slice(0, MAX_SLIDES).forEach((slide, index) => {
    const fingerprint = stableSlideSignature(slide);
    const current = groups.get(fingerprint) ?? { slideIds: [], slideIndexes: [] };
    current.slideIds.push(slide.id);
    current.slideIndexes.push(index);
    groups.set(fingerprint, current);
  });
  return [...groups.entries()]
    .filter(([, group]) => group.slideIds.length > 1)
    .map(([fingerprint, group]) => ({ fingerprint, ...group }));
}

export function cleanupUnusedPresentMasters(model: PresentDocumentModel): { model: PresentDocumentModel; removedMasterIds: string[] } {
  const masters = model.masters ?? [];
  if (masters.length <= 1) return { model, removedMasterIds: [] };
  const used = new Set(model.slides.map((slide) => slide.masterId).filter((id): id is string => Boolean(id)));
  used.add(masters[0].id);
  const removedMasterIds = masters.filter((master) => !used.has(master.id)).map((master) => master.id);
  return { model: { ...model, masters: masters.filter((master) => used.has(master.id)) }, removedMasterIds };
}

function randomId(prefix: string): string {
  const suffix = secureRandomId('present');
  return `${prefix}-${suffix}`;
}

function remapSceneObject(object: PresentSceneObject, idMap: Map<string, string>): PresentSceneObject {
  const nextId = randomId(`reuse-${object.kind}`);
  idMap.set(object.id, nextId);
  return { ...structuredClone(object), id: nextId, morphKey: object.morphKey || object.id } as PresentSceneObject;
}

export function reusePresentSlides(sourceSlides: readonly PresentSlide[], existingSlideIds: ReadonlySet<string>): PresentSlide[] {
  const output: PresentSlide[] = [];
  sourceSlides.slice(0, MAX_SLIDES).forEach((source) => {
    const idMap = new Map<string, string>();
    // Round 23 (malformed non-mount path): every list is hostile input here too. A reuse produces a
    // complete, valid slide; a non-array source list is normalised to an empty list (never a partial
    // mutation of the source — `structuredClone` keeps it untouched).
    const sourceSceneObjects = Array.isArray(source.sceneObjects) ? source.sceneObjects.filter(isPlainPresentRecord) : [];
    const sourceImages = Array.isArray(source.images) ? source.images.filter(isPlainPresentRecord) : [];
    const sourceCards = Array.isArray(source.cards) ? source.cards.filter(isPlainPresentRecord) : [];
    const sourceAnimations = Array.isArray(source.animations) ? source.animations.filter(isPlainPresentRecord) : [];
    const sceneObjects = sourceSceneObjects.map((object) => remapSceneObject(object, idMap));
    const images = sourceImages.map((image) => {
      const id = randomId('reuse-image');
      idMap.set(image.id, id);
      return { ...structuredClone(image), id, morphKey: image.morphKey || image.id };
    });
    const cards = sourceCards.map((card) => {
      const id = randomId('reuse-card');
      idMap.set(card.id, id);
      return { ...structuredClone(card), id };
    });
    let slideId = randomId('reuse-slide');
    while (existingSlideIds.has(slideId) || output.some((slide) => slide.id === slideId)) slideId = randomId('reuse-slide');
    const animations = sourceAnimations.map((animation) => ({
      ...structuredClone(animation),
      id: randomId('reuse-animation'),
      targetId: idMap.get(animation.targetId) ?? animation.targetId,
      triggerObjectId: animation.triggerObjectId ? (idMap.get(animation.triggerObjectId) ?? animation.triggerObjectId) : undefined,
    }));
    output.push({ ...structuredClone(source), id: slideId, sceneObjects, images, cards, animations });
  });
  return output;
}
