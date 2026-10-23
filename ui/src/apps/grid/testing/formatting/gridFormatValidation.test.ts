// Astraea Grid — Paket 17: user-entered style values (colour, border) and the rendered
// border sides. Everything here is fail-closed: an unusable value never reaches the cell.

import { describe, expect, it } from 'vitest';
import {
  GRID_FORMAT_MAX_RANGE_LENGTH,
  checkGridBorder,
  checkGridColour,
  checkGridConditionalCapacity,
  checkGridConditionalDraft,
  checkGridNumberFormatInput,
  describeGridNumberFormatCodeError,
  gridBorderStyleProperties,
  isGridBorder,
  normalizeGridColour,
  resolveGridBorderSides,
  GRID_FORMAT_MAX_CONDITIONAL_RULES,
  GRID_FORMAT_MAX_RULE_FORMULA_LENGTH,
  GRID_FORMAT_MAX_RULE_VALUE_LENGTH,
} from '../../formatting/gridFormatValidation';
import { checkGridNumberFormatCode } from '../../formatting/gridNumberFormat';

describe('Grid colour handling (Paket 17)', () => {
  it('accepts and normalizes the colours a picker or theme palette produces', () => {
    expect(normalizeGridColour('#1E3A8A')).toBe('#1e3a8a');
    expect(normalizeGridColour('  #fff ')).toBe('#fff');
    expect(normalizeGridColour('rgb(20, 30, 40)')).toBe('rgb(20, 30, 40)');
    expect(normalizeGridColour('rgba(20,30,40,0.5)')).toBe('rgba(20,30,40,0.5)');
    expect(normalizeGridColour('hsl(200, 50%, 40%)')).toBe('hsl(200, 50%, 40%)');
    expect(normalizeGridColour('RED')).toBe('red');
  });

  it('rejects anything that is not a colour', () => {
    for (const raw of ['', 'red; background: url(https://evil.test/x.png)', 'expression(alert(1))', 'var(--x)', '#12345', 'not a colour', 'rgb(1,2,3) !important']) {
      expect(normalizeGridColour(raw), raw).toBeNull();
    }
    // The functional-colour branch must not accept an injection payload that merely looks
    // like a colour function.
    expect(normalizeGridColour('rgb(1,2,3); background:url(evil)')).toBeNull();
    expect(normalizeGridColour('rgba(0,0,0,0.2) url(evil)')).toBeNull();
  });

  it('reports the rejected field so the dialog can point at it', () => {
    expect(checkGridColour('#abc', 'background')).toBeNull();
    expect(checkGridColour('javascript:alert(1)', 'text_color')).toEqual({
      code: 'invalid-colour', detail: 'text_color', message: 'text_color must be a hex, rgb(...) or hsl(...) colour.',
    });
  });
});

describe('Grid border handling (Paket 17)', () => {
  it('accepts exactly the border styles the contract declares', () => {
    for (const border of ['none', 'all', 'outline', 'top', 'bottom', 'left', 'right', 'double-bottom'] as const) {
      expect(isGridBorder(border), border).toBe(true);
      expect(checkGridBorder(border), border).toBeNull();
    }
    expect(isGridBorder('dashed')).toBe(false);
    expect(checkGridBorder('dashed')?.code).toBe('invalid-border');
  });

  it('draws one frame around the selection for an outline', () => {
    expect(resolveGridBorderSides('outline', 'A1', 'A1:B8')).toEqual({ top: true, bottom: false, left: true, right: false });
    expect(resolveGridBorderSides('outline', 'B8', 'A1:B8')).toEqual({ top: false, bottom: true, left: false, right: true });
    expect(resolveGridBorderSides('outline', 'A4', 'A1:B8')).toEqual({ top: false, bottom: false, left: true, right: false });
    // Without a context range an outline has to be visible, so all sides are drawn.
    expect(resolveGridBorderSides('outline', 'C3')).toEqual({ top: true, bottom: true, left: true, right: true });
  });

  it('maps each style to the expected sides', () => {
    expect(resolveGridBorderSides('all', 'C3', 'A1:B8')).toEqual({ top: true, bottom: true, left: true, right: true });
    expect(resolveGridBorderSides('bottom', 'C3', 'A1:B8')).toEqual({ top: false, bottom: true, left: false, right: false });
    expect(resolveGridBorderSides('double-bottom', 'C3', 'A1:B8').bottom).toBe(true);
    expect(resolveGridBorderSides('none', 'C3', 'A1:B8')).toEqual({ top: false, bottom: false, left: false, right: false });
    expect(resolveGridBorderSides(undefined, 'C3')).toEqual({ top: false, bottom: false, left: false, right: false });
  });

  it('produces React style properties a browser actually paints', () => {
    expect(gridBorderStyleProperties('all', 'A1', 'A1:B8', '#fff')).toEqual({ border: '1px solid #fff' });
    expect(gridBorderStyleProperties('outline', 'A1', 'A1:B8', '#fff')).toEqual({ borderTop: '1px solid #fff', borderLeft: '1px solid #fff' });
    expect(gridBorderStyleProperties('double-bottom', 'A1', 'A1:A1', '#fff')).toEqual({ borderBottom: '3px double #fff' });
    expect(gridBorderStyleProperties('none', 'A1', 'A1:A8', '#fff')).toEqual({});
  });
});

