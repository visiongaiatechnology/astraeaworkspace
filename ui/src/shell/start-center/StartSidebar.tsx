// STATUS: DIAMANT VGT SUPREME — Start Center primary-entry navigation without first-run app wall.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, FolderOpen, Clock3, RefreshCw, LayoutTemplate, ShieldCheck, Radio, FileDown, ChevronRight, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import type { DocumentKind } from '../../shared/contracts/workspace';
import { type StartCenterCategory } from './contracts/startCenterTypes';
import { AstraeaAppIcon } from '../../design-system/brand/AstraeaAppIcon';
import { useWorkspaceLocale } from '../localization/workspaceLocale';
import { browserShellStorage } from '../platform/workspaceShellPlatform';
import { shellSurfaceCopy } from '../i18n/shellSurfaceLocale';
import {
  loadStartSidebarPreference,
  saveStartSidebarPreference,
  START_SIDEBAR_COLLAPSED_WIDTH,
  START_SIDEBAR_MIN_WIDTH,
  START_SIDEBAR_MAX_WIDTH,
  subscribeToStartSidebarPreference,
} from './navigation/startSidebarPreference';

interface StartSidebarProps {
  activeCategory: StartCenterCategory;
  onSelectCategory: (category: StartCenterCategory) => void;
  onSelectModule: (kind: DocumentKind) => void;
  onOpenFileClick: () => void;
  onOpenVault: () => void;
  onExportDiagnostics: () => void;
}

const CATEGORIES: Array<{ id: StartCenterCategory }> = [
  { id: 'productivity' },
  { id: 'work' },
  { id: 'collaboration' },
  { id: 'platform' },
];

