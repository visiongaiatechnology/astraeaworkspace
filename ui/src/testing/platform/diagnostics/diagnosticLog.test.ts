import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearDiagnosticLogs,
  DIAGNOSTIC_RING_CAPACITY,
  listDiagnosticLogs,
  writeDiagnosticLog,
} from '../../../platform/diagnostics/diagnosticLog';

const STORAGE_KEY = 'astraea.workspace.diagnostics.ring.v1';
const MAX_RING_BYTES = 128 * 1024;
const MAX_DIAGNOSTIC_TEXT = 2_048;
const MAX_LABEL_LENGTH = 96;
const MAX_TIMESTAMP_LENGTH = 64;

class MemoryStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

const storage = new MemoryStorage();

const validEntry = (sequence = 1, message = 'safe diagnostic') => ({
  sequence,
  timestamp: '2026-09-30T00:00:00.000Z',
  level: 'info',
  component: 'diagnostics',
  event_id: 'TEST_EVENT',
  message,
});

function listRaw(raw: string) {
  clearDiagnosticLogs();
  storage.setItem(STORAGE_KEY, raw);
  return listDiagnosticLogs(DIAGNOSTIC_RING_CAPACITY);
}

function rawAtUtf8Bytes(raw: string, targetBytes: number): string {
  const byteLength = new TextEncoder().encode(raw).byteLength;
  if (byteLength > targetBytes) throw new Error('test raw exceeds requested size');
  return `${raw}${' '.repeat(targetBytes - byteLength)}`;
}

