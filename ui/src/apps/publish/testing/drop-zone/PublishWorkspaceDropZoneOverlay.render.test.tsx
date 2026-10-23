// STATUS: PLATIN — Integration & Release, **Paket 13**: der Markup-Vertrag der Publish-Ablagezone
//
// Was hier geprüft wird, ist die **gerenderte Zusage** — und zwar gegen **Produktionsobjekte**: eine echte
// `WorkspaceInteractionRegistry` mit Publish-Route, der echte Parser (Paket 7), das echte Ablageurteil (Paket 6)
// und die echte versiegelte Matrix der Shell. *Ein Attrappen-Zustand würde beweisen, dass die Ansicht Attrappen
// rendern kann.*
//
// Die fünf Punkte des Standards (§12.3) stehen hier als **DOM**-Nachweis:
//   1. erkennbare Zone — vier Eckwinkel, eine Strichart, ein Zeichen, Wörter; **keine** Aussage ist ein Farbton;
//   2. Vorschau — `preview.label` **wörtlich**;
//   3. erlaubt / unerlaubt als **benannter** Zustand (`verdict` als Wort und als `data`-Attribut);
//   4. Tastatur — echte `<button type="button">` mit `aria-keyshortcuts`, **keiner** `disabled`;
//   5. Touch — `manipulation`, **nie** `none`, mit benannten Zahlen aus Paket 6.
//
// Was hier **nicht** geprüft ist: das **Binden** der Ereignisse (`usePublishWorkspaceDropZone`), die echte Geste
// und `touch-action` auf einem Gerät — dafür braucht es einen Browser. Das bleibt `NOT_TESTED`.
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
  FABRIC_WORKSPACE_OBJECT_DRAG_MIME,
  createFabricWorkspaceObjectDragPayload,
} from '../../../../shell/fabric/fabricGraphWorkspaceDrop';
import { PublishWorkspaceDropZoneOverlay } from '../../drop-zone/PublishWorkspaceDropZoneOverlay';
import {
  claimPublishWorkspaceDropZone,
  createPublishWorkspaceDropZone,
  dropPublishWorkspaceDropZone,
  hoverPublishWorkspaceDropZone,
  publishWorkspaceDropZonePreview,
} from '../../drop-zone/publishWorkspaceDropZone';
import type { PublishWorkspaceDropZoneContext } from '../../drop-zone/publishWorkspaceDropZone';
import {
  PUBLISH_WORKSPACE_DROP_INTENT_LABEL,
  PUBLISH_WORKSPACE_DROP_ZONE_IDLE_ANNOUNCEMENT,
  PUBLISH_WORKSPACE_DROP_ZONE_KEY_HINT,
  PUBLISH_WORKSPACE_DROP_ZONE_PRESENTATION,
  PUBLISH_WORKSPACE_DROP_ZONE_TITLE,
} from '../../drop-zone/publishWorkspaceDropZoneContract';
import type { PublishWorkspaceDropZoneState } from '../../drop-zone/publishWorkspaceDropZoneContract';
import {
  PUBLISH_WORKSPACE_DROP_ZONE_TOUCH_ACTION,
  publishWorkspaceDropZoneLongPressMs,
  publishWorkspaceDropZoneTouchThresholdPx,
} from '../../drop-zone/publishWorkspaceDropZoneTouch';

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
  id: 'publish-target',
  title: 'Annual report',
  kind: 'Publish',
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

function publishRouteRegistry(): WorkspaceInteractionRegistry {
  const registry = new WorkspaceInteractionRegistry();
  registry.registerAppManifest({ app: 'Grid', exports: [{ objectKind: 'Table', intents: ['COPY', 'LIVE_REFERENCE'] }], imports: [] });
  registry.registerAppManifest({ app: 'Publish', exports: [], imports: [{ objectKind: 'Table', intents: ['COPY', 'LIVE_REFERENCE'] }] });
  registry.registerAdapter({ id: 'publish-page-table', targetApp: 'Publish', objectKinds: ['Table'], intents: ['COPY', 'LIVE_REFERENCE'] });
  return registry.seal();
}

const ROUTE_REGISTRY = publishRouteRegistry();

