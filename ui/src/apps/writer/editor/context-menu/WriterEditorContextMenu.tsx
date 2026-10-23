// STATUS: DIAMANT VGT SUPREME â€” Context Menu Orchestrator for Writer Editor
import React from 'react';
import { WriterContextMenu } from './WriterContextMenu';
import type { WriterContextMenuKind } from './WriterContextMenu';
import { createWriterContextMenuInsertActions } from './writerContextMenuActions';
import {
  runWriterClipboardCopy,
  runWriterClipboardCut,
  runWriterClipboardPaste,
} from './writerClipboardCommand';
import { resolveWriterClipboardPort } from './writerClipboardPort';
import { canEditText } from '../../security/protection/writerProtectionEngine';
import { writerViewModeIsReadOnly } from '../view-modes/writerViewModes';
import type { useWriterState } from '../useWriterState';

interface WriterEditorContextMenuProps {
  contextMenu: { x: number; y: number; paragraphIndex?: number; kind?: WriterContextMenuKind } | null;
  onClose: () => void;
  state: ReturnType<typeof useWriterState>;
  /** WR-035: opens the link dialog (the menu itself must not prompt). */
  onEditLink?: () => void;
}

export const WriterEditorContextMenu: React.FC<WriterEditorContextMenuProps> = ({
  contextMenu,
  onClose,
  state,
  onEditLink,
}) => {
  if (!contextMenu) return null;

  const pIdx = contextMenu.paragraphIndex;
  const targetPIdx = pIdx !== undefined ? pIdx : state.activeParagraphIndex;
  // WR-040: a reading view refuses inserts exactly like a protected document does.
  const insertDisabled = !canEditText(state.protectionMode) || writerViewModeIsReadOnly(state.contentViewMode);
  /**
   * The three entries that write a block into the document come from one factory, not from three inline
   * arrows: that is what makes them operable by a witness without a DOM (`AST-0096`, `AST-0106`).
   */
  const insertActions = createWriterContextMenuInsertActions({
    paragraphCount: state.paragraphs.length,
    targetParagraphIndex: targetPIdx,
    anchorParagraphId: state.activeParagraph?.id,
    addParagraph: state.handleAddParagraph,
    insertTable: state.insertTable,
  });

  /**
   * The paragraph's text, in one place. `onCut` and `onCopy` each built the same expression â€” two
   * functions for one thing, which is how one of them keeps a bug the other has fixed.
   */
  const paragraphText = (index: number): string =>
    state.paragraphs[index]?.spans.map((span) => span.text).join('') ?? '';

  /**
   * `AST-0099` â€” every clipboard command is awaited and answered.
   *
   * Before: `navigator.clipboard?.writeText(text);` (no `await`) and `catch {}` around `readText`. The
   * user clicked "Kopieren", nothing happened, and nothing said why. Cutting was worse: the delete ran
   * right after the un-awaited write, so a refused clipboard still removed the paragraph.
   *
   * Now the outcome goes into the Writer's state through `recordClipboardReport`, and `WriterClipboardNotice`
   * renders it above the editing surface. These functions cannot reject â€” the command functions catch
   * every path and return a report â€” so calling them without awaiting at the click site is a documented
   * detachment, not a floating promise.
   */
  /**
   * WR-021 (M5 rounding) — the clipboard commands work on the **marked range**.
   *
   * Before, all three addressed the whole paragraph: `Ausschneiden` copied the
   * paragraph text and then deleted the paragraph, and `Einfügen` overwrote the
   * paragraph with the clipboard text. A user who marked one word and chose
   * "Ausschneiden" lost the whole paragraph. The range comes from the covered
   * paragraphs — the same source the formatting commands read.
   */
  const selectionRange = (): { anchor: { paragraphId: string; offset: number }; focus: { paragraphId: string; offset: number } } | null => {
    const covered = state.coveredParagraphRanges;
    if (!covered || covered.length === 0) return null;
    const first = covered[0]!;
    const last = covered[covered.length - 1]!;
    if (covered.length === 1 && first.start === first.end) return null;
    return {
      anchor: { paragraphId: first.paragraphId, offset: first.start },
      focus: { paragraphId: last.paragraphId, offset: last.end },
    };
  };

  /** WR-035: the link under the caret decides whether the menu offers link actions. */
  const activeLink = state.resolveActiveLink();

  const selectionText = (): string | null => {
    const covered = state.coveredParagraphRanges;
    if (!covered || covered.length === 0) return null;
    const parts = covered.map((range) => {
      const paragraph = state.paragraphs.find((item) => item.id === range.paragraphId);
      if (!paragraph) return '';
      return paragraph.spans.map((span) => span.text).join('').slice(range.start, range.end);
    });
    const text = parts.join('\n');
    return text.length > 0 ? text : null;
  };

  /** Copy: the marked range when there is one, otherwise the paragraph under the cursor. */
  const runCopy = async (): Promise<void> => {
    const selection = selectionText();
    if (selection !== null) {
      state.recordClipboardReport(await runWriterClipboardCopy(resolveWriterClipboardPort(), selection));
      return;
    }
    if (targetPIdx < 0) return;
    state.recordClipboardReport(await runWriterClipboardCopy(resolveWriterClipboardPort(), paragraphText(targetPIdx)));
  };

  /** Cut: fail-closed — the range is only removed after the write succeeded. */
  const runCut = async (): Promise<void> => {
    const selection = selectionText();
    const range = selectionRange();
    if (selection !== null && range !== null) {
      state.recordClipboardReport(
        await runWriterClipboardCut(resolveWriterClipboardPort(), selection, () =>
          state.handleReplaceSurfaceRange(range, ''),
        ),
      );
      return;
    }
    if (targetPIdx < 0) return;
    state.recordClipboardReport(
      await runWriterClipboardCut(resolveWriterClipboardPort(), paragraphText(targetPIdx), () =>
        state.handleDeleteParagraph(targetPIdx),
      ),
    );
  };

  /** Paste: at the caret (or over the marked range) — never over the whole paragraph. */
  const runPaste = async (): Promise<void> => {
    state.recordClipboardReport(
      await runWriterClipboardPaste(resolveWriterClipboardPort(), (clipText) => {
        const range = selectionRange();
        if (range !== null) {
          state.handleReplaceSurfaceRange(range, clipText);
          return;
        }
        if (state.paragraphs.length === 0) {
          state.handleAddParagraph(-1);
          return;
        }
        state.handleInsertTextAtSelection(clipText);
      }),
    );
  };

  return (
    <WriterContextMenu
      x={contextMenu.x}
      y={contextMenu.y}
      paragraphIndex={pIdx}
      kind={contextMenu.kind ?? (pIdx === undefined ? 'paper' : 'text')}
      onClose={onClose}
      insertDisabled={insertDisabled}
      canMoveUp={targetPIdx > 0}
      canMoveDown={targetPIdx >= 0 && targetPIdx < state.paragraphs.length - 1}
      hasCopiedFormat={Boolean(state.copiedFormat)}
      activeLinkUrl={activeLink?.kind === 'external' ? activeLink.url : activeLink ? '' : null}
      onEditLink={onEditLink}
      onRemoveLink={activeLink ? () => { state.handleApplyLink(null); } : undefined}
      onCut={() => {
        void runCut();
      }}
      onCopy={() => {
        void runCopy();
      }}
      onPaste={() => {
        void runPaste();
      }}
      onCopyFormat={state.handleCopyFormat}
      onPasteFormat={state.handleApplyCopiedFormat}
      onMoveUp={() => {
        if (targetPIdx > 0) {
          state.handleMoveParagraph(targetPIdx, 'up');
        }
      }}
      onMoveDown={() => {
        if (targetPIdx >= 0 && targetPIdx < state.paragraphs.length - 1) {
          state.handleMoveParagraph(targetPIdx, 'down');
        }
      }}
      onInsertParagraphBefore={insertActions.onInsertParagraphBefore}
      onInsertParagraphAfter={insertActions.onInsertParagraphAfter}
      onDuplicate={() => {
        if (targetPIdx >= 0) {
          state.handleDuplicateParagraph(targetPIdx);
        }
      }}
      onDelete={() => {
        if (targetPIdx >= 0) {
          state.handleDeleteParagraph(targetPIdx);
        }
      }}
      onOpenParagraphFormat={() => state.setIsParagraphFormatOpen(true)}
      onOpenStyleInspector={() => state.setIsStyleInspectorOpen(true)}
      onOpenListFormat={state.handleOpenListFormat}
      onInsertImage={() => state.imageInputRef.current?.click()}
      onInsertTable={insertActions.onInsertTable}
      onInsertEquation={state.handleInsertEquation}
      onInsertShape={() => state.handleInsertShape('rectangle')}
      onInsertPageBreak={() => {
        if (targetPIdx >= 0) {
          state.handleAddParagraph(targetPIdx, undefined, undefined, true);
        } else {
          state.handleAddParagraph(state.paragraphs.length - 1, undefined, undefined, true);
        }
      }}
      onOpenPageSetup={() => state.setIsPageSetupOpen(true)}
      onOpenFindReplace={() => state.setIsFindReplaceOpen(true)}
      onOpenSpecialCharacters={() => state.setIsSymbolsOpen(true)}
      onOpenStatistics={() => state.setIsStatsOpen(true)}
    />
  );
};
