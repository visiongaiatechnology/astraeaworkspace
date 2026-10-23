// @vitest-environment happy-dom
// STATUS: PLATIN — Continuation over the page break and character-precise caret
//
// ASTRAEA WRITER 50 V2 · M3 (WR-013, WR-014).
//
// One logical paragraph can be rendered as **several** DOM fragments because the
// paginator splits it at the page break. Those fragments are separate elements with
// their own text nodes, so every DOM position has to be translated into an offset of
// the *whole* paragraph — otherwise typing on page 2 would start at offset 0 again.
//
// The translator itself needs a DOM, so these are interaction tests: the real
// adapter, the real surface, real key events.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Paragraph } from '../../../../../shared/contracts/workspace';
import { WriterRichTextSurface } from '../../../editor/surface/WriterRichTextSurface';
import { WriterParagraphRichText } from '../../../editor/surface/WriterParagraphRichText';
import {
  readWriterSurfaceParagraphText,
  readWriterSurfaceSelection,
  resolveWriterSurfaceDomPoint,
  resolveWriterSurfacePointFromDom,
  writeWriterSurfaceSelection,
} from '../../../editor/surface/writerDomModelAdapter';
import { resetWriterCaretController } from '../../../editing/caret/writerCaretController';

function paragraph(id: string, text: string): Paragraph {
  return {
    id,
    style: { alignment: 'left', line_height: 1.5, space_before: 0, space_after: 0 },
    spans: [{ text }],
  };
}

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

/**
 * Renders one paragraph as **two** fragments the way the paginator does: the first
 * carries offsets `[0, split)`, the second `[split, length)`.
 */
async function mountSplitParagraph(
  text: string,
  split: number,
): Promise<{
  surface: HTMLElement;
  onParagraphTextChange: ReturnType<typeof vi.fn>;
}> {
  const model = paragraph('p-split', text);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const onParagraphTextChange = vi.fn(() => 0);
  await act(async () => {
    root!.render(
      <WriterRichTextSurface
        paragraphs={[model]}
        readOnly={false}
        ariaLabel="Testdokument"
        onSelectionChange={() => undefined}
        onParagraphTextChange={onParagraphTextChange}
        onSplitParagraph={() => undefined}
        onMergeParagraphBackward={() => undefined}
        onReplaceSelection={() => undefined}
      >
        <WriterParagraphRichText paragraph={model} start={0} end={split} style={{}} />
        <WriterParagraphRichText paragraph={model} start={split} end={text.length} style={{}} />
      </WriterRichTextSurface>,
    );
  });
  const surface = container.querySelector<HTMLElement>('[data-writer-rich-surface="true"]');
  expect(surface).not.toBeNull();
  return { surface: surface!, onParagraphTextChange };
}

beforeEach(() => {
  resetWriterCaretController();
});

afterEach(async () => {
  if (root) {
    await act(async () => { root!.unmount(); });
    root = null;
  }
  if (container) {
    container.remove();
    container = null;
  }
  document.getSelection()?.removeAllRanges();
});

describe('WR-013 — a paragraph split across the page break keeps absolute offsets', () => {
  it('renders two fragments and reads their text as one paragraph', async () => {
    const { surface } = await mountSplitParagraph('ABCDEFGHIJKLMNOPQRST', 10);
    expect(surface.querySelectorAll('[data-writer-surface-paragraph="p-split"]')).toHaveLength(2);
    expect(readWriterSurfaceParagraphText(surface, 'p-split')).toBe('ABCDEFGHIJKLMNOPQRST');
  });

  it('projects a model offset into the fragment that owns it', async () => {
    const { surface } = await mountSplitParagraph('ABCDEFGHIJKLMNOPQRST', 10);

    const firstHalf = resolveWriterSurfaceDomPoint(surface, { paragraphId: 'p-split', offset: 4 });
    expect(firstHalf).not.toBeNull();
    const firstFragment = (firstHalf!.node.nodeType === 1 ? firstHalf!.node as Element : firstHalf!.node.parentElement)
      ?.closest('[data-writer-surface-paragraph]');
    expect(firstFragment?.getAttribute('data-writer-surface-start')).toBe('0');

    const secondHalf = resolveWriterSurfaceDomPoint(surface, { paragraphId: 'p-split', offset: 15 });
    expect(secondHalf).not.toBeNull();
    const secondFragment = (secondHalf!.node.nodeType === 1 ? secondHalf!.node as Element : secondHalf!.node.parentElement)
      ?.closest('[data-writer-surface-paragraph]');
    // The caret belongs to the **second** page fragment, and its local offset is 5.
    expect(secondFragment?.getAttribute('data-writer-surface-start')).toBe('10');
    expect(secondHalf!.offset).toBe(5);
  });

  it('maps a DOM position inside the second fragment back to the absolute offset', async () => {
    const { surface } = await mountSplitParagraph('ABCDEFGHIJKLMNOPQRST', 10);
    const point = resolveWriterSurfaceDomPoint(surface, { paragraphId: 'p-split', offset: 15 })!;
    expect(resolveWriterSurfacePointFromDom(point.node, point.offset)).toEqual({
      paragraphId: 'p-split',
      offset: 15,
    });
  });

  it('types at the absolute offset when the caret sits in the second page fragment', async () => {
    const { surface, onParagraphTextChange } = await mountSplitParagraph('ABCDEFGHIJKLMNOPQRST', 10);
    const wrote = writeWriterSurfaceSelection(surface, {
      anchor: { paragraphId: 'p-split', offset: 15 },
      focus: { paragraphId: 'p-split', offset: 15 },
    });
    expect(wrote).toBe(true);
    // The DOM selection really is in the second fragment.
    expect(readWriterSurfaceSelection(surface)).toEqual({
      anchor: { paragraphId: 'p-split', offset: 15 },
      focus: { paragraphId: 'p-split', offset: 15 },
    });

    await act(async () => {
      surface.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true, cancelable: true }));
    });

    // The owner received the **whole** paragraph with one insertion at offset 15 —
    // not "x" prepended to the second fragment.
    expect(onParagraphTextChange).toHaveBeenCalledTimes(1);
    const [index, nextText, caret] = onParagraphTextChange.mock.calls[0]!;
    expect(index).toBe(0);
    expect(nextText).toBe('ABCDEFGHIJKLMNOxPQRST');
    expect(caret).toBe(16);
  });

  it('deletes across the seam from the second fragment', async () => {
    const { surface, onParagraphTextChange } = await mountSplitParagraph('ABCDEFGHIJKLMNOPQRST', 10);
    writeWriterSurfaceSelection(surface, {
      anchor: { paragraphId: 'p-split', offset: 11 },
      focus: { paragraphId: 'p-split', offset: 11 },
    });
    await act(async () => {
      surface.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }));
    });
    // Offset 11 − 1 = 10, i.e. the character that sits exactly at the page break.
    expect(onParagraphTextChange.mock.calls[0]!.slice(1)).toEqual(['ABCDEFGHIJKLMNOPQRST'.slice(0, 10) + 'ABCDEFGHIJKLMNOPQRST'.slice(11), 10]);
  });
});

