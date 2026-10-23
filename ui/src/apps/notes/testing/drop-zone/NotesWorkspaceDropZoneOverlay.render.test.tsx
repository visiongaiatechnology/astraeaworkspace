// STATUS: PLATIN — Integration & Release, **Paket 12**: der Markup-Vertrag der Notes-Ablagezone
//
// Warum das hier steht: der UI/UX-Standard verlangt für Drag & Drop eine **erkennbare** Zone (Zeichen, Rahmen,
// Worte), eine **Vorschau** aus dem Urteil, **unterscheidbare** Zustände ohne Farballeinigkeit, eine
// **Tastatur-Alternative** und eine **entschiedene** Touch-Strategie. Ein Ablageziel, das nur aus Pixeln besteht,
// ist für einen Screenreader **nicht vorhanden** — *das ist ein Befund, kein Detail*. Dieser Vertrag prüft deshalb
// das **echte DOM** (`renderToStaticMarkup`): eine dauerhaft vorhandene Ansageregion, Zeichen und Worte statt
// Farbe, echte `<button type="button">` für jeden Weg ohne Zeiger, und die entschiedene Touch-Strategie im Markup.
//
// Was hier **nicht** geprüft ist: das **Auslösen** der Ereignisse (`useNotesWorkspaceDropZone`) — dafür braucht es
// einen Browser. Das bleibt `NOT_TESTED` und wird so berichtet. Geprüft ist, **dass** die Region gebunden ist und
// **was** sie rendert.
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';
import {
  WorkspaceInteractionRegistry,
  createWorkspaceDragPayload,
  serializeWorkspaceDragPayload,
} from '../../../../shared/workspace-interaction';
import { createFabricWorkspaceObjectDragPayload } from '../../../../shell/fabric/fabricGraphWorkspaceDrop';
import { NotesWorkspaceDropZoneOverlay } from '../../drop-zone/NotesWorkspaceDropZoneOverlay';
import { NotesWorkspaceDropZoneSurface } from '../../drop-zone/NotesWorkspaceDropZoneSurface';
import {
  chooseNotesDropIntent,
  createNotesDropZone,
  dropNotesDropZone,
  hoverNotesDropZone,
} from '../../drop-zone/notesDropZone';
import type { NotesDropZoneContext } from '../../drop-zone/notesDropZone';
import {
  NOTES_DROP_INTENT_LABEL,
  NOTES_DROP_MODE_LABEL,
  NOTES_DROP_MODE_PROMPT,
  NOTES_DROP_MODES,
  NOTES_DROP_ZONE_KEY_HINT,
  NOTES_DROP_ZONE_PRESENTATION,
  NOTES_DROP_ZONE_SURFACES,
  notesDropZoneAnnouncerId,
  notesDropZoneIdleAnnouncement,
  notesDropZoneTargetLabel,
  notesDropZoneTitle,
} from '../../drop-zone/notesDropZoneContract';
import type { NotesDropZoneState, NotesDropZoneSurface } from '../../drop-zone/notesDropZoneContract';
import { NOTES_DROP_ZONE_TOUCH_ACTION, notesDropZoneLongPressMs } from '../../drop-zone/notesDropZoneTouch';
import { useNotesWorkspaceDropZone } from '../../drop-zone/useNotesWorkspaceDropZone';

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
  id: 'notes-target',
  title: 'Research notebook',
  kind: 'Notes',
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
/** **Nur** ein Live-Verweis — die schärfste Form der Modus-Frage (Paket 15). */
const liveOnlyPayload = serializeWorkspaceDragPayload(createWorkspaceDragPayload({
  documentId: source.id,
  objectId: 'table-forecast',
  objectKind: 'Table',
  sourceApp: 'Grid',
  supportedIntents: ['LIVE_REFERENCE'],
}));

