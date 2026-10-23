// STATUS: DIAMANT VGT SUPREME — Sovereign Multilevel List & Outline Engine (Up to 9 Levels)
import type { Paragraph } from '../../../../shared/contracts/workspace';
import type {
  WriterListLevelConfig,
  WriterListNumberFormat,
  WriterListTemplate,
} from '../../../../shared/contracts/writer/workspaceWriterList';

export type {
  WriterListLevelConfig,
  WriterListNumberFormat,
  WriterListTemplate,
};

/**
 * Built-in standard templates for multi-level lists and chapter outlines.
 */
export const BUILTIN_LIST_TEMPLATES: WriterListTemplate[] = [
  {
    id: 'hierarchical_numeric',
    name: 'Standard Hierarchisch Numerisch',
    description: '1. > 1.1. > 1.1.1. (DIN / ISO Norm)',
    isHeadingLinked: true,
    levels: [
      { level: 0, numberFormat: 'arabic', suffix: '.', pattern: '%1.', startAt: 1, restartOnHigherLevel: true, leftIndentMm: 6.35, hangingIndentMm: 6.35, tabStopMm: 6.35 },
      { level: 1, numberFormat: 'arabic', suffix: '.', pattern: '%1.%2.', startAt: 1, restartOnHigherLevel: true, leftIndentMm: 12.7, hangingIndentMm: 6.35, tabStopMm: 12.7 },
      { level: 2, numberFormat: 'arabic', suffix: '.', pattern: '%1.%2.%3.', startAt: 1, restartOnHigherLevel: true, leftIndentMm: 19.05, hangingIndentMm: 6.35, tabStopMm: 19.05 },
      { level: 3, numberFormat: 'arabic', suffix: '.', pattern: '%1.%2.%3.%4.', startAt: 1, restartOnHigherLevel: true, leftIndentMm: 25.4, hangingIndentMm: 6.35, tabStopMm: 25.4 },
      { level: 4, numberFormat: 'arabic', suffix: '.', pattern: '%1.%2.%3.%4.%5.', startAt: 1, restartOnHigherLevel: true, leftIndentMm: 31.75, hangingIndentMm: 6.35, tabStopMm: 31.75 },
      { level: 5, numberFormat: 'arabic', suffix: '.', pattern: '%1.%2.%3.%4.%5.%6.', startAt: 1, restartOnHigherLevel: true, leftIndentMm: 38.1, hangingIndentMm: 6.35, tabStopMm: 38.1 },
      { level: 6, numberFormat: 'arabic', suffix: '.', pattern: '%1.%2.%3.%4.%5.%6.%7.', startAt: 1, restartOnHigherLevel: true, leftIndentMm: 44.45, hangingIndentMm: 6.35, tabStopMm: 44.45 },
      { level: 7, numberFormat: 'arabic', suffix: '.', pattern: '%1.%2.%3.%4.%5.%6.%7.%8.', startAt: 1, restartOnHigherLevel: true, leftIndentMm: 50.8, hangingIndentMm: 6.35, tabStopMm: 50.8 },
      { level: 8, numberFormat: 'arabic', suffix: '.', pattern: '%1.%2.%3.%4.%5.%6.%7.%8.%9.', startAt: 1, restartOnHigherLevel: true, leftIndentMm: 57.15, hangingIndentMm: 6.35, tabStopMm: 57.15 },
    ],
  },
  {
    id: 'legal_document',
    name: 'Juristisch / Legal Document',
    description: '§ 1 > § 1.01 > (a) > (1) (Vertragsgliederung)',
    isHeadingLinked: true,
    levels: [
      { level: 0, numberFormat: 'arabic', prefix: '§ ', suffix: '', pattern: '§ %1', startAt: 1, restartOnHigherLevel: true, leftIndentMm: 6.35, hangingIndentMm: 6.35, tabStopMm: 6.35 },
      { level: 1, numberFormat: 'leading_zero', prefix: '§ ', suffix: '', pattern: '§ %1.%2', startAt: 1, restartOnHigherLevel: true, leftIndentMm: 12.7, hangingIndentMm: 6.35, tabStopMm: 12.7 },
      { level: 2, numberFormat: 'alpha_lower', prefix: '(', suffix: ')', pattern: '(%3)', startAt: 1, restartOnHigherLevel: true, leftIndentMm: 19.05, hangingIndentMm: 6.35, tabStopMm: 19.05 },
      { level: 3, numberFormat: 'arabic', prefix: '(', suffix: ')', pattern: '(%4)', startAt: 1, restartOnHigherLevel: true, leftIndentMm: 25.4, hangingIndentMm: 6.35, tabStopMm: 25.4 },
      { level: 4, numberFormat: 'roman_lower', prefix: '(', suffix: ')', pattern: '(%5)', startAt: 1, restartOnHigherLevel: true, leftIndentMm: 31.75, hangingIndentMm: 6.35, tabStopMm: 31.75 },
      { level: 5, numberFormat: 'alpha_upper', prefix: '', suffix: '.', pattern: '%6.', startAt: 1, restartOnHigherLevel: true, leftIndentMm: 38.1, hangingIndentMm: 6.35, tabStopMm: 38.1 },
      { level: 6, numberFormat: 'roman_upper', prefix: '', suffix: '.', pattern: '%7.', startAt: 1, restartOnHigherLevel: true, leftIndentMm: 44.45, hangingIndentMm: 6.35, tabStopMm: 44.45 },
      { level: 7, numberFormat: 'arabic', prefix: '', suffix: ')', pattern: '%8)', startAt: 1, restartOnHigherLevel: true, leftIndentMm: 50.8, hangingIndentMm: 6.35, tabStopMm: 50.8 },
      { level: 8, numberFormat: 'alpha_lower', prefix: '', suffix: ')', pattern: '%9)', startAt: 1, restartOnHigherLevel: true, leftIndentMm: 57.15, hangingIndentMm: 6.35, tabStopMm: 57.15 },
    ],
  },
  {
    id: 'harvard_outline',
    name: 'Harvard / Akademische Gliederung',
    description: 'I. > A. > 1. > a. > (1) > (a) (Wissenschaftlich)',
    isHeadingLinked: true,
    levels: [
      { level: 0, numberFormat: 'roman_upper', suffix: '.', pattern: '%1.', startAt: 1, restartOnHigherLevel: true, leftIndentMm: 6.35, hangingIndentMm: 6.35, tabStopMm: 6.35 },
      { level: 1, numberFormat: 'alpha_upper', suffix: '.', pattern: '%2.', startAt: 1, restartOnHigherLevel: true, leftIndentMm: 12.7, hangingIndentMm: 6.35, tabStopMm: 12.7 },
      { level: 2, numberFormat: 'arabic', suffix: '.', pattern: '%3.', startAt: 1, restartOnHigherLevel: true, leftIndentMm: 19.05, hangingIndentMm: 6.35, tabStopMm: 19.05 },
      { level: 3, numberFormat: 'alpha_lower', suffix: '.', pattern: '%4.', startAt: 1, restartOnHigherLevel: true, leftIndentMm: 25.4, hangingIndentMm: 6.35, tabStopMm: 25.4 },
      { level: 4, numberFormat: 'arabic', prefix: '(', suffix: ')', pattern: '(%5)', startAt: 1, restartOnHigherLevel: true, leftIndentMm: 31.75, hangingIndentMm: 6.35, tabStopMm: 31.75 },
      { level: 5, numberFormat: 'alpha_lower', prefix: '(', suffix: ')', pattern: '(%6)', startAt: 1, restartOnHigherLevel: true, leftIndentMm: 38.1, hangingIndentMm: 6.35, tabStopMm: 38.1 },
      { level: 6, numberFormat: 'roman_lower', prefix: '(', suffix: ')', pattern: '(%7)', startAt: 1, restartOnHigherLevel: true, leftIndentMm: 44.45, hangingIndentMm: 6.35, tabStopMm: 44.45 },
      { level: 7, numberFormat: 'arabic', suffix: '.', pattern: '%8.', startAt: 1, restartOnHigherLevel: true, leftIndentMm: 50.8, hangingIndentMm: 6.35, tabStopMm: 50.8 },
      { level: 8, numberFormat: 'alpha_lower', suffix: '.', pattern: '%9.', startAt: 1, restartOnHigherLevel: true, leftIndentMm: 57.15, hangingIndentMm: 6.35, tabStopMm: 57.15 },
    ],
  },
  {
    id: 'tiered_bullets',
    name: 'Hierarchische Aufzählung (Tiered Bullets)',
    description: '• > ◦ > ▪ > ▫ > ‣ (Typografische Glyphen)',
    isHeadingLinked: false,
    levels: [
      { level: 0, numberFormat: 'bullet_disc', bulletGlyph: '•', leftIndentMm: 6.35, hangingIndentMm: 6.35, startAt: 1, restartOnHigherLevel: false },
      { level: 1, numberFormat: 'bullet_circle', bulletGlyph: '◦', leftIndentMm: 12.7, hangingIndentMm: 6.35, startAt: 1, restartOnHigherLevel: false },
      { level: 2, numberFormat: 'bullet_square', bulletGlyph: '▪', leftIndentMm: 19.05, hangingIndentMm: 6.35, startAt: 1, restartOnHigherLevel: false },
      { level: 3, numberFormat: 'custom_glyph', bulletGlyph: '▫', leftIndentMm: 25.4, hangingIndentMm: 6.35, startAt: 1, restartOnHigherLevel: false },
      { level: 4, numberFormat: 'bullet_arrow', bulletGlyph: '‣', leftIndentMm: 31.75, hangingIndentMm: 6.35, startAt: 1, restartOnHigherLevel: false },
      { level: 5, numberFormat: 'bullet_diamond', bulletGlyph: '◆', leftIndentMm: 38.1, hangingIndentMm: 6.35, startAt: 1, restartOnHigherLevel: false },
      { level: 6, numberFormat: 'bullet_check', bulletGlyph: '✓', leftIndentMm: 44.45, hangingIndentMm: 6.35, startAt: 1, restartOnHigherLevel: false },
      { level: 7, numberFormat: 'bullet_disc', bulletGlyph: '•', leftIndentMm: 50.8, hangingIndentMm: 6.35, startAt: 1, restartOnHigherLevel: false },
      { level: 8, numberFormat: 'bullet_circle', bulletGlyph: '◦', leftIndentMm: 57.15, hangingIndentMm: 6.35, startAt: 1, restartOnHigherLevel: false },
    ],
  },
  {
    id: 'alpha_numeric',
    name: 'Alpha-Numerisch Standard',
    description: 'A. > 1. > a. > (1) (Klassische Dokumente)',
    isHeadingLinked: true,
    levels: [
      { level: 0, numberFormat: 'alpha_upper', suffix: '.', pattern: '%1.', startAt: 1, restartOnHigherLevel: true, leftIndentMm: 6.35, hangingIndentMm: 6.35, tabStopMm: 6.35 },
      { level: 1, numberFormat: 'arabic', suffix: '.', pattern: '%2.', startAt: 1, restartOnHigherLevel: true, leftIndentMm: 12.7, hangingIndentMm: 6.35, tabStopMm: 12.7 },
      { level: 2, numberFormat: 'alpha_lower', suffix: '.', pattern: '%3.', startAt: 1, restartOnHigherLevel: true, leftIndentMm: 19.05, hangingIndentMm: 6.35, tabStopMm: 19.05 },
      { level: 3, numberFormat: 'arabic', prefix: '(', suffix: ')', pattern: '(%4)', startAt: 1, restartOnHigherLevel: true, leftIndentMm: 25.4, hangingIndentMm: 6.35, tabStopMm: 25.4 },
      { level: 4, numberFormat: 'alpha_lower', prefix: '(', suffix: ')', pattern: '(%5)', startAt: 1, restartOnHigherLevel: true, leftIndentMm: 31.75, hangingIndentMm: 6.35, tabStopMm: 31.75 },
      { level: 5, numberFormat: 'roman_lower', prefix: '(', suffix: ')', pattern: '(%6)', startAt: 1, restartOnHigherLevel: true, leftIndentMm: 38.1, hangingIndentMm: 6.35, tabStopMm: 38.1 },
      { level: 6, numberFormat: 'arabic', suffix: ')', pattern: '%7)', startAt: 1, restartOnHigherLevel: true, leftIndentMm: 44.45, hangingIndentMm: 6.35, tabStopMm: 44.45 },
      { level: 7, numberFormat: 'alpha_lower', suffix: ')', pattern: '%8)', startAt: 1, restartOnHigherLevel: true, leftIndentMm: 50.8, hangingIndentMm: 6.35, tabStopMm: 50.8 },
      { level: 8, numberFormat: 'roman_lower', suffix: ')', pattern: '%9)', startAt: 1, restartOnHigherLevel: true, leftIndentMm: 57.15, hangingIndentMm: 6.35, tabStopMm: 57.15 },
    ],
  },
  {
    id: 'modern_tech',
    name: 'Modern Tech Outline',
    description: '01. > 01.01. > 01.01.01. (Technische Spezifikation)',
    isHeadingLinked: true,
    levels: [
      { level: 0, numberFormat: 'leading_zero', suffix: '.', pattern: '%1.', startAt: 1, restartOnHigherLevel: true, leftIndentMm: 6.35, hangingIndentMm: 6.35, tabStopMm: 6.35 },
      { level: 1, numberFormat: 'leading_zero', suffix: '.', pattern: '%1.%2.', startAt: 1, restartOnHigherLevel: true, leftIndentMm: 12.7, hangingIndentMm: 6.35, tabStopMm: 12.7 },
      { level: 2, numberFormat: 'leading_zero', suffix: '.', pattern: '%1.%2.%3.', startAt: 1, restartOnHigherLevel: true, leftIndentMm: 19.05, hangingIndentMm: 6.35, tabStopMm: 19.05 },
      { level: 3, numberFormat: 'leading_zero', suffix: '.', pattern: '%1.%2.%3.%4.', startAt: 1, restartOnHigherLevel: true, leftIndentMm: 25.4, hangingIndentMm: 6.35, tabStopMm: 25.4 },
      { level: 4, numberFormat: 'leading_zero', suffix: '.', pattern: '%1.%2.%3.%4.%5.', startAt: 1, restartOnHigherLevel: true, leftIndentMm: 31.75, hangingIndentMm: 6.35, tabStopMm: 31.75 },
      { level: 5, numberFormat: 'leading_zero', suffix: '.', pattern: '%1.%2.%3.%4.%5.%6.', startAt: 1, restartOnHigherLevel: true, leftIndentMm: 38.1, hangingIndentMm: 6.35, tabStopMm: 38.1 },
      { level: 6, numberFormat: 'leading_zero', suffix: '.', pattern: '%1.%2.%3.%4.%5.%6.%7.', startAt: 1, restartOnHigherLevel: true, leftIndentMm: 44.45, hangingIndentMm: 6.35, tabStopMm: 44.45 },
      { level: 7, numberFormat: 'leading_zero', suffix: '.', pattern: '%1.%2.%3.%4.%5.%6.%7.%8.', startAt: 1, restartOnHigherLevel: true, leftIndentMm: 50.8, hangingIndentMm: 6.35, tabStopMm: 50.8 },
      { level: 8, numberFormat: 'leading_zero', suffix: '.', pattern: '%1.%2.%3.%4.%5.%6.%7.%8.%9.', startAt: 1, restartOnHigherLevel: true, leftIndentMm: 57.15, hangingIndentMm: 6.35, tabStopMm: 57.15 },
    ],
  },
];

