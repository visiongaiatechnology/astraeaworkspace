import React from 'react';
import {
  AlertTriangle, CheckSquare2, Download, Edit2, Eye, FileText, FolderOpen, Image as ImageIcon,
  Pin, RefreshCw, ShieldCheck, SlidersHorizontal, Star, Tags, Trash2,
} from 'lucide-react';
import type { DocumentKind, VaultFile, VaultFolder } from '../../contracts/workspace';
import { vaultOpenTargets, type VaultOpenTarget, type VaultViewMode } from './vaultFileSystemEngine';

export interface VaultVerificationFeedback {
  state: 'verified' | 'mismatch' | 'unavailable';
  message: string;
}

interface Props {
  file: VaultFile;
  viewMode: VaultViewMode;
  selected: boolean;
  isVerifying: boolean;
  feedback?: VaultVerificationFeedback;
  onToggleSelected: () => void;
  onRename: (name: string) => void;
  onVerify: () => void;
  onPreview: () => void;
  onInspect: () => void;
  onOpenTarget: (target: VaultOpenTarget) => void;
  onDelete: () => void;
  onToggleFavorite: () => void;
  onTogglePinned: () => void;
  onEditTags: () => void;
  onEditProperties: () => void;
  onSetAssociation: (association: NonNullable<VaultFile['association']>) => void;
  onDragStart: (event: React.DragEvent) => void;
  /**
   * **V-005.** Die Tastaturalternative zum Ordner-Drop: verschiebt **diese** Datei in einen Ordner
   * (`null` = Wurzel). Ohne diesen Rückruf erscheint die Auswahl nicht — ein Knopf, der nichts tut, wäre
   * schlimmer als keiner.
   */
  onMoveToFolder?: (folderId: string | null) => void;
  /**
   * **V-003.** Die Fehlermeldung, die **diese** Datei betrifft (aus „Open With" oder dem Export). Sie wird
   * in der Zeile gerendert, damit die Meldung dort steht, wo die Handlung war.
   */
  fileError?: string | null;
  /** Die Ziele der Verschiebung. Leer bedeutet: es gibt nichts zu wählen, die Auswahl entfällt. */
  folders?: readonly VaultFolder[];
  /**
   * Sitzungssperre: unterdrückt das Inline-Vorschaubild. Das Thumbnail rendert `file.payloadDataUrl`
   * direkt in ein `<img>` — also entschlüsselten Inhalt außerhalb jedes Dialogs. Ohne diesen Schalter
   * würde eine Liste, die aus irgendeinem Grund noch gerendert wird, das Bild weiter zeigen.
   */
  locked?: boolean;
}

const appExtensions: Partial<Record<DocumentKind,string>> = { Writer:'.vdoc', Grid:'.vgrid', Present:'.vpresent', Notes:'.vnote', Whiteboard:'.vboard', Tasks:'.vtask', PdfStudio:'.pdf' };

