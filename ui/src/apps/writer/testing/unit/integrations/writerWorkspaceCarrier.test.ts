// STATUS: PLATIN — **Paket 22 (Writer)**: Beweise für den Träger-Erzeuger der Quellenseite
//
// ## Was hier gemessen wird ✓✓
//
// **Eine Referenz, kein Inhalt** ✓ · **das eine Format** ✓ (der vorhandene Parser liest den Träger ✓) ·
// die **Behandlungsart** ✓ (`copy` ✓ / `live` ✓, Modus **nur** bei `live` und **abwesend** statt `undefined` ✓)
// · **fail-closed mit benanntem Grund** ✓ · und die **Fahrt**: gegen eine echte Registry mit dem Eintrag
// `Writer → Publish` **stellt der Träger wirklich zu** ✓✓ — *gegen die **gesiegelte** Matrix dagegen
// **benannt** nicht* ✓ (die Grenze wird hier festgehalten, nicht verschwiegen ✓).
//
// ## Was hier `NOT_TESTED` bleibt ✗
//
// Das **Binden** des Ziehens ✓ (`draggable` / `dragstart` / `dataTransfer.setData` ✓) und die Ablage im
// **Publish**-Ziel ✓ — dafür braucht es einen Browser ✓ und die Zielhälfte ✓.
import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../../../../shared/contracts/workspace';
import {
  FABRIC_WORKSPACE_DROP_REGISTRY,
} from '../../../../../shell/fabric/fabricGraphWorkspaceDrop';
import {
  WorkspaceInteractionRegistry,
  parseWorkspaceDragPayload,
  resolveWorkspaceDrop,
} from '../../../../../shared/workspace-interaction';
import {
  carryWriterWorkspaceSection,
  createWriterWorkspaceCarrierState,
  createWriterWorkspaceSectionCarrier,
  writerWorkspaceCarrierRefusalText,
  writerWorkspaceCarrierSectionObjectId,
  writerWorkspaceCarrierStateText,
  writerWorkspaceCarrierSupportedIntents,
} from '../../../integrations/workspace-carrier/writerWorkspaceCarrier';

/** Ein echtes Writer-Dokument: die Absätze leben im `TextBlock`-**Wurzelobjekt** ✓ (`tb-letter` ✓). */
const writer: WorkspaceDocument = {
  schema_version: 2,
  id: 'writer-story',
  title: 'Story',
  kind: 'Writer',
  created_at: 1,
  modified_at: 1,
  version: 5,
  theme_id: 'cosmic-obsidian',
  root_object_ids: ['tb-letter'],
  objects: {
    'tb-letter': {
      type: 'TextBlock',
      data: {
        id: 'tb-letter',
        paragraphs: [{
          id: 'p1',
          style: { alignment: 'left', line_height: 1.2, space_before: 0, space_after: 0 },
          spans: [{ text: 'Vertraulicher Absatz' }],
        }],
      },
    },
  },
};

const publish: WorkspaceDocument = {
  schema_version: 2,
  id: 'publish-story',
  title: 'Story-Seite',
  kind: 'Publish',
  created_at: 1,
  modified_at: 1,
  version: 7,
  theme_id: 'cosmic-obsidian',
  root_object_ids: [],
  objects: {},
};

const documents = { [writer.id]: writer, [publish.id]: publish };

const carrierFor = (integrationKind: unknown, requestedMode?: unknown) => createWriterWorkspaceSectionCarrier({
  document: writer,
  integrationKind,
  ...(requestedMode === undefined ? {} : { requestedMode }),
});

