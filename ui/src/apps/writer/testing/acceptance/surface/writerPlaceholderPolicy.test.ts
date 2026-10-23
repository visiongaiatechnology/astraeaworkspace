// STATUS: PLATIN — WR-024 placeholder policy (ASTRAEA WRITER 50 V2 · M1-Restpunkt)
//
// The desktop screenshot showed `Text schreiben …` on **every** empty line: after
// two `Enter` presses the page read as a stack of prompts. The plan is explicit —
// "leere Absätze im normalen Schreibmodus sind einfach leere Zeilen ohne
// künstlichen Platzhaltertext" — so the hint belongs to the empty *document*, not to
// an empty paragraph.
import { describe, expect, it } from 'vitest';
import type { Paragraph } from '../../../../../shared/contracts/workspace';
import { showsWriterPlaceholder } from '../../../editor/surface/WriterParagraphRichText';

function paragraph(id: string, text: string): Paragraph {
  return {
    id,
    style: { alignment: 'left', line_height: 1.5, space_before: 0, space_after: 0 },
    spans: [{ text }],
  };
}

describe('WR-024 — the hint belongs to the empty document, not to every empty line', () => {
  it('shows it for the one empty paragraph of a fresh document', () => {
    const only = paragraph('p1', '');
    expect(showsWriterPlaceholder([only], only)).toBe(true);
  });

  it('hides it as soon as the single paragraph carries text', () => {
    const only = paragraph('p1', 'Hallo');
    expect(showsWriterPlaceholder([only], only)).toBe(false);
  });

  it('hides it on every line once a second paragraph exists', () => {
    const first = paragraph('p1', '');
    const second = paragraph('p2', '');
    expect(showsWriterPlaceholder([first, second], first)).toBe(false);
    expect(showsWriterPlaceholder([first, second], second)).toBe(false);
  });

  it('hides it for a paragraph that is not the only one of the document', () => {
    const only = paragraph('p1', '');
    const other = paragraph('p2', '');
    expect(showsWriterPlaceholder([only], other)).toBe(false);
  });

  it('treats a paragraph made of several empty spans as empty', () => {
    const multi: Paragraph = {
      ...paragraph('p1', ''),
      spans: [{ text: '', bold: true }, { text: '' }],
    };
    expect(showsWriterPlaceholder([multi], multi)).toBe(true);
  });

  it('stays quiet when the caller cannot know the document', () => {
    const only = paragraph('p1', '');
    expect(showsWriterPlaceholder(undefined, only)).toBe(false);
    expect(showsWriterPlaceholder([], only)).toBe(false);
  });
});
