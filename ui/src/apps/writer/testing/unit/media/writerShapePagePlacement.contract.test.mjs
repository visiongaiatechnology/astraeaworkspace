// STATUS: PLATIN — Source contract for the per-page shape placement
//
// The resolution is unit-tested. What unit tests cannot reach is that the page
// renderer hands each page its own shapes and that the paper no longer gates the
// shape canvas on being the first page — which is what put every text box on
// page one.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFileSync(path.resolve(here, relative), 'utf8');

const renderer = read('../../../layout/pages/WriterPageRenderer.tsx');
const pagePaper = read('../../../layout/pages/WriterPagePaper.tsx');
const shapes = read('../../../media/objects/shapes/writerShapeOperations.ts');

describe('Writer per-page shape placement contract', () => {
  it('resolves the shapes for each page from the page list', () => {
    expect(renderer).toContain('resolveWriterShapesForPageIndex(shapes ?? [], pages, pageIndex)');
    expect(renderer).toContain('{pages.map((page, pageIndex) => {');
    expect(renderer).toContain('shapes={pageShapes}');
  });

  it('no longer draws the shape canvas only on the first page', () => {
    expect(pagePaper).not.toContain('isFirstPage && shapes && shapes.length > 0');
    // Native M7 probe: the canvas sat after all paragraphs, so a shape inserted "here"
    // appeared at the bottom of the page and could hang over the footer. Anchored shapes
    // are now scoped to their own paragraph; only shapes without a living anchor stay on
    // the page body.
    expect(pagePaper).toContain('const paragraphShapes = (shapes ?? []).filter((shape) => shape.anchorParagraphId === p.id);');
    expect(pagePaper).toContain('data-writer-shape-anchor={p.id}');
    expect(pagePaper).toContain('const unanchoredShapes = (shapes ?? []).filter(');
    expect(pagePaper).toContain('unanchoredShapes.length > 0 && onUpdateShapes && (');
  });

  it('reads the anchor that insertion writes', () => {
    // The anchor was written by `handleInsertShape` and mapped by the factory, but
    // nothing consumed it — that was the defect.
    expect(shapes).toContain('export function resolveWriterShapePageIndex(');
    expect(shapes).toContain('const anchorId = shape.anchorParagraphId;');
    expect(shapes).toContain('export function resolveWriterShapesForPageIndex(');
  });

  it('keeps a shape without a resolvable anchor on the first page', () => {
    expect(shapes).toContain('if (!anchorId || pages.length === 0) return 0;');
    expect(shapes).toContain('return found >= 0 ? found : 0;');
  });

  it('leaves the continuous view with all shapes', () => {
    // The plain view renders one continuous surface, so it keeps every shape.
    expect(renderer).toContain('shapes={shapes}');
  });
});