describe('Paket 22 — der Träger ist eine Referenz, kein Inhalt', () => {
  it('trägt Kennungen, Art und Herkunft — und **nicht** den Text', () => {
    const step = carrierFor('copy');
    expect(step.ok).toBe(true);
    if (!step.ok) return;
    expect(step.carrier).toMatchObject({
      documentId: 'writer-story',
      objectId: 'tb-letter',
      objectKind: 'TextBlock',
      sourceApp: 'Writer',
      integrationKind: 'copy',
    });
    // *Die eine Zeichenfolge, die nicht mitfahren darf, fährt nicht mit* ✓.
    expect(step.carrier.payload).not.toContain('Vertraulicher Absatz');
  });

  it('benutzt **das eine** Format: der vorhandene Parser liest den Träger', () => {
    const step = carrierFor('copy');
    if (!step.ok) throw new Error('Träger fehlt');
    const parsed = parseWorkspaceDragPayload(step.carrier.payload);
    expect(parsed.descriptor).toEqual({
      documentId: 'writer-story',
      objectId: 'tb-letter',
      objectKind: 'TextBlock',
      sourceApp: 'Writer',
      supportedIntents: ['COPY'],
    });
    // **Genau die kanonischen Felder** ✓ — kein zweites Feld, keine zweite Liste.
    expect(Object.keys(parsed.descriptor).sort()).toEqual(['documentId', 'objectId', 'objectKind', 'sourceApp', 'supportedIntents']);
  });

  it('sagt die Behandlungsart — und trägt den Modus **nur** bei Live', () => {
    const copy = carrierFor('copy');
    const live = carrierFor('live', 'Live');
    const frozen = carrierFor('live', 'Frozen');
    const offen = carrierFor('live');
    if (!copy.ok || !live.ok || !frozen.ok || !offen.ok) throw new Error('Träger fehlt');
    expect(copy.carrier.integrationKind).toBe('copy');
    // **Abwesend, nicht `undefined`** ✓✓ — *der heimliche Default wäre genau der Defekt aus Paket 15* ✗.
    expect(Object.hasOwn(copy.carrier, 'mode')).toBe(false);
    expect(copy.carrier.supportedIntents).toEqual(['COPY']);
    expect(live.carrier).toMatchObject({ integrationKind: 'live', mode: 'Live' });
    expect(frozen.carrier).toMatchObject({ integrationKind: 'live', mode: 'Frozen' });
    expect(live.carrier.supportedIntents).toEqual(['LIVE_REFERENCE']);
    // Ein Live-**Angebot** ohne Modus ist erlaubt ✓ (den Modus verlangt die **Zustellung** ✓, nicht das Angebot ✓).
    expect(offen.carrier.integrationKind).toBe('live');
    expect(Object.hasOwn(offen.carrier, 'mode')).toBe(false);
  });
});

