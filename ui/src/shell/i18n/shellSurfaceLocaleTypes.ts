// STATUS: PLATIN — shared Workspace shell surface contracts.

import type { BetaTemplateId } from '../../platform/templates/templateCatalog';

import type { DocumentKind } from '../../shared/contracts/workspace';

import type { StartCenterCategory } from '../start-center/contracts/startCenterTypes';

export type LauncherCategory = 'Office' | 'Collaboration' | 'Core Engine' | 'Security' | 'Admin';

export type BetaIssueId = 'office-fidelity' | 'pdf-rewrite' | 'collaboration' | 'office-size' | 'signing';

export type ShortcutLabelKey =
  | 'commandPalette' | 'save' | 'quickAddTask' | 'startCenter' | 'workspaceExplorer' | 'newWindow'
  | 'switchTab' | 'closeTab' | 'zoomIn' | 'zoomOut' | 'resetZoom'
  | 'findReplace' | 'bold' | 'italic' | 'underline' | 'zenMode' | 'editCell' | 'formulaInput'
  | 'toggleAbsoluteReference' | 'recalculateFormulas' | 'nextCell' | 'previousCell' | 'cellBelow'
  | 'selectAll' | 'find' | 'startPresentation' | 'nextSlide' | 'previousSlide' | 'nextField'
  | 'nextRecord' | 'findMail' | 'undo' | 'redo';

export type ShellAccessibilityIssueGroup =
  | 'document-title' | 'model-unavailable' | 'image-alt' | 'media-transcript'
  | 'video-captions' | 'heading-order' | 'slide-title' | 'form-field-name' | 'pdf-tags' | 'unknown';

export type ShellPlatformUpdateStatus = 'manual_offline' | 'current' | 'available' | 'failed';

export interface ShellSurfaceCopy {
  center: {
    dialogLabel: string; tagline: string; title: string; description: string;
    storage: string; network: string; workspace: string; storageValue: string;
    networkValue: string; workspaceValue: string; openExplorer: string;
    editionOpenCore: string; editionPremium: string;
  };
  sidebar: {
    navigation: string; primaryActions: string; create: string; open: string; recent: string;
    recovered: string; templates: string; vault: string; appsByCategory: string;
    localFirstEngine: string; cloud: string; netGateBound: string; exportDiagnostics: string;
    expand: string; collapse: string; width: string; sovereigntyTagline: string;
  };
  categoryLabels: Record<StartCenterCategory, string>;
  topbar: { globalSearch: string; syntaxHint: string; continueWorkspace: string; continueTitle: string };
  tools: { title: string; count: string; description: string; empty: string; premium: string; start: string };
  modules: Record<DocumentKind, { shortName: string; description: string }>;
  templates: {
    title: string; description: string; filterLabel: string; all: string; fallbackHighlight: string;
    create: string; premium: string;
    entries: Record<BetaTemplateId, { name: string; description: string; highlight: string }>;
  };
  recent: {
    eyebrow: string; title: string; metadataProtected: string; empty: string; sizeProtected: string;
    missing: string; localVault: string; protected: string; standard: string;
  };
  diagnostics: {
    ariaLabel: string; recoveryTitle: string; recoveryDescription: string; snapshots: string;
    snapshotFrom: string; protected: string; pinProtected: string; passwordProtected: string;
    topSecretUnlock: string; deviceBound: string; restore: string; discard: string;
    nativeTitle: string; nativeDescription: string; openLocalFile: string; vaultTitle: string;
    vaultDescription: string; enterVault: string; sovereigntyTitle: string; sovereigntyDescription: string;
    platformTests: string; createReport: string; debugActive: string; debugTimed: string;
    enableDebug: string; debugTitle: string; safeMode: string; safeModeActive: string;
    safeModeTitle: string; debugNotice: string; safeModeNotice: string; betaConditions: string;
  };
  betaIssues: Record<BetaIssueId, { area: string; summary: string }>;
  launcher: {
    title: string; modules: string; description: string; close: string; searchPlaceholder: string;
    allApplications: string; noResults: string; refineSearch: string; footer: string;
    categories: Record<LauncherCategory, string>;
    shellApps: Record<'start-center' | 'search' | 'explorer', { name: string; description: string }>;
  };
  shortcuts: {
    title: string; close: string; searchable: string; searchLabel: string; searchPlaceholder: string;
    noResults: string; labels: Record<ShortcutLabelKey, string>;
  };
  platform: {
    aboutUpdate: string; version: string; buildHash: string; channel: string; updateState: string;
    newWindow: string; themeAccessibility: string; workspaceTheme: string; direction: string;
    automaticLocale: string; leftToRight: string; rightToLeft: string; scale: string;
    highContrast: string; reducedMotion: string; operatingSystem: string; on: string; off: string;
    zoomNote: string; accessibilityCheckers: string; accessibilityNoDocs: string;
    noBlockingErrors: string; accessibilityErrors: string; errors: string; warnings: string;
    channelNames: Record<'beta' | 'stable', string>;
    issueSeverities: Record<'error' | 'warning' | 'info', string>;
    keyboardMap: string; applyBinding: string; themeNames: Record<string, string>;
    updateStatuses: Record<'manual_offline' | 'current' | 'available' | 'failed', string>;
  };
}
