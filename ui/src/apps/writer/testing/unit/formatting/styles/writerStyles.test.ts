// STATUS: DIAMANT VGT SUPREME — Writer style-domain verification
import { describe, expect, it } from 'vitest';
import type { Paragraph, WriterParagraphStyleName, WriterTableBlockData } from '../../../../../../shared/contracts/workspace';
import {
  DEFAULT_WRITER_STYLES,
  applyWriterDocumentTheme,
  applyWriterCharacterStyle,
  applyWriterLinkedStyle,
  applyWriterListStyle,
  applyWriterTableStyle,
  ensureWriterStyleCatalog,
  nextWriterParagraphStyleName,
  resolveWriterStyleDefinition,
  synchronizeWriterAutoUpdate,
  updateWriterStyle,
  writerStylePatchFromParagraph,
  writerDirectFormattingDeltas,
  writerStyleForParagraph,
  writerTableStyle,
  writerTextShadow,
} from '../../../../formatting/styles/writerStyles';

const paragraph = (): Paragraph => ({
  id: 'p-1',
  style: { alignment: 'left', line_height: 1.5, space_before: 0, space_after: 8 },
  spans: [{ text: 'Alpha Beta', font_size_pt: 11 }],
});

describe('Writer style catalog', () => {
  it('applies document-wide font, color and effect tokens without changing style identities', () => {
    const themed = applyWriterDocumentTheme(DEFAULT_WRITER_STYLES, 'crimson-burgundy');
    expect(themed.find((style) => style.name === 'normal')).toMatchObject({
      fontFamily: 'Merriweather, serif',
      textColor: '#450a0a',
      textEffect: 'none',
    });
    expect(themed.find((style) => style.name === 'heading1')).toMatchObject({
      name: 'heading1',
      fontFamily: 'Merriweather, serif',
      textColor: '#991b1b',
      textEffect: 'strong-shadow',
    });
    expect(writerTextShadow('strong-shadow')).toContain('2px');
    expect(() => applyWriterDocumentTheme(DEFAULT_WRITER_STYLES, 'missing-theme')).toThrow(/unknown writer document theme/iu);
  });

  it('correctly derives fonts and accent colors for all document theme palettes', () => {
    const navy = applyWriterDocumentTheme(DEFAULT_WRITER_STYLES, 'executive-navy');
    expect(navy.find((s) => s.name === 'normal')?.fontFamily).toBe('Calibri, sans-serif');
    expect(navy.find((s) => s.name === 'heading1')?.fontFamily).toBe('Times New Roman, serif');
    expect(navy.find((s) => s.name === 'heading1')?.textColor).toBe('#1e3a8a');

    const emerald = applyWriterDocumentTheme(DEFAULT_WRITER_STYLES, 'emerald-forest');
    expect(emerald.find((s) => s.name === 'normal')?.fontFamily).toBe('Roboto Serif, serif');
    expect(emerald.find((s) => s.name === 'normal')?.textColor).toBe('#064e3b');
    expect(emerald.find((s) => s.name === 'heading1')?.textColor).toBe('#047857');

    const mono = applyWriterDocumentTheme(DEFAULT_WRITER_STYLES, 'technical-mono');
    expect(mono.find((s) => s.name === 'normal')?.fontFamily).toBe('JetBrains Mono, monospace');
    expect(mono.find((s) => s.name === 'heading1')?.fontFamily).toBe('JetBrains Mono, monospace');
    expect(mono.find((s) => s.name === 'heading1')?.textColor).toBe('#0369a1');

    const indigo = applyWriterDocumentTheme(DEFAULT_WRITER_STYLES, 'modern-indigo');
    expect(indigo.find((s) => s.name === 'normal')?.fontFamily).toBe('Inter, sans-serif');
    expect(indigo.find((s) => s.name === 'heading1')?.textColor).toBe('#4f46e5');

    // Verify paragraph style resolution
    const bodyP: Paragraph = { id: 'p-b', style: { alignment: 'left', line_height: 1.5, space_before: 0, space_after: 8 }, spans: [{ text: 'Body' }] };
    const headingP: Paragraph = { id: 'p-h', style: { alignment: 'left', line_height: 1.3, space_before: 10, space_after: 6, heading_level: 2 }, spans: [{ text: 'Sub' }] };

    const bodyStyle = writerStyleForParagraph(bodyP, emerald);
    expect(bodyStyle.fontFamily).toBe('Roboto Serif, serif');
    expect(bodyStyle.textColor).toBe('#064e3b');

    const headingStyle = writerStyleForParagraph(headingP, emerald);
    expect(headingStyle.fontFamily).toBe('Roboto Serif, serif');
    expect(headingStyle.textColor).toBe('#047857');
  });

  it('provides every required heading, caption, and TOC built-in', () => {
    const names = new Set(DEFAULT_WRITER_STYLES.map((style) => style.name));
    for (let level = 1; level <= 9; level += 1) {
      expect(names.has(`heading${level}` as WriterParagraphStyleName)).toBe(true);
      expect(names.has(`toc${level}` as WriterParagraphStyleName)).toBe(true);
    }
    expect(names.has('normal')).toBe(true);
    expect(names.has('title')).toBe(true);
    expect(names.has('subtitle')).toBe(true);
    expect(names.has('quote')).toBe(true);
    expect(names.has('caption')).toBe(true);
  });

  it('migrates legacy paragraph styles without losing the other style domains', () => {
    const catalog = ensureWriterStyleCatalog(undefined, [{
      name: 'normal', label: 'Body', fontSizePt: 12, bold: false, lineHeight: 1.4, spaceBefore: 0, spaceAfter: 6,
    }]);

    expect(catalog.paragraphStyles.find((style) => style.name === 'normal')?.label).toBe('Body');
    expect(catalog.characterStyles.length).toBeGreaterThan(0);
    expect(catalog.listStyles.length).toBeGreaterThan(0);
    expect(catalog.tableStyles.length).toBeGreaterThan(0);
    expect(catalog.linkedStyles.length).toBeGreaterThan(0);
  });

  it('applies a character style only to the selected range and persists its semantic id', () => {
    const catalog = ensureWriterStyleCatalog();
    const styled = applyWriterCharacterStyle(paragraph(), 'strong', catalog, { start: 6, end: 10 });

    expect(styled.spans.map((span) => span.text)).toEqual(['Alpha ', 'Beta']);
    expect(styled.spans[0].character_style_id).toBeUndefined();
    expect(styled.spans[1]).toMatchObject({ character_style_id: 'strong', bold: true });
  });

  it('applies list geometry and a stable list-style reference', () => {
    const catalog = ensureWriterStyleCatalog();
    const styled = applyWriterListStyle(paragraph(), 'number-standard', catalog);

    expect(styled.style).toMatchObject({
      list_style: 'number',
      list_style_id: 'number-standard',
      list_level: 0,
      left_indent_mm: 6.35,
      hanging_indent_mm: 3.18,
    });
  });

  it('applies both facets of a linked style', () => {
    const catalog = ensureWriterStyleCatalog();
    const styled = applyWriterLinkedStyle(paragraph(), 'title-accent', catalog);

    expect(styled.style).toMatchObject({ style_name: 'title', linked_style_id: 'title-accent' });
    expect(styled.spans[0]).toMatchObject({ character_style_id: 'strong', bold: true });
  });

  it('assigns and resolves table styles without mutating table content', () => {
    const catalog = ensureWriterStyleCatalog();
    const table: WriterTableBlockData = {
      id: 't-1', columns: ['A'], rows: [{ id: 'r-1', cells: [{ id: 'c-1', content: 'Value' }] }],
    };
    const styled = applyWriterTableStyle(table, 'grid-accent', catalog);

    expect(styled).not.toBe(table);
    expect(styled.rows).toBe(table.rows);
    expect(writerTableStyle(styled, catalog).id).toBe('grid-accent');
  });

  it('resolves based-on inheritance while preserving the child identity', () => {
    const styles = updateWriterStyle(DEFAULT_WRITER_STYLES, 'normal', {
      fontFamily: 'Astraea Sans',
      textColor: '#123456',
    });
    const resolved = resolveWriterStyleDefinition('heading1', styles);

    expect(resolved).toMatchObject({
      name: 'heading1',
      basedOn: 'normal',
      fontFamily: 'Astraea Sans',
      fontSizePt: 20,
      textColor: '#123456',
    });
  });

  it('rejects cyclic or unknown style relationships and bounds malformed persisted cycles', () => {
    expect(() => updateWriterStyle(DEFAULT_WRITER_STYLES, 'normal', { basedOn: 'heading1' })).toThrow(/cycle/iu);
    expect(() => updateWriterStyle(DEFAULT_WRITER_STYLES, 'heading1', { nextStyle: 'missing' })).toThrow(/unknown next/iu);

    const malformed = DEFAULT_WRITER_STYLES.map((style) => {
      if (style.name === 'normal') return { ...style, basedOn: 'heading1' };
      if (style.name === 'heading1') return { ...style, basedOn: 'normal' };
      return style;
    });
    expect(resolveWriterStyleDefinition('heading1', malformed)).toMatchObject({ name: 'heading1', fontSizePt: 20 });
  });

  it('uses next-style semantics for a newly inserted paragraph', () => {
    const title = { ...paragraph(), style: { ...paragraph().style, style_name: 'title' as const } };
    expect(nextWriterParagraphStyleName(title, DEFAULT_WRITER_STYLES)).toBe('subtitle');
    expect(nextWriterParagraphStyleName(paragraph(), DEFAULT_WRITER_STYLES)).toBe('normal');
  });

  it('derives a bounded automatic-update patch from direct paragraph formatting', () => {
    const formatted: Paragraph = {
      ...paragraph(),
      style: { ...paragraph().style, style_name: 'normal', alignment: 'center', space_before: 12 },
      spans: [{ text: 'Alpha', bold: true, font_family: 'Astraea Sans', font_size_pt: 13, text_color: '#112233' }],
    };
    const resolved = resolveWriterStyleDefinition('normal', DEFAULT_WRITER_STYLES);
    expect(writerStylePatchFromParagraph(formatted, resolved)).toMatchObject({
      alignment: 'center',
      spaceBefore: 12,
      bold: true,
      fontFamily: 'Astraea Sans',
      fontSizePt: 13,
      textColor: '#112233',
    });
  });

  it('reports only visible direct formatting and never flags inherited bold as removed', () => {
    const inheritedHeading: Paragraph = {
      ...paragraph(),
      id: 'heading',
      style: { ...paragraph().style, style_name: 'heading1', line_height: 1.25, space_before: 14 },
      spans: [{ text: 'Inherited heading' }],
    };
    expect(writerDirectFormattingDeltas(inheritedHeading)).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Schriftschnitt (Fett)' }),
    ]));

    const mixed: Paragraph = {
      ...paragraph(),
      id: 'mixed',
      style: { ...paragraph().style, style_name: 'normal', line_height: 1.55 },
      spans: [
        { text: 'Normal' },
        { text: 'Large', bold: true, font_size_pt: 18, text_color: '#dc2626' },
      ],
    };
    const deltas = writerDirectFormattingDeltas(mixed);
    expect(deltas).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Schriftschnitt (Fett)', current: 'Fett', base: 'Normal' }),
      expect.objectContaining({ label: 'Schriftgröße', current: '18 pt', base: '11 pt' }),
      expect.objectContaining({ label: 'Schriftfarbe', current: '#dc2626' }),
    ]));
  });

  it('reports paragraph geometry, pagination and structured decoration overrides', () => {
    const formatted = paragraph();
    formatted.id = 'formatted';
    formatted.style = {
      ...formatted.style,
      alignment: 'right',
      left_indent_mm: 12,
      keep_with_next: true,
      borders: {
        bottom: { style: 'solid', widthPt: 1, color: '#334155', spacingPt: 2 },
      },
      tab_stops: [{ id: 'tab', positionMm: 40, alignment: 'right', leader: 'dots' }],
      text_direction: 'rtl',
    };
    const labels = writerDirectFormattingDeltas(formatted).map((delta) => delta.label);
    expect(labels).toEqual(expect.arrayContaining([
      'Ausrichtung',
      'Linker Einzug',
      'Mit nächstem Absatz zusammenhalten',
      'Absatzrahmen',
      'Tabstopps',
      'Absatzrichtung',
    ]));
  });

  it('atomically propagates an enabled automatic update to matching and derived paragraphs', () => {
    const styles = updateWriterStyle(DEFAULT_WRITER_STYLES, 'normal', { autoUpdate: true });
    const changed: Paragraph = {
      ...paragraph(),
      id: 'changed',
      style: { ...paragraph().style, style_name: 'normal', alignment: 'right' },
      spans: [{ text: 'Changed', font_family: 'Astraea Sans', font_size_pt: 13 }],
    };
    const sibling: Paragraph = {
      ...paragraph(),
      id: 'sibling',
      style: { ...paragraph().style, style_name: 'normal' },
    };
    const derived: Paragraph = {
      ...paragraph(),
      id: 'derived',
      style: { ...paragraph().style, style_name: 'heading1', heading_level: 1 },
    };

    const result = synchronizeWriterAutoUpdate([changed, sibling, derived], changed.id, styles);

    expect(result.changed).toBe(true);
    expect(result.paragraphStyles.find((style) => style.name === 'normal')).toMatchObject({
      alignment: 'right',
      fontFamily: 'Astraea Sans',
      fontSizePt: 13,
      autoUpdate: true,
    });
    expect(result.paragraphs.find((item) => item.id === 'sibling')?.style.alignment).toBe('right');
    expect(result.paragraphs.find((item) => item.id === 'derived')?.spans[0].font_family).toBe('Astraea Sans');
    expect(result.paragraphs.find((item) => item.id === 'derived')?.spans[0].font_size_pt).toBe(20);
  });

  it('allows customizing font colors under an active document theme without reversion', () => {
    // 1. Apply theme
    const themedStyles = applyWriterDocumentTheme(DEFAULT_WRITER_STYLES, 'emerald-forest');
    const catalog = ensureWriterStyleCatalog(undefined, themedStyles);
    expect(catalog.paragraphStyles.find((s) => s.name === 'heading1')?.textColor).toBe('#047857');

    // 2. Custom style color modification (e.g., via Style Inspector or Toolbar update)
    const updatedStyles = updateWriterStyle(catalog.paragraphStyles, 'heading1', { textColor: '#dc2626' });
    const updatedCatalog = ensureWriterStyleCatalog({ ...catalog, paragraphStyles: updatedStyles });
    expect(updatedCatalog.paragraphStyles.find((s) => s.name === 'heading1')?.textColor).toBe('#dc2626');

    // 3. Direct paragraph span color override
    const headingP: Paragraph = {
      id: 'p-h1',
      style: { alignment: 'left', line_height: 1.3, space_before: 10, space_after: 6, heading_level: 1 },
      spans: [{ text: 'Emerald heading', text_color: '#9333ea' }],
    };
    const resolved = writerStyleForParagraph(headingP, updatedCatalog.paragraphStyles);
    const effectiveColor = headingP.spans[0].text_color ?? resolved.textColor;
    expect(effectiveColor).toBe('#9333ea');
  });
});
