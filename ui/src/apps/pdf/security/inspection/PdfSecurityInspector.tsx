// STATUS: DIAMANT VGT SUPREME
import React, { useEffect, useMemo, useState } from 'react';
import { KeyRound, LockKeyhole, ShieldAlert, ShieldCheck } from 'lucide-react';
import { decodePdfDataUrl } from '../pdfNativeDataUrl';
import { inspectPdfEncryptionSecurity, type PdfEncryptionSecuritySnapshot, type PdfPermissionFlags } from './pdfSecurityPolicy';
import { inspectPdfRecipientEncryptionAvailability, type PdfRecipientEncryptionAvailability } from '../encryption/pdfRecipientEncryptionAdapter';

interface PdfSecurityInspectorProps {
  dataUrl: string;
  byteLength: number;
}

const permissionEntries = (permissions: PdfPermissionFlags): Array<[string, boolean]> => [
  ['Print', permissions.print],
  ['Modify', permissions.modify],
  ['Copy', permissions.copy],
  ['Annotate', permissions.annotate],
  ['Fill forms', permissions.fillForms],
  ['Accessibility', permissions.accessibility],
  ['Assemble', permissions.assemble],
  ['High-quality print', permissions.highQualityPrint],
];

export const PdfSecurityInspector: React.FC<PdfSecurityInspectorProps> = ({ dataUrl, byteLength }) => {
  const [security, setSecurity] = useState<PdfEncryptionSecuritySnapshot | null>(null);
  const [recipient, setRecipient] = useState<PdfRecipientEncryptionAvailability | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    try {
      const bytes = decodePdfDataUrl(dataUrl, byteLength);
      const snapshot = inspectPdfEncryptionSecurity(bytes);
      if (!cancelled) setSecurity(snapshot);
    } catch (cause) {
      if (!cancelled) setError(cause instanceof Error ? cause.message : 'PDF security inspection failed');
    }
    void inspectPdfRecipientEncryptionAvailability().then((availability) => {
      if (!cancelled) setRecipient(availability);
    });
    return () => { cancelled = true; };
  }, [dataUrl, byteLength]);

  const strengthClass = useMemo(() => {
    if (!security) return 'text-slate-400';
    if (security.strength === 'modern') return 'text-emerald-300';
    if (security.strength === 'weak') return 'text-red-300';
    if (security.strength === 'legacy') return 'text-amber-300';
    return 'text-slate-300';
  }, [security]);

  if (error) return <div className="mt-3 rounded-lg border border-red-500/20 bg-red-500/[0.05] p-2 text-[0.5625rem] text-red-200">{error}</div>;
  if (!security) return <div className="mt-3 text-[0.5625rem] text-slate-500">Inspecting PDF security dictionary…</div>;

  return (
    <section className="mt-3 rounded-xl border border-cyan-500/20 bg-cyan-500/[0.04] p-2" aria-label="PDF encryption and permission security">
      <div className="flex items-center gap-1.5 text-[0.625rem] font-semibold text-cyan-100"><LockKeyhole className="h-3.5 w-3.5" />Encryption & permissions</div>
      <div className="mt-2 grid grid-cols-2 gap-1 text-[0.5625rem]">
        <div className="rounded border border-white/[0.06] p-1.5"><div className="text-slate-500">Handler</div><div className="font-mono text-slate-300">{security.handler}</div></div>
        <div className="rounded border border-white/[0.06] p-1.5"><div className="text-slate-500">Cipher</div><div className={`font-mono ${strengthClass}`}>{security.cipher}</div></div>
        <div className="rounded border border-white/[0.06] p-1.5"><div className="text-slate-500">Revision</div><div className="font-mono text-slate-300">V{security.version ?? '—'} / R{security.revision ?? '—'}</div></div>
        <div className="rounded border border-white/[0.06] p-1.5"><div className="text-slate-500">Key length</div><div className="font-mono text-slate-300">{security.keyLengthBits ? `${security.keyLengthBits} bit` : 'unknown'}</div></div>
      </div>
      {security.permissions ? (
        <div className="mt-2">
          <div className="text-[0.5625rem] font-semibold text-slate-300">Declared permission flags</div>
          <div className="mt-1 grid grid-cols-2 gap-1">
            {permissionEntries(security.permissions).map(([label, allowed]) => (
              <div key={label} className={`flex items-center gap-1 rounded border px-1.5 py-1 text-[0.5rem] ${allowed ? 'border-emerald-500/15 text-emerald-200' : 'border-white/[0.06] text-slate-500'}`}>
                {allowed ? <ShieldCheck className="h-2.5 w-2.5" /> : <ShieldAlert className="h-2.5 w-2.5" />}{label}: {allowed ? 'allowed' : 'restricted'}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {security.recommendSecureResave ? <div className="mt-2 rounded border border-amber-500/20 bg-amber-500/[0.06] p-1.5 text-[0.5625rem] text-amber-200">Weak/legacy PDF encryption detected. Secure re-save should target AES-256 revision 6 once the dedicated standards encryption adapter is active.</div> : null}
      {security.warnings.map((warning) => <div key={warning} className="mt-1 text-[0.5rem] text-amber-200/80">{warning}</div>)}
      <div className="mt-2 rounded border border-amber-500/15 bg-amber-500/[0.04] p-1.5 text-[0.5rem] leading-relaxed text-amber-100/70">{security.permissionDisclaimer}</div>
      <div className="mt-2 rounded border border-white/[0.06] p-1.5 text-[0.5rem] text-slate-500">
        <div className="flex items-center gap-1 font-semibold text-slate-400"><KeyRound className="h-3 w-3" />Recipient/certificate adapter target</div>
        <div className="mt-1">{recipient?.reason ?? 'Checking native KeyVault provider…'}</div>
        {recipient ? <div className="mt-1 font-mono">{recipient.adapterId} · KeyVault {recipient.keyVaultConnected ? (recipient.keyVaultUnlocked ? 'unlocked' : 'locked') : 'offline'} · hardware-backed {String(recipient.hardwareBacked)}</div> : null}
      </div>
    </section>
  );
};
