// STATUS: PLATIN — localized, keyboard-operable coachmark anchored to explicit app controls.
import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { APP_CATALOG } from '../../edition/catalog';
import type { OpenCoreAppKind } from '../../edition/contracts';
import type { WorkspaceLocale } from '../localization/workspaceLocaleTypes';
import { APP_GUIDE_APP_STEP_COUNT, APP_GUIDE_INTERFACE_COPY, appGuideAvailabilityCopy, appGuideSteps } from './appGuideCatalog';
import {
  appGuideAnchorSelector,
  appGuideAnchorStep,
} from './appGuideAnchors';
import { positionGuidePopover, type GuidePopoverPosition } from './appGuidePopoverLayout';
import { isAppGuideAnchorAvailable } from './appGuideAnchorAvailability';
import {
  appGuideTargetKey,
  isAppGuideStepReady,
  readAppGuideProgress,
  saveAppGuideProgress,
  saveAppGuideProgressBeforeClose,
  type AppGuideProgress,
  type AppGuideTarget,
} from './AppGuidePanel';
import './AppGuidePopover.css';

interface AppGuidePopoverProps {
  readonly locale: WorkspaceLocale;
  readonly target: AppGuideTarget;
  readonly currentAppKind: OpenCoreAppKind | null;
  readonly onOpenApp: (kind: OpenCoreAppKind) => void;
  readonly onClose: () => void;
}

function stepCount(target: AppGuideTarget): number {
  // App-Rundgänge erklären sieben Punkte; der verbundene Grid→Writer-Fluss behält seine sechs Schritte.
  return target.type === 'app' ? APP_GUIDE_APP_STEP_COUNT : 6;
}

export function appGuidePersistenceWarning(locale: WorkspaceLocale): string {
  switch (locale) {
    case 'de-DE': return 'Der Fortschritt konnte nicht gespeichert werden. Du kannst es erneut versuchen oder den Rundgang ohne gespeicherten Status schließen.';
    case 'es-ES': return 'No se pudo guardar el progreso. Puedes reintentarlo o cerrar la guía sin guardar el estado.';
    case 'it-IT': return 'Impossibile salvare i progressi. Puoi riprovare o chiudere la guida senza salvare lo stato.';
    case 'ja-JP': return '進行状況を保存できませんでした。再試行するか、保存せずにガイドを閉じてください。';
    case 'ru-RU': return 'Не удалось сохранить прогресс. Повторите попытку или закройте обзор без сохранения состояния.';
    case 'zh-CN': return '无法保存进度。你可以重试，或在不保存状态的情况下关闭指南。';
    case 'en-US': return 'Guide progress could not be saved. Retry or close the guide without saving its state.';
  }
}

interface AppGuidePersistenceWarningProps {
  readonly message: string;
  readonly closeLabel: string;
  readonly onClose: () => void;
}

export const AppGuidePersistenceWarning: React.FC<AppGuidePersistenceWarningProps> = ({ message, closeLabel, onClose }) => (
  <div role="status" className="vgt-app-guide-popover__warning">
    <span>{message}</span>
    <button type="button" onClick={onClose}>{closeLabel}</button>
  </div>
);

