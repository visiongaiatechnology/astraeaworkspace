// STATUS: PLATIN
// Bounded smart alignment guides and equal-spacing feedback for Whiteboard dragging.
//
// `snapWhiteboardPoint` (whiteboardManipulationEngine) already snaps to the grid and to the user's
// persisted guides. It cannot see the *other objects* on the board, so dragging a shape next to a
// neighbour produced no visual alignment feedback and no distance read-out. This module adds exactly
// that missing rule and nothing else: it consumes the already-snapped position and returns the
// additional object-to-object correction plus the guide lines that must be drawn while dragging.
//
// Everything is bounded: candidate count, guide count and comparison work per drag frame.

import type { WhiteboardItem } from '../types';
import type { BoundingBox } from '../rendering/whiteboardSpatialIndexEngine';
import { clampCoordinate, WHITEBOARD_MAX_ITEMS } from '../viewport/whiteboardViewportEngine';

export const WHITEBOARD_SMART_GUIDE_THRESHOLD = 8;
export const WHITEBOARD_MAX_SMART_GUIDE_CANDIDATES = 512;
export const WHITEBOARD_MAX_SMART_GUIDE_LINES = 12;
export const WHITEBOARD_MAX_SPACING_COMPARISONS = 4_096;

export type WhiteboardSnapGuideKind =
  | 'align-left' | 'align-center' | 'align-right'
  | 'align-top' | 'align-middle' | 'align-bottom'
  | 'equal-spacing';

export interface WhiteboardSnapGuideLine {
  readonly id: string;
  readonly axis: 'x' | 'y';
  /** World coordinate of the guide. */
  readonly position: number;
  /** Extent of the guide along the other axis, so it can be drawn as a real line. */
  readonly from: number;
  readonly to: number;
  readonly kind: WhiteboardSnapGuideKind;
  /** For `equal-spacing` guides: the repeated gap in world units (rendered as a distance label). */
  readonly gap?: number;
}

export interface WhiteboardSmartSnapResult {
  readonly x: number;
  readonly y: number;
  readonly lines: WhiteboardSnapGuideLine[];
  readonly snappedX: boolean;
  readonly snappedY: boolean;
}

export interface WhiteboardSmartSnapInput {
  /** Proposed bounds of the dragged selection after grid/manual-guide snapping. */
  readonly movingBounds: BoundingBox;
  /** Every other visible object that may act as an alignment reference. */
  readonly candidates: readonly WhiteboardItem[];
  readonly threshold?: number;
  readonly maxLines?: number;
  /** Set ids of the dragged selection so a selection cannot align to itself. */
  readonly excludedIds?: readonly string[];
  /** Equal-spacing detection is skipped when false. */
  readonly detectSpacing?: boolean;
}

const finite = (value: number): number => (Number.isFinite(value) ? value : 0);

function boundsOf(item: WhiteboardItem): BoundingBox | null {
  if (!item || item.type === 'connector') return null;
  if (![item.x, item.y, item.width, item.height].every(Number.isFinite)) return null;
  if (item.width <= 0 || item.height <= 0) return null;
  return { minX: item.x, minY: item.y, maxX: item.x + item.width, maxY: item.y + item.height };
}

function collectCandidates(input: WhiteboardSmartSnapInput): WhiteboardItem[] {
  const excluded = new Set(input.excludedIds ?? []);
  const result: WhiteboardItem[] = [];
  const source = Array.isArray(input.candidates) ? input.candidates : [];
  const limit = Math.min(source.length, WHITEBOARD_MAX_ITEMS);
  for (let index = 0; index < limit && result.length < WHITEBOARD_MAX_SMART_GUIDE_CANDIDATES; index += 1) {
    const item = source[index];
    if (!item || excluded.has(item.id) || item.hidden) continue;
    if (!boundsOf(item)) continue;
    result.push(item);
  }
  return result;
}

interface AxisReference {
  readonly low: number;
  readonly mid: number;
  readonly high: number;
  readonly crossFrom: number;
  readonly crossTo: number;
  readonly kindLow: WhiteboardSnapGuideKind;
  readonly kindMid: WhiteboardSnapGuideKind;
  readonly kindHigh: WhiteboardSnapGuideKind;
}

