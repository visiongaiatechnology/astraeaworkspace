// 💠 DIAMANT VGT SUPREME STATUS
use crate::model::*;
use crate::PolicyError;
use sha2::{Digest, Sha256};
use std::collections::HashSet;

fn bounded(label:&str, value:&str)->Result<(),PolicyError>{ if value.is_empty()||value.len()>MAX_POLICY_TEXT { return Err(PolicyError::InvalidInput(label.into())); } Ok(()) }
fn valid_reason(value:&str)->bool { !value.is_empty() && value.len()<=MAX_REASON_CODE && value.bytes().all(|b| b.is_ascii_uppercase()||b.is_ascii_digit()||matches!(b,b'_'|b'-')) }
fn selector_matches(selector:&str, actual:&str)->bool { selector=="*" || selector==actual || selector.strip_suffix(".*").is_some_and(|p| actual==p || actual.starts_with(&format!("{p}."))) }
fn condition_matches(c:&PolicyCondition, req:&PolicyRequest)->bool { match c {
    PolicyCondition::Equals{key,expected}=>req.context.get(key)==Some(expected),
    PolicyCondition::NotEquals{key,expected}=>req.context.get(key).is_some_and(|v|v!=expected),
    PolicyCondition::OneOf{key,expected}=>req.context.get(key).is_some_and(|v|expected.iter().any(|x|x==v)),
    PolicyCondition::Exists{key}=>req.context.contains_key(key),
    PolicyCondition::ClassificationAtMost{key,ceiling}=>req.context.get(key).and_then(|v|v.parse::<u8>().ok()).is_some_and(|v|v<=*ceiling),
} }

pub fn validate_policy_set(set:&PolicySet)->Result<(),PolicyError>{
    if set.schema!=POLICY_SCHEMA { return Err(PolicyError::InvalidSchema); }
    bounded("policy-id",&set.policy_id)?;
    if set.version==0 || set.rollout_percent>100 || set.rules.len()>MAX_POLICY_RULES { return Err(PolicyError::InvalidInput("policy-bounds".into())); }
    let mut ids=HashSet::new();
    for r in &set.rules {
        for (k,v) in [("rule-id",r.id.as_str()),("subject",r.subject.as_str()),("resource",r.resource.as_str()),("action",r.action.as_str()),("scope-id",r.scope.id.as_str()),("rationale",r.rationale.as_str())] { bounded(k,v)?; }
        if !valid_reason(&r.reason_code) || !ids.insert(r.id.clone()) || r.conditions.len()>MAX_POLICY_CONTEXT { return Err(PolicyError::InvalidInput("rule".into())); }
        for c in &r.conditions { match c { PolicyCondition::Equals{key,expected}|PolicyCondition::NotEquals{key,expected}=>{bounded("condition-key",key)?;bounded("condition-value",expected)?}, PolicyCondition::OneOf{key,expected}=>{bounded("condition-key",key)?;if expected.len()>32{return Err(PolicyError::InvalidInput("condition-list".into()));}for v in expected{bounded("condition-value",v)?;}}, PolicyCondition::Exists{key}|PolicyCondition::ClassificationAtMost{key,..}=>bounded("condition-key",key)? } }
    }
    Ok(())
}

fn rollout_applies(set:&PolicySet, subject:&str)->bool { if set.rollout_percent>=100{return true;}
    if set.rollout_percent==0{return false;} let mut h=Sha256::new();h.update(b"vgt-policy-rollout/1\0");h.update(set.policy_id.as_bytes());h.update(b"\0");h.update(subject.as_bytes());let d=h.finalize();let bucket=u16::from_be_bytes([d[0],d[1]])%100;bucket<(set.rollout_percent as u16) }
fn ordered(set:&PolicySet)->Vec<&PolicyRule>{let mut v:Vec<_>=set.rules.iter().collect();v.sort_by(|a,b| b.priority.cmp(&a.priority).then_with(||b.scope.kind.precedence().cmp(&a.scope.kind.precedence())).then_with(||a.id.cmp(&b.id)));v}