/**
 * Formats an ordinal number according to the specified format.
 */
export function formatOrdinalNumber(val: number, format: WriterListNumberFormat): string {
  const n = Math.max(1, Math.floor(val));
  switch (format) {
    case 'arabic':
      return String(n);
    case 'leading_zero':
      return n < 10 ? `0${n}` : String(n);
    case 'alpha_lower':
      return toAlpha(n, false);
    case 'alpha_upper':
      return toAlpha(n, true);
    case 'roman_lower':
      return toRoman(n, false);
    case 'roman_upper':
      return toRoman(n, true);
    case 'bullet_disc':
      return '•';
    case 'bullet_circle':
      return '◦';
    case 'bullet_square':
      return '▪';
    case 'bullet_arrow':
      return '‣';
    case 'bullet_check':
      return '✓';
    case 'bullet_diamond':
      return '◆';
    case 'custom_glyph':
      return '•';
    default:
      return String(n);
  }
}

/**
 * Resolves the bullet glyph for a paragraph or level.
 */
export function resolveWriterListBulletGlyph(
  p: Paragraph,
  level = 0,
  template?: WriterListTemplate
): string {
  if (p.style.list_override_glyph && p.style.list_override_glyph.trim().length > 0) {
    return p.style.list_override_glyph.trim();
  }

  const levelCfg = template?.levels.find((l) => l.level === level);
  if (levelCfg?.bulletGlyph) {
    return levelCfg.bulletGlyph;
  }
  if (levelCfg?.numberFormat) {
    return formatOrdinalNumber(1, levelCfg.numberFormat);
  }

  if (p.style.list_number_format) {
    return formatOrdinalNumber(1, p.style.list_number_format);
  }

  // Tiered fallback by level
  const tiered = ['•', '◦', '▪', '▫', '‣', '◆', '✓', '•', '◦'];
  return tiered[Math.max(0, Math.min(8, level))] ?? '•';
}

