// STATUS: PLATIN — W-111 / W-113 / W-116 / W-119 / W-058: the surface reports the range
//
// The pure range reader is unit-tested next door. What these tests pin is that the
// rendered surface actually uses its answer: a pressed state a screen reader can
// read, a "mixed" placeholder in a control that cannot show a single value, and a
// visible marker where the ruler or the dialog would otherwise name one paragraph
// as if it were all of them.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ComponentProps } from 'react';
import type { Paragraph, WriterImageBlockData } from '../../../../../../shared/contracts/workspace';
import { WriterFormattingToolbar } from '../../../../formatting/toolbar/WriterFormattingToolbar';
import { WriterParagraphFormatModal } from '../../../../formatting/paragraphs/WriterParagraphFormatModal';
import { WriterRuler } from '../../../../layout/pages/WriterRuler';
import { WriterImageBlock } from '../../../../media/images/WriterImageBlock';
import { WriterStyleInspectorModal } from '../../../../formatting/styles/WriterStyleInspectorModal';
import { ensureWriterStyleCatalog } from '../../../../formatting/styles/writerStyles';
import {
  resolveWriterCoveredParagraphRanges,
  resolveWriterRangeFormatState,
  WRITER_MIXED_SELECT_VALUE,
} from '../../../../formatting/range/writerRangeFormatState';

const noop = (): void => undefined;

/**
 * Markup is compared through booleans: a failing `toContain` prints the whole
 * rendered surface, which buries the actual difference in thousands of
 * characters of toolbar.
 */
const has = (markup: string, needle: string): boolean => markup.includes(needle);
const count = (markup: string, needle: string): number => markup.split(needle).length - 1;

const paragraph = (id: string, overrides: Partial<Paragraph['style']> = {}, spans: Paragraph['spans'] = [{ text: `Text ${id}` }]): Paragraph => ({
  id,
  style: { alignment: 'left', line_height: 1.5, space_before: 0, space_after: 0, ...overrides },
  spans,
});

const rangeFormatFor = (paragraphs: readonly Paragraph[]) => resolveWriterRangeFormatState(
  paragraphs,
  resolveWriterCoveredParagraphRanges(paragraphs, 0, null, {
    paragraphIndexes: paragraphs.map((_, index) => index),
    startParagraphIndex: 0,
    startOffset: 0,
    endParagraphIndex: paragraphs.length - 1,
    endOffset: paragraphs[paragraphs.length - 1]?.spans.reduce((total, span) => total + span.text.length, 0) ?? 0,
    collapsed: false,
    spansParagraphs: paragraphs.length > 1,
  }),
);

const toolbarProps = {
  styles: [],
  currentTheme: 'default',
  viewMode: 'print',
  zoom: 100,
  canUndo: false,
  canRedo: false,
  onApplyStyle: noop,
  onToggleSpan: noop,
  onSetAlignment: noop,
  onToggleList: noop,
  onUpdateStyle: noop,
  onSetTextColor: noop,
  onSetHighlightColor: noop,
  onClearFormatting: noop,
  onSetLineSpacing: noop,
  onSelectTheme: noop,
  onInsertTable: noop,
  onInsertImage: noop,
  onInsertEquation: noop,
  onOpenPageSetup: noop,
  onOpenCitationModal: noop,
  onOpenSymbolsModal: noop,
  onOpenFootnoteModal: noop,
  onOpenBookmarkModal: noop,
  onOpenMailMergeModal: noop,
  onInsertLineBreak: noop,
  onInsertPageBreak: noop,
  onInsertColumnBreak: noop,
  onInsertSectionBreak: noop,
  onSetViewMode: noop,
  onSetZoom: noop,
  onUndo: noop,
  onRedo: noop,
} satisfies Omit<ComponentProps<typeof WriterFormattingToolbar>, 'paragraph' | 'rangeFormat' | 'selection'>;

const renderToolbar = (paragraphs: readonly Paragraph[], selection: { start: number; end: number } | null = null): string =>
  renderToStaticMarkup(
    <WriterFormattingToolbar {...toolbarProps} paragraph={paragraphs[0]} selection={selection} rangeFormat={rangeFormatFor(paragraphs)} />,
  );

