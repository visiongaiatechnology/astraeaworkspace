// STATUS: DIAMANT VGT SUPREME — bounded local Vault search index with lock/privacy enforcement.
import type { VaultFile, VaultFolder, VaultSearchIndexEntry, VaultSearchIndexModel, VaultSearchIndexPolicy, WorkspaceDocument } from '../../contracts/workspace';

export interface VaultSearchSpaceMetadata {
  id: string;
  documentIds?: readonly string[];
  sharedFolders?: readonly string[];
}

const MAX_INDEX_FILES = 10_000;
const MAX_CONTENT_CHARS_PER_FILE = 512_000;
const MAX_TOTAL_CONTENT_CHARS = 16_000_000;
const MAX_QUERY_CHARS = 512;
const MAX_RESULTS = 500;

export const DEFAULT_VAULT_SEARCH_POLICY: VaultSearchIndexPolicy = {
  version:1,
  contentIndexingEnabled:true,
  ocrIndexingEnabled:false,
  excludedFileIds:[],
  excludedFolderIds:[],
};

export interface VaultSearchAdapters {
  extractAttachmentText(file: VaultFile): Promise<string>;
  extractWorkspaceText(document: WorkspaceDocument): Promise<string>;
  extractOcrText?(file: VaultFile): Promise<string>;
}

export interface VaultSearchQuery {
  text?: string;
  type?: string;
  tags?: string[];
  owner?: string;
  spaceId?: string;
  modifiedAfter?: number;
  modifiedBefore?: number;
}

export interface VaultSearchResult {
  fileId: string;
  name: string;
  score: number;
  snippet: string;
  mimeType: string;
  kind: VaultSearchIndexEntry['kind'];
  privacyExcluded: boolean;
}

function uniq(values: readonly string[], max=256): string[] {
  return [...new Set(values.map((value)=>value.trim()).filter(Boolean))].slice(0,max);
}

export function normalizeVaultSearchPolicy(input?: Partial<VaultSearchIndexPolicy>): VaultSearchIndexPolicy {
  return {
    version:1,
    contentIndexingEnabled: input?.contentIndexingEnabled !== false,
    ocrIndexingEnabled: Boolean(input?.ocrIndexingEnabled),
    excludedFileIds: uniq(input?.excludedFileIds ?? [], MAX_INDEX_FILES),
    excludedFolderIds: uniq(input?.excludedFolderIds ?? [], MAX_INDEX_FILES),
  };
}

function folderExcluded(folderId: string | null | undefined, folders: readonly VaultFolder[], excluded: Set<string>): boolean {
  let current = folderId ?? null;
  const visited = new Set<string>();
  while (current) {
    if (excluded.has(current)) return true;
    if (visited.has(current)) return true;
    visited.add(current);
    current = folders.find((folder)=>folder.id===current)?.parentId ?? null;
  }
  return false;
}

function boundedText(value: string): string {
  return value.normalize('NFKC').replace(/\u0000/g,'').slice(0,MAX_CONTENT_CHARS_PER_FILE);
}

function fileSpaceIds(file: VaultFile, folders: readonly VaultFolder[], spaces: readonly VaultSearchSpaceMetadata[]): string[] {
  const ids = new Set(file.spaceIds ?? []);
  for (const space of spaces) {
    if (file.documentId && (space.documentIds ?? []).includes(file.documentId)) ids.add(space.id);
    const folder = file.folderId ? folders.find((candidate)=>candidate.id===file.folderId) : undefined;
    if (folder && (space.sharedFolders ?? []).some((name)=>name.localeCompare(folder.name,undefined,{sensitivity:'base'})===0)) ids.add(space.id);
  }
  return [...ids].slice(0,32);
}

export async function buildVaultSearchIndex(
  files: readonly VaultFile[],
  folders: readonly VaultFolder[],
  spaces: readonly VaultSearchSpaceMetadata[],
  documents: readonly WorkspaceDocument[],
  policyInput: Partial<VaultSearchIndexPolicy>|undefined,
  adapters: VaultSearchAdapters,
  now=Date.now(),
): Promise<VaultSearchIndexModel> {
  if (files.length > MAX_INDEX_FILES) throw new Error('vault_search_file_limit_exceeded');
  const policy = normalizeVaultSearchPolicy(policyInput);
  const excludedFiles = new Set(policy.excludedFileIds);
  const excludedFolders = new Set(policy.excludedFolderIds);
  const docs = new Map(documents.map((document)=>[document.id,document]));
  const entries: VaultSearchIndexEntry[] = [];
  let contentBudget = MAX_TOTAL_CONTENT_CHARS;
  for (const file of files) {
    const privacyExcluded = excludedFiles.has(file.id) || folderExcluded(file.folderId, folders, excludedFolders);
    let contentText = '';
    let ocrText = '';
    const contentAllowed = policy.contentIndexingEnabled && !privacyExcluded && file.status !== 'quarantined' && file.status !== 'corrupt' && file.status !== 'missing';
    if (contentAllowed) {
      if (file.sourceType === 'workspace-document' && file.documentId) {
        const document = docs.get(file.documentId);
        if (document) contentText = boundedText(await adapters.extractWorkspaceText(document));
      } else if (file.sourceType === 'attachment') {
        contentText = boundedText(await adapters.extractAttachmentText(file));
      }
      if (policy.ocrIndexingEnabled && adapters.extractOcrText) {
        try { ocrText = boundedText(await adapters.extractOcrText(file)); } catch { ocrText = ''; }
      }
      const combined = contentText.length + ocrText.length;
      if (combined > contentBudget) throw new Error('vault_search_content_budget_exceeded');
      contentBudget -= combined;
    }
    entries.push({
      fileId:file.id,indexedAt:now,name:file.name,mimeType:file.mimeType ?? 'application/octet-stream',kind:file.kind,
      modifiedAt:file.lastModified,owner:file.owner?.trim() || 'local-user',tags:uniq(file.tags ?? [],32),
      properties:Object.fromEntries(Object.entries(file.properties ?? {}).slice(0,64).map(([key,value])=>[key.slice(0,80),String(value).slice(0,512)])),
      spaceIds:fileSpaceIds(file,folders,spaces),folderId:file.folderId ?? null,contentText,ocrText,privacyExcluded,
      sourceDigest:file.contentDigest ?? file.encryptedHash,documentVersion:file.documentVersion,
    });
  }
  return { version:1,builtAt:now,protection:'vault_container_aead',entries };
}

