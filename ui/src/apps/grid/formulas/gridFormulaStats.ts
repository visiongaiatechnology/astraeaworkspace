// STATUS: DIAMANT VGT SUPREME
// Astraea Grid authoritative Statistical formula domain
// Excel/Calc parity for AVERAGEIFS, COUNTIFS, COUNTBLANK, LARGE, SMALL, STDEV, VAR, MEDIAN, MODE

import { FormulaValue, SingleFormulaValue, toSingleValue } from './gridFormulaTypes';
import { flattenToNumbers, flattenToScalars, matchesCriteria } from './gridFormulaMath';

export function evalStatsFunction(
  name: string,
  args: FormulaValue[],
  flatNumbers: number[],
  rawArgsCount: number
): FormulaValue | undefined {
  switch (name) {
    case 'AVERAGE': {
      const nums = flatNumbers.length ? flatNumbers : flattenToNumbers(args);
      return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : '#DIV/0!';
    }

    case 'AVERAGEIF': {
      if (args.length < 2) return '#VALUE!';
      const range = flattenToScalars(args[0]);
      const criteria = toSingleValue(args[1]);
      const avgRange = args.length >= 3 ? flattenToScalars(args[2]) : range;
      let total = 0;
      let count = 0;
      for (let i = 0; i < range.length; i++) {
        if (matchesCriteria(range[i], criteria)) {
          const num = Number(avgRange[i] ?? 0);
          if (!isNaN(num) && avgRange[i] !== null && avgRange[i] !== '') {
            total += num;
            count++;
          }
        }
      }
      return count > 0 ? total / count : '#DIV/0!';
    }

    case 'AVERAGEIFS': {
      if (args.length < 3 || (args.length - 1) % 2 !== 0) return '#VALUE!';
      const avgRange = flattenToScalars(args[0]);
      const criteriaRanges: SingleFormulaValue[][] = [];
      const criteriaValues: SingleFormulaValue[] = [];
      for (let i = 1; i < args.length; i += 2) {
        criteriaRanges.push(flattenToScalars(args[i]));
        criteriaValues.push(toSingleValue(args[i + 1]));
      }
      let total = 0;
      let count = 0;
      for (let i = 0; i < avgRange.length; i++) {
        let allMatch = true;
        for (let c = 0; c < criteriaRanges.length; c++) {
          if (!matchesCriteria(criteriaRanges[c][i], criteriaValues[c])) {
            allMatch = false;
            break;
          }
        }
        if (allMatch) {
          const num = Number(avgRange[i] ?? 0);
          if (!isNaN(num) && avgRange[i] !== null && avgRange[i] !== '') {
            total += num;
            count++;
          }
        }
      }
      return count > 0 ? total / count : '#DIV/0!';
    }

    case 'MIN': {
      const nums = flatNumbers.length ? flatNumbers : flattenToNumbers(args);
      return nums.length ? Math.min(...nums) : 0;
    }

    case 'MAX': {
      const nums = flatNumbers.length ? flatNumbers : flattenToNumbers(args);
      return nums.length ? Math.max(...nums) : 0;
    }

    case 'COUNT': {
      return flatNumbers.length ? flatNumbers.length : flattenToNumbers(args).length;
    }

    case 'COUNTA': {
      const scalars = flattenToScalars(args);
      return scalars.filter(v => v !== null && v !== undefined && v !== '').length;
    }

    case 'COUNTBLANK': {
      const scalars = flattenToScalars(args);
      return scalars.filter(v => v === null || v === undefined || v === '').length;
    }

    case 'COUNTIF': {
      if (args.length < 2) return '#VALUE!';
      const range = flattenToScalars(args[0]);
      const criteria = toSingleValue(args[1]);
      return range.filter(v => matchesCriteria(v, criteria)).length;
    }

    case 'COUNTIFS': {
      if (args.length < 2 || args.length % 2 !== 0) return '#VALUE!';
      const criteriaRanges: SingleFormulaValue[][] = [];
      const criteriaValues: SingleFormulaValue[] = [];
      for (let i = 0; i < args.length; i += 2) {
        criteriaRanges.push(flattenToScalars(args[i]));
        criteriaValues.push(toSingleValue(args[i + 1]));
      }
      let count = 0;
      for (let i = 0; i < criteriaRanges[0].length; i++) {
        let allMatch = true;
        for (let c = 0; c < criteriaRanges.length; c++) {
          if (!matchesCriteria(criteriaRanges[c][i], criteriaValues[c])) {
            allMatch = false;
            break;
          }
        }
        if (allMatch) count++;
      }
      return count;
    }

    case 'MEDIAN': {
      const nums = (flatNumbers.length ? flatNumbers : flattenToNumbers(args)).sort((a, b) => a - b);
      if (!nums.length) return '#NUM!';
      const mid = Math.floor(nums.length / 2);
      return nums.length % 2 !== 0 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
    }

    case 'MODE':
    case 'MODE.SNGL': {
      const nums = flatNumbers.length ? flatNumbers : flattenToNumbers(args);
      if (!nums.length) return '#NUM!';
      const freq = new Map<number, number>();
      nums.forEach(n => freq.set(n, (freq.get(n) ?? 0) + 1));
      let top = nums[0];
      let maxFreq = 0;
      freq.forEach((f, k) => {
        if (f > maxFreq) {
          maxFreq = f;
          top = k;
        }
      });
      return maxFreq > 1 ? top : '#N/A';
    }

    case 'STDEV':
    case 'STDEV.S': {
      const nums = flatNumbers.length ? flatNumbers : flattenToNumbers(args);
      if (nums.length <= 1) return '#DIV/0!';
      const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
      const variance = nums.reduce((acc, v) => acc + Math.pow(v - avg, 2), 0) / (nums.length - 1);
      return Math.sqrt(variance);
    }

    case 'STDEVP':
    case 'STDEV.P': {
      const nums = flatNumbers.length ? flatNumbers : flattenToNumbers(args);
      if (nums.length === 0) return '#DIV/0!';
      const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
      const variance = nums.reduce((acc, v) => acc + Math.pow(v - avg, 2), 0) / nums.length;
      return Math.sqrt(variance);
    }

    case 'VAR':
    case 'VAR.S': {
      const nums = flatNumbers.length ? flatNumbers : flattenToNumbers(args);
      if (nums.length <= 1) return '#DIV/0!';
      const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
      return nums.reduce((acc, v) => acc + Math.pow(v - avg, 2), 0) / (nums.length - 1);
    }

    case 'VARP':
    case 'VAR.P': {
      const nums = flatNumbers.length ? flatNumbers : flattenToNumbers(args);
      if (nums.length === 0) return '#DIV/0!';
      const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
      return nums.reduce((acc, v) => acc + Math.pow(v - avg, 2), 0) / nums.length;
    }

    case 'LARGE': {
      if (args.length < 2) return '#NUM!';
      const k = Math.floor(Number(toSingleValue(args[args.length - 1]) ?? 1));
      const rangeArgs = args.slice(0, -1);
      const nums = flattenToNumbers(rangeArgs).sort((a, b) => b - a);
      if (k < 1 || k > nums.length) return '#NUM!';
      return nums[k - 1];
    }

    case 'SMALL': {
      if (args.length < 2) return '#NUM!';
      const k = Math.floor(Number(toSingleValue(args[args.length - 1]) ?? 1));
      const rangeArgs = args.slice(0, -1);
      const nums = flattenToNumbers(rangeArgs).sort((a, b) => a - b);
      if (k < 1 || k > nums.length) return '#NUM!';
      return nums[k - 1];
    }

    case 'RANK': {
      const target = Number(toSingleValue(args[0]) ?? 0);
      const isAsc = Boolean(args[2]);
      const rangeArgs = args.length > 1 ? args[1] : [];
      const nums = isAsc
        ? flattenToNumbers(rangeArgs).sort((a, b) => a - b)
        : flattenToNumbers(rangeArgs).sort((a, b) => b - a);
      const idx = nums.findIndex(n => n === target);
      return idx >= 0 ? idx + 1 : '#N/A';
    }

    case 'PERCENTILE':
    case 'PERCENTILE.INC': {
      const k = Number(toSingleValue(args[args.length - 1]) ?? 0);
      if (isNaN(k) || k < 0 || k > 1) return '#NUM!';
      const nums = flattenToNumbers(args.slice(0, -1)).sort((a, b) => a - b);
      if (!nums.length) return '#NUM!';
      const index = k * (nums.length - 1);
      const lower = Math.floor(index);
      const fraction = index - lower;
      if (lower >= nums.length - 1) return nums[nums.length - 1];
      return nums[lower] + fraction * (nums[lower + 1] - nums[lower]);
    }

    case 'QUARTILE':
    case 'QUARTILE.INC': {
      const q = Math.floor(Number(toSingleValue(args[args.length - 1]) ?? 0));
      if (q < 0 || q > 4) return '#NUM!';
      const rangeArgs = args.slice(0, -1);
      return evalStatsFunction('PERCENTILE.INC', [...rangeArgs, q * 0.25], flatNumbers, rawArgsCount);
    }

    default:
      return undefined;
  }
}
