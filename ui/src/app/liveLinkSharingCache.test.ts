import { beforeEach, describe, expect, it } from 'vitest';
import {
  mayPropagateSharing,
  readSharingPolicyAnswer,
  recordSharingPolicyAnswer,
  resetSharingPolicyCache,
} from './liveLinkSharingCache';

// The cache is the piece that makes the sharing guard usable inside a React state updater (round 177): the
// updater is synchronous, so the decision must be a synchronous read of a previously recorded answer.
//
// The single rule that must not be got wrong: **an empty cache is not a permit.** A guard that passes before
// anything has asked would be a decoration — it would allow exactly in the state the application starts in.

describe('sharing policy cache', () => {
  beforeEach(() => {
    resetSharingPolicyCache();
  });

  it('refuses before anything has asked - an empty cache is not a permit', () => {
    expect(readSharingPolicyAnswer()).toBeUndefined();
    const decision = mayPropagateSharing();
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('POLICY_UNANSWERED');
  });

  it('permits only after an explicit Allow was recorded', () => {
    recordSharingPolicyAnswer({ effect: 'Allow', reason_code: 'POLICY_MATCH' });
    const decision = mayPropagateSharing();
    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBe('POLICY_MATCH');
  });

  it('refuses when a Deny was recorded', () => {
    recordSharingPolicyAnswer({ effect: 'Deny', reason_code: 'POLICY_DEFAULT_DENY' });
    expect(mayPropagateSharing().allowed).toBe(false);
  });

  it('treats a recorded non-string effect as no answer at all', () => {
    // Hostile or malformed IPC payloads must not become a permit by coercion.
    recordSharingPolicyAnswer({ effect: true as unknown as string });
    expect(readSharingPolicyAnswer()).toBeUndefined();
    expect(mayPropagateSharing().reason).toBe('POLICY_UNANSWERED');
  });

  it('forgets a previous Allow when it is overwritten by an unanswered call', () => {
    // Regression guard: a stale Allow must not survive a failed re-evaluation. If clearing did not clear,
    // a revoked policy would keep permitting.
    recordSharingPolicyAnswer({ effect: 'Allow' });
    expect(mayPropagateSharing().allowed).toBe(true);

    recordSharingPolicyAnswer(undefined);
    expect(mayPropagateSharing().allowed).toBe(false);
    expect(mayPropagateSharing().reason).toBe('POLICY_UNANSWERED');
  });

  it('forgets a previous Allow when a Deny replaces it', () => {
    recordSharingPolicyAnswer({ effect: 'Allow' });
    recordSharingPolicyAnswer({ effect: 'Deny' });
    const decision = mayPropagateSharing();
    expect(decision.allowed).toBe(false);
    // `Deny` carries no reason_code here, so the module's own default names the engine's fail-closed reason.
    expect(decision.reason).toBe('POLICY_DEFAULT_DENY');
  });

  it('copies the answer instead of holding the caller`s object', () => {
    // The recorded object must not be mutable from outside; a caller flipping `effect` later would otherwise
    // change a security decision after the fact.
    const answer = { effect: 'Deny', reason_code: 'X' };
    recordSharingPolicyAnswer(answer);
    answer.effect = 'Allow';
    expect(readSharingPolicyAnswer()?.effect).toBe('Deny');
  });
});
