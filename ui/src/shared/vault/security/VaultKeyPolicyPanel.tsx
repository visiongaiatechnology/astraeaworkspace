import React, { useEffect, useMemo, useRef, useState } from 'react';
import { KeyRound, Lock, RotateCcw, ShieldCheck, Unlock } from 'lucide-react';
import type { KeyVaultStatus, VaultKeyPolicyModel, VaultProtectionMode, WorkspaceDocument } from '../../contracts/workspace';
import { deliverExportBytes, type ExportDeliveryResult } from '../../interchange/exportDelivery';
import {
  normalizeVaultActivityTimestamp,
  normalizeVaultKeyPolicy,
  resolveVaultHardwareCapability,
  resolveVaultProtectionChange,
  updateVaultAutoLock,
  validateVaultUiSessionGate,
  vaultRecoveryExplanation,
  vaultShouldAutoLock,
} from './vaultKeyPolicyEngine';
import { rekeyVaultPackage } from './vaultKeyPolicyCrypto';
import '../../../design-system/themes/vaultChrome.css';

interface VaultKeyPolicyPanelProps {
  document: WorkspaceDocument;
  policy: VaultKeyPolicyModel;
  vaultStatus: KeyVaultStatus;
  activeDocumentPin: string | null;
  activeDocumentPassword?: string | null;
  onSetActiveDocumentPin?: (pin: string | null) => void;
  onSetActiveDocumentPassword?: (password: string | null) => void;
  runtimeLocked: boolean;
  onRuntimeLockedChange: (locked: boolean) => void;
  onPolicyChange: (policy: VaultKeyPolicyModel) => void;
  showToast: (message: string) => void;
}

function downloadBytes(bytes: Uint8Array, filename: string): Promise<ExportDeliveryResult> {
  const extension = /\.[A-Za-z0-9]{1,12}$/u.test(filename) ? filename.split('.').pop()!.toLowerCase() : 'bin';
  return deliverExportBytes(bytes, { suggestedName: filename, extensions: [extension], mimeType: 'application/octet-stream' });
}

