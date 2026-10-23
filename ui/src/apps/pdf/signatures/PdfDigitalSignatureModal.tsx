import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileKey2, Lock, ShieldCheck, X } from 'lucide-react';
import {
  type PadesProfile,
  type PdfSigningProvider,
  type SignedPdfResult,
  inspectXfaCompatibility,
  signPdfDocument,
  type XfaInspectionReport,
} from './pdfDigitalSignature';
import { createWebCryptoCmsSigningProvider } from './providers/pdfWebCryptoSigningProvider';
import { createNativePdfSigningProvider, listNativePdfSigningIdentities, type NativePdfSigningIdentity } from './providers/pdfNativeSigningProvider';
import type { PdfTrustedTimestampProvider } from './timestamps/pdfRfc3161Timestamp';
import { validatePdfSignatures, type PdfSignatureValidationResult } from './validation/pdfSignatureValidation';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { pdfWorkflowText, type PdfWorkflowCopyKey } from '../locale/pdfWorkflowDialogsLocale';
import { deliverExportBytes } from '../../../shared/interchange/exportDelivery';
import { assertPdfExportArtifact } from '../../../platform/rendering/documentPdfExport';
import { pdfExportDeliveryText, pdfExportFailureText } from '../interchange/pdfExportStatus';

interface PdfDigitalSignatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentTitle: string;
  currentPage: number;
  getPdfBytes: () => Uint8Array;
  onSignedSuccess?: (result: SignedPdfResult) => void;
  trustedTimestampProvider?: PdfTrustedTimestampProvider;
}

const MAX_IDENTITY_FILE_BYTES = 1024 * 1024;

async function readIdentityFile(file: File): Promise<Uint8Array> {
  if (file.size <= 0 || file.size > MAX_IDENTITY_FILE_BYTES) throw new Error('Certificate/key file must be between 1 byte and 1 MiB');
  return new Uint8Array(await file.arrayBuffer());
}

/** Release Beta 0.1: the signed bytes are written natively on the desktop, downloaded in the browser. */
function deliverSignedPdf(title: string, bytes: Uint8Array) {
  const safeTitle = (title || 'document').replace(/\.pdf$/iu, '').replace(/[^a-z0-9._-]+/giu, '_');
  return deliverExportBytes(bytes, {
    suggestedName: `${safeTitle}_signed.pdf`,
    extensions: ['pdf'],
    mimeType: 'application/pdf',
    assertArtifact: assertPdfExportArtifact,
  });
}

