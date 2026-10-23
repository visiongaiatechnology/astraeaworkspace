// STATUS: PLATIN — **eine** Warnpforte für **jeden** Klartext-Austritt (V-001, V-039).
//
// **Warum es dieses Modul gibt (gemessen, nicht vermutet):** Es gab **zwei** Wege, auf denen eine
// entschlüsselte Kopie den Tresor verließ, und **beide** schrieben ohne Warnung:
//   1. `VaultFilesTab` → `downloadVaultAttachment` (V-001). Behoben in Runde 83c.
//   2. `VaultFreeRuntime` → `exportVaultQuickBackup` → `anchor.download` (V-039). **Dieselbe Lücke an einem
//      zweiten Ort**, gefunden beim Nachziehen von V-001.
// Eine Warnung, die an einem der beiden Wege fehlt, ist keine Zusage — sie ist eine Zusage an einer Stelle.
// Deshalb liegt der Wortlaut **einmal** hier und **beide** Wege gehen hindurch. Wer einen dritten Weg baut,
// bekommt den Text nicht durch Zufall, sondern muss ihn hier holen.
//
// **Die Ehrlichkeitsregel für den Text:** benannt wird, **was nicht geschützt ist**, nicht „unsicher".
// Und es wird **nicht** behauptet, das Bündel sei unverschlüsselt: es ist ein Container. Was danach beim
// Empfänger liegt, ist aber eine Kopie **außerhalb** des Tresors, die der Tresor nicht mehr einzieht — und
// genau das muss der Nutzer vorher wissen.
import type { VaultBackupExportKind } from './vaultExportWarnings';
import { vaultPlaintextExportWarning } from './vaultExportWarnings';
import { DestructiveConfirmationDialog } from '../../../design-system/components/DestructiveConfirmationDialog';
import React from 'react';

/**
 * Die Bestätigungsphrase. Sie wird **getippt**, nicht geklickt: ein Klartext-Austritt ist unwiderruflich,
 * und ein einzelner Klick ist dafür zu billig. Die Phrase ist bei beiden Wegen dieselbe — zwei verschiedene
 * Phrasen für dieselbe Folge wären zwei Regeln für eine Frage.
 */
export const VAULT_PLAINTEXT_EXPORT_CONFIRMATION = 'EXPORT PLAINTEXT';

export interface VaultPlaintextExportGateProps {
  kind: VaultBackupExportKind;
  /** Was den Tresor verlässt — der Dateiname oder der Dokumenttitel. */
  subject: string;
  onCancel: () => void;
  onConfirm: () => void;
}

function titleFor(kind: VaultBackupExportKind): string {
  if (kind === 'backup') return 'Write a backup copy outside the Vault?';
  if (kind === 'recipient_package') return 'Write a recipient package outside the Vault?';
  return 'Export an unencrypted copy?';
}

export const VaultPlaintextExportGate: React.FC<VaultPlaintextExportGateProps> = ({ kind, subject, onCancel, onConfirm }) => (
  <DestructiveConfirmationDialog
    title={titleFor(kind)}
    description={<>
      <b>{subject}</b> will be written outside the Vault.
      <br />{vaultPlaintextExportWarning(kind)}
    </>}
    confirmLabel={kind === 'backup' ? 'Write backup copy' : 'Write the copy'}
    cancelLabel="Cancel"
    requiredText={VAULT_PLAINTEXT_EXPORT_CONFIRMATION}
    requiredTextLabel={`Type ${VAULT_PLAINTEXT_EXPORT_CONFIRMATION} to continue`}
    onCancel={onCancel}
    onConfirm={onConfirm}
  />
);

export default VaultPlaintextExportGate;
