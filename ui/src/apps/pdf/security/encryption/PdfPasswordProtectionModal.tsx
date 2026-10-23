// STATUS: DIAMANT VGT SUPREME
// Astraea PDF Studio — AES-256 Revision-6 user/owner password protection for structured exports.

import React, { useEffect, useState } from 'react';
import { KeyRound, LockKeyhole, ShieldCheck, X } from 'lucide-react';
import type { PdfDocumentModel } from '../../../../shared/contracts/workspace';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import { pdfWorkflowText } from '../../locale/pdfWorkflowDialogsLocale';
import { buildStructuredPdfBytes } from '../../interchange/structuredPdfExport';
import { protectStructuredPdfWithPassword } from './pdfStandardPasswordEncryption';
import { canUsePdfKeyVaultSecrets, sealPdfCredentialInKeyVault } from '../credentials/pdfKeyVaultSecrets';
import { deliverExportBytes } from '../../../../shared/interchange/exportDelivery';
import { assertPdfExportArtifact } from '../../../../platform/rendering/documentPdfExport';
import { pdfExportDeliveryText, pdfExportFailureText } from '../../interchange/pdfExportStatus';

interface PdfPasswordProtectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentTitle: string;
  pdfData: PdfDocumentModel;
}

// DEF-RE-022 (Runde 357): `permissions` stand als `-4` fest verdrahtet im Aufruf, und der Dialog hatte
// keinen Zustandshaken dafuer — die Aenderungsrechte waren nicht waehlbar, obwohl AST-0867
// "Passwortschutz und Berechtigungen" verlangt.
//
// Die Bit-Semantik stammt aus dem eigenen Test dieser Funktion
// (`pdfStandardPasswordEncryption.test.ts:76-78`):
//   "The PDF permission bits are 1-based in the specification, so bit 3 is print, bit 4 modify and
//    bit 5 copy — i.e. 0-based 2, 3 and 4 in the mask."
// `-4` laesst alle Rechte zu; ein verweigertes Recht loescht sein Bit.
// Gegenprobe: `permissionMask({ print: true, modify: false, copy: false, annotate: true })` ergibt `-28`
// — genau den Wert, den der Test als `printOnly = -4 & ~(0b1000 | 0b10000)` bildet.
const PDF_PERMISSION_BITS = {
  print: 0b100,
  modify: 0b1000,
  copy: 0b10000,
  annotate: 0b100000,
} as const;

type PdfPermissionName = keyof typeof PDF_PERMISSION_BITS;

const permissionMask = (allowed: Record<PdfPermissionName, boolean>): number =>
  (Object.keys(PDF_PERMISSION_BITS) as PdfPermissionName[])
    .reduce((mask, right) => (allowed[right] ? mask : mask & ~PDF_PERMISSION_BITS[right]), -4);

/** Release Beta 0.1: native save on the desktop, browser download fallback; result is confirmed. */
const deliverProtectedPdf = (bytes: Uint8Array, title: string) => {
  const safe = (title || 'document').replace(/\.pdf$/iu, '').replace(/[^a-z0-9._-]+/giu, '_').slice(0, 120) || 'document';
  return deliverExportBytes(bytes, {
    suggestedName: `${safe}_protected.pdf`,
    extensions: ['pdf'],
    mimeType: 'application/pdf',
    assertArtifact: assertPdfExportArtifact,
  });
};

