// STATUS: GOLD — deterministic, bounded hostile-input mutation slice for SEC-096.
// This is intentionally partial and does not claim complete parser inventory coverage.
import { describe, expect, it } from 'vitest';
import { parseHostileJson } from '../../shared/security/hostileJson';
import { VwcBoundedError, fuzzParseVwc, inspectVwcContainer } from '../../platform/containers/vwcStorage';
import { parseCanonicalRenderTreeJson, type RenderInputEvidence } from '../../platform/rendering/renderBoundary';
import { parseSearchQuery } from '../../platform/search/searchQueryCore';
import {
  fuzzBoundedShellIngress,
  normalizeShellOpenIngress,
  parseShellDeepLink,
  type ShellOpenIngress,
} from '../../shell/home/workspaceShellHomeCore';
import {
  extractElementFragments,
  extractStartTags,
  extractTextNodes,
  inspectBoundedForeignXml,
  readAttribute,
} from '../../shared/interoperability/xml';
import { normalizeZipEntryName, readZip, utf8, writeStoredZip } from '../../platform/interop/zip';

const MUTATION_CASES = 4_096;
const FORBIDDEN_PANIC_MESSAGE = /maximum call stack|stack overflow|out of memory|recursion limit/iu;
const HOSTILE_FRAGMENTS = Object.freeze([
  '\u0000',
  '"',
  "'",
  '../',
  '%2e%2e%2f',
  '__proto__',
  'constructor',
  '<!DOCTYPE x [<!ENTITY y "z">]>',
  '&xxe;',
  '\\',
]);

function deterministicWord(index: number): number {
  let value = (0x9e3779b9 ^ index) >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return value >>> 0;
}

function mutateText(base: string, index: number, maxChars: number): string {
  const word = deterministicWord(index);
  const fragment = HOSTILE_FRAGMENTS[(word >>> 4) % HOSTILE_FRAGMENTS.length]!;
  const position = base.length === 0 ? 0 : word % base.length;
  let candidate: string;

  switch (index % 8) {
    case 0:
      candidate = `${base.slice(0, position)}${base.slice(position + 1)}`;
      break;
    case 1: {
      const original = base[position] ?? 'x';
      const replacement = String.fromCharCode(original.charCodeAt(0) ^ 1);
      candidate = `${base.slice(0, position)}${replacement}${base.slice(position + 1)}`;
      break;
    }
    case 2:
      candidate = `${base.slice(0, position)}${fragment}${base.slice(position)}`;
      break;
    case 3:
      candidate = `${fragment}${base}`;
      break;
    case 4:
      candidate = `${base}${fragment}`;
      break;
    case 5:
      candidate = `${base.slice(0, position)}${base.slice(position, position + 1)}${base.slice(position)}`;
      break;
    case 6:
      candidate = `${fragment}:${index}:${base}`;
      break;
    default: {
      const depth = 1 + (word % 80);
      candidate = `${'['.repeat(depth)}0${']'.repeat(depth)}`;
      break;
    }
  }

  if (candidate === base) candidate = `${base}!`;
  return candidate.slice(0, maxChars);
}

function mutateBytes(base: Uint8Array, index: number, maxBytes: number): Uint8Array {
  const word = deterministicWord(index);
  const position = word % Math.max(1, base.byteLength);
  let candidate: Uint8Array;

  switch (index % 8) {
    case 0: {
      candidate = base.slice();
      candidate[position] = candidate[position]! ^ (1 << (word % 8));
      break;
    }
    case 1:
      candidate = base.slice(0, word % Math.max(1, base.byteLength));
      break;
    case 2:
      candidate = new Uint8Array([...base, word & 0xff]);
      break;
    case 3: {
      const insertAt = word % (base.byteLength + 1);
      candidate = new Uint8Array(base.byteLength + 1);
      candidate.set(base.subarray(0, insertAt));
      candidate[insertAt] = (word >>> 8) & 0xff;
      candidate.set(base.subarray(insertAt), insertAt + 1);
      break;
    }
    case 4: {
      candidate = base.slice();
      candidate[position] = candidate[position]! ^ 0xff;
      break;
    }
    case 5: {
      const fragmentLength = 1 + (word % Math.min(8, base.byteLength));
      const fragment = base.slice(position, Math.min(base.byteLength, position + fragmentLength));
      candidate = new Uint8Array([...base, ...fragment]);
      break;
    }
    case 6: {
      const randomLength = 1 + (word % 64);
      candidate = new Uint8Array(randomLength);
      let state = word;
      for (let offset = 0; offset < randomLength; offset += 1) {
        state = (Math.imul(state ^ (state >>> 15), 1 | state) + 0x6d2b79f5) >>> 0;
        candidate[offset] = (state ^ (state >>> 7) ^ (state >>> 14)) & 0xff;
      }
      break;
    }
    default:
      candidate = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...base]);
      break;
  }

  return candidate.slice(0, maxBytes);
}

