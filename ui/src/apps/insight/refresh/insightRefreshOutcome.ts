// STATUS: PLATIN — pure Insight refresh decisions. Cache metadata may only say "fresh"
// after a source was actually read.
//
// MEASURED FACTS this module encodes (see BATCH-60 notes.md):
//  - The refresh button used to write `lastRefreshAt`, `snapshotAt`, `sourceState: 'fresh'`
//    with no read at all.
//  - In this build only the embedded/local source can be read, and only through the existing
//    pure executor `executeInsightQuery` (apps/insight/queries/insightQueryEngine.ts:37).
//    External sources need a connector adapter + NetGate secret and have none here.
// Therefore: a successful read is required for 'fresh'; otherwise the previous state survives.

import type { InsightCacheMetadata, InsightQuery, InsightRow } from '../domain/types';
import { InsightError } from '../core/insightCore';
import { executeInsightQuery } from '../queries/insightQueryEngine';

export type InsightRefreshKind = 'read' | 'unavailable' | 'error';

export interface InsightRefreshSourceOutcome {
  readonly kind: InsightRefreshKind;
  readonly rows: number;
  /** Present only for `kind: 'read'` — the cache state the UI may now claim. */
  readonly nextSourceState?: InsightCacheMetadata['sourceState'];
  /** Present for `unavailable`/`error` — the previous state is preserved. */
  readonly errorCode?: string;
}

/**
 * Decide the truth of a refresh attempt.
 *
 * @param readSource performs the actual read (in the view: through `executeInsightQuery`).
 *        It must throw when no source is reachable — returning an empty result is NOT a read.
 */
export function resolveInsightRefreshOutcome(readSource: () => number): InsightRefreshSourceOutcome {
  let rows: number;
  try {
    rows = readSource();
  } catch (error) {
    const code = error instanceof InsightError
      ? error.code
      : error instanceof Error && error.message
        ? error.message
        : 'refresh-read-failed';
    return { kind: code === 'source-unavailable' ? 'unavailable' : 'error', rows: 0, errorCode: code };
  }
  if (rows <= 0) {
    return { kind: 'error', rows: 0, errorCode: 'refresh-read-empty' };
  }
  return { kind: 'read', rows, nextSourceState: 'fresh' };
}

/**
 * The ONE definition of the cache metadata a refresh attempt may write.
 *
 * MEASURED DEFECT this replaces (proof: `views/InsightView.tsx:58` before BATCH-INSIGHT-1): the
 * refresh handler wrote `snapshotAt: now` on every attempt, so a failed read still stored a claim
 * that a source snapshot from that moment exists. Only a successful read may do that. The attempt
 * timestamp `lastRefreshAt` is written in both cases — it is what the visible text
 * "timestamp updated — source not read" is about.
 */
export function nextInsightCache(cache: InsightCacheMetadata, outcome: InsightRefreshSourceOutcome, now: number): InsightCacheMetadata {
  return outcome.nextSourceState
    ? { ...cache, lastRefreshAt: now, snapshotAt: now, sourceState: outcome.nextSourceState }
    : { ...cache, lastRefreshAt: now };
}

/**
 * Reader for the local refresh path. It re-reads the model's own query through the existing
 * bounded executor and returns the produced row count. Every failure mode throws an
 * `InsightError`, so `resolveInsightRefreshOutcome` reports it instead of claiming success.
 */
export function createLocalInsightReader(
  queries: readonly InsightQuery[],
  queryId: string,
  sourceRows: readonly InsightRow[],
  sourceIsLocal: boolean,
): () => number {
  return () => {
    if (!sourceIsLocal) throw new InsightError('source-unavailable');
    const query = queries.find((candidate) => candidate.id === queryId);
    if (!query) throw new InsightError('query-missing');
    const sourceId = query.sourceId;
    if (!sourceId) throw new InsightError('query-source-missing');
    const result = executeInsightQuery(
      query.id,
      queries,
      new Map([[sourceId, sourceRows.map((row) => ({ ...row }))]]),
      new Map([[sourceId, { id: sourceId, name: 'local', kind: 'json' as const, canonicalUri: `vgt://insight/local/${sourceId}`, privacy: 'private' as const, trust: 'local-trusted' as const, enabled: true }]]),
    );
    return result.rows.length;
  };
}
