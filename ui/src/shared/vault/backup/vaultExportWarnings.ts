// STATUS: PLATIN — der eine Wortlaut für jeden Klartext-Austritt (V-001, V-039).
//
// **Warum der Text in einem eigenen, reinen Modul liegt:** er ist eine **Zusage**, und Zusagen gehören an
// genau eine Stelle. Zwei Wege mit zwei Formulierungen wären zwei Wahrheiten über dieselbe Folge — und der
// Befund war gerade, dass ein zweiter Weg die Warnung **gar nicht** hatte (V-039), obwohl der erste sie
// seit Runde 83c trug (V-001). Weil dieses Modul rein ist, ist der Wortlaut prüfbar, ohne eine Oberfläche
// zu rendern.
//
// **Was der Text benennen muss:** nicht „unsicher", sondern **was nicht geschützt ist**. Und er darf
// **nicht** behaupten, das Bündel sei unverschlüsselt: `packVaultByPolicy` erzeugt einen Container. Was
// danach beim Empfänger liegt, ist trotzdem eine Kopie außerhalb des Tresors, die der Tresor nicht mehr
// einzieht.
import type { VaultFile } from '../../contracts/workspace';

export type VaultBackupExportKind = 'backup' | 'recipient_package' | 'file_download';

/**
 * Der Wortlaut je Austrittsart.
 *
 * Die Sätze sind bewusst **verschieden**, weil die Vorgänge verschieden sind: eine Datei wird wirklich
 * unverschlüsselt geschrieben, ein Bündel ist ein Container. Beide enden aber mit derselben Folge, und die
 * steht in jedem Satz: die Kopie ist **nicht rückholbar**.
 */
export function vaultPlaintextExportWarning(kind: VaultBackupExportKind): string {
  switch (kind) {
    case 'file_download':
      return 'The exported copy is not encrypted, is no longer covered by the Vault key, and cannot be recalled — later locking the Vault or revoking sharing does not remove it.';
    case 'backup':
      return 'The backup copy leaves the Vault as a file outside its key. Once written, the Vault cannot withdraw it, and whoever obtains the file holds a copy that locking the Vault does not reach. Keep it in a place you control.';
    case 'recipient_package':
      return 'The package is written outside the Vault and handed to a recipient. Revoking the share afterwards ends future access but cannot recall this copy.';
    default:
      return 'The exported copy leaves the Vault and cannot be recalled.';
  }
}

/**
 * **V-039, der zweite Teil des Befunds.** `exportVaultQuickBackup` schreibt über `anchor.download`
 * **ohne Pfadwahl**: der Browser legt die Datei in seinen Standardordner, und der Nutzer erfährt nicht,
 * wohin. Bei einem Klartext-Austritt ist das die falsche Reihenfolge — erst schreiben, dann fragen, wo es
 * liegt. Der Name der Datei wird deshalb **vorher** genannt, damit der Nutzer weiß, wonach er suchen muss,
 * wenn er den Speicherort nicht wählen kann.
 */
export function vaultPlaintextExportSubject(kind: VaultBackupExportKind, input: { documentTitle: string; extension: string } | { file: Pick<VaultFile, 'name'> }): string {
  if ('file' in input) return input.file.name;
  const extension = input.extension.startsWith('.') ? input.extension : `.${input.extension}`;
  return `${input.documentTitle}.${kind === 'backup' ? 'backup' : 'recipient'}${extension}`;
}

/** Für Anzeige und Diagnose: welche Austrittsarten es gibt. */
export const VAULT_BACKUP_EXPORT_KINDS: readonly VaultBackupExportKind[] = Object.freeze([
  'file_download',
  'backup',
  'recipient_package',
]);
