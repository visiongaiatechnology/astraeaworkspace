// STATUS: DIAMANT VGT SUPREME — Recording, narration and rehearsal studio
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Captions, ChevronLeft, ChevronRight, Circle, Clock3, Mic, Pause,
  Play, RotateCcw, Square, Trash2, Video, X,
} from 'lucide-react';
import type {
  PresentDocumentModel,
  PresentRecordingInteractionEvent,
  PresentRecordingTake,
  PresentSlide,
} from '../../../shared/contracts/workspace';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { buildPresentSlideSvg } from '../interchange/render/presentExport';
import { PRESENT_STUDIO_COPY, presentRecordingFailureCopy } from '../locale/presentStudioLocale';
import { PresentStudioErrorAlert } from '../locale/PresentStudioErrorAlert';
import {
  blobToBoundedRecordingTrack,
  captionsFromTranscript,
  PresentTakeRecorder,
  recordingActiveTake,
  removeRecordingTake,
  requestPresentRecordingMedia,
  selectRecordingTake,
  upsertRecordingTake,
} from './presentRecording';

interface PresentRecordingStudioModalProps {
  isOpen: boolean;
  presentData: PresentDocumentModel;
  onClose: () => void;
  onUpdatePresentData: (next: PresentDocumentModel) => void;
}

type StudioMode = 'record' | 'rehearse' | 'timeline';
type InkMode = 'pointer' | 'pen' | 'highlighter';

