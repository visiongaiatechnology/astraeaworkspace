import type { NetworkCapability, VaultBackupTargetDefinition } from '../../contracts/workspace';
import { toOwnedArrayBuffer } from '../../binary/ownedBufferSource';
import { evaluateNetGatePolicy } from '../../../platform/operations/appContainerOps';
import { normalizeVaultBackupTarget } from './vaultBackupEngine';

export interface VaultBackupWriteResult { locator: string; }
export interface VaultBackupTargetAdapter {
  write(filename: string, bytes: Uint8Array): Promise<VaultBackupWriteResult>;
  read(locator: string): Promise<Uint8Array>;
  remove?(locator: string): Promise<void>;
}

interface WritableLike { write(data: Blob | Uint8Array | ArrayBuffer): Promise<void>; close(): Promise<void>; }
interface FileHandleLike { createWritable(): Promise<WritableLike>; getFile(): Promise<File>; }
export interface DirectoryHandleLike { getFileHandle(name: string, options?: {create?: boolean}): Promise<FileHandleLike>; removeEntry?(name:string):Promise<void>; }

function safeFilename(name: string): string {
  const value = name.replace(/[^A-Za-z0-9._-]/g,'_').slice(0,180);
  if (!value || value === '.' || value === '..') throw new Error('vault_backup_filename_invalid');
  return value;
}

export function createDirectoryBackupAdapter(directory: DirectoryHandleLike): VaultBackupTargetAdapter {
  return {
    async write(filename, bytes) {
      const name=safeFilename(filename); const handle=await directory.getFileHandle(name,{create:true}); const writer=await handle.createWritable();
      try { await writer.write(bytes); } finally { await writer.close(); }
      return {locator:name};
    },
    async read(locator) { const handle=await directory.getFileHandle(safeFilename(locator)); const file=await handle.getFile(); return new Uint8Array(await file.arrayBuffer()); },
    async remove(locator) { if (!directory.removeEntry) throw new Error('vault_backup_target_delete_unavailable'); await directory.removeEntry(safeFilename(locator)); },
  };
}

export interface WebDavRuntimeCredentials { password?: string | null; }

function authHeader(username?: string, password?: string | null): Record<string,string> {
  if (!username && !password) return {};
  if (!username || !password) throw new Error('vault_backup_webdav_credentials_incomplete');
  return {Authorization:`Basic ${btoa(`${username}:${password}`)}`};
}

export function createWebDavBackupAdapter(
  targetInput: VaultBackupTargetDefinition,
  networkCapability: NetworkCapability,
  credentials: WebDavRuntimeCredentials,
  sovereignTransport?: typeof fetch,
): VaultBackupTargetAdapter {
  const target=normalizeVaultBackupTarget(targetInput);
  if (target.transport!=='webdav_https'||!target.endpointUrl) throw new Error('vault_backup_webdav_target_required');
  const base=new URL(target.endpointUrl); if(base.protocol!=='https:'||base.username||base.password||base.hash)throw new Error('vault_backup_target_url_invalid'); if (!base.pathname.endsWith('/')) base.pathname += '/';
  const authorize=async(method:'GET'|'PUT'|'DELETE',requestBytes=0,responseBytes=64*1024)=>{const {entry}=await evaluateNetGatePolicy(base.hostname,networkCapability,'STANDARD',{componentId:'vault-webdav-backup',purpose:'User-configured encrypted Vault WebDAV backup',method,expectedRequestBytes:requestBytes,expectedResponseBytes:responseBytes,timeoutMs:15_000});if(entry.verdict!=='Allowed')throw new Error('vault_backup_netgate_denied');if(!sovereignTransport)throw new Error('vault_backup_sovereign_transport_required');};
  const urlFor=(locator:string)=>new URL(safeFilename(locator),base).toString();
  const headers=()=>({...authHeader(target.username,credentials.password),'Cache-Control':'no-store'});
  return {
    async write(filename,bytes){await authorize('PUT',bytes.byteLength,16*1024);const name=safeFilename(filename);const response=await sovereignTransport!(urlFor(name),{method:'PUT',headers:{...headers(),'Content-Type':'application/octet-stream'},body:toOwnedArrayBuffer(bytes)});if(!response.ok)throw new Error(`vault_backup_webdav_write_http_${response.status}`);return{locator:name};},
    async read(locator){await authorize('GET',0,256*1024*1024);const response=await sovereignTransport!(urlFor(locator),{method:'GET',headers:headers(),cache:'no-store'});if(!response.ok)throw new Error(`vault_backup_webdav_read_http_${response.status}`);return new Uint8Array(await response.arrayBuffer());},
    async remove(locator){await authorize('DELETE',0,16*1024);const response=await sovereignTransport!(urlFor(locator),{method:'DELETE',headers:headers()});if(!response.ok&&response.status!==404)throw new Error(`vault_backup_webdav_delete_http_${response.status}`);},
  };
}
