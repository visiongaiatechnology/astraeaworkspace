// STATUS: PLATIN — Voluntary support surface (Start Center, onboarding and Settings).
//
// The project is developed by one person with AI assistance and scarce resources. This component is
// deliberately honest: it shows concrete donation channels, never claims consideration/support, and
// never opens an external address itself. Copying is a local clipboard action.
import React, { useCallback, useEffect, useState } from 'react';
import { Check, Copy, HeartHandshake } from 'lucide-react';
import type { WorkspaceLocale } from '../localization/workspaceLocaleTypes';
import { SUPPORT_COPY, SUPPORT_METHODS } from './supportContent';

type SupportVariant = 'page' | 'onboarding' | 'settings';

interface SupportOptionsProps {
  readonly locale: WorkspaceLocale;
  readonly variant?: SupportVariant;
}

async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // fall through to the legacy path; a refused clipboard must not throw into the UI
  }
  try {
    const area = document.createElement('textarea');
    area.value = value;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const copied = document.execCommand('copy');
    area.remove();
    return copied;
  } catch {
    return false;
  }
}

export const SupportOptions: React.FC<SupportOptionsProps> = ({ locale, variant = 'page' }) => {
  const copy = SUPPORT_COPY[locale] ?? SUPPORT_COPY['en-US'];
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);

  useEffect(() => {
    if (!copiedId) return undefined;
    const timer = window.setTimeout(() => setCopiedId(null), 1800);
    return () => window.clearTimeout(timer);
  }, [copiedId]);

  const handleCopy = useCallback(async (methodId: string, value: string) => {
    setCopyFailed(false);
    const ok = await copyText(value);
    if (ok) setCopiedId(methodId);
    else setCopyFailed(true);
  }, []);

  const shellClass = variant === 'onboarding'
    ? 'rounded-2xl border border-[color:var(--vgt-metal-edge)] bg-[color:var(--vgt-surface-z1,#11141c)]/60 p-4'
    : 'rounded-2xl border border-[color:var(--vgt-metal-edge)] bg-[color:var(--vgt-surface-z1,#11141c)] p-5';

  return (
    <section data-support-options={variant} aria-labelledby="support-options-title" className={shellClass}>
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-purple-400/25 bg-purple-500/10 text-purple-200">
          <HeartHandshake className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0">
          <h2 id="support-options-title" className="text-xs font-semibold text-[color:var(--vgt-text-primary,#f3f4f6)]">{copy.title}</h2>
          <p className="mt-1 text-[10px] leading-relaxed text-[color:var(--vgt-text-secondary,#aeb5c2)]">{copy.body}</p>
        </div>
      </div>

      <ul className="mt-3 grid gap-2 sm:grid-cols-3" aria-label={copy.title}>
        {SUPPORT_METHODS.map((method) => {
          const copied = copiedId === method.id;
          return (
            <li key={method.id} data-support-method={method.id} className="min-w-0 rounded-xl border border-white/[.08] bg-[color:var(--vgt-surface-z0,#090b12)]/70 p-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[10px] font-semibold text-[color:var(--vgt-text-primary,#f3f4f6)]">{method.name}</span>
                <span className="shrink-0 rounded border border-white/10 px-1 py-0.5 text-[8px] font-mono uppercase tracking-wider text-[color:var(--vgt-text-muted,#929aaa)]">{method.network}</span>
              </div>
              <code className="mt-1.5 block break-all text-[9px] leading-relaxed text-[color:var(--vgt-text-secondary,#aeb5c2)]">{method.value}</code>
              <button
                type="button"
                onClick={() => { void handleCopy(method.id, method.value); }}
                className="mt-2 inline-flex min-h-7 items-center gap-1 rounded-md border border-purple-400/20 px-2 text-[9px] font-medium text-purple-200 transition-colors hover:bg-purple-500/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-purple-300"
                aria-label={`${copy.copy}: ${method.name}`}
              >
                {copied ? <Check aria-hidden="true" className="h-3 w-3" /> : <Copy aria-hidden="true" className="h-3 w-3" />}
                <span>{copied ? copy.copied : copy.copy}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {copyFailed && <p role="alert" className="mt-2 text-[9px] text-amber-200">{copy.copy} — clipboard unavailable.</p>}
      <p className="mt-3 border-l-2 border-purple-400/25 pl-2.5 text-[9px] leading-relaxed text-[color:var(--vgt-text-muted,#929aaa)]">{copy.note}</p>
      <p className="mt-1.5 text-[8px] font-mono uppercase tracking-wider text-[color:var(--vgt-text-muted,#929aaa)]">{copy.openSource}</p>
    </section>
  );
};

export default SupportOptions;
