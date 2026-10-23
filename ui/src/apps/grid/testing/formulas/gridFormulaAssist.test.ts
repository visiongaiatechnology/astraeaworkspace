// STATUS: PLATIN
// Counter-checks for the visible Grid formula assistant (Pakete 20, 21, 22, 23, 24, 25, 26, 27, 28, 29).
//
// Hand-written oracle. Every assertion names the user-visible behaviour the package asks for:
//   P20 "=SUM(B2:B9) aus Formelleiste eingeben"      -> completion offers SUM and inserts it
//   P21/P22 nested IF / XLOOKUP                      -> catalogue arity and signature are exposed
//   P23 "$A$1 und B2 runterziehen"                   -> reference mode + F4 toggle
//   P24 "WORKDAY und EOMONTH auf Monatsgrenzen"      -> date context states zone and locale
//   P25 "Konflikt mit belegter Spill-Zelle zeigen"   -> blocked spill names the blocking cells
//   P26 "Funktionsparameter und Scope verwalten"     -> LET/LAMBDA bindings are listed
//   P27 "=A1+1 in A1 ... deterministisch Fehler"     -> cycle plan refuses the commit
//   P28 "#REF!, #VALUE!, #DIV/0! ... darstellen"     -> diagnosis + reference arrows
//   P29 "Formel über auswählbare Funktionsbibliothek"-> library groups + wizard call building
import { describe, expect, it } from 'vitest';
import type { GridCell } from '../../../../shared/contracts/workspace';
import {
  applyGridFormulaCompletion,
  buildGridFormulaFromWizard,
  completeGridFormula,
  describeGridFormulaDateContext,
  describeGridFormulaReferenceAt,
  describeGridFormulaScope,
  describeGridFormulaWizardEntry,
  diagnoseGridFormula,
  listGridFormulaLibrary,
  planGridFormulaInsertion,
  toggleGridFormulaReferenceAbsolute,
  translateGridFormulaForFill,
  wrapGridFormulaExpression,
} from '../../formulas/gridFormulaAssist';
import { GRID_FORMULA_ASSISTANT_COPY } from '../../locale/gridFormulaAssistantLocale';

const LOCALES = ['de-DE', 'en-US', 'ru-RU', 'it-IT', 'es-ES', 'ja-JP', 'zh-CN'] as const;

describe('Grid formula assistant: completion from the canonical catalogue (AST-0336)', () => {
  it('offers the catalogue entry for the typed prefix and inserts a call', () => {
    const result = completeGridFormula({ formula: '=SU', caret: 3 });
    expect(result.token).toBe('SU');
    expect(result.items.map((item) => item.name)).toContain('SUM');
    const sum = result.items.find((item) => item.name === 'SUM')!;
    expect(sum.isFunction).toBe(true);
    expect(sum.insertText).toBe('SUM(');
    const applied = applyGridFormulaCompletion(result, sum, '=SU');
    expect(applied.formula).toBe('=SUM(');
    expect(applied.caret).toBe(5);
  });

  it('completes in the middle of an expression, replacing only the token under the caret', () => {
    const formula = '=SUM(B2:B9)+AV';
    const caret = formula.length;
    const result = completeGridFormula({ formula, caret });
    expect(result.token).toBe('AV');
    const average = result.items.find((item) => item.name === 'AVERAGE');
    expect(average).toBeDefined();
    const applied = applyGridFormulaCompletion(result, average!, formula);
    expect(applied.formula).toBe('=SUM(B2:B9)+AVERAGE(');
  });

  it('matches case-insensitively and offers named ranges alongside functions', () => {
    const result = completeGridFormula({ formula: '=um', caret: 3, namedRanges: ['Umsatz2026'] });
    const names = result.items.map((item) => item.name.toUpperCase());
    expect(names.some((name) => name.startsWith('UM'))).toBe(true);
    expect(names).toContain('UMSATZ2026');
  });

  it('is bounded and reports truncation instead of returning the whole catalogue', () => {
    const result = completeGridFormula({ formula: '=S', caret: 2, limit: 3 });
    expect(result.items.length).toBeLessThanOrEqual(3);
    expect(result.truncated).toBe(true);
  });

  it('returns no suggestions for an empty token and never throws on a hostile formula', () => {
    expect(completeGridFormula({ formula: '=', caret: 1 }).items).toEqual([]);
    expect(() => completeGridFormula({ formula: '='.concat('S'.repeat(20_000)), caret: 20_001 })).not.toThrow();
    expect(() => completeGridFormula({ formula: '=SUM(', caret: 999_999 })).not.toThrow();
  });
});

