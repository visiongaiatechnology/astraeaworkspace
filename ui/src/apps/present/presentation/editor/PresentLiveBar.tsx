// STATUS: PLATIN — editor status band while a two-window presentation is live.
//
// The editor stays visible while the projector and presenter windows are open. This bar is the one
// place that states what is running, on which screens, whether both windows answered, the current
// slide, and how to end it. It is an overlay because it must not reflow the editor.
import React from 'react';
import { EyeOff, Presentation, Square } from 'lucide-react';
import type { PresentMonitorInfo } from '../../../../platform/native/presentWindowBridge';
import type { WorkspaceLocale } from '../../../../shell/localization/workspaceLocaleTypes';
import { presentPresentationCopy } from '../locale/presentPresentationLocale';
import { formatPresentResolution } from '../preferences/presentDisplayPreferences';
import type { PresentDisplaySessionState } from './usePresentDisplaySession';

export interface PresentLiveBarProps {
  readonly state: PresentDisplaySessionState;
  readonly audienceMonitor: PresentMonitorInfo | null;
  readonly presenterMonitor: PresentMonitorInfo | null;
  readonly locale: WorkspaceLocale;
  readonly onToggleBlack: () => void;
  readonly onStop: () => void;
}

const roleLabel = (monitor: PresentMonitorInfo | null): string => (
  monitor ? `${monitor.name} · ${formatPresentResolution(monitor)}` : '—'
);

export const PresentLiveBar: React.FC<PresentLiveBarProps> = ({
  state,
  audienceMonitor,
  presenterMonitor,
  locale,
  onToggleBlack,
  onStop,
}) => {
  const copy = presentPresentationCopy(locale);
  const editorCopy = copy.editor;
  const dialogCopy = copy.startDialog;
  const slideNumber = Math.min(state.currentIndex + 1, Math.max(1, state.slideCount));

  const roleChip = (
    role: 'audience' | 'presenter',
    label: string,
    monitor: PresentMonitorInfo | null,
  ) => {
    const ready = state.roles[role].ready;
    return (
      <span
        key={role}
        data-present-live-role={role}
        data-present-live-role-ready={ready ? 'true' : 'false'}
        title={`${label}: ${roleLabel(monitor)} — ${ready ? editorCopy.roleReady : editorCopy.roleWaiting}`}
        aria-label={`${label}: ${roleLabel(monitor)} — ${ready ? editorCopy.roleReady : editorCopy.roleWaiting}`}
        className={`flex min-w-0 items-center gap-1.5 rounded-lg border px-2 py-1 text-[0.625rem] ${
          ready
            ? 'border-emerald-400/25 bg-emerald-400/[0.07] text-emerald-200'
            : 'border-amber-400/25 bg-amber-400/[0.07] text-amber-200'
        }`}
      >
        <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${ready ? 'bg-emerald-400' : 'bg-amber-400'}`} />
        <span className="shrink-0 font-semibold">{label}</span>
        <span className="max-w-[14rem] truncate font-mono text-[0.5625rem] text-slate-400">{roleLabel(monitor)}</span>
      </span>
    );
  };

  return (
    <div
      data-present-live-bar="true"
      role="status"
      aria-live="polite"
      className="pointer-events-auto absolute left-1/2 top-2 z-40 flex max-w-[calc(100%-2rem)] -translate-x-1/2 flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-slate-950/85 px-2.5 py-1.5 shadow-2xl shadow-black/50 backdrop-blur-xl"
    >
      <span className="flex items-center gap-1.5 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-[0.625rem] font-bold uppercase tracking-wider text-emerald-300">
        <Presentation aria-hidden="true" className="h-3 w-3" />
        {editorCopy.running}
      </span>

      {roleChip('audience', dialogCopy.audienceLabel, audienceMonitor)}
      {roleChip('presenter', dialogCopy.presenterLabel, presenterMonitor)}

      {state.slideCount > 0 && (
        <span data-present-live-slide="true" className="font-mono text-[0.625rem] tabular-nums text-slate-400">
          {editorCopy.slidePosition(slideNumber, state.slideCount)}
        </span>
      )}

      <span className="mx-0.5 h-4 w-px bg-white/10" aria-hidden="true" />

      <button
        type="button"
        onClick={onToggleBlack}
        aria-pressed={state.blackScreen}
        data-present-live-black="true"
        className={`flex items-center gap-1 rounded-md border px-1.5 py-1 text-[0.625rem] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400 ${
          state.blackScreen
            ? 'border-amber-400/50 bg-amber-400/10 text-amber-200'
            : 'border-white/10 text-slate-300 hover:bg-white/5 hover:text-white'
        }`}
      >
        <EyeOff aria-hidden="true" className="h-3 w-3" />
        {state.blackScreen ? editorCopy.blackOn : editorCopy.blackOff}
      </button>
      <button
        type="button"
        onClick={onStop}
        data-present-live-stop="true"
        className="flex items-center gap-1 rounded-md border border-red-500/30 bg-red-500/10 px-1.5 py-1 text-[0.625rem] font-semibold text-red-200 transition-colors hover:bg-red-500/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-400"
      >
        <Square aria-hidden="true" className="h-2.5 w-2.5 fill-current" />
        {editorCopy.stop}
      </button>
    </div>
  );
};
