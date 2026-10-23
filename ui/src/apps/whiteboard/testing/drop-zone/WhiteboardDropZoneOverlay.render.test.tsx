// STATUS: PLATIN — Integration & Release, **Paket 11**: der Markup-Vertrag der Whiteboard-Ablagezone
//
// Warum das hier steht: die annehmende Fläche des Whiteboards ist eine **Leinwand**, und der UI/UX-Standard
// verbietet wesentliche Funktion, die **nur** dort lebt (§8.6, §21.3, §32). Ein Ablageziel, das nur aus Pixeln
// besteht, ist für einen Screenreader **nicht vorhanden** — *das ist ein Befund, kein Detail*. Dieser Vertrag
// prüft deshalb das **echte DOM**: eine dauerhaft vorhandene Ansageregion, Zeichen und Worte statt Farbe, echte
// `<button type="button">` für jeden Weg ohne Zeiger, und die entschiedene Touch-Strategie im Markup.
//
// Was hier **nicht** geprüft ist: das **Binden** der Ereignisse (`useWhiteboardDropZone`) — dafür braucht es einen
// Browser. Das bleibt `NOT_TESTED` und wird so berichtet.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';
import {
  WorkspaceInteractionRegistry,
  createWorkspaceDragPayload,
  serializeWorkspaceDragPayload,
} from '../../../../shared/workspace-interaction';
import { createFabricWorkspaceObjectDragPayload } from '../../../../shell/fabric/fabricGraphWorkspaceDrop';
import { WhiteboardDropZoneOverlay } from '../../drop-zone/WhiteboardDropZoneOverlay';
import {
  chooseWhiteboardDropIntent,
  createWhiteboardDropZone,
  dropWhiteboardDropZone,
  hoverWhiteboardDropZone,
} from '../../drop-zone/whiteboardDropZone';
import type { WhiteboardDropZoneContext } from '../../drop-zone/whiteboardDropZone';
import {
  WHITEBOARD_DROP_INTENT_LABEL,
  WHITEBOARD_DROP_ZONE_IDLE_ANNOUNCEMENT,
  WHITEBOARD_DROP_ZONE_KEY_HINT,
  WHITEBOARD_DROP_ZONE_PRESENTATION,
} from '../../drop-zone/whiteboardDropZoneContract';
import type { WhiteboardDropZoneState } from '../../drop-zone/whiteboardDropZoneContract';
import { WHITEBOARD_DROP_ZONE_TOUCH_ACTION, whiteboardDropZoneLongPressMs } from '../../drop-zone/whiteboardDropZoneTouch';

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
  id: 'board-target',
  title: 'Workshop board',
  kind: 'Whiteboard',
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
/**
 * Ein Träger, den diese Matrix **nicht** trägt (Grid-`Chart`) — der „Route trägt nicht"-Fall für das Markup.
 *
 * **Warum nicht die Produktionsmatrix:** ihr Zustand ändert sich mit dem beantragten Whiteboard-Eintrag
 * (`['Table'] × ['COPY']`). Ein Markup-Vertrag, der an ihrem Inhalt hängt, wäre in der einen Welt grün und in der
 * anderen rot. Dieser Träger bleibt dagegen **immer** abgelehnt — und die Worte des Grundes sind dieselben.
 */
const chartPayload = serializeWorkspaceDragPayload(createWorkspaceDragPayload({
  documentId: source.id,
  objectId: 'table-forecast',
  objectKind: 'Chart',
  sourceApp: 'Grid',
  supportedIntents: ['COPY'],
}));

function boardRouteRegistry(): WorkspaceInteractionRegistry {
  const registry = new WorkspaceInteractionRegistry();
  registry.registerAppManifest({ app: 'Grid', exports: [{ objectKind: 'Table', intents: ['COPY', 'LIVE_REFERENCE'] }], imports: [] });
  registry.registerAppManifest({ app: 'Whiteboard', exports: [], imports: [{ objectKind: 'Table', intents: ['COPY', 'LIVE_REFERENCE'] }] });
  registry.registerAdapter({ id: 'whiteboard-board-table', targetApp: 'Whiteboard', objectKinds: ['Table'], intents: ['COPY', 'LIVE_REFERENCE'] });
  return registry.seal();
}

const ROUTE_REGISTRY = boardRouteRegistry();