const contextWith = (registry: WorkspaceInteractionRegistry | null | undefined, payload?: unknown): PublishWorkspaceDropZoneContext => ({
  registry,
  targetApp: target.kind,
  targetDocumentId: target.id,
  documents,
  payload,
  // UEBERGANGSMARKER (W-455) in der **Pruefschicht**: dieser Vertrag bezeugt die **Route**, nicht die Richtlinie
  // (bzw. die **Anzeige**), *die Zone liest die Entscheidung aus ihrem Kontext*; in der Produktion holt die
  // Shell sie asynchron (`precheckPolicy`) und reicht sie hinein. **Der Richtlinien-Zeuge ist ein eigener
  // Vertrag** (src/testing/shared/workspace-interaction/workspacePolicyDecisionGate.w455.contract.test.mjs).
  requestedPolicyDecision: { effect: 'Allow' },
});
const route = (payload?: unknown) => contextWith(ROUTE_REGISTRY, payload);
const authority = (payload?: unknown) => contextWith(FABRIC_WORKSPACE_DROP_REGISTRY, payload);

const markupOf = (state: PublishWorkspaceDropZoneState, inputKind: 'mouse' | 'touch' | 'pen' | 'keyboard' = 'mouse'): string =>
  renderToStaticMarkup(
    <PublishWorkspaceDropZoneOverlay
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
  const start = markup.indexOf('data-vgt-publish-drop-zone-announcer');
  if (start < 0) throw new Error('Ansageregion fehlt');
  const begin = markup.lastIndexOf('<p', start);
  const end = markup.indexOf('</p>', start);
  return markup.slice(begin, end + '</p>'.length);
}

const ready = () => hoverPublishWorkspaceDropZone(createPublishWorkspaceDropZone(), route(oneIntentPayload)).state;
/**
 * **Ein Träger, den die Autorität auch nach dem Publish-Eintrag ablehnt** — die Dokumentliste führt die **Quelle**
 * nicht, also kann der Resolver die Identität nicht prüfen und Paket 6 fällt auf den **benannten**
 * `route-not-capable` zurück. *Diesen Zustand gibt es **vor und nach** dem Matrix-Eintrag — deshalb bleiben die
 * „erlaubt / unerlaubt"-Zusicherungen dieses Vertrags unverändert gültig und werden nicht gelockert.*
 */
const openNoRoute = () => hoverPublishWorkspaceDropZone(
  createPublishWorkspaceDropZone(),
  { ...authority(oneIntentPayload), documents: { [target.id]: target } },
).state;
/** Der heute **einzige** Weg zu einer sichtbaren Zone im Browser: die MIME-Ankündigung, ohne lesbaren Inhalt. */
const claimed = () =>
  claimPublishWorkspaceDropZone(createPublishWorkspaceDropZone(), route(), { types: [FABRIC_WORKSPACE_OBJECT_DRAG_MIME] }).state;
const choice = () => dropPublishWorkspaceDropZone(ready(), route(twoIntentPayload)).state;
const delivered = () => dropPublishWorkspaceDropZone(ready(), route(oneIntentPayload)).state;
const refused = () => dropPublishWorkspaceDropZone(createPublishWorkspaceDropZone(), route('{kein json')).state;

