// STATUS: DIAMANT VGT SUPREME — recorded deck video export with real media tracks
import type {
  PresentDocumentModel,
  PresentRecordingCaptionCue,
  PresentRecordingInteractionEvent,
  PresentRecordingMediaTrack,
  PresentSlide,
} from '../../../../shared/contracts/workspace';
import type { WorkspaceLocale } from '../../../../shell/localization/workspaceLocaleTypes';
import { buildPresentSlideSvg, renderPresentSlideToJpeg } from '../render/presentExport';
import { evaluatePreviewAnimationsAtTime } from '../../animations/presentAnimationEngine';
import { buildPresentMorphFrame, normalizePresentTransition } from '../../presenter/transitions/presentTransitionEngine';
import { recordingActiveTake } from '../../recording/presentRecording';
import { bytesFromPresentMediaDataUrl } from '../../media/presentMediaSecurity';
import { toOwnedArrayBuffer } from '../../../../shared/binary/ownedBufferSource';
import {
  deliverExportBlob,
  deliverExportDataUrl,
  deliverExportText,
  type ExportDeliveryResult,
} from '../../../../shared/interchange/exportDelivery';

export interface VideoExportOptions {
  locale?: WorkspaceLocale;
  resolution: '720p' | '1080p' | '4k';
  frameRate: 30 | 60;
  defaultSlideDurationSeconds: number;
  includeAnimations: boolean;
  includeTransitions: boolean;
  includeNarration: boolean;
  includeCamera: boolean;
  includePointerInk: boolean;
  includeCaptions: boolean;
  mimeType: 'video/webm' | 'video/mp4';
}

export interface VideoTimelineCue {
  slideId: string;
  slideIndex: number;
  title: string;
  startTimeSeconds: number;
  durationSeconds: number;
  notes?: string;
  captions: PresentRecordingCaptionCue[];
}

export interface VideoNarrationSidecar {
  slideId: string;
  takeId: string;
  filename: string;
  track: PresentRecordingMediaTrack;
}

export interface VideoExportResult {
  blob: Blob;
  format: 'webm' | 'mp4';
  width: number;
  height: number;
  durationSeconds: number;
  fileSizeBytes: number;
  cues: VideoTimelineCue[];
  webVttCaptions: string;
  narrationTracks: VideoNarrationSidecar[];
  warnings: string[];
}

export const RESOLUTION_PRESETS: Record<VideoExportOptions['resolution'], { width: number; height: number }> = {
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
  '4k': { width: 3840, height: 2160 },
};

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
const sleep = (ms: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, ms));

