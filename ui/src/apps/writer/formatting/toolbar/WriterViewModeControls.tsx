// STATUS: DIAMANT VGT SUPREME — Sovereign Writer View Modes & Zoom Navigation Controls
import React from 'react';
import {
  BookOpen,
  BookOpenText,
  Columns,
  Eye,
  FileCode,
  FileText,
  Maximize2,
  Ruler,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { ViewMode } from '../../types';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import { writerToolbarText } from './writerToolbarLocale';

export interface WriterViewModeControlsProps {
  viewMode: ViewMode;
  onSetViewMode: (mode: ViewMode) => void;
  zoom: number;
  onSetZoom: (zoom: number) => void;
  showRuler?: boolean;
  onToggleRuler?: () => void;
  isTwoPageSpread?: boolean;
  onToggleTwoPageSpread?: () => void;
}

const ZOOM_PRESETS = [50, 75, 100, 125, 150, 200];

export const WriterViewModeControls: React.FC<WriterViewModeControlsProps> = ({
  viewMode,
  onSetViewMode,
  zoom,
  onSetZoom,
  showRuler = true,
  onToggleRuler,
  isTwoPageSpread = false,
  onToggleTwoPageSpread,
}) => {
  const { locale } = useWorkspaceLocale();
  const t = (message: Parameters<typeof writerToolbarText>[0]): string => writerToolbarText(message, locale);

  return (
    <div className="flex max-w-full items-center gap-2 overflow-x-auto select-none" role="group" aria-label={t('viewModes')}>
      {/* View Modes Group */}
      <div
        className="flex items-center bg-slate-900 border border-white/10 rounded p-0.5 shadow-inner"
        role="group"
        aria-label={t('documentView')}
      >
        <button
          type="button"
          onClick={() => onSetViewMode('print')}
          aria-pressed={viewMode === 'print'}
          data-writer-view-mode="print"
          className={`flex items-center gap-1 px-2 py-0.5 rounded text-[0.6875rem] font-medium transition-all motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 ${
            viewMode === 'print' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
          }`}
          title={t('printViewHint')}
        >
          <FileText className="w-3 h-3" />
          <span>{t('printView')}</span>
        </button>

        <button
          type="button"
          onClick={() => onSetViewMode('continuous')}
          aria-pressed={viewMode === 'continuous'}
          data-writer-view-mode="continuous"
          className={`flex items-center gap-1 px-2 py-0.5 rounded text-[0.6875rem] font-medium transition-all motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 ${
            viewMode === 'continuous' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
          }`}
          title={t('webViewHint')}
        >
          <FileCode className="w-3 h-3" />
          <span>{t('webView')}</span>
        </button>

        <button
          type="button"
          onClick={() => onSetViewMode('draft')}
          aria-pressed={viewMode === 'draft'}
          data-writer-view-mode="draft"
          className={`flex items-center gap-1 px-2 py-0.5 rounded text-[0.6875rem] font-medium transition-all motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400/70 focus:ring-2 focus:ring-emerald-300 ${
            viewMode === 'draft' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
          }`}
          title={t('draftViewHint')}
        >
          <Eye className="w-3 h-3" />
          <span>{t('draftView')}</span>
        </button>

        <button
          type="button"
          onClick={() => onSetViewMode('outline')}
          aria-pressed={viewMode === 'outline'}
          data-writer-view-mode="outline"
          className={`flex items-center gap-1 px-2 py-0.5 rounded text-[0.6875rem] font-medium transition-all motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 focus:ring-2 focus:ring-amber-300 ${
            viewMode === 'outline' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
          }`}
          title={t('outlineViewHint')}
        >
          <Columns className="w-3 h-3" />
          <span>{t('outlineView')}</span>
        </button>

        <button
          type="button"
          onClick={() => onSetViewMode('reading')}
          aria-pressed={viewMode === 'reading'}
          data-writer-view-mode="reading"
          className={`flex items-center gap-1 px-2 py-0.5 rounded text-[0.6875rem] font-medium transition-all motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/70 focus:ring-2 focus:ring-teal-300 ${
            viewMode === 'reading' ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
          }`}
          title={t('readingViewHint')}
        >
          <BookOpenText className="w-3 h-3" />
          <span>{t('readingView')}</span>
        </button>

        <button
          type="button"
          onClick={() => onSetViewMode('focus')}
          aria-pressed={viewMode === 'focus'}
          data-writer-view-mode="focus"
          className={`flex items-center gap-1 px-2 py-0.5 rounded text-[0.6875rem] font-medium transition-all motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400/70 focus:ring-2 focus:ring-purple-300 ${
            viewMode === 'focus' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
          }`}
          title={t('focusViewHint')}
        >
          <Maximize2 className="w-3 h-3" />
          <span>{t('focusView')}</span>
        </button>
      </div>

      {/* Two-Page Spread & Ruler Toggles */}
      <div className="flex items-center bg-slate-900 border border-white/10 rounded p-0.5">
        {onToggleTwoPageSpread && viewMode === 'print' && (
          <button
            type="button"
            onClick={onToggleTwoPageSpread}
            aria-pressed={isTwoPageSpread}
            aria-label={t('twoPageView')}
            className={`p-1 rounded text-[0.6875rem] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 ${
              isTwoPageSpread ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
            title={t('twoPageView')}
          >
            <BookOpen className="w-3.5 h-3.5" />
          </button>
        )}
        {onToggleRuler && viewMode === 'print' && (
          <button
            type="button"
            onClick={onToggleRuler}
            aria-pressed={showRuler}
            aria-label={t('toggleRuler')}
            className={`p-1 rounded text-[0.6875rem] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 ${
              showRuler ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
            title={t('toggleRuler')}
          >
            <Ruler className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Zoom Controls */}
      <div className="flex items-center gap-1 bg-slate-900 border border-white/10 rounded px-1.5 py-0.5">
        <button
          type="button"
          onClick={() => onSetZoom(Math.max(50, zoom - 10))}
          className="text-slate-400 hover:text-white p-0.5 rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
          aria-label={t('zoomOut')}
          title={t('zoomOut')}
        >
          <ZoomOut className="w-3 h-3" />
        </button>

        <select
          value={zoom}
          onChange={(e) => onSetZoom(Number(e.target.value))}
          className="bg-transparent border-none text-[0.6875rem] font-mono text-slate-200 px-1 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 cursor-pointer hover:text-white"
          title={t('chooseZoom')}
          aria-label={t('chooseZoom')}
        >
          {ZOOM_PRESETS.map((preset) => (
            <option key={preset} value={preset} className="bg-slate-900 text-slate-200">
              {preset}%
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => onSetZoom(Math.min(200, zoom + 10))}
          className="text-slate-400 hover:text-white p-0.5 rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
          aria-label={t('zoomIn')}
          title={t('zoomIn')}
        >
          <ZoomIn className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
};
