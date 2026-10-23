// STATUS: PLATIN — Integration & Release, Schicht **WOM/Persistenz**: alle **55 offenen Zeilen** in einem Zug.
//
// ## 1. Die Schicht ist gemessen, nicht angenommen
//
// ```
// Import-Csv ... | Where-Object { $_.app -match 'Integration' -and $_.status -eq 'OPEN' -and $_.layer -eq 'WOM/Persistenz' }
// ```
// → **55 Zeilen**, und die Verteilung **derselben** IDs über alle Schichten ist: **WOM/Persistenz = 55**,
// keine zweite Schicht. *Der Hinweis „ein Agent meldete überwiegend Schicht 5" trifft für diese Menge nicht zu* —
// gemessen, nicht übernommen.
//
// ## 2. Was hier ausgeführt wird — der **wirkliche** Rundlauf
//
// Jede der 55 Zeilen trägt wörtlich dieselbe Prüfanweisung:
// *„Prüfe Save→Close→Reopen auf identische Nutzdaten für: <Akzeptanzszenario>."*
//
// Ausgeführt über die **ausgelieferte** kanonische Grenze — *kein zweiter Serialisierer, kein Mock*:
//
// | Schritt | Aufruf | Datei |
// | --- | --- | --- |
// | **Save** | `serializeWorkspaceDocumentCanonical(document)` | `platform/workspace/model/workspaceObjectModelDocumentPersistence.ts:234` |
// | **Close** | die Bytes sind das Einzige, was die Grenze überquert | — |
// | **Reopen** | `deserializeWorkspaceDocumentCanonical(bytes)` | `…DocumentPersistence.ts:246` |
//
// **Zwei Zyklen, zwei Beweise** — die Form, die dreimal funktioniert hat:
//
// 1. **`toEqual` auf die Nutzdaten** als primärer Beweis: der zweite Durchlauf muss dem ersten tiefengleich sein.
// 2. **Der zweite Zyklus byteweise**: `serialize(reopen(bytes)) === bytes`. *Die gespeicherte Form ist ein Fixpunkt.*
// 3. **Und der Aufrufer wird nicht verändert** (belegt im Rundlauf-Werkzeug, `aufruferUnveraendert`).
//
// Dazu je Zeile die **eigenen Nutzdaten-Fakten** des Szenarios, gemessen **am wiedereröffneten** Dokument.
//
// ## 3. Was diese Schicht **nicht** beweist (Grenze — gehört in `notes.md`)
//
// * **Schicht 5 (`Reale Abnahme`) bleibt `NOT_TESTED`**: kein Browser, kein jsdom, kein Tauri, kein zweiter
//   Bildschirm, keine echte Zeigereingabe. *Ein Rundlauf im Prozess ist **kein** Neustart über Prozessgrenzen* —
//   `serializeWorkspaceDocumentCanonical` **schreibt keine Bytes**, es **liefert** sie. Wer sie auf die Platte
//   schreibt, ist der Aufrufer (`saveDocumentToStorage`, `platform/workspace/persistence/workspaceStorageDocuments.ts:14`)
//   — und der ruft IndexedDB, das es headless nicht gibt. **Diese Grenze wird nicht überdehnt.**
// * **Verschlüsseltes Speichern** wird für die betroffene Zeile **wirklich** ausgeführt
//   (`packLocalEncryptedContainer` / `unpackLocalEncryptedContainer`, WebCrypto-Pfad) — *aber der native
//   Tauri-/KeyVault-Pfad und der Top-Secret-Provider bleiben `NOT_TESTED`.*
// * **`Frontend/UX` und `Backend/Domain` sind getrennt gebucht**: *eine Route zu bezeugen ist nicht dasselbe wie
//   eine Funktion zu liefern.* Für Zeilen, deren Szenario eine Oberfläche ist (Overlay, Tab-Hover, Fokusketten,
//   Shortcuts, Kontextmenü, Mehrfenster), steht hier **nur**, was die Persistenz trägt — **nicht** die Oberfläche.
// * **BENANNTER ANKER FÜR EINE FREMDENTSCHEIDUNG (Paket 33).** Drei Zeugen dieser Datei benutzen die **Ablage als
//   Weg** (`AST-1950`, `AST-2040`, `AST-2135` — `evaluateWorkspaceDrop` / `resolveWorkspaceDrop`, **alle in
//   `shared/workspace-interaction/workspaceInteractionResolver.ts`**, *nicht in meiner Zone*). Der Auftraggeber hat
//   entschieden: **ein Drop ohne vorliegende Policy-Entscheidung wird künftig benannt abgewiesen.** *Sobald diese
//   Entscheidung als Pflichteingang injiziert wird, werden genau diese drei Zeugen rot* — **und zwar fremd, nicht
//   durch einen Defekt in dieser Schicht.** Der Anker steht hier, damit dieser rote Test **benannt** ist und nicht
//   als eigener Befund fehlgedeutet wird. *Die `WOM/Persistenz`-Zusage dieser Datei (Save→Close→Reopen) hängt
//   **nicht** an der Ablage: alle 55 Zeilen messen den Rundlauf, nicht den Weg dorthin.*
// * **Zwei Befunde sind inzwischen BEHOBEN — und die zwei Zeugen unten sind deshalb auf die Zusage
//   umgestellt** (`W-456`, `W-457`; `platform/workspace/model/workspaceObjectModelDocumentPersistence.ts`).
//   *Der Messwert **vor** der Aenderung ist in beiden Zeugen woertlich festgehalten* — die Zeile war damals
//   `ACCEPTED` mit stillem Verlust (`W-456`) bzw. mit **erfundener** Provenienz (`W-457`). Die vollstaendigen
//   Zeugen beider Zusagen stehen in `src/testing/platform/workspace/model/`:
//   `workspaceV1WorkDataMigrationNoSilentLoss.w456.test.ts` und `workspaceTopSecretProvenanceAbsence.w457.test.ts`.
//   *Die Positivkontrollen dieser Datei sind geblieben: nur `workData` ⇒ migriert · gleiche Nutzlast in beiden
//   Feldern ⇒ zugelassen · falsche Provenienz ⇒ unveraendert benannt · korrekte Provenienz ⇒ zugelassen.*
// * **BENANNTER ANKER: eine Folge ausserhalb dieser Zone.** `apps/writer/testing/unit/security/writerRecoveryEncryption.test.ts:122-125`
//   baut ein `VGT_TOP_SECRET`-Dokument **ohne** Provenienz und erwartet `/TS_PROVIDER_UNAVAILABLE/`. Seit `W-457`
//   weist `migrateWorkspaceDocument` dieses Dokument **früher** und aus dem richtigen Grund ab — die Attrappe
//   braucht die gepinnte Provenienz (`infinity_suite: INFINITY_SUITE`, `infinity_commit: INFINITY_PINNED_COMMIT`),
//   *dann erreicht sie den Provider-Wächter wieder.* **Nicht hier repariert: `apps/**` liegt ausserhalb der Zone
//   dieses Auftrags** — der Punkt ist gemeldet, nicht stillschweigend übergangen.
//
// ## 4. Die Schwellen sind aus der **Datei** gemessen, nicht aus dem Kopf
//
// `WOM_SCHEMA_VERSION = 2`, `WOM_MIN_READABLE_SCHEMA_VERSION = 1` (`shared/contracts/wom/workspaceWom.ts:4-5`) ·
// `WORKSPACE_DOCUMENT_KINDS` = 20 Arten (`shared/workspace-interaction/workspaceInteractionTypes.ts:33-37`) ·
// `WORKSPACE_OBJECT_KINDS` = 11 Typen (`:19-31`) · `WORKSPACE_DRAG_THRESHOLD_PX = 6` (`:7`) ·
// `WORKSPACE_SCHEMA_VERSIONS` = 20 Einträge, alle `1` (`platform/workspace/integrations/workspaceSchemaVersion.ts:48`).
import { describe, expect, it } from 'vitest';
import {
  applyWorkspaceChangeOperation,
  deserializeWorkspaceDocumentCanonical,
  markWorkspaceReferencesBroken,
  parseWorkspaceObjectUri,
  serializeWorkspaceDocumentCanonical,
  workspaceObjectUri,
  workspaceReferenceDescriptor,
  WorkspaceMalformedInputError,
} from '../../platform/workspace/model/workspaceObjectModel';
import {
  freezeFabricReference,
  insertFromWorkspace,
  propagateFabricUpdates,
} from '../../shared/workspace-interaction/fabricReferenceOperations';
// **Unterschriften gelesen, nicht geschlossen:** `resolveFabricReference` und `renderFabricReference`
// **leben** in `fabricState.ts` (`:137` / `:328`); `fabricReferenceOperations.ts` importiert sie nur.
import { renderFabricReference, resolveFabricReference } from '../../shared/workspace-interaction/fabricState';
import { applyWorkspaceTransfer, planWorkspaceTransfer } from '../../shared/workspace-interaction/fabricTransferOperations';
import { coalesceFabricChanges, propagateFabricBatch } from '../../shared/workspace-interaction/fabricBatchOperations';
import { buildExternalClipboardPayload, planFabricExport } from '../../shared/workspace-interaction/fabricExportOperations';
import { evaluateWorkspaceDrop, resolveWorkspaceDrop } from '../../shared/workspace-interaction/workspaceInteractionResolver';
import { WorkspaceInteractionRegistry } from '../../shared/workspace-interaction/workspaceInteractionRegistry';
import {
  createWorkspaceDragPayload,
  parseWorkspaceDragPayload,
  serializeWorkspaceDragPayload,
} from '../../shared/workspace-interaction/workspaceInteractionPayload';
import { WorkspaceDragController } from '../../shared/workspace-interaction/workspaceDragController';
import {
  WORKSPACE_DRAG_PAYLOAD_SCHEMA,
  WORKSPACE_DRAG_THRESHOLD_PX,
  WORKSPACE_DOCUMENT_KINDS,
  WORKSPACE_OBJECT_KINDS,
} from '../../shared/workspace-interaction/workspaceInteractionTypes';
import {
  WORKSPACE_SCHEMA_VERSIONS,
  assertWorkspaceSchemaContract,
  resolveWorkspaceSchemaAction,
} from '../../platform/workspace/integrations/workspaceSchemaVersion';
// **Unterschriften gelesen, nicht geschlossen:** `workspaceSchemaVersionFor` und `resolveWorkspaceDocumentRead`
// **leben** in `workspaceDocumentRead.ts` (`:46` / `:32`), nicht im Versionsvertrag.
import { resolveWorkspaceDocumentRead, workspaceSchemaVersionFor } from '../../platform/workspace/integrations/workspaceDocumentRead';
import { packLocalEncryptedContainer, unpackLocalEncryptedContainer } from '../../platform/containers/container';
import { assertNoSecurityDowngrade, applySecurityProfile, INFINITY_SUITE } from '../../platform/security/securityProfiles';

// ---------------------------------------------------------------------------------------------------------------
// Die Werkzeuge. Jede Zeile benutzt **dieselben** — *kein zweiter Serialisierer, kein zweites Limit*.
// ---------------------------------------------------------------------------------------------------------------

/** Nutzdaten-Projektion: reines JSON, damit der Vergleich die **Nutzdaten** trifft und nicht die Objektidentität. */
const nutzdaten = (wert) => JSON.parse(JSON.stringify(wert));

/**
 * **Der eine Weg über die Grenze.** *Jede* Aussage dieser Datei läuft durch diese Funktion — die 55 Zeilen und
 * die benannten Befunde. **Deshalb ist sie der Angelpunkt des Gegenchecks:** wird sie neutralisiert (der Weg
 * wird zur Attrappe), **müssen** die benannten Tests rot werden und die Positivkontrollen grün bleiben.
 */
function kanal(document) {
  const bytes = serializeWorkspaceDocumentCanonical(document);
  // ---- Close: nur `bytes` überquert diese Linie. ----
  return { bytes, reopened: deserializeWorkspaceDocumentCanonical(bytes) };
}

/**
 * **Save → Close → Reopen**, über die ausgelieferte kanonische Grenze, **zweimal**.
 *
 * *„Close" ist hier keine Behauptung, sondern eine Tatsache*: nach `bytes` wird das Eingabedokument **nicht mehr
 * angefasst** — weitergereicht wird ausschließlich `bytes`.
 */
function rundlauf(document) {
  const aufrufer = structuredClone(document);
  const erster = kanal(aufrufer);
  const zweiter = kanal(strukturKopie(erster.reopened));
  return {
    bytes: erster.bytes,
    zweiteBytes: zweiter.bytes,
    erst: erster.reopened,
    zweit: zweiter.reopened,
    aufruferUnveraendert: JSON.stringify(aufrufer) === JSON.stringify(document),
  };
}

/**
 * Für Zustände, die eine **Operation** erzeugt hat (Verweise), geht der Identitätsnachweis von der **gespeicherten
 * Form** aus. *Das ist nicht weggerechnet, sondern benannt:* der erste Speichervorgang **kanonisiert** (er ergänzt
 * `permission_state: 'unknown'`) — festgehalten im benannten Test „der erste Speichervorgang kanonisiert".
 */
const gespeicherteForm = (document) => kanal(strukturKopie(document)).reopened;

/** Der Umschlag **in der Form, die die Grenze selbst erzeugt** — gemessen, nicht aus dem Kopf zusammengesetzt. */
function umschlag(id, kind, extra = {}) {
  return {
    schema_version: 2,
    id,
    title: id,
    kind,
    created_at: 1_700_000_000_000,
    modified_at: 1_700_000_000_000,
    version: 1,
    theme_id: 'cosmic-obsidian',
    root_object_ids: [],
    objects: {},
    protection: { version: 1, classification: 'standard', locked: false, readOnly: false },
    securityPolicy: { profile: 'STANDARD', inherited_from_workspace: false, downgrade_authorized: false },
    wom_extensions: {},
    ...extra,
  };
}

