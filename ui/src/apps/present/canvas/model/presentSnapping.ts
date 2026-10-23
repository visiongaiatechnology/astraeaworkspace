// STATUS: PLATIN — pure Present snapping and smart-guide resolution.
//
// One definition of "where does a dragged object land". `presentScene.snapPresentGeometry`
// delegates here, and the stage canvas renders exactly the guides this module returns, so the
// snap position and the drawn guide can never disagree.
//
// All targets are computed in slide-percent space, which is zoom independent by construction:
// a 1 % tolerance is 1 % of the slide at every zoom level. The previous implementation picked
// the **first** target inside the tolerance window (array order) instead of the nearest one and
// only knew about the slide centre, so it produced visibly wrong snaps next to other objects.

import { presentObjectRect, type PresentPercentRect } from './presentRect';

export type PresentSnapAxis = 'x' | 'y';
export type PresentSnapKind = 'slide-center' | 'slide-edge' | 'object-center' | 'object-edge' | 'grid';

export interface PresentSnapGuide {
  axis: PresentSnapAxis;
  positionPercent: number;
  kind: PresentSnapKind;
  /** Present for `object-*` guides: the object the moving object aligned with. */
  sourceId?: string;
}

export interface PresentSnapCandidate {
  id: string;
  xPercent: number;
  yPercent: number;
  widthPercent: number;
  heightPercent: number;
  rotation?: number;
}

export interface PresentSnapOptions {
  tolerancePercent?: number;
  /** Non-positive disables grid snapping. */
  gridPercent?: number;
  aspectRatio?: number;
  candidates?: readonly PresentSnapCandidate[];
}

export interface PresentSnapOutcome {
  xPercent: number;
  yPercent: number;
  guides: PresentSnapGuide[];
  snappedX: boolean;
  snappedY: boolean;
}

export const PRESENT_DEFAULT_SNAP_TOLERANCE_PERCENT = 1.5;

/** Lower rank wins a tie. Slide guides are the least surprising, so they win. */
const KIND_PRIORITY: Record<PresentSnapKind, number> = {
  'slide-center': 0,
  'slide-edge': 1,
  'object-center': 2,
  'object-edge': 3,
  grid: 4,
};

interface SnapTarget {
  position: number;
  kind: PresentSnapKind;
  sourceId?: string;
}

function pickTarget(current: number, targets: readonly SnapTarget[], tolerance: number): { target: SnapTarget; distance: number } | null {
  let best: { target: SnapTarget; distance: number } | null = null;
  for (const target of targets) {
    if (!Number.isFinite(target.position)) continue;
    const distance = Math.abs(current - target.position);
    if (distance > tolerance) continue;
    if (
      best === null ||
      distance < best.distance - 1e-9 ||
      (Math.abs(distance - best.distance) <= 1e-9 && KIND_PRIORITY[target.kind] < KIND_PRIORITY[best.target.kind])
    ) {
      best = { target, distance };
    }
  }
  return best;
}

function buildAxisTargets(
  axis: PresentSnapAxis,
  size: number,
  candidates: readonly PresentSnapCandidate[],
  aspectRatio: number,
): SnapTarget[] {
  const targets: SnapTarget[] = [];
  // Slide guides are identical on both axes: centre line, then the two edges.
  targets.push({ position: (100 - size) / 2, kind: 'slide-center' });
  targets.push({ position: 0, kind: 'slide-edge' });
  targets.push({ position: 100 - size, kind: 'slide-edge' });
  for (const candidate of candidates) {
    const rect: PresentPercentRect = presentObjectRect(candidate, aspectRatio);
    if (axis === 'x') {
      const left = rect.xPercent;
      const centre = rect.xPercent + rect.widthPercent / 2;
      const right = rect.xPercent + rect.widthPercent;
      targets.push({ position: left, kind: 'object-edge', sourceId: candidate.id });
      targets.push({ position: right, kind: 'object-edge', sourceId: candidate.id });
      targets.push({ position: centre - size / 2, kind: 'object-center', sourceId: candidate.id });
      targets.push({ position: left - size, kind: 'object-edge', sourceId: candidate.id });
      targets.push({ position: right - size, kind: 'object-edge', sourceId: candidate.id });
    } else {
      const top = rect.yPercent;
      const middle = rect.yPercent + rect.heightPercent / 2;
      const bottom = rect.yPercent + rect.heightPercent;
      targets.push({ position: top, kind: 'object-edge', sourceId: candidate.id });
      targets.push({ position: bottom, kind: 'object-edge', sourceId: candidate.id });
      targets.push({ position: middle - size / 2, kind: 'object-center', sourceId: candidate.id });
      targets.push({ position: top - size, kind: 'object-edge', sourceId: candidate.id });
      targets.push({ position: bottom - size, kind: 'object-edge', sourceId: candidate.id });
    }
  }
  return targets;
}

