// STATUS: DIAMANT VGT SUPREME — Secret-redacted local run history, rerun semantics, dry-run and diagnostics.
import type { FlowExecutionRun, JsonValue } from '../model/types';
export interface RedactionPolicy{secretPaths:ReadonlySet<string>;sensitivePaths:ReadonlySet<string>;maxDepth:number;maxItems:number;maxText:number;}
export interface RerunSemantics{from:'start'|'failed-node';failedNodeId?:string;nodeIdempotent:boolean;nodeCompensatable:boolean;}
export interface DiagnosticsSelection{runIds:string[];includeSteps:boolean;includeDurations:boolean;includeSafeErrors:boolean;}
export class AutomateObservabilityError extends Error{constructor(public readonly code:string){super(code);this.name='AutomateObservabilityError';}}
const KEY_SENSITIVE=/(password|passwd|secret|token|authorization|cookie|credential|private.?key)/i;
export function redactValue(value:JsonValue,policy:RedactionPolicy,path='$',depth=0):JsonValue{if(depth>policy.maxDepth)return'[REDACTED:DEPTH]';if(policy.secretPaths.has(path)||policy.sensitivePaths.has(path))return'[REDACTED]';if(typeof value==='string')return value.length>policy.maxText?`${value.slice(0,policy.maxText)}…[TRUNCATED]`:value;if(Array.isArray(value))return value.slice(0,policy.maxItems).map((v,i)=>redactValue(v,policy,`${path}[${i}]`,depth+1));if(value&&typeof value==='object'){const out:Record<string,JsonValue>={};for(const [k,v] of Object.entries(value).slice(0,policy.maxItems))out[k]=KEY_SENSITIVE.test(k)?'[REDACTED]':redactValue(v,policy,`${path}.${k}`,depth+1);return out;}return value;}
export class LocalRunHistory{private rows:FlowExecutionRun[]=[];constructor(private readonly maxRuns=500){if(!Number.isInteger(maxRuns)||maxRuns<1||maxRuns>5000)throw new AutomateObservabilityError('history-limit-invalid');}append(run:FlowExecutionRun){this.rows.unshift(structuredClone(run));if(this.rows.length>this.maxRuns)this.rows.length=this.maxRuns;}list(){return structuredClone(this.rows);}replace(runs:FlowExecutionRun[]){this.rows=runs.slice(0,this.maxRuns).map(r=>structuredClone(r));}}
export function planRerun(s:RerunSemantics):{allowed:true;from:string}{if(s.from==='start')return{allowed:true,from:'start'};if(!s.failedNodeId)throw new AutomateObservabilityError('rerun-failed-node-required');if(!s.nodeIdempotent&&!s.nodeCompensatable)throw new AutomateObservabilityError('rerun-semantics-unsafe');return{allowed:true,from:s.failedNodeId};}
export async function dryRunSideEffect<T extends JsonValue>(kind:string,input:JsonValue,mock:(kind:string,input:JsonValue)=>Promise<T>):Promise<{simulated:true;output:T}>{if(!kind||kind.length>128)throw new AutomateObservabilityError('dry-run-kind-invalid');return{simulated:true,output:await mock(kind,structuredClone(input))};}
export function exportSelectedDiagnostics(runs:readonly FlowExecutionRun[],selection:DiagnosticsSelection):JsonValue{if(selection.runIds.length>100)throw new AutomateObservabilityError('diagnostics-selection-limit');const ids=new Set(selection.runIds);return{schema:'vgt-automate-diagnostics/1',runs:runs.filter(r=>ids.has(r.id)).map(r=>({id:r.id,status:r.status,startedAt:r.startedAt,endedAt:r.endedAt,durationMs:selection.includeDurations?r.durationMs:undefined,safeErrorCode:selection.includeSafeErrors?r.safeErrorCode:undefined,steps:selection.includeSteps?r.steps.map(s=>({nodeId:s.nodeId,status:s.status,durationMs:selection.includeDurations?s.durationMs:undefined,safeMessage:s.safeMessage})):undefined}))} as unknown as JsonValue;}

/** Bounds for the visible run log. Mirrors the drawer's own limits so nothing is silently dropped. */
export const RUN_LOG_MAX_STEPS=200, RUN_LOG_MAX_TEXT=512, RUN_LOG_MAX_DEPTH=8, RUN_LOG_MAX_ITEMS=64;

/**
 * The redaction policy the run drawer must apply to every value it shows.
 * One definition: `secretPaths`/`sensitivePaths` are empty because variables are matched by name,
 * which `redactValue` already does through its sensitive-key rule.
 */
export const AUTOMATE_RUN_LOG_POLICY:RedactionPolicy={secretPaths:new Set(),sensitivePaths:new Set(),maxDepth:RUN_LOG_MAX_DEPTH,maxItems:RUN_LOG_MAX_ITEMS,maxText:RUN_LOG_MAX_TEXT};

/** Renderable, redacted form of a run step's payload for the visible log. */
export function redactRunStepPayload(value:JsonValue,policy:RedactionPolicy=AUTOMATE_RUN_LOG_POLICY):JsonValue{
 try{return redactValue(value,policy);}catch{return '[REDACTED:UNRENDERABLE]';}
}

/**
 * True when a value would be changed by redaction. Used to prove the log is not merely unsullied
 * because it happens to hold nothing sensitive.
 */
export function containsRedactableContent(value:JsonValue,policy:RedactionPolicy=AUTOMATE_RUN_LOG_POLICY):boolean{
 return JSON.stringify(redactRunStepPayload(value,policy))!==JSON.stringify(value);
}
