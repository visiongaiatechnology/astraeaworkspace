//! STATUS: DIAMANT VGT SUPREME
use crate::capability::{
    compatibility_grant, exceeds_limits, grant_matches, grant_matches_pre_dns, scope_matches,
    validate_capability, validate_request,
};
use crate::destination::{
    canonicalize_host, destination_classes, hard_denied_host, normalized_destination_ips,
};
use crate::model::*;
use chrono::Utc;
use std::collections::{HashMap, VecDeque};
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};
use std::sync::{Arc, Mutex};

const MAX_AUDIT_ENTRIES: usize = 1_024;
const MAX_CAPABILITIES: usize = 512;

#[derive(Clone)]
pub struct NetGate {
    compatibility_capability: NetworkCapability,
    capabilities: Arc<Mutex<Vec<NetworkCapabilityGrant>>>,
    audit_log: Arc<Mutex<VecDeque<NetworkAuditLogEntry>>>,
    counter: Arc<Mutex<u64>>,
    rate_windows: Arc<Mutex<HashMap<String, VecDeque<i64>>>>,
    proxy_policy: Arc<Mutex<Option<crate::EgressProxyPolicy>>>,
}

impl std::fmt::Debug for NetGate {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("NetGate")
            .field("compatibility_capability", &self.compatibility_capability)
            .finish_non_exhaustive()
    }
}

impl Default for NetGate {
    fn default() -> Self {
        Self::new()
    }
}

impl NetGate {
    pub fn new() -> Self {
        Self {
            compatibility_capability: NetworkCapability::None,
            capabilities: Arc::new(Mutex::new(Vec::new())),
            audit_log: Arc::new(Mutex::new(VecDeque::new())),
            counter: Arc::new(Mutex::new(1)),
            rate_windows: Arc::new(Mutex::new(HashMap::new())),
            proxy_policy: Arc::new(Mutex::new(None)),
        }
    }

    pub fn set_egress_proxy(
        &self,
        policy: Option<crate::EgressProxyPolicy>,
    ) -> Result<(), NetGateError> {
        *self
            .proxy_policy
            .lock()
            .map_err(|_| NetGateError::PolicyState)? = policy;
        Ok(())
    }

    pub fn egress_proxy(&self) -> Result<Option<crate::EgressProxyPolicy>, NetGateError> {
        self.proxy_policy
            .lock()
            .map_err(|_| NetGateError::PolicyState)
            .map(|value| value.clone())
    }

    /// Authorize a hostname-bound request for a remote-DNS enterprise proxy. No destination DNS
    /// lookup is performed locally. Therefore the grant MUST name the exact hostname; CIDR-only
    /// authority cannot be evaluated safely in this mode and fails closed.
    pub fn evaluate_proxy_request(
        &self,
        request: &NetworkRequest,
    ) -> Result<PolicyDecision, NetGateError> {
        let host = canonicalize_host(&request.target_host)?;
        validate_request(request)?;
        if hard_denied_host(&host) {
            return self.deny(
                request,
                &host,
                Vec::new(),
                ConnectionVerdict::BlockedTelemetryBlacklist,
                NetGateError::AccessDenied,
            );
        }
        let capabilities = self
            .capabilities
            .lock()
            .map_err(|_| NetGateError::PolicyState)?
            .clone();
        let now = Utc::now().timestamp_millis();
        let mut expired_match = false;
        let mut scoped_policy_exists = false;
        for capability in capabilities {
            if !scope_matches(&capability, request) {
                continue;
            }
            scoped_policy_exists = true;
            if !capability
                .allowed_hosts
                .iter()
                .any(|candidate| candidate == &host)
            {
                continue;
            }
            if !grant_matches_pre_dns(&capability, request, &host)? {
                continue;
            }
            if capability
                .expires_at_utc_ms
                .is_some_and(|expiry| expiry <= now)
            {
                expired_match = true;
                continue;
            }
            if exceeds_limits(request, capability.limits) {
                return self.deny(
                    request,
                    &host,
                    Vec::new(),
                    ConnectionVerdict::BlockedResourceLimit,
                    NetGateError::ResourceLimit,
                );
            }
            if !self.consume_rate(
                &capability.id,
                capability.limits.max_requests_per_minute,
                now,
            )? {
                return self.deny(
                    request,
                    &host,
                    Vec::new(),
                    ConnectionVerdict::BlockedRateLimit,
                    NetGateError::RateLimit,
                );
            }
            let mut decision = PolicyDecision {
                audit_id: None,
                verdict: ConnectionVerdict::Allowed,
                capability_id: Some(capability.id.clone()),
                canonical_host: host.clone(),
                destination_classes: Vec::new(),
                effective_limits: Some(capability.limits),
            };
            decision.audit_id = Some(self.log_entry(request, &decision, 0, 0)?);
            return Ok(decision);
        }
        self.deny(
            request,
            &host,
            Vec::new(),
            if expired_match {
                ConnectionVerdict::BlockedExpiredCapability
            } else if scoped_policy_exists {
                ConnectionVerdict::BlockedUserPolicy
            } else {
                ConnectionVerdict::BlockedByDefault
            },
            NetGateError::AccessDenied,
        )
    }

