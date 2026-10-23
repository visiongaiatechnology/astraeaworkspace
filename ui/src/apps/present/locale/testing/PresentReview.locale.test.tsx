import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { PresentActivityEntry, PresentDeckVersionSnapshot, PresentDocumentModel, PresentSlide, PresentSlideComment, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import { WORKSPACE_LOCALES } from '../../../../shell/localization/workspaceLocaleTypes';
import { PresentCommentsModal } from '../../review/PresentCommentsModal';
import { PresentReviewCollaborationModal } from '../../review/PresentReviewCollaborationModal';
import { PresentReviewErrorAlert } from '../../review/PresentReviewErrorAlert';
import { PRESENT_REVIEW_COPY, presentCommentFailureCopy, presentReviewFailureCopy } from '../presentReviewLocale';

vi.mock('../../../../shell/localization/workspaceLocale', () => ({ useWorkspaceLocale: vi.fn() }));

const noop = (): void => undefined;
const rootComment: PresentSlideComment = {
  id: 'thread-authored-1', slideId: 'slide-1', author: 'Priya', text: 'Please verify @maria', timestamp: 1_728_000_000_000,
  resolved: false, mentions: ['maria'],
};
const replyComment: PresentSlideComment = {
  id: 'reply-authored-1', slideId: 'slide-1', author: 'Maria', text: 'The source data is correct.', timestamp: 1_728_000_060_000,
  resolved: false, parentId: rootComment.id,
};
const slide: PresentSlide = {
  id: 'slide-1', title: 'Customer roadmap — authored title', subtitle: '', layout: 'blank', comments: [rootComment, replyComment],
};
const previousSlide: PresentSlide = { ...slide, title: 'Previous authored slide title', comments: undefined };
const activity: PresentActivityEntry = {
  id: 'activity-authored-1', timestamp: 1_728_000_000_000, actor: 'Review participant', action: 'comment', summary: 'User-authored review summary',
};
const identicalSnapshot: PresentDeckVersionSnapshot = {
  id: 'version-identical', label: 'User-authored release label', author: 'Version author', timestamp: 1_728_000_000_000, slides: [slide],
};
const changedSnapshot: PresentDeckVersionSnapshot = {
  id: 'version-changed', label: 'Previous checkpoint', author: 'Version author', timestamp: 1_727_999_000_000, slides: [previousSlide],
};

function makeModel(versions: PresentDeckVersionSnapshot[]): PresentDocumentModel {
  return {
    slides: [slide],
    collaboration: {
      activity: [activity],
      versions,
      review: { status: 'in-review', reviewMode: true, approvals: [] },
    },
  };
}

const document: WorkspaceDocument = {
  id: 'document-1', title: 'Workspace presentation title', kind: 'Present', created_at: 1, modified_at: 1, version: 1,
  theme_id: 'theme-default', root_object_ids: [], objects: {}, presentData: makeModel([identicalSnapshot]),
};

describe('Present review dialog localization', () => {
  it('keeps seven-locale comment copy aligned and renders accessible controls without translating authored content', () => {
    const commentKeys = Object.keys(PRESENT_REVIEW_COPY['en-US'].comments).sort();
    const errorKeys = Object.keys(PRESENT_REVIEW_COPY['en-US'].comments.errors).sort();
    for (const locale of WORKSPACE_LOCALES) {
      vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: locale, locale, setPreference: noop });
      const copy = PRESENT_REVIEW_COPY[locale].comments;
      expect(Object.keys(copy).sort(), `${locale} comment copy`).toEqual(commentKeys);
      expect(Object.keys(copy.errors).sort(), `${locale} comment errors`).toEqual(errorKeys);
      expect(copy.deleteComment('Priya')).toContain('Priya');
      expect(copy.replyToThread('authored-1')).toContain('authored-1');

      const markup = renderToStaticMarkup(<PresentCommentsModal isOpen slide={slide} onClose={noop} onAddComment={noop} onToggleResolve={noop} onDeleteComment={noop}/>);
      for (const label of [copy.title, copy.close, copy.reply, copy.resolveThread, copy.authorName, copy.authorPlaceholder, copy.commentPlaceholder, copy.post]) {
        expect(markup, `${locale}: ${label}`).toContain(label.replaceAll('&', '&amp;'));
      }
      expect(markup).toContain(`aria-label="${copy.deleteComment('Priya')}"`);
      expect(markup).toContain('role="dialog"');
      expect(markup).toContain('aria-modal="true"');
      expect(markup).toContain('Customer roadmap — authored title');
      expect(markup).toContain('Please verify @maria');
      expect(markup).toContain('The source data is correct.');
      expect(markup).toContain(copy.defaultReviewer);
      expect(markup).toContain('min-w-0');
      expect(markup).toContain('break-words');
      expect(markup).toContain('grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]');
      const emptySlideMarkup = renderToStaticMarkup(<PresentCommentsModal isOpen slide={{ ...slide, title: '' }} onClose={noop} onAddComment={noop} onToggleResolve={noop} onDeleteComment={noop}/>);
      expect(emptySlideMarkup).toContain(copy.untitled);

      const errorMarkup = renderToStaticMarkup(<PresentReviewErrorAlert message={presentCommentFailureCopy(locale, new Error('private parser detail'))}/>);
      expect(errorMarkup).toContain('role="alert"');
      expect(errorMarkup).toContain('aria-live="assertive"');
      expect(errorMarkup).toContain(copy.errors.generic);
      expect(errorMarkup).not.toContain('private parser detail');
      expect(presentCommentFailureCopy(locale, new Error('present_comment_required_fields'))).toBe(copy.errors.required);
    }
  });

  it('keeps seven-locale collaboration copy aligned and renders review, snapshot, history, and diff controls', () => {
    const collaborationKeys = Object.keys(PRESENT_REVIEW_COPY['en-US'].collaboration).sort();
    const statuses = Object.keys(PRESENT_REVIEW_COPY['en-US'].collaboration.statuses).sort();
    const diffStatuses = Object.keys(PRESENT_REVIEW_COPY['en-US'].collaboration.diffStatuses).sort();
    for (const locale of WORKSPACE_LOCALES) {
      vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: locale, locale, setPreference: noop });
      const copy = PRESENT_REVIEW_COPY[locale].collaboration;
      expect(Object.keys(copy).sort(), `${locale} collaboration copy`).toEqual(collaborationKeys);
      expect(Object.keys(copy.statuses).sort(), `${locale} statuses`).toEqual(statuses);
      expect(Object.keys(copy.diffStatuses).sort(), `${locale} diff statuses`).toEqual(diffStatuses);
      expect(copy.approvals(4)).toContain('4');
      expect(copy.reviewMode(true)).not.toBe(copy.reviewMode(false));
      expect(copy.defaultVersionLabel(3)).toContain('3');

      const model = makeModel([identicalSnapshot]);
      const markup = renderToStaticMarkup(<PresentReviewCollaborationModal isOpen document={document} model={model} onClose={noop} onUpdateModel={noop}/>);
      for (const label of [copy.title, copy.subtitle, copy.close, copy.reviewState, copy.actorName, copy.submitReview, copy.backToEditing, copy.approve, copy.requestChanges, copy.deckVersions, copy.versionLabel, copy.snapshot, copy.selectSnapshot, copy.noChanges, copy.activityHistory]) {
        expect(markup, `${locale}: ${label}`).toContain(label.replaceAll('&', '&amp;'));
      }
      expect(markup).toContain(`aria-label="${copy.close}"`);
      expect(markup).toContain(`aria-label="${copy.actorName}"`);
      expect(markup).toContain(`aria-label="${copy.selectSnapshot}"`);
      expect(markup).toContain(copy.statuses['in-review']);
      expect(markup).toContain(copy.approvals(0));
      expect(markup).toContain(copy.reviewMode(true));
      expect(markup).toContain(copy.defaultReviewer);
      expect(markup).toContain('role="dialog"');
      expect(markup).toContain('aria-modal="true"');
      expect(markup).toContain('User-authored release label');
      expect(markup).toContain('Review participant');
      expect(markup).toContain('User-authored review summary');
      expect(markup).toContain(copy.noChanges);
      expect(markup).toContain('grid-cols-1 gap-0 lg:grid-cols-2');
      expect(markup).toContain('whitespace-normal break-words');
      expect(markup).toContain('min-w-0');

      const diffMarkup = renderToStaticMarkup(<PresentReviewCollaborationModal isOpen document={document} model={makeModel([changedSnapshot])} onClose={noop} onUpdateModel={noop}/>);
      expect(diffMarkup).toContain(copy.diffStatuses.changed);
      expect(diffMarkup).toContain('Customer roadmap — authored title');

      const errorMarkup = renderToStaticMarkup(<PresentReviewErrorAlert message={presentReviewFailureCopy(locale, new Error('private engine detail'))}/>);
      expect(errorMarkup).toContain('role="alert"');
      expect(errorMarkup).toContain(copy.error);
      expect(errorMarkup).not.toContain('private engine detail');
    }
  });
});