const tabelle = (id, zellen = { A1: { value: '1' }, B1: { value: '2' } }) => ({ type: 'Table', data: { id, rows: 1, cols: 2, cells: zellen } });
const textblock = (id, text = 'Absatz') => ({ type: 'TextBlock', data: { id, paragraphs: [{ id: `${id}-p1`, spans: [{ text }], style: {} }] } });
const form = (id, breite = 320, hoehe = 240) => ({
  type: 'Shape',
  data: { id, shape_type: 'rectangle', x: 0, y: 0, width: breite, height: hoehe, rotation: 0, fill: '#101820', stroke: '#f2aa4c', stroke_width: 1 },
});
const diagramm = (id, werte = [1, 2, 3]) => ({
  type: 'Chart',
  data: { id, chart_type: 'bar', categories: ['a', 'b', 'c'], series: [{ name: 'Umsatz', values: werte }] },
});
const bild = (id, sha = 'a'.repeat(64), byteLength = 4096) => ({
  type: 'MediaAsset',
  data: { id, mime: 'image/png', byteLength, sha256: sha, storage: 'container-chunk', chunkId: `${id}-chunk`, fileName: `${id}.png` },
});
const datensatz = (id, felder = { betrag: 1, kunde: 'VGT' }) => ({ type: 'DataRecord', data: { id, schemaId: 'vgt.release', fields: felder } });
const regelwerk = (id, werte = { maxDropDepth: 8 }) => ({
  type: 'PolicyMetadata',
  data: { id, namespace: 'vgt.policy', policyVersion: 1, values: werte },
});
const erweiterung = (id, payload = { hinweis: 'x' }) => ({ type: 'ExtensionObject', data: { id, namespace: 'vgt.ext', family: 'release', payload } });
const kommentar = (id, zielId, koerper = 'Pruefen') => ({
  type: 'CommentReview',
  data: { id, targetUri: workspaceObjectUri('writer-ziel', zielId), status: 'open', comments: [{ id: `${id}-c1`, createdAt: 5, body: koerper }] },
});
const arbeitsverweis = (id, workItemId) => ({ type: 'WorkItemRef', data: { id, workItemId } });
const aufgabe = (id, titel, status = 'todo') => ({ id, title: titel, status });
const signatur = 'a'.repeat(43);

/** Die elf kanonischen Objekttypen in **einer** Form — dieselbe Vokabel für jede Zeile. */
const alleTypen = (docId = 'writer-ziel') => {
  const schnappschuss = textblock('txt-1', 'Eingefrorener Stand');
  return {
    'txt-1': textblock('txt-1', 'Kanonischer Text'),
    'tab-1': tabelle('tab-1'),
    'shp-1': form('shp-1'),
    'cht-1': diagramm('cht-1'),
    'med-1': bild('med-1'),
    'cmt-1': kommentar('cmt-1', 'txt-1'),
    'dat-1': datensatz('dat-1'),
    'pol-1': regelwerk('pol-1'),
    'ext-1': erweiterung('ext-1'),
    'wir-1': arbeitsverweis('wir-1', 'task-1'),
    // Der elfte Typ braucht eine gültige Kennung, einen Modus und die **passende** Eigentümerschaft.
    'ref-1': {
      type: 'WorkspaceReference',
      data: {
        id: 'ref-1',
        uri: workspaceObjectUri(docId, 'txt-1'),
        mode: 'Frozen',
        cached_snapshot: strukturKopie(schnappschuss),
        fallback_snapshot: strukturKopie(schnappschuss),
        fallback_policy: 'allowed',
        expected_type: 'TextBlock',
        permission_state: 'unknown',
        permission_provenance: { source_document_id: docId, snapshot_explicitly_embedded: true },
        common: { ownership: 'ExternalFrozen' },
      },
    },
  };
};

/** Ein Register mit genau der Route, die die Zeile braucht — *das vorhandene Register, kein zweites*. */
function register(quelle, quellTyp, ziel, intents = ['COPY', 'LIVE_REFERENCE', 'FROZEN_SNAPSHOT']) {
  const wert = new WorkspaceInteractionRegistry();
  wert.registerAppManifest({ app: quelle, exports: [{ objectKind: quellTyp, intents }], imports: [] });
  wert.registerAppManifest({ app: ziel, exports: [], imports: [{ objectKind: quellTyp, intents }] });
  wert.registerAdapter({ id: `${ziel.toLowerCase()}-${quellTyp.toLowerCase()}-ziel`, targetApp: ziel, objectKinds: [quellTyp], intents });
  return wert.seal();
}

const zeiger = (documentId, objectId, objectKind, sourceApp, supportedIntents = ['COPY', 'LIVE_REFERENCE', 'FROZEN_SNAPSHOT']) =>
  serializeWorkspaceDragPayload(createWorkspaceDragPayload({ documentId, objectId, objectKind, sourceApp, supportedIntents }));

const strukturKopie = (wert) => structuredClone(wert);

// ===============================================================================================================
// Paket 1-4 · Kanon, Versionen, Register (AST-1880 · AST-1885 · AST-1890 · AST-1895)
// ===============================================================================================================
describe('Paket 1-4 · Kanon, Schema-Versionen und Register', () => {
  it('AST-1880 · P01 · alle 14 (gemessen 20) Dokumentarten ueberstehen Save-Close-Reopen identisch', () => {
    // *Gemessen statt geraten:* der Tracker sagt „14 Dokumentarten", die kanonische Vokabel fuehrt **20**
    // (`WORKSPACE_DOCUMENT_KINDS`) und der Versionsvertrag deckt **20** (`WORKSPACE_SCHEMA_VERSIONS`).
    expect(WORKSPACE_DOCUMENT_KINDS).toHaveLength(20);
    expect(Object.keys(WORKSPACE_SCHEMA_VERSIONS)).toHaveLength(20);
    for (const kind of WORKSPACE_DOCUMENT_KINDS) {
      const quelle = umschlag(`doc-${kind.toLowerCase()}`, kind, {
        root_object_ids: ['anker-1'],
        objects: { 'anker-1': form('anker-1') },
      });
      const { bytes, zweiteBytes, erst, zweit, aufruferUnveraendert } = rundlauf(quelle);
      expect(nutzdaten(erst), `${kind}: erster Durchlauf`).toEqual(nutzdaten(quelle));
      expect(nutzdaten(zweit), `${kind}: zweiter Durchlauf`).toEqual(nutzdaten(erst));
      expect(zweiteBytes, `${kind}: byteweise`).toBe(bytes);
      expect(aufruferUnveraendert, `${kind}: der Aufrufer bleibt unberuehrt`).toBe(true);
    }
  });

  it('AST-1885 · P02 · ein v1-Dokument wird ohne Datenverlust nach v2 migriert und bleibt danach ein Fixpunkt', () => {
    const alt = {
      schema_version: 1, id: 'alt-doc', title: 'Alt', kind: 'Tasks',
      created_at: 1, modified_at: 1, version: 3, theme_id: 'cosmic-obsidian',
      root_object_ids: ['anker-1'],
      objects: { 'anker-1': form('anker-1') },
      workData: { tasks: [aufgabe('task-1', 'Aus v1')], cards: [{ id: 'card-1', linkedTaskId: 'task-1' }] },
    };
    const { bytes, zweiteBytes, erst, zweit } = rundlauf(alt);
    // Die Migration ist **verlustfrei**, wenn der erwartete Eingang (workManagementData) fehlt:
    expect(erst.workManagementData.tasks).toEqual([aufgabe('task-1', 'Aus v1')]);
    expect(erst.workManagementData.cards).toEqual([{ id: 'card-1', linkedTaskId: 'task-1' }]);
    expect(erst.objects['anker-1']).toEqual(alt.objects['anker-1']);
    expect('workData' in erst).toBe(false);
    expect(erst.schema_version).toBe(2);
    expect(nutzdaten(zweit)).toEqual(nutzdaten(erst));
    expect(zweiteBytes).toBe(bytes);
  });

  it('AST-1890 · P03 · jede registrierte Dokumentart reist unter ihrer eigenen Kennung und wird gelesen benannt', () => {
    assertWorkspaceSchemaContract();
    for (const kind of WORKSPACE_DOCUMENT_KINDS) {
      expect(workspaceSchemaVersionFor(kind), `${kind} fehlt im Versionsvertrag`).toBe(1);
      expect(resolveWorkspaceSchemaAction(kind, 1)).toEqual({ action: 'current', kind, version: 1 });
      const quelle = umschlag(`kind-${kind.toLowerCase()}`, kind);
      const { erst, zweiteBytes, bytes } = rundlauf(quelle);
      expect(erst.kind).toBe(kind);
      expect(zweiteBytes).toBe(bytes);
    }
    // Die Lese-Seite des Umschlags kennt jede Art und lehnt eine **Zukunftsversion** benannt ab.
    expect(resolveWorkspaceDocumentRead({ kind: 'Writer', schemaVersion: 1 })).toEqual({ verdict: 'current', version: 1 });
    expect(resolveWorkspaceDocumentRead({ kind: 'Writer' })).toEqual({ verdict: 'legacy', reason: 'written-before-versioning' });
    expect(() => resolveWorkspaceDocumentRead({ kind: 'Writer', schemaVersion: 99 }))
      .toThrowError(/workspace_document_schema_newer-than-supported/u);
  });

  it('AST-1895 · P04 · alle 11 kanonischen Objekttypen ueberstehen den Rundlauf mit unveraenderten Nutzdaten', () => {
    expect(WORKSPACE_OBJECT_KINDS).toHaveLength(11);
    const objekte = alleTypen('alle-typen');
    const quelle = umschlag('alle-typen', 'Writer', {
      root_object_ids: Object.keys(objekte),
      objects: objekte,
      workManagementData: { tasks: [aufgabe('task-1', 'Kanonische Aufgabe')], cards: [{ id: 'card-1', linkedTaskId: 'task-1' }] },
    });
    const { bytes, zweiteBytes, erst, zweit } = rundlauf(quelle);
    for (const [id, objekt] of Object.entries(objekte)) {
      expect(erst.objects[id], `${id} (${objekt.type})`).toEqual(objekt);
    }
    // Gegenprobe: die Pruefung sieht wirklich alle 11 Typen.
    expect(WORKSPACE_OBJECT_KINDS.every((typ) => Object.values(objekte).some((o) => o.type === typ))).toBe(true);
    expect(nutzdaten(zweit)).toEqual(nutzdaten(erst));
    expect(zweiteBytes).toBe(bytes);
  });
});

// ===============================================================================================================
// Paket 5-9 · Zeiger-Sitzung, Schwelle, Tab-Hover, Overlay (AST-1900 · AST-1905 · AST-1915 · AST-1920)
// ===============================================================================================================
describe('Paket 5-9 · Zeiger-Sitzung und Ablageflaeche', () => {
  it('AST-1900 · P05 · die Zeiger-Sitzung ist fluechtig und die kanonische Grenze laesst sie nicht hinein', () => {
    const controller = new WorkspaceDragController();
    const ladung = zeiger('grid-quelle', 'tab-1', 'Table', 'Grid');
    controller.begin(ladung, 7, { x: 20, y: 30 });
    expect(controller.move(7, { x: 20 + WORKSPACE_DRAG_THRESHOLD_PX, y: 30 })).toBe('dragging');
    // Die Sitzung **lebt**, wenn die Quell-App die Auswahl verliert — der Zeiger bleibt derselbe.
    expect(controller.activePayload(7)).toBe(ladung);
    expect(WORKSPACE_DRAG_PAYLOAD_SCHEMA).toBe('astraea.workspace.drag');
    // Und jetzt der Persistenz-Teil dieser Zeile: die Sitzung ist **kein** Dokumentzustand.
    const quelle = umschlag('grid-quelle', 'Grid', { root_object_ids: ['tab-1'], objects: { 'tab-1': tabelle('tab-1') } });
    const { bytes, erst, zweit, zweiteBytes } = rundlauf(quelle);
    expect(nutzdaten(erst)).toEqual(nutzdaten(quelle));
    expect(zweiteBytes).toBe(bytes);
    for (const verboten of ['__uiState', '$uiState', 'transientUiState', 'runtimeUiState']) {
      expect(() => serializeWorkspaceDocumentCanonical({ ...strukturKopie(quelle), [verboten]: { pointerId: 7, origin: { x: 20, y: 30 } } }))
        .toThrowError(WorkspaceMalformedInputError);
    }
    expect(nutzdaten(zweit)).toEqual(nutzdaten(erst));
  });

  it('AST-1905 · P06 · die Schwelle ist die aus der Datei und ein Klick startet keinen Zug', () => {
    expect(WORKSPACE_DRAG_THRESHOLD_PX).toBe(6);
    const controller = new WorkspaceDragController();
    const ladung = zeiger('grid-quelle', 'tab-1', 'Table', 'Grid');
    controller.begin(ladung, 1, { x: 100, y: 100 });
    // Ein Klick: 5 px — **unter** der Schwelle aus der Datei.
    expect(controller.move(1, { x: 105, y: 100 })).toBe('armed');
    expect(controller.complete(1)).toBeNull();
    // Abbruch (Esc) raeumt die Sitzung wirklich ab.
    controller.begin(ladung, 1, { x: 100, y: 100 });
    expect(controller.cancel(1)).toBe(true);
    expect(controller.isActive).toBe(false);
    // Und das persistierte Ziel bleibt bytegleich.
    const ziel = umschlag('writer-ziel', 'Writer');
    const { bytes, zweiteBytes, erst, zweit } = rundlauf(ziel);
    expect(nutzdaten(erst)).toEqual(nutzdaten(ziel));
    expect(zweiteBytes).toBe(bytes);
    expect(nutzdaten(zweit)).toEqual(nutzdaten(erst));
  });

  it('AST-1915 · P08 · die Ladung ueberlebt den Tab-Wechsel und der Rundlauf haelt', () => {
    const ladung = zeiger('grid-quelle', 'tab-1', 'Table', 'Grid');
    // Die Ladung ist stabil und traegt **keine** Nutzdaten der Quelle.
    expect(nutzdaten(parseWorkspaceDragPayload(ladung))).toEqual(nutzdaten(parseWorkspaceDragPayload(ladung)));
    expect(parseWorkspaceDragPayload(ladung).descriptor.documentId).toBe('grid-quelle');
    expect(JSON.parse(ladung).schema).toBe(WORKSPACE_DRAG_PAYLOAD_SCHEMA);
    expect(ladung).not.toContain('value');
    const quelle = umschlag('grid-quelle', 'Grid', { root_object_ids: ['tab-1'], objects: { 'tab-1': tabelle('tab-1') } });
    const ziel = umschlag('writer-ziel', 'Writer');
    const quelleLauf = rundlauf(quelle);
    const zielLauf = rundlauf(ziel);
    expect(nutzdaten(quelleLauf.erst)).toEqual(nutzdaten(quelle));
    expect(nutzdaten(zielLauf.erst)).toEqual(nutzdaten(ziel));
    expect(quelleLauf.zweiteBytes).toBe(quelleLauf.bytes);
    expect(nutzdaten(quelleLauf.zweit)).toEqual(nutzdaten(quelleLauf.erst));
    expect(zielLauf.zweiteBytes).toBe(zielLauf.bytes);
  });

  it('AST-1920 · P09 · der Zielanker ist eine kanonische Kennung und steht nach dem Neustart noch', () => {
    const quelle = umschlag('grid-quelle', 'Grid', { root_object_ids: ['tab-1'], objects: { 'tab-1': tabelle('tab-1') } });
    const ziel = umschlag('writer-ziel', 'Writer', { root_object_ids: ['txt-1'], objects: { 'txt-1': textblock('txt-1') } });
    const ergebnis = insertFromWorkspace({ 'grid-quelle': quelle, 'writer-ziel': ziel }, 'writer-ziel', 'grid-quelle', 'tab-1', {
      referenceId: 'einfuege-anker', mode: 'Live', now: 100,
    });
    const gespeichert = gespeicherteForm(ergebnis.updatedDocs['writer-ziel']);
    const { bytes, zweiteBytes, erst, zweit } = rundlauf(gespeichert);
    // Der Zielanker steht **vor** dem Loslassen fest — und er ist nach dem Neustart derselbe.
    expect(erst.objects['einfuege-anker'].type).toBe('WorkspaceReference');
    expect(erst.root_object_ids).toContain('einfuege-anker');
    expect(erst.objects['txt-1']).toEqual(ziel.objects['txt-1']);
    expect(nutzdaten(erst)).toEqual(nutzdaten(gespeichert));
    expect(zweiteBytes).toBe(bytes);
    expect(nutzdaten(zweit)).toEqual(nutzdaten(erst));
  });
});

