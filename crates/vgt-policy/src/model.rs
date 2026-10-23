// 💠 DIAMANT VGT SUPREME STATUS
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub const POLICY_SCHEMA: &str = "vgt.workspace.policy/2";
pub const MAX_POLICY_RULES: usize = 4096;
pub const MAX_POLICY_TEXT: usize = 512;
pub const MAX_POLICY_CONTEXT: usize = 64;
pub const MAX_REASON_CODE: usize = 96;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum PolicyScopeKind { Machine, Organization, Space, App, User }
impl PolicyScopeKind {
    pub fn precedence(self) -> u16 { match self { Self::Machine=>500, Self::Organization=>400, Self::Space=>300, Self::App=>200, Self::User=>100 } }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PolicyScope { pub kind: PolicyScopeKind, pub id: String }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum PolicyEffect { Allow, Deny, RequireApproval }

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case", tag = "op", content = "value")]
pub enum PolicyCondition {
    Equals { key: String, expected: String },
    NotEquals { key: String, expected: String },
    OneOf { key: String, expected: Vec<String> },
    Exists { key: String },
    ClassificationAtMost { key: String, ceiling: u8 },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PolicyRule {
    pub id: String,
    pub subject: String,
    pub resource: String,
    pub action: String,
    #[serde(default)] pub conditions: Vec<PolicyCondition>,
    pub effect: PolicyEffect,
    #[serde(default)] pub priority: i32,
    pub scope: PolicyScope,
    pub rationale: String,
    pub reason_code: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum PolicyVersionState { Draft, Test, Published }

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PolicySet {
    pub schema: String,
    pub policy_id: String,
    pub version: u64,
    pub state: PolicyVersionState,
    #[serde(default)] pub rollout_percent: u8,
    #[serde(default)] pub rules: Vec<PolicyRule>,
}
impl PolicySet {
    pub fn new(policy_id: impl Into<String>, version: u64, state: PolicyVersionState, rules: Vec<PolicyRule>) -> Self {
        Self { schema: POLICY_SCHEMA.into(), policy_id: policy_id.into(), version, state, rollout_percent: 100, rules }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PolicyRequest {
    pub subject: String,
    pub action: String,
    pub resource: String,
    #[serde(default)] pub context: BTreeMap<String, String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PolicyDecision {
    pub effect: PolicyEffect,
    pub reason_code: String,
    pub policy_id: String,
    pub policy_version: u64,
}
impl PolicyDecision { pub fn allowed(&self) -> bool { self.effect == PolicyEffect::Allow } }

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PolicyTraceEntry { pub rule_id: String, pub matched: bool, pub effect: PolicyEffect, pub priority: i32, pub scope_precedence: u16 }
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EffectivePolicyView { pub policy_id: String, pub version: u64, pub ordered_rule_ids: Vec<String> }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ActionBoundary {
    FileImport, FileExport, NetworkConnector, PluginInstall, PluginExecute, AutomationActivate,
    AutomationDispatch, Sharing, KeyPolicy, ClipboardRead, ClipboardWrite, Print, SpaceAccess,
}
impl ActionBoundary {
    pub fn action(self) -> &'static str { match self {
        Self::FileImport=>"file.import", Self::FileExport=>"file.export", Self::NetworkConnector=>"network.connector",
        Self::PluginInstall=>"plugin.install", Self::PluginExecute=>"plugin.execute", Self::AutomationActivate=>"automation.activate",
        Self::AutomationDispatch=>"automation.dispatch", Self::Sharing=>"sharing.write", Self::KeyPolicy=>"key.policy",
        Self::ClipboardRead=>"clipboard.read", Self::ClipboardWrite=>"clipboard.write", Self::Print=>"print.execute", Self::SpaceAccess=>"space.access",
    }}
}

pub fn sensitive_action(action: &str) -> bool {
    matches!(action, "file.import"|"file.export"|"network.connector"|"plugin.install"|"plugin.execute"|"automation.activate"|"automation.dispatch"|"sharing.write"|"key.policy"|"clipboard.read"|"clipboard.write"|"print.execute"|"space.access")
}

pub trait PolicyCancellationCheck{fn cancelled(&self)->bool;}
pub struct NeverCancel;impl PolicyCancellationCheck for NeverCancel{fn cancelled(&self)->bool{false}}
