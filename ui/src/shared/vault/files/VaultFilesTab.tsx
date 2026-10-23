import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, Copy, Files, HardDrive, LayoutGrid, List, Lock, Plus, Search, ShieldCheck,
} from 'lucide-react';
import type { VaultFile, VaultFolder, WorkspaceDocument } from '../../contracts/workspace';
import { VaultContentAttestationModal } from '../../../apps/vault/security/VaultContentAttestationModal';
import { VaultBrowserSidebar } from '../../../apps/vault/browser/VaultBrowserSidebar';
import { VaultFileEntry, type VaultVerificationFeedback } from './VaultFileEntry';
import { assertVaultBatchWithinLimits, type VaultBatchOperation } from '../integrity/vaultIntegrity';
import { VaultQuickPreviewModal } from '../preview/VaultQuickPreviewModal';
import { DestructiveConfirmationDialog } from '../../../design-system/components/DestructiveConfirmationDialog';
import { assertVaultSessionRevoked, vaultSessionViewOf } from '../security/vaultSessionLock';
import { copyVaultFiles, createVaultFolder, duplicateVaultFiles, markVaultFileAccessed, moveVaultFiles, moveVaultFolder, queryVaultFiles, renameVaultFile, renameVaultFolder, updateVaultFileMetadata, type VaultFileSystemState, type VaultOpenTarget, type VaultSortDirection, type VaultSortKey, type VaultViewMode } from './vaultFileSystemEngine';

interface VerificationFeedback {
  state: 'verified' | 'mismatch' | 'unavailable';
  message: string;
}

interface VaultFilesTabProps {
  files: VaultFile[];
  folders: VaultFolder[];
  documents: WorkspaceDocument[];
  onAddLocalFiles: (files: File[], folderId: string | null) => Promise<void>;
  onAddWorkspaceDocument: (documentId: string, folderId: string | null) => Promise<void>;
  onUpdateFileSystem: (state: VaultFileSystemState) => void;
  onDeleteFile: (id: string) => void;
  onVerifyFile: (id: string) => Promise<VerificationFeedback>;
  onOpenWith: (file: VaultFile, target: VaultOpenTarget) => Promise<void>;
  /**
   * Sitzungssperre. Ohne diesen Schalter bleibt das bisherige Verhalten (Standard `false`), damit ein
   * Aufrufer, der ihn noch nicht setzt, nichts verliert. **Ist er gesetzt, muss er den Sitzungszustand
   * des Tresors tragen** (`runtimeLocked` in `VaultFreeRuntime`).
   *
   * Warum das nicht kosmetisch ist: Vorschau (`VaultQuickPreviewModal` rendert `dataUrl` in ein `<img>`) und
   * Attestationsdialog liegen als State **in dieser Komponente**, nicht im Elternteil. Das Sperren im
   * Elternteil konnte sie deshalb nicht zurücknehmen — ein entschlüsseltes Bild blieb sichtbar, während der
   * Tresor als gesperrt galt. `locked` nimmt beides zurück und entfernt zusätzlich die Dateiliste
   * (Namen/Tags/Owner/Digests) aus dem DOM.
   */
  locked?: boolean;
  /**
   * Öffnet den Cross-App-Picker (V-023). Ohne diesen Rückruf erscheint die Schaltfläche **nicht** — ein
   * Knopf, der nichts tut, wäre schlimmer als keiner. Der Aufrufer entscheidet, für welche Anwendung
   * ausgewählt wird; der Picker filtert dann mit der Zugriffsautorität.
   */
  onOpenPicker?: () => void;
}

