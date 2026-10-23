// STATUS: GOLD — Paket 14 (AST-1301…AST-1304): Statusdaten aus Grid als Farbe, Icon und Label.
//
// Der Test hält die vier Zusagen des Pakets fest: (1) die vorhandenen Engines werden **benutzt**, nicht
// nachgebaut; (2) der Schnappschuss-Leser ist **begrenzt** und **benennt** Ausgelassenes; (3) Live und
// Frozen sind **zwei echte Handlungen** mit eigenem Zustandswort; (4) jeder ungültige Pfad ist benannt.
import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';
import type { DrawDataGraphicRule } from '../../../../shared/contracts/draw/workspaceDraw';
import {
  DRAW_DATA_LIMITS, applyDrawDataGraphics, bindDrawDataGraphic, breakDrawDataBinding, drawDataBindingFor,
  drawDataBindingModeWord, drawDataFieldsFrom, drawDataSourceKind, relinkDrawDataBinding,
  setDrawDataBindingMode, unbindDrawDataGraphic,
} from '../../interactions/drawDataGraphicsEngine';
import { buildDrawModel } from './drawInteractionFixtures';

function gridDocument(): WorkspaceDocument {
  return {
    id: 'grid-1', title: 'Status table', kind: 'Grid', created_at: 0, modified_at: 0, version: 7,
    theme_id: 'cosmic', root_object_ids: ['table-1'], objects: {
      'table-1': {
        type: 'Table',
        data: {
          id: 'table-1',
          status: 'red',
          owner: 'Ada',
          effort: 13,
          cells: {
            A1: { value: 'Status' },
            A2: { value: 'red' },
            B2: { value: 7 },
            C2: { value: true },
          },
        },
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as unknown as WorkspaceDocument;
}

const drawWithShape = () => buildDrawModel({ objects: [{ id: 'shape-1', x: 40, y: 40, width: 160, height: 80, text: 'Node' }] });

const rule = (overrides: Partial<DrawDataGraphicRule> = {}): DrawDataGraphicRule => ({
  id: 'r1', sourceField: 'status', operator: 'eq', compareValue: 'red', target: 'fill', value: '#ef4444',
  allowGeometryMutation: false, ...overrides,
});

describe('Paket 14 — snapshot reader (bounded, named)', () => {
  it('reads the shared object payload one level deep and the shared grid cells', () => {
    const read = drawDataFieldsFrom(gridDocument(), 'table-1');
    expect(read.snapshot.sourceVersion).toBe(7);
    expect(read.snapshot.values.status).toBe('red');
    expect(read.snapshot.values.owner).toBe('Ada');
    expect(read.snapshot.values.effort).toBe(13);
    // Zellen der geteilten Tabellenform werden über ihren Koordinatennamen adressierbar.
    expect(read.snapshot.values.A2).toBe('red');
    expect(read.snapshot.values.B2).toBe(7);
    expect(read.snapshot.values.C2).toBe(true);
    expect(read.fields).toContain('status');
    expect(read.fields).toContain('A2');
    expect(read.fields.length).toBeLessThanOrEqual(DRAW_DATA_LIMITS.maxFields);
  });

  it('counts what the bounds leave out instead of dropping it silently', () => {
    const long = 'x'.repeat(DRAW_DATA_LIMITS.maxValueChars + 1);
    const document = gridDocument();
    // @ts-expect-error — der Test setzt bewusst einen zu langen Wert in die geteilte Nutzlast.
    document.objects['table-1'].data.tooLong = long;
    const read = drawDataFieldsFrom(document, 'table-1');
    expect(read.snapshot.values.tooLong).toBeUndefined();
    expect(read.skippedValues).toBeGreaterThan(0);
  });

  it('reads a nested primitive under its dotted path', () => {
    const document = gridDocument();
    // @ts-expect-error — absichtlich verschachtelt: `network.vlan`.
    document.objects['table-1'].data.network = { vlan: 20, zone: 'dmz', deep: { nope: 1 } };
    const read = drawDataFieldsFrom(document, 'table-1');
    expect(read.snapshot.values['network.vlan']).toBe(20);
    expect(read.snapshot.values['network.zone']).toBe('dmz');
    expect(read.snapshot.values['network.deep']).toBeUndefined();
  });

  it('fails closed with named reasons for a missing object, an empty object and a foreign document kind', () => {
    expect(() => drawDataFieldsFrom(gridDocument(), 'nope')).toThrowError(/data-source-object-missing/);
    const empty = gridDocument();
    // Eine leere Nutzlast: keine Skalare, also nichts adressierbar. (`{ id }` wäre **nicht** leer — `id` ist
    // ein echter Wert der geteilten Nutzlast; ihn zu verstecken wäre eine eigene Regel.)
    empty.objects['table-1'] = { type: 'Table', data: {} } as unknown as WorkspaceDocument['objects'][string];
    expect(() => drawDataFieldsFrom(empty, 'table-1')).toThrowError(/data-source-empty/);
    expect(() => drawDataSourceKind({ ...gridDocument(), kind: 'Writer' })).toThrowError(/data-source-kind-unsupported/);
  });
});

describe('Paket 14 — binding lifecycle (live / frozen / broken)', () => {
  it('binds a shape to a grid field and applies the rule immediately', () => {
    const result = bindDrawDataGraphic(drawWithShape(), {
      objectId: 'shape-1', sourceDocument: gridDocument(), sourceObjectId: 'table-1', rules: [rule()],
    });
    expect(result.applied).toBe(true);
    const binding = result.model.dataBindings.find((candidate) => candidate.id === result.bindingId)!;
    expect(binding.mode).toBe('live');
    expect(binding.sourceKind).toBe('grid-range');
    expect(binding.sourceDocumentId).toBe('grid-1');
    expect(binding.lastSourceVersion).toBe(7);
    // Die Projektion ist sofort sichtbar: Füllung aus der Regel.
    expect(result.model.objects['shape-1']?.vector?.style.fill).toBe('#ef4444');
  });

  it('uses the canonical binding writer, so the binding lives in model.dataBindings only', () => {
    const result = bindDrawDataGraphic(drawWithShape(), {
      objectId: 'shape-1', sourceDocument: gridDocument(), sourceObjectId: 'table-1', rules: [rule()],
    });
    expect(result.model.dataBindings.length).toBe(1);
    expect(drawDataBindingFor(result.model, 'shape-1')?.id).toBe(result.bindingId);
    expect(drawDataBindingFor(result.model, 'shape-2')).toBeNull();
  });

  it('switches to frozen by an explicit call, keeps the snapshot, and goes live again', () => {
    const bound = bindDrawDataGraphic(drawWithShape(), {
      objectId: 'shape-1', sourceDocument: gridDocument(), sourceObjectId: 'table-1', rules: [rule()],
    });
    const snapshot = drawDataFieldsFrom(gridDocument(), 'table-1').snapshot;

    const frozen = setDrawDataBindingMode(bound.model, bound.bindingId, 'frozen', snapshot, 1_000);
    expect(frozen.binding.mode).toBe('frozen');
    expect(frozen.binding.frozenSnapshot?.status).toBe('red');
    expect(drawDataBindingModeWord(frozen.binding)).toBe('frozen');

    // Eine eingefrorene Bindung wertet **ohne** Quelle aus — der Schnappschuss reicht.
    const applied = applyDrawDataGraphics(frozen.model, new Map());
    expect(applied.skipped).toEqual([]);
    expect(applied.model.objects['shape-1']?.vector?.style.fill).toBe('#ef4444');

    const live = setDrawDataBindingMode(frozen.model, bound.bindingId, 'live', snapshot, 2_000);
    expect(live.binding.mode).toBe('live');
    expect(live.binding.frozenSnapshot).toBeUndefined();
  });

  it('skips a live binding with a missing snapshot by name instead of reporting success', () => {
    const bound = bindDrawDataGraphic(drawWithShape(), {
      objectId: 'shape-1', sourceDocument: gridDocument(), sourceObjectId: 'table-1', rules: [rule()],
    });
    const applied = applyDrawDataGraphics(bound.model, new Map());
    expect(applied.applied).toEqual([]);
    expect(applied.skipped).toEqual([{ objectId: 'shape-1', code: 'data-binding-snapshot-missing' }]);
  });

  it('breaks, relinks and removes a binding through the canonical lifecycle', () => {
    const bound = bindDrawDataGraphic(drawWithShape(), {
      objectId: 'shape-1', sourceDocument: gridDocument(), sourceObjectId: 'table-1', rules: [rule()],
    });
    const broken = breakDrawDataBinding(bound.model, bound.bindingId);
    expect(broken.dataBindings[0]?.mode).toBe('broken');
    expect(broken.dataBindings[0]?.sourceDocumentId).toBeUndefined();
    // Eine gebrochene Bindung wird **nicht** stillschweigend angewendet — und der Grund ist der richtige:
    // „gebrochen", nicht „Schnappschuss fehlt" (Befund dieser Runde, per Test festgehalten).
    const pageWide = applyDrawDataGraphics(broken, new Map([['grid-1', drawDataFieldsFrom(gridDocument(), 'table-1').snapshot]]));
    expect(pageWide.applied).toEqual([]);
    expect(pageWide.skipped).toEqual([{ objectId: 'shape-1', code: 'data-binding-broken' }]);

    const relinked = relinkDrawDataBinding(broken, bound.bindingId, { sourceDocument: gridDocument(), sourceObjectId: 'table-1' });
    expect(relinked.dataBindings[0]?.mode).toBe('live');
    expect(relinked.objects['shape-1']?.vector?.style.fill).toBe('#ef4444');

    const removed = unbindDrawDataGraphic(relinked, bound.bindingId);
    expect(removed.dataBindings).toEqual([]);
    expect(removed.revision).toBe(relinked.revision + 1);
    expect(() => unbindDrawDataGraphic(removed, bound.bindingId)).toThrowError(/data-binding-missing/);
  });

  it('refuses to bind a locked or non-shape target, and refuses empty or oversized rule sets', () => {
    const locked = buildDrawModel({ objects: [{ id: 'shape-1', x: 0, y: 0, width: 10, height: 10, locked: true }] });
    expect(() => bindDrawDataGraphic(locked, {
      objectId: 'shape-1', sourceDocument: gridDocument(), sourceObjectId: 'table-1', rules: [rule()],
    })).toThrowError(/data-binding-locked/);

    const base = drawWithShape();
    expect(() => bindDrawDataGraphic(base, {
      objectId: 'nope', sourceDocument: gridDocument(), sourceObjectId: 'table-1', rules: [rule()],
    })).toThrowError(/data-binding-object-missing/);
    expect(() => bindDrawDataGraphic(base, {
      objectId: 'shape-1', sourceDocument: gridDocument(), sourceObjectId: 'table-1', rules: [],
    })).toThrowError(/data-rule-invalid/);
    expect(() => bindDrawDataGraphic(base, {
      objectId: 'shape-1', sourceDocument: gridDocument(), sourceObjectId: 'table-1',
      rules: Array.from({ length: DRAW_DATA_LIMITS.maxRules + 1 }, (_, index) => rule({ id: `r${index}` })),
    })).toThrowError(/data-rule-invalid/);
  });

  it('applies several rules of one binding: colour, icon, badge and label', () => {
    const rules: DrawDataGraphicRule[] = [
      rule({ id: 'fill', sourceField: 'status', target: 'fill', value: '#ef4444' }),
      rule({ id: 'icon', sourceField: 'status', target: 'icon', value: 'alert' }),
      rule({ id: 'badge', sourceField: 'status', target: 'badge', value: 'RED' }),
      rule({ id: 'label', sourceField: 'owner', operator: 'eq', compareValue: 'Ada', target: 'label', value: 'Ada' }),
      rule({ id: 'never', sourceField: 'status', operator: 'eq', compareValue: 'green', target: 'stroke', value: '#22c55e' }),
    ];
    const bound = bindDrawDataGraphic(drawWithShape(), {
      objectId: 'shape-1', sourceDocument: gridDocument(), sourceObjectId: 'table-1', rules,
    });
    const object = bound.model.objects['shape-1']!;
    expect(object.vector?.style.fill).toBe('#ef4444');
    expect(object.vector?.style.stroke).not.toBe('#22c55e');
  });

  it('keeps two bindings on two objects independent when applying the page', () => {
    const base = buildDrawModel({ objects: [
      { id: 'a', x: 0, y: 0, width: 10, height: 10 },
      { id: 'b', x: 20, y: 0, width: 10, height: 10 },
    ] });
    const first = bindDrawDataGraphic(base, { objectId: 'a', sourceDocument: gridDocument(), sourceObjectId: 'table-1', rules: [rule()] });
    const second = bindDrawDataGraphic(first.model, { objectId: 'b', sourceDocument: gridDocument(), sourceObjectId: 'table-1', rules: [rule({ id: 'r2', target: 'badge', value: 'X' })] });
    const applied = applyDrawDataGraphics(second.model, new Map([['grid-1', drawDataFieldsFrom(gridDocument(), 'table-1').snapshot]]));
    expect(new Set(applied.applied)).toEqual(new Set(['a', 'b']));
    expect(applied.skipped).toEqual([]);
    expect(applied.model.objects.a?.vector?.style.fill).toBe('#ef4444');
    // `b` hat eine **Badge**-Regel, keine Füllregel — die zweite Bindung darf die erste nicht überschreiben.
    expect(applied.model.objects.b?.customProperties?.dataBadge).toBe('X');
    expect(applied.model.objects.b?.vector?.style.fill).toBe(base.objects.b?.vector?.style.fill);
  });
});
