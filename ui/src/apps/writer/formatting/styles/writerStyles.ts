// STATUS: PLATIN
import type {
  Paragraph,
  TextSpan,
  WriterCharacterStyleDefinition,
  WriterParagraphStyleName,
  WriterStyleCatalog,
  WriterStyleDefinition,
  WriterTableBlockData,
  WriterTableStyleDefinition,
  WriterTextEffect,
} from '../../../../shared/contracts/workspace';
import { applyWriterTextSpanFormatRange, writerTextSpanFormatAtOffset } from '../../editing/text/writerTextEditing';

export * from './writerStylesDefaults';
import {
  DEFAULT_WRITER_STYLES,
  DEFAULT_WRITER_CHARACTER_STYLES,
  DEFAULT_WRITER_LIST_STYLES,
  DEFAULT_WRITER_TABLE_STYLES,
  DEFAULT_WRITER_LINKED_STYLES,
  WRITER_DOCUMENT_THEMES,
  type DocumentTheme,
} from './writerStylesDefaults';

function isWriterHeadingStyle(name: WriterParagraphStyleName): boolean {
  return name === 'title' || /^heading[1-9]$/u.test(name);
}

export function writerDocumentTheme(themeId: string): DocumentTheme {
  const theme = WRITER_DOCUMENT_THEMES.find((candidate) => candidate.id === themeId);
  if (!theme) throw new RangeError(`Unknown Writer document theme: ${themeId}`);
  return theme;
}

export function applyWriterDocumentTheme(
  styles: WriterStyleDefinition[] | undefined,
  themeId: string,
): WriterStyleDefinition[] {
  const theme = writerDocumentTheme(themeId);
  return ensureWriterStyles(styles).map((style) => {
    const heading = isWriterHeadingStyle(style.name);
    return {
      ...style,
      fontFamily: heading ? theme.headingFont : theme.primaryFont,
      textColor: heading ? theme.accentColor : theme.textColor,
      textEffect: heading ? theme.headingEffect : 'none',
    };
  });
}

export function writerTextShadow(effect: WriterTextEffect | undefined): string | undefined {
  if (effect === 'subtle-shadow') return '0 1px 1px rgb(15 23 42 / 0.22)';
  if (effect === 'strong-shadow') return '0 2px 2px rgb(15 23 42 / 0.38)';
  return undefined;
}

export function ensureWriterStyles(styles?: WriterStyleDefinition[]): WriterStyleDefinition[] {
  const byName = new Map((styles ?? []).map((style) => [style.name, style]));
  return DEFAULT_WRITER_STYLES.map((fallback) => ({ ...fallback, ...(byName.get(fallback.name) ?? {}) }));
}

function mergeStyleCollection<T extends { id: string }>(defaults: readonly T[], supplied: readonly T[] | undefined): T[] {
  const byId = new Map((supplied ?? []).map((style) => [style.id, style]));
  const merged = defaults.map((fallback) => ({ ...fallback, ...(byId.get(fallback.id) ?? {}) }));
  const defaultIds = new Set(defaults.map((style) => style.id));
  return [...merged, ...(supplied ?? []).filter((style) => !defaultIds.has(style.id)).map((style) => ({ ...style }))];
}

export function ensureWriterStyleCatalog(
  catalog?: WriterStyleCatalog,
  legacyParagraphStyles?: WriterStyleDefinition[],
): WriterStyleCatalog {
  return {
    paragraphStyles: ensureWriterStyles(catalog?.paragraphStyles ?? legacyParagraphStyles),
    characterStyles: mergeStyleCollection(DEFAULT_WRITER_CHARACTER_STYLES, catalog?.characterStyles),
    listStyles: mergeStyleCollection(DEFAULT_WRITER_LIST_STYLES, catalog?.listStyles),
    tableStyles: mergeStyleCollection(DEFAULT_WRITER_TABLE_STYLES, catalog?.tableStyles),
    linkedStyles: mergeStyleCollection(DEFAULT_WRITER_LINKED_STYLES, catalog?.linkedStyles),
  };
}

export function inferWriterStyleName(paragraph: Paragraph): WriterParagraphStyleName {
  if (paragraph.style.style_name) return paragraph.style.style_name;
  if (paragraph.style.heading_level) return `heading${paragraph.style.heading_level}` as WriterParagraphStyleName;
  return 'normal';
}

export function writerStyleForParagraph(paragraph: Paragraph, styles?: WriterStyleDefinition[]): WriterStyleDefinition {
  return resolveWriterStyleDefinition(inferWriterStyleName(paragraph), styles);
}