describe('Paket 13 — die Ansageregion steht auch ohne Zone im DOM', () => {
  it('ist im leeren Zustand vorhanden, leer beschriftet und **nicht** versteckt', () => {
    const markup = markupOf(createPublishWorkspaceDropZone());
    expect(markup).not.toBe('');
    const region = announcer(markup);
    expect(region).toContain('role="status"');
    expect(region).toContain('aria-live="assertive"');
    expect(region).toContain('aria-atomic="true"');
    expect(region).toContain(PUBLISH_WORKSPACE_DROP_ZONE_IDLE_ANNOUNCEMENT);
    expect(region).not.toContain('aria-hidden');
    expect(markup).not.toContain('<section');
    expect(markup).not.toContain('<button');
  });

  it('sagt Urteil, Vorschau und Grund an, sobald etwas über der Fläche ist', () => {
    const region = announcer(markupOf(openNoRoute()));
    expect(region).toContain(PUBLISH_WORKSPACE_DROP_ZONE_PRESENTATION.open.headline);
    expect(region).toContain('route-not-capable');
    expect(region).toContain('No registered route accepts this object at the Publish surface.');
  });

  it('sagt auch den **geschützten** Träger an — mit dem eigenen Grund, nicht mit „fehlt"', () => {
    const region = announcer(markupOf(claimed()));
    expect(region).toContain(PUBLISH_WORKSPACE_DROP_ZONE_PRESENTATION.open.headline);
    expect(region).toContain('publish-drop-transfer-protected');
    expect(region).not.toContain('publish-drop-transfer-missing');
  });

  it('versteckt die Zone nicht hinter `aria-hidden` — sonst wäre sie für den Screenreader nicht vorhanden', () => {
    const markup = markupOf(ready());
    const section = zoneSection(markup);
    // Der **Abschnitt selbst** ist sichtbar für die Hilfstechnik …
    expect(section.slice(0, section.indexOf('>'))).not.toContain('aria-hidden');
    // … ebenso jede Aussage: Vorschau, Urteil, Grund, Zustellung, Tasten, Eingabe.
    for (const part of ['__verdict-text', '__preview', '__reason-text', '__resolution', '__keys', '__input']) {
      const at = section.indexOf(`data-vgt-publish-drop-zone${part}`);
      if (at < 0) continue;
      expect(section.slice(section.lastIndexOf('<', at), section.indexOf('>', at)), part).not.toContain('aria-hidden');
    }
    expect(announcer(markup)).not.toContain('aria-hidden');
    // Genau **fünf** Dinge sind dekorativ: die vier Eckwinkel und das Zeichen. *Das Zeichen steht zusätzlich als
    // `data`-Attribut und die Aussage als Wort da — es ist nicht die einzige Aussage.*
    expect(section.match(/aria-hidden="true"/g) ?? []).toHaveLength(5);
  });
});

describe('Paket 13 — Zustände ohne Farbe', () => {
  it('gibt jedem Zustand ein Zeichen, eine Rahmenform und Worte', () => {
    const states: readonly [string, PublishWorkspaceDropZoneState][] = [
      ['open', openNoRoute()],
      ['ready', ready()],
      ['choice', choice()],
      ['refused', refused()],
      ['resolved', delivered()],
    ];
    const signatures = new Set<string>();
    const markups = new Set<string>();
    for (const [view, state] of states) {
      const presentation = PUBLISH_WORKSPACE_DROP_ZONE_PRESENTATION[view as keyof typeof PUBLISH_WORKSPACE_DROP_ZONE_PRESENTATION];
      const markup = markupOf(state);
      expect(markup, view).toContain(`data-vgt-publish-drop-zone="${view}"`);
      expect(markup, view).toContain(`data-vgt-publish-drop-zone-glyph="${presentation.glyph}"`);
      expect(markup, view).toContain(`data-vgt-publish-drop-zone-pattern="${presentation.pattern}"`);
      expect(markup, view).toContain(presentation.headline);
      signatures.add(`${presentation.glyph}|${presentation.pattern}|${presentation.headline}`);
      markups.add(markup);
    }
    expect(signatures.size).toBe(states.length);
    expect(markups.size).toBe(states.length);
  });

  it('zeichnet die Rahmenform als **Strichart** — vier Eckwinkel, und keine Aussage ist ein Farbton', () => {
    // Die Strichart ist die Form des Zustands; die Farbklassen daneben sind Verstärkung.
    expect(zoneSection(markupOf(ready()))).toContain('border-solid');
    expect(zoneSection(markupOf(choice()))).toContain('border-double');
    expect(zoneSection(markupOf(refused()))).toContain('border-dashed');
    // Vier Eckwinkel in jedem sichtbaren Zustand — die Zone ist auch ohne jeden Farbton erkennbar.
    for (const state of [openNoRoute(), ready(), choice(), refused(), delivered()]) {
      expect(zoneSection(markupOf(state)).match(/absolute h-3 w-3/g) ?? []).toHaveLength(4);
    }
  });

  it('nennt das Urteil als Wort und den Grund als Code **und** als Satz', () => {
    const landed = markupOf(openNoRoute());
    expect(landed).toContain('data-vgt-publish-drop-zone-verdict="reject"');
    expect(landed).toContain('Verdict: reject');
    expect(landed).toContain('data-vgt-publish-drop-zone-reason="route-not-capable"');
    expect(landed).toContain('data-vgt-publish-drop-zone-reason-text="route-not-capable"');
    expect(landed).toContain('Reason: route-not-capable · No registered route accepts this object at the Publish surface.');
    // Ein abgelehntes Urteil zeigt **keinen** aktiven „ablegen"-Knopf — aber einen erreichbaren.
    expect(landed).toContain('aria-disabled="true"');
    // Und es trägt eine **Schraffur** (Form, kein Farbton).
    expect(landed).toContain('data-vgt-publish-drop-zone-hatch="true"');
  });

  it('unterscheidet „Träger nicht lesbar" von „Route trägt nicht" — zwei benannte Gründe', () => {
    const protectedContent = markupOf(claimed());
    expect(protectedContent).toContain('data-vgt-publish-drop-zone-transfer="publish-drop-transfer-protected"');
    expect(protectedContent).toContain('data-vgt-publish-drop-zone-reason-text="publish-drop-transfer-protected"');
    expect(protectedContent).toContain('data-vgt-publish-drop-zone-verdict="reject"');
    expect(protectedContent).not.toBe(markupOf(openNoRoute()));
  });
});

