// STATUS: DIAMANT VGT SUPREME — locale-aware platform controls over Workspace theme tokens.
import React, { useEffect, useMemo, useState } from 'react';
import { Accessibility, AlertTriangle, CheckCircle2, ExternalLink, Info, Keyboard, MonitorCog, RefreshCw, Scale } from 'lucide-react';
import { ALPHA_VERSION } from '../../platform/release/alphaStatus';
import { ASTRAEA_BUILD_HASH } from '../../platform/release/buildInfo.generated';
import { checkWorkspaceAccessibility } from '../../shared/accessibility/accessibilityPlatform';
import type { WorkspaceDocument } from '../../shared/contracts/workspace';
import type {
  ShellAppearancePreference,
  ShellShortcutCommand,
  ShellShortcutMap,
  ShellUpdateState,
} from '../platform/workspaceShellPlatform';
import { useWorkspaceLocale, workspaceText } from '../localization/workspaceLocale';
import { isWorkspaceThemeId, workspaceThemeMode, WORKSPACE_THEME_OPTIONS } from '../../design-system/themes/workspaceTheme';
import type { AstraeaEdition } from '../../edition/contracts';
import { formatShellNumber, shellAccessibilityIssueCopy, shellPlatformUpdateDetail, shellSurfaceCopy, type ShortcutLabelKey } from '../i18n/shellSurfaceLocale';

interface ShellPlatformStatusPanelProps {
  edition: AstraeaEdition;
  appearance: ShellAppearancePreference;
  shortcuts: ShellShortcutMap;
  updateState: ShellUpdateState;
  documents: Record<string, WorkspaceDocument>;
  onAppearanceChange: (next: ShellAppearancePreference) => void;
  onShortcutChange: (command: ShellShortcutCommand, binding: string) => void;
  onOpenNewWindow: () => void;
}

const SHORTCUT_LABEL_KEYS: Record<ShellShortcutCommand, ShortcutLabelKey> = {
  'command-palette': 'commandPalette',
  save: 'save',
  'quick-add-task': 'quickAddTask',
  'start-center': 'startCenter',
  'workspace-explorer': 'workspaceExplorer',
  'new-window': 'newWindow',
};

const ISSUE_SEVERITY_CLASS = {
  error: 'text-[var(--vgt-control-danger)]',
  warning: 'text-[var(--vgt-control-warning)]',
  info: 'text-[var(--vgt-control-info)]',
} as const;