type MutationTally = { accepted: number; rejected: number };

function runTextMutations(
  label: string,
  base: string,
  maxChars: number,
  parser: (input: string) => unknown,
  verifyAccepted?: (result: unknown) => void,
  expectedRejection?: RegExp,
): MutationTally {
  let accepted = 0;
  let rejected = 0;
  let dispatched = 0;

  for (let index = 0; index < MUTATION_CASES; index += 1) {
    const input = mutateText(base, index, maxChars);
    expect(input.length, `${label} input ${index} must remain capped`).toBeLessThanOrEqual(maxChars);
    dispatched += 1;
    try {
      const result = parser(input);
      accepted += 1;
      verifyAccepted?.(result);
    } catch (error) {
      assertControlledParserRejection(error, label, index, expectedRejection);
      rejected += 1;
    }
  }

  expect(dispatched, `${label} dispatched case count`).toBe(MUTATION_CASES);
  expect(accepted + rejected, `${label} accounted case count`).toBe(MUTATION_CASES);
  return { accepted, rejected };
}

function assertControlledParserRejection(
  error: unknown,
  label: string,
  index: number,
  expectedMessage?: RegExp,
): asserts error is Error {
  if (!(error instanceof Error)) throw new Error(`${label} case ${index} threw a non-Error value`);
  if (error instanceof RangeError || error instanceof TypeError) {
    throw new Error(`${label} case ${index} escaped through ${error.name}: ${error.message}`);
  }
  if (FORBIDDEN_PANIC_MESSAGE.test(error.message)) {
    throw new Error(`${label} case ${index} exposed a panic-like failure: ${error.message}`);
  }
  if (!expectedMessage || !expectedMessage.test(error.message)) {
    throw new Error(`${label} case ${index} threw an unclassified parser error: ${error.message}`);
  }
  expect(error.message.length, `${label} case ${index} rejection must be bounded`).toBeLessThanOrEqual(256);
}

function reportTally(label: string, tally: MutationTally, dispatched = MUTATION_CASES): void {
  expect(tally.accepted + tally.rejected, `${label} reported case count`).toBe(dispatched);
  console.info(`[SEC-096 partial] ${label}: ${dispatched} cases; accepted=${tally.accepted}; controlled-rejected=${tally.rejected}`);
}

function makeVwcFixture(): Uint8Array {
  const metadata = utf8('{"header_schema_version":1}');
  const manifest = utf8('{}');
  const payload = new Uint8Array([0x41, 0x42, 0x43, 0x44]);
  const output = new Uint8Array(12 + metadata.byteLength + 4 + manifest.byteLength + 4 + 18 + payload.byteLength);
  const view = new DataView(output.buffer);
  output.set(utf8('VWC1'), 0);
  view.setUint16(4, 3, true);
  view.setUint16(6, 1, true);
  view.setUint32(8, metadata.byteLength, true);
  output.set(metadata, 12);
  let offset = 12 + metadata.byteLength;
  view.setUint32(offset, manifest.byteLength, true);
  offset += 4;
  output.set(manifest, offset);
  offset += manifest.byteLength;
  view.setUint32(offset, 1, true);
  offset += 4;
  output[offset] = 0;
  output[offset + 1] = 0;
  view.setUint32(offset + 14, payload.byteLength, true);
  output.set(payload, offset + 18);
  return output;
}

