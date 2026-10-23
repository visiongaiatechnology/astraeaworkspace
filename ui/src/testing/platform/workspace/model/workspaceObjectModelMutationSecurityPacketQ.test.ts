// STATUS: GOLD — bounded canonical Workspace Object Model ingress mutation coverage.
import { describe, expect, it } from 'vitest';
import { WOM_SCHEMA_VERSION, type WorkspaceDocument } from '../../../../shared/contracts/workspace';
import {
  deserializeWorkspaceDocumentCanonical,
  decodeWorkspaceSemanticBytes,
  validateWorkspaceDocumentInvariants,
  WorkspaceMalformedInputError,
  WorkspaceUnsupportedContentError,
} from '../../../../platform/workspace/model/workspaceObjectModel';

const MUTATION_CASES = 4_096;
const MAX_CASE_BYTES = 300 * 1024;
const MAX_INLINE_METADATA_BYTES = 256 * 1024;
const FORBIDDEN_PANIC_MESSAGE = /maximum call stack|stack overflow|out of memory|recursion limit|\n\s*at\s+\S+/iu;
const encoder = new TextEncoder();

type ExpectedOutcome = 'accepted' | 'controlled-rejected';
type MutationCase = {
  label: string;
  text: string;
  semanticBytes?: Uint8Array;
  expectedText: ExpectedOutcome;
  expectedBytes: ExpectedOutcome;
};
type OutcomeCounts = { accepted: number; controlledRejected: number; nativeExceptions: number; unclassifiedErrors: number };

function documentFixture(index: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema_version: WOM_SCHEMA_VERSION,
    id: `mutation-document-${index}`,
    title: `Mutation document ${index}`,
    kind: 'Writer',
    created_at: 1,
    modified_at: 2,
    version: 1,
    theme_id: 'cosmic-obsidian',
    root_object_ids: [],
    objects: {},
    ...overrides,
  };
}

function jsonText(value: unknown): string {
  const text = JSON.stringify(value);
  if (typeof text !== 'string') throw new Error('WOM mutation fixture is not JSON serializable');
  return text;
}

function deeplyNestedValue(depth: number): Record<string, unknown> {
  let value: Record<string, unknown> = { leaf: 'bounded' };
  for (let index = 0; index < depth; index += 1) value = { child: value };
  return value;
}

function dataRecordDocument(index: number, value: unknown): Record<string, unknown> {
  return documentFixture(index, {
    root_object_ids: ['record'],
    objects: { record: { type: 'DataRecord', data: { id: 'record', fields: { payload: value } } } },
  });
}