describe('Grid formula assistant: function wizard and arity (AST-0381, AST-0341, AST-0346)', () => {
  it('groups the whole catalogue by the catalogue categories and honours a filter', () => {
    const all = listGridFormulaLibrary();
    expect(all.total).toBeGreaterThan(50);
    expect(all.groups.length).toBeGreaterThan(3);
    const filtered = listGridFormulaLibrary('sum');
    expect(filtered.total).toBeGreaterThan(0);
    expect(filtered.groups.some((group) => group.entries.some((entry) => entry.name.toUpperCase() === 'SUM'))).toBe(true);
    for (const group of filtered.groups) {
      expect(group.entries.every((entry) => entry.name.toUpperCase().includes('SUM'))).toBe(true);
    }
  });

  it('describes a catalogue entry with its parameters and which of them are required', () => {
    const entry = describeGridFormulaWizardEntry('if');
    expect(entry).not.toBeNull();
    expect(entry!.name).toBe('IF');
    expect(entry!.parameters.length).toBeGreaterThanOrEqual(3);
    expect(entry!.signature.toUpperCase()).toContain('IF(');
    expect(entry!.parameters[0]!.required).toBe(true);
    expect(describeGridFormulaWizardEntry('NOT_A_FUNCTION')).toBeNull();
  });

  it('builds a valid call from wizard parameters and refuses an under-specified one', () => {
    const good = buildGridFormulaFromWizard('SUM', ['B2:B9']);
    expect(good.formula).toBe('=SUM(B2:B9)');
    expect(good.error).toBeNull();
    expect(good.missingRequired).toEqual([]);

    const bad = buildGridFormulaFromWizard('SUM', []);
    expect(bad.error).toBe('#VALUE!');
    expect(bad.violation).not.toBeNull();

    const nested = buildGridFormulaFromWizard('IF', ['B2>0', 'SUM(B2:B9)', 'AVERAGE(B2:B9)']);
    expect(nested.formula).toBe('=IF(B2>0, SUM(B2:B9), AVERAGE(B2:B9))');
    expect(nested.error).toBeNull();
  });

  it('reports the missing required parameter by name', () => {
    const bad = buildGridFormulaFromWizard('XLOOKUP', ['A2']);
    expect(bad.error).not.toBeNull();
    expect(bad.missingRequired.length).toBeGreaterThan(0);
  });

  it('wraps a raw expression exactly once', () => {
    expect(wrapGridFormulaExpression('SUM(A1:A2)')).toBe('=SUM(A1:A2)');
    expect(wrapGridFormulaExpression('=SUM(A1:A2)')).toBe('=SUM(A1:A2)');
    expect(wrapGridFormulaExpression('   ')).toBe('');
  });

  it('rejects an unknown function through the catalogue, not through a second list', () => {
    const unknown = buildGridFormulaFromWizard('SUMMEWENN', ['A1:A2']);
    expect(unknown.error).toBe('#NAME?');
  });
});