export const VaultFileEntry: React.FC<Props> = ({
  file, viewMode, selected, isVerifying, feedback, onToggleSelected, onRename, onVerify, onPreview, onInspect,
  onOpenTarget, onDelete, onToggleFavorite, onTogglePinned, onEditTags, onEditProperties, onSetAssociation, onDragStart,
  onMoveToFolder, folders = [], fileError,
  locked = false,
}) => {
  const [editing, setEditing] = React.useState(false);
  const [name, setName] = React.useState(file.name);
  React.useEffect(() => setName(file.name), [file.name]);
  const digest = file.contentDigest ?? file.encryptedHash ?? '';
  const state = feedback?.state ?? file.integrityState ?? 'unverified';
  const targets = vaultOpenTargets(file);
  const passiveRaster = file.status !== 'quarantined' && ['image/png','image/jpeg','image/gif','image/webp'].includes(file.mimeType ?? '');
  const icon = passiveRaster ? <ImageIcon className="h-4 w-4 text-blue-400"/> : <FileText className="h-4 w-4 text-blue-400"/>;
  const commit = () => { const trimmed=name.trim(); if(trimmed && trimmed!==file.name) onRename(trimmed); setEditing(false); };
  const outer = viewMode === 'list'
    ? 'flex flex-col gap-3 rounded-xl border p-3 md:flex-row md:items-center'
    : 'flex min-h-52 flex-col gap-3 rounded-xl border p-4';
  const associationValue = file.association?.action === 'workspace' ? `workspace:${file.association.app ?? file.kind}` : file.association?.action ?? 'download';
  return <article draggable onDragStart={onDragStart} className={`${outer} ${selected?'border-blue-500/45 bg-blue-500/8':state==='mismatch'?'border-rose-500/40 bg-slate-900/60':'border-white/[0.08] bg-slate-900/60 hover:border-white/[0.16]'}`}>
    <div className="flex min-w-0 flex-1 items-start gap-3">
      <button type="button" onClick={onToggleSelected} className={`mt-1 rounded p-1 ${selected?'text-blue-300':'text-slate-600 hover:text-slate-300'}`} aria-label={selected?`Deselect ${file.name}`:`Select ${file.name}`}><CheckSquare2 className="h-4 w-4"/></button>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-slate-950">{icon}</div>
      <div className="min-w-0 flex-1">
        {editing ? <input autoFocus value={name} onChange={(e)=>setName(e.target.value)} onBlur={commit} onKeyDown={(e)=>{if(e.key==='Enter')commit();if(e.key==='Escape'){setName(file.name);setEditing(false);}}} className="w-full rounded border border-blue-500 bg-slate-950 px-2 py-1 text-xs text-white outline-none" aria-label="Rename Vault file"/>
          : <button type="button" onDoubleClick={()=>setEditing(true)} onClick={onToggleSelected} className="block max-w-full truncate text-left text-xs font-bold text-slate-100 hover:text-blue-300" title={file.name}>{file.name}</button>}
        <div className="mt-1 flex flex-wrap gap-1.5 text-[9px] text-slate-500">
          <span className="rounded border border-white/10 bg-slate-950 px-1.5 py-0.5">{appExtensions[file.kind] ?? file.mimeType ?? file.kind}</span>
          <span>{file.sizeBytes >= 1048576 ? `${(file.sizeBytes/1048576).toFixed(1)} MB` : file.sizeBytes >= 1024 ? `${Math.round(file.sizeBytes/1024)} KB` : `${file.sizeBytes} B`}</span>
          <span>{new Date(file.lastModified).toLocaleDateString()}</span><span>{file.classification ?? 'Internal'}</span><span>{file.owner ?? 'local-user'}</span><span>{file.status ?? 'available'}</span><span>{file.securityLabel ?? 'unknown'}</span>
        </div>
        {!!file.tags?.length && <div className="mt-2 flex flex-wrap gap-1">{file.tags.slice(0,6).map(tag=><span key={tag} className="rounded bg-indigo-500/10 px-1.5 py-0.5 text-[9px] text-indigo-300">#{tag}</span>)}</div>}
        {file.status === 'quarantined' && <p className="mt-2 flex items-start gap-1.5 text-[10px] text-amber-300"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0"/>{file.quarantineReason ?? 'Quarantined by Vault inspection.'}</p>}
        {viewMode !== 'list' && !locked && passiveRaster && file.payloadDataUrl && <button aria-label={`Preview ${file.name}`} type="button" onClick={onPreview} className="mt-3 block h-24 w-full overflow-hidden rounded-lg border border-white/10 bg-black/30"><img src={file.payloadDataUrl} alt="" className="h-full w-full object-cover"/></button>}
      </div>
    </div>
    <div className={`${viewMode==='list'?'md:w-52':'w-full'} min-w-0 rounded-lg border border-white/5 bg-slate-950/75 px-2.5 py-1.5 font-mono text-[9px] text-slate-500`} title={digest}>{state==='mismatch'?<AlertTriangle className="mr-1 inline h-3 w-3 text-rose-400"/>:<ShieldCheck className="mr-1 inline h-3 w-3 text-emerald-400"/>}{digest?`${digest.slice(0,12)}…${digest.slice(-6)}`:'No baseline'}</div>
    <div className="flex flex-wrap items-center gap-1.5">
      <button type="button" onClick={onToggleFavorite} className={`rounded-lg border border-white/10 p-1.5 ${file.favorite?'bg-amber-500/15 text-amber-300':'bg-slate-800 text-slate-400'}`} aria-label="Toggle favorite"><Star className="h-3.5 w-3.5"/></button>
      <button type="button" onClick={onTogglePinned} className={`rounded-lg border border-white/10 p-1.5 ${file.pinned?'bg-cyan-500/15 text-cyan-300':'bg-slate-800 text-slate-400'}`} aria-label="Toggle pinned"><Pin className="h-3.5 w-3.5"/></button>
      <button type="button" onClick={onEditTags} className="rounded-lg border border-white/10 bg-slate-800 p-1.5 text-slate-400" aria-label="Edit tags"><Tags className="h-3.5 w-3.5"/></button><button type="button" onClick={onEditProperties} className="rounded-lg border border-white/10 bg-slate-800 p-1.5 text-slate-400" aria-label="Edit custom properties"><SlidersHorizontal className="h-3.5 w-3.5"/></button>
      <button type="button" onClick={()=>setEditing(true)} className="rounded-lg border border-white/10 bg-slate-800 p-1.5 text-slate-400" aria-label="Rename"><Edit2 className="h-3.5 w-3.5"/></button>
      <button type="button" onClick={onPreview} className="rounded-lg border border-white/10 bg-slate-800 p-1.5 text-slate-400" aria-label="Quick preview"><Eye className="h-3.5 w-3.5"/></button><button type="button" onClick={onInspect} className="rounded-lg border border-white/10 bg-slate-800 p-1.5 text-slate-400" aria-label="Inspect content attestation"><ShieldCheck className="h-3.5 w-3.5"/></button>
      <button type="button" onClick={onVerify} disabled={isVerifying} className="rounded-lg border border-white/10 bg-slate-800 p-1.5 text-slate-400 disabled:opacity-40" aria-label="Verify integrity"><RefreshCw className={`h-3.5 w-3.5 ${isVerifying?'animate-spin':''}`}/></button>
      <select value="" onChange={(e)=>{const index=Number(e.target.value);if(Number.isInteger(index)&&targets[index])onOpenTarget(targets[index]);e.currentTarget.value='';}} className="rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-[10px] text-slate-300" aria-label={`Open ${file.name} with`}>
        <option value="">Open With…</option>{targets.map((target,index)=><option key={`${target.action}-${target.app ?? ''}`} value={index}>{target.label}</option>)}
      </select>
      <select value={associationValue} onChange={(e)=>{const value=e.target.value;if(value.startsWith('workspace:'))onSetAssociation({action:'workspace',app:value.slice(10) as DocumentKind,source:'manual'});else onSetAssociation({action:value as 'preview'|'download',source:'manual'});}} className="rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-[10px] text-slate-400" aria-label={`Default file association for ${file.name}`}>
        {targets.some(t=>t.action==='workspace') && <option value={`workspace:${targets.find(t=>t.action==='workspace')?.app ?? file.kind}`}>Default: {targets.find(t=>t.action==='workspace')?.app ?? file.kind}</option>}
        {targets.some(t=>t.action==='preview') && <option value="preview">Default: Preview</option>}
        <option value="download">Default: Download</option>
      </select>
      <button type="button" onClick={onDelete} className="rounded-lg border border-white/10 bg-slate-800 p-1.5 text-slate-400 hover:bg-rose-500/15 hover:text-rose-300" aria-label="Move to Trash"><Trash2 className="h-3.5 w-3.5"/></button>
      {/*
        **V-005 — die Tastaturalternative zum Ordner-Drop.**
        Der Griff der Seitenleiste (`draggable` + `onDrop`) ist **zeigergebunden**: er lässt sich mit der
        Tastatur nicht erreichen. Es gab zwar eine Verschiebe-Werkzeugleiste, aber sie erscheint erst, wenn
        die Datei **vorher** ausgewählt wurde — das Drop-Ziel selbst hatte damit keinen Tastaturweg.
        Diese Auswahl steht in derselben Bedienleiste wie die übrigen Dateiaktionen, ist ohne Vorauswahl
        erreichbar und nennt Ziel **und** Datei im `aria-label`, damit ein Screenreader nicht rätselt,
        welche Datei verschoben wird. Der Wert springt danach zurück auf leer: die Auswahl ist ein Befehl,
        kein Zustand.
      */}
      {onMoveToFolder && folders.length > 0 && <select
        value=""
        disabled={locked}
        onChange={(e)=>{const value=e.target.value;if(!value)return;onMoveToFolder(value==='__root'?null:value);e.currentTarget.value='';}}
        className="rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-[10px] text-slate-400 disabled:opacity-40"
        aria-label={`Move ${file.name} to folder`}
      >
        <option value="">Move to…</option>
        <option value="__root">Vault root</option>
        {folders.map(folder=><option key={folder.id} value={folder.id}>{folder.name}</option>)}
      </select>}
      {targets.some(t=>t.action==='download') && <Download className="hidden h-3 w-3"/>}{targets.some(t=>t.action==='workspace') && <FolderOpen className="hidden h-3 w-3"/>}
    </div>
    {feedback && <p className={`text-[10px] ${feedback.state==='verified'?'text-emerald-300':feedback.state==='mismatch'?'text-rose-300':'text-amber-300'}`}>{feedback.message}</p>}
    {/*
      **V-003.** Der Fehler aus „Open With" (und dem Export) steht **in dieser Zeile**, nicht im allgemeinen
      Fehlerbereich oben im Hinzufügen-Bereich. Bei einer langen Liste war die Meldung dort weit weg von der
      Datei, an der geklickt wurde: der Nutzer sah einen Fehler, ohne zu wissen, welcher Eintrag ihn ausgelöst
      hat. `role="alert"` macht ihn für Screenreader sofort hörbar, und der Dateiname steht im Text, damit die
      Zuordnung auch ohne Blick auf die Zeile eindeutig ist.
    */}
    {fileError && <p role="alert" className="flex items-start gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-[10px] text-rose-300">
      <AlertTriangle aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0"/>
      <span><b>{file.name}</b>: {fileError}</span>
    </p>}
  </article>;
};
