//! STATUS: DIAMANT VGT SUPREME
//! NetGate transport enforcement.
//!
//! `SovereignConnector` is the enforced socket creation path for official Astraea TCP connectors.
//! It resolves destinations, revalidates every resolved IP against the capability policy, applies
//! timeout and byte ceilings, and connects to a resolved socket address rather than re-resolving the
//! hostname after policy approval.

use crate::{
    proxy, CancellationToken, NetGate, NetGateError, NetworkProtocol, NetworkRequest,
    PolicyDecision,
};
use std::io::{self, Read, Write};
use std::net::{IpAddr, SocketAddr, TcpStream, ToSocketAddrs};
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

const MAX_RESOLVED_ADDRESSES: usize = 32;
const MAX_DNS_TIMEOUT_MS: u64 = 5_000;

pub fn resolve_destination(
    host: &str,
    port: u16,
    timeout_ms: u64,
) -> Result<Vec<SocketAddr>, NetGateError> {
    resolve_destination_cancellable(host, port, timeout_ms, &CancellationToken::new())
}

pub fn resolve_destination_cancellable(
    host: &str,
    port: u16,
    timeout_ms: u64,
    cancellation: &CancellationToken,
) -> Result<Vec<SocketAddr>, NetGateError> {
    cancellation.check()?;
    if port == 0 {
        return Err(NetGateError::InvalidDestination);
    }
    let timeout = Duration::from_millis(timeout_ms.clamp(1, MAX_DNS_TIMEOUT_MS));
    let host_owned = host.to_string();
    let (tx, rx) = mpsc::sync_channel(1);
    thread::Builder::new()
        .name("vgt-netgate-dns".into())
        .spawn(move || {
            let result = (host_owned.as_str(), port).to_socket_addrs().map(|iter| {
                let mut addrs: Vec<SocketAddr> = iter.take(MAX_RESOLVED_ADDRESSES + 1).collect();
                addrs.sort();
                addrs.dedup();
                addrs
            });
            let _ = tx.send(result);
        })
        .map_err(|_| NetGateError::ResolutionFailed)?;
    let addrs = rx
        .recv_timeout(timeout)
        .map_err(|_| NetGateError::ResolutionFailed)?
        .map_err(|_| NetGateError::ResolutionFailed)?;
    cancellation.check()?;
    if addrs.is_empty() || addrs.len() > MAX_RESOLVED_ADDRESSES {
        return Err(NetGateError::ResolutionFailed);
    }
    Ok(addrs)
}

const MAX_PROXY_RESPONSE_HEADER_BYTES: usize = 8 * 1024;

fn connect_via_enterprise_proxy(
    netgate: &NetGate,
    request: &NetworkRequest,
    cancellation: &CancellationToken,
) -> Result<(SovereignStream, PolicyDecision), NetGateError> {
    cancellation.check()?;
    let proxy_policy = netgate
        .egress_proxy()?
        .ok_or(NetGateError::ProxyPolicyViolation)?;
    // Crucial invariant: authorize the exact hostname without resolving the destination locally.
    // This prevents both direct-IP fallback and destination DNS leakage while proxy enforcement is active.
    let decision = netgate.evaluate_proxy_request(request)?;
    let limits = decision.effective_limits.ok_or(NetGateError::PolicyState)?;
    let timeout = Duration::from_millis(request.timeout_ms.min(limits.timeout_ms));

    let proxy_addresses = resolve_destination_cancellable(
        &proxy_policy.host,
        proxy_policy.port,
        request.timeout_ms.min(MAX_DNS_TIMEOUT_MS),
        cancellation,
    )?;
    let mut last_error = None;
    for proxy_address in proxy_addresses {
        cancellation.check()?;
        match TcpStream::connect_timeout(&proxy_address, timeout) {
            Ok(mut stream) => {
                stream
                    .set_read_timeout(Some(timeout))
                    .map_err(|_| NetGateError::ProxyPolicyViolation)?;
                stream
                    .set_write_timeout(Some(timeout))
                    .map_err(|_| NetGateError::ProxyPolicyViolation)?;
                let connect =
                    proxy::connect_request_bytes(&decision.canonical_host, request.target_port)?;
                stream
                    .write_all(&connect)
                    .map_err(|_| NetGateError::ProxyPolicyViolation)?;
                stream
                    .flush()
                    .map_err(|_| NetGateError::ProxyPolicyViolation)?;

                let mut response = Vec::with_capacity(256);
                let mut byte = [0u8; 1];
                while response.len() < MAX_PROXY_RESPONSE_HEADER_BYTES {
                    cancellation.check()?;
                    let read = stream
                        .read(&mut byte)
                        .map_err(|_| NetGateError::ProxyPolicyViolation)?;
                    if read == 0 {
                        return Err(NetGateError::ProxyPolicyViolation);
                    }
                    response.push(byte[0]);
                    if response.ends_with(b"\r\n\r\n") {
                        break;
                    }
                }
                if !response.ends_with(b"\r\n\r\n") {
                    return Err(NetGateError::ProxyPolicyViolation);
                }
                proxy::validate_connect_response(&response)?;
                let audit_id = decision.audit_id.ok_or(NetGateError::PolicyState)?;
                return Ok((
                    SovereignStream {
                        inner: stream,
                        netgate: netgate.clone(),
                        audit_id,
                        target_host: decision.canonical_host.clone(),
                        target_port: request.target_port,
                        bytes_sent: 0,
                        bytes_received: 0,
                        max_request_bytes: limits.max_request_bytes,
                        max_response_bytes: limits.max_response_bytes,
                    },
                    decision,
                ));
            }
            Err(error) => last_error = Some(error),
        }
    }
    let _ = last_error;
    Err(NetGateError::ProxyPolicyViolation)
}

