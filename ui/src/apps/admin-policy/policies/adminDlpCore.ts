// STATUS: DIAMANT VGT SUPREME — authoritative bounded DLP classification and enforcement decisions
import type{AdminPolicyModel,DlpAction,DlpOperation,DlpPolicy,DlpRule,SensitivityLabel}from'../model/types';
import{assertCanonicalReferences,referenceListMatchesId}from'../model/adminCanonicalReferenceCore';
import{LinearPattern}from'../../../shared/patterns/linearPattern';
import{appendAuditEvent}from'../compliance/adminAuditCore';
import{requireAdminCapability}from'../security/adminRbacCore';
const ORDER:SensitivityLabel[]=['public','internal','confidential','restricted','top-secret'];const MAX_RULES=2048,MAX_MATCHERS=32;
export const DLP_ACTIONS:readonly DlpAction[]=['audit','warn-justify','block','require-recipient-encryption','require-approved-space'];
/** EINE Liste der Stufen und Operationen — Oberfläche und Auswertung lesen dieselbe. */
export const SENSITIVITY_LABELS:readonly SensitivityLabel[]=[...ORDER];
export const DLP_OPERATIONS:readonly DlpOperation[]=['copy','export','print','share','clipboard','connector'];
export const MAX_DLP_RULES=MAX_RULES;
const DLP_ACTION_SET:ReadonlySet<string>=new Set(DLP_ACTIONS);
export function isDlpAction(value:string):value is DlpAction{return DLP_ACTION_SET.has(value);}
export interface DlpSubject{objectId:string;label:SensitivityLabel;metadata:Record<string,string>;content?:string;spaceId?:string;}
export interface DlpContext{operation:DlpOperation;destinationKind:string;destinationId?:string;recipientEncrypted?:boolean;justification?:string;}
export interface DlpDecision{action:DlpAction;ruleId?:string;allowed:boolean;requiresJustification:boolean;reason:string;}

export type BuiltinDlpFindingKind='credit-card'|'iban'|'social-security-number'|'api-key'|'password';
export interface BuiltinDlpFinding{kind:BuiltinDlpFindingKind;offset:number;length:number;fingerprint:string;}
const OUTBOUND_DLP_OPS:ReadonlySet<DlpOperation>=new Set(['export','print','share','clipboard','connector']);
const AWS_KEY=/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g;
const GENERIC_API_KEY=/\b(?:api[_-]?key|access[_-]?key|client[_-]?secret)\s*[:=]\s*[A-Za-z0-9_\-/.+=]{16,}\b/gi;
const PASSWORD=/\b(?:password|passwort|passwd|pwd)\s*[:=]\s*[^\s,;]{6,}/gi;
const US_SSN=/\b\d{3}-\d{2}-\d{4}\b/g;
const DE_SSN=/\b\d{2}[0-3]\d[01]\d\d{2}[A-Z]\d{3}\b/g;
const IBAN=/\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]){11,30}\b/g;
const CARD=/(?:^|[^0-9])((?:\d[ -]?){12,18}\d)(?![0-9])/g;
function fnv1a64(v:string):string{let h=0xcbf29ce484222325n;for(const c of new TextEncoder().encode(v)){h^=BigInt(c);h=BigInt.asUintN(64,h*0x100000001b3n);}return h.toString(16).padStart(16,'0');}
function luhn(v:string):boolean{const d=v.replace(/\D/g,'');if(d.length<13||d.length>19)return false;let sum=0,alt=false;for(let i=d.length-1;i>=0;i--){let n=d.charCodeAt(i)-48;if(alt&&(n*=2)>9)n-=9;sum+=n;alt=!alt;}return sum%10===0;}
function ibanValid(v:string):boolean{const s=v.replace(/\s/g,'').toUpperCase();if(s.length<15||s.length>34||!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(s))return false;const r=s.slice(4)+s.slice(0,4);let mod=0;for(const ch of r){const part=ch>='A'?String(ch.charCodeAt(0)-55):ch;for(const digit of part)mod=(mod*10+(digit.charCodeAt(0)-48))%97;}return mod===1;}
function addMatches(out:BuiltinDlpFinding[],kind:BuiltinDlpFindingKind,text:string,re:RegExp,validate?:(v:string)=>boolean){re.lastIndex=0;for(let m;(m=re.exec(text));){const raw=m[1]??m[0];const offset=m.index+(m[1]?m[0].indexOf(m[1]):0);if(!validate||validate(raw))out.push({kind,offset,length:raw.length,fingerprint:fnv1a64(`${kind}:${raw}`)});if(out.length>=64)return;}}
export function scanBuiltinSensitiveContent(content:string,maxChars=1_000_000):BuiltinDlpFinding[]{const text=content.slice(0,Math.max(1,Math.min(4_000_000,maxChars))),out:BuiltinDlpFinding[]=[];addMatches(out,'api-key',text,AWS_KEY);addMatches(out,'api-key',text,GENERIC_API_KEY);addMatches(out,'password',text,PASSWORD);addMatches(out,'social-security-number',text,US_SSN);addMatches(out,'social-security-number',text,DE_SSN);addMatches(out,'iban',text,IBAN,ibanValid);addMatches(out,'credit-card',text,CARD,luhn);return out.sort((a,b)=>a.offset-b.offset||a.kind.localeCompare(b.kind)).slice(0,64);}
function compileDlpPattern(pattern:string,maxChars:number):LinearPattern{if(pattern.length>256)throw new Error('admin-dlp-pattern-limit');try{return new LinearPattern(pattern,{caseInsensitive:true,limits:{maxPatternLength:256,maxInputLength:maxChars,maxStates:2048,maxMatches:1000,maxRepeat:128}});}catch{throw new Error('admin-dlp-regex-unsafe');}}
function safeRegexPattern(pattern:string):boolean{try{compileDlpPattern(pattern,4096);return true;}catch{return false;}}
function matcher(rule:DlpRule,subject:DlpSubject,maxChars:number):boolean{if(rule.labels.length&&!rule.labels.includes(subject.label))return false;if(rule.metadataMatchers.length>MAX_MATCHERS||rule.contentMatchers.length>MAX_MATCHERS)throw new Error('admin-dlp-matcher-limit');for(const m of rule.metadataMatchers)if((subject.metadata[m.field]??'')!==m.equals)return false;if(rule.contentMatchers.length){const content=(subject.content??'').slice(0,maxChars);for(const m of rule.contentMatchers){if(m.pattern.length>256)throw new Error('admin-dlp-pattern-limit');if(m.kind==='literal'){if(!content.includes(m.pattern))return false;}else if(!compileDlpPattern(m.pattern,maxChars).test(content))return false;}}return true;}
export interface DlpRuleSelection{rule?:DlpRule;matchingRuleIds:string[];conflict:boolean;}
/**
 * EINE Definition, welche Regel eine Operation entscheidet.
 *
 * **Befund:** `evaluateDlp` nahm stillschweigend die **erste** passende Regel (`find`). Bei zwei
 * kollidierenden Regeln war das Ergebnis zwar deterministisch, aber **unsichtbar**: die Oberfläche konnte
 * keinen Konflikt anzeigen, weil niemand die Kandidaten kannte. Diese Funktion liefert die Kandidaten
 * mit; die Auswahl bleibt exakt dieselbe wie vorher (erste passende in Dokumentreihenfolge), damit
 * bestehende Dokumente ihre Bedeutung nicht ändern.
 */
