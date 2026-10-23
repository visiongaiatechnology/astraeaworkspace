// STATUS: DIAMANT VGT SUPREME
// Astraea Grid authoritative bottom sheet bar: multi-sheet tabs, tab color, reorder, freeze, zoom

import React, { useState } from 'react';
import {
  Plus,
  Table2,
  Layers,
  MoreVertical,
  Copy,
  Trash2,
  Palette,
  ArrowLeft,
  ArrowRight,
  Grid,
  Users,
} from 'lucide-react';
import { GridSheetModel } from '../../../shared/contracts/workspace';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { gridBottomBarCopy } from '../locale/gridBottomBarLocale';
import { resolveGridWorkbookTabKey } from '../workbook/gridWorkbookTabs';

interface GridBottomBarProps {
  sheets: GridSheetModel[];
  activeSheetId: string;
  onSelectSheet: (sheetId: string) => void;
  onAddSheet: () => void;
  onRenameSheet: (sheetId: string, name: string) => void;
  onDuplicateSheet: (sheetId: string) => void;
  onDeleteSheet: (sheetId: string) => void;
  onReorderSheet: (sheetId: string, direction: 'left' | 'right') => void;
  onChangeTabColor: (sheetId: string, color?: string) => void;
  onSetSheetVisibility: (sheetId: string, visibility: 'visible'|'hidden'|'very-hidden') => void;
  onUpdateActiveSheet: (patch: Partial<GridSheetModel>) => void;
  collaborationAvailable?: boolean;
  collaborationEnabled?: boolean;
  collaborationConnecting?: boolean;
  collaborationPeerCount?: number;
  collaborationConflictCount?: number;
  collaborationError?: string | null;
  onToggleCollaboration?: () => void;
}

