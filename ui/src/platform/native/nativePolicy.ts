// STATUS: DIAMANT VGT SUPREME — UX pre-check only; native action boundary repeats enforcement.
import { invoke } from '@tauri-apps/api/core';
export type PolicyEffect='Allow'|'Deny'|'RequireApproval';
export interface NativePolicyDecision{effect:PolicyEffect;reason_code:string;policy_id:string;policy_version:number}
export async function precheckPolicy(action:string,resource:string,context:Record<string,string>={}):Promise<NativePolicyDecision>{
  if(typeof window==='undefined'||!('__TAURI_INTERNALS__' in window))throw new Error('Native policy core is unavailable.');
  if(!action||action.length>512||!resource||resource.length>512)throw new Error('Policy request is invalid.');
  return invoke<NativePolicyDecision>('vgt_policy_evaluate',{request:{subject:'local-owner',action,resource,context}});
}

/**
 * The policy decision for a workspace drop, from the one existing authority.
 *
 * The drop resolver refuses a drop unless it receives a real decision
 * (`shared/workspace-interaction/workspaceInteractionResolver.ts`: an absent effect is
 * `drop_policy_decision_required`), and until now nothing on the drop path ever asked for one, so every drop
 * was refused. This is that missing question.
 *
 * **It fails closed, and it says why.** The authority is a native call and can be unreachable - in a
 * browser, or before the native core is ready. Returning `undefined` there would be the worst answer: the
 * resolver would have to interpret an absence, and an absence that means "the check did not run" is exactly
 * how a gate stops being a gate. Because the resolver has no fourth state, an unreachable authority is
 * reported as a `Deny` carrying a named reason, so the refusal is legible instead of silent.
 */
export async function requestDropPolicyDecision(
  targetDocumentId: string,
  context: Record<string, string> = {},
): Promise<NativePolicyDecision> {
  try {
    // `workspace.drop` is the action; the target document is the resource, so a policy can scope the rule
    // to one document rather than to dropping in general.
    return await precheckPolicy('workspace.drop', `document:${targetDocumentId}`, context);
  } catch {
    return {
      effect: 'Deny',
      reason_code: 'drop_policy_authority_unreachable',
      policy_id: 'local',
      policy_version: 0,
    } as NativePolicyDecision;
  }
}
