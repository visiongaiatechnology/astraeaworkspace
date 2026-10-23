// STATUS: PLATIN — explicit connecting/error/ended states for the Present display windows.
//
// A display window is a separate document: "nothing happened yet" must be stated, not shown as an
// empty black screen the operator cannot distinguish from a broken projector.
import React from 'react';
import { AlertTriangle, Check } from 'lucide-react';
import type { PresentDisplayNotice } from './runtime/usePresentDisplayRuntime';

export interface PresentDisplayStatusPanelProps {
  readonly role: 'audience' | 'presenter';
  readonly tone: 'pending' | 'error' | 'ended';
  readonly title: string;
  readonly body: string;
  readonly hint?: string;
  readonly notice?: PresentDisplayNotice | null;
  readonly actionLabel?: string;
  readonly onAction?: () => void;
  readonly secondaryLabel?: string;
  readonly onSecondary?: () => void;
}

export const PresentDisplayStatusPanel: React.FC<PresentDisplayStatusPanelProps> = ({
  role,
  tone,
  title,
  body,
  hint,
  notice,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
}) => (
  <div
    data-present-display-status={role}
    data-present-display-status-tone={tone}
    data-present-display-notice={notice ?? undefined}
    role="status"
    aria-live="polite"
    className="fixed inset-0 z-[60] flex items-center justify-center bg-black p-6"
  >
    <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-950/80 p-6 text-center shadow-2xl shadow-black/60 backdrop-blur-2xl">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04]">
        {tone === 'ended'
          ? <Check aria-hidden="true" className="h-5 w-5 text-emerald-300" />
          : <AlertTriangle aria-hidden="true" className={`h-5 w-5 ${tone === 'error' ? 'text-amber-300' : 'text-slate-300'}`} />}
      </div>
      <h1 className="mt-3 break-words text-sm font-semibold text-slate-100">{title}</h1>
      <p className="mt-2 break-words text-xs leading-relaxed text-slate-400">{body}</p>
      {hint && <p className="mt-2 break-words text-[0.6875rem] leading-relaxed text-slate-500">{hint}</p>}
      {(actionLabel && onAction) || (secondaryLabel && onSecondary) ? (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {secondaryLabel && onSecondary && (
            <button
              type="button"
              onClick={onSecondary}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-300 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
            >
              {secondaryLabel}
            </button>
          )}
          {actionLabel && onAction && (
            <button
              type="button"
              onClick={onAction}
              className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-slate-950 transition-colors hover:bg-amber-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300"
            >
              {actionLabel}
            </button>
          )}
        </div>
      ) : null}
    </div>
  </div>
);