pub struct SovereignStream {
    inner: TcpStream,
    netgate: NetGate,
    audit_id: u64,
    target_host: String,
    target_port: u16,
    bytes_sent: u64,
    bytes_received: u64,
    max_request_bytes: u64,
    max_response_bytes: u64,
}

impl SovereignStream {
    pub fn target_host(&self) -> &str {
        &self.target_host
    }
    pub fn target_port(&self) -> u16 {
        self.target_port
    }
    pub fn bytes_sent(&self) -> u64 {
        self.bytes_sent
    }
    pub fn bytes_received(&self) -> u64 {
        self.bytes_received
    }
}

impl Read for SovereignStream {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        if self.bytes_received >= self.max_response_bytes {
            return Err(io::Error::new(
                io::ErrorKind::PermissionDenied,
                "NetGate response byte ceiling reached",
            ));
        }
        let remaining = self.max_response_bytes - self.bytes_received;
        let bounded = buf
            .len()
            .min(usize::try_from(remaining).unwrap_or(usize::MAX));
        if bounded == 0 {
            return Err(io::Error::new(
                io::ErrorKind::PermissionDenied,
                "NetGate response byte ceiling reached",
            ));
        }
        let n = self.inner.read(&mut buf[..bounded])?;
        self.bytes_received = self.bytes_received.saturating_add(n as u64);
        Ok(n)
    }
}

impl Write for SovereignStream {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        if self.bytes_sent >= self.max_request_bytes {
            return Err(io::Error::new(
                io::ErrorKind::PermissionDenied,
                "NetGate request byte ceiling reached",
            ));
        }
        let remaining = self.max_request_bytes - self.bytes_sent;
        let bounded = buf
            .len()
            .min(usize::try_from(remaining).unwrap_or(usize::MAX));
        if bounded == 0 {
            return Err(io::Error::new(
                io::ErrorKind::PermissionDenied,
                "NetGate request byte ceiling reached",
            ));
        }
        let n = self.inner.write(&buf[..bounded])?;
        self.bytes_sent = self.bytes_sent.saturating_add(n as u64);
        Ok(n)
    }

    fn flush(&mut self) -> io::Result<()> {
        self.inner.flush()
    }
}

impl Drop for SovereignStream {
    fn drop(&mut self) {
        self.netgate
            .record_transfer(self.audit_id, self.bytes_sent, self.bytes_received);
    }
}

/// Enforced transport path for official Astraea TCP-based connectors.
/// This does not intercept sockets opened by unrelated processes and is not an OS firewall.
pub struct SovereignConnector;

impl SovereignConnector {
    pub fn connect_request(
        netgate: &NetGate,
        request: &NetworkRequest,
    ) -> Result<(SovereignStream, PolicyDecision), NetGateError> {
        Self::connect_request_cancellable(netgate, request, &CancellationToken::new())
    }

