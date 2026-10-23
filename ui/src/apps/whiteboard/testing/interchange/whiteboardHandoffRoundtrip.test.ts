// STATUS: PLATIN — export/handoff isolation and source documentation (AST-1098, AST-1103).
//
// Deliberate decision, measured in this tree: export and handoff provenance is **documented inside the
// derived document's canonical fields** (slide speaker notes) and never written into `wom_extensions`.
// That namespace is the platform's own slot — `apps/pdf/persistence/pdfStudioPersistence.ts:30-32`
// records the same lesson after removing its own marker from it. Inventing a Whiteboard namespace would
// be the "second slot for one fact" this project keeps paying for.
import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';
import {
  deserializeWorkspaceDocumentCanonical,
  serializeWorkspaceDocumentCanonical,
} from '../../../../platform/workspace/model/workspaceObjectModelDocumentPersistence';
import { buildWhiteboardSvg, itemsForWhiteboardScope } from '../../interchange/whiteboardExportImportEngine';
import { buildPresentDocumentFromWhiteboard } from '../../integrations/whiteboardPresentHandoff';
import { syncWhiteboardItemsToDocument } from '../../persistence/canvasItemsStore';
import type { WhiteboardItem } from '../../types';

function createDocument(): WorkspaceDocument {
  return {
    id: 'whiteboard-handoff',
    title: 'Architecture workshop',
    kind: 'Whiteboard',
    created_at: 1_000,
    modified_at: 1_000,
    version: 1,
    theme_id: 'cosmic-obsidian',
    root_object_ids: [],
    objects: {},
  };
}

function createBoard(): WhiteboardItem[] {
  return [
    { id: 'frame-1', type: 'frame', x: 0, y: 0, width: 640, height: 360, text: 'Architecture' },
    { id: 'outside', type: 'process', x: 2_000, y: 2_000, width: 160, height: 80, text: 'Outside' },
    { id: 'note-1', type: 'sticky', x: 40, y: 60, width: 180, height: 140, text: 'Gateway', color: 'yellow' },
    { id: 'node-1', type: 'process', x: 300, y: 60, width: 200, height: 90, text: 'Service' },
    { id: 'edge-1', type: 'connector', x: 0, y: 0, width: 1, height: 1, text: '', fromId: 'note-1', toId: 'node-1', lineLabel: 'calls' },
  ];
}

describe('Whiteboard export is a read-only derivation (AST-1098)', () => {
  it('never mutates the source payload and keeps every identity stable', () => {
    const items = createBoard();
    const snapshot = JSON.stringify(items);
    const scoped = itemsForWhiteboardScope(items, { frameId: 'frame-1' });

    expect(JSON.stringify(items)).toBe(snapshot);
    expect(scoped.every((item) => !items.includes(item))).toBe(true);
    expect(scoped.map((item) => item.id)).toEqual(['frame-1', 'note-1', 'node-1', 'edge-1']);
    // The scoped export carries the frame and the connectors inside it, and nothing outside the frame.
    expect(scoped.some((item) => item.id === 'outside')).toBe(false);
  });

  it('never hands out live references for a whole-board export either', () => {
    const items = createBoard();
    const snapshot = JSON.stringify(items);
    const all = itemsForWhiteboardScope(items);

    expect(JSON.stringify(items)).toBe(snapshot);
    expect(all.every((item) => !items.includes(item))).toBe(true);
    expect(all.map((item) => item.id)).toEqual(items.map((item) => item.id));
    all[0].text = 'mutated copy';
    expect(items[0].text).toBe('Architecture');
  });

  it('produces byte-identical SVG for the same input', () => {
    const items = createBoard();
    const first = buildWhiteboardSvg('Architecture workshop', items, { frameId: 'frame-1' });
    const second = buildWhiteboardSvg('Architecture workshop', items, { frameId: 'frame-1' });
    expect(second).toBe(first);
    expect(first.startsWith('<svg')).toBe(true);
  });

  it('rejects a frame scope that does not exist instead of exporting something else', () => {
    expect(() => itemsForWhiteboardScope(createBoard(), { frameId: 'missing-frame' })).toThrow('Requested export frame does not exist');
  });
});

describe('Whiteboard → Present handoff documents its source (AST-1103)', () => {
  it('records the source board and frame in the derived document and keeps it through Save→Reopen', () => {
    const document = createDocument();
    const items = createBoard();
    const derived = buildPresentDocumentFromWhiteboard(document, items, ['frame-1'], 5_000);

    expect(derived.kind).toBe('Present');
    expect(derived.title).toContain(document.title);
    const slides = derived.presentData?.slides ?? [];
    expect(slides.length).toBe(1);
    for (const slide of slides) {
      expect(slide.speakerNotes).toContain(`Source: ${document.title}`);
      expect(slide.speakerNotes).toContain('frame-1');
      expect(slide.category).toBe('Whiteboard Export');
    }

    const reopened = deserializeWorkspaceDocumentCanonical(serializeWorkspaceDocumentCanonical(derived));
    expect(reopened.presentData?.slides?.[0]?.speakerNotes).toBe(slides[0]?.speakerNotes);
    expect(reopened.presentData).toEqual(derived.presentData);
  });

  it('is deterministic apart from the generated export identity', () => {
    const document = createDocument();
    const items = createBoard();
    const strip = (value: WorkspaceDocument) => JSON.stringify({
      ...value,
      id: 'export',
      presentData: {
        ...value.presentData,
        slides: (value.presentData?.slides ?? []).map((slide) => ({
          ...slide,
          id: 'slide',
          cards: (slide.cards ?? []).map((card) => ({ ...card, id: 'card' })),
        })),
      },
    });
    expect(strip(buildPresentDocumentFromWhiteboard(document, items, ['frame-1'], 5_000)))
      .toBe(strip(buildPresentDocumentFromWhiteboard(document, items, ['frame-1'], 5_000)));
  });

  it('states an honest no-frame outcome instead of exporting the whole board silently', () => {
    const document = createDocument();
    const derived = buildPresentDocumentFromWhiteboard(document, createBoard(), ['ghost-frame'], 5_000);
    const slide = derived.presentData?.slides?.[0];
    expect(slide?.title).toContain('No selected frames');
    expect(slide?.speakerNotes).toContain('Source: Architecture workshop');
    expect(slide?.cards).toEqual([]);
  });

  it('survives the canonical document round trip when it was built from real canonical items', () => {
    const document = syncWhiteboardItemsToDocument(createBoard(), createDocument());
    const derived = buildPresentDocumentFromWhiteboard(document, createBoard(), ['frame-1'], 5_000);
    const reopened = deserializeWorkspaceDocumentCanonical(serializeWorkspaceDocumentCanonical(derived));
    expect(reopened.presentData?.slides?.length).toBe(1);
    expect(reopened.presentData?.slides?.[0]?.speakerNotes).toContain('Source: Architecture workshop');
  });
});