export function selectDlpRule(policyInput:DlpPolicy,subject:DlpSubject,ctx:DlpContext):DlpRuleSelection{const policy=normalizeDlpPolicy(policyInput);const matchingRuleIds=policy.rules.filter(r=>r.enabled&&r.operations.includes(ctx.operation)&&(r.destinationKinds.length===0||r.destinationKinds.includes(ctx.destinationKind))&&matcher(r,subject,policy.maxScanChars)).map(r=>r.id);return{rule:matchingRuleIds.length?policy.rules.find(r=>r.id===matchingRuleIds[0]):undefined,matchingRuleIds,conflict:matchingRuleIds.length>1};}
export function normalizeDlpPolicy(p:DlpPolicy):DlpPolicy{if(p.rules.length>MAX_RULES)throw new Error('admin-dlp-rule-limit');for(const r of p.rules)if(r.approvedSpaceIds)assertCanonicalReferences(r.approvedSpaceIds,'space');return{...p,maxScanChars:Math.max(4096,Math.min(4_000_000,Math.trunc(p.maxScanChars))),rules:p.rules.map(r=>({...r,id:r.id.trim().slice(0,128),labels:[...new Set(r.labels)],operations:[...new Set(r.operations)],destinationKinds:[...new Set(r.destinationKinds.map(x=>x.trim().slice(0,96)))],metadataMatchers:r.metadataMatchers.slice(0,MAX_MATCHERS),contentMatchers:r.contentMatchers.slice(0,MAX_MATCHERS).map(m=>{const pattern=m.pattern.slice(0,256);if(m.kind==='regex'&&!safeRegexPattern(pattern))throw new Error('admin-dlp-regex-unsafe');return{...m,pattern,maxMatches:Math.max(1,Math.min(1000,Math.trunc(m.maxMatches)))}}),approvedSpaceIds:r.approvedSpaceIds?.slice(0,256)}))};}
export async function updateDlpDefaultAction(model:AdminPolicyModel,action:DlpAction,actor='local-owner',now=Date.now()):Promise<AdminPolicyModel>{requireAdminCapability(model,actor,'policy.write',{kind:'organization',id:model.organization.id},now);if(!isDlpAction(action))throw new Error('admin-dlp-action-invalid');if(action===model.dlp.defaultAction)return model;const audit=await appendAuditEvent(model.audit,{at:now,actor,action:'dlp.default-action.update',objectClass:'dlp-policy',objectId:model.organization.id,result:'change',detailCode:`DLP_DEFAULT_${action.toUpperCase().replaceAll('-','_')}`});return{...model,dlp:{...model.dlp,defaultAction:action},audit,updatedAt:now};}
export async function upsertDlpRule(model:AdminPolicyModel,rule:DlpRule,actor='local-owner',now=Date.now()):Promise<AdminPolicyModel>{requireAdminCapability(model,actor,'dlp.manage',{kind:'organization',id:model.organization.id},now);const id=rule.id.trim().slice(0,128);if(!id)throw new Error('admin-dlp-rule-id-required');const next=normalizeDlpPolicy({...model.dlp,rules:[...model.dlp.rules.filter(r=>r.id!==id),{...rule,id}]});const audit=await appendAuditEvent(model.audit,{at:now,actor,action:'dlp.rule.upsert',objectClass:'dlp-policy',objectId:id,result:'change',detailCode:`DLP_RULE_${next.rules.length}`});return{...model,dlp:next,audit,updatedAt:now};}
export async function removeDlpRule(model:AdminPolicyModel,ruleId:string,actor='local-owner',now=Date.now()):Promise<AdminPolicyModel>{requireAdminCapability(model,actor,'dlp.manage',{kind:'organization',id:model.organization.id},now);const id=ruleId.trim().slice(0,128);if(!model.dlp.rules.some(r=>r.id===id))throw new Error('admin-dlp-rule-missing');const audit=await appendAuditEvent(model.audit,{at:now,actor,action:'dlp.rule.remove',objectClass:'dlp-policy',objectId:id,result:'change',detailCode:'DLP_RULE_REMOVED'});return{...model,dlp:{...model.dlp,rules:model.dlp.rules.filter(r=>r.id!==id)},audit,updatedAt:now};}
/**
 * Vorschau = die **echte** Entscheidung, nicht eine entschärfte.
 *
 * **Befund (gemessen):** die Oberfläche rief `evaluateDlp(..., simulate=true)`. Simulation setzt
 * `allowed` **immer** auf `true` und stellt `simulation:` vor den Grund. Für eine Vorschau, die
 * „Regel für sensible Daten erstellen, Testinhalt prüfen und Ergebnis erklären" erfüllen soll, ist das
 * die falsche Aussage: sie zeigt „erlaubt" für einen Export, den dieselbe Regel blockiert. Die Vorschau
 * liefert deshalb dieselbe Autoritätsentscheidung wie die Durchsetzung, plus die gefundenen Muster.
 */
