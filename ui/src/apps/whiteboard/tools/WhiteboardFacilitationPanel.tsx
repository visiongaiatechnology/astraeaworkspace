// STATUS: GOLD
import React, { useMemo, useState } from 'react';
import { Clock3, Download, Eye, EyeOff, LockKeyhole, Presentation, UsersRound, Vote, X } from 'lucide-react';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { creativePersonalText } from '../../creativePersonalLocale';
import type { WhiteboardFacilitationState, WhiteboardPresenterViewport } from '../../../shared/contracts/workspace';
import type { WhiteboardItem } from '../types';
import { whiteboardDeepText } from '../whiteboardDeepLocale';
import { deliverExportText } from '../../../shared/interchange/exportDelivery';
import { whiteboardDeliveryText, whiteboardExportFailureText } from '../interchange/whiteboardExportStatus';
import {
  WHITEBOARD_FACILITATION_MAX_VOTE_TARGETS,
  WHITEBOARD_FACILITATION_MAX_WORKSHOP_FRAMES,
  WHITEBOARD_FACILITATION_MAX_WORKSHOP_OBJECTS,
  castWhiteboardVote,
  closeVotingSession,
  exportVotingResultsCsv,
  getFacilitationTimerRemaining,
  lockTemplateBackground,
  pauseFacilitationTimer,
  requestBringEveryone,
  resetFacilitationTimer,
  resumeFacilitationTimer,
  setFollowPresenter,
  setWorkshopAreaVisibility,
  setWorkshopFrames,
  startFacilitationTimer,
  startVotingSession,
  tallyWhiteboardVotes,
} from '../model/whiteboardFacilitationEngine';

interface Props {
  items: WhiteboardItem[];
  selectedIds: readonly string[];
  state: WhiteboardFacilitationState;
  presenterViewport: WhiteboardPresenterViewport;
  voterId: string;
  voterName: string;
  updateState: (fn: (state: WhiteboardFacilitationState) => WhiteboardFacilitationState) => void;
  updateItemsAndState: (fn: (items: WhiteboardItem[], state: WhiteboardFacilitationState) => { items: WhiteboardItem[]; facilitation: WhiteboardFacilitationState }) => boolean;
  addReaction: () => void;
  onClose: () => void;
  showToast: (message: string) => void;
}

const panelButton = 'min-h-9 rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-slate-200 transition-colors motion-reduce:transition-none hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40';
const card = 'rounded-xl border border-white/10 bg-white/[.03] p-3';

