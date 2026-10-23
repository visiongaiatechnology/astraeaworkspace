// STATUS: PLATIN — Integration & Release, **Paket 10**: die gerenderte Zusage der Ablageflaeche
//
// Diese Datei prueft **Markup**, nicht Gestaltung: dass die Flaeche eine **erkennbare Zone** ist, dass
// `preview.label` **woertlich** erscheint, dass erlaubt/unerlaubt **ohne Farbe** unterscheidbar sind, dass
// der **Tastaturweg** echte Knoepfe hat und dass die **Touch-Entscheidung** gerendert wird.
//
// Sie laeuft als `.mjs`, weil sie die Produktionsobjekte wirklich laedt. Die Zustaende werden **durch das
// reine Modul** erzeugt (nicht als Literale gebaut) — *ein gerenderter Literalzustand wuerde die Kette
// Paket 4 → 5 → 6 → 7 nicht beruehren und damit nichts beweisen.*
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PresentWorkspaceDropZoneOverlay } from '../../../integrations/workspace-drop/PresentWorkspaceDropZoneOverlay';
import { createPresentWorkspaceDropZone, dropPresentWorkspaceDropZone, openPresentWorkspaceDropZone } from '../../../integrations/workspace-drop/presentWorkspaceDropZone';
import { PRESENT_WORKSPACE_DROP_ZONE_PRESENTATION } from '../../../integrations/workspace-drop/presentWorkspaceDropZoneContract';
import { createWorkspaceDragPayload, serializeWorkspaceDragPayload, WorkspaceInteractionRegistry } from '../../../../../shared/workspace-interaction';

const PAYLOAD = serializeWorkspaceDragPayload(createWorkspaceDragPayload({
  documentId: 'grid-doc',
  objectId: 'table-1',
  objectKind: 'Table',
  sourceApp: 'Grid',
  supportedIntents: ['COPY', 'LIVE_REFERENCE'],
}));

const DOCUMENTS = {
  'grid-doc': {
    schema_version: 2, id: 'grid-doc', title: 'Grid', kind: 'Grid', created_at: 1, modified_at: 1, version: 2,
    theme_id: 'cosmic-obsidian', root_object_ids: ['table-1'],
    objects: { 'table-1': { type: 'Table', data: { id: 'table-1', rows: 1, cols: 1, cells: { A1: { value: '42' } } } } },
  },
  'present-doc': {
    schema_version: 2, id: 'present-doc', title: 'Present', kind: 'Present', created_at: 1, modified_at: 1, version: 3,
    theme_id: 'cosmic-obsidian', root_object_ids: [], objects: {},
  },
};

/** Dieselbe Vorrichtung wie im reinen Test: **eine** Matrix, mit einem Present-Ziel eingetragen. */
function presentRegistry(intents = ['COPY']) {
  const registry = new WorkspaceInteractionRegistry();
  registry.registerAppManifest({ app: 'Grid', exports: [{ objectKind: 'Table', intents: ['COPY', 'LIVE_REFERENCE'] }], imports: [] });
  registry.registerAppManifest({ app: 'Present', exports: [], imports: [{ objectKind: 'Table', intents }] });
  registry.registerAdapter({ id: 'present-table-target', targetApp: 'Present', objectKinds: ['Table'], intents });
  return registry.seal();
}

// UEBERGANGSMARKER (W-455) in der **Pruefschicht**: dieser Vertrag bezeugt die **Anzeige**, nicht die Richtlinie ✓
// — *die Zone liest die Entscheidung der Administratorrichtlinie aus ihrem Kontext* ✓✓. *In der Produktion holt die
// Shell sie asynchron* (`precheckPolicy`) *und reicht sie hinein* ✓. **Der Richtlinien-Zeuge ist ein eigener
// Vertrag** ✓✓: `src/testing/shared/workspace-interaction/workspacePolicyDecisionGate.w455.contract.test.mjs`.
const context = (overrides = {}) => ({ targetDocumentId: 'present-doc', documents: DOCUMENTS, registry: presentRegistry(), payload: PAYLOAD, requestedPolicyDecision: { effect: 'Allow' }, ...overrides });

function state(overrides = {}) {
  return openPresentWorkspaceDropZone(createPresentWorkspaceDropZone('present-doc'), context(overrides)).state;
}

const render = (value, overrides = {}) => renderToStaticMarkup(createElement(PresentWorkspaceDropZoneOverlay, {
  state: value, onConfirm: () => {}, onDismiss: () => {}, ...overrides,
}));

const noop = () => {};

