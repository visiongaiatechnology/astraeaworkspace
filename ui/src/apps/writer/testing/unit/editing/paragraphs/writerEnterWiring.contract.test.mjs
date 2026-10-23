// STATUS: PLATIN — Source contract for the Enter/Backspace/Delete wiring in the Writer editor
//
// The pure decision modules and the caret controller are covered by unit tests.
// What unit tests cannot reach without a DOM test runner is the one-line wiring
// between them: the hook that turns a decision into a caret request, and the
// keyboard branch that calls the hook. This contract pins exactly that wiring,
// so a refactor cannot silently drop the focus handover the acceptance
// scenario ("Enter drücken und sofort weiterschreiben") depends on.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFileSync(path.resolve(here, relative), 'utf8');

const operations = read('../../../../editing/paragraphs/useWriterParagraphOperations.ts');
const paragraphItem = read('../../../../editor/paragraphs/WriterParagraphItem.tsx');

describe('Writer Enter/Backspace/Delete wiring contract', () => {
  it('routes paragraph creation through the pure insert planner', () => {
    expect(operations).toContain("import { planWriterParagraphInsert } from './writerParagraphInsert';");
    expect(operations).toContain('const plan = planWriterParagraphInsert({');
    expect(operations).toContain('persistParagraphs(plan.paragraphs, revisionPatch);');
  });

  it('routes paragraph removal through the pure delete planner', () => {
    expect(operations).toContain("import { planWriterParagraphDelete } from './writerParagraphDeletion';");
    expect(operations).toContain('const plan = planWriterParagraphDelete(paragraphs, pIdx);');
  });

  it('hands the caret to the created paragraph after Enter', () => {
    expect(operations).toContain("origin: 'enter'");
    expect(operations).toContain('requestWriterCaret({ paragraphId: plan.caret.paragraphId, start: plan.caret.offset, origin:');
  });

  it('hands the caret to the seam after a deletion', () => {
    expect(operations).toContain("origin: 'delete'");
  });

  it('keeps the Enter key branch wired to paragraph creation and splitting', () => {
    expect(paragraphItem).toContain("import {\n  resolveWriterBackspaceIntent,\n  resolveWriterEnterIntent,\n} from '../../editing/paragraphs/writerParagraphKeyIntent';");
    expect(paragraphItem).toContain("if (enterIntent === 'append-paragraph') {");
    expect(paragraphItem).toContain("if (enterIntent === 'split-paragraph') {");
    expect(paragraphItem).toContain('onSplitParagraph?.(pIdx, fragmentStart + event.currentTarget.selectionStart);');
    expect(paragraphItem).toContain('onAddParagraph(pIdx);');
  });

  it('keeps the Backspace key branch wired to the backward merge', () => {
    expect(paragraphItem).toContain("if (event.key === 'Backspace' && backspaceIntent === 'merge-backward') {");
    expect(paragraphItem).toContain('onMergeParagraphBackward?.(pIdx);');
  });

  it('no longer decides the structural edits with inline conditions', () => {
    expect(paragraphItem).not.toContain('enterTarget.selectionStart === enterTarget.selectionEnd');
    expect(paragraphItem).not.toContain('backspaceTarget.selectionStart === 0');
  });

  it('drives the delete control from the shared deletion predicate', () => {
    expect(paragraphItem).toContain('canDeleteWriterParagraph(allParagraphs.length)');
    expect(paragraphItem).not.toContain('allParagraphs.length > 1');
  });
});
