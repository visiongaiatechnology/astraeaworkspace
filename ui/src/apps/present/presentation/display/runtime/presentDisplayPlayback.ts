// STATUS: PLATIN — deterministic animation playback for the Present display windows.
//
// The presenter display owns the click-step counter and broadcasts it with every `goto`; the
// audience display never invents a step. Both windows turn that counter into animation start times
// locally, then read the existing `presentAnimationEngine` for progress — the same presets, the same
// duration/delay/repeat/rewind semantics as the in-window presenter mode. No second animation model.
//
// Reduced motion is honoured here, not in the renderer: the progress of every animation is its final
// state, so a fade-in is immediately visible and an exit is immediately gone.
import type { PresentAnimation } from '../../../../../shared/contracts/workspace';
import {
  animationProgressForElapsed,
  buildAnimationPlaybackGroups,
  normalizePresentAnimation,
  type PresentAnimationPlaybackGroup,
} from '../../../animations/presentAnimationEngine';
import { normalizePresentTransition, transitionDurationMs } from '../../../presenter/transitions/presentTransitionEngine';

export interface PresentAnimationPlaybackContext {
  /** How many click-triggered animation groups have been played on this slide. */
  readonly clickGroupIndex: number;
  /** `now` at the moment the slide became the visible slide. */
  readonly slideActivatedAt: number;
  readonly now: number;
  readonly reducedMotion: boolean;
  /**
   * `false` when the presenter rewound one step: the group that was un-played returns to its
   * unplayed state instead of replaying its entrance animation.
   */
  readonly animateCurrentClickGroup?: boolean;
}

export interface PresentAnimationPlayback {
  readonly clickGroups: PresentAnimationPlaybackGroup[];
  /** Animation id → local start time. Missing ids have not started yet (progress 0). */
  readonly startsByAnimationId: Record<string, number>;
}

function finalProgress(animation: PresentAnimation): number {
  const normalized = normalizePresentAnimation(animation);
  return normalized.rewind ? 0 : 1;
}

/**
 * Builds the start times for one slide state. Autoplay (`with-previous`/`after-previous`) groups
 * start when the slide activates; click groups start with the step they belong to. Groups that are
 * already behind the current step are pinned to their final state so a re-application never
 * restarts them.
 */
export function buildPresentAnimationPlayback(
  animations: readonly PresentAnimation[],
  context: PresentAnimationPlaybackContext,
): PresentAnimationPlayback {
  const list = animations ?? [];
  const groups = buildAnimationPlaybackGroups([...list]);
  const clickGroups = groups.filter((group) => group.trigger === 'click');
  const startsByAnimationId: Record<string, number> = {};
  if (context.reducedMotion) return { clickGroups, startsByAnimationId };

  const durationById = new Map<string, number>();
  for (const animation of list) {
    const normalized = normalizePresentAnimation(animation);
    durationById.set(normalized.id, normalized.durationMs * (normalized.repeatCount || 1));
  }

  for (const group of groups) {
    if (group.trigger === 'auto') {
      for (const entry of group.entries) {
        startsByAnimationId[entry.animationId] = context.slideActivatedAt + entry.startMs;
      }
      continue;
    }
    const groupIndex = clickGroups.indexOf(group);
    if (groupIndex < 0) continue;
    const completed = groupIndex < context.clickGroupIndex - 1;
    const running = groupIndex === context.clickGroupIndex - 1
      && context.animateCurrentClickGroup !== false;
    for (const entry of group.entries) {
      if (completed) {
        const total = durationById.get(entry.animationId) ?? entry.endMs - entry.startMs;
        startsByAnimationId[entry.animationId] = context.now - entry.startMs - total - 1;
      } else if (running) {
        startsByAnimationId[entry.animationId] = context.now + entry.startMs;
      }
    }
  }
  return { clickGroups, startsByAnimationId };
}

export interface PresentAnimationProgress {
  readonly progressById: Record<string, number>;
  readonly running: boolean;
}

/** Turns start times into the per-animation progress map the renderer already consumes. */
export function computePresentAnimationProgress(
  animations: readonly PresentAnimation[],
  startsByAnimationId: Record<string, number>,
  now: number,
  reducedMotion: boolean,
): PresentAnimationProgress {
  const progressById: Record<string, number> = {};
  let running = false;
  for (const raw of animations ?? []) {
    const animation = normalizePresentAnimation(raw);
    if (animation.effect === 'none') continue;
    if (reducedMotion) {
      progressById[animation.id] = finalProgress(animation);
      continue;
    }
    const start = startsByAnimationId[animation.id];
    if (start === undefined) {
      progressById[animation.id] = 0;
      continue;
    }
    const elapsed = now - start;
    progressById[animation.id] = animationProgressForElapsed(animation, elapsed);
    if (elapsed < animation.durationMs * (animation.repeatCount || 1)) running = true;
  }
  return { progressById, running };
}

/** Reduced motion removes the inter-slide transition as well; the frame is applied immediately. */
export function presentDisplayTransitionDuration(
  transition: Parameters<typeof normalizePresentTransition>[0],
  reducedMotion: boolean,
): number {
  if (reducedMotion) return 0;
  return transitionDurationMs(transition);
}
