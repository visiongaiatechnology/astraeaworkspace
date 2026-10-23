// STATUS: DIAMANT VGT SUPREME — event-driven encrypted-index administration/privacy policy.
import type { DocumentKind, WorkspaceDocument } from '../../shared/contracts/workspace';
import type { SearchAdminPolicy, SearchDerivedField, SearchHealthState } from './searchTypes';

const ALL_INDEXED:DocumentKind[]=['Writer','Grid','Present','Notes','PdfStudio','Draw','Whiteboard','Forms','Database','Tasks','Planner','Projects','Vault','Spaces','Connect','Insight','Publish','Automate'];
const MAX_DERIVED_BYTES=8*1024*1024,MAX_DERIVED_FIELDS=256,MAX_CONNECTORS=64;
export const DEFAULT_SEARCH_POLICY:SearchAdminPolicy={schema:'vgt.search.policy/1',enabledModules:[...ALL_INDEXED],excludedDocumentIds:[],excludedSpaces:[],maxEncryptedIndexBytes:512*1024*1024,maxHistoryEntries:128,historyEnabled:false,semanticRankingEnabled:false,localOcrEnabled:false,transcription:{enabled:false,provider:'local'},externalConnectorIndexing:{enabled:false,allowedConnectorIds:[]}};

function uniq(values: readonly string[], max: number): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, max);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function policyStringList(
  value: unknown,
  fallback: readonly string[],
  maximum: number,
  field: string,
): string[] {
  if (value === undefined) return uniq(fallback, maximum);
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`Search policy ${field} invalid`);
  }
  return uniq(value as string[], maximum);
}

function policyBoolean(value: unknown, fallback: boolean, field: string): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') throw new Error(`Search policy ${field} invalid`);
  return value;
}