const omitUndefined = (style: WriterStyleDefinition): Partial<WriterStyleDefinition> =>
  Object.fromEntries(Object.entries(style).filter(([, value]) => value !== undefined)) as Partial<WriterStyleDefinition>;

export function resolveWriterStyleDefinition(
  styleName: WriterParagraphStyleName,
  styles?: WriterStyleDefinition[],
): WriterStyleDefinition {
  const definitions = ensureWriterStyles(styles);
  const byName = new Map(definitions.map((style) => [style.name, style]));
  const normal = byName.get('normal') ?? DEFAULT_WRITER_STYLES[0];

  const resolve = (name: WriterParagraphStyleName, chain: ReadonlySet<string>): WriterStyleDefinition => {
    const definition = byName.get(name) ?? normal;
    if (!definition.basedOn || definition.basedOn === definition.name || chain.has(definition.name)) {
      return { ...normal, ...omitUndefined(definition), name: definition.name, label: definition.label };
    }
    const parent = byName.get(definition.basedOn as WriterParagraphStyleName);
    if (!parent) return { ...normal, ...omitUndefined(definition), basedOn: undefined };
    const nextChain = new Set(chain);
    nextChain.add(definition.name);
    const inherited = resolve(parent.name, nextChain);
    return { ...inherited, ...omitUndefined(definition), name: definition.name, label: definition.label };
  };

  return resolve(styleName, new Set<string>());
}

export function nextWriterParagraphStyleName(
  paragraph: Paragraph,
  styles?: WriterStyleDefinition[],
): WriterParagraphStyleName {
  const definitions = ensureWriterStyles(styles);
  const current = definitions.find((style) => style.name === inferWriterStyleName(paragraph));
  return definitions.some((style) => style.name === current?.nextStyle)
    ? current!.nextStyle as WriterParagraphStyleName
    : 'normal';
}

export function writerStyleRelationshipWouldCycle(
  styles: WriterStyleDefinition[] | undefined,
  styleName: WriterParagraphStyleName,
  proposedBase: WriterParagraphStyleName | string | undefined,
): boolean {
  if (!proposedBase) return false;
  if (proposedBase === styleName) return true;
  const definitions = ensureWriterStyles(styles);
  const byName = new Map(definitions.map((style) => [style.name, style]));
  const visited = new Set<string>([styleName]);
  let cursor: string | undefined = proposedBase;
  while (cursor) {
    if (visited.has(cursor)) return true;
    visited.add(cursor);
    cursor = byName.get(cursor as WriterParagraphStyleName)?.basedOn;
  }
  return false;
}

export function writerStyleInheritsFrom(
  styles: WriterStyleDefinition[] | undefined,
  styleName: WriterParagraphStyleName,
  ancestorName: WriterParagraphStyleName,
): boolean {
  if (styleName === ancestorName) return true;
  const definitions = ensureWriterStyles(styles);
  const byName = new Map(definitions.map((style) => [style.name, style]));
  const visited = new Set<string>();
  let cursor: string | undefined = byName.get(styleName)?.basedOn;
  while (cursor && !visited.has(cursor)) {
    if (cursor === ancestorName) return true;
    visited.add(cursor);
    cursor = byName.get(cursor as WriterParagraphStyleName)?.basedOn;
  }
  return false;
}

export function writerStylePatchFromParagraph(
  paragraph: Paragraph,
  resolvedStyle: WriterStyleDefinition,
): Partial<Omit<WriterStyleDefinition, 'name' | 'label'>> {
  const firstSpan = paragraph.spans[0];
  return {
    fontSizePt: firstSpan?.font_size_pt ?? resolvedStyle.fontSizePt,
    fontFamily: firstSpan?.font_family ?? resolvedStyle.fontFamily,
    bold: paragraph.spans.some((span) => Boolean(span.bold)),
    italic: paragraph.spans.some((span) => Boolean(span.italic)),
    textColor: paragraph.spans.find((span) => span.text_color)?.text_color ?? resolvedStyle.textColor,
    alignment: paragraph.style.alignment ?? resolvedStyle.alignment,
    lineHeight: paragraph.style.line_height ?? resolvedStyle.lineHeight,
    spaceBefore: paragraph.style.space_before ?? resolvedStyle.spaceBefore,
    spaceAfter: paragraph.style.space_after ?? resolvedStyle.spaceAfter,
    firstLineIndentMm: paragraph.style.first_line_indent_mm ?? resolvedStyle.firstLineIndentMm,
    hangingIndentMm: paragraph.style.hanging_indent_mm ?? resolvedStyle.hangingIndentMm,
  };
}