describe('Toolbar states for a marked range (W-111)', () => {
  it('exposes a fully formatted range as pressed', () => {
    const markup = renderToolbar([paragraph('p1', {}, [{ text: 'Bold', bold: true }])]);
    expect(has(markup, 'title="Bold (Ctrl+B)" aria-label="Bold (Ctrl+B)" aria-pressed="true"')).toBe(true);
    // Bold and the left alignment — the paragraph's own alignment — are the two
    // toggles that are on; everything else states "off".
    expect(count(markup, 'data-writer-toggle-state="on"')).toBe(2);
  });

  it('exposes a range that only partly carries the property as mixed', () => {
    const markup = renderToolbar([
      paragraph('p1', {}, [{ text: 'Bold', bold: true }]),
      paragraph('p2', {}, [{ text: 'Plain' }]),
    ]);
    expect(has(markup, 'aria-pressed="mixed"')).toBe(true);
    expect(has(markup, 'data-writer-toggle-state="mixed"')).toBe(true);
    // No toggle may claim the whole range carries the property.
    expect(has(markup, 'title="Bold (Ctrl+B)" aria-label="Bold (Ctrl+B)" aria-pressed="true"')).toBe(false);
  });

  it('keeps the plain action buttons free of a pressed state', () => {
    const markup = renderToolbar([paragraph('p1')]);
    /*
     * AST-0106 changed this entry's shape on purpose: the table button is no longer a plain action that
     * inserts a fixed 3 × 1 table, it is a disclosure trigger that opens the size grid. The old
     * assertions pinned the *previous* markup — `aria-label="Insert table" class=` — and would have kept
     * passing only if the new button hid its `aria-haspopup`/`aria-expanded` behind the class attribute.
     * The intent of this test is unchanged and is re-pinned on the new shape: the entry carries **no**
     * pressed state, because it reports no toggle.
     */
    expect(has(markup, 'aria-label="Insert table"')).toBe(true);
    expect(markup.split('aria-label="Insert table"')[1]?.split('>')[0]?.includes('aria-pressed')).toBe(false);
    const trigger = markup.split('aria-label="Insert table"')[1]?.split('>')[0] ?? '';
    expect(trigger).toContain('aria-haspopup="true"');
    expect(trigger).toContain('aria-expanded="false"');
    expect(trigger).toContain('data-writer-table-size-trigger="true"');
    // An unformatted range still states "off" for every toggle.
    expect(count(markup, 'data-writer-toggle-state="off"')).toBeGreaterThanOrEqual(6);
  });
});

describe('Toolbar states across disagreeing paragraphs (W-116, W-113)', () => {
  it('marks every alignment button as mixed when the covered paragraphs differ', () => {
    const markup = renderToolbar([paragraph('p1'), paragraph('p2', { alignment: 'center' })]);
    // Five alignment buttons, each stating that the range disagrees.
    expect(count(markup, 'aria-pressed="mixed"')).toBeGreaterThanOrEqual(5);
    expect(has(markup, 'title="Align left — The marked range does not agree on this value"')).toBe(true);
  });

  it('offers the mixed placeholder in the font and spacing controls', () => {
    const markup = renderToolbar([
      paragraph('p1', {}, [{ text: 'Alpha', font_family: 'Inter, sans-serif', font_size_pt: 11 }]),
      paragraph('p2', {}, [{ text: 'Beta', font_family: 'Calibri, sans-serif', font_size_pt: 14 }]),
    ]);
    expect(has(markup, `value="${WRITER_MIXED_SELECT_VALUE}"`)).toBe(true);
    expect(has(markup, 'data-writer-font-family-mixed="true"')).toBe(true);
    expect(has(markup, 'data-writer-font-size-mixed="true"')).toBe(true);
  });

  it('says nothing mixed about a range that agrees', () => {
    const markup = renderToolbar([paragraph('p1', {}, [{ text: 'Alpha', font_family: 'Inter, sans-serif' }])]);
    expect(has(markup, `value="${WRITER_MIXED_SELECT_VALUE}"`)).toBe(false);
    expect(has(markup, 'data-writer-font-family-mixed="false"')).toBe(true);
  });

  it('names a family the known list does not carry instead of showing another one', () => {
    const markup = renderToolbar([paragraph('p1', {}, [{ text: 'Alpha', font_family: 'Garamond, serif' }])]);
    expect(has(markup, 'value="Garamond, serif"')).toBe(true);
    expect(has(markup, '>Garamond, serif</option>')).toBe(true);
  });
});

