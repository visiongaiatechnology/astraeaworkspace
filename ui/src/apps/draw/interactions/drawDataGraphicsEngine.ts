// STATUS: PLATIN — Draw data graphics: makes the existing binding/projection engines reachable from a
// real workspace source. **No second Grid parser and no second projection rule live here.**
//
// Ownership map (this module only orchestrates):
//   * `bindWorkspaceDataGraphic` (integrations)  — creates the binding and its `sourceUri`.
//   * `drawDataEngine`                           — binding lifecycle (`refresh`/`freeze`/`break`/`relink`),
//                                                  `evaluateDataGraphics`, `applyDataGraphicProjection`.
//   * this module                                — the **snapshot source**: which values a workspace
//                                                  object exposes, bounded and named.
//
// Why the snapshot reader lives here: measured, there is no other bridge from a `WorkspaceDocument` to
// `DrawDataSnapshot` (`grep DrawDataSnapshot` → only `drawDataEngine` itself). The reader therefore uses
// the **shared** object payload (`WorkspaceObject.data`) — one level of primitives plus, when the payload
// carries the shared Grid table shape (`cells`), one field per cell. It never interprets formulas, ranges
// or sheet semantics; that belongs to Grid.
import type {
  DrawDataBinding, DrawDataBindingMode, DrawDataGraphicRule, DrawDataGraphicTarget, DrawDocumentModel,
  DrawObjectId,
} from '../../../shared/contracts/draw/workspaceDraw';
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import { DrawModelError, assertDrawDocument, upsertDrawObject } from '../model/drawDocumentEngine';
import {
  applyDataGraphicProjection, breakDataBinding, evaluateDataGraphics, freezeDataBinding, refreshDataBinding,
  relinkDataBinding, removeDataBinding, upsertDataBinding, type DrawDataSnapshot,
} from '../model/drawDataEngine';
import { bindWorkspaceDataGraphic } from '../integrations/drawWorkspaceIntegration';
import { workspaceObjectUri } from '../../../platform/workspace/model/workspaceObjectModel';
import { isRecord, MAX_OBJECTS, safeId } from '../model/drawDocumentValidation';
import { projectDrawScene } from './drawSceneProjection';

/** Named bounds of the snapshot reader — a value outside them is **counted**, never silently dropped. */
export const DRAW_DATA_LIMITS = Object.freeze({
  maxFields: 512,
  maxCells: 4_096,
  maxValueChars: 512,
  maxRules: 32,
});

/** Die benannten Gründe dieser Fläche. Alles andere kommt aus den vorhandenen Engines. */
export type DrawDataRefusal =
  | 'data-source-document-missing'
  | 'data-source-kind-unsupported'
  | 'data-source-object-missing'
  | 'data-source-empty'
  | 'data-binding-missing'
  | 'data-binding-object-missing'
  | 'data-binding-snapshot-missing'
  | 'data-binding-broken'
  | 'data-binding-locked'
  | 'data-rule-invalid';

export interface DrawDataFields {
  /** Die gelesenen Werte — genau die Form, die `evaluateDataGraphics` erwartet. */
  readonly snapshot: DrawDataSnapshot;
  /** Die anwählbaren Feldnamen, sortiert. */
  readonly fields: readonly string[];
  /** Wie viele Werte die Grenzen überschritten haben (benannt, nicht verschwiegen). */
  readonly skippedValues: number;
}

