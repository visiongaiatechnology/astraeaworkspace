// STATUS: GOLD — Paket 19 (AST-1326…AST-1329): „Draw-Element als **Live- oder Snapshotobjekt** senden".
//
// Der Test hält beide Hälften fest (live **und** eingefroren), die Identifizierbarkeit der Quelle
// (`documentId` + Anker-`objectId` + Typ im Träger) und jeden benannten Fehlschlag. Er benutzt die
// **vorhandene** Kette: Anker (dieses Paket) → `insertFromWorkspace` (shared fabric) →
// `renderFabricReference` (shared fabric). Keine zweite Trägerform, kein zweiter Zustandsbeschreiber.
import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { parseWorkspaceDragPayload } from '../../../../shared/workspace-interaction/workspaceInteractionPayload';
import { WORKSPACE_DRAG_PAYLOAD_SCHEMA } from '../../../../shared/workspace-interaction/workspaceInteractionTypes';
import {
  drawSendCarrierPayload, drawSendReferenceId, listDrawSendElements, readDrawSendState, sendDrawElement,
} from '../../integrations/drawSendEngine';
import { drawEmbedAnchorObjectId } from '../../integrations/drawWorkspaceIntegration';
import { createEmptyDrawDocument, upsertDrawObject } from '../../model/drawDocumentEngine';
import { createVectorFrame } from '../../model/drawVectorEngine';
import { instantiateDrawStencil } from '../../interactions/drawStencilCatalog';

function drawDocument(): WorkspaceDocument {
  const model = upsertDrawObject(createEmptyDrawDocument(), createVectorFrame({
    id: 'frame-1', pageId: 'page-1', layerId: 'layer-main', name: 'Topology',
    x: 40, y: 40, width: 400, height: 300, rotation: 0, flipX: false, flipY: false,
    opacity: 1, locked: false, zIndex: 0, vector: { kind: 'rectangle' },
  }));
  return {
    id: 'draw-1', title: 'System topology', kind: 'Draw', created_at: 0, modified_at: 0, version: 3,
    theme_id: 'cosmic', root_object_ids: [], objects: {}, drawData: model,
  } as WorkspaceDocument;
}

function whiteboardDocument(): WorkspaceDocument {
  return {
    id: 'board-1', title: 'Review board', kind: 'Whiteboard', created_at: 0, modified_at: 0, version: 5,
    theme_id: 'cosmic', root_object_ids: [], objects: {},
  } as WorkspaceDocument;
}

const documents = () => ({ 'draw-1': drawDocument(), 'board-1': whiteboardDocument() });

describe('Paket 19 — send as a live reference', () => {
  it('writes the canonical anchor into the source and a live reference into the target', () => {
    const result = sendDrawElement({
      source: drawDocument(), targetDocumentId: 'board-1', element: { kind: 'frame', id: 'frame-1' },
      mode: 'Live', documents: documents(), now: 1_000,
    });
    const anchorId = drawEmbedAnchorObjectId({ kind: 'frame', id: 'frame-1' });
    expect(result.anchorObjectId).toBe(anchorId);
    // Quelle: der Anker ist ein WOM-`Shape` und steht in `root_object_ids`; die Version ist gestiegen.
    const source = result.documents['draw-1']!;
    expect(source.objects[anchorId]?.type).toBe('Shape');
    expect(source.root_object_ids).toContain(anchorId);
    expect(source.version).toBe(4);
    // Ziel: ein Verweis, der auf die Quelle **zeigt** statt Inhalte zu kopieren.
    const reference = result.documents['board-1']!.objects[result.referenceId] as unknown as {
      type: string; data: { uri: string; mode: string; cached_snapshot?: unknown; fallback_snapshot?: unknown };
    };
    expect(reference.type).toBe('WorkspaceReference');
    expect(reference.data.uri).toBe(`vgt://workspace/document/draw-1/object/${anchorId}`);
    expect(reference.data.mode).toBe('Live');
    // Live heißt: **kein** eingebetteter Schnappschuss.
    expect(reference.data.cached_snapshot).toBeUndefined();
    expect(reference.data.fallback_snapshot).toBeUndefined();
  });

  it('describes the result through the one shared render contract, and it reads back', () => {
    const result = sendDrawElement({
      source: drawDocument(), targetDocumentId: 'board-1', element: { kind: 'frame', id: 'frame-1' },
      mode: 'Live', documents: documents(), now: 1_000,
    });
    expect(result.render.contract).toBe('astraea.workspace.fabric.render.v1');
    expect(result.render.referenceId).toBe(result.referenceId);
    expect(result.render.mode).toBe('Live');
    expect(result.render.status).toBe('current');
    expect(result.render.sourceType).toBe('Shape');
    expect(result.render.stale).toBe(false);
    const again = readDrawSendState(result.documents, 'board-1', result.referenceId);
    expect(again?.status).toBe('current');
  });

  it('is idempotent-refusing: a second send of the same element is refused by name', () => {
    const first = sendDrawElement({
      source: drawDocument(), targetDocumentId: 'board-1', element: { kind: 'frame', id: 'frame-1' },
      mode: 'Live', documents: documents(), now: 1_000,
    });
    expect(() => sendDrawElement({
      source: first.documents['draw-1']!, targetDocumentId: 'board-1', element: { kind: 'frame', id: 'frame-1' },
      mode: 'Live', documents: first.documents, now: 2_000,
    })).toThrowError(/send-reference-exists/);
  });
});

