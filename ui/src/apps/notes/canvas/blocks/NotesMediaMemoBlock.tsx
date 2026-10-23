// STATUS: DIAMANT VGT SUPREME — persistent local Notes media block
import React, { useEffect, useRef, useState } from 'react';
import { Bookmark, Gauge, Scissors } from 'lucide-react';
import type { NoteMediaMemo } from '../../../../shared/contracts/notes-pdf/workspaceNotes';
import { normalizeNoteMediaMemo } from '../../media/notesMediaModel';
import { formatTimeCode } from '../../media/audio/notesSpeechTranscription';

interface NotesMediaMemoBlockProps {
  memo: NoteMediaMemo;
  onChange: (memo: NoteMediaMemo) => void;
}

export const NotesMediaMemoBlock: React.FC<NotesMediaMemoBlockProps> = ({ memo, onChange }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const activeMedia = () => memo.kind === 'video' ? videoRef.current : audioRef.current;
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    const media = activeMedia();
    if (media) media.playbackRate = speed;
  }, [memo.kind, speed]);

  const jumpTo = (seconds: number) => {
    const media = activeMedia();
    if (!media) return;
    media.currentTime = Math.max(memo.trimStartSeconds, Math.min(memo.trimEndSeconds, seconds));
    void media.play().catch(() => undefined);
  };

  const handleTimeUpdate = () => {
    const media = activeMedia();
    if (!media) return;
    if (media.currentTime < memo.trimStartSeconds) media.currentTime = memo.trimStartSeconds;
    if (media.currentTime >= memo.trimEndSeconds) {
      media.pause();
      media.currentTime = memo.trimStartSeconds;
    }
  };

  const updateTrim = (edge: 'start' | 'end', value: number) => {
    const trimStartSeconds = edge === 'start'
      ? Math.max(0, Math.min(value, memo.trimEndSeconds - 0.05))
      : memo.trimStartSeconds;
    const trimEndSeconds = edge === 'end'
      ? Math.min(memo.durationSeconds, Math.max(value, memo.trimStartSeconds + 0.05))
      : memo.trimEndSeconds;
    onChange(normalizeNoteMediaMemo({ ...memo, trimStartSeconds, trimEndSeconds }));
  };

  const mediaProps = {
    src: memo.dataUrl,
    controls: true,
    preload: 'metadata' as const,
    onLoadedMetadata: () => { const media = activeMedia(); if (media) media.currentTime = memo.trimStartSeconds; },
    onTimeUpdate: handleTimeUpdate,
    className: 'w-full max-h-44 rounded-lg bg-black',
  };

  return <div className="h-full overflow-auto p-3 space-y-2 bg-slate-950/40">
    <div className="flex items-center gap-2">
      <strong className="text-xs text-slate-200 truncate flex-1">{memo.title}</strong>
      <span className="text-[0.5625rem] text-slate-500">{formatTimeCode(memo.trimEndSeconds - memo.trimStartSeconds)}</span>
    </div>
    {memo.kind === 'video' ? <video ref={videoRef} {...mediaProps} /> : <audio ref={audioRef} {...mediaProps} />}
    <div className="flex items-center gap-1 flex-wrap">
      <Gauge className="w-3 h-3 text-slate-500" />
      {[0.75, 1, 1.25, 1.5, 2].map((value) => <button key={value} type="button" onClick={() => setSpeed(value)} className={`px-1.5 py-0.5 rounded text-[0.5625rem] ${speed === value ? 'bg-blue-600 text-white' : 'border border-white/10 text-slate-400'}`}>{value}×</button>)}
    </div>
    <div className="grid grid-cols-2 gap-2">
      <label className="text-[0.5625rem] text-slate-500"><span className="flex items-center gap-1"><Scissors className="w-3 h-3" />Trim start</span><input aria-label="Media trim start" type="number" min={0} max={memo.trimEndSeconds - 0.05} step="0.1" value={memo.trimStartSeconds.toFixed(1)} onChange={(event) => updateTrim('start', Number(event.target.value))} className="mt-1 w-full bg-slate-900 border border-white/10 rounded px-1.5 py-1 text-slate-300" /></label>
      <label className="text-[0.5625rem] text-slate-500"><span>Trim end</span><input aria-label="Media trim end" type="number" min={memo.trimStartSeconds + 0.05} max={memo.durationSeconds} step="0.1" value={memo.trimEndSeconds.toFixed(1)} onChange={(event) => updateTrim('end', Number(event.target.value))} className="mt-1 w-full bg-slate-900 border border-white/10 rounded px-1.5 py-1 text-slate-300" /></label>
    </div>
    {memo.bookmarks.length > 0 && <div className="space-y-1"><div className="flex items-center gap-1 text-[0.5625rem] uppercase tracking-wider text-slate-500"><Bookmark className="w-3 h-3" />Bookmarks</div>{memo.bookmarks.map((bookmark) => <button key={bookmark.id} type="button" onClick={() => jumpTo(bookmark.seconds)} className="w-full flex gap-2 text-left text-[0.5625rem] hover:bg-white/5 rounded px-1 py-0.5"><span className="font-mono text-amber-300">{formatTimeCode(bookmark.seconds)}</span><span className="truncate text-slate-400">{bookmark.label}</span></button>)}</div>}
    {memo.transcript.length > 0 && <div className="space-y-1"><div className="text-[0.5625rem] uppercase tracking-wider text-slate-500">Local transcript · click to jump</div>{memo.transcript.map((segment) => <button key={segment.id} type="button" onClick={() => jumpTo(segment.startSeconds)} className="w-full text-left rounded px-1 py-0.5 hover:bg-white/5 text-[0.5625rem]"><span className="font-mono text-cyan-300 mr-2">{formatTimeCode(segment.startSeconds)}</span><span className="text-slate-400">{segment.text}</span></button>)}</div>}
  </div>;
};
