use crate::{
    AutomationRuntimeError, AUTOMATION_IR_SCHEMA, MAX_EDGES, MAX_FLOW_BYTES, MAX_LOOP_ITERATIONS,
    MAX_NODES,
};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ValueType {
    String,
    Number,
    Boolean,
    Datetime,
    Object,
    Array,
    WorkspaceRef,
    SecretHandle,
    BinaryHandle,
    Null,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TypedPort {
    pub id: String,
    pub value_type: ValueType,
    pub required: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum NodeKind {
    Trigger,
    Action,
    Condition,
    Switch,
    Parallel,
    Approval,
    Transform,
    Subflow,
    BoundedLoop,
    Finally,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BoundedLoop {
    pub max_iterations: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FlowNode {
    pub id: String,
    pub node_version: u16,
    pub kind: NodeKind,
    #[serde(default)]
    pub inputs: Vec<TypedPort>,
    #[serde(default)]
    pub outputs: Vec<TypedPort>,
    #[serde(default)]
    pub loop_policy: Option<BoundedLoop>,
    #[serde(default)]
    pub config: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct FlowEdge {
    pub id: String,
    pub from: String,
    pub to: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FlowIr {
    pub schema: String,
    pub flow_id: String,
    pub flow_version: u64,
    pub nodes: Vec<FlowNode>,
    pub edges: Vec<FlowEdge>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ActivatedFlow {
    pub flow_id: String,
    pub flow_version: u64,
    pub activation_digest: String,
    pub deterministic_order: Vec<String>,
}

fn valid_id(value: &str) -> bool {
    let len = value.len();
    (1..=128).contains(&len)
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b':' | b'-'))
}

pub fn deterministic_node_id(
    flow_id: &str,
    semantic_key: &str,
) -> Result<String, AutomationRuntimeError> {
    if !valid_id(flow_id) || semantic_key.is_empty() || semantic_key.len() > 512 {
        return Err(AutomationRuntimeError::InvalidInput);
    }
    use sha2::{Digest, Sha256};
    let mut h = Sha256::new();
    h.update(b"vgt-automation-node-id\0");
    h.update(flow_id.as_bytes());
    h.update(b"\0");
    h.update(semantic_key.as_bytes());
    let digest = h.finalize();
    Ok(format!(
        "node-{}",
        digest[..12]
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect::<String>()
    ))
}

pub fn validate_and_activate(
    flow: &FlowIr,
    supported_node_versions: &BTreeMap<String, u16>,
) -> Result<ActivatedFlow, AutomationRuntimeError> {
    let bytes = serde_json::to_vec(flow).map_err(|_| AutomationRuntimeError::InvalidInput)?;
    if bytes.len() > MAX_FLOW_BYTES
        || flow.schema != AUTOMATION_IR_SCHEMA
        || !valid_id(&flow.flow_id)
        || flow.flow_version == 0
    {
        return Err(AutomationRuntimeError::InvalidInput);
    }
    if flow.nodes.is_empty() || flow.nodes.len() > MAX_NODES || flow.edges.len() > MAX_EDGES {
        return Err(AutomationRuntimeError::LimitExceeded);
    }
    let mut ids = BTreeSet::new();
    let mut nodes = BTreeMap::new();
    for node in &flow.nodes {
        if !valid_id(&node.id) || !ids.insert(node.id.clone()) {
            return Err(AutomationRuntimeError::InvalidInput);
        }
        if node.inputs.len() > 64 || node.outputs.len() > 64 {
            return Err(AutomationRuntimeError::LimitExceeded);
        }
        let version_key = format!("{:?}", node.kind).to_ascii_lowercase();
        if node.node_version == 0
            || supported_node_versions
                .get(&version_key)
                .copied()
                .unwrap_or(0)
                < node.node_version
        {
            return Err(AutomationRuntimeError::UnsupportedVersion);
        }
        if matches!(node.kind, NodeKind::BoundedLoop) {
            let max = node
                .loop_policy
                .as_ref()
                .map(|p| p.max_iterations)
                .unwrap_or(0);
            if max == 0 || max > MAX_LOOP_ITERATIONS {
                return Err(AutomationRuntimeError::LimitExceeded);
            }
        } else if node.loop_policy.is_some() {
            return Err(AutomationRuntimeError::InvalidInput);
        }
        nodes.insert(node.id.clone(), node);
    }
    let mut incoming: BTreeMap<String, usize> = nodes.keys().map(|id| (id.clone(), 0)).collect();
    let mut outgoing: BTreeMap<String, Vec<String>> = BTreeMap::new();
    let mut edge_ids = BTreeSet::new();
    for edge in &flow.edges {
        if !valid_id(&edge.id)
            || !edge_ids.insert(edge.id.clone())
            || !nodes.contains_key(&edge.from)
            || !nodes.contains_key(&edge.to)
            || edge.from == edge.to
        {
            return Err(AutomationRuntimeError::InvalidInput);
        }
        if matches!(nodes[&edge.to].kind, NodeKind::BoundedLoop) {
            continue;
        }
        *incoming
            .get_mut(&edge.to)
            .ok_or(AutomationRuntimeError::InvalidInput)? += 1;
        outgoing
            .entry(edge.from.clone())
            .or_default()
            .push(edge.to.clone());
    }
    let mut ready: BTreeSet<String> = incoming
        .iter()
        .filter(|(_, n)| **n == 0)
        .map(|(id, _)| id.clone())
        .collect();
    let mut order = Vec::with_capacity(nodes.len());
    while let Some(id) = ready.iter().next().cloned() {
        ready.remove(&id);
        order.push(id.clone());
        if let Some(nexts) = outgoing.get(&id) {
            for next in nexts {
                let count = incoming
                    .get_mut(next)
                    .ok_or(AutomationRuntimeError::InvalidInput)?;
                *count -= 1;
                if *count == 0 {
                    ready.insert(next.clone());
                }
            }
        }
    }
    if order.len() != nodes.len() {
        return Err(AutomationRuntimeError::CycleRejected);
    }
    let digest = sha256_hex(&bytes);
    Ok(ActivatedFlow {
        flow_id: flow.flow_id.clone(),
        flow_version: flow.flow_version,
        activation_digest: digest,
        deterministic_order: order,
    })
}

fn sha256_hex(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    let mut h = Sha256::new();
    h.update(bytes);
    h.finalize().iter().map(|b| format!("{b:02x}")).collect()
}
