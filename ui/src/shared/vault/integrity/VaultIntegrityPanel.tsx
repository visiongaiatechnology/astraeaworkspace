import React, { useState } from 'react';
import { Download, FileWarning, RefreshCw, ShieldCheck, Upload } from 'lucide-react';
import type { VaultFile, VaultIntegrityAuditReport } from '../../contracts/workspace';
import { deliverExportText, type ExportDeliveryResult } from '../../interchange/exportDelivery';

interface VaultIntegrityPanelProps {
  files: VaultFile[];
  audits: VaultIntegrityAuditReport[];
  onVerifyVault: () => Promise<VaultIntegrityAuditReport>;
  onRepairFromBackup: (fileId: string, file: File) => Promise<VaultFile>;
  showToast: (message: string) => void;
}

function downloadAudit(report: VaultIntegrityAuditReport): Promise<ExportDeliveryResult> {
  return deliverExportText(JSON.stringify(report, null, 2), {
    suggestedName: `Astraea_Vault_Integrity_${report.createdAt}.json`,
    extensions: ['json'],
    mimeType: 'application/json',
  });
}

export const VaultIntegrityPanel: React.FC<VaultIntegrityPanelProps> = ({ files, audits, onVerifyVault, onRepairFromBackup, showToast }) => {
  const [busy, setBusy] = useState(false);
  const latest = audits[0];
  const corrupt = files.filter((file) => file.integrityState === 'mismatch' || file.status === 'corrupt');

  const verifyAll = async () => {
    try {
      setBusy(true);
      const report = await onVerifyVault();
      showToast(`Vault integrity: ${report.verified} verified, ${report.mismatch} mismatch, ${report.unavailable} unavailable.`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Vault integrity scan failed.');
    } finally {
      setBusy(false);
    }
  };

  const repair = async (fileId: string, source: File) => {
    try {
      setBusy(true);
      await onRepairFromBackup(fileId, source);
      showToast('Known-good backup matched the stored digest and repaired the attachment.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Repair source rejected.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-cyan-500/15 bg-[#071017]/70 p-4 space-y-3" aria-label="Vault integrity">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xs font-semibold text-slate-100 flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-cyan-300"/>Integrity</h2>
          <p className="text-[10px] text-slate-400 mt-1">SHA-256 content digests + 64 KiB chunk manifests/Merkle roots. No timer can mark content verified.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" disabled={busy} onClick={() => void verifyAll()} data-vgt-app-guide-anchor="Vault:second" className="px-3 py-2 rounded-lg border border-cyan-500/30 text-cyan-200 text-xs disabled:opacity-40"><RefreshCw className={`inline w-3.5 h-3.5 mr-1 ${busy ? 'animate-spin' : ''}`}/>Verify entire Vault</button>
          {latest && <button type="button" onClick={() => { void downloadAudit(latest).then((delivery) => showToast(delivery.mode === 'file' ? `${delivery.fileName} saved.` : `Download started: ${delivery.fileName} (browser mode – no write confirmation).`)).catch((error: unknown) => showToast(`Audit export failed: ${error instanceof Error ? error.message : String(error)}`)); }} className="px-3 py-2 rounded-lg border border-slate-700 text-slate-300 text-xs"><Download className="inline w-3.5 h-3.5 mr-1"/>Audit report</button>}
        </div>
      </div>

      {latest && <div className="grid grid-cols-4 gap-2 text-center text-[10px]">
        <div className="rounded-lg bg-black/20 p-2"><div className="text-slate-500">Files</div><div className="text-slate-200 font-mono">{latest.totalFiles}</div></div>
        <div className="rounded-lg bg-black/20 p-2"><div className="text-slate-500">Verified</div><div className="text-emerald-300 font-mono">{latest.verified}</div></div>
        <div className="rounded-lg bg-black/20 p-2"><div className="text-slate-500">Mismatch</div><div className="text-rose-300 font-mono">{latest.mismatch}</div></div>
        <div className="rounded-lg bg-black/20 p-2"><div className="text-slate-500">Unavailable</div><div className="text-amber-300 font-mono">{latest.unavailable}</div></div>
      </div>}

      {corrupt.length > 0 && <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3 space-y-2">
        <div className="text-[10px] text-rose-200 flex items-center gap-1"><FileWarning className="w-3.5 h-3.5"/>Corrupt/mismatched attachments can only be repaired from bytes that match the stored known-good digest.</div>
        {corrupt.slice(0, 16).map((file) => <div key={file.id} className="flex items-center justify-between gap-3 text-[10px]">
          <span className="truncate text-slate-300">{file.name}</span>
          {file.sourceType === 'attachment' ? <label className="cursor-pointer px-2 py-1 rounded border border-rose-500/30 text-rose-200"><Upload className="inline w-3 h-3 mr-1"/>Known-good backup<input type="file" className="hidden" onChange={(event) => { const source = event.target.files?.[0]; if (source) void repair(file.id, source); event.currentTarget.value = ''; }}/></label> : <span className="text-slate-500">Repair through source/version history</span>}
        </div>)}
      </div>}
    </section>
  );
};
