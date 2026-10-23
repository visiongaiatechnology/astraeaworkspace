// @vitest-environment happy-dom
// STATUS: PLATIN — PR-003 (Present M1): exactly one shape authority
//
// The shell toolbar used to append a legacy `cards` entry to `presentData.slides[0]` when the
// user asked for a shape. That entry is a *second model family*: the free canvas does not render
// it as an object, the scene selection never sees it, and it bypasses the Present history. The
// masterplan forbids a parallel document authority. Shapes are scene objects now — the same
// family the slide editor writes.
import { describe, expect, it } from 'vitest';
import type { PresentSlide, WorkspaceDocument } from '../../../shared/contracts/workspace';
import { insertChartToDoc, insertShapeToDoc } from '../../../shared/workspace/operations/documentActions';

function slide(overrides: Partial<PresentSlide> = {}): PresentSlide {
  return {
    id: 'slide-1',
    title: '',
    subtitle: '',
    layout: 'blank',
    cards: [],
    speakerNotes: '',
    sceneObjects: [],
    ...overrides,
  } as PresentSlide;
}

function presentDocument(slides: PresentSlide[]): WorkspaceDocument {
  const id = 'present-shape-authority';
  return {
    id,
    title: 'Shape authority',
    kind: 'Present',
    created_at: 0,
    modified_at: 0,
    version: 1,
    theme_id: 'default',
    root_object_ids: [],
    objects: {},
    presentData: { slides, theme: 'dark', aspectRatio: '16:9' },
  } as WorkspaceDocument;
}

function sceneObjectsOf(document: WorkspaceDocument, index = 0) {
  return (document.presentData?.slides[index]?.sceneObjects ?? []) as unknown as Array<Record<string, unknown>>;
}

describe('PR-003 — shell shape insertion writes scene objects, not legacy cards', () => {
  it('appends a real scene shape and leaves the legacy card family untouched', () => {
    const before = presentDocument([slide()]);
    const result = insertShapeToDoc(before, 'rectangle');

    expect(result.changed).toBe(true);
    const objects = sceneObjectsOf(result.updatedDoc);
    expect(objects, 'genau ein Szenenobjekt').toHaveLength(1);
    expect(objects[0]!.kind).toBe('shape');
    expect(objects[0]!.shape).toBe('rectangle');
    // Geometry is percentage based and inside the slide.
    for (const key of ['xPercent', 'yPercent', 'widthPercent', 'heightPercent']) {
      expect(typeof objects[0]![key]).toBe('number');
      expect(objects[0]![key] as number).toBeGreaterThanOrEqual(0);
      expect(objects[0]![key] as number).toBeLessThanOrEqual(100);
    }
    // The legacy card list stays exactly as it was: no second shape family appears.
    expect(result.updatedDoc.presentData?.slides[0]?.cards ?? []).toEqual(before.presentData?.slides[0]?.cards ?? []);
    // One document authority: the version is bumped, the rest of the document is preserved.
    expect(result.updatedDoc.version).toBe(before.version + 1);
    expect(result.updatedDoc.kind).toBe('Present');
  });

  it('maps the shell vocabulary onto the scene contract instead of inventing a type', () => {
    const result = insertShapeToDoc(presentDocument([slide()]), 'circle');
    expect(sceneObjectsOf(result.updatedDoc)[0]!.shape).toBe('ellipse');
    const unknown = insertShapeToDoc(presentDocument([slide()]), 'hexagon-9000');
    expect(sceneObjectsOf(unknown.updatedDoc)[0]!.shape, 'unbekannte Form wird zur sicheren Standardform').toBe('rectangle');
  });

  it('gives every inserted shape its own identity', () => {
    const first = insertShapeToDoc(presentDocument([slide()]), 'rectangle');
    const second = insertShapeToDoc(first.updatedDoc, 'rectangle');
    const ids = sceneObjectsOf(second.updatedDoc).map((object) => object.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });

  it('writes only the first slide (documented limitation of the shell action)', () => {
    const result = insertShapeToDoc(presentDocument([slide({ id: 'slide-1' }), slide({ id: 'slide-2' })]), 'rectangle');
    expect(sceneObjectsOf(result.updatedDoc, 0)).toHaveLength(1);
    expect(sceneObjectsOf(result.updatedDoc, 1), 'die zweite Folie bleibt unverändert').toHaveLength(0);
  });

  it('refuses honestly when the presentation has no slide', () => {
    const before = presentDocument([]);
    const result = insertShapeToDoc(before, 'rectangle');
    expect(result.changed).toBe(false);
    expect(result.message).toMatch(/no slide/u);
    expect(result.updatedDoc).toBe(before);
  });
});

describe('PR-003 — the shell chart insert is a scene object too', () => {
  it('appends a chart scene object and leaves the legacy layout untouched', () => {
    const before = presentDocument([slide({ layout: 'blank' })]);
    const result = insertChartToDoc(before);

    const staged = sceneObjectsOf(result.updatedDoc);
    const charts = staged.filter((object) => object.kind === 'chart');
    expect(charts, 'die Folie trägt genau ein Chart-Szenenobjekt').toHaveLength(1);
    expect(charts[0]!.id).toContain(result.chartId);
    // The legacy family is not written any more: the slide keeps its layout and gets no
    // `chartReferenceId`, which used to switch the free canvas out of its layout.
    const updatedSlide = result.updatedDoc.presentData?.slides[0] as unknown as Record<string, unknown>;
    expect(updatedSlide.layout).toBe('blank');
    expect(updatedSlide.chartReferenceId).toBeUndefined();
  });
});
