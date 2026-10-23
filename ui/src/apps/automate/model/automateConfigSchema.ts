// STATUS: DIAMANT VGT SUPREME — the single definition of what each node's configuration is.
//
// MEASURED FACTS this module encodes (see BATCH-AUTOMATE/INVENTORY.md):
//  - `AutomateCanvas` printed `JSON.stringify(node.config)` and offered no way to change a value, so
//    AST-1701 ("Eingabeparameter mit korrektem Typ bearbeiten") was unreachable.
//  - Node config was authored only by the palette templates; every value a user might need to change
//    (schedule interval, loop bound, expression, concurrency) was frozen at the template constant.
//
// One definition per fact: this module owns WHICH fields exist, their type and their bounds. The
// inspector component only renders what this returns, and `validateNodeConfig` is the same list the
// save/validate path uses — so the form and the contract cannot drift.
//
// Routing of each field's *legality* stays where it already lives: `validateNodeTriggerConfig`
// (triggers) and `validateFlowTriggerConfigs` wrap `triggers/automateTriggerCore.ts`. This module adds
// the typed form contract on top and delegates the trigger check rather than restating its bounds.
import type { AutomateNodeType, FlowNode, JsonValue } from './types';

export class AutomateConfigError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'AutomateConfigError';
  }
}

export type AutomateConfigFieldKind = 'text' | 'number' | 'boolean' | 'select' | 'textarea' | 'mapping';

/** One entry of a loop's data mapping: where a value comes from and where it goes. */
export interface AutomateMappingEntry {
  readonly from: string;
  readonly to: string;
  readonly expression?: string;
}

export interface AutomateConfigOption {
  /** Stored value. */
  readonly value: string | number | boolean;
  /** i18n key for the visible label; the inspector localizes it. */
  readonly labelKey: string;
}

export interface AutomateConfigField {
  /** Stable id, also the i18n key for the label. */
  readonly key: string;
  /** Where the value lives inside `node.config`. */
  readonly path: readonly string[];
  readonly kind: AutomateConfigFieldKind;
  readonly maxLength?: number;
  readonly min?: number;
  readonly max?: number;
  readonly integer?: boolean;
  readonly options?: readonly AutomateConfigOption[];
  /** Value used when the field is added to a node that lacks it. */
  readonly fallback: JsonValue;
}

/** Bounds mirrored from the trigger and runtime contracts. One number, one place. */
export const MAX_CONFIG_TEXT = 4096;
export const MAX_TYPE_TEXT = 65_536;
export const MIN_SCHEDULE_INTERVAL = 1;
export const MAX_SCHEDULE_INTERVAL = 10_080;
export const MIN_CONCURRENCY = 1;
export const MAX_CONCURRENCY = 32;
export const MIN_LOOP_ITERATIONS = 1;
export const MAX_LOOP_ITERATIONS = 10_000;
export const MAX_APPROVAL_MINUTES = 10_080;
/** Bound for the serialised data mapping of one loop node, and for one entry in it. */
export const MAX_MAPPING_TEXT = 8192;
export const MAX_MAPPING_ENTRIES = 64;
export const MAX_MAPPING_FIELD_TEXT = 512;

const TIMEZONE_OPTIONS: readonly AutomateConfigOption[] = [
  { value: 'UTC', labelKey: 'tzUtc' },
  { value: 'Europe/Berlin', labelKey: 'tzBerlin' },
  { value: 'America/New_York', labelKey: 'tzNewYork' },
  { value: 'Asia/Tokyo', labelKey: 'tzTokyo' },
];

const SCHEDULE_INTERVAL_FIELDS: readonly AutomateConfigField[] = [
  { key: 'cfgEveryUnit', path: ['every', 'unit'], kind: 'select', fallback: 'minute',
    options: [
      { value: 'minute', labelKey: 'unitMinute' },
      { value: 'hour', labelKey: 'unitHour' },
      { value: 'day', labelKey: 'unitDay' },
      { value: 'week', labelKey: 'unitWeek' },
    ] },
  { key: 'cfgEveryInterval', path: ['every', 'interval'], kind: 'number', integer: true, min: MIN_SCHEDULE_INTERVAL, max: MAX_SCHEDULE_INTERVAL, fallback: 15 },
  { key: 'cfgTimezone', path: ['timezone'], kind: 'select', fallback: 'UTC', options: TIMEZONE_OPTIONS },
  { key: 'cfgMissedRun', path: ['missedRun'], kind: 'select', fallback: 'skip',
    options: [{ value: 'skip', labelKey: 'missedSkip' }, { value: 'run-once', labelKey: 'missedRunOnce' }] },
  { key: 'cfgConcurrency', path: ['concurrency'], kind: 'number', integer: true, min: MIN_CONCURRENCY, max: MAX_CONCURRENCY, fallback: 1 },
];

