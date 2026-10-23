import React, { useEffect, useRef, useState } from 'react';
import { useWorkspaceLocale, workspaceText } from '../localization/workspaceLocale';
import { WORKSPACE_FILE_PICKER_ACCEPT } from '../../platform/containers/workspaceContainerBoundary';
import type { StartCenterProps, StartCenterCategory } from './contracts/startCenterTypes';
import { StartSidebar } from './StartSidebar';
import { StartTopBar } from './StartTopBar';
import { StartToolGrid, AppAvailabilityBadge } from './StartToolGrid';
import { StartTemplates } from './StartTemplates';
import { SupportOptions } from '../support/SupportOptions';
import { StartDiagnosticsPanel } from './StartDiagnosticsPanel';
import { StartRecentPanel } from './StartRecentPanel';
import { StartAppOverview } from './StartAppOverview';
import { ShellPlatformStatusPanel } from './ShellPlatformStatusPanel';
import { AstraeaAppIcon } from '../../design-system/brand/AstraeaAppIcon';
import type { DocumentKind } from '../../shared/contracts/workspace';
import type { BetaTemplateId } from '../../platform/templates/betaTemplates';
import { shellSurfaceCopy } from '../i18n/shellSurfaceLocale';
import { WorkspaceGuide, type WorkspaceGuideAction, workspaceGuideButtonLabel } from './WorkspaceGuide';

