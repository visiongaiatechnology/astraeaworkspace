// STATUS: DIAMANT VGT SUPREME — Monte Carlo Stochastic Simulation Engine
// Fast Box-Muller sampling, statistical percentiles, VaR, and histogram generation
//
// Bounded by construction: variable count, iteration count, histogram bin count and the
// Box-Muller rejection loop all have explicit, immutable ceilings.

import { createGridIterationBudget, GRID_ITERATION_HARD_CAPS } from './gridIterationBudget';

export type DistributionType = 'normal' | 'uniform' | 'triangular' | 'lognormal';

/** Immutable ceilings for the simulation entry points. */
export const GRID_MONTE_CARLO_MAX_ITERATIONS = 50_000;
export const GRID_MONTE_CARLO_MIN_ITERATIONS = 100;
export const GRID_MONTE_CARLO_MAX_BINS = 512;
export const GRID_MONTE_CARLO_MAX_VARIABLES = 64;
/**
 * Box-Muller needs a non-zero uniform sample. A bounded retry count means a degenerate or malicious
 * injected RNG fails loudly instead of spinning forever.
 */
export const GRID_MONTE_CARLO_MAX_RNG_RETRIES = 64;

export interface StochasticVariable {
  id: string;
  name: string;
  distribution: DistributionType;
  p1: number; // mean | min | min | mean
  p2: number; // stdDev | max | mode | stdDev
  p3?: number; // unused | unused | max | unused
}

export interface HistogramBin {
  x0: number;
  x1: number;
  count: number;
  frequency: number;
}

export interface MonteCarloResult {
  iterations: number;
  mean: number;
  median: number;
  stdDev: number;
  min: number;
  max: number;
  var95: number; // Value at Risk 95%
  var99: number; // Value at Risk 99%
  percentiles: {
    p5: number;
    p10: number;
    p25: number;
    p50: number;
    p75: number;
    p90: number;
    p95: number;
    p99: number;
  };
  histogram: HistogramBin[];
  samples: Float64Array;
  seed?: number;
}

