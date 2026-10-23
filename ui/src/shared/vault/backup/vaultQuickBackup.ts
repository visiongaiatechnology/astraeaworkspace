import type { KeyVaultStatus, VaultKeyPolicyModel, WorkspaceDocument } from '../../contracts/workspace';
import { extensionForDocumentKind } from '../../../platform/operations/appContainerOps';
import { packVaultByPolicy } from '../security/vaultKeyPolicyCrypto';
import { deliverExportBytes, type ExportDeliveryResult } from '../../interchange/exportDelivery';

/**
 * Release Beta 0.1 (Export-Integrität): Der Backup-Export wird auf dem Desktop über den nativen
 * Speichern-Dialog + atomaren Sandbox-Export geschrieben. Nur `mode:'file'` ist ein bestätigter
 * Schreibvorgang; im Browser bleibt es ein Download, den der Aufrufer so benennen muss.
 */
export async function exportVaultQuickBackup(
  document:WorkspaceDocument,
  policy:VaultKeyPolicyModel,
  pin:string|null,
  password:string|null|undefined,
  vaultStatus:KeyVaultStatus,
):Promise<ExportDeliveryResult>{
  const bytes=await packVaultByPolicy(document,policy,{pin,password},vaultStatus);
  const filename=`${document.title}.backup.${extensionForDocumentKind(document.kind)}`;
  const extension=filename.split('.').pop()!.toLowerCase();
  return deliverExportBytes(bytes,{suggestedName:filename,extensions:[extension],mimeType:'application/octet-stream'});
}
