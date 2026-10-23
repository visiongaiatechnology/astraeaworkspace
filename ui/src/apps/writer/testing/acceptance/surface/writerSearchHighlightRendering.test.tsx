// @vitest-environment happy-dom
// STATUS: PLATIN — WR-036: the hit is visible in the document, not only in the find bar
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import type { Paragraph } from '../../../../../shared/contracts/workspace';
import { WriterRichTextSurface } from '../../../editor/surface/WriterRichTextSurface';
import { WriterParagraphRichText } from '../../../editor/surface/WriterParagraphRichText';

function paragraph(id: string, text: string): Paragraph {
  return {
    id,
    style: { alignment: 'left', line_height: 1.5, space_before: 0, space_after: 0 },
    spans: [{ text }],
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
  document.getSelection()?.removeAllRanges();
});

async function mountSurface(
  model: Paragraph,
  searchHighlights?: Record<string, Array<{ start: number; end: number; active: boolean }>>,
): Promise<HTMLElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <WriterRichTextSurface
        paragraphs={[model]}
        readOnly={false}
        ariaLabel="Testdokument"
        searchHighlights={searchHighlights}
        onSelectionChange={() => undefined}
        onParagraphTextChange={() => 0}
        onSplitParagraph={() => undefined}
        onMergeParagraphBackward={() => undefined}
        onReplaceSelection={() => undefined}
      >
        <WriterParagraphRichText paragraph={model} start={0} end={model.spans[0]?.text.length ?? 0} style={{}} />
      </WriterRichTextSurface>,
    );
  });
  return container;
}

describe('WR-036 — visible search hits', () => {
  it('marks the current hit and keeps the text identical', async () => {
    const host = await mountSurface(paragraph('p1', 'Hallo Astraea Welt'), {
      p1: [{ start: 6, end: 13, active: true }],
    });
    const marks = Array.from(host.querySelectorAll('mark[data-writer-search-hit]'));
    expect(marks).toHaveLength(1);
    expect(marks[0]!.getAttribute('data-writer-search-hit')).toBe('current');
    expect(marks[0]!.textContent).toBe('Astraea');
    // The projection still contains the whole text, in order.
    expect(host.textContent).toBe('Hallo Astraea Welt');
  });

  it('renders non-active hits weaker than the current one', async () => {
    const host = await mountSurface(paragraph('p1', 'Wort Wort'), {
      p1: [{ start: 0, end: 4, active: false }, { start: 5, end: 9, active: true }],
    });
    const hits = Array.from(host.querySelectorAll('mark[data-writer-search-hit]'));
    expect(hits.map((hit) => hit.getAttribute('data-writer-search-hit'))).toEqual(['match', 'current']);
  });

  it('renders no mark at all without a search', async () => {
    const host = await mountSurface(paragraph('p1', 'Hallo Astraea Welt'));
    expect(host.querySelectorAll('mark[data-writer-search-hit]')).toHaveLength(0);
    expect(host.textContent).toBe('Hallo Astraea Welt');
  });

  it('does not change the DOM span structure used for caret offsets', async () => {
    const host = await mountSurface(paragraph('p1', 'Hallo Astraea Welt'), {
      p1: [{ start: 6, end: 13, active: true }],
    });
    const runs = host.querySelectorAll('[data-writer-surface-span]');
    expect(runs).toHaveLength(1);
    // The mark lives *inside* the run, so the adapter still finds one managed span.
    expect(runs[0]!.querySelector('mark')).not.toBeNull();
  });
});
