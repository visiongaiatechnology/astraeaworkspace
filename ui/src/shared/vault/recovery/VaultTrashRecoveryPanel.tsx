import React, { useMemo, useState } from 'react';
import { ArchiveRestore, RotateCcw, ShieldAlert, Trash2 } from 'lucide-react';
import type { VaultFolder, VaultRecoverySnapshot, VaultTrashEntry, VaultTrashRetentionPolicy } from '../../contracts/workspace';
import { EMPTY_TRASH_CONFIRMATION, vaultPurgeSemantics, vaultRecoveryStorageUsage, vaultTrashUsage } from './vaultRecoveryEngine';
import { DestructiveConfirmationDialog } from '../../../design-system/components/DestructiveConfirmationDialog';

interface VaultTrashRecoveryPanelProps {
  trash: VaultTrashEntry[];
  folders: VaultFolder[];
  retention: VaultTrashRetentionPolicy;
  recoverySnapshots: VaultRecoverySnapshot[];
  onRestoreOne: (trashId: string, destinationFolderId?: string | null) => void;
  onRestoreBulk: (trashIds: readonly string[], destinationFolderId?: string | null) => void;
  onPurgeOne: (trashId: string) => void;
  onEmptyTrash: (confirmation: string) => void;
  onUpdateRetention: (policy: Partial<VaultTrashRetentionPolicy>) => number;
  onApplyRetention: () => number;
  onCreateSnapshot: (label?: string) => Promise<unknown>;
  onRestoreSnapshot: (snapshotId: string) => Promise<{ updated: number; recreated: number }>;
  showToast: (message: string) => void;
}

