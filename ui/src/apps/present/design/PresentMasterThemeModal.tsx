import React, { useState } from 'react';
import {
  PresentDocumentModel,
  PresentThemeDefinition,
  PresentMasterSlideDefinition,
} from '../../../shared/contracts/workspace';
import {
  DEFAULT_PRESENT_THEMES,
  DEFAULT_PRESENT_MASTERS,
  addCustomTheme,
  applyPresentMasterUpdate,
  applyPresentTheme,
  assignPresentSlideMaster,
  listPresentMasterDependents,
  resolvePresentMasterId,
} from './presentDesign';
import { X, Palette, Layout, Plus, Check } from 'lucide-react';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { PRESENT_THEME_COPY } from '../locale/presentThemeLocale';

interface PresentMasterThemeModalProps {
  presentData: PresentDocumentModel;
  onUpdatePresentData: (next: PresentDocumentModel) => void;
  onClose: () => void;
  /** Active slide: the assignment control needs to know which slide it moves. */
  activeSlideId?: string;
}

export const PresentMasterThemeModal: React.FC<PresentMasterThemeModalProps> = ({
  presentData,
  onUpdatePresentData,
  onClose,
  activeSlideId,
}) => {
  const { locale } = useWorkspaceLocale();
  const copy = PRESENT_THEME_COPY[locale];
  const [activeTab, setActiveTab] = useState<'themes' | 'masters'>('themes');
  const [status, setStatus] = useState<string | null>(null);
  const themes = presentData.themes?.length ? presentData.themes : DEFAULT_PRESENT_THEMES;
  const masters = presentData.masters?.length ? presentData.masters : DEFAULT_PRESENT_MASTERS;
  const currentThemeId = presentData.themeId || themes[0].id;
  const dependents = listPresentMasterDependents(presentData);

  const [newThemeName, setNewThemeName] = useState('');
  const [newAccent, setNewAccent] = useState('#38bdf8');
  const [newBg, setNewBg] = useState('#0f172a');
  const [newFont, setNewFont] = useState('Inter, sans-serif');

  const handleSelectTheme = (themeId: string) => {
    // Paket 12: applying a theme must not destroy custom formatting. `applyPresentTheme` is the only
    // rule that does this, and it reports what it preserved instead of claiming it.
    const result = applyPresentTheme(presentData, themeId);
    onUpdatePresentData(result.model);
    setStatus(
      result.report.changed
        ? `Theme applied. Preserved: ${result.report.preservedSlideBackgrounds} slide background(s), ${result.report.preservedObjectColors} object colour(s), ${result.report.preservedTextObjects} text colour(s).`
        : 'Theme unchanged; existing custom formatting was left untouched.',
    );
  };

  const handleCreateTheme = () => {
    if (!newThemeName.trim()) return;
    const custom: PresentThemeDefinition = {
      id: `theme-${Date.now()}`,
      name: newThemeName.trim(),
      backgroundColor: newBg,
      surfaceColor: '#1e293b',
      titleColor: '#f8fafc',
      bodyColor: '#cbd5e1',
      accentColor: newAccent,
      fontFamily: newFont,
    };
    onUpdatePresentData(addCustomTheme(presentData, custom));
    setNewThemeName('');
  };

  const handleUpdateMaster = (id: string, patch: Partial<PresentMasterSlideDefinition>, detachSlideIds?: string[]) => {
    // Paket 11: "Master ändern und alle abhängigen Folien kontrolliert aktualisieren". The controlled
    // part is the *report*: the user sees how many slides follow and which keep their own background.
    const result = applyPresentMasterUpdate(presentData, id, patch, { detachSlideIds });
    onUpdatePresentData(result.model);
    setStatus(
      `Master updated: ${result.report.updatedSlideIds.length} slide(s) follow it, ` +
      `${result.report.overriddenSlideIds.length} keep their own background, ` +
      `${result.report.detachedSlideIds.length} detached` +
      (result.report.unknownSlideIds.length ? `, ${result.report.unknownSlideIds.length} unknown slide id(s) ignored` : '') + '.',
    );
  };

  const handleAssignMaster = (masterId: string) => {
    if (!activeSlideId) {
      setStatus('Select a slide in the deck first, then assign a master.');
      return;
    }
    const result = assignPresentSlideMaster(presentData, activeSlideId, masterId);
    if (!result.ok) {
      setStatus(result.reason === 'unchanged' ? 'The slide already uses this master.' : `Assignment refused (${result.reason}).`);
      return;
    }
    onUpdatePresentData(result.model);
    setStatus(`Slide assigned to "${masters.find((master) => master.id === masterId)?.name ?? masterId}" (was ${result.previousMasterId}).`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 select-none">
      <div role="dialog" aria-modal="true" aria-labelledby="present-theme-title" className="w-full max-w-2xl max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl border border-white/15 bg-slate-950 p-6 shadow-2xl text-xs space-y-5">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center space-x-2">
            <Palette className="w-5 h-5 text-amber-400" />
            <h2 id="present-theme-title" className="min-w-0 break-words text-base font-bold text-slate-100">{copy.title}</h2>
          </div>
          <button aria-label={copy.close} type="button" onClick={onClose} className="text-slate-500 hover:text-slate-300">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex space-x-2 border-b border-white/10 pb-2">
          <button
            type="button"
            onClick={() => setActiveTab('themes')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-colors flex items-center space-x-1.5 ${
              activeTab === 'themes' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Palette className="w-3.5 h-3.5" />
            <span>{copy.themesTab}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('masters')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-colors flex items-center space-x-1.5 ${
              activeTab === 'masters' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Layout className="w-3.5 h-3.5" />
            <span>{copy.mastersTab}</span>
          </button>
        </div>

        {/* Tab 1: Themes */}
        {activeTab === 'themes' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {themes.map((theme) => {
                const isActive = theme.id === currentThemeId;
                return (
                  <div
                    key={theme.id}
                    // GAP-0052, Runde 284: die Themenkachel war nur mit der
                    // Maus waehlbar — `cursor-pointer` und `onClick`, aber kein
                    // Tastaturweg.
                    role="button"
                    tabIndex={0}
                    aria-pressed={isActive}
                    onClick={() => handleSelectTheme(theme.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        handleSelectTheme(theme.id);
                      }
                    }}
                    className={`p-3 rounded-xl border cursor-pointer transition-all ${
                      isActive
                        ? 'border-cyan-400 ring-2 ring-cyan-400/30 bg-white/5'
                        : 'border-white/10 bg-slate-900/60 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-slate-200">{theme.name}</span>
                      {isActive && <Check className="w-3.5 h-3.5 text-cyan-400" />}
                    </div>
                    <div className="flex items-center space-x-1.5">
                      <div className="w-5 h-5 rounded-full border border-white/20 shadow" style={{ backgroundColor: theme.backgroundColor }} />
                      <div className="w-5 h-5 rounded-full border border-white/20 shadow" style={{ backgroundColor: theme.surfaceColor }} />
                      <div className="w-5 h-5 rounded-full border border-white/20 shadow" style={{ backgroundColor: theme.accentColor }} />
                    </div>
                    <div className="mt-2 text-[0.625rem] text-slate-400 font-mono truncate">{theme.fontFamily}</div>
                  </div>
                );
              })}
            </div>

            {/* Create Custom Theme */}
            <div className="rounded-xl border border-white/10 bg-slate-900/50 p-3 space-y-2">
              <span className="break-words text-[0.6875rem] font-bold text-slate-300">{copy.paletteTitle}</span>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                <input
                  type="text"
                  value={newThemeName}
                  onChange={(e) => setNewThemeName(e.target.value)}
                  placeholder={copy.namePlaceholder}
                  aria-label={copy.namePlaceholder}
                  className="bg-slate-950 border border-white/15 rounded-lg px-2.5 py-1.5 text-slate-200 outline-none"
                />
                <label className="flex items-center justify-between bg-slate-950 border border-white/15 rounded-lg px-2 py-1 text-slate-300 text-[0.6875rem]">
                  <span>{copy.accent}:</span>
                  <input type="color" value={newAccent} onChange={(e) => setNewAccent(e.target.value)} aria-label={copy.accent} className="w-4 h-4 bg-transparent border-0 cursor-pointer" />
                </label>
                <label className="flex items-center justify-between bg-slate-950 border border-white/15 rounded-lg px-2 py-1 text-slate-300 text-[0.6875rem]">
                  <span>{copy.background}:</span>
                  <input type="color" value={newBg} onChange={(e) => setNewBg(e.target.value)} aria-label={copy.background} className="w-4 h-4 bg-transparent border-0 cursor-pointer" />
                </label>
                <input
                  type="text"
                  value={newFont}
                  onChange={(e) => setNewFont(e.target.value)}
                  placeholder={copy.fontPlaceholder}
                  aria-label={copy.fontPlaceholder}
                  className="bg-slate-950 border border-white/15 rounded-lg px-2.5 py-1.5 text-slate-200 outline-none text-[0.6875rem]"
                />
                <button
                  type="button"
                  onClick={handleCreateTheme}
                  disabled={!newThemeName.trim()}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-semibold flex items-center justify-center space-x-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{copy.create}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Masters */}
        {activeTab === 'masters' && (
          <div className="space-y-3">
            {masters.map((master) => {
              const group = dependents.find((candidate) => candidate.masterId === master.id);
              const usesThisMaster = activeSlideId ? resolvePresentMasterId(presentData, { id: activeSlideId, title: '', subtitle: '', layout: 'blank' }) === master.id : false;
              return (
              <div key={master.id} className="rounded-xl border border-white/10 bg-slate-900/60 p-3 space-y-3">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <span className="font-bold text-slate-200 text-xs">{master.name}</span>
                    <div className="text-[0.625rem] text-slate-400 mt-0.5">
                      {group ? `${group.slideIndexes.length} slide(s) use this master` : 'No slides use this master'}
                      {group && group.overriddenSlideIds.length > 0 && ` · ${group.overriddenSlideIds.length} keep their own background`}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAssignMaster(master.id)}
                    disabled={!activeSlideId || usesThisMaster}
                    aria-pressed={usesThisMaster}
                    className={`rounded-lg border px-2 py-1 text-[0.625rem] font-semibold disabled:opacity-40 ${
                      usesThisMaster ? 'border-cyan-500/50 bg-cyan-500/15 text-cyan-200' : 'border-white/15 text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    {usesThisMaster ? 'Active slide uses this master' : 'Assign active slide'}
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center space-x-1 text-[0.6875rem] text-slate-300">
                    <input
                      type="checkbox"
                      checked={master.showFooter !== false}
                      onChange={(e) => handleUpdateMaster(master.id, { showFooter: e.target.checked })}
                      className="rounded border-white/20 bg-slate-950 text-blue-600"
                    />
                    <span>{copy.footer}</span>
                  </label>
                  {master.showFooter !== false && (
                    <input
                      type="text"
                      value={master.footerText || ''}
                      onChange={(e) => handleUpdateMaster(master.id, { footerText: e.target.value })}
                      placeholder={copy.footerPlaceholder}
                      aria-label={copy.footerPlaceholder}
                      className="bg-slate-950 border border-white/15 rounded-lg px-2 py-1 text-slate-200 text-[0.625rem] w-48 outline-none"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => handleUpdateMaster(master.id, {}, (group?.slideIds ?? []).slice(0, 1))}
                    disabled={!group || group.slideIds.length < 2}
                    className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[0.625rem] text-amber-200 disabled:opacity-40"
                    title="Move the first dependent slide to another master so it stops following this one"
                  >
                    Detach first dependent slide
                  </button>
                </div>
              </div>
            );})}
          </div>
        )}

        {status && (
          <div role="status" aria-live="polite" data-present-master-status="true" className="rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-3 py-2 text-[0.625rem] text-cyan-100">
            {status}
          </div>
        )}

        <div className="flex justify-end pt-2 border-t border-white/10">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs"
          >
            {copy.done}
          </button>
        </div>
      </div>
    </div>
  );
};
