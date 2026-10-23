// STATUS: PLATIN — BATCH-60: Insight may only say "fresh" after a source was really read.
// Pure decisions + visible text. No jsdom: react-dom/server markup only.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import { WORKSPACE_LOCALES, type WorkspaceLocale } from '../../../shell/localization/workspaceLocaleTypes';
import { InsightError } from '../core/insightCore';
import { DEFAULT_INSIGHT_MODEL, type InsightQuery } from '../domain/types';
import { createLocalInsightReader, nextInsightCache, resolveInsightRefreshOutcome } from '../refresh/insightRefreshOutcome';
import { InsightView } from '../views/InsightView';
import { insightCopy } from '../locale/insightLocale';

const localeState = vi.hoisted(() => ({ current: 'de-DE' as WorkspaceLocale }));
vi.mock('../../../shell/localization/workspaceLocale', () => ({
  useWorkspaceLocale: () => ({ locale: localeState.current }),
}));

const model = structuredClone(DEFAULT_INSIGHT_MODEL);
const document = {
  id: 'insight-refresh-test', kind: 'Insight', modified_at: 0, version: 1,
  insightData: model,
} as unknown as WorkspaceDocument;

describe('Insight refresh outcome decision (pure)', () => {
  it('sets "fresh" only after a successful read, and reports the read row count', () => {
    const outcome = resolveInsightRefreshOutcome(() => 42);
    expect(outcome.kind).toBe('read');
    expect(outcome.nextSourceState).toBe('fresh');
    expect(outcome.rows).toBe(42);
    expect(outcome.errorCode).toBeUndefined();
  });

  it('keeps the previous state and names the reason when no source is reachable', () => {
    const outcome = resolveInsightRefreshOutcome(() => { throw new InsightError('source-unavailable'); });
    expect(outcome.kind).toBe('unavailable');
    expect(outcome.nextSourceState).toBeUndefined();
    expect(outcome.rows).toBe(0);
    expect(outcome.errorCode).toBe('source-unavailable');
  });

  it('keeps the previous state when the read itself fails', () => {
    const outcome = resolveInsightRefreshOutcome(() => { throw new InsightError('connector-timeout'); });
    expect(outcome.kind).toBe('error');
    expect(outcome.nextSourceState).toBeUndefined();
    expect(outcome.errorCode).toBe('connector-timeout');
  });

  it('treats a zero-row read as not read, never as fresh', () => {
    const outcome = resolveInsightRefreshOutcome(() => 0);
    expect(outcome.kind).toBe('error');
    expect(outcome.nextSourceState).toBeUndefined();
    expect(outcome.errorCode).toBe('refresh-read-empty');
  });

  it('never yields "fresh" without a successful reader', () => {
    const readers = [() => 1, () => { throw new Error('boom'); }, () => { throw new InsightError('x'); }, () => 0];
    for (const reader of [...readers, () => { throw new Error('source-unavailable'); }]) {
      const outcome = resolveInsightRefreshOutcome(reader as () => number);
      if (outcome.nextSourceState === 'fresh') expect(outcome.kind).toBe('read');
      else expect(outcome.kind).not.toBe('read');
    }
  });
});

describe('Insight cache metadata written by a refresh attempt (pure)', () => {
  const staleCache = (): typeof DEFAULT_INSIGHT_MODEL.cache => ({ ...structuredClone(DEFAULT_INSIGHT_MODEL.cache), sourceState: 'stale', snapshotAt: 111, lastRefreshAt: 222 });

  it('writes a snapshot only when the source was really read', () => {
    const read = nextInsightCache(staleCache(), resolveInsightRefreshOutcome(() => 4), 999);
    expect(read.snapshotAt).toBe(999);
    expect(read.sourceState).toBe('fresh');
    expect(read.lastRefreshAt).toBe(999);
  });

  it('records the attempt but preserves the previous snapshot claim when the read failed', () => {
    for (const outcome of [resolveInsightRefreshOutcome(() => { throw new InsightError('connector-timeout'); }), resolveInsightRefreshOutcome(() => { throw new InsightError('source-unavailable'); }), resolveInsightRefreshOutcome(() => 0)]) {
      const next = nextInsightCache(staleCache(), outcome, 999);
      expect(next.snapshotAt).toBe(111);
      expect(next.sourceState).toBe('stale');
      expect(next.lastRefreshAt).toBe(999);
    }
  });

  it('never invents a snapshot for a cache that never had one', () => {
    const empty = { ...staleCache(), snapshotAt: undefined };
    const next = nextInsightCache(empty, resolveInsightRefreshOutcome(() => { throw new InsightError('query-missing'); }), 999);
    expect(next.snapshotAt).toBeUndefined();
  });
});

