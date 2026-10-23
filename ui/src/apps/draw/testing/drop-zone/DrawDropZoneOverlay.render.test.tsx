// STATUS: PLATIN — Integration & Release, **Paket 14**: der Markup-Vertrag der Draw-Ablagezone
//
// Warum das hier steht: die annehmende Fläche von Draw ist eine **Leinwand** — genauer eine **SVG-Anwendung**
// (`DrawInteractiveSurface`, `role="application"`). Der UI/UX-Standard verbietet wesentliche Funktion, die **nur**
// dort lebt (§8.6, §21.3, §32). Ein Ablageziel, das nur aus Pixeln besteht — ein Rechteck im SVG, eine Fläche im
// Canvas — ist für einen Screenreader **nicht vorhanden** und mit der Tastatur **nicht** erreichbar. *Das ist ein
// Befund, kein Detail.* Dieser Vertrag prüft deshalb das **echte DOM**: eine dauerhaft vorhandene Ansageregion,
// Zeichen und Worte statt Farbe, echte `<button type="button">` für jeden Weg ohne Zeiger, keine gemalte Zone —
// und die entschiedene Touch-Strategie im Markup.
//
// Was hier **nicht** geprüft ist: das **Binden** der Ereignisse (`useDrawDropZone`) und ob die Verweisfläche den
// Canvas wirklich ohne Zeiger erreicht (Fokusreihenfolge) — dafür braucht es einen Browser. Das bleibt
// `NOT_TESTED` und wird so berichtet.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';
import {
  WorkspaceInteractionRegistry,
  createWorkspaceDragPayload,
  serializeWorkspaceDragPayload,
} from '../../../../shared/workspace-interaction';
import {
  FABRIC_WORKSPACE_DROP_REGISTRY,
  createFabricWorkspaceObjectDragPayload,
} from '../../../../shell/fabric/fabricGraphWorkspaceDrop';
import { DrawDropZoneOverlay } from '../../drop-zone/DrawDropZoneOverlay';
import {
  createDrawDropZone,
  dropDrawDropZone,
  hoverDrawDropZone,
} from '../../drop-zone/drawDropZone';
import type { DrawDropZoneContext } from '../../drop-zone/drawDropZone';
import {
  DRAW_DROP_INTENT_LABEL,
  DRAW_DROP_ZONE_ANNOUNCER_ID,
  DRAW_DROP_ZONE_IDLE_ANNOUNCEMENT,
  DRAW_DROP_ZONE_KEY_HINT,
  DRAW_DROP_ZONE_PRESENTATION,
  DRAW_DROP_ZONE_SURFACE_LABEL,
} from '../../drop-zone/drawDropZoneContract';
import type { DrawDropZoneState } from '../../drop-zone/drawDropZoneContract';
import { DRAW_DROP_ZONE_TOUCH_ACTION, drawDropZoneLongPressMs } from '../../drop-zone/drawDropZoneTouch';

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
  id: 'draw-target',
  title: 'Architecture sketch',
  kind: 'Draw',
  created_at: 1,
  modified_at: 1,
  version: 4,
  theme_id: 'cosmic-obsidian',
  root_object_ids: [],
  objects: {},
};

const documents: Readonly<Record<string, WorkspaceDocument>> = { [source.id]: source, [target.id]: target };

const table = source.objects['table-forecast'];
if (!table) throw new Error('Fixture-Tabelle fehlt');

const twoIntentPayload = createFabricWorkspaceObjectDragPayload(source, table) ?? '';
const oneIntentPayload = serializeWorkspaceDragPayload(createWorkspaceDragPayload({
  documentId: source.id,
  objectId: 'table-forecast',
  objectKind: 'Table',
  sourceApp: 'Grid',
  supportedIntents: ['COPY'],
}));

function drawRouteRegistry(): WorkspaceInteractionRegistry {
  const registry = new WorkspaceInteractionRegistry();
  registry.registerAppManifest({ app: 'Grid', exports: [{ objectKind: 'Table', intents: ['COPY', 'LIVE_REFERENCE'] }], imports: [] });
  registry.registerAppManifest({ app: 'Draw', exports: [], imports: [{ objectKind: 'Table', intents: ['COPY', 'LIVE_REFERENCE'] }] });
  registry.registerAdapter({ id: 'draw-canvas-table', targetApp: 'Draw', objectKinds: ['Table'], intents: ['COPY', 'LIVE_REFERENCE'] });
  return registry.seal();
}

