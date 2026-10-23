// STATUS: GOLD — bounded deterministic hostile-input mutation coverage for independent SEC-096 boundaries.
import { describe, expect, it } from 'vitest';
import {
  CHART_MAX_ANNOTATIONS,
  CHART_MAX_CATEGORIES,
  CHART_MAX_JSON_BYTES,
  CHART_MAX_POINTS,
  CHART_MAX_REFERENCE_LINES,
  CHART_MAX_SERIES,
  CHART_MAX_STYLE_OVERRIDES,
  ChartModelError,
  parseUntrustedChartJson,
} from '../../shared/charts/chartModel';
import { importSearchPortablePackage } from '../../platform/search/searchInterchangeCore';

const MUTATION_CASES = 4_096;
const SEARCH_INPUT_BYTE_LIMIT = 64 * 1024;
const CHART_INPUT_BYTE_LIMIT = 32 * 1024;
const FORBIDDEN_PANIC_MESSAGE = /maximum call stack|stack overflow|out of memory|recursion limit/iu;
const SEARCH_CONTROLLED_MESSAGE = /^(?:Search portable package |Search policy |Saved Search |Invalid size filter$)/u;
const CHART_CONTROLLED_CODE = /^chart_[a-z0-9_]{1,96}$/u;
const encoder = new TextEncoder();

type ExpectedOutcome = 'accepted' | 'controlled-rejected';
type MutationCase = { input: string; expected: ExpectedOutcome };
type OutcomeCounts = { accepted: number; controlledRejected: number; nativeExceptions: number; unclassifiedErrors: number };

function jsonText(value: unknown): string {
  const text = JSON.stringify(value);
  if (typeof text !== 'string') throw new Error('Mutation fixture is not JSON serializable');
  return text;
}

function searchEntry(index: number): Record<string, unknown> {
  return {
    id: `search-${index}`,
    name: `Report ${index}`,
    query: 'type:writer report',
    group: 'documents',
    createdAt: index,
    updatedAt: index + 1,
  };
}

function searchPackage(
  savedSearches: unknown[] = [searchEntry(0)],
  policy: unknown = {},
  unsupported: unknown[] = [],
): Record<string, unknown> {
  return { format: 'vgt-search-portable/1', policy, savedSearches, unsupported };
}

function makeSearchMutation(index: number): MutationCase {
  const variant = index % 8;
  const lane = Math.floor(index / 8);
  switch (variant) {
    case 0:
      return { input: jsonText(searchPackage([searchEntry(lane)])), expected: 'accepted' };
    case 1:
      return {
        input: jsonText(searchPackage([], {}, Array.from({ length: 70 }, (_, item) => `unsupported-${lane}-${item}`))),
        expected: 'accepted',
      };
    case 2: {
      const validJson = jsonText(searchPackage());
      return { input: validJson.slice(0, -1), expected: 'controlled-rejected' };
    }
    case 3:
      return { input: 'null', expected: 'controlled-rejected' };
    case 4:
      return {
        input: jsonText({ ...searchPackage(), format: `vgt-search-portable/invalid-${lane}` }),
        expected: 'controlled-rejected',
      };
    case 5:
      return {
        input: jsonText(searchPackage(Array.from({ length: 129 }, (_, item) => searchEntry(item)))),
        expected: 'controlled-rejected',
      };
    case 6:
      return {
        input: jsonText(searchPackage([
          lane % 2 === 0 ? null : { ...searchEntry(lane), query: 'size>not-a-size' },
        ])),
        expected: 'controlled-rejected',
      };
    default:
      return {
        input: jsonText(searchPackage([], { excludedDocumentIds: `not-an-array-${lane}` })),
        expected: 'controlled-rejected',
      };
  }
}

function classifySearchError(error: unknown): Exclude<keyof OutcomeCounts, 'accepted'> {
  if (!(error instanceof Error) || error instanceof RangeError || error instanceof TypeError) return 'nativeExceptions';
  if (FORBIDDEN_PANIC_MESSAGE.test(error.message)) return 'nativeExceptions';
  if (error.message.length <= 256 && SEARCH_CONTROLLED_MESSAGE.test(error.message)) return 'controlledRejected';
  return 'unclassifiedErrors';
}

function validChart(lane: number): Record<string, unknown> {
  return {
    id: `mutation-chart-${lane}`,
    chart_type: 'line',
    title: `Revenue ${lane}`,
    categories: ['Q1', 'Q2'],
    series: [{ name: 'Revenue', values: [12, 18] }],
  };
}