function notesRouteRegistry(): WorkspaceInteractionRegistry {
  const registry = new WorkspaceInteractionRegistry();
  registry.registerAppManifest({ app: 'Grid', exports: [{ objectKind: 'Table', intents: ['COPY', 'LIVE_REFERENCE'] }], imports: [] });
  registry.registerAppManifest({ app: 'Notes', exports: [], imports: [{ objectKind: 'Table', intents: ['COPY', 'LIVE_REFERENCE'] }] });
  registry.registerAdapter({ id: 'notes-target-table', targetApp: 'Notes', objectKinds: ['Table'], intents: ['COPY', 'LIVE_REFERENCE'] });
  return registry.seal();
}

const ROUTE_REGISTRY = notesRouteRegistry();

const contextWith = (payload?: unknown, surface: unknown = 'canvas', requestedMode?: unknown): NotesDropZoneContext => ({
  registry: ROUTE_REGISTRY,
  targetApp: target.kind,
  targetDocumentId: target.id,
  documents,
  surface,
  payload,
  // **Paket 15:** nur **setzen**, wenn ein Modus gesagt wurde — *`undefined` wäre der heimliche Default.*
  ...(requestedMode === undefined ? {} : { requestedMode }),
  // UEBERGANGSMARKER (W-455) in der **Pruefschicht**: dieser Vertrag bezeugt die **Route**, nicht die Richtlinie
  // (bzw. die **Anzeige**), *die Zone liest die Entscheidung aus ihrem Kontext*; in der Produktion holt die
  // Shell sie asynchron (`precheckPolicy`) und reicht sie hinein. **Der Richtlinien-Zeuge ist ein eigener
  // Vertrag** (src/testing/shared/workspace-interaction/workspacePolicyDecisionGate.w455.contract.test.mjs).
  requestedPolicyDecision: { effect: 'Allow' },
});

const markupOf = (
  state: NotesDropZoneState,
  inputKind: 'mouse' | 'touch' | 'pen' | 'keyboard' = 'mouse',
  surface: NotesDropZoneSurface = 'canvas',
): string =>
  renderToStaticMarkup(
    <NotesWorkspaceDropZoneOverlay
      state={state}
      surface={surface}
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
  if (start < 0 || end < 0) throw new Error('Zonen-Abschnitt fehlt');
  return markup.slice(start, end + '</section>'.length);
}

/** Die Ansageregion — sie steht **immer** im DOM, auch ohne sichtbare Zone. */
function announcer(markup: string): string {
  const start = markup.indexOf('data-vgt-notes-drop-zone-announcer');
  if (start < 0) throw new Error('Ansageregion fehlt');
  const begin = markup.lastIndexOf('<p', start);
  const end = markup.indexOf('</p>', start);
  return markup.slice(begin, end + '</p>'.length);
}

const ready = (surface: unknown = 'canvas') => hoverNotesDropZone(createNotesDropZone(), contextWith(oneIntentPayload, surface)).state;
/** **Ohne** Autorität: die Fähigkeitsfrage ist unbeantwortbar → das Urteil ist fail-closed (Paket 6). */
const noAuthority = () => hoverNotesDropZone(createNotesDropZone(), {
  ...contextWith(oneIntentPayload),
  registry: null,
}).state;
const openUnreadable = () => hoverNotesDropZone(createNotesDropZone(), contextWith(undefined)).state;
const choice = (surface: unknown = 'canvas') => dropNotesDropZone(ready(surface), contextWith(twoIntentPayload, surface)).state;
const delivered = () => dropNotesDropZone(ready(), contextWith(oneIntentPayload)).state;
/** **Paket 15:** eine Zustellung **mit gesagtem Modus** — derselbe Weg, nur mit `requestedMode`. */
const deliveredLive = (mode: string) => chooseNotesDropIntent(
  createNotesDropZone(),
  'LIVE_REFERENCE',
  contextWith(liveOnlyPayload, 'canvas', mode),
).state;
const refused = () => dropNotesDropZone(createNotesDropZone(), contextWith('{kein json')).state;