const ROUTE_REGISTRY = drawRouteRegistry();

const contextWith = (registry: WorkspaceInteractionRegistry | null | undefined, payload?: unknown): DrawDropZoneContext => ({
  registry,
  targetApp: target.kind,
  targetDocumentId: target.id,
  documents,
  payload,
});
const route = (payload?: unknown) => contextWith(ROUTE_REGISTRY, payload);
const authority = (payload?: unknown) => contextWith(FABRIC_WORKSPACE_DROP_REGISTRY, payload);

const markupOf = (state: DrawDropZoneState, inputKind: 'mouse' | 'touch' | 'pen' | 'keyboard' = 'mouse'): string =>
  renderToStaticMarkup(
    <DrawDropZoneOverlay
      state={state}
      inputKind={inputKind}
      onConfirm={() => undefined}
      onChooseIntent={() => undefined}
      onDismiss={() => undefined}
      onKeyDown={() => undefined}
    />,
  );

/** Der Abschnitt der sichtbaren Zone — für „darf nicht vorkommen"-Prüfungen, die nur die Zone meinen. */
function zoneSection(markup: string): string {
  const start = markup.indexOf('<section');
  const end = markup.indexOf('</section>');
  if (start < 0 || end < 0) throw new Error('Zone-Abschnitt fehlt');
  return markup.slice(start, end + '</section>'.length);
}

/** Die Ansageregion — sie steht **immer** im DOM, auch ohne sichtbare Zone. */
function announcer(markup: string): string {
  const start = markup.indexOf('data-vgt-draw-drop-zone-announcer');
  if (start < 0) throw new Error('Ansageregion fehlt');
  const begin = markup.lastIndexOf('<p', start);
  const end = markup.indexOf('</p>', start);
  return markup.slice(begin, end + '</p>'.length);
}

const ready = () => hoverDrawDropZone(createDrawDropZone(), route(oneIntentPayload)).state;
/**
 * Ein **gemessener** Ablehnungsfall gegen die **versiegelte** Matrix: Draw importiert seit Paket 14 nur `Table`
 * (Form A, `fabric-grid-table-to-draw`), ein `Chart` wird deshalb weiterhin benannt abgelehnt
 * (`route-not-capable`). *Der Vorzustand dieses Tests war eine Fläche **ohne** Draw-Route — dieser Marker ist
 * vorgezogen, nicht gelockert; die Assertions dieses Vertrags sind unverändert.*
 */
const openNoRoute = () => {
  const chart: WorkspaceDocument = {
    ...source,
    id: 'grid-chart-open',
    root_object_ids: ['chart-1'],
    objects: {
      'chart-1': { type: 'Chart', data: { id: 'chart-1', chart_type: 'bar', title: 'Chart', categories: [], series: [] } },
    },
  };
  const payload = serializeWorkspaceDragPayload(createWorkspaceDragPayload({
    documentId: chart.id,
    objectId: 'chart-1',
    objectKind: 'Chart',
    sourceApp: 'Grid',
    supportedIntents: ['COPY'],
  }));
  return hoverDrawDropZone(createDrawDropZone(), {
    ...authority(payload),
    documents: { ...documents, [chart.id]: chart },
  }).state;
};
const openUnreadable = () => hoverDrawDropZone(createDrawDropZone(), route(undefined)).state;
const choice = () => dropDrawDropZone(ready(), route(twoIntentPayload)).state;
const routed = () => dropDrawDropZone(ready(), route(oneIntentPayload)).state;