describe('Grid formula assistant: live diagnosis and reference arrows (AST-0376)', () => {
  it('reports nothing for a valid formula and names the error for an invalid one', () => {
    const clean = diagnoseGridFormula({ formula: '=SUM(B2:B9)' });
    expect(clean.diagnostics).toEqual([]);
    expect(clean.severity).toBeNull();
    expect(clean.summary).toBe('');

    const unknown = diagnoseGridFormula({ formula: '=SUMME(B2:B9)' });
    expect(unknown.severity).toBe('error');
    expect(unknown.errorCode).toBe('#NAME?');
    expect(unknown.errorDocumentation?.title).toBeTruthy();
    expect(unknown.summary).toContain('SUMME');
    expect(unknown.summary.length).toBeGreaterThan(0);
  });

  it('reports an unbalanced parenthesis and an arity violation', () => {
    expect(diagnoseGridFormula({ formula: '=SUM(B2:B9' }).severity).toBe('error');
    const arity = diagnoseGridFormula({ formula: '=SUM()' });
    expect(arity.severity).toBe('error');
    expect(arity.diagnostics.some((finding) => finding.code === '#VALUE!')).toBe(true);
  });

  it('builds reference arrows for a cell with a formula and for its dependents', () => {
    const cells: Record<string, GridCell> = {
      A1: { value: 1 },
      B1: { value: 1 },
      C1: { value: 2, formula: '=A1+B1' },
    };
    const diagnosis = diagnoseGridFormula({ formula: '=A1+B1', coord: 'C1', cells });
    expect(diagnosis.referenceArrows).not.toBeNull();
    // A precedent arrow runs from the referenced cell into the formula cell.
    expect(diagnosis.referenceArrows!.arrows.filter((arrow) => arrow.kind === 'precedent').map((arrow) => arrow.from)).toEqual(['A1', 'B1']);
    const dependents = diagnoseGridFormula({ formula: '1', coord: 'A1', cells });
    // A dependent arrow runs from the cell into the cell that uses it.
    expect(dependents.referenceArrows!.arrows.some((arrow) => arrow.kind === 'dependent' && arrow.to === 'C1')).toBe(true);
  });

  it('never throws for a hostile or oversized formula', () => {
    expect(() => diagnoseGridFormula({ formula: `=${'A1+'.repeat(10_000)}A1` })).not.toThrow();
    expect(() => diagnoseGridFormula({ formula: '="unterminated' })).not.toThrow();
    expect(() => diagnoseGridFormula({ formula: '' })).not.toThrow();
  });
});

describe('Grid formula assistant: relative and absolute references (AST-0351)', () => {
  it('reports the mode of the reference under the caret', () => {
    expect(describeGridFormulaReferenceAt('=A1+B2', 1)?.mode).toBe('relative');
    expect(describeGridFormulaReferenceAt('=$A$1+B2', 3)?.mode).toBe('absolute');
    expect(describeGridFormulaReferenceAt('=$A1+B2', 3)?.mode).toBe('mixed');
    expect(describeGridFormulaReferenceAt('=A$1+B2', 3)?.mode).toBe('mixed');
    expect(describeGridFormulaReferenceAt('=SUM(', 5)).toBeNull();
  });

  it('toggles relative -> absolute -> relative under the caret', () => {
    const first = toggleGridFormulaReferenceAbsolute('=A1+B2', 1);
    expect(first?.formula).toBe('=$A$1+B2');
    const second = toggleGridFormulaReferenceAbsolute(first!.formula, 3);
    expect(second?.formula).toBe('=A1+B2');
    expect(toggleGridFormulaReferenceAbsolute('=SUM(', 5)).toBeNull();
  });

  it('translates only the relative parts when a formula is filled down', () => {
    const filled = translateGridFormulaForFill('=$A$1+B2', 1, 0);
    expect(filled.formula).toBe('=$A$1+B3');
    expect(filled.changed).toBe(true);
    const sideways = translateGridFormulaForFill('=$A$1+B2', 0, 1);
    expect(sideways.formula).toBe('=$A$1+C2');
    expect(translateGridFormulaForFill('SUM(A1)', 1, 1).changed).toBe(false);
  });
});

