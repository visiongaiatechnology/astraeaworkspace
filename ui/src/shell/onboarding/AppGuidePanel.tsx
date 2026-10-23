// STATUS: GOLD — typed, localized, accessible guide panel; runtime integration is owned by the shell.
import React, { useEffect, useId, useRef, useState } from 'react';
import { OPEN_CORE_APP_KINDS, type OpenCoreAppKind } from '../../edition/contracts';
import { APP_CATALOG } from '../../edition/catalog';
import type { WorkspaceLocale } from '../localization/workspaceLocaleTypes';
import { shellSurfaceCopy } from '../i18n/shellSurfaceLocale';
import { browserShellStorage, safeParse, safeStorageGet, safeStorageSet } from '../platform/workspaceShellPlatformStorage';
import { APP_GUIDE_CATALOG, APP_GUIDE_INTERFACE_COPY, APP_GUIDE_APP_STEP_COUNT, appGuideAvailabilityCopy, appGuideSteps, type ConnectedWorkspaceStepCopy } from './appGuideCatalog';

const GUIDE_STORAGE_PREFIX = 'astraea.shell.onboarding-guide.v1:';
const GUIDE_STATE_VERSION = 2;

export type AppGuideTarget =
  | { readonly type: 'app'; readonly kind: OpenCoreAppKind }
  | { readonly type: 'connected-workspace' };

export interface AppGuideProgress {
  readonly stepIndex: number;
  readonly completed: boolean;
  readonly skipped: boolean;
  readonly optedOut: boolean;
  readonly autoShown: boolean;
  readonly confirmedSteps: readonly number[];
}

interface PersistedAppGuideProgressV1 extends Omit<AppGuideProgress, 'confirmedSteps'> { readonly version: 1; }
interface PersistedAppGuideProgressV2 extends AppGuideProgress { readonly version: 2; }
type PersistedAppGuideProgress = PersistedAppGuideProgressV1 | PersistedAppGuideProgressV2;

function isConfirmedSteps(value: unknown, stepCount: number): value is number[] {
  if (!Array.isArray(value) || value.length > stepCount) return false;
  const seen = new Set<number>();
  for (const step of value) {
    if (typeof step !== 'number' || !Number.isSafeInteger(step) || step < 0 || step >= stepCount || seen.has(step)) return false;
    seen.add(step);
  }
  return true;
}

export interface AppGuidePanelProps {
  readonly locale: WorkspaceLocale;
  readonly target: AppGuideTarget;
  /** Selects the requested app; the shell may create a document when none exists. */
  readonly onOpenApp: (kind: OpenCoreAppKind) => void;
  readonly onClose: () => void;
  readonly onStartInteractive?: (target: AppGuideTarget) => void;
}

export interface AppGuideLibraryProps {
  readonly open: boolean;
  readonly locale: WorkspaceLocale;
  readonly initialKind?: OpenCoreAppKind;
  readonly onOpenApp: (kind: OpenCoreAppKind) => void;
  readonly onClose: () => void;
  readonly onOpenSetup?: () => void;
  readonly onStartInteractive?: (target: AppGuideTarget) => void;
}

const DEFAULT_PROGRESS: AppGuideProgress = {
  stepIndex: 0,
  completed: false,
  skipped: false,
  optedOut: false,
  autoShown: false,
  confirmedSteps: [],
};

export const APP_GUIDE_KINDS: readonly OpenCoreAppKind[] = OPEN_CORE_APP_KINDS;

/** Runtime guard for values such as persisted DocumentKind or route parameters. */
export function isOpenCoreAppGuideKind(value: unknown): value is OpenCoreAppKind {
  return typeof value === 'string' && OPEN_CORE_APP_KINDS.some((kind) => kind === value);
}

export function appGuideTargetKey(target: AppGuideTarget): string {
  return target.type === 'app' ? `app:${target.kind}` : 'connected-workspace:grid-writer';
}

function guideStepCount(target: AppGuideTarget): number {
  // App-Rundgänge erklären mindestens sieben Punkte; der verbundene Grid→Writer-Fluss bleibt bei sechs.
  return target.type === 'app' ? APP_GUIDE_APP_STEP_COUNT : 6;
}

function isProgressRecord(value: unknown, stepCount: number): value is PersistedAppGuideProgress {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const validBase = (record.version === 1 || record.version === GUIDE_STATE_VERSION)
    && Number.isSafeInteger(record.stepIndex)
    && typeof record.stepIndex === 'number'
    && record.stepIndex >= 0
    && record.stepIndex < stepCount
    && typeof record.completed === 'boolean'
    && typeof record.skipped === 'boolean'
    && typeof record.optedOut === 'boolean'
    && (record.autoShown === undefined || typeof record.autoShown === 'boolean');
  if (!validBase) return false;
  return record.version === 1 || isConfirmedSteps(record.confirmedSteps, stepCount);
}