describe('Paket 14 — die Ansageregion steht auch ohne Zone im DOM', () => {
  it('ist im leeren Zustand vorhanden, benannt und **nicht** versteckt', () => {
    const markup = markupOf(createDrawDropZone());
    expect(markup).not.toBe('');
    const region = announcer(markup);
    expect(region).toContain(`id="${DRAW_DROP_ZONE_ANNOUNCER_ID}"`);
    expect(region).toContain('role="status"');
    expect(region).toContain('aria-live="assertive"');
    expect(region).toContain('aria-atomic="true"');
    expect(region).toContain(DRAW_DROP_ZONE_IDLE_ANNOUNCEMENT);
    expect(region).not.toContain('aria-hidden');
    expect(markup).not.toContain('<section');
    expect(markup).not.toContain('<button');
  });

  it('sagt Urteil, Vorschau und Grund an, sobald etwas über der Fläche ist', () => {
    const region = announcer(markupOf(openNoRoute()));
    expect(region).toContain(DRAW_DROP_ZONE_PRESENTATION.open.headline);
    expect(region).toContain('route-not-capable');
    expect(region).toContain('No registered route accepts this object at the Draw canvas.');
  });

  it('versteckt die Zone nicht hinter `aria-hidden` — sonst wäre sie für den Screenreader nicht vorhanden', () => {
    const markup = markupOf(ready());
    const section = zoneSection(markup);
    // Der **Abschnitt selbst** ist sichtbar für die Hilfstechnik …
    expect(section.slice(0, section.indexOf('>'))).not.toContain('aria-hidden');
    // … ebenso jede Aussage: Vorschau, Urteil, Route, Grund.
    for (const part of ['__verdict', '__preview', '__reason', '__route', '__keys', '__input']) {
      const at = section.indexOf(part);
      if (at < 0) continue;
      expect(section.slice(section.lastIndexOf('<', at), section.indexOf('>', at)), part).not.toContain('aria-hidden');
    }
    // Genau **eine** Sache ist dekorativ versteckt: das Zeichen — und es steht zusätzlich als Wort und als
    // `data`-Attribut da, ist also nicht die einzige Aussage.
    expect((section.match(/aria-hidden="true"/g) ?? [])).toHaveLength(1);
    expect(section).toContain('data-vgt-draw-drop-zone-glyph');
    expect(section).toContain('class="draw-drop-zone__glyph"');
    expect(announcer(markup)).not.toContain('aria-hidden');
  });
});

describe('Paket 14 — die Zone ist echtes DOM, keine gemalte Fläche', () => {
  it('rendert eine semantische Region außerhalb jeder Leinwand — kein SVG, kein Canvas, kein gemaltes Rechteck', () => {
    const markup = markupOf(ready());
    const section = zoneSection(markup);
    expect(section).toContain('<section');
    expect(section).toContain('aria-label="Draw workspace drop zone"');
    // Der Markup-Vertrag von Paket 14: das Ziel ist eine **DOM-Schicht außerhalb** der Leinwand.
    expect(section).toContain('data-vgt-draw-drop-zone-canvas="dom-overlay"');
    expect(markup).not.toContain('<svg');
    expect(markup).not.toContain('<canvas');
    expect(markup).not.toContain('data-vgt-shape');
    // Die Fläche wird als **Wort** genannt, nicht als Ort im Pixel.
    expect(markup).toContain(`Surface: ${DRAW_DROP_ZONE_SURFACE_LABEL}`);
    expect(markup).toContain('data-vgt-draw-drop-zone-surface="canvas"');
  });

  it('fängt keinen Zug ab: die Schicht ist durchlässig, nur die Knöpfe sind bedienbar', () => {
    const markup = markupOf(choice());
    expect(markup).toContain('class="draw-drop-zone-layer"');
    expect(markup).toContain('data-vgt-draw-drop-zone-layer="choice"');
    // Kein Zeiger-Handler im Markup: die Zone beginnt keine Geste (der Zug gehört der Quelle, Paket 5).
    expect(markup).not.toContain('onPointerDown');
    expect(markup).not.toContain('onMouseDown');
    expect(markup).not.toContain('onTouchStart');
  });
});

