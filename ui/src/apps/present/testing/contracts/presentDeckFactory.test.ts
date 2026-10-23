// BATCH-PRESENT — slide/deck factories and the two-column layout (Paket 1, 2).
import { describe, expect, it } from 'vitest';
import type { PresentDocumentModel } from '../../../../shared/contracts/workspace';
import {
  PRESENT_DECK_SLIDE_LIMIT,
  PRESENT_SLIDE_LAYOUT_PRESETS,
  createEmptyPresentDeck,
  createPresentSlide,
  isPresentDeckEmpty,
  presentSlideLayoutKind,
  presentSlideLayoutPreset,
  splitPresentTwoColumn,
} from '../../contracts/presentDeckFactory';

describe('Present slide layout presets', () => {
  it('covers the four layouts the toolbar must offer plus cards', () => {
    expect(PRESENT_SLIDE_LAYOUT_PRESETS.map((preset) => preset.kind)).toEqual([
      'title',
      'title-content',
      'two-column',
      'cards',
      'blank',
    ]);
    // Every stored layout value must be one the interop validator accepts.
    const accepted = new Set(['cards', 'chart', 'split', 'bullet-list', 'blank']);
    for (const preset of PRESENT_SLIDE_LAYOUT_PRESETS) expect(accepted.has(preset.layout), preset.kind).toBe(true);
  });

  it('creates a title, text, two-column and blank slide with the expected shape', () => {
    const title = createPresentSlide('title', { id: 'a', sequence: 1 });
    expect(title).toMatchObject({ id: 'a', title: 'Slide 1', layout: 'blank' });
    expect(title.bulletPoints).toBeUndefined();
    expect(title.cards).toBeUndefined();

    const text = createPresentSlide('title-content', { id: 'b', sequence: 2 });
    expect(text.layout).toBe('bullet-list');
    expect(text.bulletPoints).toEqual(['Click to add text 1']);

    const twoColumn = createPresentSlide('two-column', { id: 'c', sequence: 3 });
    expect(twoColumn.layout).toBe('split');
    expect(twoColumn.cards?.map((card) => card.id)).toEqual(['c-left', 'c-right']);

    const blank = createPresentSlide('blank', { id: 'd', sequence: 4 });
    expect(blank).toMatchObject({ layout: 'blank', title: '', subtitle: '' });
    expect(blank.cards).toBeUndefined();
  });

  it('is deterministic and honours localised placeholders and a section', () => {
    const first = createPresentSlide('title-content', { id: 'x', sequence: 7, sectionId: 'sec-1' });
    const second = createPresentSlide('title-content', { id: 'x', sequence: 7, sectionId: 'sec-1' });
    expect(first).toEqual(second);
    expect(first.sectionId).toBe('sec-1');
    const localised = createPresentSlide('title-content', {
      id: 'y',
      sequence: 1,
      placeholderTitle: 'Folie 1',
      placeholderBody: 'Zum Bearbeiten klicken',
    });
    expect(localised.title).toBe('Folie 1');
    expect(localised.bulletPoints).toEqual(['Zum Bearbeiten klicken 1']);
  });

  it('maps an existing slide layout back to a preset so the toolbar can show it', () => {
    expect(presentSlideLayoutKind('split')).toBe('two-column');
    expect(presentSlideLayoutKind('cards')).toBe('cards');
    expect(presentSlideLayoutKind('bullet-list')).toBe('title-content');
    expect(presentSlideLayoutKind('chart')).toBe('title-content');
    expect(presentSlideLayoutKind('blank')).toBe('blank');
    expect(presentSlideLayoutKind(undefined)).toBe('blank');
    expect(presentSlideLayoutPreset('two-column').layout).toBe('split');
  });

  it('starts an empty deck with exactly one content-free slide and no seeded text', () => {
    const deck = createEmptyPresentDeck({ slideId: 'slide-blank' });
    expect(deck.slides).toHaveLength(1);
    expect(deck.slides[0]).toMatchObject({ id: 'slide-blank', title: '', subtitle: '', speakerNotes: '' });
    expect(deck.aspectRatio).toBe('16:9');
    expect(isPresentDeckEmpty(deck)).toBe(true);
    expect(deck.slides.length).toBeLessThan(PRESENT_DECK_SLIDE_LIMIT);
  });

  it('reports a deck as non-empty as soon as it holds real content', () => {
    const empty = createEmptyPresentDeck({ slideId: 's' });
    expect(isPresentDeckEmpty(empty)).toBe(true);
    const withTitle: PresentDocumentModel = { ...empty, slides: [{ ...empty.slides[0], title: 'Board review' }] };
    expect(isPresentDeckEmpty(withTitle)).toBe(false);
    const withObject: PresentDocumentModel = {
      ...empty,
      slides: [
        {
          ...empty.slides[0],
          sceneObjects: [
            { id: 'o', kind: 'text', text: 'x', fontSizePt: 12, color: '#fff', xPercent: 0, yPercent: 0, widthPercent: 10, heightPercent: 10, zIndex: 1 },
          ],
        },
      ],
    };
    expect(isPresentDeckEmpty(withObject)).toBe(false);
    expect(isPresentDeckEmpty(undefined)).toBe(true);
  });

  it('splits a two-column body keeping the reading order and the extra item on the left', () => {
    expect(splitPresentTwoColumn(['a'])).toEqual({ left: ['a'], right: [] });
    expect(splitPresentTwoColumn(['a', 'b'])).toEqual({ left: ['a'], right: ['b'] });
    expect(splitPresentTwoColumn(['a', 'b', 'c'])).toEqual({ left: ['a', 'b'], right: ['c'] });
    expect(splitPresentTwoColumn([])).toEqual({ left: [], right: [] });
    // Reading order across the two columns equals the original order.
    const items = ['1', '2', '3', '4', '5'];
    const { left, right } = splitPresentTwoColumn(items);
    expect([...left, ...right]).toEqual(items);
  });
});
