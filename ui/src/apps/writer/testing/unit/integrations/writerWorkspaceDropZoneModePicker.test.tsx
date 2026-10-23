// STATUS: PLATIN — Paket 15: der **sichtbare** Live/Frozen-Wähler der Writer-Zone (Form der Notes-Zone)
//
// ## Warum es diesen Wähler gibt
//
// Die Akzeptanzhandlung von AST-1948 lautet: *„Nach Drop erhält Benutzer **klare Auswahl Live/Frozen** ohne
// heimlichen Default"*. Vorher nannte ein Live-Drop nur den **benannten** Grund `drop_live_mode_required` —
// *die Regel war wahr, aber eine **Sackgasse*** ✗✓. **Der Wähler macht sie begehbar** ✓.
//
// ## Was hier geprüft wird ✓ — und was nicht ✗
//
// Geprüft sind: das **eine** Wort-Register ✓, die **eine** Bedingung (`writerWorkspaceDropZoneNeedsMode` ✓),
// das **Markup** mit zwei echten Knöpfen ✓ und der **begehbare Weg** (Angebot → benannte Ablehnung → Modus →
// Zustellung ✓). Nicht geprüft bleibt das **Klicken** selbst ✗ (kein Browser ✓, `NOT_TESTED` ✓).
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../../../../shared/contracts/workspace';
import {
  createWorkspaceDragPayload,
  serializeWorkspaceDragPayload,
} from '../../../../../shared/workspace-interaction';
import { createFabricWorkspaceObjectDragPayload } from '../../../../../shell/fabric/fabricGraphWorkspaceDrop';
import { WriterWorkspaceDropZoneOverlay } from '../../../integrations/workspace-drop/WriterWorkspaceDropZoneOverlay';
import {
  chooseWriterWorkspaceDropIntent,
  chooseWriterWorkspaceDropMode,
  createWriterWorkspaceDropZone,
  dropWriterWorkspaceDropZone,
  openWriterWorkspaceDropZone,
  writerWorkspaceDropZoneNeedsMode,
} from '../../../integrations/workspace-drop/writerWorkspaceDropZone';
import type { WriterWorkspaceDropZoneState } from '../../../integrations/workspace-drop/writerWorkspaceDropZoneContract';
import {
  WRITER_WORKSPACE_DROP_INTENT_LABEL,
  WRITER_WORKSPACE_DROP_MODE_PROMPT,
  WRITER_WORKSPACE_LIVE_MODE_LABEL,
  WRITER_WORKSPACE_LIVE_MODES,
} from '../../../integrations/workspace-drop/writerWorkspaceDropZoneContract';

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

const documents: Readonly<Record<string, WorkspaceDocument>> = { [source.id]: source, [target.id]: target };
const context = { targetDocumentId: target.id, documents } as const;

const table = source.objects['table-forecast'];
if (!table) throw new Error('Fixture-Tabelle fehlt');
const twoIntentPayload = createFabricWorkspaceObjectDragPayload(source, table) ?? '';
const copyOnlyPayload = serializeWorkspaceDragPayload(createWorkspaceDragPayload({
  documentId: source.id,
  objectId: 'table-forecast',
  objectKind: 'Table',
  sourceApp: 'Grid',
  supportedIntents: ['COPY'],
}));

const markupOf = (state: WriterWorkspaceDropZoneState): string => renderToStaticMarkup(
  <WriterWorkspaceDropZoneOverlay
    state={state}
    onConfirm={() => undefined}
    onChooseIntent={() => undefined}
    onDismiss={() => undefined}
  />,
);

const offers = (payload: unknown, state: WriterWorkspaceDropZoneState = createWriterWorkspaceDropZone(target.id)) =>
  openWriterWorkspaceDropZone(state, { ...context, payload }).state;
const route = (payload: unknown, mode: unknown = undefined) => ({ ...context, payload, requestedMode: mode });

describe('Paket 15 — die Wörter des Wählers', () => {
  it('kommt aus dem einen Wort-Register: die vorhandenen Wörter, keine zweite Liste', () => {
    expect([...WRITER_WORKSPACE_LIVE_MODES]).toEqual(['Live', 'Frozen']);
    expect(WRITER_WORKSPACE_LIVE_MODE_LABEL.Live).toBe(WRITER_WORKSPACE_DROP_INTENT_LABEL.LIVE_REFERENCE);
    expect(WRITER_WORKSPACE_LIVE_MODE_LABEL.Frozen).toBe(WRITER_WORKSPACE_DROP_INTENT_LABEL.FROZEN_SNAPSHOT);
    expect(WRITER_WORKSPACE_DROP_MODE_PROMPT.length).toBeGreaterThan(0);
  });
});

