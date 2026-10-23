// STATUS: DIAMANT VGT SUPREME — bounded local attachment preview, no active remote content
import React, { useEffect, useState } from 'react';
import { Download, File, Maximize2, Minimize2, ShieldCheck, X } from 'lucide-react';
import type { NoteAttachment } from '../../../shared/contracts/workspace';
import { canPreviewNoteAttachment, downloadNoteAttachment, verifyNoteAttachmentIntegrity } from './noteAttachments';
import { NOTE_PREVIEW_MAX_ZOOM, NOTE_PREVIEW_MIN_ZOOM, formatNotePreviewZoom, notePreviewZoomStyle, stepNotePreviewZoom, supportsNotePreviewZoom } from './notesAttachmentZoom';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { notesAuxText } from '../notesAuxLocale';
import { useNotesDialogA11y } from '../editor/useNotesDialogA11y';

interface Props {
  attachment: NoteAttachment | null;
  onClose: () => void;
}

function decodeTextPreview(attachment: NoteAttachment, invalidEnvelope: string, decodeFailed: string): string {
  const prefix = `data:${attachment.mimeType || 'application/octet-stream'};base64,`;
  if (!attachment.dataUrl.startsWith(prefix)) return invalidEnvelope;
  try {
    const binary = atob(attachment.dataUrl.slice(prefix.length));
    const bytes = new Uint8Array(Math.min(binary.length, 256 * 1024));
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch {
    return decodeFailed;
  }
}

export const NotesAttachmentPreviewModal: React.FC<Props> = ({ attachment, onClose }) => {
  const { locale } = useWorkspaceLocale();
  const t = (message: Parameters<typeof notesAuxText>[0]) => notesAuxText(message, locale);
  const [integrity, setIntegrity] = useState<'checking' | 'valid' | 'invalid'>('checking');
  const [zoom, setZoom] = useState(1);
  /**
   * **W-432:** Der Dialog hatte Fokus-Eintritt und Escape **von Hand** — aber keine Tab-Falle und keine
   * Fokus-Rückgabe. *Drei von vier Teilen eines Vertrags sind kein Vertrag:* mit `Tab` lief der Fokus in die
   * Seite hinter dem Dialog, und nach dem Schließen stand er wieder am Dokumentanfang. Der eine Hook besitzt
   * jetzt alle vier Teile; die Handfassung entfällt, statt daneben zu stehen.
   */
  const dialogA11y = useNotesDialogA11y(Boolean(attachment), onClose);
  useEffect(() => {
    let active = true;
    setIntegrity('checking');
    if (!attachment) return () => { active = false; };
    setZoom(1);
    void verifyNoteAttachmentIntegrity(attachment).then((valid) => { if (active) setIntegrity(valid ? 'valid' : 'invalid'); }).catch(() => { if (active) setIntegrity('invalid'); });
    return () => { active = false; };
  }, [attachment]);
  if (!attachment) return null;

  const preview = canPreviewNoteAttachment(attachment);
  const trusted = integrity === 'valid';
  const zoomable = supportsNotePreviewZoom(preview);
  return <div ref={dialogA11y.ref} tabIndex={-1} onKeyDown={dialogA11y.onKeyDown} className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" role="dialog" aria-modal="true" aria-label={t('attachmentPreview')}>
    <div className="w-full max-w-4xl max-h-[88vh] overflow-hidden rounded-2xl border border-white/15 bg-slate-950 shadow-2xl flex flex-col">
      <header className="flex items-center gap-3 border-b border-white/10 px-4 py-3"><File className="w-4 h-4 text-purple-300"/><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold text-slate-100">{attachment.name}</div><div className="text-[0.5625rem] font-mono text-slate-500">{attachment.mimeType} · {attachment.sizeBytes.toLocaleString(locale)} bytes · SHA-256 {attachment.sha256?.slice(0, 16) ?? t('missingHash')}…</div></div><span className={`text-[0.5625rem] flex items-center gap-1 ${trusted ? 'text-emerald-300' : integrity === 'invalid' ? 'text-rose-300' : 'text-slate-500'}`}><ShieldCheck className="w-3 h-3"/>{t(integrity === 'valid' ? 'integrityValid' : integrity === 'invalid' ? 'integrityInvalid' : 'integrityChecking')}</span><button type="button" onClick={onClose} aria-label={t('closeAttachmentPreview')} className="p-1 text-slate-400 hover:text-white"><X className="w-4 h-4"/></button></header>
      {trusted && zoomable && <div className="flex items-center justify-end gap-1 border-b border-white/10 px-4 py-1.5" role="group" aria-label="Attachment zoom">
        <button type="button" onClick={() => setZoom((current) => stepNotePreviewZoom(current, -1))} disabled={zoom <= NOTE_PREVIEW_MIN_ZOOM} className="rounded border border-white/10 p-1 text-slate-400 disabled:opacity-30" aria-label="Zoom out attachment"><Minimize2 className="w-3 h-3"/></button>
        <button type="button" onClick={() => setZoom(1)} className="min-w-12 rounded border border-white/10 px-1 py-0.5 text-[0.625rem] font-mono text-slate-300" aria-label={`Attachment zoom ${formatNotePreviewZoom(zoom)}, reset to 100 percent`}>{formatNotePreviewZoom(zoom)}</button>
        <button type="button" onClick={() => setZoom((current) => stepNotePreviewZoom(current, 1))} disabled={zoom >= NOTE_PREVIEW_MAX_ZOOM} className="rounded border border-white/10 p-1 text-slate-400 disabled:opacity-30" aria-label="Zoom in attachment"><Maximize2 className="w-3 h-3"/></button>
      </div>}
      <main className="flex-1 min-h-64 overflow-auto p-4 bg-[#080b11]">
        {!trusted ? <div className="h-full min-h-52 flex items-center justify-center text-center text-xs text-rose-300">{t('integrityBlocked')}</div>
          : preview === 'image' ? <img src={attachment.dataUrl} alt={attachment.name} style={notePreviewZoomStyle('image', zoom)} className="max-w-full max-h-[65vh] object-contain mx-auto"/>
          : preview === 'text' ? <pre className="whitespace-pre-wrap break-words text-[0.6875rem] leading-relaxed text-slate-300 font-mono">{decodeTextPreview(attachment, t('envelopeInvalid'), t('decodeFailed'))}</pre>
          : preview === 'pdf' ? <iframe title={`PDF preview: ${attachment.name}`} src={attachment.dataUrl} sandbox="" referrerPolicy="no-referrer" style={notePreviewZoomStyle('pdf', zoom)} className="h-[65vh] min-w-full rounded-lg border border-white/10 bg-white"/>
          : <div className="h-full min-h-52 flex items-center justify-center text-center text-xs text-slate-500">{t('opaqueAttachment')}</div>}
      </main>
      <footer className="flex justify-end gap-2 border-t border-white/10 px-4 py-3"><button type="button" onClick={() => { void downloadNoteAttachment(attachment).catch(() => setIntegrity('invalid')); }} disabled={!trusted} className="flex items-center gap-1 rounded-lg border border-purple-500/30 px-3 py-2 text-xs text-purple-200 disabled:opacity-40"><Download className="w-3.5 h-3.5"/>{t('saveAs')}</button><button type="button" onClick={onClose} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-400">{t('close')}</button></footer>
    </div>
  </div>;
};
