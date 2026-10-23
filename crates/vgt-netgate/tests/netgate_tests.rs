// STATUS: DIAMANT VGT SUPREME
use std::net::IpAddr;
use vgt_netgate::{
    ConnectionVerdict, DestinationClass, NetGate, NetGateError, NetworkCapabilityGrant,
    NetworkDataClass, NetworkDirection, NetworkLimits, NetworkProtocol, NetworkRequest,
};

fn request(component: &str, document: Option<&str>, host: &str, purpose: &str) -> NetworkRequest {
    NetworkRequest {
        component_id: component.into(),
        document_id: document.map(str::to_string),
        automation_id: None,
        target_host: host.into(),
        target_port: 443,
        protocol: NetworkProtocol::Https,
        direction: NetworkDirection::Outbound,
        data_class: NetworkDataClass::Metadata,
        purpose: purpose.into(),
        method: Some("GET".into()),
        expected_request_bytes: 128,
        expected_response_bytes: 4096,
        timeout_ms: 2_000,
    }
}

fn grant(
    id: &str,
    component: &str,
    document: Option<&str>,
    host: &str,
    class: DestinationClass,
    purpose: &str,
) -> NetworkCapabilityGrant {
    NetworkCapabilityGrant {
        id: id.into(),
        component_id: component.into(),
        document_id: document.map(str::to_string),
        automation_id: None,
        purpose: purpose.into(),
        allowed_hosts: vec![host.into()],
        allowed_cidrs: Vec::new(),
        allowed_ports: vec![443],
        protocols: vec![NetworkProtocol::Https],
        directions: vec![NetworkDirection::Outbound],
        data_classes: vec![NetworkDataClass::Metadata],
        destination_classes: vec![class],
        methods: vec!["GET".into()],
        expires_at_utc_ms: None,
        limits: NetworkLimits {
            max_requests_per_minute: 2,
            max_request_bytes: 1024,
            max_response_bytes: 8192,
            timeout_ms: 3_000,
        },
    }
}

#[test]
fn undeclared_request_is_denied_before_dns() {
    let gate = NetGate::new();
    let req = request(
        "writer",
        Some("doc-1"),
        "api.example.com",
        "dictionary lookup",
    );
    assert!(matches!(
        gate.preflight_request(&req),
        Err(NetGateError::AccessDenied)
    ));
    let audit = gate.get_audit_log();
    assert_eq!(
        audit.last().unwrap().verdict,
        ConnectionVerdict::BlockedByDefault
    );
    assert!(audit.last().unwrap().destination_classes.is_empty());
}

#[test]
fn explicit_capability_is_scoped_to_component_document_and_purpose() {
    let gate = NetGate::new();
    gate.register_capability(grant(
        "cap-1",
        "writer",
        Some("doc-1"),
        "api.example.com",
        DestinationClass::PublicInternet,
        "dictionary lookup",
    ))
    .unwrap();
    let good = request(
        "writer",
        Some("doc-1"),
        "api.example.com",
        "dictionary lookup",
    );
    assert!(gate.preflight_request(&good).is_ok());
    let ip: IpAddr = "203.0.113.8".parse().unwrap();
    assert_eq!(
        gate.evaluate_request(&good, &[ip]).unwrap().verdict,
        ConnectionVerdict::Allowed
    );

    let wrong_doc = request(
        "writer",
        Some("doc-2"),
        "api.example.com",
        "dictionary lookup",
    );
    assert!(gate.preflight_request(&wrong_doc).is_err());
    let wrong_purpose = request(
        "writer",
        Some("doc-1"),
        "api.example.com",
        "upload document",
    );
    assert!(gate.preflight_request(&wrong_purpose).is_err());
}

#[test]
fn dns_rebinding_or_mixed_destination_classes_fail_closed() {
    let gate = NetGate::new();
    gate.register_capability(grant(
        "cap-public",
        "connect",
        None,
        "api.example.com",
        DestinationClass::PublicInternet,
        "connector request",
    ))
    .unwrap();
    let req = request("connect", None, "api.example.com", "connector request");
    assert!(gate.preflight_request(&req).is_ok());
    let public: IpAddr = "203.0.113.20".parse().unwrap();
    let loopback: IpAddr = "127.0.0.1".parse().unwrap();
    assert!(gate.evaluate_request(&req, &[public, loopback]).is_err());
}

#[test]
fn exact_hostname_match_rejects_prefix_tricks() {
    let gate = NetGate::new();
    gate.register_capability(grant(
        "cap-lan",
        "sync",
        None,
        "192.168.1.10",
        DestinationClass::PrivateLan,
        "peer sync",
    ))
    .unwrap();
    let spoof = request("sync", None, "192.168.1.10.evil.example", "peer sync");
    assert!(gate.preflight_request(&spoof).is_err());
    let real = request("sync", None, "192.168.1.10", "peer sync");
    assert!(gate.preflight_request(&real).is_ok());
    assert!(gate.evaluate_request(&real, &[]).is_ok());
}

