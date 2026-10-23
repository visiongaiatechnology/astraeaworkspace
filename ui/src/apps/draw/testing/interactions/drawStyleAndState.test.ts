// STATUS: GOLD — Shape Style Inspector read model + non-colour state visual encoding.
import { describe, expect, it } from 'vitest';
import {
  DRAW_SHADOW_PRESETS, activeDashPresetIndex, activeShadowPresetId, describeDrawSelectionStyle,
} from '../../interactions/drawStyleEngine';
import {
  drawStateAriaSuffix, drawStateBadge, drawStateDashArray, drawStateFlags, drawStateGripFill,
  drawStateOutlineWidth, drawStateStatusText, drawStateToken, type DrawObjectStateInput,
  type DrawStateToken,
} from '../../interactions/drawStateVisuals';
import { projectDrawScene } from '../../interactions/drawSceneProjection';
import { applyDrawStylePatch, applyDrawTypographyPatch } from '../../interactions/drawCommandEngine';
import { buildDrawModel, overlappingModel } from './drawInteractionFixtures';

const scene = (model: ReturnType<typeof buildDrawModel>) => projectDrawScene(model, model.activePageId);

describe('Draw style inspector — read model', () => {
  it('reports an explicit empty state for an empty selection', () => {
    const snapshot = describeDrawSelectionStyle(scene(buildDrawModel({})), []);
    expect(snapshot.empty).toBe(true);
    expect(snapshot.count).toBe(0);
    expect(snapshot.mixed).toEqual([]);
  });

  it('reads the single-selection style and typography', () => {
    const model = buildDrawModel({ objects: [{ id: 'a', x: 0, y: 0, width: 100, height: 60, text: 'label' }] });
    const snapshot = describeDrawSelectionStyle(scene(model), ['a']);
    expect(snapshot.empty).toBe(false);
    expect(snapshot.count).toBe(1);
    expect(snapshot.fill).toBe('#1e293b');
    expect(snapshot.strokeWidth).toBe(2);
    expect(snapshot.typography.fontSize).toBe(14);
    expect(snapshot.mixed).toEqual([]);
  });

  it('marks differing values as mixed instead of silently reporting the first one', () => {
    let model = buildDrawModel({
      objects: [
        { id: 'a', x: 0, y: 0, width: 100, height: 60 },
        { id: 'b', x: 200, y: 0, width: 100, height: 60 },
      ],
    });
    model = applyDrawStylePatch(model, ['b'], { fill: '#ef4444', strokeWidth: 8 });
    model = applyDrawTypographyPatch(model, ['b'], { bold: true });
    const snapshot = describeDrawSelectionStyle(scene(model), ['a', 'b']);
    expect(snapshot.count).toBe(2);
    expect(snapshot.mixed).toContain('fill');
    expect(snapshot.mixed).toContain('strokeWidth');
    expect(snapshot.mixed).toContain('bold');
    expect(snapshot.mixed).not.toContain('stroke');
  });

  it('flags a selection that cannot carry vector style and one that is read-only', () => {
    const model = buildDrawModel({
      objects: [
        { id: 'a', x: 0, y: 0, width: 100, height: 60 },
        { id: 'b', x: 200, y: 0, width: 100, height: 60, locked: true },
      ],
    });
    const mixedSelection = describeDrawSelectionStyle(scene(model), ['a', 'b']);
    expect(mixedSelection.readOnly).toBe(false);
    const lockedOnly = describeDrawSelectionStyle(scene(model), ['b']);
    expect(lockedOnly.readOnly).toBe(true);
    expect(lockedOnly.hasStylelessObjects).toBe(false);
  });

  it('ignores ids that are no longer in the scene', () => {
    const model = buildDrawModel({ objects: [{ id: 'a', x: 0, y: 0, width: 10, height: 10 }] });
    expect(describeDrawSelectionStyle(scene(model), ['missing']).empty).toBe(true);
  });

  it('matches stored presets back to their ids', () => {
    expect(activeDashPresetIndex([])).toBe(0);
    expect(activeDashPresetIndex([8, 4])).toBe(1);
    expect(activeDashPresetIndex([1, 2, 3])).toBe(-1);
    expect(activeShadowPresetId(null)).toBe('none');
    const raised = DRAW_SHADOW_PRESETS.find((preset) => preset.id === 'raised')!.shadow!;
    expect(activeShadowPresetId(raised)).toBe('raised');
    expect(activeShadowPresetId({ x: 9, y: 9, blur: 9, color: '#000000', opacity: 0.1 })).toBe('custom');
  });
});