function haystack(entry: VaultSearchIndexEntry): string {
  return [entry.name,entry.mimeType,entry.kind,entry.owner,...entry.tags,...Object.entries(entry.properties).flatMap(([key,value])=>[key,value]),entry.contentText,entry.ocrText].join('\n').normalize('NFKC').toLocaleLowerCase();
}

function snippetFor(entry: VaultSearchIndexEntry, term: string): string {
  if (!term || entry.privacyExcluded) return entry.privacyExcluded ? 'Content indexing disabled by privacy policy.' : '';
  const source = `${entry.contentText}\n${entry.ocrText}`.trim();
  if (!source) return '';
  const lower = source.toLocaleLowerCase();
  const index = lower.indexOf(term.toLocaleLowerCase());
  const start = Math.max(0,index<0?0:index-80);
  return source.slice(start,start+240).replace(/\s+/g,' ').trim();
}

export function searchVaultIndex(index: VaultSearchIndexModel|undefined, query: VaultSearchQuery, context:{unlocked:boolean}): VaultSearchResult[] {
  if (!context.unlocked) throw new Error('vault_search_locked');
  if (!index) return [];
  if (index.protection !== 'vault_container_aead') throw new Error('vault_search_index_unprotected');
  const text = (query.text ?? '').trim().normalize('NFKC').slice(0,MAX_QUERY_CHARS).toLocaleLowerCase();
  const terms = text.split(/\s+/).filter(Boolean).slice(0,16);
  const requiredTags = new Set((query.tags ?? []).map((tag)=>tag.trim().toLocaleLowerCase()).filter(Boolean));
  const results: VaultSearchResult[] = [];
  for (const entry of index.entries) {
    if (query.type && query.type !== 'all' && entry.kind.toLocaleLowerCase() !== query.type.toLocaleLowerCase() && entry.mimeType.toLocaleLowerCase() !== query.type.toLocaleLowerCase()) continue;
    if (query.owner && entry.owner !== query.owner) continue;
    if (query.spaceId && !entry.spaceIds.includes(query.spaceId)) continue;
    if (query.modifiedAfter !== undefined && entry.modifiedAt < query.modifiedAfter) continue;
    if (query.modifiedBefore !== undefined && entry.modifiedAt > query.modifiedBefore) continue;
    const tags = new Set(entry.tags.map((tag)=>tag.toLocaleLowerCase()));
    if ([...requiredTags].some((tag)=>!tags.has(tag))) continue;
    const source = haystack(entry);
    if (terms.some((term)=>!source.includes(term))) continue;
    let score = 0;
    for (const term of terms) {
      if (entry.name.toLocaleLowerCase().includes(term)) score += 20;
      if (entry.tags.some((tag)=>tag.toLocaleLowerCase().includes(term))) score += 10;
      if (entry.contentText.toLocaleLowerCase().includes(term)) score += 5;
      if (entry.ocrText.toLocaleLowerCase().includes(term)) score += 4;
    }
    results.push({fileId:entry.fileId,name:entry.name,score,snippet:snippetFor(entry,terms[0] ?? ''),mimeType:entry.mimeType,kind:entry.kind,privacyExcluded:entry.privacyExcluded});
  }
  return results.sort((a,b)=>b.score-a.score || a.name.localeCompare(b.name)).slice(0,MAX_RESULTS);
}

export function applyVaultSearchPrivacyPolicy(index:VaultSearchIndexModel|undefined,files:readonly VaultFile[],folders:readonly VaultFolder[],policyInput:Partial<VaultSearchIndexPolicy>|undefined):VaultSearchIndexModel|undefined{
  if(!index)return undefined;const policy=normalizeVaultSearchPolicy(policyInput);const excludedFiles=new Set(policy.excludedFileIds);const excludedFolders=new Set(policy.excludedFolderIds);
  return {...index,entries:index.entries.map((entry)=>{const file=files.find((candidate)=>candidate.id===entry.fileId);const privacyExcluded=!file||excludedFiles.has(entry.fileId)||folderExcluded(file.folderId,folders,excludedFolders)||!policy.contentIndexingEnabled;return {...entry,privacyExcluded,contentText:privacyExcluded?'':entry.contentText,ocrText:privacyExcluded||!policy.ocrIndexingEnabled?'':entry.ocrText};})};
}

export function vaultSearchIndexIsStale(index: VaultSearchIndexModel|undefined, files: readonly VaultFile[]): boolean {
  if (!index || index.entries.length !== files.length) return true;
  const byId = new Map(index.entries.map((entry)=>[entry.fileId,entry]));
  return files.some((file)=>{const entry=byId.get(file.id);return !entry || entry.modifiedAt!==file.lastModified || entry.sourceDigest!==(file.contentDigest ?? file.encryptedHash);});
}
