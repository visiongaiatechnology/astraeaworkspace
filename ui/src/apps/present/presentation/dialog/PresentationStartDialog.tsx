// STATUS: PLATIN — Present start dialog: choose projector and presenter screen, or single-screen.
//
// Design intent (VGT UI/UX standard, GLASS 2100): one focused surface with a real hierarchy —
// kicker, title, one sentence of context, then the two functional regions (presentation mode,
// monitor roles) and one primary action. No decorative grid or ambient glow: the composition carries
// the surface. Glass material is used only because this is a modal overlay above the editor.
//
// Interaction contract: Escape cancels (unless a start is in flight), Tab is contained, focus
// returns to the trigger, native radio inputs carry the semantics, and every state has explicit
// copy — loading, unavailable, error, warning.
import React, { useEffect, useId, useRef, useState } from 'react';
import { AlertTriangle, Check, Loader2, Monitor, Presentation, Users, X } from 'lucide-react';
import type { PresentMonitorInfo } from '../../../../platform/native/presentWindowBridge';
import type { WorkspaceLocale } from '../../../../shell/localization/workspaceLocaleTypes';
import {
  presentPresentationCopy,
  type PresentSessionStartError,
} from '../locale/presentPresentationLocale';
import {
  defaultPresentMonitorSelection,
  formatPresentResolution,
  type PresentDisplayPreference,
  type PresentMonitorSelection,
  type PresentPresentationMode,
} from '../preferences/presentDisplayPreferences';
import { cyclePresentDialogFocus } from './presentDialogFocus';

export interface PresentationStartDialogProps {
  readonly monitors: readonly PresentMonitorInfo[];
  /** `presentDisplayAvailable()` of the bridge; `false` in a plain browser. */
  readonly displayAvailable: boolean;
  readonly preference: PresentDisplayPreference;
  /** `true` when the user already saved a choice; decides the initial mode. */
  readonly storedPreference: boolean;
  readonly locale: WorkspaceLocale;
  readonly busy?: boolean;
  readonly error?: PresentSessionStartError | null;
  /** 0-based index the presentation starts at; shown as a hint only. */
  readonly startIndex?: number;
  readonly onCancel: () => void;
  readonly onStartSingleScreen: () => void;
  readonly onStartMultiScreen: (selection: PresentMonitorSelection) => void;
}

const MODE_OPTION_BASE = 'flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-amber-400/70';
const MODE_OPTION_IDLE = 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]';
const MODE_OPTION_ACTIVE = 'border-amber-400/60 bg-amber-400/[0.08]';
const MONITOR_OPTION_BASE = 'flex cursor-pointer items-start gap-2.5 rounded-lg border px-2.5 py-2 transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-amber-400/70';
const MONITOR_OPTION_IDLE = 'border-white/[0.08] bg-white/[0.015] hover:border-white/20 hover:bg-white/[0.04]';
const MONITOR_OPTION_ACTIVE = 'border-amber-400/50 bg-amber-400/[0.07]';

