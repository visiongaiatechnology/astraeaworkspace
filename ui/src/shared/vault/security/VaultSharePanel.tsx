// STATUS: PLATIN — Freigabeoberfläche: Empfänger, Ablauf, Widerruf (V-014).
//
// **Warum es dieses Panel gibt:** bis hierher war die einzige „Freigabe" im Vault die Schaltfläche
// „Export recipient package" in `VaultKeyPolicyPanel` — ein Container-Export mit einem öffentlichen
// Schlüssel, **ohne** Empfängerliste, **ohne** Ablauf, **ohne** Widerruf. Die Bezeichnung versprach eine
// Kontrolle, die es nicht gab. Dieses Panel ist die Oberfläche für `vaultShareEngine`: es legt Freigaben an,
// zeigt ihren Zustand (aktiv / abgelaufen / widerrufen), benennt **ehrlich**, wenn eine exportierte Kopie
// nicht zurücknehmbar ist, und lässt widerrufen.
//
// Es ist **nicht** die Urteilsinstanz: ob ein Zugriff erlaubt ist, entscheidet ausschließlich
// `evaluateVaultAccess`. Dieses Panel schreibt nur die Grants, die jenes Urteil liest.
import React, { useMemo, useState } from 'react';
import { Link2, ShieldOff, Timer, UserCheck } from 'lucide-react';
import type { VaultFile, VaultShareAuditEntry, VaultShareDelivery, VaultShareGrant, VaultSharePermission } from '../../contracts/workspace';
import {
  activeVaultShares,
  createVaultShare,
  extendVaultShare,
  MAX_VAULT_SHARE_TTL_MS,
  revokeVaultShare,
  vaultShareSummary,
  vaultSharesForFile,
  VAULT_SHARE_FINGERPRINT_PATTERN,
} from './vaultShareEngine';

interface Props {
  files: VaultFile[];
  grants: VaultShareGrant[];
  audit: VaultShareAuditEntry[];
  onGrantsChange: (grants: VaultShareGrant[], audit: VaultShareAuditEntry) => void;
  /**
   * **V-043.** Der verschlüsselte Export ist hier eine **Zustellart**, kein eigener Weg. Diese Rückruf
   * löst ihn aus — und zwar **nachdem** `createVaultShare` den Grant mit Empfänger, Ablauf und Audit
   * angelegt hat. Der alte `VaultKeyPolicyPanel`-Knopf schrieb denselben Container, aber **ohne** jeden
   * dieser Datensätze; er ist entfernt. Ist der Rückruf nicht gesetzt, erklärt das Panel das ehrlich,
   * statt eine Schaltfläche anzubieten, die nichts bewirkt.
   *
   * **`null` bedeutet „nicht geschrieben".** Seit V-039 steht vor dem Schreiben eine Warnung; solange die
   * nicht bestätigt ist, existiert **keine** Kopie. Ein `null` verhindert, dass das Panel „written" meldet,
   * obwohl nichts geschrieben wurde — eine Erfolgsmeldung ohne die Operation.
   */
  onExportEncryptedPackage?: () => Promise<string | null>;
  showToast: (message: string) => void;
}

const HOUR_MS = 3_600_000;
const TTL_CHOICES: ReadonlyArray<{ label: string; ms: number }> = [
  { label: '1 hour', ms: HOUR_MS },
  { label: '24 hours', ms: 24 * HOUR_MS },
  { label: '7 days', ms: 7 * 24 * HOUR_MS },
  { label: '30 days', ms: 30 * 24 * HOUR_MS },
  { label: '90 days', ms: 90 * 24 * HOUR_MS },
];
const DELIVERIES: ReadonlyArray<VaultShareDelivery> = ['space', 'gaiacom', 'hosted_live', 'encrypted_export'];
const PERMISSIONS: ReadonlyArray<VaultSharePermission> = ['view', 'download', 'edit'];

const field = 'w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-[11px] text-slate-200 outline-none focus:border-cyan-400/40';
const button = 'inline-flex items-center gap-1 rounded-lg border border-white/10 bg-slate-900/70 px-2 py-1 text-[10px] text-slate-300 hover:border-cyan-400/30 disabled:opacity-40';

function stateLabel(state: 'active' | 'expired' | 'revoked'): string {
  return state === 'active' ? 'Active' : state === 'expired' ? 'Expired' : 'Revoked';
}

