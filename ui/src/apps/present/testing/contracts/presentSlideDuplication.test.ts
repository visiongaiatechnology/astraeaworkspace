// BATCH-PRESENT — slide duplication id-remapping contract (Paket 3).
//
// "Folien sortieren und duplizieren": a copy that reuses ids is not a copy. These assertions are
// hand-written from the requirement, not from the implementation.

import { describe, expect, it } from 'vitest';
import type {
  PresentAnimation,
  PresentSlide,
  PresentSlideComment,
  PresentTextSceneObject,
} from '../../../../shared/contracts/workspace';
import { duplicatePresentSlide } from '../../contracts/presentDeckFactory';

const text = (id: string, patch: Partial<PresentTextSceneObject> = {}): PresentTextSceneObject => ({
  id,
  kind: 'text',
  text: `text of ${id}`,
  xPercent: 10,
  yPercent: 10,
  widthPercent: 20,
  heightPercent: 10,
  fontSizePt: 18,
  color: '#fff',
  zIndex: 1,
  ...patch,
});

const animation: PresentAnimation = {
  id: 'anim-1',
  targetId: 'obj-1',
  effect: 'fade',
  trigger: 'on-click',
  durationMs: 400,
  delayMs: 0,
  triggerObjectId: 'obj-2',
};

const comment: PresentSlideComment = {
  id: 'comment-1',
  slideId: 'slide-original',
  author: 'a',
  text: 't',
  timestamp: 1,
  targetObjectId: 'obj-2',
};

const slide: PresentSlide = {
  id: 'slide-original',
  title: 'Quarterly Review',
  subtitle: 'sub',
  layout: 'cards',
  speakerNotes: 'keep me',
  sectionId: 'sec-1',
  cards: [{ id: 'card-1', title: 'A', description: 'a' }],
  images: [{
    id: 'image-1',
    name: 'shot.png',
    dataUrl: 'data:image/png;base64,AA',
    xPercent: 5,
    yPercent: 5,
    widthPercent: 20,
    heightPercent: 10,
  }],
  sceneObjects: [
    { ...text('obj-1'), groupId: 'present-group-0' } as PresentTextSceneObject,
    { ...text('obj-2'), groupId: 'present-group-0' } as PresentTextSceneObject,
  ],
  animations: [animation],
  comments: [comment],
  presenterInk: [{ id: 'ink-1', tool: 'pen', color: '#f00', width: 2, opacity: 1, points: [{ xPercent: 1, yPercent: 1 }] }],
  transition: { effect: 'fade', durationMs: 500 },
};

describe('duplicatePresentSlide', () => {
  it('gives the copy a new slide id, a marked title and no shared object id', () => {
    const copy = duplicatePresentSlide(slide, 'slide-copy-1');
    expect(copy.id).toBe('slide-copy-1');
    expect(copy.title).toBe('Quarterly Review (Copy)');
    const originalIds = new Set([
      ...(slide.sceneObjects ?? []).map((object) => object.id),
      ...(slide.images ?? []).map((image) => image.id),
    ]);
    for (const object of copy.sceneObjects ?? []) expect(originalIds.has(object.id)).toBe(false);
    for (const image of copy.images ?? []) expect(originalIds.has(image.id)).toBe(false);
  });

  it('remaps animation targets and comment anchors onto the copy', () => {
    const copy = duplicatePresentSlide(slide, 'slide-copy-2');
    const copyIds = new Set((copy.sceneObjects ?? []).map((object) => object.id));
    const copyAnimation = (copy.animations ?? [])[0];
    expect(copyIds.has(copyAnimation.targetId)).toBe(true);
    expect(copyIds.has(copyAnimation.triggerObjectId ?? '')).toBe(true);
    expect(copyAnimation.targetId).not.toBe('obj-1');
    const copyComment = (copy.comments ?? [])[0];
    expect(copyIds.has(copyComment.targetObjectId ?? '')).toBe(true);
    expect(copyComment.slideId).toBe('slide-copy-2');
  });

  it('turns a duplicated group into its own group key', () => {
    const copy = duplicatePresentSlide(slide, 'slide-copy-3');
    const groups = new Set((copy.sceneObjects ?? []).map((object) => (object as { groupId?: string }).groupId));
    expect(groups.size).toBe(1);
    expect([...groups][0]).not.toBe('present-group-0');
    // Both members stay in the same new group, so the group survives the duplication intact.
    expect(copy.sceneObjects ?? []).toHaveLength(2);
  });

  it('keeps slide-level data that belongs to the slide, not to an object', () => {
    const copy = duplicatePresentSlide(slide, 'slide-copy-4');
    expect(copy.speakerNotes).toBe('keep me');
    expect(copy.sectionId).toBe('sec-1');
    expect(copy.transition).toEqual({ effect: 'fade', durationMs: 500 });
    expect(copy.presenterInk).toEqual(slide.presenterInk);
  });

  it('sets morphKey so a duplicated object can morph from its original', () => {
    const copy = duplicatePresentSlide(slide, 'slide-copy-5');
    expect((copy.sceneObjects ?? []).every((object) => Boolean(object.morphKey))).toBe(true);
    expect((copy.images ?? []).every((image) => Boolean(image.morphKey))).toBe(true);
  });

  it('is deterministic for the same input and survives an unusable id', () => {
    const a = duplicatePresentSlide(slide, 'slide-copy-6');
    const b = duplicatePresentSlide(slide, 'slide-copy-6');
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const weird = duplicatePresentSlide(slide, '///');
    expect(weird.id).toBe('///');
    expect((weird.sceneObjects ?? []).every((object) => object.id.includes('copy'))).toBe(true);
  });
});
