// STATUS: PLATIN — the sharing boundary decision, extracted so it can be proven before it is wired.
//
// ## Why this file exists (round 176)
//
// Three of thirteen declared `ActionBoundary` values have no enforcement point (round 170, corrected in 171):
// `Sharing` ("sharing.write"), `Print` ("print.execute"), `SpaceAccess` ("space.access"). The engine is
// **fail-closed** — proven by `crates/vgt-policy/tests/default_decision.rs` in round 172 — so what is missing
// is not a mechanism but a call.
//
// For `Sharing` the propagation lives in `app/useWorkspaceDocumentUpdates.ts:47` (`refreshWriterGridLinks`),
// **inside a `setDocuments(previous => …)` state updater**. React requires updaters to be pure and synchronous,
// so no policy check can go there (round 175). The check belongs at the two callers:
//
//   app/App.tsx
//   apps/pdf/persistence/pdfStudioPersistence.ts
//
// ## Why this module exists before the wiring
//
// Wiring a policy check into a live document path is a security-relevant production change. The **decision**
// is the part that can be wrong in a way nobody notices: compare against the wrong string and the check either
// always refuses or always permits — **and both look like a working control.**
//
// `crates/vgt-desktop/src/policy_bridge.rs:70` answers with:
//
//   effect: format!("{:?}", d.effect)
//
// That is the **Rust Debug spelling**: `"Allow"` / `"Deny"` / `"RequireApproval"`. Not `"allow"`, not
// `"ALLOW"`. Guessing here is exactly the mistake this session made once already, at `DocumentKind`.
//
// So the comparison is written once, here, and tested — and the wiring becomes a call to this function.

/** Exactly the strings `format!("{:?}", PolicyEffect)` can produce. */
export const POLICY_EFFECT_ALLOW = 'Allow';
export const POLICY_EFFECT_DENY = 'Deny';
export const POLICY_EFFECT_REQUIRE_APPROVAL = 'RequireApproval';

/** The shape `vgt_policy_evaluate` returns; `undefined` models "the call did not answer". */
export interface SharingPolicyAnswer {
  readonly effect?: string;
  readonly reason_code?: string;
}

export interface SharingDecision {
  /** Whether the live-link propagation may run. */
  readonly allowed: boolean;
  /** Why — carried into the log and the refusal, never invented. */
  readonly reason: string;
}

/**
 * Decides whether a live-link propagation may proceed.
 *
 * **Fail-closed in every branch that is not an explicit `Allow`:**
 *
 * * an unanswered call (`undefined` or a thrown IPC error, which the caller passes as `undefined`)
 * * a missing or non-string `effect`
 * * `Deny`, `RequireApproval`, or **any value this module does not recognise**
 *
 * A new `PolicyEffect` variant added in Rust would land in the last branch and **refuse** — which is the safe
 * direction. The opposite default would silently permit every future variant.
 */
export function decideSharingPropagation(answer: SharingPolicyAnswer | undefined): SharingDecision {
  if (!answer || typeof answer.effect !== 'string') {
    return {
      allowed: false,
      // Deliberately not "allowed": the policy engine could not be asked, and an unasked control is no control.
      reason: 'POLICY_UNANSWERED',
    };
  }
  if (answer.effect === POLICY_EFFECT_ALLOW) {
    return { allowed: true, reason: answer.reason_code ?? 'POLICY_ALLOW' };
  }
  if (answer.effect === POLICY_EFFECT_REQUIRE_APPROVAL) {
    return { allowed: false, reason: answer.reason_code ?? 'POLICY_REQUIRE_APPROVAL' };
  }
  if (answer.effect === POLICY_EFFECT_DENY) {
    return { allowed: false, reason: answer.reason_code ?? 'POLICY_DEFAULT_DENY' };
  }
  return { allowed: false, reason: `POLICY_UNKNOWN_EFFECT:${answer.effect}` };
}
