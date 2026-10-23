// @vitest-environment happy-dom
// STATUS: PLATIN — Real DOM interaction witness for the Writer rich-text surface
//
// ASTRAEA WRITER 50 V2 · M1 (WR-001, WR-002, WR-021, WR-022, WR-048 A/C).
//
// ## Why this file exists and what it can honestly prove
//
// The plan forbids a static marker test in place of a real interaction:
//
//   „`renderToStaticMarkup` oder bloßes Suchen eines Quellstrings kann keinen der
//    drei Tests ersetzen."
//
// This file therefore renders the **real** components into a real DOM
// (`happy-dom`), dispatches real `keydown`, `input`, `click` and `selectionchange`
// events, reads `window.getSelection()` and asserts the resulting **model** state.
//
// **What it cannot prove** and therefore does not claim: pointer geometry. A
// `happy-dom` layout engine returns zero-sized boxes, so "click at 50 % of the A4
// sheet" is not measurable here. That half stays an explicit
// `NATIVE_UNVERIFIED` item for the Windows user probe — it is not silently
// declared green.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Paragraph } from '../../../../../shared/contracts/workspace';
import { WriterRichTextSurface, useWriterRichTextSurface } from '../../../editor/surface/WriterRichTextSurface';
import { WriterParagraphRichText } from '../../../editor/surface/WriterParagraphRichText';
import { WriterContextMenu } from '../../../editor/context-menu/WriterContextMenu';
import {
  readWriterSurfaceSelection,
  readWriterSurfaceParagraphText,
  collectWriterSurfaceFragments,
  writeWriterSurfaceSelection,
} from '../../../editor/surface/writerDomModelAdapter';
import {
  mergeWriterTextSpanFormatRange,
  replaceWriterParagraphText,
} from '../../../editing/text/writerTextEditing';
import { toggleWriterSpanProperty } from '../../../editing/text/writerSpanFormatToggle';
import type { WriterSelectionRange } from '../../../editing/selection/writerSelectionRange';
import { mergeWriterParagraphBackward, splitWriterParagraphAt } from '../../../editing/paragraphs/writerParagraphStructure';
import { replaceWriterSelection, resolveWriterSelection } from '../../../editing/selection/writerSelectionRange';
import { resetWriterCaretController, requestWriterCaret } from '../../../editing/caret/writerCaretController';

function paragraph(id: string, spans: Paragraph['spans']): Paragraph {
  return {
    id,
    style: { alignment: 'left', line_height: 1.5, space_before: 0, space_after: 0 },
    spans,
  };
}

function textLength(item: Paragraph): number {
  return item.spans.reduce((total, span) => total + span.text.length, 0);
}

interface Harness {
  readonly model: () => Paragraph[];
  readonly selection: () => WriterSelectionRange | null;
  readonly surface: HTMLElement;
}

interface HarnessState {
  paragraphs: Paragraph[];
  caret: WriterSelectionRange | null;
  replaceCount: number;
}

/**
 * A minimal but **faithful** owner of the surface: the same model helpers the
 * editor uses (`replaceWriterParagraphText`, `splitWriterParagraphAt`,
 * `mergeWriterParagraphBackward`, `replaceWriterSelection`). A harness that
 * fakes the transaction would prove nothing about the surface.
 */