const WORKSPACE_EVENT_OPTIONS: readonly AutomateConfigOption[] = [
  { value: 'document.created', labelKey: 'evtCreated' },
  { value: 'document.saved', labelKey: 'evtSaved' },
  { value: 'task.changed', labelKey: 'evtTask' },
  { value: 'vault.entry', labelKey: 'evtVault' },
];

const TRIGGER_FIELD_SETS: Readonly<Record<string, readonly AutomateConfigField[]>> = {
  'manual': [],
  'workspace-event': [
    { key: 'cfgEvent', path: ['event'], kind: 'select', fallback: 'document.saved', options: WORKSPACE_EVENT_OPTIONS },
  ],
  'schedule': SCHEDULE_INTERVAL_FIELDS,
  'connector': [
    { key: 'cfgConnector', path: ['connector'], kind: 'select', fallback: 'webhook',
      options: [
        { value: 'mail', labelKey: 'connMail' },
        { value: 'calendar', labelKey: 'connCalendar' },
        { value: 'webhook', labelKey: 'connWebhook' },
      ] },
    { key: 'cfgCapabilityId', path: ['capabilityId'], kind: 'text', maxLength: 128, fallback: 'cap:webhook.receive' },
    { key: 'cfgWebhookSchemaId', path: ['webhookSchemaId'], kind: 'text', maxLength: 128, fallback: 'schema:webhook:request/1' },
  ],
  'file-watch': [
    { key: 'cfgPathHandle', path: ['pathHandle'], kind: 'text', maxLength: 256, fallback: 'pathhandle:inbox' },
    { key: 'cfgDebounceMs', path: ['debounceMs'], kind: 'number', integer: true, min: 100, max: 60_000, fallback: 500 },
  ],
};

const ACTION_FIELD_SETS: Readonly<Record<string, readonly AutomateConfigField[]>> = {
  'workspace': [
    { key: 'cfgOperation', path: ['operation'], kind: 'select', fallback: 'task.create',
      options: [
        { value: 'task.create', labelKey: 'opTaskCreate' },
        { value: 'document.update', labelKey: 'opDocumentUpdate' },
        { value: 'document.export', labelKey: 'opDocumentExport' },
        { value: 'grid.transform', labelKey: 'opGridTransform' },
        { value: 'report.generate', labelKey: 'opReportGenerate' },
      ] },
    { key: 'cfgTargetRef', path: ['targetRef'], kind: 'text', maxLength: 512, fallback: 'vgt://workspace/tasks' },
  ],
  'http': [
    { key: 'cfgMethod', path: ['method'], kind: 'select', fallback: 'GET',
      options: [
        { value: 'GET', labelKey: 'httpGet' }, { value: 'POST', labelKey: 'httpPost' },
        { value: 'PUT', labelKey: 'httpPut' }, { value: 'DELETE', labelKey: 'httpDelete' },
      ] },
    { key: 'cfgNetGateCapabilityId', path: ['netGateCapabilityId'], kind: 'text', maxLength: 128, fallback: 'cap:http.connect' },
  ],
};

