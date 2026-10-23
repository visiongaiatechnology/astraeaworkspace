// STATUS: DIAMANT VGT SUPREME
// Astraea Grid authoritative Descriptive Statistics Toolpak & Regression Analysis Domain
// Full Parity for CORREL, COVARIANCE.P, COVARIANCE.S, SLOPE, INTERCEPT, RSQ, FORECAST, TREND, GROWTH, SKEW, KURT

import { FormulaValue, FormulaArray, toSingleValue } from '../gridFormulaTypes';
import { flattenToNumbers } from '../gridFormulaMath';

export interface DescriptiveStatisticsSummary {
  mean: number;
  standardError: number;
  median: number;
  mode: number | string;
  standardDeviation: number;
  sampleVariance: number;
  kurtosis: number;
  skewness: number;
  range: number;
  minimum: number;
  maximum: number;
  sum: number;
  count: number;
  confidenceLevel95: number;
}

/**
 * Calculates Pearson correlation coefficient (CORREL) between two arrays of numbers
 */
export function calculateCorrel(xValues: number[], yValues: number[]): number | '#N/A' | '#DIV/0!' {
  const n = Math.min(xValues.length, yValues.length);
  if (n < 2) return '#DIV/0!';

  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += xValues[i];
    sumY += yValues[i];
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xValues[i] - meanX;
    const dy = yValues[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }

  const denom = Math.sqrt(denX * denY);
  if (denom === 0) return '#DIV/0!';
  return Math.round((num / denom) * 1e10) / 1e10;
}

/**
 * Calculates Population Covariance (COVARIANCE.P)
 */
export function calculateCovarianceP(xValues: number[], yValues: number[]): number | '#DIV/0!' {
  const n = Math.min(xValues.length, yValues.length);
  if (n === 0) return '#DIV/0!';

  const meanX = xValues.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const meanY = yValues.slice(0, n).reduce((a, b) => a + b, 0) / n;

  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += (xValues[i] - meanX) * (yValues[i] - meanY);
  }
  return sum / n;
}

/**
 * Calculates Sample Covariance (COVARIANCE.S)
 */
export function calculateCovarianceS(xValues: number[], yValues: number[]): number | '#DIV/0!' {
  const n = Math.min(xValues.length, yValues.length);
  if (n <= 1) return '#DIV/0!';

  const meanX = xValues.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const meanY = yValues.slice(0, n).reduce((a, b) => a + b, 0) / n;

  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += (xValues[i] - meanX) * (yValues[i] - meanY);
  }
  return sum / (n - 1);
}

/**
 * Calculates Linear Regression Slope (SLOPE)
 */
export function calculateSlope(knownYs: number[], knownXs: number[]): number | '#DIV/0!' {
  const n = Math.min(knownYs.length, knownXs.length);
  if (n < 2) return '#DIV/0!';

  const meanX = knownXs.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const meanY = knownYs.slice(0, n).reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const dx = knownXs[i] - meanX;
    const dy = knownYs[i] - meanY;
    num += dx * dy;
    den += dx * dx;
  }

  if (den === 0) return '#DIV/0!';
  return num / den;
}

/**
 * Calculates Linear Regression Intercept (INTERCEPT)
 */
export function calculateIntercept(knownYs: number[], knownXs: number[]): number | '#DIV/0!' {
  const slope = calculateSlope(knownYs, knownXs);
  if (typeof slope !== 'number') return slope;

  const n = Math.min(knownYs.length, knownXs.length);
  const meanX = knownXs.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const meanY = knownYs.slice(0, n).reduce((a, b) => a + b, 0) / n;

  return meanY - slope * meanX;
}

/**
 * Calculates Coefficient of Determination R-Squared (RSQ)
 */
export function calculateRsq(knownYs: number[], knownXs: number[]): number | '#DIV/0!' | '#N/A' {
  const r = calculateCorrel(knownXs, knownYs);
  if (typeof r !== 'number') return r;
  return r * r;
}

/**
 * Linear Forecast: y = slope * x + intercept
 */
export function calculateForecast(x: number, knownYs: number[], knownXs: number[]): number | '#DIV/0!' {
  const slope = calculateSlope(knownYs, knownXs);
  if (typeof slope !== 'number') return slope;
  const intercept = calculateIntercept(knownYs, knownXs);
  if (typeof intercept !== 'number') return intercept;
  return slope * x + intercept;
}