export interface WriterStyleDelta {
  label: string;
  current: string;
  base: string;
}

function distinctDefined<T>(values: ReadonlyArray<T | undefined>): T[] {
  return [...new Set(values.filter((value): value is T => value !== undefined))];
}

function displayValues(values: ReadonlyArray<string | number>): string {
  return values.length === 1 ? String(values[0]) : `Gemischt: ${values.join(' / ')}`;
}

function sameStructuredValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

export function writerDirectFormattingDeltas(
  paragraph: Paragraph,
  styles?: WriterStyleDefinition[],
): WriterStyleDelta[] {
  const base = writerStyleForParagraph(paragraph, styles);
  const deltas: WriterStyleDelta[] = [];
  const add = (label: string, current: string | number, expected: string | number): void => {
    if (String(current) !== String(expected)) {
      deltas.push({ label, current: String(current), base: String(expected) });
    }
  };

  const fontSizes = distinctDefined(paragraph.spans.map((span) => span.font_size_pt));
  if (fontSizes.length && fontSizes.some((value) => value !== base.fontSizePt)) {
    add('Schriftgröße', `${displayValues(fontSizes)} pt`, `${base.fontSizePt} pt`);
  }
  const fontFamilies = distinctDefined(paragraph.spans.map((span) => span.font_family));
  if (fontFamilies.length && fontFamilies.some((value) => value !== base.fontFamily)) {
    add('Schriftfamilie', displayValues(fontFamilies), base.fontFamily ?? 'Theme-Standard');
  }
  if (!base.bold && paragraph.spans.some((span) => span.bold)) add('Schriftschnitt (Fett)', 'Fett', 'Normal');
  if (!base.italic && paragraph.spans.some((span) => span.italic)) add('Schriftschnitt (Kursiv)', 'Kursiv', 'Normal');
  if (paragraph.spans.some((span) => span.underline)) add('Unterstreichung', 'Aktiv', 'Keine');
  if (paragraph.spans.some((span) => span.strikethrough)) add('Durchstreichung', 'Aktiv', 'Keine');
  if (paragraph.spans.some((span) => span.subscript)) add('Tiefstellung', 'Aktiv', 'Keine');
  if (paragraph.spans.some((span) => span.superscript)) add('Hochstellung', 'Aktiv', 'Keine');

  const textColors = distinctDefined(paragraph.spans.map((span) => span.text_color));
  if (textColors.length && textColors.some((value) => value !== base.textColor)) {
    add('Schriftfarbe', displayValues(textColors), base.textColor ?? 'Theme-Standard');
  }
  const highlights = distinctDefined(paragraph.spans.map((span) => span.highlight_color));
  if (highlights.length) add('Texthervorhebung', displayValues(highlights), 'Keine');
  const backgrounds = distinctDefined(paragraph.spans.map((span) => span.background_color));
  if (backgrounds.length) add('Zeichenhintergrund', displayValues(backgrounds), 'Keiner');

  add('Ausrichtung', paragraph.style.alignment, base.alignment ?? 'left');
  add('Zeilenabstand', paragraph.style.line_height, base.lineHeight);
  add('Abstand davor', `${paragraph.style.space_before} pt`, `${base.spaceBefore} pt`);
  add('Abstand danach', `${paragraph.style.space_after} pt`, `${base.spaceAfter} pt`);
  add('Linker Einzug', `${paragraph.style.left_indent_mm ?? 0} mm`, '0 mm');
  add('Rechter Einzug', `${paragraph.style.right_indent_mm ?? 0} mm`, '0 mm');
  add('Erstzeileneinzug', `${paragraph.style.first_line_indent_mm ?? 0} mm`, `${base.firstLineIndentMm ?? 0} mm`);
  add('Hängender Einzug', `${paragraph.style.hanging_indent_mm ?? 0} mm`, `${base.hangingIndentMm ?? 0} mm`);

  const booleanProperties: Array<[string, boolean | undefined, boolean | undefined]> = [
    ['Mit nächstem Absatz zusammenhalten', paragraph.style.keep_with_next, base.keepWithNext],
    ['Zeilen zusammenhalten', paragraph.style.keep_lines_together, base.keepLinesTogether],
    ['Schusterjungen/Hurenkinder', paragraph.style.widow_orphan_control, base.widowOrphanControl],
    ['Seitenumbruch davor', paragraph.style.page_break_before, base.pageBreakBefore],
  ];
  for (const [label, current, expected] of booleanProperties) {
    if (Boolean(current) !== Boolean(expected)) add(label, current ? 'Aktiv' : 'Inaktiv', expected ? 'Aktiv' : 'Inaktiv');
  }

  if (!sameStructuredValue(paragraph.style.borders, base.borders)) add('Absatzrahmen', 'Direkt formatiert', base.borders ? 'Vorlagenrahmen' : 'Keiner');
  if (!sameStructuredValue(paragraph.style.shading, base.shading)) add('Absatzschattierung', 'Direkt formatiert', base.shading ? 'Vorlagenschattierung' : 'Keine');
  if (!sameStructuredValue(paragraph.style.tab_stops, base.tabStops)) add('Tabstopps', 'Direkt formatiert', base.tabStops?.length ? 'Vorlagentabstopps' : 'Keine');
  if (paragraph.style.text_direction && paragraph.style.text_direction !== 'auto') add('Absatzrichtung', paragraph.style.text_direction.toUpperCase(), 'Automatisch');
  if (paragraph.style.line_break_mode && paragraph.style.line_break_mode !== 'normal') add('Zeilenumbruchmodus', paragraph.style.line_break_mode, 'normal');
  if (paragraph.style.hyphenation_mode && paragraph.style.hyphenation_mode !== 'manual') add('Silbentrennung', paragraph.style.hyphenation_mode, 'manual');

  return deltas;
}

