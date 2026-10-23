//! Astraea Workspace authoritative Automation Runtime Core.
//!
//! The browser may design flows and display run state. Activation, scheduling,
//! retry/idempotency semantics, durable checkpoints and host-boundary policy live here.

pub mod checkpoint;
pub mod execution;
pub mod ir;
pub mod sandbox;
pub mod scheduler;

pub use checkpoint::*;
pub use execution::*;
pub use ir::*;
pub use sandbox::*;
pub use scheduler::*;

pub const AUTOMATION_IR_SCHEMA: &str = "vgt.workspace.automation-ir/1";
pub const AUTOMATION_CHECKPOINT_SCHEMA: &str = "vgt.workspace.automation-checkpoint/1";
pub const MAX_FLOW_BYTES: usize = 2 * 1024 * 1024;
pub const MAX_NODES: usize = 512;
pub const MAX_EDGES: usize = 4096;
pub const MAX_LOOP_ITERATIONS: u32 = 10_000;
pub const MAX_QUEUED_RUNS: usize = 10_000;
pub const MAX_CONCURRENCY: u16 = 64;
pub const MAX_RUN_MS: u64 = 60 * 60 * 1000;
pub const MAX_CPU_MS: u64 = 15 * 60 * 1000;
pub const MAX_MEMORY_BYTES: u64 = 256 * 1024 * 1024;
pub const MAX_OUTPUT_BYTES: u64 = 16 * 1024 * 1024;
pub const MAX_CHECKPOINT_BYTES: usize = 8 * 1024 * 1024;
pub const MAX_CAPABILITY_HANDLES: usize = 64;
pub const MAX_HISTORY_ENTRIES: usize = 4096;

#[derive(thiserror::Error, Debug, Clone, PartialEq, Eq)]
pub enum AutomationRuntimeError {
    #[error("automation-invalid-input")]
    InvalidInput,
    #[error("automation-version-unsupported")]
    UnsupportedVersion,
    #[error("automation-cycle-rejected")]
    CycleRejected,
    #[error("automation-limit-exceeded")]
    LimitExceeded,
    #[error("automation-cancelled")]
    Cancelled,
    #[error("automation-deadline-exceeded")]
    DeadlineExceeded,
    #[error("automation-capability-denied")]
    CapabilityDenied,
    #[error("automation-retry-unsafe")]
    RetryUnsafe,
    #[error("automation-checkpoint-rejected")]
    CheckpointRejected,
    #[error("automation-resume-assumption-changed")]
    ResumeAssumptionChanged,
    #[error("automation-host-validation-rejected")]
    HostValidationRejected,
    #[error("automation-sandbox-rejected")]
    SandboxRejected,
    #[error("automation-crypto-failed")]
    CryptoFailed,
}
