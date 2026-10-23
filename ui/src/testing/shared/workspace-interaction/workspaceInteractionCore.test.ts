// STATUS: PLATIN — Adversarial contract tests for the bounded interaction core.
import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument, WorkspaceObject } from '../../../shared/contracts/workspace';
import {
  createWorkspaceDragPayload,
  evaluateWorkspaceDrop,
  parseWorkspaceDragPayload,
  resolveWorkspaceDrop,
  serializeWorkspaceDragPayload,
  WorkspaceDragController,
  WorkspaceInteractionError,
  WorkspaceInteractionRegistry,
  WORKSPACE_DRAG_PAYLOAD_SCHEMA,
} from '../../../shared/workspace-interaction/index';
import type { WorkspaceObjectDescriptor } from '../../../shared/workspace-interaction/workspaceInteractionTypes';

const descriptor: WorkspaceObjectDescriptor = {
  documentId: 'grid-doc',
  objectId: 'table-1',
  objectKind: 'Table',
  sourceApp: 'Grid',
  supportedIntents: ['COPY', 'LIVE_REFERENCE', 'FROZEN_SNAPSHOT'],
};

function payload(overrides: Partial<WorkspaceObjectDescriptor> = {}): string {
  return serializeWorkspaceDragPayload(createWorkspaceDragPayload({ ...descriptor, ...overrides }));
}

function document(id: string, kind: 'Grid' | 'Writer', objectId?: string): WorkspaceDocument {
  const objects: Record<string, WorkspaceObject> = {};
  if (objectId) {
    objects[objectId] = { type: 'Table', data: { id: objectId, rows: 1, cols: 1, cells: { A1: { value: '42' } } } };
  }
  return {
    schema_version: 2,
    id,
    title: id,
    kind,
    created_at: 1,
    modified_at: 1,
    version: 2,
    theme_id: 'cosmic-obsidian',
    root_object_ids: objectId ? [objectId] : [],
    objects,
  };
}

function registry(): WorkspaceInteractionRegistry {
  const value = new WorkspaceInteractionRegistry();
  value.registerAppManifest({
    app: 'Grid',
    exports: [{ objectKind: 'Table', intents: ['COPY', 'LIVE_REFERENCE', 'FROZEN_SNAPSHOT'] }],
    imports: [],
  });
  value.registerAppManifest({
    app: 'Writer',
    exports: [],
    imports: [{ objectKind: 'Table', intents: ['COPY', 'LIVE_REFERENCE', 'FROZEN_SNAPSHOT'] }],
  });
  value.registerAdapter({
    id: 'writer-table-target',
    targetApp: 'Writer',
    objectKinds: ['Table'],
    intents: ['COPY', 'LIVE_REFERENCE', 'FROZEN_SNAPSHOT'],
  });
  return value.seal();
}

const documents = (): Readonly<Record<string, WorkspaceDocument>> => ({
  'grid-doc': document('grid-doc', 'Grid', 'table-1'),
  'writer-doc': document('writer-doc', 'Writer'),
});

describe('Workspace semantic drag payload', () => {
  it('roundtrips only stable identifiers and declared semantic intents', () => {
    const decoded = parseWorkspaceDragPayload(payload());
    expect(decoded.schema).toBe(WORKSPACE_DRAG_PAYLOAD_SCHEMA);
    expect(decoded.descriptor).toEqual(descriptor);
    expect(JSON.stringify(decoded)).not.toContain('42');
  });

  it('rejects unsupported versions, unknown intents and unknown object kinds', () => {
    const serialized = payload();
    const unsupported = serialized.replace('"version":1', '"version":2');
    expect(() => parseWorkspaceDragPayload(unsupported)).toThrowError(
      expect.objectContaining({ code: 'payload_version_unsupported' }),
    );
    expect(() => createWorkspaceDragPayload({ ...descriptor, supportedIntents: ['EXECUTE'] }))
      .toThrowError(expect.objectContaining({ code: 'intent_unknown' }));
    expect(() => createWorkspaceDragPayload({ ...descriptor, objectKind: 'Script' }))
      .toThrowError(expect.objectContaining({ code: 'object_kind_unknown' }));
  });

  it('rejects oversized and extra-field payloads before routing', () => {
    expect(() => parseWorkspaceDragPayload(' '.repeat(4_097)))
      .toThrowError(expect.objectContaining({ code: 'payload_too_large' }));
    const tampered = JSON.parse(payload()) as Record<string, unknown>;
    tampered['html'] = '<script>run()</script>';
    expect(() => parseWorkspaceDragPayload(JSON.stringify(tampered)))
      .toThrowError(expect.objectContaining({ code: 'payload_invalid' }));
  });
});

