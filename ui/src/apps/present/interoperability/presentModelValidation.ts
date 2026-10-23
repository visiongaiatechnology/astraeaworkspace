// STATUS: PLATIN — runtime boundary checks for private presentation model parts
import type { PresentDocumentModel } from '../../../shared/contracts/workspace';

const PRESENT_LAYOUTS = new Set(['cards', 'chart', 'split', 'bullet-list', 'blank']);
const MAX_SLIDES = 512;
const MAX_COLLECTION_ITEMS = 10_000;
const MAX_PRESENT_STRING_CHARS = 1_048_576;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBoundedString(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_PRESENT_STRING_CHARS;
}

function isRecordArray(value: unknown, maximum = MAX_COLLECTION_ITEMS): boolean {
  return Array.isArray(value)
    && value.length <= maximum
    && value.every(isRecord);
}

function isPresentationCard(value: unknown): boolean {
  return isRecord(value)
    && isBoundedString(value.id)
    && isBoundedString(value.title)
    && isBoundedString(value.description);
}

function isPresentationSlide(value: unknown): boolean {
  if (!isRecord(value)
    || !isBoundedString(value.id)
    || !isBoundedString(value.title)
    || !isBoundedString(value.subtitle)
    || typeof value.layout !== 'string'
    || !PRESENT_LAYOUTS.has(value.layout)) return false;

  if (value.bulletPoints !== undefined
    && (!Array.isArray(value.bulletPoints)
      || value.bulletPoints.length > MAX_COLLECTION_ITEMS
      || !value.bulletPoints.every(isBoundedString))) return false;
  if (value.cards !== undefined
    && (!Array.isArray(value.cards)
      || value.cards.length > MAX_COLLECTION_ITEMS
      || !value.cards.every(isPresentationCard))) return false;

  for (const key of ['images', 'sceneObjects', 'animations', 'comments', 'presenterInk'] as const) {
    if (value[key] !== undefined && !isRecordArray(value[key])) return false;
  }
  if (value.transition !== undefined) {
    if (!isRecord(value.transition)
      || !isBoundedString(value.transition.effect)
      || typeof value.transition.durationMs !== 'number'
      || !Number.isFinite(value.transition.durationMs)) return false;
  }
  return true;
}

/**
 * Validate the fields consumed by the presentation view before trusting a
 * private JSON model embedded in an otherwise hostile Office package.
 */
export function isValidPresentInteropModel(value: unknown): value is PresentDocumentModel {
  if (!isRecord(value)
    || !Array.isArray(value.slides)
    || value.slides.length === 0
    || value.slides.length > MAX_SLIDES
    || !value.slides.every(isPresentationSlide)) return false;

  for (const key of ['themes', 'masters', 'sections', 'customShows', 'packagedFonts'] as const) {
    if (value[key] !== undefined && !isRecordArray(value[key])) return false;
  }
  if (value.interopPreservedParts !== undefined && !isRecordArray(value.interopPreservedParts, 96)) return false;
  if (value.theme !== undefined && !isBoundedString(value.theme)) return false;
  if (value.themeId !== undefined && !isBoundedString(value.themeId)) return false;
  if (value.aspectRatio !== undefined && !isBoundedString(value.aspectRatio)) return false;
  return true;
}
