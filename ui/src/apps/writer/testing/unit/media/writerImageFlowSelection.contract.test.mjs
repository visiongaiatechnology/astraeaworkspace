// STATUS: PLATIN — Source contract for the image flow selection
//
// The selection logic is unit-tested. What unit tests cannot reach is that the
// import path really produces images without a `wrapMode` (which is exactly why
// the toolbar must not compare that field) and that the quick toolbar actually
// asks the resolver instead of reading the raw field.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFileSync(path.resolve(here, relative), 'utf8');

const importPath = read('../../../media/images/import/writerImageImport.ts');
const block = read('../../../media/images/WriterImageBlock.tsx');

describe('Writer image flow selection contract', () => {
  it('produces images without a wrap mode on import', () => {
    // This is the precondition the toolbar used to violate.
    expect(importPath).not.toContain('wrapMode');
    expect(importPath).not.toContain('placement:');
  });

  it('highlights the flow buttons from the resolved selection', () => {
    expect(block).toContain('resolveWriterImageFlowSelection(image)');
    expect(block).toContain('wrapSelection.inlineBlock');
    expect(block).toContain('wrapSelection.wrapped');
    expect(block).toContain('wrapSelection.wrappedRight');
  });

  it('never compares the raw wrap mode field for its button state', () => {
    expect(block).not.toContain('image.wrapMode ===');
  });

  it('still writes an explicit mode when a flow button is pressed', () => {
    // The click handlers may set the field explicitly — that keeps new documents
    // unambiguous; only the *display* has to go through the resolver.
    expect(block).toContain("onUpdate({ placement: 'float-left', alignment: 'left', wrapMode: 'square' })");
    expect(block).toContain("onUpdate({ placement: 'float-right', alignment: 'right', wrapMode: 'square' })");
    expect(block).toContain("onUpdate({ placement: 'block', alignment: 'center', wrapMode: 'inline' })");
  });

  it('lets a width change reach the flow metric through widthPercent', () => {
    // "Text fliesst bei Breitenaenderung nachvollziehbar neu" rests on the width
    // being the single input the metric reads.
    expect(block).toContain('onUpdate({ widthPercent: Number(event.target.value) })');
  });
});