/** Die gebundene Fläche — **der** Hook (Produktionsobjekt) mit **der** versiegelten Matrix der Shell. */
const Harness: React.FC<{ surface: NotesDropZoneSurface; children?: React.ReactNode }> = ({ surface, children }) => {
  const zone = useNotesWorkspaceDropZone({ targetDocument: target, documents });
  return <NotesWorkspaceDropZoneSurface surface={surface} zone={zone} className="flex-1">{children}</NotesWorkspaceDropZoneSurface>;
};

describe('Paket 12 — die Ansageregion steht auch ohne Zone im DOM', () => {
  it('ist im leeren Zustand vorhanden, leer beschriftet und **nicht** versteckt', () => {
    const markup = markupOf(createNotesDropZone());
    expect(markup).not.toBe('');
    const region = announcer(markup);
    expect(region).toContain('role="status"');
    expect(region).toContain('aria-live="assertive"');
    expect(region).toContain('aria-atomic="true"');
    expect(region).toContain('id="notes-drop-zone-announcer-canvas"');
    expect(region).toContain(notesDropZoneIdleAnnouncement('canvas'));
    expect(region).not.toContain('aria-hidden');
    expect(markup).not.toContain('<section');
    expect(markup).not.toContain('<button');
  });

  it('sagt Urteil, Vorschau und Grund an, sobald etwas über der Fläche ist', () => {
    const region = announcer(markupOf(noAuthority()));
    expect(region).toContain(NOTES_DROP_ZONE_PRESENTATION.open.headline);
    expect(region).toContain('verdict-unavailable');
    expect(region).toContain('The capability question could not be answered; the drop is refused.');
  });

  it('nennt die Fläche in der Ansage — zwei Regionen, keine mehrdeutige Ansage', () => {
    for (const surface of NOTES_DROP_ZONE_SURFACES) {
      const markup = markupOf(openUnreadable(), 'mouse', surface);
      const region = announcer(markup);
      expect(region, surface).toContain(`data-vgt-notes-drop-zone-announcer-surface="${surface}"`);
      expect(region, surface).toContain(surface === 'canvas' ? 'Notes canvas' : 'Notes page list');
    }
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
    expect(section).toContain('data-vgt-notes-drop-zone-glyph');
    expect(section).toContain('class="notes-drop-zone__glyph"');
    expect(announcer(markup)).not.toContain('aria-hidden');
  });
});