function makeZipFixture(): Uint8Array {
  return writeStoredZip([{ name: 'folder/report.xml', data: utf8('<report>safe</report>') }]);
}

function makeInvalidUtf8ZipFixture(): Uint8Array {
  const archive = makeZipFixture();
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  const eocdOffset = archive.byteLength - 22;
  const centralDirectoryOffset = view.getUint32(eocdOffset + 16, true);
  archive[30] = 0xff;
  archive[centralDirectoryOffset + 46] = 0xff;
  return archive;
}

const RENDER_EVIDENCE: RenderInputEvidence = Object.freeze({
  authenticity: 'verified',
  integrity: 'verified',
  policy: 'allowed',
  parser: 'validated',
});

const RENDER_TREE_FIXTURE = JSON.stringify({
  version: 1,
  documentId: 'mutation-fixture',
  pages: [{
    id: 'page-1',
    geometry: {
      width: 816,
      height: 1056,
      margins: { top: 48, right: 48, bottom: 48, left: 48 },
      bodyWidth: 720,
      bodyHeight: 960,
      columns: { count: 1, gap: 0, widths: [720], offsets: [0] },
    },
    primitives: [{ kind: 'text', x: 12, y: 24, text: 'bounded fixture' }],
  }],
});

const SAFE_ZIP_LIMITS = Object.freeze({
  maxEntries: 8,
  maxEntryBytes: 1024,
  maxTotalUncompressedBytes: 2048,
  maxCompressionRatio: 20,
  maxElapsedMs: 1000,
});

