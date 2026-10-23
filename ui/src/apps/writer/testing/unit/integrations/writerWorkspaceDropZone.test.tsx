// STATUS: PLATIN — Integration & Release, **Paket 9**: Beweise für das Writer-Ablageziel
//
// Was hier **wirklich** geprüft wird ✓: der reine Zustand ✓, die Zustellung durch die **vorhandene** Matrix ✓,
// der Tastatur-Weg als Absicht ✓, die Fail-closed-Gründe ✓, die Touch-Entscheidung ✓ und das **Markup** ✓.
//
// Was hier **nicht** geprüft werden kann ✗ und deshalb `NOT_TESTED` bleibt ✓: das **Binden** der
// Zeiger-/Tastenereignisse an die Fläche ✓ (`useWriterWorkspaceDropZone` ✓) — dafür braucht es einen Browser
// mit echten Ereignissen ✓, den diese Umgebung nicht hat ✓. *Ein Test, der eine Bindung behauptet, ohne sie
// auszulösen, wäre eine Behauptung* ✓.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../../../../shared/contracts/workspace';
import {
  createWorkspaceDragPayload,
  serializeWorkspaceDragPayload,
} from '../../../../../shared/workspace-interaction';
import {
  beginDrag,
  cancelDrag,
  createDragSession,
  moveDrag,
  DRAG_THRESHOLD_PX,
} from '../../../../../shell/workspace/drag/dragSession';
import {
  FABRIC_WORKSPACE_OBJECT_DRAG_MIME,
  createFabricWorkspaceObjectDragPayload,
} from '../../../../../shell/fabric/fabricGraphWorkspaceDrop';
import { WriterWorkspaceDropZoneOverlay } from '../../../integrations/workspace-drop/WriterWorkspaceDropZoneOverlay';
import {
  applyWriterWorkspaceDropCommand,
  chooseWriterWorkspaceDropIntent,
  chooseWriterWorkspaceDropMode,
  closeWriterWorkspaceDropZone,
  confirmWriterWorkspaceDropZone,
  createWriterWorkspaceDropZone,
  dropWriterWorkspaceDropZone,
  enterWriterWorkspaceDropZone,
  hoverWriterWorkspaceDropZone,
  isWriterWorkspaceDropZoneDecided,
  isWriterWorkspaceDropZoneVisible,
  leaveWriterWorkspaceDropZone,
  openWriterWorkspaceDropZone,
  openWriterWorkspaceDropZoneFromDragSession,
  readWriterWorkspaceTransfer,
  resolveWriterWorkspaceDropCommand,
  writerWorkspaceDropZoneNeedsMode,
} from '../../../integrations/workspace-drop/writerWorkspaceDropZone';
import type { WriterWorkspaceDropCommand, WriterWorkspaceDropZoneState } from '../../../integrations/workspace-drop/writerWorkspaceDropZoneContract';
import {
  WRITER_WORKSPACE_DROP_INTENT_LABEL,
  WRITER_WORKSPACE_DROP_MODE_PROMPT,
  WRITER_WORKSPACE_DROP_ZONE_KEY_HINT,
  WRITER_WORKSPACE_DROP_ZONE_PRESENTATION,
  WRITER_WORKSPACE_LIVE_MODE_LABEL,
  WRITER_WORKSPACE_LIVE_MODES,
} from '../../../integrations/workspace-drop/writerWorkspaceDropZoneContract';
import {
  WRITER_DROP_ZONE_LONG_PRESS_MS,
  WRITER_DROP_ZONE_TOUCH_ACTION,
  WRITER_DROP_ZONE_TOUCH_CANCEL_REASON,
  writerWorkspaceDropZoneTouchDragBegins,
} from '../../../integrations/workspace-drop/writerWorkspaceDropZoneTouch';

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

