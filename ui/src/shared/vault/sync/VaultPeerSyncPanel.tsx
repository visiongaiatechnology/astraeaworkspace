// STATUS: DIAMANT VGT SUPREME — Optional local-first Vault peer sync control surface.
import React, { useMemo, useState } from 'react';
import { Link2, Radio, ShieldCheck, Trash2, Wifi } from 'lucide-react';
import type { NetworkCapability, VaultFile, VaultFolder, VaultPeerDevice, VaultPeerSyncPolicy } from '../../contracts/workspace';
import {
  createVaultPairingContext,
  finalizeVaultPairing,
  normalizeVaultPeerSyncPolicy,
  previewVaultPairing,
  shouldVaultPeerSyncFile,
  type VaultPairingContext,
  type VaultPairingOffer,
} from './vaultPeerSyncEngine';
import '../../../design-system/themes/vaultChrome.css';

interface Props {
  files: VaultFile[];
  folders: VaultFolder[];
  policy: VaultPeerSyncPolicy;
  peers: VaultPeerDevice[];
  networkCapability: NetworkCapability;
  onPolicyChange: (update: Partial<VaultPeerSyncPolicy>) => void;
  onTrustPeer: (peer: VaultPeerDevice) => void;
  onRemovePeer: (peerId: string) => void;
  showToast: (message: string) => void;
}

const parseOffer = (value: string): VaultPairingOffer => {
  const parsed = JSON.parse(value) as VaultPairingOffer;
  if (!parsed || parsed.version !== 1 || typeof parsed.deviceId !== 'string' || typeof parsed.label !== 'string' || !parsed.publicKeyJwk) {
    throw new Error('Invalid Astraea pairing offer.');
  }
  return parsed;
};

