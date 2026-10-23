// STATUS: PLATIN — BATCH-60 source contract: Insight no longer marks a source "fresh" without reading it.
// Comments are stripped (string-literal aware), so documentation is not mistaken for code.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');
const strip = (source) => {
  let out = '';
  let quote = '';
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1];
    if (quote) {
      out += ch;
      if (ch === '\\') { out += next ?? ''; i += 1; continue; }
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; out += ch; continue; }
    if (ch === '/' && next === '*') { const end = source.indexOf('*/', i + 2); i = end === -1 ? source.length : end + 1; continue; }
    if (ch === '/' && next === '/') { const end = source.indexOf('\n', i); i = end === -1 ? source.length : end; continue; }
    out += ch;
  }
  return out;
};

const view = strip(read('../views/InsightView.tsx'));
const outcome = strip(read('../refresh/insightRefreshOutcome.ts'));
const locale = read('../locale/insightLocale.ts');

describe('Insight refresh source contract', () => {
  it('no longer stamps "fresh" directly from the refresh button', () => {
    expect(view).not.toMatch(/sourceState:\s*'fresh'/);
    expect(view).not.toMatch(/sourceState:'fresh'/);
    expect(view).not.toContain("sourceState: 'fresh'");
    // The only permitted origin of the literal is the successful-read branch of the resolver.
    expect(outcome).toContain("nextSourceState: 'fresh'");
  });

  it('does not ship a model that claims freshness before any read', () => {
    const types = strip(read('../domain/types.ts'));
    // A value assignment ends with a separator; the union type declaration ends with a pipe.
    const assignments = types.match(/sourceState\s*:\s*'fresh'\s*[,}]/g) ?? [];
    expect(assignments).toEqual([]);
    expect(types).toContain("cache:{enabled:true,quotaBytes:64*1024*1024,usedBytes:0,sourceState:'stale'");
  });

  it('routes the refresh decision through the pure resolver and the real executor', () => {
    expect(view).toContain('resolveInsightRefreshOutcome(');
    expect(view).toContain('createLocalInsightReader(');
    expect(view).toContain('data-insight-refresh-state={refreshOutcome}');
    expect(view).toContain('data-insight-source-state={model.cache.sourceState}');
    expect(outcome).toContain('executeInsightQuery(');
  });

  it('preserves the previous source state and the previous snapshot claim when the read did not happen', () => {
    // The cache decision is pure (refresh/insightRefreshOutcome.ts) and the view can no longer
    // write a cache field itself — in particular it can never stamp `snapshotAt`.
    expect(view).toContain('nextInsightCache(prev.cache,outcome,now)');
    expect(view).not.toContain('snapshotAt');
    expect(outcome).toContain('? { ...cache, lastRefreshAt: now, snapshotAt: now, sourceState: outcome.nextSourceState }');
    expect(outcome).toContain(': { ...cache, lastRefreshAt: now };');
    expect(outcome).toContain("'source-unavailable' ? 'unavailable' : 'error'");
    expect(outcome).toContain("kind: 'error', rows: 0, errorCode: 'refresh-read-empty'");
  });

  it('surfaces the failed read in text instead of claiming a refresh', () => {
    expect(view).toContain('copy.refreshUnread');
    expect(view).toContain('copy.refreshFailed(');
    expect(view).toContain('copy.refreshed(outcome.rows)');
    // The old unconditional success sentence is gone from every locale.
    expect(locale).not.toContain('Manual refresh checkpoint recorded. Source adapters run only through explicit refresh actions.');
    expect(locale).not.toContain('Datenquellen werden nur durch eine ausdrückliche Aktualisierung ausgeführt');
  });

  it('records the refresh outcome in the audit trail instead of a silent success', () => {
    expect(view).toContain("action:'refresh'");
    expect(view).toContain("outcome.kind==='read'?'allowed':'failed'");
    expect(view).toContain("detailCode:outcome.kind==='read'?'refresh-read-ok':outcome.errorCode??'refresh-read-failed'");
    // One audit definition (governance/insightGovernanceEngine) instead of an inline slice.
    expect(view).toContain('addAuditEvent(prev.audit,auditEvent)');
    expect(view).not.toContain('audit:[...prev.audit');
  });
});