const NODE_FIELDS: Readonly<Record<AutomateNodeType, readonly AutomateConfigField[]>> = {
  trigger: [{ key: 'cfgTriggerKind', path: ['triggerKind'], kind: 'select', fallback: 'manual',
    options: [
      { value: 'manual', labelKey: 'trigManual' },
      { value: 'schedule', labelKey: 'trigSchedule' },
      { value: 'workspace-event', labelKey: 'trigWorkspaceEvent' },
      { value: 'connector', labelKey: 'trigConnector' },
      { value: 'file-watch', labelKey: 'trigFileWatch' },
    ] }],
  condition: [
    { key: 'cfgConditionKind', path: ['conditionKind'], kind: 'select', fallback: 'equals',
      options: [
        { value: 'equals', labelKey: 'condEquals' },
        { value: 'greater', labelKey: 'condGreater' },
        { value: 'less', labelKey: 'condLess' },
        { value: 'contains', labelKey: 'condContains' },
        { value: 'empty', labelKey: 'condEmpty' },
      ] },
    { key: 'cfgLeft', path: ['left'], kind: 'text', maxLength: MAX_CONFIG_TEXT, fallback: 'severity' },
    { key: 'cfgRight', path: ['right'], kind: 'text', maxLength: MAX_CONFIG_TEXT, fallback: 'CRITICAL' },
  ],
  switch: [
    { key: 'cfgSwitchOn', path: ['switchOn'], kind: 'text', maxLength: MAX_CONFIG_TEXT, fallback: 'severity' },
    { key: 'cfgDefaultBranch', path: ['defaultBranch'], kind: 'text', maxLength: MAX_CONFIG_TEXT, fallback: 'otherwise' },
    { key: 'cfgCases', path: ['cases'], kind: 'textarea', maxLength: MAX_CONFIG_TEXT, fallback: [] },
  ],
  loop: [
    { key: 'cfgItems', path: ['items'], kind: 'text', maxLength: MAX_CONFIG_TEXT, fallback: 'event.items' },
    { key: 'cfgMaxIterations', path: ['maxIterations'], kind: 'number', integer: true, min: MIN_LOOP_ITERATIONS, max: MAX_LOOP_ITERATIONS, fallback: 100 },
    // Package 10 ("Schleifen und Daten-Mapping"): a loop collected results but had nowhere to put them
    // and no way to map the collected item into the iteration.
    { key: 'cfgResultVariable', path: ['resultVariable'], kind: 'text', maxLength: 128, fallback: 'results' },
    { key: 'cfgItemVariable', path: ['itemVariable'], kind: 'text', maxLength: 128, fallback: 'item' },
    { key: 'cfgMapping', path: ['mapping'], kind: 'mapping', maxLength: MAX_MAPPING_TEXT, fallback: [] },
  ],
  parallel: [
    { key: 'cfgMaxConcurrency', path: ['maxConcurrency'], kind: 'number', integer: true, min: MIN_CONCURRENCY, max: MAX_CONCURRENCY, fallback: 4 },
    { key: 'cfgWaitForAll', path: ['waitForAll'], kind: 'boolean', fallback: true },
  ],
  action: [{ key: 'cfgActionKind', path: ['actionKind'], kind: 'select', fallback: 'workspace',
    options: [
      { value: 'workspace', labelKey: 'actWorkspace' },
      { value: 'connector', labelKey: 'actConnector' },
      { value: 'http', labelKey: 'actHttp' },
    ] }],
  approval: [
    { key: 'cfgPrompt', path: ['prompt'], kind: 'textarea', maxLength: MAX_CONFIG_TEXT, fallback: 'Approve this step' },
    { key: 'cfgExpiresMinutes', path: ['expiresMinutes'], kind: 'number', integer: true, min: 1, max: MAX_APPROVAL_MINUTES, fallback: 60 },
  ],
  error: [{ key: 'cfgMode', path: ['mode'], kind: 'select', fallback: 'catch',
    options: [{ value: 'catch', labelKey: 'errCatch' }, { value: 'retry', labelKey: 'errRetry' }, { value: 'fail', labelKey: 'errFail' }] }],
  finally: [{ key: 'cfgMode', path: ['mode'], kind: 'select', fallback: 'always',
    options: [{ value: 'always', labelKey: 'finAlways' }, { value: 'onError', labelKey: 'finOnError' }] }],
  transform: [
    { key: 'cfgExpression', path: ['expression'], kind: 'textarea', maxLength: MAX_CONFIG_TEXT, fallback: '' },
    { key: 'cfgOutputName', path: ['outputName'], kind: 'text', maxLength: 128, fallback: 'result' },
  ],
  subflow: [{ key: 'cfgChildFlowId', path: ['childFlowId'], kind: 'text', maxLength: 128, fallback: 'flow-child' }],
};

/**
 * The typed fields for one node, in display order.
 *
 * The node's own discriminator (`triggerKind`, `actionKind`) selects a sub-schema, so a schedule
 * trigger shows interval/timezone and a connector trigger shows its capability — the form follows the
 * value instead of showing every field to everyone.
 */
