import React, { useEffect, useRef, useState } from 'react';
import { Archive, BookOpen, ChevronDown, Command, Download, FileOutput, FolderOpen, LayoutGrid, RotateCcw, Search, Settings2 } from 'lucide-react';
import type { WorkspaceDocument } from '../../shared/contracts/workspace';
import type { AstraeaEdition } from '../../edition/contracts';
import { useWorkspaceLocale, workspaceText } from '../localization/workspaceLocale';
import { WORKSPACE_FILE_PICKER_ACCEPT } from '../../platform/containers/workspaceContainerBoundary';
import { AstraeaAppIcon } from '../../design-system/brand/AstraeaAppIcon';
import { WorkspaceBreadcrumbs } from '../../shell/navigation/WorkspaceBreadcrumbs';
import { APP_GUIDE_INTERFACE_COPY } from '../onboarding/appGuideCatalog';
import { shellChromeCopy } from '../i18n/shellChromeLocale';
import './Header.css';

interface HeaderProps {
  edition: AstraeaEdition;
  activeDoc: WorkspaceDocument | null;
  onRenameDoc: (title: string) => void;
  onOpenCommandPalette: () => void;
  onOpenSearch?: () => void;
  onOpenExplorer?: () => void;
  onOpenAppGuides?: () => void;
  onOpenSettings?: () => void;
  /**
   * Alpha 0.1: return path from any open document to the Workspace start page / app overview.
   * Absent while the Start Center is open (the shell passes it only outside the start surface).
   */
  onOpenStartCenter?: () => void;
  onOpenAppLauncher?: (trigger?: HTMLElement) => void;
  onSaveVwc: () => void;
  onExportOffice?: () => void;
  onOpenFile?: (file: File) => void;
  onNativeOpenFile?: () => void;
  onBackupWorkspace?: () => void;
  onRestoreWorkspace?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  edition,
  activeDoc,
  onRenameDoc,
  onOpenCommandPalette,
  onOpenSearch,
  onOpenExplorer,
  onOpenAppGuides,
  onOpenSettings,
  onOpenStartCenter,
  onOpenAppLauncher,
  onSaveVwc,
  onExportOffice,
  onOpenFile,
  onNativeOpenFile,
  onBackupWorkspace,
  onRestoreWorkspace,
}) => {
  const { locale } = useWorkspaceLocale();
  const chrome = shellChromeCopy(locale).header;
  const settingsLabel = workspaceText('header.settings', locale);
  const overviewLabel = workspaceText('header.overview', locale);
  const searchLabel = workspaceText('header.search', locale);
  const commandLabel = workspaceText('header.command', locale);
  const appGuidesLabel = APP_GUIDE_INTERFACE_COPY[locale].guideLabel;
  const editionLabel = edition === 'open-core' ? workspaceText('edition.openCore', locale) : workspaceText('edition.premium', locale);
  const editionAccessibleName = edition === 'open-core' ? chrome.editionOpenCore : chrome.editionPremium;
  const searchDescription = activeDoc
    ? chrome.searchInDocument(activeDoc.title)
    : chrome.searchWorkspace;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileMenuRef = useRef<HTMLDivElement>(null);
  const [isFileMenuOpen, setIsFileMenuOpen] = useState(false);

  useEffect(() => {
    if (!isFileMenuOpen) return undefined;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !fileMenuRef.current?.contains(event.target)) setIsFileMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsFileMenuOpen(false);
    };
    window.addEventListener('pointerdown', closeOutside, true);
    window.addEventListener('keydown', closeOnEscape, true);
    return () => {
      window.removeEventListener('pointerdown', closeOutside, true);
      window.removeEventListener('keydown', closeOnEscape, true);
    };
  }, [isFileMenuOpen]);

  const exportFormat = activeDoc?.kind === 'Writer' ? 'DOCX' : activeDoc?.kind === 'Grid' ? 'XLSX' : activeDoc?.kind === 'Present' ? 'PPTX' : null;
  const openFile = () => {
    setIsFileMenuOpen(false);
    if (onNativeOpenFile) onNativeOpenFile();
    else fileInputRef.current?.click();
  };

  return (
    /**
     * WR-SHELL-01 (native M7 probe) — the File menu was cut off by the Writer surface.
     *
     * The header carried `z-30`, and `WriterEditor`'s document column carries `z-30` as well.
     * Because the writer viewport comes later in the DOM, it won the stacking order and painted
     * over the open File menu. The header now sits above every app chrome layer (`z-50`) and the
     * dropdown itself above that (`z-[70]`), so `Datei öffnen` / `Exportieren` are always
     * reachable — independent of which app is mounted and where its own z-indexes sit.
     */
    <header data-workspace-header-layout="responsive" className="workspace-header relative z-50 flex w-full shrink-0 select-none">
      <div className="workspace-header__inner">
        <div className="workspace-header__identity">
          <div className="workspace-header__brand">
            <button
              type="button"
              onClick={(event) => onOpenAppLauncher?.(event.currentTarget)}
              className="workspace-header__launcher"
              aria-label={chrome.launcher}
              title={chrome.launcher}
            >
              <AstraeaAppIcon kind="Workspace" alt={chrome.logoAlt} className="workspace-header__logo" />
            </button>
            <button type="button" className="workspace-header__brand-copy" onClick={(event) => onOpenAppLauncher?.(event.currentTarget)} aria-label={chrome.launcher}>
              <span className="workspace-header__brand-line" aria-label={`Astraea Workspace, ${editionAccessibleName}`}>
                <span className="workspace-header__brand-name">ASTRAEA WORKSPACE</span>
                <span className="workspace-header__beta">ALPHA 0.1</span>
                <span className="workspace-header__edition" title={editionLabel}>
                  {editionLabel}
                </span>
              </span>
              <span className="workspace-header__tagline">{chrome.tagline}</span>
            </button>
          </div>

          <div aria-hidden="true" className="workspace-header__separator" />
          {activeDoc && <div className="workspace-header__breadcrumbs"><WorkspaceBreadcrumbs document={activeDoc} onOpenWorkspace={() => onOpenAppLauncher?.()} onOpenModule={() => onOpenAppLauncher?.()} onRename={onRenameDoc} /></div>}
        </div>
        <div className="workspace-header__actions">
          <div className="workspace-header__navigation-actions">
          {onOpenStartCenter && (
            <button
              type="button"
              onClick={onOpenStartCenter}
              className="workspace-header__action"
              data-workspace-action="overview"
              title={overviewLabel}
              aria-label={overviewLabel}
            >
              <LayoutGrid aria-hidden="true" className="workspace-header__action-icon" />
              <span className="workspace-header__action-label">{overviewLabel}</span>
            </button>
          )}
          {onOpenSettings && (
            <button type="button" onClick={onOpenSettings} className="workspace-header__action" title={workspaceText('header.openSettings', locale)} aria-label={workspaceText('header.openSettings', locale)}>
              <Settings2 aria-hidden="true" className="workspace-header__action-icon" />
              <span className="workspace-header__action-label">{settingsLabel}</span>
            </button>
          )}
          {onOpenSearch && (
            <button type="button" onClick={onOpenSearch} className="workspace-header__action" title={searchDescription} aria-label={searchDescription}>
              <Search aria-hidden="true" className="workspace-header__action-icon" />
              <span className="workspace-header__action-label">{searchLabel}</span>
            </button>
          )}
          {onOpenExplorer && (
            <button type="button" onClick={onOpenExplorer} className="workspace-header__action" data-workspace-action="explorer" title={workspaceText('explorer.open', locale)} aria-label={workspaceText('explorer.open', locale)}>
              <FolderOpen aria-hidden="true" className="workspace-header__action-icon" />
              <span className="workspace-header__action-label">{workspaceText('explorer.open', locale)}</span>
            </button>
          )}
          {onOpenAppGuides && (
            <button type="button" onClick={onOpenAppGuides} className="workspace-header__action" title={appGuidesLabel} aria-label={appGuidesLabel}>
              <BookOpen aria-hidden="true" className="workspace-header__action-icon" />
              <span className="workspace-header__action-label">{appGuidesLabel}</span>
            </button>
          )}
          <button type="button" onClick={onOpenCommandPalette} className="workspace-header__action" title={workspaceText('header.openCommand', locale)} aria-label={workspaceText('header.openCommand', locale)}>
            <Command aria-hidden="true" className="workspace-header__action-icon" />
            <span className="workspace-header__action-label">{commandLabel}</span>
            <kbd className="workspace-header__shortcut">Ctrl+K</kbd>
          </button>
          </div>

          <div className="workspace-header__file-actions">
          <div ref={fileMenuRef} className="relative">
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept={WORKSPACE_FILE_PICKER_ACCEPT}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onOpenFile?.(file);
                event.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => setIsFileMenuOpen((open) => !open)}
              className="workspace-header__action workspace-header__action--file"
              aria-haspopup="menu"
              aria-expanded={isFileMenuOpen}
              aria-label={`${workspaceText('header.file', locale)}: ${workspaceText('header.openFile', locale)}`}
              title={`${workspaceText('header.file', locale)}: ${workspaceText('header.openFile', locale)}`}
            >
              <FolderOpen aria-hidden="true" className="workspace-header__action-icon" />
              <span className="workspace-header__action-label">{workspaceText('header.file', locale)}</span>
              <ChevronDown aria-hidden="true" className={`workspace-header__chevron ${isFileMenuOpen ? 'is-open' : ''}`} />
            </button>
            {isFileMenuOpen && (
              <div role="menu" aria-label={workspaceText('header.fileActions', locale)} className="workspace-header__menu absolute right-0 top-full z-[70] mt-2 max-h-[min(24rem,calc(100dvh-7rem))] w-60 overflow-y-auto p-1.5">
                <button role="menuitem" type="button" onClick={openFile} disabled={!onOpenFile && !onNativeOpenFile} className="workspace-header__menu-item">
                  <FolderOpen aria-hidden="true" className="workspace-header__menu-icon" />
                  <span>{workspaceText('header.openFile', locale)}</span>
                </button>
                {exportFormat && onExportOffice && (
                  <button role="menuitem" type="button" onClick={() => { setIsFileMenuOpen(false); onExportOffice(); }} className="workspace-header__menu-item">
                    <FileOutput aria-hidden="true" className="workspace-header__menu-icon" />
                    <span>{workspaceText('header.exportAs', locale)} {exportFormat}</span>
                  </button>
                )}
                {onBackupWorkspace && (
                  <button role="menuitem" type="button" onClick={() => { setIsFileMenuOpen(false); onBackupWorkspace(); }} className="workspace-header__menu-item">
                    <Archive aria-hidden="true" className="workspace-header__menu-icon" />
                    <span>{workspaceText('header.backupWorkspace', locale)}</span>
                  </button>
                )}
                {onRestoreWorkspace && (
                  <button role="menuitem" type="button" onClick={() => { setIsFileMenuOpen(false); onRestoreWorkspace(); }} className="workspace-header__menu-item">
                    <RotateCcw aria-hidden="true" className="workspace-header__menu-icon" />
                    <span>{workspaceText('header.restoreWorkspace', locale)}</span>
                  </button>
                )}
              </div>
            )}
          </div>

          <button type="button" onClick={onSaveVwc} className="workspace-header__action workspace-header__action--primary" title={chrome.saveTitle} aria-label={chrome.saveAria}>
            <Download aria-hidden="true" className="workspace-header__action-icon" />
            <span className="workspace-header__action-label">{workspaceText('header.saveNative', locale)}</span>
          </button>
          </div>
        </div>
      </div>
    </header>
  );
};
