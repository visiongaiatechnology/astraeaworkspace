//! STATUS: DIAMANT VGT SUPREME
use crate::destination::{canonicalize_host, cidr_matches_ip, cidrs_match_all, IpCidr};
use crate::model::*;
use chrono::Utc;
use std::net::IpAddr;

const MAX_PURPOSE_BYTES: usize = 512;
const MAX_COMPONENT_BYTES: usize = 128;
const MAX_SCOPE_ID_BYTES: usize = 192;
const MAX_CAPABILITY_ID_BYTES: usize = 128;
const MAX_HOSTS: usize = 128;
const MAX_CIDRS: usize = 128;
const MAX_PORTS: usize = 128;
const MAX_METHODS: usize = 32;
const HTTP_METHODS: &[&str] = &["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

pub(crate) fn validate_capability(grant: &mut NetworkCapabilityGrant) -> Result<(), NetGateError> {
    if grant.id.is_empty()
        || grant.id.len() > MAX_CAPABILITY_ID_BYTES
        || !safe_identifier(&grant.id)
        || grant.component_id.is_empty()
        || grant.component_id.len() > MAX_COMPONENT_BYTES
        || !safe_identifier(&grant.component_id)
        || !safe_purpose(&grant.purpose)
        || (grant.allowed_hosts.is_empty() && grant.allowed_cidrs.is_empty())
        || grant.allowed_hosts.len() > MAX_HOSTS
        || grant.allowed_cidrs.len() > MAX_CIDRS
        || grant.allowed_ports.is_empty()
        || grant.allowed_ports.len() > MAX_PORTS
        || grant.allowed_ports.contains(&0)
        || grant.protocols.is_empty()
        || grant.directions.is_empty()
        || grant.data_classes.is_empty()
        || grant.destination_classes.is_empty()
        || grant.methods.len() > MAX_METHODS
    {
        return Err(NetGateError::InvalidCapability);
    }
    validate_scope_id(grant.document_id.as_deref())?;
    validate_scope_id(grant.automation_id.as_deref())?;
    grant.limits.validate()?;

    for method in &mut grant.methods {
        let canonical = method.trim().to_ascii_uppercase();
        if !HTTP_METHODS.contains(&canonical.as_str()) {
            return Err(NetGateError::InvalidCapability);
        }
        *method = canonical;
    }
    grant.methods.sort();
    grant.methods.dedup();

    let mut canonical_hosts = Vec::with_capacity(grant.allowed_hosts.len());
    for host in &grant.allowed_hosts {
        canonical_hosts.push(canonicalize_host(host)?);
    }
    canonical_hosts.sort();
    canonical_hosts.dedup();
    grant.allowed_hosts = canonical_hosts;

    let mut canonical_cidrs = Vec::with_capacity(grant.allowed_cidrs.len());
    for cidr in &grant.allowed_cidrs {
        canonical_cidrs.push(IpCidr::parse(cidr)?.canonical());
    }
    canonical_cidrs.sort();
    canonical_cidrs.dedup();
    grant.allowed_cidrs = canonical_cidrs;

    grant.allowed_ports.sort();
    grant.allowed_ports.dedup();
    grant.protocols.sort_by_key(|value| *value as u8);
    grant.protocols.dedup();
    grant.directions.sort_by_key(|value| *value as u8);
    grant.directions.dedup();
    grant.data_classes.sort_by_key(|value| *value as u8);
    grant.data_classes.dedup();
    grant.destination_classes.sort_by_key(|value| *value as u8);
    grant.destination_classes.dedup();
    Ok(())
}

pub(crate) fn validate_request(request: &NetworkRequest) -> Result<(), NetGateError> {
    if request.component_id.is_empty()
        || request.component_id.len() > MAX_COMPONENT_BYTES
        || !safe_identifier(&request.component_id)
        || request.target_port == 0
        || !safe_purpose(&request.purpose)
        || request.timeout_ms == 0
        || request.timeout_ms > 120_000
        || request.expected_request_bytes > 512 * 1024 * 1024
        || request.expected_response_bytes > 1024 * 1024 * 1024
    {
        return Err(NetGateError::InvalidDestination);
    }
    validate_scope_id(request.document_id.as_deref())
        .map_err(|_| NetGateError::InvalidDestination)?;
    validate_scope_id(request.automation_id.as_deref())
        .map_err(|_| NetGateError::InvalidDestination)?;
    if matches!(
        request.protocol,
        NetworkProtocol::Http | NetworkProtocol::Https
    ) {
        let method = request
            .method
            .as_deref()
            .ok_or(NetGateError::InvalidDestination)?;
        if !HTTP_METHODS.contains(&method) {
            return Err(NetGateError::InvalidDestination);
        }
    } else if request.method.is_some() {
        return Err(NetGateError::InvalidDestination);
    }
    Ok(())
}

fn validate_scope_id(value: Option<&str>) -> Result<(), NetGateError> {
    if let Some(value) = value {
        if value.is_empty() || value.len() > MAX_SCOPE_ID_BYTES || !safe_identifier(value) {
            return Err(NetGateError::InvalidCapability);
        }
    }
    Ok(())
}

fn safe_identifier(value: &str) -> bool {
    value.bytes().all(|byte| {
        byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b':' | b'/')
    })
}

