import type {
  KeyVaultStatus,
  VaultBackupCatalogEntry,
  VaultBackupKeyMode,
  VaultBackupPolicy,
  VaultKeyPolicyModel,
  WorkspaceDocument,
} from '../../contracts/workspace';
import type { StoredVaultData } from '../../contracts/vaultSpaces';
import type { VaultBackupTargetAdapter } from './vaultBackupTargets';
import {
  applyVaultBackupRetention,
  backupCatalogEntryFromBundle,
  createVaultBackupBundle,
  normalizeVaultBackupPolicy,
  previewVaultBackupBundle,
  restoreVaultBackupChain,
  restoreSelectedVaultFiles,
  sha256Hex,
  isVaultBackupScheduleDue,
  type VaultBackupPreview,
} from './vaultBackupEngine';
import { packVaultBackup, unpackVaultBackup } from './vaultBackupCrypto';
import { DEFAULT_VAULT_KEY_POLICY, normalizeVaultKeyPolicy } from '../security/vaultKeyPolicyEngine';

export interface VaultBackupRuntimeSecrets { independentPassword?: string | null; pin?: string | null; vaultPassword?: string | null; }
export interface VaultBackupExecutionResult { entry: VaultBackupCatalogEntry; preview: VaultBackupPreview; pruned: string[]; }

function backupFilename(id: string): string { return `${id}.vbackup`; }

async function verifyReadBack(
  bytes: Uint8Array,
  expectedDigest: string,
  keyMode: VaultBackupKeyMode,
  vaultPolicy: VaultKeyPolicyModel,
  _status: KeyVaultStatus,
  secrets: VaultBackupRuntimeSecrets,
) {
  if (await sha256Hex(bytes) !== expectedDigest) throw new Error('vault_backup_verify_digest_failed');
  return unpackVaultBackup(bytes,keyMode,vaultPolicy,{pin:secrets.pin,password:secrets.vaultPassword},secrets.independentPassword);
}

function latestBase(catalog: readonly VaultBackupCatalogEntry[], targetId: string): VaultBackupCatalogEntry | undefined {
  return [...catalog].filter((entry)=>entry.targetId===targetId).sort((a,b)=>b.createdAt-a.createdAt)[0];
}

async function loadCatalogChain(
  entry: VaultBackupCatalogEntry,
  catalog: readonly VaultBackupCatalogEntry[],
  adapter: VaultBackupTargetAdapter,
  vaultPolicy: VaultKeyPolicyModel,
  status: KeyVaultStatus,
  secrets: VaultBackupRuntimeSecrets,
) {
  const byId=new Map(catalog.map((item)=>[item.id,item])); const entries:VaultBackupCatalogEntry[]=[]; let cursor:VaultBackupCatalogEntry|undefined=entry;
  const seen=new Set<string>();
  while(cursor){if(seen.has(cursor.id))throw new Error('vault_backup_catalog_cycle');seen.add(cursor.id);entries.push(cursor);cursor=cursor.baseBackupId?byId.get(cursor.baseBackupId):undefined;if(entries.length>256)throw new Error('vault_backup_chain_limit');}
  entries.reverse(); if(entries[0]?.mode!=='full')throw new Error('vault_backup_chain_full_required');
  const bundles=[];
  for(const item of entries){if(item.targetId!==entry.targetId)throw new Error('vault_backup_chain_target_mismatch');if(item.keyMode!==entry.keyMode)throw new Error('vault_backup_chain_key_mode_mismatch');const bytes=await adapter.read(item.targetLocator);const bundle=await verifyReadBack(bytes,item.packageDigest,item.keyMode,vaultPolicy,status,secrets);if(bundle.id!==item.id)throw new Error('vault_backup_catalog_package_mismatch');bundles.push(bundle);}
  return bundles;
}