describe('Paket 14 — Zustände ohne Farbe', () => {
  it('gibt jedem Zustand ein Zeichen, eine Rahmenform und Worte', () => {
    const states: readonly [string, DrawDropZoneState][] = [
      ['open', openNoRoute()],
      ['ready', ready()],
      ['choice', choice()],
      ['refused', dropDrawDropZone(createDrawDropZone(), route('{kein json')).state],
      ['resolved', routed()],
    ];
    const signatures = new Set<string>();
    const markups = new Set<string>();
    for (const [view, state] of states) {
      const presentation = DRAW_DROP_ZONE_PRESENTATION[view as keyof typeof DRAW_DROP_ZONE_PRESENTATION];
      const markup = markupOf(state);
      expect(markup, view).toContain(`data-vgt-draw-drop-zone="${view}"`);
      expect(markup, view).toContain(`data-vgt-draw-drop-zone-glyph="${presentation.glyph}"`);
      expect(markup, view).toContain(`data-vgt-draw-drop-zone-pattern="${presentation.pattern}"`);
      expect(markup, view).toContain(presentation.headline);
      signatures.add(`${presentation.glyph}|${presentation.pattern}|${presentation.headline}`);
      markups.add(markup);
    }
    expect(signatures.size).toBe(states.length);
    expect(markups.size).toBe(states.length);
  });

  it('nennt das Urteil als Wort und den Grund als Code **und** als Satz', () => {
    const landed = markupOf(openNoRoute());
    expect(landed).toContain('data-vgt-draw-drop-zone-verdict="reject"');
    expect(landed).toContain('Verdict: reject');
    expect(landed).toContain('data-vgt-draw-drop-zone-reason="route-not-capable"');
    expect(landed).toContain('data-vgt-draw-drop-zone-reason-text="route-not-capable"');
    expect(landed).toContain('Reason: route-not-capable · No registered route accepts this object at the Draw canvas.');
    // Ein abgelehntes Urteil zeigt **keinen** aktiven „route here"-Knopf.
    expect(landed).toContain('aria-disabled="true"');
  });

  it('unterscheidet „Träger nicht lesbar" von „Route trägt nicht" — zwei benannte Gründe', () => {
    const unreadable = markupOf(openUnreadable());
    expect(unreadable).toContain('data-vgt-draw-drop-zone-transfer="draw-drop-transfer-missing"');
    expect(unreadable).toContain('data-vgt-draw-drop-zone-reason-text="draw-drop-transfer-missing"');
    expect(unreadable).toContain('data-vgt-draw-drop-zone-verdict="reject"');
    expect(unreadable).not.toBe(markupOf(openNoRoute()));
  });
});

describe('Paket 14 — die Vorschau kommt aus dem Urteil (Paket 6)', () => {
  it('rendert `preview.label` wörtlich und nennt die getragene Objektart', () => {
    const markup = markupOf(ready());
    expect(markup).toContain('data-vgt-draw-drop-zone-preview="Table"');
    expect(markup).toContain('Preview: Table · COPY');
    expect(markup).toContain('data-vgt-draw-drop-zone-verdict="accept"');
    expect(markup).toContain('data-vgt-draw-drop-zone-transfer="read"');
  });

  it('zeigt keine Vorschau, wenn der Träger nicht gelesen werden konnte', () => {
    expect(markupOf(openUnreadable())).not.toContain('data-vgt-draw-drop-zone-preview');
  });
});