    pub fn set_capability(&mut self, capability: NetworkCapability) {
        self.compatibility_capability = capability;
    }

    pub fn capability(&self) -> NetworkCapability {
        self.compatibility_capability
    }

    pub fn register_capability(
        &self,
        mut grant: NetworkCapabilityGrant,
    ) -> Result<(), NetGateError> {
        validate_capability(&mut grant)?;
        let mut capabilities = self
            .capabilities
            .lock()
            .map_err(|_| NetGateError::PolicyState)?;
        if capabilities.len() >= MAX_CAPABILITIES
            || capabilities.iter().any(|existing| existing.id == grant.id)
        {
            return Err(NetGateError::InvalidCapability);
        }
        capabilities.push(grant);
        Ok(())
    }

    pub fn replace_capabilities(
        &self,
        mut grants: Vec<NetworkCapabilityGrant>,
    ) -> Result<(), NetGateError> {
        if grants.len() > MAX_CAPABILITIES {
            return Err(NetGateError::ResourceLimit);
        }
        for grant in &mut grants {
            validate_capability(grant)?;
        }
        grants.sort_by(|a, b| a.id.cmp(&b.id));
        if grants.windows(2).any(|window| window[0].id == window[1].id) {
            return Err(NetGateError::InvalidCapability);
        }
        *self
            .capabilities
            .lock()
            .map_err(|_| NetGateError::PolicyState)? = grants;
        self.rate_windows
            .lock()
            .map_err(|_| NetGateError::PolicyState)?
            .clear();
        Ok(())
    }

    pub fn clear_capabilities(&self) {
        if let Ok(mut capabilities) = self.capabilities.lock() {
            capabilities.clear();
        }
        if let Ok(mut windows) = self.rate_windows.lock() {
            windows.clear();
        }
    }

    pub fn get_capabilities(&self) -> Vec<NetworkCapabilityGrant> {
        self.capabilities
            .lock()
            .map(|capabilities| capabilities.clone())
            .unwrap_or_default()
    }

    /// Validate and normalize a capability without installing it. This is the permission-review
    /// surface used by user/admin UI before a grant becomes effective.
    pub fn inspect_capability(
        &self,
        mut grant: NetworkCapabilityGrant,
    ) -> Result<CapabilityInspection, NetGateError> {
        validate_capability(&mut grant)?;
        Ok(grant.into())
    }

    /// Side-effect-free policy preview. It never performs DNS or opens a socket and therefore must
    /// not be used as transport authorization. Real connectors must call evaluate_request after DNS.
    pub fn preview_request(
        &self,
        request: &NetworkRequest,
    ) -> Result<PolicyDecision, NetGateError> {
        let capabilities = self
            .capabilities
            .lock()
            .map_err(|_| NetGateError::PolicyState)?
            .clone();
        self.preview_with_capabilities(request, &capabilities)
    }

    pub fn preview_compatibility_request(
        &self,
        request: &NetworkRequest,
    ) -> Result<PolicyDecision, NetGateError> {
        let host = canonicalize_host(&request.target_host)?;
        match self.compatibility_capability {
            NetworkCapability::None => Ok(PolicyDecision {
                audit_id: None,
                verdict: ConnectionVerdict::BlockedByDefault,
                capability_id: None,
                canonical_host: host,
                destination_classes: Vec::new(),
                effective_limits: None,
            }),
            NetworkCapability::WhitelistedOnly => self.preview_request(request),
            NetworkCapability::LocalLanOnly | NetworkCapability::FullUserApproved => {
                let grant = compatibility_grant(self.compatibility_capability, request, &host)?
                    .ok_or(NetGateError::AccessDenied)?;
                self.preview_with_capabilities(request, &[grant])
            }
        }
    }