export function applyWriterStyleDefinitionToParagraph(
  paragraph: Paragraph,
  definition: WriterStyleDefinition,
): Paragraph {
  return {
    ...paragraph,
    style: {
      ...paragraph.style,
      style_name: definition.name,
      alignment: definition.alignment ?? 'left',
      line_height: definition.lineHeight,
      space_before: definition.spaceBefore,
      space_after: definition.spaceAfter,
      first_line_indent_mm: definition.firstLineIndentMm,
      hanging_indent_mm: definition.hangingIndentMm,
    },
    spans: paragraph.spans.map((span) => ({
      ...span,
      bold: definition.bold,
      italic: Boolean(definition.italic),
      font_family: definition.fontFamily,
      font_size_pt: definition.fontSizePt,
      text_color: definition.textColor,
    })),
  };
}

export interface WriterAutoUpdateResult {
  paragraphs: Paragraph[];
  paragraphStyles: WriterStyleDefinition[];
  changed: boolean;
}

export function synchronizeWriterAutoUpdate(
  paragraphs: Paragraph[],
  changedParagraphId: string,
  styles?: WriterStyleDefinition[],
): WriterAutoUpdateResult {
  const definitions = ensureWriterStyles(styles);
  const changedParagraph = paragraphs.find((paragraph) => paragraph.id === changedParagraphId);
  if (!changedParagraph) return { paragraphs, paragraphStyles: definitions, changed: false };
  const styleName = inferWriterStyleName(changedParagraph);
  const definition = definitions.find((style) => style.name === styleName);
  if (!definition?.autoUpdate) return { paragraphs, paragraphStyles: definitions, changed: false };

  const paragraphStyles = updateWriterStyle(
    definitions,
    styleName,
    writerStylePatchFromParagraph(changedParagraph, writerStyleForParagraph(changedParagraph, definitions)),
  );
  return {
    paragraphStyles,
    changed: true,
    paragraphs: paragraphs.map((paragraph) => {
      const paragraphStyleName = inferWriterStyleName(paragraph);
      return writerStyleInheritsFrom(paragraphStyles, paragraphStyleName, styleName)
        ? applyWriterStyleDefinitionToParagraph(paragraph, writerStyleForParagraph(paragraph, paragraphStyles))
        : paragraph;
    }),
  };
}

export function applyWriterStyle(paragraph: Paragraph, styleName: WriterParagraphStyleName): Paragraph {
  const headingMatch = styleName.match(/^heading([1-9])$/u);
  const headingLevel = headingMatch ? Number(headingMatch[1]) as Paragraph['style']['heading_level'] : undefined;
  return {
    ...paragraph,
    style: {
      ...paragraph.style,
      style_name: styleName,
      heading_level: headingLevel,
    },
  };
}

