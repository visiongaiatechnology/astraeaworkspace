// STATUS: PLATIN — der Cross-App-Vault-Picker als Einstieg in **Publish** (AST-1226 / AST-1227 / V-023).
//
// **Warum es dieses Modul gibt — gemessen, nicht vermutet.** Am heutigen Baum hatte Publish
// **0 Treffer** für `VaultPicker`, `vaultPicker`, `listVaultPickerCandidates`, `onOpenPicker`
// (77 Quelldateien unter `ui/src/apps/publish`). Publish hatte die **Fähigkeit** sogar schon:
// `placeWorkspaceAsset` (`integrations/publishWorkspaceIntegration.ts:20`) kennt `Vault` →
// `'vault-asset'` — und ein Vertragstest hält fest, dass `linkWriterStory`/`attachPublishReference`
// **null Aufrufer** hatten. Was fehlte, war der **Einstieg** und der **autoritätsgefilterte** Weg.
//
// **Dieses Modul ist kein zweiter Picker und keine zweite Ablage.** Es rendert `VaultPickerModal` und
// urteilt mit `listVaultPickerCandidates` / `resolveVaultPickerSelection` aus `shared/vault/picker`.
// Die Ablage selbst bleibt `placeWorkspaceAsset` — **eine** Stelle, die eine Workspace-Referenz an einen
// Rahmen hängt.
//
// ## Die gemessene Grenze der Autorität (sie unterscheidet Publish von Writer)
//
// `vaultAccessPolicyEngine` führt `WORKSPACE_APPS` **ohne** `Publish`: „intern" ist keine versendbare
// Stufe. Für Publish ist damit schon `Internal` grant-pflichtig. Das ist keine Annahme dieses Moduls —
// es ist die eine Regel des Vaults, und dieses Modul liest sie nicht nach.
import type { DocumentKind, VaultFile, WorkspaceDocument } from '../../../shared/contracts/workspace';
import type { VaultAccessAction } from '../../../shared/vault/security/vaultAccessPolicyEngine';
import {
  resolveVaultPickerSelection,
  type VaultPickerRequest,
} from '../../../shared/vault/picker/vaultPickerEngine';
import { deriveVaultLockState } from '../../../shared/vault/security/vaultSessionLock';
import { readVaultLockRecord } from '../../../shared/vault/persistence/vaultPersistenceEngine';
import { DEFAULT_VAULT_KEY_POLICY } from '../../../shared/vault/security/vaultKeyPolicyEngine';

/** Die aufrufende Anwendung. Sie bestimmt die Klassifikationsgrenze — und für Publish ist sie enger. */
export const PUBLISH_VAULT_PICKER_APP: DocumentKind = 'Publish';

/** Publish **öffnet** das Asset als Referenz; es lädt es nicht herunter und exportiert es nicht. */
export const PUBLISH_VAULT_PICKER_ACTION: VaultAccessAction = 'open';

/** Die eine Beschriftung des Einstiegs — Komponente und Zeuge lesen sie aus derselben Quelle. */
export const PUBLISH_VAULT_PICKER_ENTRY_LABEL = 'Place a protected Vault asset';

export interface PublishVaultPickerReady {
  readonly state: 'ready';
  readonly vaultDocumentId: string;
  /**
   * Die Dateien des Tresors — **ungefiltert**; gefiltert wird mit der Autorität, nicht hier.
   *
   * Die **Array**-Form ist bewusst veränderlich: `VaultPickerModal` deklariert `files: VaultFile[]`, und
   * eine Kopie je Rendern wäre eine neue Identität bei jedem Rendern.
   */
  readonly files: VaultFile[];
  readonly request: VaultPickerRequest;
  /** Das Dokument selbst, weil `placeWorkspaceAsset` die **Quelle** braucht — kein zweiter Nachschlag. */
  readonly vaultDocument: WorkspaceDocument;
}

export type PublishVaultPickerEntry =
  | PublishVaultPickerReady
  | { readonly state: 'locked'; readonly vaultDocumentId: string }
  | { readonly state: 'absent' };

/**
 * Findet den Tresor unter den Dokumenten, die Publish **wirklich** hat.
 *
 * Reihenfolge ist die Sicherheit: **erst** der Sperrzustand, **dann** die Dateiliste — und der
 * Sperrzustand kommt aus derselben Ableitung, die `VaultFreeRuntime` beim Laden für `runtimeLocked`
 * benutzt (`readVaultLockRecord` + `deriveVaultLockState`): **eine** Regel, drei Aufrufer.
 */
export function resolvePublishVaultPickerEntry(
  documents: readonly WorkspaceDocument[],
  now: number = Date.now(),
): PublishVaultPickerEntry {
  const vaults = documents.filter((document) => document.kind === 'Vault' && Boolean(document.vaultData));
  if (!vaults.length) return { state: 'absent' };
  const vault = [...vaults].sort((left, right) => left.id.localeCompare(right.id))[0]!;

  const record = readVaultLockRecord(vault);
  const lock = deriveVaultLockState({
    lockedAt: record.lockedAt,
    lastActivityAt: record.lastActivityAt,
    autoLockMinutes: (vault.vaultData?.keyPolicy ?? DEFAULT_VAULT_KEY_POLICY).autoLockMinutes,
    now,
  });
  if (lock.locked) return { state: 'locked', vaultDocumentId: vault.id };

  return {
    state: 'ready',
    vaultDocumentId: vault.id,
    vaultDocument: vault,
    files: vault.vaultData?.files ?? [],
    request: {
      app: PUBLISH_VAULT_PICKER_APP,
      action: PUBLISH_VAULT_PICKER_ACTION,
      grants: vault.vaultData?.shareGrants ?? [],
      now,
    },
  };
}

export type PublishVaultPickerOutcome =
  | { readonly ok: true; readonly fileId: string; readonly name: string }
  | { readonly ok: false; readonly reason: string };

/**
 * Urteilt die **getroffene Wahl erneut** — mit derselben Autorität, nicht mit einer eigenen.
 *
 * Zwischen Anzeige und Klick kann eine Freigabe widerrufen worden sein; Publish verlässt sich deshalb
 * nicht darauf, dass der Rückruf nur aus dem eigenen Dialog kommt. Eine Ablehnung ist **benannt**.
 */
export function resolvePublishVaultPickerOutcome(
  entry: PublishVaultPickerReady,
  fileId: string,
): PublishVaultPickerOutcome {
  const resolved = resolveVaultPickerSelection(entry.files, entry.request, fileId);
  return resolved.ok
    ? { ok: true, fileId: resolved.candidate.fileId, name: resolved.candidate.name }
    : { ok: false, reason: resolved.reason };
}
