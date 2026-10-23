// STATUS: DIAMANT VGT SUPREME — Present Video Deck Export Modal
import React, { useState } from 'react';
import { Video, X, Play, Download, Settings2, CheckCircle2, Film, Captions, Volume2 } from 'lucide-react';
import { PresentDocumentModel } from '../../../../shared/contracts/workspace';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import {
  synthesizeDeckVideo,
  downloadVideoResult,
  downloadCaptionSidecar,
  downloadNarrationSidecar,
  VideoExportOptions,
  VideoExportResult,
} from './presentVideoExport';
import { presentExportDeliveryText, presentExportFailureText } from '../presentExportStatus';

interface PresentVideoExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  presentData: PresentDocumentModel;
  presentationTitle?: string;
}

export const PresentVideoExportModal: React.FC<PresentVideoExportModalProps> = ({
  isOpen,
  onClose,
  presentData,
  presentationTitle = 'Präsentation',
}) => {
  const { locale } = useWorkspaceLocale();
  const [resolution, setResolution] = useState<'720p' | '1080p' | '4k'>('1080p');
  const [frameRate, setFrameRate] = useState<30 | 60>(30);
  const [slideDuration, setSlideDuration] = useState<number>(5);
  const [includeAnimations, setIncludeAnimations] = useState<boolean>(true);
  const [includeTransitions, setIncludeTransitions] = useState<boolean>(true);
  const [includeNarration, setIncludeNarration] = useState<boolean>(true);
  const [includeCamera, setIncludeCamera] = useState<boolean>(true);
  const [includePointerInk, setIncludePointerInk] = useState<boolean>(true);
  const [includeCaptions, setIncludeCaptions] = useState<boolean>(true);
  const [mimeType, setMimeType] = useState<'video/webm' | 'video/mp4'>('video/webm');

  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [currentSlideIdx, setCurrentSlideIdx] = useState<number>(0);
  const [exportResult, setExportResult] = useState<VideoExportResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  /** Release Beta 0.1: states whether the video/sidecar was written or only downloaded. */
  const [deliveryNotice, setDeliveryNotice] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleStartExport = async () => {
    setIsExporting(true);
    setProgress(0);
    setErrorMsg(null);
    setExportResult(null);

    try {
      const opts: Partial<VideoExportOptions> = {
        locale,
        resolution,
        frameRate,
        defaultSlideDurationSeconds: slideDuration,
        includeAnimations,
        includeTransitions,
        includeNarration,
        includeCamera,
        includePointerInk,
        includeCaptions,
        mimeType,
      };

      const result = await synthesizeDeckVideo(presentData, opts, (pct, sIdx) => {
        setProgress(pct);
        setCurrentSlideIdx(sIdx);
      });

      setExportResult(result);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unerwarteter Fehler beim Video-Export.');
    } finally {
      setIsExporting(false);
    }
  };

  const exportFile = async (task: () => Promise<import('../../../../shared/interchange/exportDelivery').ExportDeliveryResult>) => {
    setErrorMsg(null);
    setDeliveryNotice(null);
    try {
      setDeliveryNotice(presentExportDeliveryText(locale, await task()));
    } catch (cause) {
      setErrorMsg(presentExportFailureText(locale, cause));
    }
  };

  const handleDownload = () => {
    if (!exportResult) return;
    const filename = `${presentationTitle.trim().replace(/[^a-zA-Z0-9_-]/g, '_')}_Deck.${exportResult.format}`;
    void exportFile(() => downloadVideoResult(exportResult, filename));
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-white/15 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150 text-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center space-x-2 text-rose-400">
            <Video className="w-5 h-5" />
            <h3 className="text-sm font-bold text-slate-100">Präsentations-Video & MP4/WebM Deck-Export</h3>
          </div>
          <button aria-label="Close Präsentations-Video & MP4/WebM Deck-Export dialog"
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Configuration */}
        <div className="space-y-3 bg-slate-800/50 p-4 rounded-xl border border-white/5 text-xs">
          <div className="flex items-center space-x-2 text-slate-300 font-semibold mb-1">
            <Settings2 className="w-4 h-4 text-rose-400" />
            <span>Video-Rendering-Parameter</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[0.6875rem] text-slate-400 mb-1">Auflösung:</label>
              <select
                value={resolution}
                onChange={(e) => setResolution(e.target.value === '720p' || e.target.value === '4k' ? e.target.value : '1080p')}
                disabled={isExporting}
                className="w-full bg-slate-900 border border-white/10 rounded-lg px-2.5 py-1.5 text-slate-200"
              >
                <option value="720p">720p HD (1280 × 720)</option>
                <option value="1080p">1080p Full HD (1920 × 1080)</option>
                <option value="4k">4K Ultra HD (3840 × 2160)</option>
              </select>
            </div>

            <div>
              <label className="block text-[0.6875rem] text-slate-400 mb-1">Bildwiederholrate (FPS):</label>
              <select
                value={frameRate}
                onChange={(e) => setFrameRate(e.target.value === '60' ? 60 : 30)}
                disabled={isExporting}
                className="w-full bg-slate-900 border border-white/10 rounded-lg px-2.5 py-1.5 text-slate-200"
              >
                <option value={30}>30 FPS (Standard)</option>
                <option value={60}>60 FPS (Flüssig / Ultra)</option>
              </select>
            </div>

            <div>
              <label className="block text-[0.6875rem] text-slate-400 mb-1">Container / Encoder:</label>
              <select value={mimeType} onChange={(e) => setMimeType(e.target.value === 'video/mp4' ? 'video/mp4' : 'video/webm')} disabled={isExporting} className="w-full bg-slate-900 border border-white/10 rounded-lg px-2.5 py-1.5 text-slate-200">
                <option value="video/webm">WebM (recommended)</option>
                <option value="video/mp4">MP4 (only when runtime encoder supports it)</option>
              </select>
            </div>

            <div>
              <label className="block text-[0.6875rem] text-slate-400 mb-1">Standarddauer pro Folie:</label>
              <div className="flex items-center space-x-2">
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={slideDuration}
                  onChange={(e) => setSlideDuration(Math.max(1, Number(e.target.value)))}
                  disabled={isExporting}
                  className="w-full bg-slate-900 border border-white/10 rounded-lg px-2.5 py-1.5 text-slate-200"
                />
                <span className="text-slate-400">Sek.</span>
              </div>
            </div>

            <div className="space-y-1.5 pt-2 col-span-2 grid grid-cols-2 gap-x-4">
              {[
                { label: 'Animations', checked: includeAnimations, setChecked: setIncludeAnimations },
                { label: 'Transitions', checked: includeTransitions, setChecked: setIncludeTransitions },
                { label: 'Narration audio', checked: includeNarration, setChecked: setIncludeNarration },
                { label: 'Camera picture-in-picture', checked: includeCamera, setChecked: setIncludeCamera },
                { label: 'Pointer / ink recording', checked: includePointerInk, setChecked: setIncludePointerInk },
                { label: 'Burn captions + WebVTT', checked: includeCaptions, setChecked: setIncludeCaptions },
              ].map(({ label, checked, setChecked }) => (
                <label key={label} className="flex items-center space-x-2 cursor-pointer">
                  <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} disabled={isExporting} className="rounded border-white/20 bg-slate-900 text-rose-500"/>
                  <span className="text-slate-300">{label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Progress & Status */}
        {isExporting && (
          <div className="space-y-2 p-3 bg-slate-800/70 rounded-xl border border-rose-500/30">
            <div className="flex items-center justify-between text-xs">
              <span className="text-rose-300 font-medium flex items-center space-x-1.5">
                <Film className="w-3.5 h-3.5 animate-spin text-rose-400" />
                <span>Rendere Folie {currentSlideIdx + 1} von {presentData.slides.length}...</span>
              </span>
              <span className="font-mono text-slate-300">{progress}%</span>
            </div>
            <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-rose-500 to-amber-500 transition-[width] duration-200 ease-out motion-reduce:transition-none"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-300">
            {errorMsg}
          </div>
        )}

        {deliveryNotice && (
          <div role="status" data-present-video-delivery="true" className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-200 break-words">
            {deliveryNotice}
          </div>
        )}

        {exportResult && (
          <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl space-y-2 text-xs">
            <div className="flex items-center space-x-2 text-emerald-400 font-semibold">
              <CheckCircle2 className="w-4 h-4" />
              <span>Video-Deck erfolgreich synthetisiert!</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-[0.6875rem] text-slate-300">
              <div>Dauer: <span className="font-mono text-emerald-300">{exportResult.durationSeconds}s</span></div>
              <div>Auflösung: <span className="font-mono text-emerald-300">{exportResult.width}×{exportResult.height}</span></div>
              <div>Größe: <span className="font-mono text-emerald-300">{(exportResult.fileSizeBytes / (1024 * 1024)).toFixed(2)} MB</span></div>
            </div>
            {exportResult.warnings.map((warning) => <div key={warning} className="text-[0.625rem] text-amber-300">{warning}</div>)}
            <div className="flex flex-wrap gap-2 pt-1">
              <button type="button" onClick={() => { void exportFile(() => downloadCaptionSidecar(exportResult, `${presentationTitle.replace(/[^a-zA-Z0-9_-]/g, '_')}.vtt`)); }} className="px-2 py-1 rounded border border-white/10 hover:bg-white/5 flex items-center gap-1"><Captions className="w-3 h-3"/>Download WebVTT</button>
              {exportResult.narrationTracks.map((track) => <button key={`${track.slideId}:${track.takeId}`} type="button" onClick={() => { void exportFile(() => downloadNarrationSidecar(track)); }} className="px-2 py-1 rounded border border-white/10 hover:bg-white/5 flex items-center gap-1"><Volume2 className="w-3 h-3"/>{track.filename}</button>)}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end space-x-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isExporting}
            className="px-3.5 py-1.5 bg-white/5 hover:bg-white/10 text-xs rounded-lg text-slate-300"
          >
            Schließen
          </button>

          {!exportResult ? (
            <button
              type="button"
              onClick={handleStartExport}
              disabled={isExporting || presentData.slides.length === 0}
              className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-xs font-semibold rounded-lg text-white flex items-center space-x-1.5 shadow-lg shadow-rose-900/30"
            >
              <Play className="w-3.5 h-3.5" />
              <span>{isExporting ? 'Rendere Deck...' : 'Video erzeugen'}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleDownload}
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold rounded-lg text-white flex items-center space-x-1.5 shadow-lg shadow-emerald-900/30"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Video herunterladen ({exportResult.format.toUpperCase()})</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
