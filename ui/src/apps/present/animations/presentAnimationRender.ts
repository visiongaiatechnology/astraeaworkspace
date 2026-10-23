// STATUS: DIAMANT VGT SUPREME — Shared scoped animation projection for editor/presenter renderers
import type { ChartObject, PresentAnimation } from '../../../shared/contracts/workspace';
import { composeScopedAnimationStyle, scopedAnimationVisibilityFactor } from './presentAnimationEngine';

export function scopedPresentAnimationStyle(
  animations: PresentAnimation[],
  targetId: string,
  scope: PresentAnimation['scope'],
  scopeIndex: number,
  progressByAnimationId: Record<string, number>
): Record<string, string | number> {
  return composeScopedAnimationStyle(animations, targetId, scope, scopeIndex, progressByAnimationId);
}

export function projectAnimatedChart(
  chart: ChartObject,
  animations: PresentAnimation[],
  targetId: string,
  progressByAnimationId: Record<string, number>
): ChartObject {
  if (!animations.length) return chart;

  const nextSeries = chart.series.map((series, seriesIndex) => {
    const seriesFactor = scopedAnimationVisibilityFactor(
      animations,
      targetId,
      'series',
      seriesIndex,
      progressByAnimationId
    );
    const values = series.values.map((value, categoryIndex) => {
      const categoryFactor = scopedAnimationVisibilityFactor(
        animations,
        targetId,
        'category',
        categoryIndex,
        progressByAnimationId
      );
      return value * seriesFactor * categoryFactor;
    });
    const xValues = series.x_values?.map((value, categoryIndex) => {
      const categoryFactor = scopedAnimationVisibilityFactor(
        animations,
        targetId,
        'category',
        categoryIndex,
        progressByAnimationId
      );
      return value * categoryFactor;
    });
    const bubbleSizes = series.bubble_sizes?.map((value, categoryIndex) => {
      const categoryFactor = scopedAnimationVisibilityFactor(
        animations,
        targetId,
        'category',
        categoryIndex,
        progressByAnimationId
      );
      return Math.max(0, value * seriesFactor * categoryFactor);
    });
    return { ...series, values, x_values: xValues, bubble_sizes: bubbleSizes };
  });

  return { ...chart, series: nextSeries };
}