describe('Paket 12 — Zustände ohne Farbe', () => {
  it('gibt jedem Zustand ein Zeichen, eine Rahmenform und Worte', () => {
    const states: readonly [string, NotesDropZoneState][] = [
      ['open', openUnreadable()],
      ['ready', ready()],
      ['choice', choice()],
      ['refused', refused()],
      ['resolved', delivered()],
    ];
    const signatures = new Set<string>();
    const markups = new Set<string>();
    for (const [view, state] of states) {
      const presentation = NOTES_DROP_ZONE_PRESENTATION[view as keyof typeof NOTES_DROP_ZONE_PRESENTATION];
      const markup = markupOf(state);
      expect(markup, view).toContain(`data-vgt-notes-drop-zone="${view}"`);
      expect(markup, view).toContain(`data-vgt-notes-drop-zone-glyph="${presentation.glyph}"`);
      expect(markup, view).toContain(`data-vgt-notes-drop-zone-pattern="${presentation.pattern}"`);
      expect(markup, view).toContain(presentation.headline);
      signatures.add(`${presentation.glyph}|${presentation.pattern}|${presentation.headline}`);
      markups.add(markup);
    }
    expect(signatures.size).toBe(states.length);
    expect(markups.size).toBe(states.length);
  });

  it('nennt die Fläche als Wort, das Urteil als Wort und den Grund als Code **und** als Satz', () => {
    const landed = markupOf(openUnreadable());
    expect(landed).toContain('data-vgt-notes-drop-zone-surface-text="canvas"');
    expect(landed).toContain('Surface: Notes canvas');
    expect(landed).toContain('data-vgt-notes-drop-zone-verdict="reject"');
    expect(landed).toContain('Verdict: reject');
    expect(landed).toContain('data-vgt-notes-drop-zone-reason="notes-drop-transfer-missing"');
    expect(landed).toContain('data-vgt-notes-drop-zone-reason-text="notes-drop-transfer-missing"');
    expect(landed).toContain('Reason: notes-drop-transfer-missing · No workspace object was handed over.');
    // Ein abgelehntes Urteil zeigt **keinen** aktiven „ablegen"-Knopf.
    expect(landed).toContain('aria-disabled="true"');
  });

  it('unterscheidet die beiden Flächen im Markup, nicht nur im Farbton', () => {
    const canvas = markupOf(ready('canvas'), 'mouse', 'canvas');
    const list = markupOf(ready('page-list'), 'mouse', 'page-list');
    expect(canvas).not.toBe(list);
    expect(canvas).toContain('Surface: Notes canvas');
    expect(list).toContain('Surface: Notes page list');
    expect(list).toContain('data-vgt-notes-drop-zone-surface="page-list"');
    expect(list).toContain(`aria-label="${notesDropZoneTitle('page-list')}"`);
  });

  it('unterscheidet „Träger nicht lesbar" von „Träger gelesen" — zwei benannte Zustände', () => {
    const unreadable = markupOf(openUnreadable());
    const read = markupOf(ready());
    expect(unreadable).toContain('data-vgt-notes-drop-zone-transfer="notes-drop-transfer-missing"');
    expect(unreadable).toContain('data-vgt-notes-drop-zone-reason-text="notes-drop-transfer-missing"');
    expect(unreadable).toContain('data-vgt-notes-drop-zone-verdict="reject"');
    expect(read).toContain('data-vgt-notes-drop-zone-transfer="read"');
    expect(read).toContain('data-vgt-notes-drop-zone-verdict="accept"');
    expect(unreadable).not.toBe(read);
  });
});

describe('Paket 12 — die Vorschau kommt aus dem Urteil (Paket 6)', () => {
  it('rendert `preview.label` **wörtlich** und nennt die getragene Objektart', () => {
    const markup = markupOf(ready());
    expect(markup).toContain('data-vgt-notes-drop-zone-preview="Table"');
    expect(markup).toContain('Preview: Table · COPY');
    expect(markup).toContain('data-vgt-notes-drop-zone-verdict="accept"');
    expect(markup).toContain('data-vgt-notes-drop-zone-transfer="read"');
  });

  it('zeigt keine Vorschau, wenn der Träger nicht gelesen werden konnte', () => {
    expect(markupOf(openUnreadable())).not.toContain('data-vgt-notes-drop-zone-preview');
  });
});

