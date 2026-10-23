// @vitest-environment happy-dom
// STATUS: PLATIN — WR-038: review chrome is a mode, and the normal editor stays quiet
//
// Native M7 probe: every paragraph with a pending revision showed a "Revision (author)" tile
// and a ⟦n⟧ marker while the user was simply writing, because the markup selector defaulted to
// `'all'` and its switch was only reachable while tracking was on. Review mode is now explicit.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WriterRevision } from '../../types';
import { WriterReviewBar } from '../WriterReviewBar';
import { WRITER_REVIEW_BAR_COPY } from '../writerReviewBarLocale';

const COPY = WRITER_REVIEW_BAR_COPY['en-US'];

const revision = {
  id: 'rev-1',
  paragraphId: 'p1',
  author: 'Astra',
  timestamp: 1,
  status: 'pending',
  type: 'insert',
  text: 'neu',
} as unknown as WriterRevision;

const baseProps = {
  trackChangesEnabled: false,
  onToggleTrackChanges: vi.fn(),
  reviewMode: 'all' as const,
  onChangeReviewMode: vi.fn(),
  revisions: [revision],
  onAcceptAllRevisions: vi.fn(),
  onRejectAllRevisions: vi.fn(),
  onOpenNewComment: vi.fn(),
  isFindReplaceOpen: false,
  onToggleFindReplace: vi.fn(),
  showFormattingMarks: false,
  onToggleFormattingMarks: vi.fn(),
  commentsCount: 2,
};

let container: HTMLElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

afterEach(async () => {
  if (root) {
    await act(async () => { root!.unmount(); });
    root = null;
  }
  container?.remove();
  container = null;
});

describe('WR-038 — review mode gates the review chrome', () => {
  it('hides markup, accept/reject and the pane while review mode is off', () => {
    const markup = renderToStaticMarkup(
      <WriterReviewBar
        {...baseProps}
        reviewModeActive={false}
        onToggleReviewMode={vi.fn()}
        isReviewPaneOpen={false}
        onToggleReviewPane={vi.fn()}
      />,
    );
    expect(markup).toContain('data-writer-review-mode-toggle="off"');
    // No accept/reject buttons, no markup select, no pane toggle without review mode.
    expect(markup).not.toContain('Alle Änderungen annehmen');
    expect(markup).not.toContain('Alle Markups');
    expect(markup).not.toContain(COPY.reviewPaneTitle);
  });

  it('shows them again as soon as review mode is on', () => {
    const markup = renderToStaticMarkup(
      <WriterReviewBar
        {...baseProps}
        revisionActionsLocked={false}
        trackChangesEnabled
        reviewModeActive
        onToggleReviewMode={vi.fn()}
        onToggleReviewPane={vi.fn()}
      />,
    );
    expect(markup).toContain('data-writer-review-mode-toggle="on"');
    expect(markup).toContain('Alle Änderungen annehmen');
    expect(markup).toContain('Alle Markups');
  });

  it('toggles the mode through the visible control', async () => {
    const onToggleReviewMode = vi.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(<WriterReviewBar {...baseProps} reviewModeActive={false} onToggleReviewMode={onToggleReviewMode} />);
    });
    const toggle = container.querySelector<HTMLElement>('[data-writer-review-mode-toggle]');
    expect(toggle).not.toBeNull();
    expect(toggle!.getAttribute('aria-pressed')).toBe('false');
    await act(async () => {
      toggle!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(onToggleReviewMode).toHaveBeenCalledTimes(1);
  });

  it('keeps the track-changes switch available in both modes', () => {
    const off = renderToStaticMarkup(<WriterReviewBar {...baseProps} reviewModeActive={false} onToggleReviewMode={vi.fn()} />);
    expect(off).toContain(COPY.trackChanges);
  });
});
