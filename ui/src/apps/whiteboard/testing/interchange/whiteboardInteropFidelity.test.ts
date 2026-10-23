// STATUS: PLATIN

import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { buildPresentDocumentFromWhiteboard } from '../../integrations/whiteboardPresentHandoff';
import { WHITEBOARD_INTEROP_FIDELITY } from '../../interchange/whiteboardInteropFidelity';
import type { WhiteboardItem } from '../../types';

describe('Whiteboard interchange fidelity contract', () => {
  it('declares each shipped import, export, and handoff format once', () => {
    expect(Object.isFrozen(WHITEBOARD_INTEROP_FIDELITY)).toBe(true);
    expect(WHITEBOARD_INTEROP_FIDELITY.map(({ format }) => format)).toEqual([
      '.vboard',
      'SVG',
      'PNG',
      'PDF',
      'Diagram SVG import',
      'PDF import',
      'Frames → Present',
    ]);
    expect(new Set(WHITEBOARD_INTEROP_FIDELITY.map(({ format }) => format)).size)
      .toBe(WHITEBOARD_INTEROP_FIDELITY.length);
    expect(WHITEBOARD_INTEROP_FIDELITY.every(({ preserved, limitations }) => preserved.length > 0 && limitations.length > 0))
      .toBe(true);
  });

  it('discloses the nine-card presentation limit and preserves the total in source notes', () => {
    const frame: WhiteboardItem = {
      id: 'frame-1', type: 'frame', x: 0, y: 0, width: 500, height: 300, text: 'Planning',
    };
    const objects: WhiteboardItem[] = Array.from({ length: 10 }, (_, index) => ({
      id: `item-${index}`,
      type: 'sticky',
      x: 10 + index * 20,
      y: 20,
      width: 12,
      height: 12,
      text: `Item ${index + 1}`,
    }));
    const document = {
      id: 'source-whiteboard',
      title: 'Release plan',
      kind: 'Whiteboard',
      created_at: 1,
      modified_at: 1,
      version: 1,
      theme_id: 'default',
      root_object_ids: [],
      objects: {},
    } as WorkspaceDocument;

    const presentation = buildPresentDocumentFromWhiteboard(document, [frame, ...objects], [frame.id], 10);
    const slide = presentation.presentData?.slides[0];
    const fidelity = WHITEBOARD_INTEROP_FIDELITY.find(({ format }) => format === 'Frames → Present');

    expect(slide?.cards).toHaveLength(9);
    expect(slide?.cards?.some(({ description }) => description === 'Item 10')).toBe(false);
    expect(slide?.speakerNotes).toContain('Frame frame-1; 10 contained Whiteboard object(s).');
    expect(fidelity?.preserved).toContain('up to nine visible contained-object summary cards');
    expect(fidelity?.limitations).toContain('additional cards');
  });
});