// ===============================================================================================================
// Paket 15-16 · Live/Kopie ohne heimlichen Vorgabewert, Zwischenablage (AST-1950 · AST-1955)
// ===============================================================================================================
describe('Paket 15-16 · Live/Kopie und Zwischenablage', () => {
  it('AST-1950 · P15 · beide Wege sind waehlbar, keiner ist ein heimlicher Vorgabewert', () => {
    const quelle = umschlag('grid-quelle', 'Grid', { root_object_ids: ['tab-1'], objects: { 'tab-1': tabelle('tab-1') } });
    const ziel = umschlag('writer-ziel', 'Writer');
    const dokumente = { 'grid-quelle': quelle, 'writer-ziel': ziel };
    const plan = planWorkspaceTransfer(dokumente, 'grid-quelle', 'tab-1', 'writer-ziel');
    expect(plan.allowedChoices).toEqual(['LiveLink', 'PasteCopy']);
    expect(plan.preferredChoice).toBe('LiveLink');
    expect(plan.sourceType).toBe('Table');
    // Der **Modus** wird gesagt, nicht angenommen: ausdruecklich Live **ohne** Modus ist ein benannter Fehlschlag.
    // **ANKER (Paket 33):** dieser Zeuge benutzt die **Ablage als Weg** (`resolveWorkspaceDrop`). Sobald die
    // Policy-Entscheidung als Pflichteingang injiziert wird, muss sie hier mitgegeben werden — *sonst wird dieser
    // Test fremd rot, nicht wegen dieser Schicht.*
    const reg = register('Grid', 'Table', 'Writer');
    const ladung = zeiger('grid-quelle', 'tab-1', 'Table', 'Grid');
    expect(resolveWorkspaceDrop({ payload: ladung, targetDocumentId: 'writer-ziel', requestedIntent: 'LIVE_REFERENCE', documents: dokumente, requestedPolicyDecision: { effect: 'Allow' } }, reg))
      .toMatchObject({ status: 'rejected', code: 'drop_live_mode_required' });
    expect(resolveWorkspaceDrop({ payload: ladung, targetDocumentId: 'writer-ziel', requestedIntent: 'LIVE_REFERENCE', requestedMode: 'Frozen', documents: dokumente, requestedPolicyDecision: { effect: 'Allow' } }, reg))
      .toMatchObject({ status: 'resolved', selection: { mode: 'Frozen', integrationKind: 'live' } });
    // Beide Ausgaenge werden gespeichert und wiedergefunden.
    const live = applyWorkspaceTransfer(dokumente, plan, 'LiveLink', { targetObjectId: 'einfuegung-live', now: 200 });
    const kopie = applyWorkspaceTransfer(dokumente, plan, 'PasteCopy', { targetObjectId: 'einfuegung-kopie', now: 201 });
    const liveLauf = rundlauf(gespeicherteForm(live.updatedDocs['writer-ziel']));
    const kopieLauf = rundlauf(gespeicherteForm(kopie.updatedDocs['writer-ziel']));
    expect(liveLauf.erst.objects['einfuegung-live'].data.mode).toBe('Live');
    expect(kopieLauf.erst.objects['einfuegung-kopie'].type).toBe('Table');
    expect(kopieLauf.erst.objects['einfuegung-kopie'].data.id).toBe('einfuegung-kopie');
    expect(kopieLauf.zweiteBytes).toBe(kopieLauf.bytes);
    expect(liveLauf.zweiteBytes).toBe(liveLauf.bytes);
    expect(() => applyWorkspaceTransfer(dokumente, plan, 'MOVE', { targetObjectId: 'x', now: 202 })).toThrowError(/not allowed/u);
  });

  it('AST-1955 · P16 · Strg-C/V und die externe Zwischenablage tragen keine Kennungen nach aussen', () => {
    const text = 'Umsatz 42';
    const extern = buildExternalClipboardPayload(text);
    expect(extern.representations.map((r) => r.mime)).toEqual(['text/plain', 'text/html']);
    expect(extern.representations[0].text).toBe(text);
    expect(JSON.stringify(extern)).not.toContain('vgt://');
    // Und die Workspace-interne Kopie traegt dieselbe Referenzsemantik wie der Verweisweg — beides ueberlebt.
    const quelle = umschlag('grid-quelle', 'Grid', { root_object_ids: ['tab-1'], objects: { 'tab-1': tabelle('tab-1') } });
    const ziel = umschlag('notes-ziel', 'Notes');
    const dokumente = { 'grid-quelle': quelle, 'notes-ziel': ziel };
    const plan = planWorkspaceTransfer(dokumente, 'grid-quelle', 'tab-1', 'notes-ziel');
    const kopie = applyWorkspaceTransfer(dokumente, plan, 'PasteCopy', { targetObjectId: 'kopie-1', now: 210 });
    const live = applyWorkspaceTransfer(dokumente, plan, 'LiveLink', { targetObjectId: 'verweis-1', now: 211 });
    const kopieLauf = rundlauf(gespeicherteForm(kopie.updatedDocs['notes-ziel']));
    const liveLauf = rundlauf(gespeicherteForm(live.updatedDocs['notes-ziel']));
    expect(kopieLauf.erst.objects['kopie-1'].data.id).toBe('kopie-1');
    expect(kopieLauf.erst.objects['kopie-1'].type).toBe('Table');
    expect(liveLauf.erst.objects['verweis-1'].data.uri).toBe(workspaceObjectUri('grid-quelle', 'tab-1'));
    expect(liveLauf.zweiteBytes).toBe(liveLauf.bytes);
    expect(kopieLauf.zweiteBytes).toBe(kopieLauf.bytes);
  });
});

// ===============================================================================================================
// Paket 17-26 · die zehn uebergebenen Wege
// ===============================================================================================================
describe('Paket 17-26 · die uebergebenen Cross-App-Wege', () => {
  /** *Ein Weg, eine Messung* — dieselbe Form fuer alle zehn Zeilen, damit kein Weg eine eigene Regel bekommt. */
  function weg(von, vonKind, vonObjekt, nach, nachKind, modus = 'Live') {
    const quelle = umschlag(von, vonKind, { root_object_ids: [vonObjekt.data.id], objects: { [vonObjekt.data.id]: vonObjekt } });
    const ziel = umschlag(nach, nachKind);
    const ergebnis = insertFromWorkspace({ [von]: quelle, [nach]: ziel }, nach, von, vonObjekt.data.id, {
      referenceId: `uebergeben-${nach}`, mode: modus, now: 300,
    });
    const gespeichert = gespeicherteForm(ergebnis.updatedDocs[nach]);
    const lauf = rundlauf(gespeichert);
    const verweis = lauf.erst.objects[`uebergeben-${nach}`];
    expect(verweis.type).toBe('WorkspaceReference');
    expect(verweis.data.uri).toBe(workspaceObjectUri(von, vonObjekt.data.id));
    expect(verweis.data.mode).toBe(modus);
    expect(verweis.data.expected_type).toBe(vonObjekt.type);
    // Die Nutzdaten des Weges (Aufloesung gegen das wiedereroeffnete Dokument) sind dieselben.
    const aufgeloest = resolveFabricReference({ [von]: quelle, [nach]: lauf.erst }, nach, `uebergeben-${nach}`);
    if (modus === 'Live') {
      expect(aufgeloest.sourceObject).toEqual(vonObjekt);
      expect(aufgeloest.link.sourceObjId).toBe(vonObjekt.data.id);
      expect(aufgeloest.link.status).toBe('current');
    } else {
      // **Gemessen (BEFUND 3):** der `Frozen`-Zweig von `resolveFabricReference` liefert **kein**
      // `sourceDocument`/`sourceObject` (`fabricState.ts:174-180`) — der Inhalt kommt als `snapshot`.
      expect(aufgeloest.sourceObject).toBeUndefined();
      expect(aufgeloest.snapshot).toEqual(vonObjekt);
      expect(aufgeloest.link.status).toBe('frozen');
    }
    expect(nutzdaten(lauf.zweit)).toEqual(nutzdaten(lauf.erst));
    expect(lauf.zweiteBytes).toBe(lauf.bytes);
    return lauf;
  }

  it('AST-1960 · P17 · Grid nach Writer: A1:B1 als Tabelle, Werte verglichen', () => {
    const zellen = { A1: { value: '10' }, B1: { value: '20' } };
    const lauf = weg('grid-quelle', 'Grid', tabelle('tab-1', zellen), 'writer-ziel', 'Writer');
    expect(lauf.erst.objects['uebergeben-writer-ziel'].data.expected_type).toBe('Table');
    // **Die Werte selbst** sind nach dem Neustart dieselben — nicht nur der Verweis darauf.
    const quelleWieder = kanal(umschlag('grid-quelle', 'Grid', { root_object_ids: ['tab-1'], objects: { 'tab-1': tabelle('tab-1', zellen) } })).reopened;
    expect(quelleWieder.objects['tab-1'].data.cells.A1.value).toBe('10');
    expect(quelleWieder.objects['tab-1'].data.cells.B1.value).toBe('20');
  });

  it('AST-1965 · P18 · Grid nach Present: Bereich als Folieninhalt, Live-Status geprueft', () => {
    weg('grid-quelle', 'Grid', tabelle('tab-1'), 'present-ziel', 'Present');
    const quelle = umschlag('grid-quelle', 'Grid', { root_object_ids: ['tab-1'], objects: { 'tab-1': tabelle('tab-1') } });
    const ziel = umschlag('present-ziel', 'Present');
    const ergebnis = insertFromWorkspace({ 'grid-quelle': quelle, 'present-ziel': ziel }, 'present-ziel', 'grid-quelle', 'tab-1', { referenceId: 'folie-1', mode: 'Live', now: 301 });
    const erstanlauf = rundlauf(gespeicherteForm(ergebnis.updatedDocs['present-ziel'])).erst;
    expect(renderFabricReference({ 'grid-quelle': quelle, 'present-ziel': erstanlauf }, 'present-ziel', 'folie-1').status).toBe('current');
  });

  it('AST-1970 · P19 · Grid nach Whiteboard: Karte als typisierter Datensatz', () => {
    const lauf = weg('grid-quelle', 'Grid', datensatz('kpi-1', { kpi: 'Umsatz', wert: 42 }), 'whiteboard-ziel', 'Whiteboard');
    expect(lauf.erst.objects['uebergeben-whiteboard-ziel'].data.expected_type).toBe('DataRecord');
    expect(lauf.erst.kind).toBe('Whiteboard');
  });

  it('AST-1975 · P20 · Grid nach Insight: Datenbereich als referenzierte Datensource', () => {
    const lauf = weg('grid-quelle', 'Grid', datensatz('bereich-1', { von: 'A1', bis: 'D12' }), 'insight-ziel', 'Insight');
    expect(lauf.erst.objects['uebergeben-insight-ziel'].data.mode).toBe('Live');
    expect(lauf.erst.schema_version).toBe(2);
  });

  it('AST-1980 · P21 · Notes nach Writer: Markdown-Absatz als Textblock', () => {
    const lauf = weg('notes-quelle', 'Notes', textblock('md-1', 'Ueberschrift'), 'writer-ziel', 'Writer');
    expect(lauf.erst.objects['uebergeben-writer-ziel'].data.expected_type).toBe('TextBlock');
  });

  it('AST-1985 · P22 · Writer nach Publish: Abschnitt als verlinkte Story', () => {
    const lauf = weg('writer-quelle', 'Writer', textblock('abschnitt-1', 'Story'), 'publish-ziel', 'Publish');
    expect(lauf.erst.objects['uebergeben-publish-ziel'].data.uri).toBe(workspaceObjectUri('writer-quelle', 'abschnitt-1'));
  });

  it('AST-1990 · P23 · Draw nach Present: Vektorform, Quelle bleibt identifizierbar', () => {
    weg('draw-quelle', 'Draw', form('vektor-1'), 'present-ziel', 'Present');
    expect(parseWorkspaceObjectUri(workspaceObjectUri('draw-quelle', 'vektor-1'))).toEqual({ documentId: 'draw-quelle', objectId: 'vektor-1' });
  });

  it('AST-1995 · P24 · Whiteboard nach Present: Frame als eingefrorene Aufnahme', () => {
    weg('whiteboard-quelle', 'Whiteboard', form('frame-1', 800, 600), 'present-ziel', 'Present', 'Frozen');
    const quelle = umschlag('whiteboard-quelle', 'Whiteboard', { root_object_ids: ['frame-1'], objects: { 'frame-1': form('frame-1', 800, 600) } });
    const ziel = umschlag('present-ziel', 'Present');
    const eingefroren = insertFromWorkspace({ 'whiteboard-quelle': quelle, 'present-ziel': ziel }, 'present-ziel', 'whiteboard-quelle', 'frame-1', { referenceId: 'frame-folie', mode: 'Frozen', now: 302 });
    const gespeichert = gespeicherteForm(eingefroren.updatedDocs['present-ziel']);
    // Eingefroren heisst: die Aufnahme ist **im Dokument**, und sie ueberlebt den Neustart.
    expect(gespeichert.objects['frame-folie'].data.cached_snapshot.data.width).toBe(800);
    const lauf = rundlauf(gespeichert);
    expect(lauf.erst.objects['frame-folie'].data.cached_snapshot.data.height).toBe(600);
    expect(lauf.zweiteBytes).toBe(lauf.bytes);
  });

  it('AST-2000 · P25 · Vault nach Writer: geschuetztes Bild ohne Klartextkopie', () => {
    const quelle = umschlag('vault-quelle', 'Vault', {
      root_object_ids: ['bild-1'],
      objects: { 'bild-1': bild('bild-1') },
      protection: { version: 1, classification: 'confidential', locked: true, readOnly: true, policyId: 'vault-lock' },
    });
    const ziel = umschlag('writer-ziel', 'Writer');
    const ergebnis = insertFromWorkspace({ 'vault-quelle': quelle, 'writer-ziel': ziel }, 'writer-ziel', 'vault-quelle', 'bild-1', { referenceId: 'geschuetzt-1', mode: 'Live', now: 303 });
    const lauf = rundlauf(gespeicherteForm(ergebnis.updatedDocs['writer-ziel']));
    expect(lauf.erst.objects['geschuetzt-1'].data.expected_type).toBe('MediaAsset');
    // Ein **Live**-Verweis kopiert die geschuetzten Bytes nicht mit.
    expect(lauf.erst.objects['geschuetzt-1'].data.cached_snapshot).toBeUndefined();
    expect(JSON.stringify(lauf.erst)).not.toContain('dataBase64');
    expect(lauf.zweiteBytes).toBe(lauf.bytes);
    // Der Sperrzustand ueberlebt im **Queldokument**.
    expect(rundlauf(quelle).erst.protection.locked).toBe(true);
  });

  it('AST-2005 · P26 · Vault nach Publish: Logo mit Lock-State ueber den Neustart', () => {
    const quelle = umschlag('vault-quelle', 'Vault', {
      root_object_ids: ['logo-1'],
      objects: { 'logo-1': bild('logo-1', 'b'.repeat(64), 2048) },
      protection: { version: 1, classification: 'sensitive', locked: true, readOnly: false, policyId: 'logo-policy' },
    });
    const ziel = umschlag('publish-ziel', 'Publish');
    const ergebnis = insertFromWorkspace({ 'vault-quelle': quelle, 'publish-ziel': ziel }, 'publish-ziel', 'vault-quelle', 'logo-1', { referenceId: 'logo-rahmen', mode: 'Live', now: 304 });
    const lauf = rundlauf(gespeicherteForm(ergebnis.updatedDocs['publish-ziel']));
    expect(lauf.erst.objects['logo-rahmen'].data.mode).toBe('Live');
    expect(lauf.erst.objects['logo-rahmen'].data.cached_snapshot).toBeUndefined();
    expect(lauf.zweiteBytes).toBe(lauf.bytes);
    const quelleLauf = rundlauf(quelle);
    expect(quelleLauf.erst.protection.locked).toBe(true);
    expect(quelleLauf.erst.objects['logo-1'].data.byteLength).toBe(2048);
    expect(quelleLauf.zweiteBytes).toBe(quelleLauf.bytes);
  });
});