export const AppGuidePopover: React.FC<AppGuidePopoverProps> = ({
  locale,
  target,
  currentAppKind,
  onOpenApp,
  onClose,
}) => {
  const copy = APP_GUIDE_INTERFACE_COPY[locale];
  const headingId = useId();
  const descriptionId = useId();
  const popoverRef = useRef<HTMLElement | null>(null);
  const requestedAppRef = useRef<OpenCoreAppKind | null>(null);
  const [progress, setProgress] = useState<AppGuideProgress>(() => readAppGuideProgress(target));
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [position, setPosition] = useState<GuidePopoverPosition | null>(null);
  const [confirmingOptOut, setConfirmingOptOut] = useState(false);
  const [persistenceWarning, setPersistenceWarning] = useState(false);
  const activeIndex = Math.min(progress.stepIndex, stepCount(target) - 1);
  const stepConfirmed = progress.confirmedSteps.includes(activeIndex);
  const activeAnchor = appGuideAnchorStep(target, activeIndex);
  /**
   * Die Schritte 3–7 eines App-Rundgangs erklären Funktionen, für die es kein einzelnes
   * Coachmark-Steuerelement gibt. Sie sind bewusst **ohne** Anker: Der Popover markiert dort kein fremdes
   * Steuerelement und verlangt für das Weitergehen nur die Bestätigung des Schritts.
   */
  const explanationOnly = activeAnchor === null;
  const canAdvance = isAppGuideStepReady(stepConfirmed, explanationOnly || anchor !== null);
  const activeAppKind = activeAnchor?.app ?? (target.type === 'app' ? target.kind : null);
  const progressLabel = `${copy.step} ${copy.progress(activeIndex + 1, stepCount(target))}`;
  const appName = activeAppKind
    ? APP_CATALOG.find((entry) => entry.kind === activeAppKind)?.name ?? activeAppKind
    : '';
  const appSteps = target.type === 'app' ? appGuideSteps(locale, target.kind) : null;
  const activeAppStep = appSteps?.[activeIndex] ?? null;
  const availability = target.type === 'app' ? appGuideAvailabilityCopy(target.kind, locale) : null;
  const title = target.type === 'connected-workspace'
    ? copy.connectedSteps[activeIndex]?.title ?? copy.connectedTitle
    : activeAppStep?.title ?? copy.stepTitles[Math.min(activeIndex, 1)] ?? copy.stepTitles[0];
  const description = target.type === 'connected-workspace'
    ? copy.connectedSteps[activeIndex]?.description ?? copy.connectedDescription
    : activeAppStep?.description ?? '';

  useLayoutEffect(() => {
    setProgress(readAppGuideProgress(target));
    setAnchor(null);
    setPosition(null);
    setConfirmingOptOut(false);
    setPersistenceWarning(false);
  }, [appGuideTargetKey(target)]);

  useEffect(() => {
    if (activeAppKind === null) return;
    if (currentAppKind === activeAppKind) {
      requestedAppRef.current = null;
      return;
    }
    if (requestedAppRef.current !== activeAppKind) {
      requestedAppRef.current = activeAppKind;
      onOpenApp(activeAppKind);
    }
  }, [activeAppKind, currentAppKind, onOpenApp]);

  const activeAnchorId = activeAnchor?.id ?? null;
  useLayoutEffect(() => {
    // Erklärende Schritte (3–7) haben keinen Anker: kein Observer, kein Polling, kein Highlight.
    if (activeAnchorId === null) {
      setAnchor(null);
      setPosition(null);
      return;
    }
    let disposed = false;
    let observer: MutationObserver | null = null;
    let pollTimer: number | null = null;
    let pollAttempts = 0;
    const selector = appGuideAnchorSelector(activeAnchorId);
    const stopPolling = () => {
      if (pollTimer === null) return;
      window.clearInterval(pollTimer);
      pollTimer = null;
    };
    const startPolling = () => {
      if (pollTimer !== null) return;
      pollAttempts = 0;
      pollTimer = window.setInterval(() => {
        pollAttempts += 1;
        findAnchor();
        if (pollAttempts >= 40) stopPolling();
      }, 250);
    };
    const findAnchor = () => {
      if (disposed) return;
      const candidate = Array.from(document.querySelectorAll<HTMLElement>(selector)).find((element) => {
        const hasLayout = element.getClientRects().length > 0;
        let visible = hasLayout;
        for (let ancestor: HTMLElement | null = element; visible && ancestor; ancestor = ancestor.parentElement) {
          const style = window.getComputedStyle(ancestor);
          const opacity = Number(style.opacity);
          visible = style.display !== 'none'
            && style.visibility !== 'hidden'
            && style.visibility !== 'collapse'
            && Number.isFinite(opacity)
            && opacity > 0;
        }
        const enabled = !element.matches(':disabled')
          && element.getAttribute('aria-disabled') !== 'true'
          && !element.closest('[aria-disabled="true"]');
        const exposed = !element.closest('[aria-hidden="true"]');
        return isAppGuideAnchorAvailable({
          hasLayout,
          visible,
          enabled,
          exposed,
        });
      });
      if (candidate) {
        stopPolling();
        setAnchor(candidate);
        candidate.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
        return;
      }
      setAnchor(null);
      startPolling();
    };

    findAnchor();
    if (typeof MutationObserver !== 'undefined') {
      observer = new MutationObserver(findAnchor);
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['hidden', 'aria-hidden', 'aria-disabled', 'disabled', 'data-vgt-app-guide-anchor'],
      });
    } else {
      pollTimer = window.setInterval(findAnchor, 250);
    }
    return () => {
      disposed = true;
      observer?.disconnect();
      stopPolling();
    };
  }, [activeAnchorId]);

  useEffect(() => {
    if (!anchor) return;
    const previousValue = anchor.getAttribute('data-vgt-app-guide-highlighted');
    const previousDescription = anchor.getAttribute('aria-describedby');
    anchor.setAttribute('data-vgt-app-guide-highlighted', 'true');
    const descriptions = new Set((previousDescription ?? '').split(/\s+/u).filter(Boolean));
    descriptions.add(descriptionId);
    anchor.setAttribute('aria-describedby', [...descriptions].join(' '));
    return () => {
      if (previousValue === null) anchor.removeAttribute('data-vgt-app-guide-highlighted');
      else anchor.setAttribute('data-vgt-app-guide-highlighted', previousValue);
      if (previousDescription === null) anchor.removeAttribute('aria-describedby');
      else anchor.setAttribute('aria-describedby', previousDescription);
    };
  }, [anchor, descriptionId]);

  useLayoutEffect(() => {
    if (!anchor || !popoverRef.current) {
      setPosition(null);
      return;
    }
    const panel = popoverRef.current;
    let frame: number | null = null;
    const requestFrame = (callback: FrameRequestCallback): number => (
      typeof window.requestAnimationFrame === 'function'
        ? window.requestAnimationFrame(callback)
        : window.setTimeout(() => callback(Date.now()), 16)
    );
    const cancelFrame = (handle: number) => {
      if (typeof window.cancelAnimationFrame === 'function') window.cancelAnimationFrame(handle);
      else window.clearTimeout(handle);
    };
    const measure = () => {
      if (frame !== null) cancelFrame(frame);
      frame = requestFrame(() => {
        const nextPosition = positionGuidePopover(
          anchor.getBoundingClientRect(),
          panel.getBoundingClientRect(),
          { width: window.innerWidth, height: window.innerHeight },
        );
        setPosition(nextPosition);
      });
    };
    measure();
    window.addEventListener('resize', measure);
    document.addEventListener('scroll', measure, true);
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    resizeObserver?.observe(anchor);
    resizeObserver?.observe(panel);
    return () => {
      if (frame !== null) cancelFrame(frame);
      window.removeEventListener('resize', measure);
      document.removeEventListener('scroll', measure, true);
      resizeObserver?.disconnect();
    };
  }, [anchor, activeIndex, description, locale]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const save = (next: AppGuideProgress, keepInMemoryOnFailure = true): boolean => {
    const persisted = saveAppGuideProgress(target, next);
    if (persisted || keepInMemoryOnFailure) setProgress(next);
    setPersistenceWarning(!persisted);
    return persisted;
  };

  const saveBeforeClose = (next: AppGuideProgress): boolean => {
    const persisted = saveAppGuideProgressBeforeClose(target, next, onClose);
    if (persisted) setProgress(next);
    setPersistenceWarning(!persisted);
    return persisted;
  };

  const advance = () => {
    if (!canAdvance) return;
    if (activeIndex + 1 >= stepCount(target)) {
      saveBeforeClose({ ...progress, stepIndex: activeIndex, completed: true, skipped: false });
      return;
    }
    save({ ...progress, stepIndex: activeIndex + 1, completed: false, skipped: false });
  };

  const goBack = () => {
    if (activeIndex > 0) save({ ...progress, stepIndex: activeIndex - 1, completed: false, skipped: false });
  };

  const confirmStep = (confirmed: boolean) => {
    const confirmedSteps = new Set(progress.confirmedSteps);
    if (confirmed) confirmedSteps.add(activeIndex);
    else confirmedSteps.delete(activeIndex);
    save({
      ...progress,
      completed: false,
      skipped: false,
      confirmedSteps: [...confirmedSteps].sort((left, right) => left - right),
    });
  };

  const skip = () => {
    saveBeforeClose({ ...progress, skipped: true });
  };

  const confirmOptOut = () => {
    if (saveBeforeClose({ ...progress, optedOut: true })) setConfirmingOptOut(false);
  };

  const style: CSSProperties = position
    ? { left: position.left, top: position.top, width: position.width }
    : { left: 12, top: 12, width: 'min(368px, calc(100vw - 24px))' };

  return (
    <section
      ref={popoverRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby={headingId}
      aria-describedby={descriptionId}
      className="vgt-app-guide-popover"
      style={style}
      data-placement={position?.placement ?? 'below'}
      data-guide-target={appGuideTargetKey(target)}
    >
      <div className="vgt-app-guide-popover__eyebrow">
        <span>{copy.guideLabel}</span>
        <span>{progressLabel}</span>
      </div>
      <div className="vgt-app-guide-popover__progress" role="progressbar" aria-label={progressLabel} aria-valuemin={1} aria-valuemax={stepCount(target)} aria-valuenow={activeIndex + 1}>
        <span style={{ width: `${((activeIndex + 1) / stepCount(target)) * 100}%` }} />
      </div>
      <h2 id={headingId} className="vgt-app-guide-popover__title">{title}</h2>
      {availability && (
        <div className="vgt-app-guide-popover__availability" data-guide-availability={availability.className}>
          <span
            title={availability.reason}
            className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase tracking-[0.08em] ${availability.className === 'alpha'
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
              : 'border-amber-500/40 bg-amber-500/10 text-amber-200'}`}
          >
            {availability.label}
          </span>
          <span data-guide-availability-hint="true">{availability.hint}</span>
        </div>
      )}
      <p id={descriptionId} className="vgt-app-guide-popover__description">{description}</p>
      {explanationOnly ? (
        <p role="status" data-guide-explanation-step="true" className="vgt-app-guide-popover__target">{copy.explanationStep}</p>
      ) : anchor ? (
        <p className="vgt-app-guide-popover__target">{appName}</p>
      ) : (
        <div role="status" className="vgt-app-guide-popover__target-warning">
          <span>{copy.openApp}: {appName}. {copy.targetUnavailable}</span>
          <button type="button" onClick={() => activeAppKind && onOpenApp(activeAppKind)}>{copy.openApp}</button>
        </div>
      )}
      <label className="vgt-app-guide-popover__action-confirmation">
        <input type="checkbox" checked={stepConfirmed} onChange={(event) => confirmStep(event.currentTarget.checked)} />
        <span>{copy.confirmStep}</span>
      </label>
      {confirmingOptOut ? (
        <div role="group" aria-label={copy.optOut} className="vgt-app-guide-popover__confirmation">
          <p>{copy.optOut}?</p>
          <div>
            <button type="button" className="vgt-app-guide-popover__primary" onClick={confirmOptOut}>{copy.confirm}</button>
            <button type="button" className="vgt-app-guide-popover__secondary" onClick={() => setConfirmingOptOut(false)}>{copy.cancel}</button>
          </div>
        </div>
      ) : (
        <footer className="vgt-app-guide-popover__footer">
          <div className="vgt-app-guide-popover__actions">
            <button type="button" className="vgt-app-guide-popover__secondary" disabled={activeIndex === 0} onClick={goBack}>{copy.previous}</button>
            <button type="button" className="vgt-app-guide-popover__primary" disabled={!canAdvance} onClick={advance}>{activeIndex + 1 === stepCount(target) ? copy.finish : copy.next}</button>
            <button type="button" className="vgt-app-guide-popover__secondary" onClick={skip}>{copy.skip}</button>
          </div>
          <button type="button" className="vgt-app-guide-popover__optout" aria-pressed={progress.optedOut} onClick={() => setConfirmingOptOut(true)}>{copy.optOut}</button>
        </footer>
      )}
      {persistenceWarning && (
        <AppGuidePersistenceWarning message={appGuidePersistenceWarning(locale)} closeLabel={copy.close} onClose={onClose} />
      )}
    </section>
  );
};
