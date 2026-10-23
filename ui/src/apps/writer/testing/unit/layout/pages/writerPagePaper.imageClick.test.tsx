// @vitest-environment happy-dom
// STATUS: PLATIN — native round 5: the area around a picture must accept a click
//
// The media islands sit inside `<div contenteditable="false">` wrappers. The page-body click
// filter used to exclude every `[contenteditable="false"]` island, so a click in the padding
// around a picture — or beside a centred image — was silently discarded and the space below the
// image stayed unusable. These tests prove the click arrives, and that the measured box tells
// the resolver it carries media (`hasMedia`), which is what creates the follow-up paragraph.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Paragraph, WriterImageBlockData } from '../../../../../../shared/contracts/workspace';
import type { PageSetupConfig } from '../../../../types';
import { ensureWriterStyleCatalog } from '../../../../formatting/styles/writerStyles';
import { recalculateNotes } from '../../../../references/notes/writerNotesEngine';
import { WriterPagePaper } from '../../../../layout/pages/WriterPagePaper';

const pageSetup: PageSetupConfig = {
  paperSize: 'A4',
  orientation: 'portrait',
  margins: 'normal',
  paperColor: 'white',
  showPageNumbers: true,
  headerText: '',
  footerText: '',
};
const styleCatalog = ensureWriterStyleCatalog(undefined, undefined);

function paragraph(id: string, text: string): Paragraph {
  return {
    id,
    style: { alignment: 'left', line_height: 1.6, space_before: 0, space_after: 0 },
    spans: [{ text }],
  };
}

const EMPTY_PARAGRAPH = paragraph('p1', '');
const IMAGE: WriterImageBlockData = {
  id: 'img-1',
  name: 'bild.png',
  dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
  intrinsicWidth: 800,
  intrinsicHeight: 600,
  widthPercent: 70,
  alignment: 'center',
  altText: 'Ein Bild',
  anchorParagraphId: 'p1',
};

function pageModel(paragraphs: Paragraph[]) {
  return {
    id: 'page-1',
    pageIndex: 1,
    paragraphs,
    fragments: paragraphs.map((item) => ({
      key: `${item.id}:0`,
      paragraph: item,
      startOffset: 0,
      endOffset: item.spans.reduce((total, span) => total + span.text.length, 0),
      lineCount: 1,
      isFirst: true,
      isLast: true,
    })),
    tableFragments: [],
    usedFlowHeightPx: 0,
    availableFlowHeightPx: 500,
    isFirst: true,
    pageSetup,
    sectionId: 'document-default',
    sectionPageIndex: 1,
    displayPageNumber: 1,
    displayPageNumberString: '1',
  };
}

let container: HTMLElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

afterEach(async () => {
  if (root) {
    await act(async () => { root!.unmount(); });
    root = null;
  }
  container?.remove();
  container = null;
});

async function mountPage(
  onEmptyAreaClick: (click: unknown) => void,
  images: readonly WriterImageBlockData[] = [IMAGE],
): Promise<HTMLElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <WriterPagePaper
        page={pageModel([EMPTY_PARAGRAPH])}
        totalPages={1}
        docWordCount={0}
        viewMode="print"
        showRuler={false}
        effectivePageSetup={pageSetup}
        isLight
        paperBg="text-slate-900"
        backgroundColor="#ffffff"
        activeParagraph={EMPTY_PARAGRAPH}
        activeParagraphId="p1"
        paragraphs={[EMPTY_PARAGRAPH]}
        tables={[]}
        images={images as WriterImageBlockData[]}
        equations={[]}
        footnotes={[]}
        separatedNotes={recalculateNotes([], [])}
        styles={styleCatalog.paragraphStyles}
        styleCatalog={styleCatalog}
        draggedPIdx={null}
        dragOverPIdx={null}
        showNonPrinting={false}
        reviewMode="none"
        reviewerFilter="all"
        revisions={[]}
        documentTitle="Bildklick"
        readOnly={false}
        onParagraphChange={vi.fn(() => 0)}
        onTextSelection={vi.fn()}
        onSelectParagraph={vi.fn()}
        onAddParagraph={vi.fn()}
        onDeleteParagraph={vi.fn()}
        onDragStart={vi.fn()}
        onDragOver={vi.fn()}
        onDrop={vi.fn()}
        onPaperDrop={vi.fn()}
        onUpdateTable={vi.fn()}
        onDeleteTable={vi.fn()}
        onUpdateImage={vi.fn()}
        onDeleteImage={vi.fn()}
        onUpdateEquation={vi.fn()}
        onDeleteEquation={vi.fn()}
        onUpdateHeader={vi.fn()}
        onUpdateFooter={vi.fn()}
        onEmptyAreaClick={onEmptyAreaClick as never}
      />,
    );
  });
  return container;
}

