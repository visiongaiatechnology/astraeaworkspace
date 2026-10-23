import { describe, expect, it } from 'vitest';
import type { PresentAnimation, ChartObject } from '../../../../shared/contracts/workspace';
import {
  animationProgressForElapsed,
  animationStyleForProgress,
  buildAnimationPlaybackGroups,
  composeScopedAnimationStyle,
  createPresentAnimation,
  evaluatePreviewAnimationsAtTime,
  normalizePresentAnimation,
  reorderPresentAnimations,
} from '../../animations/presentAnimationEngine';
import { projectAnimatedChart } from '../../animations/presentAnimationRender';

const animation = (patch: Partial<PresentAnimation> & Pick<PresentAnimation, 'id' | 'targetId'>): PresentAnimation => normalizePresentAnimation({
  ...patch,
  effect: patch.effect || 'fade-in',
  trigger: patch.trigger || 'on-click',
  durationMs: patch.durationMs ?? 500,
  delayMs: patch.delayMs ?? 0,
});

describe('Present animation engine', () => {
  it('keeps multiple ordered animations on the same target', () => {
    const first = createPresentAnimation('shape-1', 'entrance-fade', 0);
    const second = { ...createPresentAnimation('shape-1', 'emphasis-pulse', 1), id: 'second' };
    const reordered = reorderPresentAnimations([{ ...first, id: 'first' }, second], 'second', -1);
    expect(reordered.map((item) => item.id)).toEqual(['second', 'first']);
    expect(reordered.every((item) => item.targetId === 'shape-1')).toBe(true);
  });

  it('anchors with/after-previous entries to the click group that precedes them', () => {
    const groups = buildAnimationPlaybackGroups([
      animation({ id: 'auto', targetId: 'a', trigger: 'after-previous', durationMs: 100 }),
      animation({ id: 'click', targetId: 'b', trigger: 'on-click', durationMs: 200 }),
      animation({ id: 'with', targetId: 'c', trigger: 'with-previous', delayMs: 25, durationMs: 80 }),
      animation({ id: 'after', targetId: 'd', trigger: 'after-previous', delayMs: 10, durationMs: 50 }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].trigger).toBe('auto');
    expect(groups[1].trigger).toBe('click');
    expect(groups[1].entries.map((entry) => [entry.animationId, entry.startMs])).toEqual([
      ['click', 0],
      ['with', 25],
      ['after', 210],
    ]);
  });

  it('applies repeat and rewind deterministically', () => {
    const repeated = animation({ id: 'repeat', targetId: 'x', durationMs: 100, repeatCount: 2, rewind: true });
    expect(animationProgressForElapsed(repeated, 50)).toBeCloseTo(0.5);
    expect(animationProgressForElapsed(repeated, 150)).toBeCloseTo(0.5);
    expect(animationProgressForElapsed(repeated, 250)).toBe(0);
  });

  it('interpolates bounded motion path control points', () => {
    const motion = animation({
      id: 'motion',
      targetId: 'x',
      effect: 'motion-path',
      motionPath: [{ xPercent: 0, yPercent: 0 }, { xPercent: 20, yPercent: 10 }, { xPercent: 40, yPercent: 0 }],
    });
    expect(animationStyleForProgress(motion, 0.5).transform).toBe('translate(20%, 10%)');
  });

  it('isolates paragraph scope by index', () => {
    const paragraph = animation({ id: 'p2', targetId: 'text-1', scope: 'paragraph', scopeIndex: 1 });
    const progress = { p2: 0.4 };
    expect(composeScopedAnimationStyle([paragraph], 'text-1', 'paragraph', 0, progress)).toEqual({});
    expect(composeScopedAnimationStyle([paragraph], 'text-1', 'paragraph', 1, progress).opacity).toBeCloseTo(0.4);
  });

  it('projects series/category animation progress into chart data without mutating source data', () => {
    const chart: ChartObject = {
      id: 'chart', chart_type: 'column', title: 'T', categories: ['A', 'B'],
      series: [{ name: 'S1', values: [10, 20] }, { name: 'S2', values: [30, 40] }],
    };
    const animations = [
      animation({ id: 'series', targetId: 'chart-object', scope: 'series', scopeIndex: 1 }),
      animation({ id: 'category', targetId: 'chart-object', scope: 'category', scopeIndex: 0 }),
    ];
    const projected = projectAnimatedChart(chart, animations, 'chart-object', { series: 0.5, category: 0.2 });
    expect(projected.series[0].values).toEqual([2, 20]);
    expect(projected.series[1].values).toEqual([3, 20]);
    expect(chart.series[1].values).toEqual([30, 40]);
  });

  it('preview state identifies only the animations included in that preview', () => {
    const selected = animation({ id: 'selected', targetId: 'x' });
    const state = evaluatePreviewAnimationsAtTime([selected], 250);
    expect(state.animationIds).toEqual(['selected']);
    expect(state.progressByAnimationId.selected).toBeCloseTo(0.5);
  });

  it('normalizes hostile or malformed timing fields into resource bounds', () => {
    const normalized = normalizePresentAnimation({
      id: 'x'.repeat(400), targetId: 'y'.repeat(400), effect: 'fade-in', trigger: 'on-click',
      durationMs: Number.POSITIVE_INFINITY, delayMs: -50, repeatCount: 999, scopeIndex: 99999,
    });
    expect(normalized.id.length).toBeLessThanOrEqual(128);
    expect(normalized.targetId.length).toBeLessThanOrEqual(128);
    expect(normalized.durationMs).toBe(50);
    expect(normalized.delayMs).toBe(0);
    expect(normalized.repeatCount).toBe(20);
    expect(normalized.scopeIndex).toBe(999);
  });
});