const chartSource: WorkspaceDocument = {
  ...source,
  id: 'grid-chart',
  title: 'Diagramme',
  root_object_ids: ['chart-1'],
  objects: {
    'chart-1': { type: 'Chart', data: { id: 'chart-1', chart_type: 'bar', title: 'Chart', categories: [], series: [] } },
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

const documents: Readonly<Record<string, WorkspaceDocument>> = {
  [source.id]: source,
  [chartSource.id]: chartSource,
  [target.id]: target,
};

const table = source.objects['table-forecast'];
if (!table) throw new Error('Fixture-Tabelle fehlt');

/** Der **produzierte** Träger der Fabric-Oberfläche (Paket 7) — zwei Absichten, also eine Wahl ✓. */
const twoIntentPayload = createFabricWorkspaceObjectDragPayload(source, table) ?? '';
/** Derselbe Träger, aber **eine** angebotene Absicht — dann ist die Route eindeutig ✓. */
const oneIntentPayload = serializeWorkspaceDragPayload(createWorkspaceDragPayload({
  documentId: source.id,
  objectId: 'table-forecast',
  objectKind: 'Table',
  sourceApp: 'Grid',
  supportedIntents: ['COPY'],
}));

const context = { targetDocumentId: target.id, documents } as const;
const withPayload = (payload: unknown) => ({ ...context, payload });

const closed = () => createWriterWorkspaceDropZone(target.id);
const opened = (payload: unknown, state: WriterWorkspaceDropZoneState = closed()) =>
  openWriterWorkspaceDropZone(state, withPayload(payload));

const markupOf = (state: WriterWorkspaceDropZoneState): string => renderToStaticMarkup(
  <WriterWorkspaceDropZoneOverlay
    state={state}
    onConfirm={() => undefined}
    onChooseIntent={() => undefined}
    onDismiss={() => undefined}
  />,
);

describe('Paket 9 — das leere Ziel', () => {
  it('beginnt geschlossen, ohne Urteil und ohne Anzeige', () => {
    const state = closed();
    expect(state.phase).toBe('closed');
    expect(state.acceptance).toBe('unknown');
    expect(state.code).toBeNull();
    expect(state.preview).toBeNull();
    expect(state.choices).toEqual([]);
    expect(state.canConfirmWithKeyboard).toBe(false);
    expect(isWriterWorkspaceDropZoneVisible(state)).toBe(false);
  });

  it('schließt ein geschlossenes Ziel nicht still, sondern benannt', () => {
    const step = closeWriterWorkspaceDropZone(closed());
    expect(step.ok).toBe(false);
    expect(step.reason).toBe('drop-zone-inactive');
    expect(step.state.phase).toBe('closed');
  });
});

describe('Paket 9 — überfahren: der Träger entscheidet, nicht die Anzeige', () => {
  it('zeigt das Ziel auch ohne Träger an, ohne etwas zu erfinden', () => {
    const step = opened(undefined);
    expect(step.ok).toBe(true);
    expect(step.state.phase).toBe('open');
    expect(step.state.acceptance).toBe('unknown');
    expect(step.state.preview).toBeNull();
    expect(step.state.code).toBeNull();
    expect(isWriterWorkspaceDropZoneVisible(step.state)).toBe(true);
  });

  it('nimmt das Urteil der vorhandenen Matrix an: zwei Absichten heißt Wahl, nicht Annahme', () => {
    const step = opened(twoIntentPayload);
    expect(step.ok).toBe(true);
    expect(step.state.phase).toBe('choice');
    expect(step.state.acceptance).toBe('accepted');
    expect(step.state.code).toBe('drop_intent_choice_required');
    expect(step.state.choices.map((choice) => choice.intent)).toEqual(['COPY', 'LIVE_REFERENCE']);
    expect(step.state.choices.map((choice) => choice.adapterId)).toEqual([
      'fabric-grid-table-to-writer',
      'fabric-grid-table-to-writer',
    ]);
    expect(step.state.choices.map((choice) => choice.key)).toEqual(['1', '2']);
    expect(step.state.choices[0]?.label).toBe(WRITER_WORKSPACE_DROP_INTENT_LABEL.COPY);
    expect(step.state.canConfirmWithKeyboard).toBe(false);
  });

  it('ist bei genau einer Route bereit und nennt die Vorschau mit der Absicht', () => {
    const step = opened(oneIntentPayload);
    expect(step.state.phase).toBe('ready');
    expect(step.state.canConfirmWithKeyboard).toBe(true);
    expect(step.state.preview).toMatchObject({
      objectKind: 'Table',
      objectKindLabel: 'Tabelle',
      sourceDocumentId: source.id,
      sourceObjectId: 'table-forecast',
      intent: 'COPY',
      adapterId: 'fabric-grid-table-to-writer',
    });
  });

  it('lehnt einen kaputten Träger benannt ab (payload_invalid)', () => {
    const step = opened('{kein json');
    expect(step.ok).toBe(false);
    expect(step.reason).toBe('payload_invalid');
    expect(step.state.phase).toBe('refused');
    expect(step.state.acceptance).toBe('refused');
    expect(step.state.preview).toBeNull();
  });

  it('lehnt eine unbekannte Objektart benannt ab (object_kind_unknown)', () => {
    const unknownKind = JSON.stringify({
      schema: 'astraea.workspace.drag',
      version: 1,
      descriptor: {
        documentId: source.id,
        objectId: 'table-forecast',
        objectKind: 'Hovercraft',
        sourceApp: 'Grid',
        supportedIntents: ['COPY'],
      },
    });
    const step = opened(unknownKind);
    expect(step.ok).toBe(false);
    expect(step.reason).toBe('object_kind_unknown');
    expect(step.state.code).toBe('object_kind_unknown');
  });

  it('lehnt ein sechstes Feld ab, statt es zu ignorieren', () => {
    const sixKeys = JSON.stringify({
      schema: 'astraea.workspace.drag',
      version: 1,
      descriptor: {
        documentId: source.id,
        objectId: 'table-forecast',
        objectKind: 'Table',
        sourceApp: 'Grid',
        supportedIntents: ['COPY'],
        range: 'A1:B2',
      },
    });
    expect(opened(sixKeys).reason).toBe('payload_invalid');
  });

  it('lehnt eine inkompatible Route über die Matrix ab, nicht über eine eigene Regel', () => {
    const chartPayload = serializeWorkspaceDragPayload(createWorkspaceDragPayload({
      documentId: chartSource.id,
      objectId: 'chart-1',
      objectKind: 'Chart',
      sourceApp: 'Grid',
      supportedIntents: ['COPY'],
    }));
    const step = opened(chartPayload);
    expect(step.ok).toBe(false);
    expect(step.reason).toBe('registry_adapter_route_missing');
  });

  it('lehnt eine fehlende Quelle benannt ab (drop_source_document_missing)', () => {
    const step = openWriterWorkspaceDropZone(closed(), {
      targetDocumentId: target.id,
      documents: { [target.id]: target },
      payload: oneIntentPayload,
    });
    expect(step.ok).toBe(false);
    expect(step.reason).toBe('drop_source_document_missing');
  });

  it('lehnt ein fehlendes Zieldokument benannt ab (drop-zone-target-missing)', () => {
    const step = openWriterWorkspaceDropZone(closed(), { targetDocumentId: '', documents, payload: oneIntentPayload });
    expect(step.ok).toBe(false);
    expect(step.reason).toBe('drop-zone-target-missing');
  });
});

describe('Paket 9 — ablegen: eine Zustellung, kein stiller Erfolg', () => {
  it('stellt eine eindeutige Route zu und verändert kein Dokument', () => {
    const before = structuredClone(documents);
    const state = opened(oneIntentPayload).state;
    const step = dropWriterWorkspaceDropZone(state, withPayload(oneIntentPayload));
    expect(step.ok).toBe(true);
    expect(step.state.phase).toBe('resolved');
    expect(step.state.acceptance).toBe('accepted');
    expect(step.state.resolution).toEqual({
      adapterId: 'fabric-grid-table-to-writer',
      intent: 'COPY',
      // **Paket 15** ✓: die Art gehört zur Zustellung ✓ — und **kein** `mode` ✓: *bei der Kopie ist die
      // Abwesenheit die Aussage* ✓ (`toEqual` prüft die **ganze** Form ✓, also auch das Fehlen ✗).
      integrationKind: 'copy',
      sourceDocumentId: source.id,
      sourceObjectId: 'table-forecast',
      targetDocumentId: target.id,
      sourceVersion: 3,
      targetVersion: 4,
    });
    expect(step.state.detail).toContain('Quelle v3');
    expect(step.state.detail).toContain('Ziel v4');
    expect(documents).toEqual(before);
  });

  it('legt ohne gewählte Absicht nichts ab, sondern verlangt sie benannt', () => {
    const step = dropWriterWorkspaceDropZone(opened(twoIntentPayload).state, withPayload(twoIntentPayload));
    expect(step.ok).toBe(false);
    expect(step.reason).toBe('drop_intent_choice_required');
    expect(step.state.phase).toBe('choice');
    expect(step.state.resolution).toBeNull();
    expect(step.state.choices).toHaveLength(2);
  });

  it('lehnt eine Ablage ohne Träger benannt ab', () => {
    const step = dropWriterWorkspaceDropZone(opened(undefined).state, withPayload(undefined));
    expect(step.ok).toBe(false);
    expect(step.reason).toBe('drop-zone-transfer-missing');
    expect(step.state.phase).toBe('refused');
  });

  it('lehnt eine Ablage auf ein geschlossenes Ziel benannt ab', () => {
    const step = dropWriterWorkspaceDropZone(closed(), withPayload(oneIntentPayload));
    expect(step.ok).toBe(false);
    expect(step.reason).toBe('drop-zone-inactive');
  });
});

describe('Paket 9 — die Tastatur ist ein Weg, kein Zusatz', () => {
  it('legt mit der Absicht genau so zu wie der Zeiger', () => {
    const ready = opened(oneIntentPayload).state;
    const viaKeyboard = confirmWriterWorkspaceDropZone(ready, withPayload(oneIntentPayload));
    const viaPointer = dropWriterWorkspaceDropZone(ready, withPayload(oneIntentPayload));
    expect(viaKeyboard.ok).toBe(true);
    expect(viaKeyboard.state.resolution).toEqual(viaPointer.state.resolution);
    expect(viaKeyboard.state.phase).toBe('resolved');
  });

  it('führt die gewählte Absicht durch dieselbe Zustellung wie die Ablage', () => {
    const choice = opened(twoIntentPayload).state;
    // **Paket 15, vorgezogen (Runde 258) ✓✓** — *nicht gelöscht, nicht gelockert* ✓: Live **ohne** Modus ist jetzt
    // der **benannte** Fehlschlag ✓. **Und der Zweck des Tests bleibt** ✓: die gewählte Absicht geht durch
    // **dieselbe Zustellung** wie die Ablage — *belegt über die Kopie auf demselben Weg* ✓✓.
    const ohneModus = chooseWriterWorkspaceDropIntent(choice, 'LIVE_REFERENCE', withPayload(twoIntentPayload));
    expect(ohneModus.ok).toBe(false);
    expect(ohneModus.reason).toBe('drop_live_mode_required');
    const viaKeyboard = chooseWriterWorkspaceDropIntent(choice, 'COPY', withPayload(twoIntentPayload));
    const viaDrop = dropWriterWorkspaceDropZone(opened(oneIntentPayload).state, withPayload(oneIntentPayload));
    expect(viaKeyboard.ok).toBe(true);
    expect(viaKeyboard.state.resolution?.adapterId).toBe(viaDrop.state.resolution?.adapterId);
    expect(viaKeyboard.state.resolution?.intent).toBe('COPY');
    expect(viaKeyboard.state.resolution?.sourceVersion).toBe(viaDrop.state.resolution?.sourceVersion);
    expect(viaKeyboard.state.resolution?.targetVersion).toBe(viaDrop.state.resolution?.targetVersion);
    // **Paket 15, vorgezogen (Runde 259) ✓✓** — *nicht gelöscht, nicht gelockert* ✓: der **Modusschritt** ist
    // gebaut ✓ (`WriterWorkspaceDropZoneContext.requestedMode` ✓, `chooseWriterWorkspaceDropMode` ✓). Der
    // **Fehlschlag-Zeuge** oben bleibt stehen ✓ — *Live ohne Modus ist und bleibt der benannte Fehlschlag* ✓ —
    // und die Zustellung **mit** Modus steht im Block `Paket 15 — der Modusschritt` ✓.
  });

  it('bestätigt im Zustand „Absicht erforderlich" nicht heimlich, sondern wörtlich wie die Ablage', () => {
    const choice = opened(twoIntentPayload).state;
    const viaEnter = confirmWriterWorkspaceDropZone(choice, withPayload(twoIntentPayload));
    const viaDrop = dropWriterWorkspaceDropZone(choice, withPayload(twoIntentPayload));
    expect(viaEnter).toEqual(viaDrop);
    expect(viaEnter.reason).toBe('drop_intent_choice_required');
  });

  it('lehnt eine angebotene, aber nicht eingetragene Absicht benannt ab', () => {
    const step = chooseWriterWorkspaceDropIntent(opened(oneIntentPayload).state, 'FROZEN_SNAPSHOT', withPayload(oneIntentPayload));
    expect(step.ok).toBe(false);
    expect(step.reason).toBe('drop_intent_not_supported');
    expect(step.state.phase).toBe('refused');
  });

  it('lehnt eine unbekannte Absicht benannt ab', () => {
    const step = chooseWriterWorkspaceDropIntent(opened(oneIntentPayload).state, 'TELEPORT', withPayload(oneIntentPayload));
    expect(step.ok).toBe(false);
    expect(step.reason).toBe('intent_unknown');
  });

  it('bestätigt ohne Träger und auf entschiedenen Fällen benannt', () => {
    const open = opened(undefined).state;
    expect(confirmWriterWorkspaceDropZone(open, withPayload(undefined)).reason).toBe('drop-zone-transfer-missing');
    const resolved = dropWriterWorkspaceDropZone(opened(oneIntentPayload).state, withPayload(oneIntentPayload)).state;
    expect(confirmWriterWorkspaceDropZone(resolved, withPayload(oneIntentPayload)).reason).toBe('drop-zone-already-decided');
  });

  it('übersetzt Tasten in Absichten und nennt ungebundene Tasten', () => {
    const choice = opened(twoIntentPayload).state;
    expect(resolveWriterWorkspaceDropCommand(choice, 'Enter')).toEqual({ ok: true, command: { kind: 'confirm' } });
    expect(resolveWriterWorkspaceDropCommand(choice, ' ')).toEqual({ ok: true, command: { kind: 'confirm' } });
    expect(resolveWriterWorkspaceDropCommand(choice, 'Escape')).toEqual({ ok: true, command: { kind: 'dismiss' } });
    expect(resolveWriterWorkspaceDropCommand(choice, '1')).toEqual({ ok: true, command: { kind: 'choose', intent: 'COPY' } });
    expect(resolveWriterWorkspaceDropCommand(choice, '2')).toEqual({ ok: true, command: { kind: 'choose', intent: 'LIVE_REFERENCE' } });
    expect(resolveWriterWorkspaceDropCommand(choice, '9')).toEqual({ ok: false, reason: 'drop-zone-key-unbound' });
    expect(resolveWriterWorkspaceDropCommand(choice, 'x')).toEqual({ ok: false, reason: 'drop-zone-key-unbound' });
    expect(resolveWriterWorkspaceDropCommand(choice, 2)).toEqual({ ok: false, reason: 'drop-zone-key-unbound' });
  });

  it('führt Befehle aus und lehnt unbekannte Befehle benannt ab', () => {
    const choice = opened(twoIntentPayload).state;
    const dismissed = applyWriterWorkspaceDropCommand(choice, { kind: 'dismiss' }, context);
    expect(dismissed.state.phase).toBe('closed');
    expect(dismissed.state.closedReason).toBe('keyboard-dismiss');
    const bogus = applyWriterWorkspaceDropCommand(choice, { kind: 'teleport' } as unknown as WriterWorkspaceDropCommand, context);
    expect(bogus.ok).toBe(false);
    expect(bogus.reason).toBe('drop-zone-command-unknown');
  });
});

describe('Paket 9 — der Zeiger überschreibt keine Tatsache', () => {
  it('löst einen entschiedenen Fall nur durch einen neuen Zug ab', () => {
    const resolved = dropWriterWorkspaceDropZone(opened(oneIntentPayload).state, withPayload(oneIntentPayload)).state;
    expect(isWriterWorkspaceDropZoneDecided(resolved)).toBe(true);
    // Ein bewegter Zeiger lässt die Zustellung stehen …
    const hovered = hoverWriterWorkspaceDropZone(resolved, withPayload(oneIntentPayload));
    expect(hovered.state.phase).toBe('resolved');
    // … ein Verlassen ebenfalls …
    const left = leaveWriterWorkspaceDropZone(resolved, 'drag-left');
    expect(left.state.phase).toBe('resolved');
    // … ein **neuer** Zug dagegen ersetzt sie.
    const entered = enterWriterWorkspaceDropZone(resolved, withPayload(twoIntentPayload));
    expect(entered.state.phase).toBe('choice');
  });

  it('schließt ein nur überfahrenes Ziel beim Verlassen', () => {
    const step = leaveWriterWorkspaceDropZone(opened(twoIntentPayload).state, 'drag-left');
    expect(step.ok).toBe(true);
    expect(step.state.phase).toBe('closed');
    expect(step.state.closedReason).toBe('drag-left');
  });
});

describe('Paket 9 — der Empfänger folgt dem vorhandenen Zug (Paket 5)', () => {
  it('öffnet sich aus der laufenden Zieh-Session mit deren Träger', () => {
    const started = beginDrag(createDragSession(), { pointerId: 1, x: 0, y: 0 }, twoIntentPayload);
    expect(started.ok).toBe(true);
    const moved = moveDrag(started.state, { pointerId: 1, x: 40, y: 0 });
    expect(moved.state.phase).toBe('dragging');
    const step = openWriterWorkspaceDropZoneFromDragSession(closed(), moved.state, context);
    expect(step.state.phase).toBe('choice');
    expect(step.state.preview?.sourceObjectId).toBe('table-forecast');
  });

  it('schließt ein nur überfahrenes Ziel, wenn der Zug endet', () => {
    const started = beginDrag(createDragSession(), { pointerId: 1, x: 0, y: 0 }, twoIntentPayload);
    const moved = moveDrag(started.state, { pointerId: 1, x: 40, y: 0 });
    const open = openWriterWorkspaceDropZoneFromDragSession(closed(), moved.state, context).state;
    const cancelled = cancelDrag(moved.state, 'pointer-lost');
    const after = openWriterWorkspaceDropZoneFromDragSession(open, cancelled.state, context);
    expect(after.state.phase).toBe('closed');
    expect(after.state.closedReason).toBe('drag-left');
  });

  it('lässt eine Zustellung stehen, wenn der Zug endet', () => {
    const resolved = dropWriterWorkspaceDropZone(opened(oneIntentPayload).state, withPayload(oneIntentPayload)).state;
    const started = beginDrag(createDragSession(), { pointerId: 2, x: 0, y: 0 }, oneIntentPayload);
    const cancelled = cancelDrag(started.state, 'pointer-lost');
    const after = openWriterWorkspaceDropZoneFromDragSession(resolved, cancelled.state, context);
    expect(after.ok).toBe(true);
    expect(after.state.phase).toBe('resolved');
  });
});

describe('Paket 9 — der Träger aus der Ablagefläche', () => {
  const transfer = (value: unknown) => ({ getData: (mime: string) => (mime === FABRIC_WORKSPACE_OBJECT_DRAG_MIME ? value : '') });

  it('liest genau die vorhandene MIME-Konstante', () => {
    expect(readWriterWorkspaceTransfer(transfer(oneIntentPayload))).toEqual({ ok: true, payload: oneIntentPayload });
  });

  it('nennt einen fehlenden Träger, statt ihn zu erfinden', () => {
    expect(readWriterWorkspaceTransfer(transfer(''))).toEqual({ ok: false, reason: 'drop-zone-transfer-missing' });
    expect(readWriterWorkspaceTransfer(null)).toEqual({ ok: false, reason: 'drop-zone-transfer-missing' });
  });

  it('nennt eine unlesbare Ablagefläche', () => {
    expect(readWriterWorkspaceTransfer({})).toEqual({ ok: false, reason: 'drop-zone-transfer-unreadable' });
    expect(readWriterWorkspaceTransfer({ getData: () => { throw new Error('kein Zugriff'); } }))
      .toEqual({ ok: false, reason: 'drop-zone-transfer-unreadable' });
  });
});

describe('Paket 9 — Touch ist entschieden, nicht angenommen', () => {
  it('beginnt einen Touch-Zug erst nach Langdruck', () => {
    expect(writerWorkspaceDropZoneTouchDragBegins(WRITER_DROP_ZONE_LONG_PRESS_MS - 1, 0)).toBe(false);
    expect(writerWorkspaceDropZoneTouchDragBegins(WRITER_DROP_ZONE_LONG_PRESS_MS, 0)).toBe(true);
  });

  it('benutzt für die Toleranz dieselbe Schwelle wie die Zieh-Session', () => {
    expect(writerWorkspaceDropZoneTouchDragBegins(1000, DRAG_THRESHOLD_PX)).toBe(true);
    expect(writerWorkspaceDropZoneTouchDragBegins(1000, DRAG_THRESHOLD_PX + 1)).toBe(false);
  });

  it('ist bei unbrauchbaren Zahlen fail-closed', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -1, '450', null, undefined]) {
      expect(writerWorkspaceDropZoneTouchDragBegins(bad, 0)).toBe(false);
      expect(writerWorkspaceDropZoneTouchDragBegins(1000, bad)).toBe(false);
    }
  });

  it('schaltet das Scrollen nicht ab und nennt den Systemabbruch', () => {
    expect(WRITER_DROP_ZONE_TOUCH_ACTION).toBe('manipulation');
    expect(WRITER_DROP_ZONE_TOUCH_ACTION).not.toBe('none');
    expect(WRITER_DROP_ZONE_TOUCH_CANCEL_REASON).toBe('pointer-lost');
    const closedByTouch = closeWriterWorkspaceDropZone(opened(twoIntentPayload).state, WRITER_DROP_ZONE_TOUCH_CANCEL_REASON);
    expect(closedByTouch.state.closedReason).toBe('pointer-lost');
  });
});