    fn preview_with_capabilities(
        &self,
        request: &NetworkRequest,
        capabilities: &[NetworkCapabilityGrant],
    ) -> Result<PolicyDecision, NetGateError> {
        let host = canonicalize_host(&request.target_host)?;
        validate_request(request)?;
        if hard_denied_host(&host) {
            return Ok(PolicyDecision {
                audit_id: None,
                verdict: ConnectionVerdict::BlockedTelemetryBlacklist,
                capability_id: None,
                canonical_host: host,
                destination_classes: Vec::new(),
                effective_limits: None,
            });
        }
        let now = Utc::now().timestamp_millis();
        let mut expired_match = false;
        let mut scoped_policy_exists = false;
        for capability in capabilities {
            if !scope_matches(capability, request) {
                continue;
            }
            scoped_policy_exists = true;
            if !grant_matches_pre_dns(capability, request, &host)? {
                continue;
            }
            if capability
                .expires_at_utc_ms
                .is_some_and(|expiry| expiry <= now)
            {
                expired_match = true;
                continue;
            }
            if exceeds_limits(request, capability.limits) {
                return Ok(PolicyDecision {
                    audit_id: None,
                    verdict: ConnectionVerdict::BlockedResourceLimit,
                    capability_id: Some(capability.id.clone()),
                    canonical_host: host,
                    destination_classes: Vec::new(),
                    effective_limits: None,
                });
            }
            return Ok(PolicyDecision {
                audit_id: None,
                verdict: ConnectionVerdict::Allowed,
                capability_id: Some(capability.id.clone()),
                canonical_host: host,
                destination_classes: Vec::new(),
                effective_limits: Some(capability.limits),
            });
        }
        Ok(PolicyDecision {
            audit_id: None,
            verdict: if expired_match {
                ConnectionVerdict::BlockedExpiredCapability
            } else if scoped_policy_exists {
                ConnectionVerdict::BlockedUserPolicy
            } else {
                ConnectionVerdict::BlockedByDefault
            },
            capability_id: None,
            canonical_host: host,
            destination_classes: Vec::new(),
            effective_limits: None,
        })
    }

    /// Capability-only preflight. No DNS lookup is performed here.
    pub fn preflight_request(
        &self,
        request: &NetworkRequest,
    ) -> Result<NetworkPreflight, NetGateError> {
        let capabilities = self
            .capabilities
            .lock()
            .map_err(|_| NetGateError::PolicyState)?
            .clone();
        self.preflight_with_capabilities(request, &capabilities)
    }

    pub fn preflight_compatibility_request(
        &self,
        request: &NetworkRequest,
    ) -> Result<NetworkPreflight, NetGateError> {
        let host = canonicalize_host(&request.target_host)?;
        match self.compatibility_capability {
            NetworkCapability::None => self.deny(
                request,
                &host,
                Vec::new(),
                ConnectionVerdict::BlockedByDefault,
                NetGateError::AccessDenied,
            ),
            NetworkCapability::WhitelistedOnly => self.preflight_request(request),
            NetworkCapability::LocalLanOnly | NetworkCapability::FullUserApproved => {
                let grant = compatibility_grant(self.compatibility_capability, request, &host)?
                    .ok_or(NetGateError::AccessDenied)?;
                self.preflight_with_capabilities(request, &[grant])
            }
        }
    }

    fn preflight_with_capabilities(
        &self,
        request: &NetworkRequest,
        capabilities: &[NetworkCapabilityGrant],
    ) -> Result<NetworkPreflight, NetGateError> {
        let host = canonicalize_host(&request.target_host)?;
        validate_request(request)?;
        if hard_denied_host(&host) {
            return self.deny(
                request,
                &host,
                Vec::new(),
                ConnectionVerdict::BlockedTelemetryBlacklist,
                NetGateError::AccessDenied,
            );
        }

        let now = Utc::now().timestamp_millis();
        let mut expired_match = false;
        let mut scoped_policy_exists = false;
        for capability in capabilities {
            if !scope_matches(capability, request) {
                continue;
            }
            scoped_policy_exists = true;
            if !grant_matches_pre_dns(capability, request, &host)? {
                continue;
            }
            if capability
                .expires_at_utc_ms
                .is_some_and(|expiry| expiry <= now)
            {
                expired_match = true;
                continue;
            }
            if exceeds_limits(request, capability.limits) {
                return self.deny(
                    request,
                    &host,
                    Vec::new(),
                    ConnectionVerdict::BlockedResourceLimit,
                    NetGateError::ResourceLimit,
                );
            }
            return Ok(NetworkPreflight {
                canonical_host: host,
            });
        }

        self.deny(
            request,
            &host,
            Vec::new(),
            if expired_match {
                ConnectionVerdict::BlockedExpiredCapability
            } else if scoped_policy_exists {
                ConnectionVerdict::BlockedUserPolicy
            } else {
                ConnectionVerdict::BlockedByDefault
            },
            NetGateError::AccessDenied,
        )
    }