describe('Paket 13 — die Vorschau kommt aus dem Urteil (Paket 6)', () => {
  it('rendert `preview.label` **wörtlich** und nennt die getragene Objektart', () => {
    const state = ready();
    const label = publishWorkspaceDropZonePreview(state)?.label;
    expect(label).toBe('Table · COPY');
    const markup = markupOf(state);
    expect(markup).toContain('data-vgt-publish-drop-zone-preview="Table"');
    // **Wörtlich**: der Text aus dem Urteil steht unverändert zwischen den Marken — nicht neu formuliert.
    expect(markup).toContain(`>${label}</span>`);
    expect(markup).toContain('data-vgt-publish-drop-zone-verdict="accept"');
    expect(markup).toContain('data-vgt-publish-drop-zone-transfer="read"');
  });

  it('zeigt nach der **Ablehnung** weiterhin die Vorschau — der Nutzer sieht, was nicht ankam', () => {
    const state = openNoRoute();
    expect(publishWorkspaceDropZonePreview(state)?.label).toBe('Table · COPY');
    const markup = markupOf(state);
    expect(markup).toContain('data-vgt-publish-drop-zone-preview-label="true"');
    expect(markup).toContain('>Table · COPY</span>');
  });

  it('zeigt keine Vorschau, wenn der Träger nicht gelesen werden konnte', () => {
    expect(markupOf(claimed())).not.toContain('data-vgt-publish-drop-zone-preview');
  });
});

