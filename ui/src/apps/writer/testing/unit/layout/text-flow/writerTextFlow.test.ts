// STATUS: DIAMANT VGT SUPREME — Paragraph direction and text-flow verification
import { describe, expect, it } from 'vitest';
import type { ParagraphStyle } from '../../../../../../shared/contracts/workspace';
import {
  normalizeWriterTextFlow,
  resolveWriterTextFlow,
  writerTextFlowCss,
} from '../../../../layout/text-flow/writerTextFlow';

const style: ParagraphStyle = {
  alignment: 'left',
  line_height: 1.5,
  space_before: 0,
  space_after: 8,
};

describe('Writer text flow', () => {
  it('uses bounded interoperable defaults for legacy paragraphs', () => {
    expect(normalizeWriterTextFlow(style)).toEqual({
      textDirection: 'auto',
      lineBreakMode: 'break-word',
      hyphenationMode: 'manual',
    });
  });

  it('detects the first strong direction without trusting neutral prefixes', () => {
    const automatic = resolveWriterTextFlow(style, '123 — مرحبا Astraea');
    expect(automatic.resolvedDirection).toBe('rtl');
    expect(writerTextFlowCss(automatic).unicodeBidi).toBe('plaintext');
    expect(resolveWriterTextFlow(style, '123 — Astraea مرحبا').resolvedDirection).toBe('ltr');
  });

  it('honors explicit direction and maps every flow rule to safe CSS', () => {
    const flow = resolveWriterTextFlow({
      ...style,
      text_direction: 'rtl',
      line_break_mode: 'keep-all',
      hyphenation_mode: 'none',
    }, 'Astraea');
    expect(flow.resolvedDirection).toBe('rtl');
    expect(writerTextFlowCss(flow)).toEqual({
      direction: 'rtl',
      unicodeBidi: 'isolate',
      overflowWrap: 'normal',
      wordBreak: 'keep-all',
      hyphens: 'none',
    });
  });
});