describe('Paket 9 — die Ansicht liest nur', () => {
  it('rendert im geschlossenen Zustand nichts', () => {
    expect(markupOf(closed())).toBe('');
  });

  it('sagt den offenen Zustand an und nennt Zeichen, Form und Tastatur', () => {
    const markup = markupOf(opened(undefined).state);
    expect(markup).toContain('data-writer-drop-zone="open"');
    expect(markup).toContain('data-writer-drop-zone-glyph="↓"');
    expect(markup).toContain('data-writer-drop-zone-frame="dashed"');
    expect(markup).toContain('data-writer-drop-zone-acceptance="unknown"');
    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain('aria-atomic="true"');
    expect(markup).toContain('aria-keyshortcuts="Escape"');
    expect(markup).toContain('aria-disabled="true"');
    expect(markup).toContain(WRITER_WORKSPACE_DROP_ZONE_KEY_HINT);
    expect(markup).toContain(WRITER_DROP_ZONE_TOUCH_ACTION);
  });

  it('zeigt die Wahl als Knöpfe mit Ziffer, Wort und Vorschau', () => {
    const markup = markupOf(opened(twoIntentPayload).state);
    expect(markup).toContain('data-writer-drop-zone="choice"');
    expect(markup).toContain('data-writer-drop-zone-glyph="?"');
    expect(markup).toContain('data-writer-drop-zone-frame="double"');
    expect(markup).toContain('data-writer-drop-zone-code="drop_intent_choice_required"');
    expect(markup).toContain('data-writer-drop-zone-choice="COPY"');
    expect(markup).toContain('data-writer-drop-zone-choice="LIVE_REFERENCE"');
    expect(markup).toContain(WRITER_WORKSPACE_DROP_INTENT_LABEL.COPY);
    expect(markup).toContain(WRITER_WORKSPACE_DROP_INTENT_LABEL.LIVE_REFERENCE);
    expect(markup).toContain('aria-keyshortcuts="1"');
    expect(markup).toContain('aria-keyshortcuts="2"');
    expect(markup).toContain('data-writer-drop-zone-preview="fabric-grid-table-to-writer"');
    expect(markup).toContain('Vorschau: Tabelle');
    expect(markup).toContain('Absicht noch offen');
  });

  it('trägt die Ablehnung als Wort und als Grund, ohne eine Absicht anzubieten', () => {
    const refused = opened('{kein json').state;
    const markup = markupOf(refused);
    expect(markup).toContain('data-writer-drop-zone="refused"');
    expect(markup).toContain('data-writer-drop-zone-glyph="!"');
    expect(markup).toContain('data-writer-drop-zone-code="payload_invalid"');
    expect(markup).toContain('data-writer-drop-zone-acceptance="refused"');
    expect(markup).toContain('unlesbar');
    expect(markup).not.toContain('data-writer-drop-zone-choice');
  });

  it('zeigt die Zustellung mit Adapter und beiden Versionen', () => {
    const resolved = dropWriterWorkspaceDropZone(opened(oneIntentPayload).state, withPayload(oneIntentPayload)).state;
    const markup = markupOf(resolved);
    expect(markup).toContain('data-writer-drop-zone="resolved"');
    expect(markup).toContain('data-writer-drop-zone-glyph="✓"');
    expect(markup).toContain('fabric-grid-table-to-writer');
    expect(markup).toContain('Quelle v3 → Ziel v4');
    expect(markup).toContain('data-writer-drop-zone-acceptance="accepted"');
  });

  it('unterscheidet die Zustände durch Zeichen und Worte, nicht durch Farbe', () => {
    const states = [
      opened(undefined).state,
      opened(oneIntentPayload).state,
      opened(twoIntentPayload).state,
      opened('{kein json').state,
      dropWriterWorkspaceDropZone(opened(oneIntentPayload).state, withPayload(oneIntentPayload)).state,
    ];
    const signatures = new Set<string>();
    const markups = new Set<string>();
    for (const state of states) {
      const presentation = WRITER_WORKSPACE_DROP_ZONE_PRESENTATION[state.phase];
      expect(presentation.glyph.length).toBeGreaterThan(0);
      expect(presentation.headline.length).toBeGreaterThan(0);
      signatures.add(`${presentation.glyph}|${presentation.headline}`);
      const markup = markupOf(state);
      expect(markup).toContain(`data-writer-drop-zone-glyph="${presentation.glyph}"`);
      expect(markup).toContain(presentation.headline);
      markups.add(markup);
    }
    expect(signatures.size).toBe(states.length);
    expect(markups.size).toBe(states.length);
  });

  it('macht jede Handlung zu einem echten Knopf mit Tastenkürzel', () => {
    const markup = markupOf(opened(twoIntentPayload).state);
    const buttons = markup.match(/<button type="button"/g) ?? [];
    // **Gezogen, nicht gelockert** ✓ (Form der Notes-Zone ✓: 4 → 6 ✓): zwei Absichten ✓ + **zwei Modi** ✓
    // (Paket 15 ✓) + Ablegen ✓ + Schließen ✓. *Ein Wähler, der die Zahl nicht zieht, wäre ein zweiter Weg* ✗.
    expect(buttons).toHaveLength(6);
    expect(markup).not.toContain('<div role="button"');
    expect(markup).not.toContain('tabindex="-1"');
  });
});

