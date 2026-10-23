// STATUS: PLATIN — W-455: die Administratorrichtlinie wird bei JEDEM Ablagevorgang durchgesetzt, fail-closed
//
// ## Was diese Datei belegt ✓✓
//
// **Die Zusage lautete „Admin-Policy bei **jedem** Fabric-Drop"** ✓ — *und sie war **nicht** durchgesetzt* ✗✓:
// `precheckPolicy` hatte **genau einen** Aufrufer (`shell/workspace/useWorkspaceActions.ts:320`), und der galt
// `file.export` ✗. **Im Ablage-Pfad wurde keine Richtlinie befragt** ✗✓ — *also konnte eine Administratorrichtlinie
// eine Cross-App-Ablage nicht blockieren* ✗✓.
//
// **Jetzt entscheidet der Resolver** ✓✓ (`shared/workspace-interaction/workspaceInteractionResolver.ts`, die
// Pruefung **vor** der Zielpruefung ✓) — *eine Stelle, und damit alle Ziele* ✓✓.
//
// ## Die vier Faelle — und warum es **drei** Gruende sind ✓✓
//
//   * **abwesend**        ⇒ `drop_policy_decision_required` ✓ (*fail-closed: **keine** Entscheidung ist **kein**
//                          `Allow`* ✗✓)
//   * **ungueltig**       ⇒ **derselbe** Grund ✓✓ (*fail-closed: `'allow'`, `{}`, `null`, `'Allow '`, ein Array,
//                          ein geerbter Wert — **alles** ist wie **fehlend*** ✗✓✓)
//   * **`Deny`**          ⇒ `drop_policy_denied` ✓
//   * **`RequireApproval`** ⇒ `drop_policy_approval_required` ✓✓ (*ein **eigener** Grund: eine Ablehnung ist
//                          **nicht** dasselbe wie „warten auf Freigabe"* ✓✓)
//   * **`Allow`**         ⇒ **stellt zu** ✓ (*weiter wie bisher, kein vierter Zustand* ✓)
//
// ## Warum `.mjs` und warum **hier** ✓✓
//
// *Die Datei liest **Quelltext** (die zwei erschoepfenden Abbildungen und den traegernahen Rueckfall)* ✓ — *und
// `.ts` haette dafuer **keine** Node-Typen* ✗✓ (`fs`/`path` ⇒ `TS2307` ✓✓). *Und der Vertrag liegt bei den
// Interaktions-Vertraegen, nicht bei einer App* ✓ — *die Regel gilt fuer **jede** Zone* ✓✓.
//
// ## Die zwei sichtbaren Saetze — **gemessen, nicht behauptet** ✓✓
//
// *Drei neue Gruende brauchen **drei sichtbare Saetze** in **jeder** erschoepfenden Abbildung* ✓✓, *und der
// traegernahe Rueckfall (`writerWorkspaceCarrier.ts:211` prueft `hasOwnProperty` und faellt sonst auf
// `writerWorkspaceDropRefusalText` zurueck*) **faellt automatisch mit** ✓ — *das wird hier **gemessen**, statt es
// zu glauben* ✗✓✓. *Und **jede** Zeile braucht ihr **Komma** (Unterschrift ② ✗✓): *nach `drop_live_mode_required`
// folgt `drag_already_active`* ✓.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  createWorkspaceDragPayload,
  evaluateWorkspaceDrop,
  resolveWorkspaceDrop,
  serializeWorkspaceDragPayload,
  WorkspaceInteractionRegistry,
} from '../../../shared/workspace-interaction/index';

const HIER = dirname(fileURLToPath(import.meta.url));
const WURZEL = join(HIER, '..', '..', '..');

function quelle(relativ) {
  return readFileSync(join(WURZEL, relativ), 'utf8');
}

/** **Der eine** Träger fuer alle Faelle ✓ — *derselbe Fixture in jeder Probe, damit die Probe den **Grund** misst
 * und nicht die Gelegenheit* ✓✓. */
function ladung() {
  return serializeWorkspaceDragPayload(createWorkspaceDragPayload({
    documentId: 'grid-doc',
    objectId: 'table-1',
    objectKind: 'Table',
    sourceApp: 'Grid',
    supportedIntents: ['COPY', 'LIVE_REFERENCE', 'FROZEN_SNAPSHOT'],
  }));
}

