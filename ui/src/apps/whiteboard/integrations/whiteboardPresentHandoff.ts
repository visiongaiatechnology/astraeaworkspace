// STATUS: PLATIN — bounded, disclosure-aware Whiteboard-to-Present projection.
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import type { PresentSlide, PresentSlideCard } from '../../../shared/contracts/present/workspacePresent';
import { secureRandomId } from '../../../shared/crypto/secureRandom';
import type { WhiteboardItem } from '../types';

const MAX_WHITEBOARD_ITEMS = 100_000;
const MAX_PRESENTATION_SLIDES = 256;
const MAX_FRAME_ITEM_CHECKS = 2_000_000;
const MAX_CARDS_PER_SLIDE = 9;
const MAX_TEXT_LENGTH = 240;
const CARD_THEMES = ['blue', 'emerald', 'purple', 'amber', 'rose'] as const;

const cleanText = (value: unknown, limit = MAX_TEXT_LENGTH): string => {
  const maximum = Math.max(0, Math.min(1024, Math.trunc(Number.isFinite(limit) ? limit : MAX_TEXT_LENGTH)));
  if (typeof value !== 'string') return '';
  return value.slice(0, maximum * 4).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maximum);
};

const safeGeometry = (item: WhiteboardItem): boolean =>
  Number.isFinite(item.x) && Number.isFinite(item.y) && Number.isFinite(item.width) && Number.isFinite(item.height) &&
  item.width > 0 && item.height > 0 && Number.isFinite(item.x + item.width) && Number.isFinite(item.y + item.height);

const fullyContains = (frame: WhiteboardItem, item: WhiteboardItem): boolean =>
  item.x >= frame.x && item.y >= frame.y && item.x + item.width <= frame.x + frame.width && item.y + item.height <= frame.y + frame.height;

const semanticTitle = (item: WhiteboardItem): string => cleanText(
  item.diagram?.title || item.card?.title || item.document?.title || item.chart?.title ||
  item.liveObject?.sourceTitle || item.media?.name || item.icon?.label || item.name || item.text,
);

function presentCard(item: WhiteboardItem, id: string, index: number) {
  const title = `${String(index + 1).padStart(2, '0')}. ${cleanText(item.type, 40).toUpperCase() || 'OBJECT'}`;
  const description = semanticTitle(item) || 'Whiteboard object';
  return { id, title, description, colorTheme: CARD_THEMES[index % CARD_THEMES.length] };
}

function selectVisibleFrames(items: readonly WhiteboardItem[], presentationPath: readonly string[]): { frames: WhiteboardItem[]; requestedCount: number; invalidCount: number } {
  const frameById = new Map<string, WhiteboardItem>();
  const allFrames: WhiteboardItem[] = [];
  for (const item of items) {
    if (item.type !== 'frame' || item.hidden || !safeGeometry(item)) continue;
    if (!frameById.has(item.id)) {
      frameById.set(item.id, item);
      allFrames.push(item);
    }
  }
  const requested = presentationPath.length > 0 ? presentationPath : allFrames.map(({ id }) => id);
  const selected: WhiteboardItem[] = [];
  const seen = new Set<string>();
  let invalidCount = 0;
  for (const id of requested) {
    if (typeof id !== 'string' || seen.has(id)) continue;
    seen.add(id);
    const frame = frameById.get(id);
    if (frame) selected.push(frame);
    else invalidCount += 1;
  }
  return { frames: selected.slice(0, MAX_PRESENTATION_SLIDES), requestedCount: selected.length, invalidCount };
}

function buildSlideNotes(sourceTitle: string, frame: WhiteboardItem | undefined, containedCount: number, scanComplete: boolean, options: {
  invalidFrames: number;
  omittedFrames: number;
  hiddenObjects: number;
  omittedConnectors: number;
  invalidObjects: number;
}): string {
  const prefix = frame
    ? `Source: ${sourceTitle}. Frame ${cleanText(frame.id, 120)}; `
    : `Source: ${sourceTitle}. `;
  const objectCount = scanComplete ? `${containedCount} contained Whiteboard object(s).` : `at least ${containedCount} contained Whiteboard object(s) in the bounded scan; total count is incomplete.`;
  const disclosures = [
    'Only the first nine visible non-connector objects become cards; additional objects are omitted.',
    `Connectors omitted: ${options.omittedConnectors}. Hidden objects omitted: ${options.hiddenObjects}.`,
    `Invalid-geometry objects omitted: ${options.invalidObjects}.`,
    'Whiteboard editing and collaboration semantics are not transferred.',
  ];
  if (options.invalidFrames > 0) disclosures.push(`${options.invalidFrames} selected frame reference(s) were unavailable and skipped.`);
  if (options.omittedFrames > 0) disclosures.push(`${options.omittedFrames} additional frame(s) were omitted by the slide limit or scan budget.`);
  return cleanText(`${prefix}${objectCount} ${disclosures.join(' ')}`, 1024);
}

