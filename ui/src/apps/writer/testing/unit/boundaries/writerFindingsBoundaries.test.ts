// STATUS: DIAMANT — the Writer boundaries of the findings pass: shapes, fields, statistics, revisions,
// image envelope, source list
//
// One file per cause, so a regression names the finding it broke:
//   W-072 shape geometry was taken as given (negative, NaN, oversized) and written to the document
//   W-061 `image/PNG` was refused although the signature is a valid PNG
//   W-062 the pixel limit was a second number unrelated to the memory budget
//   W-128 there was no way to write a literal `{PAGE}`
//   W-142 segmentGraphemes throws above 1 000 000 code units and the statistics did not catch it
//   W-053 the revision register grew without bound
//   W-262 the source list was unbounded
import { describe, expect, it } from 'vitest';

import {
  validateWriterImageDimensions,
  validateWriterImageEnvelope,
  WriterImageImportError,
} from '../../../../writer/media/images/import/writerImageImport';

import {
  clampWriterShapeGeometry,
  createWriterShape,
  updateWriterShape,
  WRITER_SHAPE_MAX_COORDINATE_MM,
} from '../../../../writer/media/objects/shapes/writerShapeOperations';
import { evaluateFields, hasWriterFields, writerFieldNames, calculateTextStatistics } from '../../../../writer/utils/writerUtils';
import {
  boundWriterRevisionRegister,
  WRITER_MAX_TRACKED_REVISIONS,
} from '../../../../writer/review/revisions/track-changes/writerTrackChangesEngine';
import type { TrackChangeRevision } from '../../../../writer/types';
import {
  MAX_WRITER_WORKSPACE_SOURCE_CANDIDATES,
  projectWriterWorkspaceSourceCandidates,
  projectWriterWorkspaceSources,
} from '../../../../writer/integrations/workspace/writerGridSourceCatalog';

const FIELD_CONTEXT = { pageNumber: 3, totalPages: 12, title: 'Abnahme', author: 'Autor', words: 42 };

describe('W-072 — shape geometry is clamped instead of stored as given', () => {
  it('refuses a negative position', () => {
    const shape = createWriterShape('rectangle', { xMm: -50, yMm: -10, widthMm: 40, heightMm: 20 });
    expect(shape.xMm).toBe(0);
    expect(shape.yMm).toBe(0);
  });

  it('replaces a non-finite value instead of writing NaN into the document', () => {
    const shape = createWriterShape('rectangle', { xMm: Number.NaN, yMm: Number.POSITIVE_INFINITY, widthMm: 40, heightMm: 20 });
    expect(Number.isFinite(shape.xMm)).toBe(true);
    expect(Number.isFinite(shape.yMm)).toBe(true);
    expect(shape.xMm).toBe(0);
  });

  it('bounds an absurd coordinate and an absurd size', () => {
    const shape = createWriterShape('rectangle', { xMm: 1e9, yMm: 1e9, widthMm: 1e9, heightMm: 1e9 });
    expect(shape.xMm).toBe(WRITER_SHAPE_MAX_COORDINATE_MM);
    expect(shape.yMm).toBe(WRITER_SHAPE_MAX_COORDINATE_MM);
    expect(shape.widthMm).toBe(WRITER_SHAPE_MAX_COORDINATE_MM);
    expect(shape.heightMm).toBe(WRITER_SHAPE_MAX_COORDINATE_MM);
  });

  it('keeps a flat line flat and gives a box the smallest drawable size', () => {
    const line = createWriterShape('line', { widthMm: 60, heightMm: 0 });
    expect(line.heightMm).toBe(0);
    const arrow = createWriterShape('arrow', { widthMm: 60, heightMm: -5 });
    expect(arrow.heightMm).toBe(0);
    const box = createWriterShape('rectangle', { widthMm: 0, heightMm: 0 });
    expect(box.widthMm).toBe(1);
    expect(box.heightMm).toBe(1);
  });

  it('clamps a patch, so a future drag cannot write an off-page coordinate', () => {
    const shape = createWriterShape('rectangle', { xMm: 20, yMm: 30, widthMm: 50, heightMm: 30 });
    const moved = updateWriterShape(shape, { xMm: -100, yMm: 5 });
    expect(moved.xMm).toBe(0);
    expect(moved.yMm).toBe(5);
    // The fields the patch did not touch are untouched.
    expect(moved.widthMm).toBe(50);
    expect(moved.id).toBe(shape.id);
  });

  it('honours the page bounds a caller passes', () => {
    const shape = createWriterShape('rectangle', { xMm: 5, yMm: 5, widthMm: 900, heightMm: 900 });
    const inPage = clampWriterShapeGeometry(shape, { maxWidthMm: 160, maxHeightMm: 240, maxCoordinateMm: 240 });
    expect(inPage.widthMm).toBe(160);
    expect(inPage.heightMm).toBe(240);
  });

  it('is idempotent and keeps identity where nothing had to change', () => {
    const canonical = createWriterShape('rectangle', { xMm: 20, yMm: 30, widthMm: 50, heightMm: 30 });
    expect(clampWriterShapeGeometry(canonical)).toBe(canonical);
    expect(updateWriterShape(canonical, {})).toEqual(canonical);
  });
});

