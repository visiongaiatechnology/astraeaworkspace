// STATUS: PLATIN — verifies coachmarks stay beside targets when vertical space is constrained.
import { describe, expect, it } from 'vitest';
import { positionGuidePopover } from '../appGuidePopoverLayout.ts';

const panel = { height: 400 };

describe('anchored guide popover layout', () => {
  it('places a tall left-side target to its right instead of covering it', () => {
    expect(positionGuidePopover(
      { left: 15, right: 249, top: 287, bottom: 664, width: 234, height: 377 },
      panel,
      { width: 1864, height: 884 },
    )).toEqual({ left: 261, top: 275.5, width: 368, placement: 'right' });
  });

  it('places a target near the right edge to its left', () => {
    expect(positionGuidePopover(
      { left: 1610, right: 1810, top: 300, bottom: 500, width: 200, height: 200 },
      panel,
      { width: 1864, height: 884 },
    )).toEqual({ left: 1230, top: 200, width: 368, placement: 'left' });
  });

  it('uses the vertical space when a short target has room below', () => {
    expect(positionGuidePopover(
      { left: 80, right: 180, top: 100, bottom: 140, width: 100, height: 40 },
      { height: 300 },
      { width: 800, height: 600 },
    )).toEqual({ left: 80, top: 152, width: 368, placement: 'below' });
  });

  it('keeps narrow viewport placement within horizontal margins', () => {
    expect(positionGuidePopover(
      { left: 120, right: 180, top: 300, bottom: 340, width: 60, height: 40 },
      panel,
      { width: 320, height: 600 },
    )).toEqual({ left: 12, top: 12, width: 296, placement: 'above' });
  });
});
