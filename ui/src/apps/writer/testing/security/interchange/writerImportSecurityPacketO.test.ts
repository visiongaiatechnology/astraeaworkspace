// STATUS: DIAMANT VGT SUPREME — Writer Packet O: hostile-input import boundaries.
import { describe, expect, it } from 'vitest';
import { readZip, utf8, writeStoredZip } from '../../../../../platform/interop/zip';
import { importDocxXml, importOdtXml, importRtf } from '../../../interchange/import/writerImporter';
import { WriterImportBudget } from '../../../interchange/import/security/writerImportSecurity';

function replaceAscii(bytes: Uint8Array, needle: string, replacement: string, maxReplacements = Number.POSITIVE_INFINITY): Uint8Array {
  if (needle.length !== replacement.length) throw new Error('Replacement must preserve ZIP structure length');
  const out = bytes.slice();
  const enc = new TextEncoder();
  const from = enc.encode(needle);
  const to = enc.encode(replacement);
  let replacements = 0;
  for (let i = 0; i <= out.length - from.length && replacements < maxReplacements; i++) {
    let matches = true;
    for (let j = 0; j < from.length; j++) if (out[i + j] !== from[j]) { matches = false; break; }
    if (!matches) continue;
    out.set(to, i);
    replacements++;
    i += from.length - 1;
  }
  return out;
}

describe('Packet O — hostile Writer import boundaries', () => {
  it('enforces deterministic time and work budgets', () => {
    let now = 0;
    const budget = new WriterImportBudget({ maxElapsedMs: 10, maxOperations: 2, now: () => now });
    budget.assertSource('safe', 'test');
    budget.tick('test');
    budget.tick('test');
    expect(() => budget.tick('test')).toThrow();
    now = 11;
    expect(() => budget.finish('test')).toThrow();
  });

  it('rejects deeply nested markup, DTD/entities and deeply nested RTF groups', () => {
    const deepXml = `${'<x>'.repeat(129)}ok${'</x>'.repeat(129)}`;
    expect(() => importDocxXml(deepXml)).toThrow();
    expect(() => importOdtXml('<!DOCTYPE x [<!ENTITY e "boom">]><office:document-content>&e;</office:document-content>')).toThrow();
    expect(() => importRtf(`{\\rtf1${'{'.repeat(129)}x${'}'.repeat(129)}}`)).toThrow();
  });

  it('accepts valid deterministic ZIPs and rejects duplicate-name ambiguity', async () => {
    const valid = writeStoredZip([{ name: 'a.txt', data: utf8('alpha') }]);
    const read = await readZip(valid, { maxElapsedMs: 1_000 });
    expect(new TextDecoder().decode(read.get('a.txt'))).toBe('alpha');

    const duplicate = writeStoredZip([
      { name: 'same.txt', data: utf8('one') },
      { name: 'same.txt', data: utf8('two') },
    ]);
    await expect(readZip(duplicate)).rejects.toThrow();
  });

  it('rejects ZIP path traversal, central/local ambiguity and payload checksum tampering', async () => {
    const base = writeStoredZip([{ name: 'x.txt', data: utf8('hello') }]);
    const traversal = replaceAscii(base, 'x.txt', '../x/');
    await expect(readZip(traversal)).rejects.toThrow();

    const headerMismatch = replaceAscii(base, 'x.txt', 'y.txt', 1);
    await expect(readZip(headerMismatch)).rejects.toThrow();

    const payloadTamper = base.slice();
    const encoded = new TextEncoder().encode('hello');
    for (let i = 0; i <= payloadTamper.length - encoded.length; i++) {
      let matches = true;
      for (let j = 0; j < encoded.length; j++) if (payloadTamper[i + j] !== encoded[j]) { matches = false; break; }
      if (!matches) continue;
      payloadTamper[i] ^= 0x01;
      break;
    }
    await expect(readZip(payloadTamper)).rejects.toThrow();
  });
});
