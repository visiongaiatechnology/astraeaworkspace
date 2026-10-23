// STATUS: DIAMANT VGT SUPREME — Writer page-decoration invariants
import { describe, expect, it } from 'vitest';
import type { WriterPageSetupConfig } from '../../../../../../shared/contracts/workspace';
import {
  resolveWriterPageBackgroundColor,
  validateWriterPageDecorations,
  writerPageBackgroundIsLight,
  writerPageDecorationSignature,
} from '../../../../../../shared/writer/layout/pageDecorations';

const setup: WriterPageSetupConfig = {
  paperSize: 'A4',
  orientation: 'portrait',
  margins: 'normal',
  paperColor: 'white',
  showPageNumbers: false,
  headerText: '',
  footerText: '',
};

describe('Writer page decorations', () => {
  it('resolves presets and custom section backgrounds deterministically', () => {
    expect(resolveWriterPageBackgroundColor(setup)).toBe('#FFFFFF');
    expect(resolveWriterPageBackgroundColor({ ...setup, paperColor: 'cream' })).toBe('#FCF8F2');
    expect(resolveWriterPageBackgroundColor({ ...setup, backgroundColor: '#123abc' })).toBe('#123ABC');
    expect(writerPageBackgroundIsLight({ ...setup, backgroundColor: '#F8FAFC' })).toBe(true);
    expect(writerPageBackgroundIsLight({ ...setup, backgroundColor: '#020617' })).toBe(false);
  });

  it('accepts a fully bounded background, border and watermark configuration', () => {
    expect(validateWriterPageDecorations({
      ...setup,
      backgroundColor: '#E2E8F0',
      pageBorders: { style: 'double', widthPt: 3, color: '#1E293B', paddingMm: 5 },
      watermark: { enabled: true, text: 'CONFIDENTIAL', opacity: 0.12, rotationDeg: -45, color: '#64748B' },
    })).toBeNull();
  });

  it.each([
    [{ backgroundColor: 'red' }, /Hintergrundfarbe/],
    [{ pageBorders: { style: 'solid', widthPt: 40, color: '#000000', paddingMm: 1 } }, /0–36 pt/],
    [{ pageBorders: { style: 'solid', widthPt: 1, color: '#000000', paddingMm: 51 } }, /0–50 mm/],
    [{ watermark: { enabled: true, text: '', opacity: 0.1, rotationDeg: 0, color: '#000000' } }, /1 bis 120/],
    [{ watermark: { enabled: true, text: 'x', opacity: 0.5, rotationDeg: 0, color: '#000000' } }, /deckkraft/],
  ] as const)('rejects invalid decoration boundaries', (patch, message) => {
    expect(validateWriterPageDecorations({ ...setup, ...patch })).toMatch(message);
  });

  it('treats decoration changes as incompatible continuous page shells', () => {
    expect(writerPageDecorationSignature(setup)).not.toBe(
      writerPageDecorationSignature({ ...setup, backgroundColor: '#F8FAFC' }),
    );
    expect(writerPageDecorationSignature(setup)).not.toBe(
      writerPageDecorationSignature({
        ...setup,
        watermark: { enabled: true, text: 'DRAFT', opacity: 0.08, rotationDeg: -45, color: '#94A3B8' },
      }),
    );
  });
});