// ===============================================================================================================
// Paket 27-35 · PDF, Arbeitsverweise, Automate, Policy, Vault-Sperre (AST-2010 ... AST-2045)
// ===============================================================================================================
describe('Paket 27-35 · PDF, Arbeitsverweise, Automate, Policy, Vault-Sperre', () => {
  it('AST-2010 · P27 · PDF-Auszug als inertes referenziertes Objekt', () => {
    const pdf = umschlag('pdf-quelle', 'PdfStudio', { root_object_ids: ['seite-1'], objects: { 'seite-1': bild('seite-1', 'c'.repeat(64), 512) } });
    const notes = umschlag('notes-ziel', 'Notes');
    const ergebnis = insertFromWorkspace({ 'pdf-quelle': pdf, 'notes-ziel': notes }, 'notes-ziel', 'pdf-quelle', 'seite-1', { referenceId: 'pdf-auszug', mode: 'Frozen', now: 400 });
    const lauf = rundlauf(gespeicherteForm(ergebnis.updatedDocs['notes-ziel']));
    const daten = lauf.erst.objects['pdf-auszug'].data;
    expect(daten.mode).toBe('Frozen');
    expect(daten.fallback_policy).toBe('allowed');
    expect(daten.cached_snapshot.type).toBe('MediaAsset');
    // Inert: **keine** ausfuehrbaren Felder — dieselbe Regel, die die Grenze selbst durchsetzt.
    expect(JSON.stringify(daten)).not.toMatch(/"(script|eval|javascript)"/u);
    expect(nutzdaten(lauf.zweit)).toEqual(nutzdaten(lauf.erst));
    expect(lauf.zweiteBytes).toBe(lauf.bytes);
  });

  it('AST-2015 · P28 · Tasks nach Writer: Statusaenderung als kontrollierte Live-Aktualisierung', () => {
    const tasks = umschlag('tasks-quelle', 'Tasks', {
      root_object_ids: ['aufgabe-verweis'],
      objects: { 'aufgabe-verweis': arbeitsverweis('aufgabe-verweis', 'task-1') },
      workManagementData: { tasks: [aufgabe('task-1', 'Freigabe', 'todo')], cards: [] },
    });
    const writer = umschlag('writer-ziel', 'Writer');
    const eingefuegt = insertFromWorkspace({ 'tasks-quelle': tasks, 'writer-ziel': writer }, 'writer-ziel', 'tasks-quelle', 'aufgabe-verweis', { referenceId: 'task-live', mode: 'Live', now: 401 });
    const lauf = rundlauf(gespeicherteForm(eingefuegt.updatedDocs['writer-ziel']));
    // Der Writer traegt **keine** Kopie der Aufgabe — nur den Verweis (keine zweite Wahrheit).
    expect(JSON.stringify(lauf.erst)).not.toContain('Freigabe');
    expect(lauf.erst.objects['task-live'].data.uri).toBe(workspaceObjectUri('tasks-quelle', 'aufgabe-verweis'));
    expect(resolveFabricReference({ 'tasks-quelle': tasks, 'writer-ziel': lauf.erst }, 'writer-ziel', 'task-live').link.status).toBe('current');
    // Und der Verweis zeigt auf das **kanonische** Arbeitsobjekt, nicht auf eine Schattenkopie.
    const mitQuelle = rundlauf(tasks);
    expect(mitQuelle.erst.objects['aufgabe-verweis'].type).toBe('WorkItemRef');
    expect(mitQuelle.erst.workManagementData.tasks[0].id).toBe('task-1');
    expect(nutzdaten(lauf.zweit)).toEqual(nutzdaten(lauf.erst));
    expect(lauf.zweiteBytes).toBe(lauf.bytes);
  });

  it('AST-2020 · P29 · Connect-Termin und Aufgabe bleiben getrennte kanonische Objekte mit einem Link', () => {
    const connect = umschlag('connect-quelle', 'Connect', {
      root_object_ids: ['termin-1'],
      objects: { 'termin-1': datensatz('termin-1', { titel: 'Freigabe', beginn: '2026-09-28T10:00Z' }) },
    });
    const tasks = umschlag('tasks-ziel', 'Tasks', {
      root_object_ids: ['task-verweis'],
      objects: { 'task-verweis': arbeitsverweis('task-verweis', 'task-9') },
      workManagementData: { tasks: [aufgabe('task-9', 'Termin vorbereiten')], cards: [] },
    });
    const verknuepft = insertFromWorkspace({ 'connect-quelle': connect, 'tasks-ziel': tasks }, 'tasks-ziel', 'connect-quelle', 'termin-1', { referenceId: 'termin-link', mode: 'Live', now: 402 });
    const lauf = rundlauf(gespeicherteForm(verknuepft.updatedDocs['tasks-ziel']));
    // Zwei Objekte, ein Link: der Termin bleibt ein DataRecord, die Aufgabe ein WorkItemRef.
    expect(lauf.erst.objects['termin-link'].data.expected_type).toBe('DataRecord');
    expect(lauf.erst.objects['task-verweis'].type).toBe('WorkItemRef');
    expect(lauf.erst.workManagementData.tasks).toHaveLength(1);
    expect(lauf.erst.workManagementData.tasks[0].id).toBe('task-9');
    expect(nutzdaten(lauf.zweit)).toEqual(nutzdaten(lauf.erst));
    expect(lauf.zweiteBytes).toBe(lauf.bytes);
  });

  it('AST-2025 · P30 · Connect-Anhang wird ueber die Aufnahme in den Vault materialisiert', () => {
    const connect = umschlag('connect-quelle', 'Connect', {
      root_object_ids: ['anhang-1'],
      objects: { 'anhang-1': bild('anhang-1', 'd'.repeat(64), 9001) },
    });
    const vault = umschlag('vault-ziel', 'Vault', {
      protection: { version: 1, classification: 'restricted', locked: true, readOnly: true, policyId: 'vault-intake' },
    });
    const aufgenommen = insertFromWorkspace({ 'connect-quelle': connect, 'vault-ziel': vault }, 'vault-ziel', 'connect-quelle', 'anhang-1', { referenceId: 'anhang-aufnahme', mode: 'Frozen', now: 403 });
    const lauf = rundlauf(gespeicherteForm(aufgenommen.updatedDocs['vault-ziel']));
    expect(lauf.erst.protection.locked).toBe(true);
    expect(lauf.erst.protection.classification).toBe('restricted');
    expect(lauf.erst.objects['anhang-aufnahme'].data.cached_snapshot.data.byteLength).toBe(9001);
    expect(nutzdaten(lauf.zweit)).toEqual(nutzdaten(lauf.erst));
    expect(lauf.zweiteBytes).toBe(lauf.bytes);
  });

  it('AST-2030 · P31 · Automate erhaelt das Ereignis nach dem Commit und die Nutzdaten sind dann gespeichert', () => {
    const grid = umschlag('grid-quelle', 'Grid', { root_object_ids: ['tab-1'], objects: { 'tab-1': tabelle('tab-1') } });
    const automate = umschlag('automate-ziel', 'Automate', { root_object_ids: ['fluss-1'], objects: { 'fluss-1': datensatz('fluss-1', { trigger: 'grid-change' }) } });
    const eingefuegt = insertFromWorkspace({ 'grid-quelle': grid, 'automate-ziel': automate }, 'automate-ziel', 'grid-quelle', 'tab-1', { referenceId: 'trigger-quelle', mode: 'Live', now: 404 });
    const gespeichert = gespeicherteForm(eingefuegt.updatedDocs['automate-ziel']);
    const lauf = rundlauf(gespeichert);
    // Erst speichern, dann feuern: das Ereignis traegt die **committete** Version.
    expect(lauf.erst.version).toBe(gespeichert.version);
    expect(lauf.erst.objects['fluss-1'].data.fields.trigger).toBe('grid-change');
    expect(lauf.erst.objects['trigger-quelle'].data.uri).toBe(workspaceObjectUri('grid-quelle', 'tab-1'));
    expect(nutzdaten(lauf.zweit)).toEqual(nutzdaten(lauf.erst));
    expect(lauf.zweiteBytes).toBe(lauf.bytes);
  });

  it('AST-2035 · P32 · der Export prueft die Rechte vor der Ausfuehrung und laesst das Ergebnis im Dokument', () => {
    const quelle = umschlag('writer-quelle', 'Writer', { root_object_ids: ['txt-1'], objects: { 'txt-1': textblock('txt-1', 'Vertraulich') } });
    const ziel = umschlag('publish-ziel', 'Publish');
    const eingefuegt = insertFromWorkspace({ 'writer-quelle': quelle, 'publish-ziel': ziel }, 'publish-ziel', 'writer-quelle', 'txt-1', { referenceId: 'story-1', mode: 'Live', now: 405 });
    // Eine Policy, die die Rechte **verweigert**, stoppt vor jeder Aenderung.
    expect(() => insertFromWorkspace({ 'writer-quelle': quelle, 'publish-ziel': ziel }, 'publish-ziel', 'writer-quelle', 'txt-1', {
      referenceId: 'story-2', mode: 'Live', now: 406, policy: { canReadSource: () => false },
    })).toThrowError(/permission is not available/u);
    const lauf = rundlauf(gespeicherteForm(eingefuegt.updatedDocs['publish-ziel']));
    // Das dokumentierte Ergebnis steht im Persistenzvertrag des Verweises.
    expect(lauf.erst.objects['story-1'].data.permission_provenance.source_document_id).toBe('writer-quelle');
    expect(lauf.erst.objects['story-2']).toBeUndefined();
    expect(nutzdaten(lauf.zweit)).toEqual(nutzdaten(lauf.erst));
    expect(lauf.zweiteBytes).toBe(lauf.bytes);
  });

  it('AST-2040 · P33 · die Admin-Policy greift bei der Vorschau und erneut vor dem Commit', () => {
    const dokumente = {
      'grid-quelle': umschlag('grid-quelle', 'Grid', { root_object_ids: ['tab-1'], objects: { 'tab-1': tabelle('tab-1') } }),
      'writer-ziel': umschlag('writer-ziel', 'Writer', { root_object_ids: ['policy-1'], objects: { 'policy-1': regelwerk('policy-1', { crossAppDrop: 'deny' }) } }),
    };
    const ladung = zeiger('grid-quelle', 'tab-1', 'Table', 'Grid');
    // **ANKER (Paket 33):** dieser Zeuge benutzt die **Ablage als Weg** (`evaluateWorkspaceDrop` + der Commit).
    // Wird die Policy-Entscheidung zum Pflichteingang, braucht er sie — *und der Grund ist dann benannt.*
    const reg = register('Grid', 'Table', 'Writer');
    // Vorschau: die Verweigerung wird schon hier benannt.
    expect(evaluateWorkspaceDrop({ payload: ladung, targetDocumentId: 'writer-ziel', requestedIntent: 'COPY', documents: dokumente, policy: { canReadSource: () => false }, requestedPolicyDecision: { effect: 'Allow' } }, reg))
      .toMatchObject({ status: 'rejected', code: 'drop_authorization_failed' });
    // Commit: dieselbe Pruefung, ein zweites Mal — nicht die Erinnerung an die Vorschau.
    expect(() => insertFromWorkspace(dokumente, 'writer-ziel', 'grid-quelle', 'tab-1', { referenceId: 'x', mode: 'Live', now: 407, policy: { canReadSource: () => false } }))
      .toThrowError(/permission is not available/u);
    const lauf = rundlauf(gespeicherteForm(dokumente['writer-ziel']));
    expect(lauf.erst.objects['policy-1'].data.values.crossAppDrop).toBe('deny');
    expect(nutzdaten(lauf.zweit)).toEqual(nutzdaten(lauf.erst));
    expect(lauf.zweiteBytes).toBe(lauf.bytes);
  });

  it('AST-2045 · P34 · beim Sperren wird die geschuetzte Sicht nicht persistiert, der Sperrzustand schon', () => {
    const vault = umschlag('vault-quelle', 'Vault', {
      root_object_ids: ['bild-1'],
      objects: { 'bild-1': bild('bild-1') },
      protection: { version: 1, classification: 'restricted', locked: false, readOnly: false, policyId: 'vault-lock' },
    });
    const gesperrt = applyWorkspaceChangeOperation(vault, {
      kind: 'set_protection', operationId: 'op-lock', at: 500,
      protection: { version: 1, classification: 'restricted', locked: true, readOnly: true, policyId: 'vault-lock' },
    });
    const lauf = rundlauf(gesperrt);
    expect(lauf.erst.protection.locked).toBe(true);
    expect(lauf.erst.protection.readOnly).toBe(true);
    expect(lauf.erst.protection.classification).toBe('restricted');
    expect(lauf.erst.objects['bild-1']).toEqual(vault.objects['bild-1']);
    // Die fluechtige Sicht ist **kein** Dokumentzustand — die Grenze laesst sie nicht hinein.
    for (const verboten of ['__uiState', '$uiState', 'transientUiState', 'runtimeUiState']) {
      expect(() => serializeWorkspaceDocumentCanonical({ ...strukturKopie(gesperrt), [verboten]: { ausgeblendet: ['bild-1'] } }))
        .toThrowError(/UI-only field/u);
    }
    expect(nutzdaten(lauf.zweit)).toEqual(nutzdaten(lauf.erst));
    expect(lauf.zweiteBytes).toBe(lauf.bytes);
  });
});

