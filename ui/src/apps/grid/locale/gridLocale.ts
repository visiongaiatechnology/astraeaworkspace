// STATUS: DIAMANT VGT SUPREME — deterministic locale-aware Grid number/date conversion.
import type { GridCell } from '../../../shared/contracts/workspace';

const MAX_LOCALE_LENGTH = 48;

export function normalizeGridLocale(locale?: string): string {
  const candidate = locale?.trim().slice(0, MAX_LOCALE_LENGTH) || 'en-US';
  try { return new Intl.NumberFormat(candidate).resolvedOptions().locale; }
  catch { return 'en-US'; }
}

function numberSeparators(locale: string): { group: string; decimal: string; minus: string } {
  const parts = new Intl.NumberFormat(locale).formatToParts(-12345.6);
  return {
    group: parts.find((part) => part.type === 'group')?.value ?? ',',
    decimal: parts.find((part) => part.type === 'decimal')?.value ?? '.',
    minus: parts.find((part) => part.type === 'minusSign')?.value ?? '-',
  };
}

export function parseGridLocaleNumber(text: string, locale?: string): number | null {
  const normalizedLocale = normalizeGridLocale(locale);
  const { group, decimal, minus } = numberSeparators(normalizedLocale);
  let candidate = text.trim();
  if (!candidate || candidate.length > 256) return null;
  const percent = candidate.endsWith('%');
  if (percent) candidate = candidate.slice(0, -1).trim();
  candidate = candidate
    .split(group).join('')
    .split('\u00a0').join('')
    .split('\u202f').join('')
    .split(decimal).join('.')
    .split(minus).join('-')
    .replace(/[+]/gu, '+');
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/u.test(candidate)) return null;
  const numeric = Number(candidate);
  if (!Number.isFinite(numeric)) return null;
  return percent ? numeric / 100 : numeric;
}

export function parseGridLocaleDate(text: string, locale?: string): string | null {
  const value = text.trim();
  if (!value || value.length > 64) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (iso) {
    const date = new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00Z`);
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
  }
  const normalizedLocale = normalizeGridLocale(locale).toLocaleLowerCase();
  const match = /^(\d{1,4})[./-](\d{1,2})[./-](\d{1,4})$/u.exec(value);
  if (!match) return null;
  let year: number, month: number, day: number;
  const a=Number(match[1]), b=Number(match[2]), c=Number(match[3]);
  if (match[1].length === 4) { year=a; month=b; day=c; }
  else if (normalizedLocale.startsWith('en-us')) { month=a; day=b; year=c; }
  else { day=a; month=b; year=c; }
  if (year < 100) year += year >= 70 ? 1900 : 2000;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

export function formatGridLocaleValue(cell: GridCell | undefined, locale?: string): string {
  if (!cell || cell.value === null || cell.value === undefined) return '';
  const normalizedLocale = normalizeGridLocale(locale);
  if (cell.format === 'date') {
    const date = new Date(String(cell.value).length === 10 ? `${cell.value}T00:00:00Z` : String(cell.value));
    if (!Number.isNaN(date.getTime())) return new Intl.DateTimeFormat(normalizedLocale, { year:'numeric', month:'2-digit', day:'2-digit', timeZone:'UTC' }).format(date);
  }
  if (typeof cell.value === 'number') {
    if (cell.format === 'currency') {
      return new Intl.NumberFormat(normalizedLocale, {
        style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2,
      }).format(cell.value);
    }
    if (cell.format === 'accounting') {
      const value = new Intl.NumberFormat(normalizedLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(cell.value));
      return cell.value < 0 ? `($ ${value})` : `$ ${value} `;
    }
    if (cell.format === 'percent') return new Intl.NumberFormat(normalizedLocale, { style:'percent', maximumFractionDigits:2 }).format(cell.value);
    return new Intl.NumberFormat(normalizedLocale, { maximumFractionDigits: 15 }).format(cell.value);
  }
  return String(cell.value);
}