function readProgressForKey(key: string, stepCount: number): AppGuideProgress {
  const storage = browserShellStorage();
  const parsed = safeParse(safeStorageGet(storage, `${GUIDE_STORAGE_PREFIX}${key}`));
  if (!isProgressRecord(parsed, stepCount)) return DEFAULT_PROGRESS;
  return {
    stepIndex: parsed.stepIndex,
    completed: parsed.completed,
    skipped: parsed.skipped,
    optedOut: parsed.optedOut,
    autoShown: parsed.autoShown === true,
    confirmedSteps: parsed.version === 2 ? [...parsed.confirmedSteps] : [],
  };
}

export function readAppGuideProgress(target: AppGuideTarget): AppGuideProgress {
  return readProgressForKey(appGuideTargetKey(target), guideStepCount(target));
}

/** Returns whether an automatic first-run presentation is still appropriate. */
export function shouldAutoShowAppGuide(target: AppGuideTarget): boolean {
  const progress = readAppGuideProgress(target);
  return !progress.completed && !progress.skipped && !progress.optedOut && !progress.autoShown;
}

function persistAppGuideProgress(target: AppGuideTarget, progress: AppGuideProgress): boolean {
  const payload = JSON.stringify({ version: GUIDE_STATE_VERSION, ...progress });
  return safeStorageSet(browserShellStorage(), `${GUIDE_STORAGE_PREFIX}${appGuideTargetKey(target)}`, payload);
}

export function saveAppGuideProgress(target: AppGuideTarget, progress: AppGuideProgress): boolean {
  return persistAppGuideProgress(target, progress);
}

/** Closes the guide only after its requested terminal state was persisted. */
export function saveAppGuideProgressBeforeClose(
  target: AppGuideTarget,
  progress: AppGuideProgress,
  onClose: () => void,
): boolean {
  if (!saveAppGuideProgress(target, progress)) return false;
  onClose();
  return true;
}

export function isAppGuideStepReady(stepConfirmed: boolean, anchorVisible: boolean): boolean {
  return stepConfirmed && anchorVisible;
}

/** Records the first automatic presentation; replay remains available through Help & guides. */
export function markAppGuideAutoShown(target: AppGuideTarget): boolean {
  return persistAppGuideProgress(target, { ...readAppGuideProgress(target), autoShown: true });
}

function connectedStep(locale: WorkspaceLocale, index: number): ConnectedWorkspaceStepCopy {
  const steps = APP_GUIDE_INTERFACE_COPY[locale].connectedSteps;
  return steps[index] ?? steps[0];
}