function formatTime(milliseconds: number): string {
  const totalSeconds = Math.ceil(milliseconds / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export const WhiteboardFacilitationPanel: React.FC<Props> = ({
  items,
  selectedIds,
  state,
  presenterViewport,
  voterId,
  voterName,
  updateState,
  updateItemsAndState,
  addReaction,
  onClose,
  showToast,
}) => {
  const { locale } = useWorkspaceLocale();
  const t = (message: string) => creativePersonalText(whiteboardDeepText(message, locale), locale);
  const [now, setNow] = useState(() => Date.now());
  const [durationMinutes, setDurationMinutes] = useState(5);
  const [anonymous, setAnonymous] = useState(true);
  const [prompt, setPrompt] = useState(() => t('Vote on the selected options'));

  React.useEffect(() => {
    if (!state.timer?.running) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [state.timer?.running]);

  const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const selectedTargets = useMemo(
    () => selectedIds.filter((id) => {
      const item = itemsById.get(id);
      return item !== undefined && item.type !== 'connector';
    }),
    [itemsById, selectedIds],
  );
  const frameIds = useMemo(() => items.filter((item) => item.type === 'frame').map((item) => item.id), [items]);
  const tally = useMemo(() => tallyWhiteboardVotes(state.voting), [state.voting]);
  const remaining = getFacilitationTimerRemaining(state, now);
  const voteSelectionWithinLimit = selectedTargets.length <= WHITEBOARD_FACILITATION_MAX_VOTE_TARGETS;
  const workshopSelectionWithinLimit = selectedTargets.length <= WHITEBOARD_FACILITATION_MAX_WORKSHOP_OBJECTS;
  const allSelectedLocked = selectedTargets.length > 0
    && selectedTargets.every((id) => itemsById.get(id)?.locked === true);

  /** Release Beta 0.1: native save on the desktop; the browser fallback is a download. */
  const downloadResults = async (): Promise<void> => {
    if (!state.voting) return;
    try {
      const csv = exportVotingResultsCsv(state.voting, items);
      const delivery = await deliverExportText(csv, {
        suggestedName: 'whiteboard-voting-results.csv',
        extensions: ['csv'],
        mimeType: 'text/csv;charset=utf-8',
      });
      showToast(whiteboardDeliveryText(delivery));
    } catch (error) {
      showToast(whiteboardExportFailureText(error));
    }
  };

  const lockSelected = (locked: boolean): void => {
    updateItemsAndState((current, currentState) => {
    const result = lockTemplateBackground(currentState, current, selectedTargets, locked);
    return { items: result.items, facilitation: result.state };
    });
  };
  const setVisible = (visible: boolean): void => {
    updateItemsAndState((current, currentState) => {
    const result = setWorkshopAreaVisibility(currentState, current, selectedTargets, visible);
    return { items: result.items, facilitation: result.state };
    });
  };

  return (
    <section
      className="whiteboard-dock whiteboard-dock--right-top absolute right-5 top-20 z-32 max-h-[calc(100vh-150px)] w-[calc(100vw-2.5rem)] max-w-[360px] overflow-auto rounded-2xl border border-emerald-400/20 bg-slate-950/96 p-4 shadow-2xl backdrop-blur-xl"
      data-whiteboard-dock="facilitation"
      role="region"
      aria-labelledby="whiteboard-facilitation-title"
    >
      <header className="mb-3 flex items-center justify-between gap-3">
        <h2 id="whiteboard-facilitation-title" className="flex items-center gap-2 text-sm font-bold text-slate-100">
          <Presentation aria-hidden="true" className="h-4 w-4 text-emerald-300" />
          {t('Facilitation')}
        </h2>
        <button type="button" onClick={onClose} className={panelButton} aria-label={t('Close facilitation')}>
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      </header>

      <section className={card} aria-labelledby="whiteboard-facilitation-timer-title">
        <div className="flex items-center justify-between gap-3">
          <h3 id="whiteboard-facilitation-timer-title" className="flex items-center gap-2 text-xs font-semibold text-slate-300">
            <Clock3 aria-hidden="true" className="h-4 w-4" /> {t('Timer')}
          </h3>
          <output className="font-mono text-lg font-bold tabular-nums text-emerald-300" aria-label={t('Time remaining')}>
            {formatTime(remaining)}
          </output>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="whiteboard-facilitation-timer-minutes">{t('Timer minutes')}</label>
          <input
            id="whiteboard-facilitation-timer-minutes"
            type="number"
            min={1}
            max={1_440}
            value={durationMinutes}
            onChange={(event) => setDurationMinutes(Math.max(1, Math.min(1_440, Number(event.target.value) || 5)))}
            className="min-h-9 w-20 rounded-lg border border-white/10 bg-slate-900 px-2 text-xs text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300"
          />
          <button type="button" onClick={() => updateState((current) => startFacilitationTimer(current, durationMinutes * 60_000))} className={panelButton}>
            {t('Start timer')}
          </button>
          <button
            type="button"
            disabled={!state.timer || (!state.timer.running && remaining <= 0)}
            onClick={() => updateState((current) => current.timer?.running ? pauseFacilitationTimer(current) : resumeFacilitationTimer(current))}
            className={panelButton}
          >
            {t(state.timer?.running ? 'Pause timer' : 'Resume timer')}
          </button>
          <button type="button" disabled={!state.timer} onClick={() => updateState(resetFacilitationTimer)} className={panelButton}>
            {t('Reset timer')}
          </button>
        </div>
      </section>

      <section className={`${card} my-3`} aria-labelledby="whiteboard-facilitation-voting-title">
        <h3 id="whiteboard-facilitation-voting-title" className="flex items-center gap-2 text-xs font-semibold text-slate-300">
          <Vote aria-hidden="true" className="h-4 w-4" /> {t('Voting')}
        </h3>
        {!state.voting || state.voting.status === 'closed' ? (
          <div className="mt-3 space-y-3">
            <label className="block text-xs text-slate-300" htmlFor="whiteboard-facilitation-voting-prompt">{t('Question')}</label>
            <input
              id="whiteboard-facilitation-voting-prompt"
              value={prompt}
              maxLength={500}
              onChange={(event) => setPrompt(event.target.value.slice(0, 500))}
              className="min-h-10 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-xs text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300"
            />
            <label className="flex min-h-9 items-center gap-2 text-xs text-slate-300">
              <input type="checkbox" checked={anonymous} onChange={(event) => setAnonymous(event.target.checked)} className="h-4 w-4 accent-emerald-400" />
              {t('Hide voter names')}
            </label>
            {selectedTargets.length === 0 && <p className="text-xs text-slate-400">{t('Select one or more non-connector objects on the canvas to create vote options.')}</p>}
            {!voteSelectionWithinLimit && <p className="text-xs text-amber-200">{t('A vote can include up to {count} options. Reduce the selection to continue.').replace('{count}', String(WHITEBOARD_FACILITATION_MAX_VOTE_TARGETS))}</p>}
            <button
              type="button"
              disabled={selectedTargets.length === 0 || !voteSelectionWithinLimit}
              onClick={() => updateState((current) => startVotingSession(current, selectedTargets, anonymous, prompt))}
              className={`${panelButton} w-full border-emerald-400/30 text-emerald-100`}
            >
              {t('Start vote from selection')} ({selectedTargets.length})
            </button>
          </div>
        ) : (
          <>
            <p className="mt-3 text-sm leading-5 text-slate-200">{state.voting.prompt}</p>
            <p className="mt-1 text-xs text-slate-400">{t('Choose one option. Your vote can be changed while the poll is open.')}</p>
            <div className="mt-3 space-y-2">
              {tally.map((row) => (
                <button
                  key={row.targetId}
                  type="button"
                  aria-pressed={state.voting?.ballots.some((ballot) => ballot.id === voterId && ballot.targetId === row.targetId) ?? false}
                  onClick={() => updateState((current) => current.voting
                    ? castWhiteboardVote(current, row.targetId, voterId, voterName)
                    : current)}
                  className={`${panelButton} flex w-full items-center justify-between gap-3 text-left`}
                >
                  <span className="truncate">{itemsById.get(row.targetId)?.text || itemsById.get(row.targetId)?.name || row.targetId}</span>
                  <span className="font-mono text-sm tabular-nums text-emerald-300">{row.votes}</span>
                </button>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => updateState(closeVotingSession)} className={panelButton}>{t('Close vote')}</button>
              <button type="button" onClick={() => { void downloadResults(); }} className={`${panelButton} inline-flex items-center gap-2`}>
                <Download aria-hidden="true" className="h-4 w-4" /> {t('Download CSV')}
              </button>
            </div>
          </>
        )}
      </section>

      <section className={card} aria-labelledby="whiteboard-facilitation-presenter-title">
        <h3 id="whiteboard-facilitation-presenter-title" className="flex items-center gap-2 text-xs font-semibold text-slate-300">
          <UsersRound aria-hidden="true" className="h-4 w-4" /> {t('Presenter and participants')}
        </h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" aria-pressed={state.followPresenter} onClick={() => updateState((current) => setFollowPresenter(current, !current.followPresenter))} className={panelButton}>
            {t(state.followPresenter ? 'Stop following presenter' : 'Follow presenter')}
          </button>
          <button type="button" onClick={() => updateState((current) => requestBringEveryone(current, presenterViewport))} className={panelButton}>
            {t('Bring everyone to me')}
          </button>
          <button type="button" aria-pressed={state.hideParticipantNames} onClick={() => updateState((current) => ({ ...current, hideParticipantNames: !current.hideParticipantNames }))} className={panelButton}>
            {t(state.hideParticipantNames ? 'Show participant names' : 'Hide participant names')}
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-400">{t('Active cursors')}: {state.participants.length}</p>
      </section>

      <section className={`${card} mt-3`} aria-labelledby="whiteboard-facilitation-workshop-title">
        <h3 id="whiteboard-facilitation-workshop-title" className="text-xs font-semibold text-slate-300">{t('Workshop controls')}</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={frameIds.length > WHITEBOARD_FACILITATION_MAX_WORKSHOP_FRAMES} onClick={() => updateState((current) => setWorkshopFrames(current, frameIds))} className={panelButton}>
            {t('Use frames as sections')} ({frameIds.length})
          </button>
          <button type="button" disabled={!workshopSelectionWithinLimit || selectedTargets.length === 0} onClick={() => lockSelected(!allSelectedLocked)} className={`${panelButton} inline-flex items-center gap-2`}>
            <LockKeyhole aria-hidden="true" className="h-4 w-4" /> {t(allSelectedLocked ? 'Unlock background' : 'Lock background')}
          </button>
          <button type="button" disabled={!workshopSelectionWithinLimit || selectedTargets.length === 0} onClick={() => setVisible(false)} className={`${panelButton} inline-flex items-center gap-2`}>
            <EyeOff aria-hidden="true" className="h-4 w-4" /> {t('Hide selected')}
          </button>
          <button type="button" disabled={!workshopSelectionWithinLimit || selectedTargets.length === 0} onClick={() => setVisible(true)} className={`${panelButton} inline-flex items-center gap-2`}>
            <Eye aria-hidden="true" className="h-4 w-4" /> {t('Reveal selected')}
          </button>
          <button type="button" onClick={addReaction} className={panelButton}>{t('Add reaction')}</button>
        </div>
        {frameIds.length > WHITEBOARD_FACILITATION_MAX_WORKSHOP_FRAMES && <p className="mt-2 text-xs text-amber-200">{t('Workshop sections support up to {count} frames.').replace('{count}', String(WHITEBOARD_FACILITATION_MAX_WORKSHOP_FRAMES))}</p>}
        {!workshopSelectionWithinLimit && <p className="mt-2 text-xs text-amber-200">{t('Workshop object actions support up to {count} selected objects.').replace('{count}', String(WHITEBOARD_FACILITATION_MAX_WORKSHOP_OBJECTS))}</p>}
        <p className="mt-2 text-xs text-slate-400">{t('Workshop frames')}: {state.workshopFrameIds.length} · {t('selected')}: {selectedTargets.length}</p>
      </section>
    </section>
  );
};
