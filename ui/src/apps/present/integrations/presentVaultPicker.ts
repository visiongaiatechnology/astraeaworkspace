// STATUS: PLATIN — der Cross-App-Vault-Picker als Einstieg in **Present** (AST-1226 / AST-1227 / V-023).
//
// **Warum es dieses Modul gibt — gemessen, nicht vermutet.** Am heutigen Baum hatte Present
// **0 Treffer** für `VaultPicker`, `vaultPicker`, `listVaultPickerCandidates`, `onOpenPicker`
// (154 Quelldateien unter `ui/src/apps/present`). Present hatte bereits einen **Ort** für ein
// geschütztes Workspace-Objekt — `PresentWorkspaceIntegrationModal`, geöffnet aus der oberen Leiste —
// und dort einen `<select>`, der **jede** Vault-Datei anbot (`listPresentWorkspaceIntegrationTargets`,
// `Vault`-Zweig). Was fehlte, war der **autoritätsgefilterte** Weg: `VaultPickerModal`.
//
// **Dieses Modul ist kein zweiter Picker und keine zweite Auswahlliste.** Es rendert
// `VaultPickerModal` und urteilt mit `listVaultPickerCandidates` / `resolveVaultPickerSelection` aus
// `shared/vault/picker`. Die Ziel-ID kommt aus **der Liste der Anwendung selbst**
// (`PresentWorkspaceIntegrationTarget`), nicht aus einem hier nachgebauten `vault-asset:<id>`-Format —
// *zwei Stellen, die dieselbe ID bauen, wären zwei Wahrheiten.*
import type { DocumentKind, VaultFile, WorkspaceDocument } from '../../../shared/contracts/workspace';
import type { VaultAccessAction } from '../../../shared/vault/security/vaultAccessPolicyEngine';
import {
  resolveVaultPickerSelection,
  type VaultPickerRequest,
} from '../../../shared/vault/picker/vaultPickerEngine';
import { deriveVaultLockState } from '../../../shared/vault/security/vaultSessionLock';
import { readVaultLockRecord } from '../../../shared/vault/persistence/vaultPersistenceEngine';
import { DEFAULT_VAULT_KEY_POLICY } from '../../../shared/vault/security/vaultKeyPolicyEngine';
import type { PresentWorkspaceIntegrationTarget } from './presentWorkspaceIntegration';

/** Die aufrufende Anwendung. Sie bestimmt die Klassifikationsgrenze. */
export const PRESENT_VAULT_PICKER_APP: DocumentKind = 'Present';

/** Present **öffnet** das Asset als Referenz; es lädt es nicht herunter und exportiert es nicht. */
export const PRESENT_VAULT_PICKER_ACTION: VaultAccessAction = 'open';

/** Die eine Beschriftung des Einstiegs — Komponente und Zeuge lesen sie aus derselben Quelle. */
export const PRESENT_VAULT_PICKER_ENTRY_LABEL = 'Choose a protected Vault asset';

export interface PresentVaultPickerReady {
  readonly state: 'ready';
  readonly vaultDocumentId: string;
  /**
   * Die Dateien des Tresors — **ungefiltert**; gefiltert wird mit der Autorität, nicht hier.
   *
   * Die **Array**-Form ist bewusst veränderlich: `VaultPickerModal` deklariert `files: VaultFile[]`
   * (`TS4104`, gemessen), und eine Kopie je Rendern wäre eine neue Identität bei jedem Rendern.
   */
  readonly files: VaultFile[];
  readonly request: VaultPickerRequest;
}

export type PresentVaultPickerEntry =
  | PresentVaultPickerReady
  | { readonly state: 'locked'; readonly vaultDocumentId: string }
  | { readonly state: 'absent' };

/**
 * Findet den Tresor unter den Dokumenten, die Present **wirklich** hat.
 *
 * Reihenfolge ist die Sicherheit: **erst** der Sperrzustand, **dann** die Dateiliste. Der Sperrzustand
 * wird mit derselben Ableitung bestimmt, die `VaultFreeRuntime` beim Laden für `runtimeLocked` benutzt
 * (`readVaultLockRecord` + `deriveVaultLockState`) — **eine** Regel, drei Aufrufer, kein zweiter
 * Sperrzustand.
 */
export function resolvePresentVaultPickerEntry(
  documents: readonly WorkspaceDocument[],
  now: number = Date.now(),
): PresentVaultPickerEntry {
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
    files: vault.vaultData?.files ?? [],
    request: {
      app: PRESENT_VAULT_PICKER_APP,
      action: PRESENT_VAULT_PICKER_ACTION,
      grants: vault.vaultData?.shareGrants ?? [],
      now,
    },
  };
}

export interface PresentVaultPickerSelection {
  /** Das Dokument, aus dem eingefügt wird — der Tresor, nicht ein Nachbau. */
  readonly sourceDocumentId: string;
  /** Das Ziel **aus der Liste der Anwendung**; sein `id` ist die eine ID-Konvention. */
  readonly target: PresentWorkspaceIntegrationTarget;
}

export type PresentVaultPickerOutcome =
  | { readonly ok: true; readonly selection: PresentVaultPickerSelection }
  | { readonly ok: false; readonly reason: string };

/**
 * Urteilt die **getroffene Wahl erneut** (dieselbe Autorität) und übersetzt sie in das Ziel, das
 * Present ohnehin schon kennt.
 *
 * Der zweite Schritt ist **kein** Nachbau: das Ziel wird in der übergebenen Zielliste **gesucht**.
 * Findet er keines, ist die Ablehnung **benannt** (`vault_picker_target_missing`) statt still.
 */
export function resolvePresentVaultPickerOutcome(
  entry: PresentVaultPickerReady,
  targets: readonly PresentWorkspaceIntegrationTarget[],
  fileId: string,
): PresentVaultPickerOutcome {
  const resolved = resolveVaultPickerSelection(entry.files, entry.request, fileId);
  if (!resolved.ok) return { ok: false, reason: resolved.reason };
  const target = targets.find(
    (candidate) => candidate.integrationKind === 'vault-asset' && candidate.sourceObjectId === resolved.candidate.fileId,
  );
  if (!target) return { ok: false, reason: 'vault_picker_target_missing' };
  return { ok: true, selection: { sourceDocumentId: entry.vaultDocumentId, target } };
}
