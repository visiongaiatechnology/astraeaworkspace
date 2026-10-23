// 💠 DIAMANT VGT SUPREME STATUS
use std::collections::BTreeMap;
use std::sync::RwLock;
use tauri::State;
use vgt_policy::{
    authorize_boundary, effective_policy_view, evaluate, ActionBoundary, PolicyEffect,
    PolicyRequest, PolicyRule, PolicyScope, PolicyScopeKind, PolicySet, PolicyVersionState,
    SignedPolicyBundle,
};
#[cfg(test)]
use vgt_policy::{PolicyBundlePayload, POLICY_BUNDLE_SCHEMA};

const MAX_POLICY_BUNDLE_JSON_BYTES: usize = 4 * 1024 * 1024;
const POLICY_SIGNER_FINGERPRINT_HEX_BYTES: usize = 64;

pub struct PolicyRuntimeState {
    current: RwLock<PolicySet>,
}
impl PolicyRuntimeState {
    pub fn personal_default() -> Self {
        Self{current:RwLock::new(PolicySet::new("local-personal",1,PolicyVersionState::Published,vec![PolicyRule{id:"local-owner-explicit-allow".into(),subject:"local-owner".into(),resource:"*".into(),action:"*".into(),conditions:vec![],effect:PolicyEffect::Allow,priority:1000,scope:PolicyScope{kind:PolicyScopeKind::User,id:"local-owner".into()},rationale:"Personal local owner retains explicit local capabilities unless a managed policy replaces this bundle.".into(),reason_code:"LOCAL_OWNER_ALLOW".into()}]))}
    }
    pub fn require(&self, boundary: ActionBoundary, resource: &str) -> Result<(), String> {
        let set = self
            .current
            .read()
            .map_err(|_| "POLICY_STATE_UNAVAILABLE".to_string())?;
        authorize_boundary(&set, boundary, "local-owner", resource, BTreeMap::new())
            .map(|_| ())
            .map_err(|_| "POLICY_ACTION_DENIED".to_string())
    }
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PolicyEvaluateRequest {
    pub subject: String,
    pub action: String,
    pub resource: String,
    #[serde(default)]
    pub context: BTreeMap<String, String>,
}
#[derive(serde::Serialize)]
pub struct PolicyEvaluateResponse {
    pub effect: String,
    pub reason_code: String,
    pub policy_id: String,
    pub policy_version: u64,
}
#[tauri::command]
pub fn vgt_policy_evaluate(
    state: State<'_, PolicyRuntimeState>,
    request: PolicyEvaluateRequest,
) -> Result<PolicyEvaluateResponse, String> {
    let set = state
        .current
        .read()
        .map_err(|_| "POLICY_STATE_UNAVAILABLE".to_string())?;
    let d = evaluate(
        &set,
        &PolicyRequest {
            subject: request.subject,
            action: request.action,
            resource: request.resource,
            context: request.context,
        },
    )
    .map_err(|_| "POLICY_EVALUATION_FAILED".to_string())?;
    Ok(PolicyEvaluateResponse {
        effect: format!("{:?}", d.effect),
        reason_code: d.reason_code,
        policy_id: d.policy_id,
        policy_version: d.policy_version,
    })
}
#[tauri::command]
pub fn vgt_policy_effective_view(
    state: State<'_, PolicyRuntimeState>,
) -> Result<vgt_policy::EffectivePolicyView, String> {
    let set = state
        .current
        .read()
        .map_err(|_| "POLICY_STATE_UNAVAILABLE".to_string())?;
    effective_policy_view(&set, true).map_err(|_| "POLICY_VIEW_DENIED".to_string())
}
#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PolicyInstallBundleRequest {
    pub signed_bundle_json: String,
    pub pinned_signer_fingerprint_hex: Option<String>,
}

fn decode_signed_policy_bundle_json(
    signed_bundle_json: &str,
) -> Result<SignedPolicyBundle, &'static str> {
    if signed_bundle_json.len() > MAX_POLICY_BUNDLE_JSON_BYTES {
        return Err("POLICY_BUNDLE_TOO_LARGE");
    }
    serde_json::from_str(signed_bundle_json).map_err(|_| "POLICY_BUNDLE_INVALID")
}

