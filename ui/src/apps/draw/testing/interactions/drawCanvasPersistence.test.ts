// STATUS: GOLD — the WOM/persistence layer for the interactive features: everything the new canvas can
// create survives the canonical encrypted save → close → reopen path byte-for-byte.
//
// `packNativeDraw`/`unpackNativeDraw` is Draw's canonical document path (the same one the toolbar's
// "Encrypted .vdraw" button uses), and `workspaceDocument.drawData` is the only store involved. The
// history engine is exercised around it so an edit is undoable *and* durable.
import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { packNativeDraw, unpackNativeDraw } from '../../import-export/drawInterchangeEngine';
import { createDrawHistory, pushDrawHistory, redoDrawHistory, undoDrawHistory } from '../../model/drawHistoryEngine';
import { createDrawCanvasSession, drawSessionCommand, drawSessionDoubleClick, drawSessionEndText, drawSessionSetText } from '../../interactions/drawCanvasSession';
import { bindDrawDataGraphic, setDrawDataBindingMode, drawDataFieldsFrom } from '../../interactions/drawDataGraphicsEngine';
import { buildDrawModel } from './drawInteractionFixtures';

const PASSWORD = 'draw-roundtrip-passphrase';

function workspaceDocument(drawData: ReturnType<typeof buildDrawModel>): WorkspaceDocument {
  return {
    id: 'draw-roundtrip', title: 'Roundtrip', kind: 'Draw', created_at: 0, modified_at: 0, version: 1,
    theme_id: 'cosmic', root_object_ids: [], objects: {}, drawData,
  } as WorkspaceDocument;
}

/** Builds a document that uses every interactive feature added to the canvas. */
function richModel() {
  const base = buildDrawModel({
    layers: [{ id: 'layer-main', name: 'Main' }, { id: 'layer-two', name: 'Second' }],
    objects: [
      { id: 'a', x: 40, y: 40, width: 160, height: 80, text: 'Alpha' },
      { id: 'b', x: 400, y: 300, width: 160, height: 80, text: 'Beta' },
    ],
  });
  let state = createDrawCanvasSession(base);
  const run = (command: Parameters<typeof drawSessionCommand>[1]): void => {
    state = drawSessionCommand(state, command).state;
  };
  // A connector with a label and one waypoint.
  run({ kind: 'select', ids: ['a', 'b'] });
  run({ kind: 'connect' });
  run({ kind: 'connector-label', text: 'feeds' });
  run({ kind: 'connector-waypoint', point: { x: 300, y: 60 } });
  run({ kind: 'connector-arrowheads', arrowStart: 'diamond', arrowEnd: 'triangle' });
  // A style + typography + shadow change on a shape.
  run({ kind: 'select', ids: ['a'] });
  run({ kind: 'style', patch: { fill: '#ef4444', strokeWidth: 5, cornerRadius: 12, dash: [8, 4] } });
  run({ kind: 'typography', patch: { bold: true, fontSize: 24 } });
  run({ kind: 'shadow', shadow: { x: 2, y: 3, blur: 6, color: '#000000', opacity: 0.5 } });
  // Text typed directly on the canvas, committed in one history step.
  const editing = drawSessionDoubleClick(state, { x: 120, y: 80 });
  const typed = drawSessionSetText(editing.state, 'Alpha edited');
  state = drawSessionEndText(typed.state).state;
  // A group, then a member moved onto the second layer.
  run({ kind: 'select', ids: ['a', 'b'] });
  run({ kind: 'group' });
  run({ kind: 'select', ids: ['b'] });
  run({ kind: 'move-to-layer', layerId: 'layer-two' });
  return state.model;
}

