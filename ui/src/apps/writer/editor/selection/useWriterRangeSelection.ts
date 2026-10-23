// STATUS: DIAMANT VGT SUPREME — Pointer-driven cross-paragraph selection for Writer
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Paragraph } from '../../../../shared/contracts/workspace';
import {
  resolveWriterSelection,
  type WriterResolvedSelection,
  type WriterSelectionPoint,
  type WriterSelectionRange,
} from '../../editing/selection/writerSelectionRange';
import {
  resolveWriterPointerSelectionPoint,
  type WriterParagraphPointerBox,
} from '../../editing/selection/writerSelectionPointer';

export interface WriterRangeSelectionController {
  /** Resolved selection, or `null` while no drag is in progress. */
  readonly selection: WriterResolvedSelection | null;
  /** Fixed end of the selection; it must not move while the focus is extended. */
  readonly anchor: WriterSelectionPoint | null;
  /** Paragraphs covered by an active selection that spans more than one paragraph. */
  readonly coveredParagraphIds: readonly string[];
  readonly spansParagraphs: boolean;
  /**
   * Takes the selection as the **DOM** reports it.
   *
   * A rich-text surface has a real DOM range, so the pointer-drag reconstruction
   * (`begin`/`extend`) must not run on top of it — the two would fight for the
   * same value. `apply` therefore stores the range without entering drag mode.
   */
  apply: (range: WriterSelectionRange | null) => void;
  begin: (point: WriterSelectionPoint) => void;
  extend: (point: WriterSelectionPoint) => void;
  finish: () => void;
  clear: () => void;
}

export interface UseWriterRangeSelectionOptions {
  readonly paragraphs: readonly Paragraph[];
  readonly enabled: boolean;
  /** Measures the paragraph boxes of the current page; supplied by the editor. */
  readonly measureBoxes: () => readonly WriterParagraphPointerBox[];
}

/**
 * Owns the drag state of a selection that crosses paragraph boundaries.
 *
 * Inside the origin paragraph nothing happens here: the textarea's own selection
 * is character-exact and stays authoritative. The range only starts to grow once
 * the pointer leaves the origin paragraph, which is the case a single textarea
 * cannot express at all.
 */
export function useWriterRangeSelection({
  paragraphs,
  enabled,
  measureBoxes,
}: UseWriterRangeSelectionOptions): WriterRangeSelectionController {
  const [range, setRange] = useState<WriterSelectionRange | null>(null);
  const [dragging, setDragging] = useState(false);
  const originRef = useRef<string | null>(null);
  const measureRef = useRef(measureBoxes);
  measureRef.current = measureBoxes;

  const begin = useCallback((point: WriterSelectionPoint) => {
    if (!enabled) return;
    originRef.current = point.paragraphId;
    setRange({ anchor: point, focus: point });
    setDragging(true);
  }, [enabled]);

  /**
   * Takes a range exactly as the rich-text surface read it out of the DOM.
   *
   * No drag mode is entered: the DOM selection is already authoritative, and the
   * pointer reconstruction would replace it with an estimate built from
   * paragraph bounding boxes.
   */
  const apply = useCallback((next: WriterSelectionRange | null) => {
    setDragging(false);
    originRef.current = null;
    setRange((previous) => {
      if (!next) return previous === null ? previous : null;
      if (
        previous
        && previous.anchor.paragraphId === next.anchor.paragraphId
        && previous.anchor.offset === next.anchor.offset
        && previous.focus.paragraphId === next.focus.paragraphId
        && previous.focus.offset === next.focus.offset
      ) {
        return previous;
      }
      return next;
    });
  }, []);

  const extend = useCallback((point: WriterSelectionPoint) => {
    setRange((previous) => (previous ? { ...previous, focus: point } : previous));
  }, []);

  const finish = useCallback(() => {
    setDragging(false);
    originRef.current = null;
  }, []);

  const clear = useCallback(() => {
    setRange(null);
    setDragging(false);
    originRef.current = null;
  }, []);

  useEffect(() => {
    if (!dragging || !enabled) return undefined;
    if (typeof document === 'undefined') return undefined;

    const handleMove = (event: MouseEvent) => {
      const point = resolveWriterPointerSelectionPoint(
        measureRef.current(),
        event.clientY,
        originRef.current ?? undefined,
      );
      // Still inside the origin paragraph: the native textarea selection rules.
      if (!point) return;
      extend(point);
    };
    const handleUp = () => finish();

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp, { once: true });
    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
  }, [dragging, enabled, extend, finish]);

  const selection = useMemo(
    () => (range ? resolveWriterSelection(paragraphs, range) : null),
    [paragraphs, range],
  );

  const spansParagraphs = Boolean(selection?.spansParagraphs && !selection.collapsed);
  const coveredParagraphIds = useMemo(() => {
    if (!spansParagraphs || !selection) return [];
    return selection.paragraphIndexes
      .map((index) => paragraphs[index]?.id)
      .filter((id): id is string => typeof id === 'string');
  }, [paragraphs, selection, spansParagraphs]);

  return { selection, anchor: range?.anchor ?? null, coveredParagraphIds, spansParagraphs, apply, begin, extend, finish, clear };
}