export function previewDlpDecision(policyInput:DlpPolicy,subject:DlpSubject,ctx:DlpContext):DlpDecision & {findings:BuiltinDlpFinding[]}{const policy=normalizeDlpPolicy(policyInput);const findings=OUTBOUND_DLP_OPS.has(ctx.operation)?scanBuiltinSensitiveContent(subject.content??'',policy.maxScanChars):[];const decision=evaluateDlp(policy,subject,ctx,false);return{...decision,reason:findings.length?`preview:${decision.reason}`:decision.reason,findings};}
export function evaluateDlp(policyInput:DlpPolicy,subject:DlpSubject,ctx:DlpContext,simulate=false):DlpDecision{const policy=normalizeDlpPolicy(policyInput);const builtin=OUTBOUND_DLP_OPS.has(ctx.operation)?scanBuiltinSensitiveContent(subject.content??'',policy.maxScanChars):[];if(builtin.length){const reason=`dlp-builtin-${builtin[0].kind}`;return{action:'block',allowed:simulate?true:false,requiresJustification:false,reason:simulate?`simulation:${reason}`:reason};}const rule=selectDlpRule(policy,subject,ctx).rule;const action=rule?.action??policy.defaultAction;let allowed=true,reason=`dlp-${action}`;if(action==='block')allowed=false;else if(action==='warn-justify'&&!ctx.justification?.trim()){allowed=false;reason='dlp-justification-required';}else if(action==='require-recipient-encryption'&&!ctx.recipientEncrypted){allowed=false;reason='dlp-recipient-encryption-required';}else if(action==='require-approved-space'&&(!ctx.destinationId||!referenceListMatchesId(rule?.approvedSpaceIds??[],'space',ctx.destinationId))){allowed=false;reason='dlp-approved-space-required';}return{action,ruleId:rule?.id,allowed:simulate?true:allowed,requiresJustification:action==='warn-justify',reason:simulate?`simulation:${reason}`:reason};}
export function classificationAtLeast(label:SensitivityLabel,floor:SensitivityLabel){return ORDER.indexOf(label)>=ORDER.indexOf(floor);}
export function enforceDlpBoundary(policy:DlpPolicy,subject:DlpSubject,ctx:DlpContext):void{const d=evaluateDlp(policy,subject,ctx,false);if(!d.allowed)throw new Error(`admin-dlp-denied:${d.reason}`);}