/**
 * Calculates hierarchical outline numbers (e.g. "1.", "1.1.", "1.1.1.") for numbered list paragraphs.
 * Fully supports up to 9 levels, restart numbering, custom start values, list_id scoping, and templates.
 */
export function calculateMultilevelListOrdinal(
  paragraphs: Paragraph[],
  currentParagraphIndex: number,
  template?: WriterListTemplate
): string {
  const currentP = paragraphs[currentParagraphIndex];
  if (!currentP || currentP.style.list_style !== 'number') {
    return '';
  }

  const activeTemplate = template ?? BUILTIN_LIST_TEMPLATES[0];
  const targetListId = currentP.style.list_id;

  // Counters for levels 0 through 8 (9 levels total)
  const levels = [0, 0, 0, 0, 0, 0, 0, 0, 0];

  for (let i = 0; i <= currentParagraphIndex; i++) {
    const p = paragraphs[i];
    if (p.style.list_style !== 'number') {
      continue;
    }

    // List ID scoping: if paragraph has list_id, only count matching list_id
    if (targetListId !== undefined && p.style.list_id !== targetListId) {
      continue;
    }

    const rawLevel = p.style.list_level ?? 0;
    const level = Math.max(0, Math.min(8, rawLevel));
    const levelCfg = activeTemplate.levels.find((l) => l.level === level);

    const baseStart = p.style.list_start_value ?? levelCfg?.startAt ?? 1;

    if (p.style.list_restart_numbering || levels[level] === 0) {
      levels[level] = baseStart;
    } else {
      levels[level] += 1;
    }

    // Reset subordinate levels if required
    const shouldRestartHigher = levelCfg ? levelCfg.restartOnHigherLevel : true;
    if (shouldRestartHigher) {
      for (let sub = level + 1; sub < levels.length; sub++) {
        levels[sub] = 0;
      }
    }

    if (i === currentParagraphIndex) {
      return renderLevelOrdinal(levels, level, activeTemplate, p.style.list_number_format);
    }
  }

  return '1.';
}

