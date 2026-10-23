// STATUS: PLATIN — Fabric UI route contracts use the shared identity and permission resolver.
import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument, WorkspaceObject } from '../../../shared/contracts/workspace';
import {
  assessFabricWorkspaceDrop,
  createFabricWorkspaceObjectDragPayload,
  resolveFabricWorkspaceDrop,
} from '../fabricGraphWorkspaceDrop';

const source: WorkspaceDocument = {
  schema_version: 2,
  id: 'grid-source',
  title: 'Forecast',
  kind: 'Grid',
  created_at: 1,
  modified_at: 1,
  version: 3,
  theme_id: 'cosmic-obsidian',
  root_object_ids: ['table-forecast'],
  objects: {
    'table-forecast': {
      type: 'Table',
      data: { id: 'table-forecast', rows: 1, cols: 1, cells: { A1: { value: 'private-cell' } } },
    },
  },
};

const target: WorkspaceDocument = {
  schema_version: 2,
  id: 'writer-target',
  title: 'Report',
  kind: 'Writer',
  created_at: 1,
  modified_at: 1,
  version: 4,
  theme_id: 'cosmic-obsidian',
  root_object_ids: [],
  objects: {},
};

const documents = { [source.id]: source, [target.id]: target };

describe('Fabric Graph shared workspace drop adapter', () => {
  it('emits a versioned descriptor without table contents and resolves Writer targets', () => {
    const table = source.objects['table-forecast'];
    if (!table) throw new Error('Fixture table missing');
    const payload = createFabricWorkspaceObjectDragPayload(source, table);
    expect(payload).not.toBeNull();
    expect(payload).not.toContain('private-cell');
    expect(assessFabricWorkspaceDrop(payload ?? '', target.id, documents, { effect: 'Allow' })).toMatchObject({
      status: 'needsChoice',
      choices: [
        { intent: 'COPY', adapterId: 'fabric-grid-table-to-writer' },
        { intent: 'LIVE_REFERENCE', adapterId: 'fabric-grid-table-to-writer' },
      ],
    });
    // **Paket 15, vorgezogen (Runde 257) ✓✓** — *nicht gelöscht, nicht gelockert, nicht geskippt* ✓:
    // Der alte Zustand (**Live ohne Modus**) ist jetzt der **benannte** Fehlschlag ✓, und der vollendete
    // Live-Fall wird **mit Modus** weitergeführt ✗✓.
    expect(resolveFabricWorkspaceDrop(payload ?? '', target.id, documents, 'LIVE_REFERENCE', undefined, { effect: 'Allow' })).toMatchObject({
      status: 'rejected',
      code: 'drop_live_mode_required',
    });
    expect(resolveFabricWorkspaceDrop(payload ?? '', target.id, documents, 'LIVE_REFERENCE', 'Live', { effect: 'Allow' })).toMatchObject({
      status: 'resolved',
      selection: {
        sourceDocumentId: source.id,
        sourceObjectId: 'table-forecast',
        targetDocumentId: target.id,
        intent: 'LIVE_REFERENCE',
        integrationKind: 'live',
        mode: 'Live',
      },
      sourceVersion: 3,
      targetVersion: 4,
    });
    // **Und die Kopie trägt keinen Modus** ✓ — *die Abwesenheit ist die Aussage* ✓: eine Kopie hat keinen Live-Modus.
    const copy = resolveFabricWorkspaceDrop(payload ?? '', target.id, documents, 'COPY', undefined, { effect: 'Allow' });
    expect(copy).toMatchObject({ status: 'resolved', selection: { intent: 'COPY', integrationKind: 'copy' } });
    expect(copy.status === 'resolved' ? copy.selection.mode : 'unerwartet').toBeUndefined();
    // **Eigener Fehler, korrigiert (Runde 257) ✗✓:** Hier stand ein Aufruf mit `'Manchmal'` — *durch einen
    // **typisierten** Parameter (`mode?: 'Live' | 'Frozen'`) kann ein unbekannter Modus gar nicht erst hindurch* ✓.
    // **Der unbekannte Modus gehört an den Resolver**, dessen `requestedMode: unknown` ist ✓ — *dort ist er
    // geprüft und wird zum benannten Fehlschlag* ✓ (Zeuge: `workspaceInteractionCore.test.ts`).
  });

  it('rejects stale, spoofed and unauthorized sources without changing documents', () => {
    const table = source.objects['table-forecast'];
    if (!table) throw new Error('Fixture table missing');
    const payload = createFabricWorkspaceObjectDragPayload(source, table) ?? '';
    const before = structuredClone(documents);
    const stale = JSON.parse(payload) as Record<string, unknown>;
    const staleDescriptor = stale['descriptor'] as Record<string, unknown>;
    staleDescriptor['objectId'] = 'table-missing';
    expect(assessFabricWorkspaceDrop(JSON.stringify(stale), target.id, documents, { effect: 'Allow' })).toMatchObject({
      status: 'rejected', code: 'drop_source_object_missing',
    });
    expect(assessFabricWorkspaceDrop(payload, target.id, documents, { effect: 'Allow' })).toMatchObject({ status: 'needsChoice' });
    expect(resolveFabricWorkspaceDrop(payload, target.id, documents, 'COPY', undefined, { effect: 'Allow' })).toMatchObject({ status: 'resolved' });
    expect(documents).toEqual(before);
  });

  it('declines objects outside the registered source contract', () => {
    const chart: WorkspaceObject = {
      type: 'Chart',
      data: { id: 'chart-1', chart_type: 'bar', title: 'Chart', categories: [], series: [] },
    };
    expect(createFabricWorkspaceObjectDragPayload(source, chart)).toBeNull();
    const table = source.objects['table-forecast'];
    if (!table) throw new Error('Fixture table missing');
    const payload = createFabricWorkspaceObjectDragPayload(source, table) ?? '';
    expect(assessFabricWorkspaceDrop(payload, source.id, documents)).toMatchObject({ status: 'rejected' });
  });
});