export function fieldsForNode(node: Pick<FlowNode, 'type' | 'config'>): AutomateConfigField[] {
  const base = NODE_FIELDS[node.type];
  const config = node.config as Record<string, unknown>;
  if (node.type === 'trigger') {
    const kind = typeof config.triggerKind === 'string' ? config.triggerKind : 'manual';
    return [...base, ...(TRIGGER_FIELD_SETS[kind] ?? [])];
  }
  if (node.type === 'action') {
    const kind = typeof config.actionKind === 'string' ? config.actionKind : 'workspace';
    return [...base, ...(ACTION_FIELD_SETS[kind] ?? [])];
  }
  return [...base];
}

/**
 * Parse a stored data mapping. Refuses, never repairs: a mapping that is not a list of entries with a
 * `from` and a `to` is an error, because silently dropping half a mapping is exactly the kind of quiet
 * data loss this app must not commit.
 */
export function parseMapping(value: JsonValue): AutomateMappingEntry[] {
  if (!Array.isArray(value)) throw new AutomateConfigError('config-mapping-not-a-list');
  if (value.length > MAX_MAPPING_ENTRIES) throw new AutomateConfigError('config-mapping-boundary');
  const entries: AutomateMappingEntry[] = [];
  for (const raw of value) {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw new AutomateConfigError('config-mapping-entry-invalid');
    const entry = raw as Record<string, JsonValue>;
    const from = entry.from;
    const to = entry.to;
    if (typeof from !== 'string' || from.length === 0 || from.length > MAX_MAPPING_FIELD_TEXT) throw new AutomateConfigError('config-mapping-from-invalid');
    if (typeof to !== 'string' || to.length === 0 || to.length > MAX_MAPPING_FIELD_TEXT) throw new AutomateConfigError('config-mapping-to-invalid');
    const expression = entry.expression;
    if (expression !== undefined && (typeof expression !== 'string' || expression.length > MAX_CONFIG_TEXT)) {
      throw new AutomateConfigError('config-mapping-expression-invalid');
    }
    entries.push(expression === undefined ? { from, to } : { from, to, expression });
  }
  return entries;
}

/** The stored form of a mapping, refused when it cannot be parsed back. */
export function serializeMapping(entries: readonly AutomateMappingEntry[]): JsonValue {
  const value = entries.map((entry) => (entry.expression === undefined
    ? { from: entry.from, to: entry.to }
    : { from: entry.from, to: entry.to, expression: entry.expression })) as unknown as JsonValue;
  parseMapping(value);
  return value;
}

/** Read a field's current value, or its fallback when the path is absent. Never throws. */export function readFieldValue(config: Readonly<Record<string, JsonValue>>, field: AutomateConfigField): JsonValue {
  let cursor: unknown = config;
  for (const segment of field.path) {
    if (cursor === null || typeof cursor !== 'object' || Array.isArray(cursor)) return field.fallback;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return (cursor === undefined ? field.fallback : cursor) as JsonValue;
}

/**
 * Return a new config with one field set. Immutable at every level, so undo/redo snapshots stay
 * independent. A wrong-typed value is refused rather than coerced.
 */
export function writeFieldValue(
  config: Readonly<Record<string, JsonValue>>,
  field: AutomateConfigField,
  value: JsonValue,
): Record<string, JsonValue> {
  const coerced = coerceFieldValue(field, value);
  if (field.path.length === 0) throw new AutomateConfigError('config-field-path-empty');
  const [head, ...rest] = field.path;
  const existing = config[head];
  if (rest.length === 0) return { ...config, [head]: coerced };
  const branch = existing && typeof existing === 'object' && !Array.isArray(existing)
    ? (existing as Record<string, JsonValue>)
    : {};
  return { ...config, [head]: writeFieldValue(branch, { ...field, path: rest }, coerced) };
}

/** Type the value against the descriptor. Refuses instead of guessing. */
export function coerceFieldValue(field: AutomateConfigField, value: JsonValue): JsonValue {
  switch (field.kind) {
    case 'number': {
      const numeric = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(numeric)) throw new AutomateConfigError('config-number-required');
      if (field.integer && !Number.isInteger(numeric)) throw new AutomateConfigError('config-integer-required');
      return numeric;
    }
    case 'boolean':
      if (typeof value !== 'boolean') throw new AutomateConfigError('config-boolean-required');
      return value;
    case 'select': {
      const match = (field.options ?? []).find((option) => option.value === value);
      if (!match) throw new AutomateConfigError('config-option-not-allowed');
      return match.value as JsonValue;
    }
    case 'textarea':
      if (Array.isArray(value)) return value;
      if (typeof value !== 'string') throw new AutomateConfigError('config-text-required');
      return value;
    case 'mapping':
      // Round-tripped through the parser, so an invalid mapping can never be stored.
      return serializeMapping(parseMapping(value));
    case 'text':
    default:
      if (typeof value !== 'string') throw new AutomateConfigError('config-text-required');
      return value;
  }
}