function formatVttTime(seconds: number): string {
  const value = Math.max(0, seconds);
  const hrs = Math.floor(value / 3600);
  const mins = Math.floor((value % 3600) / 60);
  const secs = (value % 60).toFixed(3);
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(6, '0')}`;
}

export function generateWebVttCaptions(cues: VideoTimelineCue[]): string {
  let vtt = 'WEBVTT - Astraea Present Deck Captions\n\n';
  let index = 1;
  for (const cue of cues) {
    if (cue.captions.length) {
      for (const caption of cue.captions) {
        const start = cue.startTimeSeconds + caption.startMs / 1000;
        const end = cue.startTimeSeconds + Math.min(cue.durationSeconds, caption.endMs / 1000);
        if (end <= start) continue;
        vtt += `${index++}\n${formatVttTime(start)} --> ${formatVttTime(end)}\n${caption.text.replace(/[\r\n]+/g, ' ').trim()}\n\n`;
      }
    } else {
      const text = cue.notes?.trim() || cue.title;
      if (!text) continue;
      vtt += `${index++}\n${formatVttTime(cue.startTimeSeconds)} --> ${formatVttTime(cue.startTimeSeconds + cue.durationSeconds)}\n${text.replace(/[\r\n]+/g, ' ').trim()}\n\n`;
    }
  }
  return vtt;
}

function cueDuration(slide: PresentSlide, fallback: number): number {
  const take = recordingActiveTake(slide.recording);
  const recorded = take?.durationMs ? take.durationMs / 1000 : 0;
  const value = recorded || slide.timingSeconds || fallback;
  return clamp(value, 0.25, 3_600);
}

export function buildVideoTimeline(model: PresentDocumentModel, fallbackSeconds: number): VideoTimelineCue[] {
  let cursor = 0;
  return model.slides.filter((slide) => !slide.hidden).map((slide, slideIndex) => {
    const take = recordingActiveTake(slide.recording);
    const durationSeconds = cueDuration(slide, fallbackSeconds);
    const cue: VideoTimelineCue = {
      slideId: slide.id,
      slideIndex,
      title: slide.title || `Slide ${slideIndex + 1}`,
      startTimeSeconds: cursor,
      durationSeconds,
      notes: slide.speakerNotes,
      captions: take?.captions ?? [],
    };
    cursor += durationSeconds;
    return cue;
  });
}

async function imageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('A slide frame could not be rasterized.'));
    image.src = url;
  });
}

async function imageFromSvg(svg: string): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    return await imageFromUrl(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function renderAnimatedFrame(slide: PresentSlide, model: PresentDocumentModel, elapsedMs: number, locale: WorkspaceLocale): Promise<HTMLImageElement> {
  const progress = evaluatePreviewAnimationsAtTime(slide.animations ?? [], elapsedMs).progressByAnimationId;
  return imageFromSvg(buildPresentSlideSvg(slide, model, 1280, 720, progress, locale));
}

function drawCover(ctx: CanvasRenderingContext2D, image: CanvasImageSource, width: number, height: number): void {
  ctx.drawImage(image, 0, 0, width, height);
}

function drawTransition(
  ctx: CanvasRenderingContext2D,
  outgoing: CanvasImageSource,
  incoming: CanvasImageSource,
  slide: PresentSlide,
  progress: number,
  width: number,
  height: number
): void {
  const transition = normalizePresentTransition(slide.transition);
  const p = clamp(progress, 0, 1);
  const inverse = 1 - p;
  const direction = transition.direction || 'left';
  ctx.save();
  if (transition.effect === 'fade' || transition.effect === 'morph') {
    ctx.globalAlpha = inverse; drawCover(ctx, outgoing, width, height);
    ctx.globalAlpha = p; drawCover(ctx, incoming, width, height);
  } else if (transition.effect === 'push' || transition.effect === 'cover' || transition.effect === 'uncover' || transition.effect === 'reveal') {
    const horizontal = direction === 'left' || direction === 'right';
    const sign = direction === 'right' || direction === 'down' ? 1 : -1;
    if (transition.effect === 'cover') drawCover(ctx, outgoing, width, height);
    if (transition.effect === 'uncover' || transition.effect === 'reveal') drawCover(ctx, incoming, width, height);
    if (transition.effect === 'push' || transition.effect === 'uncover' || transition.effect === 'reveal') {
      const dx = horizontal ? sign * p * width : 0;
      const dy = horizontal ? 0 : sign * p * height;
      ctx.drawImage(outgoing, dx, dy, width, height);
    }
    if (transition.effect === 'push' || transition.effect === 'cover') {
      const dx = horizontal ? -sign * inverse * width : 0;
      const dy = horizontal ? 0 : -sign * inverse * height;
      ctx.drawImage(incoming, dx, dy, width, height);
    }
  } else if (transition.effect === 'wipe' || transition.effect === 'split') {
    drawCover(ctx, outgoing, width, height);
    ctx.save();
    if (transition.effect === 'split') {
      if (direction === 'horizontal') ctx.rect(0, height * inverse * 0.5, width, height * p);
      else ctx.rect(width * inverse * 0.5, 0, width * p, height);
    } else if (direction === 'right') ctx.rect(0, 0, width * p, height);
    else if (direction === 'up') ctx.rect(0, height * inverse, width, height * p);
    else if (direction === 'down') ctx.rect(0, 0, width, height * p);
    else ctx.rect(width * inverse, 0, width * p, height);
    ctx.clip(); drawCover(ctx, incoming, width, height); ctx.restore();
  } else if (transition.effect === 'zoom') {
    ctx.globalAlpha = inverse;
    ctx.translate(width / 2, height / 2); ctx.scale(1 + p * 0.12, 1 + p * 0.12); ctx.drawImage(outgoing, -width / 2, -height / 2, width, height);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = p;
    ctx.translate(width / 2, height / 2); const scale = 0.88 + p * 0.12; ctx.scale(scale, scale); ctx.drawImage(incoming, -width / 2, -height / 2, width, height);
  } else {
    drawCover(ctx, incoming, width, height);
  }
  ctx.restore();
}

function drawInteractionOverlay(ctx: CanvasRenderingContext2D, events: PresentRecordingInteractionEvent[], elapsedMs: number, width: number, height: number): void {
  const visible = events.filter((event) => event.atMs <= elapsedMs);
  let pointer: PresentRecordingInteractionEvent | undefined;
  let stroke: Array<{ x: number; y: number; color: string; width: number; opacity: number }> = [];
  const flush = () => {
    if (stroke.length < 2) { stroke = []; return; }
    ctx.save(); ctx.strokeStyle = stroke[0].color; ctx.lineWidth = stroke[0].width; ctx.globalAlpha = stroke[0].opacity; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(stroke[0].x, stroke[0].y); for (const point of stroke.slice(1)) ctx.lineTo(point.x, point.y); ctx.stroke(); ctx.restore(); stroke = [];
  };
  for (const event of visible) {
    if (event.type.startsWith('pointer-') && event.xPercent !== undefined && event.yPercent !== undefined) pointer = event;
    if (event.type === 'ink-start') flush();
    if ((event.type === 'ink-start' || event.type === 'ink-point') && event.xPercent !== undefined && event.yPercent !== undefined) {
      stroke.push({ x: event.xPercent / 100 * width, y: event.yPercent / 100 * height, color: event.color || '#38bdf8', width: event.width || 3, opacity: event.tool === 'highlighter' ? 0.35 : 0.95 });
    }
    if (event.type === 'ink-end') flush();
  }
  flush();
  if (pointer?.xPercent !== undefined && pointer.yPercent !== undefined) {
    ctx.save(); ctx.fillStyle = '#ef4444'; ctx.shadowColor = '#ef4444'; ctx.shadowBlur = 14; ctx.beginPath(); ctx.arc(pointer.xPercent / 100 * width, pointer.yPercent / 100 * height, Math.max(4, width / 240), 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
}

function activeCaption(captions: PresentRecordingCaptionCue[], elapsedMs: number): string | undefined {
  return captions.find((cue) => elapsedMs >= cue.startMs && elapsedMs <= cue.endMs)?.text;
}

function drawCaption(ctx: CanvasRenderingContext2D, text: string, width: number, height: number): void {
  const safe = text.replace(/[\r\n]+/g, ' ').trim().slice(0, 500);
  if (!safe) return;
  ctx.save(); ctx.font = `${Math.max(18, Math.round(width / 55))}px system-ui, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const metrics = ctx.measureText(safe); const boxWidth = Math.min(width * 0.88, metrics.width + 48); const x = width / 2; const y = height - 55;
  ctx.fillStyle = 'rgba(0,0,0,.72)'; ctx.fillRect(x - boxWidth / 2, y - 28, boxWidth, 56); ctx.fillStyle = '#fff'; ctx.fillText(safe, x, y, boxWidth - 24); ctx.restore();
}