describe('SEC-096 bounded parser mutation slice (partial)', () => {
  it('dispatches 4,096 bounded hostile JSON mutations and rejects only through controlled errors', () => {
    const tally = runTextMutations(
      'parseHostileJson',
      '{"safe":{"items":[1,"two",false]},"__proto__":{"polluted":true}}',
      1024,
      (input) => parseHostileJson(input, {
        maxBytes: 2048,
        maxDepth: 48,
        maxNodes: 4096,
        maxStringChars: 1024,
        maxObjectKeys: 512,
        maxArrayItems: 512,
      }),
      (result) => {
        expect(Object.prototype).not.toHaveProperty('polluted');
        if (result && typeof result === 'object' && !Array.isArray(result)) {
          expect(Object.keys(result)).not.toContain('__proto__');
          expect(Object.keys(result)).not.toContain('constructor');
          expect(Object.keys(result)).not.toContain('prototype');
        }
      },
      /^HOSTILE_JSON_[A-Z_]+$/u,
    );
    reportTally('parseHostileJson', tally);
  });

  it('runs 4,096 VWC byte mutations through both the structural inspector and fuzz result API', () => {
    const fixture = makeVwcFixture();
    const knownCodes = new Set([
      'container-too-large', 'truncated', 'invalid-magic', 'unsupported-format-version',
      'unsupported-crypto-version', 'metadata-too-large', 'metadata-invalid',
      'manifest-too-large', 'manifest-invalid', 'too-many-chunks', 'chunk-too-large', 'trailing-bytes',
    ]);
    let inspectAccepted = 0;
    let inspectRejected = 0;
    let fuzzAccepted = 0;
    let fuzzRejected = 0;

    for (let index = 0; index < MUTATION_CASES; index += 1) {
      const input = mutateBytes(fixture, index, 512);
      expect(input.byteLength, `VWC input ${index} must remain capped`).toBeLessThanOrEqual(512);
      try {
        const result = inspectVwcContainer(input);
        inspectAccepted += 1;
        expect(result.chunks.length).toBe(result.chunkCount);
        for (const chunk of result.chunks) {
          expect(chunk.payloadOffset + chunk.encryptedLength).toBeLessThanOrEqual(input.byteLength);
        }
      } catch (error) {
        if (!(error instanceof VwcBoundedError)) {
          throw new Error(`inspectVwcContainer case ${index} escaped through ${error instanceof Error ? error.name : typeof error}`);
        }
        expect(knownCodes.has(error.code), `VWC rejection code at case ${index}`).toBe(true);
        inspectRejected += 1;
      }

      const fuzzResult = fuzzParseVwc(input);
      expect(typeof fuzzResult.ok, `fuzzParseVwc case ${index} result`).toBe('boolean');
      if (fuzzResult.ok) {
        fuzzAccepted += 1;
        expect(Number.isInteger(fuzzResult.formatVersion)).toBe(true);
        expect(Number.isInteger(fuzzResult.chunkCount)).toBe(true);
      } else {
        fuzzRejected += 1;
        expect(knownCodes.has(fuzzResult.errorCode ?? '')).toBe(true);
      }
    }

    expect(inspectAccepted + inspectRejected).toBe(MUTATION_CASES);
    expect(fuzzAccepted + fuzzRejected).toBe(MUTATION_CASES);
    reportTally('inspectVwcContainer', { accepted: inspectAccepted, rejected: inspectRejected });
    reportTally('fuzzParseVwc', { accepted: fuzzAccepted, rejected: fuzzRejected });
  });

  it('dispatches 4,096 bounded render-tree JSON mutations with verified input evidence', () => {
    const tally = runTextMutations(
      'parseCanonicalRenderTreeJson',
      RENDER_TREE_FIXTURE,
      2048,
      (input) => parseCanonicalRenderTreeJson(input, RENDER_EVIDENCE),
      (result) => {
        expect(result).toMatchObject({ version: 1 });
        expect((result as { pages: unknown[] }).pages.length).toBeGreaterThan(0);
        expect((result as { pages: unknown[] }).pages.length).toBeLessThanOrEqual(1);
      },
      /^render_(?:boundary|pipeline)_[a-z_]+$/u,
    );
    reportTally('parseCanonicalRenderTreeJson', tally);
  });

  it('dispatches 4,096 bounded advanced-search query mutations', () => {
    const tally = runTextMutations(
      'parseSearchQuery',
      'type:writer "quarterly plan" size>=8kb AND NOT draft*',
      2048,
      parseSearchQuery,
      (result) => {
        const plan = result as ReturnType<typeof parseSearchQuery>;
        expect(Array.isArray(plan.clauses)).toBe(true);
        expect(plan.clauses.length).toBeLessThanOrEqual(128);
        expect(typeof plan.nativeQuery).toBe('string');
      },
      /^(?:Search query|Unterminated quote|Invalid date search filter|Invalid size filter|Unknown search module:|Unknown sensitivity|Empty search (?:filter|term)|Too many search clauses)/u,
    );
    reportTally('parseSearchQuery', tally);
  });

  it('dispatches 4,096 bounded deep-link mutations and 4,096 direct open-ingress mutations', () => {
    const deepLinkTally = runTextMutations(
      'parseShellDeepLink',
      'vgt://workspace/document/doc-2026/object/heading-1',
      2048,
      parseShellDeepLink,
      (result) => {
        const link = result as ReturnType<typeof parseShellDeepLink>;
        expect(link.documentId.length).toBeLessThanOrEqual(256);
        expect(link.objectId?.length ?? 0).toBeLessThanOrEqual(256);
      },
      /^Deep link is (?:invalid|outside the Workspace namespace)$/u,
    );

    let ingressAccepted = 0;
    let ingressRejected = 0;
    let ingressDispatched = 0;
    for (let index = 0; index < MUTATION_CASES; index += 1) {
      const variant = index % 8;
      const ingress: ShellOpenIngress = {
        source: 'file-picker',
        name: variant === 0 || variant === 7
          ? 'quarterly-report.vdoc'
          : variant === 1 ? '../quarterly-report.vdoc'
            : variant === 2 ? 'bad/name.vdoc'
              : variant === 3 ? `bad\u0000name-${index}.vdoc`
                : variant === 4 ? ''
                  : variant === 5 ? 'x'.repeat(256)
                    : 'quarterly-report.vdoc',
        sizeBytes: variant === 6 ? Number.POSITIVE_INFINITY : variant === 2 ? 0 : 1024,
      };
      ingressDispatched += 1;
      try {
        const normalized = normalizeShellOpenIngress(ingress);
        ingressAccepted += 1;
        expect(normalized.name).not.toMatch(/[\\/\u0000-\u001f]/u);
        expect(normalized.sizeBytes).toBeGreaterThan(0);
      } catch (error) {
        assertControlledParserRejection(error, 'normalizeShellOpenIngress', index, /^(?:Open file name|Open file exceeds)/u);
        ingressRejected += 1;
      }
    }
    expect(ingressDispatched).toBe(MUTATION_CASES);
    expect(ingressAccepted + ingressRejected).toBe(MUTATION_CASES);

    const fuzzInputs: unknown[] = [];
    for (let index = 0; index < MUTATION_CASES; index += 1) {
      switch (index % 8) {
        case 0:
          fuzzInputs.push({ source: 'file-picker', name: `report-${index}.vdoc`, sizeBytes: 1024 });
          break;
        case 1:
          fuzzInputs.push({ source: 'file-picker', name: `../report-${index}.vdoc`, sizeBytes: 1024 });
          break;
        case 2:
          fuzzInputs.push({ source: 'file-picker', name: `report-${index}.vdoc`, sizeBytes: 0 });
          break;
        case 3:
          fuzzInputs.push(null);
          break;
        case 4:
          fuzzInputs.push(`report-${index}.vdoc`);
          break;
        case 5:
          fuzzInputs.push(index);
          break;
        case 6:
          fuzzInputs.push([]);
          break;
        default:
          fuzzInputs.push({ source: 'file-picker', name: index, sizeBytes: 1024 });
      }
    }
    const ingressFuzz = fuzzBoundedShellIngress(fuzzInputs);
    expect(fuzzInputs.length).toBe(MUTATION_CASES);
    expect(ingressFuzz.accepted).toBe(MUTATION_CASES / 8);
    expect(ingressFuzz.rejected).toBe(MUTATION_CASES - MUTATION_CASES / 8);
    let fuzzNormalizerCalls = 0;
    let fuzzNormalizerAccepted = 0;
    let fuzzNormalizerRejected = 0;
    let fuzzPrecheckRejected = 0;
    for (let index = 0; index < fuzzInputs.length; index += 1) {
      const item = fuzzInputs[index];
      if (!item || typeof item !== 'object') {
        fuzzPrecheckRejected += 1;
        continue;
      }
      fuzzNormalizerCalls += 1;
      try {
        normalizeShellOpenIngress(item as ShellOpenIngress);
        fuzzNormalizerAccepted += 1;
      } catch (error) {
        assertControlledParserRejection(error, 'fuzzBoundedShellIngress delegated normalizer', index, /^(?:Open file name|Open file exceeds)/u);
        fuzzNormalizerRejected += 1;
      }
    }
    expect(fuzzNormalizerCalls).toBe(MUTATION_CASES * 5 / 8);
    expect(fuzzNormalizerAccepted).toBe(ingressFuzz.accepted);
    expect(fuzzNormalizerRejected + fuzzPrecheckRejected).toBe(ingressFuzz.rejected);
    reportTally('parseShellDeepLink', deepLinkTally);
    reportTally('normalizeShellOpenIngress', { accepted: ingressAccepted, rejected: ingressRejected });
    reportTally('fuzzBoundedShellIngress input entries', { accepted: ingressFuzz.accepted, rejected: ingressFuzz.rejected });
    reportTally(
      'fuzzBoundedShellIngress delegated normalizer',
      { accepted: fuzzNormalizerAccepted, rejected: fuzzNormalizerRejected },
      fuzzNormalizerCalls,
    );
    console.info(`[SEC-096 partial] fuzzBoundedShellIngress precheck-rejected (non-object): ${fuzzPrecheckRejected}`);
  });

  it('dispatches 4,096 bounded ZIP-name mutations and 4,096 ZIP archive byte mutations', async () => {
    const nameTally = runTextMutations(
      'normalizeZipEntryName',
      'folder/report.xml',
      1024,
      normalizeZipEntryName,
      (result) => {
        const normalized = result as string;
        expect(typeof normalized).toBe('string');
        expect(normalized).not.toMatch(/^(?:\/|[A-Za-z]:)/u);
        expect(normalized).not.toMatch(/[\\\u0000]/u);
        expect(normalized).not.toContain('//');
        const body = normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
        const segments = body.split('/');
        expect(segments.length).toBeGreaterThan(0);
        expect(segments.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..')).toBe(true);
      },
      /^ZIP /u,
    );

    const fixture = makeZipFixture();
    await expect(readZip(makeInvalidUtf8ZipFixture(), SAFE_ZIP_LIMITS))
      .rejects.toThrow(/^ZIP entry name is not valid UTF-8$/u);
    let archiveAccepted = 0;
    let archiveRejected = 0;
    let archiveDispatched = 0;
    for (let index = 0; index < MUTATION_CASES; index += 1) {
      const input = mutateBytes(fixture, index, 512);
      expect(input.byteLength, `readZip input ${index} must remain capped`).toBeLessThanOrEqual(512);
      archiveDispatched += 1;
      try {
        const entries = await readZip(input, SAFE_ZIP_LIMITS);
        archiveAccepted += 1;
        expect(entries.size).toBeLessThanOrEqual(SAFE_ZIP_LIMITS.maxEntries);
        for (const [name, data] of entries) {
          expect(name.length).toBeLessThanOrEqual(4096);
          expect(data.byteLength).toBeLessThanOrEqual(SAFE_ZIP_LIMITS.maxEntryBytes);
        }
      } catch (error) {
        assertControlledParserRejection(error, 'readZip', index, /^(?:ZIP |Multi-disk ZIP|Encrypted ZIP|Unsupported ZIP|DEFLATE )/u);
        archiveRejected += 1;
      }
    }
    expect(archiveDispatched).toBe(MUTATION_CASES);
    expect(archiveAccepted + archiveRejected).toBe(MUTATION_CASES);
    reportTally('normalizeZipEntryName', nameTally);
    reportTally('readZip', { accepted: archiveAccepted, rejected: archiveRejected });
  });

  it('dispatches 4,096 bounded hostile XML mutations through each selected public XML boundary', () => {
    const fixture = '<root><item name="stable">text&amp;value</item></root>';
    const xmlTally = runTextMutations(
      'inspectBoundedForeignXml',
      fixture,
      2048,
      (input) => inspectBoundedForeignXml(input),
      undefined,
      /^Foreign XML /u,
    );
    const fragmentsTally = runTextMutations(
      'extractElementFragments',
      fixture,
      2048,
      (input) => extractElementFragments(input, 'item'),
      (result) => {
        expect(Array.isArray(result)).toBe(true);
        expect((result as string[]).length).toBeLessThanOrEqual(10_000);
      },
    );
    const startTagsTally = runTextMutations(
      'extractStartTags',
      fixture,
      2048,
      (input) => extractStartTags(input, 'item'),
      (result) => {
        expect(Array.isArray(result)).toBe(true);
        expect((result as string[]).length).toBeLessThanOrEqual(10_000);
      },
    );
    const textNodesTally = runTextMutations(
      'extractTextNodes',
      fixture,
      2048,
      (input) => extractTextNodes(input, 'item'),
      (result) => {
        expect(Array.isArray(result)).toBe(true);
        for (const text of result as string[]) expect(text.length).toBeLessThanOrEqual(2048);
      },
    );
    const attributeTally = runTextMutations(
      'readAttribute',
      '<item name="stable" data-value="1">',
      2048,
      (input) => readAttribute(input, 'name'),
      (result) => expect(result === null || typeof result === 'string').toBe(true),
    );

    reportTally('inspectBoundedForeignXml', xmlTally);
    reportTally('extractElementFragments', fragmentsTally);
    reportTally('extractStartTags', startTagsTally);
    reportTally('extractTextNodes', textNodesTally);
    reportTally('readAttribute', attributeTally);
  });
});