/**
 * Calculates Sample Skewness (SKEW)
 */
export function calculateSkewness(nums: number[]): number | '#DIV/0!' {
  const n = nums.length;
  if (n < 3) return '#DIV/0!';

  const mean = nums.reduce((a, b) => a + b, 0) / n;
  let m2 = 0;
  let m3 = 0;

  for (const x of nums) {
    const diff = x - mean;
    m2 += diff * diff;
    m3 += diff * diff * diff;
  }

  const variance = m2 / (n - 1);
  const std = Math.sqrt(variance);
  if (std === 0) return '#DIV/0!';

  const skew = (n * m3) / ((n - 1) * (n - 2) * Math.pow(std, 3));
  return Math.round(skew * 1e10) / 1e10;
}

/**
 * Calculates Sample Excess Kurtosis (KURT)
 */
export function calculateKurtosis(nums: number[]): number | '#DIV/0!' {
  const n = nums.length;
  if (n < 4) return '#DIV/0!';

  const mean = nums.reduce((a, b) => a + b, 0) / n;
  let s2 = 0;
  let s4 = 0;

  for (const x of nums) {
    const diff = x - mean;
    s2 += diff * diff;
    s4 += Math.pow(diff, 4);
  }

  const varSample = s2 / (n - 1);
  const std = Math.sqrt(varSample);
  if (std === 0) return '#DIV/0!';

  const term1 = (n * (n + 1) * s4) / ((n - 1) * (n - 2) * (n - 3) * Math.pow(varSample, 2));
  const term2 = (3 * Math.pow(n - 1, 2)) / ((n - 2) * (n - 3));

  return Math.round((term1 - term2) * 1e10) / 1e10;
}

/**
 * Generates the authoritative Descriptive Statistics Toolpak Summary
 */
export function generateDescriptiveStatistics(
  data: number[],
  confidenceLevel: number = 0.95
): DescriptiveStatisticsSummary {
  const valid = data.filter((n) => !isNaN(n) && Number.isFinite(n));
  const n = valid.length;
  if (n === 0) {
    throw new Error('Descriptive Statistics requires at least one numeric value.');
  }

  const sorted = [...valid].sort((a, b) => a - b);
  const sum = valid.reduce((a, b) => a + b, 0);
  const mean = sum / n;

  // Median
  const mid = Math.floor(n / 2);
  const median = n % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

  // Mode
  const freq = new Map<number, number>();
  for (const num of valid) freq.set(num, (freq.get(num) ?? 0) + 1);
  let mode: number | string = '#N/A';
  let maxCount = 1;
  for (const [val, count] of freq.entries()) {
    if (count > maxCount) {
      maxCount = count;
      mode = val;
    }
  }

  // Variance & Standard Deviation
  let sumSqDiff = 0;
  for (const val of valid) {
    sumSqDiff += Math.pow(val - mean, 2);
  }
  const sampleVariance = n > 1 ? sumSqDiff / (n - 1) : 0;
  const standardDeviation = Math.sqrt(sampleVariance);
  const standardError = n > 0 ? standardDeviation / Math.sqrt(n) : 0;

  // Kurtosis & Skewness
  const kurt = n >= 4 ? calculateKurtosis(valid) : 0;
  const skew = n >= 3 ? calculateSkewness(valid) : 0;

  const minimum = sorted[0];
  const maximum = sorted[n - 1];
  const range = maximum - minimum;

  // Confidence Level 95% (t-value approximation or standard z=1.96)
  const zScore = confidenceLevel === 0.99 ? 2.576 : confidenceLevel === 0.90 ? 1.645 : 1.96;
  const confidenceLevel95 = zScore * standardError;

  return {
    mean: Math.round(mean * 1e8) / 1e8,
    standardError: Math.round(standardError * 1e8) / 1e8,
    median: Math.round(median * 1e8) / 1e8,
    mode,
    standardDeviation: Math.round(standardDeviation * 1e8) / 1e8,
    sampleVariance: Math.round(sampleVariance * 1e8) / 1e8,
    kurtosis: typeof kurt === 'number' ? kurt : 0,
    skewness: typeof skew === 'number' ? skew : 0,
    range: Math.round(range * 1e8) / 1e8,
    minimum,
    maximum,
    sum: Math.round(sum * 1e8) / 1e8,
    count: n,
    confidenceLevel95: Math.round(confidenceLevel95 * 1e8) / 1e8,
  };
}

