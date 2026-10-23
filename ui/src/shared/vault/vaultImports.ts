// STATUS: PLATIN — Kompositionsschicht für die **Reihenfolge** eines Vault-Imports.
//
// Diese Datei ist absichtlich dünn, und ihre Reichweite ist absichtlich offengelegt.
//
// **Ehrlicher Reichweitenhinweis (gemessen, nicht behauptet):** `buildVaultImportEntries` — die einzige
// hier neu definierte Funktion — wird derzeit **nur von ihrem eigenen Test** importiert. Der Aufrufer wäre
// `edition/open-core/apps/vault/VaultFreeRuntime.tsx::handleAddLocalFiles`; diese Datei liegt **außerhalb**
// des Eigentumsbereichs dieser Bearbeitung. Nach der Regel dieses Projekts („ein Modul, das nur sein Test
// kennt, ist keine erreichbare Funktion", Lehre aus AST-0238) gilt diese Funktion deshalb als
// **vorbereitet, aber nicht erreichbar** und nicht als Erfüllung von AST-1134.
//
// Deshalb liegt die gesamte **Grenzprüfung** in `integrity/vaultIntegrity.ts` — dort, wo Produktionscode
// sie importiert — und nicht hier. Was hier bleibt, ist genau das, was nur die Reihenfolge betrifft:
// erst prüfen, dann lesen, dann die Sandbox-Quarantäne anwenden.
//
// Der Vertrag `src/apps/vault/testing/contract/vaultRuntimeLockWiring.contract.test.mjs` hält fest, dass
// `VaultFreeRuntime` diese Funktion (noch) nicht benutzt. Sobald jemand sie verdrahtet, wird der Vertrag
// rot und muss bewusst umgedreht werden, statt unbemerkt zu veralten.
import type { VaultFile } from '../contracts/workspace';
import { createVaultAttachmentEntry, assertVaultImportWithinLimits, VaultImportLimitError, VAULT_IMPORT_MAX_FILE_BYTES } from './integrity/vaultIntegrity';
import { applyVaultIncomingInspection, inspectVaultIncomingFile, type VaultPreviewParserAdapters } from './preview/vaultPreviewQuarantineEngine';

/**
 * Vollständiger Importpfad: Grenzen prüfen → Anhang erzeugen → Sandbox-Prüfung (Quarantäne) anwenden.
 *
 * Die Reihenfolge ist der Kern: `assertVaultImportWithinLimits` läuft **vor** `createVaultAttachmentEntry`,
 * also bevor `FileReader` die Datei überhaupt als Data-URL materialisiert. Der frühere Pfad prüfte die
 * Nutzlast erst im letzten Schritt (`fileBytes` in `buildVaultSafePreview`), also nachdem der gesamte
 * Anhang bereits als Base64-Zeichenkette im Speicher lag — genau das, was AST-1216 unter „bounded Memory"
 * verbietet.
 */
export async function buildVaultImportEntries(
  files: readonly File[],
  adapters: VaultPreviewParserAdapters,
  folderId: string | null,
): Promise<VaultFile[]> {
  assertVaultImportWithinLimits(files.map((file) => ({ name: file.name, sizeBytes: file.size })));
  const entries: VaultFile[] = [];
  for (const file of files) {
    const entry = await createVaultAttachmentEntry(file);
    // Nachprüfung gegen die gemeldete Größe: stimmt sie nicht, ist die Vorbedingung der Planung ungültig.
    if (entry.sizeBytes !== file.size) throw new VaultImportLimitError('file_bytes');
    const inspection = await inspectVaultIncomingFile(file, adapters);
    entries.push(applyVaultIncomingInspection({ ...entry, folderId }, inspection));
  }
  return entries;
}

/** Nur durchgereicht, damit Aufrufer nicht zwei Module kennen müssen. Die Zahl lebt in `vaultIntegrity`. */
export { VAULT_IMPORT_MAX_FILE_BYTES };
