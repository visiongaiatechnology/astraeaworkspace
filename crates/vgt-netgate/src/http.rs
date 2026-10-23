//! STATUS: DIAMANT VGT SUPREME
//! Policy core for HTTP(S) connectors. This module deliberately owns URL/method/redirect/TLS
//! validation while platform adapters own the concrete TLS stack. No API exists to disable TLS
//! certificate verification.

use crate::{
    CancellationToken, NetGate, NetGateError, NetworkDataClass, NetworkDirection, NetworkProtocol,
    NetworkRequest, PolicyDecision,
};
use std::net::IpAddr;
use url::Url;

const MAX_URL_BYTES: usize = 8 * 1024;
const MAX_REDIRECTS: u8 = 8;
const MAX_HTTP_REQUEST_BYTES: u64 = 512 * 1024 * 1024;
const MAX_HTTP_RESPONSE_BYTES: u64 = 1024 * 1024 * 1024;
const ALLOWED_METHODS: &[&str] = &["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RedirectPolicy {
    Deny,
    SameOrigin { max_hops: u8 },
    Reauthorize { max_hops: u8 },
}

impl RedirectPolicy {
    fn max_hops(self) -> u8 {
        match self {
            Self::Deny => 0,
            Self::SameOrigin { max_hops } | Self::Reauthorize { max_hops } => {
                max_hops.min(MAX_REDIRECTS)
            }
        }
    }
}