describe('Grid conditional-format rule validation (Paket 18)', () => {
  const base = {
    id: 'cf-1', range: 'A1:A10', kind: 'cell', operator: 'greater-than',
    value: '10', value2: '', formula: '', priority: 1,
  } as const;

  it('accepts a well-formed rule and stores the parsed numbers', () => {
    const result = checkGridConditionalDraft({ ...base });
    expect(result.ok).toBe(true);
    expect(result.rule).toMatchObject({ range: 'A1:A10', kind: 'cell', operator: 'greater-than', value: 10, priority: 1 });
  });

  it('rejects an unreadable range visibly instead of storing a rule that never matches', () => {
    const result = checkGridConditionalDraft({ ...base, range: 'banana' });
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.code).toBe('invalid-range');
    expect(checkGridConditionalDraft({ ...base, range: '' }).issues[0]?.code).toBe('invalid-range');
  });

  it('bounds the range length instead of truncating it silently', () => {
    const longRange = `A1:A${'9'.repeat(GRID_FORMAT_MAX_RANGE_LENGTH)}`;
    const result = checkGridConditionalDraft({ ...base, range: longRange });
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'range-too-long')).toBe(true);
  });

  it('requires numbers where the operator compares numbers', () => {
    expect(checkGridConditionalDraft({ ...base, value: 'abc' }).issues.some((issue) => issue.code === 'invalid-value')).toBe(true);
    expect(checkGridConditionalDraft({ ...base, operator: 'between', value: '1', value2: 'x' }).issues.some((issue) => issue.code === 'invalid-value')).toBe(true);
    expect(checkGridConditionalDraft({ ...base, operator: 'between', value: '1', value2: '9' }).ok).toBe(true);
  });

  it('rejects a formula the engine cannot evaluate', () => {
    expect(checkGridConditionalDraft({ ...base, kind: 'formula', formula: '' }).issues[0]?.code).toBe('invalid-formula');
    expect(checkGridConditionalDraft({ ...base, kind: 'formula', formula: '=SUM(A1:A9)' }).issues[0]?.code).toBe('invalid-formula');
    expect(checkGridConditionalDraft({ ...base, kind: 'formula', formula: '=VALUE>10' }).ok).toBe(true);
    expect(checkGridConditionalDraft({ ...base, kind: 'formula', formula: '=A1<>"x"' }).ok).toBe(true);
    expect(checkGridConditionalDraft({ ...base, kind: 'formula', formula: '=B2<=VALUE' }).ok).toBe(true);
  });

  it('bounds the formula and value lengths', () => {
    expect(checkGridConditionalDraft({ ...base, kind: 'formula', formula: `=VALUE>${'1'.repeat(GRID_FORMAT_MAX_RULE_FORMULA_LENGTH)}` })
      .issues.some((issue) => issue.code === 'formula-too-long')).toBe(true);
    expect(checkGridConditionalDraft({ ...base, value: '9'.repeat(GRID_FORMAT_MAX_RULE_VALUE_LENGTH + 1) })
      .issues.some((issue) => issue.code === 'value-too-long')).toBe(true);
  });

  it('bounds the rank of a top/bottom rule', () => {
    expect(checkGridConditionalDraft({ ...base, kind: 'top', rankCount: 0 }).issues.some((issue) => issue.code === 'invalid-rank')).toBe(true);
    expect(checkGridConditionalDraft({ ...base, kind: 'bottom', rankCount: 5 }).ok).toBe(true);
  });

  it('rejects an unknown colour inside a rule', () => {
    expect(checkGridConditionalDraft({ ...base, background: 'url(evil)' }).issues.some((issue) => issue.code === 'invalid-colour')).toBe(true);
  });

  it('fails closed at the rule limit', () => {
    const full = Array.from({ length: GRID_FORMAT_MAX_CONDITIONAL_RULES }, (_, index) => ({ id: `r${index}`, range: 'A1:A2' }));
    expect(checkGridConditionalCapacity(full)?.code).toBe('rule-limit-reached');
    expect(checkGridConditionalCapacity(full.slice(0, -1))).toBeNull();
  });

  it('refuses a duplicate rule id', () => {
    const existing = [{ id: 'cf-1', range: 'A1:A2' }];
    expect(checkGridConditionalDraft({ ...base }, existing).issues.some((issue) => issue.code === 'duplicate-rule')).toBe(true);
  });

  it('does not persist an operator for kinds that never read it', () => {
    const result = checkGridConditionalDraft({ ...base, kind: 'color-scale' });
    expect(result.ok).toBe(true);
    expect(result.rule?.operator).toBeUndefined();
  });
});

describe('Grid number-format input check (Paket 16)', () => {
  it('returns a visible message for every rejection reason', () => {
    expect(checkGridNumberFormatInput('').message).toContain('Enter a number format code');
    expect(checkGridNumberFormatInput('0.00"x').message).toContain('closing quote');
    expect(checkGridNumberFormatInput('0;0;0;0;0').message).toContain('four sections');
    expect(checkGridNumberFormatInput('0'.repeat(300)).message).toContain('255');
    expect(checkGridNumberFormatInput('#,##0.00')).toEqual({ ok: true, code: '#,##0.00', message: '' });
  });

  it('has an exhaustive message for every declared error code', () => {
    for (const error of ['empty', 'code-too-long', 'too-many-sections', 'unterminated-quote'] as const) {
      expect(describeGridNumberFormatCodeError(error).length, error).toBeGreaterThan(10);
    }
    expect(describeGridNumberFormatCodeError(undefined)).toBe('');
    expect(checkGridNumberFormatCode('0.00').valid).toBe(true);
  });
});
