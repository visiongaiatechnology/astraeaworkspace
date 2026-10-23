import React, { useState, useEffect, useMemo, useRef, useId } from 'react';
import type { DocumentKind } from '../../shared/contracts/workspace';
import type { EditionRegistry } from '../../edition/contracts';
import { releaseStatusDetail, releaseStatusLabel, releaseTierLegend, type ReleaseStatus } from '../../edition/releaseStatus';
import { useWorkspaceLocale, workspaceText } from '../localization/workspaceLocale';
import { AstraeaAppIcon } from '../../design-system/brand/AstraeaAppIcon';
import { X, Search, ArrowUpRight, LockKeyhole, ShieldCheck, ShieldAlert, PanelsTopLeft } from 'lucide-react';
import { formatShellNumber, shellSurfaceCopy } from '../i18n/shellSurfaceLocale';
import { ALL_APPS, type AppDefinition } from './appLauncherCatalog';

export interface AppLauncherDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  returnFocusTarget?: HTMLElement | null;
  onSelectApp: (kind: DocumentKind) => void;
  editionRegistry: EditionRegistry;
  onOpenStartCenter?: () => void;
  onOpenSearch?: () => void;
  onOpenExplorer?: () => void;
}

interface LocalizedAppDefinition extends AppDefinition {
  localizedName: string;
  localizedDescription: string;
  localizedCategory: string;
  releaseStatus: ReleaseStatus;
  releaseLabel: string;
  releaseDetail: string;
  /**
   * Im Code enthalten, aber für die Beta nicht freigegeben (Sicherheits-Gate). Der Launcher darf
   * daraus keinen aktiven Startknopf machen.
   */
  releaseBlocked: boolean;
}

const CATEGORIES: AppDefinition['category'][] = ['Office', 'Collaboration', 'Core Engine', 'Security', 'Admin'];

