// STATUS: DIAMANT — W-229 and W-225 on the surface: a failure the user can read
//
// Both findings are the same rule: something happened and nobody said so. The shell owns the save status
// and its classified reason; this surface renders it. The caret restore is the Writer's own state, so its
// refusal reasons are rendered here too — and a document that simply has no stored caret must stay silent,
// or every first open would warn about nothing.
//
// This file sits next to the component it measures: a test that has to work out its own depth to the
// subject is one wrong slash away from a collection error, and I lost two rounds to exactly that.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { WriterSaveAndRestoreNotice } from './WriterSaveAndRestoreNotice';

describe('W-229 — a failed save is explained where the user is looking', () => {
  it('stays silent while there is nothing to report', () => {
    expect(renderToStaticMarkup(<WriterSaveAndRestoreNotice />)).toBe('');
    expect(renderToStaticMarkup(<WriterSaveAndRestoreNotice saveStatus="saving" />)).toBe('');
    expect(renderToStaticMarkup(<WriterSaveAndRestoreNotice saveStatus="saved" saveFailure={null} />)).toBe('');
    // A status of `error` without a reason is the shell saying "something failed" — but a notice with no
    // reason would be the very vagueness this finding is about, so it stays silent rather than guess.
    expect(renderToStaticMarkup(<WriterSaveAndRestoreNotice saveStatus="error" saveFailure={null} />)).toBe('');
  });

  it('renders the reason for a failed save, as an alert', () => {
    const markup = renderToStaticMarkup(
      <WriterSaveAndRestoreNotice saveStatus="error" saveFailure={{ code: 'storage-full', at: 1 }} />,
    );
    expect(markup).toContain('data-writer-save-notice="error"');
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('Speicher ist voll');
    // The reason names a way out, not only the fault.
    expect(markup).toContain('erneut speichern');
  });

  it('gives each classified reason its own sentence', () => {
    const codes = ['storage-full', 'save-blocked', 'native-unavailable', 'unknown'] as const;
    const sentences = codes.map((code) => renderToStaticMarkup(
      <WriterSaveAndRestoreNotice saveStatus="error" saveFailure={{ code, at: 1 }} />,
    ));
    for (const markup of sentences) expect(markup).toContain('data-writer-save-notice="error"');
    expect(new Set(sentences).size).toBe(codes.length);
  });

  it('never renders the raw exception text or a timestamp', () => {
    // The shell classifies into four coarse reasons precisely so that a path or a document name cannot
    // travel here; the surface must not invent one.
    const markup = renderToStaticMarkup(
      <WriterSaveAndRestoreNotice saveStatus="error" saveFailure={{ code: 'unknown', at: 1700000000000 }} />,
    );
    expect(markup).not.toContain('1700000000000');
    expect(markup).not.toMatch(/C:\\\\|\/Users\/|\.vdoc/);
  });

  it('does not claim a failure while the warning status is merely a warning', () => {
    expect(renderToStaticMarkup(<WriterSaveAndRestoreNotice saveStatus="saved-with-warning" />)).toBe('');
    expect(renderToStaticMarkup(<WriterSaveAndRestoreNotice saveStatus="unsaved" />)).toBe('');
  });
});

describe('W-225 — the caret restore says what happened to the caret', () => {
  it('stays silent when a caret was restored', () => {
    expect(renderToStaticMarkup(
      <WriterSaveAndRestoreNotice cursorRestoreNotice={{ restored: true, restore: { paragraphId: 'p1', start: 1, end: 1 } }} />,
    )).toBe('');
  });

  it('stays silent when there was no marker at all — a first open is not a failure', () => {
    expect(renderToStaticMarkup(
      <WriterSaveAndRestoreNotice cursorRestoreNotice={{ restored: false, reason: 'no-marker' }} />,
    )).toBe('');
  });

  it('announces a refusal with its reason, as a status rather than an alarm', () => {
    const missing = renderToStaticMarkup(
      <WriterSaveAndRestoreNotice cursorRestoreNotice={{ restored: false, reason: 'paragraph-missing' }} />,
    );
    expect(missing).toContain('data-writer-cursor-notice="paragraph-missing"');
    expect(missing).toContain('role="status"');
    expect(missing).toContain('nicht mehr gibt');

    const other = renderToStaticMarkup(
      <WriterSaveAndRestoreNotice cursorRestoreNotice={{ restored: false, reason: 'other-document' }} />,
    );
    expect(other).toContain('anderen Dokument');

    const stale = renderToStaticMarkup(
      <WriterSaveAndRestoreNotice cursorRestoreNotice={{ restored: false, reason: 'expired-or-unreadable' }} />,
    );
    expect(stale).toContain('zu alt');
  });

  it('shows both at once when both happened, each with its own role', () => {
    const markup = renderToStaticMarkup(
      <WriterSaveAndRestoreNotice
        saveStatus="error"
        saveFailure={{ code: 'save-blocked', at: 1 }}
        cursorRestoreNotice={{ restored: false, reason: 'expired-or-unreadable' }}
      />,
    );
    expect(markup).toContain('data-writer-save-notice="error"');
    expect(markup).toContain('data-writer-cursor-notice="expired-or-unreadable"');
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('role="status"');
    expect(markup).toContain('data-writer-status-notice="true"');
  });
});
