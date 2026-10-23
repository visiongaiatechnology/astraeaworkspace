// STATUS: DIAMANT VGT SUPREME — Writer view-mode accessibility and immutability verification
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Paragraph } from '../../../../../../shared/contracts/workspace';
import { WriterParagraphItem } from '../../../../editor/paragraphs/WriterParagraphItem';
import { WriterViewModeControls } from '../../../../formatting/toolbar/WriterViewModeControls';

const paragraph: Paragraph = {
  id: 'paragraph-reading-test',
  style: {
    style_name: 'normal',
    alignment: 'left',
    line_height: 1.5,
    space_before: 0,
    space_after: 8,
  },
  spans: [{ text: 'Immutable reading content' }],
};

describe('Writer view-mode components', () => {
  it('exposes all six modes as an accessible single-selection control', () => {
    const markup = renderToStaticMarkup(
      <WriterViewModeControls
        viewMode="reading"
        onSetViewMode={() => undefined}
        zoom={100}
        onSetZoom={() => undefined}
      />,
    );

    expect(markup).toContain('role="group"');
    for (const mode of ['print', 'continuous', 'draft', 'outline', 'reading', 'focus']) {
      expect(markup).toContain(`data-writer-view-mode="${mode}"`);
    }
    expect(markup).toMatch(/aria-pressed="true"[^>]*data-writer-view-mode="reading"/);
    expect(markup.match(/aria-pressed="true"/g)).toHaveLength(1);
  });

  it('renders Reading paragraphs without mutation controls', () => {
    const markup = renderToStaticMarkup(
      <WriterParagraphItem
        paragraph={paragraph}
        paragraphIndex={0}
        allParagraphs={[paragraph]}
        styles={[]}
        isLight
        activeParagraphId={paragraph.id}
        draggedPIdx={null}
        dragOverPIdx={null}
        showNonPrinting={false}
        reviewMode="none"
        revisions={[]}
        onParagraphChange={() => 0}
        onTextSelection={() => undefined}
        onSelectParagraph={() => undefined}
        onAddParagraph={() => undefined}
        onDeleteParagraph={() => undefined}
        onDragStart={() => undefined}
        onDragOver={() => undefined}
        onDrop={() => undefined}
        readOnly
      />,
    );

    expect(markup).toContain('readOnly=""');
    expect(markup).toContain('aria-readonly="true"');
    expect(markup).not.toContain('Absatz löschen');
    expect(markup).not.toContain('draggable="true"');
  });
});