export const StartSidebar: React.FC<StartSidebarProps> = ({
  activeCategory,
  onSelectCategory,
  onSelectModule,
  onOpenFileClick,
  onOpenVault,
  onExportDiagnostics,
}) => {
  const { locale } = useWorkspaceLocale();
  const copy = shellSurfaceCopy(locale);
  const storage = useMemo(() => browserShellStorage(), []);
  const [preference, setPreference] = useState(() => loadStartSidebarPreference(storage));
  const dragStart = useRef<{ x: number; width: number } | null>(null);
  useEffect(() => {
    return subscribeToStartSidebarPreference(storage, setPreference);
  }, [storage]);
  useEffect(() => {
    try { saveStartSidebarPreference(storage, preference); } catch { /* local UI preference is optional */ }
  }, [preference, storage]);
  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (!dragStart.current || preference.collapsed) return;
      const next = Math.max(START_SIDEBAR_MIN_WIDTH, Math.min(START_SIDEBAR_MAX_WIDTH, dragStart.current.width + event.clientX - dragStart.current.x));
      setPreference((current) => ({ ...current, width: next }));
    };
    const up = () => { dragStart.current = null; };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [preference.collapsed]);
  const collapsed = preference.collapsed;
  const iconLabel = (label: string) => collapsed
    ? <span className="sr-only">{label}</span>
    : <span>{label}</span>;

  const activeNavigationClass = 'border border-[color:var(--vgt-metal-edge)] bg-[var(--vgt-accent-soft)] text-[var(--vgt-accent-strong)]';
  const inactiveNavigationClass = 'border border-transparent text-[var(--vgt-control-muted)] hover:bg-[var(--vgt-control-hover)] hover:text-[var(--vgt-control-text)]';

  return (
    <aside
      aria-label={copy.sidebar.navigation}
      data-sidebar-collapsed={collapsed}
      style={{ width: collapsed ? START_SIDEBAR_COLLAPSED_WIDTH : preference.width }}
      className="glass-panel relative flex shrink-0 flex-col justify-between overflow-hidden select-none transition-[width] duration-150"
    >
      <div>
        <div className={`border-b border-[color:var(--vgt-metal-edge)] ${collapsed ? 'p-2' : 'px-5 py-5'}`}>
          <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'}`}>
            <AstraeaAppIcon
              kind="Workspace"
              alt="Official Astraea Workspace logo"
              className={collapsed ? 'h-8 w-8' : 'h-10 w-10'}
            />
            {!collapsed && (
              <div className="min-w-0">
                <p className="text-sm font-semibold tracking-wide text-[var(--vgt-text-primary)]">Astraea Suite</p>
                <p className="mt-0.5 text-[10px] tracking-[0.08em] text-[var(--vgt-text-muted)]">{copy.sidebar.sovereigntyTagline}</p>
              </div>
            )}
          </div>
        </div>

        <nav className={`${collapsed ? 'p-1.5' : 'p-3'} space-y-1`} aria-label={copy.sidebar.primaryActions}>
          <button
            title={copy.sidebar.create}
            onClick={() => onSelectModule('Writer')}
            className={`vgt-button-primary flex w-full items-center ${collapsed ? 'justify-center px-1' : 'gap-2.5 px-3'} rounded-lg py-2.5 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--vgt-focus)]`}
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
            {iconLabel(copy.sidebar.create)}
          </button>
          <button
            title={copy.sidebar.open}
            onClick={onOpenFileClick}
            className={`flex w-full items-center ${collapsed ? 'justify-center px-1' : 'gap-2.5 px-3'} rounded-lg border border-transparent py-2 text-xs text-[var(--vgt-control-muted)] transition-colors hover:bg-[var(--vgt-control-hover)] hover:text-[var(--vgt-control-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--vgt-focus)]`}
          >
            <FolderOpen aria-hidden="true" className="h-4 w-4" />
            {iconLabel(copy.sidebar.open)}
          </button>
          <button
            title={copy.sidebar.recent}
            onClick={() => onSelectCategory('recent')}
            aria-current={activeCategory === 'recent' ? 'page' : undefined}
            className={`flex w-full items-center ${collapsed ? 'justify-center px-1' : 'gap-2.5 px-3'} rounded-lg py-2 text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--vgt-focus)] ${activeCategory === 'recent' ? activeNavigationClass : inactiveNavigationClass}`}
          >
            <Clock3 aria-hidden="true" className="h-4 w-4" />
            {iconLabel(copy.sidebar.recent)}
          </button>
          <button
            title={copy.sidebar.recovered}
            onClick={() => onSelectCategory('platform')}
            className={`flex w-full items-center ${collapsed ? 'justify-center px-1' : 'gap-2.5 px-3'} rounded-lg border border-transparent py-2 text-xs text-[var(--vgt-control-muted)] transition-colors hover:bg-[var(--vgt-control-hover)] hover:text-[var(--vgt-control-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--vgt-focus)]`}
          >
            <RefreshCw aria-hidden="true" className="h-4 w-4" />
            {iconLabel(copy.sidebar.recovered)}
          </button>
          <button
            title={copy.sidebar.templates}
            onClick={() => onSelectCategory('templates')}
            aria-current={activeCategory === 'templates' ? 'page' : undefined}
            className={`flex w-full items-center ${collapsed ? 'justify-center px-1' : 'gap-2.5 px-3'} rounded-lg py-2 text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--vgt-focus)] ${activeCategory === 'templates' ? activeNavigationClass : inactiveNavigationClass}`}
          >
            <LayoutTemplate aria-hidden="true" className="h-4 w-4" />
            {iconLabel(copy.sidebar.templates)}
          </button>
          <button
            title={copy.sidebar.vault}
            onClick={onOpenVault}
            className={`flex w-full items-center ${collapsed ? 'justify-center px-1' : 'gap-2.5 px-3'} rounded-lg border border-transparent py-2 text-xs text-[var(--vgt-control-muted)] transition-colors hover:bg-[var(--vgt-control-hover)] hover:text-[var(--vgt-control-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--vgt-focus)]`}
          >
            <AstraeaAppIcon kind="Vault" className="h-4 w-4" />
            {iconLabel(copy.sidebar.vault)}
          </button>
        </nav>

        {!collapsed && (
          <div className="mx-3 mt-3 space-y-1 border-t border-[color:var(--vgt-metal-edge)] px-1 pt-3">
            <p className="px-2 pb-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--vgt-text-muted)]">
              {copy.sidebar.appsByCategory}
            </p>
            {CATEGORIES.map((category) => {
              const isActive = activeCategory === category.id;
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => onSelectCategory(category.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--vgt-focus)] ${isActive ? activeNavigationClass : inactiveNavigationClass}`}
                >
                  <span>{copy.categoryLabels[category.id]}</span>
                  <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className={`${collapsed ? 'p-1.5' : 'p-4'} space-y-2 border-t border-[color:var(--vgt-metal-edge)]`}>
        {!collapsed && (
          <>
            <div className="flex items-center justify-between gap-2 text-[10px]">
              <span className="flex items-center gap-1.5 text-[var(--vgt-text-secondary)]">
                <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5 text-[var(--vgt-control-success)]" />
                {copy.sidebar.localFirstEngine}
              </span>
              <span className="font-mono text-[var(--vgt-text-muted)]">{copy.sidebar.cloud}</span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-[var(--vgt-text-muted)]">
              <Radio aria-hidden="true" className="h-3.5 w-3.5 text-[var(--vgt-control-info)]" />
              {copy.sidebar.netGateBound}
            </div>
            <button
              type="button"
              onClick={onExportDiagnostics}
              className="flex w-full items-center justify-center gap-1.5 border-t border-[color:var(--vgt-metal-edge)] pt-2 text-[10px] text-[var(--vgt-text-muted)] transition-colors hover:text-[var(--vgt-control-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--vgt-focus)]"
            >
              <FileDown aria-hidden="true" className="h-3 w-3" />
              {copy.sidebar.exportDiagnostics}
            </button>
          </>
        )}
        <button
          aria-label={collapsed ? copy.sidebar.expand : copy.sidebar.collapse}
          type="button"
          title={collapsed ? copy.sidebar.expand : copy.sidebar.collapse}
          onClick={() => setPreference((current) => ({ ...current, collapsed: !current.collapsed }))}
          className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg text-[var(--vgt-control-muted)] transition-colors hover:bg-[var(--vgt-control-hover)] hover:text-[var(--vgt-control-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--vgt-focus)]"
        >
          {collapsed ? <PanelLeftOpen aria-hidden="true" className="h-4 w-4" /> : <PanelLeftClose aria-hidden="true" className="h-4 w-4" />}
        </button>
      </div>

      {!collapsed && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={copy.sidebar.width}
          onPointerDown={(event) => {
            dragStart.current = { x: event.clientX, width: preference.width };
            event.currentTarget.setPointerCapture?.(event.pointerId);
          }}
          className="absolute right-0 top-0 h-full w-1 cursor-col-resize transition-colors hover:bg-[var(--vgt-metal-edge)]"
        />
      )}
    </aside>
  );
};