describe('W-128 — a field can be written literally', () => {
  it('leaves an escaped field in the text and drops the backslash', () => {
    expect(evaluateFields('\\{PAGE}', FIELD_CONTEXT)).toBe('{PAGE}');
    expect(evaluateFields('Seite \\{PAGE} von {NUMPAGES}', FIELD_CONTEXT)).toBe('Seite {PAGE} von 12');
  });

  it('still evaluates an unescaped field', () => {
    expect(evaluateFields('Seite {PAGE} von {NUMPAGES}', FIELD_CONTEXT)).toBe('Seite 3 von 12');
  });

  it('counts and names only the unescaped fields', () => {
    expect(hasWriterFields('\\{PAGE}')).toBe(false);
    expect(hasWriterFields('{PAGE}')).toBe(true);
    expect(writerFieldNames('\\{PAGE} und {TITLE}')).toEqual(['TITLE']);
  });

  it('treats a backslash that does not precede a field as ordinary text', () => {
    expect(evaluateFields('C:\\Pfad', FIELD_CONTEXT)).toBe('C:\\Pfad');
  });
});

describe('W-142 — an enormous text cannot abort the statistics', () => {
  it('counts a paragraph above the segmenter limit instead of throwing', () => {
    const huge = 'a'.repeat(1_200_000);
    expect(() => calculateTextStatistics([{ id: 'p1', style: {} as never, spans: [{ text: huge }] }])).not.toThrow();
    const statistics = calculateTextStatistics([{ id: 'p1', style: {} as never, spans: [{ text: huge }] }]);
    expect(statistics.charsWithSpaces).toBe(1_200_000);
  });

  it('does not split a surrogate pair at the window edge', () => {
    const emoji = '\u{1F600}';
    const text = `${'a'.repeat(999_999)}${emoji}${'b'.repeat(10)}`;
    const statistics = calculateTextStatistics([{ id: 'p1', style: {} as never, spans: [{ text }] }]);
    expect(statistics.charsWithSpaces).toBe(999_999 + 1 + 10);
  });
});

function revision(index: number, status: TrackChangeRevision['status'] = 'accepted'): TrackChangeRevision {
  return {
    id: `rev-${index}`,
    paragraphId: 'p1',
    type: 'insert',
    status,
    timestamp: index,
    author: 'Autor',
    authorColor: '#3b82f6',
  };
}

describe('W-053 — the revision register is bounded', () => {
  it('keeps a small register untouched, by identity', () => {
    const small = [revision(1), revision(2)];
    expect(boundWriterRevisionRegister(small)).toBe(small);
  });

  it('drops the oldest decided revisions first and keeps the newest', () => {
    const revisions = Array.from({ length: 10 }, (_, index) => revision(index));
    const bounded = boundWriterRevisionRegister(revisions, 4);
    expect(bounded).toHaveLength(4);
    // The four newest survive, in the order the register had them (the list must not jump).
    expect(bounded.map((entry) => entry.id)).toEqual(['rev-6', 'rev-7', 'rev-8', 'rev-9']);
    expect(bounded.some((entry) => entry.id === 'rev-0')).toBe(false);
  });

  it('never drops a pending revision', () => {
    const revisions = [
      revision(1),
      revision(2, 'pending'),
      revision(3),
      revision(4, 'pending'),
      revision(5),
    ];
    const bounded = boundWriterRevisionRegister(revisions, 3);
    expect(bounded.filter((entry) => entry.status === 'pending')).toHaveLength(2);
    expect(bounded).toHaveLength(3);
    // The one newest decided revision joins the two pending ones.
    expect(bounded.map((entry) => entry.id).sort()).toEqual(['rev-2', 'rev-4', 'rev-5']);
  });

  it('keeps the register whole when it is only pending work', () => {
    const onlyPending = Array.from({ length: 5 }, (_, index) => revision(index, 'pending'));
    expect(boundWriterRevisionRegister(onlyPending, 3)).toBe(onlyPending);
  });

  it('keeps its order, so the list does not jump', () => {
    const revisions = Array.from({ length: 10 }, (_, index) => revision(index));
    const bounded = boundWriterRevisionRegister(revisions, 4);
    // Document order is preserved; the bound decides which entries go, not how they are sorted.
    expect(bounded.map((entry) => entry.timestamp)).toEqual([6, 7, 8, 9]);
  });

  it('has a ceiling that a long review cannot exceed', () => {
    const revisions = Array.from({ length: WRITER_MAX_TRACKED_REVISIONS + 50 }, (_, index) => revision(index));
    expect(boundWriterRevisionRegister(revisions)).toHaveLength(WRITER_MAX_TRACKED_REVISIONS);
  });
});

