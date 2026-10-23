// STATUS: DIAMANT VGT SUPREME — presenter controls with explicit local audience/remote state
import React from 'react';
import '../../../../design-system/styles/AppToolbarBand.css';
import { Clock, Disc, Eraser, ExternalLink, Highlighter, Maximize2, Pause, PenTool, Play, Repeat2, Scan, ZoomIn, ZoomOut } from 'lucide-react';
import type { PresenterControlsCopy } from '../../locale/presentStudioLocale';

export type PresenterPointerTool = 'none' | 'laser' | 'pen' | 'highlighter' | 'eraser';

interface Props {
  copy: PresenterControlsCopy;
  elapsedLabel: string;
  currentTimeLabel: string;
  slideLabel: string;
  slideTimerLabel: string;
  paused: boolean;
  pointerTool: PresenterPointerTool;
  zoom: number;
  loopMode: boolean;
  kioskMode: boolean;
  audienceOpen: boolean;
  remoteAvailable: boolean;
  pairToken: string;
  onTogglePause: () => void;
  onSetPointerTool: (tool: PresenterPointerTool) => void;
  onZoom: (delta: number) => void;
  onToggleLoop: () => void;
  onToggleKiosk: () => void;
  onOpenAudience: () => void;
  onAudienceFullscreen: () => void;
}

const toolButton = (active: boolean) => `p-1.5 rounded-lg border ${active ? 'bg-blue-600/30 border-blue-400/50 text-white' : 'border-white/10 text-slate-300 hover:bg-white/5'}`;

export const PresenterControlBar: React.FC<Props> = ({
  copy, elapsedLabel, currentTimeLabel, slideLabel, slideTimerLabel, paused, pointerTool, zoom, loopMode, kioskMode,
  audienceOpen, remoteAvailable, pairToken, onTogglePause, onSetPointerTool, onZoom,
  onToggleLoop, onToggleKiosk, onOpenAudience, onAudienceFullscreen,
}) => (
  <div className="vgt-app-toolbar-band flex items-center justify-between gap-3 px-5 py-2 bg-slate-950/95 border-b border-white/10 z-30 text-xs overflow-x-auto" data-vgt-app-toolbar-band="presenter-controls">
    <div className="flex items-center gap-2 whitespace-nowrap">
      <span aria-label={copy.elapsedTime(elapsedLabel)} title={copy.elapsedTime(elapsedLabel)} className="flex items-center gap-1 rounded-lg border border-amber-500/20 bg-amber-500/10 px-2 py-1 font-mono font-bold text-amber-300"><Clock aria-hidden="true" className="w-3.5 h-3.5" />{elapsedLabel}</span>
      <time aria-label={copy.currentTime} title={copy.currentTime} className="font-mono text-slate-400">{currentTimeLabel}</time>
      <span className="font-mono text-cyan-300">{copy.slideTimer(slideTimerLabel)}</span>
      <span className="font-mono text-slate-400">{slideLabel}</span>
      <button aria-label={paused ? copy.resumeSlideshow : copy.pauseSlideshow} type="button" data-vgt-theme-active-control={paused ? 'soft' : undefined} className={toolButton(paused)} onClick={onTogglePause} title={paused ? copy.resumeSlideshow : copy.pauseSlideshow}>{paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}</button>
    </div>
    <div className="flex items-center gap-1 whitespace-nowrap">
      <button type="button" data-vgt-theme-active-control={pointerTool === 'laser' ? 'soft' : undefined} className={toolButton(pointerTool === 'laser')} onClick={() => onSetPointerTool(pointerTool === 'laser' ? 'none' : 'laser')} aria-label={copy.laserPointer} title={copy.laserPointer}><Disc className="w-3.5 h-3.5 text-red-400" /></button>
      <button type="button" data-vgt-theme-active-control={pointerTool === 'pen' ? 'soft' : undefined} className={toolButton(pointerTool === 'pen')} onClick={() => onSetPointerTool(pointerTool === 'pen' ? 'none' : 'pen')} aria-label={copy.pen} title={copy.pen}><PenTool className="w-3.5 h-3.5" /></button>
      <button type="button" data-vgt-theme-active-control={pointerTool === 'highlighter' ? 'soft' : undefined} className={toolButton(pointerTool === 'highlighter')} onClick={() => onSetPointerTool(pointerTool === 'highlighter' ? 'none' : 'highlighter')} aria-label={copy.highlighter} title={copy.highlighter}><Highlighter className="w-3.5 h-3.5 text-yellow-300" /></button>
      <button type="button" data-vgt-theme-active-control={pointerTool === 'eraser' ? 'soft' : undefined} className={toolButton(pointerTool === 'eraser')} onClick={() => onSetPointerTool(pointerTool === 'eraser' ? 'none' : 'eraser')} aria-label={copy.eraser} title={copy.eraser}><Eraser className="w-3.5 h-3.5" /></button>
      <span className="mx-1 h-5 w-px bg-white/10" />
      <button type="button" className={toolButton(false)} onClick={() => onZoom(-0.15)} aria-label={copy.zoomOut} title={copy.zoomOut}><ZoomOut className="w-3.5 h-3.5" /></button>
      <span className="w-10 text-center font-mono text-[0.625rem] text-slate-400">{Math.round(zoom * 100)}%</span>
      <button type="button" className={toolButton(false)} onClick={() => onZoom(0.15)} aria-label={copy.zoomIn} title={copy.zoomIn}><ZoomIn className="w-3.5 h-3.5" /></button>
      <button type="button" data-vgt-theme-active-control={loopMode ? 'soft' : undefined} className={toolButton(loopMode)} onClick={onToggleLoop} aria-label={copy.loopSequence} title={copy.loopSequence}><Repeat2 className="w-3.5 h-3.5" /></button>
      <button type="button" data-vgt-theme-active-control={kioskMode ? 'soft' : undefined} className={toolButton(kioskMode)} onClick={onToggleKiosk} aria-label={copy.kioskMode} title={copy.kioskMode}><Scan className="w-3.5 h-3.5" /></button>
      <span className="mx-1 h-5 w-px bg-white/10" />
      <button type="button" data-vgt-theme-active-control={audienceOpen ? 'soft' : undefined} className={toolButton(audienceOpen)} onClick={onOpenAudience} aria-label={copy.openAudience} title={copy.openAudience}><ExternalLink className="w-3.5 h-3.5" /></button>
      <button type="button" disabled={!audienceOpen} className={`${toolButton(false)} disabled:opacity-30`} onClick={onAudienceFullscreen} aria-label={copy.fullscreenAudience} title={copy.fullscreenAudience}><Maximize2 className="w-3.5 h-3.5" /></button>
      <span aria-live="polite" className={`ml-1 rounded border px-1.5 py-0.5 font-mono text-[0.5rem] ${remoteAvailable ? 'border-emerald-500/30 text-emerald-300' : 'border-white/10 text-slate-500'}`} title={copy.remoteTitle(remoteAvailable, pairToken)}>{copy.remoteStatus(remoteAvailable, remoteAvailable ? pairToken.slice(0, 12) : '')}</span>
    </div>
  </div>
);