    pub fn evaluate_request(
        &self,
        request: &NetworkRequest,
        resolved_ips: &[IpAddr],
    ) -> Result<PolicyDecision, NetGateError> {
        let capabilities = self
            .capabilities
            .lock()
            .map_err(|_| NetGateError::PolicyState)?
            .clone();
        self.evaluate_with_capabilities(request, resolved_ips, &capabilities)
    }

    pub fn evaluate_compatibility_request(
        &self,
        request: &NetworkRequest,
        resolved_ips: &[IpAddr],
    ) -> Result<PolicyDecision, NetGateError> {
        let host = canonicalize_host(&request.target_host)?;
        match self.compatibility_capability {
            NetworkCapability::None => {
                let classes = normalized_destination_ips(&host, resolved_ips)
                    .map(|ips| destination_classes(&ips))
                    .unwrap_or_default();
                self.deny(
                    request,
                    &host,
                    classes,
                    ConnectionVerdict::BlockedByDefault,
                    NetGateError::AccessDenied,
                )
            }
            NetworkCapability::WhitelistedOnly => self.evaluate_request(request, resolved_ips),
            NetworkCapability::LocalLanOnly | NetworkCapability::FullUserApproved => {
                let grant = compatibility_grant(self.compatibility_capability, request, &host)?
                    .ok_or(NetGateError::AccessDenied)?;
                self.evaluate_with_capabilities(request, resolved_ips, &[grant])
            }
        }
    }

    fn evaluate_with_capabilities(
        &self,
        request: &NetworkRequest,
        resolved_ips: &[IpAddr],
        capabilities: &[NetworkCapabilityGrant],
    ) -> Result<PolicyDecision, NetGateError> {
        let host = canonicalize_host(&request.target_host)?;
        validate_request(request)?;
        if hard_denied_host(&host) {
            return self.deny(
                request,
                &host,
                Vec::new(),
                ConnectionVerdict::BlockedTelemetryBlacklist,
                NetGateError::AccessDenied,
            );
        }

        let ips = match normalized_destination_ips(&host, resolved_ips) {
            Ok(ips) => ips,
            Err(error) => {
                let _ = self.log_entry(
                    request,
                    &PolicyDecision {
                        audit_id: None,
                        verdict: ConnectionVerdict::BlockedResolution,
                        capability_id: None,
                        canonical_host: host.clone(),
                        destination_classes: Vec::new(),
                        effective_limits: None,
                    },
                    0,
                    0,
                );
                return Err(error);
            }
        };
        let classes = destination_classes(&ips);
        let now = Utc::now().timestamp_millis();
        let mut expired_match = false;
        let mut scoped_policy_exists = false;

        for capability in capabilities {
            if !scope_matches(capability, request) {
                continue;
            }
            scoped_policy_exists = true;
            if !grant_matches_pre_dns(capability, request, &host)? {
                continue;
            }
            if capability
                .expires_at_utc_ms
                .is_some_and(|expiry| expiry <= now)
            {
                expired_match = true;
                continue;
            }
            if !grant_matches(capability, request, &host, &ips, &classes)? {
                continue;
            }
            if exceeds_limits(request, capability.limits) {
                return self.deny(
                    request,
                    &host,
                    classes,
                    ConnectionVerdict::BlockedResourceLimit,
                    NetGateError::ResourceLimit,
                );
            }
            if !self.consume_rate(
                &capability.id,
                capability.limits.max_requests_per_minute,
                now,
            )? {
                return self.deny(
                    request,
                    &host,
                    classes,
                    ConnectionVerdict::BlockedRateLimit,
                    NetGateError::RateLimit,
                );
            }

            let mut decision = PolicyDecision {
                audit_id: None,
                verdict: ConnectionVerdict::Allowed,
                capability_id: Some(capability.id.clone()),
                canonical_host: host.clone(),
                destination_classes: classes.clone(),
                effective_limits: Some(capability.limits),
            };
            decision.audit_id = Some(self.log_entry(request, &decision, 0, 0)?);
            return Ok(decision);
        }

        self.deny(
            request,
            &host,
            classes,
            if expired_match {
                ConnectionVerdict::BlockedExpiredCapability
            } else if scoped_policy_exists {
                ConnectionVerdict::BlockedUserPolicy
            } else {
                ConnectionVerdict::BlockedByDefault
            },
            NetGateError::AccessDenied,
        )
    }

