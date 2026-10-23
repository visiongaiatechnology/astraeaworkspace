// STATUS: GOLD — Present Runde 42: animation playback schedule for the display windows.
//
// Proves that the existing animation engine drives the projector/presenter windows: autoplay groups
// start with the slide, click groups advance with the presenter's step counter, earlier steps stay in
// their final state, and reduced motion jumps every animation to its final state.
import { describe, expect, it } from 'vitest';
import type { PresentAnimation } from '../../../../shared/contracts/workspace';
import {
  buildPresentAnimationPlayback,
  computePresentAnimationProgress,
} from '../../presentation/display/runtime/presentDisplayPlayback';

const AUTOPLAY: PresentAnimation = {
  id: 'auto-title',
  targetId: 'slide-title',
  effect: 'fade-in',
  trigger: 'with-previous',
  durationMs: 300,
  delayMs: 0,
};
const CLICK_ONE: PresentAnimation = {
  id: 'click-subtitle',
  targetId: 'slide-subtitle',
  effect: 'fade-in',
  trigger: 'on-click',
  durationMs: 300,
  delayMs: 0,
};
const CLICK_TWO: PresentAnimation = {
  id: 'click-card',
  targetId: 'card-1',
  effect: 'fly-in-left',
  trigger: 'on-click',
  durationMs: 400,
  delayMs: 50,
};

const ANIMATIONS = [AUTOPLAY, CLICK_ONE, CLICK_TWO];

describe('Present display animation playback', () => {
  it('starts autoplay groups with the slide and keeps click groups unstarted at step 0', () => {
    const playback = buildPresentAnimationPlayback(ANIMATIONS, {
      clickGroupIndex: 0,
      slideActivatedAt: 1_000,
      now: 1_200,
      reducedMotion: false,
    });
    expect(playback.clickGroups).toHaveLength(2);
    expect(playback.startsByAnimationId['auto-title']).toBe(1_000);
    expect(playback.startsByAnimationId['click-subtitle']).toBeUndefined();
    expect(playback.startsByAnimationId['click-card']).toBeUndefined();
  });

  it('starts the next click group locally and pins earlier groups to their final state', () => {
    const first = buildPresentAnimationPlayback(ANIMATIONS, {
      clickGroupIndex: 1,
      slideActivatedAt: 1_000,
      now: 5_000,
      reducedMotion: false,
    });
    expect(first.startsByAnimationId['click-subtitle']).toBe(5_000);
    expect(first.startsByAnimationId['click-card']).toBeUndefined();

    const second = buildPresentAnimationPlayback(ANIMATIONS, {
      clickGroupIndex: 2,
      slideActivatedAt: 1_000,
      now: 8_000,
      reducedMotion: false,
    });
    const pinned = second.startsByAnimationId['click-subtitle'];
    expect(pinned).toBeDefined();
    expect(8_000 - (pinned as number)).toBeGreaterThan(300);
    expect(second.startsByAnimationId['click-card']).toBe(8_050);
  });

  it('computes progress from the existing engine and reports when frames are still needed', () => {
    const starts = { 'click-subtitle': 1_000 };
    const midway = computePresentAnimationProgress(ANIMATIONS, starts, 1_150, false);
    expect(midway.progressById['click-subtitle']).toBeCloseTo(0.5, 3);
    expect(midway.progressById['click-card']).toBe(0);
    expect(midway.running).toBe(true);

    const settled = computePresentAnimationProgress(ANIMATIONS, starts, 1_400, false);
    expect(settled.progressById['click-subtitle']).toBe(1);
    expect(settled.running).toBe(false);
  });

  it('returns a rewound click step to its unplayed state instead of replaying it', () => {
    const forward = buildPresentAnimationPlayback(ANIMATIONS, {
      clickGroupIndex: 1,
      slideActivatedAt: 1_000,
      now: 5_000,
      reducedMotion: false,
      animateCurrentClickGroup: true,
    });
    expect(forward.startsByAnimationId['click-subtitle']).toBe(5_000);

    const rewound = buildPresentAnimationPlayback(ANIMATIONS, {
      clickGroupIndex: 1,
      slideActivatedAt: 1_000,
      now: 5_000,
      reducedMotion: false,
      animateCurrentClickGroup: false,
    });
    expect(rewound.startsByAnimationId['click-subtitle']).toBeUndefined();
    expect(rewound.startsByAnimationId['click-card']).toBeUndefined();
  });

  it('applies reduced motion as final state instead of replaying the timeline', () => {
    const playback = buildPresentAnimationPlayback(ANIMATIONS, {
      clickGroupIndex: 0,
      slideActivatedAt: 1_000,
      now: 1_200,
      reducedMotion: true,
    });
    expect(playback.startsByAnimationId).toEqual({});
    const progress = computePresentAnimationProgress(ANIMATIONS, {}, 1_200, true);
    expect(progress.progressById['auto-title']).toBe(1);
    expect(progress.progressById['click-subtitle']).toBe(1);
    expect(progress.running).toBe(false);
  });
});