describe('Paket 22 — fail-closed mit benanntem Grund', () => {
  const cases: readonly (readonly [string, unknown, unknown, unknown])[] = [
    ['carrier-document-missing', undefined, 'copy', undefined],
    ['carrier-document-missing', { id: '' }, 'copy', undefined],
    ['carrier-source-not-writer', { ...writer, kind: 'Grid' }, 'copy', undefined],
    ['carrier-section-missing', { ...writer, root_object_ids: [], objects: {} }, 'copy', undefined],
    ['carrier-integration-kind-invalid', writer, 'teleport', undefined],
    ['carrier-copy-mode-not-allowed', writer, 'copy', 'Live'],
    ['carrier-live-mode-unknown', writer, 'live', 'Lauwarm'],
  ];

  it('nennt jeden ungültigen Weg — kein stiller Erfolg', () => {
    for (const [erwartet, document, kind, mode] of cases) {
      const step = createWriterWorkspaceSectionCarrier({
        document,
        integrationKind: kind,
        ...(mode === undefined ? {} : { requestedMode: mode }),
      });
      expect(step.ok, String(erwartet)).toBe(false);
      expect(step.reason, String(erwartet)).toBe(erwartet);
      // **Verengung, nicht Behauptung** ✓: `expect` verengt den Typ nicht ✓ — der Wurf tut es ✓.
      if (step.ok) throw new Error(`Der Träger wurde gebaut, obwohl er abgelehnt gehört: ${String(erwartet)}`);
      expect(writerWorkspaceCarrierRefusalText(step.reason).length, String(erwartet)).toBeGreaterThan(0);
    }
  });

  it('lehnt ein Objekt der falschen Art und einen unbekannten Abschnitt benannt ab', () => {
    const mitTabelle: WorkspaceDocument = {
      ...writer,
      objects: { ...writer.objects, 'tbl-1': { type: 'Table', data: { id: 'tbl-1', rows: 1, cols: 1, cells: {} } } },
    };
    expect(createWriterWorkspaceSectionCarrier({ document: mitTabelle, sectionObjectId: 'tbl-1', integrationKind: 'copy' }).reason)
      .toBe('carrier-section-kind-invalid');
    expect(createWriterWorkspaceSectionCarrier({ document: writer, sectionObjectId: 'gibt-es-nicht', integrationKind: 'copy' }).reason)
      .toBe('carrier-section-missing');
    expect(createWriterWorkspaceSectionCarrier({ document: writer, sectionObjectId: '', integrationKind: 'copy' }).reason)
      .toBe('carrier-section-missing');
  });

  it('liest den Abschnitt nach der **vorhandenen** Regel: Wurzel zuerst, sonst irgendein TextBlock', () => {
    expect(writerWorkspaceCarrierSectionObjectId(writer)).toBe('tb-letter');
    const ohneWurzel: WorkspaceDocument = { ...writer, root_object_ids: [] };
    expect(writerWorkspaceCarrierSectionObjectId(ohneWurzel)).toBe('tb-letter');
    const zwei: WorkspaceDocument = {
      ...writer,
      root_object_ids: ['tb-zwei'],
      objects: {
        ...writer.objects,
        'tb-fremd': { type: 'TextBlock', data: { id: 'tb-fremd', paragraphs: [] } },
        'tb-zwei': { type: 'TextBlock', data: { id: 'tb-zwei', paragraphs: [] } },
      },
    };
    expect(writerWorkspaceCarrierSectionObjectId(zwei)).toBe('tb-zwei');
  });

  it('leitet die angebotenen Absichten aus der Behandlungsart ab', () => {
    expect(writerWorkspaceCarrierSupportedIntents('copy')).toEqual(['COPY']);
    expect(writerWorkspaceCarrierSupportedIntents('live')).toEqual(['LIVE_REFERENCE']);
  });
});

