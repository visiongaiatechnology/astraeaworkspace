// STATUS: DIAMANT VGT SUPREME — Writer list projection and fragment marker contract
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Paragraph } from '../../../../../../shared/contracts/workspace';
import {
  resolveWriterParagraphListPresentation,
  WriterParagraphListMarker,
} from '../../../../editor/paragraphs/WriterParagraphListMarker';

function makeParagraph(id: string, style: Partial<Paragraph['style']> = {}): Paragraph {
  return {
    id,
    spans: [{ text: id }],
    style: {
      alignment: 'left',
      line_height: 1.5,
      space_before: 0,
      space_after: 8,
      ...style,
    },
  };
}

function renderMarker(
  paragraph: Paragraph,
  allParagraphs: Paragraph[] = [paragraph],
  paragraphIndex = 0,
  options: { isFirstFragment?: boolean; isLight?: boolean; isRightToLeft?: boolean; readOnly?: boolean } = {},
): string {
  const presentation = resolveWriterParagraphListPresentation(
    paragraph,
    allParagraphs,
    paragraphIndex,
  );

  return renderToStaticMarkup(
    <WriterParagraphListMarker
      paragraph={paragraph}
      presentation={presentation}
      isFirstFragment={options.isFirstFragment ?? true}
      isLight={options.isLight ?? true}
      isRightToLeft={options.isRightToLeft ?? false}
      readOnly={options.readOnly ?? false}
    />,
  );
}

describe('Writer paragraph list marker boundary', () => {
  it('projects hierarchical numbering and its shared level geometry', () => {
    const paragraphs = [
      makeParagraph('root', { list_style: 'number', list_level: 0 }),
      makeParagraph('nested', { list_style: 'number', list_level: 1 }),
    ];
    const presentation = resolveWriterParagraphListPresentation(paragraphs[1], paragraphs, 1);

    expect(presentation.listOrdinal).toBe('1.1.');
    expect(presentation.levelGeometry?.leftIndentMm).toBeGreaterThan(0);
    expect(renderMarker(paragraphs[1], paragraphs, 1)).toContain('1.1.');
  });

  it('keeps custom bullet glyphs and RTL marker placement in the presentation owner', () => {
    const paragraph = makeParagraph('custom-bullet', {
      list_style: 'bullet',
      list_override_glyph: '✦',
    });
    const markup = renderMarker(paragraph, [paragraph], 0, { isLight: false, isRightToLeft: true });

    expect(markup).toContain('✦');
    expect(markup).toContain('right-3');
    expect(markup).toContain('text-slate-300');
  });

  it('preserves read-only checklist semantics and omits markers on continuation fragments', () => {
    const paragraph = makeParagraph('checklist', { list_style: 'checklist' });

    expect(renderMarker(paragraph, [paragraph], 0, { readOnly: true })).toContain('disabled=""');
    expect(renderMarker(paragraph, [paragraph], 0, { isFirstFragment: false })).toBe('');
  });
});