describe('Paket 15 — die eine Bedingung: wann wird gefragt', () => {
  it('fragt im Angebot (choice) und bei der benannten Ablehnung — sonst nicht', () => {
    expect(writerWorkspaceDropZoneNeedsMode(createWriterWorkspaceDropZone(target.id))).toBe(false);
    const choice = offers(twoIntentPayload);
    expect(choice.phase).toBe('choice');
    expect(writerWorkspaceDropZoneNeedsMode(choice)).toBe(true);
    // Eine Kopie fragt **nicht** — sie hat keinen Modus.
    expect(writerWorkspaceDropZoneNeedsMode(offers(copyOnlyPayload))).toBe(false);
    // Die Zustellung **ohne** Modus nennt den Grund — und die Frage bleibt stehen.
    const refused = chooseWriterWorkspaceDropIntent(choice, 'LIVE_REFERENCE', route(twoIntentPayload));
    expect(refused.reason).toBe('drop_live_mode_required');
    expect(writerWorkspaceDropZoneNeedsMode(refused.state)).toBe(true);
  });

  it('verschwindet, sobald der Modus gesagt ist', () => {
    const choice = offers(twoIntentPayload);
    for (const mode of WRITER_WORKSPACE_LIVE_MODES) {
      const delivered = chooseWriterWorkspaceDropMode(choice, mode, route(twoIntentPayload, mode));
      expect(delivered.ok, mode).toBe(true);
      expect(delivered.state.phase, mode).toBe('resolved');
      expect(writerWorkspaceDropZoneNeedsMode(delivered.state), mode).toBe(false);
    }
  });

  it('macht die Sackgasse begehbar: Ablehnung → Modus → Zustellung', () => {
    const choice = offers(twoIntentPayload);
    const refused = chooseWriterWorkspaceDropIntent(choice, 'LIVE_REFERENCE', route(twoIntentPayload));
    expect(refused.ok).toBe(false);
    expect(refused.reason).toBe('drop_live_mode_required');
    // Der Zustand nach der Ablehnung trägt **keine** Absichten mehr — die Frage muss also aus dem **Grund**
    // kommen (sonst wären die Knöpfe weg und die Ablehnung wäre wieder eine Sackgasse).
    expect(refused.state.choices).toEqual([]);
    expect(writerWorkspaceDropZoneNeedsMode(refused.state)).toBe(true);
    const delivered = chooseWriterWorkspaceDropMode(refused.state, 'Frozen', route(twoIntentPayload));
    expect(delivered.ok).toBe(true);
    expect(delivered.state.resolution).toMatchObject({ integrationKind: 'live', mode: 'Frozen' });
  });
});

describe('Paket 15 — das Markup des Wählers', () => {
  it('zeigt zwei echte Knöpfe mit Aufforderung und den vorhandenen Wörtern', () => {
    const markup = markupOf(offers(twoIntentPayload));
    expect(markup).toContain('data-writer-drop-zone-mode-prompt');
    expect(markup).toContain(WRITER_WORKSPACE_DROP_MODE_PROMPT);
    for (const mode of WRITER_WORKSPACE_LIVE_MODES) {
      expect(markup, mode).toContain(`data-writer-drop-zone-mode="${mode}"`);
      expect(markup, mode).toContain(WRITER_WORKSPACE_LIVE_MODE_LABEL[mode]);
    }
    // **Gezogen, nicht gelockert** ✓ (wie in der Notes-Zone ✓: 4 → 6 ✓): zwei Absichten ✓ + zwei Modi ✓
    // + Ablegen ✓ + Schließen ✓.
    expect(markup.match(/<button type="button"/g) ?? []).toHaveLength(6);
  });

  it('lässt die Knöpfe bei der benannten Ablehnung stehen', () => {
    const refused = chooseWriterWorkspaceDropIntent(offers(twoIntentPayload), 'LIVE_REFERENCE', route(twoIntentPayload)).state;
    const markup = markupOf(refused);
    expect(markup).toContain('data-writer-drop-zone="refused"');
    expect(markup).toContain('data-writer-drop-zone-code="drop_live_mode_required"');
    for (const mode of WRITER_WORKSPACE_LIVE_MODES) {
      expect(markup, mode).toContain(`data-writer-drop-zone-mode="${mode}"`);
    }
  });

  it('fragt bei einer Kopie nicht', () => {
    const markup = markupOf(offers(copyOnlyPayload));
    expect(markup).not.toContain('data-writer-drop-zone-mode=');
    expect(markup).not.toContain('data-writer-drop-zone-mode-prompt');
  });

  it('führt Art und Modus im Zustellungs-Markup — bei der Kopie **ohne** Modus', () => {
    const live = chooseWriterWorkspaceDropMode(offers(twoIntentPayload), 'Live', route(twoIntentPayload)).state;
    const liveMarkup = markupOf(live);
    expect(liveMarkup).toContain('data-writer-drop-zone-resolution-kind="live"');
    expect(liveMarkup).toContain('data-writer-drop-zone-resolution-mode="Live"');
    expect(liveMarkup).toContain(WRITER_WORKSPACE_LIVE_MODE_LABEL.Live);
    const copy = dropWriterWorkspaceDropZone(offers(copyOnlyPayload), route(copyOnlyPayload)).state;
    const copyMarkup = markupOf(copy);
    expect(copyMarkup).toContain('data-writer-drop-zone-resolution-kind="copy"');
    expect(copyMarkup).toContain('data-writer-drop-zone-resolution-mode=""');
  });
});
