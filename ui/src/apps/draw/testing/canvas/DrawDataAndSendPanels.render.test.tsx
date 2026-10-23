// STATUS: GOLD — Sichtbarkeits-Vertrag der Pakete 14 und 19: Datengrafik-Panel und Sende-Panel.
//
// Der Vertrag hält die **gemessene** Form fest: ein **Wort-Register** und **zwei echte Knöpfe** (kein Modus
// ohne Klick), der Zustand aus dem geteilten Verweis-Beschreiber, und der Zeiger-Träger als **gesperrter**
// Griff, wenn er benannt abgelehnt wird — *kein Ersatzträger, keine Attrappe.*
import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import { DRAW_INTERACTION_COPY } from '../../drawInteractionLocale';
import { DrawCanvas } from '../../canvas/DrawCanvas';
import { DrawDataGraphicsPanel } from '../../canvas/DrawDataGraphicsPanel';
import { DrawSendPanel } from '../../canvas/DrawSendPanel';
import { DrawLayerPanel, DRAW_OBJECT_NAVIGATOR_LIMIT } from '../../canvas/DrawLayerPanel';
import { bindDrawDataGraphic } from '../../interactions/drawDataGraphicsEngine';
import { buildDrawModel } from '../interactions/drawInteractionFixtures';

vi.mock('../../../../shell/localization/workspaceLocale', () => ({ useWorkspaceLocale: vi.fn() }));
vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: 'en-US', locale: 'en-US', setPreference: () => undefined });

const noop = (): void => undefined;
const copy = DRAW_INTERACTION_COPY['en-US'];

function gridDocument(): WorkspaceDocument {
  return {
    id: 'grid-1', title: 'Status table', kind: 'Grid', created_at: 0, modified_at: 0, version: 7,
    theme_id: 'cosmic', root_object_ids: ['table-1'],
    objects: { 'table-1': { type: 'Table', data: { id: 'table-1', status: 'red', owner: 'Ada' } } },
  } as unknown as WorkspaceDocument;
}

function drawDocument(drawData: ReturnType<typeof buildDrawModel>, objects: WorkspaceDocument['objects'] = {}): WorkspaceDocument {
  return {
    id: 'draw-canvas', title: 'Interactive canvas', kind: 'Draw', created_at: 0, modified_at: 0, version: 1,
    theme_id: 'cosmic', root_object_ids: [], objects, drawData,
  } as WorkspaceDocument;
}

const shapeModel = () => buildDrawModel({ objects: [{ id: 'shape-1', x: 40, y: 40, width: 160, height: 80, text: 'Node' }] });
const props = (workspaceDocuments: readonly WorkspaceDocument[]) => ({
  document: drawDocument(shapeModel()), onUpdateDocument: noop, workspaceDocuments,
}) satisfies ComponentProps<typeof DrawCanvas>;

describe('Paket 14 — Datengrafik-Panel', () => {
  it('renders a named empty state when the workspace has no Grid/Insight source', () => {
    const markup = renderToStaticMarkup(<DrawCanvas {...props([])} />);
    expect(markup).toContain('data-vgt-panel="data-graphics"');
    expect(markup).toContain('data-vgt-data-sources="0"');
    expect(markup).toContain('data-vgt-data-empty="no-sources"');
    expect(markup).toContain(copy.dataNoSources);
    expect(markup).toContain('role="status"');
  });

  it('offers the real source pickers once a Grid document is present, and names the missing selection', () => {
    const markup = renderToStaticMarkup(<DrawCanvas {...props([gridDocument()])} />);
    expect(markup).toContain('data-vgt-data-sources="1"');
    expect(markup).toContain('data-vgt-data-empty="no-subject"');
    expect(markup).toContain(copy.dataEmpty);
  });

  it('binds through the engine and then shows the mode word plus two real buttons', () => {
    const bound = bindDrawDataGraphic(shapeModel(), {
      objectId: 'shape-1', sourceDocument: gridDocument(), sourceObjectId: 'table-1',
      rules: [{ id: 'rule-1', sourceField: 'status', operator: 'eq', compareValue: 'red', target: 'fill', value: '#ef4444', allowGeometryMutation: false }],
    });
    const markup = renderToStaticMarkup(
      <DrawDataGraphicsPanel
        model={bound.model} locale="en-US" selectedIds={['shape-1']} workspaceDocuments={[gridDocument()]}
        onBind={noop} onSetMode={noop} onApply={noop} onBreak={noop} onRelink={noop} onRemove={noop}
      />,
    );
    expect(markup).toContain('data-vgt-data-binding="live"');
    expect(markup).toContain('data-vgt-data-mode-word="live"');
    expect(markup).toContain('data-vgt-command="data-live"');
    expect(markup).toContain('data-vgt-command="data-frozen"');
    // Der **aktuelle** Modus ist gedrückt und gesperrt — *kein Modus ohne Klick, kein stiller Wechsel.*
    expect(markup).toMatch(/data-vgt-command="data-live"[^>]*aria-pressed="true"[^>]*disabled/u);
    expect(markup).toMatch(/data-vgt-command="data-frozen"[^>]*aria-pressed="false"/u);
    expect(markup).toContain(copy.dataLive);
    expect(markup).toContain(copy.dataFrozen);
    // Anwenden/Brechen/Neuverbinden/Entfernen sind echte Knöpfe.
    for (const name of ['data-apply', 'data-break', 'data-relink', 'data-remove']) {
      expect(markup, name).toContain(`data-vgt-command="${name}"`);
    }
  });

  it('keeps the engine vocabulary for targets and operators instead of inventing a second list', () => {
    const markup = renderToStaticMarkup(
      <DrawDataGraphicsPanel
        model={shapeModel()} locale="en-US" selectedIds={['shape-1']} workspaceDocuments={[gridDocument()]}
        onBind={noop} onSetMode={noop} onApply={noop} onBreak={noop} onRelink={noop} onRemove={noop}
      />,
    );
    expect(markup).toContain('data-vgt-data-form="true"');
    expect(markup).toContain('data-vgt-data-targets="7"');
    expect(markup).toContain('fill');
    expect(markup).toContain('truthy');
    expect(markup).toContain('data-vgt-command="data-bind"');
  });
});