describe('Paragraph dialog names a disagreeing range (W-119)', () => {
  const render = (paragraphs: readonly Paragraph[]): string => renderToStaticMarkup(
    <WriterParagraphFormatModal
      isOpen
      onClose={noop}
      paragraph={paragraphs[0]}
      onUpdateParagraphStyle={noop}
      rangeFormat={rangeFormatFor(paragraphs)}
    />,
  );

  it('lists the fields the covered paragraphs do not agree on', () => {
    const markup = render([paragraph('p1'), paragraph('p2', { left_indent_mm: 12, alignment: 'center' })]);
    expect(has(markup, 'data-writer-range-mixed="true"')).toBe(true);
    expect(has(markup, 'data-writer-mixed-fields="alignment,left_indent_mm"')).toBe(true);
  });

  it('says nothing when the range agrees', () => {
    const markup = render([paragraph('p1', { left_indent_mm: 12 }), paragraph('p2', { left_indent_mm: 12 })]);
    expect(has(markup, 'data-writer-range-mixed="true"')).toBe(false);
  });
});

describe('Ruler marks a disagreeing range (W-119)', () => {
  const pageSetup = {
    paperSize: 'A4',
    orientation: 'portrait',
    margins: 'normal',
    paperColor: 'white',
    showPageNumbers: true,
    headerText: '',
    footerText: '',
  } as const;

  it('marks the indent handles and the tab-stop area as mixed', () => {
    const markup = renderToStaticMarkup(
      <WriterRuler
        pageSetup={pageSetup}
        mixedIndentMm={{ firstLine: true, left: true }}
        mixedTabStops
        zoom={100}
      />,
    );
    expect(count(markup, 'data-writer-indent-mixed="true"')).toBe(2);
    expect(has(markup, 'data-writer-tab-stops-mixed="true"')).toBe(true);
  });

  it('leaves the handles unmarked when the range agrees', () => {
    const markup = renderToStaticMarkup(<WriterRuler pageSetup={pageSetup} zoom={100} />);
    expect(has(markup, 'data-writer-indent-mixed="true"')).toBe(false);
    expect(has(markup, 'data-writer-tab-stops-mixed')).toBe(false);
  });
});

describe('Style inspector marks a disagreeing list template (W-117)', () => {
  const catalog = ensureWriterStyleCatalog();
  const render = (paragraphs: readonly Paragraph[]): string => renderToStaticMarkup(
    <WriterStyleInspectorModal
      isOpen
      onClose={noop}
      paragraph={paragraphs[0]}
      catalog={catalog}
      rangeFormat={rangeFormatFor(paragraphs)}
      onApplyStyle={noop}
      onApplyCharacterStyle={noop}
      onApplyListStyle={noop}
      onApplyLinkedStyle={noop}
      onApplyTableStyle={noop}
      onUpdateStyle={noop}
      onClearDirectFormatting={noop}
      styleSets={[]}
      onSaveStyleSet={noop}
      onImportStyleSet={noop}
      onApplyStyleSet={noop}
    />,
  );

  it('marks no list template as active when the covered paragraphs disagree', () => {
    const markup = render([
      paragraph('p1', { list_style: 'number', list_style_id: 'number-standard' }),
      paragraph('p2'),
    ]);
    expect(has(markup, 'data-writer-style-group-mixed="true"')).toBe(true);
    expect(has(markup, 'keine der Vorlagen gilt für alle Absätze')).toBe(true);
  });

  it('marks the template active when the whole range carries it', () => {
    const markup = render([
      paragraph('p1', { list_style: 'number', list_style_id: 'number-standard' }),
      paragraph('p2', { list_style: 'number', list_style_id: 'number-standard' }),
    ]);
    expect(has(markup, 'data-writer-style-group-mixed="true"')).toBe(false);
    expect(has(markup, 'aria-pressed="true"')).toBe(true);
  });
});

describe('Image flow buttons report their state (W-058)', () => {
  const image: WriterImageBlockData = {
    id: 'img-1',
    name: 'bild.png',
    dataUrl: 'data:image/png;base64,AAAA',
    intrinsicWidth: 800,
    intrinsicHeight: 600,
    widthPercent: 70,
    alignment: 'center',
    anchorParagraphId: 'p1',
  } as WriterImageBlockData;

  const render = (overrides: Partial<WriterImageBlockData>): string => renderToStaticMarkup(
    <WriterImageBlock image={{ ...image, ...overrides }} onUpdate={noop} onDelete={noop} />,
  );

  it('marks the active flow button as pressed', () => {
    const markup = render({ placement: 'float-right', alignment: 'right', wrapMode: 'square' });
    expect(count(markup, 'aria-pressed="true"')).toBe(1);
    expect(has(markup, 'aria-pressed="false"')).toBe(true);
  });

  it('gives every flow button a pressed state', () => {
    const markup = render({});
    expect(count(markup, 'aria-pressed="true"') + count(markup, 'aria-pressed="false"')).toBe(5);
  });
});
