// 💠 DIAMANT VGT SUPREME STATUS
//! Astraea authoritative declarative Policy Engine.
//! No arbitrary policy code is executed. Sensitive actions are deny-by-default.

pub mod audit; pub mod bundle; pub mod engine; pub mod lifecycle; pub mod model;
pub use audit::*; pub use bundle::*; pub use engine::*; pub use lifecycle::*; pub use model::*;
use chrono::Utc;
use serde::{Deserialize,Serialize};
use std::collections::HashSet;
use thiserror::Error;

#[derive(Error,Debug,PartialEq,Eq)]pub enum PolicyError{
 #[error("policy input invalid: {0}")]InvalidInput(String),#[error("policy schema unsupported")]InvalidSchema,
 #[error("policy decision denied")]DeniedOpaque(String),#[error("policy admin trace denied")]AdminTraceDenied,
 #[error("policy version missing")]VersionMissing,#[error("policy operation cancelled")]Cancelled,#[error("policy bundle invalid")]BundleInvalid,
 #[error("policy bundle signature invalid")]BundleSignature,#[error("policy bundle signer mismatch")]BundleSignerMismatch,
 #[error("export denied")]ExportForbidden(DataClassification),#[error("plugin denied")]UnapprovedPlugin(String),
}

#[derive(Debug,Clone,Copy,Default,PartialEq,Eq,PartialOrd,Ord,Serialize,Deserialize)]pub enum DataClassification{Public=0,#[default]Internal=1,Confidential=2,StrictSovereign=3}
#[derive(Debug,Clone,Copy,Default,PartialEq,Eq,Serialize,Deserialize)]pub enum UpdatePolicy{#[default]OfflineManualOnly,SignedPackagesOnly,EnterpriseRepoOnly}
#[derive(Debug,Clone,Serialize,Deserialize,PartialEq)]pub struct PolicyAuditRecord{pub timestamp_utc:i64,pub rule_id:String,pub subject:String,pub allowed:bool,pub reason:String}

/// Compatibility facade for older CLI callers. New policy decisions use PolicySet/evaluate().
#[derive(Debug,Clone,Serialize,Deserialize)]pub struct PolicyEngine{pub organization_name:String,pub allow_plaintext_export:bool,pub max_exportable_classification:DataClassification,pub approved_plugins:HashSet<String>,pub update_policy:UpdatePolicy,pub audit_log:Vec<PolicyAuditRecord>}
impl Default for PolicyEngine{fn default()->Self{Self{organization_name:"Default Sovereign Workspace".into(),allow_plaintext_export:true,max_exportable_classification:DataClassification::Internal,approved_plugins:HashSet::new(),update_policy:UpdatePolicy::OfflineManualOnly,audit_log:Vec::new()}}}
impl PolicyEngine{pub fn new(org_name:&str)->Self{Self{organization_name:org_name.chars().take(256).collect(),..Default::default()}}pub fn allow_plugin(&mut self,id:&str){if !id.is_empty()&&id.len()<=256{self.approved_plugins.insert(id.into());}}pub fn check_plugin_execution(&mut self,id:&str)->Result<(),PolicyError>{let ok=self.approved_plugins.contains(id);self.log("POL_PLUGIN_LEGACY",id,ok);if ok{Ok(())}else{Err(PolicyError::UnapprovedPlugin(id.into()))}}pub fn check_export_permitted(&mut self,id:&str,c:DataClassification)->Result<(),PolicyError>{let ok=self.allow_plaintext_export&&c<=self.max_exportable_classification;self.log("POL_EXPORT_LEGACY",id,ok);if ok{Ok(())}else{Err(PolicyError::ExportForbidden(c))}}fn log(&mut self,rule:&str,subject:&str,allowed:bool){if self.audit_log.len()>=1024{self.audit_log.remove(0);}self.audit_log.push(PolicyAuditRecord{timestamp_utc:Utc::now().timestamp_millis(),rule_id:rule.into(),subject:subject.chars().take(128).collect(),allowed,reason:if allowed{"allowed".into()}else{"denied".into()}})}}