describe('Paket 12 — die Tastatur ist kein Zusatz', () => {
  it('macht jede Handlung zu einem echten Knopf mit Tastenkürzel', () => {
    const markup = markupOf(choice());
    expect(markup).not.toContain('<div role="button"');
    expect(markup).not.toContain('onPointerDown');
    expect(markup).not.toContain('onMouseDown');
    expect(markup).not.toContain('onTouchStart');
    expect(markup).toContain('aria-keyshortcuts="Enter"');
    expect(markup).toContain('aria-keyshortcuts="Escape"');
    expect(markup).toContain(NOTES_DROP_ZONE_KEY_HINT);
    const buttons = markup.match(/<button type="button"/g) ?? [];
    // **Paket 15 — vorgezogen:** zwei Absichten + **zwei Modi** (Live/Frozen) + bestätigen + verwerfen.
    expect(buttons).toHaveLength(6);
    expect(markup.match(/tabindex="-1"/g) ?? []).toHaveLength(0);
  });

  it('bietet den Live-Modus als **echte Wahl** an — Live und Frozen, ohne heimlichen Default (Paket 15)', () => {
    const markup = markupOf(choice());
    expect(markup).toContain('data-vgt-notes-drop-zone-mode-prompt="true"');
    expect(markup).toContain(NOTES_DROP_MODE_PROMPT);
    for (const mode of NOTES_DROP_MODES) {
      expect(markup, mode).toContain(`data-vgt-notes-drop-zone-mode="${mode}"`);
      expect(markup, mode).toContain(NOTES_DROP_MODE_LABEL[mode]);
    }
    // Die zwei Modi sind genau die zwei, die der Resolver kennt — *keine dritte, keine zweite Liste.*
    expect([...NOTES_DROP_MODES]).toEqual(['Live', 'Frozen']);
    // Und die Wörter sind die **vorhandenen**: Live-Verweis und eingefrorene Momentaufnahme.
    expect(NOTES_DROP_MODE_LABEL.Live).toBe(NOTES_DROP_INTENT_LABEL.LIVE_REFERENCE);
    expect(NOTES_DROP_MODE_LABEL.Frozen).toBe(NOTES_DROP_INTENT_LABEL.FROZEN_SNAPSHOT);
    // Wo **keine** Live-Route im Spiel ist, wird auch nicht gefragt — *ein Knopf ohne Wirkung wäre eine Lüge.*
    expect(markupOf(ready())).not.toContain('data-vgt-notes-drop-zone-mode=');
    expect(markupOf(delivered())).not.toContain('data-vgt-notes-drop-zone-mode=');
  });

  it('bietet die Absichten der Matrix als Ziffern an — und verweigert „bestätigen" ohne Wahl', () => {
    const markup = markupOf(choice());
    expect(markup).toContain('data-vgt-notes-drop-zone-choice="COPY"');
    expect(markup).toContain('data-vgt-notes-drop-zone-choice="LIVE_REFERENCE"');
    expect(markup).toContain('aria-keyshortcuts="1"');
    expect(markup).toContain('aria-keyshortcuts="2"');
    expect(markup).toContain(NOTES_DROP_INTENT_LABEL.COPY);
    expect(markup).toContain(NOTES_DROP_INTENT_LABEL.LIVE_REFERENCE);
    expect(markup).toContain('aria-disabled="true"');
  });

  it('nennt die erfolgreiche Zustellung mit Adapter, Absicht und beiden Versionen', () => {
    const markup = markupOf(delivered());
    expect(markup).toContain('data-vgt-notes-drop-zone="resolved"');
    expect(markup).toContain('data-vgt-notes-drop-zone-resolution="notes-target-table"');
    expect(markup).toContain('data-vgt-notes-drop-zone-resolution-intent="COPY"');
    // **Paket 15 — vorgezogen:** die Zustellung nennt die neuen Tatsachen. Eine **Kopie** trägt `copy` und
    // **keinen** Modus — das leere `data`-Attribut ist der sichtbare Beleg dafür, dass nichts gesetzt wurde.
    expect(markup).toContain('data-vgt-notes-drop-zone-resolution-kind="copy"');
    expect(markup).toContain('data-vgt-notes-drop-zone-resolution-mode=""');
    expect(markup).toContain('· copy ·');
    expect(markup).toContain('source v3 → target v4');
    expect(markup).toContain('aria-disabled="true"'); // nichts mehr zu bestätigen
  });

  it('nennt den **gesagten** Modus eines Live-Verweises (Paket 15)', () => {
    for (const mode of NOTES_DROP_MODES) {
      const markup = markupOf(deliveredLive(mode));
      expect(markup, mode).toContain('data-vgt-notes-drop-zone-resolution-kind="live"');
      expect(markup, mode).toContain(`data-vgt-notes-drop-zone-resolution-mode="${mode}"`);
      expect(markup, mode).toContain(`· live (${mode}) ·`);
    }
    // Zwei Modi, zwei **verschiedene** Aussagen — *kein Zustand, der nur im Farbton anders wäre.*
    expect(markupOf(deliveredLive('Live'))).not.toBe(markupOf(deliveredLive('Frozen')));
  });

  it('bestätigt im Zustand „bereit" — der Knopf ist nicht abgeschaltet', () => {
    expect(markupOf(ready())).toContain('aria-disabled="false"');
  });
});