describe('Paket 19 — send as a frozen snapshot', () => {
  it('embeds the fallback snapshot and reports the frozen status', () => {
    const result = sendDrawElement({
      source: drawDocument(), targetDocumentId: 'board-1', element: { kind: 'frame', id: 'frame-1' },
      mode: 'Frozen', documents: documents(), now: 2_000,
    });
    const reference = result.documents['board-1']!.objects[result.referenceId] as unknown as {
      data: { mode: string; cached_snapshot?: { data: { width: number } }; fallback_snapshot?: unknown; fallback_policy?: string; frozen_at?: number; source_snapshot_id?: string };
    };
    expect(reference.data.mode).toBe('Frozen');
    expect(reference.data.cached_snapshot?.data.width).toBe(400);
    expect(reference.data.fallback_snapshot).toBeDefined();
    expect(reference.data.fallback_policy).toBe('allowed');
    expect(reference.data.frozen_at).toBe(2_000);
    expect(reference.data.source_snapshot_id).toContain('snapshot-');
    expect(result.render.status).toBe('frozen');
    expect(result.render.payload).toBeDefined();
  });

  it('keeps live and frozen distinguishable for the same element in two targets', () => {
    const second = { ...whiteboardDocument(), id: 'board-2', title: 'Deck' };
    const live = sendDrawElement({
      source: drawDocument(), targetDocumentId: 'board-1', element: { kind: 'frame', id: 'frame-1' },
      mode: 'Live', documents: { ...documents(), 'board-2': second }, now: 1_000,
    });
    const frozen = sendDrawElement({
      source: live.documents['draw-1']!, targetDocumentId: 'board-2', element: { kind: 'frame', id: 'frame-1' },
      mode: 'Frozen', documents: live.documents, now: 2_000,
    });
    expect(live.render.status).toBe('current');
    expect(frozen.render.status).toBe('frozen');
    // Beide Ziele tragen **denselben** Verweis-Bezeichner (dieselbe Quelle, dasselbe Element) — aber je Ziel.
    expect(frozen.referenceId).toBe(live.referenceId);
    expect(Object.keys(frozen.documents['board-1']!.objects)).toContain(live.referenceId);
    expect(Object.keys(frozen.documents['board-2']!.objects)).toContain(frozen.referenceId);
  });

  it('names the element that may be sent: the active page and every frame', () => {
    const elements = listDrawSendElements(drawDocument().drawData!);
    expect(elements).toEqual([{ kind: 'page', id: 'page-1' }, { kind: 'frame', id: 'frame-1' }]);
  });

  it('derives one stable reference id per source element', () => {
    const a = drawSendReferenceId('draw-1', { kind: 'frame', id: 'frame-1' });
    const b = drawSendReferenceId('draw-1', { kind: 'frame', id: 'frame-1' });
    const other = drawSendReferenceId('draw-1', { kind: 'page', id: 'page-1' });
    expect(a).toBe(b);
    expect(a).not.toBe(other);
    expect(a.length).toBeLessThanOrEqual(128);
  });
});

