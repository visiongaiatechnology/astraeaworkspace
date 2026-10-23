// STATUS: DIAMANT VGT SUPREME — Canonical paragraph direction and text-flow domain
import type { CSSProperties } from 'react';
import type {
  ParagraphStyle,
  WriterHyphenationMode,
  WriterLineBreakMode,
  WriterParagraphDirection,
} from '../../../../shared/contracts/workspace';
import { getPrimaryDirection, type TextDirection } from '../typography/writerTextShaping';

export interface WriterTextFlowSettings {
  textDirection: WriterParagraphDirection;
  lineBreakMode: WriterLineBreakMode;
  hyphenationMode: WriterHyphenationMode;
}

export interface ResolvedWriterTextFlow extends WriterTextFlowSettings {
  resolvedDirection: TextDirection;
}

const DIRECTIONS = new Set<WriterParagraphDirection>(['auto', 'ltr', 'rtl']);
const LINE_BREAK_MODES = new Set<WriterLineBreakMode>(['normal', 'break-word', 'anywhere', 'keep-all']);
const HYPHENATION_MODES = new Set<WriterHyphenationMode>(['none', 'manual', 'auto']);

export function normalizeWriterTextFlow(style: Partial<ParagraphStyle>): WriterTextFlowSettings {
  return {
    textDirection: style.text_direction && DIRECTIONS.has(style.text_direction) ? style.text_direction : 'auto',
    lineBreakMode: style.line_break_mode && LINE_BREAK_MODES.has(style.line_break_mode)
      ? style.line_break_mode
      : 'break-word',
    hyphenationMode: style.hyphenation_mode && HYPHENATION_MODES.has(style.hyphenation_mode)
      ? style.hyphenation_mode
      : 'manual',
  };
}

export function resolveWriterTextFlow(
  style: Partial<ParagraphStyle>,
  text: string,
): ResolvedWriterTextFlow {
  const settings = normalizeWriterTextFlow(style);
  return {
    ...settings,
    resolvedDirection: settings.textDirection === 'auto'
      ? getPrimaryDirection(text)
      : settings.textDirection,
  };
}

export function writerTextFlowCss(flow: ResolvedWriterTextFlow): Pick<
  CSSProperties,
  'direction' | 'unicodeBidi' | 'overflowWrap' | 'wordBreak' | 'hyphens'
> {
  return {
    direction: flow.resolvedDirection,
    unicodeBidi: flow.textDirection === 'auto' ? 'plaintext' : 'isolate',
    overflowWrap: flow.lineBreakMode === 'anywhere'
      ? 'anywhere'
      : flow.lineBreakMode === 'break-word'
        ? 'break-word'
        : 'normal',
    wordBreak: flow.lineBreakMode === 'keep-all' ? 'keep-all' : 'normal',
    hyphens: flow.hyphenationMode,
  };
}