function makeMutation(index: number): MutationCase {
  const variant = index % 16;
  const lane = Math.floor(index / 16);
  switch (variant) {
    case 0:
      return { label: 'valid-canonical-v2', text: jsonText(documentFixture(index)), expectedText: 'accepted', expectedBytes: 'accepted' };
    case 1:
      switch (lane % 4) {
        case 0:
          return {
            label: 'valid-legacy-v1-migration',
            text: jsonText(documentFixture(index, { schema_version: 1, workData: { tasks: [], cards: [] } })),
            expectedText: 'accepted',
            expectedBytes: 'accepted',
          };
        case 1:
          return {
            label: 'legacy-work-data-wrong-shape',
            text: jsonText(documentFixture(index, { schema_version: 1, workData: { tasks: [] } })),
            expectedText: 'controlled-rejected',
            expectedBytes: 'controlled-rejected',
          };
        case 2:
          return {
            label: 'legacy-work-tasks-wrong-shape',
            text: jsonText(documentFixture(index, { schema_version: 1, workData: { tasks: {}, cards: [] } })),
            expectedText: 'controlled-rejected',
            expectedBytes: 'controlled-rejected',
          };
        default:
          return {
            label: 'legacy-work-card-wrong-shape',
            text: jsonText(documentFixture(index, { schema_version: 1, workData: { tasks: [], cards: [null] } })),
            expectedText: 'controlled-rejected',
            expectedBytes: 'controlled-rejected',
          };
      }
    case 2:
      return lane % 2 === 0
        ? {
          label: 'valid-unknown-forward-field',
          text: jsonText(documentFixture(index, { vendorMetadata: { sequence: lane, mode: 'preserve' } })),
          expectedText: 'accepted',
          expectedBytes: 'accepted',
        }
        : {
          label: 'null-work-management-data',
          text: jsonText(documentFixture(index, { workManagementData: null })),
          expectedText: 'controlled-rejected',
          expectedBytes: 'controlled-rejected',
        };
    case 3: {
      const valid = jsonText(documentFixture(index));
      return { label: 'truncated-json', text: valid.slice(0, -1), expectedText: 'controlled-rejected', expectedBytes: 'controlled-rejected' };
    }
    case 4:
      return { label: 'primitive-top-level', text: lane % 2 === 0 ? 'null' : '[]', expectedText: 'controlled-rejected', expectedBytes: 'controlled-rejected' };
    case 5:
      return {
        label: 'wrong-title-shape',
        text: jsonText(documentFixture(index, { title: { toString: 'not-a-title' } })),
        expectedText: 'controlled-rejected',
        expectedBytes: 'controlled-rejected',
      };
    case 6: {
      const record = { type: 'DataRecord', data: { id: 'record', fields: {} } };
      return {
        label: 'duplicate-root-object-id',
        text: jsonText(documentFixture(index, { root_object_ids: ['record', 'record'], objects: { record } })),
        expectedText: 'controlled-rejected',
        expectedBytes: 'controlled-rejected',
      };
    }
    case 7: {
      const valid = jsonText(documentFixture(index));
      const duplicateKey = lane % 2 === 0 ? 'title' : '\\u0074itle';
      const duplicateMember = `${valid.slice(0, -1)},"${duplicateKey}":${JSON.stringify(`Equivalent title ${lane}`)}}`;
      return { label: 'duplicate-json-member', text: duplicateMember, expectedText: 'controlled-rejected', expectedBytes: 'controlled-rejected' };
    }
    case 8:
      return {
        label: 'unknown-object-family',
        text: jsonText(documentFixture(index, {
          root_object_ids: ['future'],
          objects: { future: { type: 'VendorFutureObject', data: { id: 'future', vendor: 'preserve?' } } },
        })),
        expectedText: 'controlled-rejected',
        expectedBytes: 'controlled-rejected',
      };
    case 9: {
      const namespaces: Record<string, unknown> = {};
      for (let item = 0; item < 257; item += 1) namespaces[`vendor.ns${item}`] = { lane };
      return {
        label: 'oversized-extension-namespace-count',
        text: jsonText(documentFixture(index, { wom_extensions: namespaces })),
        expectedText: 'controlled-rejected',
        expectedBytes: 'controlled-rejected',
      };
    }
    case 10:
      return {
        label: 'oversized-inline-data-record-value',
        text: jsonText(dataRecordDocument(index, 'x'.repeat(MAX_INLINE_METADATA_BYTES + 1))),
        expectedText: 'controlled-rejected',
        expectedBytes: 'controlled-rejected',
      };
    case 11:
      return {
        label: 'nested-value-depth-limit',
        text: jsonText(documentFixture(index, { vendorMetadata: deeplyNestedValue(100 + (lane % 8)) })),
        expectedText: 'controlled-rejected',
        expectedBytes: 'controlled-rejected',
      };
    case 12:
      return {
        label: 'malformed-utf8-semantic-bytes',
        text: jsonText(documentFixture(index)),
        semanticBytes: new Uint8Array([0x7b, 0x22, 0x69, 0x64, 0x22, 0x3a, 0xff, 0x7d]),
        expectedText: 'accepted',
        expectedBytes: 'controlled-rejected',
      };
    case 13:
      return {
        label: 'persisted-ui-only-field',
        text: jsonText(documentFixture(index, { __uiState: { selected: true } })),
        expectedText: 'controlled-rejected',
        expectedBytes: 'controlled-rejected',
      };
    case 14:
      return {
        label: 'executable-extension-payload',
        text: jsonText(documentFixture(index, { wom_extensions: { 'vendor.safe': { script: 'blocked' } } })),
        expectedText: 'controlled-rejected',
        expectedBytes: 'controlled-rejected',
      };
    default:
      return {
        label: 'invalid-object-data-identity',
        text: jsonText(documentFixture(index, {
          root_object_ids: ['record'],
          objects: { record: { type: 'DataRecord', data: { id: `mismatched-${lane}`, fields: {} } } },
        })),
        expectedText: 'controlled-rejected',
        expectedBytes: 'controlled-rejected',
      };
  }
}