export const AppGuidePanel: React.FC<AppGuidePanelProps> = ({ locale, target, onOpenApp, onClose, onStartInteractive }) => {
  const copy = APP_GUIDE_INTERFACE_COPY[locale];
  const headingId = useId();
  const targetKey = appGuideTargetKey(target);
  const totalSteps = guideStepCount(target);
  const [progress, setProgress] = useState<AppGuideProgress>(() => readAppGuideProgress(target));
  const [persistenceWarning, setPersistenceWarning] = useState(false);
  const [confirmingOptOut, setConfirmingOptOut] = useState(false);

  useEffect(() => {
    setProgress(readProgressForKey(targetKey, totalSteps));
    setPersistenceWarning(false);
  }, [targetKey, totalSteps]);

  const saveProgress = (next: AppGuideProgress) => {
    setProgress(next);
    setPersistenceWarning(!persistAppGuideProgress(target, next));
  };

  const activeIndex = Math.min(progress.stepIndex, totalSteps - 1);
  const appKind = target.type === 'app'
    ? target.kind
    : connectedStep(locale, activeIndex).app;
  const appName = APP_CATALOG.find((entry) => entry.kind === appKind)?.name ?? `Astraea ${appKind}`;
  const title = target.type === 'app' ? `${appName} · ${copy.guideLabel}` : copy.connectedTitle;
  const description = target.type === 'connected-workspace' ? copy.connectedDescription : null;
  const connectedContent = target.type === 'connected-workspace' ? connectedStep(locale, activeIndex) : null;
  const appContent = target.type === 'app' ? APP_GUIDE_CATALOG[locale][target.kind] : null;
  /** Die sieben erklärten Punkte des App-Rundgangs (Titel + Beschreibung je Schritt). */
  const appSteps = target.type === 'app' ? appGuideSteps(locale, target.kind) : null;
  const activeAppStep = appSteps?.[activeIndex] ?? null;
  const availability = target.type === 'app' ? appGuideAvailabilityCopy(target.kind, locale) : null;
  const stepTitle = connectedContent?.title
    ?? activeAppStep?.title
    ?? copy.stepTitles[activeIndex] ?? copy.stepTitles[0];
  const stepDescription = connectedContent?.description
    ?? activeAppStep?.description
    ?? (activeIndex === 0 ? appContent?.firstAction : appContent?.followUp)
    ?? appContent?.firstAction
    ?? '';
  const progressLabel = `${copy.step} ${copy.progress(activeIndex + 1, totalSteps)}`;

  const goToStep = (stepIndex: number) => {
    if (!Number.isSafeInteger(stepIndex) || stepIndex < 0 || stepIndex >= totalSteps) return;
    saveProgress({ ...progress, stepIndex, completed: false, skipped: false });
  };

  const finishGuide = () => {
    // Reading the help panel must not count as completing interactive control actions.
    onClose();
  };

  const skipGuide = () => {
    saveProgress({ ...progress, skipped: true });
    onClose();
  };

  const replayGuide = () => {
    saveProgress({ ...DEFAULT_PROGRESS });
  };

  return (
    <section
      aria-labelledby={headingId}
      className="overflow-hidden rounded-lg border border-[color:var(--vgt-metal-edge)] bg-[var(--vgt-surface-z1)] text-[var(--vgt-text-primary)]"
      data-guide-target={targetKey}
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[color:var(--vgt-metal-edge)] px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--vgt-accent-strong)]">{copy.guideLabel}</p>
          <h2 id={headingId} className="mt-1 text-lg font-semibold leading-snug">{title}</h2>
          {availability && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span
                data-guide-availability={availability.className}
                title={availability.reason}
                className={`inline-flex items-center rounded border px-2 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] ${availability.className === 'alpha'
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                  : 'border-amber-500/40 bg-amber-500/10 text-amber-200'}`}
              >
                {availability.label}
              </span>
              <span data-guide-availability-hint="true" className="text-xs leading-relaxed text-[var(--vgt-text-secondary)]">{availability.hint}</span>
            </div>
          )}
          {description && <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--vgt-text-secondary)]">{description}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-3 py-2 text-sm text-[var(--vgt-text-secondary)] hover:bg-[var(--vgt-control-surface)] hover:text-[var(--vgt-text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vgt-accent-strong)]"
        >
          {copy.close}
        </button>
      </div>

      <div className="space-y-4 px-5 py-4 sm:px-6">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3 text-xs text-[var(--vgt-text-secondary)]">
            <span>{progressLabel}</span>
          </div>
          <div
            role="progressbar"
            aria-label={progressLabel}
            aria-valuemin={1}
            aria-valuemax={totalSteps}
            aria-valuenow={activeIndex + 1}
            className="h-1.5 overflow-hidden rounded-full bg-[var(--vgt-control-surface)]"
          >
            <div
              className="h-full rounded-full bg-[var(--vgt-accent-strong)]"
              style={{ width: `${((activeIndex + 1) / totalSteps) * 100}%` }}
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
          <div aria-live="polite" aria-atomic="true" className="min-w-0">
            <h3 className="text-base font-semibold leading-snug">{stepTitle}</h3>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--vgt-text-secondary)]">{stepDescription}</p>
          </div>
          <button
            type="button"
            onClick={() => onOpenApp(appKind)}
            className="inline-flex min-h-10 items-center justify-center rounded-md border border-[color:var(--vgt-metal-edge)] bg-[var(--vgt-control-surface)] px-4 py-2 text-sm font-semibold text-[var(--vgt-text-primary)] hover:border-[color:var(--vgt-accent-strong)] hover:text-[var(--vgt-accent-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vgt-accent-strong)]"
          >
            {copy.openApp}: {appName}
          </button>
        </div>

        {onStartInteractive && (
          <button
            type="button"
            onClick={() => onStartInteractive(target)}
            className="min-h-10 rounded-md border border-[color:var(--vgt-accent-strong)] bg-[var(--vgt-accent-strong)]/10 px-3 py-2 text-sm font-semibold text-[var(--vgt-text-primary)] hover:bg-[var(--vgt-accent-strong)]/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vgt-accent-strong)]"
          >
            {copy.interactiveIntro}
          </button>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--vgt-metal-edge)] pt-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => goToStep(activeIndex - 1)}
              disabled={activeIndex === 0}
              className="min-h-10 rounded-md px-3 py-2 text-sm text-[var(--vgt-text-secondary)] hover:bg-[var(--vgt-control-surface)] hover:text-[var(--vgt-text-primary)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vgt-accent-strong)]"
            >
              {copy.previous}
            </button>
            {activeIndex + 1 < totalSteps ? (
              <button
                type="button"
                onClick={() => goToStep(activeIndex + 1)}
                className="min-h-10 rounded-md bg-[var(--vgt-accent-strong)] px-4 py-2 text-sm font-semibold text-[var(--vgt-on-accent)] hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vgt-accent-strong)] motion-reduce:transition-none"
              >
                {copy.next}
              </button>
            ) : (
              <button
                type="button"
                onClick={finishGuide}
                className="min-h-10 rounded-md bg-[var(--vgt-accent-strong)] px-4 py-2 text-sm font-semibold text-[var(--vgt-on-accent)] hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vgt-accent-strong)] motion-reduce:transition-none"
              >
                {copy.finish}
              </button>
            )}
            <button
              type="button"
              onClick={skipGuide}
              className="min-h-10 rounded-md px-3 py-2 text-sm text-[var(--vgt-text-secondary)] hover:bg-[var(--vgt-control-surface)] hover:text-[var(--vgt-text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vgt-accent-strong)]"
            >
              {copy.skip}
            </button>
          </div>
          <button
            type="button"
            onClick={replayGuide}
            className="min-h-10 rounded-md px-3 py-2 text-sm text-[var(--vgt-text-secondary)] underline decoration-[color:var(--vgt-metal-edge)] underline-offset-4 hover:text-[var(--vgt-text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vgt-accent-strong)]"
          >
            {copy.replay}
          </button>
        </div>

        <div className="border-t border-[color:var(--vgt-metal-edge)] pt-3">
          {!confirmingOptOut ? (
            <button
              type="button"
              aria-pressed={progress.optedOut}
              onClick={() => setConfirmingOptOut(true)}
              className="min-h-10 rounded-md px-3 py-2 text-left text-sm text-[var(--vgt-text-secondary)] underline decoration-[color:var(--vgt-metal-edge)] underline-offset-4 hover:text-[var(--vgt-text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vgt-accent-strong)]"
            >
              {copy.optOut}
            </button>
          ) : (
            <div role="group" aria-label={copy.optOut} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[color:var(--vgt-metal-edge)] bg-[var(--vgt-surface-z0)] p-3">
              <p className="text-sm text-[var(--vgt-text-secondary)]">{copy.optOut}?</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => { saveProgress({ ...progress, optedOut: true }); setConfirmingOptOut(false); }} className="min-h-9 rounded-md bg-[var(--vgt-accent-strong)] px-3 py-2 text-sm font-semibold text-[var(--vgt-on-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vgt-accent-strong)]">{copy.confirm}</button>
                <button type="button" onClick={() => setConfirmingOptOut(false)} className="min-h-9 rounded-md px-3 py-2 text-sm text-[var(--vgt-text-secondary)] hover:bg-[var(--vgt-control-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vgt-accent-strong)]">{copy.cancel}</button>
              </div>
            </div>
          )}
        </div>
        {persistenceWarning && (
          <p role="status" className="text-xs text-[var(--vgt-text-secondary)]">
            {locale === 'de-DE' ? 'Der Fortschritt konnte nicht gespeichert werden und wird beim Schließen zurückgesetzt.'
              : locale === 'es-ES' ? 'No se pudo guardar el progreso; se restablecerá al cerrar la guía.'
                : locale === 'it-IT' ? 'Impossibile salvare i progressi; verranno azzerati alla chiusura della guida.'
                  : locale === 'ja-JP' ? '進行状況を保存できませんでした。ガイドを閉じるとリセットされます。'
                    : locale === 'ru-RU' ? 'Не удалось сохранить прогресс; после закрытия обзора он будет сброшен.'
                      : locale === 'zh-CN' ? '无法保存进度；关闭指南后会重置。'
                        : 'Progress could not be saved and will reset when you close the guide.'}
          </p>
        )}
      </div>
    </section>
  );
};

