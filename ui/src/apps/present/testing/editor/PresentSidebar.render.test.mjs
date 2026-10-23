// Contract test: the Present sidebar must expose the "start blank deck" entry, a real layout
// chooser for the next new slide, keyboard-reachable thumbnails and a refused slide limit state.

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PresentSidebar } from '../../editor/navigation/PresentSidebar';

const slides = [
  { id: 's1', title: 'First', subtitle: '', layout: 'cards' },
  { id: 's2', title: 'Second', subtitle: '', layout: 'bullet-list', hidden: true },
];

const render = (overrides = {}) => renderToStaticMarkup(createElement(PresentSidebar, {
  slides,
  activeSlideIdx: 0,
  currentView: 'normal',
  onChangeView: vi.fn(),
  onSelectSlide: vi.fn(),
  onAddSlide: vi.fn(),
  onStartBlankDeck: vi.fn(),
  slideLimitReached: false,
  onDuplicateSlide: vi.fn(),
  onDeleteSlide: vi.fn(),
  onReorderSlides: vi.fn(),
  onToggleHideSlide: vi.fn(),
  onStartPresenterMode: vi.fn(),
  onExportPdf: vi.fn(),
  onExportPng: vi.fn(),
  onOpenReview: vi.fn(),
  onOpenProductivity: vi.fn(),
  onOpenExportCenter: vi.fn(),
  reviewStatus: 'editing',
  ...overrides,
}));

describe('PresentSidebar contract', () => {
  it('offers the seed-free start and a five-preset layout chooser', () => {
    const html = render();
    expect(html).toContain('data-present-blank-deck="true"');
    expect(html).toContain('Start blank deck');
    expect(html).toContain('data-present-new-slide-layout="true"');
    for (const label of ['Title slide', 'Title and content', 'Two content', 'Cards', 'Blank']) {
      expect(html).toContain(label);
    }
  });

  it('makes every thumbnail focusable, labelled and marked with its hidden state as text', () => {
    const html = render();
    expect(html).toContain('data-present-slide-thumbnail="1"');
    expect(html).toContain('data-present-slide-thumbnail="2"');
    expect(html).toContain('role="button"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('aria-label="Slide 1: First"');
    expect(html).toContain('aria-label="Slide 2: Second (hidden)"');
    expect(html).toContain('HIDDEN');
  });

  it('disables slide creation and says so when the deck limit is reached', () => {
    const html = render({ slideLimitReached: true });
    expect(html).toContain('disabled');
    expect(html).toContain('Slide limit reached');
  });
});