const SurfaceHarness: React.FC<{
  initial: Paragraph[];
  state: HarnessState;
}> = ({ initial, state }) => {
  const [paragraphs, setParagraphs] = useState<Paragraph[]>(initial);
  state.paragraphs = paragraphs;
  return (
    <WriterRichTextSurface
      paragraphs={paragraphs}
      readOnly={false}
      ariaLabel="Testdokument"
      onSelectionChange={(range) => { state.caret = range; }}
      onParagraphTextChange={(index, nextText, caret) => {
        setParagraphs((previous) => previous.map((item, position) => (
          position === index ? replaceWriterParagraphText(item, nextText) : item
        )));
        const owner = paragraphs[index];
        if (owner) requestWriterCaret({ paragraphId: owner.id, start: caret, origin: 'api' });
        return caret;
      }}
      onSplitParagraph={(index, offset) => {
        const result = splitWriterParagraphAt(paragraphs, index, offset, 'split-1');
        if (!result) return;
        setParagraphs(result.paragraphs);
        requestWriterCaret({ paragraphId: result.caret.paragraphId, start: result.caret.offset, origin: 'split' });
      }}
      onMergeParagraphBackward={(index) => {
        const result = mergeWriterParagraphBackward(paragraphs, index);
        if (!result) return;
        setParagraphs(result.paragraphs);
        requestWriterCaret({ paragraphId: result.caret.paragraphId, start: result.caret.offset, origin: 'merge' });
      }}
      onReplaceSelection={(range, replacement) => {
        const resolved = resolveWriterSelection(paragraphs, range);
        if (!resolved) return;
        state.replaceCount += 1;
        const ids = Array.from({ length: Math.max(0, replacement.split('\n').length - 1) }, (_value, index) => `new-${index}`);
        const result = replaceWriterSelection(paragraphs, resolved, replacement, ids);
        if (!result) return;
        setParagraphs(result.paragraphs);
        requestWriterCaret({ paragraphId: result.caret.paragraphId, start: result.caret.offset, origin: 'range-replace' });
      }}
    >
      <ProjectionList paragraphs={paragraphs} />
    </WriterRichTextSurface>
  );
};

/**
 * Mirrors `WriterParagraphItem`'s use of the surface context.
 *
 * The projection epoch is part of the React key, so a hard resync really re-mounts
 * the fragment instead of patching the browser's node soup in place. The harness
 * must go through the same path, otherwise the regression test below would only
 * prove the scrubbing and not the re-mount that makes it durable.
 */
const ProjectionList: React.FC<{ paragraphs: Paragraph[] }> = ({ paragraphs }) => {
  const surface = useWriterRichTextSurface();
  return (
    <>
      {paragraphs.map((item) => (
        <WriterParagraphRichText
          key={`${item.id}:${surface?.projectionEpoch ?? 0}`}
          paragraph={item}
          start={0}
          end={textLength(item)}
          style={{ fontSize: '11pt' }}
        />
      ))}
    </>
  );
};

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

async function mount(initial: Paragraph[]): Promise<Harness> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const state: HarnessState = { paragraphs: initial, caret: null, replaceCount: 0 };
  await act(async () => {
    root!.render(<SurfaceHarness initial={initial} state={state} />);
  });
  const surface = container.querySelector<HTMLElement>('[data-writer-rich-surface="true"]');
  expect(surface, 'die Schreibflaeche muss im DOM stehen').not.toBeNull();
  return {
    model: () => state.paragraphs,
    selection: () => state.caret,
    surface: surface!,
  };
}

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => { setTimeout(resolve, 40); });
  });
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