const contextWith = (registry: WorkspaceInteractionRegistry | null | undefined, payload?: unknown): WhiteboardDropZoneContext => ({
  registry,
  targetApp: target.kind,
  targetDocumentId: target.id,
  documents,
  payload,
  // UEBERGANGSMARKER (W-455) in der **Pruefschicht**: dieser Vertrag bezeugt die **Anzeige**, nicht die Richtlinie ✓
  // — *die Zone liest die Entscheidung der Administratorrichtlinie aus ihrem Kontext* ✓✓. *In der Produktion holt
  // die Shell sie asynchron* (`precheckPolicy`) *und reicht sie hinein* ✓. **Der Richtlinien-Zeuge ist ein eigener
  // Vertrag** ✓✓: `src/testing/shared/workspace-interaction/workspacePolicyDecisionGate.w455.contract.test.mjs`.
  requestedPolicyDecision: { effect: 'Allow' },
});
const route = (payload?: unknown) => contextWith(ROUTE_REGISTRY, payload);

const markupOf = (state: WhiteboardDropZoneState, inputKind: 'mouse' | 'touch' | 'pen' | 'keyboard' = 'mouse'): string =>
  renderToStaticMarkup(
    <WhiteboardDropZoneOverlay
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
  const start = markup.indexOf('data-vgt-whiteboard-drop-zone-announcer');
  if (start < 0) throw new Error('Ansageregion fehlt');
  const begin = markup.lastIndexOf('<p', start);
  const end = markup.indexOf('</p>', start);
  return markup.slice(begin, end + '</p>'.length);
}

const ready = () => hoverWhiteboardDropZone(createWhiteboardDropZone(), route(oneIntentPayload)).state;
/** Der abgelehnte „überfahren"-Fall — **zustandsunabhängig** über einen Träger, den keine Route trägt. */
const openNoRoute = () => hoverWhiteboardDropZone(createWhiteboardDropZone(), route(chartPayload)).state;
const openUnreadable = () => hoverWhiteboardDropZone(createWhiteboardDropZone(), route(undefined)).state;
const choice = () => dropWhiteboardDropZone(ready(), route(twoIntentPayload)).state;
const delivered = () => dropWhiteboardDropZone(ready(), route(oneIntentPayload)).state;

describe('Paket 11 — die Ansageregion steht auch ohne Zone im DOM', () => {
  it('ist im leeren Zustand vorhanden, leer beschriftet und **nicht** versteckt', () => {
    const markup = markupOf(createWhiteboardDropZone());
    expect(markup).not.toBe('');
    const region = announcer(markup);
    expect(region).toContain('role="status"');
    expect(region).toContain('aria-live="assertive"');
    expect(region).toContain('aria-atomic="true"');
    expect(region).toContain(WHITEBOARD_DROP_ZONE_IDLE_ANNOUNCEMENT);
    expect(region).not.toContain('aria-hidden');
    expect(markup).not.toContain('<section');
    expect(markup).not.toContain('<button');
  });

  it('sagt Urteil, Vorschau und Grund an, sobald etwas über der Fläche ist', () => {
    const region = announcer(markupOf(openNoRoute()));
    expect(region).toContain(WHITEBOARD_DROP_ZONE_PRESENTATION.open.headline);
    expect(region).toContain('route-not-capable');
    expect(region).toContain('No registered route accepts this object at the Whiteboard.');
  });

  it('versteckt die Zone nicht hinter `aria-hidden` — sonst wäre sie für den Screenreader nicht vorhanden', () => {
    const markup = markupOf(ready());
    const section = zoneSection(markup);
    // Der **Abschnitt selbst** ist sichtbar für die Hilfstechnik …
    expect(section.slice(0, section.indexOf('>'))).not.toContain('aria-hidden');
    // … ebenso jede Aussage: Vorschau, Urteil, Zustellung, Grund.
    for (const part of ['__verdict', '__preview', '__reason', '__resolution', '__keys', '__input']) {
      const at = section.indexOf(part);
      if (at < 0) continue;
      expect(section.slice(section.lastIndexOf('<', at), section.indexOf('>', at)), part).not.toContain('aria-hidden');
    }
    // Genau **eine** Sache ist dekorativ versteckt: das Zeichen — und es steht zusätzlich als Wort und als
    // `data`-Attribut da, ist also nicht die einzige Aussage.
    expect((section.match(/aria-hidden="true"/g) ?? [])).toHaveLength(1);
    expect(section).toContain('data-vgt-whiteboard-drop-zone-glyph');
    expect(section).toContain('class="whiteboard-drop-zone__glyph"');
    expect(announcer(markup)).not.toContain('aria-hidden');
  });
});