describe('Grid formula assistant: dynamic arrays, cycles and scopes (AST-0361, AST-0371, AST-0366)', () => {
  it('reports a free spill with its footprint and a blocked spill with the blocking cells', () => {
    const free = planGridFormulaInsertion({ coord: 'A1', formula: '=UNIQUE(A2:A3)', cells: {}, result: [[1], [2]] });
    expect(free.spill?.kind).toBe('spill');
    expect(free.blocked).toBe(false);
    expect(free.spill?.footprint).toEqual(['A1', 'A2']);

    const blocked = planGridFormulaInsertion({ coord: 'A1', formula: '=UNIQUE(A2:A3)', cells: { A2: { value: 'belegt' } }, result: [[1], [2]] });
    expect(blocked.spill?.kind).toBe('blocked');
    expect(blocked.spill?.blockedBy).toEqual(['A2']);
    expect(blocked.blocked).toBe(true);
    expect(blocked.canCommit).toBe(false);
  });

  it('refuses a self reference deterministically instead of looping', () => {
    const self = planGridFormulaInsertion({ coord: 'A1', formula: '=A1+1', cells: {} });
    expect(self.cyclePaths.length).toBeGreaterThan(0);
    expect(self.canCommit).toBe(false);
    expect(self.cycles?.cyclic).toContain('A1');
  });

  it('accepts a formula that introduces no cycle and no blocked spill', () => {
    const ok = planGridFormulaInsertion({ coord: 'C1', formula: '=A1+B1', cells: { A1: { value: 1 }, B1: { value: 2 } } });
    expect(ok.cyclePaths).toEqual([]);
    expect(ok.blocked).toBe(false);
    expect(ok.canCommit).toBe(true);
  });

  it('lists LAMBDA parameters and reports LET as not locally resolvable instead of as empty', () => {
    expect(describeGridFormulaScope('=SUM(A1:A2)')).toEqual({ lambda: false, boundNames: [], locallyResolvable: true });
    const lambda = describeGridFormulaScope('=LAMBDA(a, b, a+b)');
    expect(lambda.lambda).toBe(true);
    expect(lambda.boundNames.map((name) => name.toUpperCase())).toEqual(['A', 'B']);
    expect(lambda.locallyResolvable).toBe(true);
    // LET is evaluated by the formula core; there is no local LET parser to reuse.
    const let_ = describeGridFormulaScope('=LET(x, 1, y, 2, x+y)');
    expect(let_.lambda).toBe(true);
    expect(let_.locallyResolvable).toBe(false);
    expect(let_.boundNames).toEqual([]);
  });
});

describe('Grid formula assistant: date context with time zone (AST-0356)', () => {
  it('states an explicit zone with its ISO offset and falls back to the named host zone', () => {
    const explicit = describeGridFormulaDateContext('Europe/Berlin', 'de-DE', Date.UTC(2026, 6, 1, 12));
    expect(explicit.context?.timeZone).toBe('Europe/Berlin');
    expect(explicit.context?.source).toBe('explicit');
    expect(explicit.offsetLabel).toMatch(/^[+-]\d{2}:\d{2}$/u);

    const host = describeGridFormulaDateContext('', 'de-DE', Date.UTC(2026, 6, 1, 12));
    expect(host.context?.timeZone).toBeNull();
    expect(host.context?.source).toBe('host');
    expect(host.offsetLabel).toMatch(/^[+-]\d{2}:\d{2}$/u);
  });

  it('refuses an unusable point in time instead of silently using the host zone', () => {
    expect(describeGridFormulaDateContext('Europe/Berlin', 'de-DE', Number.NaN).context).toBeNull();
    expect(describeGridFormulaDateContext('Europe/Berlin', 'de-DE', 0).context).toBeNull();
  });
});

describe('Grid formula assistant: copy exists for every workspace locale', () => {
  it('provides all seven locales with a usable close label and no empty string', () => {
    for (const locale of LOCALES) {
      const copy = GRID_FORMULA_ASSISTANT_COPY[locale];
      expect(copy).toBeDefined();
      expect(copy.open.length).toBeGreaterThan(0);
      expect(copy.close.length).toBeGreaterThan(0);
      expect(copy.diagnosisCount(2)).toContain('2');
      expect(copy.spillBlocked('A2')).toContain('A2');
      expect(copy.cycleFound('A1 → A2')).toContain('A1');
      expect(copy.scopeBindings('X, Y')).toContain('X, Y');
      expect(copy.argumentPlaceholder('Number').length).toBeGreaterThan(0);
    }
  });
});