#[test]
fn size_timeout_and_rate_limits_are_enforced() {
    let gate = NetGate::new();
    gate.register_capability(grant(
        "cap-limits",
        "connect",
        None,
        "api.example.com",
        DestinationClass::PublicInternet,
        "bounded request",
    ))
    .unwrap();
    let ip: IpAddr = "203.0.113.22".parse().unwrap();
    let mut too_large = request("connect", None, "api.example.com", "bounded request");
    too_large.expected_response_bytes = 9000;
    assert!(matches!(
        gate.preflight_request(&too_large),
        Err(NetGateError::ResourceLimit)
    ));

    let req = request("connect", None, "api.example.com", "bounded request");
    assert!(gate.evaluate_request(&req, &[ip]).is_ok());
    assert!(gate.evaluate_request(&req, &[ip]).is_ok());
    assert!(matches!(
        gate.evaluate_request(&req, &[ip]),
        Err(NetGateError::RateLimit)
    ));
}

#[test]
fn audit_records_destination_purpose_scope_and_decision_without_payloads() {
    let gate = NetGate::new();
    gate.register_capability(grant(
        "cap-audit",
        "writer",
        Some("doc-9"),
        "api.example.com",
        DestinationClass::PublicInternet,
        "spellcheck metadata",
    ))
    .unwrap();
    let req = request(
        "writer",
        Some("doc-9"),
        "api.example.com",
        "spellcheck metadata",
    );
    let ip: IpAddr = "203.0.113.30".parse().unwrap();
    gate.evaluate_request(&req, &[ip]).unwrap();
    let entry = gate.get_audit_log().pop().unwrap();
    assert_eq!(entry.component_id, "writer");
    assert_eq!(entry.document_id.as_deref(), Some("doc-9"));
    assert_eq!(entry.target_host, "api.example.com");
    assert_eq!(entry.purpose, "spellcheck metadata");
    assert_eq!(entry.capability_id.as_deref(), Some("cap-audit"));
    assert_eq!(entry.bytes_sent, 0);
    assert_eq!(entry.bytes_received, 0);
}

#[test]
fn automation_scope_is_independent_from_document_scope() {
    let gate = NetGate::new();
    let mut capability = grant(
        "cap-auto",
        "automate",
        Some("doc-1"),
        "api.example.com",
        DestinationClass::PublicInternet,
        "automation webhook",
    );
    capability.automation_id = Some("flow-7".into());
    gate.register_capability(capability).unwrap();
    let mut good = request(
        "automate",
        Some("doc-1"),
        "api.example.com",
        "automation webhook",
    );
    good.automation_id = Some("flow-7".into());
    assert!(gate.preflight_request(&good).is_ok());
    good.automation_id = Some("flow-8".into());
    assert!(gate.preflight_request(&good).is_err());
}

#[test]
fn cidr_grant_matches_real_resolved_ips_not_hostname_prefixes() {
    let gate = NetGate::new();
    let mut capability = grant(
        "cap-cidr",
        "gaiacom",
        None,
        "placeholder.invalid",
        DestinationClass::PrivateLan,
        "peer transport",
    );
    capability.allowed_hosts.clear();
    capability.allowed_cidrs = vec!["192.168.50.0/24".into(), "fd12:3456::/48".into()];
    gate.register_capability(capability).unwrap();
    let req = request("gaiacom", None, "peer.local", "peer transport");
    assert!(gate.preflight_request(&req).is_ok());
    assert!(gate
        .evaluate_request(&req, &["192.168.50.12".parse().unwrap()])
        .is_ok());
    assert!(gate
        .evaluate_request(&req, &["192.168.51.12".parse().unwrap()])
        .is_err());
}

#[test]
fn permission_inspection_normalizes_without_installing_grant() {
    let gate = NetGate::new();
    let mut capability = grant(
        "cap-review",
        "connect",
        Some("doc-9"),
        "API.Example.COM.",
        DestinationClass::PublicInternet,
        "connector request",
    );
    capability.allowed_cidrs = vec!["10.20.30.99/24".into()];
    let inspection = gate.inspect_capability(capability).unwrap();
    assert_eq!(inspection.allowed_hosts, vec!["api.example.com"]);
    assert_eq!(inspection.allowed_cidrs, vec!["10.20.30.0/24"]);
    assert!(gate.get_capabilities().is_empty());
}

#[test]
fn policy_preview_never_consumes_rate_or_requires_dns() {
    let gate = NetGate::new();
    gate.register_capability(grant(
        "cap-preview",
        "connect",
        None,
        "api.example.com",
        DestinationClass::PublicInternet,
        "preview request",
    ))
    .unwrap();
    let req = request("connect", None, "api.example.com", "preview request");
    for _ in 0..10 {
        assert_eq!(
            gate.preview_request(&req).unwrap().verdict,
            ConnectionVerdict::Allowed
        );
    }
    let ip: IpAddr = "203.0.113.2".parse().unwrap();
    assert!(gate.evaluate_request(&req, &[ip]).is_ok());
    assert!(gate.evaluate_request(&req, &[ip]).is_ok());
    assert!(matches!(
        gate.evaluate_request(&req, &[ip]),
        Err(NetGateError::RateLimit)
    ));
}