describe('Paket 11 — Zustände ohne Farbe', () => {
  it('gibt jedem Zustand ein Zeichen, eine Rahmenform und Worte', () => {
    const states: readonly [string, WhiteboardDropZoneState][] = [
      ['open', openNoRoute()],
      ['ready', ready()],
      ['choice', choice()],
      ['refused', dropWhiteboardDropZone(createWhiteboardDropZone(), route('{kein json')).state],
      ['resolved', delivered()],
    ];
    const signatures = new Set<string>();
    const markups = new Set<string>();
    for (const [view, state] of states) {
      const presentation = WHITEBOARD_DROP_ZONE_PRESENTATION[view as keyof typeof WHITEBOARD_DROP_ZONE_PRESENTATION];
      const markup = markupOf(state);
      expect(markup, view).toContain(`data-vgt-whiteboard-drop-zone="${view}"`);
      expect(markup, view).toContain(`data-vgt-whiteboard-drop-zone-glyph="${presentation.glyph}"`);
      expect(markup, view).toContain(`data-vgt-whiteboard-drop-zone-pattern="${presentation.pattern}"`);
      expect(markup, view).toContain(presentation.headline);
      signatures.add(`${presentation.glyph}|${presentation.pattern}|${presentation.headline}`);
      markups.add(markup);
    }
    expect(signatures.size).toBe(states.length);
    expect(markups.size).toBe(states.length);
  });

  it('nennt das Urteil als Wort und den Grund als Code **und** als Satz', () => {
    const landed = markupOf(openNoRoute());
    expect(landed).toContain('data-vgt-whiteboard-drop-zone-verdict="reject"');
    expect(landed).toContain('Verdict: reject');
    expect(landed).toContain('data-vgt-whiteboard-drop-zone-reason="route-not-capable"');
    expect(landed).toContain('data-vgt-whiteboard-drop-zone-reason-text="route-not-capable"');
    expect(landed).toContain('Reason: route-not-capable · No registered route accepts this object at the Whiteboard.');
    // Ein abgelehntes Urteil zeigt **keinen** aktiven „ablegen"-Knopf.
    expect(landed).toContain('aria-disabled="true"');
  });

  it('unterscheidet „Träger nicht lesbar" von „Route trägt nicht" — zwei benannte Gründe', () => {
    const unreadable = markupOf(openUnreadable());
    expect(unreadable).toContain('data-vgt-whiteboard-drop-zone-transfer="whiteboard-drop-transfer-missing"');
    expect(unreadable).toContain('data-vgt-whiteboard-drop-zone-reason-text="whiteboard-drop-transfer-missing"');
    expect(unreadable).toContain('data-vgt-whiteboard-drop-zone-verdict="reject"');
    expect(unreadable).not.toBe(markupOf(openNoRoute()));
  });
});

describe('Paket 11 — die Vorschau kommt aus dem Urteil (Paket 6)', () => {
  it('rendert `preview.label` wörtlich und nennt die getragene Objektart', () => {
    const markup = markupOf(ready());
    expect(markup).toContain('data-vgt-whiteboard-drop-zone-preview="Table"');
    expect(markup).toContain('Preview: Table · COPY');
    expect(markup).toContain('data-vgt-whiteboard-drop-zone-verdict="accept"');
    expect(markup).toContain('data-vgt-whiteboard-drop-zone-transfer="read"');
  });

  it('zeigt keine Vorschau, wenn der Träger nicht gelesen werden konnte', () => {
    expect(markupOf(openUnreadable())).not.toContain('data-vgt-whiteboard-drop-zone-preview');
  });
});