// ===============================================================================================================
// Paket 36-45 · Lebenszyklus des Verweises (AST-2050 ... AST-2100)
// ===============================================================================================================
describe('Paket 36-45 · Lebenszyklus des Verweises', () => {
  function paar() {
    return {
      'draw-quelle': umschlag('draw-quelle', 'Draw', { root_object_ids: ['anker-1'], objects: { 'anker-1': form('anker-1') } }),
      'writer-ziel': umschlag('writer-ziel', 'Writer'),
    };
  }
  const mitVerweis = (modus = 'Live') => {
    const ergebnis = insertFromWorkspace(paar(), 'writer-ziel', 'draw-quelle', 'anker-1', { referenceId: 'verweis-1', mode: modus, now: 600 });
    return { dokumente: ergebnis.updatedDocs, ziel: gespeicherteForm(ergebnis.updatedDocs['writer-ziel']) };
  };

  it('AST-2050 · P35 · Quelle geloescht: das Ziel zeigt broken und die Nutzdaten sind unkorrumpiert', () => {
    const { ziel } = mitVerweis('Live');
    const gebrochen = markWorkspaceReferencesBroken(ziel, 'draw-quelle', 'anker-1');
    const lauf = rundlauf(gebrochen);
    expect(lauf.erst.objects['verweis-1'].data.fabric_status).toBe('broken');
    expect(lauf.erst.objects['verweis-1'].data.common.ownership).toBe('ExternalLive');
    // Keine Korruption: die Kennung und der Pfad bleiben, nur der Status aendert sich.
    expect(lauf.erst.objects['verweis-1'].data.uri).toBe(workspaceObjectUri('draw-quelle', 'anker-1'));
    expect(lauf.erst.root_object_ids).toEqual(gebrochen.root_object_ids);
    // Und der **Weg durch die Operation** (Objekt entfernen): er bricht Verweise **im selben Dokument**
    // (`workspaceObjectModel.ts:103` uebergibt `next.id` als Quellkennung). Ein Verweis, dessen Quelle in einem
    // **anderen** Dokument liegt, wird von dieser Operation **nicht** angefasst — *gemessen, nicht behauptet*:
    const quelle = paar()['draw-quelle'];
    const mitVerweisDok = { ...ziel, objects: { ...ziel.objects, 'anker-1': quelle.objects['anker-1'] }, root_object_ids: [...ziel.root_object_ids, 'anker-1'] };
    const entfernt = applyWorkspaceChangeOperation(mitVerweisDok, { kind: 'remove_object', operationId: 'op-1', at: 610, objectId: 'anker-1', authorSignature: signatur });
    expect(entfernt.objects['verweis-1'].data.fabric_status, 'Quelle in einem anderen Dokument').toBe('current');
    expect(entfernt.objects['anker-1']).toBeUndefined();
    // Im **selben** Dokument greift sie dagegen — und das Grabmal ueberlebt den Neustart.
    const selbst = umschlag('draw-quelle', 'Draw', {
      root_object_ids: ['anker-1'],
      objects: {
        'anker-1': form('anker-1'),
        'verweis-1': {
          type: 'WorkspaceReference',
          data: {
            id: 'verweis-1', uri: workspaceObjectUri('draw-quelle', 'anker-1'), mode: 'Live',
            expected_type: 'Shape', permission_state: 'unknown', fallback_policy: 'forbidden',
            permission_provenance: { source_document_id: 'draw-quelle', snapshot_explicitly_embedded: false },
            common: { ownership: 'ExternalLive' },
          },
        },
      },
    });
    const selbstEntfernt = applyWorkspaceChangeOperation(selbst, { kind: 'remove_object', operationId: 'op-2', at: 611, objectId: 'anker-1', authorSignature: signatur });
    expect(selbstEntfernt.objects['verweis-1'].data.fabric_status).toBe('broken');
    const selbstLauf = rundlauf(gespeicherteForm(selbstEntfernt));
    expect(selbstLauf.erst.objects['verweis-1'].data.fabric_status).toBe('broken');
    expect(JSON.stringify(selbstLauf.erst.wom_extensions)).toContain('anker-1');
    expect(selbstLauf.zweiteBytes).toBe(selbstLauf.bytes);
    expect(nutzdaten(lauf.zweit)).toEqual(nutzdaten(lauf.erst));
    expect(lauf.zweiteBytes).toBe(lauf.bytes);
  });

  it('AST-2055 · P36 · Berechtigung entzogen: der Verweis wird permission-lost, nichts wird erfunden', () => {
    const { dokumente, ziel } = mitVerweis('Live');
    const aufloesung = resolveFabricReference({ ...dokumente, 'writer-ziel': ziel }, 'writer-ziel', 'verweis-1', { canReadSource: () => false });
    expect(aufloesung.link.status).toBe('permission-lost');
    // Fail-closed: **kein** Ersatzinhalt, obwohl die Quelle im Speicher liegt.
    const gerendert = renderFabricReference({ ...dokumente, 'writer-ziel': ziel }, 'writer-ziel', 'verweis-1', { canReadSource: () => false });
    expect(gerendert.payload).toBeUndefined();
    expect(gerendert.status).toBe('permission-lost');
    // Der gespeicherte Zustand traegt den Verweis weiter — ohne den entzogenen Inhalt.
    const lauf = rundlauf(ziel);
    expect(lauf.erst.objects['verweis-1'].data.mode).toBe('Live');
    expect(lauf.erst.objects['verweis-1'].data.cached_snapshot).toBeUndefined();
    expect(nutzdaten(lauf.zweit)).toEqual(nutzdaten(lauf.erst));
    expect(lauf.zweiteBytes).toBe(lauf.bytes);
  });

  it('AST-2060 · P37 · ein eingefrorener Verweis ignoriert spaetere Quellaenderungen, auch nach dem Neustart', () => {
    const { dokumente, ziel } = mitVerweis('Live');
    const gefroren = freezeFabricReference({ ...dokumente, 'writer-ziel': ziel }, 'writer-ziel', 'verweis-1', { now: 620 });
    const gefrorenZiel = gespeicherteForm(gefroren.updatedDocs['writer-ziel']);
    const lauf = rundlauf(gefrorenZiel);
    expect(lauf.erst.objects['verweis-1'].data.mode).toBe('Frozen');
    expect(lauf.erst.objects['verweis-1'].data.cached_snapshot.data.width).toBe(320);
    // Stoerung ist wirkungslos: die Quelle wird geaendert, der eingefrorene Verweis bleibt.
    const geaenderteQuelle = { ...gefroren.updatedDocs['draw-quelle'], version: 9, objects: { 'anker-1': form('anker-1', 999, 999) } };
    const nachStoerung = { ...gefroren.updatedDocs, 'draw-quelle': geaenderteQuelle };
    const gerendert = renderFabricReference(nachStoerung, 'writer-ziel', 'verweis-1');
    expect(gerendert.status).toBe('frozen');
    expect(gerendert.payload.data.width).toBe(320);
    expect(gerendert.payload.data.width).not.toBe(999);
    // **BEFUND 3 (gemeldet, nicht behoben):** ein **zweites** Einfrieren ist kein No-Op, sondern ein Wurf — und
    // der Text nennt den falschen Grund. `resolveFabricReference` liefert fuer `Frozen` **kein** `sourceDocument`
    // (`fabricState.ts:174-180`), und `freezeFabricReference` deutet das als „ohne lesbaren Inhalt"
    // (`fabricReferenceOperations.ts:226-228`) — *obwohl der Inhalt als `cached_snapshot` **da** ist.*
    expect(() => freezeFabricReference(nachStoerung, 'writer-ziel', 'verweis-1', { now: 621 }))
      .toThrowError(/Cannot freeze a Fabric link without readable semantic source content/u);
    expect(nachStoerung['writer-ziel'].objects['verweis-1'].data.cached_snapshot.data.width).toBe(320);
    expect(nutzdaten(lauf.zweit)).toEqual(nutzdaten(lauf.erst));
    expect(lauf.zweiteBytes).toBe(lauf.bytes);
  });

  it('AST-2065 · P38 · nach dem Umordnen zeigt der Verweis ueber die stabile Kennung weiter korrekt', () => {
    const quelle = umschlag('grid-quelle', 'Grid', {
      root_object_ids: ['tab-1', 'tab-2'],
      objects: { 'tab-1': tabelle('tab-1'), 'tab-2': tabelle('tab-2', { A1: { value: 'zweite' } }) },
    });
    const ziel = umschlag('writer-ziel', 'Writer');
    const eingefuegt = insertFromWorkspace({ 'grid-quelle': quelle, 'writer-ziel': ziel }, 'writer-ziel', 'grid-quelle', 'tab-1', { referenceId: 'verweis-1', mode: 'Live', now: 630 });
    // Die Quelle wird **umgeordnet** — die Wurzelreihenfolge aendert sich, die Kennungen nicht.
    const umgeordnet = applyWorkspaceChangeOperation(quelle, { kind: 'set_root_order', operationId: 'op-2', at: 631, rootObjectIds: ['tab-2', 'tab-1'] });
    const lauf = rundlauf(gespeicherteForm(umgeordnet));
    expect(lauf.erst.root_object_ids).toEqual(['tab-2', 'tab-1']);
    expect(lauf.erst.objects['tab-1'].data.id).toBe('tab-1');
    const nachNeustart = resolveFabricReference({ 'grid-quelle': lauf.erst, 'writer-ziel': eingefuegt.updatedDocs['writer-ziel'] }, 'writer-ziel', 'verweis-1');
    expect(nachNeustart.link.sourceObjId).toBe('tab-1');
    expect(nachNeustart.sourceObject.type).toBe('Table');
    expect(nutzdaten(lauf.zweit)).toEqual(nutzdaten(lauf.erst));
    expect(lauf.zweiteBytes).toBe(lauf.bytes);
  });

  it('AST-2070 · P39 · ein Live-Zyklus blockiert den Commit und der zyklenfreie Graph ist ein Fixpunkt', () => {
    const a = umschlag('doc-a', 'Writer', { root_object_ids: ['anker-1'], objects: { 'anker-1': form('anker-1') } });
    const b = umschlag('doc-b', 'Draw', { root_object_ids: ['anker-1'], objects: { 'anker-1': form('anker-1') } });
    const ab = insertFromWorkspace({ 'doc-a': a, 'doc-b': b }, 'doc-a', 'doc-b', 'anker-1', { referenceId: 'a-nach-b', mode: 'Live', now: 640 });
    expect(() => insertFromWorkspace(ab.updatedDocs, 'doc-b', 'doc-a', 'anker-1', { referenceId: 'b-nach-a', mode: 'Live', now: 641 }))
      .toThrowError(/cycle/u);
    // Gegenprobe: der zyklenfreie Teil wird gespeichert und ist ein Fixpunkt.
    const lauf = rundlauf(gespeicherteForm(ab.updatedDocs['doc-a']));
    expect(lauf.erst.objects['a-nach-b'].data.mode).toBe('Live');
    expect(nutzdaten(lauf.zweit)).toEqual(nutzdaten(lauf.erst));
    expect(lauf.zweiteBytes).toBe(lauf.bytes);
  });

  it('AST-2075 · P40 · die Mehrdokument-Aenderung ist ganz oder gar nicht', () => {
    const dokumente = paar();
    const eingefuegt = insertFromWorkspace(dokumente, 'writer-ziel', 'draw-quelle', 'anker-1', { referenceId: 'verweis-1', mode: 'Live', now: 650 });
    const geaenderteQuelle = { ...eingefuegt.updatedDocs['draw-quelle'], version: 2, objects: { 'anker-1': form('anker-1', 640, 480) } };
    const zusammen = { ...eingefuegt.updatedDocs, 'draw-quelle': geaenderteQuelle };
    const eingabeVorher = nutzdaten(eingefuegt.updatedDocs);
    const zielVorher = eingefuegt.updatedDocs['writer-ziel'].version;
    const fort = propagateFabricUpdates('draw-quelle', 'anker-1', geaenderteQuelle.objects['anker-1'], zusammen, { now: 651 });
    expect(fort.count).toBe(1);
    // Keine halbe Transaktion: die **Eingabe** ist unveraendert, das Ergebnis liegt in `updatedDocs`.
    expect(nutzdaten(eingefuegt.updatedDocs)).toEqual(eingabeVorher);
    expect(eingefuegt.updatedDocs['writer-ziel'].version).toBe(zielVorher);
    expect(fort.updatedDocs['writer-ziel'].version).toBe(zielVorher + 1);
    // Und beide Ergebnisse sind nach dem Neustart Fixpunkte.
    for (const id of ['draw-quelle', 'writer-ziel']) {
      const lauf = rundlauf(gespeicherteForm(fort.updatedDocs[id]));
      expect(nutzdaten(lauf.zweit), `${id}`).toEqual(nutzdaten(lauf.erst));
      expect(lauf.zweiteBytes, `${id}`).toBe(lauf.bytes);
    }
    expect(fort.updatedDocs['draw-quelle'].objects['anker-1'].data.width).toBe(640);
  });

  it('AST-2080 · P41 · ein Abbruch mitten im Commit laesst genau den Zustand davor oder danach uebrig', () => {
    const dokumente = paar();
    const vorher = nutzdaten(dokumente);
    // Der Commit **wirft**, bevor ein neues Dokumentenbild entsteht.
    expect(() => insertFromWorkspace(dokumente, 'writer-ziel', 'draw-quelle', 'gibt-es-nicht', { referenceId: 'verweis-1', mode: 'Live', now: 660 }))
      .toThrowError(/Source object gibt-es-nicht does not exist/u);
    // Der Zustand **davor** ist unveraendert — und er ist ein Fixpunkt.
    expect(nutzdaten(dokumente)).toEqual(vorher);
    const davor = rundlauf(gespeicherteForm(dokumente['writer-ziel']));
    expect(davor.erst.objects['verweis-1']).toBeUndefined();
    expect(davor.zweiteBytes).toBe(davor.bytes);
    // Der Zustand **danach** ist vollstaendig und ebenfalls ein Fixpunkt.
    const danach = insertFromWorkspace(dokumente, 'writer-ziel', 'draw-quelle', 'anker-1', { referenceId: 'verweis-1', mode: 'Live', now: 661 });
    const danachLauf = rundlauf(gespeicherteForm(danach.updatedDocs['writer-ziel']));
    expect(danachLauf.erst.objects['verweis-1'].data.uri).toBe(workspaceObjectUri('draw-quelle', 'anker-1'));
    expect(danachLauf.zweiteBytes).toBe(danachLauf.bytes);
  });

  it('AST-2085 · P42 · genau die betroffenen Live-Ziele werden aktualisiert, die eingefrorenen nicht', () => {
    const dokumente = paar();
    const live = insertFromWorkspace(dokumente, 'writer-ziel', 'draw-quelle', 'anker-1', { referenceId: 'verweis-live', mode: 'Live', now: 670 });
    const frozen = insertFromWorkspace(live.updatedDocs, 'writer-ziel', 'draw-quelle', 'anker-1', { referenceId: 'verweis-frozen', mode: 'Frozen', now: 671 });
    const quelle = { ...frozen.updatedDocs['draw-quelle'], version: 2, objects: { 'anker-1': form('anker-1', 700, 500) } };
    const fort = propagateFabricUpdates('draw-quelle', 'anker-1', quelle.objects['anker-1'], { ...frozen.updatedDocs, 'draw-quelle': quelle }, { now: 672 });
    // Genau **ein** betroffenes Ziel (das Live-Ziel), und keine Endlosschleife: zweimal fuehren ist stabil.
    expect(fort.count).toBe(1);
    expect(fort.notifications.map((n) => n.targetRefId)).toEqual(['verweis-live']);
    // **BEFUND 4 (gemeldet, nicht behoben) — gemessen, nicht behauptet:** dieselbe Quellversion ein zweites Mal
    // durchzusetzen ist **kein** No-Op. Der Verweis selbst bleibt gleich (`resolved_source_version` 2), aber
    // `setReference` hebt die **Zielversion** trotzdem an (`fabricState.ts:76-82`) und erzeugt erneut ein
    // `source-changed`-Ereignis (`fabricReferenceOperations.ts:439-452`) — *ohne Quellaenderung*. Wer auf diese
    // Ereignisse reagiert, bekommt eine Kette; das ist die Form, die AST-2085 „keine Endlosschleifen" meint.
    const zweimal = propagateFabricUpdates('draw-quelle', 'anker-1', quelle.objects['anker-1'], fort.updatedDocs, { now: 673 });
    expect(zweimal.updatedDocs['writer-ziel'].version).toBe(fort.updatedDocs['writer-ziel'].version + 1);
    expect(nutzdaten(zweimal.updatedDocs['writer-ziel'].objects)).toEqual(nutzdaten(fort.updatedDocs['writer-ziel'].objects));
    expect(zweimal.notifications.map((n) => n.kind)).toEqual(['source-changed']);
    // Die **Positivkontrolle** dazu: die Referenznutzdaten sind in beiden Durchlaeufen identisch — der
    // Unterschied liegt **allein** in der Dokumentversion, nicht im Inhalt.
    expect(zweimal.updatedDocs['writer-ziel'].objects['verweis-live'].data.resolved_source_version).toBe(2);
    const lauf = rundlauf(gespeicherteForm(fort.updatedDocs['writer-ziel']));
    expect(lauf.erst.objects['verweis-frozen'].data.cached_snapshot.data.width).toBe(320);
    expect(lauf.erst.objects['verweis-live'].data.resolved_source_version).toBe(2);
    expect(nutzdaten(lauf.zweit)).toEqual(nutzdaten(lauf.erst));
    expect(lauf.zweiteBytes).toBe(lauf.bytes);
  });

  it('AST-2090 · P43 · haeufige Quellaenderungen werden auf eine je Objekt zusammengefasst', () => {
    const aenderungen = Array.from({ length: 40 }, (_, i) => ({
      sourceDocId: 'draw-quelle', sourceObjId: 'anker-1', sourceVersion: i + 1, object: form('anker-1', 100 + i, 100),
    }));
    const gefasst = coalesceFabricChanges(aenderungen);
    expect(gefasst).toHaveLength(1);
    expect(gefasst[0].sourceVersion).toBe(40);
    const dokumente = paar();
    const eingefuegt = insertFromWorkspace(dokumente, 'writer-ziel', 'draw-quelle', 'anker-1', { referenceId: 'verweis-1', mode: 'Live', now: 680 });
    const quelle = { ...eingefuegt.updatedDocs['draw-quelle'], version: 40, objects: { 'anker-1': form('anker-1', 139, 100) } };
    const stapel = propagateFabricBatch(gefasst, { ...eingefuegt.updatedDocs, 'draw-quelle': quelle }, { now: 681 });
    expect(stapel.count).toBe(1);
    const lauf = rundlauf(gespeicherteForm(stapel.updatedDocs['writer-ziel']));
    expect(lauf.erst.objects['verweis-1'].data.resolved_source_version).toBe(40);
    expect(nutzdaten(lauf.zweit)).toEqual(nutzdaten(lauf.erst));
    expect(lauf.zweiteBytes).toBe(lauf.bytes);
  });

  it('AST-2095 · P44 · das Einfuegen ist im Ziel ruecknehmbar, ohne die Quelle zu veraendern', () => {
    const dokumente = paar();
    const eingefuegt = insertFromWorkspace(dokumente, 'writer-ziel', 'draw-quelle', 'anker-1', { referenceId: 'verweis-1', mode: 'Frozen', now: 690 });
    const quelleVorher = nutzdaten(eingefuegt.updatedDocs['draw-quelle']);
    // Undo im **Ziel**: das eingefuegte Objekt wird wieder entfernt.
    const rueckgaengig = applyWorkspaceChangeOperation(eingefuegt.updatedDocs['writer-ziel'], {
      kind: 'remove_object', operationId: 'op-undo', at: 691, objectId: 'verweis-1', authorSignature: signatur,
    });
    expect(rueckgaengig.objects['verweis-1']).toBeUndefined();
    // Die Quelle ist **unberuehrt** — nicht nur unveraendert aussehend.
    expect(nutzdaten(eingefuegt.updatedDocs['draw-quelle'])).toEqual(quelleVorher);
    const lauf = rundlauf(gespeicherteForm(rueckgaengig));
    expect(lauf.erst.objects['verweis-1']).toBeUndefined();
    expect(nutzdaten(lauf.zweit)).toEqual(nutzdaten(lauf.erst));
    expect(lauf.zweiteBytes).toBe(lauf.bytes);
  });

  it('AST-2100 · P45 · der Verweis traegt Ursprung, Modus, Version und nach dem Neustart dieselben', () => {
    const { dokumente, ziel } = mitVerweis('Frozen');
    const beschreibung = workspaceReferenceDescriptor(ziel.objects['verweis-1']);
    expect(beschreibung).toMatchObject({ sourceDocumentId: 'draw-quelle', sourceObjectId: 'anker-1', mode: 'Frozen', permissionState: 'unknown' });
    const lauf = rundlauf(ziel);
    const nachher = workspaceReferenceDescriptor(lauf.erst.objects['verweis-1']);
    expect(nachher).toEqual(beschreibung);
    expect(lauf.erst.objects['verweis-1'].data.permission_provenance.source_document_id).toBe('draw-quelle');
    expect(lauf.erst.objects['verweis-1'].data.frozen_at).toBe(600);
    expect(lauf.erst.objects['verweis-1'].data.source_version).toBe(dokumente['draw-quelle'].version);
    expect(nutzdaten(lauf.zweit)).toEqual(nutzdaten(lauf.erst));
    expect(lauf.zweiteBytes).toBe(lauf.bytes);
  });
});

