// STATUS: PLATIN — Present productivity: non-mount paths against malformed slides (Round 23)
//
// The mount matrix already normalises `sceneObjects`/`cards`; these are the user-action paths
// (search / replace / reuse / duplicate detection) that used to read them with `?? []`. They are
// called directly here — no mount — and must never throw, while leaving malformed fields untouched
// (no schema repair, deterministic results).
//
// Measured/Fixed Ist-Verhalten:
//   - searchPresentDeck: string fields are still searched; non-array lists are skipped read-only.
//     Fixed the `(list ?? []).forEach` crash for non-array sceneObjects/cards/bulletPoints and the
//     non-string scalar coercion (`countLiteral` needs a string).
//   - replacePresentDeckText: non-array fields pass through unchanged; only real lists are mapped;
//     the replace helper returns non-strings unchanged (fixed `?.map is not a function`).
//   - reusePresentSlides: malformed lists normalise to empty lists in a complete new slide, the
//     source stays untouched (`structuredClone`) — fixed the `?? []`.map crash; no half mutation.
//   - findDuplicatePresentSlides: already guarded (Rounds 14/16) and pinned by this matrix.
import { describe, expect, it } from 'vitest';
import type { PresentDocumentModel, PresentSlide } from '../../../../shared/contracts/workspace';
import {
  findDuplicatePresentSlides,
  replacePresentDeckText,
  reusePresentSlides,
  searchPresentDeck,
} from '../../productivity/presentProductivity';

function deck(slides: unknown[]): PresentDocumentModel {
  return { slides, theme: 'dark', aspectRatio: '16:9' } as unknown as PresentDocumentModel;
}

const VALID_SLIDE = {
  id: 'valid-slide',
  title: 'Needle A',
  subtitle: 'Needle subtitle',
  layout: 'blank',
  cards: [{ id: 'card-1', title: 'Needle card', description: 'plain' }],
  bulletPoints: ['Needle bullet'],
  speakerNotes: '',
  sceneObjects: [{ id: 'text-1', kind: 'text', text: 'Needle scene', xPercent: 10, yPercent: 10, widthPercent: 20, heightPercent: 10 }],
} as unknown as PresentSlide;

/** Documented hostile shape: non-array lists; the scalar text fields are still string. */
const MALFORMED_SLIDE = {
  id: 'malformed-slide',
  title: 'Needle B',
  subtitle: '',
  layout: 'blank',
  cards: { not: 'an array' },
  bulletPoints: 'not an array',
  speakerNotes: '',
  sceneObjects: 'not an array',
} as unknown as PresentSlide;

const MALFORMED_SLIDE_OBJECT = {
  ...MALFORMED_SLIDE,
  id: 'malformed-slide-object',
  cards: 'cards as string',
  bulletPoints: { not: 'an array' },
  sceneObjects: { 0: { id: 'ghost' } },
} as unknown as PresentSlide;

