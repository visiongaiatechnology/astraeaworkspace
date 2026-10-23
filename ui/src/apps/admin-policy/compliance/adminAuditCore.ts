// STATUS: DIAMANT VGT SUPREME — tamper-evident content-minimized privileged audit chain
import type{AdminAuditEvent,AuditPolicy}from'../model/types';
import{invokeNative,isNativeDesktop}from'../../../platform/native/nativeBridge';
const E=new TextEncoder(),ZERO='0'.repeat(64),MAX_TEXT=192;
async function sha256Hex(text:string){const d=new Uint8Array(await crypto.subtle.digest('SHA-256',E.encode(text)));return Array.from(d,b=>b.toString(16).padStart(2,'0')).join('');}
const safe=(v:string,n=MAX_TEXT)=>v.replace(/[\r\n\t]/g,' ').trim().slice(0,n);
function canonical(e:Omit<AdminAuditEvent,'hash'>){return JSON.stringify([e.sequence,e.at,e.actor,e.action,e.objectClass,e.objectId??'',e.result,e.detailCode??'',e.previousHash]);}
export async function appendAuditEvent(policy:AuditPolicy,input:Omit<AdminAuditEvent,'sequence'|'previousHash'|'hash'>):Promise<AuditPolicy>{const cap=Math.max(100,Math.min(200_000,policy.maxEvents));if(policy.events.length>=cap)throw new Error('admin-audit-append-only-capacity');const prev=policy.events.at(-1),sequence=(prev?.sequence??policy.clock.lastSequence)+1,previousHash=prev?.hash??ZERO;const at=Math.trunc(input.at);const backward=policy.clock.lastObservedAt!==undefined&&at<policy.clock.lastObservedAt;const base:Omit<AdminAuditEvent,'hash'>={sequence,at,actor:safe(input.actor),action:safe(input.action),objectClass:safe(input.objectClass),objectId:input.objectId?safe(input.objectId):undefined,result:input.result,detailCode:input.detailCode?safe(input.detailCode,256):undefined,previousHash};const event:AdminAuditEvent={...base,hash:await sha256Hex(canonical(base))};return{...policy,events:[...policy.events,event],clock:{lastObservedAt:at,lastSequence:sequence,backwardSkewCount:policy.clock.backwardSkewCount+(backward?1:0)}};}
export async function verifyAuditTrail(policy:AuditPolicy):Promise<{ok:boolean;reason:string;lastSequence:number}>{let prev=ZERO,seq=policy.events[0]?.sequence??1;for(const e of policy.events){if(e.sequence!==seq||e.previousHash!==prev)return{ok:false,reason:'sequence-or-link-mismatch',lastSequence:e.sequence};const{hash,...base}=e;if(await sha256Hex(canonical(base))!==hash)return{ok:false,reason:'event-hash-mismatch',lastSequence:e.sequence};prev=hash;seq++;}return{ok:true,reason:policy.clock.backwardSkewCount?'ok-with-clock-skew-observed':'ok',lastSequence:policy.events.at(-1)?.sequence??policy.clock.lastSequence};}
export function queryAudit(policy:AuditPolicy,q:{actor?:string;action?:string;objectClass?:string;result?:AdminAuditEvent['result'];from?:number;to?:number},limit=1000):AdminAuditEvent[]{return policy.events.filter(e=>(!q.actor||e.actor===q.actor)&&(!q.action||e.action===q.action)&&(!q.objectClass||e.objectClass===q.objectClass)&&(!q.result||e.result===q.result)&&(q.from===undefined||e.at>=q.from)&&(q.to===undefined||e.at<=q.to)).slice(-Math.max(1,Math.min(5000,limit)));}
export function exportAuditNdjson(policy:AuditPolicy,events:readonly AdminAuditEvent[]):string{const allowed=new Set(policy.events.map(e=>e.hash));return events.filter(e=>allowed.has(e.hash)).map(e=>JSON.stringify(e)).join('\n')+'\n';}
export function assertAuditInputContainsNoContent(input:Record<string,unknown>):void{const forbidden=['body','content','secret','password','token','plaintext','clipboard'];for(const k of Object.keys(input))if(forbidden.some(f=>k.toLowerCase().includes(f)))throw new Error('admin-audit-content-disclosure-denied');}

export interface NativeKeyVaultAuditRecord {
  version:number;sequence:number;event_id:string;timestamp_unix:number;document_id_digest_blake3:number[];
  action:string;slot_type?:string|null;slot_id?:number|null;success:boolean;result_code:string;
  previous_hmac_sha256:number[];hmac_sha256:number[];
}
export interface NativeKeyVaultAuditSnapshot {
  version:number;anchor_hmac_sha256:number[];terminal_sequence:number;terminal_hmac_sha256:number[];records:NativeKeyVaultAuditRecord[];
}
export async function loadNativeKeyVaultAuditSnapshot():Promise<NativeKeyVaultAuditSnapshot>{
  if(!isNativeDesktop())throw new Error('KEYVAULT_AUDIT_REQUIRES_NATIVE');
  return invokeNative<NativeKeyVaultAuditSnapshot>('vgt_keyvault_audit_snapshot');
}
export async function verifyNativeKeyVaultAuditSnapshot(snapshot:NativeKeyVaultAuditSnapshot):Promise<boolean>{
  if(!isNativeDesktop())return false;
  return invokeNative<boolean>('vgt_keyvault_audit_verify',{snapshot});
}