function isScalar(value: unknown): value is string | number | boolean | null {
  return value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function scalarValue(value: unknown): string | number | boolean | null | undefined {
  if (!isScalar(value)) return undefined;
  if (typeof value === 'string') return value.length <= DRAW_DATA_LIMITS.maxValueChars ? value : undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  return value;
}

/** Der Quelltyp, den `bindWorkspaceDataGraphic` führt — **nicht** erfunden, sondern seine zwei Arten. */
export function drawDataSourceKind(document: WorkspaceDocument): 'grid-range' | 'insight' {
  if (document.kind === 'Grid') return 'grid-range';
  if (document.kind === 'Insight') return 'insight';
  throw new DrawModelError('data-source-kind-unsupported');
}

/**
 * Liest die Werte eines Arbeitsbereichs-Objekts: eine Ebene Primitive (`data`) plus — wenn vorhanden — die
 * Zellen der geteilten Tabellenform (`data.cells[coord].value`, `GridCell` aus `shared/contracts/grid`).
 * Grenzen werden gezählt; ein zu langer Text wird **nicht** abgeschnitten, sondern ausgelassen und gezählt.
 */
export function drawDataFieldsFrom(document: WorkspaceDocument, objectId: DrawObjectId): DrawDataFields {
  const object = document.objects[safeId(objectId, 'data-source-object-missing')];
  if (!object) throw new DrawModelError('data-source-object-missing');
  const data = isRecord(object.data) ? object.data : null;
  if (!data) throw new DrawModelError('data-source-empty');

  const values: Record<string, string | number | boolean | null> = {};
  let skippedValues = 0;
  let fields = 0;

  const push = (key: string, raw: unknown): void => {
    const value = scalarValue(raw);
    if (value === undefined) { skippedValues += 1; return; }
    if (fields >= DRAW_DATA_LIMITS.maxFields) { skippedValues += 1; return; }
    if (Object.hasOwn(values, key)) return;
    values[key] = value;
    fields += 1;
  };

  let cells = 0;
  for (const [key, raw] of Object.entries(data)) {
    if (key === 'cells') continue;
    if (isScalar(raw)) { push(key, raw); continue; }
    if (!isRecord(raw)) { skippedValues += 1; continue; }
    // Eine Ebene tiefer: `parent.child` — damit z. B. `network.vlan` adressierbar bleibt.
    for (const [nestedKey, nestedRaw] of Object.entries(raw)) {
      if (cells >= DRAW_DATA_LIMITS.maxCells) break;
      if (isScalar(nestedRaw) || isRecord(nestedRaw)) push(`${key}.${nestedKey}`, nestedRaw);
      else skippedValues += 1;
    }
  }

  // Die geteilte Tabellenform: `cells: { 'A1': { value: … } }` — jedes Blatt wird ein Feld mit seinem Koordinatennamen.
  if (isRecord(data.cells)) {
    for (const [coordinate, cell] of Object.entries(data.cells)) {
      if (cells >= DRAW_DATA_LIMITS.maxCells) { skippedValues += 1; continue; }
      if (!isRecord(cell)) { skippedValues += 1; continue; }
      push(coordinate, cell.value);
      cells += 1;
    }
  }

  if (fields === 0) throw new DrawModelError('data-source-empty');
  return {
    snapshot: { sourceVersion: Number.isSafeInteger(document.version) ? document.version : 0, values },
    fields: Object.keys(values).sort(),
    skippedValues,
  };
}

export interface DrawDataBindInput {
  readonly objectId: DrawObjectId;
  readonly sourceDocument: WorkspaceDocument;
  readonly sourceObjectId: DrawObjectId;
  readonly selector?: string;
  readonly rules: readonly DrawDataGraphicRule[];
  readonly idSeed?: string;
}

export interface DrawDataBindResult {
  readonly model: DrawDocumentModel;
  readonly bindingId: string;
  readonly applied: boolean;
}

function requireBindableShape(model: DrawDocumentModel, objectId: DrawObjectId, scene = projectDrawScene(model, model.activePageId)) {
  const entry = scene.byId.get(objectId);
  if (!entry) throw new DrawModelError('data-binding-object-missing');
  if (entry.locked) throw new DrawModelError('data-binding-locked');
  if (entry.object.type !== 'shape' || !entry.object.vector) throw new DrawModelError('data-binding-target-invalid');
  return entry.object;
}

function validateRules(rules: readonly DrawDataGraphicRule[]): DrawDataGraphicRule[] {
  if (!Array.isArray(rules) || rules.length === 0 || rules.length > DRAW_DATA_LIMITS.maxRules) {
    throw new DrawModelError('data-rule-invalid');
  }
  return rules.map((rule) => ({ ...rule }));
}

/**
 * Bindet das ausgewählte Objekt an ein Quellobjekt und wendet die Projektion **sofort** an. Die Bindung
 * entsteht als `live` (durch den ausdrücklichen Aufruf), danach trägt sie die **gelesenen** Versionen.
 */
export function bindDrawDataGraphic(model: DrawDocumentModel, input: DrawDataBindInput): DrawDataBindResult {
  assertDrawDocument(model);
  const objectId = safeId(input.objectId, 'data-binding-object-missing');
  const sourceObjectId = safeId(input.sourceObjectId, 'data-source-object-missing');
  requireBindableShape(model, objectId);
  const sourceKind = drawDataSourceKind(input.sourceDocument);
  const read = drawDataFieldsFrom(input.sourceDocument, sourceObjectId);
  const rules = validateRules(input.rules);
  const seed = input.idSeed ?? `binding-${objectId}-${model.revision + 1}`;
  const bindingId = safeId(seed.slice(0, 120), 'data-binding-id-invalid');

  let next = bindWorkspaceDataGraphic(model, {
    id: bindingId,
    objectId,
    sourceKind,
    sourceDocumentId: input.sourceDocument.id,
    sourceObjectId,
    selector: input.selector,
    rules,
  });
  const created = next.dataBindings.find((binding) => binding.id === bindingId);
  if (!created) throw new DrawModelError('data-binding-missing');
  next = upsertDataBinding(next, refreshDataBinding(created, read.snapshot, Date.now()));
  const applied = applyOneBinding(next, bindingId, read.snapshot);
  return { model: applied.model, bindingId, applied: applied.applied.length === 1 };
}

/** Wendet **eine** Bindung auf ihr Objekt an. Gibt den Grund zurück, wenn sie nicht angewendet wurde. */
function applyOneBinding(
  model: DrawDocumentModel,
  bindingId: string,
  snapshot: DrawDataSnapshot | null,
): { model: DrawDocumentModel; applied: readonly DrawObjectId[]; skipped: readonly { objectId: DrawObjectId; code: DrawDataRefusal }[] } {
  const binding = model.dataBindings.find((candidate) => candidate.id === bindingId);
  if (!binding) throw new DrawModelError('data-binding-missing');
  const object = model.objects[binding.objectId];
  if (!object) return { model, applied: [], skipped: [{ objectId: binding.objectId, code: 'data-binding-object-missing' }] };
  // **Reihenfolge ist Bedeutung** (Befund dieser Runde): eine **gebrochene** Bindung hat keinen Quellbezug
  // mehr, also darf sie nicht als „Schnappschuss fehlt" gemeldet werden — das wäre der falsche Grund.
  if (binding.mode === 'broken') {
    return { model, applied: [], skipped: [{ objectId: binding.objectId, code: 'data-binding-broken' }] };
  }
  // Eine eingefrorene Bindung braucht **keinen** Quellwert: sie trägt ihren Schnappschuss selbst.
  if (binding.mode !== 'frozen' && snapshot === null) {
    return { model, applied: [], skipped: [{ objectId: binding.objectId, code: 'data-binding-snapshot-missing' }] };
  }
  const effective: DrawDataSnapshot = snapshot ?? {
    sourceVersion: binding.lastSourceVersion ?? 0,
    values: binding.frozenSnapshot ?? {},
  };
  const projection = evaluateDataGraphics(object, binding, effective);
  const projected = applyDataGraphicProjection(object, projection);
  return { model: upsertDrawObject(model, projected), applied: [binding.objectId], skipped: [] };
}

export type DrawDataModeChoice = Extract<DrawDataBindingMode, 'live' | 'frozen'>;

export interface DrawDataModeResult {
  readonly model: DrawDocumentModel;
  readonly binding: DrawDataBinding;
}

/** Setzt den Modus **durch Klick** (Live oder Frozen) — kein heimlicher Default, kein Modus ohne Handlung. */
export function setDrawDataBindingMode(
  model: DrawDocumentModel,
  bindingId: string,
  mode: DrawDataModeChoice,
  snapshot: DrawDataSnapshot,
  now: number,
): DrawDataModeResult {
  assertDrawDocument(model);
  const binding = model.dataBindings.find((candidate) => candidate.id === safeId(bindingId, 'data-binding-id-invalid'));
  if (!binding) throw new DrawModelError('data-binding-missing');
  requireBindableShape(model, binding.objectId);
  const nextBinding = mode === 'frozen'
    ? freezeDataBinding(binding, snapshot, now)
    : refreshDataBinding(binding, snapshot, now);
  const withBinding = upsertDataBinding(model, nextBinding);
  const applied = applyOneBinding(withBinding, bindingId, snapshot);
  return { model: applied.model, binding: nextBinding };
}

export function breakDrawDataBinding(model: DrawDocumentModel, bindingId: DrawDataBinding['id']): DrawDocumentModel {
  assertDrawDocument(model);
  const binding = model.dataBindings.find((candidate) => candidate.id === safeId(bindingId, 'data-binding-id-invalid'));
  if (!binding) throw new DrawModelError('data-binding-missing');
  return upsertDataBinding(model, breakDataBinding(binding));
}

export function relinkDrawDataBinding(
  model: DrawDocumentModel,
  bindingId: DrawDataBinding['id'],
  source: { readonly sourceDocument: WorkspaceDocument; readonly sourceObjectId: DrawObjectId; readonly selector?: string },
): DrawDocumentModel {
  assertDrawDocument(model);
  const binding = model.dataBindings.find((candidate) => candidate.id === safeId(bindingId, 'data-binding-id-invalid'));
  if (!binding) throw new DrawModelError('data-binding-missing');
  const read = drawDataFieldsFrom(source.sourceDocument, source.sourceObjectId);
  const relinked = relinkDataBinding(binding, {
    sourceDocumentId: source.sourceDocument.id,
    // **Eine** URI-Form: der kanonische Erzeuger, nicht eine zweite Zeichenkette. (Meine erste Fassung baute
    // `vgt://workspace/<doc>/<obj>` von Hand und die Engine lehnte sie als `binding-uri-invalid` ab —
    // gefunden vom Relink-Test, nicht beim Lesen.)
    sourceUri: workspaceObjectUri(source.sourceDocument.id, safeId(source.sourceObjectId, 'data-source-object-missing')),
    selector: source.selector,
    sourceKind: drawDataSourceKind(source.sourceDocument),
  });
  const withBinding = upsertDataBinding(model, refreshDataBinding(relinked, read.snapshot, Date.now()));
  return applyOneBinding(withBinding, bindingId, read.snapshot).model;
}

export function unbindDrawDataGraphic(model: DrawDocumentModel, bindingId: DrawDataBinding['id']): DrawDocumentModel {
  assertDrawDocument(model);
  if (!model.dataBindings.some((candidate) => candidate.id === bindingId)) throw new DrawModelError('data-binding-missing');
  return removeDataBinding(model, bindingId);
}

export interface DrawDataApplyResult {
  readonly model: DrawDocumentModel;
  readonly applied: readonly DrawObjectId[];
  readonly skipped: readonly { readonly objectId: DrawObjectId; readonly code: DrawDataRefusal }[];
}

/**
 * Wendet **alle** Bindungen der aktiven Seite an. `snapshots` liefert je Quelldokument die gelesenen Werte;
 * fehlt eines, wird die Bindung **benannt** übersprungen (`data-binding-snapshot-missing`) statt still zu gelten.
 */
export function applyDrawDataGraphics(
  model: DrawDocumentModel,
  snapshots: ReadonlyMap<string, DrawDataSnapshot>,
): DrawDataApplyResult {
  assertDrawDocument(model);
  if (!(snapshots instanceof Map)) throw new DrawModelError('data-snapshot-map-invalid');
  const page = model.pages.find((candidate) => candidate.id === model.activePageId);
  if (!page) throw new DrawModelError('page-missing');
  const pageObjects = new Set(page.objectIds);
  let next = model;
  const applied: DrawObjectId[] = [];
  const skipped: { objectId: DrawObjectId; code: DrawDataRefusal }[] = [];
  for (const binding of [...model.dataBindings].slice(0, MAX_OBJECTS)) {
    if (!pageObjects.has(binding.objectId)) continue;
    const snapshot = binding.sourceDocumentId ? snapshots.get(binding.sourceDocumentId) ?? null : null;
    const outcome = applyOneBinding(next, binding.id, snapshot);
    next = outcome.model;
    applied.push(...outcome.applied);
    skipped.push(...outcome.skipped);
  }
  return { model: next, applied, skipped };
}

/** Die Bindung eines Objekts (höchstens eine — eine zweite wäre eine zweite Wahrheit über denselben Wert). */
export function drawDataBindingFor(model: DrawDocumentModel, objectId: DrawObjectId): DrawDataBinding | null {
  return model.dataBindings.find((binding) => binding.objectId === objectId) ?? null;
}

export function drawDataBindingModeWord(binding: DrawDataBinding): DrawDataBindingMode {
  return binding.mode;
}

/** Alle Ziele, die die Engine führt — **gelesen** aus ihrem eigenen Vertrag, nicht neu geschrieben. */
export const DRAW_DATA_TARGETS: readonly DrawDataGraphicTarget[] = Object.freeze([
  'fill', 'stroke', 'icon', 'badge', 'label', 'tooltip', 'data-bar',
]);

export const DRAW_DATA_OPERATORS: readonly DrawDataGraphicRule['operator'][] = Object.freeze([
  'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'truthy',
]);