describe('native round 5 — a click on the media island reaches the page', () => {
  it('does not swallow a click on the non-editable media wrapper', async () => {
    const onEmptyAreaClick = vi.fn();
    const host = await mountPage(onEmptyAreaClick);
    const figure = host.querySelector('[data-writer-image-id="img-1"]');
    expect(figure, 'das Bild muss gerendert sein').not.toBeNull();
    const island = figure!.closest('div[contenteditable="false"]');
    expect(island, 'die Bildebene liegt in einem contenteditable=false-Wrapper').not.toBeNull();

    await act(async () => {
      island!.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        clientX: 200,
        clientY: 500,
      }));
      await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
    });

    expect(onEmptyAreaClick, 'der Klick darf nicht lautlos verworfen werden').toHaveBeenCalledTimes(1);
    const click = onEmptyAreaClick.mock.calls[0]![0] as {
      direct: { measured: Array<{ paragraphId: string; hasMedia?: boolean; textLength: number }> };
    };
    // The measurement tells the resolver that the block carries media and no text.
    expect(click.direct.measured[0]!.paragraphId).toBe('p1');
    expect(click.direct.measured[0]!.textLength).toBe(0);
    expect(click.direct.measured[0]!.hasMedia).toBe(true);
  });

  /**
   * Native round 6 — the re-probe still typed above the picture, which is only explainable
   * by `hasMedia: false`. The flag must therefore not depend on which layer happens to draw
   * the object: an image pinned to the page renders in its own layer, *outside* the anchor
   * paragraph, and the model still says "this paragraph carries media".
   */
  it('reports hasMedia from the model even when no marker sits inside the anchor', async () => {
    const onEmptyAreaClick = vi.fn();
    const host = await mountPage(onEmptyAreaClick, [{ ...IMAGE, anchorTarget: 'page' }]);
    const anchor = host.querySelector('[data-writer-paragraph-anchor="p1"]');
    expect(anchor, 'der Ankerabsatz muss gerendert sein').not.toBeNull();
    expect(
      anchor!.querySelector('[data-writer-image-id]'),
      'die seitenfeste Bildebene liegt außerhalb des Ankers',
    ).toBeNull();

    const body = host.querySelector<HTMLElement>('[data-writer-page-body="true"]');
    expect(body).not.toBeNull();
    await act(async () => {
      body!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 200, clientY: 500 }));
      await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
    });

    expect(onEmptyAreaClick).toHaveBeenCalledTimes(1);
    const click = onEmptyAreaClick.mock.calls[0]![0] as {
      direct: { measured: Array<{ paragraphId: string; hasMedia?: boolean }> };
    };
    expect(click.direct.measured[0]!.hasMedia, 'das Modell weiß vom Bild').toBe(true);
  });

  /**
   * Native round 6 — the island **is** the marked element.
   *
   * `island.querySelector(marker)` searches descendants only, so an island that carries the
   * marker itself looked like a text island and swallowed the click. The area below the picture
   * never got a caret.
   */
  it('treats an island that is itself marked as media, not as a text island', async () => {
    const onEmptyAreaClick = vi.fn();
    const host = await mountPage(onEmptyAreaClick);
    const figure = host.querySelector('[data-writer-image-id="img-1"]');
    expect(figure).not.toBeNull();
    const island = figure!.closest<HTMLElement>('div[contenteditable="false"]');
    expect(island, 'die Bildebene liegt in einem contenteditable=false-Wrapper').not.toBeNull();
    // Simulate a layer that marks the wrapper itself instead of a descendant.
    island!.querySelectorAll('[data-writer-image-id]').forEach((element) => element.remove());
    island!.setAttribute('data-writer-media-object', 'true');

    await act(async () => {
      island!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 200, clientY: 500 }));
      await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
    });

    expect(onEmptyAreaClick, 'eine markierte Insel ist Medienfläche').toHaveBeenCalledTimes(1);
  });

  it('still filters clicks on real interactive elements', async () => {
    const onEmptyAreaClick = vi.fn();
    const host = await mountPage(onEmptyAreaClick);
    const textarea = host.querySelector('textarea');
    expect(textarea).not.toBeNull();
    await act(async () => {
      textarea!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
    });
    expect(onEmptyAreaClick).not.toHaveBeenCalled();
  });

  it('keeps text islands (equations) filtered, so only media is click-through', async () => {    const onEmptyAreaClick = vi.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <WriterPagePaper
          page={pageModel([paragraph('p1', 'Formel')])}
          totalPages={1}
          docWordCount={1}
          viewMode="print"
          showRuler={false}
          effectivePageSetup={pageSetup}
          isLight
          paperBg="text-slate-900"
          backgroundColor="#ffffff"
          activeParagraph={paragraph('p1', 'Formel')}
          activeParagraphId="p1"
          paragraphs={[paragraph('p1', 'Formel')]}
          tables={[]}
          images={[]}
          equations={[{ id: 'eq-1', latex: 'E = mc^2', anchorParagraphId: 'p1' }]}
          footnotes={[]}
          separatedNotes={recalculateNotes([], [])}
          styles={styleCatalog.paragraphStyles}
          styleCatalog={styleCatalog}
          draggedPIdx={null}
          dragOverPIdx={null}
          showNonPrinting={false}
          reviewMode="none"
          reviewerFilter="all"
          revisions={[]}
          documentTitle="Formelklick"
          readOnly={false}
          onParagraphChange={vi.fn(() => 0)}
          onTextSelection={vi.fn()}
          onSelectParagraph={vi.fn()}
          onAddParagraph={vi.fn()}
          onDeleteParagraph={vi.fn()}
          onDragStart={vi.fn()}
          onDragOver={vi.fn()}
          onDrop={vi.fn()}
          onPaperDrop={vi.fn()}
          onUpdateTable={vi.fn()}
          onDeleteTable={vi.fn()}
          onUpdateImage={vi.fn()}
          onDeleteImage={vi.fn()}
          onUpdateEquation={vi.fn()}
          onDeleteEquation={vi.fn()}
          onUpdateHeader={vi.fn()}
          onUpdateFooter={vi.fn()}
          onEmptyAreaClick={onEmptyAreaClick as never}
        />,
      );
    });
    const equationIsland = Array.from(container!.querySelectorAll<HTMLElement>('[contenteditable="false"]'))
      .find((element) => element.querySelector('[data-writer-equation-id], [data-writer-equation]') !== null
        || element.textContent?.includes('E = mc'));
    // The equation island exists; a click that lands on it must not become a page click.
    expect(equationIsland, 'die Formel liegt in einer contenteditable=false-Insel').toBeTruthy();
    await act(async () => {
      equationIsland!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 200, clientY: 200 }));
      await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
    });
    expect(onEmptyAreaClick).not.toHaveBeenCalled();
  });
});