    pub fn connect_request_cancellable(
        netgate: &NetGate,
        request: &NetworkRequest,
        cancellation: &CancellationToken,
    ) -> Result<(SovereignStream, PolicyDecision), NetGateError> {
        cancellation.check()?;
        if !matches!(
            request.protocol,
            NetworkProtocol::Tcp | NetworkProtocol::Http | NetworkProtocol::Https
        ) {
            return Err(NetGateError::InvalidDestination);
        }
        if netgate.egress_proxy()?.is_some() {
            return connect_via_enterprise_proxy(netgate, request, cancellation);
        }
        let preflight = netgate.preflight_request(request)?;
        let dns_timeout = request.timeout_ms.min(MAX_DNS_TIMEOUT_MS);
        let addresses = resolve_destination_cancellable(
            preflight.canonical_host(),
            request.target_port,
            dns_timeout,
            cancellation,
        )?;
        let resolved_ips: Vec<IpAddr> = addresses.iter().map(|addr| addr.ip()).collect();
        let decision = netgate.evaluate_request(request, &resolved_ips)?;
        cancellation.check()?;
        let limits = decision.effective_limits.ok_or(NetGateError::PolicyState)?;
        let connect_timeout = Duration::from_millis(request.timeout_ms.min(limits.timeout_ms));

        let mut last_error = None;
        for address in addresses {
            cancellation.check()?;
            match TcpStream::connect_timeout(&address, connect_timeout) {
                Ok(stream) => {
                    stream
                        .set_read_timeout(Some(connect_timeout))
                        .map_err(|_| NetGateError::AccessDenied)?;
                    stream
                        .set_write_timeout(Some(connect_timeout))
                        .map_err(|_| NetGateError::AccessDenied)?;
                    let audit_id = decision.audit_id.ok_or(NetGateError::PolicyState)?;
                    return Ok((
                        SovereignStream {
                            inner: stream,
                            netgate: netgate.clone(),
                            audit_id,
                            target_host: decision.canonical_host.clone(),
                            target_port: request.target_port,
                            bytes_sent: 0,
                            bytes_received: 0,
                            max_request_bytes: limits.max_request_bytes,
                            max_response_bytes: limits.max_response_bytes,
                        },
                        decision,
                    ));
                }
                Err(error) => last_error = Some(error),
            }
        }
        let _ = last_error;
        Err(NetGateError::AccessDenied)
    }

    /// Legacy wrapper retained for callers not yet migrated to explicit capabilities. It still evaluates
    /// policy before socket creation, but new production connectors must use `connect_request`.
    pub fn connect(
        netgate: &NetGate,
        target_host: &str,
        target_port: u16,
        component_id: &str,
        purpose: &str,
    ) -> Result<SovereignStream, NetGateError> {
        if netgate.egress_proxy()?.is_some() {
            // Legacy compatibility grants cannot prove the exact enterprise proxy authorization
            // contract. Failing closed prevents this path from becoming a direct-connect bypass.
            return Err(NetGateError::ProxyPolicyViolation);
        }
        let request = NetworkRequest {
            component_id: component_id.to_string(),
            document_id: None,
            automation_id: None,
            target_host: target_host.to_string(),
            target_port,
            protocol: NetworkProtocol::Tcp,
            direction: crate::NetworkDirection::Outbound,
            data_class: crate::NetworkDataClass::Metadata,
            purpose: purpose.to_string(),
            method: None,
            expected_request_bytes: 0,
            expected_response_bytes: 0,
            timeout_ms: 5_000,
        };
        let preflight = netgate.preflight_compatibility_request(&request)?;
        let addresses = resolve_destination(preflight.canonical_host(), target_port, 5_000)?;
        let resolved_ips: Vec<IpAddr> = addresses.iter().map(|addr| addr.ip()).collect();
        let decision = netgate.evaluate_compatibility_request(&request, &resolved_ips)?;
        let limits = decision.effective_limits.ok_or(NetGateError::PolicyState)?;
        let timeout = Duration::from_millis(request.timeout_ms.min(limits.timeout_ms));
        for address in addresses {
            if let Ok(stream) = TcpStream::connect_timeout(&address, timeout) {
                stream
                    .set_read_timeout(Some(timeout))
                    .map_err(|_| NetGateError::AccessDenied)?;
                stream
                    .set_write_timeout(Some(timeout))
                    .map_err(|_| NetGateError::AccessDenied)?;
                let audit_id = decision.audit_id.ok_or(NetGateError::PolicyState)?;
                return Ok(SovereignStream {
                    inner: stream,
                    netgate: netgate.clone(),
                    audit_id,
                    target_host: decision.canonical_host,
                    target_port,
                    bytes_sent: 0,
                    bytes_received: 0,
                    max_request_bytes: limits.max_request_bytes,
                    max_response_bytes: limits.max_response_bytes,
                });
            }
        }
        Err(NetGateError::AccessDenied)
    }
}
