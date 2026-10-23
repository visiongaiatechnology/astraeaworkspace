// STATUS: PLATIN - hand-written oracles for the bounded validation trust boundary.

import { describe, expect, it } from 'vitest';
import type { GridCell, GridDataValidationRule } from '../../../../shared/contracts/grid/workspaceGrid';
import {
  MAX_DROPDOWN_VISIBLE_OPTIONS,
  MAX_VALIDATION_LIST_OPTIONS,
  MAX_VALIDATION_MESSAGE_LENGTH,
  MAX_VALIDATION_OPTION_LENGTH,
  applyDropdownKey,
  buildDropdownModel,
  decideValidationListOptions,
  decideValidationRule,
  type DropdownState,
} from '../../data/gridInputValidation';

function rule(overrides: Partial<GridDataValidationRule> = {}): GridDataValidationRule {
  return { id: 'rule-1', range: 'B2:B10', kind: 'list', allowBlank: true, options: ['Offen', 'In Arbeit', 'Fertig'], ...overrides };
}

describe('Grid validation rules - trust boundary', () => {
  it('accepts a well-formed list rule and normalises the range', () => {
    const decision = decideValidationRule(rule({ range: 'b2:b10' }));
    expect(decision.ok).toBe(true);
    if (!decision.ok) throw new Error('expected acceptance');
    expect(decision.accepted.rule.range).toBe('B2:B10');
    expect(decision.accepted.options).toEqual(['Offen', 'In Arbeit', 'Fertig']);
    expect(decision.accepted.bounded).toBe(false);
  });

  it('rejects an unknown validation kind', () => {
    const decision = decideValidationRule(rule({ kind: 'wildcard' as never }));
    expect(decision.ok).toBe(false);
    if (decision.ok) throw new Error('expected rejection');
    expect(decision.issues.map((issue) => issue.code)).toContain('validation_unknown_kind');
  });

  it('rejects a missing, malformed or oversized range', () => {
    expect(decideValidationRule(rule({ range: '' })).ok).toBe(false);
    expect(decideValidationRule(rule({ range: 'B' })).ok).toBe(false);
    expect(decideValidationRule(rule({ range: 'B10:B2' })).ok).toBe(false);
    const oversized = decideValidationRule(rule({ range: 'A1:Z100000' }));
    expect(oversized.ok).toBe(false);
    if (oversized.ok) throw new Error('expected rejection');
    expect(oversized.issues.map((issue) => issue.code)).toContain('validation_range_too_large');
  });

  it('rejects non-finite and inverted numeric bounds', () => {
    const notFinite = decideValidationRule(rule({ kind: 'number', options: undefined, min: Number.NaN }));
    expect(notFinite.ok).toBe(false);
    const inverted = decideValidationRule(rule({ kind: 'number', options: undefined, min: 10, max: 5 }));
    expect(inverted.ok).toBe(false);
    if (inverted.ok) throw new Error('expected rejection');
    expect(inverted.issues.map((issue) => issue.code)).toContain('validation_bounds_inverted');
  });

  it('bounds the option list and reports the cap instead of failing open', () => {
    const options = Array.from({ length: MAX_VALIDATION_LIST_OPTIONS + 20 }, (_, index) => `Option ${index}`);
    const decision = decideValidationRule(rule({ options }));
    expect(decision.ok).toBe(false);
    if (decision.ok) throw new Error('expected rejection');
    expect(decision.issues.map((issue) => issue.code)).toContain('validation_list_too_large');
  });

  it('rejects an over-long option and bounds the accepted message length', () => {
    const longOption = decideValidationRule(rule({ options: ['ok', 'x'.repeat(MAX_VALIDATION_OPTION_LENGTH + 1)] }));
    expect(longOption.ok).toBe(false);
    if (longOption.ok) throw new Error('expected rejection');
    expect(longOption.issues.map((issue) => issue.code)).toContain('validation_option_too_long');

    const longMessage = decideValidationRule(rule({ errorMessage: 'y'.repeat(MAX_VALIDATION_MESSAGE_LENGTH + 1) }));
    expect(longMessage.ok).toBe(false);
    if (longMessage.ok) throw new Error('expected rejection');
    expect(longMessage.issues.map((issue) => issue.code)).toContain('validation_message_too_long');
  });

  it('rejects a malformed list source and a missing custom formula', () => {
    const badSource = decideValidationRule(rule({ listSource: '=SUM(A1:A2) + garbage;drop' }));
    expect(badSource.ok).toBe(false);
    if (badSource.ok) throw new Error('expected rejection');
    expect(badSource.issues.map((issue) => issue.code)).toContain('validation_list_source_empty');

    const noFormula = decideValidationRule(rule({ kind: 'custom', formula: '   ' }));
    expect(noFormula.ok).toBe(false);
    if (noFormula.ok) throw new Error('expected rejection');
    expect(noFormula.issues.map((issue) => issue.code)).toContain('validation_formula_missing');
  });

  it('accepts the four legitimate list sources', () => {
    for (const listSource of ['A1:A5', 'Lookup[Status]', 'StatusList', '=INDIRECT($A$1)']) {
      expect(decideValidationRule(rule({ listSource, options: [] })).ok, listSource).toBe(true);
    }
  });

  it('deduplicates and trims options without reordering them', () => {
    const decision = decideValidationRule(rule({ options: [' Offen ', 'In Arbeit', 'Offen', '', 'Fertig'] }));
    expect(decision.ok).toBe(true);
    if (!decision.ok) throw new Error('expected acceptance');
    expect(decision.accepted.options).toEqual(['Offen', 'In Arbeit', 'Fertig']);
    expect(decision.accepted.bounded).toBe(true);
  });

  it('never mutates the rule it was given', () => {
    const input = rule({ options: [' Offen ', 'Offen'] });
    const snapshot = JSON.stringify(input);
    decideValidationRule(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

describe('Grid validation dropdown - keyboard contract', () => {
  const options = ['Offen', 'In Arbeit', 'Fertig'];
  const closed: DropdownState = { open: false, activeIndex: -1, query: '' };

  it('opens with Alt+ArrowDown and highlights the first option', () => {
    const result = applyDropdownKey(options, closed, 'Alt+ArrowDown', '');
    expect(result.handled).toBe(true);
    expect(result.state).toEqual({ open: true, activeIndex: 0, query: '' });
    expect(result.commit).toBeUndefined();
  });

  it('moves the highlight with ArrowDown/ArrowUp and wraps at both ends', () => {
    let state: DropdownState = { open: true, activeIndex: 0, query: '' };
    state = applyDropdownKey(options, state, 'ArrowDown', '').state;
    expect(state.activeIndex).toBe(1);
    state = applyDropdownKey(options, state, 'ArrowDown', '').state;
    expect(state.activeIndex).toBe(2);
    state = applyDropdownKey(options, state, 'ArrowDown', '').state;
    expect(state.activeIndex).toBe(0);
    state = applyDropdownKey(options, state, 'ArrowUp', '').state;
    expect(state.activeIndex).toBe(2);
    expect(applyDropdownKey(options, state, 'Home', '').state.activeIndex).toBe(0);
    expect(applyDropdownKey(options, state, 'End', '').state.activeIndex).toBe(2);
  });

  it('commits the highlighted option on Enter and closes the list', () => {
    const result = applyDropdownKey(options, { open: true, activeIndex: 1, query: '' }, 'Enter', '');
    expect(result.commit).toBe('In Arbeit');
    expect(result.state.open).toBe(false);
  });

  it('commits the typed text when nothing is highlighted', () => {
    const result = applyDropdownKey(options, { open: true, activeIndex: -1, query: '' }, 'Enter', ' Sonderfall ');
    expect(result.commit).toBe('Sonderfall');
  });

  it('Escape closes without committing and Tab leaves the list without swallowing the key', () => {
    const escape = applyDropdownKey(options, { open: true, activeIndex: 1, query: '' }, 'Escape', '');
    expect(escape.commit).toBeUndefined();
    expect(escape.state.open).toBe(false);
    const tab = applyDropdownKey(options, { open: true, activeIndex: 1, query: '' }, 'Tab', '');
    expect(tab.handled).toBe(false);
    expect(tab.state.open).toBe(false);
  });

  it('filters by the typed query and keeps the highlight inside the filtered list', () => {
    const model = buildDropdownModel(options, { open: true, activeIndex: 5, query: 'arb' }, 'In Arbeit');
    expect(model.visibleOptions).toEqual(['In Arbeit']);
    expect(model.activeVisibleIndex).toBe(0);
    expect(model.rows[0].selected).toBe(true);
    expect(model.rows[0].index).toBe(0);
  });

  it('bounds the number of rendered rows while keeping every option searchable', () => {
    const many = Array.from({ length: 500 }, (_, index) => `Option ${index}`);
    const model = buildDropdownModel(many, { open: true, activeIndex: 0, query: '' }, '');
    expect(model.visibleOptions).toHaveLength(500);
    expect(model.rows).toHaveLength(MAX_DROPDOWN_VISIBLE_OPTIONS);
    const queried = buildDropdownModel(many, { open: true, activeIndex: 0, query: 'Option 499' }, '');
    expect(queried.visibleOptions).toEqual(['Option 499']);
  });

  it('reports an empty list instead of highlighting a non-existent row', () => {
    const model = buildDropdownModel([], { open: true, activeIndex: 3, query: '' }, '');
    expect(model.visibleOptions).toEqual([]);
    expect(model.activeVisibleIndex).toBe(-1);
    expect(applyDropdownKey([], { open: true, activeIndex: 3, query: '' }, 'ArrowDown', '').state.activeIndex).toBe(-1);
  });
});

describe('Grid validation list resolution - bounded', () => {
  const cells: Record<string, GridCell> = {
    A1: { value: 'Nord' }, A2: { value: 'Sued' }, A3: { value: 'Nord' }, A4: { value: '' },
  };

  it('resolves a range source, de-duplicates and caps it', () => {
    const decision = decideValidationListOptions(rule({ options: [], listSource: 'A1:A4' }), cells);
    expect(decision.options).toEqual(['Nord', 'Sued']);
    expect(decision.hitLimit).toBe(false);
  });

  it('resolves named ranges through the canonical engine and marks the cap', () => {
    const manyCells: Record<string, GridCell> = {};
    const source: string[] = [];
    for (let index = 0; index < MAX_VALIDATION_LIST_OPTIONS + 10; index++) {
      manyCells[`A${index + 1}`] = { value: `Wert ${index}` };
      source.push(`Wert ${index}`);
    }
    const decision = decideValidationListOptions(
      rule({ options: [], listSource: 'Liste' }),
      manyCells,
      { namedRanges: [{ id: 'n1', name: 'Liste', sheetId: 's1', range: `A1:A${source.length}` }], sheetId: 's1' },
    );
    expect(decision.options).toHaveLength(MAX_VALIDATION_LIST_OPTIONS);
    expect(decision.hitLimit).toBe(true);
  });

  it('returns nothing for a non-list rule and drops over-long options', () => {
    expect(decideValidationListOptions(rule({ kind: 'number', options: ['1'] }), cells).options).toEqual([]);
    const decision = decideValidationListOptions(
      rule({ options: ['ok', 'z'.repeat(MAX_VALIDATION_OPTION_LENGTH + 5)] }),
      cells,
    );
    expect(decision.options).toEqual(['ok']);
  });
});
