// STATUS: DIAMANT VGT SUPREME — authenticated encrypted .vinsight native interchange
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import type { InsightDocumentModel } from '../domain/types';
import { packLocalEncryptedContainer, unpackLocalEncryptedContainer } from '../../../platform/containers/container';
import { InsightError, migrateInsightModel, normalizeInsightModel } from '../core/insightCore';
export const INSIGHT_NATIVE_LIMITS={maxBytes:128*1024*1024} as const;
export interface InsightNativeOptions { password?:string; pin?:string; }
function assertDoc(doc:WorkspaceDocument):asserts doc is WorkspaceDocument&{insightData:InsightDocumentModel}{if(doc.kind!=='Insight'||!doc.insightData)throw new InsightError('native-insight-payload-missing');normalizeInsightModel(doc.insightData as InsightDocumentModel);}
function assertEncrypted(bytes:Uint8Array){const m=new TextDecoder().decode(bytes.subarray(0,4));if(!['VGT2','VGT3','VGT4','VGT5'].includes(m))throw new InsightError('native-unencrypted-container');}
export async function packNativeInsight(doc:WorkspaceDocument,options:InsightNativeOptions={}):Promise<Uint8Array>{assertDoc(doc);const bytes=await packLocalEncryptedContainer(doc,options);if(bytes.length<16||bytes.length>INSIGHT_NATIVE_LIMITS.maxBytes)throw new InsightError('native-size-limit');assertEncrypted(bytes);return bytes;}
export async function unpackNativeInsight(bytes:Uint8Array,options:InsightNativeOptions={}):Promise<WorkspaceDocument>{if(bytes.length<16||bytes.length>INSIGHT_NATIVE_LIMITS.maxBytes)throw new InsightError('native-size-limit');assertEncrypted(bytes);const doc=await unpackLocalEncryptedContainer(bytes,options);assertDoc(doc);return doc;}

/**
 * BATCH-INSIGHT-4 — the Save/Close/Reopen evidence every WOM point was missing.
 * `packInsightDocument` writes the open document into an authenticated encrypted container;
 * `reopenInsightDocument` reads it back and returns the payload; `compareInsightModels` states whether
 * the reopened payload is byte-for-byte the same document content, and names the first differing
 * top-level field instead of claiming success.
 */
export function packInsightDocument(document:WorkspaceDocument,model:InsightDocumentModel,options:InsightNativeOptions={}):Promise<Uint8Array>{
  return packNativeInsight({...document,insightData:model},options);
}

export interface InsightReopenResult { document:WorkspaceDocument; model:InsightDocumentModel; }
export async function reopenInsightDocument(bytes:Uint8Array,options:InsightNativeOptions={}):Promise<InsightReopenResult>{
  const document=await unpackNativeInsight(bytes,options);
  const model=migrateInsightModel(document.insightData);
  return{document,model};
}

/** Canonical JSON: object keys are sorted so a key order difference is not reported as a data change. */
function canonicalJson(value:unknown):string{
  if(value===null||typeof value!=='object')return JSON.stringify(value??null);
  if(Array.isArray(value))return`[${value.map(canonicalJson).join(',')}]`;
  const entries=Object.entries(value as Record<string,unknown>).filter(([,entry])=>entry!==undefined).sort(([a],[b])=>a<b?-1:a>b?1:0);
  return`{${entries.map(([key,entry])=>`${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`;
}

export interface InsightModelIdentity { identical:boolean; difference?:string; }
/**
 * Compare the payload before and after an encrypted Save/Reopen round trip. A difference is named by
 * the first top-level field that differs, so a failed round trip cannot be reported as a success.
 */
export function compareInsightModels(original:InsightDocumentModel,reopened:InsightDocumentModel):InsightModelIdentity{
  const before=normalizeInsightModel(original);
  const after=normalizeInsightModel(reopened);
  const fields=[...new Set([...Object.keys(before),...Object.keys(after)])].sort();
  for(const field of fields){
    const left=canonicalJson((before as unknown as Record<string,unknown>)[field]);
    const right=canonicalJson((after as unknown as Record<string,unknown>)[field]);
    if(left!==right)return{identical:false,difference:field};
  }
  return{identical:true};
}
