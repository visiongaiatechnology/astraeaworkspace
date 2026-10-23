// STATUS: DIAMANT VGT SUPREME — Offline linguistic analysis with persisted document dictionary
import type {
  Paragraph,
  WriterLanguageTag,
  WriterLinguisticsConfig,
} from '../../../../shared/contracts/workspace';

export type SupportedLanguage = WriterLanguageTag;

export interface SpellCheckIssue {
  id: string;
  word: string;
  startIndex: number;
  endIndex: number;
  suggestions: string[];
  type: 'spelling' | 'grammar';
  message: string;
  language: WriterLanguageTag;
}

const MAX_CUSTOM_DICTIONARY_WORDS = 4096;
const MAX_CUSTOM_WORD_LENGTH = 96;
const DEFAULT_LINGUISTICS: WriterLinguisticsConfig = {
  defaultLanguage: 'de-DE',
  customDictionary: [],
};

// Built-in high-frequency core dictionaries for zero-dependency offline checking.
const CORE_DICT_DE = new Set([
  'die', 'der', 'das', 'und', 'in', 'zu', 'den', 'nicht', 'von', 'sie', 'ist', 'des', 'sich', 'mit', 'dem', 'dass', 'er', 'es', 'ein', 'ich', 'auf', 'so', 'eine', 'auch', 'als', 'an', 'nach', 'wie', 'im', 'für', 'man', 'aber', 'aus', 'durch', 'wenn', 'nur', 'war', 'noch', 'werden', 'bei', 'hat', 'wir', 'was', 'wird', 'sein', 'einen', 'welche', 'sind', 'oder', 'zur', 'um', 'haben', 'einer', 'mir', 'über', 'ihm', 'diese', 'einem', 'ihr', 'uns', 'da', 'zum', 'kann', 'doch', 'vor', 'dieser', 'mich', 'ihn', 'du', 'hatte', 'seine', 'mehr', 'am', 'denn', 'nun', 'unter', 'sehr', 'selbst', 'schon', 'hier', 'bis', 'ihre', 'wieder', 'meine', 'zeit', 'wo', 'während', 'damit', 'allen', 'sehen', 'lassen', 'ohne', 'immer', 'diesem', 'viel', 'jetzt', 'neu', 'jahr', 'tage', 'arbeit', 'system', 'architektur', 'dokument', 'souveränität', 'verschlüsselung', 'workspace', 'astraea', 'vgt', 'plattform', 'kern', 'komponente',
]);

const CORE_DICT_EN = new Set([
  'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i', 'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at', 'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she', 'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their', 'what', 'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go', 'me', 'when', 'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know', 'take', 'people', 'into', 'year', 'your', 'good', 'some', 'could', 'them', 'see', 'other', 'than', 'then', 'now', 'look', 'only', 'come', 'its', 'over', 'think', 'also', 'back', 'after', 'use', 'two', 'how', 'our', 'work', 'first', 'well', 'way', 'even', 'new', 'want', 'because', 'any', 'these', 'give', 'day', 'most', 'us', 'system', 'architecture', 'document', 'sovereign', 'encryption', 'workspace', 'astraea', 'vgt', 'platform', 'security', 'integrity', 'policy',
]);

function normalizeWord(word: string): string {
  return word.normalize('NFKC').trim().toLocaleLowerCase();
}