describe('Paket 19 — fail-closed, named reasons', () => {
  const base = {
    source: drawDocument(), targetDocumentId: 'board-1', element: { kind: 'frame' as const, id: 'frame-1' },
    mode: 'Live' as const, documents: documents(), now: 1_000,
  };

  it('refuses a non-Draw source, a missing target, the source as target and a bad document map', () => {
    expect(() => sendDrawElement({ ...base, source: { ...drawDocument(), kind: 'Writer' } }))
      .toThrowError(/send-source-not-draw/);
    expect(() => sendDrawElement({ ...base, targetDocumentId: 'nope' })).toThrowError(/send-target-missing/);
    expect(() => sendDrawElement({ ...base, targetDocumentId: 'draw-1' })).toThrowError(/send-target-is-source/);
    // @ts-expect-error — absichtlich kein Dokumentabbild.
    expect(() => sendDrawElement({ ...base, documents: [] })).toThrowError(/send-document-map-invalid/);
    expect(() => sendDrawElement({ ...base, mode: 'Half' as 'Live' })).toThrowError(/send-mode-invalid/);
    expect(() => sendDrawElement({ ...base, now: -1 })).toThrowError(/send-time-invalid/);
  });

  it('refuses a frame that does not exist in the drawing', () => {
    expect(() => sendDrawElement({ ...base, element: { kind: 'frame', id: 'frame-nope' } }))
      .toThrowError(/embed-frame-missing/);
  });
});

describe('Paket 19 — the carrier (pointer path) reuses the one existing producer', () => {
  it('refuses by name while no anchor exists — no substitute carrier is invented', () => {
    expect(() => drawSendCarrierPayload({ source: drawDocument(), element: { kind: 'frame', id: 'frame-1' } }))
      .toThrowError(/send-anchor-required/);
  });

  it('produces the canonical workspace payload once the anchor exists (matrix export is set)', () => {
    const sent = sendDrawElement({
      source: drawDocument(), targetDocumentId: 'board-1', element: { kind: 'frame', id: 'frame-1' },
      mode: 'Live', documents: documents(), now: 1_000,
    });
    const payload = drawSendCarrierPayload({ source: sent.documents['draw-1']!, element: { kind: 'frame', id: 'frame-1' } });
    const parsed = parseWorkspaceDragPayload(payload);
    expect(parsed.schema).toBe(WORKSPACE_DRAG_PAYLOAD_SCHEMA);
    // Die Quelle ist **identifizierbar**: Dokument, Anker-Objekt, Art und App — und **kein** Inhalt.
    expect(parsed.descriptor.documentId).toBe('draw-1');
    expect(parsed.descriptor.objectId).toBe(sent.anchorObjectId);
    expect(parsed.descriptor.objectKind).toBe('Shape');
    expect(parsed.descriptor.sourceApp).toBe('Draw');
    // Die **angebotenen** Absichten kommen aus der Matrix — nicht fest verdrahtet.
    expect(parsed.descriptor.supportedIntents).toEqual(['LIVE_REFERENCE']);
    expect(Object.keys(parsed)).toEqual(['schema', 'version', 'descriptor']);
    expect(JSON.stringify(parsed)).not.toContain('Topology');
  });

  it('reaches the carrier from the visible shape library: the Frame stencil really makes a frame', () => {
    // Der Befund dieser Runde: **kein** Pfad der Zone erzeugte ein `type: 'frame'`-Objekt aus der
    // Oberfläche — nur der Import. Damit waren Rahmen-Einbettung und Zeiger-Träger unerreichbar.
    const withFrame = upsertDrawObject(
      createEmptyDrawDocument(),
      instantiateDrawStencil(createEmptyDrawDocument(), 'draw-core-shapes:frame', 'page-1', 'layer-main', { x: 40, y: 40 }, { idSeed: 'lib' }),
    );
    const frameId = Object.keys(withFrame.objects)[0]!;
    expect(withFrame.objects[frameId]?.type).toBe('frame');
    const source = { ...drawDocument(), drawData: withFrame } as WorkspaceDocument;
    const sent = sendDrawElement({
      source, targetDocumentId: 'board-1', element: { kind: 'frame', id: frameId },
      mode: 'Frozen', documents: { ...documents(), 'draw-1': source }, now: 3_000,
    });
    expect(sent.render.status).toBe('frozen');
    expect(sent.render.payload).toBeDefined();
    const payload = drawSendCarrierPayload({ source: sent.documents['draw-1']!, element: { kind: 'frame', id: frameId } });
    expect(parseWorkspaceDragPayload(payload).descriptor.objectId).toBe(sent.anchorObjectId);
  });
});