describe('Paket 20 — die Tastatur-Liste ist gedeckelt und benennt den Rest', () => {
  it('caps the object navigator at 200 and states how many objects are not listed', () => {
    const many = buildDrawModel({
      objects: Array.from({ length: 240 }, (_, index) => ({ id: `o${index}`, x: (index % 20) * 30, y: Math.floor(index / 20) * 30, width: 20, height: 20 })),
    });
    const page = many.pages[0]!;
    const markup = renderToStaticMarkup(
      <DrawLayerPanel
        model={many} page={page} locale="en-US" activeLayerId="layer-main" selectedIds={['o239']}
        onSetActiveLayer={noop} onToggleLayerVisibility={noop} onToggleLayerLock={noop} onToggleLayerPrintable={noop}
        onStepLayer={noop} onRenameLayer={noop} onAddLayer={noop} onSelectObject={noop} onToggleObjectLock={noop}
        onZOrder={noop} onGroup={noop} onUngroup={noop} onAddToGroup={noop} onMoveToLayer={noop} onConnect={noop}
        onDisconnect={noop} onToggleViewport={noop} onAddGuide={noop} onRemoveGuide={noop}
      />,
    );
    expect(markup).toContain(`data-vgt-object-list="${DRAW_OBJECT_NAVIGATOR_LIMIT}"`);
    expect(markup).toContain('data-vgt-object-list-total="240"');
    expect(markup).toContain(`data-vgt-object-list-truncated="${240 - DRAW_OBJECT_NAVIGATOR_LIMIT}"`);
    expect(markup).toContain(DRAW_INTERACTION_COPY['en-US'].objectListTruncated.replace('{count}', String(240 - DRAW_OBJECT_NAVIGATOR_LIMIT)));
    // Ein **ausgewähltes** Objekt darf nie aus der gedeckelten Liste fallen: die Auswahl bleibt erreichbar.
    expect(markup).toContain('data-vgt-object="o239"');
    expect(markup).toContain('data-vgt-object-state="selected"');
  });
});

describe('Paket 19 — Sende-Panel', () => {
  it('renders a named state when there is no target document', () => {
    const markup = renderToStaticMarkup(<DrawCanvas {...props([])} />);
    expect(markup).toContain('data-vgt-panel="send"');
    expect(markup).toContain('data-vgt-send-targets="0"');
    expect(markup).toContain('data-vgt-send-empty="no-targets"');
    expect(markup).toContain(copy.sendNoTargets);
  });

  it('offers live and snapshot as two real buttons and keeps the carrier refused without an anchor', () => {
    const markup = renderToStaticMarkup(
      <DrawSendPanel
        model={shapeModel()} locale="en-US" workspaceDocuments={[gridDocument()]}
        element={{ kind: 'page', id: 'page-1' }} onChooseElement={noop} onSend={noop}
        carrierPayload={() => null} sourceDocumentId="draw-canvas" status={null} referenceCount={0}
      />,
    );
    expect(markup).toContain('data-vgt-command="send-live"');
    expect(markup).toContain('data-vgt-command="send-frozen"');
    expect(markup).toContain(copy.sendLive);
    expect(markup).toContain(copy.sendFrozen);
    // Ohne Anker/Matrix-Deckung ist der Träger **benannt** gesperrt — kein Ersatzträger.
    expect(markup).toContain('data-vgt-send-carry="refused"');
    expect(markup).toContain('aria-disabled="true"');
    // Die Tastatur bleibt der **echte** Weg: der Griff ist fokussierbar und trägt einen Namen.
    expect(markup).toContain('role="button"');
    expect(markup).toContain('tabindex="0"');
    expect(markup).toContain(copy.sendCarry);
  });

  it('reports the state word from the shared reference descriptor', () => {
    const markup = renderToStaticMarkup(
      <DrawSendPanel
        model={shapeModel()} locale="en-US" workspaceDocuments={[gridDocument()]}
        element={{ kind: 'page', id: 'page-1' }} onChooseElement={noop} onSend={noop}
        carrierPayload={() => 'payload'} sourceDocumentId="draw-canvas" status="frozen" referenceCount={1}
      />,
    );
    expect(markup).toContain('data-vgt-send-status="frozen"');
    expect(markup).toContain('data-vgt-send-carry="ready"');
    expect(markup).toContain('aria-disabled="false"');
    expect(markup).toContain('frozen');
    expect(markup).toContain('data-vgt-send-references="1"');
  });
});
