// STATUS: PLATIN — Writer protection notice and visible-blockade contracts
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  resolveWriterProtectionNotice,
} from '../../../security/protection/writerProtectionNotice';
import { WriterProtectionBanner } from '../../../security/protection/WriterProtectionBanner';

describe('Writer protection notice', () => {
  it('reports an unrestricted document as fully editable', () => {
    const notice = resolveWriterProtectionNotice('none');
    expect(notice).toMatchObject({
      mode: 'none',
      editable: true,
      restricted: false,
      requiresTrackedChanges: false,
    });
    expect(notice.blockedCapabilities).toEqual([]);
  });

  it('treats an undefined mode as unprotected', () => {
    expect(resolveWriterProtectionNotice(undefined)).toMatchObject({ mode: 'none', editable: true, restricted: false });
  });

  it('keeps text editing and comments but blocks form filling and revisions in review mode', () => {
    const notice = resolveWriterProtectionNotice('review');
    expect(notice.editable).toBe(true);
    expect(notice.requiresTrackedChanges).toBe(true);
    expect(notice.blockedCapabilities).toEqual(['fill-forms', 'manage-revisions']);
  });

  it('blocks every capability in read-only mode', () => {
    const notice = resolveWriterProtectionNotice('read_only');
    expect(notice.editable).toBe(false);
    expect(notice.blockedCapabilities).toEqual(['edit-text', 'format', 'comment', 'fill-forms', 'manage-revisions']);
  });

  it('keeps text editing and comments but blocks form filling and revisions in review mode', () => {
    const notice = resolveWriterProtectionNotice('review');
    expect(notice.blockedCapabilities).toEqual(['fill-forms', 'manage-revisions']);
  });

  it('blocks text but allows comments in comments-only mode', () => {    const notice = resolveWriterProtectionNotice('comments_only');
    expect(notice.editable).toBe(false);
    expect(notice.blockedCapabilities).toEqual(['edit-text', 'format', 'fill-forms', 'manage-revisions']);
  });

  it('blocks text but allows form fields in form-filling mode', () => {
    const notice = resolveWriterProtectionNotice('form_filling');
    expect(notice.editable).toBe(false);
    expect(notice.blockedCapabilities).toEqual(['edit-text', 'format', 'comment', 'manage-revisions']);
  });

  it('reports every restricted mode as restricted', () => {
    for (const mode of ['read_only', 'comments_only', 'form_filling', 'review'] as const) {
      expect(resolveWriterProtectionNotice(mode).restricted).toBe(true);
    }
  });

  it('agrees with the engine for every mode', () => {
    // The notice must never invent a rule: `editable` mirrors `canEditText`.
    for (const mode of ['none', 'read_only', 'comments_only', 'form_filling', 'review'] as const) {
      const notice = resolveWriterProtectionNotice(mode);
      expect(notice.blockedCapabilities.includes('edit-text')).toBe(!notice.editable);
    }
  });
});

describe('Writer protection banner', () => {
  const onOpenProtection = vi.fn();

  it('renders nothing for an unprotected document', () => {
    const markup = renderToStaticMarkup(
      <WriterProtectionBanner
        notice={resolveWriterProtectionNotice('none')}
        onOpenProtection={onOpenProtection}
      />,
    );
    expect(markup).toBe('');
  });

  it('announces the blockade as a status region with the mode attached', () => {
    const markup = renderToStaticMarkup(
      <WriterProtectionBanner
        notice={resolveWriterProtectionNotice('read_only')}
        onOpenProtection={onOpenProtection}
      />,
    );
    expect(markup).toContain('role="status"');
    expect(markup).toContain('data-writer-protection-banner="read_only"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain('<button');
  });

  it('renders the mode-specific explanation', () => {
    const readOnly = renderToStaticMarkup(
      <WriterProtectionBanner notice={resolveWriterProtectionNotice('read_only')} onOpenProtection={onOpenProtection} />,
    );
    const comments = renderToStaticMarkup(
      <WriterProtectionBanner notice={resolveWriterProtectionNotice('comments_only')} onOpenProtection={onOpenProtection} />,
    );
    expect(readOnly).not.toBe(comments);
    expect(readOnly).toContain('data-writer-protection-banner="read_only"');
    expect(comments).toContain('data-writer-protection-banner="comments_only"');
  });

  it('adds the blocked-input hint only after an attempted edit', () => {
    const notice = resolveWriterProtectionNotice('read_only');
    const quiet = renderToStaticMarkup(
      <WriterProtectionBanner notice={notice} onOpenProtection={onOpenProtection} />,
    );
    const attempted = renderToStaticMarkup(
      <WriterProtectionBanner notice={notice} blockedEditAttempted onOpenProtection={onOpenProtection} />,
    );
    expect(quiet).not.toContain('data-writer-protection-blocked');
    expect(attempted).toContain('data-writer-protection-blocked="true"');
  });

  it('reports the review mode as a tracked-changes state, not a lock', () => {
    const markup = renderToStaticMarkup(
      <WriterProtectionBanner notice={resolveWriterProtectionNotice('review')} onOpenProtection={onOpenProtection} />,
    );
    expect(markup).toContain('data-writer-protection-banner="review"');
  });
});
