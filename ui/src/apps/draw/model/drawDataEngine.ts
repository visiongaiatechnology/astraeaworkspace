// STATUS: PLATIN — bounded data-binding projections and deterministic diagram generation.
import type {
  DrawDataBinding,
  DrawDataGraphicRule,
  DrawDataGraphicTarget,
  DrawDocumentModel,
  DrawObject,
} from '../../../shared/contracts/draw/workspaceDraw';
import { assertDrawDocument, DrawModelError } from './drawDocumentEngine';

const MAX_BINDINGS = 100_000;
const MAX_RULES = 256;
const MAX_RECORD_FIELDS = 2_048;
const MAX_TEXT = 1_000_000;
const MAX_FIELD_TEXT = 8_192;
const MAX_RULE_TEXT = 4_096;
const MAX_BINDING_ID = /^[A-Za-z0-9._:@-]{1,128}$/u;
const MAX_FIELD_ID = /^[A-Za-z0-9._:@ -]{1,256}$/u;
const SAFE_COLOR = /^(?:#[\da-f]{3,4}(?:[\da-f]{2}){0,2}|transparent|currentcolor|[a-z]{1,24}|(?:rgb|rgba|hsl|hsla)\([\d.,%+\-\s]{1,80}\))$/iu;
const clone = <T>(value: T): T => structuredClone(value);

const sourceKinds = new Set([
  'grid-range', 'database-record', 'database-query', 'task', 'project', 'insight', 'external-approved',
]);
const operators = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'truthy']);
const targets = new Set<DrawDataGraphicTarget>([
  'fill', 'stroke', 'icon', 'badge', 'data-bar', 'label', 'tooltip', 'x', 'y', 'width', 'height',
]);
const geometryTargets = new Set<DrawDataGraphicTarget>(['x', 'y', 'width', 'height']);

export interface DrawDataSnapshot {
  sourceVersion: number;
  values: Record<string, string | number | boolean | null>;
}

