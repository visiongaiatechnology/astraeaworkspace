import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  IMPORT_WORKER_MAX_FILE_NAME_BYTES,
  IMPORT_WORKER_MAX_INPUT_BYTES,
  ImportExportSandboxRequestError,
  isImportWorkerByteLengthAllowed,
  parseImportExportSandboxWorkerRequest,
  safeImportExportSandboxRequestId,
} from '../../../platform/import-sandbox/importExportSandboxWorkerRequest';

interface WorkerReply {
  id: string;
  ok: boolean;
  error?: string;
  report?: { format: string; size_bytes: number; file_name_hint: string };
}

interface WorkerHarnessScope {
  onmessage: ((event: MessageEvent<unknown>) => void | Promise<void>) | null;
  postMessage(message: unknown): void;
}

const requestId = (value: number): string => `00000000-0000-4000-8000-${value.toString(16).padStart(12, '0')}`;
const validEnvelope = (overrides: Record<string, unknown> = {}) => ({
  id: requestId(1),
  fileName: 'sample.json',
  bytes: new TextEncoder().encode('{"ok":true}').buffer,
  ...overrides,
});

let replies: WorkerReply[] = [];
const workerScope: WorkerHarnessScope = {
  onmessage: null,
  postMessage(message: unknown) {
    replies.push(message as WorkerReply);
  },
};

beforeAll(async () => {
  vi.stubGlobal('self', workerScope);
  await import('../../../platform/import-sandbox/importExportSandbox.worker');
});

afterAll(() => vi.unstubAllGlobals());

async function dispatchWorkerMessage(data: unknown): Promise<WorkerReply> {
  replies = [];
  const handler = workerScope.onmessage;
  if (!handler) throw new Error('Import worker message handler was not registered');
  await handler({ data } as MessageEvent<unknown>);
  if (replies.length !== 1) throw new Error(`Expected one worker reply, received ${replies.length}`);
  return replies[0];
}

function fingerprint(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (item instanceof ArrayBuffer) return `ArrayBuffer(${item.byteLength})`;
    if (ArrayBuffer.isView(item)) {
      const bytes = new Uint8Array(item.buffer, item.byteOffset, item.byteLength);
      return `${item.constructor.name}(${Array.from(bytes).join(',')})`;
    }
    return item;
  });
}

function expectParserError(run: () => unknown, code: string): void {
  try {
    run();
    throw new Error('expected import worker request rejection');
  } catch (error) {
    expect(error).toBeInstanceOf(ImportExportSandboxRequestError);
    expect((error as ImportExportSandboxRequestError).code).toBe(code);
  }
}

