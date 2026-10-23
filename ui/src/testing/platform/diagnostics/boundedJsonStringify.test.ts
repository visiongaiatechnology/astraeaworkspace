// STATUS: PLATIN — checks bounded JSON equivalence, UTF-8 accounting, and fail-closed object handling.
import { describe, expect, it } from 'vitest';
import { BoundedJsonSerializationError, stringifyJsonWithinUtf8ByteLimit } from '../../../platform/diagnostics/boundedJsonStringify';

const utf8Length = (value: string): number => new TextEncoder().encode(value).byteLength;

describe('stringifyJsonWithinUtf8ByteLimit', () => {
  it('matches compact and pretty JSON serialization for JSON-shaped workspace values', () => {
    const value = {
      integerLikeKeys: { '10': 'ten', '2': 'two', label: 'value' },
      nested: [null, true, false, 0, -0, 1e21, 1e-7, 'line\nquote"slash\\', 'astral 💾'],
      omitted: undefined,
      normalized: Number.NaN,
      loneSurrogates: '\ud800x\udfff',
    };

    expect(stringifyJsonWithinUtf8ByteLimit(value, 4096)).toBe(JSON.stringify(value));
    expect(stringifyJsonWithinUtf8ByteLimit(value, 4096, 2)).toBe(JSON.stringify(value, null, 2));
  });

  it('preserves valid surrogate pairs across internal chunk boundaries and counts UTF-8 bytes', () => {
    const value = { payload: `${'a'.repeat(1023)}💩${'b'.repeat(1023)}` };
    const serialized = stringifyJsonWithinUtf8ByteLimit(value, 4096);

    expect(serialized).toBe(JSON.stringify(value));
    expect(utf8Length(serialized)).toBeLessThanOrEqual(4096);
    expect(() => stringifyJsonWithinUtf8ByteLimit(value, utf8Length(serialized) - 1)).toThrowError(
      expect.objectContaining({ code: 'SIZE_LIMIT' }),
    );
  });

  it('rejects cycles, accessors, unsupported prototypes, and excessive graph depth without invoking accessors', () => {
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    let accessorCalls = 0;
    const accessor = Object.defineProperty({}, 'secret', {
      enumerable: true,
      get: () => { accessorCalls += 1; return 'value'; },
    });
    const customPrototype = Object.create({ inherited: 'value' }) as object;
    let deeplyNested: unknown = null;
    for (let index = 0; index < 130; index += 1) deeplyNested = [deeplyNested];

    expect(() => stringifyJsonWithinUtf8ByteLimit(cyclic, 1024)).toThrowError(
      expect.objectContaining({ code: 'CYCLE' }),
    );
    expect(() => stringifyJsonWithinUtf8ByteLimit(accessor, 1024)).toThrowError(
      expect.objectContaining({ code: 'ACCESSOR' }),
    );
    expect(() => stringifyJsonWithinUtf8ByteLimit(customPrototype, 1024)).toThrowError(
      expect.objectContaining({ code: 'UNSUPPORTED_VALUE' }),
    );
    expect(() => stringifyJsonWithinUtf8ByteLimit(deeplyNested, 4096)).toThrowError(
      expect.objectContaining({ code: 'DEPTH_LIMIT' }),
    );
    expect(accessorCalls).toBe(0);
  });

  it('rejects invalid output budgets and node-heavy graphs', () => {
    expect(() => stringifyJsonWithinUtf8ByteLimit({}, 0)).toThrowError(BoundedJsonSerializationError);
    expect(() => stringifyJsonWithinUtf8ByteLimit({}, 10, 4 as 0)).toThrowError(BoundedJsonSerializationError);
    expect(() => stringifyJsonWithinUtf8ByteLimit(Array.from({ length: 250_001 }, () => null), 2_000_000)).toThrowError(
      expect.objectContaining({ code: 'NODE_LIMIT' }),
    );
  });
});
