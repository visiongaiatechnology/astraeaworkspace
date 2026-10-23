import React, { useState } from 'react';
import { Folder, FolderPlus, Home, Pencil, Star, Pin, Clock3, type LucideIcon } from 'lucide-react';
import type { VaultFile, VaultFolder } from '../../../shared/contracts/workspace';
import { buildVaultFolderTree, descendantVaultFolderIds } from '../../../shared/vault/files/vaultFileSystemEngine';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { vaultBrowserText } from '../vaultBrowserLocale';

interface Props {
  folders: VaultFolder[];
  files: VaultFile[];
  activeFolderId: string | null;
  onSelectFolder: (id: string | null) => void;
  onCreateFolder: (name: string) => void;
  onMoveFileDrop: (fileId: string, folderId: string | null) => void;
  specialFilter: 'none' | 'favorites' | 'pinned' | 'recent';
  onSpecialFilter: (value: 'none' | 'favorites' | 'pinned' | 'recent') => void;
  /**
   * **AST-1137 — der fehlende Aufrufer.** `renameVaultFolder` und `moveVaultFolder` existieren in
   * `shared/vault/files/vaultFileSystemEngine.ts` (`:157`, `:178`) und hatten **0 Produktionsaufrufer**;
   * Ordner ließen sich in der Oberfläche weder umbenennen noch verschieben. Die Rückrufe sind optional:
   * ohne sie erscheinen die Bedienelemente **nicht** — ein Knopf, der nichts tut, wäre schlimmer als keiner.
   */
  onRenameFolder?: (folderId: string, name: string) => void;
  onMoveFolder?: (folderId: string, parentId: string | null) => void;
}

const specialFilters: Array<{ key: 'favorites' | 'pinned' | 'recent'; icon: LucideIcon }> = [
  { key: 'favorites', icon: Star },
  { key: 'pinned', icon: Pin },
  { key: 'recent', icon: Clock3 },
];