describe('Workspace interaction registry and resolver', () => {
  it('requires an explicit intent when multiple adapters are compatible', () => {
    const result = evaluateWorkspaceDrop({ payload: payload(), targetDocumentId: 'writer-doc', documents: documents(), requestedPolicyDecision: { effect: 'Allow' } }, registry());
    expect(result.status).toBe('needsChoice');
    if (result.status === 'needsChoice') expect(result.choices.map((choice) => choice.intent)).toEqual(['COPY', 'LIVE_REFERENCE', 'FROZEN_SNAPSHOT']);
  });

  it('re-resolves document, object kind, source app and authority before returning a route', () => {
    const value = registry();
    // **Paket 15, vorgezogen ✓✓:** *ausdrücklich* Live **ohne** Modus ist jetzt der **benannte** Fehlschlag ✗ —
    // *das ist die Akzeptanzhandlung: „klare Auswahl Live/Frozen **ohne heimlichen Default**"* ✓✓.
    expect(resolveWorkspaceDrop({ payload: payload(), targetDocumentId: 'writer-doc', requestedIntent: 'LIVE_REFERENCE', documents: documents(), requestedPolicyDecision: { effect: 'Allow' } }, value))
      .toMatchObject({ status: 'rejected', code: 'drop_live_mode_required' });
    expect(resolveWorkspaceDrop({ payload: payload(), targetDocumentId: 'writer-doc', requestedIntent: 'LIVE_REFERENCE', requestedMode: 'Frozen', documents: documents(), requestedPolicyDecision: { effect: 'Allow' } }, value))
      .toMatchObject({ status: 'resolved', selection: { adapterId: 'writer-table-target', intent: 'LIVE_REFERENCE', integrationKind: 'live', mode: 'Frozen' }, sourceVersion: 2, targetVersion: 2 });
    expect(evaluateWorkspaceDrop({ payload: payload({ objectKind: 'Chart' }), targetDocumentId: 'writer-doc', requestedIntent: 'COPY', documents: documents(), requestedPolicyDecision: { effect: 'Allow' } }, value))
      .toMatchObject({ status: 'rejected', code: 'drop_identity_mismatch' });
    expect(evaluateWorkspaceDrop({ payload: payload({ sourceApp: 'Writer' }), targetDocumentId: 'writer-doc', requestedIntent: 'COPY', documents: documents(), requestedPolicyDecision: { effect: 'Allow' } }, value))
      .toMatchObject({ status: 'rejected', code: 'drop_identity_mismatch' });
    expect(evaluateWorkspaceDrop({ payload: payload(), targetDocumentId: 'writer-doc', requestedIntent: 'COPY', documents: documents(), policy: { canReadSource: () => false }, requestedPolicyDecision: { effect: 'Allow' } }, value))
      .toMatchObject({ status: 'rejected', code: 'drop_authorization_failed' });
  });

  it('fails closed for unsealed registries, unknown intents and non-transactional moves', () => {
    const unsealed = new WorkspaceInteractionRegistry();
    expect(evaluateWorkspaceDrop({ payload: payload(), targetDocumentId: 'writer-doc', documents: documents(), requestedPolicyDecision: { effect: 'Allow' } }, unsealed))
      .toMatchObject({ status: 'rejected', code: 'registry_unsealed' });
    expect(evaluateWorkspaceDrop({ payload: payload(), targetDocumentId: 'writer-doc', requestedIntent: 'RUN', documents: documents(), requestedPolicyDecision: { effect: 'Allow' } }, registry()))
      .toMatchObject({ status: 'rejected', code: 'intent_unknown' });
    expect(evaluateWorkspaceDrop({ payload: payload(), targetDocumentId: 'writer-doc', requestedIntent: 'MOVE', documents: documents(), requestedPolicyDecision: { effect: 'Allow' } }, registry()))
      .toMatchObject({ status: 'rejected', code: 'drop_move_transaction_unavailable' });
  });

  it('rejects duplicate adapter IDs and ambiguous routes rather than overwriting', () => {
    const value = new WorkspaceInteractionRegistry();
    value.registerAppManifest({ app: 'Writer', exports: [], imports: [{ objectKind: 'Table', intents: ['COPY'] }] });
    value.registerAdapter({ id: 'writer-table-target', targetApp: 'Writer', objectKinds: ['Table'], intents: ['COPY'] });
    expect(() => value.registerAdapter({ id: 'writer-table-target', targetApp: 'Writer', objectKinds: ['Table'], intents: ['COPY'] }))
      .toThrowError(expect.objectContaining({ code: 'registry_adapter_id_duplicate' }));
    expect(() => value.registerAdapter({ id: 'writer-table-alt', targetApp: 'Writer', objectKinds: ['Table'], intents: ['COPY'] }))
      .toThrowError(expect.objectContaining({ code: 'registry_adapter_route_duplicate' }));
    expect(() => value.registerAppManifest({ app: 'Writer', exports: [], imports: [] }))
      .toThrowError(expect.objectContaining({ code: 'registry_manifest_duplicate' }));
    expect(() => value.seal().registerAppManifest({ app: 'Grid', exports: [], imports: [] }))
      .toThrowError(expect.objectContaining({ code: 'registry_read_only' }));
  });
});

