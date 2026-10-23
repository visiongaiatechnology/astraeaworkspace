import React, { useMemo, useState } from 'react';
import { Download, Eye, GitCompare, History, LockKeyhole, RotateCcw, Save, ShieldOff } from 'lucide-react';
import type { VaultFile, VaultFileVersion, VaultVersionRetentionPolicy } from '../../contracts/workspace';
import type { VaultVersionCompareResult, VaultVersionPreview } from './vaultVersionHistoryEngine';
import { vaultVersionStorageUsage, vaultVersionsForFile } from './vaultVersionHistoryEngine';

interface Props {
  files: VaultFile[];
  versions: VaultFileVersion[];
  retention: VaultVersionRetentionPolicy;
  onCaptureNamed: (fileId: string, label: string) => Promise<void>;
  /**
   * Liefert die Vorschau erst nach der Digest-Prüfung: der Aufruf ist deshalb `Promise`-basiert. Eine
   * synchrone Signatur hätte bedeutet, den Inhalt vor der Prüfung zu parsen (Defekt V-008).
   */
  onPreview: (versionId: string) => Promise<VaultVersionPreview>;
  onRestore: (versionId: string) => Promise<unknown>;
  onDownload: (versionId: string) => Promise<string>;
  onHold: (versionId: string, hold: boolean) => void;
  onCompare: (beforeId: string, afterId: string) => VaultVersionCompareResult;
  onUpdateRetention: (policy: Partial<VaultVersionRetentionPolicy>) => void;
  showToast: (message: string) => void;
}

