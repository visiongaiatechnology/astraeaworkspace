// STATUS: PLATIN — der Cross-App-Vault-Picker als Einstieg in **Writer** (AST-1226 / AST-1227 / V-023).
//
// **Warum es dieses Modul gibt — gemessen, nicht vermutet.** Am heutigen Baum hatte Writer
// **0 Treffer** für `VaultPicker`, `vaultPicker`, `listVaultPickerCandidates`, `onOpenPicker`
// (485 Quelldateien unter `ui/src/apps/writer`, geprüft mit denselben Mustern, die in
// `shared/vault/picker` und `edition/open-core/apps/vault` **treffen** — die Gegenprobe steht im
// Bericht). Der Dialog existierte also, der **Aufrufer** fehlte.
//
// **Dieses Modul ist kein zweiter Picker.** Es rendert `VaultPickerModal` und urteilt mit
// `listVaultPickerCandidates` / `resolveVaultPickerSelection` — unverändert, aus `shared/vault/picker`.
// Es gibt hier **keine** zweite Autoritätsregel: welche Assets sichtbar sind, entscheidet
// `evaluateVaultAccess`, und dieses Modul liest diese Entscheidung nicht nach.
//
// Was hier steht, ist ausschließlich das, was **Writer** eigenes weiß:
//   1. wo in *seinen* `workspaceDocuments` der Tresor liegt (deterministisch: erste Vault-ID),
//   2. ob dieser Tresor **gesperrt** ist — dieselbe Ableitung wie `VaultFreeRuntime` beim Laden
//      (`readVaultLockRecord` + `deriveVaultLockState`, **eine** Regel, drei Aufrufer),
//      denn ein Picker über einem gesperrten Tresor würde Namen verschlüsselter Assets zeigen,
//   3. was Writer mit der getroffenen Wahl tut: die Datei-ID als `sourceObjectId` des Embeds.
import type { DocumentKind, VaultFile, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import type { VaultAccessAction } from '../../../../shared/vault/security/vaultAccessPolicyEngine';
import {
  resolveVaultPickerSelection,
  type VaultPickerRequest,
} from '../../../../shared/vault/picker/vaultPickerEngine';
import { deriveVaultLockState } from '../../../../shared/vault/security/vaultSessionLock';
import { readVaultLockRecord } from '../../../../shared/vault/persistence/vaultPersistenceEngine';
import { DEFAULT_VAULT_KEY_POLICY } from '../../../../shared/vault/security/vaultKeyPolicyEngine';

/** Die aufrufende Anwendung. Sie bestimmt die Klassifikationsgrenze — `Publish` sähe weniger. */
export const WRITER_VAULT_PICKER_APP: DocumentKind = 'Writer';

/** Writer **öffnet** das Asset in einem Embed; es lädt es nicht herunter und exportiert es nicht. */
export const WRITER_VAULT_PICKER_ACTION: VaultAccessAction = 'open';

/** Die eine Beschriftung des Einstiegs — Komponente und Zeuge lesen sie aus derselben Quelle. */
export const WRITER_VAULT_PICKER_ENTRY_LABEL = 'Vault-Asset gezielt wählen';

export interface WriterVaultPickerReady {
  readonly state: 'ready';
  readonly vaultDocumentId: string;
  /**
   * Die Dateien des Tresors — **ungefiltert**; gefiltert wird mit der Autorität, nicht hier.
   *
   * Die **Array**-Form ist bewusst veränderlich: `VaultPickerModal` deklariert `files: VaultFile[]`, und
   * eine Kopie je Rendern (`[...files]`) wäre eine neue Identität bei jedem Rendern. `VaultFile[]` ist
   * genau die Form, in der der Tresor sie hält; die `readonly`-Zusage steht auf der **Eigenschaft**.
   */
  readonly files: VaultFile[];
  readonly request: VaultPickerRequest;
}

/**
 * Das Ergebnis der Auflösung. `absent` und `locked` sind **benannte** Zustände und keine leere
 * Auswahl: die Oberfläche kann den Grund zeigen, statt einen Knopf anzubieten, der nichts tut.
 */
export type WriterVaultPickerEntry =
  | WriterVaultPickerReady
  | { readonly state: 'locked'; readonly vaultDocumentId: string }
  | { readonly state: 'absent' };

/**
 * Findet den Tresor in den Dokumenten, die Writer **wirklich** hat, und entscheidet, ob der Einstieg
 * angeboten werden darf.
 *
 * Reihenfolge ist die Sicherheit: **erst** der Sperrzustand, **dann** die Dateiliste. Ein Picker, der
 * zuerst listet und die Sperre später bemerkt, hätte die Namen schon gezeigt.
 */
export function resolveWriterVaultPickerEntry(
  documents: readonly WorkspaceDocument[],
  now: number = Date.now(),
): WriterVaultPickerEntry {
  const vaults = documents.filter((document) => document.kind === 'Vault' && Boolean(document.vaultData));
  if (!vaults.length) return { state: 'absent' };
  // Deterministisch: die kleinste Dokument-ID gewinnt. Die Eingabereihenfolge ist keine Regel.
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
      app: WRITER_VAULT_PICKER_APP,
      action: WRITER_VAULT_PICKER_ACTION,
      grants: vault.vaultData?.shareGrants ?? [],
      now,
    },
  };
}
export type WriterVaultPickerOutcome =
  | { readonly ok: true; readonly fileId: string; readonly name: string }
  | { readonly ok: false; readonly reason: string };

/**
 * Urteilt die **getroffene Wahl erneut** — mit derselben Autorität, nicht mit einer eigenen.
 *
 * Zwischen Anzeige und Klick kann eine Freigabe widerrufen worden sein. Der Picker prüft das beim
 * Bestätigen bereits selbst; Writer prüft es trotzdem noch einmal, weil die Anwendung sich nicht
 * darauf verlassen darf, dass ein Rückruf nur aus dem eigenen Dialog kommt. Eine Ablehnung ist
 * **benannt** (`reason`) und wird nicht verschluckt.
 */
export function resolveWriterVaultPickerOutcome(
  entry: WriterVaultPickerReady,
  fileId: string,
): WriterVaultPickerOutcome {
  const resolved = resolveVaultPickerSelection(entry.files, entry.request, fileId);
  return resolved.ok
    ? { ok: true, fileId: resolved.candidate.fileId, name: resolved.candidate.name }
    : { ok: false, reason: resolved.reason };
}