interface AxisSnap {
  readonly delta: number;
  readonly position: number;
  readonly crossFrom: number;
  readonly crossTo: number;
  readonly kind: WhiteboardSnapGuideKind;
}

function axisReferences(
  bounds: readonly BoundingBox[],
  axis: 'x' | 'y',
): AxisReference[] {
  return bounds.map((box) => axis === 'x'
    ? {
        low: box.minX, mid: (box.minX + box.maxX) / 2, high: box.maxX,
        crossFrom: box.minY, crossTo: box.maxY,
        kindLow: 'align-left' as const, kindMid: 'align-center' as const, kindHigh: 'align-right' as const,
      }
    : {
        low: box.minY, mid: (box.minY + box.maxY) / 2, high: box.maxY,
        crossFrom: box.minX, crossTo: box.maxX,
        kindLow: 'align-top' as const, kindMid: 'align-middle' as const, kindHigh: 'align-bottom' as const,
      });
}

function resolveAxisSnap(
  moving: { low: number; high: number },
  references: readonly AxisReference[],
  threshold: number,
): AxisSnap | null {
  const center = (moving.low + moving.high) / 2;
  const probes = [moving.low, center, moving.high];
  let best: AxisSnap | null = null;
  for (const reference of references) {
    const options: Array<{ target: number; kind: WhiteboardSnapGuideKind }> = [
      { target: reference.low, kind: reference.kindLow },
      { target: reference.mid, kind: reference.kindMid },
      { target: reference.high, kind: reference.kindHigh },
    ];
    for (const option of options) {
      for (const probe of probes) {
        const distance = option.target - probe;
        if (Math.abs(distance) > threshold) continue;
        if (best && Math.abs(distance) >= Math.abs(best.delta)) continue;
        best = {
          delta: distance,
          position: option.target,
          crossFrom: reference.crossFrom,
          crossTo: reference.crossTo,
          kind: option.kind,
        };
      }
    }
  }
  return best;
}

interface SpacingSnap {
  readonly delta: number;
  readonly position: number;
  readonly gap: number;
  readonly from: number;
  readonly to: number;
}

function resolveEqualSpacing(
  moving: { alongLow: number; alongSize: number; crossLow: number; crossHigh: number },
  others: readonly BoundingBox[],
  axis: 'x' | 'y',
  threshold: number,
  budget: { remaining: number },
): SpacingSnap | null {
  const lowKey = axis === 'x' ? 'minX' : 'minY';
  const highKey = axis === 'x' ? 'maxX' : 'maxY';
  const crossLowKey = axis === 'x' ? 'minY' : 'minX';
  const crossHighKey = axis === 'x' ? 'maxY' : 'maxX';
  const sorted = [...others].sort((left, right) => left[lowKey] - right[lowKey]);
  let best: SpacingSnap | null = null;
  for (let index = 0; index + 1 < sorted.length; index += 1) {
    const left = sorted[index];
    const right = sorted[index + 1];
    if (budget.remaining <= 0) break;
    budget.remaining -= 1;
    // Only objects that share the moving object's cross-axis band define a meaningful row/column gap.
    if (left[crossHighKey] <= moving.crossLow || left[crossLowKey] >= moving.crossHigh) continue;
    if (right[crossHighKey] <= moving.crossLow || right[crossLowKey] >= moving.crossHigh) continue;
    const gap = right[lowKey] - left[highKey];
    if (!Number.isFinite(gap) || gap <= 0) continue;
    // Continue the rhythm on either side of the pair: the same gap in front of `left` or behind `right`.
    const afterRight = right[highKey] + gap;
    const beforeLeft = left[lowKey] - gap - moving.alongSize;
    for (const target of [afterRight, beforeLeft]) {
      const delta = target - moving.alongLow;
      if (Math.abs(delta) > threshold) continue;
      if (best && Math.abs(delta) >= Math.abs(best.delta)) continue;
      best = {
        delta,
        position: target,
        gap,
        from: Math.min(left[crossLowKey], right[crossLowKey]),
        to: Math.max(left[crossHighKey], right[crossHighKey]),
      };
    }
  }
  return best;
}

function pushLine(lines: WhiteboardSnapGuideLine[], line: WhiteboardSnapGuideLine, maxLines: number): void {
  if (lines.length >= maxLines) return;
  if (lines.some((candidate) => candidate.axis === line.axis && candidate.position === line.position && candidate.kind === line.kind)) return;
  lines.push(line);
}