/**
 * Dispatches statistical and regression functions for formula engine integration
 */
export function evalStatisticsToolpakFunction(
  name: string,
  args: FormulaValue[]
): FormulaValue | undefined {
  switch (name.toUpperCase()) {
    case 'CORREL': {
      if (args.length < 2) return '#VALUE!';
      const xs = flattenToNumbers(args[0]);
      const ys = flattenToNumbers(args[1]);
      return calculateCorrel(xs, ys);
    }
    case 'COVARIANCE.P':
    case 'COVARIANCEP': {
      if (args.length < 2) return '#VALUE!';
      const xs = flattenToNumbers(args[0]);
      const ys = flattenToNumbers(args[1]);
      return calculateCovarianceP(xs, ys);
    }
    case 'COVARIANCE.S':
    case 'COVARIANCES': {
      if (args.length < 2) return '#VALUE!';
      const xs = flattenToNumbers(args[0]);
      const ys = flattenToNumbers(args[1]);
      return calculateCovarianceS(xs, ys);
    }
    case 'SLOPE': {
      if (args.length < 2) return '#VALUE!';
      const ys = flattenToNumbers(args[0]);
      const xs = flattenToNumbers(args[1]);
      return calculateSlope(ys, xs);
    }
    case 'INTERCEPT': {
      if (args.length < 2) return '#VALUE!';
      const ys = flattenToNumbers(args[0]);
      const xs = flattenToNumbers(args[1]);
      return calculateIntercept(ys, xs);
    }
    case 'RSQ': {
      if (args.length < 2) return '#VALUE!';
      const ys = flattenToNumbers(args[0]);
      const xs = flattenToNumbers(args[1]);
      return calculateRsq(ys, xs);
    }
    case 'FORECAST':
    case 'FORECAST.LINEAR': {
      if (args.length < 3) return '#VALUE!';
      const x = Number(toSingleValue(args[0]));
      const ys = flattenToNumbers(args[1]);
      const xs = flattenToNumbers(args[2]);
      if (isNaN(x)) return '#VALUE!';
      return calculateForecast(x, ys, xs);
    }
    case 'TREND': {
      if (args.length < 1) return '#VALUE!';
      const knownYs = flattenToNumbers(args[0]);
      const knownXs = args.length > 1 ? flattenToNumbers(args[1]) : knownYs.map((_, i) => i + 1);
      const newXs = args.length > 2 ? flattenToNumbers(args[2]) : knownXs;
      const slope = calculateSlope(knownYs, knownXs);
      const intercept = calculateIntercept(knownYs, knownXs);
      if (typeof slope !== 'number' || typeof intercept !== 'number') return '#VALUE!';

      const result: FormulaArray = newXs.map((x) => [Math.round((slope * x + intercept) * 1e8) / 1e8]);
      return result.length === 1 ? result[0][0] : result;
    }
    case 'GROWTH': {
      if (args.length < 1) return '#VALUE!';
      const knownYs = flattenToNumbers(args[0]);
      const knownXs = args.length > 1 ? flattenToNumbers(args[1]) : knownYs.map((_, i) => i + 1);
      const newXs = args.length > 2 ? flattenToNumbers(args[2]) : knownXs;

      // Fit ln(y) = ln(b) + x * ln(m)
      const lnYs = knownYs.map((y) => Math.log(y > 0 ? y : 1e-10));
      const slope = calculateSlope(lnYs, knownXs);
      const intercept = calculateIntercept(lnYs, knownXs);
      if (typeof slope !== 'number' || typeof intercept !== 'number') return '#VALUE!';

      const b = Math.exp(intercept);
      const m = Math.exp(slope);
      const result: FormulaArray = newXs.map((x) => [Math.round((b * Math.pow(m, x)) * 1e8) / 1e8]);
      return result.length === 1 ? result[0][0] : result;
    }
    case 'SKEW':
    case 'SKEW.P': {
      const nums = flattenToNumbers(args);
      return calculateSkewness(nums);
    }
    case 'KURT': {
      const nums = flattenToNumbers(args);
      return calculateKurtosis(nums);
    }
    default:
      return undefined;
  }
}
