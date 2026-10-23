// STATUS: DIAMANT VGT SUPREME — consent-gated real MediaRecorder Notes studio
import React, { useEffect, useRef, useState } from 'react';
import { Bookmark, Check, Gauge, Mic, MicOff, Scissors, Shield, Video, X } from 'lucide-react';
import type { NoteMediaBookmark, NoteMediaMemo, NoteTranscriptSegment } from '../../../../shared/contracts/notes-pdf/workspaceNotes';
import {
  NOTE_MEDIA_MAX_BYTES,
  blobToValidatedNoteMediaDataUrl,
  chooseNoteMediaRecorderMime,
  correctNoteMediaDuration,
  createNoteMediaBookmark,
  normalizeNoteMediaMemo,
} from '../notesMediaModel';
import { formatTimeCode, LocalSpeechTranscriptionSession, localSpeechRecognitionAvailable } from './notesSpeechTranscription';
import { useNotesDialogA11y } from '../../editor/useNotesDialogA11y';

interface NotesAudioMemoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertMedia: (memo: NoteMediaMemo) => void;
}

export const NotesAudioMemoModal: React.FC<NotesAudioMemoModalProps> = ({ isOpen, onClose, onInsertMedia }) => {
  const [title, setTitle] = useState('Voice Note');
  const [microphoneConsent, setMicrophoneConsent] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [cameraConsent, setCameraConsent] = useState(false);
  const [localTranscription, setLocalTranscription] = useState(false);
  const [language, setLanguage] = useState('en-US');
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [memo, setMemo] = useState<NoteMediaMemo | null>(null);
  const [bookmarks, setBookmarks] = useState<NoteMediaBookmark[]>([]);
  const [transcript, setTranscript] = useState<NoteTranscriptSegment[]>([]);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [status, setStatus] = useState('No device access is requested until you explicitly start recording.');
  const mediaRef = useRef<HTMLMediaElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const bytesRef = useRef(0);
  const startedAtRef = useRef(0);
  const tickRef = useRef<number | null>(null);
  const discardRef = useRef(false);
  const transcriptionRef = useRef<LocalSpeechTranscriptionSession | null>(null);

  const stopTracks = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };
  const stopTicker = () => {
    if (tickRef.current != null) window.clearInterval(tickRef.current);
    tickRef.current = null;
  };
  const cleanupCapture = (discard = false) => {
    discardRef.current = discard;
    transcriptionRef.current?.stop();
    transcriptionRef.current = null;
    stopTicker();
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder && recorder.state !== 'inactive') {
      try { recorder.stop(); } catch { /* no-op */ }
    }
    stopTracks();
    setRecording(false);
  };

  const close = () => { cleanupCapture(true); onClose(); };

  useEffect(() => () => cleanupCapture(true), []);
  useEffect(() => {
    if (isOpen) return;
    cleanupCapture(true);
  }, [isOpen]);

  /**
   * **W-432:** Der Dialog hatte eine **eigene** Escape-Regel und keine Tab-Falle. Die eigene Regel hat einen
   * echten Grund — *während einer Aufnahme darf Escape den Dialog nicht schließen* —, also wird sie **als
   * Bedingung weitergereicht**, nicht gelöscht: der eine Vertrag bleibt der Eigentümer von Escape, Tab-Falle,
   * Fokus-Eintritt und Fokus-Rückgabe. Der Aufruf steht **vor** dem frühen `return`, wie es die Hook-Regeln
   * verlangen.
   */
  const dialogA11y = useNotesDialogA11y(isOpen, () => { if (!recording) close(); });

  if (!isOpen) return null;

  const resetCaptureState = () => {
    setElapsed(0); setMemo(null); setBookmarks([]); setTranscript([]);
    chunksRef.current = []; bytesRef.current = 0; discardRef.current = false;
  };

  const finalizeRecording = async (kind: 'audio' | 'video', mimeType: string) => {
    stopTicker(); transcriptionRef.current?.stop(); transcriptionRef.current = null;
    const duration = Math.max(0.05, (performance.now() - startedAtRef.current) / 1000);
    const chunks = chunksRef.current; chunksRef.current = [];
    stopTracks(); setRecording(false);
    if (discardRef.current) { discardRef.current = false; return; }
    try {
      const blob = new Blob(chunks, { type: mimeType });
      const encoded = await blobToValidatedNoteMediaDataUrl(blob, kind);
      if (typeof crypto === 'undefined' || typeof crypto.randomUUID !== 'function') throw new Error('Cryptographic random UUID support is required for Notes media.');
      const next = normalizeNoteMediaMemo({
        id: `note-media-${crypto.randomUUID()}`,
        kind,
        title: title.trim() || (kind === 'video' ? 'Video Note' : 'Voice Note'),
        mimeType: encoded.mimeType,
        dataUrl: encoded.dataUrl,
        sizeBytes: encoded.sizeBytes,
        durationSeconds: duration,
        trimStartSeconds: 0,
        trimEndSeconds: duration,
        bookmarks,
        transcript,
        createdAt: Date.now(),
        transcriptionEngine: transcript.length ? 'web-speech-local' : undefined,
      });
      setMemo(next);
      setStatus(`Recorded locally: ${(next.sizeBytes / 1024).toFixed(1)} KiB · ${formatTimeCode(next.durationSeconds)}. Persisted inside the encrypted Workspace document.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Recording finalization failed.');
    }
  };

  const startRecording = async () => {
    if (!microphoneConsent) { setStatus('Explicit microphone consent is required before recording.'); return; }
    if (videoEnabled && !cameraConsent) { setStatus('Explicit camera consent is required for a video note.'); return; }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { setStatus('MediaRecorder or device capture is unavailable in this environment.'); return; }
    const kind: 'audio' | 'video' = videoEnabled ? 'video' : 'audio';
    const mime = chooseNoteMediaRecorderMime(kind);
    if (!mime) { setStatus(`No supported local ${kind} encoder is available.`); return; }
    cleanupCapture(true); resetCaptureState();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: videoEnabled ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } : false,
      });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      recorderRef.current = recorder;
      const baseMime = mime.split(';', 1)[0];
      recorder.ondataavailable = (event) => {
        if (!event.data.size) return;
        const nextBytes = bytesRef.current + event.data.size;
        if (nextBytes > NOTE_MEDIA_MAX_BYTES) {
          setStatus('Recording stopped at the 24 MiB local media safety limit.');
          try { recorder.stop(); } catch { /* no-op */ }
          return;
        }
        bytesRef.current = nextBytes;
        chunksRef.current.push(event.data);
      };
      recorder.onerror = () => setStatus('MediaRecorder reported a local capture error.');
      recorder.onstop = () => { recorderRef.current = null; void finalizeRecording(kind, baseMime); };
      startedAtRef.current = performance.now();
      setRecording(true); setStatus('Recording locally. Microphone/camera tracks will be stopped when recording or the dialog closes.');
      tickRef.current = window.setInterval(() => setElapsed((performance.now() - startedAtRef.current) / 1000), 200);
      recorder.start(1000);
      if (localTranscription) {
        const available = await localSpeechRecognitionAvailable(language);
        if (!available) setStatus('Recording locally. Local speech recognition is unavailable; no cloud fallback will be used.');
        else {
          const session = new LocalSpeechTranscriptionSession(language);
          transcriptionRef.current = session;
          const started = await session.start(
            (segment) => setTranscript((items) => [...items, segment].slice(0, 8_192)),
            (error) => setStatus(`Recording continues; local transcription error: ${error}`),
          );
          if (!started) setStatus('Recording locally. Local speech recognition could not start; no cloud fallback will be used.');
        }
      }
    } catch (error) {
      cleanupCapture(true);
      setStatus(error instanceof Error ? error.message : 'Microphone/camera permission or capture failed.');
    }
  };

  const stopRecording = () => {
    transcriptionRef.current?.stop(); transcriptionRef.current = null;
    stopTicker();
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    else { stopTracks(); setRecording(false); }
  };

  const currentSeconds = () => recording ? elapsed : mediaRef.current?.currentTime ?? memo?.trimStartSeconds ?? 0;
  const addBookmark = () => setBookmarks((items) => [...items, createNoteMediaBookmark(currentSeconds(), `Bookmark ${items.length + 1}`)].slice(0, 256));
  const jumpTo = (seconds: number) => {
    const media = mediaRef.current;
    if (!media || !memo) return;
    media.currentTime = Math.max(memo.trimStartSeconds, Math.min(memo.trimEndSeconds, seconds));
    void media.play().catch(() => undefined);
  };
  const updateTrim = (edge: 'start' | 'end', value: number) => {
    if (!memo) return;
    const start = edge === 'start' ? Math.max(0, Math.min(value, memo.trimEndSeconds - 0.05)) : memo.trimStartSeconds;
    const end = edge === 'end' ? Math.min(memo.durationSeconds, Math.max(value, memo.trimStartSeconds + 0.05)) : memo.trimEndSeconds;
    setMemo({ ...memo, trimStartSeconds: start, trimEndSeconds: end });
  };
  const handleTimeUpdate = () => {
    const media = mediaRef.current;
    if (!media || !memo) return;
    if (media.currentTime < memo.trimStartSeconds) media.currentTime = memo.trimStartSeconds;
    if (media.currentTime >= memo.trimEndSeconds) { media.pause(); media.currentTime = memo.trimStartSeconds; }
  };
  const insertMemo = () => {
    if (!memo) return;
    onInsertMedia(normalizeNoteMediaMemo({ ...memo, bookmarks, transcript }));
    cleanupCapture(true); onClose();
  };
  /**
   * AST-0701/AST-0704: attaching an existing local media file is a first-class path, and it never uploads
   * and never auto-transcribes — the optional local model stays an explicit opt-in per recording.
   */
  const attachLocalMediaFile = async (file: File) => {
    if (!file) return;
    const kind: 'audio' | 'video' = file.type.startsWith('video/') ? 'video' : 'audio';
    try {
      cleanupCapture(true); resetCaptureState();
      const encoded = await blobToValidatedNoteMediaDataUrl(file, kind);
      if (typeof crypto === 'undefined' || typeof crypto.randomUUID !== 'function') throw new Error('Cryptographic random UUID support is required for Notes media.');
      const next = normalizeNoteMediaMemo({
        id: `note-media-${crypto.randomUUID()}`,
        kind,
        title: title.trim() || file.name.replace(/\.[^.]+$/, '').slice(0, 512) || (kind === 'video' ? 'Video Note' : 'Voice Note'),
        mimeType: encoded.mimeType,
        dataUrl: encoded.dataUrl,
        sizeBytes: encoded.sizeBytes,
        // The real length is read from the media element once metadata is available (`onLoadedMetadata`).
        durationSeconds: 0.05,
        trimStartSeconds: 0,
        trimEndSeconds: 0.05,
        bookmarks: [],
        transcript: [],
        createdAt: Date.now(),
      });
      setMemo(next);
      setStatus(`Attached locally: ${(next.sizeBytes / 1024).toFixed(1)} KiB · ${kind}. No upload and no automatic transcript.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'The local media file was rejected by the bounded media policy.');
    }
  };

  /**
   * Adopts the real duration once the player has metadata, so trimming works on an attached file too.
   *
   * ## W-431 — die Korrektur durfte nur **nach unten** gehen
   *
   * Die Regel stand hier als `duration >= memo.durationSeconds → return`. Gemessen an einer angehängten Datei
   * (`attachLocalMediaFile` setzt den Platzhalter `durationSeconds: 0.05`) wurde die **echte**, größere Länge
   * damit **nie** übernommen: `trimEndSeconds` blieb `0.05`, die sichtbare Trimm-Obergrenze blieb bei 0,05 s,
   * und die Anzeige nannte 0,0 s für eine mehrsekündige Datei. Die Entscheidung liegt jetzt **einmal** und rein
   * in `notesMediaModel.correctNoteMediaDuration` — *hier bleibt nur das Verdrahten.*
   */
  const adoptMediaDuration = () => {
    const media = mediaRef.current;
    if (!media || !memo) return;
    const corrected = correctNoteMediaDuration(memo, media.duration);
    if (corrected) setMemo(corrected);
  };

  return <div ref={dialogA11y.ref} tabIndex={-1} onKeyDown={dialogA11y.onKeyDown} className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 select-none" role="dialog" aria-modal="true" aria-label="Audio and video note recorder">
    <div className="bg-slate-900 border border-white/15 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col text-xs">
      <div className="px-4 py-3 bg-slate-950 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2"><Mic className="w-4 h-4 text-emerald-400" /><span className="font-bold text-slate-100 text-sm">Local Audio / Video Note</span><span className="text-[0.5625rem] text-emerald-400 flex items-center gap-1"><Shield className="w-3 h-3" />encrypted-at-rest</span></div>
        <button type="button" onClick={close} aria-label="Close media recorder" className="p-1 rounded hover:bg-white/10 text-slate-400"><X className="w-4 h-4" /></button>
      </div>
      <div className="p-4 space-y-4">
        <input value={title} maxLength={512} onChange={(event) => setTitle(event.target.value)} className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-slate-200 outline-none" aria-label="Media note title" />
        <div className="grid md:grid-cols-2 gap-3 p-3 rounded-xl bg-slate-950 border border-white/10">
          <label className="flex items-start gap-2 text-[0.625rem] text-slate-300"><input type="checkbox" checked={microphoneConsent} onChange={(event) => setMicrophoneConsent(event.target.checked)} /><span>I explicitly allow microphone access when I press Record.</span></label>
          <label className="flex items-start gap-2 text-[0.625rem] text-slate-300"><input type="checkbox" checked={videoEnabled} onChange={(event) => setVideoEnabled(event.target.checked)} /><span className="flex items-center gap-1"><Video className="w-3 h-3" />Record optional video</span></label>
          {videoEnabled && <label className="flex items-start gap-2 text-[0.625rem] text-slate-300"><input type="checkbox" checked={cameraConsent} onChange={(event) => setCameraConsent(event.target.checked)} /><span>I explicitly allow camera access when I press Record.</span></label>}
          <label className="flex items-start gap-2 text-[0.625rem] text-slate-300"><input type="checkbox" checked={localTranscription} onChange={(event) => setLocalTranscription(event.target.checked)} /><span>Use local-only speech recognition when the installed platform model is available.</span></label>
          {localTranscription && <input value={language} onChange={(event) => setLanguage(event.target.value.slice(0, 32))} className="bg-slate-900 border border-white/10 rounded px-2 py-1 text-[0.625rem]" aria-label="Local transcription language" />}
        </div>

        <div className="rounded-xl bg-slate-950 border border-white/10 p-4 space-y-3">
          <div className="text-center text-3xl font-mono font-bold text-slate-100">{formatTimeCode(recording ? elapsed : memo?.durationSeconds ?? 0)}</div>
          <div className="flex justify-center gap-2">
            {!recording ? <button type="button" onClick={() => { void startRecording(); }} className="p-3 rounded-full border border-emerald-500/40 bg-emerald-600/20 text-emerald-300" aria-label="Start real local recording" title="Start real local recording"><Mic className="w-5 h-5" /></button> : <button type="button" onClick={stopRecording} className="p-3 rounded-full border border-rose-500/40 bg-rose-600/20 text-rose-300" aria-label="Stop recording" title="Stop recording"><MicOff className="w-5 h-5" /></button>}
            <button type="button" onClick={addBookmark} disabled={!recording && !memo} className="p-3 rounded-full border border-amber-500/30 text-amber-300 disabled:opacity-30" aria-label="Bookmark current timestamp" title="Bookmark current timestamp"><Bookmark className="w-5 h-5" /></button>
          </div>
          <div className="flex flex-col items-center gap-1">
            <label className="rounded-lg border border-white/10 px-2 py-1 text-[0.625rem] text-slate-300 hover:text-white cursor-pointer">
              Attach an existing local media file
              <input
                type="file"
                accept="audio/webm,audio/ogg,audio/mp4,video/webm,video/mp4"
                className="hidden"
                aria-label="Attach an existing local media file"
                onChange={async (event) => { const file = event.target.files?.[0]; event.currentTarget.value = ''; if (file) await attachLocalMediaFile(file); }}
              />
            </label>
            <span className="text-[0.5625rem] text-slate-500">Stored in the note · no upload · no automatic transcript</span>
          </div>
        </div>

        {memo && <div className="space-y-3">
          {memo.kind === 'video'
            ? <video ref={mediaRef as React.MutableRefObject<HTMLVideoElement | null>} src={memo.dataUrl} controls preload="metadata" onLoadedMetadata={adoptMediaDuration} onPlay={(event: React.UIEvent<HTMLVideoElement>) => { event.currentTarget.playbackRate = playbackSpeed; if (event.currentTarget.currentTime < memo.trimStartSeconds || event.currentTarget.currentTime >= memo.trimEndSeconds) event.currentTarget.currentTime = memo.trimStartSeconds; }} onTimeUpdate={handleTimeUpdate} className="w-full max-h-64 rounded-lg bg-black" />
            : <audio ref={mediaRef as React.MutableRefObject<HTMLAudioElement | null>} src={memo.dataUrl} controls preload="metadata" onLoadedMetadata={adoptMediaDuration} onPlay={(event: React.UIEvent<HTMLAudioElement>) => { event.currentTarget.playbackRate = playbackSpeed; if (event.currentTarget.currentTime < memo.trimStartSeconds || event.currentTarget.currentTime >= memo.trimEndSeconds) event.currentTarget.currentTime = memo.trimStartSeconds; }} onTimeUpdate={handleTimeUpdate} className="w-full" />}
          <div className="flex items-center gap-2 flex-wrap">
            <Gauge className="w-3.5 h-3.5 text-slate-500" />{[0.75, 1, 1.25, 1.5, 2].map((speed) => <button key={speed} type="button" onClick={() => { setPlaybackSpeed(speed); if (mediaRef.current) mediaRef.current.playbackRate = speed; }} className={`px-2 py-1 rounded ${playbackSpeed === speed ? 'bg-blue-600 text-white' : 'border border-white/10 text-slate-400'}`}>{speed}×</button>)}
          </div>
          <div className="grid grid-cols-2 gap-2 p-2 rounded-lg border border-white/10"><label className="text-[0.625rem] text-slate-400 flex items-center gap-2"><Scissors className="w-3 h-3" />Trim start<input type="number" min={0} max={memo.trimEndSeconds - 0.05} step="0.1" value={memo.trimStartSeconds.toFixed(1)} onChange={(event) => updateTrim('start', Number(event.target.value))} className="min-w-0 flex-1 bg-slate-950 border border-white/10 rounded px-2 py-1" /></label><label className="text-[0.625rem] text-slate-400 flex items-center gap-2">Trim end<input type="number" min={memo.trimStartSeconds + 0.05} max={memo.durationSeconds} step="0.1" value={memo.trimEndSeconds.toFixed(1)} onChange={(event) => updateTrim('end', Number(event.target.value))} className="min-w-0 flex-1 bg-slate-950 border border-white/10 rounded px-2 py-1" /></label></div>
        </div>}

        {bookmarks.length > 0 && <div className="space-y-1 max-h-24 overflow-y-auto"><span className="text-[0.625rem] uppercase tracking-wider text-slate-500">Bookmarks</span>{bookmarks.map((bookmark) => <button type="button" key={bookmark.id} onClick={() => jumpTo(bookmark.seconds)} disabled={!memo} className="w-full flex items-center gap-2 px-2 py-1 rounded bg-slate-950 border border-white/5 text-left disabled:opacity-50"><span className="font-mono text-amber-300">{formatTimeCode(bookmark.seconds)}</span><span className="truncate">{bookmark.label}</span></button>)}</div>}
        {transcript.length > 0 && <div className="space-y-1 max-h-36 overflow-y-auto"><span className="text-[0.625rem] uppercase tracking-wider text-slate-500">Local transcript · click to jump</span>{transcript.map((segment) => <button type="button" key={segment.id} onClick={() => jumpTo(segment.startSeconds)} disabled={!memo} className="w-full text-left px-2 py-1 rounded hover:bg-white/5"><span className="font-mono text-cyan-300 mr-2">{formatTimeCode(segment.startSeconds)}</span><span className="text-slate-300">{segment.text}</span></button>)}</div>}
        <div className="text-[0.625rem] text-slate-500">{status}</div>
      </div>
      <div className="px-4 py-3 bg-slate-950 border-t border-white/10 flex justify-end gap-2"><button type="button" onClick={close} className="px-3 py-1.5 rounded border border-white/10 text-slate-300">Cancel</button><button type="button" disabled={!memo} onClick={insertMemo} className="px-3 py-1.5 rounded bg-emerald-600 text-white disabled:opacity-40 flex items-center gap-1"><Check className="w-3.5 h-3.5" />Embed media note</button></div>
    </div>
  </div>;
};
