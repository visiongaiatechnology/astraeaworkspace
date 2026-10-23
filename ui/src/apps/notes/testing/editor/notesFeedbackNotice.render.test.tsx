// STATUS: PLATIN — BATCH-B visible feedback contract: the mutation notice, the scan notice and their absence.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NotesEditorNotice } from '../../editor/NotesEditorNotice';
import { NotesSearchScanNotice } from '../../navigation/NotesPagesList';

const noop = (): void => undefined;

describe('AST-0664/AST-0679 mutation notice contract', () => {
  it('announces the outcome as visible, dismissible text', () => {
    const markup = renderToStaticMarkup(
      <NotesEditorNotice message="Line 4 is not a checklist item, so no task was created." onDismiss={noop} />
    );
    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain('data-notes-mutation-notice="true"');
    expect(markup).toContain('Line 4 is not a checklist item, so no task was created.');
    expect(markup).toContain('aria-label="Dismiss message"');
  });

  it('renders nothing while there is no message', () => {
    expect(renderToStaticMarkup(<NotesEditorNotice message={null} onDismiss={noop} />)).toBe('');
    expect(renderToStaticMarkup(<NotesEditorNotice message="" onDismiss={noop} />)).toBe('');
  });
});

describe('AST-0684 search scan notice contract', () => {
  it('names the scanned page count when the bounded scan stopped early', () => {
    const markup = renderToStaticMarkup(<NotesSearchScanNotice truncated scannedPages={20_000} />);
    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain('Search stopped after');
    expect(markup).toContain('20,000');
  });

  it('stays silent for a complete scan and survives a hostile counter value', () => {
    expect(renderToStaticMarkup(<NotesSearchScanNotice truncated={false} scannedPages={12} />)).toBe('');
    expect(renderToStaticMarkup(<NotesSearchScanNotice truncated scannedPages={Number.NaN} />)).toContain('Search stopped after 0 notes');
    expect(renderToStaticMarkup(<NotesSearchScanNotice truncated scannedPages={-4} />)).toContain('Search stopped after 0 notes');
  });
});