describe('WR-002 — one editable surface, real inline runs', () => {
  it('renders exactly one editable root and no textarea per paragraph', async () => {
    const harness = await mount([
      paragraph('p1', [{ text: 'Hallo ' }, { text: 'Astraea', bold: true }]),
      paragraph('p2', [{ text: 'Zweiter Absatz' }]),
    ]);
    expect(document.querySelectorAll('[data-writer-rich-surface="true"]')).toHaveLength(1);
    expect(harness.surface.getAttribute('contenteditable')).toBe('true');
    // The defect the plan names: one `textarea` per paragraph fragment.
    expect(document.querySelectorAll('textarea')).toHaveLength(0);
    // Two paragraphs, two addressable projection nodes, one editable root.
    expect(collectWriterSurfaceFragments(harness.surface)).toHaveLength(2);
  });

  it('renders only the marked word bold, not the whole paragraph', async () => {
    const harness = await mount([
      paragraph('p1', [{ text: 'Hallo ' }, { text: 'Astraea', bold: true }]),
    ]);
    const runs = Array.from(
      harness.surface.querySelectorAll<HTMLElement>('[data-writer-surface-span]'),
    );
    expect(runs).toHaveLength(2);
    expect(runs[0]!.textContent).toBe('Hallo ');
    expect(runs[1]!.textContent).toBe('Astraea');
    // A real inline style, not a data attribute pretending to be one.
    expect(runs[1]!.style.fontWeight).toBe('700');
    expect(runs[0]!.style.fontWeight).not.toBe('700');
    expect(runs[1]!.getAttribute('data-writer-run-bold')).toBe('true');
    expect(runs[0]!.hasAttribute('data-writer-run-bold')).toBe(false);
  });

  it('keeps a word-accurate format through a real bold toggle on a marked range', async () => {
    const harness = await mount([
      paragraph('p1', [{ text: 'Hallo Astraea' }]),
    ]);
    // Mark "Astraea" exactly — offsets 6…13 — and write the selection into the DOM.
    const wrote = writeWriterSurfaceSelection(harness.surface, {
      anchor: { paragraphId: 'p1', offset: 6 },
      focus: { paragraphId: 'p1', offset: 13 },
    });
    expect(wrote).toBe(true);
    const readBack = readWriterSurfaceSelection(harness.surface);
    expect(readBack).toEqual({
      anchor: { paragraphId: 'p1', offset: 6 },
      focus: { paragraphId: 'p1', offset: 13 },
    });
    // The transaction the toolbar runs, applied to the marked range.
    const formatted = mergeWriterTextSpanFormatRange(harness.model()[0]!, 6, 13, { bold: true });
    expect(formatted.spans.map((span) => [span.text, Boolean(span.bold)])).toEqual([
      ['Hallo ', false],
      ['Astraea', true],
    ]);
    // The pure toggle that the toolbar calls reaches the same result.
    const toggled = toggleWriterSpanProperty(paragraph('p1', [{ text: 'Hallo Astraea' }]), 'bold', { start: 6, end: 13 });
    expect(toggled.paragraph.spans.map((span) => [span.text, Boolean(span.bold)])).toEqual([
      ['Hallo ', false],
      ['Astraea', true],
    ]);
  });
});

describe('WR-001 — typing goes into the model, span-preserving', () => {
  it('reconciles a real input event into the model without flattening bold runs', async () => {
    const harness = await mount([
      paragraph('p1', [{ text: 'Hallo ' }, { text: 'Astraea', bold: true }]),
    ]);
    const fragment = collectWriterSurfaceFragments(harness.surface)[0]!;
    // Simulate what the browser does on a keystroke: append to the last text node.
    const walker: Node[] = [];
    const collect = (node: Node): void => {
      for (let child = node.firstChild; child; child = child.nextSibling) {
        if (child.nodeType === 3) walker.push(child);
        else collect(child);
      }
    };
    collect(fragment);
    const lastText = walker[walker.length - 1]!;
    lastText.nodeValue = `${lastText.nodeValue ?? ''}!`;
    writeWriterSurfaceSelection(harness.surface, {
      anchor: { paragraphId: 'p1', offset: 14 },
      focus: { paragraphId: 'p1', offset: 14 },
    });
    await act(async () => {
      harness.surface.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await flush();

    const model = harness.model()[0]!;
    expect(model.spans.map((span) => span.text).join('')).toBe('Hallo Astraea!');
    // The bold run survived the edit — this is the span-preserving half that a
    // single `textarea` could never express.
    expect(model.spans.find((span) => span.text.includes('Astraea'))?.bold).toBe(true);
  });

  it('splits the paragraph at the caret on a real Enter keydown', async () => {
    const harness = await mount([
      paragraph('p1', [{ text: 'Hallo Welt' }]),
    ]);
    writeWriterSurfaceSelection(harness.surface, {
      anchor: { paragraphId: 'p1', offset: 5 },
      focus: { paragraphId: 'p1', offset: 5 },
    });
    await act(async () => {
      harness.surface.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    });
    await flush();

    const model = harness.model();
    expect(model).toHaveLength(2);
    expect(model[0]!.spans.map((span) => span.text).join('')).toBe('Hallo');
    expect(model[1]!.spans.map((span) => span.text).join('')).toBe(' Welt');
  });

  it('inserts a manual line break on Shift+Enter instead of a new paragraph', async () => {
    const harness = await mount([
      paragraph('p1', [{ text: 'Hallo Welt' }]),
    ]);
    writeWriterSurfaceSelection(harness.surface, {
      anchor: { paragraphId: 'p1', offset: 5 },
      focus: { paragraphId: 'p1', offset: 5 },
    });
    await act(async () => {
      harness.surface.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true }));
    });
    await flush();
    const model = harness.model();
    expect(model).toHaveLength(1);
    expect(model[0]!.spans.map((span) => span.text).join('')).toBe('Hallo\n Welt');
  });
});