/**
 * Calculates hierarchical chapter/heading numbers (e.g. "1.", "1.1", "1.1.1") for heading paragraphs.
 */
export function calculateHeadingOutlineNumber(
  paragraphs: Paragraph[],
  currentParagraphIndex: number,
  template?: WriterListTemplate
): string {
  const currentP = paragraphs[currentParagraphIndex];
  if (!currentP) return '';

  const headingLevel = currentP.style.heading_level;
  if (!headingLevel || headingLevel < 1 || headingLevel > 6) {
    return '';
  }

  // Check if outline numbering is explicitly enabled or template linked
  const isOutlineActive = Boolean(currentP.style.heading_outline_numbered || template?.isHeadingLinked);
  if (!isOutlineActive) return '';

  const activeTemplate = template ?? BUILTIN_LIST_TEMPLATES[0];
  const targetLevel = headingLevel - 1; // Heading 1 -> level 0, Heading 2 -> level 1...

  const levels = [0, 0, 0, 0, 0, 0, 0, 0, 0];

  for (let i = 0; i <= currentParagraphIndex; i++) {
    const p = paragraphs[i];
    const hLvl = p.style.heading_level;
    if (!hLvl || hLvl < 1 || hLvl > 6) continue;

    const level = Math.max(0, Math.min(8, hLvl - 1));
    const levelCfg = activeTemplate.levels.find((l) => l.level === level);
    const baseStart = p.style.list_start_value ?? levelCfg?.startAt ?? 1;

    if (p.style.list_restart_numbering || levels[level] === 0) {
      levels[level] = baseStart;
    } else {
      levels[level] += 1;
    }

    for (let sub = level + 1; sub < levels.length; sub++) {
      levels[sub] = 0;
    }

    if (i === currentParagraphIndex) {
      return renderLevelOrdinal(levels, targetLevel, activeTemplate);
    }
  }

  return `${headingLevel}.`;
}

