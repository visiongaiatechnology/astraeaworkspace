// STATUS: DIAMANT VGT SUPREME — Paragraph Operations & Drag Reorder Hook for Astraea Writer
import React, { useCallback, useState } from 'react';
import type {
  Paragraph,
  WriterAutoCorrectConfig,
  WriterParagraphStyleName,
  WriterSectionDefinition,
  WriterStyleCatalog,
  WriterStyleDefinition,
  WriterTextAlignment,
} from '../../../../shared/contracts/workspace';
import type {
  TrackChangeRevision,
  WriterDocumentData,
  WriterProtectionMode,
} from '../../types';
import {
  synchronizeWriterAutoUpdate,
} from '../../formatting/styles/writerStyles';
import { replaceWriterParagraphText } from '../text/writerTextEditing';
import { requestWriterCaret } from '../caret/writerCaretController';
import { mergeWriterParagraphBackward, splitWriterParagraphAt } from './writerParagraphStructure';
import { planWriterParagraphDelete } from './writerParagraphDeletion';
import { planWriterParagraphInsert } from './writerParagraphInsert';
import type { WriterHistoryCoalesceRequest } from '../../editor/history/writerHistory';
import { resolveWriterTypingCoalesceKey } from '../../editor/history/writerHistory';
import { applyWriterStyle } from '../../formatting/styles/writerStyles';
import { resolveWriterListAutoformat, resolveWriterListEnterConversion } from '../lists/writerListAutoformat';
import { applyWriterAutoCorrect } from '../../formatting/autocorrect/writerAutoCorrect';
import { sortWriterParagraphs, type WriterSortOptions } from '../../formatting/sorting/writerSort';
import { canEditText, canFormat } from '../../security/protection/writerProtectionEngine';
import { writerCanAddParagraphs } from './writerParagraphLimits';
import {
  createFormatRevision,
  createMoveRevision,
  createRevision,
  createTextRevision,
} from '../../review/revisions/track-changes/writerTrackChangesEngine';

interface UseWriterParagraphOperationsProps {
  paragraphs: Paragraph[];
  activeParagraphId: string | null;
  setActiveParagraphId: (id: string | null) => void;
  activeParagraphIndex: number;
  activeParagraph: Paragraph | undefined;
  styles: WriterStyleDefinition[];
  styleCatalog: WriterStyleCatalog;
  sections: WriterSectionDefinition[];
  trackChangesActive: boolean;
  revisions: TrackChangeRevision[];
  autoCorrect: WriterAutoCorrectConfig;
  protectionMode?: WriterProtectionMode;
  persistParagraphs: (newParagraphs: Paragraph[], writerPatch?: Partial<WriterDocumentData>, coalesce?: WriterHistoryCoalesceRequest) => void;
  textSelection: { paragraphId: string; start: number; end: number } | null;
  setTextSelection: (sel: { paragraphId: string; start: number; end: number } | null) => void;
}

