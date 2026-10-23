// @vitest-environment happy-dom
// STATUS: PLATIN — WR-033: where a newly inserted image is anchored and how it is revealed
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Paragraph } from '../../../../../shared/contracts/workspace';
import {
  readVisibleWriterParagraphIds,
  resolveWriterImageAnchorParagraphId,
} from '../../../media/images/operations/writerImageAnchorTargeting';
import {
  revealWriterImage,
  scheduleWriterImageReveal,
} from '../../../media/images/operations/writerImageReveal';

function paragraph(id: string): Paragraph {
  return { id, style: { alignment: 'left', line_height: 1.5, space_before: 0, space_after: 0 }, spans: [{ text: id }] };
}

const paragraphs = [paragraph('p1'), paragraph('p2'), paragraph('p3')];

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('WR-033 — the image is anchored where the user is', () => {
  it('prefers the paragraph the caret is in, even when the active paragraph is stale', () => {
    expect(resolveWriterImageAnchorParagraphId({
      paragraphs,
      caretParagraphId: 'p3',
      activeParagraphId: 'p1',
      visibleParagraphIds: ['p1', 'p2', 'p3'],
    })).toBe('p3');
  });

  it('keeps the active paragraph when the user can see it', () => {
    expect(resolveWriterImageAnchorParagraphId({
      paragraphs,
      activeParagraphId: 'p2',
      visibleParagraphIds: ['p2', 'p3'],
    })).toBe('p2');
  });

  it('falls back to the last visible paragraph when the active one is off screen', () => {
    expect(resolveWriterImageAnchorParagraphId({
      paragraphs,
      activeParagraphId: 'p1',
      visibleParagraphIds: ['p2', 'p3'],
    })).toBe('p3');
  });

  it('appends to the flow when nothing can be measured', () => {
    expect(resolveWriterImageAnchorParagraphId({
      paragraphs,
      activeParagraphId: 'p1',
      visibleParagraphIds: [],
    })).toBe('p1');
    expect(resolveWriterImageAnchorParagraphId({ paragraphs: [], activeParagraphId: 'gone' })).toBeUndefined();
    expect(resolveWriterImageAnchorParagraphId({
      paragraphs: [],
      caretParagraphId: null,
      activeParagraphId: null,
    })).toBeUndefined();
  });

  it('ignores ids that no longer exist', () => {
    expect(resolveWriterImageAnchorParagraphId({
      paragraphs,
      caretParagraphId: 'deleted',
      activeParagraphId: 'also-deleted',
    })).toBe('p3');
  });
});

describe('WR-033 — the visible paragraphs are measured from the scroll container', () => {
  function mountScrollContainer(): HTMLElement {
    const container = document.createElement('div');
    container.setAttribute('data-writer-scroll-container', 'true');
    document.body.appendChild(container);
    container.getBoundingClientRect = () => ({ top: 0, bottom: 100, height: 100, left: 0, right: 100, width: 100, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    return container;
  }

  it('returns nothing without a scroll container', () => {
    expect(readVisibleWriterParagraphIds()).toEqual([]);
  });

  it('filters off-screen paragraphs and keeps document order', () => {
    const container = mountScrollContainer();
    const add = (id: string, top: number, bottom: number): void => {
      const element = document.createElement('div');
      element.setAttribute('data-writer-paragraph-anchor', id);
      element.getBoundingClientRect = () => ({ top, bottom, height: bottom - top, left: 0, right: 100, width: 100, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
      container.appendChild(element);
    };
    add('p1', -40, 20);
    add('p2', 120, 180);
    add('p3', 40, 90);

    expect(readVisibleWriterParagraphIds()).toEqual(['p1', 'p3']);
  });

  it('returns every id when the layout cannot be measured (headless DOM)', () => {
    const container = document.createElement('div');
    container.setAttribute('data-writer-scroll-container', 'true');
    document.body.appendChild(container);
    // A zero-height container is "not measurable", not "nothing visible".
    container.getBoundingClientRect = () => ({ top: 0, bottom: 0, height: 0, left: 0, right: 0, width: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    for (const id of ['p1', 'p2']) {
      const element = document.createElement('div');
      element.setAttribute('data-writer-paragraph-anchor', id);
      container.appendChild(element);
    }
    expect(readVisibleWriterParagraphIds()).toEqual(['p1', 'p2']);
  });
});

describe('WR-033 — the inserted image is revealed', () => {
  function mountImage(id: string): HTMLElement {
    const figure = document.createElement('figure');
    figure.setAttribute('data-writer-image-id', id);
    document.body.appendChild(figure);
    return figure;
  }

  it('scrolls the figure into view and marks it', () => {
    const figure = mountImage('img-1');
    const scrollIntoView = vi.fn();
    figure.scrollIntoView = scrollIntoView;

    expect(revealWriterImage('img-1')).toBe(true);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', behavior: 'smooth' });
    expect(figure.getAttribute('data-writer-image-revealed')).toBe('true');
  });

  it('returns false when the image is not rendered', () => {
    expect(revealWriterImage('missing')).toBe(false);
  });

  it('reveals after the scheduled frames', () => {
    const figure = mountImage('img-2');
    const scrollIntoView = vi.fn();
    figure.scrollIntoView = scrollIntoView;
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });

    scheduleWriterImageReveal('img-2');
    expect(scrollIntoView).not.toHaveBeenCalled();
    while (frames.length > 0) frames.shift()!(0);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });
});