function deepChartExtension(depth: number): Record<string, unknown> {
  let nested: Record<string, unknown> = { leaf: 'bounded' };
  for (let index = 0; index < depth; index += 1) nested = { child: nested };
  return nested;
}

function makeChartMutation(index: number): MutationCase {
  const variant = index % 8;
  const lane = Math.floor(index / 8);
  switch (variant) {
    case 0:
      return { input: jsonText(validChart(lane)), expected: 'accepted' };
    case 1:
      return {
        input: jsonText({ ...validChart(lane), id: 'i'.repeat(300), title: 'T'.repeat(700) }),
        expected: 'accepted',
      };
    case 2: {
      const validJson = jsonText(validChart(lane));
      return { input: validJson.slice(0, -1), expected: 'controlled-rejected' };
    }
    case 3:
      return { input: 'null', expected: 'controlled-rejected' };
    case 4:
      return lane % 2 === 0
        ? { input: jsonText({ ...validChart(lane), chart_type: 'not-a-chart-type' }), expected: 'controlled-rejected' }
        : { input: jsonText({ ...validChart(lane), x_axis: { min: 10, max: 1 } }), expected: 'controlled-rejected' };
    case 5:
      return lane % 2 === 0
        ? {
          input: jsonText({ ...validChart(lane), categories: Array.from({ length: CHART_MAX_CATEGORIES + 1 }, (_, item) => `C${item}`) }),
          expected: 'controlled-rejected',
        }
        : {
          input: jsonText({ ...validChart(lane), series: [{ name: 'Points', values: Array.from({ length: CHART_MAX_POINTS + 1 }, (_, item) => item) }] }),
          expected: 'controlled-rejected',
        };
    case 6:
      return {
        input: jsonText({ ...validChart(lane), untrustedExtension: deepChartExtension(40) }),
        expected: 'controlled-rejected',
      };
    default:
      return {
        input: jsonText({ ...validChart(lane), trendlines: { injected: lane } }),
        expected: 'controlled-rejected',
      };
  }
}

function chartOutputWithinContract(chart: ReturnType<typeof parseUntrustedChartJson>): boolean {
  if (chart.id.length > 256 || chart.title.length > 512 || typeof chart.alt_summary !== 'string' || chart.alt_summary.length > 2_048 || chart.render_mode !== '2d') return false;
  if (chart.categories.length > CHART_MAX_CATEGORIES || chart.series.length > CHART_MAX_SERIES) return false;
  if ((chart.annotations?.length ?? 0) > CHART_MAX_ANNOTATIONS || (chart.reference_lines?.length ?? 0) > CHART_MAX_REFERENCE_LINES) return false;
  if ((chart.selected_series?.length ?? 0) > CHART_MAX_SERIES || (chart.selected_points?.length ?? 0) > CHART_MAX_STYLE_OVERRIDES) return false;
  for (const series of chart.series) {
    if (series.name.length > 256 || series.values.length > CHART_MAX_POINTS) return false;
    if ((series.x_values?.length ?? 0) > CHART_MAX_POINTS || (series.bubble_sizes?.length ?? 0) > CHART_MAX_POINTS) return false;
    if ((series.style_overrides?.length ?? 0) > CHART_MAX_STYLE_OVERRIDES) return false;
  }
  return encoder.encode(JSON.stringify(chart)).byteLength <= CHART_MAX_JSON_BYTES;
}

function classifyChartError(error: unknown): Exclude<keyof OutcomeCounts, 'accepted'> {
  if (!(error instanceof Error) || error instanceof RangeError || error instanceof TypeError) return 'nativeExceptions';
  if (FORBIDDEN_PANIC_MESSAGE.test(error.message)) return 'nativeExceptions';
  if (error instanceof ChartModelError && CHART_CONTROLLED_CODE.test(error.code) && error.message.length <= 128) return 'controlledRejected';
  return 'unclassifiedErrors';
}