export const PdfDigitalSignatureModal: React.FC<PdfDigitalSignatureModalProps> = ({
  isOpen,
  onClose,
  documentTitle,
  currentPage,
  getPdfBytes,
  onSignedSuccess,
  trustedTimestampProvider,
}) => {
  const { locale } = useWorkspaceLocale();
  const validationCopyKeys = {
    'valid-current': 'digital.validation.valid-current',
    'valid-earlier-revision': 'digital.validation.valid-earlier-revision',
    invalid: 'digital.validation.invalid',
    unsupported: 'digital.validation.unsupported',
  } as const satisfies Record<PdfSignatureValidationResult['status'], PdfWorkflowCopyKey>;
  const [padesProfile, setPadesProfile] = useState<PadesProfile>('B-B');
  const [signerName, setSignerName] = useState('');
  const [reasonOverride, setReasonOverride] = useState<string | null>(null);
  const reason = reasonOverride ?? pdfWorkflowText(locale, 'digital.defaultReason');
  const [location, setLocation] = useState('');
  const [certificateFile, setCertificateFile] = useState<File | null>(null);
  const [privateKeyFile, setPrivateKeyFile] = useState<File | null>(null);
  const [provider, setProvider] = useState<PdfSigningProvider | null>(null);
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [signingError, setSigningError] = useState<string | null>(null);
  const [isLoadingIdentity, setIsLoadingIdentity] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [signResult, setSignResult] = useState<SignedPdfResult | null>(null);
  const [postSignValidation, setPostSignValidation] = useState<PdfSignatureValidationResult | null>(null);
  /** Release Beta 0.1: states whether the signed PDF was written or only downloaded. */
  const [deliveryNotice, setDeliveryNotice] = useState<string | null>(null);
  const [xfaReport, setXfaReport] = useState<XfaInspectionReport | null>(null);
  const [nativeIdentities, setNativeIdentities] = useState<NativePdfSigningIdentity[]>([]);
  const [nativeIdentityId, setNativeIdentityId] = useState('');
  const [nativeStatus, setNativeStatus] = useState(pdfWorkflowText(locale, 'digital.nativeChecking'));
  const [isLoadingNative, setIsLoadingNative] = useState(false);

  useEffect(() => {
    if (!isOpen) return undefined;
    let cancelled = false;
    void listNativePdfSigningIdentities().then((status) => {
      if (cancelled) return;
      setNativeIdentities(status.identities);
      setNativeIdentityId((current) => current && status.identities.some((identity) => identity.id === current) ? current : status.identities[0]?.id ?? '');
      setNativeStatus(status.available && status.identities.length > 0
        ? pdfWorkflowText(locale, 'digital.nativeReady')
        : pdfWorkflowText(locale, 'digital.nativeUnavailable'));
    }).catch(() => { if (!cancelled) { setNativeIdentities([]); setNativeIdentityId(''); setNativeStatus(pdfWorkflowText(locale, 'digital.nativeUnavailable')); } });
    return () => { cancelled = true; };
  }, [isOpen, locale]);

  if (!isOpen) return null;

  const handleLoadIdentity = async () => {
    setIdentityError(null);
    setProvider(null);
    setSignResult(null);
    setPostSignValidation(null);
    if (!certificateFile || !privateKeyFile) {
      setIdentityError(pdfWorkflowText(locale, 'digital.error.selectIdentity'));
      return;
    }
    setIsLoadingIdentity(true);
    try {
      const [certificateBytes, privateKeyBytes] = await Promise.all([
        readIdentityFile(certificateFile),
        readIdentityFile(privateKeyFile),
      ]);
      const loaded = await createWebCryptoCmsSigningProvider(certificateBytes, privateKeyBytes, trustedTimestampProvider);
      setProvider(loaded);
      if (padesProfile === 'B-T' && !loaded.supportsTrustedTimestamp) setPadesProfile('B-B');
    } catch (error) {
      setIdentityError(error instanceof Error && error.message.startsWith('Certificate/key file must')
        ? pdfWorkflowText(locale, 'digital.error.file')
        : pdfWorkflowText(locale, 'digital.error.loadIdentity'));
    } finally {
      setIsLoadingIdentity(false);
    }
  };

  const handleLoadNativeIdentity = async () => {
    setIdentityError(null);
    setProvider(null);
    setSignResult(null);
    setPostSignValidation(null);
    const identity = nativeIdentities.find((candidate) => candidate.id === nativeIdentityId);
    if (!identity) { setIdentityError(pdfWorkflowText(locale, 'digital.error.selectNative')); return; }
    setIsLoadingNative(true);
    try {
      const loaded = await createNativePdfSigningProvider(identity, trustedTimestampProvider);
      setProvider(loaded);
      if (padesProfile === 'B-T' && !loaded.supportsTrustedTimestamp) setPadesProfile('B-B');
    } catch {
      setIdentityError(pdfWorkflowText(locale, 'digital.error.loadIdentity'));
    } finally {
      setIsLoadingNative(false);
    }
  };

  const handleExecuteSign = async () => {
    setSigningError(null);
    setSignResult(null);
    setPostSignValidation(null);
    if (!provider) {
      setSigningError(pdfWorkflowText(locale, 'digital.error.signIdentity'));
      return;
    }
    setIsSigning(true);
    try {
      const pdfBytes = getPdfBytes();
      const xfa = inspectXfaCompatibility(pdfBytes);
      setXfaReport(xfa);
      const result = await signPdfDocument(pdfBytes, {
        signerName,
        reason,
        location,
        signDate: Date.now(),
        padesProfile,
        pageNumber: currentPage,
        bbox: { x: 0, y: 0, width: 0, height: 0 },
      }, provider);
      const validations = await validatePdfSignatures(result.signedBytes);
      const verified = validations.at(-1);
      if (!verified || !verified.valid || verified.status !== 'valid-current') {
        throw new Error('Post-sign validation rejected the final PDF bytes');
      }
      if (verified.signer.fingerprintSha256.toUpperCase() !== provider.certificate.fingerprintSha256.toUpperCase()) {
        throw new Error('Post-sign validation signer fingerprint does not match the loaded identity');
      }
      setPostSignValidation(verified);
      setSignResult(result);
      const delivery = await deliverSignedPdf(documentTitle, result.signedBytes);
      setDeliveryNotice(pdfExportDeliveryText(locale, delivery));
      onSignedSuccess?.(result);
    } catch (error) {
      setDeliveryNotice(null);
      setSigningError(`${pdfWorkflowText(locale, 'digital.error.sign')} ${pdfExportFailureText(locale, error)}`);
    } finally {
      setIsSigning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="pdf-digital-signature-title">
      <div className="vgt-dialog-scroll-surface glass-dropdown max-h-[92vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-2xl border border-emerald-500/30 p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 text-emerald-400">
            <ShieldCheck className="h-5 w-5" />
            <h3 id="pdf-digital-signature-title" className="text-sm font-bold text-slate-100">{pdfWorkflowText(locale, 'digital.title')}</h3>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white" aria-label={pdfWorkflowText(locale, 'digital.close')}><X className="h-4 w-4" /></button>
        </div>

        <p className="text-xs text-slate-300">
          {pdfWorkflowText(locale, 'digital.intro.before')}<strong className="text-white">{documentTitle}</strong>{pdfWorkflowText(locale, 'digital.intro.after')}
        </p>

        <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3 text-xs">
          <div className="mb-2 flex items-center gap-2 font-bold text-slate-200"><FileKey2 className="h-4 w-4 text-emerald-400" />{pdfWorkflowText(locale, 'digital.identityHeading')}</div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-[0.6875rem] text-slate-400">
              <span className="block font-semibold">{pdfWorkflowText(locale, 'digital.certificate')}</span>
              <input type="file" accept=".pem,.cer,.crt,.der,application/pkix-cert" onChange={(event) => { setCertificateFile(event.target.files?.[0] ?? null); setProvider(null); }} className="block w-full text-[0.6875rem] text-slate-300" />
            </label>
            <label className="space-y-1 text-[0.6875rem] text-slate-400">
              <span className="block font-semibold">{pdfWorkflowText(locale, 'digital.privateKey')}</span>
              <input type="file" accept=".pem,.key,.der,application/pkcs8" onChange={(event) => { setPrivateKeyFile(event.target.files?.[0] ?? null); setProvider(null); }} className="block w-full text-[0.6875rem] text-slate-300" />
            </label>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-[0.625rem] text-slate-500">{pdfWorkflowText(locale, 'digital.keyInfo')}</span>
            <button type="button" onClick={handleLoadIdentity} disabled={isLoadingIdentity || !certificateFile || !privateKeyFile} className="shrink-0 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[0.6875rem] font-semibold text-emerald-300 disabled:opacity-40">
              {pdfWorkflowText(locale, isLoadingIdentity ? 'digital.verifying' : 'digital.verify')}
            </button>
          </div>
          {provider && (
            <div className="mt-3 rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-2 text-[0.625rem] text-slate-300">
              <div className="font-semibold text-emerald-300">{pdfWorkflowText(locale, 'digital.verified')}: {provider.label}</div>
              <div>{pdfWorkflowText(locale, 'digital.algorithm')}: {provider.certificate.algorithm}</div>
              <div className="break-all font-mono text-slate-500">{pdfWorkflowText(locale, 'digital.fingerprint')}: {provider.certificate.fingerprintSha256}</div>
              <div>{pdfWorkflowText(locale, 'digital.timestamp')}: <span className={provider.supportsTrustedTimestamp ? 'text-emerald-300' : 'text-slate-500'}>{provider.supportsTrustedTimestamp ? trustedTimestampProvider?.label ?? pdfWorkflowText(locale, 'digital.configured') : pdfWorkflowText(locale, 'digital.notConfigured')}</span></div>
            </div>
          )}
          <div className="mt-3 border-t border-white/10 pt-3">
            <div className="mb-2 text-[0.625rem] font-bold text-cyan-300">{pdfWorkflowText(locale, 'digital.nativeHeading')}</div>
            <div className="flex gap-2">
              <select value={nativeIdentityId} onChange={(event) => { setNativeIdentityId(event.target.value); setProvider(null); }} disabled={!nativeIdentities.length} className="min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-950 px-2 py-1.5 text-[0.625rem] text-slate-300 disabled:opacity-40">
                {nativeIdentities.length ? nativeIdentities.map((identity) => <option key={identity.id} value={identity.id}>{identity.label} · {pdfWorkflowText(locale, identity.source === 'windows-cert-store' ? 'digital.source.windows' : 'digital.source.pkcs11')}{identity.hardwareBacked ? ` · ${pdfWorkflowText(locale, 'digital.hardware')}` : ''}</option>) : <option value="">{pdfWorkflowText(locale, 'digital.noNativeIdentity')}</option>}
              </select>
              <button type="button" onClick={() => void handleLoadNativeIdentity()} disabled={isLoadingNative || !nativeIdentityId} className="shrink-0 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-[0.625rem] font-semibold text-cyan-300 disabled:opacity-40">{pdfWorkflowText(locale, isLoadingNative ? 'digital.opening' : 'digital.useNative')}</button>
            </div>
            <div className="mt-1.5 text-[0.5625rem] text-slate-500">{nativeStatus} {pdfWorkflowText(locale, 'digital.nativeBoundary')}</div>
          </div>
          {identityError && <div className="mt-2 rounded-lg border border-red-500/25 bg-red-500/10 p-2 text-[0.6875rem] text-red-300">{identityError}</div>}
        </div>

        <div className="grid grid-cols-1 gap-3 text-xs md:grid-cols-2">
          <div>
            <label className="mb-1 block font-bold text-slate-400">{pdfWorkflowText(locale, 'digital.profile')}</label>
            <select value={padesProfile} onChange={(event) => setPadesProfile(event.target.value as PadesProfile)} className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-slate-200 outline-none focus:border-emerald-500">
              <option value="B-B">PAdES-B-B · {pdfWorkflowText(locale, 'digital.profileBB')}</option>
              <option value="B-T" disabled={!provider?.supportsTrustedTimestamp}>PAdES-B-T · {pdfWorkflowText(locale, 'digital.profileBT')}</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block font-bold text-slate-400">{pdfWorkflowText(locale, 'digital.signer')}</label>
            <input type="text" maxLength={160} value={signerName} onChange={(event) => setSignerName(event.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-slate-200 outline-none focus:border-emerald-500" />
          </div>
          <div>
            <label className="mb-1 block font-bold text-slate-400">{pdfWorkflowText(locale, 'digital.reason')}</label>
            <input type="text" maxLength={512} value={reason} onChange={(event) => setReasonOverride(event.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-slate-200 outline-none focus:border-emerald-500" />
          </div>
          <div>
            <label className="mb-1 block font-bold text-slate-400">{pdfWorkflowText(locale, 'digital.location')}</label>
            <input type="text" maxLength={256} value={location} onChange={(event) => setLocation(event.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-slate-200 outline-none focus:border-emerald-500" />
          </div>
        </div>

        {signResult && (
          <div className="space-y-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 font-mono text-xs">
            <div className="flex items-center space-x-2 font-sans font-bold text-emerald-400"><CheckCircle2 className="h-4 w-4" /><span>{pdfWorkflowText(locale, 'digital.success')}</span></div>
            <div className="space-y-1 text-[0.6875rem] text-slate-300">
              <div>{pdfWorkflowText(locale, 'digital.byteRange')}: <span className="text-emerald-300">[{signResult.byteRange.join(', ')}]</span></div>
              <div>{pdfWorkflowText(locale, 'digital.fingerprint')}: <span className="text-slate-400">{signResult.contentDigestHex}</span></div>
              <div>{pdfWorkflowText(locale, 'digital.provider')}: <span className="text-emerald-300">{signResult.providerLabel}</span></div>
              <div>{pdfWorkflowText(locale, 'digital.postValidation')}: <span className="text-emerald-300">{postSignValidation ? pdfWorkflowText(locale, validationCopyKeys[postSignValidation.status]) : pdfWorkflowText(locale, 'digital.validation.pending')}</span></div>
              <div>{pdfWorkflowText(locale, 'digital.certificateChain', { count: postSignValidation?.certificateChain.length ?? 0 })}</div>
              <div>{pdfWorkflowText(locale, 'digital.timestamp')}: <span className="text-slate-400">{signResult.timestampAttested ? pdfWorkflowText(locale, 'digital.timestampVerified') : pdfWorkflowText(locale, 'digital.timestampNotRequested')}</span></div>
            </div>
            {deliveryNotice && <div role="status" data-pdf-signature-delivery="true" className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 font-sans text-[0.6875rem] text-emerald-200">{deliveryNotice}</div>}
          </div>
        )}

        {xfaReport?.corruptionWarning && <div className="flex items-start space-x-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-300"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{pdfWorkflowText(locale, 'digital.error.warning')}</span></div>}
        {signingError && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-300">{signingError}</div>}

        <div className="flex justify-end space-x-2 border-t border-white/10 pt-2">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-xs text-slate-400 hover:text-white">{pdfWorkflowText(locale, 'common.close')}</button>
          <button type="button" onClick={handleExecuteSign} disabled={isSigning || !provider || !signerName.trim()} className="flex items-center space-x-1.5 rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white shadow-lg shadow-emerald-600/30 hover:bg-emerald-500 disabled:opacity-40">
            <Lock className="h-3.5 w-3.5" /><span>{pdfWorkflowText(locale, isSigning ? 'digital.signing' : 'digital.signDownload')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