/// TLS verification is always on. Custom trust/pinning is explicit and host-scoped.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TlsVerificationPolicy {
    SystemRoots,
    CustomCaSha256 {
        scope_host: String,
        ca_sha256_hex: String,
    },
    PinnedSpkiSha256 {
        scope_host: String,
        spki_sha256_hex: String,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HttpRequestSpec {
    pub url: String,
    pub component_id: String,
    pub document_id: Option<String>,
    pub automation_id: Option<String>,
    pub purpose: String,
    pub data_class: NetworkDataClass,
    pub method: String,
    pub request_bytes: u64,
    pub response_ceiling_bytes: u64,
    pub timeout_ms: u64,
    pub redirect_policy: RedirectPolicy,
    pub tls: TlsVerificationPolicy,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PreparedHttpRequest {
    pub normalized_url: String,
    pub scheme: String,
    pub host: String,
    pub port: u16,
    pub path_and_query: String,
    pub network_request: NetworkRequest,
    pub redirect_policy: RedirectPolicy,
    pub tls: TlsVerificationPolicy,
}

pub fn prepare_http_request(spec: &HttpRequestSpec) -> Result<PreparedHttpRequest, NetGateError> {
    if spec.url.is_empty()
        || spec.url.len() > MAX_URL_BYTES
        || spec.request_bytes > MAX_HTTP_REQUEST_BYTES
        || spec.response_ceiling_bytes > MAX_HTTP_RESPONSE_BYTES
        || spec.timeout_ms == 0
        || spec.timeout_ms > 120_000
        || spec.redirect_policy.max_hops() > MAX_REDIRECTS
    {
        return Err(NetGateError::InvalidHttpRequest);
    }
    let method = spec.method.trim().to_ascii_uppercase();
    if !ALLOWED_METHODS.contains(&method.as_str()) {
        return Err(NetGateError::InvalidHttpRequest);
    }

    let mut url = Url::parse(&spec.url).map_err(|_| NetGateError::InvalidHttpRequest)?;
    if !url.username().is_empty() || url.password().is_some() {
        return Err(NetGateError::InvalidHttpRequest);
    }
    if url.fragment().is_some() {
        url.set_fragment(None);
    }
    let scheme = url.scheme().to_ascii_lowercase();
    if scheme != "http" && scheme != "https" {
        return Err(NetGateError::InvalidHttpRequest);
    }
    let host = url
        .host_str()
        .ok_or(NetGateError::InvalidHttpRequest)?
        .to_ascii_lowercase();
    let port = url
        .port_or_known_default()
        .ok_or(NetGateError::InvalidHttpRequest)?;
    validate_tls_policy(&spec.tls, &scheme, &host)?;

    let path_and_query = match url.query() {
        Some(query) => format!("{}?{}", url.path(), query),
        None => url.path().to_string(),
    };
    let protocol = if scheme == "https" {
        NetworkProtocol::Https
    } else {
        NetworkProtocol::Http
    };
    let network_request = NetworkRequest {
        component_id: spec.component_id.clone(),
        document_id: spec.document_id.clone(),
        automation_id: spec.automation_id.clone(),
        target_host: host.clone(),
        target_port: port,
        protocol,
        direction: NetworkDirection::Outbound,
        data_class: spec.data_class,
        purpose: spec.purpose.clone(),
        method: Some(method),
        expected_request_bytes: spec.request_bytes,
        expected_response_bytes: spec.response_ceiling_bytes,
        timeout_ms: spec.timeout_ms,
    };
    Ok(PreparedHttpRequest {
        normalized_url: url.to_string(),
        scheme,
        host,
        port,
        path_and_query,
        network_request,
        redirect_policy: spec.redirect_policy,
        tls: spec.tls.clone(),
    })
}

pub fn authorize_http_request(
    netgate: &NetGate,
    prepared: &PreparedHttpRequest,
    resolved_ips: &[IpAddr],
    cancellation: &CancellationToken,
) -> Result<PolicyDecision, NetGateError> {
    cancellation.check()?;
    netgate.preflight_request(&prepared.network_request)?;
    cancellation.check()?;
    let decision = netgate.evaluate_request(&prepared.network_request, resolved_ips)?;
    cancellation.check()?;
    Ok(decision)
}

/// Build and authorize a redirect target. The redirect is never inherited blindly: target host,
/// port, TLS scope, DNS result and NetGate capability are re-evaluated for every hop.
pub fn authorize_http_redirect(
    netgate: &NetGate,
    previous: &PreparedHttpRequest,
    location: &str,
    hop: u8,
    resolved_ips: &[IpAddr],
    cancellation: &CancellationToken,
) -> Result<(PreparedHttpRequest, PolicyDecision), NetGateError> {
    cancellation.check()?;
    let max_hops = previous.redirect_policy.max_hops();
    if max_hops == 0 || hop == 0 || hop > max_hops {
        return Err(NetGateError::AccessDenied);
    }
    let base =
        Url::parse(&previous.normalized_url).map_err(|_| NetGateError::InvalidHttpRequest)?;
    let next = base
        .join(location)
        .map_err(|_| NetGateError::InvalidHttpRequest)?;
    let next_host = next
        .host_str()
        .ok_or(NetGateError::InvalidHttpRequest)?
        .to_ascii_lowercase();
    let next_port = next
        .port_or_known_default()
        .ok_or(NetGateError::InvalidHttpRequest)?;
    if matches!(previous.redirect_policy, RedirectPolicy::SameOrigin { .. })
        && (next.scheme() != previous.scheme
            || next_host != previous.host
            || next_port != previous.port)
    {
        return Err(NetGateError::AccessDenied);
    }

    let tls = match &previous.tls {
        TlsVerificationPolicy::SystemRoots => TlsVerificationPolicy::SystemRoots,
        TlsVerificationPolicy::CustomCaSha256 {
            scope_host,
            ca_sha256_hex,
        } => {
            if next_host != *scope_host {
                return Err(NetGateError::TlsPolicyViolation);
            }
            TlsVerificationPolicy::CustomCaSha256 {
                scope_host: scope_host.clone(),
                ca_sha256_hex: ca_sha256_hex.clone(),
            }
        }
        TlsVerificationPolicy::PinnedSpkiSha256 {
            scope_host,
            spki_sha256_hex,
        } => {
            if next_host != *scope_host {
                return Err(NetGateError::TlsPolicyViolation);
            }
            TlsVerificationPolicy::PinnedSpkiSha256 {
                scope_host: scope_host.clone(),
                spki_sha256_hex: spki_sha256_hex.clone(),
            }
        }
    };
    let next_spec = HttpRequestSpec {
        url: next.to_string(),
        component_id: previous.network_request.component_id.clone(),
        document_id: previous.network_request.document_id.clone(),
        automation_id: previous.network_request.automation_id.clone(),
        purpose: previous.network_request.purpose.clone(),
        data_class: previous.network_request.data_class,
        method: previous
            .network_request
            .method
            .clone()
            .unwrap_or_else(|| "GET".to_string()),
        request_bytes: previous.network_request.expected_request_bytes,
        response_ceiling_bytes: previous.network_request.expected_response_bytes,
        timeout_ms: previous.network_request.timeout_ms,
        redirect_policy: previous.redirect_policy,
        tls,
    };
    let prepared = prepare_http_request(&next_spec)?;
    let decision = authorize_http_request(netgate, &prepared, resolved_ips, cancellation)?;
    Ok((prepared, decision))
}

fn validate_tls_policy(
    policy: &TlsVerificationPolicy,
    scheme: &str,
    host: &str,
) -> Result<(), NetGateError> {
    if scheme == "http" {
        return match policy {
            TlsVerificationPolicy::SystemRoots => Ok(()),
            _ => Err(NetGateError::TlsPolicyViolation),
        };
    }
    match policy {
        TlsVerificationPolicy::SystemRoots => Ok(()),
        TlsVerificationPolicy::CustomCaSha256 {
            scope_host,
            ca_sha256_hex,
        } => validate_scoped_sha256(scope_host, ca_sha256_hex, host),
        TlsVerificationPolicy::PinnedSpkiSha256 {
            scope_host,
            spki_sha256_hex,
        } => validate_scoped_sha256(scope_host, spki_sha256_hex, host),
    }
}

fn validate_scoped_sha256(
    scope_host: &str,
    digest: &str,
    actual_host: &str,
) -> Result<(), NetGateError> {
    if scope_host != actual_host
        || digest.len() != 64
        || !digest.bytes().all(|byte| byte.is_ascii_hexdigit())
    {
        return Err(NetGateError::TlsPolicyViolation);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base(url: &str) -> HttpRequestSpec {
        HttpRequestSpec {
            url: url.to_string(),
            component_id: "connect".into(),
            document_id: Some("doc-1".into()),
            automation_id: None,
            purpose: "connector request".into(),
            data_class: NetworkDataClass::Metadata,
            method: "GET".into(),
            request_bytes: 0,
            response_ceiling_bytes: 4096,
            timeout_ms: 3000,
            redirect_policy: RedirectPolicy::Reauthorize { max_hops: 3 },
            tls: TlsVerificationPolicy::SystemRoots,
        }
    }

    #[test]
    fn normalizes_urls_and_rejects_credentials_or_dangerous_methods() {
        let prepared =
            prepare_http_request(&base("https://Example.com:443/a/../b?q=1#fragment")).unwrap();
        assert_eq!(prepared.host, "example.com");
        assert!(!prepared.normalized_url.contains("#fragment"));
        assert!(prepare_http_request(&base("https://user:pass@example.com/")).is_err());
        let mut trace = base("https://example.com/");
        trace.method = "TRACE".into();
        assert!(prepare_http_request(&trace).is_err());
    }

    #[test]
    fn tls_custom_material_is_host_scoped_and_has_no_disable_variant() {
        let mut pinned = base("https://api.example.com/");
        pinned.tls = TlsVerificationPolicy::PinnedSpkiSha256 {
            scope_host: "api.example.com".into(),
            spki_sha256_hex: "a".repeat(64),
        };
        assert!(prepare_http_request(&pinned).is_ok());
        pinned.tls = TlsVerificationPolicy::PinnedSpkiSha256 {
            scope_host: "other.example.com".into(),
            spki_sha256_hex: "a".repeat(64),
        };
        assert!(prepare_http_request(&pinned).is_err());
    }
}