const fmt = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 ** 2 ? `${(bytes / 1024).toFixed(1)} KiB` : `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
const button = 'inline-flex items-center gap-1 rounded-lg border border-white/10 bg-slate-900/70 px-2 py-1 text-[10px] text-slate-300 hover:border-cyan-400/30 disabled:opacity-40';

export const VaultTrashRecoveryPanel: React.FC<VaultTrashRecoveryPanelProps> = ({
  trash, folders, retention, recoverySnapshots, onRestoreOne, onRestoreBulk, onPurgeOne, onEmptyTrash,
  onUpdateRetention, onApplyRetention, onCreateSnapshot, onRestoreSnapshot, showToast,
}) => {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [destination, setDestination] = useState('__original__');
  const [pendingPurge, setPendingPurge] = useState<VaultTrashEntry | null>(null);
  const [confirmEmptyOpen, setConfirmEmptyOpen] = useState(false);
  const [snapshotLabel, setSnapshotLabel] = useState('');
  const trashUsage = useMemo(() => vaultTrashUsage(trash), [trash]);
  const recoveryUsage = useMemo(() => vaultRecoveryStorageUsage(recoverySnapshots), [recoverySnapshots]);
  const purge = vaultPurgeSemantics();
  const destinationValue = destination === '__original__' ? undefined : destination === '__root__' ? null : destination;
  const run = async (success: string, operation: () => unknown | Promise<unknown>) => {
    try { await operation(); showToast(success); }
    catch (error) { showToast(error instanceof Error ? error.message : 'Recovery operation failed.'); }
  };
  const toggle = (id: string) => setSelected((current) => {
    const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next;
  });

  return (
    <section className="rounded-2xl border border-amber-500/20 bg-[#130e07]/80 p-4 space-y-4" aria-labelledby="vault-trash-recovery-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="vault-trash-recovery-title" className="flex items-center gap-2 text-xs font-semibold text-amber-100"><ArchiveRestore className="h-4 w-4"/>Trash & Recovery</h2>
          <p className="text-[10px] text-slate-500">Soft delete is recoverable; purge removes the encrypted Vault object reference, not physical SSD cells.</p>
        </div>
        <span className="text-[10px] text-slate-400">Trash {trashUsage.count} · {fmt(trashUsage.bytes)} · Recovery {recoveryUsage.count} · {fmt(recoveryUsage.bytes)}</span>
      </div>

      <div className="grid gap-2 md:grid-cols-[auto_1fr_auto] items-center">
        <label className="text-[10px] text-slate-400">Retention days <input type="number" min={1} max={3650} value={retention.maxAgeDays} onChange={(event) => { const purged = onUpdateRetention({ maxAgeDays: Number(event.target.value) }); if (purged) showToast(`Retention purged ${purged} expired item(s).`); }} className="ml-2 w-20 rounded border border-white/10 bg-slate-950 px-2 py-1"/></label>
        <select value={destination} onChange={(event) => setDestination(event.target.value)} aria-label="Trash restore destination" className="rounded-lg border border-white/10 bg-slate-950 px-2 py-1.5 text-[10px] text-slate-300">
          <option value="__original__">Restore to original location</option><option value="__root__">Restore to Vault root</option>
          {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
        </select>
        <button type="button" className={button} onClick={() => { const purged = onApplyRetention(); showToast(purged ? `Purged ${purged} expired item(s).` : 'Trash retention is current.'); }}>Apply retention</button>
      </div>

      <div className="max-h-56 overflow-auto rounded-xl border border-white/5" role="region" aria-label="Vault Trash">
        {trash.map((entry) => <div key={entry.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-2 border-b border-white/5 p-2 last:border-0">
          <input type="checkbox" checked={selected.has(entry.id)} onChange={() => toggle(entry.id)} aria-label={`Select ${entry.file.name}`}/>
          <div className="min-w-0"><p className="truncate text-[11px] text-slate-200">{entry.file.name}</p><p className="text-[9px] text-slate-500">Deleted {new Date(entry.deletedAt).toLocaleString()} · original folder {entry.originalFolderId ?? 'root'}</p></div>
          <div className="flex gap-1"><button type="button" className={button} onClick={() => void run('Item restored.', () => onRestoreOne(entry.id))}><RotateCcw className="h-3 w-3"/>Restore</button><button type="button" className={button} aria-label={`Purge ${entry.file.name} permanently`} onClick={() => setPendingPurge(entry)}><Trash2 className="h-3 w-3"/>Purge</button></div>
        </div>)}
        {!trash.length && <p className="p-3 text-[10px] text-slate-500">Trash is empty.</p>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={button} disabled={!selected.size} onClick={() => void run('Selected Trash items restored.', () => { onRestoreBulk([...selected], destinationValue); setSelected(new Set()); })}>Restore selected ({selected.size})</button>
        <button type="button" className={`${button} text-rose-300`} disabled={!trash.length} onClick={() => setConfirmEmptyOpen(true)}><ShieldAlert className="h-3 w-3"/>Empty Trash</button>
      </div>
      <p className="text-[9px] text-slate-600">{purge.reason} Physical overwrite is never claimed for SSD/flash storage.</p>

      <div className="border-t border-white/5 pt-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2"><input value={snapshotLabel} onChange={(event) => setSnapshotLabel(event.target.value)} maxLength={120} placeholder="Recovery snapshot label" className="min-w-[220px] flex-1 rounded border border-white/10 bg-slate-950 px-2 py-1.5 text-[10px] text-slate-300"/><button type="button" className={button} onClick={() => void run('Workspace recovery snapshot created.', async () => { await onCreateSnapshot(snapshotLabel); setSnapshotLabel(''); })}>Create workspace snapshot</button></div>
        <div className="max-h-40 overflow-auto rounded-xl border border-white/5">
          {recoverySnapshots.map((snapshot) => <div key={snapshot.id} className="flex items-center justify-between gap-2 border-b border-white/5 p-2 last:border-0"><div className="min-w-0"><p className="truncate text-[10px] text-slate-200">{snapshot.label || 'Recovery snapshot'}</p><p className="text-[9px] text-slate-500">{new Date(snapshot.createdAt).toLocaleString()} · {snapshot.documents.length} documents · {fmt(snapshot.snapshotBytes)}</p></div><button type="button" className={button} onClick={() => void run('Workspace rollback restored.', async () => { const result = await onRestoreSnapshot(snapshot.id); showToast(`Rollback restored ${result.updated} document(s), recreated ${result.recreated}.`); })}><RotateCcw className="h-3 w-3"/>Rollback</button></div>)}
          {!recoverySnapshots.length && <p className="p-3 text-[10px] text-slate-500">No workspace recovery snapshots yet.</p>}
        </div>
      </div>

      {pendingPurge && <DestructiveConfirmationDialog
        title="Purge this item permanently?"
        description={<>{pendingPurge.file.name} will be removed from the Vault Trash manifest and cannot be restored. This action does not claim physical overwrite of SSD or flash storage.</>}
        confirmLabel="Purge permanently"
        cancelLabel="Cancel"
        onCancel={() => setPendingPurge(null)}
        onConfirm={() => {
          const entry = pendingPurge;
          void run('Item permanently purged from Vault manifest.', async () => {
            await onPurgeOne(entry.id);
            setPendingPurge(null);
          });
        }}
      />}
      {confirmEmptyOpen && <DestructiveConfirmationDialog
        title="Empty Vault Trash?"
        description={<>All {trash.length} item(s) currently in Trash will be permanently removed and cannot be restored. The operation applies to the current Trash contents only.</>}
        confirmLabel="Empty Trash"
        cancelLabel="Cancel"
        requiredText={EMPTY_TRASH_CONFIRMATION}
        requiredTextLabel={`Type ${EMPTY_TRASH_CONFIRMATION} to continue`}
        onCancel={() => setConfirmEmptyOpen(false)}
        onConfirm={() => {
          void run('Trash emptied.', async () => {
            onEmptyTrash(EMPTY_TRASH_CONFIRMATION);
            setSelected(new Set());
            setConfirmEmptyOpen(false);
          });
        }}
      />}
    </section>
  );
};