function assertCompleteCorpus(
  label: string,
  dispatched: number,
  counts: OutcomeCounts,
  expectedAccepted: number,
  expectedControlledRejected: number,
  invariantFailures: number,
  unexpectedAccepts: number,
): void {
  console.info(`[SEC-096 ${label}] ${dispatched} cases; accepted=${counts.accepted}; controlled-rejected=${counts.controlledRejected}; native-exception=${counts.nativeExceptions}; unclassified=${counts.unclassifiedErrors}`);
  expect(dispatched, `${label}: exactly one public parser call for each corpus input`).toBe(MUTATION_CASES);
  expect(counts.accepted, `${label}: accepted case count`).toBe(expectedAccepted);
  expect(counts.controlledRejected, `${label}: controlled rejection count`).toBe(expectedControlledRejected);
  expect(counts.unclassifiedErrors, `${label}: every rejected input must have a controlled error classification`).toBe(0);
  expect(invariantFailures, `${label}: accepted output must preserve structural and size limits`).toBe(0);
  expect(unexpectedAccepts, `${label}: cases requiring rejection must not be accepted`).toBe(0);
  expect(counts.accepted + counts.controlledRejected + counts.nativeExceptions + counts.unclassifiedErrors).toBe(MUTATION_CASES);
  expect(counts.nativeExceptions, `${label}: hostile inputs must not escape through native exceptions`).toBe(0);
}

describe('SEC-096 independent Search and Chart interchange parser mutation corpora', () => {
  it('dispatches 4,096 bounded Search portable-package JSON inputs', () => {
    const counts: OutcomeCounts = { accepted: 0, controlledRejected: 0, nativeExceptions: 0, unclassifiedErrors: 0 };
    let dispatched = 0;
    let oversizedInputs = 0;
    let invariantFailures = 0;
    let unexpectedAccepts = 0;

    for (let index = 0; index < MUTATION_CASES; index += 1) {
      const testCase = makeSearchMutation(index);
      const bytes = encoder.encode(testCase.input);
      if (bytes.byteLength > SEARCH_INPUT_BYTE_LIMIT) oversizedInputs += 1;
      dispatched += 1;
      try {
        const result = importSearchPortablePackage(bytes);
        counts.accepted += 1;
        if (testCase.expected !== 'accepted') unexpectedAccepts += 1;
        const validGroups = new Set(['all', 'documents', 'people', 'work', 'messages', 'data', 'spaces']);
        if (result.format !== 'vgt-search-portable/1'
          || result.savedSearches.length > 128
          || result.unsupported.length > 64
          || result.policy.enabledModules.length > 18
          || result.policy.excludedDocumentIds.length > 10_000
          || result.policy.excludedSpaces.length > 10_000
          || result.policy.externalConnectorIndexing.allowedConnectorIds.length > 64
          || result.savedSearches.some((item) => item.id.length > 128
            || item.name.length > 120
            || item.query.length > 4_096
            || !validGroups.has(item.group))
          || encoder.encode(JSON.stringify(result)).byteLength > SEARCH_INPUT_BYTE_LIMIT) {
          invariantFailures += 1;
        }
        if (index % 8 === 1 && result.unsupported.length !== 64) invariantFailures += 1;
      } catch (error) {
        const outcome = classifySearchError(error);
        counts[outcome] += 1;
      }
    }

    expect(oversizedInputs, 'Search corpus byte cap').toBe(0);
    assertCompleteCorpus('Search portable JSON', dispatched, counts, MUTATION_CASES / 4, MUTATION_CASES * 3 / 4, invariantFailures, unexpectedAccepts);
  });

  it('dispatches 4,096 bounded untrusted Chart JSON inputs', () => {
    const counts: OutcomeCounts = { accepted: 0, controlledRejected: 0, nativeExceptions: 0, unclassifiedErrors: 0 };
    let dispatched = 0;
    let oversizedInputs = 0;
    let invariantFailures = 0;
    let unexpectedAccepts = 0;

    for (let index = 0; index < MUTATION_CASES; index += 1) {
      const testCase = makeChartMutation(index);
      const bytes = encoder.encode(testCase.input);
      if (bytes.byteLength > CHART_INPUT_BYTE_LIMIT) oversizedInputs += 1;
      dispatched += 1;
      try {
        const result = parseUntrustedChartJson(testCase.input);
        counts.accepted += 1;
        if (testCase.expected !== 'accepted') unexpectedAccepts += 1;
        if (!chartOutputWithinContract(result)) invariantFailures += 1;
        if (index % 8 === 1 && (result.id !== 'i'.repeat(256) || result.title !== 'T'.repeat(512))) invariantFailures += 1;
      } catch (error) {
        const outcome = classifyChartError(error);
        counts[outcome] += 1;
      }
    }

    expect(oversizedInputs, 'Chart corpus byte cap').toBe(0);
    assertCompleteCorpus('Chart JSON', dispatched, counts, MUTATION_CASES / 4, MUTATION_CASES * 3 / 4, invariantFailures, unexpectedAccepts);
  });
});