#[test]
fn sec031_default_none_blocks_before_any_socket_handshake() {
    use std::net::TcpListener;
    use vgt_netgate::{NetworkCapability, SovereignConnector};

    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    listener.set_nonblocking(true).unwrap();
    let port = listener.local_addr().unwrap().port();
    let gate = NetGate::new();
    assert_eq!(gate.capability(), NetworkCapability::None);

    let result = SovereignConnector::connect(
        &gate,
        "127.0.0.1",
        port,
        "sec031-probe",
        "default-deny probe",
    );
    assert!(matches!(result, Err(NetGateError::AccessDenied)));
    assert!(
        matches!(listener.accept(), Err(error) if error.kind() == std::io::ErrorKind::WouldBlock)
    );

    let audit = gate.get_audit_log();
    assert_eq!(
        audit.last().unwrap().verdict,
        ConnectionVerdict::BlockedByDefault
    );
}

#[test]
fn sec037_enterprise_proxy_is_mandatory_and_destination_dns_stays_remote() {
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::thread;
    use vgt_netgate::{EgressProxyPolicy, SovereignConnector};

    let proxy = TcpListener::bind("127.0.0.1:0").unwrap();
    let proxy_port = proxy.local_addr().unwrap().port();
    let proxy_thread = thread::spawn(move || {
        let (mut stream, _) = proxy.accept().expect("proxy accept");
        stream
            .set_read_timeout(Some(std::time::Duration::from_secs(2)))
            .unwrap();
        let mut request = Vec::new();
        let mut byte = [0u8; 1];
        while request.len() < 8192 && !request.ends_with(b"\r\n\r\n") {
            let n = stream.read(&mut byte).expect("proxy read");
            if n == 0 {
                break;
            }
            request.push(byte[0]);
        }
        let text = String::from_utf8(request).expect("connect request utf8");
        assert!(text.starts_with("CONNECT example.invalid:443 HTTP/1.1\r\n"));
        stream
            .write_all(b"HTTP/1.1 200 Connection Established\r\n\r\n")
            .unwrap();
        text
    });

    let gate = NetGate::new();
    gate.register_capability(grant(
        "cap-proxy",
        "connector",
        None,
        "example.invalid",
        DestinationClass::PublicInternet,
        "enterprise egress",
    ))
    .unwrap();
    gate.set_egress_proxy(Some(
        EgressProxyPolicy::validated("127.0.0.1", proxy_port).unwrap(),
    ))
    .unwrap();
    let req = request("connector", None, "example.invalid", "enterprise egress");

    // example.invalid is intentionally non-resolvable. Success proves the destination was not
    // locally DNS-resolved and the connection reached the configured proxy instead.
    let (stream, decision) = SovereignConnector::connect_request(&gate, &req).expect("proxy route");
    assert_eq!(stream.target_host(), "example.invalid");
    assert_eq!(decision.verdict, ConnectionVerdict::Allowed);
    drop(stream);
    let observed = proxy_thread.join().unwrap();
    assert!(observed.contains("Host: example.invalid:443\r\n"));
}

#[test]
fn sec037_proxy_failure_never_falls_back_to_direct_target() {
    use std::net::TcpListener;
    use vgt_netgate::{EgressProxyPolicy, SovereignConnector};

    let target = TcpListener::bind("127.0.0.1:0").unwrap();
    target.set_nonblocking(true).unwrap();
    let target_port = target.local_addr().unwrap().port();

    // Reserve a local port and close it so proxy connect deterministically fails.
    let dead_proxy = TcpListener::bind("127.0.0.1:0").unwrap();
    let dead_proxy_port = dead_proxy.local_addr().unwrap().port();
    drop(dead_proxy);

    let gate = NetGate::new();
    let mut capability = grant(
        "cap-no-bypass",
        "connector",
        None,
        "127.0.0.1",
        DestinationClass::Loopback,
        "enterprise egress",
    );
    capability.allowed_ports = vec![target_port];
    gate.register_capability(capability).unwrap();
    gate.set_egress_proxy(Some(
        EgressProxyPolicy::validated("127.0.0.1", dead_proxy_port).unwrap(),
    ))
    .unwrap();

    let mut req = request("connector", None, "127.0.0.1", "enterprise egress");
    req.target_port = target_port;
    let result = SovereignConnector::connect_request(&gate, &req);
    assert!(matches!(result, Err(NetGateError::ProxyPolicyViolation)));
    assert!(matches!(
        target.accept(),
        Err(error) if error.kind() == std::io::ErrorKind::WouldBlock
    ));
}