describe('WR-002 — a native selection crosses paragraphs', () => {
  it('reports one range that spans two paragraphs', async () => {
    const harness = await mount([
      paragraph('p1', [{ text: 'Hallo Astraea' }]),
      paragraph('p2', [{ text: 'Zweiter Absatz' }]),
    ]);
    const wrote = writeWriterSurfaceSelection(harness.surface, {
      anchor: { paragraphId: 'p1', offset: 6 },
      focus: { paragraphId: 'p2', offset: 7 },
    });
    expect(wrote).toBe(true);
    const domSelection = readWriterSurfaceSelection(harness.surface);
    expect(domSelection).toEqual({
      anchor: { paragraphId: 'p1', offset: 6 },
      focus: { paragraphId: 'p2', offset: 7 },
    });
    // The selection really is a DOM range across two separate blocks, which is the
    // property the old one-textarea-per-paragraph architecture could not express.
    const native = window.getSelection();
    expect(native?.rangeCount).toBe(1);
    expect(native?.isCollapsed).toBe(false);
    await act(async () => {
      document.dispatchEvent(new Event('selectionchange'));
    });
    const reported = harness.selection();
    expect(reported?.anchor.paragraphId).toBe('p1');
    expect(reported?.focus.paragraphId).toBe('p2');
  });

  it('replaces a two-paragraph selection with one transaction on a real keydown', async () => {
    const harness = await mount([
      paragraph('p1', [{ text: 'Hallo Astraea' }]),
      paragraph('p2', [{ text: 'Zweiter Absatz' }]),
    ]);
    writeWriterSurfaceSelection(harness.surface, {
      anchor: { paragraphId: 'p1', offset: 6 },
      focus: { paragraphId: 'p2', offset: 7 },
    });
    await act(async () => {
      document.dispatchEvent(new Event('selectionchange'));
    });
    await act(async () => {
      harness.surface.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }));
    });
    await flush();
    const model = harness.model();
    expect(model).toHaveLength(1);
    expect(model[0]!.spans.map((span) => span.text).join('')).toBe('Hallo  Absatz');
  });
});