function dataUrlToArrayBuffer(dataUrl: string): Promise<ArrayBuffer> {
  const bytes = bytesFromPresentMediaDataUrl(dataUrl);
  return Promise.resolve(toOwnedArrayBuffer(bytes));
}

async function scheduleNarration(
  model: PresentDocumentModel,
  cues: VideoTimelineCue[],
  context: AudioContext,
  destination: MediaStreamAudioDestinationNode,
  offsetSeconds: number
): Promise<AudioBufferSourceNode[]> {
  const sources: AudioBufferSourceNode[] = [];
  for (const cue of cues) {
    const slide = model.slides.find((item) => item.id === cue.slideId);
    const track = recordingActiveTake(slide?.recording)?.narration;
    if (!track) continue;
    const audioBuffer = await context.decodeAudioData(await dataUrlToArrayBuffer(track.dataUrl));
    const source = context.createBufferSource(); source.buffer = audioBuffer; source.connect(destination); source.start(context.currentTime + offsetSeconds + cue.startTimeSeconds); sources.push(source);
  }
  return sources;
}

function recordedNarrationSidecars(model: PresentDocumentModel): VideoNarrationSidecar[] {
  return model.slides.flatMap((slide, index) => {
    const take = recordingActiveTake(slide.recording);
    if (!take?.narration) return [];
    const extension = take.narration.mimeType.includes('ogg') ? 'ogg' : take.narration.mimeType.includes('mp4') ? 'm4a' : 'webm';
    return [{ slideId: slide.id, takeId: take.id, filename: `slide-${String(index + 1).padStart(3, '0')}-narration.${extension}`, track: take.narration }];
  });
}