export const PdfPasswordProtectionModal: React.FC<PdfPasswordProtectionModalProps> = ({ isOpen, onClose, documentTitle, pdfData }) => {
  const { locale } = useWorkspaceLocale();
  const [userPassword, setUserPassword] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [confirmOwner, setConfirmOwner] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [storeOwnerInKeyVault, setStoreOwnerInKeyVault] = useState(false);
  const [keyVaultReady, setKeyVaultReady] = useState(false);
  const [keyVaultChecked, setKeyVaultChecked] = useState(false);
  // DEF-RE-022: die vier Aenderungsrechte. Vorgabe: drucken und kommentieren erlaubt, aendern und
  // kopieren verweigert — das ist die konservative Lesart fuer ein Dokument, das geschuetzt wird.
  const [allowPrint, setAllowPrint] = useState(true);
  const [allowModify, setAllowModify] = useState(false);
  const [allowCopy, setAllowCopy] = useState(false);
  const [allowAnnotate, setAllowAnnotate] = useState(true);
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    void canUsePdfKeyVaultSecrets().then((status) => {
      if (!cancelled) { setKeyVaultReady(status.ready); setKeyVaultChecked(true); }
    }).catch(() => {
      if (!cancelled) { setKeyVaultReady(false); setKeyVaultChecked(true); }
    });
    return () => { cancelled = true; };
  }, [isOpen]);

  if (!isOpen) return null;

  const protect = async () => {
    setError(null);
    setMessage(null);
    if (ownerPassword !== confirmOwner) { setError(pdfWorkflowText(locale, 'password.error.ownerMismatch')); return; }
    if (userPassword === ownerPassword) { setError(pdfWorkflowText(locale, 'password.error.distinct')); return; }
    setBusy(true);
    let pdfExported = false;
    try {
      const source = buildStructuredPdfBytes(documentTitle, pdfData, { taggedStructure: true, includeSrgbOutputIntent: true, deduplicateResources: true });
      const result = await protectStructuredPdfWithPassword(source, { userPassword, ownerPassword, permissions: permissionMask({ print: allowPrint, modify: allowModify, copy: allowCopy, annotate: allowAnnotate }), encryptMetadata: true });
      const delivery = await deliverProtectedPdf(result.bytes, documentTitle);
      const filename = delivery.fileName;
      pdfExported = true;
      if (storeOwnerInKeyVault) {
        if (!keyVaultReady) throw new Error('Native KeyVault is not ready.');
        await sealPdfCredentialInKeyVault(`${filename} owner password`, ownerPassword);
      }
      setMessage(`${pdfWorkflowText(locale, storeOwnerInKeyVault ? 'password.success.vault' : 'password.success.export', { filename })} ${pdfExportDeliveryText(locale, delivery)}`);
      setUserPassword(''); setOwnerPassword(''); setConfirmOwner('');
    } catch (error) {
      setError(pdfExported
        ? pdfWorkflowText(locale, 'password.error.vaultAfterExport')
        : pdfExportFailureText(locale, error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={pdfWorkflowText(locale, 'password.title')}>
      <div className="w-full max-w-lg rounded-2xl border border-cyan-500/20 bg-[#0b1019] p-4 shadow-2xl">
        <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2 text-sm font-semibold text-cyan-100"><LockKeyhole className="h-4 w-4" />{pdfWorkflowText(locale, 'password.title')}</div><button aria-label={pdfWorkflowText(locale, 'password.close')} type="button" onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button></div>
        <div className="mt-2 rounded-lg border border-emerald-500/15 bg-emerald-500/[0.05] p-2 text-[0.625rem] leading-relaxed text-emerald-100/80"><ShieldCheck className="mr-1 inline h-3 w-3" />{pdfWorkflowText(locale, 'password.intro')}</div>
        <div className="mt-3 grid gap-2">
          <label className="text-[0.625rem] text-slate-400">{pdfWorkflowText(locale, 'password.user')}<input aria-label={pdfWorkflowText(locale, 'password.user')} type="password" autoComplete="new-password" value={userPassword} maxLength={127} onChange={(event) => setUserPassword(event.target.value)} className="mt-1 w-full rounded border border-white/10 bg-black/30 px-2.5 py-2 text-xs text-slate-100 outline-none focus:border-cyan-400/40" /></label>
          <label className="text-[0.625rem] text-slate-400">{pdfWorkflowText(locale, 'password.owner')}<input aria-label={pdfWorkflowText(locale, 'password.owner')} type="password" autoComplete="new-password" value={ownerPassword} maxLength={127} onChange={(event) => setOwnerPassword(event.target.value)} className="mt-1 w-full rounded border border-white/10 bg-black/30 px-2.5 py-2 text-xs text-slate-100 outline-none focus:border-cyan-400/40" /></label>
          <label className="text-[0.625rem] text-slate-400">{pdfWorkflowText(locale, 'password.confirmOwner')}<input aria-label={pdfWorkflowText(locale, 'password.confirmOwner')} type="password" autoComplete="new-password" value={confirmOwner} maxLength={127} onChange={(event) => setConfirmOwner(event.target.value)} className="mt-1 w-full rounded border border-white/10 bg-black/30 px-2.5 py-2 text-xs text-slate-100 outline-none focus:border-cyan-400/40" /></label>
        </div>
        <label className="mt-3 flex items-start gap-2 rounded-lg border border-white/10 bg-white/[0.025] p-2 text-[0.625rem] text-slate-300"><input aria-label={pdfWorkflowText(locale, 'password.keyVault')} type="checkbox" checked={storeOwnerInKeyVault} disabled={!keyVaultReady} onChange={(event) => setStoreOwnerInKeyVault(event.target.checked)} className="mt-0.5" /><span><b>{pdfWorkflowText(locale, 'password.keyVault')}</b><br /><span className="text-[0.5625rem] text-slate-500">{pdfWorkflowText(locale, keyVaultChecked ? keyVaultReady ? 'password.vault.ready' : 'password.vault.unavailable' : 'password.vault.checking')}</span></span></label>

        {/* DEF-RE-022: die vier Aenderungsrechte. Ohne diese vier Kaestchen konnte der Nutzer nur
            "alles erlaubt" exportieren, weil `permissions: -4` fest verdrahtet war. */}
        <fieldset className="mt-3 rounded-lg border border-white/10 bg-white/[0.02] p-2">
          <legend className="px-1 text-[0.625rem] font-semibold text-slate-300">{pdfWorkflowText(locale, 'password.permissions')}</legend>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[0.625rem] text-slate-300">
            <label className="flex items-center gap-2"><input aria-label={pdfWorkflowText(locale, 'password.permission.print')} type="checkbox" checked={allowPrint} onChange={(event) => setAllowPrint(event.target.checked)} />{pdfWorkflowText(locale, 'password.permission.print')}</label>
            <label className="flex items-center gap-2"><input aria-label={pdfWorkflowText(locale, 'password.permission.modify')} type="checkbox" checked={allowModify} onChange={(event) => setAllowModify(event.target.checked)} />{pdfWorkflowText(locale, 'password.permission.modify')}</label>
            <label className="flex items-center gap-2"><input aria-label={pdfWorkflowText(locale, 'password.permission.copy')} type="checkbox" checked={allowCopy} onChange={(event) => setAllowCopy(event.target.checked)} />{pdfWorkflowText(locale, 'password.permission.copy')}</label>
            <label className="flex items-center gap-2"><input aria-label={pdfWorkflowText(locale, 'password.permission.annotate')} type="checkbox" checked={allowAnnotate} onChange={(event) => setAllowAnnotate(event.target.checked)} />{pdfWorkflowText(locale, 'password.permission.annotate')}</label>
          </div>
        </fieldset>

        <div className="mt-2 text-[0.5625rem] leading-relaxed text-amber-200/70">{pdfWorkflowText(locale, 'password.policy')}</div>
        {error ? <div role="alert" aria-live="assertive" className="mt-2 rounded border border-rose-500/20 bg-rose-500/[0.05] p-2 text-[0.625rem] text-rose-200">{error}</div> : null}
        {message ? <div role="status" aria-live="polite" className="mt-2 rounded border border-emerald-500/20 bg-emerald-500/[0.05] p-2 text-[0.625rem] text-emerald-200">{message}</div> : null}
        <button type="button" onClick={() => void protect()} disabled={busy || !userPassword || !ownerPassword || !confirmOwner} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-cyan-400/25 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/15 disabled:opacity-30"><KeyRound className="h-3.5 w-3.5" />{busy ? pdfWorkflowText(locale, 'password.encrypting') : pdfWorkflowText(locale, 'password.export')}</button>
      </div>
    </div>
  );
};