pub fn evaluate(set:&PolicySet, req:&PolicyRequest)->Result<PolicyDecision,PolicyError>{ evaluate_cancellable(set,req,&NeverCancel) }
pub fn evaluate_cancellable(set:&PolicySet,req:&PolicyRequest,cancel:&dyn PolicyCancellationCheck)->Result<PolicyDecision,PolicyError>{if cancel.cancelled(){return Err(PolicyError::Cancelled);}evaluate_internal(set,req,false,cancel).map(|x|x.0)}
pub fn evaluate_with_trace(set:&PolicySet,req:&PolicyRequest,authorized_admin:bool)->Result<(PolicyDecision,Vec<PolicyTraceEntry>),PolicyError>{ if !authorized_admin{return Err(PolicyError::AdminTraceDenied);} evaluate_internal(set,req,true,&NeverCancel) }
fn evaluate_internal(set:&PolicySet,req:&PolicyRequest,trace:bool,cancel:&dyn PolicyCancellationCheck)->Result<(PolicyDecision,Vec<PolicyTraceEntry>),PolicyError>{
    validate_policy_set(set)?; bounded("subject",&req.subject)?;bounded("action",&req.action)?;bounded("resource",&req.resource)?; if req.context.len()>MAX_POLICY_CONTEXT{return Err(PolicyError::InvalidInput("context-limit".into()));} for (k,v) in &req.context{bounded("context-key",k)?;bounded("context-value",v)?;}
    if set.state!=PolicyVersionState::Published || !rollout_applies(set,&req.subject){return Ok((default_decision(set,&req.action),Vec::new()));}
    let mut tr=Vec::new();
    for r in ordered(set){if cancel.cancelled(){return Err(PolicyError::Cancelled);}let m=selector_matches(&r.subject,&req.subject)&&selector_matches(&r.action,&req.action)&&selector_matches(&r.resource,&req.resource)&&r.conditions.iter().all(|c|condition_matches(c,req)); if trace{tr.push(PolicyTraceEntry{rule_id:r.id.clone(),matched:m,effect:r.effect,priority:r.priority,scope_precedence:r.scope.kind.precedence()});}
        if m{return Ok((PolicyDecision{effect:r.effect,reason_code:r.reason_code.clone(),policy_id:set.policy_id.clone(),policy_version:set.version},tr));}}
    Ok((default_decision(set,&req.action),tr))
}
fn default_decision(set:&PolicySet,action:&str)->PolicyDecision { PolicyDecision{effect:if sensitive_action(action){PolicyEffect::Deny}else{PolicyEffect::Allow},reason_code:if sensitive_action(action){"POLICY_DEFAULT_DENY".into()}else{"POLICY_DEFAULT_ALLOW".into()},policy_id:set.policy_id.clone(),policy_version:set.version} }

pub fn effective_policy_view(set:&PolicySet,authorized_admin:bool)->Result<EffectivePolicyView,PolicyError>{if !authorized_admin{return Err(PolicyError::AdminTraceDenied);}validate_policy_set(set)?;Ok(EffectivePolicyView{policy_id:set.policy_id.clone(),version:set.version,ordered_rule_ids:ordered(set).into_iter().map(|r|r.id.clone()).collect()})}

#[derive(Debug)]
pub struct PolicyPermit { action: ActionBoundary, policy_id:String, version:u64 }
impl PolicyPermit { pub fn boundary(&self)->ActionBoundary{self.action} pub fn policy_id(&self)->&str{&self.policy_id} pub fn version(&self)->u64{self.version} }
pub fn authorize_boundary(set:&PolicySet,boundary:ActionBoundary,subject:&str,resource:&str,context:std::collections::BTreeMap<String,String>)->Result<PolicyPermit,PolicyError>{let d=evaluate(set,&PolicyRequest{subject:subject.into(),action:boundary.action().into(),resource:resource.into(),context})?;if d.effect!=PolicyEffect::Allow{return Err(PolicyError::DeniedOpaque(d.reason_code));}Ok(PolicyPermit{action:boundary,policy_id:d.policy_id,version:d.policy_version})}
pub fn require_boundary_permit(permit:&PolicyPermit,expected:ActionBoundary)->Result<(),PolicyError>{if permit.action!=expected{return Err(PolicyError::DeniedOpaque("POLICY_BOUNDARY_MISMATCH".into()));}Ok(())}
