// STATUS: DIAMANT VGT SUPREME
// Astraea Grid authoritative Financial formula domain
// Excel/Calc parity across PV, FV, NPV, PMT, RATE, NPER, IRR, PPMT, IPMT, SLN

import { FormulaValue, toSingleValue } from './gridFormulaTypes';
import { flattenToNumbers } from './gridFormulaMath';

export function evalFinanceFunction(
  name: string,
  args: FormulaValue[]
): FormulaValue | undefined {
  switch (name) {
    case 'PMT': {
      if (args.length < 3) return '#VALUE!';
      const r = Number(toSingleValue(args[0]) ?? 0);
      const nper = Number(toSingleValue(args[1]) ?? 1);
      const pv = Number(toSingleValue(args[2]) ?? 0);
      const fv = args.length > 3 ? Number(toSingleValue(args[3]) ?? 0) : 0;
      const type = args.length > 4 ? (Number(toSingleValue(args[4])) !== 0 ? 1 : 0) : 0;

      if (isNaN(r) || isNaN(nper) || isNaN(pv) || isNaN(fv)) return '#VALUE!';
      if (nper === 0) return '#DIV/0!';
      if (r === 0) return -(pv + fv) / nper;

      const p = Math.pow(1 + r, nper);
      return -(r * (pv * p + fv)) / ((1 + r * type) * (p - 1));
    }

    case 'PPMT': {
      if (args.length < 4) return '#VALUE!';
      const r = Number(toSingleValue(args[0]) ?? 0);
      const per = Number(toSingleValue(args[1]) ?? 1);
      const nper = Number(toSingleValue(args[2]) ?? 1);
      const pv = Number(toSingleValue(args[3]) ?? 0);
      const fv = args.length > 4 ? Number(toSingleValue(args[4]) ?? 0) : 0;
      const type = args.length > 5 ? (Number(toSingleValue(args[5])) !== 0 ? 1 : 0) : 0;

      if (per < 1 || per > nper) return '#NUM!';
      const pmtVal = evalFinanceFunction('PMT', [r, nper, pv, fv, type]);
      const pmt = Number(pmtVal ?? 0);
      const ipmtVal = evalFinanceFunction('IPMT', [r, per, nper, pv, fv, type]);
      const ipmt = Number(ipmtVal ?? 0);
      return pmt - ipmt;
    }

    case 'IPMT': {
      if (args.length < 4) return '#VALUE!';
      const r = Number(toSingleValue(args[0]) ?? 0);
      const per = Number(toSingleValue(args[1]) ?? 1);
      const nper = Number(toSingleValue(args[2]) ?? 1);
      const pv = Number(toSingleValue(args[3]) ?? 0);
      const fv = args.length > 4 ? Number(toSingleValue(args[4]) ?? 0) : 0;
      const type = args.length > 5 ? (Number(toSingleValue(args[5])) !== 0 ? 1 : 0) : 0;

      if (per < 1 || per > nper) return '#NUM!';
      const pmt = Number(evalFinanceFunction('PMT', [r, nper, pv, fv, type]) ?? 0);
      const fvVal = Number(evalFinanceFunction('FV', [r, per - 1, pmt, pv, type]) ?? 0);
      return -fvVal * r;
    }

    case 'FV': {
      if (args.length < 3) return '#VALUE!';
      const r = Number(toSingleValue(args[0]) ?? 0);
      const nper = Number(toSingleValue(args[1]) ?? 1);
      const pmt = Number(toSingleValue(args[2]) ?? 0);
      const pv = args.length > 3 ? Number(toSingleValue(args[3]) ?? 0) : 0;
      const type = args.length > 4 ? (Number(toSingleValue(args[4])) !== 0 ? 1 : 0) : 0;

      if (isNaN(r) || isNaN(nper) || isNaN(pmt) || isNaN(pv)) return '#VALUE!';
      if (r === 0) return -(pv + pmt * nper);

      const p = Math.pow(1 + r, nper);
      return -(pv * p + (pmt * (1 + r * type) * (p - 1)) / r);
    }

    case 'PV': {
      if (args.length < 3) return '#VALUE!';
      const r = Number(toSingleValue(args[0]) ?? 0);
      const nper = Number(toSingleValue(args[1]) ?? 1);
      const pmt = Number(toSingleValue(args[2]) ?? 0);
      const fv = args.length > 3 ? Number(toSingleValue(args[3]) ?? 0) : 0;
      const type = args.length > 4 ? (Number(toSingleValue(args[4])) !== 0 ? 1 : 0) : 0;

      if (isNaN(r) || isNaN(nper) || isNaN(pmt) || isNaN(fv)) return '#VALUE!';
      if (r === 0) return -(fv + pmt * nper);

      const p = Math.pow(1 + r, nper);
      return -(fv + (pmt * (1 + r * type) * (p - 1)) / r) / p;
    }

    case 'NPV': {
      if (args.length < 2) return '#VALUE!';
      const r = Number(toSingleValue(args[0]) ?? 0);
      if (isNaN(r) || r <= -1) return '#VALUE!';
      const values = flattenToNumbers(args.slice(1));
      let npv = 0;
      for (let i = 0; i < values.length; i++) {
        npv += values[i] / Math.pow(1 + r, i + 1);
      }
      return npv;
    }

    case 'XNPV': {
      if (args.length < 3) return '#VALUE!';
      const rate = Number(toSingleValue(args[0]));
      const values = flattenToNumbers([args[1]]);
      const dateValues = Array.isArray(args[2]) ? (args[2] as any[]).flat() : [toSingleValue(args[2])];
      if (!Number.isFinite(rate) || rate <= -1 || values.length !== dateValues.length || values.length === 0) return '#NUM!';
      const dates = dateValues.map((value) => new Date(String(value)).getTime());
      if (dates.some((value) => !Number.isFinite(value))) return '#VALUE!';
      const base = dates[0];
      let result = 0;
      for (let i = 0; i < values.length; i++) result += values[i] / Math.pow(1 + rate, (dates[i] - base) / 86_400_000 / 365);
      return result;
    }

    case 'XIRR': {
      if (args.length < 2) return '#VALUE!';
      const values = flattenToNumbers([args[0]]);
      const dateValues = Array.isArray(args[1]) ? (args[1] as any[]).flat() : [toSingleValue(args[1])];
      if (values.length !== dateValues.length || values.length < 2 || !values.some(v=>v>0) || !values.some(v=>v<0)) return '#NUM!';
      const dates = dateValues.map((value) => new Date(String(value)).getTime());
      if (dates.some((value) => !Number.isFinite(value))) return '#VALUE!';
      const base = dates[0];
      const years = dates.map(date => (date - base) / 86_400_000 / 365);
      let rate = args.length > 2 ? Number(toSingleValue(args[2]) ?? 0.1) : 0.1;
      if (!Number.isFinite(rate)) rate = 0.1;
      for (let iter = 0; iter < 100; iter++) {
        if (rate <= -0.999999) rate = -0.999999;
        let f = 0, df = 0;
        for (let i = 0; i < values.length; i++) {
          const p = Math.pow(1 + rate, years[i]);
          f += values[i] / p;
          df -= years[i] * values[i] / (p * (1 + rate));
        }
        if (!Number.isFinite(df) || Math.abs(df) < 1e-14) return '#NUM!';
        const next = rate - f / df;
        if (!Number.isFinite(next)) return '#NUM!';
        if (Math.abs(next - rate) < 1e-8) return next;
        rate = next;
      }
      return '#NUM!';
    }

    case 'IRR': {
      if (args.length < 1) return '#VALUE!';
      let values: number[];
      let guess = 0.1;

      if (args.length === 2 && Array.isArray(args[0])) {
        values = flattenToNumbers([args[0]]);
        const g = Number(toSingleValue(args[1]));
        if (!isNaN(g)) guess = g;
      } else if (args.length === 1 && Array.isArray(args[0])) {
        values = flattenToNumbers([args[0]]);
      } else {
        values = flattenToNumbers(args);
      }

      if (values.length < 2) return '#NUM!';
      const hasPos = values.some(v => v > 0);
      const hasNeg = values.some(v => v < 0);
      if (!hasPos || !hasNeg) return '#NUM!';

      let rate = guess;
      for (let iter = 0; iter < 100; iter++) {
        if (rate <= -0.999) rate = -0.999;
        let npv = 0;
        let dnpv = 0;
        for (let i = 0; i < values.length; i++) {
          const denom = Math.pow(1 + rate, i);
          npv += values[i] / denom;
          dnpv -= (i * values[i]) / (denom * (1 + rate));
        }
        if (dnpv === 0) return '#NUM!';
        const newRate = rate - npv / dnpv;
        if (Math.abs(newRate - rate) < 1e-7) return newRate;
        rate = newRate;
      }
      return isFinite(rate) ? rate : '#NUM!';
    }

    case 'RATE': {
      if (args.length < 3) return '#VALUE!';
      const nper = Number(toSingleValue(args[0]) ?? 1);
      const pmt = Number(toSingleValue(args[1]) ?? 0);
      const pv = Number(toSingleValue(args[2]) ?? 0);
      const fv = args.length > 3 ? Number(toSingleValue(args[3]) ?? 0) : 0;
      const type = args.length > 4 ? (Number(toSingleValue(args[4])) !== 0 ? 1 : 0) : 0;
      const guess = args.length > 5 ? Number(toSingleValue(args[5]) ?? 0.1) : 0.1;

      if (nper <= 0) return '#NUM!';
      let r = guess;
      for (let i = 0; i < 100; i++) {
        const p = Math.pow(1 + r, nper);
        const y = pv * p + (pmt * (1 + r * type) * (p - 1)) / (r === 0 ? 1 : r) + fv;
        // numerical derivative approximation
        const dr = 1e-5;
        const p2 = Math.pow(1 + r + dr, nper);
        const y2 = pv * p2 + (pmt * (1 + (r + dr) * type) * (p2 - 1)) / (r + dr) + fv;
        const dy = (y2 - y) / dr;
        if (dy === 0) return '#NUM!';
        const nextR = r - y / dy;
        if (Math.abs(nextR - r) < 1e-7) return nextR;
        r = nextR;
      }
      return isFinite(r) ? r : '#NUM!';
    }

    case 'NPER': {
      if (args.length < 3) return '#VALUE!';
      const r = Number(toSingleValue(args[0]) ?? 0);
      const pmt = Number(toSingleValue(args[1]) ?? 0);
      const pv = Number(toSingleValue(args[2]) ?? 0);
      const fv = args.length > 3 ? Number(toSingleValue(args[3]) ?? 0) : 0;
      const type = args.length > 4 ? (Number(toSingleValue(args[4])) !== 0 ? 1 : 0) : 0;

      if (r === 0) {
        if (pmt === 0) return '#DIV/0!';
        return -(pv + fv) / pmt;
      }

      const num = -fv * r + pmt * (1 + r * type);
      const den = pv * r + pmt * (1 + r * type);
      if (den === 0 || num / den <= 0) return '#NUM!';
      return Math.log(num / den) / Math.log(1 + r);
    }

    case 'SLN': {
      if (args.length < 3) return '#VALUE!';
      const cost = Number(toSingleValue(args[0]) ?? 0);
      const salvage = Number(toSingleValue(args[1]) ?? 0);
      const life = Number(toSingleValue(args[2]) ?? 1);
      if (life <= 0) return '#NUM!';
      return (cost - salvage) / life;
    }

    default:
      return undefined;
  }
}
