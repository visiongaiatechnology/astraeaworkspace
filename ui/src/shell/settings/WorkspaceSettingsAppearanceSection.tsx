// STATUS: GOLD — isolated presentation module for Workspace appearance preferences.
import React from 'react';
import { Accessibility, Check, MonitorCog } from 'lucide-react';
import { WORKSPACE_SETTINGS_BINDING_IDS } from './workspaceSettingsBindings';
import type { ShellAppearancePreference } from '../platform/workspaceShellPlatform';
import type { WorkspaceChromeMessage } from '../localization/workspaceLocale';
import { getWorkspaceThemePreset, resolveWorkspaceThemeTokens, WORKSPACE_ACCENTS, WORKSPACE_SURFACE_INTENSITIES, WORKSPACE_THEME_OPTIONS, workspaceThemeMode, type WorkspaceAccentId, type WorkspaceSurfaceIntensity, type WorkspaceThemeId } from '../../design-system/themes/workspaceTheme';

type ThemePreviewStyle = React.CSSProperties & {
  '--preview-environment': string;
  '--preview-workbench': string;
  '--preview-sidebar': string;
  '--preview-toolbar': string;
  '--preview-control': string;
  '--preview-floating': string;
  '--preview-accent': string;
  '--preview-action-surface': string;
  '--preview-action-border': string;
  '--preview-action-text': string;
  '--preview-selection': string;
  '--preview-selection-border': string;
  '--preview-focus': string;
  '--preview-edge': string;
  '--preview-border': string;
  '--preview-text': string;
  '--preview-muted': string;
  '--preview-shadow': string;
};

type IntensityPreviewStyle = React.CSSProperties & {
  '--intensity-environment': string;
  '--intensity-panel': string;
  '--intensity-toolbar': string;
  '--intensity-workbench': string;
  '--intensity-edge': string;
};

const THEME_DESCRIPTION_MESSAGES: Record<WorkspaceThemeId, WorkspaceChromeMessage> = {
  system: 'settings.themeSystemDescription',
  'cosmic-obsidian': 'settings.themeCosmicDescription',
  'sovereign-gold': 'settings.themeGoldDescription',
  'tactical-emerald': 'settings.themeEmeraldDescription',
  'abyssal-sapphire': 'settings.themeSapphireDescription',
  'crimson-command': 'settings.themeCrimsonDescription',
  'arctic-daylight': 'settings.themeArcticDescription',
};

const ACCENT_NAME_MESSAGES: Record<WorkspaceAccentId, WorkspaceChromeMessage> = {
  preset: 'settings.accentPreset',
  violet: 'settings.accentViolet',
  sapphire: 'settings.accentSapphire',
  cyan: 'settings.accentCyan',
  emerald: 'settings.accentEmerald',
  gold: 'settings.accentGold',
  rose: 'settings.accentRuby',
  fuchsia: 'settings.accentFuchsia',
  silver: 'settings.accentSilver',
};

const INTENSITY_DESCRIPTION_MESSAGES: Record<WorkspaceSurfaceIntensity, WorkspaceChromeMessage> = {
  oled: 'settings.intensityOledDescription',
  obsidian: 'settings.intensityObsidianDescription',
  'soft-slate': 'settings.intensitySlateDescription',
};

const INTENSITY_NAME_MESSAGES: Record<WorkspaceSurfaceIntensity, WorkspaceChromeMessage> = {
  oled: 'settings.intensityOled',
  obsidian: 'settings.intensityObsidian',
  'soft-slate': 'settings.intensitySlate',
};

function directionValue(value: string): ShellAppearancePreference['direction'] {
  return value === 'ltr' || value === 'rtl' ? value : 'auto';
}

function contrastValue(value: string): ShellAppearancePreference['highContrast'] {
  return value === 'on' || value === 'off' ? value : 'system';
}

function motionValue(value: string): ShellAppearancePreference['reducedMotion'] {
  return value === 'on' || value === 'off' ? value : 'system';
}