describe('Paket 12 — Touch ist entschieden und wird angezeigt', () => {
  it('trägt `manipulation`, nie `none`, und nennt den Langdruck in Worten', () => {
    const markup = markupOf(ready(), 'touch');
    expect(markup).toContain(`data-vgt-notes-drop-zone-input="touch"`);
    expect(markup).toContain(String(notesDropZoneLongPressMs()));
    expect(markup).toContain('panning and pinch-zoom stay with the canvas');
    expect(markup).toContain(`touch-action: ${NOTES_DROP_ZONE_TOUCH_ACTION}`);
  });

  it('setzt die Entscheidung auf der **gebundenen** Fläche — `manipulation`, nie `none`', () => {
    const markup = renderToStaticMarkup(<Harness surface="canvas"><p>Leinwand</p></Harness>);
    expect(markup).toContain(`touch-action:${NOTES_DROP_ZONE_TOUCH_ACTION}`);
    expect(markup).not.toContain('touch-action:none');
    expect(markup).not.toContain('touch-action: none');
    expect(markup).toContain('Leinwand');
  });

  it('nennt die Zeigerfreiheit, wenn die Tastatur bedient', () => {
    const markup = markupOf(ready(), 'keyboard');
    expect(markup).toContain('data-vgt-notes-drop-zone-input="keyboard"');
    expect(markup).toContain('data-vgt-notes-drop-zone-pointer-free="true"');
    expect(markup).toContain('no pointer');
  });
});

describe('Paket 12 — die Fläche ist gebunden und per Tastatur erreichbar', () => {
  it('bindet die Region mit Namen, Beschreibung und Fokus — **ohne** Zeiger', () => {
    for (const surface of NOTES_DROP_ZONE_SURFACES) {
      const markup = renderToStaticMarkup(<Harness surface={surface}><p>{`Kind ${surface}`}</p></Harness>);
      expect(markup, surface).toContain('role="group"');
      expect(markup, surface).toContain(`aria-label="${notesDropZoneTargetLabel(surface)}"`);
      expect(markup, surface).toContain(`aria-describedby="${notesDropZoneAnnouncerId(surface)}"`);
      expect(markup, surface).toContain(`id="${notesDropZoneAnnouncerId(surface)}"`);
      expect(markup, surface).toContain('tabindex="0"');
      expect(markup, surface).toContain(`data-vgt-notes-drop-zone-target="${surface}"`);
      // Die Ansageregion steht auch hier — sonst wäre das `aria-describedby` ein toter Verweis.
      expect(markup, surface).toContain(notesDropZoneIdleAnnouncement(surface));
      expect(markup, surface).toContain(`Kind ${surface}`);
    }
  });

  it('rendert **ohne** Bindung nichts außer den Kindern — eine Fläche ohne Zone ist keine Zone', () => {
    const bare = renderToStaticMarkup(
      <NotesWorkspaceDropZoneSurface surface="page-list">
        <p>Nur die Liste</p>
      </NotesWorkspaceDropZoneSurface>,
    );
    expect(bare).toBe('<p>Nur die Liste</p>');
    expect(bare).not.toContain('notes-drop-zone');
  });

  it('beginnt **keine** Zeigergeste auf der Fläche — nur die Zeigerart wird gelesen', () => {
    const markup = renderToStaticMarkup(<Harness surface="page-list"><p>Liste</p></Harness>);
    // Der Beobachter ist kein Zug: nichts davon darf im Markup stehen.
    expect(markup).not.toContain('setPointerCapture');
    expect(markup).not.toContain('onpointermove');
    expect(markup).not.toContain('draggable="true"');
  });
});