fn safe_purpose(value: &str) -> bool {
    let trimmed = value.trim();
    !trimmed.is_empty()
        && trimmed.len() <= MAX_PURPOSE_BYTES
        && !trimmed.chars().any(|ch| ch.is_control())
        && !trimmed.contains('\n')
        && !trimmed.contains('\r')
}

pub(crate) fn scope_matches(grant: &NetworkCapabilityGrant, request: &NetworkRequest) -> bool {
    grant.component_id == request.component_id
        && optional_scope_matches(grant.document_id.as_deref(), request.document_id.as_deref())
        && optional_scope_matches(
            grant.automation_id.as_deref(),
            request.automation_id.as_deref(),
        )
}

fn optional_scope_matches(expected: Option<&str>, actual: Option<&str>) -> bool {
    match (expected, actual) {
        (Some(expected), Some(actual)) => expected == actual,
        (Some(_), None) => false,
        (None, _) => true,
    }
}

fn destination_selector_pre_dns(
    grant: &NetworkCapabilityGrant,
    host: &str,
) -> Result<bool, NetGateError> {
    if grant.allowed_hosts.iter().any(|allowed| allowed == host) {
        return Ok(true);
    }
    if let Ok(ip) = host.parse::<IpAddr>() {
        return cidr_matches_ip(&grant.allowed_cidrs, ip);
    }
    // A hostname may be admitted by CIDR only after DNS resolution. This permits DNS lookup but
    // cannot authorize a socket until every resolved address is inside an allowed CIDR.
    Ok(!grant.allowed_cidrs.is_empty())
}

fn destination_selector_post_dns(
    grant: &NetworkCapabilityGrant,
    host: &str,
    resolved_ips: &[IpAddr],
) -> Result<bool, NetGateError> {
    if grant.allowed_hosts.iter().any(|allowed| allowed == host) {
        return Ok(true);
    }
    cidrs_match_all(&grant.allowed_cidrs, resolved_ips)
}

pub(crate) fn grant_matches_pre_dns(
    grant: &NetworkCapabilityGrant,
    request: &NetworkRequest,
    host: &str,
) -> Result<bool, NetGateError> {
    Ok(grant.purpose == request.purpose
        && destination_selector_pre_dns(grant, host)?
        && grant.allowed_ports.contains(&request.target_port)
        && grant.protocols.contains(&request.protocol)
        && grant.directions.contains(&request.direction)
        && grant.data_classes.contains(&request.data_class)
        && match request.method.as_deref() {
            Some(method) => grant.methods.iter().any(|allowed| allowed == method),
            None => grant.methods.is_empty(),
        })
}

pub(crate) fn grant_matches(
    grant: &NetworkCapabilityGrant,
    request: &NetworkRequest,
    host: &str,
    resolved_ips: &[IpAddr],
    classes: &[DestinationClass],
) -> Result<bool, NetGateError> {
    Ok(grant_matches_pre_dns(grant, request, host)?
        && destination_selector_post_dns(grant, host, resolved_ips)?
        && classes
            .iter()
            .all(|class| grant.destination_classes.contains(class)))
}

pub(crate) fn exceeds_limits(request: &NetworkRequest, limits: NetworkLimits) -> bool {
    request.expected_request_bytes > limits.max_request_bytes
        || request.expected_response_bytes > limits.max_response_bytes
        || request.timeout_ms > limits.timeout_ms
}

pub(crate) fn compatibility_grant(
    capability: NetworkCapability,
    request: &NetworkRequest,
    host: &str,
) -> Result<Option<NetworkCapabilityGrant>, NetGateError> {
    if matches!(
        capability,
        NetworkCapability::None | NetworkCapability::WhitelistedOnly
    ) {
        return Ok(None);
    }
    let destination_classes = if capability == NetworkCapability::LocalLanOnly {
        vec![
            DestinationClass::Loopback,
            DestinationClass::PrivateLan,
            DestinationClass::LinkLocal,
        ]
    } else {
        vec![
            DestinationClass::Loopback,
            DestinationClass::PrivateLan,
            DestinationClass::LinkLocal,
            DestinationClass::PublicInternet,
        ]
    };
    Ok(Some(NetworkCapabilityGrant {
        id: "shell-preview".to_string(),
        component_id: request.component_id.clone(),
        document_id: request.document_id.clone(),
        automation_id: request.automation_id.clone(),
        purpose: request.purpose.clone(),
        allowed_hosts: vec![host.to_string()],
        allowed_cidrs: Vec::new(),
        allowed_ports: vec![request.target_port],
        protocols: vec![request.protocol],
        directions: vec![request.direction],
        data_classes: vec![request.data_class],
        destination_classes,
        methods: request.method.clone().into_iter().collect(),
        expires_at_utc_ms: Some(Utc::now().timestamp_millis().saturating_add(5_000)),
        limits: NetworkLimits {
            max_requests_per_minute: 4,
            max_request_bytes: 64 * 1024,
            max_response_bytes: 512 * 1024,
            timeout_ms: request.timeout_ms.min(5_000),
        },
    }))
}
