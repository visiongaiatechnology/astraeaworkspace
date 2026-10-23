// STATUS: DIAMANT VGT SUPREME — Safe Audio/Video Insert Modal
import React, { useEffect, useState } from 'react';
import type { WriterMediaObjectData, WriterMediaObjectKind } from '../../../shared/contracts/workspace';
import {
  createWriterLinkedMedia,
  importWriterEmbeddedMedia,
  WriterMediaObjectError,
} from './audio-video/writerAudioVideoMedia';

interface WriterAudioVideoModalProps {
  isOpen: boolean;
  anchorParagraphId?: string;
  onClose: () => void;
  onInsert: (media: WriterMediaObjectData) => void;
}

export const WriterAudioVideoModal: React.FC<WriterAudioVideoModalProps> = ({
  isOpen, anchorParagraphId, onClose, onInsert,
}) => {
  const [kind, setKind] = useState<WriterMediaObjectKind>('audio');
  const [storage, setStorage] = useState<'embedded' | 'linked'>('embedded');
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [caption, setCaption] = useState('');
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setKind('audio'); setStorage('embedded'); setFile(null); setUrl(''); setName(''); setCaption(''); setTranscript(''); setError(null); setBusy(false);
  }, [isOpen]);

  if (!isOpen) return null;

  const submit = async () => {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const media = storage === 'embedded'
        ? file ? await importWriterEmbeddedMedia(file, kind, anchorParagraphId) : (() => { throw new WriterMediaObjectError('Bitte zuerst eine lokale Mediendatei auswählen.'); })()
        : createWriterLinkedMedia(kind, url, name, anchorParagraphId);
      onInsert({ ...media, caption: caption.trim().slice(0, 2_000) || undefined, transcript: transcript.trim().slice(0, 200_000) || undefined }); onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Das Medienobjekt konnte nicht sicher erstellt werden.');
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-5 text-slate-200 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div><h2 className="font-semibold text-white">Audio / Video einfügen</h2><p className="mt-1 text-xs text-slate-400">Embedded bleibt lokal. Linked lädt niemals automatisch.</p></div>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-800 hover:text-white">×</button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs">Typ<select value={kind} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => { setKind(e.target.value as WriterMediaObjectKind); setFile(null); }} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"><option value="audio">Audio</option><option value="video">Video</option></select></label>
          <label className="text-xs">Modus<select value={storage} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => { setStorage(e.target.value as 'embedded' | 'linked'); setError(null); }} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"><option value="embedded">Lokal einbetten</option><option value="linked">HTTPS verknüpfen</option></select></label>
        </div>
        {storage === 'embedded' ? (
          <label className="mt-4 block text-xs">Lokale Datei
            <input type="file" accept={kind === 'audio' ? 'audio/mpeg,audio/wav,audio/ogg,audio/webm' : 'video/mp4,video/webm,video/ogg'} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFile(e.target.files?.[0] ?? null)} className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2" />
            <span className="mt-1 block text-[0.625rem] text-slate-500">Audio max. 25 MiB · Video max. 75 MiB · Signatur und MIME müssen übereinstimmen.</span>
          </label>
        ) : (
          <div className="mt-4 grid gap-3">
            <label className="text-xs">Anzeigename<input value={name} maxLength={240} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2" /></label>
            <label className="text-xs">HTTPS-Link<input type="url" value={url} maxLength={2048} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUrl(e.target.value)} placeholder="https://…" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2" /></label>
            <p className="text-[0.625rem] text-amber-300/80">Der Writer rendert für Links nur eine lokale Karte. Erst ein bewusster Klick öffnet die externe Adresse.</p>
          </div>
        )}
        <div className="mt-4 grid gap-3">
          <label className="text-xs">{kind === 'video' ? 'Untertitel / Kurzbeschreibung' : 'Kurzbeschreibung'}
            <input value={caption} maxLength={2000} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCaption(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2" placeholder="Textalternative für Kontext und Inhalt" />
          </label>
          <label className="text-xs">Transkript
            <textarea value={transcript} maxLength={200000} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setTranscript(e.target.value)} className="mt-1 min-h-24 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2" placeholder="Gesprochener und relevanter visueller Inhalt als Text" />
          </label>
        </div>
        {error && <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{error}</div>}
        <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-xs text-slate-400 hover:bg-slate-800">Abbrechen</button><button type="button" disabled={busy} onClick={() => void submit()} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{busy ? 'Prüfe…' : 'Einfügen'}</button></div>
      </div>
    </div>
  );
};
