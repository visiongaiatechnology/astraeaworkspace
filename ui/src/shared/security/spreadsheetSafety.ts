// STATUS: DIAMANT VGT SUPREME — spreadsheet formula-injection export boundary.

const DANGEROUS_SPREADSHEET_PREFIX = /^[=+\-@\t\r]/u;

export function neutralizeSpreadsheetFormulaInjection(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return DANGEROUS_SPREADSHEET_PREFIX.test(text) ? `'${text}` : text;
}

export function isSpreadsheetFormulaInjectionCandidate(value: unknown): boolean {
  return DANGEROUS_SPREADSHEET_PREFIX.test(value === null || value === undefined ? '' : String(value));
}