function classifyError(error: unknown): Exclude<keyof OutcomeCounts, 'accepted'> {
  if (!(error instanceof Error) || error instanceof TypeError || error instanceof RangeError) return 'nativeExceptions';
  if (FORBIDDEN_PANIC_MESSAGE.test(error.message)) return 'nativeExceptions';
  if (error instanceof WorkspaceMalformedInputError || error instanceof WorkspaceUnsupportedContentError) return 'controlledRejected';
  return 'unclassifiedErrors';
}

function assertValidDocument(value: WorkspaceDocument): void {
  expect(value).toMatchObject({
    schema_version: WOM_SCHEMA_VERSION,
    kind: 'Writer',
    version: 1,
  });
  expect(value.id).toMatch(/^mutation-document-\d+$/u);
  expect(typeof value.title).toBe('string');
  expect(Array.isArray(value.root_object_ids)).toBe(true);
  expect(value.objects && typeof value.objects).toBe('object');
  expect(new Set(value.root_object_ids).size).toBe(value.root_object_ids.length);
  for (const rootId of value.root_object_ids) expect(Object.hasOwn(value.objects, rootId)).toBe(true);
  expect(() => validateWorkspaceDocumentInvariants(value)).not.toThrow();
}

function runMutationBoundary(
  boundary: string,
  execute: (mutation: MutationCase) => { expected: ExpectedOutcome; invoke: () => WorkspaceDocument },
): OutcomeCounts {
  const counts: OutcomeCounts = { accepted: 0, controlledRejected: 0, nativeExceptions: 0, unclassifiedErrors: 0 };
  const unexpected: string[] = [];
  let failureCount = 0;
  const recordFailure = (message: string): void => {
    failureCount += 1;
    if (unexpected.length < 20) unexpected.push(message);
  };
  for (let index = 0; index < MUTATION_CASES; index += 1) {
    const mutation = makeMutation(index);
    const byteLength = encoder.encode(mutation.text).byteLength;
    if (byteLength > MAX_CASE_BYTES || byteLength < 2) {
      recordFailure(`case-${index}/${mutation.label}: input-byte-bound:${byteLength}`);
      continue;
    }
    const target = execute(mutation);
    try {
      const result = target.invoke();
      counts.accepted += 1;
      if (target.expected !== 'accepted') recordFailure(`case-${index}/${mutation.label}: unexpectedly accepted`);
      assertValidDocument(result);
    } catch (error) {
      const category = classifyError(error);
      counts[category] += 1;
      if (category !== 'controlledRejected' || target.expected !== 'controlled-rejected') {
        recordFailure(`case-${index}/${mutation.label}: ${category}/${target.expected}/${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`);
      }
    }
  }
  const accounted = counts.accepted + counts.controlledRejected + counts.nativeExceptions + counts.unclassifiedErrors;
  expect(failureCount, `${boundary} mutation contract failures: ${unexpected.join('; ')}`).toBe(0);
  expect(accounted, `${boundary} outcomes accounted`).toBe(MUTATION_CASES);
  expect(counts.nativeExceptions, `${boundary} native exceptions`).toBe(0);
  expect(counts.unclassifiedErrors, `${boundary} unclassified errors`).toBe(0);
  return counts;
}

describe('canonical Workspace Object Model ingress mutation packet Q', () => {
  it('bounds 4,096 JSON-string mutations at deserializeWorkspaceDocumentCanonical', () => {
    const counts = runMutationBoundary('deserializeWorkspaceDocumentCanonical', (mutation) => ({
      expected: mutation.expectedText,
      invoke: () => deserializeWorkspaceDocumentCanonical(mutation.text),
    }));
    expect(counts.accepted).toBe(11 * (MUTATION_CASES / 64));
    expect(counts.controlledRejected).toBe(MUTATION_CASES - counts.accepted);
  }, 20_000);

  it('bounds 4,096 semantic-byte mutations at decodeWorkspaceSemanticBytes', () => {
    const counts = runMutationBoundary('decodeWorkspaceSemanticBytes', (mutation) => ({
      expected: mutation.expectedBytes,
      invoke: () => decodeWorkspaceSemanticBytes(mutation.semanticBytes ?? encoder.encode(mutation.text)),
    }));
    expect(counts.accepted).toBe(11 * (MUTATION_CASES / 64) - MUTATION_CASES / 16);
    expect(counts.controlledRejected).toBe(MUTATION_CASES - counts.accepted);
  }, 20_000);
});