/**
 * Returns the object-to-object correction for a dragged selection plus the guide lines that must be
 * drawn for the current frame. The input position is never mutated.
 */
export function computeWhiteboardSmartSnap(input: WhiteboardSmartSnapInput): WhiteboardSmartSnapResult {
  const moving = input.movingBounds;
  const baseX = clampCoordinate(finite(moving?.minX));
  const baseY = clampCoordinate(finite(moving?.minY));
  const width = Math.max(0, finite(moving?.maxX) - finite(moving?.minX));
  const height = Math.max(0, finite(moving?.maxY) - finite(moving?.minY));
  const threshold = Math.max(1, Math.min(40, finite(input.threshold ?? WHITEBOARD_SMART_GUIDE_THRESHOLD) || WHITEBOARD_SMART_GUIDE_THRESHOLD));
  const maxLines = Math.max(1, Math.min(WHITEBOARD_MAX_SMART_GUIDE_LINES, Math.trunc(finite(input.maxLines ?? WHITEBOARD_MAX_SMART_GUIDE_LINES) || WHITEBOARD_MAX_SMART_GUIDE_LINES)));
  const candidates = collectCandidates(input);
  const lines: WhiteboardSnapGuideLine[] = [];
  const empty: WhiteboardSmartSnapResult = { x: baseX, y: baseY, lines, snappedX: false, snappedY: false };
  if (candidates.length === 0) return empty;

  const referenceBounds = candidates.map((item) => boundsOf(item)!).filter(Boolean);

  const xSnap = resolveAxisSnap({ low: baseX, high: baseX + width }, axisReferences(referenceBounds, 'x'), threshold);
  const ySnap = resolveAxisSnap({ low: baseY, high: baseY + height }, axisReferences(referenceBounds, 'y'), threshold);

  let finalX = baseX + (xSnap?.delta ?? 0);
  let finalY = baseY + (ySnap?.delta ?? 0);

  if (xSnap) {
    pushLine(lines, {
      id: `guide-x-${xSnap.kind}-${Math.round(xSnap.position)}`,
      axis: 'x',
      position: clampCoordinate(xSnap.position),
      from: Math.min(xSnap.crossFrom, finalY),
      to: Math.max(xSnap.crossTo, finalY + height),
      kind: xSnap.kind,
    }, maxLines);
  }
  if (ySnap) {
    pushLine(lines, {
      id: `guide-y-${ySnap.kind}-${Math.round(ySnap.position)}`,
      axis: 'y',
      position: clampCoordinate(ySnap.position),
      from: Math.min(ySnap.crossFrom, finalX),
      to: Math.max(ySnap.crossTo, finalX + width),
      kind: ySnap.kind,
    }, maxLines);
  }

  if (input.detectSpacing !== false) {
    const budget = { remaining: WHITEBOARD_MAX_SPACING_COMPARISONS };
    if (!xSnap) {
      const spacingX = resolveEqualSpacing(
        { alongLow: finalX, alongSize: width, crossLow: finalY, crossHigh: finalY + height },
        referenceBounds, 'x', threshold, budget,
      );
      if (spacingX) {
        finalX = clampCoordinate(spacingX.position);
        pushLine(lines, {
          id: `guide-x-spacing-${Math.round(spacingX.position)}`,
          axis: 'x', position: clampCoordinate(spacingX.position),
          from: spacingX.from, to: spacingX.to, kind: 'equal-spacing', gap: spacingX.gap,
        }, maxLines);
      }
    }
    if (!ySnap) {
      const spacingY = resolveEqualSpacing(
        { alongLow: finalY, alongSize: height, crossLow: finalX, crossHigh: finalX + width },
        referenceBounds, 'y', threshold, budget,
      );
      if (spacingY) {
        finalY = clampCoordinate(spacingY.position);
        pushLine(lines, {
          id: `guide-y-spacing-${Math.round(spacingY.position)}`,
          axis: 'y', position: clampCoordinate(spacingY.position),
          from: spacingY.from, to: spacingY.to, kind: 'equal-spacing', gap: spacingY.gap,
        }, maxLines);
      }
    }
  }

  return {
    x: finalX,
    y: finalY,
    lines,
    snappedX: finalX !== baseX,
    snappedY: finalY !== baseY,
  };
}