describe('Draw state visuals — distinguishable without colour', () => {
  const input = (overrides: Partial<DrawObjectStateInput>): DrawObjectStateInput => ({
    selected: false, hovered: false, dragging: false, focused: false, locked: false, visible: true, editing: false,
    ...overrides,
  });

  it('maps each required state to its own token, dash pattern and badge', () => {
    const states: readonly [DrawStateToken, DrawObjectStateInput][] = [
      ['selected', input({ selected: true })],
      ['hover', input({ hovered: true })],
      ['focus', input({ selected: true, focused: true })],
      ['dragging', input({ selected: true, dragging: true })],
      ['disabled', input({ selected: true, locked: true })],
    ];
    const tokens = states.map(([, value]) => drawStateToken(drawStateFlags(value)));
    const dashes = tokens.map((token) => drawStateDashArray(token));
    const badges = tokens.map((token) => drawStateBadge(token));
    const widths = states.map(([, value]) => drawStateOutlineWidth(drawStateFlags(value)));

    expect(tokens).toEqual(states.map(([expected]) => expected));
    expect(new Set(tokens).size).toBe(tokens.length);
    // Dash patterns are the non-colour carrier: every state must differ from every other state.
    expect(new Set(dashes).size).toBe(dashes.length);
    expect(new Set(badges).size).toBe(badges.length);
    expect(widths[0]).toBeGreaterThan(widths[1]!);
    expect(widths[0]).toBe(widths[3]);
    // A locked selection keeps a visible but de-emphasised outline and loses every grip.
    expect(widths[4]).toBe(1);
    expect(widths[4]).toBeLessThan(widths[0]!);
  });

  it('hides grips for locked and hidden objects and offers them only when selected', () => {
    expect(drawStateGripFill(drawStateFlags(input({ selected: true })))).toBe('solid');
    expect(drawStateGripFill(drawStateFlags(input({ selected: true, locked: true })))).toBe('none');
    expect(drawStateGripFill(drawStateFlags(input({ selected: true, visible: false })))).toBe('none');
    expect(drawStateGripFill(drawStateFlags(input({ hovered: true })))).toBe('none');
  });

  it('prefers hidden over every other state and idle has no dash or badge', () => {
    expect(drawStateToken(drawStateFlags(input({ visible: false, selected: true, dragging: true })))).toBe('hidden');
    expect(drawStateDashArray('idle')).toBeNull();
    expect(drawStateBadge('idle')).toBe('');
  });

  it('rejects a malformed flag set and an unknown token', () => {
    expect(() => drawStateFlags({ ...input({}), selected: 'yes' as unknown as boolean })).toThrowError(/state-flag-invalid/);
    expect(() => drawStateDashArray('nope' as DrawStateToken)).toThrowError(/state-token-invalid/);
  });

  it('announces the same state to assistive technology as it draws', () => {
    const flags = drawStateFlags(input({ selected: true, dragging: true, focused: true }));
    expect(drawStateAriaSuffix(flags)).toBe('selected, focus, moving');
    expect(drawStateStatusText(flags, 'Router')).toBe('Router (selected, focus, moving)');
    expect(drawStateStatusText(drawStateFlags(input({})), 'Router')).toBe('Router [idle]');
    expect(drawStateAriaSuffix(drawStateFlags(input({ locked: true })))).toBe('locked');
  });

  it('treats a locked object on a locked layer as disabled in the scene projection', () => {
    const model = overlappingModel();
    const projected = scene(model);
    const flags = drawStateFlags({
      selected: true,
      hovered: false,
      dragging: false,
      focused: false,
      locked: projected.byId.get('locked-shape')!.locked,
      visible: projected.byId.get('locked-shape')!.visible,
      editing: false,
    });
    expect(drawStateToken(flags)).toBe('disabled');
  });
});