export const VaultFilesTab: React.FC<VaultFilesTabProps> = ({
  files, folders, documents, onAddLocalFiles, onAddWorkspaceDocument, onUpdateFileSystem,
  onDeleteFile, onVerifyFile, onOpenWith, locked = false, onOpenPicker,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fileSearch, setFileSearch] = useState('');
  const [selectedKindFilter, setSelectedKindFilter] = useState('all');
  const [sortKey, setSortKey] = useState<VaultSortKey>('name');
  const [sortDirection, setSortDirection] = useState<VaultSortDirection>('asc');
  const [viewMode, setViewMode] = useState<VaultViewMode>('list');
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [specialFilter, setSpecialFilter] = useState<'none'|'favorites'|'pinned'|'recent'>('none');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [verifyingHashId, setVerifyingHashId] = useState<string | null>(null);
  const [verificationFeedback, setVerificationFeedback] = useState<Record<string, VaultVerificationFeedback>>({});
  const [selectedFileForInspection, setSelectedFileForInspection] = useState<VaultFile | null>(null);
  const [previewFile, setPreviewFile] = useState<VaultFile | null>(null);
  const [workspaceDocumentId, setWorkspaceDocumentId] = useState('');
  const [targetFolderId, setTargetFolderId] = useState<string>('root');
  const [addError, setAddError] = useState<string | null>(null);
  /**
   * **V-003 — der Fehler steht, wo die Handlung war.** Fehler aus „Open With" (und dem Export) landeten in
   * `addError`, das **oben im Hinzufügen-Bereich** gerendert wird. Bei einer Liste mit zwanzig Einträgen
   * stand die Meldung damit weit weg von der Dateizeile, an der geklickt wurde: der Nutzer sieht einen
   * Fehler, ohne zu wissen, welcher Eintrag ihn ausgelöst hat, und sucht die Zeile selbst.
   *
   * Der Fehler wird deshalb **an der Datei** geführt und **in der Zeile** gerendert. `addError` bleibt für
   * das, was wirklich zum Hinzufügen-Bereich gehört: Stapelimport und Verknüpfen. Eine Meldung, die sich auf
   * eine Datei bezieht, gehört nicht dorthin — und eine Meldung über den Stapel nicht in eine Dateizeile.
   */
  const [fileError, setFileError] = useState<{ fileId: string; message: string } | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  /**
   * **V-001 — die Erfolgsmeldung darf nicht ohne die Operation kommen, und die Operation darf nicht ohne
   * Warnung kommen.** `vaultOpenTargets` bietet „Download original" an, und `downloadVaultAttachment`
   * schrieb die **entschlüsselte** Datei ohne jeden Hinweis: „Exportieren nach Freigabe" verlangt aber
   * ausdrücklich eine Warnung vor Klartext. Dieser State hält den angeforderten Export fest, bis der Nutzer
   * bestätigt hat — erst danach wird `onOpenWith` aufgerufen.
   */
  const [plaintextExport, setPlaintextExport] = useState<{ file: VaultFile; target: VaultOpenTarget } | null>(null);
  const PLAINTEXT_EXPORT_CONFIRMATION = 'EXPORT PLAINTEXT';

  /**
   * Sperren nimmt entschlüsseltes Material zurück. Die Zusage wird dabei **nicht** nur behauptet, sondern
   * über `assertVaultSessionRevoked` aus `shared/vault/security/vaultSessionLock.ts` geprüft. Der Aufruf
   * steht deshalb am **Ende** des Effekts: er misst den Zustand *nach* dem Zurücksetzen und wird rot,
   * sobald jemand neuen entschlüsselten Zustand hinzufügt, ohne ihn hier ebenfalls zurückzunehmen.
   */
  useEffect(() => {
    if (!locked) return;
    setPreviewFile(null);
    setSelectedFileForInspection(null);
    setVerificationFeedback({});
    setSelectedIds(new Set());
    setIsDragOver(false);
    setAddError(null);
    assertVaultSessionRevoked(vaultSessionViewOf({
      // Die lokalen Halter entschlüsselten Inhalts. `false` ist hier das Ergebnis des Zurücksetzens
      // oben — der Aufruf dokumentiert damit die Prüfung, nicht eine Annahme.
      preview: false,
      attestation: false,
      fileList: false,
      inlineThumbnails: false,
      undoHistory: false,
    }));
  }, [locked]);

  const fileSystem = useMemo<VaultFileSystemState>(() => ({ files, folders }), [files, folders]);
  const availableWorkspaceDocuments = useMemo(
    () => documents.filter((doc) => !files.some((file) => file.sourceType === 'workspace-document' && file.documentId === doc.id)),
    [documents, files]
  );
  const filteredFiles = useMemo(() => queryVaultFiles(files, {
    folderId: specialFilter === 'none' ? activeFolderId : undefined,
    search: fileSearch,
    kind: selectedKindFilter,
    favoriteOnly: specialFilter === 'favorites',
    pinnedOnly: specialFilter === 'pinned',
    recentOnly: specialFilter === 'recent',
    sortKey,
    sortDirection,
  }), [files, activeFolderId, specialFilter, fileSearch, selectedKindFilter, sortKey, sortDirection]);

  const apply = (next: VaultFileSystemState) => onUpdateFileSystem(next);
  const toggleSelected = (id: string) => setSelectedIds((previous) => {
    const next = new Set(previous); next.has(id) ? next.delete(id) : next.add(id); return next;
  });
  const addLocalFiles = async (incoming: File[]) => {
    if (!incoming.length) return;
    setAddError(null);
    try { await onAddLocalFiles(incoming, activeFolderId); }
    catch (error) { setAddError(error instanceof Error ? error.message : 'File could not be added to Vault.'); }
  };
  const verify = async (id: string) => {
    setVerifyingHashId(id);
    try {
      const feedback = await onVerifyFile(id);
      setVerificationFeedback((previous) => ({ ...previous, [id]: feedback }));
    }
    catch (error) { setVerificationFeedback((p) => ({ ...p, [id]: { state:'unavailable', message:error instanceof Error?error.message:'Integrity verification failed.' } })); }
    finally { setVerifyingHashId(null); }
  };
  const openTarget = async (file: VaultFile, target: VaultOpenTarget) => {
    apply(markVaultFileAccessed(fileSystem, file.id));
    if (target.action === 'preview') { setPreviewFile(file); return; }
    /**
     * **V-001:** Ein Download erzeugt eine **entschlüsselte** Kopie außerhalb des Tresors. Statt sie still
     * zu schreiben, wird hier die Bestätigung verlangt — sichtbar an der Stelle, an der der Export ausgelöst
     * wird, und mit einer Begründung, die **benennt, was nicht geschützt ist**, statt nur „unsicher" zu sagen.
     */
    if (target.action === 'download') { setPlaintextExport({ file, target }); return; }
    try { setFileError(null); await onOpenWith(file, target); }
    /*
     * **V-003.** Der Fehler wird **an dieser Datei** geführt, nicht im allgemeinen Fehlerbereich oben.
     * `fileId` mitgeben heißt: die Zeile kann ihn rendern, und beim nächsten Versuch wird er zurückgenommen.
     */
    catch (error) { setFileError({ fileId: file.id, message: error instanceof Error ? error.message : 'Open With failed.' }); }
  };
  /**
   * Führt den Export **nach** der Bestätigung aus. Getrennt von `openTarget`, damit der Bestätigungspfad
   * nicht erneut in die Abfrage läuft (sonst würde der Dialog wieder geöffnet).
   */
  const openTargetAfterConfirmation = async (file: VaultFile, target: VaultOpenTarget) => {
    // **V-003:** Auch der Exportfehler gehört an die Datei, an der exportiert wurde.
    try { setFileError(null); await onOpenWith(file, target); }
    catch (error) { setFileError({ fileId: file.id, message: error instanceof Error ? error.message : 'Export failed.' }); }
  };
  const selected = [...selectedIds].filter((id) => files.some((file) => file.id === id));

  /**
   * **V-006 — Batch-Operationen sind begrenzt.** Verschieben, Kopieren und Duplizieren verarbeiteten eine
   * **beliebig große** Auswahl auf einmal: keine Zahl, keine Byte-Grenze, keine Rückfrage. Eine Grenze macht
   * aus einem versehentlichen „alles auswählen + kopieren" eine **benannte** Ablehnung statt eines
   * Speicherunfalls (bei Anhängen trägt jeder Eintrag seine Nutzlast als Base64-Zeichenkette). Die Prüfung
   * läuft **vor** der Operation, und die Grenze kommt aus der vorhandenen Import-Autorität
   * (`assertVaultBatchWithinLimits`) — nicht aus einer zweiten Zahl für dieselbe Frage.
   */
  const runBatch = (operation: VaultBatchOperation, run: () => void) => {
    const chosen = files.filter((file) => selectedIds.has(file.id));
    try {
      assertVaultBatchWithinLimits(operation, chosen);
      setAddError(null);
      run();
    } catch (error) {
      // Die Ablehnung wird **sichtbar benannt**: weder still verschluckt noch halb ausgeführt.
      setAddError(error instanceof Error ? error.message : 'The batch operation was rejected.');
    }
  };

  /**
   * Der gesperrte Zweig rendert **keinen** Dateinamen, Tag, Owner oder Digest und **keinen** Vorschau-Inhalt.
   * Er steht nach dem Aufräum-Effekt, damit ein bereits geöffneter Vorschau-Dialog nicht auf dem Weg hierher
   * noch einmal gerendert wird. `data-vault-locked="true"` macht den Zustand im DOM messbar, statt ihn nur
   * zu behaupten.
   */
  if (locked) return <div className="max-w-7xl mx-auto" data-vault-locked="true">
    <section className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] p-5" aria-label="Vault files locked">
      <div className="flex items-center gap-2 text-sm font-semibold text-amber-200"><Lock aria-hidden="true" className="h-4 w-4"/>Vault locked</div>
      <p className="mt-2 text-[11px] text-amber-100/80">File list, preview, metadata and integrity feedback stay withdrawn while the session is locked. Unlock the Vault to work with entries again.</p>
    </section>
  </div>;

  return <div className="max-w-7xl mx-auto space-y-4 relative" data-vault-locked="false" onDragOver={(e)=>{e.preventDefault();if(e.dataTransfer.types.includes('Files'))setIsDragOver(true);}} onDragLeave={()=>setIsDragOver(false)} onDrop={(e)=>{e.preventDefault();setIsDragOver(false);if(e.dataTransfer.files?.length)void addLocalFiles(Array.from(e.dataTransfer.files));}}>
    <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e)=>{void addLocalFiles(Array.from(e.target.files ?? []));e.currentTarget.value='';}} aria-label="Add local files to Vault"/>
    {isDragOver && <div className="rounded-2xl border-2 border-dashed border-blue-500 bg-blue-500/10 p-7 text-center text-sm font-semibold text-blue-300">Drop local files into this Vault folder</div>}

    <section className="rounded-2xl border border-white/[0.08] bg-slate-900/60 p-4 shadow-xl backdrop-blur-xl space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div><h2 className="flex items-center gap-2 text-sm font-semibold text-slate-100"><HardDrive className="h-4 w-4 text-blue-400"/>Local Sovereign Vault</h2><p className="mt-1 text-[10px] text-slate-500">Folder-aware local manifest, native Workspace references and arbitrary binary attachments. No cloud account required.</p></div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={()=>fileInputRef.current?.click()} className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-500"><Plus className="mr-1.5 inline h-3.5 w-3.5"/>Add Local File</button>
          {/*
            **Cross-App-Picker (V-023).** Diese Schaltfläche ist der Einstieg für eine andere Anwendung.
            Sie erscheint nur, wenn der Aufrufer `onOpenPicker` setzt — ein Knopf, der nichts tut, wäre
            schlimmer als keiner. Der Picker filtert danach mit der Zugriffsautorität (V-016).
          */}
          {onOpenPicker && <button type="button" onClick={onOpenPicker} className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-200 hover:bg-cyan-500/20" aria-label="Pick a Vault asset for another application"><ShieldCheck className="mr-1.5 inline h-3.5 w-3.5"/>Pick for app</button>}
        </div>
      </div>
      <div className="flex flex-col gap-2 md:flex-row"><select value={workspaceDocumentId} onChange={(e)=>setWorkspaceDocumentId(e.target.value)} className="flex-1 rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-xs text-slate-200"><option value="">Link an existing Workspace document…</option>{availableWorkspaceDocuments.map(doc=><option key={doc.id} value={doc.id}>{doc.title} · {doc.kind}</option>)}</select><button type="button" disabled={!workspaceDocumentId} onClick={()=>{if(!workspaceDocumentId)return;void onAddWorkspaceDocument(workspaceDocumentId,activeFolderId).then(()=>setWorkspaceDocumentId('')).catch((e)=>setAddError(e instanceof Error?e.message:'Workspace document could not be linked.'));}} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white disabled:bg-slate-800 disabled:text-slate-500">Add Workspace Document</button></div>
      {addError && <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0"/>{addError}</div>}
    </section>

    <div className="flex flex-col gap-4 lg:flex-row">
      {/*
        **AST-1137 — die fehlenden Aufrufer.** `renameVaultFolder` und `moveVaultFolder` waren definiert und
        hatten **0 Produktionsaufrufer**; Ordner ließen sich in der Oberfläche weder umbenennen noch
        verschieben. Hier — an der Stelle, an der die Engine schon liegt — entstehen die Aufrufer. Eine
        Ablehnung der Engine wird **nicht** verschluckt: sie erreicht die Seitenleiste als benannter Fehler.
      */}
      <VaultBrowserSidebar folders={folders} files={files} activeFolderId={activeFolderId} onSelectFolder={setActiveFolderId} specialFilter={specialFilter} onSpecialFilter={setSpecialFilter} onCreateFolder={(name)=>{const folder=createVaultFolder(name,activeFolderId);apply({files,folders:[...folders,folder]});setActiveFolderId(folder.id);}} onMoveFileDrop={(fileId,folderId)=>apply(moveVaultFiles(fileSystem,[fileId],folderId))} onRenameFolder={(folderId,name)=>apply(renameVaultFolder(fileSystem,folderId,name))} onMoveFolder={(folderId,parentId)=>apply(moveVaultFolder(fileSystem,folderId,parentId))}/>
      <main className="min-w-0 flex-1 space-y-3">
        <div className="flex flex-col gap-2 rounded-xl border border-white/[0.06] bg-slate-900/40 p-2.5 xl:flex-row xl:items-center xl:justify-between">
          <div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500"/><input value={fileSearch} onChange={(e)=>setFileSearch(e.target.value)} placeholder="Search name, tag, owner, type or digest…" className="w-full rounded-lg border border-white/10 bg-slate-950/80 py-2 pl-8 pr-3 text-xs text-slate-200 outline-none focus:border-blue-500/50"/></div>
          <div className="flex flex-wrap gap-1.5">
            <select value={selectedKindFilter} onChange={(e)=>setSelectedKindFilter(e.target.value)} className="rounded-lg border border-white/10 bg-slate-950 px-2 py-1.5 text-[10px] text-slate-300"><option value="all">All types</option>{['Writer','Grid','Present','Notes','Database','Forms','Whiteboard','PdfStudio','Tasks','Planner','Projects'].map(k=><option key={k} value={k}>{k}</option>)}</select>
            <select value={sortKey} onChange={(e)=>setSortKey(e.target.value as VaultSortKey)} className="rounded-lg border border-white/10 bg-slate-950 px-2 py-1.5 text-[10px] text-slate-300">{['name','size','modified','accessed','type','owner','classification'].map(k=><option key={k} value={k}>Sort: {k}</option>)}</select>
            <button type="button" onClick={()=>setSortDirection((d)=>d==='asc'?'desc':'asc')} className="rounded-lg border border-white/10 bg-slate-950 px-2 py-1.5 text-[10px] text-slate-300">{sortDirection==='asc'?'A→Z':'Z→A'}</button>
            <button type="button" onClick={()=>setViewMode('list')} className={`rounded-lg p-1.5 ${viewMode==='list'?'bg-blue-500/15 text-blue-300':'text-slate-500'}`} aria-label="List view"><List className="h-4 w-4"/></button>
            <button type="button" onClick={()=>setViewMode('grid')} className={`rounded-lg p-1.5 ${viewMode==='grid'?'bg-blue-500/15 text-blue-300':'text-slate-500'}`} aria-label="Grid view"><LayoutGrid className="h-4 w-4"/></button>
            <button type="button" onClick={()=>setViewMode('gallery')} className={`rounded-lg p-1.5 ${viewMode==='gallery'?'bg-blue-500/15 text-blue-300':'text-slate-500'}`} aria-label="Gallery view"><Files className="h-4 w-4"/></button>
          </div>
        </div>

        {selected.length>0 && <div className="flex flex-wrap items-center gap-2 rounded-xl border border-blue-500/20 bg-blue-500/8 p-2.5 text-[10px] text-blue-100"><span className="font-semibold">{selected.length} selected</span><select value={targetFolderId} onChange={(e)=>setTargetFolderId(e.target.value)} className="rounded border border-white/10 bg-slate-950 px-2 py-1 text-[10px]"><option value="root">Vault root</option>{folders.map(folder=><option key={folder.id} value={folder.id}>{folder.name}</option>)}</select><button type="button" onClick={()=>{runBatch('move',()=>{apply(moveVaultFiles(fileSystem,selected,targetFolderId==='root'?null:targetFolderId));setSelectedIds(new Set());});}} className="rounded bg-slate-800 px-2 py-1">Move</button><button type="button" onClick={()=>{runBatch('copy',()=>{apply(copyVaultFiles(fileSystem,selected,targetFolderId==='root'?null:targetFolderId));setSelectedIds(new Set());});}} className="rounded bg-slate-800 px-2 py-1"><Copy className="mr-1 inline h-3 w-3"/>Copy</button><button type="button" onClick={()=>{runBatch('duplicate',()=>{apply(duplicateVaultFiles(fileSystem,selected));setSelectedIds(new Set());});}} className="rounded bg-slate-800 px-2 py-1">Duplicate</button><button type="button" onClick={()=>{const tags=window.prompt('Comma-separated tags for selected files:','');if(tags!==null)apply(updateVaultFileMetadata(fileSystem,selected,{tags:tags.split(',')}));}} className="rounded bg-slate-800 px-2 py-1">Tags</button><button type="button" onClick={()=>setSelectedIds(new Set())} className="rounded px-2 py-1 text-slate-400">Clear</button></div>}

        <div className={viewMode==='list'?'space-y-2':'grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3'}>
          {filteredFiles.map(file=><VaultFileEntry key={file.id} file={file} viewMode={viewMode} selected={selectedIds.has(file.id)} isVerifying={verifyingHashId===file.id} feedback={verificationFeedback[file.id]} locked={locked} onToggleSelected={()=>toggleSelected(file.id)} onRename={(name)=>apply(renameVaultFile(fileSystem,file.id,name))} onVerify={()=>void verify(file.id)} onPreview={()=>{apply(markVaultFileAccessed(fileSystem,file.id));setPreviewFile(file);}} onInspect={()=>setSelectedFileForInspection(file)} onOpenTarget={(target)=>void openTarget(file,target)} onDelete={()=>onDeleteFile(file.id)} onToggleFavorite={()=>apply(updateVaultFileMetadata(fileSystem,[file.id],{favorite:!file.favorite}))} onTogglePinned={()=>apply(updateVaultFileMetadata(fileSystem,[file.id],{pinned:!file.pinned}))} onEditTags={()=>{const tags=window.prompt('Comma-separated tags:',(file.tags??[]).join(', '));if(tags!==null)apply(updateVaultFileMetadata(fileSystem,[file.id],{tags:tags.split(',')}));}} onEditProperties={()=>{const current=Object.entries(file.properties??{}).map(([key,value])=>`${key}=${value}`).join(', ');const raw=window.prompt('Custom properties as key=value pairs:',current);if(raw!==null){const properties=Object.fromEntries(raw.split(',').map((part)=>part.trim()).filter(Boolean).map((part)=>{const index=part.indexOf('=');return index>0?[part.slice(0,index).trim(),part.slice(index+1).trim()]:[part,''];}));apply(updateVaultFileMetadata(fileSystem,[file.id],{properties}));}}} onSetAssociation={(association)=>apply(updateVaultFileMetadata(fileSystem,[file.id],{association}))} onDragStart={(event)=>{event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('application/x-vgt-vault-file',file.id);}} onMoveToFolder={(folderId)=>apply(moveVaultFiles(fileSystem,[file.id],folderId))} folders={folders} fileError={fileError?.fileId===file.id?fileError.message:null}/>)}
          {!filteredFiles.length && <div className="col-span-full rounded-xl border border-dashed border-white/10 py-12 text-center text-xs text-slate-500">No Vault entries match this folder/filter.</div>}
        </div>
      </main>
    </div>

    <VaultContentAttestationModal locked={locked} file={selectedFileForInspection ? files.find(f=>f.id===selectedFileForInspection.id) ?? selectedFileForInspection : null} onClose={()=>setSelectedFileForInspection(null)}/>
    <VaultQuickPreviewModal locked={locked} file={previewFile} onClose={()=>setPreviewFile(null)} onOpenWorkspace={(file)=>void openTarget(file,{action:'workspace',app:file.kind,label:`Open with ${file.kind}`})}/>
    {/*
      **V-001.** Die Warnung steht an der Stelle, an der der Export ausgelöst wird, und benennt, **was nicht
      geschützt ist** — nicht bloß „unsicher". Der Wortlaut ist derselbe wie im Freigabe-Audit: die Kopie ist
      nicht verschlüsselt und lässt sich nicht zurücknehmen. Die Bestätigungsphrase verhindert das
      versehentliche Klicken; `DestructiveConfirmationDialog` bringt Fokusfalle, Escape und Fokus-Rückgabe mit.
    */}
    {plaintextExport && !locked && <DestructiveConfirmationDialog
      title="Export an unencrypted copy?"
      description={<>
        <b>{plaintextExport.file.name}</b> will be written outside the Vault as a <b>plaintext</b> file.
        <br />The exported copy is <b>not encrypted</b>, is no longer covered by the Vault key, and
        <b> cannot be recalled</b> — later locking the Vault or revoking sharing does not remove it.
      </>}
      confirmLabel="Export unencrypted copy"
      cancelLabel="Cancel"
      requiredText={PLAINTEXT_EXPORT_CONFIRMATION}
      requiredTextLabel={`Type ${PLAINTEXT_EXPORT_CONFIRMATION} to continue`}
      onCancel={()=>setPlaintextExport(null)}
      onConfirm={()=>{
        const pending = plaintextExport;
        setPlaintextExport(null);
        if (!pending) return;
        void openTargetAfterConfirmation(pending.file, pending.target);
      }}
    />}
  </div>;
};
