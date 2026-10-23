// STATUS: PLATIN — verifies live Writer review-bar labels and accessible text across locales.
import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { WORKSPACE_LOCALES } from '../../../../shell/localization/workspaceLocaleTypes';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import { WRITER_REVIEW_BAR_COPY } from '../writerReviewBarLocale';
import { WriterReviewBar } from '../WriterReviewBar';

vi.mock('../../../../shell/localization/workspaceLocale', () => ({
  useWorkspaceLocale: vi.fn(),
}));

const noop = (): void => undefined;

const reviewBarProps = {
  trackChangesEnabled: false,
  onToggleTrackChanges: noop,
  reviewMode: 'all',
  onChangeReviewMode: noop,
  onToggleReviewPane: noop,
  revisions: [],
  onAcceptAllRevisions: noop,
  onRejectAllRevisions: noop,
  onOpenCompareModal: noop,
  onOpenProtectionModal: noop,
  onOpenNewComment: noop,
  onToggleCollaboration: noop,
  isFindReplaceOpen: false,
  onToggleFindReplace: noop,
  showFormattingMarks: false,
  onToggleFormattingMarks: noop,
  commentsCount: 0,
} satisfies ComponentProps<typeof WriterReviewBar>;

const escapeAttribute = (value: string): string => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;');

describe('Writer review bar locale coverage', () => {
  it('keeps each supported locale complete and populated', () => {
    const englishKeys = Object.keys(WRITER_REVIEW_BAR_COPY['en-US']).sort();

    for (const locale of WORKSPACE_LOCALES) {
      const copy = WRITER_REVIEW_BAR_COPY[locale];
      expect(Object.keys(copy).sort(), locale).toEqual(englishKeys);
      for (const key of englishKeys as (keyof typeof copy)[]) {
        const value = copy[key];
        if (typeof value === 'string') expect(value.trim(), `${locale}.${key}`).not.toBe('');
      }
      expect(copy.collaborationOnline(2).trim(), `${locale}.collaborationOnline`).not.toBe('');
      expect(copy.collaborationConnectedTitle('SyncGraph', 1).trim(), `${locale}.collaborationConnectedTitle`).not.toBe('');
    }
  });

  it('renders every visible review action and accessible hint in every locale', () => {
    for (const locale of WORKSPACE_LOCALES) {
      vi.mocked(useWorkspaceLocale).mockReturnValue({
        preference: locale,
        locale,
        setPreference: noop,
      });

      const copy = WRITER_REVIEW_BAR_COPY[locale];
      const markup = renderToStaticMarkup(<WriterReviewBar {...reviewBarProps} />);

      expect(markup).toContain(`<span>${copy.trackChanges}</span>`);
      expect(markup).toContain(`title="${escapeAttribute(copy.trackChangesTitle)}"`);
      expect(markup).toContain(`<span>${copy.reviewPane}</span>`);
      expect(markup).toContain(`title="${escapeAttribute(copy.reviewPaneTitle)}"`);
      expect(markup).toContain(`<span>${copy.compare}</span>`);
      expect(markup).toContain(`title="${escapeAttribute(copy.compareTitle)}"`);
      expect(markup).toContain(`<span>${copy.protection}</span>`);
      expect(markup).toContain(`title="${escapeAttribute(copy.protectionTitle)}"`);
      expect(markup).toContain(`<span>${copy.comment}</span>`);
      expect(markup).toContain(`title="${escapeAttribute(copy.commentTitle)}"`);
      expect(markup).toContain(`<span>${copy.find}</span>`);
      expect(markup).toContain(`title="${escapeAttribute(copy.findTitle)}"`);
      expect(markup).toContain(`aria-label="${escapeAttribute(copy.formattingMarks)}"`);
      expect(markup).toContain(`<span>${copy.collaboration}</span>`);
      expect(markup).toContain(`title="${escapeAttribute(copy.collaborationUnavailable)}"`);
    }
  });

  it('localizes the collaboration action label and hint in each connection state', () => {
    for (const locale of WORKSPACE_LOCALES) {
      vi.mocked(useWorkspaceLocale).mockReturnValue({
        preference: locale,
        locale,
        setPreference: noop,
      });

      const copy = WRITER_REVIEW_BAR_COPY[locale];
      const startMarkup = renderToStaticMarkup(
        <WriterReviewBar {...reviewBarProps} collaborationAvailable />,
      );
      expect(startMarkup).toContain(`<span>${copy.collaboration}</span>`);
      expect(startMarkup).toContain(`title="${escapeAttribute(copy.collaborationStartTitle)}"`);

      const connectingMarkup = renderToStaticMarkup(
        <WriterReviewBar {...reviewBarProps} collaborationAvailable collaborationConnecting />,
      );
      expect(connectingMarkup).toContain(`<span>${copy.collaborationConnecting}</span>`);
      expect(connectingMarkup).toContain(`title="${escapeAttribute(copy.collaborationConnecting)}"`);

      const onlineMarkup = renderToStaticMarkup(
        <WriterReviewBar
          {...reviewBarProps}
          collaborationAvailable
          collaborationEnabled
          collaborationPeerCount={2}
          collaborationTransportLabel="SyncGraph"
        />,
      );
      expect(onlineMarkup).toContain(`<span>${copy.collaborationOnline(3)}</span>`);
      expect(onlineMarkup).toContain(`title="${escapeAttribute(copy.collaborationConnectedTitle('SyncGraph', 2))}"`);

      const errorMarkup = renderToStaticMarkup(
        <WriterReviewBar
          {...reviewBarProps}
          collaborationAvailable
          collaborationError="internal native error"
        />,
      );
      expect(errorMarkup).toContain(`title="${escapeAttribute(copy.collaborationError)}"`);
      expect(errorMarkup).not.toContain('internal native error');
    }
  });

  it('uses the localized protection hint when tracking is locked', () => {
    for (const locale of WORKSPACE_LOCALES) {
      vi.mocked(useWorkspaceLocale).mockReturnValue({
        preference: locale,
        locale,
        setPreference: noop,
      });

      const copy = WRITER_REVIEW_BAR_COPY[locale];
      const markup = renderToStaticMarkup(<WriterReviewBar {...reviewBarProps} trackChangesLocked />);

      expect(markup).toContain(`title="${escapeAttribute(copy.trackChangesLockedTitle)}"`);
    }
  });
});
