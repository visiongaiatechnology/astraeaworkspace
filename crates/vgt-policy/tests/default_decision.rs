//! The fail-closed default for sensitive actions — the one line nobody tested.
//!
//! ## Why this file exists (round 172)
//!
//! `crates/vgt-policy/src/engine.rs:46` decides what happens when **no rule matches**:
//!
//! ```rust
//! fn default_decision(set: &PolicySet, action: &str) -> PolicyDecision {
//!     PolicyDecision {
//!         effect: if sensitive_action(action) { PolicyEffect::Deny } else { PolicyEffect::Allow },
//!         reason_code: if sensitive_action(action) { "POLICY_DEFAULT_DENY".into() }
//!                      else { "POLICY_DEFAULT_ALLOW".into() },
//!         …
//!     }
//! }
//! ```
//!
//! **That branch is the security floor for thirteen declared boundaries** — and until this file, nothing
//! tested it. `POLICY_DEFAULT_DENY` and `default_decision` appeared exclusively in `engine.rs`; there was no
//! `crates/vgt-policy/tests/` directory and no `mod tests` in the crate at all.
//!
//! ## Why it matters more than the missing call sites
//!
//! Three boundaries (`Sharing`, `Print`, `SpaceAccess`) have **no call site** — measured in round 170. They
//! are therefore *unreachable* today, which sounds reassuring and is the wrong conclusion: **the moment
//! anyone adds the obvious call, the security behaviour of that call rests entirely on `default_decision`.**
//!
//! In round 170 I asserted the engine would silently allow such an action. **That was wrong** — reading the
//! whole line showed the branch is inverted from what the first half suggested. These tests exist so the
//! question is answered by a failing build rather than by a reading.

use std::collections::BTreeMap;

use vgt_policy::engine::evaluate;
use vgt_policy::model::{PolicyEffect, PolicyRequest, PolicySet, PolicyVersionState, POLICY_SCHEMA};

/// A published policy set with **no rules at all** — so every request falls through to the default.
fn published_without_rules() -> PolicySet {
    PolicySet {
        schema: POLICY_SCHEMA.to_string(),
        policy_id: "default-decision-test".to_string(),
        version: 1,
        state: PolicyVersionState::Published,
        rollout_percent: 100,
        rules: Vec::new(),
    }
}

fn request(action: &str) -> PolicyRequest {
    PolicyRequest {
        subject: "user-1".to_string(),
        action: action.to_string(),
        resource: "workspace-1".to_string(),
        context: BTreeMap::new(),
    }
}

#[test]
fn a_sensitive_action_without_a_rule_is_denied() {
    // `sharing.write` is one of the three boundaries with no call site. It IS listed in `sensitive_action`,
    // so the default must refuse it. If this test ever fails, adding the missing call site would open a hole
    // rather than close one.
    let decision = evaluate(&published_without_rules(), &request("sharing.write"))
        .expect("evaluation must succeed for a well-formed published set");

    assert_eq!(
        decision.effect,
        PolicyEffect::Deny,
        "a sensitive action with no matching rule must fail closed"
    );
    assert_eq!(decision.reason_code, "POLICY_DEFAULT_DENY");
}

#[test]
fn the_other_uncalled_sensitive_boundaries_are_denied_too() {
    // `print.execute` and `space.access` are the other two boundaries without a call site (round 170).
    for action in ["print.execute", "space.access"] {
        let decision = evaluate(&published_without_rules(), &request(action))
            .expect("evaluation must succeed for a well-formed published set");
        assert_eq!(decision.effect, PolicyEffect::Deny, "{action} must fail closed");
        assert_eq!(decision.reason_code, "POLICY_DEFAULT_DENY", "{action}");
    }
}

#[test]
fn an_ordinary_action_without_a_rule_is_allowed() {
    // The other half of the branch. Without this case, a default that denied everything would pass the two
    // tests above and break the product.
    let decision = evaluate(&published_without_rules(), &request("document.edit"))
        .expect("evaluation must succeed for a well-formed published set");

    assert_eq!(
        decision.effect,
        PolicyEffect::Allow,
        "an ordinary action must not be caught by the sensitive-action default"
    );
    assert_eq!(decision.reason_code, "POLICY_DEFAULT_ALLOW");
}

#[test]
fn a_draft_policy_set_also_falls_back_to_the_sensitive_default() {
    // `engine.rs:40` returns the default early when the set is not Published. That is a second path into the
    // same branch, and it is the one a freshly authored policy would take.
    let mut draft = published_without_rules();
    draft.state = PolicyVersionState::Draft;

    let decision = evaluate(&draft, &request("sharing.write"))
        .expect("evaluation must succeed for a well-formed draft set");

    assert_eq!(decision.effect, PolicyEffect::Deny, "an unpublished set must not allow sharing");
    assert_eq!(decision.reason_code, "POLICY_DEFAULT_DENY");
}