describe('Paket 14 — die Tastatur ist kein Zusatz', () => {
  it('macht jede Handlung zu einem echten Knopf mit Tastenkürzel', () => {
    const markup = markupOf(choice());
    expect(markup).not.toContain('<div role="button"');
    expect(markup).toContain('aria-keyshortcuts="Enter"');
    expect(markup).toContain('aria-keyshortcuts="Escape"');
    expect(markup).toContain(DRAW_DROP_ZONE_KEY_HINT);
    const buttons = markup.match(/<button type="button"/g) ?? [];
    expect(buttons).toHaveLength(4); // zwei Absichten + „route here" + verwerfen
    expect(markup.match(/tabindex="-1"/g) ?? []).toHaveLength(0);
  });

  it('bietet die Absichten der Matrix als Ziffern an — und verweigert „route here" ohne Wahl', () => {
    const markup = markupOf(choice());
    expect(markup).toContain('data-vgt-draw-drop-zone-choice="COPY"');
    expect(markup).toContain('data-vgt-draw-drop-zone-choice="LIVE_REFERENCE"');
    expect(markup).toContain('aria-keyshortcuts="1"');
    expect(markup).toContain('aria-keyshortcuts="2"');
    expect(markup).toContain(DRAW_DROP_INTENT_LABEL.COPY);
    expect(markup).toContain(DRAW_DROP_INTENT_LABEL.LIVE_REFERENCE);
    expect(markup).toContain('aria-disabled="true"');
  });

  it('nennt die aufgelöste Route mit Adapter, Absicht und beiden gelesenen Versionen', () => {
    const markup = markupOf(routed());
    expect(markup).toContain('data-vgt-draw-drop-zone="resolved"');
    expect(markup).toContain(DRAW_DROP_ZONE_PRESENTATION.resolved.headline);
    expect(markup).toContain('data-vgt-draw-drop-zone-route="draw-canvas-table"');
    expect(markup).toContain('data-vgt-draw-drop-zone-route-intent="COPY"');
    expect(markup).toContain('Route resolved via draw-canvas-table');
    expect(markup).toContain('source v3 → target v4');
    // **Paket 15:** die Art steht im Markup; bei einer **Kopie** fehlt der Modus **ganz** (kein heimlicher Default).
    expect(markup).toContain('data-vgt-draw-drop-zone-route-kind="copy"');
    expect(markup).toContain('data-vgt-draw-drop-zone-route-mode=""');
    expect(markup).toContain('· copy ·');
    // **Und Live mit gesagtem Modus** wird zugestellt — der Modus ist **sichtbar**, nicht geraten.
    const liveOnlyPayload = serializeWorkspaceDragPayload(createWorkspaceDragPayload({
      documentId: source.id,
      objectId: 'table-forecast',
      objectKind: 'Table',
      sourceApp: 'Grid',
      supportedIntents: ['LIVE_REFERENCE'],
    }));
    const liveContext = { ...route(liveOnlyPayload), requestedMode: 'Frozen' };
    const live = dropDrawDropZone(hoverDrawDropZone(createDrawDropZone(), liveContext).state, liveContext).state;
    const liveMarkup = markupOf(live);
    expect(liveMarkup).toContain('data-vgt-draw-drop-zone-route-kind="live"');
    expect(liveMarkup).toContain('data-vgt-draw-drop-zone-route-mode="Frozen"');
    expect(liveMarkup).toContain('· live (Frozen) ·');
    expect(markup).toContain('aria-disabled="true"'); // nichts mehr zu bestätigen
    // Und **keine** Behauptung einer Einfügung: der Resolver verändert kein Dokument.
    expect(markup).not.toContain('Placed');
    expect(markup).not.toContain('inserted');
  });

  it('bestätigt im Zustand „bereit" — der Knopf ist nicht abgeschaltet', () => {
    expect(markupOf(ready())).toContain('aria-disabled="false"');
  });
});

describe('Paket 14 — Touch ist entschieden und wird angezeigt', () => {
  it('trägt `manipulation`, nie `none`, und nennt Langdruck sowie die Zeichengeste', () => {
    const markup = markupOf(ready(), 'touch');
    expect(markup).toContain('touch-action');
    expect(markup).toContain(DRAW_DROP_ZONE_TOUCH_ACTION);
    expect(markup).not.toMatch(/touch-action:\s*none/);
    expect(markup).toContain('data-vgt-draw-drop-zone-input="touch"');
    expect(markup).toContain(String(drawDropZoneLongPressMs()));
    expect(markup).toContain('stays with the canvas');
  });

  it('nennt die Zeigerfreiheit, wenn die Tastatur bedient', () => {
    const markup = markupOf(ready(), 'keyboard');
    expect(markup).toContain('data-vgt-draw-drop-zone-input="keyboard"');
    expect(markup).toContain('data-vgt-draw-drop-zone-pointer-free="true"');
    expect(markup).toContain('no pointer');
  });

  it('ist ohne Zeiger bedienbar: die Zone steht **außerhalb** der Leinwand', () => {
    // Struktureller Nachweis am Markup: die Zone ist eine Geschwister-Schicht (`draw-drop-zone-layer`), kein
    // Kindknoten eines `<svg>`. *Ein DOM-Nachweis der Fokusreihenfolge wäre stärker — dafür fehlt der Browser;
    // das ist hier ausdrücklich ein Proxy und wird so berichtet.*
    const markup = markupOf(ready());
    expect(markup.indexOf('data-vgt-draw-drop-zone-canvas')).toBeGreaterThan(markup.indexOf('draw-drop-zone-layer'));
    expect(markup).toContain('data-vgt-draw-drop-zone-confirm');
    expect(markup).toContain('data-vgt-draw-drop-zone-dismiss');
  });
});