function formatMs(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function safeSvgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export const PresentRecordingStudioModal: React.FC<PresentRecordingStudioModalProps> = ({
  isOpen,
  presentData,
  onClose,
  onUpdatePresentData,
}) => {
  const { locale } = useWorkspaceLocale();
  const copy = PRESENT_STUDIO_COPY[locale].recording;
  const slides = presentData.slides;
  const [mode, setMode] = useState<StudioMode>('record');
  const [currentSlideIdx, setCurrentSlideIdx] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [slideElapsedMs, setSlideElapsedMs] = useState(0);
  const [totalElapsedMs, setTotalElapsedMs] = useState(0);
  const [rehearsedTimings, setRehearsedTimings] = useState<Record<string, number>>({});
  const [microphone, setMicrophone] = useState(true);
  const [camera, setCamera] = useState(false);
  const [consent, setConsent] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordElapsedMs, setRecordElapsedMs] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [interactionEvents, setInteractionEvents] = useState<PresentRecordingInteractionEvent[]>([]);
  const [inkMode, setInkMode] = useState<InkMode>('pointer');
  const [error, setError] = useState<string | null>(null);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const cameraPreviewRef = useRef<HTMLVideoElement | null>(null);
  const recorderRef = useRef<PresentTakeRecorder | null>(null);
  const rehearsalStartedRef = useRef<number | null>(null);
  const totalStartedRef = useRef<number | null>(null);
  const recordingStartedRef = useRef<number | null>(null);

  const activeSlide = slides[currentSlideIdx] ?? slides[0];
  const activeTake = activeSlide ? recordingActiveTake(activeSlide.recording) : undefined;
  const slidePreview = useMemo(
    () => activeSlide ? safeSvgDataUrl(buildPresentSlideSvg(activeSlide, presentData, undefined, undefined, undefined, locale)) : '',
    [activeSlide, presentData, locale]
  );

  useEffect(() => {
    if (!cameraPreviewRef.current) return;
    cameraPreviewRef.current.srcObject = mediaStream;
    if (mediaStream) void cameraPreviewRef.current.play().catch(() => undefined);
  }, [mediaStream]);

  useEffect(() => {
    if (!isOpen) return;
    setCurrentSlideIdx((idx) => Math.min(Math.max(0, idx), Math.max(0, slides.length - 1)));
  }, [isOpen, slides.length]);

  useEffect(() => {
    if (!isRunning) return;
    const timer = window.setInterval(() => {
      const now = performance.now();
      if (rehearsalStartedRef.current !== null) setSlideElapsedMs(now - rehearsalStartedRef.current);
      if (totalStartedRef.current !== null) setTotalElapsedMs(now - totalStartedRef.current);
    }, 100);
    return () => window.clearInterval(timer);
  }, [isRunning]);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => {
      if (recordingStartedRef.current !== null) setRecordElapsedMs(performance.now() - recordingStartedRef.current);
    }, 100);
    return () => window.clearInterval(timer);
  }, [recording]);

  useEffect(() => () => {
    recorderRef.current?.dispose();
  }, []);

  if (!isOpen || !activeSlide) return null;

  const updateSlide = (slideId: string, transform: (slide: PresentSlide) => PresentSlide) => {
    onUpdatePresentData({
      ...presentData,
      slides: slides.map((slide) => slide.id === slideId ? transform(slide) : slide),
    });
  };

  const pauseRehearsal = () => {
    if (isRunning && rehearsalStartedRef.current !== null) {
      const elapsed = performance.now() - rehearsalStartedRef.current;
      setSlideElapsedMs(elapsed);
      rehearsalStartedRef.current = null;
      totalStartedRef.current = null;
    }
    setIsRunning(false);
  };

  const toggleRehearsal = () => {
    if (isRunning) {
      pauseRehearsal();
      return;
    }
    const now = performance.now();
    rehearsalStartedRef.current = now - slideElapsedMs;
    totalStartedRef.current = now - totalElapsedMs;
    setIsRunning(true);
  };

  const commitRehearsalSlide = () => {
    const seconds = Math.max(0.1, slideElapsedMs / 1000);
    setRehearsedTimings((previous) => ({ ...previous, [activeSlide.id]: seconds }));
    updateSlide(activeSlide.id, (slide) => ({ ...slide, timingSeconds: seconds }));
  };

  const navigate = (direction: -1 | 1) => {
    if (recording) return;
    if (mode === 'rehearse' && slideElapsedMs > 0) commitRehearsalSlide();
    const next = Math.min(slides.length - 1, Math.max(0, currentSlideIdx + direction));
    if (next === currentSlideIdx) return;
    setCurrentSlideIdx(next);
    setSlideElapsedMs(0);
    if (isRunning) rehearsalStartedRef.current = performance.now();
    setInteractionEvents([]);
    setTranscript(slides[next]?.speakerNotes ?? '');
  };

  const startRecording = async () => {
    setError(null);
    if (!consent) {
      setError(copy.errors.consentRequired);
      return;
    }
    if (!microphone && !camera) {
      setError(copy.errors.sourceRequired);
      return;
    }
    try {
      const stream = await requestPresentRecordingMedia({ microphone, camera, consentGranted: consent });
      const recorder = new PresentTakeRecorder(stream);
      recorder.start();
      setMediaStream(stream);
      recorderRef.current = recorder;
      recordingStartedRef.current = performance.now();
      setRecordElapsedMs(0);
      setInteractionEvents([]);
      setRecording(true);
    } catch (cause) {
      setError(presentRecordingFailureCopy(locale, cause));
    }
  };

  const stopRecording = async () => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    setError(null);
    try {
      const result = await recorder.stop();
      const narration = result.narrationBlob ? await blobToBoundedRecordingTrack(result.narrationBlob, 'audio') : undefined;
      const cameraTrack = result.cameraBlob ? await blobToBoundedRecordingTrack(result.cameraBlob, 'video') : undefined;
      const text = transcript.trim() || activeSlide.speakerNotes?.trim() || '';
      const take: PresentRecordingTake = {
        id: `take-${crypto.randomUUID()}`,
        createdAt: Date.now(),
        durationMs: result.durationMs,
        narration,
        camera: cameraTrack,
        interactionEvents,
        captions: captionsFromTranscript(text, result.durationMs),
        transcript: text || undefined,
      };
      updateSlide(activeSlide.id, (slide) => ({
        ...slide,
        timingSeconds: Math.max(0.1, result.durationMs / 1000),
        recording: upsertRecordingTake(slide.recording, take),
      }));
      setRecordElapsedMs(result.durationMs);
    } catch (cause) {
      setError(presentRecordingFailureCopy(locale, cause));
    } finally {
      recorder.dispose();
      recorderRef.current = null;
      setMediaStream(null);
      setRecording(false);
      recordingStartedRef.current = null;
    }
  };

  const stopAndClose = () => {
    if (recording) {
      setError(copy.errors.stopBeforeClose);
      return;
    }
    pauseRehearsal();
    recorderRef.current?.dispose();
    onClose();
  };

  const captureInteraction = (event: React.PointerEvent<HTMLDivElement>, phase: 'down' | 'move' | 'up') => {
    if (!recording || recordingStartedRef.current === null) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const xPercent = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
    const yPercent = Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100));
    const atMs = performance.now() - recordingStartedRef.current;
    const type = inkMode === 'pointer'
      ? (`pointer-${phase}` as const)
      : phase === 'down' ? 'ink-start' : phase === 'move' ? 'ink-point' : 'ink-end';
    const next: PresentRecordingInteractionEvent = {
      atMs,
      type,
      xPercent,
      yPercent,
      tool: inkMode === 'pointer' ? undefined : inkMode,
      color: inkMode === 'highlighter' ? '#fde047' : inkMode === 'pen' ? '#38bdf8' : undefined,
      width: inkMode === 'highlighter' ? 8 : inkMode === 'pen' ? 3 : undefined,
    };
    setInteractionEvents((previous) => previous.length >= 12_000 ? previous : [...previous, next]);
  };

  const resetRehearsal = () => {
    pauseRehearsal();
    setSlideElapsedMs(0);
    setTotalElapsedMs(0);
    setRehearsedTimings({});
    rehearsalStartedRef.current = null;
    totalStartedRef.current = null;
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="present-recording-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-4 select-none">
      <div className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-slate-950 text-xs text-slate-200 shadow-2xl">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2"><Video aria-hidden="true" className="h-4 w-4 shrink-0 text-emerald-400"/><strong id="present-recording-title" className="break-words text-sm">{copy.title}</strong></div>
          <div className="flex flex-wrap items-center justify-end gap-1">
            {(['record','rehearse','timeline'] as StudioMode[]).map((item) => <button key={item} type="button" disabled={recording} onClick={()=>setMode(item)} aria-pressed={mode === item} className={`whitespace-normal break-words rounded-lg border px-2.5 py-1.5 ${mode===item?'border-emerald-500/50 bg-emerald-500/15 text-emerald-200':'border-white/10 text-slate-400 hover:bg-white/5'}`}>{copy.modes[item]}</button>)}
            <button aria-label={copy.close} title={copy.close} type="button" onClick={stopAndClose} className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"><X className="h-4 w-4"/></button>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_320px]">
          <main className="min-w-0 space-y-3 overflow-y-auto p-3 sm:p-4">
            <div
              className="relative mx-auto aspect-video w-full max-w-4xl overflow-hidden rounded-xl border border-white/15 bg-black"
              onPointerDown={(event)=>captureInteraction(event,'down')}
              onPointerMove={(event)=>captureInteraction(event,'move')}
              onPointerUp={(event)=>captureInteraction(event,'up')}
            >
              <img src={slidePreview} alt={copy.slidePreview(currentSlideIdx + 1)} className="pointer-events-none h-full w-full object-contain" draggable={false}/>
              {camera && mediaStream && <video ref={cameraPreviewRef} muted playsInline aria-label={copy.cameraTrackLabel} className="absolute right-3 bottom-3 aspect-video w-48 rounded-lg border border-white/20 bg-black object-cover shadow-xl"/>}
              {recording && <div role="status" aria-label={`${copy.recordingIndicator} ${formatMs(recordElapsedMs)}`} className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-red-600/90 px-3 py-1.5 font-semibold text-white"><Circle aria-hidden="true" className="h-3 w-3 fill-current"/>{copy.recordingIndicator} {formatMs(recordElapsedMs)}</div>}
            </div>

            <div className="flex items-center justify-between gap-2">
              <button aria-label={copy.previousSlide} title={copy.previousSlide} type="button" disabled={recording || currentSlideIdx===0} onClick={()=>navigate(-1)} className="shrink-0 rounded-lg border border-white/10 p-2 hover:bg-white/5 disabled:opacity-30"><ChevronLeft aria-hidden="true" className="h-4 w-4"/></button>
              <div className="min-w-0 text-center"><div className="break-words font-semibold">{activeSlide.title || copy.slideFallback(currentSlideIdx + 1)}</div><div className="text-[0.625rem] text-slate-500">{copy.slidePosition(currentSlideIdx + 1, slides.length)}</div></div>
              <button aria-label={copy.nextSlide} title={copy.nextSlide} type="button" disabled={recording || currentSlideIdx===slides.length-1} onClick={()=>navigate(1)} className="shrink-0 rounded-lg border border-white/10 p-2 hover:bg-white/5 disabled:opacity-30"><ChevronRight aria-hidden="true" className="h-4 w-4"/></button>
            </div>

            {mode === 'record' && <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              <section className="rounded-xl border border-white/10 bg-white/[0.025] p-3 space-y-3">
                <div className="flex items-center gap-2 font-semibold"><Mic aria-hidden="true" className="h-4 w-4 text-cyan-400"/>{copy.capture}</div>
                <label className="flex min-w-0 items-start gap-2"><input type="checkbox" checked={microphone} disabled={recording} onChange={(e)=>setMicrophone(e.target.checked)}/><span className="break-words">{copy.microphoneNarration}</span></label>
                <label className="flex min-w-0 items-start gap-2"><input type="checkbox" checked={camera} disabled={recording} onChange={(e)=>setCamera(e.target.checked)}/><span className="break-words">{copy.cameraTrack}</span></label>
                <label className="flex min-w-0 items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2 text-[0.625rem] text-amber-100"><input className="mt-0.5" type="checkbox" checked={consent} disabled={recording} onChange={(e)=>setConsent(e.target.checked)}/><span className="break-words">{copy.consentText}</span></label>
                <div className="flex gap-2">
                  {!recording ? <button type="button" onClick={()=>void startRecording()} disabled={!consent || (!microphone && !camera)} className="flex min-w-0 flex-1 items-center justify-center gap-2 whitespace-normal break-words rounded-lg bg-red-600 py-2 font-semibold text-white hover:bg-red-500 disabled:opacity-40"><Circle aria-hidden="true" className="h-3 w-3 shrink-0 fill-current"/>{copy.recordTake}</button> : <button type="button" onClick={()=>void stopRecording()} className="flex min-w-0 flex-1 items-center justify-center gap-2 whitespace-normal break-words rounded-lg bg-slate-100 py-2 font-semibold text-slate-950"><Square aria-hidden="true" className="h-3 w-3 shrink-0 fill-current"/>{copy.stopAndSave}</button>}
                </div>
                <div className="flex flex-wrap gap-1">{(['pointer','pen','highlighter'] as InkMode[]).map((tool)=><button key={tool} type="button" onClick={()=>setInkMode(tool)} aria-pressed={inkMode === tool} className={`whitespace-normal break-words rounded border px-2 py-1 ${inkMode===tool?'border-cyan-400/60 bg-cyan-400/10 text-cyan-200':'border-white/10 text-slate-400'}`}>{copy.inkTools[tool]}</button>)}</div>
              </section>
              <section className="rounded-xl border border-white/10 bg-white/[0.025] p-3 space-y-2">
                <div className="flex items-center gap-2 font-semibold"><Captions aria-hidden="true" className="h-4 w-4 text-purple-400"/>{copy.transcriptCaptions}</div>
                <textarea aria-label={copy.transcriptCaptions} value={transcript} disabled={recording} onChange={(e)=>setTranscript(e.target.value.slice(0,50_000))} placeholder={activeSlide.speakerNotes || copy.transcriptPlaceholder} className="h-32 w-full resize-none rounded-lg border border-white/10 bg-black/25 p-2 text-xs outline-none focus:border-purple-500/50"/>
                <p className="break-words text-[0.625rem] text-slate-500">{copy.transcriptGuidance}</p>
              </section>
            </div>}

            {mode === 'rehearse' && <section className="rounded-xl border border-white/10 bg-white/[0.025] p-4 space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><div className="rounded-lg bg-black/30 p-3 text-center"><div className="text-[0.625rem] uppercase text-slate-500">{copy.slideTimer}</div><div className="text-2xl font-mono text-amber-300">{formatMs(slideElapsedMs)}</div></div><div className="rounded-lg bg-black/30 p-3 text-center"><div className="text-[0.625rem] uppercase text-slate-500">{copy.totalTimer}</div><div className="text-2xl font-mono text-purple-300">{formatMs(totalElapsedMs)}</div></div></div>
              <div className="flex flex-wrap gap-2"><button type="button" onClick={toggleRehearsal} className="flex min-w-0 flex-1 items-center justify-center gap-2 whitespace-normal break-words rounded-lg bg-purple-600 py-2 font-medium text-white hover:bg-purple-500">{isRunning?<Pause aria-hidden="true" className="h-4 w-4 shrink-0"/>:<Play aria-hidden="true" className="h-4 w-4 shrink-0"/>}{isRunning?copy.pause:copy.start}</button><button type="button" onClick={()=>{commitRehearsalSlide();navigate(1);}} className="min-w-0 whitespace-normal break-words rounded-lg bg-blue-600 px-4 py-2 text-white">{copy.saveAndNext}</button><button aria-label={copy.resetRehearsal} title={copy.resetRehearsal} type="button" onClick={resetRehearsal} className="shrink-0 rounded-lg border border-white/10 p-2 hover:bg-white/5"><RotateCcw aria-hidden="true" className="h-4 w-4"/></button></div>
            </section>}

            {mode === 'timeline' && <section className="rounded-xl border border-white/10 bg-white/[0.025] p-3 space-y-2">
              <div className="flex items-center gap-2 font-semibold"><Clock3 aria-hidden="true" className="h-4 w-4 text-amber-400"/>{copy.timelineTitle}</div>
              {slides.map((slide,index)=>{const take=recordingActiveTake(slide.recording); const title = slide.title || copy.untitledSlide; return <button key={slide.id} type="button" aria-label={copy.timelineSlide(index + 1, title)} aria-current={index === currentSlideIdx ? 'step' : undefined} onClick={()=>setCurrentSlideIdx(index)} className={`grid w-full min-w-0 grid-cols-[28px_minmax(0,1fr)] items-center gap-2 rounded-lg border px-2 py-2 text-left sm:grid-cols-[36px_minmax(0,1fr)_70px_auto] ${index===currentSlideIdx?'border-amber-500/40 bg-amber-500/5':'border-white/5 bg-black/20'}`}><span className="font-mono text-slate-500">{index+1}</span><span className="min-w-0 break-words">{title}</span><span className="hidden font-mono text-amber-300 sm:inline">{formatMs((slide.timingSeconds||0)*1000)}</span><span className="text-[0.625rem] text-slate-400">{take?copy.cueCount(take.captions.length):copy.noTake}</span></button>})}
            </section>}

            {error && <PresentStudioErrorAlert message={error}/>}
          </main>

          <aside className="min-w-0 space-y-4 overflow-y-auto border-t border-white/10 bg-slate-900/60 p-3 lg:border-l lg:border-t-0">
            <section><div className="mb-1 break-words text-[0.625rem] font-semibold uppercase tracking-wider text-slate-500">{copy.teleprompterNotes}</div><div className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg border border-white/10 bg-black/25 p-3 text-sm leading-relaxed text-slate-200">{activeSlide.speakerNotes || copy.noSpeakerNotes}</div></section>
            <section className="space-y-2"><div className="break-words text-[0.625rem] font-semibold uppercase tracking-wider text-slate-500">{copy.takesForSlide}</div>{(activeSlide.recording?.takes || []).slice().reverse().map((take)=><div key={take.id} className={`min-w-0 space-y-2 rounded-lg border p-2 ${take.id===activeSlide.recording?.activeTakeId?'border-emerald-500/40 bg-emerald-500/5':'border-white/10 bg-black/20'}`}><div className="flex min-w-0 items-start justify-between gap-2"><button type="button" onClick={()=>updateSlide(activeSlide.id,(slide)=>({...slide,recording:selectRecordingTake(slide.recording,take.id)}))} aria-pressed={take.id === activeSlide.recording?.activeTakeId} className="min-w-0 break-words text-left"><div className="break-words font-semibold">{new Date(take.createdAt).toLocaleString(locale)}</div><div className="break-words text-[0.625rem] text-slate-500">{formatMs(take.durationMs)} · {take.narration ? `${copy.audioTrack} ` : ''}{take.camera ? `${copy.cameraTrackLabel} ` : ''}· {copy.interactionEventCount(take.interactionEvents.length)}</div></button><button aria-label={copy.removeTake(activeSlide.id, new Date(take.createdAt).toLocaleString(locale))} title={copy.removeTake(activeSlide.id, new Date(take.createdAt).toLocaleString(locale))} type="button" disabled={recording} onClick={()=>updateSlide(activeSlide.id,(slide)=>({...slide,recording:removeRecordingTake(slide.recording,take.id)}))} className="shrink-0 rounded p-1 text-red-300 hover:bg-red-500/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"><Trash2 aria-hidden="true" className="h-3.5 w-3.5"/></button></div>{take.narration && <audio aria-label={copy.playAudioTake} controls preload="metadata" src={take.narration.dataUrl} className="h-8 w-full"/>}{take.camera && <video aria-label={copy.playCameraTake} controls preload="metadata" src={take.camera.dataUrl} className="w-full rounded bg-black"/>}</div>)}{!activeSlide.recording?.takes?.length && <div className="rounded-lg border border-dashed border-white/10 p-3 text-[0.625rem] text-slate-500">{copy.noTakes}</div>}</section>
            <section aria-label={copy.activeTake} className="space-y-1 rounded-lg border border-white/10 bg-black/20 p-2 text-[0.625rem] text-slate-400"><div className="flex flex-wrap justify-between gap-x-2"><span>{copy.activeTake}</span><span>{activeTake?formatMs(activeTake.durationMs):'—'}</span></div><div className="flex flex-wrap justify-between gap-x-2"><span>{copy.rehearsed}</span><span>{formatMs((rehearsedTimings[activeSlide.id] ?? activeSlide.timingSeconds ?? 0)*1000)}</span></div><div className="flex flex-wrap justify-between gap-x-2"><span>{copy.pointerInk}</span><span>{activeTake?.interactionEvents.length ?? 0}</span></div></section>
          </aside>
        </div>
      </div>
    </div>
  );
};