function policyInteger(value: unknown, fallback: number, field: string): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Search policy ${field} invalid`);
  }
  return Math.floor(value);
}

export function normalizeSearchPolicy(input: Partial<SearchAdminPolicy>): SearchAdminPolicy {
  if (!isRecord(input)) throw new Error('Search policy input invalid');
  const raw = input;
  const moduleNames = policyStringList(
    raw.enabledModules,
    DEFAULT_SEARCH_POLICY.enabledModules,
    ALL_INDEXED.length,
    'enabledModules',
  );
  const modules = moduleNames.filter((kind): kind is DocumentKind =>
    ALL_INDEXED.includes(kind as DocumentKind),
  );
  const maxEncryptedIndexBytes = policyInteger(
    raw.maxEncryptedIndexBytes,
    DEFAULT_SEARCH_POLICY.maxEncryptedIndexBytes,
    'maxEncryptedIndexBytes',
  );
  const maxHistoryEntries = policyInteger(
    raw.maxHistoryEntries,
    DEFAULT_SEARCH_POLICY.maxHistoryEntries,
    'maxHistoryEntries',
  );
  if (maxEncryptedIndexBytes < 1024 * 1024 || maxEncryptedIndexBytes > 8 * 1024 * 1024 * 1024) {
    throw new Error('Search index quota outside supported boundary');
  }
  if (maxHistoryEntries < 0 || maxHistoryEntries > 256) {
    throw new Error('Search history quota outside supported boundary');
  }

  const transcriptionValue = raw.transcription ?? DEFAULT_SEARCH_POLICY.transcription;
  if (!isRecord(transcriptionValue)) throw new Error('Search policy transcription invalid');
  const provider = transcriptionValue.provider ?? DEFAULT_SEARCH_POLICY.transcription.provider;
  if (provider !== 'local' && provider !== 'configured-provider') {
    throw new Error('Search policy transcription provider invalid');
  }
  const connectorId = transcriptionValue.connectorId;
  if (connectorId !== undefined && typeof connectorId !== 'string') {
    throw new Error('Search policy transcription connector invalid');
  }
  if (
    provider === 'configured-provider' &&
    (!connectorId || !/^[A-Za-z0-9._:@-]{1,128}$/.test(connectorId))
  ) {
    throw new Error('Configured transcription requires bounded connector id');
  }

  const externalValue = raw.externalConnectorIndexing ?? DEFAULT_SEARCH_POLICY.externalConnectorIndexing;
  if (!isRecord(externalValue)) throw new Error('Search policy external connector settings invalid');

  return {
    schema: 'vgt.search.policy/1',
    enabledModules: [...new Set(modules)],
    excludedDocumentIds: policyStringList(raw.excludedDocumentIds, [], 10_000, 'excludedDocumentIds'),
    excludedSpaces: policyStringList(raw.excludedSpaces, [], 10_000, 'excludedSpaces'),
    maxEncryptedIndexBytes,
    maxHistoryEntries,
    historyEnabled: policyBoolean(raw.historyEnabled, false, 'historyEnabled'),
    semanticRankingEnabled: policyBoolean(raw.semanticRankingEnabled, false, 'semanticRankingEnabled'),
    localOcrEnabled: policyBoolean(raw.localOcrEnabled, false, 'localOcrEnabled'),
    transcription: {
      enabled: policyBoolean(transcriptionValue.enabled, false, 'transcription.enabled'),
      provider,
      connectorId: provider === 'configured-provider' ? connectorId : undefined,
    },
    externalConnectorIndexing: {
      enabled: policyBoolean(externalValue.enabled, false, 'externalConnectorIndexing.enabled'),
      allowedConnectorIds: policyStringList(
        externalValue.allowedConnectorIds,
        [],
        MAX_CONNECTORS,
        'externalConnectorIndexing.allowedConnectorIds',
      ),
    },
  };
}

export function documentAllowedBySearchPolicy(document:WorkspaceDocument,policy:SearchAdminPolicy):boolean{if(!policy.enabledModules.includes(document.kind)||policy.excludedDocumentIds.includes(document.id))return false;const raw=document as WorkspaceDocument&{spaceIds?:unknown;spaces?:unknown};const spaces=Array.isArray(raw.spaceIds)?raw.spaceIds:Array.isArray(raw.spaces)?raw.spaces:[];return!spaces.some(id=>typeof id==='string'&&policy.excludedSpaces.includes(id));}

export type SearchIndexEvent={kind:'upsert'|'delete'|'permission-revoked'|'derived-updated';documentId:string;documentVersion?:number;at:number};
export interface SearchIndexJournal{generation:number;events:SearchIndexEvent[];checkpointEvery:number;}
export function createSearchIndexJournal(checkpointEvery=256):SearchIndexJournal{if(checkpointEvery<16||checkpointEvery>4096)throw new Error('Invalid search checkpoint cadence');return{generation:0,events:[],checkpointEvery};}
export function appendSearchIndexEvent(journal:SearchIndexJournal,event:SearchIndexEvent):SearchIndexJournal{if(!/^[A-Za-z0-9._:@-]{1,256}$/.test(event.documentId))throw new Error('Unsafe search document id');const events=[...journal.events,event].slice(-4096);return{...journal,generation:journal.generation+1,events};}
export function shouldCheckpointSearchIndex(journal:SearchIndexJournal):boolean{return journal.events.length>0&&journal.events.length%journal.checkpointEvery===0;}

export function validateDerivedSearchField(field:SearchDerivedField,policy:SearchAdminPolicy):SearchDerivedField{
 if(field.kind==='ocr'&&!policy.localOcrEnabled)throw new Error('Local OCR is disabled by Search policy');if(field.kind==='transcript'&&!policy.transcription.enabled)throw new Error('Transcription indexing is disabled by Search policy');if(field.text.length>MAX_DERIVED_BYTES)throw new Error('Derived search text exceeds byte boundary');if(field.confidence!==undefined&&(!Number.isFinite(field.confidence)||field.confidence<0||field.confidence>1))throw new Error('Derived search confidence outside 0..1');if(!field.sourceId||field.sourceId.length>256||!field.provenance||field.provenance.length>1024)throw new Error('Derived search provenance is invalid');if(field.provider==='configured-provider'&&policy.transcription.provider!=='configured-provider')throw new Error('Remote-derived transcript not authorized by policy');return{...field,text:field.text.slice(0,MAX_DERIVED_BYTES),provenance:field.provenance.slice(0,1024)};
}
export function deleteDerivedContent(fields:readonly SearchDerivedField[],sourceId?:string):SearchDerivedField[]{if(sourceId===undefined)return[];return fields.filter(field=>field.sourceId!==sourceId).slice(0,MAX_DERIVED_FIELDS);}

export function searchHealth(input:Partial<SearchHealthState>):SearchHealthState{return{phase:input.phase??'idle',generation:Math.max(0,Math.floor(input.generation??0)),indexedDocuments:Math.max(0,Math.floor(input.indexedDocuments??0)),encryptedIndexBytes:Math.max(0,Math.floor(input.encryptedIndexBytes??0)),lastCheckpointAt:input.lastCheckpointAt,lastRebuildAt:input.lastRebuildAt,excludedDocuments:Math.max(0,Math.floor(input.excludedDocuments??0)),detail:(input.detail??'Local encrypted index ready').slice(0,512)};}
export function assertSearchQuota(health:SearchHealthState,policy:SearchAdminPolicy):void{if(health.encryptedIndexBytes>policy.maxEncryptedIndexBytes)throw new Error('Encrypted Search index quota exceeded');}
export function externalConnectorIndexAllowed(connectorId:string,policy:SearchAdminPolicy):boolean{return policy.externalConnectorIndexing.enabled&&policy.externalConnectorIndexing.allowedConnectorIds.includes(connectorId);}
