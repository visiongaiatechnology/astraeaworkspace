// STATUS: DIAMANT VGT SUPREME — Astraea Writer Multilevel List Types & Catalog Models

export type WriterListNumberFormat =
  | 'arabic'
  | 'alpha_lower'
  | 'alpha_upper'
  | 'roman_lower'
  | 'roman_upper'
  | 'leading_zero'
  | 'bullet_disc'
  | 'bullet_circle'
  | 'bullet_square'
  | 'bullet_arrow'
  | 'bullet_check'
  | 'bullet_diamond'
  | 'custom_glyph';

export interface WriterListLevelConfig {
  level: number; // 0..8 (up to 9 levels)
  numberFormat: WriterListNumberFormat;
  bulletGlyph?: string;
  prefix?: string;
  suffix?: string;
  pattern?: string; // e.g. "%1." or "%1.%2." or "(%1)"
  startAt: number; // default 1
  restartOnHigherLevel: boolean; // default true
  leftIndentMm: number;
  hangingIndentMm: number;
  tabStopMm?: number;
}

export interface WriterListTemplate {
  id: string;
  name: string;
  description?: string;
  isHeadingLinked?: boolean;
  levels: WriterListLevelConfig[];
}