    /// Compatibility API used by older tests/UI previews. New connectors should use explicit grants.
    pub fn evaluate_connection(
        &self,
        component_id: &str,
        target_host: &str,
        target_port: u16,
        protocol: &str,
        purpose: &str,
    ) -> Result<(), NetGateError> {
        let protocol = match protocol.to_ascii_uppercase().as_str() {
            "HTTP" => NetworkProtocol::Http,
            "HTTPS" => NetworkProtocol::Https,
            "UDP" => NetworkProtocol::Udp,
            _ => NetworkProtocol::Tcp,
        };
        let request = NetworkRequest {
            component_id: component_id.to_string(),
            document_id: None,
            automation_id: None,
            target_host: target_host.to_string(),
            target_port,
            protocol,
            direction: NetworkDirection::Outbound,
            data_class: NetworkDataClass::Metadata,
            purpose: purpose.to_string(),
            method: if matches!(protocol, NetworkProtocol::Http | NetworkProtocol::Https) {
                Some("GET".to_string())
            } else {
                None
            },
            expected_request_bytes: 0,
            expected_response_bytes: 0,
            timeout_ms: 5_000,
        };
        let host = canonicalize_host(target_host)?;
        let resolved_ips = if host.parse::<IpAddr>().is_ok() {
            Vec::new()
        } else if host == "localhost" {
            vec![
                IpAddr::V4(Ipv4Addr::LOCALHOST),
                IpAddr::V6(Ipv6Addr::LOCALHOST),
            ]
        } else {
            Vec::new()
        };
        self.evaluate_compatibility_request(&request, &resolved_ips)
            .map(|_| ())
    }

    pub fn record_transfer(&self, audit_id: u64, bytes_sent: u64, bytes_received: u64) {
        if let Ok(mut audit_log) = self.audit_log.lock() {
            if let Some(entry) = audit_log.iter_mut().find(|entry| entry.id == audit_id) {
                entry.bytes_sent = entry.bytes_sent.saturating_add(bytes_sent);
                entry.bytes_received = entry.bytes_received.saturating_add(bytes_received);
            }
        }
    }

    pub fn get_audit_log(&self) -> Vec<NetworkAuditLogEntry> {
        self.audit_log
            .lock()
            .map(|audit_log| audit_log.iter().cloned().collect())
            .unwrap_or_default()
    }

    fn consume_rate(
        &self,
        capability_id: &str,
        max_per_minute: u32,
        now_ms: i64,
    ) -> Result<bool, NetGateError> {
        let mut windows = self
            .rate_windows
            .lock()
            .map_err(|_| NetGateError::PolicyState)?;
        let queue = windows.entry(capability_id.to_string()).or_default();
        let cutoff = now_ms.saturating_sub(60_000);
        while queue.front().is_some_and(|timestamp| *timestamp < cutoff) {
            queue.pop_front();
        }
        if queue.len() >= max_per_minute as usize {
            return Ok(false);
        }
        queue.push_back(now_ms);
        Ok(true)
    }

    fn deny<T>(
        &self,
        request: &NetworkRequest,
        host: &str,
        classes: Vec<DestinationClass>,
        verdict: ConnectionVerdict,
        error: NetGateError,
    ) -> Result<T, NetGateError> {
        let decision = PolicyDecision {
            audit_id: None,
            verdict,
            capability_id: None,
            canonical_host: host.to_string(),
            destination_classes: classes,
            effective_limits: None,
        };
        let _ = self.log_entry(request, &decision, 0, 0);
        Err(error)
    }

    fn log_entry(
        &self,
        request: &NetworkRequest,
        decision: &PolicyDecision,
        bytes_sent: u64,
        bytes_received: u64,
    ) -> Result<u64, NetGateError> {
        let id = {
            let mut counter = self.counter.lock().map_err(|_| NetGateError::PolicyState)?;
            let id = *counter;
            *counter = counter.saturating_add(1);
            id
        };
        let entry = NetworkAuditLogEntry {
            id,
            timestamp_utc: Utc::now().timestamp_millis(),
            component_id: request.component_id.clone(),
            document_id: request.document_id.clone(),
            automation_id: request.automation_id.clone(),
            target_host: decision.canonical_host.clone(),
            target_port: request.target_port,
            protocol: request.protocol,
            direction: request.direction,
            data_class: request.data_class,
            purpose: request.purpose.clone(),
            verdict: decision.verdict,
            capability_id: decision.capability_id.clone(),
            destination_classes: decision.destination_classes.clone(),
            bytes_sent,
            bytes_received,
        };
        let mut audit_log = self
            .audit_log
            .lock()
            .map_err(|_| NetGateError::PolicyState)?;
        if audit_log.len() >= MAX_AUDIT_ENTRIES {
            audit_log.pop_front();
        }
        audit_log.push_back(entry);
        Ok(id)
    }
}