function dokument(id, kind, objectId) {
  const objects = {};
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

function dokumente() {
  return { 'grid-doc': dokument('grid-doc', 'Grid', 'table-1'), 'writer-doc': dokument('writer-doc', 'Writer') };
}

function registry() {
  const wert = new WorkspaceInteractionRegistry();
  wert.registerAppManifest({
    app: 'Grid',
    exports: [{ objectKind: 'Table', intents: ['COPY', 'LIVE_REFERENCE', 'FROZEN_SNAPSHOT'] }],
    imports: [],
  });
  wert.registerAppManifest({ app: 'Writer', exports: [], imports: [{ objectKind: 'Table', intents: ['COPY'] }] });
  wert.registerAdapter({ id: 'writer-table-target', targetApp: 'Writer', objectKinds: ['Table'], intents: ['COPY'] });
  return wert.seal();
}

/** Der **eine** Aufruf, der sich je Fall nur in der Entscheidung unterscheidet ✓✓. */
function frage(entscheidung) {
  const basis = { payload: ladung(), targetDocumentId: 'writer-doc', requestedIntent: 'COPY', documents: dokumente() };
  return entscheidung === undefined ? basis : { ...basis, requestedPolicyDecision: entscheidung };
}

describe('W-455 · die Administratorrichtlinie bei jedem Ablagevorgang', () => {
  it('weist eine Ablage OHNE Entscheidung benannt ab — fail-closed, kein stiller Erfolg', () => {
    // *Die Positivkontrolle steht zuerst: **mit** `Allow` stellt dieselbe Route zu* ✓✓ — *sonst bewiese der
    // Fehlschlag unten nur, dass irgendetwas kaputt ist* ✗✓✓.
    expect(resolveWorkspaceDrop(frage({ effect: 'Allow' }), registry()))
      .toMatchObject({ status: 'resolved', selection: { intent: 'COPY', integrationKind: 'copy' } });
    // Und **ohne** Entscheidung: **benannt** abgewiesen ✓ — *kein Erfolg, kein stiller Default* ✗✓.
    expect(resolveWorkspaceDrop(frage(undefined), registry()))
      .toMatchObject({ status: 'rejected', code: 'drop_policy_decision_required' });
    // *Und die **Frage** (das Angebot) antwortet **denselben** Grund* ✓✓ — *ein Angebot darf nichts versprechen,
    // was die Zustellung verweigert* ✓.
    expect(evaluateWorkspaceDrop(frage(undefined), registry()))
      .toMatchObject({ status: 'rejected', code: 'drop_policy_decision_required' });
  });

  it('behandelt eine UNGUELTIGE Entscheidung genau wie eine FEHLENDE — derselbe Grund', () => {
    const ungueltig = [
      {},                                  // kein `effect`
      { effect: 'allow' },                 // falsche Schreibweise — *die Woerter sind die der Plattform* ✓
      { effect: 'Allow ' },                // Leerzeichen sind ein anderer Wert, kein anderer Fall
      { effect: 'ALLOW' },
      { effect: true },
      { effect: 1 },
      { effect: null },
      { effect: undefined },
      { effect: 'Permit' },                // erfundenes Wort
      null,
      undefined,
      'Allow',                             // *eine **Zeichenkette** ist keine Entscheidung* ✗✓
      ['Allow'],
      Object.create({ effect: 'Allow' }),  // **geerbt** ist nicht **eigen** ✓ (`hasOwnProperty`, wie `getDocument` ✓)
    ];
    for (const entscheidung of ungueltig) {
      expect(resolveWorkspaceDrop(frage(entscheidung), registry()))
        .toMatchObject({ status: 'rejected', code: 'drop_policy_decision_required' });
    }
    // **Eigener Fehler, sofort korrigiert ✗✓:** hier stand `{ effect: 'Deny', extra: 'x' }` in der Liste der
    // **ungueltigen** Werte — *und der Zeuge wurde **rot*** ✗✓. **Er hatte recht:** *ein **Zusatzfeld** macht eine
    // **gueltige** Entscheidung nicht ungueltig* ✓ — `Deny` bleibt `Deny` ✓. *Ein Zusatz ist keine zweite Aussage.*
    expect(resolveWorkspaceDrop(frage({ effect: 'Deny', extra: 'x' }), registry()))
      .toMatchObject({ status: 'rejected', code: 'drop_policy_denied' });
    // **Und `Deny` ist nicht „ungueltig"** ✓✓ — *es ist eine **gueltige** Entscheidung mit **eigenem** Namen* ✓:
    expect(resolveWorkspaceDrop(frage({ effect: 'Deny' }), registry()))
      .toMatchObject({ status: 'rejected', code: 'drop_policy_denied' });
  });

  it('gibt `Deny` und `RequireApproval` je einen EIGENEN Namen — Ablehnung ist keine Freigabe', () => {
    // *Zwei Tatsachen, zwei Gruende* ✓✓ — *waeren beide `drop_policy_denied`, koennte der Benutzer „abgelehnt" nicht
    // von „wartet auf Freigabe" unterscheiden* ✗✓✓.
    expect(resolveWorkspaceDrop(frage({ effect: 'Deny' }), registry()))
      .toMatchObject({ status: 'rejected', code: 'drop_policy_denied' });
    expect(resolveWorkspaceDrop(frage({ effect: 'RequireApproval' }), registry()))
      .toMatchObject({ status: 'rejected', code: 'drop_policy_approval_required' });
    // Die beiden Gruende sind **verschieden** — *das ist die Aussage dieses Zeugen* ✓.
    expect('drop_policy_denied').not.toBe('drop_policy_approval_required');
  });

  it('stellt bei `Allow` zu — und die drei Gruende tragen je einen SICHTBAREN Satz in BEIDEN Zonen', () => {
    // ① **`Allow` stellt zu** ✓✓ — *mit Adapter, Art und beiden Versionen* ✓ (*die Positivkontrolle*).
    expect(resolveWorkspaceDrop(frage({ effect: 'Allow' }), registry())).toMatchObject({
      status: 'resolved',
      code: 'drop_resolved',
      selection: { intent: 'COPY', integrationKind: 'copy', adapterId: 'writer-table-target' },
      sourceVersion: 2,
      targetVersion: 2,
    });
    // ② **Die zwei erschoepfenden Abbildungen tragen je drei Saetze** ✓✓ — *Deutsch, ganze Saetze, kein Code als
    // Text* ✓✓. *Gemessen als **Teilzeichenketten**, damit dieser Zeuge kein Trennzeichen-Fallstrick wird* ✓
    // (ein `|` in einer Markdown-Zelle und ein Anfuehrungszeichen in einem Here-String haben dieses Projekt
    // **dreimal** gekostet ✗✓ — *hier entsteht die Falle gar nicht erst* ✓).
    const present = quelle('apps/present/integrations/workspace-drop/presentWorkspaceDropZoneContract.ts');
    const writer = quelle('apps/writer/integrations/workspace-drop/writerWorkspaceDropZoneContract.ts');
    const saetze = [
      'Für diese Ablage fehlt die Entscheidung der Arbeitsbereichsrichtlinie.',
      'Die Arbeitsbereichsrichtlinie erlaubt diese Ablage nicht.',
      'Die Arbeitsbereichsrichtlinie verlangt eine Freigabe für diese Ablage.',
    ];
    for (const satz of saetze) {
      expect(present, 'Present: der sichtbare Satz fehlt').toContain(satz);
      expect(writer, 'Writer: der sichtbare Satz fehlt').toContain(satz);
    }
    // *Und **kein** Code erscheint als Text* ✗✓ — *der Code ist der Schluessel, der Satz ist die Anzeige* ✓.
    for (const [name, text] of [['Present', present], ['Writer', writer]]) {
      expect(text, `${name}: ein Code steht als sichtbarer Text`).not.toContain("drop_policy_denied: 'drop_policy_denied'");
      expect(text, `${name}: ein Code steht als sichtbarer Text`).not.toContain("drop_policy_approval_required: 'drop_policy_approval_required'");
      expect(text, `${name}: ein Code steht als sichtbarer Text`).not.toContain("drop_policy_decision_required: 'drop_policy_decision_required'");
    }
    // ③ **Der traegernahe Rueckfall faellt automatisch mit** ✓✓ — *er prueft `hasOwnProperty` und faellt sonst auf
    // `writerWorkspaceDropRefusalText` zurueck* ✓. *Dieser Zeuge **misst** das, statt es zu glauben* ✗✓✓.
    const carrier = quelle('apps/writer/integrations/workspace-carrier/writerWorkspaceCarrier.ts');
    expect(carrier).toContain('Object.prototype.hasOwnProperty.call(CARRIER_REFUSAL_TEXT, code)');
    expect(carrier).toContain('writerWorkspaceDropRefusalText(code as WorkspaceInteractionErrorCode)');
  });

  it('prüft die Richtlinie VOR dem Zieldokument — eine Ablehnung verrät das Ziel nicht', () => {
    // **Die Stelle ist die Entscheidung** ✓✓✓: *ein **fehlendes** Zieldokument **und** eine **fehlende**
    // Entscheidung sind zwei Tatsachen* ✓ — *und die Richtlinie kommt **zuerst*** ✓: *sonst waere der Grund ein
    // Auskunftsdienst darueber, **ob** ein fremdes Dokument existiert* ✗✓✓.
    const ohneZiel = {
      payload: ladung(),
      targetDocumentId: 'gibt-es-nicht',
      requestedIntent: 'COPY',
      documents: { 'grid-doc': dokument('grid-doc', 'Grid', 'table-1') },
    };
    // *Ohne Entscheidung: der **Policy**-Grund* ✓ — **nicht** `drop_target_document_missing`.
    expect(resolveWorkspaceDrop(ohneZiel, registry()))
      .toMatchObject({ status: 'rejected', code: 'drop_policy_decision_required' });
    // *Und mit `Allow` ist derselbe Aufruf wieder eine **Ziel**-Aussage* ✓✓ — *das beweist, dass die Reihenfolge
    // wirklich die Ursache ist und nicht ein Zufall der Fixture* ✓✓.
    expect(resolveWorkspaceDrop({ ...ohneZiel, requestedPolicyDecision: { effect: 'Allow' } }, registry()))
      .toMatchObject({ status: 'rejected', code: 'drop_target_document_missing' });
    // *Dasselbe gilt fuer `Deny`: eine **abgelehnte** Ablage nennt **nicht** das Ziel* ✓✓.
    expect(resolveWorkspaceDrop({ ...ohneZiel, requestedPolicyDecision: { effect: 'Deny' } }, registry()))
      .toMatchObject({ status: 'rejected', code: 'drop_policy_denied' });
  });
});