export const AppLauncherDrawer: React.FC<AppLauncherDrawerProps> = ({
  isOpen,
  onClose,
  returnFocusTarget,
  onSelectApp,
  editionRegistry,
  onOpenStartCenter,
  onOpenSearch,
  onOpenExplorer,
}) => {
  const { locale } = useWorkspaceLocale();
  const copy = shellSurfaceCopy(locale);
  const premiumAvailabilityLabel = workspaceText('edition.premiumRequired', locale);
  const premiumUnavailableMessage = workspaceText('edition.appUnavailable', locale);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [unavailableAppId, setUnavailableAppId] = useState<string | null>(null);
  const titleId = useId();
  const drawerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const editionApps = useMemo(() => ALL_APPS.map((app): LocalizedAppDefinition => {
    const shellCopy = app.action ? copy.launcher.shellApps[app.action] : undefined;
    const implemented = Boolean(app.kind && editionRegistry.isImplementedApp(app.kind));
    return {
      ...app,
      localizedName: shellCopy?.name ?? app.name,
      localizedDescription: app.kind ? copy.modules[app.kind].description : shellCopy?.description ?? app.description,
      localizedCategory: copy.launcher.categories[app.category],
      availability: app.kind && !implemented
        ? 'premium-required' as const
        : 'implemented' as const,
      // Shell-Ziele (Start-Center, Suche, Explorer) sind Kernfunktionen der Shell, keine App-Katalog-Einträge.
      releaseStatus: app.kind ? editionRegistry.getReleaseStatus(app.kind) : 'core-beta',
      releaseLabel: app.kind ? releaseStatusLabel(app.kind, locale) : '',
      releaseDetail: app.kind ? releaseStatusDetail(app.kind, locale) : '',
      releaseBlocked: implemented && Boolean(app.kind) && !editionRegistry.isCreationAvailable(app.kind),
    };
  }), [copy, editionRegistry, locale]);
  const closeDrawer = () => {
    const returnTarget = returnFocusTarget?.isConnected ? returnFocusTarget : returnFocusRef.current;
    setUnavailableAppId(null);
    onCloseRef.current();
    if (returnTarget?.isConnected) {
      window.requestAnimationFrame(() => {
        if (returnTarget.isConnected) returnTarget.focus({ preventScroll: true });
      });
    }
  };

  // Keep keyboard focus inside the modal drawer and return it to its launcher.
  useEffect(() => {
    if (!isOpen) return;

    const activeElement = document.activeElement;
    returnFocusRef.current = returnFocusTarget?.isConnected
      ? returnFocusTarget
      : activeElement instanceof HTMLElement ? activeElement : null;
    searchInputRef.current?.focus({ preventScroll: true });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeDrawer();
        return;
      }
      if (event.key !== 'Tab') return;

      const drawer = drawerRef.current;
      if (!drawer) return;
      const focusable = Array.from(drawer.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      )).filter((element) => {
        if (element.getAttribute('aria-hidden') === 'true') return false;
        const style = window.getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden';
      });

      if (!focusable.length) {
        event.preventDefault();
        drawer.focus({ preventScroll: true });
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const current = document.activeElement;
      if (event.shiftKey && (current === first || !drawer.contains(current))) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && (current === last || !drawer.contains(current))) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      const returnTarget = returnFocusRef.current;
      returnFocusRef.current = null;
      if (returnTarget?.isConnected) returnTarget.focus({ preventScroll: true });
    };
  }, [isOpen, returnFocusTarget]);

  // Filter apps
  const filteredApps = useMemo(() => {
    return editionApps.filter((app) => {
      const matchSearch =
        app.localizedName.toLocaleLowerCase(locale).includes(searchQuery.toLocaleLowerCase(locale)) ||
        app.localizedDescription.toLocaleLowerCase(locale).includes(searchQuery.toLocaleLowerCase(locale)) ||
        (app.ext?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false) ||
        app.localizedCategory.toLocaleLowerCase(locale).includes(searchQuery.toLocaleLowerCase(locale));

      const matchCategory =
        selectedCategory === 'all' ? true : app.category === selectedCategory;

      return matchSearch && matchCategory;
    });
  }, [editionApps, locale, searchQuery, selectedCategory]);

  const launch = (app: LocalizedAppDefinition) => {
    if (app.availability === 'premium-required') {
      setUnavailableAppId((current) => current === app.id ? null : app.id);
      return;
    }
    if (app.releaseBlocked) {
      // Kein Startknopf, der still nichts tut: der Grund wird an derselben Stelle benannt.
      setUnavailableAppId((current) => current === app.id ? null : app.id);
      return;
    }
    setUnavailableAppId(null);
    if (app.kind) onSelectApp(app.kind);
    else if (app.action === 'start-center') onOpenStartCenter?.();
    else if (app.action === 'search') onOpenSearch?.();
    else if (app.action === 'explorer') onOpenExplorer?.();
    closeDrawer();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-start select-none">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-md transition-opacity animate-in fade-in duration-200"
        onClick={closeDrawer}
      />

      {/* Slide-over Drawer Panel */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="glass-panel relative z-10 flex h-full w-full max-w-2xl flex-col border-r border-[var(--vgt-metal-edge)] bg-[var(--vgt-surface-z1)] shadow-2xl outline-none backdrop-blur-2xl animate-in slide-in-from-left duration-250 focus-visible:ring-2 focus-visible:ring-[var(--vgt-focus)]"
      >
        {/* Drawer Header */}
        <div className="border-b border-[var(--vgt-metal-edge)] bg-[var(--vgt-surface-z0)]/80 p-6 backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="relative w-10 h-10 shrink-0 flex items-center justify-center">
                <AstraeaAppIcon
                  kind="Workspace"
                  alt="Official Astraea Workspace logo"
                  glow
                  className="w-10 h-10 hover:scale-105 transition-transform"
                />
              </div>
              <div>
                <h2 id={titleId} className="flex items-center space-x-2 text-base font-bold text-[var(--vgt-text-primary)]">
                  <span>{copy.launcher.title}</span>
                  <span className="rounded-full border border-[var(--vgt-control-border)] bg-[var(--vgt-control-surface)] px-2 py-0.5 font-mono text-[10px] text-[var(--vgt-control-muted)]">
                    {formatShellNumber(locale, editionApps.length)} {copy.launcher.modules}
                  </span>
                </h2>
                <p className="text-xs text-[var(--vgt-text-muted)]">
                  {copy.launcher.description}
                </p>
                {/* Beta-Stufen sichtbar benennen — der Launcher zeigt Kernmodule und Vorschauen gemischt. */}
                <p data-release-legend="true" className="mt-1 text-[10px] leading-relaxed text-[var(--vgt-control-muted)]">
                  {releaseTierLegend(locale)}
                </p>
              </div>
            </div>

            <button
              onClick={closeDrawer}
              className="rounded-xl p-2 text-[var(--vgt-control-muted)] transition-colors hover:bg-[var(--vgt-control-hover)] hover:text-[var(--vgt-control-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vgt-focus)]"
              aria-label={copy.launcher.close} title={copy.launcher.close}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Search Bar */}
          <div className="mt-5 relative">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--vgt-accent-strong)]" />
            <input
              ref={searchInputRef}
              data-vgt-initial-focus="true"
              type="text"
              placeholder={copy.launcher.searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="vgt-input w-full rounded-xl py-2.5 pl-10 pr-4 text-xs shadow-inner transition-colors"
              autoFocus
            />
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center space-x-1.5 mt-4 overflow-x-auto pb-1 text-xs">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-all ${
                selectedCategory === 'all'
                  ? 'border border-[var(--vgt-metal-edge)] bg-[var(--vgt-accent-soft)] text-[var(--vgt-accent-strong)]'
                  : 'text-[var(--vgt-control-muted)] hover:bg-[var(--vgt-control-hover)] hover:text-[var(--vgt-control-text)]'
              }`}
            >
              {copy.launcher.allApplications} ({formatShellNumber(locale, editionApps.length)})
            </button>
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-all ${
                  selectedCategory === cat
                  ? 'border border-[var(--vgt-metal-edge)] bg-[var(--vgt-accent-soft)] text-[var(--vgt-accent-strong)]'
                  : 'text-[var(--vgt-control-muted)] hover:bg-[var(--vgt-control-hover)] hover:text-[var(--vgt-control-text)]'
                }`}
              >
                {copy.launcher.categories[cat]}
              </button>
            ))}
          </div>
        </div>

        {/* Drawer Body - Categorized Apps */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {selectedCategory === 'all' && !searchQuery ? (
            CATEGORIES.map((cat) => {
              const categoryApps = editionApps.filter((a) => a.category === cat);
              return (
                  <div key={cat} className="space-y-3">
                  <div className="flex items-center space-x-2 border-b border-[var(--vgt-metal-edge)] pb-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--vgt-text-secondary)]">
                      {copy.launcher.categories[cat]}
                    </h3>
                    <span className="font-mono text-[10px] text-[var(--vgt-text-muted)]">
                      ({categoryApps.length})
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {categoryApps.map((app) => (
                      <AppCard
                        key={app.id}
                        app={app}
                        premiumAvailabilityLabel={premiumAvailabilityLabel}
                        premiumUnavailableMessage={premiumUnavailableMessage}
                        showUnavailableMessage={unavailableAppId === app.id}
                        onLaunch={() => launch(app)}
                      />
                    ))}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredApps.length === 0 ? (
                <div className="col-span-2 rounded-2xl border border-dashed border-[var(--vgt-control-border)] py-12 text-center">
                  <Search className="mx-auto mb-2 h-8 w-8 text-[var(--vgt-control-muted)]" />
                  <p className="text-sm font-medium text-[var(--vgt-text-secondary)]">{copy.launcher.noResults}</p>
                  <p className="mt-1 text-xs text-[var(--vgt-text-muted)]">{copy.launcher.refineSearch}</p>
                </div>
              ) : (
                filteredApps.map((app) => (
                  <AppCard
                    key={app.id}
                    app={app}
                    premiumAvailabilityLabel={premiumAvailabilityLabel}
                    premiumUnavailableMessage={premiumUnavailableMessage}
                    showUnavailableMessage={unavailableAppId === app.id}
                    onLaunch={() => launch(app)}
                  />
                ))
              )}
            </div>
          )}
        </div>

        {/* Drawer Footer */}
        <div className="flex items-center justify-between border-t border-[var(--vgt-metal-edge)] bg-[var(--vgt-surface-z0)]/90 p-4 text-xs text-[var(--vgt-text-muted)]">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span className="font-mono text-[11px] text-emerald-300">
              {copy.launcher.footer}
            </span>
          </div>
          <span className="font-mono text-[11px] text-purple-400/50">VGT OS 2026.1</span>
        </div>
      </div>
    </div>
  );
};

interface AppCardProps {
  app: LocalizedAppDefinition;
  premiumAvailabilityLabel: string;
  premiumUnavailableMessage: string;
  showUnavailableMessage: boolean;
  onLaunch: () => void;
}

const AppCard: React.FC<AppCardProps> = ({ app, onLaunch, premiumAvailabilityLabel, premiumUnavailableMessage, showUnavailableMessage }) => {
  const premiumRequired = app.availability === 'premium-required';
  const releaseBlocked = !premiumRequired && app.releaseBlocked;
  const unavailable = premiumRequired || releaseBlocked;
  return (
    <button
      type="button"
      aria-label={`${app.localizedName}${app.ext ? ` · ${app.ext}` : ''}${premiumRequired ? ` · ${premiumAvailabilityLabel}` : releaseBlocked ? ` · ${app.releaseLabel}` : ''}`}
      aria-disabled={unavailable}
      data-availability={app.availability}
      data-release-status={app.kind ? app.releaseStatus : undefined}
      title={releaseBlocked ? app.releaseDetail : premiumRequired ? premiumUnavailableMessage : undefined}
      onClick={onLaunch}
      className={`glass-panel group relative flex w-full flex-col justify-between space-y-3 rounded-2xl border border-[var(--vgt-control-border)] p-4 text-left shadow-md transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vgt-focus)] ${unavailable ? 'cursor-not-allowed opacity-65' : 'hover:border-[var(--vgt-metal-edge)] hover:bg-[var(--vgt-control-hover)]'}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center space-x-3">
          <div
            className={`w-11 h-11 rounded-xl bg-gradient-to-br ${app.gradient} p-[1px] shadow-md group-hover:scale-105 transition-transform`}
          >
            <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-[11px] bg-[var(--vgt-surface-z1)]">
              {app.kind ? <AstraeaAppIcon kind={app.kind} alt="" className="w-10 h-10" /> : app.action === 'search' ? <Search className="h-5 w-5 text-indigo-200" /> : <PanelsTopLeft className="h-5 w-5 text-purple-200" />}
            </div>
          </div>
          <div>
            <h4 className="text-xs font-bold text-[var(--vgt-text-primary)] transition-colors group-hover:text-[var(--vgt-accent-strong)]">
              {app.localizedName}
            </h4>
            {app.ext && <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded border ${app.badgeBorder}`}>
              {app.ext}
            </span>}
          </div>
        </div>

        {premiumRequired ? (
          <span className="inline-flex items-center gap-1 rounded-md border border-[var(--vgt-control-border)] bg-[var(--vgt-control-surface)] px-2 py-1 text-[9px] font-semibold text-[var(--vgt-control-muted)]">
            <LockKeyhole aria-hidden="true" className="h-3 w-3" />
            {premiumAvailabilityLabel}
          </span>
        ) : releaseBlocked ? (
          <span className="inline-flex items-center gap-1 rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-[9px] font-semibold text-rose-200">
            <ShieldAlert aria-hidden="true" className="h-3 w-3" />
            {app.releaseLabel}
          </span>
        ) : (
        <div className="rounded-lg p-1 text-[var(--vgt-control-muted)] transition-all group-hover:bg-[var(--vgt-control-hover)] group-hover:text-[var(--vgt-accent-strong)]">
            <ArrowUpRight className="w-4 h-4" />
          </div>
        )}
      </div>

      <p className="line-clamp-2 text-[11px] leading-relaxed text-[var(--vgt-text-muted)]">
        {app.localizedDescription}
      </p>
      {/* Der Release-Status ist ein sichtbarer Teil jeder App-Karte, nicht nur ein Registry-Feld. */}
      {app.kind && !releaseBlocked && (
        <span
          data-release-badge={app.releaseStatus}
          title={app.releaseDetail}
          className={`inline-flex w-fit items-center gap-1 rounded-md border px-2 py-0.5 text-[9px] font-semibold ${
            app.releaseStatus === 'security-gate-approved'
              ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
              : 'border-[var(--vgt-control-border)] bg-[var(--vgt-control-surface)] text-[var(--vgt-control-muted)]'
          }`}
        >
          {app.releaseStatus === 'security-gate-approved' ? <ShieldAlert aria-hidden="true" className="h-3 w-3" /> : null}
          {app.releaseLabel}
        </span>
      )}
      {(premiumRequired || releaseBlocked) && showUnavailableMessage && (
        <span role="status" aria-live="polite" className="rounded-lg border border-[var(--vgt-control-border)] bg-[var(--vgt-surface-z1)] px-3 py-2 text-xs leading-relaxed text-[var(--vgt-text-secondary)]">
          {premiumRequired ? premiumUnavailableMessage : app.releaseDetail}
        </span>
      )}
    </button>
  );
};

export default AppLauncherDrawer;

