use crate::{AutomationRuntimeError, RunLimits};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum SandboxKind {
    ImportlessWasm,
    OutOfProcessRpa,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SandboxPermit {
    pub kind: SandboxKind,
    pub worker_id: String,
    pub limits: RunLimits,
    pub filesystem: bool,
    pub network: bool,
    pub key_access: bool,
    pub clipboard: bool,
}
impl SandboxPermit {
    pub fn validate(&self) -> Result<(), AutomationRuntimeError> {
        self.limits.validate()?;
        if self.worker_id.is_empty()
            || self.worker_id.len() > 128
            || self.filesystem
            || self.network
            || self.key_access
            || self.clipboard
        {
            return Err(AutomationRuntimeError::SandboxRejected);
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ProposedWorkspaceOperation {
    pub operation_kind: String,
    pub object_id: String,
    pub value: serde_json::Value,
    pub idempotency_key: String,
}
pub trait WorkspaceOperationValidator {
    fn validate_proposed_operation(
        &self,
        operation: &ProposedWorkspaceOperation,
    ) -> Result<(), AutomationRuntimeError>;
}
pub fn validate_before_commit<V: WorkspaceOperationValidator>(
    validator: &V,
    ops: &[ProposedWorkspaceOperation],
) -> Result<(), AutomationRuntimeError> {
    if ops.len() > 256 {
        return Err(AutomationRuntimeError::LimitExceeded);
    }
    for op in ops {
        if op.operation_kind.is_empty()
            || op.operation_kind.len() > 64
            || op.object_id.is_empty()
            || op.object_id.len() > 256
            || op.idempotency_key.len() > 256
        {
            return Err(AutomationRuntimeError::InvalidInput);
        }
        validator.validate_proposed_operation(op)?;
    }
    Ok(())
}

#[derive(Debug, Default)]
pub struct WorkerSupervisor {
    killed: std::collections::BTreeSet<String>,
}
impl WorkerSupervisor {
    pub fn kill_hung(&mut self, worker_id: &str) -> Result<(), AutomationRuntimeError> {
        if worker_id.is_empty() || worker_id.len() > 128 {
            return Err(AutomationRuntimeError::InvalidInput);
        }
        self.killed.insert(worker_id.to_string());
        Ok(())
    }
    pub fn is_killed(&self, worker_id: &str) -> bool {
        self.killed.contains(worker_id)
    }
}
