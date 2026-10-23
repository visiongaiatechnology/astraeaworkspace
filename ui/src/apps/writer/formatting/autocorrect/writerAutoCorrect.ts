// STATUS: PLATIN — Deterministic, bounded Writer AutoCorrect engine
import type {
  WriterAutoCorrectConfig,
  WriterAutoCorrectLocale,
  WriterAutoCorrectRule,
} from '../../../../shared/contracts/workspace';

export const WRITER_AUTOCORRECT_MAX_RULES = 256;
export const WRITER_AUTOCORRECT_MAX_TRIGGER_LENGTH = 128;
export const WRITER_AUTOCORRECT_MAX_REPLACEMENT_LENGTH = 1_024;

export const DEFAULT_WRITER_AUTOCORRECT: Readonly<WriterAutoCorrectConfig> = {
  enabled: true,
  smartQuotes: true,
  autoFormat: true,
  locale: 'de-DE',
  replacements: [],
};

export interface WriterAutoCorrectResult {
  text: string;
  caret: number;
  applied: 'none' | 'smart-quote' | 'auto-format' | 'replacement';
  ruleId?: string;
}

const AUTO_FORMAT_REPLACEMENTS: ReadonlyArray<Readonly<{ trigger: string; replacement: string }>> = [
  { trigger: '...', replacement: '…' },
  { trigger: '(c)', replacement: '©' },
  { trigger: '(r)', replacement: '®' },
  { trigger: '(tm)', replacement: '™' },
  { trigger: '<->', replacement: '↔' },
  { trigger: '->', replacement: '→' },
  { trigger: '<-', replacement: '←' },
];

function clampCaret(text: string, caret: number): number {
  return Math.min(text.length, Math.max(0, Math.trunc(caret)));
}

function isAllowedReplacementCharacter(character: string): boolean {
  return character === '\n' || character === '\t' || !/[\u0000-\u001F\u007F]/u.test(character);
}

function isAllowedTriggerCharacter(character: string): boolean {
  return !/[\u0000-\u001F\u007F]/u.test(character);
}

export function writerAutoCorrectRuleError(
  trigger: string,
  replacement: string,
  rules: readonly WriterAutoCorrectRule[],
  editingId?: string,
): string | null {
  if (!trigger) return 'Der Auslöser darf nicht leer sein.';
  if (Array.from(trigger).length > WRITER_AUTOCORRECT_MAX_TRIGGER_LENGTH) {
    return `Der Auslöser darf höchstens ${WRITER_AUTOCORRECT_MAX_TRIGGER_LENGTH} Zeichen enthalten.`;
  }
  if (Array.from(replacement).length > WRITER_AUTOCORRECT_MAX_REPLACEMENT_LENGTH) {
    return `Die Ersetzung darf höchstens ${WRITER_AUTOCORRECT_MAX_REPLACEMENT_LENGTH} Zeichen enthalten.`;
  }
  if (Array.from(trigger).some((character) => !isAllowedTriggerCharacter(character))) {
    return 'Steuerzeichen sind im Auslöser nicht zulässig.';
  }
  if (Array.from(replacement).some((character) => !isAllowedReplacementCharacter(character))) {
    return 'Die Ersetzung enthält ein nicht zulässiges Steuerzeichen.';
  }
  const normalized = trigger.toLocaleLowerCase('und');
  if (rules.some((rule) => rule.id !== editingId && rule.trigger.toLocaleLowerCase('und') === normalized)) {
    return 'Für diesen Auslöser existiert bereits eine Regel.';
  }
  return null;
}

function validLocale(locale: unknown): locale is WriterAutoCorrectLocale {
  return locale === 'de-DE' || locale === 'en-US';
}

function normalizeRule(value: unknown): WriterAutoCorrectRule | null {
  if (!value || typeof value !== 'object') return null;
  const rule = value as Partial<WriterAutoCorrectRule>;
  if (typeof rule.id !== 'string' || !rule.id || rule.id.length > 128) return null;
  if (typeof rule.trigger !== 'string' || typeof rule.replacement !== 'string') return null;
  if (writerAutoCorrectRuleError(rule.trigger, rule.replacement, [], rule.id)) return null;
  return {
    id: rule.id,
    trigger: rule.trigger,
    replacement: rule.replacement,
    caseSensitive: Boolean(rule.caseSensitive),
  };
}

export function normalizeWriterAutoCorrectConfig(
  config: WriterAutoCorrectConfig | undefined,
): WriterAutoCorrectConfig {
  if (!config) return { ...DEFAULT_WRITER_AUTOCORRECT, replacements: [] };
  const deduplicated = new Map<string, WriterAutoCorrectRule>();
  const candidates: readonly unknown[] = Array.isArray(config.replacements) ? config.replacements : [];
  for (const candidate of candidates.slice(0, WRITER_AUTOCORRECT_MAX_RULES)) {
    const rule = normalizeRule(candidate);
    if (!rule) continue;
    const key = rule.caseSensitive ? `s:${rule.trigger}` : `i:${rule.trigger.toLocaleLowerCase('und')}`;
    if (!deduplicated.has(key)) deduplicated.set(key, rule);
  }
  return {
    enabled: typeof config.enabled === 'boolean' ? config.enabled : DEFAULT_WRITER_AUTOCORRECT.enabled,
    smartQuotes: typeof config.smartQuotes === 'boolean' ? config.smartQuotes : DEFAULT_WRITER_AUTOCORRECT.smartQuotes,
    autoFormat: typeof config.autoFormat === 'boolean' ? config.autoFormat : DEFAULT_WRITER_AUTOCORRECT.autoFormat,
    locale: validLocale(config.locale) ? config.locale : DEFAULT_WRITER_AUTOCORRECT.locale,
    replacements: [...deduplicated.values()],
  };
}