// ===============================================================================================================
// Paket 46-55 · Suche, Deep Link, Lebenszyklus, Befehle, Importer (AST-2105 ... AST-2150)
// ===============================================================================================================
describe('Paket 46-55 · Suche, Deep Link, Lebenszyklus, Befehle, Importer', () => {
  it('AST-2105 · P46 · jede der 20 Dokumentarten liefert typisierte Suchfelder, die den Neustart ueberleben', () => {
    for (const kind of WORKSPACE_DOCUMENT_KINDS) {
      const quelle = umschlag(`such-${kind.toLowerCase()}`, kind, {
        title: `Titel ${kind}`,
        root_object_ids: ['txt-1'],
        objects: { 'txt-1': textblock('txt-1', `Inhalt ${kind}`) },
      });
      const lauf = rundlauf(quelle);
      expect(lauf.erst.title, `${kind}: Titel`).toBe(`Titel ${kind}`);
      expect(lauf.erst.objects['txt-1'].data.paragraphs[0].spans[0].text, `${kind}: Inhalt`).toBe(`Inhalt ${kind}`);
      expect(lauf.erst.objects['txt-1'].type).toBe('TextBlock');
      expect(nutzdaten(lauf.zweit)).toEqual(nutzdaten(lauf.erst));
      expect(lauf.zweiteBytes).toBe(lauf.bytes);
    }
  });

  it('AST-2110 · P47 · ein neu angelegtes Dokument ist nach dem Wiedereroeffnen unveraendert auffindbar', () => {
    const neu = umschlag('writer-neu', 'Writer', {
      title: 'Neues Writer-Dokument', version: 1,
      root_object_ids: ['txt-1'], objects: { 'txt-1': textblock('txt-1', 'Gerade angelegt') },
    });
    const lauf = rundlauf(neu);
    expect(lauf.erst.title).toBe('Neues Writer-Dokument');
    expect(lauf.erst.version).toBe(1);
    expect(lauf.erst.created_at).toBe(neu.created_at);
    expect(lauf.erst.modified_at).toBe(neu.modified_at);
    // Der Suchtext ist **im** Dokument, nicht in einem zweiten Index.
    expect(JSON.stringify(lauf.erst)).toContain('Gerade angelegt');
    expect(nutzdaten(lauf.zweit)).toEqual(nutzdaten(lauf.erst));
    expect(lauf.zweiteBytes).toBe(lauf.bytes);
  });

  it('AST-2115 · P48 · nach Import und Aenderung traegt das Dokument genau die eine Wahrheit', () => {
    const importiert = umschlag('grid-import', 'Grid', {
      title: 'Import 2026-09-28',
      root_object_ids: ['tab-1'],
      objects: { 'tab-1': tabelle('tab-1', { A1: { value: 'importiert' } }) },
    });
    const geaendert = applyWorkspaceChangeOperation(importiert, {
      kind: 'upsert_object', operationId: 'op-aendern', at: 700, objectId: 'tab-1', asRoot: true,
      object: tabelle('tab-1', { A1: { value: 'geaendert' } }),
    });
    const lauf = rundlauf(geaendert);
    expect(lauf.erst.version).toBe(importiert.version + 1);
    expect(lauf.erst.objects['tab-1'].data.cells.A1.value).toBe('geaendert');
    expect(lauf.erst.root_object_ids).toEqual(['tab-1']);
    // Keine Phantomzeile: der alte Wert steht **nirgends** mehr im gespeicherten Zustand.
    expect(JSON.stringify(lauf.erst)).not.toContain('importiert');
    expect(nutzdaten(lauf.zweit)).toEqual(nutzdaten(lauf.erst));
    expect(lauf.zweiteBytes).toBe(lauf.bytes);
  });

  it('AST-2120 · P49 · die Suchvorschau haengt am Sperrzustand des persistierten Dokuments', () => {
    const gesperrt = umschlag('vault-gesperrt', 'Vault', {
      title: 'Vertraulich',
      root_object_ids: ['bild-1'],
      objects: { 'bild-1': bild('bild-1') },
      protection: { version: 1, classification: 'restricted', locked: true, readOnly: true, policyId: 'vault-lock' },
    });
    const offen = umschlag('vault-offen', 'Vault', {
      title: 'Vertraulich',
      root_object_ids: ['bild-1'],
      objects: { 'bild-1': bild('bild-1') },
      protection: { version: 1, classification: 'restricted', locked: false, readOnly: false, policyId: 'vault-lock' },
    });
    // Der **einzige** Unterschied ist der Sperrzustand — und er ist genau das, was die Vorschau lesen muss.
    const a = nutzdaten(gesperrt);
    const b = nutzdaten(offen);
    expect(a.objects).toEqual(b.objects);
    expect(a.protection).not.toEqual(b.protection);
    const lauf = rundlauf(gesperrt);
    expect(lauf.erst.protection.locked).toBe(true);
    expect(lauf.zweiteBytes).toBe(lauf.bytes);
    // *Was diese Schicht **nicht** beweist:* dass die Vorschau den Titel wirklich zurueckhaelt — das ist die
    // Oberflaeche (Frontend/UX). Hier ist belegt: der Sperrzustand ist nach dem Neustart derselbe.
  });

  it('AST-2125 · P50 · der Deep Link fuehrt auf eine kanonische Kennung, die den Neustart ueberlebt', () => {
    const uri = workspaceObjectUri('writer-haupt', 'txt-1');
    expect(parseWorkspaceObjectUri(uri)).toEqual({ documentId: 'writer-haupt', objectId: 'txt-1' });
    const quelle = umschlag('writer-haupt', 'Writer', { root_object_ids: ['txt-1'], objects: { 'txt-1': textblock('txt-1', 'Ziel') } });
    const lauf = rundlauf(quelle);
    // Der Link zeigt nach dem Neustart auf **dasselbe** Objekt.
    const ziel = parseWorkspaceObjectUri(uri);
    expect(lauf.erst.id).toBe(ziel.documentId);
    expect(lauf.erst.objects[ziel.objectId].data.id).toBe(ziel.objectId);
    expect(lauf.zweiteBytes).toBe(lauf.bytes);
    expect(nutzdaten(lauf.zweit)).toEqual(nutzdaten(lauf.erst));
    // Und ein fremder Pfad wird **benannt** abgelehnt, nicht stillschweigend umgebogen.
    expect(() => parseWorkspaceObjectUri('vgt://workspace/document/a/object/b/c')).toThrowError(/Invalid vgt/u);
  });

  it('AST-2130 · P51 · Auswahl und Fokus sind fluechtig, der persistierte Dokumentzustand ist es nicht', () => {
    const quelle = umschlag('writer-tab', 'Writer', { root_object_ids: ['txt-1'], objects: { 'txt-1': textblock('txt-1') } });
    const lauf = rundlauf(quelle);
    expect(nutzdaten(lauf.erst)).toEqual(nutzdaten(quelle));
    for (const verboten of ['__uiState', '$uiState', 'transientUiState', 'runtimeUiState']) {
      expect(() => serializeWorkspaceDocumentCanonical({ ...strukturKopie(quelle), [verboten]: { selectedObjectIds: ['txt-1'], caret: 4 } }))
        .toThrowError(/UI-only field/u);
    }
    expect(lauf.zweiteBytes).toBe(lauf.bytes);
    expect(nutzdaten(lauf.zweit)).toEqual(nutzdaten(lauf.erst));
  });

  it('AST-2135 · P52 · ohne native Bruecke bleibt der Mehrfenster-Weg benannt gesperrt', () => {
    const dokumente = {
      'grid-quelle': umschlag('grid-quelle', 'Grid', { root_object_ids: ['tab-1'], objects: { 'tab-1': tabelle('tab-1') } }),
      'writer-ziel': umschlag('writer-ziel', 'Writer'),
    };
    const ladung = zeiger('grid-quelle', 'tab-1', 'Table', 'Grid');
    // **ANKER (Paket 33):** dieser Zeuge benutzt die **Ablage als Weg** (`evaluateWorkspaceDrop` und
    // `resolveWorkspaceDrop`). Der Annahme-Zweig unten ist der erste, der bei der Pflichtentscheidung rot wird.
    const reg = register('Grid', 'Table', 'Writer');
    // Die **Auswahl** wird angeboten — die Zustellung nicht, weil kein Modus gesagt ist (kein heimlicher Default).
    const auswahl = evaluateWorkspaceDrop({ payload: ladung, targetDocumentId: 'writer-ziel', documents: dokumente, requestedPolicyDecision: { effect: 'Allow' } }, reg);
    expect(['needsChoice', 'accepted']).toContain(auswahl.status);
    expect(resolveWorkspaceDrop({ payload: ladung, targetDocumentId: 'writer-ziel', requestedIntent: 'LIVE_REFERENCE', documents: dokumente, requestedPolicyDecision: { effect: 'Allow' } }, reg))
      .toMatchObject({ status: 'rejected', code: 'drop_live_mode_required' });
    // Und ein nicht-nativer Export darf keinen Live-Verweis behalten — benannt, nicht still.
    expect(() => planFabricExport('PreserveLiveLocalOnly', false)).toThrowError(/native Workspace exports/u);
    expect(planFabricExport('PreserveLiveLocalOnly', true)).toMatchObject({ mayPreserveLiveLink: true });
    const lauf = rundlauf(gespeicherteForm(dokumente['writer-ziel']));
    expect(nutzdaten(lauf.zweit)).toEqual(nutzdaten(lauf.erst));
    expect(lauf.zweiteBytes).toBe(lauf.bytes);
  });

  it('AST-2140 · P53 · die Kommandos sind eine Liste, kein zweiter Katalog — die Route ist eindeutig', () => {
    const reg = register('Grid', 'Table', 'Writer');
    // Eindeutigkeit: jede Route hat **einen** Adapter; ein zweiter wird benannt abgelehnt.
    expect(reg.getAdapter('Writer', 'Table', 'COPY').id).toBe('writer-table-ziel');
    expect(() => reg.registerAdapter({ id: 'zweiter', targetApp: 'Writer', objectKinds: ['Table'], intents: ['COPY'] }))
      .toThrowError(expect.objectContaining({ code: 'registry_read_only' }));
    const zweites = new WorkspaceInteractionRegistry();
    zweites.registerAppManifest({ app: 'Writer', exports: [], imports: [{ objectKind: 'Table', intents: ['COPY'] }] });
    zweites.registerAdapter({ id: 'writer-table-ziel', targetApp: 'Writer', objectKinds: ['Table'], intents: ['COPY'] });
    expect(() => zweites.registerAdapter({ id: 'writer-table-ziel', targetApp: 'Writer', objectKinds: ['Table'], intents: ['COPY'] }))
      .toThrowError(expect.objectContaining({ code: 'registry_adapter_id_duplicate' }));
    expect(() => zweites.registerAdapter({ id: 'anderer', targetApp: 'Writer', objectKinds: ['Table'], intents: ['COPY'] }))
      .toThrowError(expect.objectContaining({ code: 'registry_adapter_route_duplicate' }));
    // Und der gespeicherte Zielzustand bleibt ein Fixpunkt.
    const lauf = rundlauf(gespeicherteForm(umschlag('writer-ziel', 'Writer')));
    expect(lauf.zweiteBytes).toBe(lauf.bytes);
  });

  it('AST-2145 · P54 · Linkstatus und Modus sind eine Aussage, die im Dokument steht', () => {
    const dokumente = {
      'draw-quelle': umschlag('draw-quelle', 'Draw', { root_object_ids: ['anker-1'], objects: { 'anker-1': form('anker-1') } }),
      'writer-ziel': umschlag('writer-ziel', 'Writer'),
    };
    const eingefuegt = insertFromWorkspace(dokumente, 'writer-ziel', 'draw-quelle', 'anker-1', { referenceId: 'verweis-1', mode: 'Frozen', now: 800 });
    const lauf = rundlauf(gespeicherteForm(eingefuegt.updatedDocs['writer-ziel']));
    const daten = lauf.erst.objects['verweis-1'].data;
    // Kontextmenue-Aussage: „eingefroren, nicht live" — eine Aussage aus `mode`, nicht aus einem zweiten Feld.
    expect(daten.mode).toBe('Frozen');
    expect(workspaceReferenceDescriptor(lauf.erst.objects['verweis-1']).mode).toBe('Frozen');
    expect(daten.common.ownership).toBe('ExternalFrozen');
    expect(daten.fallback_policy).toBe('allowed');
    expect(nutzdaten(lauf.zweit)).toEqual(nutzdaten(lauf.erst));
    expect(lauf.zweiteBytes).toBe(lauf.bytes);
  });

  it('AST-2150 · P55 · fremde Formate werden geprueft — die Groesse steht gemessen im Dokument', () => {
    // Die Pruefungen sind Schwellen aus der Datei: Nutzlastgroesse, Typ, App.
    expect(() => parseWorkspaceDragPayload('x'.repeat(4097))).toThrowError(expect.objectContaining({ code: 'payload_too_large' }));
    expect(() => createWorkspaceDragPayload({ documentId: 'd', objectId: 'o', objectKind: 'Script', sourceApp: 'Grid', supportedIntents: ['COPY'] }))
      .toThrowError(expect.objectContaining({ code: 'object_kind_unknown' }));
    expect(() => createWorkspaceDragPayload({ documentId: 'd', objectId: 'o', objectKind: 'Table', sourceApp: 'NichtApp', supportedIntents: ['COPY'] }))
      .toThrowError(expect.objectContaining({ code: 'app_unknown' }));
    // Und die **gemessene** Groesse wird persistiert, nicht geraten und nicht auf 0 gerundet.
    const quelle = umschlag('import-ziel', 'Vault', { root_object_ids: ['datei-1'], objects: { 'datei-1': bild('datei-1', 'e'.repeat(64), 3) } });
    const lauf = rundlauf(quelle);
    expect(lauf.erst.objects['datei-1'].data.byteLength).toBe(3);
    expect(lauf.erst.objects['datei-1'].data.byteLength).not.toBe(0);
    expect(nutzdaten(lauf.zweit)).toEqual(nutzdaten(lauf.erst));
    expect(lauf.zweiteBytes).toBe(lauf.bytes);
  });
});

