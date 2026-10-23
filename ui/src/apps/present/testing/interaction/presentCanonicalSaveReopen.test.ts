// @vitest-environment happy-dom
// STATUS: PLATIN — PR-009 (Present M1): the edited slide survives the canonical save/read path
//
// M1 requires: "eine Folie mit frei beweglichen, skalalierbaren und editierbaren Text- und
// Formobjekten erstellen, speichern und wieder öffnen". The interactive witnesses prove creation
// and editing; this one proves that the **same document** comes back through the shipped
// canonical writer/reader with text, position, size and fill intact — no local React copy and no
// second authority involved.
//
// The native close/reopen probe stays PR-010 (`NATIVE_UNVERIFIED`).
import { describe, expect, it } from 'vitest';
import type { PresentSlide, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import {
  deserializeWorkspaceDocumentCanonical,
  serializeWorkspaceDocumentCanonical,
} from '../../../../platform/workspace/model/workspaceObjectModelDocumentPersistence';

function slideWithSceneObjects(): PresentSlide {
  return {
    id: 'slide-m1',
    title: '',
    subtitle: '',
    layout: 'blank',
    cards: [],
    speakerNotes: '',
    sceneObjects: [
      {
        id: 'text-1',
        kind: 'text',
        xPercent: 12.5,
        yPercent: 24.25,
        widthPercent: 34,
        heightPercent: 18,
        rotation: 0,
        opacity: 1,
        zIndex: 30,
        text: 'Frei beweglicher Text',
        fontSizePt: 28,
        fontWeight: 'bold',
        color: '#f8fafc',
        textAlign: 'center',
      },
      {
        id: 'shape-1',
        kind: 'shape',
        xPercent: 55,
        yPercent: 40,
        widthPercent: 25,
        heightPercent: 20,
        rotation: 15,
        opacity: 0.9,
        zIndex: 20,
        shape: 'ellipse',
        fillColor: '#38bdf8',
        strokeColor: '#0f172a',
        strokeWidth: 3,
      },
    ],
  } as PresentSlide;
}

function presentDocument(): WorkspaceDocument {
  return {
    id: 'present-m1-save',
    title: 'M1 Save Reopen',
    kind: 'Present',
    created_at: 0,
    modified_at: 0,
    version: 4,
    theme_id: 'default',
    root_object_ids: [],
    objects: {},
    presentData: { slides: [slideWithSceneObjects()], theme: 'dark', aspectRatio: '16:9' },
  } as WorkspaceDocument;
}

describe('PR-009 — the canonical document path preserves the edited slide', () => {
  it('returns the same text, geometry, fill and z-order after serialize → deserialize', () => {
    const original = presentDocument();
    const serialized = serializeWorkspaceDocumentCanonical(original);
    expect(typeof serialized).toBe('string');
    expect(serialized.length).toBeGreaterThan(0);

    const restored = deserializeWorkspaceDocumentCanonical(serialized);
    expect(restored.kind).toBe('Present');
    const before = original.presentData!.slides[0]!.sceneObjects!;
    const after = restored.presentData?.slides[0]?.sceneObjects ?? [];
    expect(after).toEqual(before);
    expect(restored.presentData?.slides[0]?.id).toBe('slide-m1');
    expect(restored.presentData?.aspectRatio).toBe('16:9');

    // Spot-check the values a user would notice: text, position, size, rotation, fill.
    const text = after.find((object) => object.id === 'text-1') as unknown as Record<string, unknown>;
    expect(text.text).toBe('Frei beweglicher Text');
    expect(text.xPercent).toBeCloseTo(12.5, 5);
    expect(text.yPercent).toBeCloseTo(24.25, 5);
    expect(text.widthPercent).toBe(34);
    const shape = after.find((object) => object.id === 'shape-1') as unknown as Record<string, unknown>;
    expect(shape.shape).toBe('ellipse');
    expect(shape.fillColor).toBe('#38bdf8');
    expect(shape.rotation).toBe(15);
  });

  it('is stable across a second save/reopen generation', () => {
    const first = deserializeWorkspaceDocumentCanonical(serializeWorkspaceDocumentCanonical(presentDocument()));
    const second = deserializeWorkspaceDocumentCanonical(serializeWorkspaceDocumentCanonical(first));
    expect(second.presentData?.slides[0]?.sceneObjects).toEqual(first.presentData?.slides[0]?.sceneObjects);
  });

  it('does not invent objects or drop the slide on the way', () => {
    const restored = deserializeWorkspaceDocumentCanonical(serializeWorkspaceDocumentCanonical(presentDocument()));
    expect(restored.presentData?.slides ?? []).toHaveLength(1);
    expect(restored.presentData?.slides[0]?.sceneObjects ?? []).toHaveLength(2);
  });
});
