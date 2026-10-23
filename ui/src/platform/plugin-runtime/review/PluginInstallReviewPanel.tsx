import type { PluginInstallReview } from '../pluginRuntimePolicy';

export function PluginInstallReviewPanel({ review }: { review: PluginInstallReview }) {
  return (
    <section aria-label="Plugin install review" className="space-y-3 rounded-xl border border-slate-700 bg-slate-950/70 p-4">
      <div>
        <div className="text-sm font-semibold text-slate-100">{review.name}</div>
        <div className="text-xs text-slate-400">{review.pluginId} · {review.version}</div>
      </div>
      <dl className="grid grid-cols-1 gap-2 text-xs md:grid-cols-2">
        <div><dt className="text-slate-500">Publisher</dt><dd className="text-slate-200">{review.publisher}</dd></div>
        <div><dt className="text-slate-500">Signature</dt><dd className="font-mono text-slate-200">{review.signatureState}</dd></div>
        <div><dt className="text-slate-500">Update source</dt><dd className="text-slate-200">{review.updateSource}</dd></div>
        <div><dt className="text-slate-500">API</dt><dd className="font-mono text-slate-200">{review.negotiatedApiVersion}</dd></div>
      </dl>
      {review.signerFingerprintSha256 && (
        <div className="break-all font-mono text-[10px] text-slate-500">Signer SHA-256: {review.signerFingerprintSha256}</div>
      )}
      <div>
        <div className="text-[10px] uppercase tracking-wide text-slate-500">Requested capabilities</div>
        <div className="mt-1 text-xs text-slate-300">
          {review.requestedCapabilities.length ? review.requestedCapabilities.join(', ') : 'None'}
        </div>
      </div>
      {review.reconsentRequired && <div className="text-xs text-amber-300">Permission changes require explicit re-consent before activation.</div>}
    </section>
  );
}