/** Navigation library for replaying any Open Core app guide or the Grid→Writer flow. */
export const AppGuideLibrary: React.FC<AppGuideLibraryProps> = ({
  open,
  locale,
  initialKind = OPEN_CORE_APP_KINDS[0],
  onOpenApp,
  onClose,
  onOpenSetup,
  onStartInteractive,
}) => {
  const copy = APP_GUIDE_INTERFACE_COPY[locale];
  const moduleCopy = shellSurfaceCopy(locale).modules;
  const libraryHeadingId = useId();
  const lastOpen = useRef(false);
  const [target, setTarget] = useState<AppGuideTarget>(() => ({
    type: 'app',
    kind: isOpenCoreAppGuideKind(initialKind) ? initialKind : OPEN_CORE_APP_KINDS[0],
  }));

  useEffect(() => {
    if (open && !lastOpen.current) {
      setTarget({
        type: 'app',
        kind: isOpenCoreAppGuideKind(initialKind) ? initialKind : OPEN_CORE_APP_KINDS[0],
      });
    }
    lastOpen.current = open;
  }, [initialKind, open]);

  if (!open) return null;

  const selectApp = (kind: OpenCoreAppKind) => setTarget({ type: 'app', kind });
  const selectConnectedWorkspace = () => setTarget({ type: 'connected-workspace' });
  const openSetup = () => {
    onClose();
    onOpenSetup?.();
  };

  return (
    <section aria-labelledby={libraryHeadingId} className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--vgt-metal-edge)] pb-3">
        <h2 id={libraryHeadingId} className="text-lg font-semibold text-[var(--vgt-text-primary)]">{copy.libraryTitle}</h2>
        <div className="flex flex-wrap gap-2">
          {onOpenSetup && (
            <button
              type="button"
              onClick={openSetup}
              className="min-h-10 rounded-md border border-[color:var(--vgt-metal-edge)] px-3 py-2 text-sm text-[var(--vgt-text-primary)] hover:bg-[var(--vgt-control-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vgt-accent-strong)]"
            >
              {copy.openSetup}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="min-h-10 rounded-md px-3 py-2 text-sm text-[var(--vgt-text-secondary)] hover:bg-[var(--vgt-control-surface)] hover:text-[var(--vgt-text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vgt-accent-strong)]"
          >
            {APP_GUIDE_INTERFACE_COPY[locale].close}
          </button>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(13rem,16rem)_minmax(0,1fr)] lg:items-start">
        <nav aria-label={copy.libraryLabel} className="grid max-h-64 grid-cols-2 gap-1 overflow-y-auto rounded-md border border-[color:var(--vgt-metal-edge)] bg-[var(--vgt-surface-z1)] p-2 sm:grid-cols-3 lg:max-h-[70vh] lg:grid-cols-1">
          {OPEN_CORE_APP_KINDS.map((kind) => {
            const selected = target.type === 'app' && target.kind === kind;
            const availability = appGuideAvailabilityCopy(kind, locale);
            return (
              <button
                key={kind}
                type="button"
                onClick={() => selectApp(kind)}
                aria-current={selected ? 'page' : undefined}
                title={availability.reason}
                className={`min-h-10 rounded px-3 py-2 text-left text-sm leading-snug focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vgt-accent-strong)] ${selected ? 'bg-[var(--vgt-control-surface)] font-semibold text-[var(--vgt-text-primary)]' : 'text-[var(--vgt-text-secondary)] hover:bg-[var(--vgt-control-surface)] hover:text-[var(--vgt-text-primary)]'}`}
              >
                <span>{moduleCopy[kind].shortName}</span>
                <span className="ml-1 font-mono text-[0.7rem] text-[var(--vgt-text-muted)]">{kind}</span>
                <span
                  data-library-availability={availability.className}
                  className={`ml-1 inline-flex items-center rounded border px-1 py-0.5 text-[0.5625rem] font-semibold uppercase tracking-[0.06em] ${availability.className === 'alpha'
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                    : 'border-amber-500/40 bg-amber-500/10 text-amber-200'}`}
                >
                  {availability.label}
                </span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={selectConnectedWorkspace}
            aria-current={target.type === 'connected-workspace' ? 'page' : undefined}
            className={`min-h-10 rounded px-3 py-2 text-left text-sm leading-snug focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vgt-accent-strong)] ${target.type === 'connected-workspace' ? 'bg-[var(--vgt-control-surface)] font-semibold text-[var(--vgt-text-primary)]' : 'text-[var(--vgt-text-secondary)] hover:bg-[var(--vgt-control-surface)] hover:text-[var(--vgt-text-primary)]'}`}
          >
            {copy.connectedLabel}
          </button>
        </nav>

        <AppGuidePanel key={appGuideTargetKey(target)} locale={locale} target={target} onOpenApp={onOpenApp} onClose={onClose} onStartInteractive={onStartInteractive} />
      </div>
    </section>
  );
};