export const StartCenter: React.FC<StartCenterProps> = ({
  isOpen,
  editionRegistry,
  initialSearchQuery,
  onClose,
  onCreateDocument,
  onCreateTemplate,
  onOpenFile,
  onOpenVault,
  onOpenExplorer,
  recoverySnapshots,
  onRestoreRecovery,
  onDeleteRecovery,
  onExportDiagnostics,
  onOpenPlatformModal,
  documents,
  recentEntries,
  storedDocumentIds,
  metadataLocked,
  onOpenRecentDocument,
  shellAppearance,
  shellShortcuts,
  shellUpdateState,
  onShellAppearanceChange,
  onShellShortcutChange,
  onOpenNewWindow,
}) => {
  const { locale } = useWorkspaceLocale();
  const copy = shellSurfaceCopy(locale);
  const inputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<StartCenterCategory>('all');
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [guideStep, setGuideStep] = useState(0);

  useEffect(() => {
    if (!isOpen) {
      setIsGuideOpen(false);
      setGuideStep(0);
      return;
    }
    setSearchQuery((initialSearchQuery ?? '').slice(0, 4096));
    if (initialSearchQuery?.trim()) setActiveCategory('all');
  }, [initialSearchQuery, isOpen]);

  if (!isOpen) return null;

  const handleSelectModule = (kind: DocumentKind) => {
    onCreateDocument(kind);
    onClose();
  };

  const handleCreateTemplateWrapped = (templateId: BetaTemplateId) => {
    onCreateTemplate(templateId);
    onClose();
  };

  const handleOpenVaultWrapped = () => {
    onOpenVault();
    onClose();
  };

  const handleGuideAction = (action: WorkspaceGuideAction) => {
    setIsGuideOpen(false);
    switch (action) {
      case 'create-writer':
        handleSelectModule('Writer');
        break;
      case 'show-recent':
        setActiveCategory('recent');
        break;
      case 'open-explorer':
        if (onOpenExplorer) {
          onOpenExplorer();
          onClose();
        }
        break;
      case 'show-templates':
        setActiveCategory('templates');
        break;
      case 'show-recovery':
        setActiveCategory('platform');
        break;
      default: {
        const exhaustiveAction: never = action;
        return exhaustiveAction;
      }
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={copy.center.dialogLabel} className="fixed inset-0 z-50 flex select-none overflow-hidden bg-[var(--vgt-surface-z0)] text-[var(--vgt-text-primary)] animate-in fade-in duration-200">
      {/* Hidden native file input */}
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={WORKSPACE_FILE_PICKER_ACCEPT}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            onOpenFile(file);
            onClose();
          }
          event.target.value = '';
        }}
      />


      {/* 1. Left Sidebar with All Modules */}
      <StartSidebar
        activeCategory={activeCategory}
        onSelectCategory={(category) => { setActiveCategory(category); setIsGuideOpen(false); }}
        onSelectModule={handleSelectModule}
        onOpenFileClick={() => inputRef.current?.click()}
        onOpenVault={handleOpenVaultWrapped}
        onExportDiagnostics={onExportDiagnostics}
      />

      {/* 2. Main Work Area */}
      <div className="flex-1 flex flex-col min-w-0 relative z-10">
        <StartTopBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          activeCategory={activeCategory}
        onSelectCategory={(category) => { setActiveCategory(category); setIsGuideOpen(false); }}
          onClose={onClose}
        />

        <main className="custom-scrollbar min-h-0 flex-1 space-y-8 overflow-y-auto px-5 py-6 sm:px-7 lg:px-10 lg:py-8">
          {/* Editorial workspace identity: structure carries the brand, not decorative effects. */}
          <section className="relative border-y border-[color:var(--vgt-metal-edge)] py-7 md:py-10" aria-labelledby="astraea-start-title">
            <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-end">
              <div className="max-w-3xl border-l-2 border-[color:var(--vgt-metal-edge)] pl-5 md:pl-6">
                <p className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--vgt-text-muted)]">
                  <AstraeaAppIcon kind="Workspace" alt="Official Astraea Workspace logo" className="h-7 w-7 shrink-0" />
                  {copy.center.tagline}
                  <span
                    className="ml-2 inline-flex rounded border border-[var(--vgt-metal-edge)] bg-[var(--vgt-control-surface)] px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-[0.08em] text-[var(--vgt-control-muted)]"
                    aria-label={editionRegistry.edition === 'open-core' ? copy.center.editionOpenCore : copy.center.editionPremium}
                  >
                    {editionRegistry.edition === 'open-core' ? 'OPEN CORE' : 'PREMIUM'}
                  </span>
                </p>
                <h1 id="astraea-start-title" className="max-w-2xl text-2xl font-semibold tracking-[-0.025em] text-[var(--vgt-text-primary)] sm:text-3xl md:text-[34px] md:leading-[1.08]">
                  {copy.center.title}
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--vgt-text-secondary)]">
                  {copy.center.description}
                </p>
                <button
                  type="button"
                  aria-expanded={isGuideOpen}
                  onClick={() => { setIsGuideOpen((open) => !open); setGuideStep(0); }}
                  className="vgt-button-secondary mt-4 inline-flex items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--vgt-focus)]"
                >
                  {workspaceGuideButtonLabel(locale, isGuideOpen)}
                </button>
              </div>
              <dl className="grid grid-cols-3 gap-x-4 gap-y-2 border-t border-[color:var(--vgt-metal-edge)] pt-4 text-left lg:grid-cols-1 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                <div className="min-w-0">
                  <dt className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--vgt-text-muted)]">{copy.center.storage}</dt>
                  <dd className="mt-1 text-xs font-medium text-[var(--vgt-text-primary)]">{copy.center.storageValue}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--vgt-text-muted)]">{copy.center.network}</dt>
                  <dd className="mt-1 text-xs font-medium text-[var(--vgt-text-primary)]">{copy.center.networkValue}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--vgt-text-muted)]">{copy.center.workspace}</dt>
                  <dd className="mt-1 text-xs font-medium text-[var(--vgt-text-primary)]">{copy.center.workspaceValue}</dd>
                </div>
              </dl>
              {onOpenExplorer && (
                <button type="button" onClick={() => { onOpenExplorer(); onClose(); }} className="inline-flex w-fit items-center gap-2 rounded-lg border border-[var(--vgt-metal-edge)] bg-[var(--vgt-control-surface)] px-3 py-2 text-xs font-semibold text-[var(--vgt-text-primary)] shadow-[inset_0_1px_0_var(--vgt-metal-highlight)] transition-colors hover:border-[var(--vgt-accent)] hover:bg-[var(--vgt-control-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--vgt-focus)] lg:col-start-2 lg:justify-self-start">
                  <AstraeaAppIcon kind="Workspace" alt="" className="h-4 w-4" />
                  {workspaceText('explorer.open', locale)}
                </button>
              )}
            </div>
          </section>

          {isGuideOpen && (
            <div id="workspace-guide-panel">
              <WorkspaceGuide
                locale={locale}
                stepIndex={guideStep}
                onStepChange={setGuideStep}
                onRunAction={handleGuideAction}
                onClose={() => setIsGuideOpen(false)}
              />
            </div>
          )}

          {/*
            Alpha 0.1 first-start answer: directly after the hero and **before** the library metadata,
            the core Open Core apps with one honest sentence and one working action each. Hidden while
            the user searches or narrowed the sidebar, where the filtered library/tool grid answers.
          */}
          {activeCategory === 'all' && !searchQuery.trim() && (
            <StartAppOverview
              editionRegistry={editionRegistry}
              documents={documents}
              onOpenDocument={(documentId) => {
                onOpenRecentDocument(documentId);
                onClose();
              }}
              onCreateDocument={(kind) => {
                onCreateDocument(kind);
                onClose();
              }}
              // Same availability badge source as the tool grid (release-modules scope): the overview
              // inherits the honest ALPHA / IM AUSBAU classification instead of inventing its own.
              renderBadge={(kind) => <AppAvailabilityBadge kind={kind} />}
            />
          )}

          {/* Conditional Content by Category */}
          {activeCategory === 'templates' ? (
            <StartTemplates onCreateTemplate={handleCreateTemplateWrapped} editionRegistry={editionRegistry} />
          ) : activeCategory === 'recent' ? (
            <StartRecentPanel
              documents={documents}
              recentEntries={recentEntries}
              storedDocumentIds={storedDocumentIds}
              metadataLocked={metadataLocked}
              searchQuery={searchQuery}
              onOpenDocument={onOpenRecentDocument}
            />
          ) : activeCategory === 'platform' ? (
            <div className="space-y-5">
              <StartDiagnosticsPanel
                onOpenFileClick={() => inputRef.current?.click()}
                onOpenVault={handleOpenVaultWrapped}
                recoverySnapshots={recoverySnapshots}
                onRestoreRecovery={onRestoreRecovery}
                onDeleteRecovery={onDeleteRecovery}
                onExportDiagnostics={onExportDiagnostics}
                onOpenPlatformModal={onOpenPlatformModal}
              />
              <ShellPlatformStatusPanel
                edition={editionRegistry.edition}
                appearance={shellAppearance}
                shortcuts={shellShortcuts}
                updateState={shellUpdateState}
                documents={documents}
                onAppearanceChange={onShellAppearanceChange}
                onShortcutChange={onShellShortcutChange}
                onOpenNewWindow={onOpenNewWindow}
              />
            </div>
          ) : (
            <>
              {(activeCategory === 'all' || searchQuery.trim()) && (
                <StartRecentPanel
                  documents={documents}
                  recentEntries={recentEntries}
                  storedDocumentIds={storedDocumentIds}
                  metadataLocked={metadataLocked}
                  searchQuery={searchQuery}
                  onOpenDocument={onOpenRecentDocument}
                />
              )}

              {/* Module grid is explicit: first-start home is not a 20-app wall. */}
              {(activeCategory !== 'all' || searchQuery.trim()) && (
        <StartToolGrid searchQuery={searchQuery} activeCategory={activeCategory} onSelectModule={handleSelectModule} editionRegistry={editionRegistry} />
              )}

              {/* Starter Templates Preview */}
              <div className="border-t border-[color:var(--vgt-metal-edge)] pt-5">
                <StartTemplates onCreateTemplate={handleCreateTemplateWrapped} editionRegistry={editionRegistry} />
              </div>

              {/* Diagnostics & Vault Section */}
              <div className="border-t border-[color:var(--vgt-metal-edge)] pt-5">
                <StartDiagnosticsPanel
                  onOpenFileClick={() => inputRef.current?.click()}
                  onOpenVault={handleOpenVaultWrapped}
                  recoverySnapshots={recoverySnapshots}
                  onRestoreRecovery={onRestoreRecovery}
                  onDeleteRecovery={onDeleteRecovery}
                  onExportDiagnostics={onExportDiagnostics}
                  onOpenPlatformModal={onOpenPlatformModal}
                />
              </div>
            </>
          )}
          {/* Voluntary support: visible on the first-start surface and every category. */}
          <div className="mt-6 border-t border-[color:var(--vgt-metal-edge)] pt-5" data-start-support="true">
            <SupportOptions locale={locale} variant="page" />
          </div>
        </main>
      </div>
    </div>
  );
};
