// STATUS: PLATIN — deterministic viewport-aware placement for anchored coachmarks.
export type GuidePopoverPlacement = 'above' | 'below' | 'left' | 'right';

export interface GuidePopoverRect {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

export interface GuidePopoverPosition {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly placement: GuidePopoverPlacement;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(value, maximum));
}

export function positionGuidePopover(
  target: GuidePopoverRect,
  panel: Pick<GuidePopoverRect, 'height'>,
  viewport: { readonly width: number; readonly height: number },
  maxWidth = 368,
  margin = 12,
  gap = 12,
): GuidePopoverPosition {
  const viewportWidth = Math.max(0, viewport.width);
  const viewportHeight = Math.max(0, viewport.height);
  const availableWidth = Math.max(0, viewportWidth - margin * 2);
  const width = Math.min(maxWidth, availableWidth);
  const panelHeight = Math.min(Math.max(0, panel.height), Math.max(0, viewportHeight - margin * 2));
  const maxTop = Math.max(margin, viewportHeight - panelHeight - margin);
  const centeredTop = clamp(target.top + target.height / 2 - panelHeight / 2, margin, maxTop);
  const leftAtTarget = clamp(target.left, margin, Math.max(margin, viewportWidth - width - margin));
  const belowSpace = viewportHeight - target.bottom - gap - margin;
  const aboveSpace = target.top - gap - margin;
  const rightSpace = viewportWidth - target.right - gap - margin;
  const leftSpace = target.left - gap - margin;
  const minimumSideWidth = Math.min(240, width);

  if (belowSpace >= panelHeight) {
    return { left: leftAtTarget, top: target.bottom + gap, width, placement: 'below' };
  }
  if (aboveSpace >= panelHeight) {
    return { left: leftAtTarget, top: target.top - panelHeight - gap, width, placement: 'above' };
  }
  if (rightSpace >= minimumSideWidth) {
    const sideWidth = Math.min(width, rightSpace);
    return { left: target.right + gap, top: centeredTop, width: sideWidth, placement: 'right' };
  }
  if (leftSpace >= minimumSideWidth) {
    const sideWidth = Math.min(width, leftSpace);
    return { left: target.left - sideWidth - gap, top: centeredTop, width: sideWidth, placement: 'left' };
  }

  const placement = belowSpace >= aboveSpace ? 'below' : 'above';
  const requestedTop = placement === 'below' ? target.bottom + gap : target.top - panelHeight - gap;
  return { left: leftAtTarget, top: clamp(requestedTop, margin, maxTop), width, placement };
}
