// STATUS: PLATIN — Source contract for the visible protection blockade
//
// The notice resolver and the banner are unit/SSR-tested. What unit tests cannot
// reach without a DOM test runner is that the editor actually renders the banner
// outside the focus-mode guard, and that a refused keystroke is reported instead
// of vanishing silently.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { WRITER_REVIEW_BAR_COPY } from '../../../review/writerReviewBarLocale';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFileSync(path.resolve(here, relative), 'utf8');

const editor = read('../../../editor/WriterEditor.tsx');
const paragraphItem = read('../../../editor/paragraphs/WriterParagraphItem.tsx');
const editorState = read('../../../editor/useWriterState.ts');

describe('Writer protection blockade wiring contract', () => {
  it('renders the blockade from the resolved notice', () => {
    expect(editor).toContain('<WriterProtectionBanner');
    expect(editor).toContain('notice={resolveWriterProtectionNotice(state.protectionMode)}');
    expect(editor).toContain('blockedEditAttempted={state.protectionEditAttempted}');
    expect(editor).toContain('onOpenProtection={() => state.setIsProtectionOpen(true)}');
  });

  it('renders the blockade in an unguarded wrapper, so focus mode cannot hide it', () => {
    // Focus mode hides the whole toolbar band, which is where the only other
    // protection indicator lives. The banner therefore sits in its own wrapper
    // that no `viewMode !== 'focus'` condition controls.
    expect(editor).toMatch(
      /<div className="flex-1 flex flex-col w-full overflow-hidden relative">\s*<WriterProtectionBanner/,
    );
  });

  it('reports a refused keystroke instead of swallowing it silently', () => {
    expect(paragraphItem).toContain('onBlockedEditAttempt?.();');
    expect(paragraphItem).toContain("const isEditKey = event.key.length === 1 || ['Backspace', 'Delete', 'Enter'].includes(event.key);");
    expect(paragraphItem).toContain('if (isEditKey && !event.ctrlKey && !event.metaKey && !event.altKey) {');
  });

  it('records the attempt only while the document is actually protected', () => {
    expect(editorState).toContain('const handleBlockedEditAttempt = useCallback(() => {');
    expect(editorState).toContain('if (canEditText(reviewState.protectionMode)) return;');
    expect(editorState).toContain('setProtectionEditAttempted(true);');
  });

  it('clears the attempt when the protection state changes', () => {
    expect(editorState).toContain('setProtectionEditAttempted(false);');
    expect(editorState).toContain('}, [reviewState.protectionMode]);');
  });

  it('passes the callback through the renderer chain', () => {
    expect(editor).toContain('onBlockedEditAttempt={state.handleBlockedEditAttempt}');
    expect(read('../../../layout/pages/WriterPageRenderer.tsx')).toContain('onBlockedEditAttempt={onBlockedEditAttempt}');
    expect(read('../../../layout/pages/WriterPagePaper.tsx')).toContain('onBlockedEditAttempt={onBlockedEditAttempt}');
  });

  it('derives editability from the current mode, so unlocking restores input', () => {
    // The textarea is not marked read-only once, it follows the live mode. Every
    // editing path (typing, Enter, Backspace, delete, range replace, navigation,
    // page click) consults `canEditText` at call time, so releasing the
    // protection restores all of them without a reload.
    // WR-040: the read-only decision also follows the view mode (reading is not editable).
    expect(editor).toContain('const viewModeReadOnly = writerViewModeIsReadOnly(state.contentViewMode);');
    expect(editor).toContain('const rendererReadOnly = isHistoricalReview || !canEditText(state.protectionMode) || viewModeReadOnly;');
    expect(editor).toContain('readOnly={rendererReadOnly}');
    expect(editor).not.toContain('const rendererReadOnly = true;');
  });
});

describe('Writer protection locale parity', () => {
  const keys = [
    'protectionNoticeTitle',
    'protectionNoticeReadOnly',
    'protectionNoticeCommentsOnly',
    'protectionNoticeFormFilling',
    'protectionNoticeReview',
    'protectionUnlock',
    'protectionBlockedEdit',
  ];

  it('defines every blockade string in all seven locales', () => {
    for (const [locale, copy] of Object.entries(WRITER_REVIEW_BAR_COPY)) {
      for (const key of keys) {
        const value = copy[key];
        expect(typeof value, `${locale}.${key} must be a string`).toBe('string');
        expect(value.trim().length, `${locale}.${key} must not be empty`).toBeGreaterThan(0);
      }
    }
  });

  it('keeps the four mode explanations distinct within one locale', () => {
    for (const [locale, copy] of Object.entries(WRITER_REVIEW_BAR_COPY)) {
      const explanations = [
        copy.protectionNoticeReadOnly,
        copy.protectionNoticeCommentsOnly,
        copy.protectionNoticeFormFilling,
        copy.protectionNoticeReview,
      ];
      expect(new Set(explanations).size, `${locale} explanations must differ`).toBe(4);
    }
  });
});