/** True when the field's path exists in the config, even if its value is `null`. */
export function hasConfigPath(config: Readonly<Record<string, JsonValue>>, field: AutomateConfigField): boolean {
  let cursor: unknown = config;
  for (const segment of field.path) {
    if (cursor === null || typeof cursor !== 'object' || Array.isArray(cursor)) return false;
    if (!(segment in (cursor as object))) return false;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return true;
}

export interface ConfigFieldIssue {
  /** i18n key of the field, so the inspector can bind the message to the input. */
  readonly fieldKey: string;
  readonly code: string;
}

/**
 * Every declared field that is absent from the config. Distinct from a *wrong* value: an absent field
 * has a declared fallback, so it is incomplete (the inspector offers it), not invalid.
 */
export function missingConfigFields(node: Pick<FlowNode, 'type' | 'config'>): string[] {
  return fieldsForNode(node)
    .filter((field) => !hasConfigPath(node.config as Record<string, JsonValue>, field))
    .map((field) => field.key);
}

/**
 * The form's contract: each *present* field must have the declared type and lie inside its bounds.
 * Returned issues name the field, so the inspector binds each message to its own input.
 */
export function validateNodeConfigValues(node: Pick<FlowNode, 'type' | 'config'>): ConfigFieldIssue[] {
  const issues: ConfigFieldIssue[] = [];
  for (const field of fieldsForNode(node)) {
    if (!hasConfigPath(node.config as Record<string, JsonValue>, field)) continue;
    const value = readFieldValue(node.config as Record<string, JsonValue>, field);
    try {
      coerceFieldValue(field, value);
    } catch (error) {
      issues.push({ fieldKey: field.key, code: error instanceof AutomateConfigError ? error.code : 'config-value-invalid' });
      continue;
    }
    if (typeof value === 'string') {
      // Only a plain `text` field must be non-empty. A textarea may legitimately be blank (the expression
      // fallback is the empty string), and a mapping is a list, checked below.
      if (value.length === 0 && field.kind === 'text') issues.push({ fieldKey: field.key, code: 'config-text-empty' });
      if (field.maxLength !== undefined && value.length > field.maxLength) issues.push({ fieldKey: field.key, code: 'config-text-boundary' });
    }
    if (typeof value === 'number') {
      if (field.min !== undefined && value < field.min) issues.push({ fieldKey: field.key, code: 'config-below-minimum' });
      if (field.max !== undefined && value > field.max) issues.push({ fieldKey: field.key, code: 'config-above-maximum' });
    }
    if (field.kind === 'mapping') {
      // The mapping's own bound is the serialised size, since only a stored value has one.
      if (JSON.stringify(value).length > MAX_MAPPING_TEXT) issues.push({ fieldKey: field.key, code: 'config-mapping-boundary' });
    }
  }
  return issues;
}

/**
 * The inspector's completeness report: absent fields plus wrong values.
 * `missing` is reported separately so the panel can say "incomplete" without claiming the config is
 * illegal — an absent field is filled from its declared fallback, it is not a contract violation.
 */
export function validateNodeConfig(node: Pick<FlowNode, 'type' | 'config'>): {
  issues: ConfigFieldIssue[];
  missing: string[];
  complete: boolean;
} {
  const issues = validateNodeConfigValues(node);
  const missing = missingConfigFields(node);
  return { issues, missing, complete: issues.length === 0 && missing.length === 0 };
}

/**
 * Fill in every declared fallback, so a node created by an older template becomes complete and the
 * inspector never shows an empty control for a field the contract requires. Existing values win.
 */
export function withConfigDefaults(node: FlowNode): FlowNode {
  let config = node.config as Record<string, JsonValue>;
  for (const field of fieldsForNode(node)) {
    let present = true;
    let cursor: unknown = config;
    for (const segment of field.path) {
      if (cursor === null || typeof cursor !== 'object' || Array.isArray(cursor) || !(segment in (cursor as object))) { present = false; break; }
      cursor = (cursor as Record<string, unknown>)[segment];
    }
    if (!present) config = writeFieldValue(config, field, field.fallback);
  }
  return { ...node, config };
}
