import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { buildPresentDocumentFromWhiteboard } from '../../integrations/whiteboardPresentHandoff';
import type { WhiteboardItem } from '../../types';

const document = (): WorkspaceDocument => ({
  id: 'whiteboard-source', title: 'Planning board', kind: 'Whiteboard', created_at: 1, modified_at: 1,
  version: 4, theme_id: 'dark', root_object_ids: [], objects: {},
} as WorkspaceDocument);

const frame = (id: string, x = 0): WhiteboardItem => ({
  id, type: 'frame', x, y: 0, width: 300, height: 220, text: id,
});

const object = (id: string, type: WhiteboardItem['type'] = 'sticky', x = 10, y = 20): WhiteboardItem => ({
  id, type, x, y, width: 20, height: 20, text: id,
});

describe('Whiteboard to Present handoff', () => {
  it('preserves selected frame order, excludes hidden content and connectors, and sanitizes card text', () => {
    const first = frame('first');
    const second = frame('second', 400);
    const shared = object('shared', 'sticky', 430, 30);
    const hidden = { ...object('secret', 'sticky', 440, 30), hidden: true };
    const connector = { ...object('edge', 'connector', 430, 30), fromId: 'shared', toId: 'shared' };
    const outside = object('outside', 'sticky', 900, 20);

    const result = buildPresentDocumentFromWhiteboard(document(), [first, second, shared, hidden, connector, outside], ['second', 'first'], 10);
    const slides = result.presentData?.slides ?? [];

    expect(result.id).toMatch(/^whiteboard-present-/);
    expect(slides.map(({ title }) => title)).toEqual(['second', 'first']);
    expect(slides[0]?.cards?.map(({ description }) => description)).toEqual(['shared']);
    expect(slides[0]?.speakerNotes).toContain('Connectors omitted: 1. Hidden objects omitted: 1.');
    expect(slides[1]?.cards).toEqual([]);
    expect(slides[1]?.speakerNotes).toContain('0 contained Whiteboard object(s).');
  });

  it('limits frame count and reports only frames omitted by the slide limit', () => {
    const frames = Array.from({ length: 300 }, (_, index) => frame(`frame-${index}`, index * 400));

    const result = buildPresentDocumentFromWhiteboard(document(), frames, [], 11);
    const slides = result.presentData?.slides ?? [];

    expect(slides).toHaveLength(256);
    expect(slides[0]?.speakerNotes).toContain('44 additional frame(s) were omitted');
    expect(slides[0]?.speakerNotes).not.toContain('299 additional frame(s) were omitted');
  });

  it('stops frame scans at the shared work budget and records incomplete counts', () => {
    const frames = Array.from({ length: 256 }, (_, index) => frame(`frame-${index}`, 0));
    const objects = Array.from({ length: 9_744 }, (_, index) => object(`item-${index}`));

    const result = buildPresentDocumentFromWhiteboard(document(), [...frames, ...objects], [], 12);
    const slides = result.presentData?.slides ?? [];

    expect(slides.length).toBeLessThan(256);
    expect(slides.at(-1)?.speakerNotes).toContain('total count is incomplete');
    expect(slides.at(-1)?.speakerNotes).toContain('two-million item-check budget');
  });

  it('exports an empty safe summary instead of falling back to unselected frames', () => {
    const items = [frame('available-frame'), object('private-content')];

    const result = buildPresentDocumentFromWhiteboard(document(), items, ['missing-frame'], 13);
    const slides = result.presentData?.slides ?? [];

    expect(slides).toHaveLength(1);
    expect(slides[0]?.cards).toEqual([]);
    expect(slides[0]?.speakerNotes).toContain('No objects were exported because no selected visible frame was available.');
    expect(slides[0]?.speakerNotes).not.toContain('private-content');
  });

  it('uses a bounded one-slide overview when a board has no frames', () => {
    const items = [...Array.from({ length: 12 }, (_, index) => object(`object-${index}`)), object('connector', 'connector')];

    const result = buildPresentDocumentFromWhiteboard(document(), items, [], 14);
    const slide = result.presentData?.slides[0];

    expect(result.presentData?.slides).toHaveLength(1);
    expect(slide?.cards).toHaveLength(9);
    expect(slide?.speakerNotes).toContain('12 visible non-connector object(s)');
    expect(slide?.speakerNotes).toContain('additional objects are omitted');
    expect(slide?.speakerNotes).toContain('Connectors omitted: 1.');
  });

  it('omits malformed geometry and discloses the invalid object count', () => {
    const invalid = { ...object('invalid'), width: 0 };

    const result = buildPresentDocumentFromWhiteboard(document(), [frame('frame-1'), invalid], [], 15);
    const slide = result.presentData?.slides[0];

    expect(slide?.cards).toEqual([]);
    expect(slide?.speakerNotes).toContain('Invalid-geometry objects omitted: 1.');
  });

  it('rejects non-Whiteboard source documents', () => {
    const source = { ...document(), kind: 'Present' } as WorkspaceDocument;

    expect(() => buildPresentDocumentFromWhiteboard(source, [], [], 15)).toThrow('whiteboard_present_source_kind_invalid');
  });

  it('rejects oversized and duplicate source item sets before conversion', () => {
    const tooMany = Array.from({ length: 100_001 }, (_, index) => object(`item-${index}`));
    expect(() => buildPresentDocumentFromWhiteboard(document(), tooMany, [], 15)).toThrow('whiteboard_present_input_limit_exceeded');

    expect(() => buildPresentDocumentFromWhiteboard(document(), [object('duplicate'), object('duplicate')], [], 15))
      .toThrow('whiteboard_present_duplicate_item_id');
  });

  it('keeps generated slide identities unique across same-time exports', () => {
    const source = document();
    const items = [frame('frame-1'), object('item-1')];

    const first = buildPresentDocumentFromWhiteboard(source, items, [], 16);
    const second = buildPresentDocumentFromWhiteboard(source, items, [], 16);

    expect(first.id).not.toBe(second.id);
    expect(first.presentData?.slides[0]?.id).not.toBe(second.presentData?.slides[0]?.id);
  });
});
