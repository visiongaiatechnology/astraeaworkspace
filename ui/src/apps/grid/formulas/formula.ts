import { GridCell } from '../../../shared/contracts/workspace';
import { authenticatedIpcFetch } from '../../../platform/native/ipcAuth';
import { invokeNative, isNativeDesktop } from '../../../platform/native/nativeBridge';
import {
  buildCanonicalFormulaRequest,
  FORMULA_ENGINE_CONTRACT,
  FORMULA_MAX_CELLS,
  FORMULA_MAX_LENGTH,
  type FormulaExternalReferencePolicy,
  type FormulaLocaleProfile,
  type FormulaVolatilePolicy,
} from './formulaContract';
// **W-426:** die **eine** Quelle der Nutzer-Zeitzone. Der Kontext wird hier gebaut und auf die Nutzlast abgebildet —
// **genau hier**, damit es keine zweite Umrechnung und keine zweite Schreibweise gibt.
import {
  createGridFormulaTimeContext,
  type GridFormulaTimeZoneSource,
} from './gridFormulaTimeContext';
// Eine Regel für eine Sache: `FormulaValue` ist die eine Schreibweise des Formelwerts — die Union
// darunter wurde vorher von Hand nachbuchstabiert, eine zweite Regel für dieselbe Sache.
import type { FormulaValue } from './gridFormulaTypes';

export interface CellCoord { col: number; row: number; }

export function parseA1(coordStr: string): CellCoord | null {
  const match = coordStr.trim().toUpperCase().match(/^([A-Z]+)(\d+)$/);
  if (!match) return null;
  let col = 0;
  for (const char of match[1]) col = col * 26 + (char.charCodeAt(0) - 64);
  const row = Number(match[2]) - 1;
  col -= 1;
  if (col < 0 || col >= 16_384 || row < 0 || row >= 1_048_576) return null;
  return { col, row };
}

export function toA1(col: number, row: number): string {
  if (!Number.isInteger(col) || !Number.isInteger(row) || col < 0 || row < 0 || col >= 16_384 || row >= 1_048_576) {
    throw new Error('formula_coordinate_out_of_range');
  }
  let c = col + 1;
  let colStr = '';
  while (c > 0) {
    const rem = (c - 1) % 26;
    colStr = String.fromCharCode(65 + rem) + colStr;
    c = Math.floor((c - 1) / 26);
  }
  return `${colStr}${row + 1}`;
}

export function getRangeCoords(startA1: string, endA1: string, maxCells = 50_000): string[] {
  const start = parseA1(startA1);
  const end = parseA1(endA1);
  if (!start || !end) return [];
  const minCol = Math.min(start.col, end.col), maxCol = Math.max(start.col, end.col);
  const minRow = Math.min(start.row, end.row), maxRow = Math.max(start.row, end.row);
  const count = (maxCol - minCol + 1) * (maxRow - minRow + 1);
  if (count > maxCells) throw new Error('formula_range_cell_limit');
  const keys: string[] = [];
  for (let row = minRow; row <= maxRow; row++) for (let col = minCol; col <= maxCol; col++) keys.push(toA1(col, row));
  return keys;
}

export interface FormulaEvaluationContext {
  namedFormulas?: Record<string, string>;
  workspaceReferenceResolver?: (uri: string, reference: string) => FormulaValue;
  volatilePolicy?: FormulaVolatilePolicy;
  externalReferencePolicy?: FormulaExternalReferencePolicy;
  localeProfile?: FormulaLocaleProfile;
  maxReferenceCells?: number;
  currentCellCoord?: string;
  /** Caller cancellation. Native execution is independently resource-bounded by the Rust core. */
  signal?: AbortSignal;
  /** Transport deadline only; clamped to 50..5000 ms. */
  transportTimeoutMs?: number;
  structuredReferenceResolver?: (reference: string, currentCoord?: string) => string | null;
  /**
   * **W-426:** die Zeitzone des **Nutzers** (IANA, z. B. `Europe/Berlin`) — oder `null` für die Zone des Rechners.
   *
   * Fehlt sie **und** fehlt `nowMs`, wird **kein** Zeitkontext gesendet: dann gilt im Kern unverändert die Zone des
   * Rechners, exakt wie bisher ✓. Wer sie setzt, bekommt `TODAY`/`NOW` in **dieser** Zone ✓.
   */
  timeZone?: string | null;
  /**
   * **W-426:** der Offset-Lookup der Zone zu einem Zeitpunkt (Minuten **östlich** von UTC; `null` = unbekannt).
   * **Eingeschleust**, damit `formula.ts` kein `Intl` und **keine** zweite Zonenregel enthält — die Regel liegt in
   * `gridFormulaTimeContext.ts` ✓ bzw. in der `GridFormulaTimeZoneRule` des Aufrufers ✓.
   */
  timeZoneOffsetLookup?: (timeZone: string, atMs: number) => number | null;
  /**
   * **W-426:** der Zeitpunkt der Auswertung (ms seit der Epoche). Wird er mitgegeben, ist er im Kern **festgehalten**
   * ✓: derselbe Aufruf ergibt zweimal dasselbe ✓, und der Offset gilt für **genau** den Zeitpunkt, für den er
   * gemessen wurde ✓. Standard: jetzt.
   */
  nowMs?: number;
}

