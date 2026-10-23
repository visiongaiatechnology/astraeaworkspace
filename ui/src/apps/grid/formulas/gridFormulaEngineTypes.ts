// STATUS: DIAMANT VGT SUPREME
import type { FormulaValue } from './gridFormulaTypes';
import type { GridFormulaLimits } from './gridFormulaLimits';
import type { GridFormulaTimeZoneRule } from './gridFormulaSerialDate';

export interface FormulaEngineOptions {
  enableIterativeCalculation?: boolean;
  maxIterations?: number;
  maxChange?: number;
  namedFormulas?: Record<string, string>;
  workspaceReferenceResolver?: (uri: string, reference: string) => FormulaValue;
  volatilePolicy?: 'runtime' | 'disabled';
  now?: Date;
  random?: () => number;
  maxReferenceCells?: number;
  circularReferencePolicy?: 'error' | 'use-current-value';
  currentCellCoord?: string;
  structuredReferenceResolver?: (reference: string, currentCoord?: string) => string | null;
  /**
   * Resource budget overrides. Values are clamped by `createGridFormulaBudget`, so a
   * caller cannot raise the ceiling beyond the canonical multiples.
   */
  limits?: Partial<GridFormulaLimits>;
  /**
   * Timezone rule for `TODAY`/`NOW` and serial conversion. Omitted means UTC, which
   * keeps every date function independent of the host timezone.
   */
  timeZoneRule?: GridFormulaTimeZoneRule;
}

export interface ParsedSheetRef {
  startSheet: string;
  endSheet?: string;
  cellOrRange: string;
}