describe('Paket 13 — die Tastatur ist kein Zusatz', () => {
  it('macht jede Handlung zu einem echten Knopf mit Tastenkürzel', () => {
    const markup = markupOf(choice());
    expect(markup).not.toContain('<div role="button"');
    expect(markup).not.toContain('onPointerDown');
    expect(markup).not.toContain('onMouseDown');
    expect(markup).not.toContain('onTouchStart');
    expect(markup).toContain('aria-keyshortcuts="Enter"');
    expect(markup).toContain('aria-keyshortcuts="Escape"');
    expect(markup).toContain(PUBLISH_WORKSPACE_DROP_ZONE_KEY_HINT);
    const buttons = markup.match(/<button type="button"/g) ?? [];
    expect(buttons).toHaveLength(4); // zwei Absichten + bestätigen + verwerfen
    expect(markup.match(/tabindex="-1"/g) ?? []).toHaveLength(0);
    // Ein `disabled`-Knopf wäre **nicht erreichbar** und könnte seinen Grund nicht ansagen — `aria-disabled` sagt
    // an, dass er nichts ausrichten würde, ohne den Weg zu versperren.
    expect(markup).not.toMatch(/<button[^>]*\sdisabled/);
  });

  it('bietet die Absichten der Matrix als Ziffern an — und verweigert „bestätigen" ohne Wahl', () => {
    const markup = markupOf(choice());
    expect(markup).toContain('data-vgt-publish-drop-zone-choice="COPY"');
    expect(markup).toContain('data-vgt-publish-drop-zone-choice="LIVE_REFERENCE"');
    expect(markup).toContain('aria-keyshortcuts="1"');
    expect(markup).toContain('aria-keyshortcuts="2"');
    expect(markup).toContain(PUBLISH_WORKSPACE_DROP_INTENT_LABEL.COPY);
    expect(markup).toContain(PUBLISH_WORKSPACE_DROP_INTENT_LABEL.LIVE_REFERENCE);
    expect(markup).toContain('aria-disabled="true"');
  });

  it('nennt die erfolgreiche Zustellung mit Adapter, Absicht, **Integrationsart** und beiden Versionen', () => {
    const markup = markupOf(delivered());
    expect(markup).toContain('data-vgt-publish-drop-zone="resolved"');
    expect(markup).toContain('data-vgt-publish-drop-zone-resolution="publish-page-table"');
    expect(markup).toContain('data-vgt-publish-drop-zone-resolution-intent="COPY"');
    expect(markup).toContain(`source v3 → target v4`);
    expect(markup).toContain(PUBLISH_WORKSPACE_DROP_INTENT_LABEL.COPY);
    expect(markup).toContain('aria-disabled="true"'); // nichts mehr zu bestätigen
    // **Paket 15, vorgezogen:** die Zustellung sagt jetzt, **wie** die Quelle behandelt wird — und eine **Kopie**
    // trägt **keinen** Modus. *Ein hier eingesetztes „Live" wäre der heimliche Default.*
    expect(markup).toContain('data-vgt-publish-drop-zone-resolution-kind="copy"');
    expect(markup).toContain('data-vgt-publish-drop-zone-resolution-mode=""');
    expect(markup).toContain('· Copy ·');

    // Und der Live-Fall **mit** Modus: eigener Zustand, eigene Worte, eigener Modus — kein Farbton.
    const livePayload = serializeWorkspaceDragPayload(createWorkspaceDragPayload({
      documentId: source.id,
      objectId: 'table-forecast',
      objectKind: 'Table',
      sourceApp: 'Grid',
      supportedIntents: ['LIVE_REFERENCE'],
    }));
    const liveContext = { ...route(livePayload), requestedMode: 'Live' as const };
    const liveState = dropPublishWorkspaceDropZone(
      hoverPublishWorkspaceDropZone(createPublishWorkspaceDropZone(), liveContext).state,
      liveContext,
    ).state;
    const liveMarkup = markupOf(liveState);
    expect(liveMarkup).toContain('data-vgt-publish-drop-zone-resolution-kind="live"');
    expect(liveMarkup).toContain('data-vgt-publish-drop-zone-resolution-mode="Live"');
    expect(liveMarkup).toContain('Live reference (Live)');
    expect(liveMarkup).toContain('data-vgt-publish-drop-zone="resolved"');
  });

  it('bestätigt im Zustand „bereit" — der Knopf ist nicht abgeschaltet', () => {
    expect(markupOf(ready())).toContain('aria-disabled="false"');
  });

  it('nennt die Zone mit einem zugänglichen Namen und die Fläche als `region`', () => {
    const section = zoneSection(markupOf(ready()));
    expect(section).toContain(`aria-label="${PUBLISH_WORKSPACE_DROP_ZONE_TITLE}"`);
  });
});

describe('Paket 13 — Touch ist entschieden und wird angezeigt', () => {
  it('trägt `manipulation`, nie `none`, und nennt den Langdruck in Worten', () => {
    const markup = markupOf(ready(), 'touch');
    expect(markup).toContain('touch-action');
    expect(markup).toContain(PUBLISH_WORKSPACE_DROP_ZONE_TOUCH_ACTION);
    expect(markup).not.toContain('touch-action:none');
    expect(markup).not.toContain('touch-action: none');
    expect(markup).toContain('data-vgt-publish-drop-zone-input="touch"');
    expect(markup).toContain(String(publishWorkspaceDropZoneLongPressMs()));
    expect(markup).toContain(String(publishWorkspaceDropZoneTouchThresholdPx()));
    expect(markup).toContain('pan and pinch-zoom stay with the page surface');
    // Der Systemabbruch ist **benannt** und steht als Entscheidung im Markup.
    expect(markup).toContain('data-vgt-publish-drop-zone-touch-cancel="pointer-lost"');
    expect(markup).toContain('data-vgt-publish-drop-zone-touch-longpress-ms="' + String(publishWorkspaceDropZoneLongPressMs()) + '"');
  });

  it('nennt die Zeigerfreiheit, wenn die Tastatur bedient', () => {
    const markup = markupOf(ready(), 'keyboard');
    expect(markup).toContain('data-vgt-publish-drop-zone-input="keyboard"');
    expect(markup).toContain('data-vgt-publish-drop-zone-pointer-free="true"');
    expect(markup).toContain('no pointer');
  });
});
