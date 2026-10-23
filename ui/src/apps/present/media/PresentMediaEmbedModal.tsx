// STATUS: PLATIN — explicit external vs embedded media with localized, opaque validation feedback.
import React, { useEffect, useState } from 'react';
import { Film, Music, X, Check, Link2, HardDrive } from 'lucide-react';
import type { PresentMediaSource, PresentSlide } from '../../../shared/contracts/workspace';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { presentMediaCopy, presentMediaErrorMessage } from '../locale/presentMediaLocale';
import { presentMediaSourceFromFile, validatePresentExternalMediaUrl, validatePresentTranscript, validatePresentVttText } from './presentMediaSecurity';
import { resolvePresentMediaPreview } from './presentMediaPreview';

interface PresentMediaEmbedModalProps {
  isOpen: boolean;
  slide: PresentSlide;
  onClose: () => void;
  onUpdateMedia: (patch: { audioUrl?: string; videoUrl?: string; audioMedia?: PresentMediaSource; videoMedia?: PresentMediaSource }) => void;
}

export const PresentMediaEmbedModal: React.FC<PresentMediaEmbedModalProps> = ({ isOpen, slide, onClose, onUpdateMedia }) => {
  const { locale } = useWorkspaceLocale();
  const copy = presentMediaCopy(locale);
  const [activeTab, setActiveTab] = useState<'video' | 'audio'>('video');
  const [mode, setMode] = useState<'external' | 'embedded'>('external');
  const [externalUrl, setExternalUrl] = useState('');
  const [embedded, setEmbedded] = useState<PresentMediaSource | undefined>(undefined);
  const [error, setError] = useState('');
  const [subtitlesVtt, setSubtitlesVtt] = useState('');
  const [transcript, setTranscript] = useState('');
  /**
   * Explicit consent to contact the external host. Without it no media element is rendered for an
   * external URL, so typing or pasting a URL cannot cause a network request (Paket 22).
   */
  const [externalPreviewApproved, setExternalPreviewApproved] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const current = activeTab === 'video' ? slide.videoMedia : slide.audioMedia;
    const legacy = activeTab === 'video' ? slide.videoUrl : slide.audioUrl;
    setMode(current?.mode ?? 'external');
    setExternalUrl(current?.externalUrl ?? legacy ?? '');
    setEmbedded(current?.mode === 'embedded' ? current : undefined);
    setSubtitlesVtt(current?.subtitlesVtt ?? '');
    setTranscript(current?.transcript ?? '');
    setError('');
    // Consent is per (dialog session, URL): reopening must not silently re-contact a host.
    setExternalPreviewApproved(false);
  }, [activeTab, isOpen, slide.audioMedia, slide.audioUrl, slide.videoMedia, slide.videoUrl]);

  if (!isOpen) return null;
  const mediaKind = activeTab;
  const preview = resolvePresentMediaPreview({
    mode,
    embeddedDataUrl: embedded?.dataUrl,
    externalUrl,
    externalPreviewApproved,
    mediaKind,
  });

  const save = () => {
    try {
      const source = mode === 'external'
        ? { mode: 'external' as const, mediaKind, mimeType: mediaKind === 'video' ? 'video/external' : 'audio/external', name: 'External media', externalUrl: validatePresentExternalMediaUrl(externalUrl) }
        : embedded;
      if (!source) throw new Error('Select a validated local media file.');
      const accessibleSource: PresentMediaSource = {
        ...source,
        subtitlesVtt: mediaKind === 'video' && subtitlesVtt.trim() ? validatePresentVttText(subtitlesVtt) : undefined,
        transcript: validatePresentTranscript(transcript),
      };
      onUpdateMedia(mediaKind === 'video'
        ? { videoMedia: accessibleSource, videoUrl: accessibleSource.mode === 'external' ? accessibleSource.externalUrl : undefined }
        : { audioMedia: accessibleSource, audioUrl: accessibleSource.mode === 'external' ? accessibleSource.externalUrl : undefined });
      onClose();
    } catch (cause: unknown) {
      setError(presentMediaErrorMessage(locale, cause));
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      void presentMediaSourceFromFile(file, mediaKind)
        .then((source) => { setEmbedded(source); setError(''); })
        .catch((cause: unknown) => setError(presentMediaErrorMessage(locale, cause)));
    }
    event.currentTarget.value = '';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-label={copy.dialog}>
      <div className="bg-slate-900 border border-white/15 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden text-xs">
        <div className="px-4 py-3 bg-slate-950 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2"><Film className="w-4 h-4 text-purple-400" /><span className="font-bold text-slate-100 text-sm">{copy.dialog}</span></div>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-white/10 text-slate-400" aria-label={copy.close}><X className="w-4 h-4" /></button>
        </div>
        <div className="grid grid-cols-2 gap-1 p-1 bg-slate-950/50 border-b border-white/10">
          <button type="button" onClick={() => setActiveTab('video')} className={`py-2 rounded flex items-center justify-center gap-1 ${activeTab === 'video' ? 'bg-purple-600/30 text-purple-200' : 'text-slate-400'}`}><Film className="w-3.5 h-3.5" />{copy.video}</button>
          <button type="button" onClick={() => setActiveTab('audio')} className={`py-2 rounded flex items-center justify-center gap-1 ${activeTab === 'audio' ? 'bg-purple-600/30 text-purple-200' : 'text-slate-400'}`}><Music className="w-3.5 h-3.5" />{copy.audio}</button>
        </div>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setMode('external')} className={`rounded-lg border p-3 text-left ${mode === 'external' ? 'border-blue-500/40 bg-blue-500/10 text-blue-200' : 'border-white/10 text-slate-400'}`}>
              <Link2 className="w-4 h-4 mb-1" /><b className="block">{copy.externalLink}</b><span className="text-[0.625rem]">{copy.externalDescription}</span>
            </button>
            <button type="button" onClick={() => setMode('embedded')} className={`rounded-lg border p-3 text-left ${mode === 'embedded' ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' : 'border-white/10 text-slate-400'}`}>
              <HardDrive className="w-4 h-4 mb-1" /><b className="block">{copy.embeddedAsset}</b><span className="text-[0.625rem]">{copy.embeddedDescription}</span>
            </button>
          </div>
          {mode === 'external' ? (
            <input type="url" aria-label={copy.externalLink} value={externalUrl} onChange={(event) => setExternalUrl(event.target.value)} placeholder={copy.mediaUrl} className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-slate-100 outline-none" />
          ) : (
            <label className="block rounded-lg border border-dashed border-emerald-500/30 bg-emerald-500/5 p-4 text-center text-emerald-300 cursor-pointer">
              {embedded ? `${embedded.name} · ${Math.round((embedded.sizeBytes ?? 0) / 1024)} KiB` : mediaKind === 'video' ? copy.chooseVideo : copy.chooseAudio}
              <input aria-label={mediaKind === 'video' ? copy.chooseVideo : copy.chooseAudio} type="file" accept={mediaKind === 'video' ? 'video/mp4,video/webm' : 'audio/mpeg,audio/wav,audio/ogg'} className="hidden" onChange={handleFileChange} />
            </label>
          )}
          <section className="rounded-lg border border-white/10 bg-black/20 p-3 space-y-2" aria-label={copy.accessibility}>
            <div className="text-[0.625rem] font-semibold uppercase tracking-wider text-slate-400">{copy.accessibility}</div>
            {mediaKind === 'video' && <label className="block text-[0.625rem] text-slate-400">{copy.subtitles}<textarea aria-label={copy.subtitles} value={subtitlesVtt} onChange={(event) => setSubtitlesVtt(event.target.value)} placeholder={'WEBVTT\n\n00:00.000 --> 00:03.000\nCaption text'} className="mt-1 h-24 w-full rounded-md border border-white/10 bg-slate-950 p-2 font-mono text-[0.625rem] text-slate-200" /></label>}
            <label className="block text-[0.625rem] text-slate-400">{mediaKind === 'video' ? copy.transcriptAlternative : copy.audioTranscript}<textarea aria-label={mediaKind === 'video' ? copy.transcriptAlternative : copy.audioTranscript} value={transcript} onChange={(event) => setTranscript(event.target.value)} placeholder={copy.transcriptPlaceholder} className="mt-1 h-20 w-full rounded-md border border-white/10 bg-slate-950 p-2 text-[0.625rem] text-slate-200" /></label>
            {mediaKind === 'video' && (
              <label className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2 text-[0.625rem] text-amber-100">
                <input
                  type="checkbox"
                  aria-label={copy.previewConsent}
                  checked={externalPreviewApproved}
                  disabled={mode === 'embedded'}
                  onChange={(event) => setExternalPreviewApproved(event.target.checked)}
                />
                <span>{copy.previewConsent}</span>
              </label>
            )}
            {mode === 'external' && mediaKind === 'audio' && (
              <label className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2 text-[0.625rem] text-amber-100">
                <input
                  type="checkbox"
                  aria-label={copy.previewConsent}
                  checked={externalPreviewApproved}
                  onChange={(event) => setExternalPreviewApproved(event.target.checked)}
                />
                <span>{copy.previewConsent}</span>
              </label>
            )}
            {/* Only a decision from `resolvePresentMediaPreview` may become a media `src`. An
                unapproved or invalid external URL renders no element at all, so no request is made. */}
            {preview.src && mediaKind === 'video' && <video controls preload="metadata" data-present-media-preview="video" className="max-h-40 w-full rounded bg-black" src={preview.src}>{subtitlesVtt.trim() && <track kind="subtitles" srcLang="en" label={copy.captions} default src={`data:text/vtt;charset=utf-8,${encodeURIComponent(subtitlesVtt)}`} />}</video>}
            {preview.src && mediaKind === 'audio' && <audio controls preload="metadata" data-present-media-preview="audio" className="w-full" src={preview.src} />}
            {!preview.src && preview.contactsHost && (
              <div role="status" data-present-media-preview-blocked="true" className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-2 text-[0.625rem] text-amber-100">
                {copy.previewBlocked(preview.host ?? 'the external host')}
              </div>
            )}
          </section>
          {error && <div role="alert" className="rounded-lg border border-red-500/20 bg-red-500/10 p-2 text-red-300">{copy.validationError}</div>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-3 py-2 rounded-lg bg-white/5 text-slate-300">{copy.cancel}</button>
            <button type="button" onClick={save} className="px-3 py-2 rounded-lg bg-purple-600 text-white font-semibold flex items-center gap-1"><Check className="w-3.5 h-3.5" />{copy.apply}</button>
          </div>
        </div>
      </div>
    </div>
  );
};