function gridTarget(current: number, gridPercent: number): SnapTarget | null {
  if (!(gridPercent > 0)) return null;
  const position = Math.round(current / gridPercent) * gridPercent;
  return { position, kind: 'grid' };
}

/**
 * Snaps one object's top-left position to the nearest slide guide, object guide or grid line.
 * `xPercent`/`yPercent` are the only values changed; size, rotation and lock state are the
 * caller's business.
 */
export function computePresentSnapGeometry(
  object: { xPercent: number; yPercent: number; widthPercent: number; heightPercent: number },
  options: PresentSnapOptions = {},
): PresentSnapOutcome {
  const tolerance = Number.isFinite(options.tolerancePercent ?? NaN)
    ? Math.max(0, options.tolerancePercent as number)
    : PRESENT_DEFAULT_SNAP_TOLERANCE_PERCENT;
  const gridPercent = Number.isFinite(options.gridPercent ?? NaN) ? Math.max(0, options.gridPercent as number) : 0;
  const aspectRatio = Number.isFinite(options.aspectRatio ?? NaN) && (options.aspectRatio as number) > 0
    ? (options.aspectRatio as number)
    : 16 / 9;
  const width = Number.isFinite(object.widthPercent) ? object.widthPercent : 0;
  const height = Number.isFinite(object.heightPercent) ? object.heightPercent : 0;
  const startX = Number.isFinite(object.xPercent) ? object.xPercent : 0;
  const startY = Number.isFinite(object.yPercent) ? object.yPercent : 0;

  const candidates = options.candidates ?? [];
  const xTargets = buildAxisTargets('x', width, candidates, aspectRatio);
  const yTargets = buildAxisTargets('y', height, candidates, aspectRatio);

  const guides: PresentSnapGuide[] = [];
  let xPercent = startX;
  let yPercent = startY;
  let snappedX = false;
  let snappedY = false;

  const bestX = pickTarget(startX, xTargets, tolerance);
  if (bestX) {
    xPercent = bestX.target.position;
    snappedX = true;
    guides.push({ axis: 'x', positionPercent: bestX.target.position, kind: bestX.target.kind, sourceId: bestX.target.sourceId });
  } else {
    const grid = gridTarget(startX, gridPercent);
    if (grid && Math.abs(startX - grid.position) <= Math.max(tolerance, gridPercent / 2)) {
      xPercent = grid.position;
      snappedX = true;
      guides.push({ axis: 'x', positionPercent: grid.position, kind: 'grid' });
    }
  }

  const bestY = pickTarget(startY, yTargets, tolerance);
  if (bestY) {
    yPercent = bestY.target.position;
    snappedY = true;
    guides.push({ axis: 'y', positionPercent: bestY.target.position, kind: bestY.target.kind, sourceId: bestY.target.sourceId });
  } else {
    const grid = gridTarget(startY, gridPercent);
    if (grid && Math.abs(startY - grid.position) <= Math.max(tolerance, gridPercent / 2)) {
      yPercent = grid.position;
      snappedY = true;
      guides.push({ axis: 'y', positionPercent: grid.position, kind: 'grid' });
    }
  }

  return { xPercent, yPercent, guides, snappedX, snappedY };
}
