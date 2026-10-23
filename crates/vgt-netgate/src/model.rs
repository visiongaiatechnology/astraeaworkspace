//! STATUS: DIAMANT VGT SUPREME
use serde::{Deserialize, Serialize};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use thiserror::Error;

#[derive(Error, Debug, Clone, PartialEq, Eq)]
pub enum NetGateError {
    #[error("network request denied")]
    AccessDenied,
    #[error("network capability invalid")]
    InvalidCapability,
    #[error("network destination invalid")]
    InvalidDestination,
    #[error("network destination resolution failed")]
    ResolutionFailed,
    #[error("network request exceeded policy limits")]
    ResourceLimit,
    #[error("network request exceeded policy rate limit")]
    RateLimit,
    #[error("network policy state unavailable")]
    PolicyState,
    #[error("network request cancelled")]
    Cancelled,
    #[error("HTTP request invalid")]
    InvalidHttpRequest,
    #[error("TLS verification policy invalid")]
    TlsPolicyViolation,
    #[error("enterprise egress proxy policy rejected the request")]
    ProxyPolicyViolation,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum NetworkCapability {
    #[default]
    None,
    LocalLanOnly,
    WhitelistedOnly,
    FullUserApproved,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum NetworkProtocol {
    Tcp,
    Http,
    Https,
    Udp,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum NetworkDirection {
    Outbound,
    Inbound,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum NetworkDataClass {
    Public,
    Metadata,
    UserContent,
    SecretMaterial,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum DestinationClass {
    Loopback,
    PrivateLan,
    LinkLocal,
    PublicInternet,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ConnectionVerdict {
    Allowed,
    BlockedByDefault,
    BlockedTelemetryBlacklist,
    BlockedUserPolicy,
    BlockedResolution,
    BlockedRateLimit,
    BlockedResourceLimit,
    BlockedExpiredCapability,
    BlockedTlsPolicy,
    BlockedCancelled,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct NetworkLimits {
    pub max_requests_per_minute: u32,
    pub max_request_bytes: u64,
    pub max_response_bytes: u64,
    pub timeout_ms: u64,
}
impl Default for NetworkLimits {
    fn default() -> Self {
        Self {
            max_requests_per_minute: 30,
            max_request_bytes: 8 * 1024 * 1024,
            max_response_bytes: 32 * 1024 * 1024,
            timeout_ms: 15_000,
        }
    }
}
impl NetworkLimits {
    pub(crate) fn validate(&self) -> Result<(), NetGateError> {
        if self.max_requests_per_minute == 0
            || self.max_requests_per_minute > 10_000
            || self.max_request_bytes > 512 * 1024 * 1024
            || self.max_response_bytes > 1024 * 1024 * 1024
            || self.timeout_ms == 0
            || self.timeout_ms > 120_000
        {
            return Err(NetGateError::InvalidCapability);
        }
        Ok(())
    }
}

/// A grant is the only source of network authority in NetGate.
/// Hostnames are exact canonical matches. CIDRs are parsed as real IP networks and are never
/// interpreted with string-prefix shortcuts.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct NetworkCapabilityGrant {
    pub id: String,
    pub component_id: String,
    pub document_id: Option<String>,
    #[serde(default)]
    pub automation_id: Option<String>,
    pub purpose: String,
    pub allowed_hosts: Vec<String>,
    #[serde(default)]
    pub allowed_cidrs: Vec<String>,
    pub allowed_ports: Vec<u16>,
    pub protocols: Vec<NetworkProtocol>,
    pub directions: Vec<NetworkDirection>,
    pub data_classes: Vec<NetworkDataClass>,
    pub destination_classes: Vec<DestinationClass>,
    pub methods: Vec<String>,
    pub expires_at_utc_ms: Option<i64>,
    pub limits: NetworkLimits,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct NetworkRequest {
    pub component_id: String,
    pub document_id: Option<String>,
    #[serde(default)]
    pub automation_id: Option<String>,
    pub target_host: String,
    pub target_port: u16,
    pub protocol: NetworkProtocol,
    pub direction: NetworkDirection,
    pub data_class: NetworkDataClass,
    pub purpose: String,
    pub method: Option<String>,
    pub expected_request_bytes: u64,
    pub expected_response_bytes: u64,
    pub timeout_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PolicyDecision {
    pub audit_id: Option<u64>,
    pub verdict: ConnectionVerdict,
    pub capability_id: Option<String>,
    pub canonical_host: String,
    pub destination_classes: Vec<DestinationClass>,
    pub effective_limits: Option<NetworkLimits>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NetworkPreflight {
    pub(crate) canonical_host: String,
}
impl NetworkPreflight {
    pub fn canonical_host(&self) -> &str {
        &self.canonical_host
    }
}

/// Sanitized normalized view intended for permission review before a grant is installed.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CapabilityInspection {
    pub id: String,
    pub component_id: String,
    pub document_id: Option<String>,
    pub automation_id: Option<String>,
    pub purpose: String,
    pub allowed_hosts: Vec<String>,
    pub allowed_cidrs: Vec<String>,
    pub allowed_ports: Vec<u16>,
    pub protocols: Vec<NetworkProtocol>,
    pub directions: Vec<NetworkDirection>,
    pub data_classes: Vec<NetworkDataClass>,
    pub destination_classes: Vec<DestinationClass>,
    pub methods: Vec<String>,
    pub expires_at_utc_ms: Option<i64>,
    pub limits: NetworkLimits,
}

impl From<NetworkCapabilityGrant> for CapabilityInspection {
    fn from(grant: NetworkCapabilityGrant) -> Self {
        Self {
            id: grant.id,
            component_id: grant.component_id,
            document_id: grant.document_id,
            automation_id: grant.automation_id,
            purpose: grant.purpose,
            allowed_hosts: grant.allowed_hosts,
            allowed_cidrs: grant.allowed_cidrs,
            allowed_ports: grant.allowed_ports,
            protocols: grant.protocols,
            directions: grant.directions,
            data_classes: grant.data_classes,
            destination_classes: grant.destination_classes,
            methods: grant.methods,
            expires_at_utc_ms: grant.expires_at_utc_ms,
            limits: grant.limits,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct NetworkAuditLogEntry {
    pub id: u64,
    pub timestamp_utc: i64,
    pub component_id: String,
    pub document_id: Option<String>,
    pub automation_id: Option<String>,
    pub target_host: String,
    pub target_port: u16,
    pub protocol: NetworkProtocol,
    pub direction: NetworkDirection,
    pub data_class: NetworkDataClass,
    /// Bounded human-readable purpose label. Payloads, headers, URLs-with-query and credentials are
    /// never stored in the audit journal.
    pub purpose: String,
    pub verdict: ConnectionVerdict,
    pub capability_id: Option<String>,
    pub destination_classes: Vec<DestinationClass>,
    pub bytes_sent: u64,
    pub bytes_received: u64,
}

/// Cheap cooperative cancellation shared by DNS, connect and HTTP policy stages.
#[derive(Debug, Clone, Default)]
pub struct CancellationToken(Arc<AtomicBool>);
impl CancellationToken {
    pub fn new() -> Self {
        Self::default()
    }
    pub fn cancel(&self) {
        self.0.store(true, Ordering::Release);
    }
    pub fn is_cancelled(&self) -> bool {
        self.0.load(Ordering::Acquire)
    }
    pub(crate) fn check(&self) -> Result<(), NetGateError> {
        if self.is_cancelled() {
            Err(NetGateError::Cancelled)
        } else {
            Ok(())
        }
    }
}