export const ShellPlatformStatusPanel: React.FC<ShellPlatformStatusPanelProps> = ({
  edition,
  appearance,
  shortcuts,
  updateState,
  documents,
  onAppearanceChange,
  onShortcutChange,
  onOpenNewWindow,
}) => {
  const [drafts, setDrafts] = useState<Record<ShellShortcutCommand, string>>(shortcuts);
  const { locale } = useWorkspaceLocale();
  const copy = shellSurfaceCopy(locale);
  const accessibilityReports = useMemo(() => checkWorkspaceAccessibility(documents, 0), [documents]);
  const accessibilityErrors = accessibilityReports.reduce((sum, report) => sum + report.errors, 0);
  const accessibilityWarnings = accessibilityReports.reduce((sum, report) => sum + report.warnings, 0);

  useEffect(() => setDrafts(shortcuts), [shortcuts]);

  return (
    <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <div className="glass-panel space-y-4 rounded-2xl border border-[var(--vgt-metal-edge)] bg-[var(--vgt-surface-z1)] p-5 shadow-[inset_0_1px_0_var(--vgt-metal-highlight)]">
        <div className="flex items-center gap-2">
          <Info aria-hidden="true" className="h-4 w-4 text-[var(--vgt-accent-strong)]" />
          <h2 className="text-xs font-semibold text-[var(--vgt-text-primary)]">{copy.platform.aboutUpdate}</h2>
        </div>
        <dl className="space-y-1 font-mono text-[10px] text-[var(--vgt-text-muted)]">
          <div><dt className="inline">{copy.platform.version}: </dt><dd className="inline text-[var(--vgt-control-text)]">{ALPHA_VERSION}</dd></div>
          <div>{workspaceText(edition === 'open-core' ? 'edition.aboutOpenCore' : 'edition.aboutPremium', locale)}</div>
          <div className="break-all"><dt className="inline">{copy.platform.buildHash}: </dt><dd className="inline text-[var(--vgt-control-text)]">{ASTRAEA_BUILD_HASH}</dd></div>
          <div><dt className="inline">{copy.platform.channel}: </dt><dd className="inline text-[var(--vgt-control-text)]">{copy.platform.channelNames[updateState.channel]}</dd></div>
          <div><dt className="inline">{copy.platform.updateState}: </dt><dd className="inline text-[var(--vgt-control-warning)]">{copy.platform.updateStatuses[updateState.status]}</dd></div>
          <dd className="font-sans text-[var(--vgt-text-muted)]">{shellPlatformUpdateDetail(locale, updateState.status)}</dd>
        </dl>
        <button
          type="button"
          onClick={onOpenNewWindow}
          className="vgt-button-secondary inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vgt-focus)]"
        >
          <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" /> {copy.platform.newWindow}
        </button>
      </div>

      <div className="glass-panel space-y-4 rounded-2xl border border-[var(--vgt-metal-edge)] bg-[var(--vgt-surface-z1)] p-5 shadow-[inset_0_1px_0_var(--vgt-metal-highlight)]">
        <div className="flex items-center gap-2">
          <MonitorCog aria-hidden="true" className="h-4 w-4 text-[var(--vgt-accent-strong)]" />
          <h2 className="text-xs font-semibold text-[var(--vgt-text-primary)]">{copy.platform.themeAccessibility}</h2>
        </div>
        <div className="grid grid-cols-2 gap-2 text-[10px] xl:grid-cols-3">
          <label className="text-[var(--vgt-control-muted)]">
            {copy.platform.workspaceTheme}
            <select
              value={appearance.themeId}
              onChange={(event) => {
                const themeId = event.currentTarget.value;
                if (isWorkspaceThemeId(themeId)) onAppearanceChange({ ...appearance, themeId, mode: workspaceThemeMode(themeId) });
              }}
              className="vgt-input mt-1 w-full rounded-lg px-2 py-1.5 text-[var(--vgt-control-text)]"
            >
              {WORKSPACE_THEME_OPTIONS.map((theme) => (
                <option key={theme.id} value={theme.id}>{copy.platform.themeNames[theme.id] ?? theme.id}</option>
              ))}
            </select>
          </label>
          <label className="text-[var(--vgt-control-muted)]">
            {copy.platform.direction}
            <select
              value={appearance.direction}
              onChange={(event) => onAppearanceChange({ ...appearance, direction: event.target.value as ShellAppearancePreference['direction'] })}
              className="vgt-input mt-1 w-full rounded-lg px-2 py-1.5 text-[var(--vgt-control-text)]"
            >
              <option value="auto">{copy.platform.automaticLocale}</option>
              <option value="ltr">{copy.platform.leftToRight}</option>
              <option value="rtl">{copy.platform.rightToLeft}</option>
            </select>
          </label>
          <label className="text-[var(--vgt-control-muted)]">
            {copy.platform.scale}
            <select
              value={appearance.scalePercent}
              onChange={(event) => onAppearanceChange({ ...appearance, scalePercent: Number(event.target.value) })}
              className="vgt-input mt-1 w-full rounded-lg px-2 py-1.5 text-[var(--vgt-control-text)]"
            >
              {[25, 50, 75, 100, 125, 150, 175, 200, 250, 300, 400].map((value) => <option key={value} value={value}>{value}%</option>)}
            </select>
          </label>
          <label className="text-[var(--vgt-control-muted)]">
            {copy.platform.highContrast}
            <select
              value={appearance.highContrast}
              onChange={(event) => onAppearanceChange({ ...appearance, highContrast: event.target.value as ShellAppearancePreference['highContrast'] })}
              className="vgt-input mt-1 w-full rounded-lg px-2 py-1.5 text-[var(--vgt-control-text)]"
            >
              <option value="system">{copy.platform.operatingSystem}</option><option value="on">{copy.platform.on}</option><option value="off">{copy.platform.off}</option>
            </select>
          </label>
          <label className="text-[var(--vgt-control-muted)]">
            {copy.platform.reducedMotion}
            <select
              value={appearance.reducedMotion}
              onChange={(event) => onAppearanceChange({ ...appearance, reducedMotion: event.target.value as ShellAppearancePreference['reducedMotion'] })}
              className="vgt-input mt-1 w-full rounded-lg px-2 py-1.5 text-[var(--vgt-control-text)]"
            >
              <option value="system">{copy.platform.operatingSystem}</option><option value="on">{copy.platform.on}</option><option value="off">{copy.platform.off}</option>
            </select>
          </label>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-[var(--vgt-text-muted)]">
          <Scale aria-hidden="true" className="h-3 w-3 shrink-0 text-[var(--vgt-control-muted)]" />
          {copy.platform.zoomNote}
        </div>
      </div>

      <div className="glass-panel space-y-3 rounded-2xl border border-[var(--vgt-metal-edge)] bg-[var(--vgt-surface-z1)] p-5 shadow-[inset_0_1px_0_var(--vgt-metal-highlight)] xl:col-span-2" aria-labelledby="workspace-accessibility-audit-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Accessibility aria-hidden="true" className="h-4 w-4 text-[var(--vgt-control-info)]" />
            <h2 id="workspace-accessibility-audit-title" className="text-xs font-semibold text-[var(--vgt-text-primary)]">{copy.platform.accessibilityCheckers}</h2>
          </div>
          <div className="text-[10px] text-[var(--vgt-text-muted)]" aria-live="polite">
            {formatShellNumber(locale, accessibilityErrors)} {copy.platform.errors} · {formatShellNumber(locale, accessibilityWarnings)} {copy.platform.warnings}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
          {accessibilityReports.length === 0 ? (
            <div className="text-[10px] text-[var(--vgt-text-muted)]">{copy.platform.accessibilityNoDocs}</div>
          ) : accessibilityReports.map((report) => {
            const doc = documents[report.documentId];
            return (
              <div key={report.documentId} className="rounded-xl border border-[var(--vgt-control-border)] bg-[var(--vgt-surface-z2)] p-3 shadow-[inset_0_1px_0_var(--vgt-metal-highlight)]">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-[11px] font-semibold text-[var(--vgt-text-primary)]">{doc?.title || report.kind}</div>
                    <div className="text-[9px] uppercase tracking-wider text-[var(--vgt-control-muted)]">{report.kind}</div>
                  </div>
                  {report.passed
                    ? <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--vgt-control-success)]" aria-label={copy.platform.noBlockingErrors} />
                    : <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--vgt-control-warning)]" aria-label={copy.platform.accessibilityErrors} />}
                </div>
                <div className="mt-2 text-[10px] text-[var(--vgt-text-muted)]">
                  {formatShellNumber(locale, report.errors)} {copy.platform.errors} · {formatShellNumber(locale, report.warnings)} {copy.platform.warnings}
                </div>
                {report.issues.length > 0 && (
                  <div className="mt-2 max-h-24 space-y-1 overflow-y-auto">
                    {report.issues.slice(0, 8).map((issue, index) => (
                      <div key={`${issue.code}-${index}`} className="text-[9px] leading-relaxed text-[var(--vgt-text-muted)]">
                        <span className={ISSUE_SEVERITY_CLASS[issue.severity]}>{copy.platform.issueSeverities[issue.severity]}</span>
                        {' · '}{shellAccessibilityIssueCopy(locale, issue.code, issue.pageOrSlide)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="glass-panel space-y-3 rounded-2xl border border-[var(--vgt-metal-edge)] bg-[var(--vgt-surface-z1)] p-5 shadow-[inset_0_1px_0_var(--vgt-metal-highlight)] xl:col-span-2">
        <div className="flex items-center gap-2">
          <Keyboard aria-hidden="true" className="h-4 w-4 text-[var(--vgt-accent-strong)]" />
          <h2 className="text-xs font-semibold text-[var(--vgt-text-primary)]">{copy.platform.keyboardMap}</h2>
        </div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-5">
          {(Object.keys(shortcuts) as ShellShortcutCommand[]).map((command) => {
            const label = copy.shortcuts.labels[SHORTCUT_LABEL_KEYS[command]];
            return (
              <label key={command} className="text-[10px] text-[var(--vgt-control-muted)]">
                {label}
                <div className="mt-1 flex gap-1">
                  <input
                    aria-label={label}
                    value={drafts[command]}
                    onChange={(event) => setDrafts((previous) => ({ ...previous, [command]: event.target.value }))}
                    className="vgt-input min-w-0 flex-1 rounded-lg px-2 py-1.5 font-mono text-[10px]"
                  />
                  <button
                    type="button"
                    onClick={() => onShortcutChange(command, drafts[command])}
                    className="vgt-button-secondary rounded-lg px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vgt-focus)]"
                    aria-label={copy.platform.applyBinding}
                    title={copy.platform.applyBinding}
                  >
                    <RefreshCw aria-hidden="true" className="h-3 w-3" />
                  </button>
                </div>
              </label>
            );
          })}
        </div>
      </div>
    </section>
  );
};