describe('Paket 15 — der Modusschritt', () => {
  /** Ein Träger, der **nur** den Live-Verweis anbietet: hier entscheidet allein der Modus. */
  const liveOnlyPayload = serializeWorkspaceDragPayload(createWorkspaceDragPayload({
    documentId: source.id,
    objectId: 'table-forecast',
    objectKind: 'Table',
    sourceApp: 'Grid',
    supportedIntents: ['LIVE_REFERENCE'],
  }));
  const withMode = (payload: string, mode: unknown) => ({ ...context, payload, requestedMode: mode });
  const liveHover = (mode: unknown) => openWriterWorkspaceDropZone(
    closed(),
    { ...context, payload: liveOnlyPayload, requestedMode: mode },
  );

  it('sagt bei Live MIT Modus „fähig" — die Fähigkeitsfrage lehnt nicht falsch ab', () => {
    const step = dropWriterWorkspaceDropZone(opened(liveOnlyPayload).state, withMode(liveOnlyPayload, 'Live'));
    expect(step.ok).toBe(true);
    expect(step.state.phase).toBe('resolved');
    expect(step.state.acceptance).toBe('accepted');
    expect(step.state.resolution).toMatchObject({
      adapterId: 'fabric-grid-table-to-writer',
      intent: 'LIVE_REFERENCE',
      integrationKind: 'live',
      mode: 'Live',
      sourceVersion: 3,
      targetVersion: 4,
    });
  });

  it('nennt Live OHNE Modus benannt — und nicht fälschlich „keine Route"', () => {
    const step = dropWriterWorkspaceDropZone(opened(liveOnlyPayload).state, withMode(liveOnlyPayload, undefined));
    expect(step.ok).toBe(false);
    expect(step.reason).toBe('drop_live_mode_required');
    expect(step.reason).not.toBe('registry_adapter_route_missing');
    expect(step.reason).not.toBe('drop_intent_not_supported');
    expect(step.state.phase).toBe('refused');
    expect(step.state.resolution).toBeNull();
  });

  it('stellt Frozen genauso zu wie Live — der Modus wird gesagt, nicht angenommen', () => {
    const step = chooseWriterWorkspaceDropIntent(
      opened(twoIntentPayload).state,
      'LIVE_REFERENCE',
      withMode(twoIntentPayload, 'Frozen'),
    );
    expect(step.ok).toBe(true);
    expect(step.state.resolution).toMatchObject({ integrationKind: 'live', mode: 'Frozen' });
  });

  it('trägt bei der Kopie keinen Modus — Abwesenheit ist die Aussage', () => {
    const step = chooseWriterWorkspaceDropIntent(
      opened(twoIntentPayload).state,
      'COPY',
      withMode(twoIntentPayload, 'Live'),
    );
    expect(step.ok).toBe(true);
    expect(step.state.resolution?.integrationKind).toBe('copy');
    expect(step.state.resolution?.mode).toBeUndefined();
    // **Nicht nur `undefined`** — die Eigenschaft ist **nicht da** ✓ (sonst wäre der Modus mitgereist ✗).
    expect(Object.hasOwn(step.state.resolution ?? {}, 'mode')).toBe(false);
  });

  it('führt den Modusschritt als eigene Absicht durch dieselbe Zustellung', () => {
    const viaModeStep = chooseWriterWorkspaceDropMode(
      opened(twoIntentPayload).state,
      'Live',
      withMode(twoIntentPayload, 'Live'),
    );
    const viaIntent = chooseWriterWorkspaceDropIntent(
      opened(twoIntentPayload).state,
      'LIVE_REFERENCE',
      withMode(twoIntentPayload, 'Live'),
    );
    expect(viaModeStep.ok).toBe(true);
    expect(viaModeStep.state.resolution).toEqual(viaIntent.state.resolution);
    expect(viaModeStep.state.resolution?.mode).toBe('Live');
  });

  it('lehnt einen unbekannten Modus benannt ab — kein stiller Rückfall', () => {
    const step = chooseWriterWorkspaceDropMode(opened(twoIntentPayload).state, 'Lauwarm', withPayload(twoIntentPayload));
    expect(step.ok).toBe(false);
    expect(step.reason).toBe('drop_live_mode_required');
    expect(step.state.resolution).toBeNull();
  });

  it('lehnt den Modusschritt ohne Modus benannt ab', () => {
    const step = chooseWriterWorkspaceDropMode(opened(twoIntentPayload).state, undefined, withPayload(twoIntentPayload));
    expect(step.ok).toBe(false);
    expect(step.reason).toBe('drop_live_mode_required');
  });

  it('sagt das offene Modus-Wählen sichtbar an, statt Live stillschweigend anzunehmen', () => {
    const choice = opened(twoIntentPayload).state;
    expect(choice.choices.map((item) => item.integrationKind)).toEqual(['copy', 'live']);
    expect(choice.choices[1]?.mode).toBeNull();
    // Das Absichtswort bleibt **schlicht** ✓ (wie in der Notes-Zone ✓) …
    expect(choice.choices[1]?.label).toBe(WRITER_WORKSPACE_DROP_INTENT_LABEL.LIVE_REFERENCE);
    expect(choice.choices[0]?.label).toBe(WRITER_WORKSPACE_DROP_INTENT_LABEL.COPY);
    // … und **die Frage stellt der Modus-Block** ✓: eine gelesene Bedingung ✓, die vorhandenen Wörter ✓,
    // und **kein** Default ✗.
    expect(writerWorkspaceDropZoneNeedsMode(choice)).toBe(true);
    const markup = markupOf(choice);
    expect(markup).toContain(WRITER_WORKSPACE_DROP_MODE_PROMPT);
    for (const mode of WRITER_WORKSPACE_LIVE_MODES) {
      expect(markup, mode).toContain(WRITER_WORKSPACE_LIVE_MODE_LABEL[mode]);
    }
  });

  it('zeigt den gesagten Modus im Zustand und in der Vorschau', () => {
    const step = liveHover('Frozen');
    expect(step.ok).toBe(true);
    expect(step.state.phase).toBe('ready');
    expect(step.state.canConfirmWithKeyboard).toBe(true);
    expect(step.state.resolution).toBeNull();
    expect(step.state.preview).toMatchObject({
      integrationKind: 'live',
      mode: 'Frozen',
      modeLabel: WRITER_WORKSPACE_LIVE_MODE_LABEL.Frozen,
    });
    expect(step.state.detail).toContain(WRITER_WORKSPACE_LIVE_MODE_LABEL.Frozen);
  });

  it('bestätigt den Modus mit der Tastatur genauso wie mit dem Zeiger', () => {
    const ready = liveHover('Live').state;
    const viaEnter = confirmWriterWorkspaceDropZone(ready, withMode(liveOnlyPayload, 'Live'));
    const viaDrop = dropWriterWorkspaceDropZone(ready, withMode(liveOnlyPayload, 'Live'));
    expect(viaEnter.ok).toBe(true);
    expect(viaEnter.state.resolution).toEqual(viaDrop.state.resolution);
    expect(viaEnter.state.resolution?.mode).toBe('Live');
  });

  it('rendert den Modus als Wort, nicht als Andeutung', () => {
    const resolved = dropWriterWorkspaceDropZone(opened(liveOnlyPayload).state, withMode(liveOnlyPayload, 'Frozen')).state;
    const markup = markupOf(resolved);
    expect(markup).toContain(WRITER_WORKSPACE_LIVE_MODE_LABEL.Frozen);
    expect(markup).toContain('data-writer-drop-zone="resolved"');
    expect(markup).toContain('data-writer-drop-zone-acceptance="accepted"');
  });
});
