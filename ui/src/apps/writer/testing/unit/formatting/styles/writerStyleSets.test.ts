// STATUS: DIAMANT VGT SUPREME — Writer style-set interchange verification
import { describe, expect, it } from 'vitest';
import { ensureWriterStyleCatalog } from '../../../../formatting/styles/writerStyles';
import {
  applyWriterStyleSet,
  createWriterStyleSet,
  parseWriterStyleSetJson,
  serializeWriterStyleSet,
  upsertWriterStyleSet,
  writerStyleSetFileName,
  WriterStyleSetValidationError,
  WRITER_STYLE_SET_MAX_BYTES,
} from '../../../../formatting/styles/writerStyleSets';

const catalog = () => ensureWriterStyleCatalog();

describe('Writer style sets', () => {
  it('creates a detached, versioned set and round-trips it through JSON', () => {
    const source = catalog();
    const styleSet = createWriterStyleSet('VGT Bericht', source, { id: 'vgt-report', now: 1_700_000_000_000 });
    source.paragraphStyles[0]!.fontSizePt = 72;

    const restored = parseWriterStyleSetJson(serializeWriterStyleSet(styleSet));
    expect(restored).toEqual(styleSet);
    expect(restored.catalog.paragraphStyles[0]!.fontSizePt).toBe(11);
    expect(writerStyleSetFileName(restored)).toBe('VGT-Bericht.vgtstyles.json');
  });

  it('applies a detached catalog and replaces matching IDs deterministically', () => {
    const first = createWriterStyleSet('Zulu', catalog(), { id: 'shared', now: 10 });
    const second = { ...first, name: 'Alpha', updatedAt: 11 };
    const applied = applyWriterStyleSet(second);
    applied.paragraphStyles[0]!.fontSizePt = 99;

    expect(upsertWriterStyleSet([first], second)).toEqual([second]);
    expect(second.catalog.paragraphStyles[0]!.fontSizePt).toBe(11);
  });

  it('rejects malformed, oversized, unsupported, and structurally hostile files', () => {
    expect(() => parseWriterStyleSetJson('{')).toThrow(WriterStyleSetValidationError);
    expect(() => parseWriterStyleSetJson('x'.repeat(WRITER_STYLE_SET_MAX_BYTES + 1))).toThrow(/1 MiB/u);

    const valid = createWriterStyleSet('Valid', catalog(), { id: 'valid', now: 100 });
    expect(() => parseWriterStyleSetJson(JSON.stringify({ ...valid, schemaVersion: 2 }))).toThrow(/Version/u);
    expect(() => parseWriterStyleSetJson(JSON.stringify({ ...valid, id: '../escape' }))).toThrow(/ID/u);
    expect(() => parseWriterStyleSetJson(JSON.stringify({ ...valid, name: ' '.repeat(10) }))).toThrow(/1 bis 80/u);

    const invalidColor = structuredClone(valid);
    invalidColor.catalog.tableStyles[0]!.borderColor = 'javascript:alert(1)';
    expect(() => parseWriterStyleSetJson(JSON.stringify(invalidColor))).toThrow(/Hex-Farbe/u);

    const invalidSize = structuredClone(valid);
    invalidSize.catalog.paragraphStyles[0]!.fontSizePt = Number.POSITIVE_INFINITY;
    expect(() => parseWriterStyleSetJson(JSON.stringify(invalidSize))).toThrow(WriterStyleSetValidationError);
  });

  it('rejects duplicate identities, broken linked references, and inheritance cycles', () => {
    const valid = createWriterStyleSet('Valid', catalog(), { id: 'valid', now: 100 });

    const duplicate = structuredClone(valid);
    duplicate.catalog.characterStyles.push({ ...duplicate.catalog.characterStyles[0]! });
    expect(() => parseWriterStyleSetJson(JSON.stringify(duplicate))).toThrow(/doppelt/u);

    const brokenLink = structuredClone(valid);
    brokenLink.catalog.linkedStyles[0]!.characterStyleId = 'missing';
    expect(() => parseWriterStyleSetJson(JSON.stringify(brokenLink))).toThrow(/unbekannte Referenz/u);

    const cycle = structuredClone(valid);
    cycle.catalog.paragraphStyles.find((style) => style.name === 'heading1')!.basedOn = 'heading2';
    cycle.catalog.paragraphStyles.find((style) => style.name === 'heading2')!.basedOn = 'heading1';
    expect(() => parseWriterStyleSetJson(JSON.stringify(cycle))).toThrow(/Vererbungszyklus/u);
  });
});