export function createGridSeededRandom(seed: number): () => number {
  let state = (Math.trunc(seed) >>> 0) || 0x9e3779b9;
  return () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

/**
 * Standard Box-Muller transform for generating normally distributed random values.
 *
 * The retry loop is bounded: a random source that keeps returning exactly 0 (or a stub `Math.random`
 * replacement) must not hang the simulation.
 */
function sampleNormal(mean: number, stdDev: number, random: () => number): number {
  const nextNonZero = (): number => {
    for (let attempt = 0; attempt < GRID_MONTE_CARLO_MAX_RNG_RETRIES; attempt++) {
      const value = random();
      if (!Number.isFinite(value)) throw new Error('monte_carlo_rng_non_finite');
      if (value > 0) return value;
    }
    throw new Error('monte_carlo_rng_degenerate');
  };
  const u = nextNonZero();
  const v = nextNonZero();
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return mean + z * stdDev;
}

/**
 * Samples a random value from the specified continuous probability distribution.
 */
export function sampleDistribution(v: StochasticVariable, random: () => number = Math.random): number {
  switch (v.distribution) {
    case 'normal':
      return sampleNormal(v.p1, v.p2, random);

    case 'uniform': {
      const min = Math.min(v.p1, v.p2);
      const max = Math.max(v.p1, v.p2);
      return min + random() * (max - min);
    }

    case 'triangular': {
      const a = v.p1;
      const c = v.p2; // mode
      const b = v.p3 !== undefined ? v.p3 : v.p2; // max
      const u = random();
      const fc = (c - a) / (b - a);
      if (u < fc) {
        return a + Math.sqrt(u * (b - a) * (c - a));
      }
      return b - Math.sqrt((1 - u) * (b - a) * (b - c));
    }

    case 'lognormal': {
      const norm = sampleNormal(v.p1, v.p2, random);
      return Math.exp(norm);
    }

    default:
      return v.p1;
  }
}

/**
 * Runs N iterations of a stochastic simulation evaluated against a formula or expression.
 */
export function runMonteCarloSimulation(
  variables: StochasticVariable[],
  evaluator: (sampleMap: Record<string, number>) => number,
  iterations: number = 2000,
  binCount: number = 20,
  random: () => number = Math.random,
  seed?: number
): MonteCarloResult {
  if (!Number.isFinite(iterations)) throw new Error('monte_carlo_iterations_invalid');
  const n = Math.max(GRID_MONTE_CARLO_MIN_ITERATIONS, Math.min(Math.trunc(iterations), GRID_MONTE_CARLO_MAX_ITERATIONS));
  if (!Number.isFinite(binCount)) throw new Error('monte_carlo_bin_count_invalid');
  // `binCount` used to be passed straight into `Array.from({length})` — an unbounded allocation.
  const bins = Math.max(1, Math.min(Math.trunc(binCount), GRID_MONTE_CARLO_MAX_BINS));
  if (!variables.length || variables.length > GRID_MONTE_CARLO_MAX_VARIABLES) throw new Error('monte_carlo_variable_limit');
  const names = new Set<string>();
  for (const variable of variables) {
    if (!variable.name.trim() || names.has(variable.name)) throw new Error('monte_carlo_variable_name_invalid');
    names.add(variable.name);
    if (![variable.p1, variable.p2, variable.p3 ?? 0].every(Number.isFinite)) throw new Error('monte_carlo_parameter_invalid');
    if (variable.distribution === 'normal' && variable.p2 < 0) throw new Error('monte_carlo_stddev_invalid');
    if (variable.distribution === 'lognormal' && variable.p2 < 0) throw new Error('monte_carlo_stddev_invalid');
    if (variable.distribution === 'uniform' && variable.p1 === variable.p2) throw new Error('monte_carlo_uniform_degenerate');
    if (variable.distribution === 'triangular') {
      const max = variable.p3 ?? variable.p2;
      if (!(variable.p1 <= variable.p2 && variable.p2 <= max)) throw new Error('monte_carlo_triangular_invalid');
      if (variable.p1 === max) throw new Error('monte_carlo_triangular_degenerate');
    }
  }
  // One shared budget for the whole simulation: iterations and evaluator calls are both bounded,
  // so a slow or adversarial evaluator cannot run away.
  const budget = createGridIterationBudget({
    maxIterations: n,
    maxEvaluations: n,
    maxDurationMs: GRID_ITERATION_HARD_CAPS.maxDurationMs,
  });
  const samples = new Float64Array(n);
  let produced = 0;

  for (let i = 0; i < n; i++) {
    if (!budget.beginIteration()) break;
    const map: Record<string, number> = {};
    for (const v of variables) {
      map[v.name] = sampleDistribution(v, random);
    }
    if (!budget.spendEvaluation()) break;
    const evaluated=evaluator(map);
    if (!Number.isFinite(evaluated)) throw new Error('monte_carlo_evaluator_non_finite');
    samples[produced++] = evaluated;
  }
  if (produced === 0) throw new Error('monte_carlo_no_samples');
  if (produced !== n) throw new Error('monte_carlo_budget_exhausted');

  // Sort samples for exact percentile calculation
  samples.sort();

  // Basic statistics
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += samples[i];
  }
  const mean = sum / n;

  let varianceSum = 0;
  for (let i = 0; i < n; i++) {
    const diff = samples[i] - mean;
    varianceSum += diff * diff;
  }
  const stdDev = Math.sqrt(varianceSum / n);

  const getPercentile = (p: number): number => {
    const idx = Math.min(n - 1, Math.max(0, Math.floor((p / 100) * n)));
    return samples[idx];
  };

  const p5 = getPercentile(5);
  const p10 = getPercentile(10);
  const p25 = getPercentile(25);
  const p50 = getPercentile(50);
  const p75 = getPercentile(75);
  const p90 = getPercentile(90);
  const p95 = getPercentile(95);
  const p99 = getPercentile(99);

  const min = samples[0];
  const max = samples[n - 1];

  // Value at Risk (VaR)
  const var95 = mean - p5;
  const var99 = mean - getPercentile(1);

  // Histogram calculation
  const binWidth = (max - min) / bins || 1;
  const histograms: HistogramBin[] = Array.from({ length: bins }, (_, idx) => ({
    x0: min + idx * binWidth,
    x1: min + (idx + 1) * binWidth,
    count: 0,
    frequency: 0,
  }));

  for (let i = 0; i < n; i++) {
    const val = samples[i];
    let binIdx = Math.floor((val - min) / binWidth);
    if (binIdx >= bins) binIdx = bins - 1;
    histograms[binIdx].count++;
  }

  histograms.forEach((b) => (b.frequency = b.count / n));

  return {
    iterations: n,
    seed,
    mean: Math.round(mean * 1e4) / 1e4,
    median: Math.round(p50 * 1e4) / 1e4,
    stdDev: Math.round(stdDev * 1e4) / 1e4,
    min: Math.round(min * 1e4) / 1e4,
    max: Math.round(max * 1e4) / 1e4,
    var95: Math.round(var95 * 1e4) / 1e4,
    var99: Math.round(var99 * 1e4) / 1e4,
    percentiles: {
      p5: Math.round(p5 * 1e4) / 1e4,
      p10: Math.round(p10 * 1e4) / 1e4,
      p25: Math.round(p25 * 1e4) / 1e4,
      p50: Math.round(p50 * 1e4) / 1e4,
      p75: Math.round(p75 * 1e4) / 1e4,
      p90: Math.round(p90 * 1e4) / 1e4,
      p95: Math.round(p95 * 1e4) / 1e4,
      p99: Math.round(p99 * 1e4) / 1e4,
    },
    histogram: histograms,
    samples,
  };
}


export const GRID_MONTE_CARLO_TEMPLATES: ReadonlyArray<{id:string;name:string;expression:string;variables:StochasticVariable[]}> = [
  {id:'margin-risk',name:'Margin risk',expression:'Revenue-Cost',variables:[{id:'revenue',name:'Revenue',distribution:'normal',p1:100000,p2:15000},{id:'cost',name:'Cost',distribution:'triangular',p1:50000,p2:65000,p3:90000}]},
  {id:'project-cost',name:'Project cost',expression:'Labor+Infrastructure+Contingency',variables:[{id:'labor',name:'Labor',distribution:'normal',p1:80000,p2:10000},{id:'infra',name:'Infrastructure',distribution:'uniform',p1:20000,p2:40000},{id:'cont',name:'Contingency',distribution:'triangular',p1:5000,p2:12000,p3:25000}]},
];