export const VaultPeerSyncPanel: React.FC<Props> = ({
  files,
  folders,
  policy: policyInput,
  peers,
  networkCapability,
  onPolicyChange,
  onTrustPeer,
  onRemovePeer,
  showToast,
}) => {
  const policy = normalizeVaultPeerSyncPolicy(policyInput);
  const [deviceLabel, setDeviceLabel] = useState('This Astraea device');
  const [pairingContext, setPairingContext] = useState<VaultPairingContext | null>(null);
  const [remoteOfferText, setRemoteOfferText] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [confirmedCode, setConfirmedCode] = useState('');
  const [ignoreText, setIgnoreText] = useState(policy.ignorePatterns.join('\n'));

  const eligibleFiles = useMemo(
    () => files.filter((file) => shouldVaultPeerSyncFile(file, folders, policy)),
    [files, folders, policy],
  );

  const beginPairing = async () => {
    try {
      const context = await createVaultPairingContext(deviceLabel);
      setPairingContext(context);
      setVerificationCode('');
      setConfirmedCode('');
      showToast('Pairing offer created. Exchange it over a trusted channel.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Pairing setup failed.');
    }
  };

  const previewPairing = async () => {
    if (!pairingContext) return showToast('Create a local pairing offer first.');
    try {
      const remote = parseOffer(remoteOfferText);
      const preview = await previewVaultPairing(pairingContext, remote);
      setVerificationCode(preview.verificationCode);
      showToast('Compare the verification code on both devices before trusting.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Pairing offer rejected.');
    }
  };

  const trustPairing = async () => {
    if (!pairingContext) return showToast('Create a local pairing offer first.');
    try {
      const result = await finalizeVaultPairing(pairingContext, parseOffer(remoteOfferText), confirmedCode);
      onTrustPeer(result.peer);
      setRemoteOfferText(''); setVerificationCode(''); setConfirmedCode(''); setPairingContext(null);
      showToast(`Trusted peer ${result.peer.label}.`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Pairing confirmation failed.');
    }
  };

  const toggleFolder = (folderId: string) => onPolicyChange({
    selectedFolderIds: policy.selectedFolderIds.includes(folderId)
      ? policy.selectedFolderIds.filter((id) => id !== folderId)
      : [...policy.selectedFolderIds, folderId],
  });
  const toggleFile = (fileId: string) => onPolicyChange({
    selectedFileIds: policy.selectedFileIds.includes(fileId)
      ? policy.selectedFileIds.filter((id) => id !== fileId)
      : [...policy.selectedFileIds, fileId],
  });

  return (
    <div data-vgt-vault-root="true" className="space-y-5">
      <div className="p-4 rounded-xl bg-black/30 border border-purple-500/20 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-slate-100 flex items-center gap-2"><Link2 className="w-4 h-4 text-purple-400" /> Optional peer sync</div>
            <p className="text-[11px] text-slate-400 mt-1">Local-first by default. No peer, LAN discovery or relay is required to use Vault.</p>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-300">
            <input type="checkbox" checked={policy.enabled} onChange={(event) => onPolicyChange({ enabled: event.target.checked })} /> Enable sync
          </label>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <label className="rounded-lg border border-white/10 p-3 flex items-center gap-2"><Wifi className="w-4 h-4 text-cyan-400" /><input type="checkbox" checked={policy.lanDiscoveryEnabled} disabled={!policy.enabled || networkCapability === 'None'} onChange={(event) => onPolicyChange({ lanDiscoveryEnabled: event.target.checked })} />LAN discovery</label>
          <label className="rounded-lg border border-white/10 p-3 flex items-center gap-2"><Radio className="w-4 h-4 text-violet-400" /><input type="checkbox" checked={policy.relayEnabled} disabled={!policy.enabled || !['WhitelistedOnly', 'FullUserApproved'].includes(networkCapability)} onChange={(event) => onPolicyChange({ relayEnabled: event.target.checked })} />Relay / federation</label>
          <label className="rounded-lg border border-white/10 p-3">Bandwidth KiB/s<input className="mt-1 w-full rounded bg-black/40 border border-white/10 px-2 py-1" type="number" min={0} value={policy.bandwidthLimitKibPerSec} onChange={(event) => onPolicyChange({ bandwidthLimitKibPerSec: Number(event.target.value) })} /></label>
        </div>
        {policy.relayEnabled && <label className="block text-xs text-slate-300">Relay endpoint (WSS only)<input className="mt-1 w-full rounded bg-black/40 border border-white/10 px-2 py-1" value={policy.relayEndpoint ?? ''} onChange={(event) => { try { onPolicyChange({ relayEndpoint: event.target.value }); } catch (error) { showToast(error instanceof Error ? error.message : 'Relay endpoint rejected.'); } }} placeholder="wss://relay.example.invalid/v1" /></label>}
        <div className="rounded-lg bg-emerald-950/20 border border-emerald-500/20 p-3 text-[11px] text-emerald-200 flex items-start gap-2"><ShieldCheck className="w-4 h-4 mt-0.5" />Online-only placeholders remain disabled unless a robust OS placeholder provider exists. Local files stay local-first.</div>
      </div>

      <div className="p-4 rounded-xl bg-black/30 border border-purple-500/20 space-y-3">
        <div className="text-xs font-semibold text-slate-200">Device pairing</div>
        <div className="flex gap-2"><input className="flex-1 rounded bg-black/40 border border-white/10 px-2 py-1.5 text-xs" value={deviceLabel} maxLength={96} onChange={(event) => setDeviceLabel(event.target.value)} /><button type="button" onClick={beginPairing} className="vgt-button-primary px-3 py-1.5 text-xs">Create offer</button></div>
        {pairingContext && <textarea readOnly aria-label="Local pairing offer" className="w-full h-24 rounded bg-black/50 border border-white/10 p-2 text-[10px] font-mono" value={JSON.stringify(pairingContext.offer)} />}
        <textarea aria-label="Remote pairing offer" className="w-full h-24 rounded bg-black/50 border border-white/10 p-2 text-[10px] font-mono" value={remoteOfferText} onChange={(event) => setRemoteOfferText(event.target.value)} placeholder="Paste the remote device pairing offer" />
        <div className="flex flex-wrap gap-2 items-center"><button type="button" onClick={previewPairing} className="px-3 py-1.5 rounded border border-purple-500/30 text-xs text-purple-200">Verify offer</button>{verificationCode && <><span className="font-mono text-sm tracking-[0.2em] text-amber-300">{verificationCode}</span><input aria-label="Confirmed verification code" className="w-36 rounded bg-black/40 border border-white/10 px-2 py-1 text-xs font-mono uppercase" value={confirmedCode} onChange={(event) => setConfirmedCode(event.target.value)} placeholder="CODE" /><button type="button" onClick={trustPairing} className="px-3 py-1.5 rounded bg-emerald-700 hover:bg-emerald-600 text-xs">Trust peer</button></>}</div>
        <div className="space-y-2">{peers.length === 0 ? <div className="text-[11px] text-slate-500">No trusted peers.</div> : peers.map((peer) => <div key={peer.id} className="flex items-center justify-between rounded-lg border border-white/10 p-2"><div><div className="text-xs text-slate-200">{peer.label}</div><div className="text-[10px] text-slate-500 font-mono">{peer.publicKeyFingerprint.slice(0, 24)}…</div></div><button aria-label={`Remove ${peer.label}`} type="button" onClick={() => onRemovePeer(peer.id)} className="p-1.5 text-rose-300 hover:bg-rose-500/10 rounded"><Trash2 className="w-4 h-4" /></button></div>)}</div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="p-4 rounded-xl bg-black/30 border border-purple-500/20 space-y-2"><div className="text-xs font-semibold text-slate-200">Selective sync</div><div className="text-[11px] text-slate-500">No selection means every eligible non-quarantined file. Folder and file selections can be combined.</div>{/*
          **Befund + Fix (V-041):** Hier stand `files.slice(0, 100)`. Bei mehr als 100 Dateien fehlten die
          restlichen **still** — kein Hinweis, keine Zählung, kein Weg, sie auszuwählen. Sichtbar
          widersprüchlich wurde es, weil die Zählung daneben die **Gesamt**zahl nannte („/ 130 files"),
          während 30 Dateien gar nicht auswählbar waren: eine sichtbare Zahl, die dem widerspricht, was
          tatsächlich erreichbar ist. Die Liste zeigt jetzt **alle** Einträge (der Container scrollt bereits
          über `max-h-40 overflow-auto`) und benennt die Zahl ausdrücklich.
        */}<div className="max-h-40 overflow-auto space-y-1">{folders.map((folder) => <label key={folder.id} className="flex gap-2 text-xs"><input type="checkbox" checked={policy.selectedFolderIds.includes(folder.id)} onChange={() => toggleFolder(folder.id)} />Folder · {folder.name}</label>)}{files.map((file) => <label key={file.id} className="flex gap-2 text-xs"><input type="checkbox" checked={policy.selectedFileIds.includes(file.id)} onChange={() => toggleFile(file.id)} />File · {file.name}</label>)}</div><div className="text-[10px] text-slate-500">Showing all {folders.length} folder{folders.length === 1 ? '' : 's'} and {files.length} file{files.length === 1 ? '' : 's'} — nothing is hidden from this list.</div></div>
        <div className="p-4 rounded-xl bg-black/30 border border-purple-500/20 space-y-2"><div className="text-xs font-semibold text-slate-200">Ignore patterns</div><textarea className="w-full h-32 rounded bg-black/50 border border-white/10 p-2 text-xs font-mono" value={ignoreText} onChange={(event) => setIgnoreText(event.target.value)} onBlur={() => onPolicyChange({ ignorePatterns: ignoreText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean) })} placeholder="*.tmp\n.cache/*" /><div className="text-[11px] text-slate-400">Eligible now: <span className="text-purple-300">{eligibleFiles.length}</span> / {files.length} files · transfer uses per-block SHA-256, resume and atomic verified replacement.</div></div>
      </div>
    </div>
  );
};