function replaceBeforeCaret(
  text: string,
  caret: number,
  length: number,
  replacement: string,
): { text: string; caret: number } {
  const start = caret - length;
  return {
    text: `${text.slice(0, start)}${replacement}${text.slice(caret)}`,
    caret: start + replacement.length,
  };
}

function smartQuote(
  text: string,
  caret: number,
  locale: WriterAutoCorrectLocale,
): { text: string; caret: number } | null {
  const quote = text[caret - 1];
  if (quote !== '"' && quote !== "'") return null;
  const preceding = text[caret - 2] ?? '';
  const opening = !preceding || /[\s([{\u2014\u2013]/u.test(preceding);
  const priorText = text.slice(0, caret - 1);
  const hasUnclosedGermanSingleQuote = priorText.lastIndexOf('‚') > priorText.lastIndexOf('‘');
  if (locale === 'de-DE' && quote === "'" && !opening && !hasUnclosedGermanSingleQuote) {
    return replaceBeforeCaret(text, caret, 1, '’');
  }
  const pairs = locale === 'de-DE'
    ? quote === '"' ? ['„', '“'] : ['‚', '‘']
    : quote === '"' ? ['“', '”'] : ['‘', '’'];
  return replaceBeforeCaret(text, caret, 1, pairs[opening ? 0 : 1]);
}

function suffixMatches(value: string, suffix: string, caseSensitive: boolean): boolean {
  if (caseSensitive) return value.endsWith(suffix);
  return value.toLocaleLowerCase('und').endsWith(suffix.toLocaleLowerCase('und'));
}

function applyAutoFormat(
  text: string,
  caret: number,
  locale: WriterAutoCorrectLocale,
): { text: string; caret: number } | null {
  const before = text.slice(0, caret);
  if (before.endsWith('---')) return replaceBeforeCaret(text, caret, 3, '—');
  if (before.endsWith('--')) {
    return replaceBeforeCaret(text, caret, 2, locale === 'de-DE' ? '–' : '—');
  }
  for (const rule of AUTO_FORMAT_REPLACEMENTS) {
    if (before.endsWith(rule.trigger)) {
      return replaceBeforeCaret(text, caret, rule.trigger.length, rule.replacement);
    }
  }
  return null;
}

function applyCustomReplacement(
  text: string,
  caret: number,
  insertedText: string,
  rules: readonly WriterAutoCorrectRule[],
): ({ text: string; caret: number; ruleId: string } | null) {
  const before = text.slice(0, caret);
  const lastInserted = insertedText.at(-1) ?? '';
  const boundary = /[\s.,!?;:()[\]{}]/u.test(lastInserted) ? lastInserted : '';
  const searchable = boundary ? before.slice(0, -boundary.length) : before;
  const sorted = [...rules].sort((left, right) => right.trigger.length - left.trigger.length);

  for (const rule of sorted) {
    const triggerEndsAtCaret = suffixMatches(before, rule.trigger, rule.caseSensitive);
    const triggerEndsAtBoundary = Boolean(boundary) && suffixMatches(searchable, rule.trigger, rule.caseSensitive);
    const symbolicTrigger = !/[\p{L}\p{N}_]$/u.test(rule.trigger);
    if (!(triggerEndsAtBoundary || (triggerEndsAtCaret && symbolicTrigger))) continue;
    const replaceEnd = triggerEndsAtBoundary ? caret - boundary.length : caret;
    const start = replaceEnd - rule.trigger.length;
    const preceding = text[start - 1] ?? '';
    if (/[\p{L}\p{N}_]/u.test(rule.trigger[0] ?? '') && /[\p{L}\p{N}_]/u.test(preceding)) continue;
    return {
      text: `${text.slice(0, start)}${rule.replacement}${text.slice(replaceEnd)}`,
      caret: start + rule.replacement.length + boundary.length,
      ruleId: rule.id,
    };
  }
  return null;
}

function insertedSegment(previousText: string, nextText: string): string | null {
  let prefix = 0;
  const shared = Math.min(previousText.length, nextText.length);
  while (prefix < shared && previousText[prefix] === nextText[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < previousText.length - prefix
    && suffix < nextText.length - prefix
    && previousText[previousText.length - 1 - suffix] === nextText[nextText.length - 1 - suffix]
  ) suffix += 1;
  const removedLength = previousText.length - prefix - suffix;
  const inserted = nextText.slice(prefix, nextText.length - suffix);
  return removedLength === 0 && inserted ? inserted : null;
}

export function applyWriterAutoCorrect(
  previousText: string,
  nextText: string,
  caret: number,
  rawConfig: WriterAutoCorrectConfig | undefined,
): WriterAutoCorrectResult {
  const config = normalizeWriterAutoCorrectConfig(rawConfig);
  let result = { text: nextText, caret: clampCaret(nextText, caret) };
  if (!config.enabled) return { ...result, applied: 'none' };
  const inserted = insertedSegment(previousText, nextText);
  if (!inserted || result.caret === 0) return { ...result, applied: 'none' };

  if (config.smartQuotes && (inserted.endsWith('"') || inserted.endsWith("'"))) {
    const transformed = smartQuote(result.text, result.caret, config.locale);
    if (transformed) return { ...transformed, applied: 'smart-quote' };
  }
  if (config.autoFormat) {
    const transformed = applyAutoFormat(result.text, result.caret, config.locale);
    if (transformed) return { ...transformed, applied: 'auto-format' };
  }
  const custom = applyCustomReplacement(result.text, result.caret, inserted, config.replacements);
  if (custom) return { ...custom, applied: 'replacement' };
  return { ...result, applied: 'none' };
}
