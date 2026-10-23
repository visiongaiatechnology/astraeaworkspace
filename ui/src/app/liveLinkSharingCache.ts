// STATUS: PLATIN — the synchronous policy cache that lets the sharing decision run inside a React state updater.
//
// ## Why a cache and not an await (round 177)
//
// `refreshWriterGridLinks` runs inside `setDocuments(previous => …)` in
// `app/useWorkspaceDocumentUpdates.ts`. React requires a state updater to be **pure and synchronous**, so no
// `await` can go there (round 175). Round 106 listed three ways out; rounds 174-176 pursued the most expensive:
//
//   1. a policy header on the document
//   2. **a synchronous policy cache**   ← this file
//   3. make the whole propagation chain asynchronous
//
// Option 3 restructures a live document path — one caller (`app/App.tsx:155`, measured in round 177) and a
// state-updater contract to unwind. Option 2 does not: a synchronous read of the last known answer is itself
// synchronous and fits where it is needed.
//
// ## The price, stated rather than hidden
//
// **A cache can be stale.** If the policy state changes while a propagation is in flight, the previous answer
// decides. On a local single-user workspace with no network that window is small — but it is real. A caller
// that cannot accept it must take option 3, which is an architecture decision, not a measurement.
//
// ## And the one rule that must not be got wrong
//
// **An empty cache is not a permit.** Nothing has asked yet, therefore nothing is known, therefore the answer
// is `undefined` — and `decideSharingPropagation(undefined)` refuses with `POLICY_UNANSWERED`. The opposite
// default would make the guard a decoration: it would pass exactly in the state the app starts in.

import {
  decideSharingPropagation,
  type SharingDecision,
  type SharingPolicyAnswer,
} from './liveLinkSharingPolicy';

let lastAnswer: SharingPolicyAnswer | undefined;

/**
 * Records the engine's answer for `sharing.write`.
 *
 * Call this when the policy state becomes known or changes — **not** on every propagation. Filling the cache
 * per propagation would put an asynchronous call back into the synchronous path this design exists to avoid.
 */
export function recordSharingPolicyAnswer(answer: SharingPolicyAnswer | undefined): void {
  lastAnswer =
    answer && typeof answer.effect === 'string'
      ? { effect: answer.effect, reason_code: answer.reason_code }
      : undefined;
}

/** Reads the cached answer **synchronously**. `undefined` means nothing has asked yet — which refuses. */
export function readSharingPolicyAnswer(): SharingPolicyAnswer | undefined {
  return lastAnswer;
}

/** The decision for the current cache state — the single call the propagation makes. */
export function mayPropagateSharing(): SharingDecision {
  return decideSharingPropagation(readSharingPolicyAnswer());
}

/** Test seam only: clears the cache so a test cannot inherit another test's answer. */
export function resetSharingPolicyCache(): void {
  lastAnswer = undefined;
}
