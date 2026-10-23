import React from 'react';
import { ShieldCheck, LockKeyhole, XCircle } from 'lucide-react';
import type { TopSecretProgressEvent, TopSecretPhase } from '../../../platform/security/topSecretEngine';
import { useWorkspaceLocale } from '../../localization/workspaceLocale';
import { shellSecurityCopy } from '../../i18n/shellSecurityLocale';

const PHASES: TopSecretPhase[] = [
  'PREPARING_INNER_VWC',
  'KEM_ENCAPSULATION',
  'INFINITY_CASCADE',
  'PQ_SIGNATURES',
  'ATOMIC_WRITE',
  'VERIFYING_OUTER',
  'VERIFY_PQ_SIGNATURES',
  'OPEN_INFINITY_LAYERS',
  'AUTHENTICATE_INNER_VWC',
  'COMPLETE',
];

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KiB', 'MiB', 'GiB'];
  let n = value;
  let index = 0;
  while (n >= 1024 && index < units.length - 1) { n /= 1024; index += 1; }
  return `${n.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export interface TopSecretProgressModalProps {
  event: TopSecretProgressEvent | null;
  onCancel: (operationId: string) => void;
}

export const TopSecretProgressModal: React.FC<TopSecretProgressModalProps> = ({ event, onCancel }) => {
  const { locale } = useWorkspaceLocale();
  const copy = shellSecurityCopy(locale).progress;
  if (!event) return null;
  const phaseIndex = Math.max(0, PHASES.indexOf(event.phase));
  const determinate = typeof event.bytes_total === 'number' && event.bytes_total > 0;
  const percentage = determinate ? Math.min(100, Math.max(0, Math.round((event.bytes_completed / event.bytes_total!) * 100))) : null;
  const completed = event.phase === 'COMPLETE';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4" role="dialog" aria-modal="true" aria-labelledby="ts-progress-title">
      <div className="w-full max-w-md rounded-2xl border border-purple-500/30 bg-[#0a0714] p-5 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-purple-500/30 bg-purple-500/10">
            {completed ? <ShieldCheck className="h-5 w-5 text-emerald-400" /> : <LockKeyhole className="h-5 w-5 text-purple-300" />}
          </div>
          <div>
            <h2 id="ts-progress-title" className="text-sm font-bold text-slate-100">VGT Top Secret</h2>
            <p className="text-[11px] text-slate-400">{copy.phase[event.phase]}</p>
            {!completed && ['VERIFY_PQ_SIGNATURES', 'OPEN_INFINITY_LAYERS', 'AUTHENTICATE_INNER_VWC'].includes(event.phase) && <p className="mt-0.5 text-[9px] font-semibold tracking-wide text-amber-300">{copy.sealedUnverified}</p>}
          </div>
        </div>

        <div className="mt-4 space-y-2" aria-live="polite">
          <div className="flex justify-between text-[10px] text-slate-400">
            <span>{copy.phaseCount(phaseIndex + 1, PHASES.length)}</span>
            {percentage !== null ? <span>{percentage}%</span> : <span>{copy.engineStatus}</span>}
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentage ?? undefined} aria-valuetext={percentage === null ? copy.phase[event.phase] : `${percentage}%`}>
            <div className="h-full bg-purple-500 transition-[width] duration-200 ease-out motion-reduce:transition-none" style={{ width: percentage === null ? `${Math.round(((phaseIndex + 1) / PHASES.length) * 100)}%` : `${percentage}%` }} />
          </div>
          <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-500">
            <div className="rounded-lg border border-white/10 bg-black/20 p-2">{copy.bytes}: {formatBytes(event.bytes_completed)}{determinate ? ` / ${formatBytes(event.bytes_total!)}` : ''}</div>
            <div className="rounded-lg border border-white/10 bg-black/20 p-2">{copy.chunks}: {event.chunks_completed}{typeof event.chunks_total === 'number' ? ` / ${event.chunks_total}` : ''}</div>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-[10px] leading-relaxed text-amber-100/80">
          {copy.disclaimer}
        </div>

        <div className="mt-4 flex justify-end">
          {event.cancellable && !completed ? (
            <button type="button" onClick={() => onCancel(event.operation_id)} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-300">
              <XCircle className="h-3.5 w-3.5" /> {copy.cancel}
            </button>
          ) : !completed ? (
            <span className="text-[10px] text-slate-500">{copy.noCancel}</span>
          ) : (
            <span className="text-xs font-medium text-emerald-400">{copy.complete}</span>
          )}
        </div>
      </div>
    </div>
  );
};