interface FormulaResponse {
  success?: boolean;
  result?: string | number | boolean | null;
  error?: string | null;
  contract?: string;
}

interface FormulaCellInput {
  value?: string | number | boolean;
  formula?: string;
}

export const FORMULA_TRANSPORT_TIMEOUT_DEFAULT_MS = 1_500;
export const FORMULA_TRANSPORT_TIMEOUT_MAX_MS = 5_000;

const PUBLIC_FORMULA_ERRORS = new Set([
  '#DIV/0!', '#VALUE!', '#REF!', '#NAME?', '#NUM!', '#N/A', '#SPILL!', '#CYCLE!', '#CIRCULAR!', '#CALC!',
]);

function boundedTransportTimeout(value?: number): number {
  if (value === undefined) return FORMULA_TRANSPORT_TIMEOUT_DEFAULT_MS;
  if (!Number.isFinite(value)) return FORMULA_TRANSPORT_TIMEOUT_DEFAULT_MS;
  return Math.min(FORMULA_TRANSPORT_TIMEOUT_MAX_MS, Math.max(50, Math.trunc(value)));
}

function publicFormulaError(value?: string | null): string {
  if (!value) return '#CALC!';
  const normalized = value.trim().toUpperCase();
  return PUBLIC_FORMULA_ERRORS.has(normalized) ? normalized : '#CALC!';
}

function isFormulaScalar(value: unknown): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function toFormulaCellInputs(cells: Record<string, GridCell>): Record<string, FormulaCellInput> {
  const result = Object.create(null) as Record<string, FormulaCellInput>;
  for (const [coordinate, cell] of Object.entries(cells)) {
    if (!cell || typeof cell !== 'object' || Array.isArray(cell)) throw new Error('formula_cell_invalid');
    const requestCell: FormulaCellInput = {};
    const value: unknown = cell.value;
    if (value !== undefined && value !== null) {
      if (!isFormulaScalar(value) || (typeof value === 'number' && !Number.isFinite(value))) {
        throw new Error('formula_cell_value_invalid');
      }
      requestCell.value = value;
    }
    if (cell.formula !== undefined) {
      if (typeof cell.formula !== 'string' || cell.formula.length > FORMULA_MAX_LENGTH) {
        throw new Error('formula_cell_formula_invalid');
      }
      requestCell.formula = cell.formula;
    }
    result[coordinate] = requestCell;
  }
  return result;
}

async function awaitBoundedNative<T>(promise: Promise<T>, signal: AbortSignal | undefined, timeoutMs: number): Promise<T> {
  if (signal?.aborted) throw new Error('formula_transport_aborted');
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  let abortHandler: (() => void) | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error('formula_transport_timeout')), timeoutMs);
  });
  const aborted = new Promise<never>((_, reject) => {
    if (!signal) return;
    abortHandler = () => reject(new Error('formula_transport_aborted'));
    signal.addEventListener('abort', abortHandler, { once: true });
  });
  try {
    return await Promise.race([promise, deadline, aborted]);
  } finally {
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
    if (signal && abortHandler) signal.removeEventListener('abort', abortHandler);
  }
}