export function useWriterParagraphOperations({
  paragraphs,
  activeParagraphId,
  setActiveParagraphId,
  activeParagraphIndex,
  activeParagraph,
  styles,
  styleCatalog,
  sections: _sections,
  trackChangesActive,
  revisions,
  autoCorrect,
  protectionMode = 'none',
  persistParagraphs,
  textSelection,
  setTextSelection,
}: UseWriterParagraphOperationsProps) {
  const [draggedPIdx, setDraggedPIdx] = useState<number | null>(null);
  const [dragOverPIdx, setDragOverPIdx] = useState<number | null>(null);

  const handleParagraphChange = useCallback((pIdx: number, newText: string, inputCaret?: number): number => {
    if (!canEditText(protectionMode)) {
      return Math.min(newText.length, Math.max(0, Math.trunc(inputCaret ?? newText.length)));
    }
    const updated = [...paragraphs];
    if (updated[pIdx]) {
      const originalText = updated[pIdx].spans.map((s) => s.text).join('');
      const transformed = inputCaret === undefined
        ? { text: newText, caret: newText.length }
        : applyWriterAutoCorrect(originalText, newText, inputCaret, autoCorrect);
      const effectiveText = transformed.text;
      /**
       * WR-031 — `- `, `* ` and `1. ` turn the line into a list item while typing.
       *
       * The conversion consumes the marker instead of keeping it as text: the model
       * stores a `list_style`, the marker glyph is the renderer's job. It is its own
       * history step (no coalesce key), so one `Strg+Z` returns the typed marker.
       */
      const listAutoformat = inputCaret === undefined
        ? null
        : resolveWriterListAutoformat(originalText, effectiveText, transformed.caret, updated[pIdx].style);
      if (listAutoformat) {
        updated[pIdx] = {
          ...updated[pIdx],
          style: {
            ...updated[pIdx].style,
            list_style: listAutoformat.listStyle,
            list_level: 0,
          },
          spans: [{ text: listAutoformat.remainingText }],
        };
        persistParagraphs(updated);
        setTextSelection({ paragraphId: updated[pIdx].id, start: 0, end: 0 });
        return 0;
      }
      let revisionPatch: TrackChangeRevision[] | undefined;
      if (trackChangesActive && originalText !== effectiveText) {
        revisionPatch = [
          ...revisions,
          createTextRevision(updated[pIdx].id, originalText, effectiveText, 'You', 'Textänderung'),
        ];
      }
      updated[pIdx] = {
        ...updated[pIdx],
        spans: replaceWriterParagraphText(updated[pIdx], effectiveText).spans,
      };
      // WR-020 — undo goes back **word by word**, not sentence by sentence.
      // `resolveWriterTypingCoalesceKey` returns one key per word for a single typed
      // or deleted character and `null` for anything else (paste, autocorrect, a
      // replaced selection), so those remain exactly one step.
      const coalesceKey = resolveWriterTypingCoalesceKey({
        paragraphId: updated[pIdx].id,
        previousText: originalText,
        nextText: effectiveText,
        caret: transformed.caret,
      });
      persistParagraphs(
        updated,
        revisionPatch ? { revisions: revisionPatch } : undefined,
        coalesceKey ?? undefined,
      );
      if (inputCaret !== undefined) {
        setTextSelection({ paragraphId: updated[pIdx].id, start: transformed.caret, end: transformed.caret });
      }
      return transformed.caret;
    }
    return Math.min(newText.length, Math.max(0, Math.trunc(inputCaret ?? newText.length)));
  }, [paragraphs, trackChangesActive, revisions, persistParagraphs, autoCorrect, setTextSelection, protectionMode]);

  const handleTextSelection = useCallback((paragraphIndex: number, start: number, end: number) => {
    const paragraph = paragraphs[paragraphIndex];
    if (!paragraph) return;
    setActiveParagraphId(paragraph.id);
    setTextSelection({ paragraphId: paragraph.id, start, end });
  }, [paragraphs, setActiveParagraphId, setTextSelection]);

  const handleInsertTextAtSelection = useCallback((text: string) => {
    if (!canEditText(protectionMode)) return;
    const targetParagraph = activeParagraph ?? paragraphs[0];
    if (!targetParagraph) return;
    const targetIndex = activeParagraphIndex >= 0 ? activeParagraphIndex : 0;
    const originalText = targetParagraph.spans.map((s) => s.text).join('');
    const selectionStart = textSelection?.paragraphId === targetParagraph.id
      ? Math.min(textSelection.start, textSelection.end)
      : originalText.length;
    const selectionEnd = textSelection?.paragraphId === targetParagraph.id
      ? Math.max(textSelection.start, textSelection.end)
      : originalText.length;
    const nextText = `${originalText.slice(0, selectionStart)}${text}${originalText.slice(selectionEnd)}`;
    const nextCaret = selectionStart + text.length;

    handleParagraphChange(targetIndex, nextText, nextCaret);
    setTextSelection({ paragraphId: targetParagraph.id, start: nextCaret, end: nextCaret });
  }, [activeParagraph, activeParagraphIndex, handleParagraphChange, paragraphs, setTextSelection, textSelection, protectionMode]);

  const handleAddParagraph = useCallback((
    afterIdx: number,
    headingLevel?: 1 | 2 | 3,
    styleOverride?: WriterParagraphStyleName,
    pageBreakBefore: boolean = false
  ) => {
    if (!canEditText(protectionMode)) return;
    // WR-045: interactive paragraph growth is bounded (the file validator's limit is a file bound).
    if (!writerCanAddParagraphs(paragraphs.length)) return;
    const plan = planWriterParagraphInsert({
      paragraphs,
      afterIdx,
      styles,
      newParagraphId: crypto.randomUUID(),
      headingLevel,
      styleOverride,
      pageBreakBefore,
    });
    if (!plan) return;
    const created = plan.paragraphs[plan.insertIndex];
    const revisionPatch = trackChangesActive && created ? {
      revisions: [
        ...revisions,
        createRevision('insert', created.id, 'You', '', '', 'Absatz eingefügt', {
          kind: 'paragraph-insert',
          paragraph: structuredClone(created),
          index: plan.insertIndex,
        }),
      ],
    } : undefined;
    persistParagraphs(plan.paragraphs, revisionPatch);
    setActiveParagraphId(plan.insertedParagraphId);
    setTextSelection({ paragraphId: plan.caret.paragraphId, start: 0, end: 0 });
    requestWriterCaret({ paragraphId: plan.caret.paragraphId, start: plan.caret.offset, origin: 'enter' });
  }, [paragraphs, persistParagraphs, styles, setActiveParagraphId, setTextSelection, protectionMode, revisions, trackChangesActive]);

  /**
   * M2 · WR-006/WR-007 — the paragraph the direct cursor creates.
   *
   * It is deliberately the **same** insertion plan as Enter; only the created
   * paragraph's own style is patched afterwards: an optional alignment (a deliberate
   * double click, WR-008) and the semantic `space_before` that carries the vertical
   * distance the user clicked (WR-007).
   *
   * Returns the created paragraph id, so the caller can remember which paragraph a
   * direct click produced — that memory is what stops the second half of a double
   * click from creating a second paragraph.
   */
  const handleAddDirectParagraph = useCallback((
    afterIdx: number,
    options?: { alignment?: WriterTextAlignment; spaceBeforePt?: number },
  ): string | null => {
    if (!canEditText(protectionMode)) return null;
    // WR-045: the direct-cursor path is the one a user can trigger dozens of times per second.
    if (!writerCanAddParagraphs(paragraphs.length)) return null;
    const plan = planWriterParagraphInsert({
      paragraphs,
      afterIdx,
      styles,
      newParagraphId: crypto.randomUUID(),
    });
    if (!plan) return null;
    const created = plan.paragraphs[plan.insertIndex];
    if (!created) return null;
    const spaceBeforePt = options?.spaceBeforePt;
    const alignment = options?.alignment;
    const nextParagraphs = [...plan.paragraphs];
    nextParagraphs[plan.insertIndex] = {
      ...created,
      style: {
        ...created.style,
        ...(alignment ? { alignment } : {}),
        ...(spaceBeforePt !== undefined ? { space_before: spaceBeforePt } : {}),
      },
    };
    const styled = nextParagraphs[plan.insertIndex]!;
    const revisionPatch = trackChangesActive ? {
      revisions: [
        ...revisions,
        createRevision('insert', styled.id, 'You', '', '', 'Absatz über Direkt-Cursor eingefügt', {
          kind: 'paragraph-insert',
          paragraph: structuredClone(styled),
          index: plan.insertIndex,
        }),
      ],
    } : undefined;
    persistParagraphs(nextParagraphs, revisionPatch);
    setActiveParagraphId(styled.id);
    setTextSelection({ paragraphId: styled.id, start: 0, end: 0 });
    requestWriterCaret({ paragraphId: styled.id, start: 0, origin: 'page-click' });
    return styled.id;
  }, [paragraphs, persistParagraphs, styles, setActiveParagraphId, setTextSelection, protectionMode, revisions, trackChangesActive]);

  /**
   * Enter inside a paragraph: cut at the caret and hand the caret to the newly
   * created paragraph. Pressing Enter only appends an empty paragraph when the
   * caret already sits at the very end of the text.
   */
  const handleSplitParagraph = useCallback((pIdx: number, offset: number) => {
    if (!canEditText(protectionMode)) return;
    // WR-045: a split adds one paragraph; the same ceiling applies.
    if (!writerCanAddParagraphs(paragraphs.length)) return;
    const source = paragraphs[pIdx];
    if (!source) return;
    /**
     * WR-031 (native round 6) — **Enter on an empty list item leaves the list.**
     *
     * The user pressed Enter into a list, got the next bullet, pressed Enter again on
     * that (still empty) item — and got a third bullet. Splitting an empty list item
     * has nothing to split: the intent is "I am done with the list". The paragraph
     * keeps its place and its text, loses only the list attributes, and the caret
     * stays where it is.
     */
    const sourceTextLength = source.spans.reduce((total, span) => total + span.text.length, 0);
    if (source.style.list_style && sourceTextLength === 0) {
      const nextParagraphs = paragraphs.map((paragraph) => (
        paragraph.id === source.id
          ? {
            ...paragraph,
            style: { ...paragraph.style, list_style: undefined, list_level: undefined },
          }
          : paragraph
      ));
      const after = nextParagraphs[pIdx]!;
      const revisionPatch = trackChangesActive ? {
        revisions: [...revisions, createFormatRevision(source, after, 'You', 'Liste beendet')],
      } : undefined;
      persistParagraphs(nextParagraphs, revisionPatch);
      setActiveParagraphId(source.id);
      setTextSelection({ paragraphId: source.id, start: 0, end: 0 });
      return;
    }
    const result = splitWriterParagraphAt(paragraphs, pIdx, offset, crypto.randomUUID());
    if (!result) return;
    /**
     * WR-029 — Enter **after a heading** continues with a normal paragraph.
     *
     * A split copies the source style, which is right for a split *inside* a
     * paragraph and wrong for the end of a heading: otherwise every following
     * paragraph stayed a heading, and the document grew a second, third and fourth
     * "Überschrift 1" line. Splitting at the very end therefore resets the created
     * paragraph to the `normal` template — the same command the style dropdown uses.
     *
     * Native round 6 extends the same rule to the document **title**: `title` carries
     * no `heading_level` (it is level 0), so the original predicate never matched and
     * every paragraph after the 26 pt title was 26 pt as well.
     */
    const continuesAfterHeading = ((source.style.heading_level ?? 0) > 0 || source.style.style_name === 'title')
      && Math.min(offset, sourceTextLength) >= sourceTextLength;
    /**
     * WR-031 — a typed `- Erster Punkt` becomes a real list item on `Enter`.
     *
     * Someone who writes the marker by hand and then presses Enter has expressed the
     * same intent as someone who used the autoformat; leaving the line as raw text and
     * continuing outside the list would split one thought into two shapes. The prefix is
     * consumed and the paragraph the break creates continues the list.
     */
    const enterConversion = Math.min(offset, sourceTextLength) >= sourceTextLength
      ? resolveWriterListEnterConversion(source.spans.map((span) => span.text).join(''), source.style)
      : null;
    const splitParagraphs = enterConversion
      ? result.paragraphs.map((paragraph) => {
        if (paragraph.id === source.id) {
          return {
            ...paragraph,
            style: { ...paragraph.style, list_style: enterConversion.listStyle, list_level: 0 },
            spans: [{ text: enterConversion.remainingText }],
          };
        }
        if (paragraph.id === result.newParagraphId) {
          return {
            ...paragraph,
            style: { ...paragraph.style, list_style: enterConversion.listStyle, list_level: 0 },
          };
        }
        return paragraph;
      })
      : continuesAfterHeading
      ? result.paragraphs.map((paragraph) => (
        paragraph.id === result.newParagraphId ? applyWriterStyle(paragraph, 'normal') : paragraph
      ))
      : result.paragraphs;
    const created = splitParagraphs.find((paragraph) => paragraph.id === result.newParagraphId);
    const revisionPatch = trackChangesActive && created ? {
      revisions: [
        ...revisions,
        createRevision('insert', created.id, 'You', '', '', 'Absatz geteilt', {
          kind: 'paragraph-insert',
          paragraph: structuredClone(created),
          index: splitParagraphs.findIndex((paragraph) => paragraph.id === created.id),
        }),
      ],
    } : undefined;
    persistParagraphs(splitParagraphs, revisionPatch);
    setActiveParagraphId(result.caret.paragraphId);
    setTextSelection({ paragraphId: result.caret.paragraphId, start: 0, end: 0 });
    requestWriterCaret({ paragraphId: result.caret.paragraphId, start: result.caret.offset, origin: 'split' });
  }, [paragraphs, persistParagraphs, setActiveParagraphId, setTextSelection, protectionMode, revisions, trackChangesActive]);

  /**
   * Backspace at the start of a paragraph: fold it into its predecessor. The
   * source text spans are preserved, the caret lands on the seam, and the
   * empty-paragraph case removes the paragraph instead of joining nothing.
   */
  const handleMergeParagraphBackward = useCallback((pIdx: number) => {
    if (!canEditText(protectionMode)) return;
    const removed = paragraphs[pIdx];
    const previous = paragraphs[pIdx - 1];
    /**
     * WR-027 — Backspace at the **document start** removes a manual break.
     *
     * The first paragraph has no predecessor to merge with, so `Backspace` used to do
     * nothing at all — and a page break placed there could only be removed through
     * the paragraph dialog. Clearing the flag is the same edit the break insertion
     * made, in reverse, and it becomes its own undo step (`persistParagraphs` without
     * a coalesce key), so `Strg+Z` restores the break.
     */
    if (!removed || !previous) {
      if (!removed) return;
      const hasManualBreak = removed.style.page_break_before === true
        || removed.style.column_break_before === true;
      if (!hasManualBreak) return;
      persistParagraphs(paragraphs.map((paragraph) => (
        paragraph.id === removed.id
          ? {
            ...paragraph,
            style: { ...paragraph.style, page_break_before: undefined, column_break_before: undefined },
          }
          : paragraph
      )));
      return;
    }
    const result = mergeWriterParagraphBackward(paragraphs, pIdx);
    if (!result) return;
    const revisionPatch = trackChangesActive ? {
      revisions: [
        ...revisions,
        createRevision('delete', removed.id, 'You', removed.spans.map((span) => span.text).join(''), '', 'Absatz zusammengeführt', {
          kind: 'paragraph-delete',
          paragraph: structuredClone(removed),
          index: pIdx,
          previousParagraphId: previous.id,
          nextParagraphId: paragraphs[pIdx + 1]?.id,
        }),
      ],
    } : undefined;
    persistParagraphs(result.paragraphs, revisionPatch);
    setActiveParagraphId(result.caret.paragraphId);
    setTextSelection({ paragraphId: result.caret.paragraphId, start: result.caret.offset, end: result.caret.offset });
    requestWriterCaret({
      paragraphId: result.caret.paragraphId,
      start: result.caret.offset,
      origin: 'merge',
    });
  }, [paragraphs, persistParagraphs, setActiveParagraphId, setTextSelection, protectionMode, revisions, trackChangesActive]);

  const handleDeleteParagraph = useCallback((pIdx: number) => {
    if (!canEditText(protectionMode)) return;
    const plan = planWriterParagraphDelete(paragraphs, pIdx);
    if (!plan) return;
    const removed = paragraphs[plan.removedIndex];
    if (!removed) return;
    const revisionPatch = trackChangesActive ? {
      revisions: [
        ...revisions,
        createRevision('delete', removed.id, 'You', removed.spans.map((span) => span.text).join(''), '', 'Absatz gelöscht', {
          kind: 'paragraph-delete',
          paragraph: structuredClone(removed),
          index: plan.removedIndex,
          previousParagraphId: paragraphs[plan.removedIndex - 1]?.id,
          nextParagraphId: paragraphs[plan.removedIndex + 1]?.id,
        }),
      ],
    } : undefined;
    persistParagraphs(plan.paragraphs, revisionPatch);
    if (!plan.selectedParagraphId) return;
    setActiveParagraphId(plan.selectedParagraphId);
    setTextSelection({ paragraphId: plan.selectedParagraphId, start: plan.caretOffset, end: plan.caretOffset });
    requestWriterCaret({ paragraphId: plan.selectedParagraphId, start: plan.caretOffset, origin: 'delete' });
  }, [paragraphs, persistParagraphs, setActiveParagraphId, setTextSelection, protectionMode, revisions, trackChangesActive]);

  const updateActiveParagraph = useCallback((updater: (p: Paragraph) => Paragraph) => {
    if (!canEditText(protectionMode)) return;
    const index = activeParagraphIndex >= 0 ? activeParagraphIndex : 0;
    if (!paragraphs[index]) return;
    const next = [...paragraphs];
    const before = next[index];
    const after = updater(before);
    next[index] = after;
    const revisionPatch = trackChangesActive && JSON.stringify(before) !== JSON.stringify(after) ? {
      revisions: [...revisions, createFormatRevision(before, after, 'You', 'Absatzformatierung')],
    } : undefined;
    persistParagraphs(next, revisionPatch);
  }, [activeParagraphIndex, paragraphs, persistParagraphs, protectionMode, revisions, trackChangesActive]);

  const updateActiveParagraphFormatting = useCallback((
    updater: (p: Paragraph) => Paragraph,
    options?: { coalesce?: WriterHistoryCoalesceRequest }
  ) => {
    if (!canFormat(protectionMode)) return;
    const index = activeParagraphIndex >= 0 ? activeParagraphIndex : 0;
    const current = paragraphs[index];
    if (!current) return;
    const updated = updater(current);
    const nextParagraphs = [...paragraphs];
    nextParagraphs[index] = updated;
    const formatRevision = trackChangesActive && JSON.stringify(current) !== JSON.stringify(updated)
      ? createFormatRevision(current, updated, 'You', 'Formatänderung')
      : undefined;
    const synchronized = synchronizeWriterAutoUpdate(nextParagraphs, updated.id, styles);
    if (!synchronized.changed) {
      persistParagraphs(nextParagraphs, formatRevision ? { revisions: [...revisions, formatRevision] } : undefined, options?.coalesce);
      return;
    }
    persistParagraphs(synchronized.paragraphs, {
      styles: synchronized.paragraphStyles,
      styleCatalog: { ...styleCatalog, paragraphStyles: synchronized.paragraphStyles },
      revisions: formatRevision ? [...revisions, formatRevision] : revisions,
    }, options?.coalesce);
  }, [activeParagraphIndex, paragraphs, persistParagraphs, styleCatalog, styles, protectionMode, revisions, trackChangesActive]);

  const handleDragStart = useCallback((idx: number) => {
    if (!canEditText(protectionMode)) return;
    setDraggedPIdx(idx);
  }, [protectionMode]);

  const handleDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (!canEditText(protectionMode)) return;
    if (draggedPIdx === null || draggedPIdx === idx) return;
    setDragOverPIdx(idx);
  }, [draggedPIdx, protectionMode]);

  const handleDrop = useCallback((e: React.DragEvent, targetIdx: number) => {
    e.preventDefault();
    if (!canEditText(protectionMode)) return;
    if (draggedPIdx === null || draggedPIdx === targetIdx) {
      setDraggedPIdx(null);
      setDragOverPIdx(null);
      return;
    }
    const beforeOrder = paragraphs.map((paragraph) => paragraph.id);
    const next = [...paragraphs];
    const [moved] = next.splice(draggedPIdx, 1);
    if (!moved) return;
    next.splice(targetIdx, 0, moved);
    const revisionPatch = trackChangesActive ? {
      revisions: [...revisions, createMoveRevision(moved.id, beforeOrder, next.map((paragraph) => paragraph.id), 'You', 'Absatz verschoben')],
    } : undefined;
    persistParagraphs(next, revisionPatch);
    setDraggedPIdx(null);
    setDragOverPIdx(null);
  }, [draggedPIdx, paragraphs, persistParagraphs, protectionMode, revisions, trackChangesActive]);

  const handleMoveParagraph = useCallback((fromIdx: number, direction: 'up' | 'down') => {
    if (!canEditText(protectionMode)) return;
    const toIdx = direction === 'up' ? fromIdx - 1 : fromIdx + 1;
    if (toIdx < 0 || toIdx >= paragraphs.length) return;
    const beforeOrder = paragraphs.map((paragraph) => paragraph.id);
    const next = [...paragraphs];
    const [moved] = next.splice(fromIdx, 1);
    if (!moved) return;
    next.splice(toIdx, 0, moved);
    const revisionPatch = trackChangesActive ? {
      revisions: [...revisions, createMoveRevision(moved.id, beforeOrder, next.map((paragraph) => paragraph.id), 'You', 'Absatz verschoben')],
    } : undefined;
    persistParagraphs(next, revisionPatch);
    setActiveParagraphId(moved.id);
  }, [paragraphs, persistParagraphs, setActiveParagraphId, protectionMode, revisions, trackChangesActive]);

  const handleDuplicateParagraph = useCallback((pIdx: number) => {
    if (!canEditText(protectionMode)) return;
    const target = paragraphs[pIdx];
    if (!target) return;
    const duplicated: Paragraph = {
      ...target,
      id: crypto.randomUUID(),
      spans: target.spans.map((span) => ({ ...span })),
    };
    const next = [...paragraphs];
    const insertIndex = pIdx + 1;
    next.splice(insertIndex, 0, duplicated);
    const revisionPatch = trackChangesActive ? {
      revisions: [
        ...revisions,
        createRevision('insert', duplicated.id, 'You', '', duplicated.spans.map((span) => span.text).join(''), 'Absatz dupliziert', {
          kind: 'paragraph-insert',
          paragraph: structuredClone(duplicated),
          index: insertIndex,
        }),
      ],
    } : undefined;
    persistParagraphs(next, revisionPatch);
    setActiveParagraphId(duplicated.id);
  }, [paragraphs, persistParagraphs, setActiveParagraphId, protectionMode, revisions, trackChangesActive]);

  const handleSortParagraphs = useCallback((options: WriterSortOptions) => {
    if (!canEditText(protectionMode)) return;
    const sorted = sortWriterParagraphs(paragraphs, activeParagraphId, options);
    if (!sorted.changed) return;
    const revisionPatch = trackChangesActive ? {
      revisions: [
        ...revisions,
        createMoveRevision(activeParagraphId ?? paragraphs[0]?.id ?? '', paragraphs.map((paragraph) => paragraph.id), sorted.paragraphs.map((paragraph) => paragraph.id), 'You', 'Absatzsortierung'),
      ],
    } : undefined;
    persistParagraphs(sorted.paragraphs, revisionPatch);
    if (activeParagraphId) {
      const exists = sorted.paragraphs.some((p) => p.id === activeParagraphId);
      if (!exists && sorted.paragraphs[0]) {
        setActiveParagraphId(sorted.paragraphs[0].id);
      }
    }
  }, [activeParagraphId, paragraphs, persistParagraphs, setActiveParagraphId, protectionMode, revisions, trackChangesActive]);

  return {
    draggedPIdx,
    dragOverPIdx,
    handleParagraphChange,
    handleTextSelection,
    handleInsertTextAtSelection,
    handleAddParagraph,
    handleAddDirectParagraph,
    handleSplitParagraph,
    handleMergeParagraphBackward,
    handleDeleteParagraph,
    updateActiveParagraph,
    updateActiveParagraphFormatting,
    handleDragStart,
    handleDragOver,
    handleDrop,
    handleMoveParagraph,
    handleDuplicateParagraph,
    handleSortParagraphs,
  };
}
