// @vitest-environment happy-dom
// STATUS: PLATIN — Image paste and leaving the shape mode (WR-033 / WR-034)
//
// Two small, easily forgotten promises of M7: an image that arrives through the
// clipboard must reach the same importer as a dropped file, and `Esc` must leave the
// shape mode immediately instead of leaving a resize frame behind.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { WriterRichTextSurface } from '../../../editor/surface/WriterRichTextSurface';
import { WriterParagraphRichText } from '../../../editor/surface/WriterParagraphRichText';
import { WriterShapeCanvas } from '../../../editor/blocks/shapes/WriterShapeCanvas';
import type { Paragraph } from '../../../../../shared/contracts/workspace';

function paragraph(id: string, text: string): Paragraph {
  return {
    id,
    style: { alignment: 'left', line_height: 1.5, space_before: 0, space_after: 0 },
    spans: [{ text }],
  };
}

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

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

describe('WR-033 — a pasted image is imported, not ignored', () => {
  it('hands an image file from the clipboard to the importer', async () => {
    const model = paragraph('p1', 'Text');
    const onInsertImageFile = vi.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(createElement(WriterRichTextSurface, {
        paragraphs: [model],
        readOnly: false,
        ariaLabel: 'Testdokument',
        onSelectionChange: () => undefined,
        onParagraphTextChange: () => 0,
        onSplitParagraph: () => undefined,
        onMergeParagraphBackward: () => undefined,
        onReplaceSelection: () => undefined,
        onInsertImageFile,
      } as never, createElement(WriterParagraphRichText, {
        paragraph: model,
        start: 0,
        end: 4,
        style: {},
      })));
    });
    const surface = container.querySelector<HTMLElement>('[data-writer-rich-surface="true"]')!;
    const image = new File([new Uint8Array([137, 80, 78, 71])], 'bild.png', { type: 'image/png' });
    const textFile = new File(['[not an image]'], 'notiz.txt', { type: 'text/plain' });

    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', {
      value: {
        files: [textFile, image],
        getData: () => '',
        setData: () => undefined,
      },
    });
    await act(async () => {
      surface.dispatchEvent(event);
      await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
    });

    expect(onInsertImageFile).toHaveBeenCalledTimes(1);
    expect(onInsertImageFile.mock.calls[0]![0]).toBe(image);
    // The browser's own handling is stopped: no second path writes the file anywhere.
    expect(event.defaultPrevented).toBe(true);
  });
});

describe('WR-034 — Esc leaves the shape mode', () => {
  it('clears the selection and returns the focus to the writing surface', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    // A writing surface exists in the real editor; the shape canvas only focuses it.
    const surface = document.createElement('div');
    surface.setAttribute('data-writer-rich-surface', 'true');
    surface.tabIndex = 0;
    container.appendChild(surface);

    const onSelectShape = vi.fn();
    const shapes = [{
      id: 'shape-1',
      kind: 'rectangle',
      xMm: 10,
      yMm: 10,
      widthMm: 40,
      heightMm: 20,
      text: 'Form',
    }];
    const shapeHost = document.createElement('div');
    container.appendChild(shapeHost);
    root = createRoot(shapeHost);
    await act(async () => {
      root!.render(createElement(WriterShapeCanvas as never, {
        shapes,
        onUpdateShapes: () => undefined,
        onSelectShape,
        selectedShapeId: 'shape-1',
      }));
    });

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
    });

    // The selection is dropped and the caret is back in the document.
    expect(onSelectShape).toHaveBeenCalledWith(null);
    expect(document.activeElement).toBe(surface);
  });
});

describe('WR-034 — moving, resizing and deleting a shape', () => {
  async function mountCanvas(
    shapes: unknown[],
    onUpdateShapes: (next: unknown[]) => void,
    selectedShapeId: string | null,
  ): Promise<HTMLDivElement> {
    const host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(createElement(WriterShapeCanvas as never, {
        shapes,
        onUpdateShapes,
        selectedShapeId,
      }));
    });
    return host;
  }

  const rectangle = {
    id: 'shape-1',
    shapeKind: 'rectangle',
    xMm: 10,
    yMm: 10,
    widthMm: 40,
    heightMm: 20,
    strokeColor: '#3b82f6',
  };

  function pointer(target: Element, type: string, clientX: number, clientY: number): void {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY });
    target.dispatchEvent(event);
  }

  it('resizes through the visible corner handle', async () => {
    const onUpdateShapes = vi.fn();
    const host = await mountCanvas([rectangle], onUpdateShapes, 'shape-1');
    const handle = host.querySelector('[data-writer-shape-handle="se"]');
    expect(handle, 'die Ecke unten rechts muss einen Anfasser haben').not.toBeNull();
    const svg = host.querySelector('svg')!;

    await act(async () => { pointer(handle!, 'pointerdown', 100, 100); });
    await act(async () => {
      // 10 mm to the right is 10 × 96/25.4 ≈ 37.8 CSS pixels.
      pointer(svg, 'pointermove', 100 + 37.8, 100);
      pointer(svg, 'pointerup', 100 + 37.8, 100);
    });

    expect(onUpdateShapes).toHaveBeenCalled();
    const last = onUpdateShapes.mock.calls.at(-1)![0] as Array<{ widthMm: number }>;
    expect(last[0]!.widthMm).toBeGreaterThan(45);
  });

  it('moves the shape by dragging it', async () => {
    const onUpdateShapes = vi.fn();
    const host = await mountCanvas([rectangle], onUpdateShapes, 'shape-1');
    const group = host.querySelector('[role="button"]')!;
    const svg = host.querySelector('svg')!;

    await act(async () => { pointer(group, 'pointerdown', 50, 50); });
    await act(async () => {
      pointer(svg, 'pointermove', 50 + 37.8, 50);
      pointer(svg, 'pointerup', 50 + 37.8, 50);
    });

    const last = onUpdateShapes.mock.calls.at(-1)![0] as Array<{ xMm: number }>;
    expect(last[0]!.xMm).toBeGreaterThan(15);
  });

  it('edits the text of a rectangle on double click', async () => {
    const host = await mountCanvas([rectangle], () => undefined, 'shape-1');
    const group = host.querySelector('[role="button"]')!;
    await act(async () => {
      group.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
      await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
    });
    // The inline editor appears — previously only textbox/callout offered it.
    expect(host.querySelector('input[placeholder="Text eingeben..."]')).not.toBeNull();
  });

  it('deletes the selected shape with Delete', async () => {
    const onUpdateShapes = vi.fn();
    await mountCanvas([rectangle], onUpdateShapes, 'shape-1');
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
      await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
    });
    expect(onUpdateShapes).toHaveBeenCalledWith([]);
  });
});