export const VaultBrowserSidebar: React.FC<Props> = ({ folders, files, activeFolderId, onSelectFolder, onCreateFolder, onMoveFileDrop, specialFilter, onSpecialFilter, onRenameFolder, onMoveFolder }) => {
  const { locale } = useWorkspaceLocale();
  const t = (message: Parameters<typeof vaultBrowserText>[0]) => vaultBrowserText(message, locale);
  const [newFolderName, setNewFolderName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [folderError, setFolderError] = useState<string | null>(null);
  const tree = buildVaultFolderTree(folders, files);
  const drop = (event: React.DragEvent, folderId: string | null) => {
    event.preventDefault();
    const fileId = event.dataTransfer.getData('application/x-vgt-vault-file');
    if (fileId) onMoveFileDrop(fileId, folderId);
  };

  /**
   * **Zyklen werden gar nicht erst angeboten.** `moveVaultFolder` lehnt sie ohnehin ab
   * (`vault_folder_cycle`, `vault_parent_not_found`) — das ist die Autorität. Die Oberfläche blendet
   * unmögliche Ziele aus, damit der Fehler nicht zum Normalfall wird. **Es ist dieselbe Regel, nicht eine
   * zweite:** beide Seiten benutzen `descendantVaultFolderIds` aus dem Modul, in dem auch die Engine liegt.
   */
  const beginRename = (folder: VaultFolder) => { setRenamingId(folder.id); setRenameValue(folder.name); setFolderError(null); };
  const commitRename = (folder: VaultFolder) => {
    const next = renameValue.trim();
    // Unverändert oder leer: nichts tun, statt eine benannte Ablehnung zu provozieren.
    if (!onRenameFolder || !next || next === folder.name) { setRenamingId(null); return; }
    try {
      onRenameFolder(folder.id, next);
      setFolderError(null);
    } catch (error) {
      // **Benannt und sichtbar** — die Ablehnung der Engine wird nicht verschluckt.
      setFolderError(error instanceof Error ? error.message : 'The folder could not be renamed.');
    }
    setRenamingId(null);
  };
  const commitMove = (folder: VaultFolder, target: string) => {
    if (!onMoveFolder) return;
    try {
      onMoveFolder(folder.id, target === '__root' ? null : target);
      setFolderError(null);
    } catch (error) {
      setFolderError(error instanceof Error ? error.message : 'The folder could not be moved.');
    }
  };

  return <aside className="w-full lg:w-56 shrink-0 space-y-3 rounded-2xl border border-white/[0.08] bg-slate-900/55 p-3">
    <div className="space-y-1">
      <button type="button" onDragOver={(e)=>e.preventDefault()} onDrop={(e)=>drop(e,null)} onClick={()=>{onSpecialFilter('none');onSelectFolder(null);}} className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs ${specialFilter==='none' && activeFolderId===null?'bg-blue-500/15 text-blue-200':'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}><Home className="h-3.5 w-3.5"/>{t('root')}</button>
      {specialFilters.map(({ key, icon: Icon }) => <button key={key} type="button" onClick={() => onSpecialFilter(key)} className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs ${specialFilter === key ? 'bg-blue-500/15 text-blue-200' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}><Icon className="h-3.5 w-3.5" />{t(key)}</button>)}
    </div>
    <div className="border-t border-white/10 pt-3">
      <div className="mb-2 flex items-center justify-between"><span className="text-[0.625rem] font-bold uppercase tracking-wider text-slate-500">{t('folders')}</span><Folder className="h-3.5 w-3.5 text-slate-600"/></div>
      <div className="max-h-72 space-y-0.5 overflow-auto" data-vault-folder-tree="true">
        {tree.map(({folder,depth,fileCount}) => {
          const blocked = new Set<string>([folder.id, ...descendantVaultFolderIds(folders, folder.id)]);
          return <div key={folder.id} className="rounded-lg" style={{paddingLeft:`${depth*14}px`}} data-vault-folder-row={folder.id}>
            <div className={`flex items-center justify-between gap-1 rounded-lg py-1 ${activeFolderId===folder.id && specialFilter==='none'?'bg-indigo-500/15 text-indigo-200':'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}>
              {renamingId === folder.id
                ? <input
                    autoFocus
                    value={renameValue}
                    onChange={(e)=>setRenameValue(e.target.value)}
                    onBlur={()=>commitRename(folder)}
                    onKeyDown={(e)=>{if(e.key==='Enter'){e.preventDefault();commitRename(folder);}if(e.key==='Escape'){e.preventDefault();setRenamingId(null);}}}
                    maxLength={240}
                    className="min-w-0 flex-1 rounded border border-indigo-500 bg-slate-950 px-1.5 py-0.5 text-[0.6875rem] text-white outline-none"
                    aria-label={`Rename folder ${folder.name}`}
                  />
                : <button type="button" draggable onDragOver={(e)=>e.preventDefault()} onDrop={(e)=>drop(e,folder.id)} onClick={()=>{onSpecialFilter('none');onSelectFolder(folder.id);}} className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-[0.6875rem]">
                    <Folder className="h-3 w-3 shrink-0"/><span className="truncate">{folder.name}</span>
                  </button>}
              <span className="shrink-0 text-[0.5625rem] text-slate-600">{fileCount}</span>
              {onRenameFolder && renamingId !== folder.id && <button type="button" onClick={()=>beginRename(folder)} className="shrink-0 rounded p-0.5 text-slate-500 hover:text-slate-200" aria-label={`Rename folder ${folder.name}`}><Pencil className="h-3 w-3"/></button>}
            </div>
            {/*
              **Verschieben als Tastaturweg.** Ordner waren bisher nur per Zeiger verschiebbar (Drop auf ein
              Ziel); diese Auswahl ist ohne Zeiger erreichbar, nennt Ziel **und** Ordner im `aria-label` und
              blendet Zyklen aus. Der Wert springt zurück — die Auswahl ist ein **Befehl**, kein Zustand.
            */}
            {onMoveFolder && renamingId !== folder.id && <select
              value=""
              onChange={(e)=>{const value=e.currentTarget.value;if(!value)return;commitMove(folder,value);e.currentTarget.value='';}}
              className="ml-4 mt-0.5 rounded border border-white/10 bg-slate-900 px-1.5 py-0.5 text-[0.5625rem] text-slate-400"
              aria-label={`Move folder ${folder.name} into`}
            >
              <option value="">Move to…</option>
              <option value="__root">Vault root</option>
              {folders.filter((candidate)=>!blocked.has(candidate.id)).map((candidate)=><option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
            </select>}
          </div>;
        })}
        {!tree.length && <p className="px-2 py-3 text-[0.625rem] text-slate-600">{t('emptyFolders')}</p>}
      </div>
      {/* Die Ablehnung steht **im** Ordnerbereich, nicht in einem allgemeinen Fehlerkasten. */}
      {folderError && <p role="alert" className="mt-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-[0.625rem] text-rose-300">{folderError}</p>}
    </div>
    <form className="flex gap-1.5 border-t border-white/10 pt-3" onSubmit={(e)=>{e.preventDefault();if(newFolderName.trim()){onCreateFolder(newFolderName.trim());setNewFolderName('');}}}>
      <input value={newFolderName} onChange={(e)=>setNewFolderName(e.target.value)} maxLength={120} placeholder={t('newFolder')} className="min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-950 px-2 py-1.5 text-[0.625rem] text-slate-200 outline-none focus:border-blue-500/40" aria-label={t('newFolderName')}/>
      <button type="submit" disabled={!newFolderName.trim()} className="rounded-lg border border-white/10 bg-slate-800 p-1.5 text-slate-300 disabled:opacity-40" aria-label={t('createFolder')}><FolderPlus className="h-3.5 w-3.5"/></button>
    </form>
  </aside>;
};