export const GridBottomBar: React.FC<GridBottomBarProps> = ({
  sheets,
  activeSheetId,
  onSelectSheet,
  onAddSheet,
  onRenameSheet,
  onDuplicateSheet,
  onDeleteSheet,
  onReorderSheet,
  onChangeTabColor,
  onSetSheetVisibility,
  onUpdateActiveSheet,
  collaborationAvailable = false,
  collaborationEnabled = false,
  collaborationConnecting = false,
  collaborationPeerCount = 0,
  collaborationConflictCount = 0,
  collaborationError = null,
  onToggleCollaboration = () => {},
}) => {
  const { locale } = useWorkspaceLocale();
  const copy = gridBottomBarCopy(locale);
  const [menuSheetId, setMenuSheetId] = useState<string | null>(null);
  const [editingSheetId, setEditingSheetId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [hiddenMenuOpen, setHiddenMenuOpen] = useState(false);

  const activeSheet = sheets.find((s) => s.id === activeSheetId) ?? sheets[0];
  const visibleSheets = sheets.filter((sheet) => !sheet.hidden && !sheet.veryHidden);
  const hiddenSheets = sheets.filter((sheet) => sheet.hidden || sheet.veryHidden);
  const zoom = activeSheet?.zoom ?? 100;
  const showGridlines = activeSheet?.showGridlines !== false;
  const isFrozen = (activeSheet?.freezeRows ?? 0) > 0 || (activeSheet?.freezeCols ?? 0) > 0;

  const startRename = (sheet: GridSheetModel) => {
    setEditingSheetId(sheet.id);
    setRenameValue(sheet.name);
    setMenuSheetId(null);
  };

  const commitRename = (sheetId: string) => {
    if (renameValue.trim()) onRenameSheet(sheetId, renameValue.trim());
    setEditingSheetId(null);
  };

  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  /** Keyboard sheet switching on the tab strip (Ctrl+PageUp/PageDown, arrows, Home/End). */
  const handleTabStripKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) return;
    const action = resolveGridWorkbookTabKey(
      {
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
      },
      sheets,
      activeSheetId,
    );
    if (action.kind !== 'activate') return;
    event.preventDefault();
    onSelectSheet(action.sheetId);
  };

  return (
    <footer data-vgt-grid-chrome="sheet-bar" className="h-8 bg-slate-950 border-t border-white/[0.08] px-3 flex items-center justify-between text-[0.6875rem] text-slate-400 font-mono shrink-0 select-none">
      {/* Sheet Tabs */}
      <div
        className="flex items-center space-x-1 overflow-x-auto relative"
        role="tablist"
        aria-label={copy.sheetOptions}
        onKeyDown={handleTabStripKeyDown}
      >
        <Layers className="w-3.5 h-3.5 text-slate-500 mr-1 shrink-0" />

        {visibleSheets.map((s, idx) => {
          const isActive = s.id === activeSheetId;
          const isEditing = s.id === editingSheetId;

          return (
            <div key={s.id} className="relative flex items-center group">
              {isEditing ? (
                <input
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => commitRename(s.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename(s.id);
                    if (e.key === 'Escape') setEditingSheetId(null);
                  }}
                  autoFocus
                  className="px-2 py-0.5 bg-slate-900 text-emerald-400 border border-emerald-500 rounded text-xs font-bold outline-none select-text"
                />
              ) : (
                <button
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  tabIndex={isActive ? 0 : -1}
                  onClick={() => onSelectSheet(s.id)}
                  onDoubleClick={() => startRename(s)}
                  data-vgt-grid-active-tab={isActive ? 'true' : undefined}
                  className={`flex items-center space-x-1.5 px-3 py-1 rounded-t text-xs transition-all border-b-2 ${
                    isActive
                      ? 'font-bold'
                      : 'bg-transparent text-slate-400 border-transparent hover:text-slate-200 hover:bg-white/5'
                  }`}
                  style={{
                    borderBottomColor: s.tabColor || undefined,
                  }}
                >
                  <Table2 className="w-3 h-3" />
                  <span>{s.name}</span>
                </button>
              )}

              {/* Tab Menu Trigger */}
              <button
                type="button"
                onClick={() => setMenuSheetId(menuSheetId === s.id ? null : s.id)}
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-white/10 text-slate-400 hover:text-white transition-opacity ml-[-8px] mr-1"
                aria-label={copy.sheetOptions} title={copy.sheetOptions}
              >
                <MoreVertical className="w-3 h-3" />
              </button>

              {/* Context Menu Dropdown */}
              {menuSheetId === s.id && (
                <div className="absolute bottom-8 left-0 z-50 w-44 bg-slate-900 border border-white/15 rounded shadow-xl py-1 text-xs">
                  <button
                    type="button"
                    onClick={() => startRename(s)}
                    className="w-full text-left px-3 py-1.5 hover:bg-white/10 flex items-center gap-2 text-slate-200"
                  >
                    <span>{copy.renameSheet}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onDuplicateSheet(s.id);
                      setMenuSheetId(null);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-white/10 flex items-center gap-2 text-slate-200"
                  >
                    <Copy className="w-3 h-3 text-blue-400" />
                    <span>{copy.duplicateSheet}</span>
                  </button>

                  <div className="border-t border-white/10 my-1" />

                  {/* Reorder */}
                  <div className="flex px-3 py-1 gap-1">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => onReorderSheet(s.id, 'left')}
                      className="flex-1 py-1 rounded bg-white/5 hover:bg-white/10 disabled:opacity-30 flex items-center justify-center gap-1 text-[0.625rem]"
                    >
                      <ArrowLeft className="w-3 h-3" />
                      <span>{copy.left}</span>
                    </button>
                    <button
                      type="button"
                      disabled={idx === visibleSheets.length - 1}
                      onClick={() => onReorderSheet(s.id, 'right')}
                      className="flex-1 py-1 rounded bg-white/5 hover:bg-white/10 disabled:opacity-30 flex items-center justify-center gap-1 text-[0.625rem]"
                    >
                      <ArrowRight className="w-3 h-3" />
                      <span>{copy.right}</span>
                    </button>
                  </div>

                  {/* Tab Color */}
                  <div className="px-3 py-1.5">
                    <div className="text-[0.625rem] text-slate-500 mb-1 flex items-center gap-1">
                      <Palette className="w-3 h-3" />
                      <span>{copy.tabColor}</span>
                    </div>
                    <div className="flex gap-1">
                      {colors.map((c) => (
                        <button aria-label={copy.setTabColor(c)}
                          key={c}
                          type="button"
                          onClick={() => {
                            onChangeTabColor(s.id, c);
                            setMenuSheetId(null);
                          }}
                          className="w-4 h-4 rounded-full border border-white/20 hover:scale-110 transition-transform"
                          style={{ backgroundColor: c }}
                        />
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          onChangeTabColor(s.id, undefined);
                          setMenuSheetId(null);
                        }}
                        className="w-4 h-4 rounded-full bg-slate-800 border border-white/20 text-[0.5625rem] flex items-center justify-center text-slate-400"
                        title={copy.none}
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  <div className="border-t border-white/10 my-1" />
                  <button type="button" onClick={() => { onSetSheetVisibility(s.id, 'hidden'); setMenuSheetId(null); }} className="w-full text-left px-3 py-1.5 hover:bg-white/10 text-slate-200">{copy.hideSheet}</button>
                  <button type="button" onClick={() => { onSetSheetVisibility(s.id, 'very-hidden'); setMenuSheetId(null); }} className="w-full text-left px-3 py-1.5 hover:bg-white/10 text-amber-200">{copy.veryHidden}</button>

                  <div className="border-t border-white/10 my-1" />

                  <button
                    type="button"
                    disabled={sheets.length <= 1}
                    onClick={() => {
                      onDeleteSheet(s.id);
                      setMenuSheetId(null);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-rose-500/20 text-rose-300 disabled:opacity-30 flex items-center gap-2"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>{copy.deleteSheet}</span>
                  </button>
                </div>
              )}
            </div>
          );
        })}

        <button
          type="button"
          onClick={onAddSheet}
          className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
          aria-label={copy.addSheet} title={copy.addSheet}
        >
          <Plus className="w-3.5 h-3.5" />
        </button>

        {hiddenSheets.length > 0 && <div className="relative">
          <button type="button" onClick={() => setHiddenMenuOpen((value) => !value)} className="px-2 py-1 rounded hover:bg-white/10 text-amber-300 text-[0.625rem]">{copy.hiddenCount(hiddenSheets.length)}</button>
          {hiddenMenuOpen && <div className="absolute bottom-8 left-0 z-50 w-52 bg-slate-900 border border-white/15 rounded shadow-xl py-1">
            {hiddenSheets.map((sheet) => <button key={sheet.id} type="button" onClick={() => { onSetSheetVisibility(sheet.id, 'visible'); setHiddenMenuOpen(false); }} className="w-full text-left px-3 py-1.5 hover:bg-white/10 text-slate-200 flex justify-between"><span>{sheet.name}</span><span className="text-[0.5625rem] text-slate-500">{sheet.veryHidden ? copy.veryHiddenCaps : copy.hidden}</span></button>)}
          </div>}
        </div>}
      </div>

      {/* View Options & Zoom Controls */}
      <div className="flex items-center space-x-3 text-[0.6875rem]">
        {/* Toggle Gridlines */}
        <button
          type="button"
          onClick={() => onUpdateActiveSheet({ showGridlines: !showGridlines })}
          aria-pressed={showGridlines}
          data-vgt-grid-active-control={showGridlines ? 'true' : undefined}
          className={`flex items-center space-x-1 px-1.5 py-0.5 rounded transition-colors ${
            showGridlines ? 'hover:bg-white/5' : 'text-slate-500 hover:text-slate-300'
          }`}
          title={copy.toggleGridlines}
        >
          <Grid className="w-3 h-3" />
          <span>{copy.gridlines}</span>
        </button>

        {/* Freeze Panes Indicator / Toggle */}
        <button
          type="button"
          aria-pressed={isFrozen}
          data-vgt-grid-active-control={isFrozen ? 'true' : undefined}
          onClick={() =>
            onUpdateActiveSheet({
              freezeRows: isFrozen ? 0 : 1,
              freezeCols: isFrozen ? 0 : 1,
            })
          }
          className={`flex items-center space-x-1 px-1.5 py-0.5 rounded transition-colors ${
            isFrozen ? 'border' : 'text-slate-400 hover:text-slate-200'
          }`}
          title={copy.freezePanesTitle}
        >
          <span>{isFrozen ? copy.frozenPanes : copy.freezePanes}</span>
        </button>

        {/* Toggle Canvas Virtualization Engine */}
        <button
          type="button"
          aria-pressed={Boolean(activeSheet?.useVirtualCanvas)}
          data-vgt-grid-active-control={activeSheet?.useVirtualCanvas ? 'true' : undefined}
          onClick={() => onUpdateActiveSheet({ useVirtualCanvas: !activeSheet?.useVirtualCanvas })}
          className={`flex items-center space-x-1 px-1.5 py-0.5 rounded transition-colors ${
            activeSheet?.useVirtualCanvas ? 'border' : 'text-slate-400 hover:text-slate-200'
          }`}
          title={copy.canvasTitle}
        >
          <span>{activeSheet?.useVirtualCanvas ? copy.canvasActive : copy.canvas}</span>
        </button>

        {/* Zoom Selector */}
        <select
          aria-label={copy.zoomLevel}
          value={zoom}
          onChange={(e) => onUpdateActiveSheet({ zoom: Number(e.target.value) })}
          className="bg-slate-900 border border-white/10 rounded px-1.5 py-0.5 text-slate-300 text-[0.625rem] outline-none"
        >
          <option value={75}>75%</option>
          <option value={100}>100%</option>
          <option value={125}>125%</option>
          <option value={150}>150%</option>
        </select>

        <span className="text-slate-600">|</span>

        <button
          type="button"
          disabled={!collaborationAvailable || collaborationConnecting}
          onClick={onToggleCollaboration}
          className={`flex items-center gap-1 px-1.5 py-0.5 rounded border transition-colors ${collaborationEnabled ? 'bg-cyan-500/15 border-cyan-500/30 text-cyan-200' : 'border-white/10 text-slate-400 hover:text-slate-200'} disabled:opacity-40`}
          title={collaborationError ? copy.collaborationError : collaborationAvailable ? copy.collaborationTitle : copy.collaborationUnavailable}
          aria-label={collaborationError ? copy.collaborationError : collaborationAvailable ? copy.collaborationTitle : copy.collaborationUnavailable}
        >
          <Users className="w-3 h-3" />
          <span>{collaborationConnecting ? copy.collaborationConnecting : collaborationEnabled ? copy.syncGraph(collaborationPeerCount) : 'SyncGraph'}</span>
          {collaborationConflictCount > 0 && <span className="text-amber-300">· {copy.conflicts(collaborationConflictCount)}</span>}
        </button>

        <span className="text-slate-600">|</span>

        {/* Engine Status */}
        <span className="flex items-center space-x-1 text-emerald-400">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span>{copy.engineActive}</span>
        </span>
      </div>
    </footer>
  );
};