describe('Paket 11 — die Tastatur ist kein Zusatz', () => {
  it('macht jede Handlung zu einem echten Knopf mit Tastenkürzel', () => {
    const markup = markupOf(choice());
    expect(markup).not.toContain('<div role="button"');
    expect(markup).not.toContain('onPointerDown');
    expect(markup).not.toContain('onMouseDown');
    expect(markup).not.toContain('onTouchStart');
    expect(markup).toContain('aria-keyshortcuts="Enter"');
    expect(markup).toContain('aria-keyshortcuts="Escape"');
    expect(markup).toContain(WHITEBOARD_DROP_ZONE_KEY_HINT);
    const buttons = markup.match(/<button type="button"/g) ?? [];
    expect(buttons).toHaveLength(4); // zwei Absichten + bestätigen + verwerfen
    expect(markup.match(/tabindex="-1"/g) ?? []).toHaveLength(0);
  });

  it('bietet die Absichten der Matrix als Ziffern an — und verweigert „bestätigen" ohne Wahl', () => {
    const markup = markupOf(choice());
    expect(markup).toContain('data-vgt-whiteboard-drop-zone-choice="COPY"');
    expect(markup).toContain('data-vgt-whiteboard-drop-zone-choice="LIVE_REFERENCE"');
    expect(markup).toContain('aria-keyshortcuts="1"');
    expect(markup).toContain('aria-keyshortcuts="2"');
    expect(markup).toContain(WHITEBOARD_DROP_INTENT_LABEL.COPY);
    expect(markup).toContain(WHITEBOARD_DROP_INTENT_LABEL.LIVE_REFERENCE);
    expect(markup).toContain('aria-disabled="true"');
  });

  it('nennt die erfolgreiche Zustellung mit Adapter, Absicht und beiden Versionen', () => {
    const markup = markupOf(delivered());
    expect(markup).toContain('data-vgt-whiteboard-drop-zone="resolved"');
    expect(markup).toContain('data-vgt-whiteboard-drop-zone-resolution="whiteboard-board-table"');
    expect(markup).toContain('data-vgt-whiteboard-drop-zone-resolution-intent="COPY"');
    expect(markup).toContain('source v3 → target v4');
    expect(markup).toContain('aria-disabled="true"'); // nichts mehr zu bestätigen
    // **Paket 15** ✓: die Behandlungsart steht sichtbar im Markup — und bei einer **Kopie** ist der Modus
    // **abwesend** (kein Platzhalter, kein heimlicher Default) ✓.
    expect(markup).toContain('data-vgt-whiteboard-drop-zone-resolution-kind="copy"');
    expect(markup).toContain('data-vgt-whiteboard-drop-zone-resolution-mode=""');
    expect(markup).toContain('· copy ·');
  });

  it('Paket 15 — die Zustellung **mit** Modus zeigt genau diesen Modus, nicht einen Default', () => {
    const choice = dropWhiteboardDropZone(ready(), route(twoIntentPayload)).state;
    const mitLive = chooseWhiteboardDropIntent(choice, 'LIVE_REFERENCE', { ...route(twoIntentPayload), requestedMode: 'Live' }).state;
    const liveMarkup = markupOf(mitLive);
    expect(liveMarkup).toContain('data-vgt-whiteboard-drop-zone-resolution-kind="live"');
    expect(liveMarkup).toContain('data-vgt-whiteboard-drop-zone-resolution-mode="Live"');
    expect(liveMarkup).toContain('· live (Live) ·');
    const mitFrozen = chooseWhiteboardDropIntent(choice, 'LIVE_REFERENCE', { ...route(twoIntentPayload), requestedMode: 'Frozen' }).state;
    const frozenMarkup = markupOf(mitFrozen);
    expect(frozenMarkup).toContain('data-vgt-whiteboard-drop-zone-resolution-mode="Frozen"');
    expect(frozenMarkup).toContain('· live (Frozen) ·');
    // Und **ohne** Modus gibt es keine Zustellung, sondern den benannten Grund als Wort ✓.
    const ohneModus = chooseWhiteboardDropIntent(choice, 'LIVE_REFERENCE', route(twoIntentPayload)).state;
    const refusalMarkup = markupOf(ohneModus);
    expect(refusalMarkup).toContain('data-vgt-whiteboard-drop-zone-reason-text="drop_live_mode_required"');
    expect(refusalMarkup).toContain('A live workspace reference requires an explicit Live or Frozen mode.');
    expect(refusalMarkup).not.toContain('data-vgt-whiteboard-drop-zone-resolution=');
  });

  it('bestätigt im Zustand „bereit" — der Knopf ist nicht abgeschaltet', () => {
    expect(markupOf(ready())).toContain('aria-disabled="false"');
  });
});

describe('Paket 11 — Touch ist entschieden und wird angezeigt', () => {
  it('trägt `manipulation`, nie `none`, und nennt den Langdruck in Worten', () => {
    const markup = markupOf(ready(), 'touch');
    expect(markup).toContain('touch-action');
    expect(markup).toContain(WHITEBOARD_DROP_ZONE_TOUCH_ACTION);
    expect(markup).not.toContain('touch-action:none');
    expect(markup).not.toContain('touch-action: none');
    expect(markup).toContain(`data-vgt-whiteboard-drop-zone-input="touch"`);
    expect(markup).toContain(String(whiteboardDropZoneLongPressMs()));
    expect(markup).toContain('pan and pinch-zoom stay with the board');
  });

  it('nennt die Zeigerfreiheit, wenn die Tastatur bedient', () => {
    const markup = markupOf(ready(), 'keyboard');
    expect(markup).toContain('data-vgt-whiteboard-drop-zone-input="keyboard"');
    expect(markup).toContain('data-vgt-whiteboard-drop-zone-pointer-free="true"');
    expect(markup).toContain('no pointer');
  });
});
