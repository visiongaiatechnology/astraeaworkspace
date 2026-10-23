import { describe, expect, it } from 'vitest';
import {
  POLICY_EFFECT_ALLOW,
  POLICY_EFFECT_DENY,
  POLICY_EFFECT_REQUIRE_APPROVAL,
  decideSharingPropagation,
} from './liveLinkSharingPolicy';

// `sharing.write` is one of three boundaries with no enforcement point (round 170). The engine is fail-closed
// (proven in round 172); what is missing is a call. This file proves the **decision** the call will use, so the
// wiring cannot introduce a control that always refuses or always permits — both of which look like working.
//
// The string values are not invented: `crates/vgt-desktop/src/policy_bridge.rs:70` answers with
// `format!("{:?}", d.effect)`, the Rust Debug spelling.

describe('live-link sharing policy decision', () => {
  it('permits the propagation only on an explicit Allow', () => {
    const decision = decideSharingPropagation({ effect: POLICY_EFFECT_ALLOW, reason_code: 'POLICY_MATCH' });
    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBe('POLICY_MATCH');
  });

  it('refuses on Deny and carries the engine reason', () => {
    const decision = decideSharingPropagation({ effect: POLICY_EFFECT_DENY, reason_code: 'POLICY_DEFAULT_DENY' });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('POLICY_DEFAULT_DENY');
  });

  it('refuses on RequireApproval - an unanswered approval is not an approval', () => {
    const decision = decideSharingPropagation({ effect: POLICY_EFFECT_REQUIRE_APPROVAL });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('POLICY_REQUIRE_APPROVAL');
  });

  it('refuses when the policy engine could not be asked at all', () => {
    // A failed IPC call, a timeout, a missing bridge: the caller passes `undefined`. Fail-closed.
    const decision = decideSharingPropagation(undefined);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('POLICY_UNANSWERED');
  });

  it('refuses an effect this module does not recognise', () => {
    // A future `PolicyEffect` variant added in Rust lands here and refuses. The opposite default would
    // silently permit every variant anyone adds later.
    const decision = decideSharingPropagation({ effect: 'SomethingNew', reason_code: 'X' });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('POLICY_UNKNOWN_EFFECT:SomethingNew');
  });

  it('refuses a lowercase or differently-cased effect - the comparison is exact', () => {
    // The trap this test exists for: `format!("{:?}")` yields "Allow", not "allow". A case-insensitive
    // comparison would pass the wrong string meaning, and a lowercase expectation would refuse everything.
    for (const wrong of ['allow', 'ALLOW', 'Allowed', '']) {
      const decision = decideSharingPropagation({ effect: wrong });
      expect(decision.allowed, `effect ${JSON.stringify(wrong)} must not permit`).toBe(false);
    }
  });

  it('refuses a non-string effect instead of coercing it', () => {
    // Untrusted IPC payloads are hostile at this boundary; `true` or `1` must not become "allowed".
    const decision = decideSharingPropagation({ effect: true as unknown as string });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('POLICY_UNANSWERED');
  });
});
