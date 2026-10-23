// STATUS: DIAMANT VGT SUPREME — Persistence boundary for optional Vault peer sync.
import type {
  VaultPeerDevice,
  VaultPeerResumeState,
  VaultPeerSyncAuditEntry,
  VaultPeerSyncPolicy,
  WorkspaceDocument,
} from '../../contracts/workspace';
import type { StoredVaultData } from '../../contracts/vaultSpaces';
import { applyVaultVersionRetention, captureVaultFileVersion, normalizeVaultVersionRetention } from '../history/vaultVersionHistoryEngine';
import { atomicCommitVaultPeerAttachment, DEFAULT_VAULT_PEER_SYNC_POLICY, normalizeVaultPeerSyncPolicy, type VaultPeerStagedFile } from './vaultPeerSyncEngine';

const MAX_PEERS = 64;
const MAX_RESUME_STATES = 256;
const MAX_AUDIT_ENTRIES = 512;

function auditId(): string {
  const bytes = new Uint8Array(12);
  globalThis.crypto.getRandomValues(bytes);
  return `peer-audit-${Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')}`;
}

function boundedAudit(current: readonly VaultPeerSyncAuditEntry[], entry: Omit<VaultPeerSyncAuditEntry, 'id' | 'at'>): VaultPeerSyncAuditEntry[] {
  return [{ ...entry, id: auditId(), at: Date.now() }, ...current].slice(0, MAX_AUDIT_ENTRIES);
}

export function createVaultPeerSyncActions(
  vaultData: StoredVaultData,
  documents: readonly WorkspaceDocument[],
  persistVaultData: (updated: Partial<StoredVaultData>) => void,
) {
  const policy = normalizeVaultPeerSyncPolicy(vaultData.peerSyncPolicy ?? DEFAULT_VAULT_PEER_SYNC_POLICY);
  /**
   * Befund + Fix (Runde 82, V-037): Diese drei Werte waren `const`-Kopien des Zustands **zum Zeitpunkt der
   * Erzeugung**. Jede Methode rechnete danach gegen die alte Kopie und schrieb nur den neuen Wert weg.
   * Gemessen mit drei aufeinanderfolgenden `recordResume`-Aufrufen **ohne** Neuzeichnen dazwischen:
   *
   *   nach 1 → [a]   nach 2 → [b]   nach 3 → [c]
   *
   * Die ersten beiden Einträge gingen also verloren, statt sich anzusammeln (`MAX_RESUME_STATES` und die
   * Entdopplung sind wirkungslos, wenn die Basis immer leer ist). Ein Nutzer, der zwei Dateien unmittelbar
   * nacheinander synchronisiert, hätte seinen Fortschritt für die erste verloren — und beim nächsten Lauf
   * alles erneut übertragen. Dieselbe Klasse von Fehler steckte in `removePeer` (nutzte `resume` statt der
   * aktuellen Liste) und in `commitIncomingAttachment`.
   *
   * Die Werte sind jetzt `let` und werden nach jedem Persistieren nachgezogen, sodass mehrere Aufrufe
   * innerhalb **einer** Instanziierung kumulativ wirken. Die Laufzeit erzeugt die Aktionen ohnehin pro
   * Neuzeichnen neu; damit ist der Zustand auch ohne Neuzeichnen konsistent.
   */
  let peers = vaultData.peerDevices ?? [];
  let resume = vaultData.peerResume ?? [];
  let audit = vaultData.peerSyncAudit ?? [];
  return {
    policy,
    get peers() { return peers; },
    get resume() { return resume; },
    get audit() { return audit; },
    updatePolicy(update: Partial<VaultPeerSyncPolicy>) {
      persistVaultData({ peerSyncPolicy: normalizeVaultPeerSyncPolicy({ ...policy, ...update }) });
    },
    trustPeer(peer: VaultPeerDevice) {
      if (!peer.trusted || !peer.publicKeyFingerprint || !peer.id) throw new Error('vault_peer_descriptor_invalid');
      const next = [peer, ...peers.filter((candidate) => candidate.id !== peer.id)].slice(0, MAX_PEERS);
      const nextAudit = boundedAudit(audit, { peerId: peer.id, direction: 'pair', outcome: 'ok', detail: `Trusted device fingerprint ${peer.publicKeyFingerprint.slice(0, 16)}…` });
      peers = next; audit = nextAudit;
      persistVaultData({ peerDevices: next, peerSyncAudit: nextAudit });
    },
    removePeer(peerId: string) {
      if (!peers.some((candidate) => candidate.id === peerId)) return;
      const nextPeers = peers.filter((candidate) => candidate.id !== peerId);
      const nextResume = resume.filter((item) => item.peerId !== peerId);
      const nextAudit = boundedAudit(audit, { peerId, direction: 'pair', outcome: 'blocked', detail: 'Peer trust removed locally.' });
      peers = nextPeers; resume = nextResume; audit = nextAudit;
      persistVaultData({ peerDevices: nextPeers, peerResume: nextResume, peerSyncAudit: nextAudit });
    },
    recordResume(state: VaultPeerResumeState) {
      const next = [state, ...resume.filter((candidate) => !(candidate.peerId === state.peerId && candidate.fileId === state.fileId))]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, MAX_RESUME_STATES);
      resume = next;
      persistVaultData({ peerResume: next });
    },
    async commitIncomingAttachment(peerId: string, staged: VaultPeerStagedFile, payloadDataUrl: string, outcome: 'ok' | 'merged' = 'ok') {
      if (!peers.some((candidate) => candidate.id === peerId && candidate.trusted)) throw new Error('vault_peer_untrusted');
      const file = vaultData.files.find((candidate) => candidate.id === staged.fileId);
      if (!file || file.sourceType !== 'attachment') throw new Error('vault_peer_attachment_missing');
      const retention = normalizeVaultVersionRetention(vaultData.versionRetention);
      let versions = await captureVaultFileVersion(file, documents, vaultData.versions ?? [], {
        source: 'automatic', label: 'Before peer sync', allowDuplicate: false,
      });
      versions = applyVaultVersionRetention(versions, retention);
      const committed = atomicCommitVaultPeerAttachment(file, staged, payloadDataUrl);
      const nextResume = resume.filter((candidate) => !(candidate.peerId === peerId && candidate.fileId === file.id));
      const nextAudit = boundedAudit(audit, { peerId, direction: 'receive', fileId: file.id, outcome, detail: `Verified atomic replacement ${staged.contentHash.slice(0, 16)}…` });
      resume = nextResume; audit = nextAudit;
      persistVaultData({
        files: vaultData.files.map((candidate) => candidate.id === file.id ? committed : candidate),
        versions,
        peerResume: nextResume,
        peerSyncAudit: nextAudit,
      });
      return committed;
    },
  };
}