function characterStyleFormat(
  base: Omit<TextSpan, 'text'>,
  style: WriterCharacterStyleDefinition,
): Omit<TextSpan, 'text'> {
  return {
    ...base,
    character_style_id: style.id,
    bold: style.bold ?? base.bold,
    italic: style.italic ?? base.italic,
    underline: style.underline ?? base.underline,
    strikethrough: style.strikethrough ?? base.strikethrough,
    font_family: style.fontFamily ?? base.font_family,
    font_size_pt: style.fontSizePt ?? base.font_size_pt,
    text_color: style.textColor ?? base.text_color,
    highlight_color: style.highlightColor ?? base.highlight_color,
  };
}

export function applyWriterCharacterStyle(
  paragraph: Paragraph,
  styleId: string,
  catalog: WriterStyleCatalog,
  selection?: { start: number; end: number },
): Paragraph {
  const style = catalog.characterStyles.find((candidate) => candidate.id === styleId);
  if (!style) return paragraph;
  const textLength = paragraph.spans.reduce((total, span) => total + span.text.length, 0);
  const start = selection ? selection.start : 0;
  const end = selection && selection.start !== selection.end ? selection.end : textLength;
  const base = writerTextSpanFormatAtOffset(paragraph, start);
  return applyWriterTextSpanFormatRange(paragraph, start, end, characterStyleFormat(base, style));
}

export function applyWriterListStyle(
  paragraph: Paragraph,
  styleId: string,
  catalog: WriterStyleCatalog,
): Paragraph {
  const style = catalog.listStyles.find((candidate) => candidate.id === styleId);
  if (!style) return paragraph;
  return {
    ...paragraph,
    style: {
      ...paragraph.style,
      list_style: style.listStyle,
      list_style_id: style.id,
      list_level: paragraph.style.list_level ?? 0,
      left_indent_mm: style.leftIndentMm,
      hanging_indent_mm: style.hangingIndentMm,
    },
  };
}

export function applyWriterTableStyle(table: WriterTableBlockData, styleId: string, catalog: WriterStyleCatalog): WriterTableBlockData {
  return catalog.tableStyles.some((style) => style.id === styleId) ? { ...table, styleId } : table;
}

export function applyWriterLinkedStyle(paragraph: Paragraph, styleId: string, catalog: WriterStyleCatalog): Paragraph {
  const style = catalog.linkedStyles.find((candidate) => candidate.id === styleId);
  if (!style) return paragraph;
  const paragraphStyled = applyWriterStyle(paragraph, style.paragraphStyleName);
  const characterStyled = applyWriterCharacterStyle(paragraphStyled, style.characterStyleId, catalog);
  return { ...characterStyled, style: { ...characterStyled.style, linked_style_id: style.id } };
}

export function writerTableStyle(table: WriterTableBlockData, catalog: WriterStyleCatalog): WriterTableStyleDefinition {
  const fallback = DEFAULT_WRITER_TABLE_STYLES[0];
  const style = catalog.tableStyles.find((candidate) => candidate.id === table.styleId) ?? catalog.tableStyles[0] ?? fallback;
  const safeColor = (value: string, fallbackColor: string): string => /^#[0-9a-f]{6}$/iu.test(value) ? value : fallbackColor;
  return {
    ...style,
    headerBackground: safeColor(style.headerBackground, fallback.headerBackground),
    rowBackground: safeColor(style.rowBackground, fallback.rowBackground),
    alternateRowBackground: safeColor(style.alternateRowBackground, fallback.alternateRowBackground),
    borderColor: safeColor(style.borderColor, fallback.borderColor),
    textColor: safeColor(style.textColor, fallback.textColor),
  };
}

export function updateWriterStyle(
  styles: WriterStyleDefinition[] | undefined,
  styleName: WriterParagraphStyleName,
  patch: Partial<Omit<WriterStyleDefinition, 'name' | 'label'>>,
): WriterStyleDefinition[] {
  const definitions = ensureWriterStyles(styles);
  const available = new Set(definitions.map((style) => style.name));
  if (patch.basedOn !== undefined && !available.has(patch.basedOn as WriterParagraphStyleName)) {
    throw new RangeError(`Unknown base style: ${patch.basedOn}`);
  }
  if (patch.nextStyle !== undefined && !available.has(patch.nextStyle as WriterParagraphStyleName)) {
    throw new RangeError(`Unknown next style: ${patch.nextStyle}`);
  }
  if (writerStyleRelationshipWouldCycle(definitions, styleName, patch.basedOn)) {
    throw new RangeError(`Style inheritance cycle rejected for ${styleName}`);
  }
  return definitions.map((style) => style.name === styleName ? { ...style, ...patch } : style);
}