/**
 * Substitutes level counters into the template pattern (e.g. "%1.%2.") with formatting.
 */
function renderLevelOrdinal(
  levels: number[],
  currentLevel: number,
  template: WriterListTemplate,
  overrideFormat?: WriterListNumberFormat
): string {
  const levelCfg = template.levels.find((l) => l.level === currentLevel);
  const pattern = levelCfg?.pattern;

  if (pattern) {
    let result = pattern;
    for (let l = 0; l <= 8; l++) {
      const placeholder = `%${l + 1}`;
      if (result.includes(placeholder)) {
        const cfg = template.levels.find((cfgItem) => cfgItem.level === l);
        const fmt = (l === currentLevel && overrideFormat) ? overrideFormat : (cfg?.numberFormat ?? 'arabic');
        const formatted = formatOrdinalNumber(levels[l] || 1, fmt);
        result = result.replaceAll(placeholder, formatted);
      }
    }
    const prefix = levelCfg.prefix ?? '';
    const suffix = levelCfg.suffix ?? '';
    if (!result.startsWith(prefix)) result = prefix + result;
    if (!result.endsWith(suffix) && !pattern.endsWith(suffix)) result = result + suffix;
    return result;
  }

  // Default hierarchical string: "1.2.3."
  const activeParts: string[] = [];
  for (let l = 0; l <= currentLevel; l++) {
    const cfg = template.levels.find((candidate) => candidate.level === l);
    const fmt = (l === currentLevel && overrideFormat) ? overrideFormat : (cfg?.numberFormat ?? 'arabic');
    activeParts.push(formatOrdinalNumber(levels[l] || 1, fmt));
  }
  return activeParts.length > 0 ? `${activeParts.join('.')}.` : '1.';
}