describe('Workspace drag controller lifecycle', () => {
  it('requires the pointer threshold and clears transient state on cancel', () => {
    const controller = new WorkspaceDragController();
    controller.begin(payload(), 7, { x: 20, y: 30 });
    expect(controller.move(7, { x: 24, y: 30 })).toBe('armed');
    expect(controller.activePayload(7)).toBeNull();
    expect(controller.move(7, { x: 26, y: 30 })).toBe('dragging');
    expect(controller.activePayload(7)).toBe(payload());
    expect(controller.cancel(7)).toBe(true);
    expect(controller.isActive).toBe(false);
    expect(controller.activePayload(7)).toBeNull();
  });

  it('does not complete a drag before threshold and clears after completion', () => {
    const controller = new WorkspaceDragController();
    controller.begin(payload(), 2, { x: 1, y: 1 });
    expect(controller.complete(2)).toBeNull();
    expect(controller.isActive).toBe(false);
    controller.begin(payload(), 2, { x: 1, y: 1 });
    controller.move(2, { x: 10, y: 1 });
    expect(controller.complete(2)).toBe(payload());
    expect(controller.isActive).toBe(false);
  });

  it('rejects a second active pointer session and permits explicit cleanup', () => {
    const controller = new WorkspaceDragController();
    controller.begin(payload(), 1, { x: 0, y: 0 });
    expect(() => controller.begin(payload(), 2, { x: 0, y: 0 }))
      .toThrowError(expect.objectContaining({ code: 'drag_already_active' }));
    expect(controller.cancel(2)).toBe(false);
    controller.clear();
    expect(controller.isActive).toBe(false);
  });

  it('uses stable typed interaction errors', () => {
    try {
      parseWorkspaceDragPayload('{');
      throw new Error('expected parse rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(WorkspaceInteractionError);
      expect((error as WorkspaceInteractionError).code).toBe('payload_invalid');
    }
  });
});