const fmt = (n: number) => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KiB` : `${(n / 1048576).toFixed(1)} MiB`;
const button = 'inline-flex items-center gap-1 rounded border border-purple-500/25 px-2 py-1 text-[10px] text-purple-200 hover:bg-purple-500/10 disabled:opacity-40';

export const VaultVersionHistoryPanel: React.FC<Props> = (props) => {
  const { files, versions, retention, onCaptureNamed, onPreview, onRestore, onDownload, onHold, onCompare, onUpdateRetention, showToast } = props;
  const [fileId, setFileId] = useState(files[0]?.id ?? '');
  const [label, setLabel] = useState('');
  const [preview, setPreview] = useState<VaultVersionPreview | null>(null);
  const [compare, setCompare] = useState<VaultVersionCompareResult | null>(null);
  const [beforeId, setBeforeId] = useState('');
  const [afterId, setAfterId] = useState('');
  const selected = files.find((file) => file.id === fileId) ?? files[0];
  const history = useMemo(() => selected ? vaultVersionsForFile(versions, selected.id) : [], [versions, selected?.id]);
  const usage = vaultVersionStorageUsage(versions);
  const run = async (success: string, fn: () => Promise<unknown>) => {
    try { await fn(); showToast(success); }
    catch (error) { showToast(error instanceof Error ? error.message : `${success} failed.`); }
  };
  if (!files.length) return null;

  return (
    <section className="rounded-2xl border border-purple-500/20 bg-[#0b0715]/85 p-4 space-y-3" aria-labelledby="vault-version-history-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="vault-version-history-title" className="text-xs font-semibold text-purple-100 flex items-center gap-2"><History className="w-4 h-4" />Version History</h2>
          <p className="text-[10px] text-slate-500">Historical snapshots stay inside the encrypted Vault until you explicitly export one.</p>
        </div>
        <div className="text-[10px] text-slate-400">{usage.versionCount} versions · {fmt(usage.totalBytes)} · {usage.heldCount} held</div>
      </div>

      <div className="grid gap-2 md:grid-cols-[minmax(180px,1fr)_minmax(180px,1fr)_auto]">
        <select value={selected?.id ?? ''} onChange={(event) => { setFileId(event.target.value); setPreview(null); setCompare(null); }} aria-label="Version-history file" className="rounded-lg border border-white/10 bg-slate-950 px-2 py-2 text-xs">
          <option value="" disabled>Select file</option>
          {files.map((file) => <option key={file.id} value={file.id}>{file.name}</option>)}
        </select>
        <input value={label} onChange={(event) => setLabel(event.target.value)} maxLength={120} placeholder="Named version label" aria-label="Named version label" className="rounded-lg border border-white/10 bg-slate-950 px-2 py-2 text-xs" />
        <button className={button} disabled={!selected || !label.trim()} onClick={() => selected && void run('Named version saved.', async () => { await onCaptureNamed(selected.id, label); setLabel(''); })}><Save className="w-3 h-3" />Save named version</button>
      </div>

      <div className="grid gap-2 sm:grid-cols-3 text-[10px]">
        <label className="text-slate-400">Versions/file <input type="number" min={1} max={128} value={retention.maxVersionsPerFile} onChange={(event) => onUpdateRetention({ maxVersionsPerFile: Number(event.target.value) })} className="ml-2 w-20 rounded bg-slate-950 border border-white/10 px-2 py-1" /></label>
        <label className="text-slate-400">Max age days <input type="number" min={1} max={3650} value={retention.maxAgeDays} onChange={(event) => onUpdateRetention({ maxAgeDays: Number(event.target.value) })} className="ml-2 w-20 rounded bg-slate-950 border border-white/10 px-2 py-1" /></label>
        <span className="text-slate-500">Protected versions ignore age/cap retention.</span>
      </div>

      <div className="max-h-64 overflow-auto rounded-xl border border-white/5" role="region" aria-label="Historical versions">
        {history.length ? history.map((version) => (
          <div key={version.id} className="grid grid-cols-[1fr_auto] gap-2 border-b border-white/5 p-2 last:border-0">
            <div className="min-w-0">
              <p className="truncate text-[11px] text-slate-200">{version.label || (version.source === 'automatic' ? 'Automatic version' : version.source)}</p>
              <p className="text-[9px] text-slate-500">{new Date(version.createdAt).toLocaleString()} · {fmt(version.snapshotBytes)} · {version.contentDigest.slice(0, 12)}… {version.protectedHold ? '· HOLD' : ''}</p>
            </div>
            <div className="flex flex-wrap justify-end gap-1">
              <button className={button} onClick={() => void run('Historical version previewed.', async () => { const next = await onPreview(version.id); setPreview(next); setCompare(null); })} aria-label={`Preview ${version.label || version.createdAt}`}><Eye className="w-3 h-3" /></button>
              <button className={button} onClick={() => void run('Historical version exported.', () => onDownload(version.id))} aria-label="Download historical version"><Download className="w-3 h-3" /></button>
              <button className={button} onClick={() => void run('Version restored.', () => onRestore(version.id))} aria-label="Restore historical version"><RotateCcw className="w-3 h-3" /></button>
              <button className={button} onClick={() => onHold(version.id, !version.protectedHold)} aria-label={version.protectedHold ? 'Remove retention hold' : 'Protect from retention'}>{version.protectedHold ? <ShieldOff className="w-3 h-3" /> : <LockKeyhole className="w-3 h-3" />}</button>
            </div>
          </div>
        )) : <p className="p-3 text-[10px] text-slate-500">No snapshots yet. Newly added files receive an automatic baseline version.</p>}
      </div>

      {history.length >= 2 && (
        <div className="flex flex-wrap items-center gap-2">
          <GitCompare className="w-3.5 h-3.5 text-purple-300" />
          <select value={beforeId} onChange={(event) => setBeforeId(event.target.value)} aria-label="Older version" className="rounded bg-slate-950 border border-white/10 px-2 py-1 text-[10px]"><option value="">Older…</option>{history.map((version) => <option key={version.id} value={version.id}>{version.label || new Date(version.createdAt).toLocaleString()}</option>)}</select>
          <select value={afterId} onChange={(event) => setAfterId(event.target.value)} aria-label="Newer version" className="rounded bg-slate-950 border border-white/10 px-2 py-1 text-[10px]"><option value="">Newer…</option>{history.map((version) => <option key={version.id} value={version.id}>{version.label || new Date(version.createdAt).toLocaleString()}</option>)}</select>
          <button className={button} disabled={!beforeId || !afterId || beforeId === afterId} onClick={() => { try { setCompare(onCompare(beforeId, afterId)); setPreview(null); } catch (error) { showToast(error instanceof Error ? error.message : 'Compare failed.'); } }}><GitCompare className="w-3 h-3" />Compare</button>
        </div>
      )}

      {preview && <div className="rounded-lg bg-black/25 p-3 text-[10px] text-slate-300 max-h-48 overflow-auto">{preview.kind === 'text' ? <pre className="whitespace-pre-wrap">{preview.text}</pre> : preview.kind === 'image' ? <img src={preview.dataUrl} alt="Historical version preview" className="max-h-40 object-contain" /> : preview.kind === 'workspace' ? <><b>{preview.document.title}</b><p>{preview.document.kind} · document v{preview.document.version}</p></> : <p>{preview.kind === 'pdf' ? 'Historical PDF snapshot available for explicit download.' : preview.message}</p>}</div>}
      {compare && <div className="rounded-lg bg-black/25 p-3 text-[10px] text-slate-300"><p>{compare.supported ? `Changed ${compare.changed}, added ${compare.added}, removed ${compare.removed}.` : `Compare unavailable: ${compare.reason}`}</p>{compare.sample.slice(0, 12).map((line, index) => <p key={index} className="font-mono truncate">{line}</p>)}</div>}
    </section>
  );
};