interface WorkspaceSettingsAppearanceSectionProps {
  appearance: ShellAppearancePreference;
  systemPrefersDark: boolean;
  translate: (key: WorkspaceChromeMessage) => string;
  onAppearanceChange: (next: ShellAppearancePreference) => void;
}

export const WorkspaceSettingsAppearanceSection: React.FC<WorkspaceSettingsAppearanceSectionProps> = ({
  appearance,
  systemPrefersDark,
  translate,
  onAppearanceChange,
}) => {
  const t = translate;
  const selectTheme = (value: WorkspaceThemeId) => onAppearanceChange({ ...appearance, themeId: value, mode: workspaceThemeMode(value) });
  const selectAccent = (value: WorkspaceAccentId) => onAppearanceChange({ ...appearance, accentId: value });
  const selectSurfaceIntensity = (value: WorkspaceSurfaceIntensity) => onAppearanceChange({ ...appearance, surfaceIntensity: value });
  const selectedPreset = getWorkspaceThemePreset(appearance.themeId, systemPrefersDark);
  const darkSurfaceIntensityEnabled = selectedPreset.colorScheme === 'dark';

  return (
              <div className="mx-auto max-w-3xl space-y-6">
                <fieldset className="workspace-theme-section min-w-0">
                  <legend className="workspace-theme-section__legend"><MonitorCog aria-hidden="true" />{t('settings.theme')}</legend>
                  <div id="workspace-theme-presets" className="workspace-theme-grid" role="group" aria-label={t('settings.theme')}>
                    {WORKSPACE_THEME_OPTIONS.map((option) => {
                      const selected = appearance.themeId === option.id;
                      const resolvedPreset = getWorkspaceThemePreset(option.id, systemPrefersDark);
                      const previewTokens = resolveWorkspaceThemeTokens(option.id, appearance.accentId, appearance.surfaceIntensity, systemPrefersDark);
                      const previewStyle: ThemePreviewStyle = {
                        '--preview-environment': previewTokens.background.environment,
                        '--preview-workbench': previewTokens.background.workbench,
                        '--preview-sidebar': previewTokens.background.sidebar,
                        '--preview-toolbar': previewTokens.background.toolbar,
                        '--preview-control': previewTokens.background.control,
                        '--preview-floating': previewTokens.background.floating,
                        '--preview-accent': previewTokens.accent.base,
                        '--preview-action-surface': previewTokens.primaryAction.surface,
                        '--preview-action-border': previewTokens.primaryAction.border,
                        '--preview-action-text': previewTokens.primaryAction.text,
                        '--preview-selection': previewTokens.selection.surface,
                        '--preview-selection-border': previewTokens.selection.border,
                        '--preview-focus': previewTokens.focus.color,
                        '--preview-edge': previewTokens.specular.edge,
                        '--preview-border': previewTokens.border.control,
                        '--preview-text': previewTokens.text.primary,
                        '--preview-muted': previewTokens.text.muted,
                        '--preview-shadow': previewTokens.shadow.z3,
                      };
                      return (
                        <button
                          key={option.id}
                          type="button"
                          data-theme-card={option.id}
                          data-setting-binding={WORKSPACE_SETTINGS_BINDING_IDS.theme}
                          aria-pressed={selected}
                          onClick={() => selectTheme(option.id)}
                          className="workspace-theme-card"
                        >
                          <span aria-hidden="true" className="workspace-theme-card__preview" style={previewStyle} data-preview-theme={resolvedPreset.id}>
                            <span className="workspace-theme-preview__mini-shell">
                              <span className="workspace-theme-preview__sidebar">
                                <span className="workspace-theme-preview__mark" />
                                <span className="workspace-theme-preview__nav workspace-theme-preview__nav--active" />
                                <span className="workspace-theme-preview__nav" />
                                <span className="workspace-theme-preview__nav workspace-theme-preview__nav--short" />
                              </span>
                              <span className="workspace-theme-preview__workbench">
                                <span className="workspace-theme-preview__toolbar">
                                  <span className="workspace-theme-preview__toolbar-line" />
                                  <span className="workspace-theme-preview__toolbar-control" />
                                  <span className="workspace-theme-preview__toolbar-control workspace-theme-preview__toolbar-control--small" />
                                </span>
                                <span className="workspace-theme-preview__content">
                                  <span className="workspace-theme-preview__content-line" />
                                  <span className="workspace-theme-preview__content-line workspace-theme-preview__content-line--short" />
                                  <span className="workspace-theme-preview__floating">
                                    <span className="workspace-theme-preview__floating-edge" />
                                    <span />
                                    <span />
                                  </span>
                                  <span className="workspace-theme-preview__raised-control" />
                                </span>
                              </span>
                            </span>
                          </span>
                          <span className="workspace-theme-card__swatches" aria-hidden="true">
                            {[previewTokens.background.environment, previewTokens.background.workbench, previewTokens.background.sidebar, previewTokens.background.control, previewTokens.background.floating, previewTokens.primaryAction.surface, previewTokens.accent.base].map((color, index) => <span key={`${option.id}-${index}`} style={{ backgroundColor: color }} />)}
                          </span>
                          <span className="workspace-theme-card__copy">
                            <span className="workspace-theme-card__name">{option.id === 'system' ? t('settings.system') : option.name.en}</span>
                            <span className="workspace-theme-card__description">{t(THEME_DESCRIPTION_MESSAGES[option.id])}</span>
                          </span>
                          <span className="workspace-theme-card__selection" aria-hidden="true"><Check /></span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="workspace-theme-scope">{t('settings.themeScope')}</p>
                </fieldset>

                <div className="workspace-theme-controls">
                  <fieldset className="workspace-theme-control min-w-0">
                    <legend className="workspace-theme-control__legend">{t('settings.accent')}</legend>
                    <div className="workspace-accent-grid" role="group" aria-label={t('settings.accent')}>
                      {WORKSPACE_ACCENTS.map((accent) => {
                        const selected = appearance.accentId === accent.id;
                        const previewColor = accent.id === 'preset' ? getWorkspaceThemePreset(appearance.themeId, systemPrefersDark).tokens.accent.base : accent.color;
                        const name = t(ACCENT_NAME_MESSAGES[accent.id]);
                        return (
                          <button key={accent.id} type="button" data-setting-binding={WORKSPACE_SETTINGS_BINDING_IDS.accent} aria-label={`${t('settings.accent')}: ${name}`} aria-pressed={selected} title={name} onClick={() => selectAccent(accent.id)} className="workspace-accent-chip">
                            <span className="workspace-accent-chip__color" style={{ backgroundColor: previewColor }}>
                              {selected && <Check aria-hidden="true" />}
                            </span>
                            <span className="workspace-accent-chip__name">{name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>

                  <fieldset className="workspace-theme-control min-w-0">
                    <legend className="workspace-theme-control__legend">{t('settings.surfaceIntensity')}</legend>
                    <div className="workspace-intensity-grid" role="group" aria-label={t('settings.surfaceIntensity')}>
                      {WORKSPACE_SURFACE_INTENSITIES.map((intensity, index) => {
                        const sample = resolveWorkspaceThemeTokens(appearance.themeId, 'preset', intensity.id, systemPrefersDark);
                        const sampleStyle: IntensityPreviewStyle = {
                          '--intensity-environment': sample.background.environment,
                          '--intensity-panel': sample.background.sidebar,
                        '--intensity-toolbar': sample.background.toolbar,
                        '--intensity-workbench': sample.background.workbench,
                          '--intensity-edge': sample.specular.edge,
                        };
                        return (
                        <button key={intensity.id} type="button" data-setting-binding={WORKSPACE_SETTINGS_BINDING_IDS.surfaceIntensity} disabled={!darkSurfaceIntensityEnabled} aria-pressed={appearance.surfaceIntensity === intensity.id} onClick={() => selectSurfaceIntensity(intensity.id)} className="workspace-intensity-option" data-intensity={intensity.id}>
                          <span aria-hidden="true" className={`workspace-intensity-option__sample workspace-intensity-option__sample--${index + 1}`} style={sampleStyle} />
                          <span className="workspace-intensity-option__copy">
                            <span className="workspace-intensity-option__name">{t(INTENSITY_NAME_MESSAGES[intensity.id])}</span>
                            <span className="workspace-intensity-option__description">{t(INTENSITY_DESCRIPTION_MESSAGES[intensity.id])}</span>
                          </span>
                          <span aria-hidden="true" className="workspace-intensity-option__check"><Check /></span>
                        </button>
                        );
                      })}
                    </div>
                    <p className="workspace-theme-scope">{t('settings.darkSurfaceScope')}</p>
                  </fieldset>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label htmlFor="workspace-direction" className="space-y-1.5 text-[11px] text-slate-300">
                    <span className="block">{t('settings.direction')}</span>
                    <select id="workspace-direction" data-setting-binding={WORKSPACE_SETTINGS_BINDING_IDS.direction} value={appearance.direction} onChange={(event) => onAppearanceChange({ ...appearance, direction: directionValue(event.currentTarget.value) })} className="w-full rounded-lg border border-white/10 bg-[#100d1c] px-3 py-2.5 text-xs text-slate-100 outline-none focus:border-purple-400/60 focus:ring-2 focus:ring-purple-500/20">
                      <option value="auto">{t('settings.automatic')}</option><option value="ltr">{t('settings.leftToRight')}</option><option value="rtl">{t('settings.rightToLeft')}</option>
                    </select>
                  </label>
                  <label htmlFor="workspace-scale" className="space-y-1.5 text-[11px] text-slate-300">
                    <span>{t('settings.scale')}</span>
                    <select id="workspace-scale" data-setting-binding={WORKSPACE_SETTINGS_BINDING_IDS.scale} value={appearance.scalePercent} onChange={(event) => onAppearanceChange({ ...appearance, scalePercent: Number(event.currentTarget.value) })} className="w-full rounded-lg border border-white/10 bg-[#100d1c] px-3 py-2.5 text-xs text-slate-100 outline-none focus:border-purple-400/60 focus:ring-2 focus:ring-purple-500/20">
                      {[50, 75, 90, 100, 110, 125, 150, 175, 200, 250, 300, 400].map((value) => <option key={value} value={value}>{value}%</option>)}
                    </select>
                  </label>
                  <label htmlFor="workspace-contrast" className="space-y-1.5 text-[11px] text-slate-300">
                    <span className="flex items-center gap-2"><Accessibility aria-hidden="true" className="h-3.5 w-3.5 text-purple-300" />{t('settings.highContrast')}</span>
                    <select id="workspace-contrast" data-setting-binding={WORKSPACE_SETTINGS_BINDING_IDS.highContrast} value={appearance.highContrast} onChange={(event) => onAppearanceChange({ ...appearance, highContrast: contrastValue(event.currentTarget.value) })} className="w-full rounded-lg border border-white/10 bg-[#100d1c] px-3 py-2.5 text-xs text-slate-100 outline-none focus:border-purple-400/60 focus:ring-2 focus:ring-purple-500/20">
                      <option value="system">{t('settings.system')}</option><option value="on">{t('settings.on')}</option><option value="off">{t('settings.off')}</option>
                    </select>
                  </label>
                  <label htmlFor="workspace-motion" className="space-y-1.5 text-[11px] text-slate-300">
                    <span className="block">{t('settings.reducedMotion')}</span>
                    <select id="workspace-motion" data-setting-binding={WORKSPACE_SETTINGS_BINDING_IDS.reducedMotion} value={appearance.reducedMotion} onChange={(event) => onAppearanceChange({ ...appearance, reducedMotion: motionValue(event.currentTarget.value) })} className="w-full rounded-lg border border-white/10 bg-[#100d1c] px-3 py-2.5 text-xs text-slate-100 outline-none focus:border-purple-400/60 focus:ring-2 focus:ring-purple-500/20">
                      <option value="system">{t('settings.system')}</option><option value="on">{t('settings.on')}</option><option value="off">{t('settings.off')}</option>
                    </select>
                  </label>
                </div>
              </div>

  );
};
