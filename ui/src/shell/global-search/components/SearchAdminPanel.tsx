// STATUS: PLATIN — localized encrypted Search policy and history controls.
import React, { useEffect, useState } from 'react';
import {
  clearNativeSearchHistory,
  fetchSearchPreferences,
  fetchWorkspaceSearchStatus,
  saveSearchPolicy,
  type WorkspaceSearchStatus,
} from '../../../platform/search/services/workspaceSearchClient';
import { DEFAULT_SEARCH_POLICY, normalizeSearchPolicy } from '../../../platform/search/searchIndexPolicyCore';
import {
  createSearchPolicyHistory,
  pushSearchPolicyHistory,
  redoSearchPolicyHistory,
  undoSearchPolicyHistory,
  type SearchPolicyHistory,
} from '../../../platform/search/searchPolicyHistory';
import type { SearchAdminPolicy } from '../../../platform/search/searchTypes';
import { AnimatedAccordion } from '../../../design-system/components/AnimatedAccordion';
import { useWorkspaceLocale } from '../../localization/workspaceLocale';
import { formatSearchCopy, SEARCH_HUB_COPY } from '../searchHubLocale';

interface Props {
  onHistoryCleared?: () => void;
}

type StatusMessage = 'core' | 'policySaved' | 'policySaveFailed' | 'policyRestored' | 'policyRestoreFailed' | 'historyCleared' | 'historyClearFailed';

export const SearchAdminPanel: React.FC<Props> = ({ onHistoryCleared }) => {
  const [history, setHistory] = useState<SearchPolicyHistory>(() => createSearchPolicyHistory(DEFAULT_SEARCH_POLICY));
  const [statusMessage, setStatusMessage] = useState<StatusMessage>('core');
  const [coreStatus, setCoreStatus] = useState<WorkspaceSearchStatus | null>(null);
  const policy = history.present;
  const { locale } = useWorkspaceLocale();
  const copy = SEARCH_HUB_COPY[locale].administration;

  const commit = (next: SearchAdminPolicy): void => {
    const normalized = normalizeSearchPolicy(next);
    setHistory((current) => pushSearchPolicyHistory(current, normalized));
    void saveSearchPolicy(normalized)
      .then(() => setStatusMessage('policySaved'))
      .catch(() => setStatusMessage('policySaveFailed'));
  };

  const applyHistory = (next: SearchPolicyHistory): void => {
    setHistory(next);
    void saveSearchPolicy(next.present)
      .then(() => setStatusMessage('policyRestored'))
      .catch(() => setStatusMessage('policyRestoreFailed'));
  };

  useEffect(() => {
    let live = true;
    void fetchSearchPreferences().then((value) => {
      if (live) setHistory(createSearchPolicyHistory(value.policy));
    }).catch(() => undefined);
    void fetchWorkspaceSearchStatus().then((value) => {
      if (live) setCoreStatus(value);
    }).catch(() => undefined);
    return () => { live = false; };
  }, []);

  const status = statusMessage === 'core'
    ? coreStatus?.connected
      ? `${formatSearchCopy(copy.coreReady, { documents: coreStatus.documentCount, generation: coreStatus.generation })}${coreStatus.locked ? copy.locked : ''}`
      : coreStatus ? copy.coreUnavailable : copy.coreStarting
    : copy[statusMessage];
  const quota = Math.round(policy.maxEncryptedIndexBytes / 1024 / 1024);

  return (
    <AnimatedAccordion
      className="mt-3 rounded-xl border border-white/[0.06] bg-black/15 p-3"
      title={copy.title}
      headingLevel={3}
      triggerClassName="cursor-pointer text-[10px] text-slate-300"
      contentClassName="mt-2"
    >
      <div role="toolbar" aria-label={copy.historyToolbar} className="flex gap-1">
        <button type="button" disabled={!history.past.length} onClick={() => applyHistory(undoSearchPolicyHistory(history))} className="rounded border border-white/10 px-2 py-1 text-[9px]">{copy.undo}</button>
        <button type="button" disabled={!history.future.length} onClick={() => applyHistory(redoSearchPolicyHistory(history))} className="rounded border border-white/10 px-2 py-1 text-[9px]">{copy.redo}</button>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 text-[10px] md:grid-cols-2">
        <label className="flex items-center gap-2"><input type="checkbox" checked={policy.historyEnabled} onChange={(event: React.ChangeEvent<HTMLInputElement>) => commit({ ...policy, historyEnabled: event.target.checked })} />{copy.historyEnabled}</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={policy.localOcrEnabled} onChange={(event: React.ChangeEvent<HTMLInputElement>) => commit({ ...policy, localOcrEnabled: event.target.checked })} />{copy.localOcr}</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={policy.semanticRankingEnabled} onChange={(event: React.ChangeEvent<HTMLInputElement>) => commit({ ...policy, semanticRankingEnabled: event.target.checked })} />{copy.semanticRanking}</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={policy.externalConnectorIndexing.enabled} onChange={(event: React.ChangeEvent<HTMLInputElement>) => commit({ ...policy, externalConnectorIndexing: { ...policy.externalConnectorIndexing, enabled: event.target.checked } })} />{copy.externalConnectorIndexing} ({copy.allowlistRequired})</label>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span aria-live="polite" className="text-[9px] text-slate-500">{status} · {formatSearchCopy(copy.quota, { quota })}</span>
        <button type="button" onClick={() => void clearNativeSearchHistory()
          .then(() => { setStatusMessage('historyCleared'); onHistoryCleared?.(); })
          .catch(() => setStatusMessage('historyClearFailed'))} className="rounded border border-white/10 px-2 py-1 text-[9px]">{copy.clearHistory}</button>
      </div>
    </AnimatedAccordion>
  );
};
