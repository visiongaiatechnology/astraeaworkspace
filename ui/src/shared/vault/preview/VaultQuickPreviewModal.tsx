import React from 'react';
import { Archive, ExternalLink, FileWarning, Loader2, ShieldCheck, X } from 'lucide-react';
import type { VaultFile } from '../../contracts/workspace';
import { buildVaultSafePreview, type VaultSafePreview } from './vaultPreviewQuarantineEngine';
import { vaultPreviewParserAdapters } from './vaultPreviewAdapters';

interface VaultQuickPreviewModalProps {
  file: VaultFile | null;
  onClose: () => void;
  onOpenWorkspace?: (file: VaultFile) => void;
  /**
   * Sitzungssperre. Dieser Dialog rendert entschlüsselten Inhalt direkt (`<img src={preview.dataUrl}>`,
   * `<audio src>`, PDF-Text). Er durfte deshalb nicht allein vom `file`-Prop abhängen: solange der
   * Elternteil sperrte, ohne den Dialog zu schließen, blieb das entschlüsselte Bild sichtbar. Mit
   * `locked` gibt der Dialog nichts mehr heraus und lädt auch nichts nach.
   */
  locked?: boolean;
}

export const VaultQuickPreviewModal: React.FC<VaultQuickPreviewModalProps> = ({ file, onClose, onOpenWorkspace, locked = false }) => {
  const [preview, setPreview] = React.useState<VaultSafePreview | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setPreview(null);
    setError(null);
    if (!file || locked) { setLoading(false); return () => { cancelled = true; }; }
    setLoading(true);
    buildVaultSafePreview(file, vaultPreviewParserAdapters)
      .then((next) => { if (!cancelled) setPreview(next); })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'vault_preview_failed'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [file, locked]);

  if (!file) return null;
  if (locked) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Vault preview locked" data-vault-preview-locked="true">
      <div className="w-full max-w-lg rounded-2xl border border-amber-500/30 bg-slate-950 p-6 text-center shadow-2xl">
        <ShieldCheck className="mx-auto h-8 w-8 text-amber-300" aria-hidden="true" />
        <p className="mt-3 text-sm font-semibold text-amber-100">Vault locked — preview withdrawn</p>
        <p className="mt-1 text-[11px] text-amber-200/70">Decrypted preview content is removed while the session is locked.</p>
        <button type="button" onClick={onClose} className="mt-4 rounded-lg border border-white/15 px-3 py-2 text-xs text-slate-200 hover:bg-white/5">Close</button>
      </div>
    </div>
  );
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label={`Preview ${file.name}`}>
      <div className="max-h-[88vh] w-full max-w-4xl overflow-hidden rounded-2xl border border-white/10 bg-slate-950 shadow-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-slate-100">{preview?.title ?? file.name}</h3>
            <p className="text-[10px] text-slate-500">{preview?.mimeType ?? file.mimeType ?? 'application/octet-stream'} · {preview?.securityLabel ?? file.securityLabel ?? 'unknown'}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white" aria-label="Close preview"><X className="h-4 w-4" /></button>
        </header>
        <div className="max-h-[75vh] space-y-4 overflow-auto p-4">
          {loading && <div className="flex items-center justify-center gap-2 py-16 text-xs text-slate-400"><Loader2 className="h-4 w-4 animate-spin"/>Inspecting file with local sandbox parser…</div>}
          {error && <div className="flex items-start gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-xs text-rose-200"><FileWarning className="mt-0.5 h-4 w-4 shrink-0"/><span>Preview parser rejected this file: {error}</span></div>}
          {preview?.kind === 'image' && <img src={preview.dataUrl} alt={file.name} className="mx-auto max-h-[68vh] max-w-full rounded-xl object-contain" />}
          {preview?.kind === 'audio' && <div className="mx-auto max-w-2xl rounded-xl border border-white/10 bg-black/30 p-5"><audio controls preload="metadata" src={preview.dataUrl} className="w-full" aria-label={`Audio preview ${file.name}`}><track kind="captions" /></audio><p className="mt-3 text-[10px] text-slate-500">Encrypted Vault payload streamed in memory; no plaintext preview file is written.</p></div>}
          {preview?.kind === 'pdf' && <div className="space-y-3">
            <div className="flex flex-wrap gap-2 text-[10px] text-slate-400"><span className="rounded border border-white/10 px-2 py-1">{preview.pageCount} page{preview.pageCount===1?'':'s'}</span><span className="rounded border border-white/10 px-2 py-1">{preview.externalLinkCount} external link{preview.externalLinkCount===1?'':'s'} detected, none fetched</span></div>
            <pre className="max-h-[55vh] overflow-auto whitespace-pre-wrap break-words rounded-xl border border-white/10 bg-black/30 p-4 text-xs leading-5 text-slate-300">{preview.text || 'No extractable text on page 1.'}</pre>
          </div>}
          {preview?.kind === 'text' && <pre className="whitespace-pre-wrap break-words rounded-xl border border-white/10 bg-black/30 p-4 text-xs leading-5 text-slate-300">{preview.text}</pre>}
          {preview?.kind === 'archive' && <div className="space-y-2"><div className="flex items-center gap-2 text-xs text-slate-300"><Archive className="h-4 w-4 text-violet-300"/>{preview.entries.length} bounded archive entr{preview.entries.length===1?'y':'ies'}; nothing executed.</div><div className="max-h-[55vh] overflow-auto rounded-xl border border-white/10 bg-black/30">{preview.entries.map((entry)=><div key={entry.name} className="flex items-center justify-between gap-3 border-b border-white/5 px-3 py-2 text-[11px] last:border-b-0"><span className="min-w-0 truncate text-slate-300">{entry.name}</span><span className="shrink-0 text-slate-500">{entry.sizeBytes.toLocaleString()} B</span></div>)}</div></div>}
          {preview?.kind === 'workspace' && <div className="flex flex-col items-center gap-3 py-14 text-center"><ExternalLink className="h-8 w-8 text-blue-400"/><p className="text-sm text-slate-300">Native Workspace document. Open it directly without creating a plaintext preview copy.</p><button type="button" onClick={() => onOpenWorkspace?.(file)} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-500">Open Workspace document</button></div>}
          {preview?.kind === 'blocked' && <div className="flex flex-col items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-5 py-10 text-center"><ShieldCheck className="h-8 w-8 text-amber-300"/><p className="max-w-xl text-sm text-amber-100">Automatic preview is blocked for this file.</p></div>}
          {preview?.warning && <div className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-xs text-amber-200"><FileWarning className="mt-0.5 h-4 w-4 shrink-0"/><span>{preview.warning}</span></div>}
        </div>
      </div>
    </div>
  );
};