export interface DrawDataGraphicProjection {
  objectId: string;
  style: { fill?: string; stroke?: string };
  icon?: string;
  badge?: string;
  dataBar?: number;
  label?: string;
  tooltip?: string;
  geometry?: Partial<Pick<DrawObject, 'x' | 'y' | 'width' | 'height'>>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boundedString(value: unknown, maximum: number, code: string): string {
  if (typeof value !== 'string' || value.length > maximum) throw new DrawModelError(code);
  return value;
}

function safeId(value: unknown, code: string): string {
  if (typeof value !== 'string' || !MAX_BINDING_ID.test(value)) throw new DrawModelError(code);
  return value;
}

function safeWorkspaceObjectUri(value: unknown): { documentId: string; objectId: string } {
  if (typeof value !== 'string') throw new DrawModelError('binding-uri-invalid');
  const match = /^vgt:\/\/workspace\/document\/([A-Za-z0-9._:@-]{1,128})\/object\/([A-Za-z0-9._:@-]{1,128})$/u.exec(value);
  if (!match?.[1] || !match[2]) throw new DrawModelError('binding-uri-invalid');
  return { documentId: match[1], objectId: match[2] };
}

function numericValue(value: unknown, code: string): number {
  const validInput = typeof value === 'number'
    ? Number.isFinite(value)
    : typeof value === 'string' && value.length <= MAX_RULE_TEXT && /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/iu.test(value);
  if (!validInput) throw new DrawModelError(code);
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new DrawModelError(code);
  return parsed;
}

function normalizeSnapshotValues(value: unknown): Record<string, string | number | boolean | null> {
  if (!isRecord(value)) throw new DrawModelError('snapshot-values-invalid');
  const entries = Object.entries(value);
  if (entries.length > MAX_RECORD_FIELDS) throw new DrawModelError('snapshot-field-limit');

  let totalText = 0;
  const normalized = Object.create(null) as Record<string, string | number | boolean | null>;
  for (const [field, rawValue] of entries) {
    if (!MAX_FIELD_ID.test(field)) throw new DrawModelError('snapshot-field-invalid');
    if (typeof rawValue === 'string') {
      if (rawValue.length > MAX_FIELD_TEXT) throw new DrawModelError('snapshot-value-size-limit');
      totalText += rawValue.length;
    } else if (typeof rawValue === 'number') {
      if (!Number.isFinite(rawValue)) throw new DrawModelError('snapshot-value-invalid');
    } else if (typeof rawValue !== 'boolean' && rawValue !== null) {
      throw new DrawModelError('snapshot-value-invalid');
    }
    if (totalText > MAX_TEXT) throw new DrawModelError('snapshot-text-limit');
    normalized[field] = rawValue;
  }
  return normalized;
}

function normalizeSnapshot(snapshot: DrawDataSnapshot): DrawDataSnapshot {
  if (!isRecord(snapshot) || !Number.isSafeInteger(snapshot.sourceVersion) || snapshot.sourceVersion < 0) {
    throw new DrawModelError('source-version-invalid');
  }
  return { sourceVersion: snapshot.sourceVersion, values: normalizeSnapshotValues(snapshot.values) };
}

function validateRule(value: unknown): asserts value is DrawDataGraphicRule {
  if (!isRecord(value)) throw new DrawModelError('data-graphic-rule-invalid');
  safeId(value.id, 'data-graphic-rule-id-invalid');
  if (typeof value.sourceField !== 'string' || !MAX_FIELD_ID.test(value.sourceField)) {
    throw new DrawModelError('data-graphic-field-invalid');
  }
  if (typeof value.operator !== 'string' || !operators.has(value.operator)) {
    throw new DrawModelError('data-graphic-operator-invalid');
  }
  if (typeof value.target !== 'string' || !targets.has(value.target as DrawDataGraphicTarget)) {
    throw new DrawModelError('data-graphic-target-invalid');
  }
  if (typeof value.allowGeometryMutation !== 'boolean') throw new DrawModelError('data-graphic-authorization-invalid');
  if (geometryTargets.has(value.target as DrawDataGraphicTarget) && !value.allowGeometryMutation) {
    throw new DrawModelError('geometry-mapping-not-authorized');
  }

  if (value.compareValue !== undefined) {
    if (typeof value.compareValue === 'string') boundedString(value.compareValue, MAX_RULE_TEXT, 'data-graphic-compare-invalid');
    else if (typeof value.compareValue === 'number' && !Number.isFinite(value.compareValue)) {
      throw new DrawModelError('data-graphic-compare-invalid');
    } else if (typeof value.compareValue !== 'number' && typeof value.compareValue !== 'boolean') {
      throw new DrawModelError('data-graphic-compare-invalid');
    }
  } else if (value.operator !== 'truthy') {
    throw new DrawModelError('data-graphic-compare-invalid');
  }
  if (['gt', 'gte', 'lt', 'lte'].includes(value.operator)) numericValue(value.compareValue, 'data-graphic-number-invalid');

  if (typeof value.value === 'string') boundedString(value.value, MAX_RULE_TEXT, 'data-graphic-value-invalid');
  else if (typeof value.value !== 'number' || !Number.isFinite(value.value)) {
    throw new DrawModelError('data-graphic-value-invalid');
  }

  switch (value.target) {
    case 'fill':
    case 'stroke':
      if (typeof value.value !== 'string' || !SAFE_COLOR.test(value.value)) throw new DrawModelError('data-graphic-color-invalid');
      break;
    case 'icon':
      if (typeof value.value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/u.test(value.value)) {
        throw new DrawModelError('data-graphic-icon-invalid');
      }
      break;
    case 'data-bar': {
      numericValue(value.value, 'data-graphic-number-invalid');
      break;
    }
    case 'label':
      boundedString(value.value, 512, 'data-graphic-label-invalid');
      break;
    case 'badge':
      boundedString(value.value, 256, 'data-graphic-badge-invalid');
      break;
    case 'tooltip':
      boundedString(value.value, 2_048, 'data-graphic-tooltip-invalid');
      break;
    case 'x':
    case 'y':
    case 'width':
    case 'height': {
      const geometry = numericValue(value.value, 'data-graphic-number-invalid');
      if ((value.target === 'width' || value.target === 'height') && geometry < 0) {
        throw new DrawModelError('data-graphic-size-invalid');
      }
      break;
    }
  }
}

function validateBinding(value: unknown): asserts value is DrawDataBinding {
  if (!isRecord(value)) throw new DrawModelError('data-binding-invalid');
  safeId(value.id, 'data-binding-id-invalid');
  safeId(value.objectId, 'data-binding-object-invalid');
  if (typeof value.sourceKind !== 'string' || !sourceKinds.has(value.sourceKind)) {
    throw new DrawModelError('data-binding-source-invalid');
  }
  if (value.mode !== 'live' && value.mode !== 'frozen' && value.mode !== 'broken') {
    throw new DrawModelError('data-binding-mode-invalid');
  }
  const sourceUri = boundedString(value.sourceUri, 4_096, 'binding-uri-invalid');
  if (!Array.isArray(value.rules) || value.rules.length > MAX_RULES) throw new DrawModelError('binding-rule-limit');
  const ruleIds = new Set<string>();
  for (const rule of value.rules) {
    validateRule(rule);
    if (ruleIds.has(rule.id)) throw new DrawModelError('data-graphic-rule-duplicate');
    ruleIds.add(rule.id);
  }

  if (value.mode === 'broken') {
    if (sourceUri !== 'vgt://workspace/broken' || value.sourceDocumentId !== undefined || value.selector !== undefined) {
      throw new DrawModelError('broken-binding-invalid');
    }
  } else if (value.sourceKind === 'external-approved') {
    if (!/^cap:\/\/[A-Za-z0-9._:@-]{1,128}$/u.test(sourceUri)) {
      throw new DrawModelError('external-capability-invalid');
    }
  } else {
    const source = safeWorkspaceObjectUri(sourceUri);
    if (typeof value.sourceDocumentId !== 'string' || source.documentId !== value.sourceDocumentId) {
      throw new DrawModelError('binding-source-document-mismatch');
    }
    safeId(value.sourceDocumentId, 'binding-source-document-invalid');
  }

  if (value.sourceDocumentId !== undefined) safeId(value.sourceDocumentId, 'binding-source-document-invalid');
  if (value.selector !== undefined) boundedString(value.selector, MAX_RULE_TEXT, 'binding-selector-invalid');
  if (value.frozenSnapshot !== undefined) normalizeSnapshotValues(value.frozenSnapshot);
  if (value.mode === 'frozen' && value.frozenSnapshot === undefined) throw new DrawModelError('frozen-snapshot-missing');
  if (value.mode !== 'frozen' && value.frozenSnapshot !== undefined) throw new DrawModelError('unexpected-frozen-snapshot');
  if (value.lastSourceVersion !== undefined && (typeof value.lastSourceVersion !== 'number' || !Number.isSafeInteger(value.lastSourceVersion) || value.lastSourceVersion < 0)) {
    throw new DrawModelError('source-version-invalid');
  }
  if (value.lastRefreshAt !== undefined && (typeof value.lastRefreshAt !== 'number' || !Number.isSafeInteger(value.lastRefreshAt) || value.lastRefreshAt < 0)) {
    throw new DrawModelError('binding-time-invalid');
  }
}

function matches(value: string | number | boolean | null | undefined, rule: DrawDataGraphicRule): boolean {
  const compare = rule.compareValue;
  switch (rule.operator) {
    case 'eq': return value === compare;
    case 'neq': return value !== compare;
    case 'gt': return value !== undefined && value !== null && numericValue(value, 'data-graphic-number-invalid') > numericValue(compare, 'data-graphic-number-invalid');
    case 'gte': return value !== undefined && value !== null && numericValue(value, 'data-graphic-number-invalid') >= numericValue(compare, 'data-graphic-number-invalid');
    case 'lt': return value !== undefined && value !== null && numericValue(value, 'data-graphic-number-invalid') < numericValue(compare, 'data-graphic-number-invalid');
    case 'lte': return value !== undefined && value !== null && numericValue(value, 'data-graphic-number-invalid') <= numericValue(compare, 'data-graphic-number-invalid');
    case 'contains': return String(value ?? '').includes(String(compare ?? ''));
    case 'truthy': return Boolean(value);
  }
}

function boundedNumeric(value: string | number, minimum: number, maximum: number): number {
  const parsed = numericValue(value, 'data-graphic-number-invalid');
  return Math.max(minimum, Math.min(maximum, parsed));
}

export function evaluateDataGraphics(
  object: DrawObject,
  binding: DrawDataBinding,
  snapshot: DrawDataSnapshot,
): DrawDataGraphicProjection {
  if (!isRecord(object) || object.type !== 'shape' || !object.vector) throw new DrawModelError('data-graphic-shape-required');
  validateBinding(binding);
  if (binding.objectId !== object.id) throw new DrawModelError('binding-object-mismatch');
  if (binding.mode === 'broken') throw new DrawModelError('binding-broken');

  const sourceSnapshot = normalizeSnapshot(snapshot);
  const effectiveSnapshot = binding.mode === 'frozen'
    ? { sourceVersion: binding.lastSourceVersion ?? sourceSnapshot.sourceVersion, values: normalizeSnapshotValues(binding.frozenSnapshot) }
    : sourceSnapshot;
  const projection: DrawDataGraphicProjection = { objectId: object.id, style: {} };

  for (const rule of binding.rules) {
    if (!matches(effectiveSnapshot.values[rule.sourceField], rule)) continue;
    switch (rule.target) {
      case 'fill': projection.style.fill = rule.value as string; break;
      case 'stroke': projection.style.stroke = rule.value as string; break;
      case 'icon': projection.icon = rule.value as string; break;
      case 'badge': projection.badge = rule.value as string; break;
      case 'data-bar': projection.dataBar = boundedNumeric(rule.value, 0, 100); break;
      case 'label': projection.label = rule.value as string; break;
      case 'tooltip': projection.tooltip = rule.value as string; break;
      case 'x':
      case 'y':
      case 'width':
      case 'height':
        (projection.geometry ??= {})[rule.target] = boundedNumeric(rule.value, -1_000_000, 1_000_000);
        break;
    }
  }
  return projection;
}

export function applyDataGraphicProjection(
  object: DrawObject,
  projection: DrawDataGraphicProjection,
): DrawObject {
  if (!isRecord(object) || object.type !== 'shape' || !object.vector) throw new DrawModelError('data-graphic-shape-required');
  if (!isRecord(projection) || projection.objectId !== object.id) throw new DrawModelError('projection-object-mismatch');
  if (!isRecord(projection.style)) throw new DrawModelError('projection-style-invalid');

  const style = { ...projection.style };
  for (const color of [style.fill, style.stroke]) {
    if (color !== undefined && (typeof color !== 'string' || !SAFE_COLOR.test(color))) {
      throw new DrawModelError('data-graphic-color-invalid');
    }
  }
  if (projection.icon !== undefined && (typeof projection.icon !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/u.test(projection.icon))) {
    throw new DrawModelError('data-graphic-icon-invalid');
  }
  if (projection.label !== undefined) boundedString(projection.label, 512, 'data-graphic-label-invalid');
  if (projection.badge !== undefined) boundedString(projection.badge, 256, 'data-graphic-badge-invalid');
  if (projection.tooltip !== undefined) boundedString(projection.tooltip, 2_048, 'data-graphic-tooltip-invalid');
  if (projection.dataBar !== undefined && (!Number.isFinite(projection.dataBar) || projection.dataBar < 0 || projection.dataBar > 100)) {
    throw new DrawModelError('data-graphic-number-range');
  }

  const geometry = projection.geometry;
  if (geometry !== undefined) {
    if (!isRecord(geometry)) throw new DrawModelError('data-graphic-geometry-invalid');
    for (const [key, value] of Object.entries(geometry)) {
      if (!geometryTargets.has(key as DrawDataGraphicTarget) || typeof value !== 'number' || !Number.isFinite(value) || value < -1_000_000 || value > 1_000_000) {
        throw new DrawModelError('data-graphic-geometry-invalid');
      }
      if ((key === 'width' || key === 'height') && value < 0) throw new DrawModelError('data-graphic-size-invalid');
    }
  }

  const next = clone(object);
  const vector = next.vector;
  if (!vector) throw new DrawModelError('data-graphic-shape-required');
  vector.style = { ...vector.style, ...style };
  if (projection.icon !== undefined) vector.iconName = projection.icon;
  if (projection.label !== undefined) next.name = projection.label;
  if (geometry) Object.assign(next, geometry);
  next.customProperties = {
    ...(next.customProperties ?? {}),
    ...(projection.badge !== undefined ? { dataBadge: projection.badge } : {}),
    ...(projection.dataBar !== undefined ? { dataBar: projection.dataBar } : {}),
    ...(projection.tooltip !== undefined ? { dataTooltip: projection.tooltip } : {}),
  };
  return next;
}

export function upsertDataBinding(model: DrawDocumentModel, binding: DrawDataBinding): DrawDocumentModel {
  assertDrawDocument(model);
  validateBinding(binding);
  if (model.dataBindings.length >= MAX_BINDINGS && !model.dataBindings.some((entry) => entry.id === binding.id)) {
    throw new DrawModelError('data-binding-limit');
  }
  const target = model.objects[binding.objectId];
  if (!target || target.type !== 'shape' || !target.vector) throw new DrawModelError('binding-object-missing');

  const existingIds = new Set<string>();
  for (const existing of model.dataBindings) {
    if (existingIds.has(existing.id)) throw new DrawModelError('data-binding-duplicate');
    existingIds.add(existing.id);
  }

  const next = clone(model);
  const index = next.dataBindings.findIndex((entry) => entry.id === binding.id);
  if (index >= 0) next.dataBindings[index] = clone(binding);
  else next.dataBindings.push(clone(binding));
  next.revision += 1;
  assertDrawDocument(next);
  return next;
}

/**
 * Entfernt eine Bindung. Der Lebenszyklus der Bindung gehört hierher (wie `upsertDataBinding`), damit es
 * **einen** Schreiber über `model.dataBindings` gibt.
 */
export function removeDataBinding(model: DrawDocumentModel, bindingId: string): DrawDocumentModel {
  assertDrawDocument(model);
  const target = safeId(bindingId, 'data-binding-id-invalid');
  if (!model.dataBindings.some((binding) => binding.id === target)) throw new DrawModelError('data-binding-missing');
  const next = clone(model);
  next.dataBindings = next.dataBindings.filter((binding) => binding.id !== target);
  next.revision += 1;
  assertDrawDocument(next);
  return next;
}

function validateTime(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new DrawModelError('binding-time-invalid');
  return value;
}

export function refreshDataBinding(binding: DrawDataBinding, snapshot: DrawDataSnapshot, now: number): DrawDataBinding {
  validateBinding(binding);
  if (binding.mode === 'broken') throw new DrawModelError('binding-broken');
  const normalizedSnapshot = normalizeSnapshot(snapshot);
  return {
    ...clone(binding),
    mode: 'live',
    frozenSnapshot: undefined,
    lastSourceVersion: normalizedSnapshot.sourceVersion,
    lastRefreshAt: validateTime(now),
  };
}

export function freezeDataBinding(binding: DrawDataBinding, snapshot: DrawDataSnapshot, now: number): DrawDataBinding {
  validateBinding(binding);
  if (binding.mode === 'broken') throw new DrawModelError('binding-broken');
  const normalizedSnapshot = normalizeSnapshot(snapshot);
  return {
    ...clone(binding),
    mode: 'frozen',
    frozenSnapshot: clone(normalizedSnapshot.values),
    lastSourceVersion: normalizedSnapshot.sourceVersion,
    lastRefreshAt: validateTime(now),
  };
}

export function breakDataBinding(binding: DrawDataBinding): DrawDataBinding {
  validateBinding(binding);
  return {
    ...clone(binding),
    mode: 'broken',
    sourceDocumentId: undefined,
    sourceUri: 'vgt://workspace/broken',
    selector: undefined,
    frozenSnapshot: undefined,
  };
}

export function relinkDataBinding(
  binding: DrawDataBinding,
  input: {
    sourceDocumentId?: string;
    sourceUri: string;
    selector?: string;
    sourceKind: DrawDataBinding['sourceKind'];
  },
): DrawDataBinding {
  validateBinding(binding);
  const next: DrawDataBinding = {
    ...clone(binding),
    ...clone(input),
    mode: 'live',
    frozenSnapshot: undefined,
    lastSourceVersion: undefined,
    lastRefreshAt: undefined,
  };
  validateBinding(next);
  return next;
}

export function dataBindingNavigationTarget(binding: DrawDataBinding): { documentId?: string; uri: string; selector?: string } {
  validateBinding(binding);
  return { documentId: binding.sourceDocumentId, uri: binding.sourceUri, selector: binding.selector };
}