describe('WR-002 — the DOM never becomes the data authority', () => {
  it('re-reads the paragraph text the projection shows, fragment by fragment', async () => {
    const harness = await mount([
      paragraph('p1', [{ text: 'Erster' }, { text: ' Absatz', italic: true }]),
    ]);
    expect(readWriterSurfaceParagraphText(harness.surface, 'p1')).toBe('Erster Absatz');
    expect(readWriterSurfaceParagraphText(harness.surface, 'gibt-es-nicht')).toBeNull();
  });

  it('ignores input that belongs to a form control inside the same editable root', async () => {
    // A header field lives inside the one contentEditable root, so its `input`
    // event bubbles up to the surface. Treating it as document input would rewrite
    // the paragraph behind the header while the user types into the header.
    const draft = paragraph('p1', [{ text: 'Dokumenttext' }]);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const onParagraphTextChange = vi.fn(() => 0);
    await act(async () => {
      root!.render(
        <WriterRichTextSurface
          paragraphs={[draft]}
          readOnly={false}
          ariaLabel="Testdokument"
          onSelectionChange={() => undefined}
          onParagraphTextChange={onParagraphTextChange}
          onSplitParagraph={() => undefined}
          onMergeParagraphBackward={() => undefined}
          onReplaceSelection={() => undefined}
        >
          <input data-testid="header-field" defaultValue="" aria-label="Kopfzeilentext" />
          <WriterParagraphRichText paragraph={draft} start={0} end={13} style={{}} />
        </WriterRichTextSurface>,
      );
    });
    const field = container.querySelector<HTMLInputElement>('input')!;
    field.value = 'Astraea Test';
    await act(async () => {
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await flush();
    expect(onParagraphTextChange).not.toHaveBeenCalled();
  });

  /**
   * The desktop defect, reproduced verbatim.
   *
   * In `vgt-desktop.exe` typing into an empty paragraph produced `W → WW → WaWaW`:
   * Chromium inserted a **bare text node** as a direct child of
   * `[data-writer-surface-paragraph]`, React appended its own `<span>` behind it,
   * and from then on both nodes carried the same character and multiplied on every
   * keystroke.
   *
   * Two independent guards now prevent it, and both are exercised here:
   * the projection always ships a managed empty run (so the browser has a legal
   * node to type into), and a DOM edit the surface did not originate is reconciled
   * **and then re-projected**, so no browser-authored node can survive.
   */
  it('never duplicates a character when the browser inserts a bare text node (WR-001/WR-002)', async () => {
    const harness = await mount([paragraph('p1', [{ text: '' }])]);
    const fragment = () => harness.surface.querySelector<HTMLElement>('[data-writer-surface-paragraph]')!;

    // The empty paragraph ships its managed caret anchor — that is the reason
    // Chromium has no need to invent nodes in the first place.
    expect(fragment().querySelector('[data-writer-empty-run="true"]')).not.toBeNull();
    expect(fragment().querySelector('[data-writer-empty-break="true"]')).not.toBeNull();

    // Now simulate the hostile case anyway: a bare text node next to the managed run.
    const ghost = document.createTextNode('W');
    fragment().appendChild(ghost);
    writeWriterSurfaceSelection(harness.surface, {
      anchor: { paragraphId: 'p1', offset: 1 },
      focus: { paragraphId: 'p1', offset: 1 },
    });
    await act(async () => {
      harness.surface.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await flush();

    // The text is taken over exactly once …
    expect(harness.model()[0]!.spans.map((span) => span.text).join('')).toBe('W');
    // … and the DOM shows it exactly once, not twice.
    expect(fragment().textContent).toBe('W');
    expect(readWriterSurfaceParagraphText(harness.surface, 'p1')).toBe('W');
    // The ghost node is gone: every child of the fragment is a managed run.
    for (const child of Array.from(fragment().childNodes)) {
      if (child.nodeType === 3) expect((child.textContent ?? '').length).toBe(0);
    }
    expect(harness.surface.querySelectorAll('[data-writer-empty-run="true"]')).toHaveLength(0);

    // Typing "a" through the controlled path must not double anything either: the
    // surface turns the key into a model transaction and cancels the browser's own
    // insertion, so exactly one character arrives.
    writeWriterSurfaceSelection(harness.surface, {
      anchor: { paragraphId: 'p1', offset: 1 },
      focus: { paragraphId: 'p1', offset: 1 },
    });
    await act(async () => {
      harness.surface.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true }));
    });
    await flush();
    expect(harness.model()[0]!.spans.map((span) => span.text).join('')).toBe('Wa');
    expect(readWriterSurfaceParagraphText(harness.surface, 'p1')).toBe('Wa');

    // And a Backspace removes exactly one character — the reported symptom was the
    // line growing instead of shrinking.
    writeWriterSurfaceSelection(harness.surface, {
      anchor: { paragraphId: 'p1', offset: 2 },
      focus: { paragraphId: 'p1', offset: 2 },
    });
    await act(async () => {
      harness.surface.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }));
    });
    await flush();
    expect(harness.model()[0]!.spans.map((span) => span.text).join('')).toBe('W');
    expect(readWriterSurfaceParagraphText(harness.surface, 'p1')).toBe('W');
  });

  it('renders nothing editable for a read-only document', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <WriterRichTextSurface
          paragraphs={[paragraph('p1', [{ text: 'Gesperrt' }])]}
          readOnly
          ariaLabel="Gesperrtes Dokument"
          onSelectionChange={() => undefined}
          onParagraphTextChange={() => 0}
          onSplitParagraph={() => undefined}
          onMergeParagraphBackward={() => undefined}
          onReplaceSelection={() => undefined}
        >
          <WriterParagraphRichText paragraph={paragraph('p1', [{ text: 'Gesperrt' }])} start={0} end={8} style={{}} />
        </WriterRichTextSurface>,
      );
    });
    const surface = container.querySelector<HTMLElement>('[data-writer-rich-surface="true"]');
    expect(surface?.getAttribute('contenteditable')).toBe('false');
    expect(surface?.getAttribute('aria-readonly')).toBe('true');
    // The text stays readable and selectable, it just cannot be edited.
    expect(surface?.textContent).toBe('Gesperrt');
  });
});