/**
 * Resolves left and hanging indentation for a given list level from template or geometric default.
 */
export function resolveWriterListLevelGeometry(
  level: number,
  template?: WriterListTemplate
): { leftIndentMm: number; hangingIndentMm: number; tabStopMm?: number } {
  const clampedLevel = Math.max(0, Math.min(8, level));
  const levelCfg = template?.levels.find((l) => l.level === clampedLevel);

  if (levelCfg) {
    return {
      leftIndentMm: levelCfg.leftIndentMm,
      hangingIndentMm: levelCfg.hangingIndentMm,
      tabStopMm: levelCfg.tabStopMm,
    };
  }

  // Geometric ISO standard default (6.35 mm = 0.25 inch increments)
  const left = (clampedLevel + 1) * 6.35;
  const hanging = 6.35;
  return {
    leftIndentMm: left,
    hangingIndentMm: hanging,
    tabStopMm: left,
  };
}

/**
 * Formats a page number based on the requested format ('arabic' | 'roman' | 'alpha')
 */
export function formatPageNumber(pageNumber: number, format?: 'arabic' | 'roman' | 'alpha'): string {
  if (format === 'roman') {
    return toRoman(pageNumber, false);
  }
  if (format === 'alpha') {
    return toAlpha(pageNumber, false);
  }
  return String(pageNumber);
}

function toRoman(num: number, upper = false): string {
  const lookup: Array<[number, string]> = [
    [1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'],
    [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'],
    [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i'],
  ];
  let roman = '';
  let n = Math.max(1, Math.floor(num));
  for (const [val, str] of lookup) {
    while (n >= val) {
      roman += str;
      n -= val;
    }
  }
  return upper ? roman.toUpperCase() : roman;
}

function toAlpha(num: number, upper = false): string {
  let n = Math.max(1, Math.floor(num));
  let result = '';
  while (n > 0) {
    n -= 1;
    result = String.fromCharCode(97 + (n % 26)) + result;
    n = Math.floor(n / 26);
  }
  return upper ? result.toUpperCase() : result;
}
