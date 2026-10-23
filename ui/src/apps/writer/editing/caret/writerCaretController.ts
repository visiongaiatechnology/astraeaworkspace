// STATUS: DIAMANT VGT SUPREME — Imperative caret transfer channel for Writer paragraphs
/**
 * Paragraphs are rendered as one textarea per page fragment and are mounted
 * lazily after a structural edit. A plain prop cannot focus an element that does
 * not exist yet, and a `setTimeout` poll would be a timing hack. This controller
 * carries an explicit, monotonically tokenised caret request instead: the
 * requester publishes, every mounted fragment listens, and a fragment that
 * mounts *after* the request still consumes it exactly once.
 *
 * Two delivery modes exist:
 *
 * - `requestWriterCaret` publishes synchronously. Use it when the target already
 *   exists in the DOM — a new paragraph, a page-area click, a merge seam.
 * - `requestWriterCaretAfterLayout` publishes on the next animation frame. Use it
 *   after a text change, when re-pagination is about to move fragment boundaries
 *   or replace the focused textarea: publishing before React re-renders would
 *   apply the caret against stale geometry.
 */

export type WriterCaretOrigin = 'enter' | 'page-click' | 'merge' | 'split' | 'delete' | 'pagination' | 'range-replace' | 'paste' | 'api';

export interface WriterCaretRequest {
  /** Strictly increasing token; the only valid deduplication key. */
  readonly token: number;
  readonly paragraphId: string;
  readonly start: number;
  readonly end: number;
  readonly origin: WriterCaretOrigin;
}

export interface WriterCaretRequestInput {
  readonly paragraphId: string;
  readonly start?: number;
  readonly end?: number;
  readonly origin: WriterCaretOrigin;
}

type WriterCaretListener = (request: WriterCaretRequest) => void;
type WriterCaretScheduler = (callback: () => void) => void;

const defaultScheduler: WriterCaretScheduler = (callback) => {
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => callback());
    return;
  }
  setTimeout(callback, 0);
};

const listeners = new Set<WriterCaretListener>();
let lastRequest: WriterCaretRequest | null = null;
let nextToken = 1;
let scheduler: WriterCaretScheduler = defaultScheduler;

function normalizeOffset(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 0;
  const truncated = Math.trunc(value);
  return truncated > 0 ? truncated : 0;
}

function buildRequest(input: WriterCaretRequestInput): WriterCaretRequest {
  const start = normalizeOffset(input.start);
  const end = Math.max(start, normalizeOffset(input.end ?? input.start));
  const request: WriterCaretRequest = {
    token: nextToken,
    paragraphId: input.paragraphId,
    start,
    end,
    origin: input.origin,
  };
  nextToken += 1;
  return request;
}

function publish(request: WriterCaretRequest): void {
  lastRequest = request;
  for (const listener of Array.from(listeners)) {
    listener(request);
  }
}

/**
 * Publishes a caret request immediately. The token never resets, so a component
 * can always tell "already applied" from "a new request for the same position".
 */
export function requestWriterCaret(input: WriterCaretRequestInput): WriterCaretRequest {
  const request = buildRequest(input);
  publish(request);
  return request;
}

/**
 * Publishes a caret request after the next layout. The request is recorded
 * immediately, so a fragment that mounts before the frame still finds it through
 * `getLastWriterCaretRequest`, and it is delivered once the fragment boundaries
 * of the re-paginated paragraph are known.
 */
export function requestWriterCaretAfterLayout(input: WriterCaretRequestInput): WriterCaretRequest {
  const request = buildRequest(input);
  lastRequest = request;
  scheduler(() => publish(request));
  return request;
}

export function subscribeWriterCaret(listener: WriterCaretListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Latest request, used by a fragment that mounts after the request was made.
 * Returns `null` when no caret was ever requested in this session.
 */
export function getLastWriterCaretRequest(): WriterCaretRequest | null {
  return lastRequest;
}

/** Test-only isolation hook. The token counter stays monotonic by design. */
export function resetWriterCaretController(): void {
  listeners.clear();
  lastRequest = null;
  scheduler = defaultScheduler;
}

/** Test-only scheduler override; pass `undefined` to restore the frame scheduler. */
export function setWriterCaretScheduler(next?: WriterCaretScheduler): void {
  scheduler = next ?? defaultScheduler;
}