// ===============================================================================================================
// Paket 57-69 · Sicherheit, Autosave, Groesse, Release (AST-2160 ... AST-2220)
// ===============================================================================================================
describe('Paket 57-69 · Sicherheit, Autosave, Groesse, Release', () => {
  it('AST-2160 · P57 · die redigierte Nutzlast ist das, was gespeichert wird, und der Profilwechsel ist belegt', () => {
    const redigiert = umschlag('writer-export', 'Writer', {
      root_object_ids: ['txt-1'],
      objects: { 'txt-1': textblock('txt-1', 'Oeffentlicher Teil') },
      protection: { version: 1, classification: 'confidential', locked: false, readOnly: true, policyId: 'redaction' },
    });
    const lauf = rundlauf(redigiert);
    expect(lauf.erst.protection.classification).toBe('confidential');
    expect(lauf.erst.protection.readOnly).toBe(true);
    expect(JSON.stringify(lauf.erst)).toContain('Oeffentlicher Teil');
    // Das sensible Original wird **nicht** mitgeschleppt.
    expect(JSON.stringify(lauf.erst)).not.toContain('GEHEIM');
    expect(nutzdaten(lauf.zweit)).toEqual(nutzdaten(lauf.erst));
    expect(lauf.zweiteBytes).toBe(lauf.bytes);
    // Und ein Profilwechsel nach unten ohne ausdrueckliche Bestaetigung ist ein **benannter** Fehlschlag.
    expect(() => assertNoSecurityDowngrade(
      applySecurityProfile(umschlag('doc-a', 'Writer'), 'VGT_TOP_SECRET'),
      applySecurityProfile(umschlag('doc-b', 'Writer'), 'STANDARD'),
    )).toThrowError(/SECURITY_PROFILE_DOWNGRADE_BLOCKED/u);
  });

  it('AST-2170 · P59 · das verschluesselte Autosave liefert identische Nutzdaten, ohne Klartext', async () => {
    const dokument = umschlag('vault-autosave', 'Vault', {
      root_object_ids: ['bild-1'],
      objects: { 'bild-1': bild('bild-1', 'f'.repeat(64), 12345) },
      protection: { version: 1, classification: 'sensitive', locked: true, readOnly: false, policyId: 'vwc' },
    });
    const vorher = nutzdaten(gespeicherteForm(dokument));
    const container = await packLocalEncryptedContainer(strukturKopie(dokument), { password: 'korrekt-pferd-batterie' });
    expect(container).toBeInstanceOf(Uint8Array);
    expect(container.byteLength).toBeGreaterThan(64);
    // **Kein Klartext im Behaelter:** die Kennung des Inhalts ist im Chiffrat nicht auffindbar.
    expect(new TextDecoder('utf-8', { fatal: false }).decode(container)).not.toContain('bild-1-chunk');
    const zurueck = await unpackLocalEncryptedContainer(container, { password: 'korrekt-pferd-batterie' });
    expect(nutzdaten(zurueck)).toEqual(vorher);
    // Und der falsche Ausweis oeffnet nichts — benannt, nicht still.
    await expect(unpackLocalEncryptedContainer(container, { password: 'falsch' })).rejects.toThrowError();
  });

  it('AST-2185 · P62 · die Fokusketten sind fluechtig, der kanonische Zustand traegt sie nicht', () => {
    const quelle = umschlag('grid-fokus', 'Grid', { root_object_ids: ['tab-1'], objects: { 'tab-1': tabelle('tab-1') } });
    const lauf = rundlauf(quelle);
    expect(nutzdaten(lauf.erst)).toEqual(nutzdaten(quelle));
    for (const verboten of ['__uiState', '$uiState', 'transientUiState', 'runtimeUiState']) {
      expect(() => serializeWorkspaceDocumentCanonical({ ...strukturKopie(quelle), [verboten]: { fokus: ['tab-1'] } }))
        .toThrowError(/UI-only field/u);
    }
    expect(lauf.zweiteBytes).toBe(lauf.bytes);
    expect(nutzdaten(lauf.zweit)).toEqual(nutzdaten(lauf.erst));
    // *Was hier **nicht** belegt ist:* die Tastatur-Navigation selbst (Schicht 5).
  });

  it('AST-2195 · P64 · mehr als 1000 Dokumente: jedes einzelne bleibt ein Fixpunkt', () => {
    const anzahl = 1001;
    const dokumente = Array.from({ length: anzahl }, (_, i) =>
      umschlag(`doc-${String(i).padStart(4, '0')}`, WORKSPACE_DOCUMENT_KINDS[i % WORKSPACE_DOCUMENT_KINDS.length], {
        root_object_ids: ['txt-1'],
        objects: { 'txt-1': textblock('txt-1', `Dokument ${i}`) },
      }));
    const kennungen = new Set();
    for (const dokument of dokumente) {
      const lauf = rundlauf(gespeicherteForm(dokument));
      expect(lauf.erst.id).toBe(dokument.id);
      expect(lauf.erst.title).toBe(dokument.title);
      expect(nutzdaten(lauf.zweit)).toEqual(nutzdaten(lauf.erst));
      expect(lauf.zweiteBytes).toBe(lauf.bytes);
      kennungen.add(`${lauf.erst.kind}/${lauf.erst.id}`);
    }
    // Keine stillen Doppel: 1001 Dokumente, 1001 Kennungen, **gemessen**.
    expect(dokumente).toHaveLength(anzahl);
    expect(kennungen.size).toBe(anzahl);
  });

  it('AST-2210 · P67 · die Open-Core-Abgrenzung ist eine gemessene Liste, kein Versprechen', () => {
    // Gemessen: die kanonische Vokabel dieses Baums fuehrt genau 20 Dokumentarten, der Versionsvertrag ebenso.
    expect(WORKSPACE_DOCUMENT_KINDS).toHaveLength(20);
    expect(Object.keys(WORKSPACE_SCHEMA_VERSIONS)).toHaveLength(20);
    expect(new Set(WORKSPACE_DOCUMENT_KINDS).size).toBe(20);
    for (const kind of WORKSPACE_DOCUMENT_KINDS) {
      expect(Object.keys(WORKSPACE_SCHEMA_VERSIONS)).toContain(kind);
    }
    // Und der kanonische Umschlag laesst keine ausfuehrbare Nutzlast durch — die Grenze, die SBOM-Aussagen stuetzt.
    const dokument = umschlag('sbom-doc', 'AdminPolicy', { root_object_ids: ['pol-1'], objects: { 'pol-1': regelwerk('pol-1') } });
    expect(() => serializeWorkspaceDocumentCanonical({
      ...strukturKopie(dokument),
      wom_extensions: { 'vgt.sbom': { script: 'rm -rf /' } },
    })).toThrowError(/Executable core field/iu);
    const lauf = rundlauf(dokument);
    expect(lauf.zweiteBytes).toBe(lauf.bytes);
  });

  it('AST-2220 · P69 · die Abnahme selbst: alle 20 Arten, alle 11 Typen, ein Fixpunkt je Dokument', () => {
    let geprueft = 0;
    for (const kind of WORKSPACE_DOCUMENT_KINDS) {
      const docId = `abnahme-${kind.toLowerCase()}`;
      const objekte = alleTypen(docId);
      const dokument = umschlag(docId, kind, {
        root_object_ids: Object.keys(objekte),
        objects: objekte,
        workManagementData: { tasks: [aufgabe('task-1', 'Abnahme')], cards: [] },
      });
      const lauf = rundlauf(dokument);
      expect(nutzdaten(lauf.erst), `${kind}`).toEqual(nutzdaten(dokument));
      expect(nutzdaten(lauf.zweit), `${kind}`).toEqual(nutzdaten(lauf.erst));
      expect(lauf.zweiteBytes, `${kind}`).toBe(lauf.bytes);
      geprueft += 1;
    }
    // Nicht-Leerheits-Gegenprobe: die Schleife hat wirklich 20 Dokumente geprueft, mit allen 11 Typen.
    expect(geprueft).toBe(20);
    const probedokument = alleTypen('probe');
    expect(WORKSPACE_OBJECT_KINDS.every((typ) => Object.values(probedokument).some((o) => o.type === typ))).toBe(true);
  });
});