export function buildPresentDocumentFromWhiteboard(
  document: WorkspaceDocument,
  items: readonly WhiteboardItem[],
  presentationPath: readonly string[],
  now = Date.now(),
): WorkspaceDocument {
  if (document.kind !== 'Whiteboard') throw new Error('whiteboard_present_source_kind_invalid');
  if (items.length > MAX_WHITEBOARD_ITEMS || presentationPath.length > MAX_WHITEBOARD_ITEMS) {
    throw new Error('whiteboard_present_input_limit_exceeded');
  }
  const seenIds = new Set<string>();
  for (const item of items) {
    if (!item.id || seenIds.has(item.id)) throw new Error('whiteboard_present_duplicate_item_id');
    seenIds.add(item.id);
  }

  const timestamp = Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.trunc(Number.isFinite(now) ? now : Date.now())));
  const exportId = secureRandomId('whiteboard-present');
  const sourceTitle = cleanText(document.title, 180) || 'Whiteboard';
  const selectedFrames = selectVisibleFrames(items, presentationPath);
  const frames = selectedFrames.frames;
  const visibleItems = items.filter((item) => item.type !== 'connector' && item.type !== 'frame' && !item.hidden && safeGeometry(item));
  const hiddenObjects = items.reduce((count, item) => count + (item.hidden ? 1 : 0), 0);
  const omittedConnectors = items.reduce((count, item) => count + (item.type === 'connector' ? 1 : 0), 0);
  const invalidObjects = items.reduce((count, item) => count + (item.type !== 'frame' && item.type !== 'connector' && !item.hidden && !safeGeometry(item) ? 1 : 0), 0);
  const slides: PresentSlide[] = [];
  let remainingChecks = MAX_FRAME_ITEM_CHECKS;
  let scanStopped = false;

  for (const [frameIndex, frame] of frames.entries()) {
    const cards: PresentSlideCard[] = [];
    let containedCount = 0;
    let scannedCount = 0;
    for (const item of visibleItems) {
      if (remainingChecks <= 0) { scanStopped = true; break; }
      remainingChecks -= 1;
      scannedCount += 1;
      if (!fullyContains(frame, item)) continue;
      containedCount += 1;
      if (cards.length < MAX_CARDS_PER_SLIDE) cards.push(presentCard(item, `${exportId}-card-${frameIndex}-${cards.length}`, cards.length));
    }
    const scanComplete = scannedCount === visibleItems.length;
    const omittedFrames = Math.max(0, selectedFrames.requestedCount - frames.length) + (scanStopped ? Math.max(0, frames.length - frameIndex - 1) : 0);
    const notes = buildSlideNotes(sourceTitle, frame, containedCount, scanComplete, {
      invalidFrames: selectedFrames.invalidCount,
      omittedFrames,
      hiddenObjects,
      omittedConnectors,
      invalidObjects,
    });
    slides.push({
      id: `${exportId}-slide-${frameIndex}`,
      title: cleanText(frame.text || frame.name, 180) || `Frame ${frameIndex + 1}`,
      subtitle: `Whiteboard frame ${frameIndex + 1} of ${selectedFrames.requestedCount}`,
      category: 'Whiteboard Export',
      categoryTag: 'Whiteboard Export',
      layout: 'cards',
      cards,
      speakerNotes: notes,
    });
    if (scanStopped) break;
  }

  if (slides.length === 0) {
    if (selectedFrames.invalidCount > 0 && presentationPath.length > 0) {
      slides.push({
        id: `${exportId}-slide-0`,
        title: `${sourceTitle} · No selected frames`,
        subtitle: 'No Whiteboard frame matched the selected presentation path.',
        category: 'Whiteboard Export',
        categoryTag: 'Whiteboard Export',
        layout: 'cards',
        cards: [],
        speakerNotes: cleanText(`Source: ${sourceTitle}. No objects were exported because no selected visible frame was available. ${selectedFrames.invalidCount} frame reference(s) were skipped.`, 1024),
      });
    } else {
      const cards = visibleItems.slice(0, MAX_CARDS_PER_SLIDE).map((item, index) => presentCard(item, `${exportId}-card-board-${index}`, index));
      const truncated = visibleItems.length > MAX_CARDS_PER_SLIDE;
      slides.push({
        id: `${exportId}-slide-0`,
        title: sourceTitle,
        subtitle: 'Generated from Astraea Whiteboard',
        category: 'Whiteboard Export',
        categoryTag: 'Whiteboard Export',
        layout: 'cards',
        cards,
        speakerNotes: cleanText(`Source: ${sourceTitle}. ${visibleItems.length} visible non-connector object(s); ${truncated ? 'additional objects are omitted. ' : ''}Connectors omitted: ${omittedConnectors}. Hidden objects omitted: ${hiddenObjects}. Invalid-geometry objects omitted: ${invalidObjects}. Whiteboard editing and collaboration semantics are not transferred.`, 1024),
      });
    }
  }

  if (scanStopped && slides.length > 0) {
    const last = slides[slides.length - 1];
    if (last) last.speakerNotes = cleanText(`${last.speakerNotes ?? ''} Frame processing stopped at the two-million item-check budget; remaining frame(s) were omitted.`, 1024);
  }

  return {
    id: exportId,
    title: `${sourceTitle}-Presentation`,
    kind: 'Present',
    created_at: timestamp,
    modified_at: timestamp,
    version: 1,
    theme_id: cleanText(document.theme_id, 120) || 'default',
    root_object_ids: [],
    objects: {},
    presentData: { theme: 'dark', aspectRatio: '16:9', slides },
  } as WorkspaceDocument;
}
