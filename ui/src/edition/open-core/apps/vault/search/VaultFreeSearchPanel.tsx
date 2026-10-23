import React, { useMemo, useState } from 'react';
import { EyeOff, RefreshCw, Search, Shield, Tags } from 'lucide-react';
import type { VaultFile, VaultFolder, VaultSearchIndexModel, VaultSearchIndexPolicy } from '../../../../../shared/contracts/vault/workspaceVault';
import { searchVaultIndex, vaultSearchIndexIsStale } from '../../../../../shared/vault/search/vaultSearchEngine';

interface Props {
  unlocked: boolean;
  files: VaultFile[];
  folders: VaultFolder[];
  index?: VaultSearchIndexModel;
  policy: VaultSearchIndexPolicy;
  onUpdatePolicy: (update: Partial<VaultSearchIndexPolicy>) => void;
  onRebuild: () => Promise<VaultSearchIndexModel>;
  showToast: (message: string) => void;
}

export const VaultFreeSearchPanel: React.FC<Props> = ({ unlocked, files, folders, index, policy, onUpdatePolicy, onRebuild, showToast }) => {
  const [query, setQuery] = useState('');
  const [type, setType] = useState('all');
  const [tag, setTag] = useState('');
  const [owner, setOwner] = useState('');
  const [after, setAfter] = useState('');
  const [before, setBefore] = useState('');
  const [busy, setBusy] = useState(false);
  const [privacyFile, setPrivacyFile] = useState('');
  const [privacyFolder, setPrivacyFolder] = useState('');
  const results = useMemo(() => {
    if (!unlocked) return [];
    try {
      return searchVaultIndex(index, {
        text: query,
        type,
        tags: tag ? tag.split(',') : [],
        owner: owner || undefined,
        modifiedAfter: after ? new Date(`${after}T00:00:00`).getTime() : undefined,
        modifiedBefore: before ? new Date(`${before}T23:59:59.999`).getTime() : undefined,
      }, { unlocked: true });
    } catch {
      return [];
    }
  }, [unlocked, index, query, type, tag, owner, after, before]);
  const stale = vaultSearchIndexIsStale(index, files);
  if (!unlocked) return <section className="rounded-2xl border border-white/[0.08] bg-slate-900/60 p-4" aria-label="Vault search locked">
    <div className="flex items-center gap-2 text-sm font-semibold text-slate-200"><Shield aria-hidden="true" className="h-4 w-4 text-amber-300" />Vault search locked</div>
    <p className="mt-1 text-[10px] text-slate-500">Content index and metadata results remain unavailable until the Vault is unlocked.</p>
  </section>;

  const patchList = (key: 'excludedFileIds' | 'excludedFolderIds', value: string) => {
    if (!value) return;
    onUpdatePolicy({ [key]: [...new Set([...policy[key], value])] });
  };

  return <section className="space-y-3 rounded-2xl border border-white/[0.08] bg-slate-900/60 p-4 shadow-xl backdrop-blur-xl" aria-label="Encrypted local Vault search">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100"><Search aria-hidden="true" className="h-4 w-4 text-cyan-300" />Encrypted local search</h3>
        <p className="mt-1 text-[10px] text-slate-500">Index stays inside the encrypted Vault container. {stale ? 'Rebuild required after file changes.' : 'Index is current.'}</p>
      </div>
      <button type="button" disabled={busy} onClick={() => {
        setBusy(true);
        void onRebuild().then(() => showToast('Vault search index rebuilt locally.'))
          .catch((error: unknown) => showToast(error instanceof Error ? error.message : 'Search rebuild failed.'))
          .finally(() => setBusy(false));
      }} className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-200 disabled:opacity-40">
        <RefreshCw aria-hidden="true" className={`mr-1.5 inline h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />Rebuild index
      </button>
    </div>
    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filename or content…" aria-label="Search Vault files and content" className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-xs text-slate-200" />
      <select value={type} onChange={(event) => setType(event.target.value)} aria-label="Filter by document type" className="rounded-lg border border-white/10 bg-slate-950 px-2 py-2 text-xs text-slate-300">
        <option value="all">All types</option>{['Writer', 'Grid', 'Present', 'Notes', 'Whiteboard', 'PdfStudio', 'Tasks'].map((value) => <option key={value}>{value}</option>)}
      </select>
      <input value={tag} onChange={(event) => setTag(event.target.value)} placeholder="Tags (comma separated)" aria-label="Filter by tags" className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-xs text-slate-200" />
      <input value={owner} onChange={(event) => setOwner(event.target.value)} placeholder="Owner" aria-label="Filter by owner" className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-xs text-slate-200" />
      <input type="date" value={after} onChange={(event) => setAfter(event.target.value)} className="rounded-lg border border-white/10 bg-slate-950 px-2 py-2 text-xs text-slate-300" aria-label="Modified after" />
      <input type="date" value={before} onChange={(event) => setBefore(event.target.value)} className="rounded-lg border border-white/10 bg-slate-950 px-2 py-2 text-xs text-slate-300" aria-label="Modified before" />
    </div>
    <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
      <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold text-slate-300"><EyeOff aria-hidden="true" className="h-3.5 w-3.5 text-violet-300" />Privacy exclusions</div>
      <div className="flex flex-wrap gap-2">
        <select value={privacyFolder} onChange={(event) => setPrivacyFolder(event.target.value)} aria-label="Folder to exclude from indexing" className="rounded border border-white/10 bg-slate-950 px-2 py-1.5 text-[10px]">
          <option value="">Folder…</option>{folders.filter((folder) => !policy.excludedFolderIds.includes(folder.id)).map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
        </select>
        <button type="button" onClick={() => { patchList('excludedFolderIds', privacyFolder); setPrivacyFolder(''); }} className="rounded bg-slate-800 px-2 py-1.5 text-[10px]">Exclude folder content</button>
        <select value={privacyFile} onChange={(event) => setPrivacyFile(event.target.value)} aria-label="File to exclude from indexing" className="max-w-48 rounded border border-white/10 bg-slate-950 px-2 py-1.5 text-[10px]">
          <option value="">File…</option>{files.filter((file) => !policy.excludedFileIds.includes(file.id)).map((file) => <option key={file.id} value={file.id}>{file.name}</option>)}
        </select>
        <button type="button" onClick={() => { patchList('excludedFileIds', privacyFile); setPrivacyFile(''); }} className="rounded bg-slate-800 px-2 py-1.5 text-[10px]">Exclude file content</button>
        <label className="flex items-center gap-1.5 text-[10px] text-slate-400"><input type="checkbox" checked={policy.ocrIndexingEnabled} onChange={(event) => onUpdatePolicy({ ocrIndexingEnabled: event.target.checked })} />Local OCR on rebuild</label>
        <button type="button" onClick={() => onUpdatePolicy({ excludedFileIds: [], excludedFolderIds: [] })} className="rounded px-2 py-1.5 text-[10px] text-slate-400">Clear exclusions</button>
      </div>
      {(policy.excludedFileIds.length + policy.excludedFolderIds.length) > 0 && <p className="mt-2 text-[9px] text-violet-300">{policy.excludedFolderIds.length} folder(s), {policy.excludedFileIds.length} file(s) metadata-only. Content/OCR text is not indexed.</p>}
    </div>
    <div className="max-h-72 overflow-auto rounded-xl border border-white/[0.06] bg-black/20" aria-label="Vault search results">
      {results.slice(0, 100).map((result) => <div key={result.fileId} className="border-b border-white/5 px-3 py-2 last:border-b-0">
        <div className="flex items-center gap-2"><span className="text-xs font-semibold text-slate-200">{result.name}</span><span className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] text-slate-500">{result.kind}</span>{result.privacyExcluded && <EyeOff aria-label="Excluded from content indexing" className="h-3 w-3 text-violet-300" />}</div>
        {result.snippet && <p className="mt-1 line-clamp-2 text-[10px] text-slate-500">{result.snippet}</p>}
      </div>)}
      {!results.length && <div className="px-3 py-8 text-center text-[10px] text-slate-600">{index ? 'No matching indexed items.' : 'Build the local encrypted index to search content.'}</div>}
    </div>
    <div className="flex items-center gap-2 text-[9px] text-slate-600"><Tags aria-hidden="true" className="h-3 w-3" />Metadata search includes filename, tags, custom properties, owner, and type.</div>
  </section>;
};

export default VaultFreeSearchPanel;
