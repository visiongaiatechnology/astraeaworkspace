// STATUS: DIAMANT VGT SUPREME — delayed accessible tooltip layer for truncated and explicitly described controls.
import React, { useEffect, useRef, useState } from 'react';
import { TOOLTIP_INTENT_DELAY_MS } from '../../design-system/interactions/uiuxInteractionContracts';

interface TooltipState {
  target: HTMLElement;
  text: string;
  left: number;
  top: number;
}

const TOOLTIP_ID = 'astraea-accessible-tooltip';

function candidateFrom(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  return target.closest<HTMLElement>('[data-vgt-tooltip], [title], .truncate');
}

function tooltipText(target: HTMLElement): string {
  const explicit = target.dataset.vgtTooltip?.trim();
  if (explicit) return explicit.slice(0, 512);
  const labelled = target.getAttribute('aria-label')?.trim();
  if (labelled) return labelled.slice(0, 512);
  const titled = target.getAttribute('title')?.trim();
  if (titled) return titled.slice(0, 512);
  return (target.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 512);
}

function needsTooltip(target: HTMLElement): boolean {
  if (target.hasAttribute('data-vgt-tooltip') || target.hasAttribute('title')) return true;
  if (!target.classList.contains('truncate')) return false;
  return target.scrollWidth > target.clientWidth + 1 || target.scrollHeight > target.clientHeight + 1;
}

function positionFor(target: HTMLElement): Pick<TooltipState, 'left' | 'top'> {
  const rect = target.getBoundingClientRect();
  const left = Math.max(8, Math.min(window.innerWidth - 328, rect.left + Math.min(rect.width / 2, 140)));
  const top = Math.max(8, Math.min(window.innerHeight - 64, rect.bottom + 8));
  return { left, top };
}

export const AccessibleTooltipLayer: React.FC = () => {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const timerRef = useRef<number | null>(null);
  const describedTargetRef = useRef<HTMLElement | null>(null);
  const priorDescribedByRef = useRef<string | null>(null);

  useEffect(() => {
    const clearTimer = () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = null;
    };
    const clearDescription = () => {
      const previous = describedTargetRef.current;
      if (previous) {
        const prior = priorDescribedByRef.current;
        if (prior) previous.setAttribute('aria-describedby', prior);
        else previous.removeAttribute('aria-describedby');
      }
      describedTargetRef.current = null;
      priorDescribedByRef.current = null;
    };
    const hide = () => {
      clearTimer();
      clearDescription();
      setTooltip(null);
    };
    const showAfterIntent = (target: HTMLElement) => {
      clearTimer();
      if (!needsTooltip(target)) return;
      const text = tooltipText(target);
      if (!text) return;
      timerRef.current = window.setTimeout(() => {
        clearDescription();
        priorDescribedByRef.current = target.getAttribute('aria-describedby');
        describedTargetRef.current = target;
        const ids = new Set((priorDescribedByRef.current ?? '').split(/\s+/).filter(Boolean));
        ids.add(TOOLTIP_ID);
        target.setAttribute('aria-describedby', [...ids].join(' '));
        setTooltip({ target, text, ...positionFor(target) });
        timerRef.current = null;
      }, TOOLTIP_INTENT_DELAY_MS);
    };
    const onPointerOver = (event: PointerEvent) => {
      const target = candidateFrom(event.target);
      if (target) showAfterIntent(target);
    };
    const onPointerOut = (event: PointerEvent) => {
      const from = candidateFrom(event.target);
      const to = candidateFrom(event.relatedTarget);
      if (from && from !== to) hide();
    };
    const onFocusIn = (event: FocusEvent) => {
      const target = candidateFrom(event.target);
      if (target) showAfterIntent(target);
    };
    const onFocusOut = (event: FocusEvent) => {
      const from = candidateFrom(event.target);
      const to = candidateFrom(event.relatedTarget);
      if (from && from !== to) hide();
    };
    const reposition = () => {
      setTooltip((current) => current ? { ...current, ...positionFor(current.target) } : null);
    };

    document.addEventListener('pointerover', onPointerOver, true);
    document.addEventListener('pointerout', onPointerOut, true);
    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('focusout', onFocusOut, true);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      hide();
      document.removeEventListener('pointerover', onPointerOver, true);
      document.removeEventListener('pointerout', onPointerOut, true);
      document.removeEventListener('focusin', onFocusIn, true);
      document.removeEventListener('focusout', onFocusOut, true);
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, []);

  if (!tooltip) return null;
  return (
    <div
      id={TOOLTIP_ID}
      role="tooltip"
      className="pointer-events-none fixed z-50 max-w-80 rounded-md border border-white/15 bg-slate-950 px-2.5 py-1.5 text-[11px] leading-4 text-slate-100 shadow-xl"
      style={{ left: tooltip.left, top: tooltip.top }}
    >
      {tooltip.text}
    </div>
  );
};