describe('Import/export sandbox worker ingress', () => {
  it('routes 4,096 unique bounded message mutations through the actual worker onmessage handler', async () => {
    const casesPerFamily = 256;
    const familyCount = 16;
    const mutationCaseCount = casesPerFamily * familyCount;
    const oversizedBuffer = new ArrayBuffer(IMPORT_WORKER_MAX_INPUT_BYTES + 1);
    const fingerprints = new Set<string>();
    const rejectionCounts = new Map<string, number>();
    let acceptedReplies = 0;
    let rejectedReplies = 0;
    let contentValidationReached = 0;
    let nativeOrUnclassifiedErrors = 0;

    expect(mutationCaseCount).toBe(4096);
    for (let caseIndex = 0; caseIndex < mutationCaseCount; caseIndex += 1) {
      const family = Math.floor(caseIndex / casesPerFamily);
      const variant = caseIndex % casesPerFamily;
      const id = requestId(caseIndex + 1);
      let input: unknown;
      let expected: 'ok' | 'IMPORT_REQUEST_SCHEMA_REJECTED' | 'IMPORT_REQUEST_ID_REJECTED'
        | 'IMPORT_REQUEST_FILENAME_REJECTED' | 'IMPORT_REQUEST_BYTES_REJECTED'
        | 'IMPORT_REQUEST_SIZE_REJECTED' | 'Foreign text contains NUL';

      switch (family) {
        case 0:
          input = validEnvelope({ id, fileName: `json-${variant}.json`, bytes: new TextEncoder().encode(JSON.stringify({ variant })).buffer });
          expected = 'ok';
          break;
        case 1:
          input = validEnvelope({ id, fileName: `table-${variant}.csv`, bytes: new TextEncoder().encode(`left-${variant},right\n1,2`).buffer });
          expected = 'ok';
          break;
        case 2:
          input = [variant];
          expected = 'IMPORT_REQUEST_SCHEMA_REJECTED';
          break;
        case 3:
          input = { id, fileName: `missing-bytes-${variant}.json` };
          expected = 'IMPORT_REQUEST_SCHEMA_REJECTED';
          break;
        case 4:
          input = { ...validEnvelope({ id }), extra: variant };
          expected = 'IMPORT_REQUEST_SCHEMA_REJECTED';
          break;
        case 5:
          input = validEnvelope({ id: `${variant.toString(16).padStart(32, '0')}`, fileName: `bad-id-${variant}.json` });
          expected = 'IMPORT_REQUEST_ID_REJECTED';
          break;
        case 6:
          input = validEnvelope({ id, fileName: '' });
          expected = 'IMPORT_REQUEST_FILENAME_REJECTED';
          break;
        case 7:
          input = validEnvelope({ id, fileName: `f${variant}-` + 'x'.repeat(IMPORT_WORKER_MAX_FILE_NAME_BYTES + 1 + variant) });
          expected = 'IMPORT_REQUEST_FILENAME_REJECTED';
          break;
        case 8:
          input = validEnvelope({ id, fileName: '💠'.repeat(257 + variant) });
          expected = 'IMPORT_REQUEST_FILENAME_REJECTED';
          break;
        case 9:
          input = validEnvelope({ id, bytes: { length: Number.MAX_SAFE_INTEGER - variant } });
          expected = 'IMPORT_REQUEST_BYTES_REJECTED';
          break;
        case 10:
          input = validEnvelope({ id, bytes: Uint8Array.from({ length: variant + 1 }, (_value, index) => (index + variant) % 256) });
          expected = 'IMPORT_REQUEST_BYTES_REJECTED';
          break;
        case 11:
          input = validEnvelope({ id, bytes: new ArrayBuffer(0) });
          expected = 'IMPORT_REQUEST_SIZE_REJECTED';
          break;
        case 12:
          input = validEnvelope({ id, bytes: oversizedBuffer });
          expected = 'IMPORT_REQUEST_SIZE_REJECTED';
          break;
        case 13:
          input = validEnvelope({ id, fileName: `nul-${variant}.bin`, bytes: new ArrayBuffer(variant + 1) });
          expected = 'Foreign text contains NUL';
          break;
        case 14:
          input = validEnvelope({ id, fileName: 'x'.repeat(IMPORT_WORKER_MAX_FILE_NAME_BYTES - casesPerFamily + variant + 1) });
          expected = 'ok';
          break;
        default:
          input = validEnvelope({ id, fileName: `scalar-${variant}.json`, bytes: new TextEncoder().encode(JSON.stringify(variant)).buffer });
          expected = 'ok';
          break;
      }

      const uniqueKey = fingerprint(input);
      expect(fingerprints.has(uniqueKey), `mutation ${caseIndex} must be unique`).toBe(false);
      fingerprints.add(uniqueKey);
      const reply = await dispatchWorkerMessage(input);
      expect(reply.id).toBe(safeImportExportSandboxRequestId(input));
      if (reply.ok) {
        expect(expected, `mutation ${caseIndex}, family ${family} should reject`).toBe('ok');
        expect(reply.id).toBe(id);
        acceptedReplies += 1;
        continue;
      }

      rejectedReplies += 1;
      if (reply.error === 'IMPORT_REQUEST_SCHEMA_REJECTED'
        || reply.error === 'IMPORT_REQUEST_ID_REJECTED'
        || reply.error === 'IMPORT_REQUEST_FILENAME_REJECTED'
        || reply.error === 'IMPORT_REQUEST_BYTES_REJECTED'
        || reply.error === 'IMPORT_REQUEST_SIZE_REJECTED') {
        expect(reply.error, `mutation ${caseIndex} should return its controlled parser code`).toBe(expected);
      } else if (reply.error === 'Foreign text contains NUL') {
        expect(expected, `mutation ${caseIndex} should reach content validation`).toBe(expected);
        contentValidationReached += 1;
      } else {
        nativeOrUnclassifiedErrors += 1;
      }
      rejectionCounts.set(reply.error ?? '<missing>', (rejectionCounts.get(reply.error ?? '<missing>') ?? 0) + 1);
      expect(reply.error, `mutation ${caseIndex} must be classified`).toBe(expected);
    }

    expect(fingerprints.size).toBe(4096);
    expect({ acceptedReplies, rejectedReplies, contentValidationReached, nativeOrUnclassifiedErrors }).toEqual({
      acceptedReplies: 1024,
      rejectedReplies: 3072,
      contentValidationReached: 256,
      nativeOrUnclassifiedErrors: 0,
    });
    expect(Object.fromEntries(rejectionCounts)).toEqual({
      IMPORT_REQUEST_SCHEMA_REJECTED: 768,
      IMPORT_REQUEST_ID_REJECTED: 256,
      IMPORT_REQUEST_FILENAME_REJECTED: 768,
      IMPORT_REQUEST_BYTES_REJECTED: 512,
      IMPORT_REQUEST_SIZE_REJECTED: 512,
      'Foreign text contains NUL': 256,
    });
  }, 30_000);

  it('enforces exact byte, UTF-8 filename, request-ID, and schema boundaries', async () => {
    expect(isImportWorkerByteLengthAllowed(1)).toBe(true);
    expect(isImportWorkerByteLengthAllowed(IMPORT_WORKER_MAX_INPUT_BYTES)).toBe(true);
    expect(isImportWorkerByteLengthAllowed(0)).toBe(false);
    expect(isImportWorkerByteLengthAllowed(IMPORT_WORKER_MAX_INPUT_BYTES + 1)).toBe(false);
    expect(isImportWorkerByteLengthAllowed(Number.NaN)).toBe(false);
    expect(isImportWorkerByteLengthAllowed(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isImportWorkerByteLengthAllowed(1.5)).toBe(false);

    const acceptedAscii = parseImportExportSandboxWorkerRequest(validEnvelope({ fileName: 'a'.repeat(IMPORT_WORKER_MAX_FILE_NAME_BYTES) }));
    expect(acceptedAscii.fileName.length).toBe(IMPORT_WORKER_MAX_FILE_NAME_BYTES);
    const acceptedUtf8 = parseImportExportSandboxWorkerRequest(validEnvelope({ fileName: '💠'.repeat(IMPORT_WORKER_MAX_FILE_NAME_BYTES / 4) }));
    expect(new TextEncoder().encode(acceptedUtf8.fileName).byteLength).toBe(IMPORT_WORKER_MAX_FILE_NAME_BYTES);
    expectParserError(() => parseImportExportSandboxWorkerRequest(validEnvelope({ fileName: 'a'.repeat(IMPORT_WORKER_MAX_FILE_NAME_BYTES + 1) })), 'IMPORT_REQUEST_FILENAME_REJECTED');
    expectParserError(() => parseImportExportSandboxWorkerRequest(validEnvelope({ fileName: '💠'.repeat(IMPORT_WORKER_MAX_FILE_NAME_BYTES / 4 + 1) })), 'IMPORT_REQUEST_FILENAME_REJECTED');
    expectParserError(() => parseImportExportSandboxWorkerRequest(validEnvelope({ fileName: 'line\nbreak.json' })), 'IMPORT_REQUEST_FILENAME_REJECTED');
    expect(parseImportExportSandboxWorkerRequest(validEnvelope({ bytes: new ArrayBuffer(1) })).bytes.byteLength).toBe(1);
    expectParserError(() => parseImportExportSandboxWorkerRequest(validEnvelope({ bytes: new Uint8Array([1]) })), 'IMPORT_REQUEST_BYTES_REJECTED');
    expectParserError(() => parseImportExportSandboxWorkerRequest(validEnvelope({ bytes: { length: Number.MAX_SAFE_INTEGER } })), 'IMPORT_REQUEST_BYTES_REJECTED');
    expectParserError(() => parseImportExportSandboxWorkerRequest(validEnvelope({ bytes: new ArrayBuffer(0) })), 'IMPORT_REQUEST_SIZE_REJECTED');
    expectParserError(() => parseImportExportSandboxWorkerRequest(validEnvelope({ id: '00000000000040008000000000000001' })), 'IMPORT_REQUEST_ID_REJECTED');
    expectParserError(() => parseImportExportSandboxWorkerRequest(validEnvelope({ id: '00000000-0000-4000-8000-00000000000A' })), 'IMPORT_REQUEST_ID_REJECTED');
    expectParserError(() => parseImportExportSandboxWorkerRequest({ ...validEnvelope(), extra: true }), 'IMPORT_REQUEST_SCHEMA_REJECTED');

    const malformedReply = await dispatchWorkerMessage(null);
    expect(malformedReply).toEqual({ id: '', ok: false, error: 'IMPORT_REQUEST_SCHEMA_REJECTED' });
  });
});