export function normalizeWriterCustomDictionary(words?: readonly string[]): string[] {
  if (!words?.length) return [];
  const normalized = new Set<string>();
  for (const raw of words) {
    if (normalized.size >= MAX_CUSTOM_DICTIONARY_WORDS) break;
    const word = normalizeWord(raw).slice(0, MAX_CUSTOM_WORD_LENGTH);
    if (/^[\p{L}\p{M}][\p{L}\p{M}'’.-]*$/u.test(word)) normalized.add(word);
  }
  return Array.from(normalized).sort((left, right) => left.localeCompare(right));
}

export function normalizeWriterLinguisticsConfig(
  config?: Partial<WriterLinguisticsConfig>,
): WriterLinguisticsConfig {
  const language = config?.defaultLanguage;
  const defaultLanguage: WriterLanguageTag = language === 'de-DE' || language === 'en-US' || language === 'en-GB' || language === 'fr-FR'
    ? language
    : DEFAULT_LINGUISTICS.defaultLanguage;
  return {
    defaultLanguage,
    customDictionary: normalizeWriterCustomDictionary(config?.customDictionary),
  };
}

export function addWriterCustomWord(words: readonly string[], rawWord: string): string[] {
  return normalizeWriterCustomDictionary([...words, rawWord]);
}

export function removeWriterCustomWord(words: readonly string[], rawWord: string): string[] {
  const target = normalizeWord(rawWord);
  return normalizeWriterCustomDictionary(words.filter((word) => normalizeWord(word) !== target));
}

function dictionaryForLanguage(lang: WriterLanguageTag): ReadonlySet<string> | null {
  if (lang === 'de-DE') return CORE_DICT_DE;
  if (lang === 'en-US' || lang === 'en-GB') return CORE_DICT_EN;
  return null;
}

/** What the offline engine can actually do for a language tag. */
export interface WriterLinguisticsCapabilities {
  /** A core dictionary exists, so spelling (and the bounded grammar pass) runs. */
  readonly spelling: boolean;
  /** Hyphenation patterns exist. */
  readonly hyphenation: boolean;
}

/**
 * The single source of truth for language support. The acceptance asks for
 * "unsupported Sprachen ehrlich kennzeichnen": without this, a French document is a
 * valid configuration whose audit silently returns no issues, which reads as
 * "everything is correct".
 */
export function writerLinguisticsCapabilities(language: WriterLanguageTag): WriterLinguisticsCapabilities {
  const spelling = dictionaryForLanguage(language) !== null;
  return { spelling, hyphenation: writerHyphenationPatternLanguage(language) !== null };
}

export function isWriterLanguageSupported(language: WriterLanguageTag): boolean {
  return writerLinguisticsCapabilities(language).spelling;
}

/**
 * The hyphenation pattern set for a tag, or `null` when there is none.
 *
 * One definition, used by the layout engine and by the manual hyphenation action.
 * The action used to map everything non-German to English, so a French document was
 * hyphenated with **English** patterns — worse than not hyphenating at all.
 */
export function writerHyphenationPatternLanguage(language: WriterLanguageTag): 'de' | 'en' | null {
  if (language === 'de-DE') return 'de';
  if (language === 'en-US' || language === 'en-GB') return 'en';
  return null;
}

/** Computes Levenshtein distance between two strings. */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let v0 = new Int32Array(n + 1);
  let v1 = new Int32Array(n + 1);
  for (let index = 0; index <= n; index += 1) v0[index] = index;

  for (let left = 0; left < m; left += 1) {
    v1[0] = left + 1;
    for (let right = 0; right < n; right += 1) {
      const cost = a[left] === b[right] ? 0 : 1;
      v1[right + 1] = Math.min(v1[right] + 1, v0[right + 1] + 1, v0[right] + cost);
    }
    [v0, v1] = [v1, v0];
  }
  return v0[n];
}

/** Generates nearest offline dictionary suggestions with bounded edit distance. */
export function getSuggestions(
  word: string,
  lang: WriterLanguageTag,
  customDictionary: readonly string[] = [],
): string[] {
  const dictionary = dictionaryForLanguage(lang);
  const lower = normalizeWord(word);
  const candidates: { word: string; dist: number }[] = [];
  const inspect = (target: string): void => {
    if (Math.abs(target.length - lower.length) > 2) return;
    const dist = levenshtein(lower, target);
    if (dist <= 2) candidates.push({ word: target, dist });
  };
  dictionary?.forEach(inspect);
  normalizeWriterCustomDictionary(customDictionary).forEach(inspect);
  candidates.sort((left, right) => left.dist - right.dist || left.word.localeCompare(right.word));
  return candidates.slice(0, 4).map((candidate) => candidate.word);
}

/** Offline spelling + bounded grammar analysis for one language segment. */
export function analyzeLinguistics(
  text: string,
  lang: WriterLanguageTag = 'en-US',
  customDictionary: readonly string[] = [],
): SpellCheckIssue[] {
  if (!text) return [];
  const issues: SpellCheckIssue[] = [];
  const dictionary = dictionaryForLanguage(lang);
  const custom = new Set(normalizeWriterCustomDictionary(customDictionary));
  const wordRegex = /[\p{L}\p{M}]+/gu;
  let match: RegExpExecArray | null;

  while (dictionary && (match = wordRegex.exec(text)) !== null) {
    const rawWord = match[0];
    if (Array.from(rawWord).length < 2) continue;
    const normalized = normalizeWord(rawWord);
    if (dictionary.has(normalized) || custom.has(normalized)) continue;
    const startIndex = match.index;
    const endIndex = startIndex + rawWord.length;
    issues.push({
      id: `spell-${startIndex}-${endIndex}-${lang}`,
      word: rawWord,
      startIndex,
      endIndex,
      suggestions: getSuggestions(rawWord, lang, customDictionary),
      type: 'spelling',
      message: `Unknown word: "${rawWord}".`,
      language: lang,
    });
  }

  const repeatRegex = /\b([\p{L}\p{M}]+)\s+\1\b/giu;
  while ((match = repeatRegex.exec(text)) !== null) {
    issues.push({
      id: `grammar-repeat-${match.index}-${lang}`,
      word: match[0],
      startIndex: match.index,
      endIndex: match.index + match[0].length,
      suggestions: [match[1]],
      type: 'grammar',
      message: `Repeated word: "${match[1]}".`,
      language: lang,
    });
  }

  const strayPunctuation = /\s+([,.:;?!])/gu;
  while ((match = strayPunctuation.exec(text)) !== null) {
    issues.push({
      id: `grammar-punct-${match.index}-${lang}`,
      word: match[0],
      startIndex: match.index,
      endIndex: match.index + match[0].length,
      suggestions: [match[1]],
      type: 'grammar',
      message: `Extraneous whitespace before "${match[1]}".`,
      language: lang,
    });
  }

  return issues;
}

/**
 * Audits a paragraph by contiguous language ranges. Offsets always refer to the
 * original paragraph UTF-16 text, so a fix can be applied without flattening spans.
 */
export function analyzeParagraphLinguistics(
  paragraph: Paragraph,
  config?: Partial<WriterLinguisticsConfig>,
): SpellCheckIssue[] {
  return analyzeParagraphLinguisticsDetailed(paragraph, config).issues;
}

export interface WriterLinguisticsAudit {
  readonly issues: SpellCheckIssue[];
  /**
   * Language tags in this paragraph that **no** dictionary covers. The audit found
   * no issues there because it did not look — a caller that shows a clean result
   * without naming these would claim a check that never happened.
   */
  readonly uncheckedLanguages: WriterLanguageTag[];
}

/**
 * The audit plus the honest account of what was skipped. `analyzeParagraphLinguistics`
 * stays as the plain-issues view for callers that only render the list.
 */
export function analyzeParagraphLinguisticsDetailed(
  paragraph: Paragraph,
  config?: Partial<WriterLinguisticsConfig>,
): WriterLinguisticsAudit {
  const normalized = normalizeWriterLinguisticsConfig(config);
  const segments: Array<{ text: string; start: number; language: WriterLanguageTag }> = [];
  let cursor = 0;
  for (const span of paragraph.spans) {
    const language = span.language ?? normalized.defaultLanguage;
    const previous = segments.at(-1);
    if (previous && previous.language === language) previous.text += span.text;
    else segments.push({ text: span.text, start: cursor, language });
    cursor += span.text.length;
  }

  const uncheckedLanguages: WriterLanguageTag[] = [];
  const issues = segments.flatMap((segment) => {
    if (!isWriterLanguageSupported(segment.language) && !uncheckedLanguages.includes(segment.language)) {
      uncheckedLanguages.push(segment.language);
    }
    return analyzeLinguistics(
      segment.text,
      segment.language,
      normalized.customDictionary,
    ).map((issue) => ({
      ...issue,
      id: `${paragraph.id}:${segment.start}:${issue.id}`,
      startIndex: segment.start + issue.startIndex,
      endIndex: segment.start + issue.endIndex,
    }));
  });

  return { issues, uncheckedLanguages };
}

export const checkText = (
  text: string,
  lang: WriterLanguageTag,
  customDictionary: readonly string[] = [],
): SpellCheckIssue[] => analyzeLinguistics(text, lang, customDictionary);

export type LinguisticIssue = SpellCheckIssue;