describe('Present-Ablageflaeche: die gerenderte Zusage', () => {
  it('ohne Zug rendert die Flaeche NICHTS', () => {
    expect(render(createPresentWorkspaceDropZone('present-doc'))).toBe('');
  });

  it('die Zone ist erkennbar: Eckwinkel, Rahmenart, Zeichen und Woerter -- nicht nur ein Farbton', () => {
    const html = render(state());
    expect(html).toContain('data-present-drop-zone="true"');
    expect(html).toContain('data-present-drop-phase="ready"');
    expect(html).toContain('data-present-drop-verdict="accept"');
    expect(html).toContain('data-present-drop-pattern="solid"');
    expect(html).toContain('data-present-drop-glyph="true"');
    expect(html).toContain(PRESENT_WORKSPACE_DROP_ZONE_PRESENTATION.ready.glyph);
    expect(html).toContain(PRESENT_WORKSPACE_DROP_ZONE_PRESENTATION.ready.headline);
    // Die vier Eckwinkel: vier Elemente mit linken/rechten Randlinien.
    expect((html.match(/border-l-4|border-r-4/g) || []).length).toBeGreaterThanOrEqual(4);
    expect(html).toContain('role="region"');
    expect(html).toContain('Workspace-Ablageziel Present');
  });

  it('die Vorschau ist WOERTLICH die von Paket 6 -- keine zweite Beschriftung', () => {
    const s = state();
    expect(s.target.preview.label).toBe('Table · COPY');
    const html = render(s);
    expect(html).toContain('data-present-drop-preview="true"');
    expect(html).toContain('Table · COPY');
    expect(html).toContain('data-present-drop-announcement="true"');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('Urteil: wird angenommen');
  });

  it('erlaubt und unerlaubt sind OHNE Farbe unterscheidbar -- Zeichen und Worte je Zustand', () => {
    // Jeder erreichbare Zustand traegt ein eigenes Zeichen UND eigene Worte.
    const sichtbar = [state({ payload: null }), state(), state({ registry: presentRegistry(['COPY', 'LIVE_REFERENCE']) }), state({ payload: 'kein JSON' })];
    const phasen = ['open', 'ready', 'choice', 'refused'];
    for (const phase of phasen) {
      expect(PRESENT_WORKSPACE_DROP_ZONE_PRESENTATION[phase].glyph).not.toBe(PRESENT_WORKSPACE_DROP_ZONE_PRESENTATION.closed.glyph);
    }
    const zeichen = phasen.map((phase) => PRESENT_WORKSPACE_DROP_ZONE_PRESENTATION[phase].glyph);
    const worte = phasen.map((phase) => PRESENT_WORKSPACE_DROP_ZONE_PRESENTATION[phase].headline);
    expect(new Set(zeichen).size, 'die Zeichen muessen die Zustaende unterscheiden').toBe(phasen.length);
    expect(new Set(worte).size, 'die Ueberschriften muessen die Zustaende unterscheiden').toBe(phasen.length);

    // Und die Ablehnung traegt zusaetzlich eine **Form** (Schraffur) -- nicht nur einen Farbton.
    const abgelehnt = render(sichtbar[3]);
    expect(abgelehnt).toContain('data-present-drop-phase="refused"');
    expect(abgelehnt).toContain('data-present-drop-verdict="none"');
    expect(abgelehnt).toContain('data-present-drop-pattern="double"');
    expect(abgelehnt).toContain('data-present-drop-refusal="true"');
    expect(abgelehnt).toContain('unlesbar');
    expect(abgelehnt).toContain('repeating-linear-gradient');
    // Die vier sichtbaren Zustaende rendern wirklich vier verschiedene Flaechen.
    expect(new Set(sichtbar.map((value) => render(value))).size).toBe(4);
  });

  it('der Tastaturweg ist echt: benannte Knoepfe, und der Bestaetigen-Knopf ist ehrlich deaktiviert', () => {
    const bereit = render(state());
    expect(bereit).toContain('data-present-drop-confirm="true"');
    expect(bereit).toContain('data-present-drop-dismiss="true"');
    expect(bereit).not.toContain('disabled=""');
    expect(bereit).toContain('Ablegen (ohne Zeiger)');

    const leer = render(state({ payload: null }));
    expect(leer).toContain('data-present-drop-confirm="true"');
    expect(leer).toContain('disabled=""');

    // Die Absichten sind ohne Zeiger waehlbar: je Absicht ein Knopf -- mit der Taste davor.
    const offen = state({ registry: presentRegistry(['COPY', 'LIVE_REFERENCE']) });
    const mitWahl = render(offen, { onChooseIntent: noop });
    expect(mitWahl).toContain('data-present-drop-intent="COPY"');
    expect(mitWahl).toContain('data-present-drop-intent="LIVE_REFERENCE"');
    expect(mitWahl).toContain('1 · COPY');
    expect(mitWahl).toContain('2 · LIVE_REFERENCE');
    // Ohne Empfaenger gibt es **keinen** Scheinpfad: der Knopf fehlt ganz.
    expect(render(offen)).not.toContain('data-present-drop-intent=');
  });

  it('die Touch-Entscheidung wird gerendert -- manipulation, nie none', () => {
    for (const input of ['mouse', 'pen', 'touch', 'keyboard']) {
      const html = render(state({ input }));
      expect(html, input).toContain('data-present-drop-touch-action="manipulation"');
    }
    const beruehrung = render(state({ input: 'touch' }));
    expect(beruehrung).toContain('data-present-drop-touch-longpress="true"');
    expect(beruehrung).toContain('Langdruck 250 ms');
    expect(render(state({ input: 'mouse' }))).toContain('data-present-drop-touch-longpress="false"');
    expect(beruehrung, 'eine Stilregel ohne Begruendung waere genau der Defekt').not.toContain('touch-action: none');
  });

  it('die Platzierung steht in PROZENT -- dieselbe Geometrie bei jedem Zoom', () => {
    const html = render(state());
    expect(html).toContain('data-present-drop-placement="true"');
    // Die Prozente kommen aus der **vorhandenen** Platzierung (27 x 18 an 71/28).
    expect(html).toContain('left:71%');
    expect(html).toContain('top:28%');
    expect(html).toContain('width:27%');
    expect(html).toContain('height:18%');
    expect(html, 'ein Pixelwert muesste erst wieder durch den Zoom geteilt werden').not.toMatch(/data-present-drop-placement="true"[^>]*px/);
  });

  it('eine zugestellte Ablage nennt den Adapter -- und der Zeigerweg endet wie der Tastaturweg', () => {
    const s = state();
    const zugestellt = dropPresentWorkspaceDropZone(s, context()).state;
    const html = render(zugestellt);
    expect(html).toContain('data-present-drop-phase="resolved"');
    expect(html).toContain('data-present-drop-resolution="true"');
    expect(html).toContain('present-table-target');
    expect(html).toContain('present-doc');
    expect(html).toContain('Urteil: wird angenommen');
  });

  it('der neue gemessene Zustand: die Route nimmt an -- und beim Loslassen nennt die Flaeche den Quellenmangel', () => {
    // **Form A** ist genau die Form, die die Shell in die gesiegelte Matrix setzt: eine Route, die
    // `Table` mit `COPY` annimmt. Der Traeger ist der echte Produktions-Traeger.
    const bereit = state({ registry: presentRegistry(['COPY']) });
    expect(bereit.phase).toBe('ready');
    expect(bereit.verdict).toBe('accept');
    const html = render(bereit);
    expect(html).toContain('data-present-drop-phase="ready"');
    expect(html).toContain('data-present-drop-verdict="accept"');
    expect(html).toContain('Urteil: wird angenommen');
    expect(html).toContain('Table · COPY');

    // **Ohne die Quellenliste** (der heute montierte Zustand: die Shell liefert `workspaceDocuments`
    // noch nicht) verweigert das Ablegen -- aber **benannt**, nicht still.
    const ohneQuellen = context({
      registry: presentRegistry(['COPY']),
      documents: { 'present-doc': DOCUMENTS['present-doc'] },
    });
    const ablage = dropPresentWorkspaceDropZone(bereit, ohneQuellen);
    expect(ablage.ok).toBe(false);
    expect(ablage.reason).toBe('drop_source_document_missing');
    const nachher = render(ablage.state);
    expect(nachher).toContain('data-present-drop-phase="refused"');
    expect(nachher).toContain('data-present-drop-reason="drop_source_document_missing"');
    expect(nachher).toContain('Das Quelldokument ist nicht verfügbar.');

    // Ein **nicht gedeckter** Traeger (kein Table) bleibt die benannte Ablehnung der Route.
    const ungedeckt = state({
      payload: PAYLOAD.replace('"objectKind":"Table"', '"objectKind":"Chart"'),
      registry: presentRegistry(['COPY']),
    });
    expect(ungedeckt.phase).toBe('refused');
    const ungedecktHtml = render(ungedeckt);
    expect(ungedecktHtml).toContain('route-not-capable');
    expect(ungedecktHtml).toContain('Dieses Ziel nimmt diesen Träger nicht an');
    expect(ungedecktHtml).toContain('data-present-drop-reason="route-not-capable"');
  });
});