export const VaultSharePanel: React.FC<Props> = ({ files, grants, audit, onGrantsChange, onExportEncryptedPackage, showToast }) => {
  const [fileId, setFileId] = useState(files[0]?.id ?? '');
  const [delivery, setDelivery] = useState<VaultShareDelivery>('space');
  const [permission, setPermission] = useState<VaultSharePermission>('view');
  const [recipient, setRecipient] = useState('');
  const [ttlMs, setTtlMs] = useState(TTL_CHOICES[1]!.ms);

  const selected = files.find((file) => file.id === fileId) ?? files[0];
  const fileGrants = useMemo(() => selected ? vaultSharesForFile(grants, selected.id) : [], [grants, selected?.id]);
  const activeCount = useMemo(() => activeVaultShares(grants).length, [grants]);
  const recipientValid = VAULT_SHARE_FINGERPRINT_PATTERN.test(recipient.trim());
  const canCreate = Boolean(selected) && recipientValid && ttlMs > 0 && ttlMs <= MAX_VAULT_SHARE_TTL_MS;

  const create = () => {
    try {
      const { grant, audit: entry } = createVaultShare({
        fileId: selected!.id, delivery, permissions: [permission],
        recipientFingerprint: recipient.trim(), ttlMs,
      }, grants);
      onGrantsChange([grant, ...grants], entry);
      setRecipient('');
      showToast(`Share created for ${(grant.recipientFingerprint ?? '').slice(0, 12)}… — expires in ${Math.round(ttlMs / HOUR_MS)} h.`);
      /*
       * **V-001 für den Freigabeweg.** Eine `encrypted_export`-Zustellung erzeugt eine **Klartextkopie** beim
       * Empfänger. Der Export wird deshalb erst **nach** dem Grant ausgelöst, und der Nutzer erfährt im
       * Klartext, was die Kopie nicht schützt — dieselbe Formulierung wie im Dialog des Datei-Exports.
       */
      if (delivery === 'encrypted_export' && onExportEncryptedPackage) {
        void onExportEncryptedPackage().then((filename) => {
          /*
           * **Ehrlichkeitskorrektur (V-039).** Hier stand `showToast(\`${filename} written. …\`)`. Seit vor
           * dem Schreiben eine Warnung steht, ist das **falsch**, solange nicht bestätigt wurde: `null`
           * bedeutet „nichts geschrieben". Eine Erfolgsmeldung ohne die Operation ist genau das Muster, das
           * dieser Plan verbietet.
           */
          if (!filename) return;
          showToast(`${filename} written. The exported copy is not encrypted and cannot be recalled.`);
        }).catch((error: unknown) => {
          showToast(error instanceof Error ? error.message : 'Recipient package export failed.');
        });
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Share could not be created.');
    }
  };

  const revoke = (grant: VaultShareGrant) => {
    try {
      const { grants: next, audit: entry } = revokeVaultShare(grants, grant.id);
      onGrantsChange(next, entry);
      showToast(vaultShareSummary({ ...grant, status: 'revoked', revokedAt: Date.now() }, Date.now()).copyRemains
        ? 'Future access revoked. The recipient already holds an exported copy that cannot be recalled.'
        : 'Share revoked.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Share could not be revoked.');
    }
  };

  const extend = (grant: VaultShareGrant) => {
    try {
      const { grants: next, audit: entry } = extendVaultShare(grants, grant.id, 24 * HOUR_MS);
      onGrantsChange(next, entry);
      showToast('Share extended by 24 hours.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Share could not be extended.');
    }
  };

  if (!files.length) {
    return <section className="rounded-2xl border border-white/[0.08] bg-slate-900/60 p-4" aria-label="Vault sharing">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100"><Link2 aria-hidden="true" className="h-4 w-4 text-cyan-300" />Sharing</h3>
      <p className="mt-1 text-[10px] text-slate-500">No Vault entries yet — add a file before sharing it.</p>
    </section>;
  }

  return <section className="space-y-3 rounded-2xl border border-white/[0.08] bg-slate-900/60 p-4" aria-label="Vault sharing">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100"><Link2 aria-hidden="true" className="h-4 w-4 text-cyan-300" />Sharing</h3>
        <p className="mt-1 text-[10px] text-slate-500">A share needs a recipient and an expiry. The classification ceiling and the permissions are enforced by the access policy, not by this panel.</p>
      </div>
      <span className="text-[10px] text-slate-400"><UserCheck aria-hidden="true" className="mr-1 inline h-3 w-3" />{activeCount} active · {grants.length} total</span>
    </div>

    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
      <label className="text-[10px] text-slate-400">Asset
        <select className={field} value={selected?.id ?? ''} onChange={(event) => setFileId(event.target.value)} aria-label="Share asset">
          {files.map((file) => <option key={file.id} value={file.id}>{file.name}</option>)}
        </select>
      </label>
      <label className="text-[10px] text-slate-400">Delivery
        <select className={field} value={delivery} onChange={(event) => setDelivery(event.target.value as VaultShareDelivery)} aria-label="Share delivery">
          {DELIVERIES.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
        </select>
      </label>
      <label className="text-[10px] text-slate-400">Permission
        <select className={field} value={permission} onChange={(event) => setPermission(event.target.value as VaultSharePermission)} aria-label="Share permission">
          {PERMISSIONS.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
        </select>
      </label>
      <label className="text-[10px] text-slate-400">Expires in
        <select className={field} value={ttlMs} onChange={(event) => setTtlMs(Number(event.target.value))} aria-label="Share expiry">
          {TTL_CHOICES.map((choice) => <option key={choice.ms} value={choice.ms}>{choice.label}</option>)}
        </select>
      </label>
      <label className="text-[10px] text-slate-400">Recipient fingerprint (64 hex)
        <input className={`${field} font-mono`} value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="64 hex characters" aria-label="Recipient fingerprint" />
      </label>
    </div>

    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className={button} disabled={!canCreate} onClick={create}>
        <Link2 className="h-3 w-3" />Create share
      </button>
      {!recipientValid && recipient.length > 0 && <span className="text-[10px] text-amber-300">A recipient fingerprint must be exactly 64 hexadecimal characters.</span>}
      {delivery === 'encrypted_export' && <span className="text-[10px] text-amber-300">An encrypted export creates a copy at the recipient that <b>cannot be recalled</b> by revoking the share.</span>}
      {delivery === 'encrypted_export' && !onExportEncryptedPackage && <span className="text-[10px] text-slate-400">This build has no encrypted-package exporter wired, so the share is recorded without writing a file.</span>}
    </div>

    <div className="space-y-2">
      {!fileGrants.length && <p className="rounded-lg bg-black/20 px-3 py-4 text-center text-[10px] text-slate-500">No shares for this asset. Without a share, only its classification ceiling applies.</p>}
      {fileGrants.map((grant) => {
        const summary = vaultShareSummary(grant);
        return <div key={grant.id} className="rounded-xl border border-white/10 bg-black/25 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11px] text-slate-200">
                <span className="font-mono">{summary.recipient}</span>
                <span className={`rounded px-1.5 py-0.5 text-[9px] ${summary.state === 'active' ? 'bg-emerald-500/15 text-emerald-300' : summary.state === 'expired' ? 'bg-amber-500/15 text-amber-300' : 'bg-rose-500/15 text-rose-300'}`}>{stateLabel(summary.state)}</span>
                <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] text-slate-400">{summary.delivery}</span>
                <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] text-slate-400">{summary.permissions}</span>
              </div>
              {summary.expiresAt !== undefined && <p className="mt-1 flex items-center gap-1 text-[9px] text-slate-500"><Timer aria-hidden="true" className="h-3 w-3" />Expires {new Date(summary.expiresAt).toISOString()}</p>}
            </div>
            <div className="flex gap-2">
              <button type="button" className={button} disabled={summary.state !== 'active'} onClick={() => extend(grant)}>Extend 24 h</button>
              <button type="button" className={button} disabled={summary.state === 'revoked'} onClick={() => revoke(grant)}>
                <ShieldOff className="h-3 w-3" />Revoke
              </button>
            </div>
          </div>
          {summary.copyRemains && <p className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-2 py-1 text-[9px] text-amber-200">
            This delivery <b>can</b> create an exported copy at the recipient. Revoking ends future access but <b>cannot recall</b> such a copy — this is not a recall.
          </p>}
        </div>;
      })}
    </div>

    {audit.length > 0 && <details className="rounded-lg bg-black/20 p-2">
      <summary className="cursor-pointer text-[10px] text-slate-400">Share audit ({audit.length})</summary>
      <ul className="mt-2 space-y-1">
        {audit.slice(0, 12).map((entry) => <li key={entry.id} className="text-[9px] text-slate-500">
          <span className="font-mono">{new Date(entry.at).toISOString()}</span> · {entry.action} · {entry.detail}
        </li>)}
      </ul>
    </details>}
    <p className="text-[9px] text-slate-600" role="note">A share is written here; the decision to allow an access is made by the access policy engine only.</p>
  </section>;
};

export default VaultSharePanel;