describe('Paket 22 — die Fahrt des Writer-Trägers', () => {
  /** **Eine echte Registry** ✓ mit dem Eintrag, den die gesiegelte Matrix (noch) nicht hat ✓. */
  const mitWriterQuelle = () => {
    const registry = new WorkspaceInteractionRegistry();
    registry.registerAppManifest({
      app: 'Writer',
      exports: [{ objectKind: 'TextBlock', intents: ['COPY', 'LIVE_REFERENCE'] }],
      imports: [{ objectKind: 'Table', intents: ['COPY', 'LIVE_REFERENCE'] }],
    });
    registry.registerAppManifest({
      app: 'Publish',
      exports: [],
      imports: [{ objectKind: 'TextBlock', intents: ['COPY', 'LIVE_REFERENCE'] }],
    });
    registry.registerAdapter({
      id: 'fabric-writer-section-to-publish',
      targetApp: 'Publish',
      objectKinds: ['TextBlock'],
      intents: ['COPY', 'LIVE_REFERENCE'],
    });
    return registry.seal();
  };

  it('stellt mit dem fehlenden Matrix-Eintrag wirklich zu — Kopie und Live', () => {
    const registry = mitWriterQuelle();
    const copy = carrierFor('copy');
    const live = carrierFor('live', 'Frozen');
    if (!copy.ok || !live.ok) throw new Error('Träger fehlt');
    const kopie = resolveWorkspaceDrop({
      payload: copy.carrier.payload,
      targetDocumentId: publish.id,
      requestedIntent: 'COPY',
      documents,
      requestedPolicyDecision: { effect: 'Allow' },
    }, registry);
    expect(kopie.status).toBe('resolved');
    if (kopie.status === 'resolved') {
      expect(kopie.selection).toMatchObject({ adapterId: 'fabric-writer-section-to-publish', integrationKind: 'copy' });
      expect(kopie.selection.mode).toBeUndefined();
      expect(kopie.sourceVersion).toBe(5);
      expect(kopie.targetVersion).toBe(7);
    }
    const verweis = resolveWorkspaceDrop({
      payload: live.carrier.payload,
      targetDocumentId: publish.id,
      requestedIntent: 'LIVE_REFERENCE',
      requestedMode: 'Frozen',
      documents,
      requestedPolicyDecision: { effect: 'Allow' },
    }, registry);
    expect(verweis.status).toBe('resolved');
    if (verweis.status === 'resolved') {
      expect(verweis.selection).toMatchObject({ integrationKind: 'live', mode: 'Frozen' });
    }
  });

  it('und gegen die **gesiegelte** Matrix ist er ein **benannter** Fehlschlag — die Grenze, gemessen', () => {
    const step = carrierFor('copy');
    if (!step.ok) throw new Error('Träger fehlt');
    // *Das Writer-Manifest hat `exports: []`* ✓ — bis dieser Eintrag in `shell/fabric` steht, gibt es **keine**
    // Route aus Writer heraus ✓. **Benannt** ✓, kein stiller Erfolg ✗.
    const versuch = resolveWorkspaceDrop({
      payload: step.carrier.payload,
      targetDocumentId: publish.id,
      requestedIntent: 'COPY',
      documents,
      requestedPolicyDecision: { effect: 'Allow' },
    }, FABRIC_WORKSPACE_DROP_REGISTRY);
    expect(versuch.status).toBe('rejected');
    if (versuch.status === 'rejected') expect(versuch.code).toBe('registry_adapter_route_missing');
    // Und der Live-Weg ist aus **demselben** Grund zu, nicht aus einem zweiten.
    const live = carrierFor('live', 'Live');
    if (!live.ok) throw new Error('Träger fehlt');
    const liveVersuch = resolveWorkspaceDrop({
      payload: live.carrier.payload,
      targetDocumentId: publish.id,
      requestedIntent: 'LIVE_REFERENCE',
      requestedMode: 'Live',
      documents,
      requestedPolicyDecision: { effect: 'Allow' },
    }, FABRIC_WORKSPACE_DROP_REGISTRY);
    expect(liveVersuch.status).toBe('rejected');
    if (liveVersuch.status === 'rejected') expect(liveVersuch.code).toBe('registry_adapter_route_missing');
  });
});

describe('Paket 22 — der Zustand der Quellenseite', () => {
  it('trägt den Träger **oder** den benannten Grund — nie beides, nie still', () => {
    const leer = createWriterWorkspaceCarrierState();
    expect(leer.carrier).toBeNull();
    expect(leer.refusal).toBeNull();
    const bereit = carryWriterWorkspaceSection(leer, { document: writer, integrationKind: 'copy' });
    expect(bereit.carrier?.objectId).toBe('tb-letter');
    expect(bereit.refusal).toBeNull();
    const abgelehnt = carryWriterWorkspaceSection(bereit, { document: { id: 'x', kind: 'Grid' }, integrationKind: 'copy' });
    expect(abgelehnt.carrier).toBeNull();
    expect(abgelehnt.refusal).toBe('carrier-source-not-writer');
  });

  it('sagt „Bereitgestellt" — und **nicht** „zugestellt"', () => {
    const bereit = carryWriterWorkspaceSection(createWriterWorkspaceCarrierState(), { document: writer, integrationKind: 'live', requestedMode: 'Frozen' });
    const text = writerWorkspaceCarrierStateText(bereit);
    expect(text).toContain('Bereitgestellt');
    expect(text).not.toContain('zugestellt');
    expect(text).toContain('tb-letter');
    expect(text).toContain('Eingefrorener Snapshot');
    const abgelehnt = carryWriterWorkspaceSection(createWriterWorkspaceCarrierState(), { document: undefined, integrationKind: 'copy' });
    expect(writerWorkspaceCarrierStateText(abgelehnt)).toBe(writerWorkspaceCarrierRefusalText('carrier-document-missing'));
  });
});
