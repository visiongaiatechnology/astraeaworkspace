// STATUS: PLATIN — Quiet status line that reports real document facts
//
// ASTRAEA WRITER 50 V2, WR-024: the status line must be readable in the Workspace
// language — "Wörter / Zeichen / Absätze / Seiten / Min. Lesezeit" — and not a
// mixture of English fragments and internal counters. Every label comes from the
// canonical Workspace locale catalog, so an EN/RU document does not fall back to a
// raw key.
import React from 'react';
import { Clock } from 'lucide-react';
import { useWorkspaceLocale, workspaceText } from '../../../../shell/localization/workspaceLocale';

export interface WriterStatusBarProps {
  paperSize: string;
  stats: {
    words: number;
    characters: number;
    paragraphs: number;
    pages: number;
    readingTimeMin: number;
  };
  trackChangesActive: boolean;
  isTocOpen: boolean;
  onToggleToc: () => void;
  zoom: number;
  onSetZoom: (zoom: number) => void;
}

export const WriterStatusBar: React.FC<WriterStatusBarProps> = ({
  paperSize,
  stats,
  trackChangesActive,
  isTocOpen,
  onToggleToc,
  zoom,
  onSetZoom,
}) => {
  const { locale } = useWorkspaceLocale();
  const text = (message: Parameters<typeof workspaceText>[0]): string => workspaceText(message, locale);

  return (
    <div
      data-vgt-workspace-chrome="status"
      role="status"
      aria-label="Dokumentstatus"
      className="z-20 flex w-full select-none items-center justify-between border-t border-white/10 bg-slate-950 px-4 py-1.5 font-mono text-[0.6875rem] text-slate-400"
    >
      <div className="flex items-center gap-3">
        <span className="font-semibold text-slate-300">{paperSize}</span>
        <span aria-hidden="true">•</span>
        <span>{stats.words.toLocaleString(locale)} {text('writer.statusWords')}</span>
        <span aria-hidden="true">•</span>
        <span>{stats.characters.toLocaleString(locale)} {text('writer.statusCharacters')}</span>
        <span aria-hidden="true">•</span>
        <span>{stats.paragraphs} {text('writer.statusParagraphs')}</span>
        <span aria-hidden="true">·</span>
        <span>{stats.pages} {text('writer.statusPages')}</span>
        <span aria-hidden="true">•</span>
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3 text-slate-500" aria-hidden="true" />
          <span>{stats.readingTimeMin} {text('writer.statusReadingTime')}</span>
        </span>
      </div>

      <div className="flex items-center gap-4">
        {trackChangesActive && (
          <span className="rounded bg-blue-500/20 px-2 py-0.5 text-[0.625rem] font-semibold text-blue-400">
            {text('writer.statusTrackChanges')}
          </span>
        )}
        <button
          type="button"
          onClick={onToggleToc}
          aria-pressed={isTocOpen}
          className="text-slate-400 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70"
        >
          {isTocOpen ? text('writer.statusHideOutline') : text('writer.statusShowOutline')}
        </button>
        <div className="flex items-center gap-1.5">
          <input
            type="range"
            min={50}
            max={200}
            value={zoom}
            onChange={(event) => onSetZoom(Number(event.target.value))}
            aria-label={text('writer.statusZoom')}
            aria-valuetext={`${zoom} %`}
            className="h-1 w-20 cursor-pointer rounded-lg bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70"
          />
          <span className="w-8 text-right">{zoom}%</span>
        </div>
      </div>
    </div>
  );
};