describe('Draw interactive edits survive the canonical save → reopen path', () => {
  it('encrypts, reopens and yields the identical payload', async () => {
    const model = richModel();
    const bytes = await packNativeDraw(workspaceDocument(model), { password: PASSWORD });
    expect(bytes.byteLength).toBeGreaterThan(16);
    const reopened = await unpackNativeDraw(bytes, { password: PASSWORD });
    expect(reopened.drawData).toEqual(model);
  });

  it('reopens with every interactive feature intact and usable', async () => {
    const model = richModel();
    const reopened = (await unpackNativeDraw(await packNativeDraw(workspaceDocument(model), { password: PASSWORD }), { password: PASSWORD })).drawData!;
    const connector = Object.values(reopened.objects).find((object) => object.type === 'connector');
    expect(connector?.connector?.semantic.label).toBe('feeds');
    expect(connector?.connector?.waypoints).toEqual([{ x: 300, y: 60 }]);
    expect(connector?.connector?.arrowStart).toBe('diamond');
    const shape = reopened.objects.a!;
    expect(shape.vector?.style.fill).toBe('#ef4444');
    expect(shape.vector?.style.strokeWidth).toBe(5);
    expect(shape.vector?.style.cornerRadius).toBe(12);
    expect(shape.vector?.style.shadow?.blur).toBe(6);
    expect(shape.richText?.runs[0]?.text).toBe('Alpha edited');
    expect(shape.richText?.runs[0]?.bold).toBe(true);
    expect(shape.richText?.runs[0]?.fontSize).toBe(24);
    expect(reopened.objects.b?.layerId).toBe('layer-two');
    expect(reopened.layers.map((layer) => layer.name)).toEqual(['Main', 'Second']);

    // The reopened model is still fully interactive: selection, hit-testing and editing all work.
    const session = createDrawCanvasSession(reopened, ['a']);
    const styled = drawSessionCommand(session, { kind: 'style', patch: { strokeWidth: 9 } });
    expect(styled.state.model.objects.a?.vector?.style.strokeWidth).toBe(9);
    expect(styled.commit).toBe('history');
  });

  it('refuses to reopen with the wrong password instead of returning partial data', async () => {
    const bytes = await packNativeDraw(workspaceDocument(richModel()), { password: PASSWORD });
    await expect(unpackNativeDraw(bytes, { password: 'wrong-passphrase' })).rejects.toBeTruthy();
  });

  it('keeps a canvas gesture undoable as exactly one history step across the save path', async () => {
    const base = richModel();
    let history = createDrawHistory(base);
    const session = createDrawCanvasSession(base, ['a']);
    const edited = drawSessionCommand(session, { kind: 'style', patch: { opacity: 0.25 } });
    history = pushDrawHistory(history, edited.state.model);
    expect(history.past.length).toBe(1);

    const undone = undoDrawHistory(history);
    expect(undone.present.objects.a?.vector?.style.opacity).not.toBe(0.25);
    const redone = redoDrawHistory(undone);
    expect(redone.present.objects.a?.vector?.style.opacity).toBe(0.25);
    // The redone payload is still exactly what the encrypted path reopens.
    const reopened = await unpackNativeDraw(await packNativeDraw(workspaceDocument(redone.present), { password: PASSWORD }), { password: PASSWORD });
    expect(reopened.drawData).toEqual(redone.present);
  });

  it('reopens a frozen data binding with its embedded snapshot and without its source', async () => {
    // Paket 14, Schicht WOM: eine **eingefrorene** Bindung trägt ihren Schnappschuss **im Modell** — sie ist
    // damit nach dem Speichern ohne ihre Quelle auswertbar. Genau das wird hier festgehalten.
    const grid = {
      id: 'grid-1', title: 'Status', kind: 'Grid', created_at: 0, modified_at: 0, version: 7, theme_id: 'cosmic',
      root_object_ids: ['table-1'],
      objects: { 'table-1': { type: 'Table', data: { id: 'table-1', status: 'red' } } },
    } as unknown as WorkspaceDocument;
    const base = buildDrawModel({ objects: [{ id: 'a', x: 10, y: 10, width: 120, height: 60 }] });
    const bound = bindDrawDataGraphic(base, {
      objectId: 'a', sourceDocument: grid, sourceObjectId: 'table-1',
      rules: [{ id: 'rule-1', sourceField: 'status', operator: 'eq', compareValue: 'red', target: 'fill', value: '#ef4444', allowGeometryMutation: false }],
    });
    const frozen = setDrawDataBindingMode(bound.model, bound.bindingId, 'frozen', drawDataFieldsFrom(grid, 'table-1').snapshot, 5_000);

    const reopened = await unpackNativeDraw(await packNativeDraw(workspaceDocument(frozen.model), { password: PASSWORD }), { password: PASSWORD });
    expect(reopened.drawData).toEqual(frozen.model);
    expect(reopened.drawData?.dataBindings[0]?.mode).toBe('frozen');
    // Der eingebettete Schnappschuss trägt **alle** adressierbaren Werte der Nutzlast (auch `id`).
    expect(reopened.drawData?.dataBindings[0]?.frozenSnapshot).toMatchObject({ status: 'red' });
    expect(reopened.drawData?.objects.a?.vector?.style.fill).toBe('#ef4444');
  });
});