async function fetchFormulaResponse(payload: Record<string, unknown>, signal: AbortSignal | undefined, timeoutMs: number): Promise<FormulaResponse> {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await awaitBoundedNative(
      authenticatedIpcFetch('/api/v1/formula/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      }),
      signal,
      timeoutMs,
    );
    if (!response.ok) return { success: false, error: '#CALC!' };
    const decoded: unknown = await response.json();
    if (!decoded || typeof decoded !== 'object') return { success: false, error: '#CALC!' };
    return decoded as FormulaResponse;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/**
 * **W-426:** die Nutzlast-Gestalt des Zeitkontexts. Die Namen sind **snake_case**, weil sie auf der anderen Seite der
 * IPC-Grenze gelesen werden (`crates/vgt-desktop/src/main.rs`, `FormulaTimeZoneInput`) ✓ — **eine** Anpassung von
 * `GridFormulaTimeContext` (camelCase ✓) auf diese Namen, und zwar **genau hier** ✓.
 */
interface FormulaTimeZonePayload {
  readonly now_ms: number;
  readonly utc_offset_minutes: number;
  readonly zone: string | null;
  readonly source: GridFormulaTimeZoneSource;
}

/**
 * Bildet den Zeitkontext der Nutzlast — oder `undefined`, wenn der Aufrufer **keinen** verlangt hat.
 *
 * **Additiv:** Ohne `timeZone` **und** ohne `nowMs` wird nichts gesendet ✓, und der Kern liest wie bisher die Zone des
 * Rechners ✓. **Fail-closed:** ist ein Zeitkontext verlangt, aber unbrauchbar (unbekannte Zone, fehlender Lookup,
 * unmöglicher Zeitpunkt), wirft diese Funktion ✓ — es wird **nicht** still die Zone des Rechners gesendet ✗.
 */
function buildFormulaTimeZonePayload(context: FormulaEvaluationContext): FormulaTimeZonePayload | undefined {
  if (context.timeZone === undefined && context.nowMs === undefined) return undefined;
  const nowMs = context.nowMs ?? Date.now();
  const zone = createGridFormulaTimeContext(nowMs, context.timeZone ?? null, context.timeZoneOffsetLookup);
  if (!zone) throw new Error('formula_time_zone_context_invalid');
  return {
    now_ms: zone.nowMs,
    utc_offset_minutes: zone.utcOffsetMinutes,
    zone: zone.timeZone,
    source: zone.source,
  };
}

/**
 * Authoritative formula evaluation boundary.
 * There is intentionally no TypeScript calculation fallback: if the Rust Formula Core
 * is unavailable, evaluation fails closed instead of inventing divergent semantics.
 */
export async function evaluateFormula(
  formula: string,
  cells: Record<string, GridCell>,
  context: FormulaEvaluationContext = {},
): Promise<string | number | boolean> {
  if (formula.length > FORMULA_MAX_LENGTH || Object.keys(cells).length > FORMULA_MAX_CELLS) return '#CALC!';
  if (!formula.trim().startsWith('=')) return formula.trim();

  let request;
  try {
    request = buildCanonicalFormulaRequest(formula, context.volatilePolicy ?? 'disabled', context.localeProfile, context.externalReferencePolicy ?? 'deny');
  } catch (error) {
    return error instanceof Error && error.message === 'formula_volatile_disabled' ? '#N/A' : '#VALUE!';
  }

  let timeZonePayload: FormulaTimeZonePayload | undefined;
  try {
    timeZonePayload = buildFormulaTimeZonePayload(context);
  } catch {
    // **Fail-closed:** ein **verlangter**, aber unbrauchbarer Zeitkontext ist ein **Eingabefehler** ✓ — nicht still
    // die Host-Zone ✗.
    return '#VALUE!';
  }

  try {
    let data: FormulaResponse;
    const timeoutMs = boundedTransportTimeout(context.transportTimeoutMs);
    const payload = {
      formula: request.formula,
      cells: toFormulaCellInputs(cells),
      volatile_policy: request.volatilePolicy,
      external_reference_policy: request.externalReferencePolicy,
      contract: FORMULA_ENGINE_CONTRACT,
      // **Additiv:** ohne Zeitkontext ist der Payload **unverändert** ✓ (kein leeres Feld ✗).
      ...(timeZonePayload ? { time_zone: timeZonePayload } : {}),
    };
    if (isNativeDesktop()) {
      data = await awaitBoundedNative(
        invokeNative<FormulaResponse>('vgt_formula_evaluate', { request: payload }),
        context.signal,
        timeoutMs,
      );
    } else {
      data = await fetchFormulaResponse(payload, context.signal, timeoutMs);
    }
    if (data.success && isFormulaScalar(data.result)) return data.result;
    return publicFormulaError(data.error);
  } catch {
    return '#CALC!';
  }
}