export const PresentationStartDialog: React.FC<PresentationStartDialogProps> = ({
  monitors,
  displayAvailable,
  preference,
  storedPreference,
  locale,
  busy = false,
  error = null,
  startIndex,
  onCancel,
  onStartSingleScreen,
  onStartMultiScreen,
}) => {
  const copy = presentPresentationCopy(locale);
  const dialogCopy = copy.startDialog;
  const headingId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const multiAvailable = displayAvailable && monitors.length >= 2;

  const [mode, setMode] = useState<PresentPresentationMode>(() => {
    if (!multiAvailable) return 'single';
    return storedPreference && preference.mode === 'single' ? 'single' : 'multi';
  });
  const [selection, setSelection] = useState<PresentMonitorSelection | null>(
    () => defaultPresentMonitorSelection(monitors, preference),
  );

  // The monitor list can be re-read while the dialog is open; keep the selection inside it.
  useEffect(() => {
    setSelection((previous) => {
      if (monitors.length === 0) return null;
      if (
        previous
        && monitors.some((monitor) => monitor.index === previous.audienceMonitorIndex)
        && monitors.some((monitor) => monitor.index === previous.presenterMonitorIndex)
      ) {
        return previous;
      }
      return defaultPresentMonitorSelection(monitors, preference);
    });
  }, [monitors, preference]);

  // Focus containment and focus restoration (the trigger gets focus back on close).
  useEffect(() => {
    const previousActive = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const initial = panelRef.current?.querySelector<HTMLElement>('input[type="radio"]:not([disabled])')
      ?? panelRef.current;
    initial?.focus();
    return () => {
      previousActive?.focus();
    };
  }, []);

  const effectiveMode: PresentPresentationMode = multiAvailable ? mode : 'single';
  const errorText = error ? copy.editor.errors[error] : null;
  const sameMonitor = effectiveMode === 'multi'
    && selection !== null
    && selection.audienceMonitorIndex === selection.presenterMonitorIndex;
  const canStart = !busy && (effectiveMode === 'single' || selection !== null);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (!busy) onCancel();
      return;
    }
    cyclePresentDialogFocus(event, panelRef.current, document.activeElement);
  };

  const handleBackdropMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (busy || event.target !== event.currentTarget) return;
    onCancel();
  };

  const selectMonitor = (role: 'audience' | 'presenter', monitorIndex: number) => {
    setSelection((previous) => {
      const base = previous ?? defaultPresentMonitorSelection(monitors, preference);
      if (!base) return previous;
      return role === 'audience'
        ? { ...base, audienceMonitorIndex: monitorIndex }
        : { ...base, presenterMonitorIndex: monitorIndex };
    });
  };

  const submit = () => {
    if (!canStart) return;
    if (effectiveMode === 'single') {
      onStartSingleScreen();
      return;
    }
    if (selection) onStartMultiScreen(selection);
  };

  const modeOption = (
    value: PresentPresentationMode,
    title: string,
    description: string,
    icon: React.ReactNode,
    disabled: boolean,
  ) => {
    const active = effectiveMode === value;
    return (
      <label
        key={value}
        data-present-start-mode-option={value}
        data-present-start-mode-active={active ? 'true' : 'false'}
        className={`${MODE_OPTION_BASE} ${active ? MODE_OPTION_ACTIVE : MODE_OPTION_IDLE} ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
      >
        <input
          type="radio"
          name="present-start-mode"
          value={value}
          checked={active}
          disabled={disabled || busy}
          onChange={() => setMode(value)}
          className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-amber-400"
        />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-100">
            {icon}
            {title}
          </span>
          <span className="mt-1 block text-[0.6875rem] leading-relaxed text-slate-400">{description}</span>
        </span>
      </label>
    );
  };

  const monitorGroup = (
    role: 'audience' | 'presenter',
    label: string,
    description: string,
    icon: React.ReactNode,
  ) => {
    const selectedIndex = role === 'audience' ? selection?.audienceMonitorIndex : selection?.presenterMonitorIndex;
    return (
      <fieldset data-present-monitor-group={role} className="min-w-0">
        <legend className="flex items-center gap-1.5 text-[0.625rem] font-bold uppercase tracking-[0.16em] text-slate-400">
          {icon}
          {label}
        </legend>
        <p className="mt-1 text-[0.6875rem] leading-relaxed text-slate-500">{description}</p>
        <div className="mt-2 space-y-1.5" role="radiogroup" aria-label={label}>
          {monitors.map((monitor) => {
            const checked = selectedIndex === monitor.index;
            return (
              <label
                key={monitor.index}
                data-present-monitor-row={`${role}:${monitor.index}`}
                data-present-monitor-selected={checked ? 'true' : 'false'}
                className={`${MONITOR_OPTION_BASE} ${checked ? MONITOR_OPTION_ACTIVE : MONITOR_OPTION_IDLE}`}
              >
                <input
                  type="radio"
                  name={`present-${role}-monitor`}
                  value={monitor.index}
                  checked={checked}
                  disabled={busy}
                  onChange={() => selectMonitor(role, monitor.index)}
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-amber-400"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <span className="truncate text-xs font-semibold text-slate-100">{monitor.name}</span>
                    {monitor.primary && (
                      <span className="rounded border border-cyan-400/30 bg-cyan-400/10 px-1 py-px text-[0.5625rem] font-bold uppercase tracking-wider text-cyan-300" data-present-primary-badge="true">
                        {dialogCopy.primaryBadge}
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block font-mono text-[0.6875rem] tabular-nums text-slate-400">
                    {formatPresentResolution(monitor)}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
        {monitors.length === 0 && (
          <p className="mt-2 text-[0.6875rem] text-slate-500">{dialogCopy.noMonitorsNotice}</p>
        )}
      </fieldset>
    );
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-6"
      onMouseDown={handleBackdropMouseDown}
      data-present-start-backdrop="true"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        aria-busy={busy || undefined}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        data-present-start-dialog="true"
        className="flex max-h-[calc(100vh-1.5rem)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-950/85 shadow-2xl shadow-black/70 backdrop-blur-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[0.625rem] font-bold uppercase tracking-[0.18em] text-amber-300/90">
              <Presentation aria-hidden="true" className="h-3.5 w-3.5" />
              {dialogCopy.kicker}
            </div>
            <h2 id={headingId} className="mt-1 break-words text-lg font-semibold text-slate-50 sm:text-xl">
              {dialogCopy.title}
            </h2>
            <p className="mt-1 max-w-xl break-words text-xs leading-relaxed text-slate-400">{dialogCopy.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            aria-label={dialogCopy.close}
            title={dialogCopy.close}
            data-present-dialog-close="true"
            className="shrink-0 rounded-lg border border-white/10 p-1.5 text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400 disabled:opacity-40"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
          {!displayAvailable && (
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-3" data-present-native-unavailable="true">
              <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-amber-200">{dialogCopy.nativeUnavailableTitle}</p>
                <p className="mt-1 text-[0.6875rem] leading-relaxed text-amber-200/70">{dialogCopy.nativeUnavailableBody}</p>
              </div>
            </div>
          )}

          {displayAvailable && monitors.length === 0 && (
            <div className="flex items-start gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] p-3" data-present-no-monitors="true">
              <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
              <p className="text-[0.6875rem] leading-relaxed text-slate-300">{dialogCopy.noMonitorsNotice}</p>
            </div>
          )}

          {displayAvailable && monitors.length === 1 && (
            <div className="flex items-start gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] p-3" data-present-single-monitor-notice="true">
              <Monitor aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
              <p className="text-[0.6875rem] leading-relaxed text-slate-300">{dialogCopy.singleMonitorNotice}</p>
            </div>
          )}

          <fieldset className="min-w-0">
            <legend className="text-[0.625rem] font-bold uppercase tracking-[0.16em] text-slate-400">
              {dialogCopy.modeLegend}
            </legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {modeOption('multi', dialogCopy.multiLabel, dialogCopy.multiDescription, <Monitor aria-hidden="true" className="h-3.5 w-3.5 text-cyan-300" />, !multiAvailable)}
              {modeOption('single', dialogCopy.singleLabel, dialogCopy.singleDescription, <Presentation aria-hidden="true" className="h-3.5 w-3.5 text-amber-300" />, false)}
            </div>
          </fieldset>

          {effectiveMode === 'multi' && (
            <div className="grid gap-4 sm:grid-cols-2" data-present-monitor-selection="true">
              {monitorGroup('audience', dialogCopy.audienceLabel, dialogCopy.audienceDescription, <Users aria-hidden="true" className="h-3 w-3" />)}
              {monitorGroup('presenter', dialogCopy.presenterLabel, dialogCopy.presenterDescription, <Monitor aria-hidden="true" className="h-3 w-3" />)}
            </div>
          )}

          {effectiveMode === 'multi' && sameMonitor && (
            <p role="status" data-present-same-monitor-warning="true" className="flex items-start gap-2 rounded-lg border border-amber-400/25 bg-amber-400/[0.06] px-3 py-2 text-[0.6875rem] leading-relaxed text-amber-200">
              <AlertTriangle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {dialogCopy.sameMonitorWarning}
            </p>
          )}

          {errorText && (
            <div role="alert" data-present-start-error="true" className="rounded-lg border border-red-500/30 bg-red-500/[0.08] px-3 py-2">
              <p className="text-[0.625rem] font-bold uppercase tracking-wider text-red-300">{dialogCopy.errorTitle}</p>
              <p className="mt-1 break-words text-[0.6875rem] leading-relaxed text-red-200">{errorText}</p>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-white/[0.02] px-5 py-4 sm:px-6">
          <p className="min-w-0 break-words text-[0.6875rem] leading-relaxed text-slate-500">
            {dialogCopy.preferenceNote}
            {typeof startIndex === 'number' && startIndex > 0 ? ` · ${dialogCopy.startAtSlide(startIndex + 1)}` : ''}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              data-present-dialog-cancel="true"
              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-300 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400 disabled:opacity-40"
            >
              {dialogCopy.cancel}
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!canStart}
              data-present-start-submit="true"
              data-present-start-mode={effectiveMode}
              className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3.5 py-1.5 text-xs font-bold text-slate-950 transition-colors hover:bg-amber-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy
                ? <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                : <Check aria-hidden="true" className="h-3.5 w-3.5" />}
              {busy ? dialogCopy.startingButton : dialogCopy.startButton}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
