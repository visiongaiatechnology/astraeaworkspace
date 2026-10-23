import { formulaContainsExternalWorkbookSyntax, scanFormulaReferences } from './formulaReferenceContract';
// STATUS: DIAMANT VGT SUPREME
// Canonical Formula Core contract. The Rust vgt-formula engine is authoritative;
// UI code only translates locale-facing syntax into this canonical representation.

export const FORMULA_ENGINE_CONTRACT = 'VGT-FORMULA-CORE-1' as const;
export const FORMULA_MAX_LENGTH = 16 * 1024;
export const FORMULA_MAX_CELLS = 50_000;
export const FORMULA_MAX_LOCALE_LENGTH = 16 * 1024;

export type FormulaVolatilePolicy = 'disabled' | 'runtime';
export type FormulaExternalReferencePolicy = 'deny' | 'workspace-capability';

export interface FormulaLocaleProfile {
  decimalSeparator: '.' | ',';
  argumentSeparator: ',' | ';';
}

export interface CanonicalFormulaRequest {
  formula: string;
  volatilePolicy: FormulaVolatilePolicy;
  externalReferencePolicy: FormulaExternalReferencePolicy;
}

const DEFAULT_LOCALE_PROFILE: FormulaLocaleProfile = {
  decimalSeparator: '.',
  argumentSeparator: ',',
};

function translateOutsideQuotedStrings(input: string, profile: FormulaLocaleProfile): string {
  let output = '';
  let inString = false;
  for (let index = 0; index < input.length; index++) {
    const char = input[index];
    if (char === '"') {
      if (inString && input[index + 1] === '"') {
        output += '""';
        index++;
        continue;
      }
      inString = !inString;
      output += char;
      continue;
    }
    if (!inString && profile.argumentSeparator === ';' && char === ';') {
      output += ',';
      continue;
    }
    if (!inString && profile.decimalSeparator === ',' && char === ',') {
      const previous = input[index - 1] ?? '';
      const next = input[index + 1] ?? '';
      if (/\d/.test(previous) && /\d/.test(next)) {
        output += '.';
        continue;
      }
    }
    output += char;
  }
  if (inString) throw new Error('formula_unterminated_string');
  return output;
}

export function canonicalizeFormulaForCore(
  formula: string,
  localeProfile: FormulaLocaleProfile = DEFAULT_LOCALE_PROFILE,
): string {
  const trimmed = formula.trim();
  if (!trimmed || trimmed.length > FORMULA_MAX_LOCALE_LENGTH) throw new Error('formula_length_limit');
  if (!trimmed.startsWith('=')) return trimmed;
  return translateOutsideQuotedStrings(trimmed, localeProfile);
}

export function localizeFormulaFromCore(
  formula: string,
  localeProfile: FormulaLocaleProfile = DEFAULT_LOCALE_PROFILE,
): string {
  if (localeProfile.decimalSeparator === '.' && localeProfile.argumentSeparator === ',') return formula;
  let output = '';
  let inString = false;
  for (let index = 0; index < formula.length; index++) {
    const char = formula[index];
    if (char === '"') {
      if (inString && formula[index + 1] === '"') {
        output += '""';
        index++;
        continue;
      }
      inString = !inString;
      output += char;
      continue;
    }
    if (!inString && localeProfile.argumentSeparator === ';' && char === ',') {
      output += ';';
      continue;
    }
    if (!inString && localeProfile.decimalSeparator === ',' && char === '.') {
      const previous = formula[index - 1] ?? '';
      const next = formula[index + 1] ?? '';
      if (/\d/.test(previous) && /\d/.test(next)) {
        output += ',';
        continue;
      }
    }
    output += char;
  }
  return output;
}

const VOLATILE_FUNCTION_PATTERN = /\b(?:NOW|TODAY|RAND|RANDBETWEEN|RANDARRAY)\s*\(/i;

export function containsVolatileFormulaFunction(formula: string): boolean {
  return VOLATILE_FUNCTION_PATTERN.test(formula);
}

export function buildCanonicalFormulaRequest(
  formula: string,
  volatilePolicy: FormulaVolatilePolicy = 'disabled',
  localeProfile?: FormulaLocaleProfile,
  externalReferencePolicy: FormulaExternalReferencePolicy = 'deny',
): CanonicalFormulaRequest {
  const canonical = canonicalizeFormulaForCore(formula, localeProfile);
  scanFormulaReferences(canonical);
  if (volatilePolicy === 'disabled' && containsVolatileFormulaFunction(canonical)) {
    throw new Error('formula_volatile_disabled');
  }
  if (externalReferencePolicy !== 'workspace-capability' && formulaContainsExternalWorkbookSyntax(canonical)) {
    throw new Error('formula_external_reference_capability_required');
  }
  return { formula: canonical, volatilePolicy, externalReferencePolicy };
}
