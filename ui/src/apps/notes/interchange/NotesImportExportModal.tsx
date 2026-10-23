// STATUS: DIAMANT VGT SUPREME — scoped Notes import/export control surface
import React, { useRef, useState } from 'react';
import { ClipboardPaste, Download, FileArchive, Printer, Upload, X } from 'lucide-react';
import type { NoteNotebook, NotePage, NoteSection } from '../../../shared/contracts/workspace';
import { NOTE_CLIP_MAX_INPUT_CHARS, notePageFromClip, sanitizeNoteClip } from './notesHtmlClip';
import { buildScopedNotesExport, buildScopedNotesExportAsync, importCommonNoteFiles, type NotesExportFormat, type NotesExportScope } from './notesImportExport';
import { notesExportFidelityWarnings } from './notesExportFidelity';
import { printNoteFreeformPage } from './notesCanvasPrint';
import { deliverExportBytes } from '../../../shared/interchange/exportDelivery';
import { useNotesDialogA11y } from '../editor/useNotesDialogA11y';

interface Props {
  isOpen: boolean;
  notebook: NoteNotebook | null;
  section: NoteSection | null;
  page: NotePage | null;
  onImportNotebook: (notebook: NoteNotebook) => void;
  onClose: () => void;
}
/** Release Beta 0.1: native save on the desktop; the browser fallback stays a download. */
function download(artifact: ReturnType<typeof buildScopedNotesExport>) {
  const extension = /\.[A-Za-z0-9]{1,12}$/u.test(artifact.filename) ? artifact.filename.split('.').pop()!.toLowerCase() : 'bin';
  return deliverExportBytes(artifact.bytes, {
    suggestedName: artifact.filename,
    extensions: [extension],
    mimeType: artifact.mimeType,
  });
}
export const NotesImportExportModal: React.FC<Props> = ({isOpen,notebook,section,page,onImportNotebook,onClose}) => {
  const [scopeKind,setScopeKind]=useState<'notebook'|'section'|'page'>('notebook');
  const [format,setFormat]=useState<NotesExportFormat>('markdown-folder');
  const [status,setStatus]=useState(''); const fileRef=useRef<HTMLInputElement>(null);
  /**
   * AST-0731: a pasted web clip is sanitised locally into an editable note. Active content is dropped and
   * the removal is named, so the import never silently keeps (or silently loses) something.
   */
  const [clipHtml,setClipHtml]=useState('');
  const [clipNotice,setClipNotice]=useState<string | null>(null);
  /**
   * W-433-Familie: das verschlüsselte `.vnote` **lesen**. Die Ausfuhr gab es immer
   * (`security/NotesSecurityModal.tsx`), den Leser `unpackVnote` rief niemand auf — die Datei war eine
   * Einbahnstraße. Das Kennwortfeld ist der **eine** fehlende Eingang; es wird nur für `.vnote` gebraucht.
   * Ein echtes `<label>`, kein Platzhalter als Beschriftung.
   */
  const [vnotePassword,setVnotePassword]=useState('');
  const dialogA11y = useNotesDialogA11y(isOpen, onClose);
  if(!isOpen) return null;
  const importClip=()=>{
    try{
      if(!clipHtml.trim()) throw new Error('Paste an HTML fragment first.');
      const clip=sanitizeNoteClip(clipHtml,{ title: page ? `${page.title} clip` : undefined });
      if(!clip.markdown) throw new Error('The pasted fragment contained no readable text.');
      const note=notePageFromClip(clip);
      const now=Date.now();
      const sectionTitle=section?.title ?? 'Web clips';
      if(page){ setStatus(`Sanitised web clip ready: “${note.title}” (${note.content.length} characters, ${clip.links} link(s)). Use Import to store it as its own note.`); }
      onImportNotebook({
        id:`nb-clip-${now}`, title:note.title, createdAt:now, updatedAt:now, trashedAt:null,
        sections:[{ id:`sec-clip-${now}`, title:sectionTitle, createdAt:now, updatedAt:now, trashedAt:null, pages:[{
          id:`page-clip-${now}`, title:note.title, content:note.content, tags:note.tags, backlinks:[],
          created_at:now, last_modified:now, attachments:[], revisions:[],
        }] }],
      });
      setClipNotice(clip.sanitized
        ? `Removed active or remote content: ${clip.removedElements.join(', ')}.`
        : 'No active or remote content was found.');
      setClipHtml('');
      setStatus(`Imported the sanitised clip as “${note.title}”.`);
    }catch(error){ setStatus(error instanceof Error?error.message:'Web clip import failed.'); }
  };
  const scope=():NotesExportScope|null => {
    if(!notebook) return null;
    if(scopeKind==='notebook') return {kind:'notebook',notebook};
    if(!section) return null;
    if(scopeKind==='section') return {kind:'section',notebook,section};
    if(!page) return null;
    return {kind:'page',notebook,section,page};
  };
  const exportWarnings=(()=>{const value=scope();return value?notesExportFidelityWarnings(value,format):[];})();
  const exportNow=async()=>{ try{const value=scope();if(!value) throw new Error('Selected export scope is unavailable.');const delivery=await download(await buildScopedNotesExportAsync(value,format));setStatus(`${delivery.mode==='file'?`${delivery.fileName} saved.`:`Download started: ${delivery.fileName} (browser mode – no write confirmation).`} ${exportWarnings.length?`Exported ${scopeKind} as ${format} with ${exportWarnings.length} declared fidelity limitation(s).`:`Exported ${scopeKind} as ${format} with no known Notes-model fidelity loss.`}`);}catch(error){setStatus(error instanceof Error?error.message:'Export failed.');} };
  const printCanvas=()=>{try{const value=scope();if(!value||value.kind!=='page'||value.page.editorMode!=='freeform')throw new Error('Select a freeform page to print.');printNoteFreeformPage(value.page);setStatus('Opened the freeform page print view using the same deterministic canvas presentation model as PDF export.');}catch(error){setStatus(error instanceof Error?error.message:'Print failed.');}};
  const importFiles=async(files:FileList|null)=>{ if(!files?.length)return;try{const imported=await importCommonNoteFiles(Array.from(files),vnotePassword?{vnotePassword}:{});onImportNotebook(imported);setStatus(`Imported ${imported.sections.reduce((n,s)=>n+s.pages.length,0)} page(s).`);}catch(error){setStatus(error instanceof Error?error.message:'Import failed.');}finally{if(fileRef.current)fileRef.current.value='';} };
  return <div ref={dialogA11y.ref} tabIndex={-1} onKeyDown={dialogA11y.onKeyDown} className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Notes import and export"><div className="w-full max-w-xl rounded-2xl border border-white/10 bg-[#0d121c] shadow-2xl overflow-hidden"><div className="flex items-center justify-between p-4 border-b border-white/10"><div><div className="text-sm font-bold flex items-center gap-2"><FileArchive className="w-4 h-4 text-blue-300"/>Notes Import / Export</div><div className="text-[0.625rem] text-slate-500">Scoped, local and bounded. Multi-page Markdown/HTML rewrites internal wiki links.</div></div><button aria-label="Close Notes Import Export dialog" type="button" onClick={onClose} className="p-1.5 rounded hover:bg-white/10"><X className="w-4 h-4"/></button></div><div className="p-4 space-y-4">
  <section className="rounded-xl border border-white/10 bg-white/[0.025] p-3 space-y-2"><div className="text-xs font-semibold">Export</div><div className="grid grid-cols-2 gap-2"><select value={scopeKind} onChange={e=>setScopeKind(e.target.value as typeof scopeKind)} className="bg-slate-950 border border-white/10 rounded px-2 py-1.5 text-xs"><option value="notebook">Notebook</option><option value="section">Section</option><option value="page">Page</option></select><select value={format} onChange={e=>setFormat(e.target.value as NotesExportFormat)} className="bg-slate-950 border border-white/10 rounded px-2 py-1.5 text-xs"><option value="markdown-folder">Markdown folder (.zip)</option><option value="html">HTML</option><option value="pdf">PDF</option><option value="text">Plain text</option><option value="json">Structured JSON</option></select></div><button type="button" onClick={()=>void exportNow()} className="flex items-center gap-1.5 px-2 py-1 rounded border border-blue-500/20 bg-blue-500/10 text-[0.625rem] text-blue-200"><Download className="w-3 h-3"/>Export selected scope</button>{scopeKind==='page'&&page?.editorMode==='freeform'&&<button type="button" onClick={printCanvas} className="ml-2 inline-flex items-center gap-1.5 px-2 py-1 rounded border border-cyan-500/20 bg-cyan-500/10 text-[0.625rem] text-cyan-200"><Printer className="w-3 h-3"/>Print freeform page</button>}{exportWarnings.length>0&&<div role="note" className="rounded-lg border border-amber-500/20 bg-amber-500/[0.07] p-2 text-[0.5625rem] text-amber-100"><div className="font-semibold mb-1">Declared fidelity limits for this export:</div><ul className="list-disc pl-4 space-y-0.5">{exportWarnings.map((warning)=><li key={warning}>{warning}</li>)}</ul></div>}</section>
  <section className="rounded-xl border border-white/10 bg-white/[0.025] p-3 space-y-2"><div className="text-xs font-semibold">Import</div><p className="text-[0.625rem] text-slate-500">Markdown, HTML, plain text, Astraea Notes JSON, an exported Astraea Markdown-folder ZIP, an encrypted native <code>.vnote</code> container and common image/document attachments. Files are validated by the existing attachment gate before embedding.</p><input ref={fileRef} type="file" multiple accept=".md,.markdown,.txt,.html,.htm,.notes.json,.zip,.vnote,image/*,application/pdf" onChange={e=>void importFiles(e.target.files)} className="hidden"/><div className="flex flex-wrap items-end gap-2"><button type="button" onClick={()=>fileRef.current?.click()} className="flex items-center gap-1.5 px-2 py-1 rounded border border-emerald-500/20 bg-emerald-500/10 text-[0.625rem] text-emerald-200"><Upload className="w-3 h-3"/>Choose files</button><label className="flex flex-col gap-0.5"><span className="text-[0.5625rem] uppercase tracking-wider text-slate-500">Password for an encrypted .vnote</span><input type="password" value={vnotePassword} autoComplete="off" onChange={event=>setVnotePassword(event.target.value)} className="bg-slate-950 border border-white/10 rounded px-2 py-1 text-[0.625rem] text-slate-200" aria-describedby="vnote-password-hint"/></label></div><p id="vnote-password-hint" className="text-[0.5625rem] text-slate-500">Only needed when the chosen file is a <code>.vnote</code> container; other formats ignore it. Without a matching password the container is refused, and the refusal names the reason.</p><p className="text-[0.5625rem] text-slate-600">OneNote proprietary binary is intentionally not faked. The separate interoperability adapter accepts valid OneNote XML exports and ENEX.</p></section>
  <section className="rounded-xl border border-white/10 bg-white/[0.025] p-3 space-y-2"><div className="text-xs font-semibold flex items-center gap-1.5"><ClipboardPaste className="w-3.5 h-3.5 text-cyan-300"/>Web clip (sanitised locally)</div><p className="text-[0.625rem] text-slate-500">Paste an HTML fragment. Scripts, styles, frames, forms, event handlers and remote resources are removed before anything is stored. Nothing is fetched.</p><label className="block space-y-1"><span className="sr-only">HTML fragment to sanitise</span><textarea value={clipHtml} onChange={event=>setClipHtml(event.target.value.slice(0,NOTE_CLIP_MAX_INPUT_CHARS))} rows={4} maxLength={NOTE_CLIP_MAX_INPUT_CHARS} placeholder="<article><h1>Title</h1><p>Text…</p></article>" className="w-full bg-slate-950 border border-white/10 rounded px-2 py-1.5 font-mono text-[0.625rem] text-slate-200" aria-label="HTML fragment to sanitise"/></label><div className="flex items-center gap-2"><button type="button" onClick={importClip} disabled={!clipHtml.trim()} className="flex items-center gap-1.5 px-2 py-1 rounded border border-cyan-500/20 bg-cyan-500/10 text-[0.625rem] text-cyan-200 disabled:opacity-40"><ClipboardPaste className="w-3 h-3"/>Sanitise and import</button>{clipNotice&&<span role="status" aria-live="polite" className="text-[0.5625rem] text-amber-200">{clipNotice}</span>}</div></section>
  <div className="text-[0.625rem] text-slate-500 border border-white/10 rounded p-2">{status || 'No export or import operation has run yet.'}</div>
</div></div></div>;
};