describe('WR-014 — umlauts, surrogate pairs and mixed spans keep DOM and model in step', () => {
  it('round-trips every offset of a German sentence with umlauts', async () => {
    const text = 'Ärger über Öl';
    const { surface } = await mountSplitParagraph(text, text.length);
    for (let offset = 0; offset <= text.length; offset += 1) {
      const point = resolveWriterSurfaceDomPoint(surface, { paragraphId: 'p-split', offset });
      expect(point, `offset ${offset}`).not.toBeNull();
      expect(resolveWriterSurfacePointFromDom(point!.node, point!.offset), `offset ${offset}`).toEqual({
        paragraphId: 'p-split',
        offset,
      });
    }
  });

  it('treats an emoji as its UTF-16 units, exactly like the model offsets', async () => {
    // "a🙂b": the emoji is a surrogate pair, so JS offsets are 0 | 1…2 | 3.
    const text = 'a🙂b';
    expect(text.length).toBe(4);
    const { surface } = await mountSplitParagraph(text, 2);
    for (const offset of [0, 1, 2, 3, 4]) {
      const point = resolveWriterSurfaceDomPoint(surface, { paragraphId: 'p-split', offset });
      expect(point, `offset ${offset}`).not.toBeNull();
      expect(resolveWriterSurfacePointFromDom(point!.node, point!.offset), `offset ${offset}`).toEqual({
        paragraphId: 'p-split',
        offset,
      });
    }
    // Typing behind the emoji lands at offset 3, not at the start of the pair.
    writeWriterSurfaceSelection(surface, {
      anchor: { paragraphId: 'p-split', offset: 3 },
      focus: { paragraphId: 'p-split', offset: 3 },
    });
    expect(readWriterSurfaceSelection(surface)?.focus).toEqual({ paragraphId: 'p-split', offset: 3 });
  });

  it('keeps mixed inline formats as separate addressable runs', async () => {
    const mixed: Paragraph = {
      id: 'p-mixed',
      style: { alignment: 'left', line_height: 1.5, space_before: 0, space_after: 0 },
      spans: [
        { text: 'fett', bold: true },
        { text: ' ' },
        { text: 'groß', font_size_pt: 18 },
        { text: ' ' },
        { text: 'emoji🙂', italic: true },
      ],
    };
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <WriterRichTextSurface
          paragraphs={[mixed]}
          readOnly={false}
          ariaLabel="Testdokument"
          onSelectionChange={() => undefined}
          onParagraphTextChange={() => 0}
          onSplitParagraph={() => undefined}
          onMergeParagraphBackward={() => undefined}
          onReplaceSelection={() => undefined}
        >
          <WriterParagraphRichText
            paragraph={mixed}
            start={0}
            end={mixed.spans.reduce((total, span) => total + span.text.length, 0)}
            style={{}}
          />
        </WriterRichTextSurface>,
      );
    });
    const surface = container.querySelector<HTMLElement>('[data-writer-rich-surface="true"]')!;
    const runs = Array.from(surface.querySelectorAll<HTMLElement>('[data-writer-surface-span]'));
    expect(runs.map((run) => run.textContent)).toEqual(['fett', ' ', 'groß', ' ', 'emoji🙂']);
    // Each run is its own inline element with its own style …
    expect(runs[0]!.style.fontWeight).toBe('700');
    expect(runs[2]!.style.fontSize).toBe('18pt');
    expect(runs[4]!.style.fontStyle).toBe('italic');
    // … and an offset inside the last run still resolves to the whole paragraph.
    const insideEmojiRun = resolveWriterSurfaceDomPoint(surface, { paragraphId: 'p-mixed', offset: 14 })!;
    expect(resolveWriterSurfacePointFromDom(insideEmojiRun.node, insideEmojiRun.offset)).toEqual({
      paragraphId: 'p-mixed',
      offset: 14,
    });
  });
});