describe('WR-022 — the table size grid is closed until it is asked for', () => {
  it('opens the grid only after two explicit activations, and lists 80 named cells', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <WriterContextMenu
          x={40}
          y={40}
          paragraphIndex={0}
          onClose={() => undefined}
          onInsertTable={() => undefined}
          onDuplicate={() => undefined}
          onDelete={() => undefined}
        />,
      );
    });
    const menu = () => container!.querySelector<HTMLElement>('[data-writer-context-menu="open"]');
    expect(menu(), 'das Kontextmenü muss offen sein').not.toBeNull();
    // 1. Closed on open — the defect the plan names.
    expect(container!.querySelector('[data-writer-table-size-grid]')).toBeNull();

    const insertDisclosure = container!.querySelector<HTMLElement>('[aria-controls$="-insert"]');
    expect(insertDisclosure, 'die Einfügen-Gruppe muss als Disclosure existieren').not.toBeNull();
    expect(insertDisclosure!.getAttribute('aria-expanded')).toBe('false');
    await act(async () => {
      insertDisclosure!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    // Still closed: the group is open, the grid is not.
    expect(container!.querySelector('[data-writer-table-size-grid]')).toBeNull();

    const tableDisclosure = container!.querySelector<HTMLElement>('[data-writer-context-menu-action="insert-table"]');
    expect(tableDisclosure, 'der Tabelleneintrag muss existieren').not.toBeNull();
    expect(tableDisclosure!.getAttribute('aria-expanded')).toBe('false');
    await act(async () => {
      tableDisclosure!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });

    // 2. Now it is open, with the one shared grid.
    expect(container!.querySelector('[data-writer-context-menu-table-size="open"]')).not.toBeNull();
    expect(container!.querySelector('[data-writer-table-size-grid="8x10"]')).not.toBeNull();
    const cells = container!.querySelectorAll('[data-writer-table-size-cell]');
    expect(cells).toHaveLength(80);
    const labels = new Set(
      Array.from(cells).map((cell) => cell.getAttribute('aria-label') ?? ''),
    );
    expect(labels.size).toBeGreaterThanOrEqual(80);
    expect(
      container!.querySelector<HTMLElement>('[data-writer-context-menu-action="insert-table"]')?.getAttribute('aria-expanded'),
    ).toBe('true');
  });

  it('shows a short menu and hides the paragraph group until it is opened', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <WriterContextMenu
          x={40}
          y={40}
          paragraphIndex={0}
          onClose={() => undefined}
          onMoveUp={() => undefined}
          onMoveDown={() => undefined}
          onDuplicate={() => undefined}
          onDelete={() => undefined}
          onOpenParagraphFormat={() => undefined}
          onInsertTable={() => undefined}
        />,
      );
    });
    const panel = container!.querySelector<HTMLElement>('[data-writer-context-menu-group="Absatz"]');
    expect(panel, 'die Absatzgruppe muss existieren').not.toBeNull();
    // Hidden means: not visible, not in the tab order, not in the a11y tree.
    expect(panel!.hasAttribute('hidden')).toBe(true);
    // The context menu is small: the clipboard block plus the disclosures only.
    expect(container!.querySelector('[role="menu"]')).not.toBeNull();
    expect(container!.querySelectorAll('[data-writer-context-menu-kind]')).toHaveLength(1);
  });
});
