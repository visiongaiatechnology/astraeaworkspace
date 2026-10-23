// STATUS: DIAMANT VGT SUPREME
// Canonical Vault persistence projection. Undo/redo and ordinary saves use the same Workspace Object Model path.
import type { WorkspaceDocument } from '../../contracts/workspace';
import type { StoredVaultData } from '../../contracts/vaultSpaces';

/**
 * **V-010 — der Sperrzustand, wie er im Dokument liegt.**
 *
 * Warum er **nicht** in `StoredVaultData` steht: `persistVaultData` wirft bei gesperrtem Tresor
 * (`vault_runtime_locked`), und genau das Sperren wäre der Schreibvorgang — der Sperrzustand kann sich also
 * nicht über den Pfad schreiben, der ihn durchsetzt. Er geht über die **freie Trägerschicht** `objects` des
 * zentralen Objektmodells, wie es andere Sitzungszustände auch tun. Das ist **kein** zweiter Speicher: es ist
 * dasselbe Dokument, dieselbe Hülle, derselbe Speichervorgang.
 *
 * `lockedAt` ist ein **Zeitstempel**, kein Boolesches: damit ist der Moment des Sperrens nachvollziehbar und
 * „gesperrt" reproduzierbar. `lastActivityAt` trägt die Untätigkeit für die Auto-Lock-Frist.
 */
export const VAULT_LOCK_RECORD_KEY = 'vault_session_lock';
/** Der Vertrag der Trägerschicht: ein `ExtensionObject` mit festem Namensraum und fester Familie. */
export const VAULT_LOCK_NAMESPACE = 'astraea.vault';
export const VAULT_LOCK_FAMILY = 'session-lock';

export interface VaultLockRecord {
  lockedAt: number | null;
  lastActivityAt: number | null;
}

const EMPTY_LOCK_RECORD: VaultLockRecord = { lockedAt: null, lastActivityAt: null };

/** Liest den Sperrvermerk. Ein unbrauchbarer Wert wird **nicht** stillschweigend zu „entsperrt". */
export function readVaultLockRecord(document: WorkspaceDocument | null | undefined): VaultLockRecord {
  const carrier = document?.objects?.[VAULT_LOCK_RECORD_KEY] as {
    type?: string;
    data?: { namespace?: string; family?: string; payload?: unknown };
  } | undefined;
  // Nur der eigene Träger zählt: ein fremdes Objekt unter demselben Schlüssel wird nicht als Sperrvermerk
  // gedeutet (und damit auch nicht als „entsperrt" missverstanden — siehe `lockedAt: 0` unten).
  if (carrier?.type !== 'ExtensionObject' || carrier.data?.namespace !== VAULT_LOCK_NAMESPACE || carrier.data?.family !== VAULT_LOCK_FAMILY) {
    return EMPTY_LOCK_RECORD;
  }
  const payload = carrier.data.payload as Partial<VaultLockRecord> | null | undefined;
  if (!payload || typeof payload !== 'object') return EMPTY_LOCK_RECORD;
  const stamp = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null);
  return {
    // Ein gesetzter, aber kaputter `lockedAt` bleibt als `0` erhalten (statt `null`): `deriveVaultLockState`
    // wertet `0` als „Vermerk vorhanden, aber unbrauchbar" und sperrt — fail-closed. `null` würde dagegen
    // „nie gesperrt" bedeuten und den Tresor öffnen.
    lockedAt: payload.lockedAt === undefined || payload.lockedAt === null ? null : (stamp(payload.lockedAt) ?? 0),
    lastActivityAt: stamp(payload.lastActivityAt),
  };
}

/** Schreibt den Sperrvermerk in das Dokument. Der Rückgabewert geht an `onUpdateDocument`. */
export function persistVaultLockRecord(
  document: WorkspaceDocument,
  record: VaultLockRecord,
  now = Date.now(),
): WorkspaceDocument {
  return {
    ...document,
    version: document.version + 1,
    modified_at: now,
    objects: {
      ...document.objects,
      [VAULT_LOCK_RECORD_KEY]: {
        type: 'ExtensionObject',
        data: {
          id: VAULT_LOCK_RECORD_KEY,
          namespace: VAULT_LOCK_NAMESPACE,
          family: VAULT_LOCK_FAMILY,
          payload: record,
        },
      } as WorkspaceDocument['objects'][string],
    },
  };
}

export function persistVaultSnapshotInWorkspaceDocument(
  document: WorkspaceDocument,
  vaultData: StoredVaultData,
  now = Date.now(),
): WorkspaceDocument {
  // `WorkspaceDocument.vaultData` is the canonical live Vault state. Older builds mirrored the
  // same payload into `objects.vault_gaiacom_payload`; keeping that mirror creates a shadow copy
  // of the same business truth (and doubles large attachment payloads). We still read the legacy
  // object during migration, but every canonical save removes it.
  const objects = { ...document.objects };
  delete objects.vault_gaiacom_payload;
  return {
    ...document,
    version: document.version + 1,
    modified_at: now,
    vaultData: vaultData,
    objects,
  };
}