export async function synthesizeDeckVideo(
  model: PresentDocumentModel,
  options: Partial<VideoExportOptions> = {},
  onProgress?: (progressPercent: number, currentSlideIndex: number) => void
): Promise<VideoExportResult> {
  const opts: VideoExportOptions = {
    locale: options.locale ?? 'en-US',
    resolution: options.resolution ?? '1080p', frameRate: options.frameRate ?? 30, defaultSlideDurationSeconds: clamp(options.defaultSlideDurationSeconds ?? 5, 1, 600),
    includeAnimations: options.includeAnimations ?? true, includeTransitions: options.includeTransitions ?? true, includeNarration: options.includeNarration ?? true,
    includeCamera: options.includeCamera ?? true, includePointerInk: options.includePointerInk ?? true, includeCaptions: options.includeCaptions ?? true,
    mimeType: options.mimeType ?? 'video/webm',
  };
  const locale = opts.locale ?? 'en-US';
  const slides = model.slides.filter((slide) => !slide.hidden);
  if (!slides.length) throw new Error('No visible slides are available for video export.');
  if (typeof MediaRecorder === 'undefined') throw new Error('This runtime does not provide MediaRecorder. A real video cannot be encoded here.');
  const requestedMime = opts.mimeType === 'video/mp4' ? 'video/mp4' : (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') ? 'video/webm;codecs=vp9,opus' : 'video/webm');
  if (!MediaRecorder.isTypeSupported(requestedMime)) throw new Error(`${opts.mimeType === 'video/mp4' ? 'MP4' : 'WebM'} encoding is not supported by this runtime.`);

  const { width, height } = RESOLUTION_PRESETS[opts.resolution];
  const cues = buildVideoTimeline({ ...model, slides }, opts.defaultSlideDurationSeconds);
  const durationSeconds = cues.reduce((sum, cue) => sum + cue.durationSeconds, 0);
  const warnings: string[] = [];
  const staticImages = new Map<string, HTMLImageElement>();
  for (let i = 0; i < slides.length; i++) {
    onProgress?.(Math.round((i / slides.length) * 15), i);
    staticImages.set(slides[i].id, await imageFromUrl(await renderPresentSlideToJpeg(slides[i], model, 0.95, 1280, locale)));
  }

  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Canvas 2D context unavailable.');
  if (!canvas.captureStream) throw new Error('Canvas stream capture is unavailable in this runtime.');
  const canvasStream = canvas.captureStream(opts.frameRate);

  let audioContext: AudioContext | undefined;
  let audioDestination: MediaStreamAudioDestinationNode | undefined;
  if (opts.includeNarration && cues.some((cue) => recordingActiveTake(slides[cue.slideIndex]?.recording)?.narration)) {
    audioContext = new AudioContext(); audioDestination = audioContext.createMediaStreamDestination(); await audioContext.resume();
  }
  const outputStream = new MediaStream([...canvasStream.getVideoTracks(), ...(audioDestination?.stream.getAudioTracks() ?? [])]);
  const chunks: Blob[] = [];
  const recorder = new MediaRecorder(outputStream, { mimeType: requestedMime, videoBitsPerSecond: opts.resolution === '4k' ? 25_000_000 : opts.resolution === '1080p' ? 10_000_000 : 6_000_000 });
  recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
  const finished = new Promise<Blob>((resolve, reject) => { recorder.onerror = () => reject(new Error('The runtime video encoder failed.')); recorder.onstop = () => resolve(new Blob(chunks, { type: requestedMime })); });
  recorder.start(1000);
  const startDelaySeconds = 0.12;
  let narrationSources: AudioBufferSourceNode[] = [];
  if (audioContext && audioDestination) narrationSources = await scheduleNarration({ ...model, slides }, cues, audioContext, audioDestination, startDelaySeconds);
  await sleep(startDelaySeconds * 1000);

  const totalFrames = Math.max(1, Math.round(durationSeconds * opts.frameRate));
  let renderedFrames = 0;
  for (let sIdx = 0; sIdx < slides.length; sIdx++) {
    const slide = slides[sIdx]; const cue = cues[sIdx]; const take = recordingActiveTake(slide.recording);
    const slideFrames = Math.max(1, Math.round(cue.durationSeconds * opts.frameRate));
    const transition = normalizePresentTransition(slide.transition);
    const transitionFrames = opts.includeTransitions && sIdx + 1 < slides.length && transition.effect !== 'none'
      ? Math.min(slideFrames, Math.round(transition.durationMs / 1000 * opts.frameRate)) : 0;
    let cameraVideo: HTMLVideoElement | undefined;
    if (opts.includeCamera && take?.camera) {
      cameraVideo = document.createElement('video'); cameraVideo.muted = true; cameraVideo.playsInline = true; cameraVideo.src = take.camera.dataUrl; cameraVideo.currentTime = 0;
      await cameraVideo.play().catch(() => { warnings.push(`Camera take on slide ${sIdx + 1} could not be decoded and was skipped.`); cameraVideo = undefined; });
    }
    for (let frame = 0; frame < slideFrames; frame++) {
      const elapsedMs = frame / opts.frameRate * 1000;
      let currentImage = staticImages.get(slide.id)!;
      if (opts.includeAnimations && slide.animations?.length) currentImage = await renderAnimatedFrame(slide, model, elapsedMs, locale);
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, width, height);
      if (transitionFrames && frame >= slideFrames - transitionFrames) {
        const nextSlide = slides[sIdx + 1]; const p = (frame - (slideFrames - transitionFrames)) / Math.max(1, transitionFrames - 1);
        if (transition.effect === 'morph') {
          const morph = buildPresentMorphFrame(slide, nextSlide, p);
          const morphImage = await imageFromSvg(buildPresentSlideSvg(morph.incoming, { ...model, slides }, 1280, 720, undefined, locale));
          drawCover(ctx, morphImage, width, height);
        } else {
          const nextImage = staticImages.get(nextSlide.id)!; drawTransition(ctx, currentImage, nextImage, slide, p, width, height);
        }
      } else drawCover(ctx, currentImage, width, height);
      if (opts.includeCamera && cameraVideo) {
        const pipW = width * 0.22; const pipH = pipW * 9 / 16; ctx.save(); ctx.fillStyle = 'rgba(2,6,23,.9)'; ctx.fillRect(width-pipW-30,height-pipH-30,pipW,pipH); ctx.drawImage(cameraVideo,width-pipW-26,height-pipH-26,pipW-8,pipH-8); ctx.restore();
      }
      if (opts.includePointerInk && take) drawInteractionOverlay(ctx, take.interactionEvents, elapsedMs, width, height);
      if (opts.includeCaptions && take) { const text = activeCaption(take.captions, elapsedMs); if (text) drawCaption(ctx, text, width, height); }
      renderedFrames++; if (renderedFrames % Math.max(1, opts.frameRate / 2) === 0) onProgress?.(15 + Math.round(renderedFrames / totalFrames * 83), sIdx);
      await sleep(1000 / opts.frameRate);
    }
    cameraVideo?.pause();
  }
  recorder.stop();
  const blob = await finished;
  narrationSources.forEach((source) => { try { source.stop(); } catch { /* already ended */ } });
  canvasStream.getTracks().forEach((track) => track.stop());
  await audioContext?.close();
  onProgress?.(100, slides.length - 1);
  const format = requestedMime.startsWith('video/mp4') ? 'mp4' : 'webm';
  return { blob, format, width, height, durationSeconds, fileSizeBytes: blob.size, cues, webVttCaptions: generateWebVttCaptions(cues), narrationTracks: recordedNarrationSidecars({ ...model, slides }), warnings };
}

/** Release Beta 0.1: native save on the desktop; the browser fallback stays a download. */
export function downloadVideoResult(result: VideoExportResult, filename?: string): Promise<ExportDeliveryResult> {
  const resolved = filename || `presentation.${result.format}`;
  return deliverExportBlob(result.blob, {
    suggestedName: resolved,
    extensions: [result.format],
    mimeType: result.format === 'mp4' ? 'video/mp4' : 'video/webm',
  });
}

export function downloadCaptionSidecar(result: VideoExportResult, filename = 'presentation.vtt'): Promise<ExportDeliveryResult> {
  return deliverExportText(result.webVttCaptions, {
    suggestedName: filename,
    extensions: ['vtt'],
    mimeType: 'text/vtt;charset=utf-8',
  });
}

export function downloadNarrationSidecar(sidecar: VideoNarrationSidecar): Promise<ExportDeliveryResult> {
  return deliverExportDataUrl(sidecar.track.dataUrl, {
    suggestedName: sidecar.filename,
    extensions: [/\.[A-Za-z0-9]{1,12}$/u.test(sidecar.filename) ? sidecar.filename.split('.').pop()!.toLowerCase() : 'bin'],
  });
}