describe('Insight local read really goes through the query executor', () => {  it('re-reads the model query and returns the executed row count', () => {
    const query = model.queries[0];
    const reader = createLocalInsightReader(model.queries, query.id, model.records, true);
    const rows = reader();
    // The default query filters to Q2, so the read is a real transformation and not a copy count.
    expect(rows).toBeGreaterThan(0);
    expect(rows).toBeLessThan(model.records.length);
    expect(resolveInsightRefreshOutcome(reader).nextSourceState).toBe('fresh');
  });

  it('refuses an external source instead of pretending to read it', () => {
    const reader = createLocalInsightReader(model.queries, model.queries[0].id, model.records, false);
    const outcome = resolveInsightRefreshOutcome(reader);
    expect(outcome.kind).toBe('unavailable');
    expect(outcome.nextSourceState).toBeUndefined();
  });

  it('fails on an unknown query id instead of reporting a read', () => {
    const outcome = resolveInsightRefreshOutcome(createLocalInsightReader(model.queries, 'q-does-not-exist', model.records, true));
    expect(outcome.kind).toBe('error');
    expect(outcome.errorCode).toBe('query-missing');
    expect(outcome.nextSourceState).toBeUndefined();
  });

  it('fails when the query points at a source it cannot read', () => {
    const orphan: InsightQuery = { ...model.queries[0], id: 'q-orphan', sourceId: undefined };
    const outcome = resolveInsightRefreshOutcome(createLocalInsightReader([orphan], orphan.id, model.records, true));
    expect(outcome.kind).toBe('error');
    expect(outcome.errorCode).toBe('query-source-missing');
    expect(outcome.nextSourceState).toBeUndefined();
  });
});

describe('Insight visible text for a refresh', () => {
  it('never claims a loaded snapshot or a performed read in the initial status', () => {
    for (const locale of WORKSPACE_LOCALES) {
      const copy = insightCopy(locale);
      // The seeded cache is `stale` without a snapshot, so a "snapshot ready" claim would be false.
      expect(copy.initialStatus).not.toMatch(/snapshot|снимок|instantánea|スナップショット|快照/iu);
      expect(copy.initialStatus).toMatch(/not read|noch nicht gelesen|не прочитан|non ancora letta|no leído|未読取|尚未读取/iu);
    }
  });

  it('never claims a read for a refresh that did not read in any locale', () => {
    for (const locale of WORKSPACE_LOCALES) {
      const copy = insightCopy(locale);
      expect(copy.refreshUnread).not.toBe(copy.refreshed(1));
      expect(copy.refreshUnread).toMatch(/nicht gelesen|not read|не прочитан|non letta|no leído|未読取|未读取/iu);
      expect(copy.refreshFailed('connector-timeout')).toContain('connector-timeout');
      expect(copy.refreshed(7)).toContain('7');
    }
  });

  it('renders the refresh control with the honest source state and no read claim', () => {
    localeState.current = 'de-DE';
    const copy = insightCopy('de-DE');
    const stale = structuredClone(model);
    stale.cache.sourceState = 'stale';
    const staleDocument = { ...document, insightData: stale } as unknown as WorkspaceDocument;
    const markup = renderToStaticMarkup(<InsightView document={staleDocument} onUpdateDocument={vi.fn()} />);
    expect(markup).toContain('data-insight-refresh-state="none"');
    expect(markup).toContain('data-insight-source-state="stale"');
    expect(markup).toContain(copy.initialStatus);
    expect(markup).not.toContain(copy.refreshed(1));
  });
});