describe('persisted diagnostic ring boundary', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', storage);
    clearDiagnosticLogs();
  });

  afterEach(() => {
    clearDiagnosticLogs();
    vi.unstubAllGlobals();
  });

  it('accounts exactly 4,096 deterministic mutations through listDiagnosticLogs', () => {
    const casesPerFamily = 256;
    const familyCount = 16;
    const mutationCaseCount = familyCount * casesPerFamily;
    expect(mutationCaseCount).toBe(4096);
    const distinctRawInputs = new Set<string>();
    let accepted = 0;
    let rejected = 0;
    for (let caseIndex = 0; caseIndex < mutationCaseCount; caseIndex += 1) {
      const family = Math.floor(caseIndex / casesPerFamily);
      const variant = caseIndex % casesPerFamily;
      const sequence = variant + 1;
      let raw: string;
      let expectedLength: number;
      switch (family) {
        case 0:
          raw = JSON.stringify([validEntry(sequence, `valid-${variant}`)]);
          expectedLength = 1;
          break;
        case 1:
          raw = JSON.stringify([validEntry(sequence * 2, `pair-a-${variant}`), validEntry(sequence * 2 + 1, `pair-b-${variant}`)]);
          expectedLength = 2;
          break;
        case 2:
          raw = `{not-json-${variant}`;
          expectedLength = 0;
          break;
        case 3:
          raw = JSON.stringify({ entries: [validEntry(sequence)], mutation: variant });
          expectedLength = 0;
          break;
        case 4: {
          const incomplete: Record<string, unknown> = { ...validEntry(sequence), component: `missing-message-${variant}` };
          delete incomplete.message;
          raw = JSON.stringify([incomplete]);
          expectedLength = 0;
          break;
        }
        case 5:
          raw = JSON.stringify([{ ...validEntry(sequence), level: `trace-${variant}` }]);
          expectedLength = 1;
          break;
        case 6:
          raw = JSON.stringify([{ ...validEntry(sequence), component: 'c'.repeat(MAX_LABEL_LENGTH + 1 + variant), event_id: `event-${variant}` }]);
          expectedLength = 1;
          break;
        case 7:
          raw = JSON.stringify([{ ...validEntry(sequence), message: 'm'.repeat(MAX_DIAGNOSTIC_TEXT + 1 + variant) }]);
          expectedLength = 1;
          break;
        case 8:
          raw = JSON.stringify([{ ...validEntry(variant === 0 ? 0 : -variant), message: `invalid-nonpositive-${variant}` }]);
          expectedLength = 0;
          break;
        case 9:
          raw = JSON.stringify([{ ...validEntry(variant + 0.5), message: `invalid-fraction-${variant}` }]);
          expectedLength = 0;
          break;
        case 10:
          raw = JSON.stringify([{ ...validEntry(1), message: `invalid-infinite-${variant}` }]).replace('"sequence":1,', '"sequence":1e400,');
          expectedLength = 0;
          break;
        case 11:
          raw = JSON.stringify([validEntry(sequence, `first-${variant}`), validEntry(sequence, `later-${variant}`)]);
          expectedLength = 1;
          break;
        case 12:
          raw = JSON.stringify([{ ...validEntry(sequence), message: `password=secret-${variant} api_key=token-${variant}` }]);
          expectedLength = 1;
          break;
        case 13: {
          const nested: Record<string, unknown> = { marker: variant };
          for (let depth = 0; depth < variant % 9; depth += 1) nested[`level-${depth}`] = { marker: variant, parent: nested[`level-${depth - 1}`] };
          const detail = variant % 3 === 0
            ? Array.from({ length: 1 + (variant % 300) }, (_, index) => ({ index, marker: variant }))
            : variant % 3 === 1
              ? Object.fromEntries(Array.from({ length: 1 + (variant % 300) }, (_, index) => [`field-${index}`, variant]))
              : nested;
          raw = JSON.stringify([{ ...validEntry(sequence), context: { caseId: variant, shape: variant % 3, detail } }]);
          expectedLength = 1;
          break;
        }
        case 14: {
          const many = Array.from({ length: DIAGNOSTIC_RING_CAPACITY + 1 }, (_, index) => validEntry(variant * (DIAGNOSTIC_RING_CAPACITY + 1) + index + 1));
          raw = JSON.stringify(many);
          expectedLength = DIAGNOSTIC_RING_CAPACITY;
          break;
        }
        default:
          raw = JSON.stringify([{ ...validEntry(sequence), message: '🚀'.repeat(40_000 + variant) }]);
          expectedLength = 0;
          expect(raw.length).toBeLessThan(MAX_RING_BYTES);
          expect(new TextEncoder().encode(raw).byteLength).toBeGreaterThan(MAX_RING_BYTES);
          break;
      }
      expect(distinctRawInputs.has(raw), `mutation ${caseIndex} must be unique`).toBe(false);
      distinctRawInputs.add(raw);
      const entries = listRaw(raw);
      expect(entries, `mutation ${caseIndex} family ${family}`).toHaveLength(expectedLength);
      if (expectedLength > 0) accepted += 1;
      else rejected += 1;
      if (family === 6) expect(entries[0].component).toHaveLength(MAX_LABEL_LENGTH);
      if (family === 7) expect(entries[0].message).toHaveLength(MAX_DIAGNOSTIC_TEXT);
      if (family === 11) {
        expect(entries[0].sequence).toBe(sequence);
        expect(entries[0].message).toBe(`first-${variant}`);
      }
      if (family === 14) expect(entries[0].sequence).toBe(variant * (DIAGNOSTIC_RING_CAPACITY + 1) + 2);
      if (family === 12) expect(entries[0].message).toContain('[REDACTED_SECRET]');
    }
    expect(distinctRawInputs.size).toBe(4096);
    expect({ accepted, rejected }).toEqual({ accepted: 2304, rejected: 1792 });
  });

  it('enforces exact serialized byte and ring-entry boundaries', () => {
    const oneEntry = JSON.stringify([{ ...validEntry(), message: '🚀'.repeat(12) }]);
    const exactRaw = rawAtUtf8Bytes(oneEntry, MAX_RING_BYTES);
    expect(new TextEncoder().encode(exactRaw).byteLength).toBe(MAX_RING_BYTES);
    expect(listRaw(exactRaw)).toHaveLength(1);

    const encoderSpy = vi.spyOn(TextEncoder.prototype, 'encode');
    expect(listRaw(`${exactRaw} `)).toHaveLength(0);
    expect(encoderSpy).not.toHaveBeenCalled();
    encoderSpy.mockRestore();

    const exactEntries = Array.from({ length: DIAGNOSTIC_RING_CAPACITY }, (_, index) => validEntry(index + 1));
    expect(listRaw(JSON.stringify(exactEntries))).toHaveLength(DIAGNOSTIC_RING_CAPACITY);
    expect(listDiagnosticLogs()).toHaveLength(64);
    const overEntries = [...exactEntries, validEntry(DIAGNOSTIC_RING_CAPACITY + 1)];
    const retained = listRaw(JSON.stringify(overEntries));
    expect(retained).toHaveLength(DIAGNOSTIC_RING_CAPACITY);
    expect(retained[0].sequence).toBe(2);
  });

  it('bounds loaded string/context values and rejects duplicate or unsafe sequences', () => {
    const oversized = {
      ...validEntry(),
      timestamp: 't'.repeat(100),
      component: 'c'.repeat(MAX_LABEL_LENGTH + 1),
      event_id: 'e'.repeat(MAX_LABEL_LENGTH + 1),
      message: 'm'.repeat(MAX_DIAGNOSTIC_TEXT + 1),
      context: { items: Array.from({ length: 300 }, (_, index) => index), nested: { secret: 'must redact' } },
    };
    const entry = listRaw(JSON.stringify([oversized]))[0];
    expect(entry.timestamp).toHaveLength(MAX_TIMESTAMP_LENGTH);
    expect(entry.component).toHaveLength(MAX_LABEL_LENGTH);
    expect(entry.event_id).toHaveLength(MAX_LABEL_LENGTH);
    expect(entry.message).toHaveLength(MAX_DIAGNOSTIC_TEXT);
    expect((entry.context as { items: number[] }).items).toHaveLength(256);
    expect((entry.context as { nested: { secret: string } }).nested.secret).toBe('[REDACTED_SECRET]');

    const duplicate = listRaw(JSON.stringify([validEntry(5), validEntry(5, 'later duplicate') ]));
    expect(duplicate).toHaveLength(1);
    expect(duplicate[0].message).toBe('safe diagnostic');
    expect(listRaw(JSON.stringify([validEntry(Number.MAX_SAFE_INTEGER)]))).toHaveLength(1);
    const beforeWrite = listDiagnosticLogs(128);
    expect(beforeWrite[0].sequence).toBe(Number.MAX_SAFE_INTEGER);
    const written = writeDiagnosticLog({ level: 'info', component: 'diagnostics', eventId: 'ROLLOVER', message: 'sequence remains unique', now: new Date('2026-09-30T00:00:00.000Z') });
    expect(written?.sequence).toBe(2);
    expect(listDiagnosticLogs(128).map((candidate) => candidate.sequence)).toEqual([1, 2]);
  });

  it('keeps persisted writes within the same UTF-8 byte ceiling', () => {
    const written = writeDiagnosticLog({
      level: 'info',
      component: 'diagnostics',
      eventId: 'OVERSIZE_CONTEXT',
      message: 'bounded message',
      context: { details: Array.from({ length: 256 }, () => '🚀'.repeat(2_048)) },
      now: new Date('2026-09-30T00:00:00.000Z'),
    });
    expect(written).not.toBeNull();
    const persisted = storage.getItem(STORAGE_KEY) ?? '';
    expect(new TextEncoder().encode(persisted).byteLength).toBeLessThanOrEqual(MAX_RING_BYTES);
    const persistedEntries = JSON.parse(persisted) as Array<{ message: string; context?: unknown }>;
    expect(persistedEntries).toHaveLength(1);
    expect(persistedEntries[0].message).toBe('bounded message');
    expect(persistedEntries[0].context).toBe('[TRUNCATED_STORAGE_LIMIT]');
  });

  it('clamps finite limits and returns no records for zero or non-finite limits', () => {
    listRaw(JSON.stringify([validEntry(1), validEntry(2)]));
    expect(listDiagnosticLogs()).toHaveLength(2);
    expect(listDiagnosticLogs(1.9)).toHaveLength(1);
    expect(listDiagnosticLogs(0)).toHaveLength(0);
    expect(listDiagnosticLogs(-2)).toHaveLength(0);
    expect(listDiagnosticLogs(Number.NaN)).toHaveLength(0);
    expect(listDiagnosticLogs(Number.POSITIVE_INFINITY)).toHaveLength(0);
    expect(listDiagnosticLogs(Number.NEGATIVE_INFINITY)).toHaveLength(0);
  });
});