export const VaultKeyPolicyPanel: React.FC<VaultKeyPolicyPanelProps> = ({
  document,
  policy: rawPolicy,
  vaultStatus,
  activeDocumentPin,
  activeDocumentPassword,
  onSetActiveDocumentPin,
  onSetActiveDocumentPassword,
  runtimeLocked,
  onRuntimeLockedChange,
  onPolicyChange,
  showToast,
}) => {
  const policy = useMemo(() => normalizeVaultKeyPolicy(rawPolicy), [rawPolicy]);
  const hardware = resolveVaultHardwareCapability(vaultStatus);
  const [pendingMode, setPendingMode] = useState<VaultProtectionMode>(policy.protectionMode);
  const [credential, setCredential] = useState('');
  /** **V-011:** Wiederholungseingabe bei der ersten Vergabe eines Kennworts/PIN. */
  const [credentialConfirmation, setCredentialConfirmation] = useState('');
  const [unlockCredential, setUnlockCredential] = useState('');
  const [busy, setBusy] = useState(false);
  const lastActivityAt = useRef(Date.now());

  useEffect(() => setPendingMode(policy.protectionMode), [policy.protectionMode]);

  useEffect(() => {
    if (runtimeLocked || policy.autoLockMinutes === 0) return;
    // Ein unbrauchbarer Zeitstempel darf nicht als „gerade aktiv" in die Prüfung gelangen; die Prüfung selbst
    // ist zusätzlich fail-closed (siehe `vaultShouldAutoLock`).
    lastActivityAt.current = normalizeVaultActivityTimestamp(lastActivityAt.current);
    const touch = () => { lastActivityAt.current = Date.now(); };
    const timer = globalThis.setInterval(() => {
      if (vaultShouldAutoLock(policy, lastActivityAt.current, Date.now())) {
        onRuntimeLockedChange(true);
        setUnlockCredential('');
      }
    }, 5_000);
    globalThis.addEventListener?.('pointerdown', touch, { passive: true });
    globalThis.addEventListener?.('keydown', touch);
    globalThis.addEventListener?.('focus', touch);
    return () => {
      globalThis.clearInterval(timer);
      globalThis.removeEventListener?.('pointerdown', touch);
      globalThis.removeEventListener?.('keydown', touch);
      globalThis.removeEventListener?.('focus', touch);
    };
  }, [runtimeLocked, policy, onRuntimeLockedChange]);

  const currentCredentials = () => ({ pin: activeDocumentPin, password: activeDocumentPassword });
  /**
   * Ist für den **gewählten** Modus bereits ein Ausweis aktiv? Nur dann entfällt die Wiederholungseingabe
   * (V-011): beim bloßen Ändern der Auto-Lock-Zeit mit bestehendem Kennwort wäre sie lästig ohne Nutzen.
   */
  const activeCredentialSet = pendingMode === 'device_pin' ? Boolean(activeDocumentPin) : Boolean(activeDocumentPassword);
  /**
   * Eine **neue** Eingabe wird gerade gesetzt: entweder ist noch kein Ausweis aktiv, oder der Nutzer hat
   * bereits etwas getippt. Genau dann greift die Bestätigungspflicht — und genau dann muss die Warnung
   * sichtbar sein, weil das Kennwort jetzt **gewechselt** wird (V-044) und nicht bloß die Auto-Lock-Zeit.
   */
  const creditingNewCredential = !activeCredentialSet || credential.length > 0;
  const applyProtection = () => {
    try {
      /**
       * Reihenfolge ist hier die Sicherheitszusage: `resolveVaultProtectionChange` prüft Vorbedingungen und
       * Ausweis und liefert das **vollständige** Ergebnis oder wirft. Der Sitzungsausweis wird deshalb erst
       * gesetzt, nachdem die neue Policy feststeht und die Vorbedingungen erfüllt sind. In der vorigen
       * Fassung wurde `onSetActiveDocumentPin` zuerst aufgerufen; schlug danach irgendein Schritt fehl, blieb
       * ein Ausweis aktiv, während die Policy weiter `device` sagte — sichtbar geschützt, tatsächlich nicht.
       */
      const change = resolveVaultProtectionChange(
        policy,
        pendingMode,
        credential,
        { pin: activeDocumentPin ?? null, password: activeDocumentPassword ?? null },
        vaultStatus,
        /**
         * **V-011.** Die Wiederholungseingabe geht in die Prüfung ein. Bei der ersten Vergabe eines portablen
         * Kennworts ist ein Tippfehler **nicht korrigierbar** — `vaultRecoveryExplanation` sagt selbst, dass
         * der Tresor dann dauerhaft unlesbar bleibt. Deshalb wird genau dieser Vorgang bestätigt.
         */
        credentialConfirmation,
      );
      // Ab hier kann nichts mehr fehlschlagen, was den Ausweis von der Policy trennen würde.
      if (change.nextPin !== (activeDocumentPin ?? null)) onSetActiveDocumentPin?.(change.nextPin);
      if (change.nextPassword !== (activeDocumentPassword ?? null)) onSetActiveDocumentPassword?.(change.nextPassword);
      if (change.nextPolicy.protectionMode !== policy.protectionMode
        || change.nextPolicy.hardwarePreference !== policy.hardwarePreference) {
        onPolicyChange(change.nextPolicy);
      }
      setCredential('');
      showToast(`Vault protection policy set to ${pendingMode.replace('_', '+')}.`);
    } catch (error) {
      // Fail-closed: es wurde bis hierher **nichts** gesetzt. Ein abgelehnter Wechsel lässt den Tresor
      // unverändert, statt ihn halb umgestellt zurückzulassen.
      setCredential('');
      setCredentialConfirmation('');
      showToast(error instanceof Error ? error.message : 'Vault key policy update failed.');
    }
  };

  const unlock = () => {
    try {
      const active = policy.protectionMode === 'device_pin' ? activeDocumentPin : activeDocumentPassword;
      validateVaultUiSessionGate(policy, unlockCredential, active, vaultStatus);
      onRuntimeLockedChange(false);
      lastActivityAt.current = Date.now();
      setUnlockCredential('');
      showToast('Vault UI session unlocked; cryptographic access remains Core-validated.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Vault unlock failed.');
    }
  };

  const rekey = async () => {
    try {
      setBusy(true);
      const result = await rekeyVaultPackage(document, policy, currentCredentials(), vaultStatus, Date.now());
      const delivery = await downloadBytes(result.bytes, `${document.title}.rekeyed.vvault`);
      onPolicyChange(result.nextPolicy);
      showToast(`Vault rekeyed to generation ${result.nextPolicy.keyGeneration} (${result.magic}). ${delivery.mode === 'file' ? `${delivery.fileName} saved.` : `Download started: ${delivery.fileName} (browser mode – no write confirmation).`}`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Vault rekey failed.');
    } finally {
      setBusy(false);
    }
  };

  /*
   * **V-043 — Konsolidierung durch Löschen.** Hier stand `exportRecipient`: ein zweiter Freigabeweg
   * **neben** dem `VaultSharePanel`, und ein grant-loser dazu. Diese Schaltfläche packte einen Container mit
   * einem öffentlichen Schlüssel und schrieb ihn auf die Platte, **ohne** Empfänger-Fingerabdruck, **ohne**
   * Ablauf, **ohne** Widerruf und **ohne** Audit-Eintrag. Der Vertrag hatte diese Felder; dieser Weg füllte
   * sie nicht. Damit war „vertrauliche Freigabe" an dieser Stelle eine Bezeichnung ohne Kontrolle — genau
   * die Form, die dieses Projekt mehrfach getroffen hat.
   *
   * Es bleibt **ein** Freigabeweg: `VaultSharePanel` → `vaultShareEngine` (Empfänger und Ablauf sind Pflicht,
   * Widerruf und Audit gehören dazu). Der verschlüsselte Export ist dort eine **Zustellart**
   * (`encrypted_export`) und wird erst **nach** dem Anlegen der Freigabe ausgelöst — die Krypto-Funktion
   * `exportRecipientEncryptedVaultPackage` bleibt damit erreichbar, aber sie ist nicht mehr der Einstieg.
   */
  return (
    <section data-vgt-vault-root="true" data-vgt-app-guide-anchor="Vault:first" className="rounded-2xl border border-purple-500/20 bg-[#0b0714]/80 p-4 space-y-3" aria-label="Vault encryption and key policy">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xs font-semibold text-slate-100 flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-emerald-400"/>Encryption & Key Policy</h2>
          <p className="text-[10px] text-slate-400 mt-1">Encrypted at rest by default · key generation {policy.keyGeneration} · {runtimeLocked ? 'session locked' : 'session unlocked'}</p>
        </div>
        <div className="text-right text-[10px] text-slate-400">
          <div>{hardware.platform}</div>
          <div className={hardware.hardwareBacked ? 'text-emerald-400' : 'text-amber-300'}>{hardware.hardwareBacked ? 'Hardware-backed confirmed by KeyVault provider' : 'Hardware backing not asserted'}</div>
        </div>
      </div>

      {runtimeLocked ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-52">
            <label className="text-[10px] text-slate-400 block mb-1">{policy.protectionMode === 'device_pin' ? 'PIN' : policy.protectionMode === 'portable_password' ? 'Portable password' : 'Device KeyVault'}</label>
            {policy.protectionMode !== 'device' && <input type="password" autoComplete="off" value={unlockCredential} onChange={(e) => setUnlockCredential(e.target.value)} className="w-full rounded-lg bg-black/30 border border-slate-700 px-3 py-2 text-xs" />}
          </div>
          <button type="button" onClick={unlock} className="px-3 py-2 rounded-lg bg-emerald-600/80 hover:bg-emerald-500 text-xs text-white flex items-center gap-1"><Unlock className="w-3.5 h-3.5"/>Unlock</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
          <div className="rounded-xl border border-slate-800 bg-black/20 p-3 space-y-2">
            <label className="text-[10px] uppercase text-slate-500">Protection mode</label>
            <select value={pendingMode} onChange={(e) => setPendingMode(e.target.value as VaultProtectionMode)} className="w-full rounded-lg bg-black/30 border border-slate-700 px-2 py-2 text-xs">
              <option value="device">Device key</option><option value="device_pin">Device + PIN</option><option value="portable_password">Portable password</option>
            </select>
            {pendingMode !== 'device' && <input type="password" autoComplete="new-password" value={credential} onChange={(e) => setCredential(e.target.value)} placeholder={pendingMode === 'device_pin' ? '4–8 digit PIN' : '8–128 character password'} className="w-full rounded-lg bg-black/30 border border-slate-700 px-3 py-2 text-xs"/>}
            {/*
              **V-011.** Die Wiederholungseingabe steht **nur** bei der ersten Vergabe (ist bereits ein
              Ausweis aktiv, wäre sie lästig ohne Nutzen) und direkt unter dem Feld — die Bestätigung passiert
              dort, wo der Fehler entstehen kann.
            */}
            {pendingMode !== 'device' && creditingNewCredential && <input
              type="password"
              autoComplete="new-password"
              value={credentialConfirmation}
              onChange={(e) => setCredentialConfirmation(e.target.value)}
              placeholder={pendingMode === 'device_pin' ? 'Repeat the PIN' : 'Repeat the password'}
              aria-label={pendingMode === 'device_pin' ? 'Repeat the PIN' : 'Repeat the password'}
              className={`w-full rounded-lg bg-black/30 border px-3 py-2 text-xs ${credentialConfirmation && credentialConfirmation !== credential ? 'border-rose-500/50' : 'border-slate-700'}`}
            />}
            {pendingMode !== 'device' && creditingNewCredential && credentialConfirmation && credentialConfirmation !== credential && (
              <p className="text-[10px] text-rose-300" role="alert">The two entries do not match.</p>
            )}
            {pendingMode === 'portable_password' && creditingNewCredential && (
              <p className="text-[9px] text-amber-300" role="note">
                There is no universal recovery key. If this password is mistyped or lost, the Vault stays
                permanently unreadable unless you already hold an independent encrypted backup.
              </p>
            )}
            <button type="button" onClick={applyProtection} className="vgt-button-primary w-full px-3 py-2 text-xs">Apply protection</button>
          </div>

          <div className="rounded-xl border border-slate-800 bg-black/20 p-3 space-y-2">
            <label className="text-[10px] uppercase text-slate-500">Auto-lock</label>
            <select value={policy.autoLockMinutes} onChange={(e) => onPolicyChange(updateVaultAutoLock(policy, Number(e.target.value)))} className="w-full rounded-lg bg-black/30 border border-slate-700 px-2 py-2 text-xs">
              <option value={0}>Disabled</option><option value={1}>1 minute</option><option value={5}>5 minutes</option><option value={15}>15 minutes</option><option value={30}>30 minutes</option><option value={60}>60 minutes</option>
            </select>
            <label className="flex items-center gap-2 text-[10px] text-slate-300"><input type="checkbox" disabled={!hardware.hardwareBacked && policy.hardwarePreference !== 'required'} checked={policy.hardwarePreference === 'required'} onChange={(e) => { if (e.target.checked && !hardware.hardwareBacked) { showToast('Provider-confirmed hardware backing is unavailable.'); return; } onPolicyChange({ ...policy, hardwarePreference: e.target.checked ? 'required' : 'available' }); }}/>Require provider-confirmed hardware backing</label>
            <div className="flex gap-2"><button type="button" onClick={() => onRuntimeLockedChange(true)} className="flex-1 px-3 py-2 rounded-lg border border-amber-500/30 text-amber-200 text-xs"><Lock className="inline w-3.5 h-3.5 mr-1"/>Lock now</button><button type="button" disabled={busy} onClick={() => void rekey()} className="flex-1 px-3 py-2 rounded-lg border border-purple-500/30 text-purple-200 text-xs"><RotateCcw className="inline w-3.5 h-3.5 mr-1"/>Rekey</button></div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-black/20 p-3 space-y-2">
            <label className="text-[10px] uppercase text-slate-500">Sharing moved</label>
            {/*
              **V-043.** Der Empfängerpaket-Export stand hier und war ein zweiter, grant-loser Freigabeweg.
              Er ist entfernt; Freigaben laufen ausschließlich über das Freigabe-Panel, damit Empfänger,
              Ablauf, Widerruf und Audit an **einer** Stelle erzwungen werden. Der Hinweis steht hier, damit
              niemand die Schaltfläche sucht und annimmt, die Funktion sei verschwunden.
              */}
            <p className="text-[9px] text-slate-500">
              Recipient-encrypted packages are created from <b>Sharing</b>. That panel requires a recipient
              fingerprint and an expiry, records the share and keeps a revocable audit trail — this panel
              deliberately no longer offers a second, uncontrolled export path.
            </p>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-slate-800 bg-black/20 px-3 py-2 text-[9px] text-slate-400 flex gap-2"><KeyRound className="w-3.5 h-3.5 shrink-0 mt-0.5"/><span>{vaultRecoveryExplanation(policy)}</span></div>
    </section>
  );
};