fn normalize_pinned_signer_fingerprint_hex(
    fingerprint: Option<&str>,
) -> Result<Option<String>, &'static str> {
    match fingerprint {
        None => Ok(None),
        Some(value)
            if value.len() == POLICY_SIGNER_FINGERPRINT_HEX_BYTES
                && value.bytes().all(|byte| byte.is_ascii_hexdigit()) =>
        {
            Ok(Some(value.to_ascii_lowercase()))
        }
        Some(_) => Err("POLICY_BUNDLE_PIN_INVALID"),
    }
}

#[tauri::command]
pub fn vgt_policy_install_signed_bundle(
    state: State<'_, PolicyRuntimeState>,
    request: PolicyInstallBundleRequest,
) -> Result<bool, String> {
    let bundle = decode_signed_policy_bundle_json(&request.signed_bundle_json)
        .map_err(|code| code.to_string())?;
    let pinned_signer_fingerprint =
        normalize_pinned_signer_fingerprint_hex(request.pinned_signer_fingerprint_hex.as_deref())
            .map_err(|code| code.to_string())?;
    let policy = bundle
        .verify(pinned_signer_fingerprint.as_deref())
        .map_err(|_| "POLICY_BUNDLE_VERIFICATION_FAILED".to_string())?;
    if policy.state != PolicyVersionState::Published {
        return Err("POLICY_BUNDLE_NOT_PUBLISHED".into());
    }
    *state
        .current
        .write()
        .map_err(|_| "POLICY_STATE_UNAVAILABLE".to_string())? = policy;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    fn structurally_valid_bundle_json() -> String {
        serde_json::to_string(&SignedPolicyBundle {
            payload: PolicyBundlePayload {
                schema: POLICY_BUNDLE_SCHEMA.to_owned(),
                bundle_id: "sec096-policy-bridge".to_owned(),
                issued_at_unix_ms: 1,
                policy: PolicySet::new("sec096-policy", 1, PolicyVersionState::Published, vec![]),
            },
            public_key_base64: "AA==".to_owned(),
            signature_base64: "AA==".to_owned(),
        })
        .expect("serialize structural parser fixture")
    }

    #[test]
    fn policy_install_request_schema_is_strict() {
        let request: PolicyInstallBundleRequest =
            serde_json::from_str(r#"{"signed_bundle_json":"{}"}"#)
                .expect("optional signer pin may be omitted");
        assert_eq!(request.signed_bundle_json, "{}");
        assert_eq!(request.pinned_signer_fingerprint_hex, None);

        for malformed in [
            r#"{}"#,
            r#"{"signed_bundle_json":"{}","unexpected":true}"#,
            r#"{"signed_bundle_json":null}"#,
            r#"{"signed_bundle_json":"{}","pinned_signer_fingerprint_hex":7}"#,
        ] {
            assert!(
                serde_json::from_str::<PolicyInstallBundleRequest>(malformed).is_err(),
                "request schema accepted {malformed}"
            );
        }
    }

    #[test]
    fn policy_install_pin_requires_sha256_hex_and_allows_absence() {
        assert_eq!(normalize_pinned_signer_fingerprint_hex(None), Ok(None));

        let lower = "ab".repeat(POLICY_SIGNER_FINGERPRINT_HEX_BYTES / 2);
        assert_eq!(
            normalize_pinned_signer_fingerprint_hex(Some(&lower)),
            Ok(Some(lower.clone()))
        );
        let upper = lower.to_ascii_uppercase();
        assert_eq!(
            normalize_pinned_signer_fingerprint_hex(Some(&upper)),
            Ok(Some(lower))
        );

        let malformed = [
            String::new(),
            "a".repeat(POLICY_SIGNER_FINGERPRINT_HEX_BYTES - 1),
            "a".repeat(POLICY_SIGNER_FINGERPRINT_HEX_BYTES + 1),
            format!("{}g", "a".repeat(POLICY_SIGNER_FINGERPRINT_HEX_BYTES - 1)),
            format!("{} ", "a".repeat(POLICY_SIGNER_FINGERPRINT_HEX_BYTES - 1)),
            format!("{}\n", "a".repeat(POLICY_SIGNER_FINGERPRINT_HEX_BYTES - 1)),
            format!(" {}", "a".repeat(POLICY_SIGNER_FINGERPRINT_HEX_BYTES - 1)),
        ];
        for pin in malformed {
            assert_eq!(
                normalize_pinned_signer_fingerprint_hex(Some(&pin)),
                Err("POLICY_BUNDLE_PIN_INVALID"),
                "accepted malformed signer pin: {pin:?}"
            );
        }
    }

    #[test]
    fn policy_bundle_decoder_enforces_exact_four_mib_limit() {
        let mut exact_limit = structurally_valid_bundle_json();
        exact_limit.extend(std::iter::repeat_n(
            ' ',
            MAX_POLICY_BUNDLE_JSON_BYTES - exact_limit.len(),
        ));
        assert_eq!(exact_limit.len(), MAX_POLICY_BUNDLE_JSON_BYTES);
        assert!(decode_signed_policy_bundle_json(&exact_limit).is_ok());

        exact_limit.push(' ');
        assert_eq!(exact_limit.len(), MAX_POLICY_BUNDLE_JSON_BYTES + 1);
        assert!(matches!(
            decode_signed_policy_bundle_json(&exact_limit),
            Err("POLICY_BUNDLE_TOO_LARGE")
        ));
    }

    #[test]
    fn signed_policy_bundle_parser_accounts_for_4096_bounded_mutations() {
        const CASES: usize = 4_096;
        const ACCEPTED_CASES: usize = CASES / 8;
        const MAX_CASE_BYTES: usize = 1_024;

        let base = structurally_valid_bundle_json();
        assert!(base.len() <= MAX_CASE_BYTES);
        let mut seen = HashSet::with_capacity(CASES);
        let mut accepted = 0usize;
        let mut rejected = 0usize;

        for case_index in 0..CASES {
            let family = case_index % 8;
            let variant = case_index / 8;
            let (input, expected_acceptance) = match family {
                0 => (format!("{base}{}", " ".repeat(variant + 1)), true),
                1 => {
                    let mut input = base[..base.len() - 1].to_owned();
                    input.push_str(&format!(",\"unknown_{variant}\":true}}"));
                    (input, false)
                }
                2 => (
                    format!(
                        r#"{{"payload":{{}},"public_key_base64":{variant},"signature_base64":"AA=="}}"#
                    ),
                    false,
                ),
                3 => {
                    let cutoff = base.len() - 1 - (variant % 8);
                    (format!("{}!{variant}", &base[..cutoff]), false)
                }
                4 => (
                    format!(
                        r#"{{"payload":{{}},"payload":{{"case":{variant}}},"public_key_base64":"AA==","signature_base64":"AA=="}}"#
                    ),
                    false,
                ),
                5 => (format!("{base}!{variant}"), false),
                6 => (format!(r#"{{"unknown_{variant}":true}}"#), false),
                _ => (
                    format!(
                        r#"{{"payload":"case-{variant}","public_key_base64":"AA==","signature_base64":"AA=="}}"#
                    ),
                    false,
                ),
            };

            assert!(
                input.len() <= MAX_CASE_BYTES,
                "case {case_index} exceeded corpus cap"
            );
            assert!(
                seen.insert(input.clone()),
                "case {case_index} was not distinct"
            );
            let outcome = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                decode_signed_policy_bundle_json(&input)
            }));
            let outcome =
                outcome.unwrap_or_else(|_| panic!("bundle parser panicked on case {case_index}"));
            match outcome {
                Ok(_bundle) => {
                    accepted += 1;
                    assert!(
                        expected_acceptance,
                        "malformed case {case_index} was accepted"
                    );
                }
                Err("POLICY_BUNDLE_INVALID") => {
                    rejected += 1;
                    assert!(
                        !expected_acceptance,
                        "structural case {case_index} was rejected"
                    );
                }
                Err(error) => panic!("case {case_index} returned unclassified error: {error}"),
            }
        }

        assert_eq!(seen.len(), CASES);
        assert_eq!(accepted, ACCEPTED_CASES);
        assert_eq!(rejected, CASES - ACCEPTED_CASES);
        assert_eq!(accepted + rejected, CASES);
    }
}
