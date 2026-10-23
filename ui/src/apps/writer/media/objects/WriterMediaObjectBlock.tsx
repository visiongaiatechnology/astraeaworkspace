// STATUS: DIAMANT VGT SUPREME — Safe Embedded/Linked Audio/Video Renderer
import React from 'react';
import type { WriterMediaObjectData } from '../../../../shared/contracts/workspace';
import { isSafeWriterEmbeddedMediaSource, normalizeWriterMediaLink } from '../audio-video/writerAudioVideoMedia';
import { AnimatedAccordion } from '../../../../design-system/components/AnimatedAccordion';

interface WriterMediaObjectBlockProps {
  media: WriterMediaObjectData;
  readOnly?: boolean;
  onDelete?: () => void;
  onOpenExternalUrl?: (url: string) => void | Promise<void>;
}

export const WriterMediaObjectBlock: React.FC<WriterMediaObjectBlockProps> = ({ media, readOnly = false, onDelete, onOpenExternalUrl }) => {
  let safeLink: string | null = null;
  if (media.storage === 'linked' && media.sourceUrl) {
    try { safeLink = normalizeWriterMediaLink(media.sourceUrl); } catch { safeLink = null; }
  }
  const embedded = isSafeWriterEmbeddedMediaSource(media);
  return (
    <figure data-writer-media-id={media.id} aria-label={`${media.kind === 'audio' ? 'Audio' : 'Video'}: ${media.name}`} className="my-3 rounded-xl border border-slate-700/60 bg-slate-950/50 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <figcaption className="truncate text-xs font-medium text-slate-300">{media.kind === 'audio' ? 'Audio' : 'Video'} · {media.name}</figcaption>
        {!readOnly && onDelete && <button type="button" onClick={onDelete} className="rounded px-2 py-1 text-[0.625rem] text-rose-300 hover:bg-rose-500/10">Entfernen</button>}
      </div>
      {media.storage === 'embedded' && embedded && media.kind === 'audio' && (
        <audio controls preload="metadata" src={media.embeddedDataUrl} aria-label={`${media.name} audio`} className="w-full">Audio-Wiedergabe wird vom Browser nicht unterstützt.</audio>
      )}
      {media.storage === 'embedded' && embedded && media.kind === 'video' && (
        <video controls preload="metadata" playsInline src={media.embeddedDataUrl} aria-label={`${media.name} video`} className="max-h-[360px] w-full rounded-lg bg-black">Video-Wiedergabe wird vom Browser nicht unterstützt.</video>
      )}
      {media.storage === 'embedded' && !embedded && <div className="rounded-lg bg-rose-500/10 p-3 text-xs text-rose-300">Unsichere oder manipulierte eingebettete Medienquelle blockiert.</div>}
      {media.storage === 'linked' && safeLink && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
          <p className="truncate font-mono text-[0.625rem] text-slate-500">{safeLink}</p>
          <button type="button" disabled={!onOpenExternalUrl} onClick={() => { if (onOpenExternalUrl) void onOpenExternalUrl(safeLink); }} className="mt-2 inline-block rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50">{onOpenExternalUrl ? 'Über NetGate öffnen' : 'NetGate nicht verfügbar'}</button>
        </div>
      )}
      {media.storage === 'linked' && !safeLink && <div className="rounded-lg bg-rose-500/10 p-3 text-xs text-rose-300">Ungültiger oder unsicherer Medienlink blockiert.</div>}
      {media.caption && <p className="mt-2 text-center text-xs italic text-slate-400">{media.caption}</p>}
      {media.transcript && <AnimatedAccordion className="mt-2 rounded-lg border border-slate-800 bg-slate-900/60 p-2 text-xs text-slate-300" title="Transkript" headingLevel={5} triggerClassName="cursor-pointer font-medium" contentClassName="mt-2 whitespace-pre-wrap leading-relaxed">{media.transcript}</AnimatedAccordion>}
    </figure>
  );
};
