// STATUS: GOLD — seven-locale review collaboration controls with opaque failure feedback.
import React, { useState } from 'react';
import { CheckCircle2, GitCompareArrows, History, ShieldCheck, X, XCircle } from 'lucide-react';
import type { PresentDocumentModel, WorkspaceDocument } from '../../../shared/contracts/workspace';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { PRESENT_REVIEW_COPY, presentReviewFailureCopy } from '../locale/presentReviewLocale';
import { PresentReviewErrorAlert } from './PresentReviewErrorAlert';
import { compareVersionToCurrent, createPresentVersion, ensurePresentReviewState, setPresentReviewStatus } from './presentReviewCollaboration';

interface Props {
  isOpen: boolean;
  document: WorkspaceDocument;
  model: PresentDocumentModel;
  onClose: () => void;
  onUpdateModel: (model: PresentDocumentModel) => void;
}

export const PresentReviewCollaborationModal: React.FC<Props> = ({ isOpen, model, onClose, onUpdateModel }) => {
  const { locale } = useWorkspaceLocale();
  const copy = PRESENT_REVIEW_COPY[locale].collaboration;
  const [actor, setActor] = useState(copy.defaultReviewer);
  const [versionLabel, setVersionLabel] = useState('');
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const state = ensurePresentReviewState(model);
  const selectedVersion = state.versions.find((version) => version.id === selectedVersionId) ?? state.versions.at(-1) ?? null;
  const diffs = selectedVersion ? compareVersionToCurrent(selectedVersion, model) : [];
  if (!isOpen) return null;

  const updateStatus = (next: typeof state.review.status): void => {
    try {
      onUpdateModel(setPresentReviewStatus(model, next, actor));
      setError(null);
    } catch (cause) {
      setError(presentReviewFailureCopy(locale, cause));
    }
  };

  const saveSnapshot = (): void => {
    try {
      const label = versionLabel.trim() || copy.defaultVersionLabel(state.versions.length + 1);
      onUpdateModel(createPresentVersion(model, label, actor));
      setVersionLabel('');
      setError(null);
    } catch (cause) {
      setError(presentReviewFailureCopy(locale, cause));
    }
  };

  return <div role="dialog" aria-modal="true" aria-labelledby="present-review-title" aria-describedby="present-review-description" className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-3 sm:p-4">
    <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-slate-950 text-xs text-slate-200 shadow-2xl">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <div id="present-review-title" className="break-words font-bold text-sm">{copy.title}</div>
          <div id="present-review-description" className="break-words text-[0.625rem] text-slate-500">{copy.subtitle}</div>
        </div>
        <button aria-label={copy.close} title={copy.close} type="button" onClick={onClose} className="shrink-0 rounded p-1.5 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"><X className="h-4 w-4"/></button>
      </div>
      <div className="min-h-0 max-h-[78vh] flex-1 overflow-y-auto">
        {error && <div className="border-b border-red-400/20 bg-red-950/30 px-4 py-2 sm:px-5"><PresentReviewErrorAlert message={error}/></div>}
        <div className="grid grid-cols-1 gap-0 lg:grid-cols-2">
          <section aria-labelledby="present-review-state-heading" className="min-w-0 space-y-4 border-b border-white/10 p-3 sm:p-4 lg:border-b-0 lg:border-r">
            <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <div className="flex min-w-0 flex-wrap items-center gap-2 font-semibold"><ShieldCheck aria-hidden="true" className="h-4 w-4 shrink-0 text-emerald-400"/><span id="present-review-state-heading" className="break-words">{copy.reviewState}</span><output aria-label={copy.reviewState} className="ml-auto max-w-full break-words rounded bg-white/10 px-2 py-0.5 font-mono text-[0.625rem]">{copy.statuses[state.review.status]}</output></div>
              <input aria-label={copy.actorName} autoComplete="name" value={actor} onChange={(event) => setActor(event.target.value.slice(0, 128))} className="w-full min-w-0 rounded border border-white/10 bg-black/30 px-2 py-1.5" placeholder={copy.actorPlaceholder}/>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button type="button" onClick={() => updateStatus('in-review')} className="min-w-0 whitespace-normal break-words rounded border border-blue-500/30 bg-blue-500/10 px-2 py-1.5 text-blue-300">{copy.submitReview}</button>
                <button type="button" onClick={() => updateStatus('editing')} className="min-w-0 whitespace-normal break-words rounded border border-white/10 bg-white/5 px-2 py-1.5">{copy.backToEditing}</button>
                <button type="button" onClick={() => updateStatus('approved')} className="flex min-w-0 items-center justify-center gap-1 whitespace-normal break-words rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-1.5 text-emerald-300"><CheckCircle2 aria-hidden="true" className="h-3 w-3 shrink-0"/>{copy.approve}</button>
                <button type="button" onClick={() => updateStatus('changes-requested')} className="flex min-w-0 items-center justify-center gap-1 whitespace-normal break-words rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-amber-300"><XCircle aria-hidden="true" className="h-3 w-3 shrink-0"/>{copy.requestChanges}</button>
              </div>
              <div className="break-words text-[0.625rem] text-slate-500">{copy.approvals(state.review.approvals.length)} · {copy.reviewMode(state.review.reviewMode)}</div>
            </div>

            <div className="min-w-0 space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <div className="flex min-w-0 items-center gap-2 font-semibold"><GitCompareArrows aria-hidden="true" className="h-4 w-4 shrink-0 text-cyan-400"/><span className="break-words">{copy.deckVersions}</span></div>
              <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <input aria-label={copy.versionLabel} value={versionLabel} onChange={(event) => setVersionLabel(event.target.value.slice(0, 160))} className="min-w-0 rounded border border-white/10 bg-black/30 px-2 py-1.5" placeholder={copy.versionLabel}/>
                <button type="button" onClick={saveSnapshot} className="min-w-0 whitespace-normal break-words rounded bg-cyan-600 px-3 py-1.5 font-semibold text-white">{copy.snapshot}</button>
              </div>
              <select aria-label={copy.selectSnapshot} value={selectedVersion?.id ?? ''} onChange={(event) => setSelectedVersionId(event.target.value || null)} className="w-full min-w-0 rounded border border-white/10 bg-slate-900 px-2 py-1.5">
                <option value="">{copy.selectSnapshot}</option>{[...state.versions].reverse().map((version) => <option key={version.id} value={version.id}>{version.label} · {new Date(version.timestamp).toLocaleString(locale)}</option>)}
              </select>
              <div aria-label={copy.deckVersions} className="max-h-36 min-w-0 space-y-1 overflow-y-auto">
                {selectedVersion && diffs.length === 0 && <div className="break-words text-emerald-400">{copy.noChanges}</div>}
                {diffs.slice(0, 100).map((diff) => <div key={diff.slideId} className="min-w-0 break-words rounded border border-white/5 bg-black/20 px-2 py-1"><b>{copy.diffStatuses[diff.status]}</b> · {diff.afterTitle ?? diff.beforeTitle ?? diff.slideId}<div className="break-words text-[0.625rem] text-slate-500">{diff.changedFields.join(', ')}</div></div>)}
              </div>
            </div>
          </section>

          <section aria-labelledby="present-review-activity-heading" className="min-w-0 space-y-4 p-3 sm:p-4">
            <div className="min-w-0 space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <div className="flex min-w-0 items-center gap-2 font-semibold"><History aria-hidden="true" className="h-4 w-4 shrink-0 text-amber-400"/><span id="present-review-activity-heading" className="break-words">{copy.activityHistory}</span></div>
              <div aria-label={copy.activityHistory} className="max-h-56 min-w-0 space-y-1 overflow-y-auto">{[...state.activity].reverse().slice(0, 200).map((entry) => <div key={entry.id} className="min-w-0 break-words rounded border border-white/5 bg-black/20 px-2 py-1"><div className="flex min-w-0 flex-wrap justify-between gap-x-2"><b className="break-words">{entry.actor}</b><span className="text-[0.5625rem] text-slate-600">{new Date(entry.timestamp).toLocaleString(locale)}</span></div><div className="break-words text-[0.625rem] text-slate-400">{entry.summary}</div></div>)}{state.activity.length === 0 && <div className="break-words text-slate-500 italic">{copy.noActivity}</div>}</div>
            </div>
          </section>
        </div>
      </div>
    </div>
  </div>;
};