export function createVaultBackupActions(
  vaultData: StoredVaultData,
  documents: readonly WorkspaceDocument[],
  sourceVaultDocumentId: string,
  persistVaultData: (updated: Partial<StoredVaultData>) => void,
  vaultStatus: KeyVaultStatus,
) {
  const vaultPolicy=normalizeVaultKeyPolicy(vaultData.keyPolicy ?? DEFAULT_VAULT_KEY_POLICY);
  const currentPolicy=()=>normalizeVaultBackupPolicy(vaultData.backupPolicy);
  const catalog=()=>vaultData.backupCatalog ?? [];
  const executeBackup=async(adapter:VaultBackupTargetAdapter,secrets:VaultBackupRuntimeSecrets,now:number):Promise<VaultBackupExecutionResult>=>{
    const policy=currentPolicy(); if(!policy.target)throw new Error('vault_backup_target_required');
    const base=policy.mode==='incremental'?latestBase(catalog(),policy.target.id):undefined;
    if(policy.mode==='incremental'&&!base)throw new Error('vault_backup_incremental_base_required');
    if(base && base.keyMode!==policy.keyMode)throw new Error('vault_backup_incremental_key_mode_changed');
    const bundle=await createVaultBackupBundle(documents,sourceVaultDocumentId,policy.mode,base,now);
    const bytes=await packVaultBackup(bundle,policy.keyMode,vaultPolicy,{pin:secrets.pin,password:secrets.vaultPassword},vaultStatus,secrets.independentPassword);
    const digest=await sha256Hex(bytes); const write=await adapter.write(backupFilename(bundle.id),bytes);
    const readBack=await adapter.read(write.locator); const verifiedBundle=await verifyReadBack(readBack,digest,policy.keyMode,vaultPolicy,vaultStatus,secrets);
    if(verifiedBundle.id!==bundle.id)throw new Error('vault_backup_verify_package_mismatch');
    const entry=backupCatalogEntryFromBundle(bundle,digest,bytes.byteLength,policy,write.locator,now);
    const next=[entry,...catalog().filter((item)=>item.id!==entry.id)]; const retention=applyVaultBackupRetention(next,policy,now);
    const pruned:string[]=[];
    /**
     * Der Katalogzustand **nach** der Aufbewahrung, aber **nur für dieses Ziel**. Andere Ziele behalten ihre
     * Einträge unberührt, weil `applyVaultBackupRetention` über den **gesamten** Katalog urteilt.
     */
    const catalogAfterRetention=()=>{
      const keptIds=new Set(retention.kept.map((item)=>item.id));
      return next.filter((item)=>keptIds.has(item.id)||item.targetId!==policy.target!.id);
    };
    /*
     * **V-038 — das Paket liegt schon im Ziel, also muss es in den Katalog.** Vorher stand hier:
     *   `adapter.write(...)` → `adapter.read(...)` → Katalog bauen → **Aufbewahrung löschen** → speichern.
     * Scheiterte das Löschen (`vault_backup_retention_delete_unavailable`, weil der Adapter kein `remove`
     * hat), flog der Fehler **vor** `persistVaultData`: das **neu geschriebene Paket lag im Ziel**, war aber
     * **nicht im Katalog**. Es war damit unsichtbar und für die Aufbewahrung unerreichbar — ein verwaistes
     * Backup, das bei jeder Wiederherstellung fehlt.
     *
     * Jetzt wird **zuerst** der Katalog mit dem neuen Eintrag gespeichert — der Schreibvorgang ist die
     * Tatsache, die zählt. Scheitert danach die Aufbewahrung, wird der **tatsächliche** Zustand persistiert
     * (neuer Eintrag drin, nichts gelöscht) und der Fehler danach **benannt** weitergegeben: der Nutzer
     * erfährt, dass die Aufbewahrung nicht griff, statt es an einem fehlenden Eintrag zu erraten.
     */
    persistVaultData({backupPolicy:policy,backupCatalog:next});
    try{
      for(const expired of retention.expired.filter((item)=>item.targetId===policy.target!.id)){if(!adapter.remove)throw new Error('vault_backup_retention_delete_unavailable');await adapter.remove(expired.targetLocator);pruned.push(expired.id);}
    }catch(error){
      // Der Katalog bleibt bei der Wahrheit: das neue Paket **ist** da, also bleibt es verzeichnet.
      persistVaultData({backupPolicy:policy,backupCatalog:next});
      throw error;
    }
    persistVaultData({backupPolicy:policy,backupCatalog:catalogAfterRetention()});
    return {entry,preview:await previewVaultBackupBundle(bundle),pruned};
  };
  return {
    updatePolicy(policy: Partial<VaultBackupPolicy>) { persistVaultData({backupPolicy:normalizeVaultBackupPolicy({...currentPolicy(),...policy})}); },
    createBackup(adapter:VaultBackupTargetAdapter,secrets:VaultBackupRuntimeSecrets,now=Date.now()){return executeBackup(adapter,secrets,now);},
    async runScheduledBackup(adapter:VaultBackupTargetAdapter,secrets:VaultBackupRuntimeSecrets,now=Date.now()){
      const policy=currentPolicy(); if(!policy.schedule?.enabled)throw new Error('vault_backup_schedule_disabled');if(!policy.target)throw new Error('vault_backup_target_required');
      if(policy.target.transport==='filesystem_access'&&!policy.target.hostTargetRef)throw new Error('vault_backup_schedule_host_target_ref_required');
      const last=latestBase(catalog(),policy.target.id)?.verifiedAt; if(!isVaultBackupScheduleDue(policy.schedule,last,now))throw new Error('vault_backup_schedule_not_due');
      return executeBackup(adapter,secrets,now);
    },
    async previewCatalogEntry(entryId:string, adapter:VaultBackupTargetAdapter, secrets:VaultBackupRuntimeSecrets):Promise<VaultBackupPreview>{
      const entry=catalog().find((item)=>item.id===entryId);if(!entry)throw new Error('vault_backup_catalog_entry_missing');
      const bundles=await loadCatalogChain(entry,catalog(),adapter,vaultPolicy,vaultStatus,secrets); const current=bundles.at(-1)!; const preview=await previewVaultBackupBundle(current);
      const materialized=await restoreVaultBackupChain(bundles); const vaultDoc=materialized.find((doc)=>doc.id===current.sourceVaultDocumentId);
      return {...preview,vaultFiles:(vaultDoc?.vaultData?.files??[]).map((file)=>({id:file.id,name:file.name,sizeBytes:file.sizeBytes,folderId:file.folderId}))};
    },
    async restoreCatalogEntry(entryId:string, adapter:VaultBackupTargetAdapter, secrets:VaultBackupRuntimeSecrets, selectedDocumentIds?:readonly string[]){
      const entry=catalog().find((item)=>item.id===entryId);if(!entry)throw new Error('vault_backup_catalog_entry_missing');const bundles=await loadCatalogChain(entry,catalog(),adapter,vaultPolicy,vaultStatus,secrets);return restoreVaultBackupChain(bundles,selectedDocumentIds);
    },
    async restoreSelectedFiles(entryId:string, adapter:VaultBackupTargetAdapter, secrets:VaultBackupRuntimeSecrets, currentVaultDocument:WorkspaceDocument, selectedFileIds:readonly string[], now=Date.now()){
      const entry=catalog().find((item)=>item.id===entryId);if(!entry)throw new Error('vault_backup_catalog_entry_missing');const bundles=await loadCatalogChain(entry,catalog(),adapter,vaultPolicy,vaultStatus,secrets);return restoreSelectedVaultFiles(bundles,currentVaultDocument,selectedFileIds,now);
    },
    async previewImported(bytes:Uint8Array,keyMode:VaultBackupKeyMode,secrets:VaultBackupRuntimeSecrets){const bundle=await unpackVaultBackup(bytes,keyMode,vaultPolicy,{pin:secrets.pin,password:secrets.vaultPassword},secrets.independentPassword);return previewVaultBackupBundle(bundle);},
    async restoreImportedChain(packages:readonly Uint8Array[],keyMode:VaultBackupKeyMode,secrets:VaultBackupRuntimeSecrets,selectedDocumentIds?:readonly string[]){const bundles=[];for(const bytes of packages)bundles.push(await unpackVaultBackup(bytes,keyMode,vaultPolicy,{pin:secrets.pin,password:secrets.vaultPassword},secrets.independentPassword));bundles.sort((a,b)=>a.createdAt-b.createdAt);return restoreVaultBackupChain(bundles,selectedDocumentIds);},
  };
}
