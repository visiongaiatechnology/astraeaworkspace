// STATUS: PLATIN — New Writer document must be immediately writable (AST-0001)
import { describe, expect, it } from 'vitest';
import type { Paragraph } from '../../../../../shared/contracts/workspace';
import { createNewDocument } from '../../../../../app/bootstrap/seedDocDefaultsOpenCore';
import { resolveWriterPageClickTarget } from '../../../editing/caret/writerCaretTargeting';

function writerParagraphs(): Paragraph[] {
  const document = createNewDocument('Writer');
  const textBlockId = document.root_object_ids[0];
  expect(textBlockId).toBeDefined();
  const object = textBlockId ? document.objects[textBlockId] : undefined;
  if (!object || object.type !== 'TextBlock') {
    throw new Error('A new Writer document must contain a TextBlock object.');
  }
  return object.data.paragraphs;
}

describe('New Writer document seed', () => {
  it('starts with exactly one empty paragraph', () => {
    const paragraphs = writerParagraphs();
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0]?.spans).toEqual([{ text: '' }]);
  });

  it('does not ship placeholder copy that the user has to delete first', () => {
    const serialized = JSON.stringify(writerParagraphs());
    expect(serialized).not.toContain('Start typing your sovereign document text here');
    expect(serialized).not.toContain('Untitled Document');
  });

  it('resolves an empty-page click to a usable caret in the seeded paragraph', () => {
    const paragraphs = writerParagraphs();
    const target = resolveWriterPageClickTarget({
      paragraphs,
      pageParagraphIds: paragraphs.map((paragraph) => paragraph.id),
      nearestParagraphId: paragraphs[0]?.id ?? null,
    });
    expect(target.kind).toBe('focus-existing');
    expect(target.paragraphId).toBe(paragraphs[0]?.id);
    expect(target.offset).toBe(0);
  });
});
