// STATUS: PLATIN — discriminating witness for the silent priority collapse in the task import path.
// ML 1780 requires P1..P4 (and tag colour codes) to be usable in the list; the canonical contract
// only has low|medium|high. This test EXECUTES the real CSV/JSON import and asserts that no
// declared source priority is projected onto the canonical contract without being recorded.
// It does not look for call sites, identifiers or text: it reads the converted TaskItem values and
// the returned warning record.
import { describe, expect, it } from 'vitest';
import { importTasksFromCsv, importTasksFromJson } from '../../interchange/taskInterchangeEngine';

const CANONICAL_TOKENS = ['low', 'medium', 'high'] as const;
const PROJECTED_TOKENS = ['p1', 'p2', 'p3', 'p4', 'urgent', '1', '2', '3', '4', 'critical'] as const;

interface ImportedPriorityProbe { tasks: { priority: string; description?: string; tags?: string[]; statusReason?: string }[]; warnings: string[] }

function csvFor(tokens: readonly (string | number | undefined)[]): string {
  return ['Title,Priority', ...tokens.map((token, index) => `Row ${index},${token ?? ''}`)].join('\r\n');
}
function jsonFor(tokens: readonly (string | number | undefined)[], key: 'name' | 'title'): string {
  return JSON.stringify(tokens.map((token, index) => ({ [key]: `Row ${index}`, ...(token === undefined ? {} : { priority: token }) })));
}
function storedPriorities(result: ImportedPriorityProbe): string[] {
  return result.tasks.map((task) => task.priority);
}
/**
 * True when the import result names this source token as the origin of a projection. The record
 * distinguishes `source="p4"` from `stored="low"`, so a stored canonical value can never be mistaken
 * for a declared source token.
 */
function namesToken(result: ImportedPriorityProbe, token: string | number): boolean {
  const needle = `source="${String(token).trim().toLowerCase()}"`;
  return result.warnings.some((warning) => warning.includes(needle));
}

describe('task import priority fidelity', () => {
  it('projects the four-level P vocabulary monotonically, so P4 never outranks P3', () => {
    const result = importTasksFromCsv(csvFor(['p1', 'p2', 'p3', 'p4']));

    expect(storedPriorities(result)).toEqual(['high', 'medium', 'low', 'low']);
  });

  it('applies one identical projection rule to CSV and both JSON import branches', () => {
    const tokens = ['p1', ' p1 ', 'P1', 'High', 'p4', 'urgent', '2'];
    const expected = ['high', 'high', 'high', 'high', 'low', 'high', 'medium'];

    expect(storedPriorities(importTasksFromCsv(csvFor(tokens)))).toEqual(expected);
    expect(storedPriorities(importTasksFromJson(jsonFor(tokens, 'name')))).toEqual(expected);
    expect(storedPriorities(importTasksFromJson(jsonFor(tokens, 'title')))).toEqual(expected);
  });

  it('records every declared source priority the canonical contract cannot represent (CSV)', () => {
    const result = importTasksFromCsv(csvFor(PROJECTED_TOKENS));

    const unrecorded = PROJECTED_TOKENS.filter((token) => !namesToken(result, token));
    expect(unrecorded, `projected without any record: ${unrecorded.join(', ')} | warnings=${JSON.stringify(result.warnings)}`).toEqual([]);
    const falseAlarms = CANONICAL_TOKENS.filter((token) => namesToken(result, token));
    expect(falseAlarms, `canonical priorities must not be reported | warnings=${JSON.stringify(result.warnings)}`).toEqual([]);
  });

  it('records the same projections for both JSON import branches, including numeric priorities', () => {
    for (const key of ['name', 'title'] as const) {
      const result = importTasksFromJson(jsonFor([...PROJECTED_TOKENS, 4, 2], key));

      const unrecorded = [...PROJECTED_TOKENS, 4, 2].filter((token) => !namesToken(result, token));
      expect(unrecorded, `${key}: projected without any record: ${unrecorded.join(', ')} | warnings=${JSON.stringify(result.warnings)}`).toEqual([]);
      const falseAlarms = CANONICAL_TOKENS.filter((token) => namesToken(result, token));
      expect(falseAlarms, `${key}: canonical priorities must not be reported | warnings=${JSON.stringify(result.warnings)}`).toEqual([]);
    }
  });

  it('records both sides of the collapse the three-level contract cannot avoid', () => {
    const result = importTasksFromCsv(csvFor(['p3', 'p4']));

    // Four source levels cannot fit into three stored levels: P3 and P4 necessarily share a value.
    expect(storedPriorities(result)).toEqual(['low', 'low']);
    expect(namesToken(result, 'p3')).toBe(true);
    expect(namesToken(result, 'p4')).toBe(true);
  });

  it('treats an undeclared priority as the documented default while still reporting unknown tokens', () => {
    const withoutColumn = importTasksFromCsv('Title,Description\r\nRow,Authored');
    expect(storedPriorities(withoutColumn)).toEqual(['medium']);
    expect(withoutColumn.warnings).toEqual([]);

    const blankCell = importTasksFromCsv('Title,Priority\r\nRow,');
    expect(storedPriorities(blankCell)).toEqual(['medium']);
    expect(blankCell.warnings).toEqual([]);

    const unknown = importTasksFromCsv(csvFor(['blocker']));
    expect(storedPriorities(unknown)).toEqual(['medium']);
    expect(namesToken(unknown, 'blocker')).toBe(true);
  });

  it('reports the projection without fabricating task content', () => {
    const result = importTasksFromCsv('Title,Priority,Description,Tags\r\nRow,p4,Authored text,alpha;beta');
    const task = result.tasks[0];

    expect(task?.priority).toBe('low');
    expect(task?.description).toBe('Authored text');
    expect(task?.tags).toEqual(['alpha', 'beta']);
    expect(task?.statusReason).toBeUndefined();
  });
});