describe('presentProductivity — malformed non-mount paths (Round 23)', () => {
  it('Fall 1: searchPresentDeck skips non-array lists and still searches the string fields', () => {
    const model = deck([VALID_SLIDE, MALFORMED_SLIDE, MALFORMED_SLIDE_OBJECT]);
    let hits: ReturnType<typeof searchPresentDeck> = [];
    expect(() => { hits = searchPresentDeck(model, 'Needle'); }, 'Suche darf nicht werfen').not.toThrow();

    // Ist-Verhalten: string fields of every slide are searched; malformed lists contribute nothing.
    const fieldsOf = (slideId: string) => hits.filter((hit) => hit.slideId === slideId).map((hit) => hit.field).sort();
    expect(fieldsOf('valid-slide')).toEqual(['bullet', 'card-title', 'scene-text', 'subtitle', 'title']);
    expect(fieldsOf('malformed-slide')).toEqual(['title']);
    expect(fieldsOf('malformed-slide-object')).toEqual(['title']);
    // Deterministic: a second call produces exactly the same hits.
    expect(searchPresentDeck(model, 'Needle')).toEqual(hits);
    expect(searchPresentDeck(model, 'NoSuchNeedle')).toEqual([]);
  });

  it('Fall 2: replacePresentDeckText is throw-free and leaves non-array fields untouched', () => {
    const model = deck([VALID_SLIDE, MALFORMED_SLIDE]);
    let result: ReturnType<typeof replacePresentDeckText> | null = null;
    expect(() => { result = replacePresentDeckText(model, 'Needle', 'Replaced'); }, 'Ersetzen darf nicht werfen').not.toThrow();
    expect(result, 'definiertes Ergebnis').not.toBeNull();

    // Validate the string paths of the valid slide: every "Needle" is replaced once.
    const replacedValid = result!.model.slides[0] as unknown as Record<string, unknown>;
    expect(replacedValid.title).toBe('Replaced A');
    expect(replacedValid.subtitle).toBe('Replaced subtitle');
    expect(replacedValid.bulletPoints).toEqual(['Replaced bullet']);
    expect((replacedValid.cards as Array<Record<string, unknown>>)[0].title).toBe('Replaced card');
    expect((replacedValid.sceneObjects as Array<Record<string, unknown>>)[0].text).toBe('Replaced scene');
    expect(result!.replacements, 'deterministische Trefferzahl').toBe(6);

    // The malformed slide keeps its non-array fields exactly as they were (no schema repair).
    const replacedMalformed = result!.model.slides[1] as unknown as Record<string, unknown>;
    expect(replacedMalformed.title).toBe('Replaced B');
    expect(replacedMalformed.bulletPoints).toBe('not an array');
    expect(replacedMalformed.cards).toEqual({ not: 'an array' });
    expect(replacedMalformed.sceneObjects).toBe('not an array');
    // The source document was not mutated.
    expect((VALID_SLIDE as unknown as Record<string, unknown>).title).toBe('Needle A');
  });

  it('Fall 3: reusePresentSlides normalises the lists of a malformed slide and mutates nothing', () => {
    const source = [MALFORMED_SLIDE, MALFORMED_SLIDE_OBJECT];
    const sourceBefore = JSON.stringify(source);
    let reused: PresentSlide[] = [];
    expect(() => { reused = reusePresentSlides(source, new Set(['existing-slide'])); }, 'Reuse darf nicht werfen').not.toThrow();

    expect(reused, 'für jede Quelle genau eine neue Slide').toHaveLength(2);
    for (const slide of reused) {
      expect(slide.id.length, 'neue Slide-ID').toBeGreaterThan(0);
      expect(slide.id).not.toBe('existing-slide');
      expect(Array.isArray(slide.sceneObjects), 'sceneObjects als Array').toBe(true);
      expect(Array.isArray(slide.images), 'images als Array').toBe(true);
      expect(Array.isArray(slide.cards), 'cards als Array').toBe(true);
      expect(slide.sceneObjects, 'keine erfundenen Objekte').toHaveLength(0);
    }
    expect(reused[0].id).not.toBe(reused[1].id);
    // No half mutation: the source slides are byte-identical afterwards.
    expect(JSON.stringify(source), 'Quelle unverändert').toBe(sourceBefore);
  });

  it('Fall 4: findDuplicatePresentSlides groups malformed slides without throwing', () => {
    const identicalMalformed = { ...MALFORMED_SLIDE, id: 'malformed-twin' } as unknown as PresentSlide;
    const model = deck([MALFORMED_SLIDE, identicalMalformed, VALID_SLIDE, VALID_SLIDE]);
    let groups: ReturnType<typeof findDuplicatePresentSlides> = [];
    expect(() => { groups = findDuplicatePresentSlides(model.slides); }, 'Duplicate-Erkennung darf nicht werfen').not.toThrow();

    expect(groups, 'zwei Duplikatgruppen').toHaveLength(2);
    const malformedGroup = groups.find((group) => group.slideIds.includes('malformed-slide'))!;
    expect(malformedGroup.slideIds.sort()).toEqual(['malformed-slide', 'malformed-twin']);
    expect(malformedGroup.slideIndexes).toEqual([0, 1]);
    // A single malformed slide is not a duplicate.
    expect(findDuplicatePresentSlides([MALFORMED_SLIDE])).toEqual([]);
  });
});