describe('W-061 / W-062 — the image envelope', () => {
  /**
   * A real PNG header: signature, IHDR chunk length and type, width and height.
   *
   * Exactly 24 bytes, because the shared probe only reports the dimensions — and with them the MIME
   * type — once it can read the IHDR fields. A shorter header is a valid signature and still refuses.
   */
  function pngHeader(): Uint8Array {
    const header = new Uint8Array(24);
    header.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0); // signature
    header.set([0x00, 0x00, 0x00, 0x0d], 8); // IHDR length
    header.set([0x49, 0x48, 0x44, 0x52], 12); // 'IHDR'
    header.set([0x00, 0x00, 0x00, 0x64], 16); // width 100
    header.set([0x00, 0x00, 0x00, 0x64], 20); // height 100
    return header;
  }

  it('accepts an upper-case declared type when the signature is a PNG', () => {
    expect(validateWriterImageEnvelope('image/PNG', 1024, pngHeader())).toBe('image/png');
    expect(validateWriterImageEnvelope('IMAGE/PNG', 1024, pngHeader())).toBe('image/png');
  });

  it('still refuses a genuinely different declared type', () => {
    expect(() => validateWriterImageEnvelope('image/jpeg', 1024, pngHeader())).toThrow(WriterImageImportError);
    expect(() => validateWriterImageEnvelope('text/plain', 1024, pngHeader())).toThrow(WriterImageImportError);
  });

  it('derives the pixel limit from the decode budget instead of carrying a second number', () => {
    // The bound itself is behaviour and is checked here; the *derivation* is a source property and
    // lives in `writerFindingsBoundaries.contract.test.mjs` (a `.ts` file in this environment has no
    // Node type declarations, and reading a file needs them).
    const width = 8_000;
    const height = 5_000;
    expect(() => validateWriterImageDimensions(width, height)).not.toThrow();
    expect(() => validateWriterImageDimensions(20_000, 20_000)).toThrow(WriterImageImportError);
  });
});

describe('W-262 — the source list has a ceiling and says when it cut', () => {
  it('does not truncate a small workspace', () => {
    const open = [{ id: 'g1', kind: 'Grid', title: 'Tabelle' }] as never;
    const projection = projectWriterWorkspaceSources('w1', open, []);
    expect(projection.truncated).toBe(false);
    expect(projection.candidates).toHaveLength(1);
  });

  it('bounds a large workspace and reports the cut', () => {
    const stored = Array.from({ length: 500 }, (_, index) => ({
      id: `g${index}`,
      kind: 'Grid',
      title: `Tabelle ${index}`,
    })) as never;
    const projection = projectWriterWorkspaceSources('w1', [], stored);
    expect(projection.candidates).toHaveLength(MAX_WRITER_WORKSPACE_SOURCE_CANDIDATES);
    expect(projection.truncated).toBe(true);
    // Deterministic: the same input yields the same rows.
    expect(projectWriterWorkspaceSourceCandidates('w1', [], stored)).toEqual(projection.candidates);
  });

  it('lets open documents come first, so the ceiling cannot hide what is already open', () => {
    const open = Array.from({ length: 5 }, (_, index) => ({ id: `open-${index}`, kind: 'Grid', title: `Offen ${index}` })) as never;
    const stored = Array.from({ length: 500 }, (_, index) => ({ id: `g${index}`, kind: 'Grid', title: `Tabelle ${index}` })) as never;
    const candidates = projectWriterWorkspaceSourceCandidates('w1', open, stored, 5);
    expect(candidates.every((candidate) => candidate.isOpen)).toBe(true);
  });
});