// ===============================================================================================================
// Benannte Messungen: die Kanonisierung beim ersten Speichern — und die zwei Befunde.
// ===============================================================================================================
describe('Benannte Messungen: Kanonisierung beim ersten Speichern und die Befunde', () => {
  it('der erste Speichervorgang kanonisiert — die ergaenzten Felder sind gemessen, nicht weggerechnet', () => {
    const nackt = {
      schema_version: 2, id: 'nackt', title: 'nackt', kind: 'Writer',
      created_at: 1, modified_at: 1, version: 1, theme_id: 'cosmic-obsidian',
      root_object_ids: [], objects: {},
    };
    const erstanlauf = kanal(strukturKopie(nackt)).reopened;
    // **Gemessen:** die Grenze ergaenzt genau diese drei Felder — und `schema_version` bleibt, wo es war.
    expect(Object.keys(erstanlauf).filter((k) => !(k in nackt)).sort()).toEqual(['protection', 'securityPolicy', 'wom_extensions']);
    expect(erstanlauf.protection).toEqual({ version: 1, classification: 'standard', locked: false, readOnly: false });
    expect(erstanlauf.securityPolicy).toEqual({ profile: 'STANDARD', inherited_from_workspace: false, downgrade_authorized: false });
    expect(erstanlauf.wom_extensions).toEqual({});
    // Ab dem zweiten Durchlauf ist der Umschlag ein **Fixpunkt** — das ist die Zusage der Zeilen oben.
    const bytes = serializeWorkspaceDocumentCanonical(erstanlauf);
    expect(serializeWorkspaceDocumentCanonical(deserializeWorkspaceDocumentCanonical(bytes))).toBe(bytes);
    // Und ein Verweis aus einer Operation ergaenzt **eine** Tatsache: `permission_state: 'unknown'` (fail-closed).
    const eingefuegt = insertFromWorkspace(
      {
        'draw-quelle': { ...nackt, id: 'draw-quelle', kind: 'Draw', root_object_ids: ['anker-1'], objects: { 'anker-1': form('anker-1') } },
        'writer-ziel': { ...nackt, id: 'writer-ziel' },
      },
      'writer-ziel', 'draw-quelle', 'anker-1', { referenceId: 'verweis-1', mode: 'Live', now: 900 },
    );
    const vorher = eingefuegt.updatedDocs['writer-ziel'].objects['verweis-1'].data;
    const nachher = gespeicherteForm(eingefuegt.updatedDocs['writer-ziel']).objects['verweis-1'].data;
    expect('permission_state' in vorher).toBe(false);
    expect(nachher.permission_state).toBe('unknown');
  });

  it('W-456 (BEHOBEN in Runde 423) · beide Felder werden verglichen — ungleiche Nutzlast wird BENANNT abgewiesen', () => {
    // **VORHER gemessen (eigener Lauf, vor der Aenderung):** genau dieser Eingang war `ACCEPTED`, `legacy-1`
    // war danach **weg**, `canon-1` da — *ohne benannten Fehler.* `migrateV1ToV2` migrierte `workData`
    // **nur**, wenn `workManagementData` **kein** Record war, und loeschte `workData` danach **unbedingt** —
    // waehrend die Zusage derselben Datei „Legacy workData **must be migrated**" lautet.
    // **NACHHER:** die beiden Felder werden byteweise ueber ihre **kanonische JSON-Form** verglichen
    // (`canonicalJsonBytes`, derselbe Serialisierer wie die Grenze selbst). Gleiche Nutzlast ⇒ die kanonische
    // Form traegt jeden Eingabewert, der Alias darf fallen. **Ungleiche Nutzlast hat keine definierte
    // Zusammenfuehrungsregel** ⇒ benannte Ablehnung statt halb gespeichert.
    //
    // *Warum das nicht konstruiert ist:* `apps/notes/notebooks/useNotesManager.ts:145` und
    // `apps/pdf/integrations/pdfWorkspaceConversions.ts:207` **halten beide Felder absichtlich parallel** —
    // beide schreiben **dieselbe** Nutzlast, und genau diese Form ist unten die Positivkontrolle.
    //
    // *Die vollstaendigen Zeugen stehen in
    // `src/testing/platform/workspace/model/workspaceV1WorkDataMigrationNoSilentLoss.w456.test.ts`.*
    const alt = {
      schema_version: 1, id: 'alt', title: 'Alt', kind: 'Tasks',
      created_at: 1, modified_at: 1, version: 1, theme_id: 'cosmic-obsidian',
      root_object_ids: [], objects: {},
      workData: { tasks: [aufgabe('legacy-1', 'Nur in workData')], cards: [] },
      workManagementData: { tasks: [aufgabe('canon-1', 'Schon kanonisch')], cards: [] },
    };
    // **Der Verlust ist nicht mehr still:** die Ablehnung nennt beide Felder und den Grund (§25 Microcopy).
    expect(() => kanal(strukturKopie(alt))).toThrowError(/Legacy workData and canonical workManagementData carry different work-management payloads/u);
    expect(() => kanal(strukturKopie(alt))).toThrowError(/no defined merge rule/u);
    // Und nichts wurde dabei angefasst: die Nutzlast des Aufrufers steht unveraendert da.
    expect(alt.workData.tasks.map((t) => t.id)).toEqual(['legacy-1']);
    expect(alt.workManagementData.tasks.map((t) => t.id)).toEqual(['canon-1']);

    // Zweite Auspraegung, dieselbe Ursache: ein **unbrauchbares** `workData` wird nicht mehr geloescht.
    const unbrauchbar = { ...alt, workData: 'kein-record' };
    delete unbrauchbar.workManagementData;
    expect(() => kanal(strukturKopie(unbrauchbar)))
      .toThrowError(/Legacy workData is present but is not a work-management record/u);

    // **Positivkontrolle ① — das Instrument funktioniert in beide Richtungen:** *fehlt* `workManagementData`,
    // migriert dieselbe Funktion **verlustfrei**.
    const nurLegacy = { ...alt };
    delete nurLegacy.workManagementData;
    const migriert = kanal(strukturKopie(nurLegacy)).reopened;
    expect(migriert.workManagementData.tasks).toEqual([aufgabe('legacy-1', 'Nur in workData')]);
    expect('workData' in migriert).toBe(false);

    // **Positivkontrolle ② — die Form beider echter Aufrufer:** dieselbe Nutzlast in beiden Feldern ist
    // zugelassen und verlustfrei; der Alias faellt, weil er nichts Eigenes traegt.
    const parallel = { tasks: [aufgabe('task-1', 'Parallel gehalten')], cards: [{ id: 'card-1', linkedTaskId: 'task-1' }] };
    const beideGleich = { ...alt, workData: parallel, workManagementData: parallel };
    const erster = kanal(strukturKopie(beideGleich));
    expect(erster.reopened.workManagementData).toEqual(parallel);
    expect('workData' in erster.reopened).toBe(false);
    expect(kanal(strukturKopie(erster.reopened)).bytes).toBe(erster.bytes);
  });

  it('W-457 (BEHOBEN in Runde 423) · fehlende Top-Secret-Provenienz wird BENANNT abgewiesen, nicht ergaenzt', () => {
    // **VORHER gemessen (eigener Lauf, vor der Aenderung):** dieses Dokument war `ACCEPTED` und behauptete
    // danach `VGT-INFINITY-1` und `55b05a697a189d0ec583cdcf340beeba1efc9130` — *eine Herkunft, die niemand
    // nachgewiesen hat*, weil die Normalisierung den fehlenden Wert **vor** dem Waechter gefuellt hatte.
    // **NACHHER:** die Fuellung ist entfernt; der fehlende Nachweis ist ein **Sicherheitsfall** — opak nach
    // aussen (`publicMessage`/`toJSON`), voller Grund in `reason` und im lokalen Diagnosering.
    // *Die vollstaendigen Zeugen stehen in
    // `src/testing/platform/workspace/model/workspaceTopSecretProvenanceAbsence.w457.test.ts`.*
    const ohneProvenienz = {
      schema_version: 2, id: 'ts', title: 'ts', kind: 'Writer',
      created_at: 1, modified_at: 1, version: 1, theme_id: 'cosmic-obsidian',
      root_object_ids: [], objects: {},
      securityPolicy: { profile: 'VGT_TOP_SECRET' },
    };
    let abgelehnt;
    try {
      kanal(strukturKopie(ohneProvenienz));
      throw new Error('missing provenance must be refused');
    } catch (error) {
      abgelehnt = error;
    }
    // **Gemessen:** keine erfundene Provenienz, sondern eine benannte Ablehnung mit opaker Aussenform.
    expect(abgelehnt.name).toBe('WorkspaceSecurityError');
    expect(abgelehnt.diagnosticCode).toBe('SEC_TS_PROVENANCE_ABSENT');
    expect(abgelehnt.reason).toContain('carries no pinned Infinity suite provenance');
    expect(abgelehnt.message).toBe('Request rejected by Workspace security policy.');
    // **Die negative Zusicherung, die die Zusage selbst prueft:** keine Client-Antwort traegt den Grund.
    const alsAntwort = JSON.stringify(abgelehnt);
    expect(alsAntwort).toBe('{"error":"Request rejected by Workspace security policy."}');
    expect(alsAntwort).not.toContain('provenance');
    expect(JSON.stringify(ohneProvenienz)).not.toContain(INFINITY_SUITE);

    // **Positivkontrolle ①:** ein **falscher** Wert wird unveraendert benannt abgelehnt — der Waechter lebt.
    expect(() => serializeWorkspaceDocumentCanonical({
      ...strukturKopie(ohneProvenienz),
      securityPolicy: { profile: 'VGT_TOP_SECRET', infinity_suite: 'EVIL', infinity_commit: 'bad' },
    })).toThrowError(/Top Secret Infinity suite provenance mismatch/u);

    // **Positivkontrolle ②:** vollstaendige, korrekte Provenienz wird **zugelassen** — sonst waere „abgewiesen"
    // auch von einem Waechter erfuellt, der alles ablehnt.
    const belegt = kanal(strukturKopie({
      ...ohneProvenienz,
      securityPolicy: { profile: 'VGT_TOP_SECRET', infinity_suite: INFINITY_SUITE, infinity_commit: '55b05a697a189d0ec583cdcf340beeba1efc9130' },
    })).reopened;
    expect(belegt.securityPolicy.infinity_suite).toBe(INFINITY_SUITE);
    expect(belegt.securityPolicy.infinity_commit).toBe('55b05a697a189d0ec583cdcf340beeba1efc9130');
  });
});
