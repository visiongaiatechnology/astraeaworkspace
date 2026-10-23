// STATUS: DIAMANT VGT SUPREME
//! Deterministic SEC-096 hostile-input mutation coverage for public NetGate parser boundaries.

use std::net::IpAddr;
use std::panic::{catch_unwind, AssertUnwindSafe};
use vgt_netgate::{
    canonicalize_host, validate_passive_document_resource, DestinationClass, EgressProxyPolicy,
    HttpRequestSpec, IpCidr, NetGate, NetGateError, NetworkCapabilityGrant, NetworkDataClass,
    NetworkDirection, NetworkLimits, NetworkProtocol, NetworkRequest, RedirectPolicy,
    TlsVerificationPolicy,
};

const CASE_COUNT: usize = 4_096;
const MUTATION_BUCKETS: usize = 16;
const CASES_PER_BUCKET: usize = CASE_COUNT / MUTATION_BUCKETS;
const MAX_SMALL_CASE_BYTES: usize = 512;
const MAX_HTTP_URL_BYTES: usize = 8 * 1024;
const MAX_HTTP_REQUEST_BYTES: u64 = 512 * 1024 * 1024;
const MAX_HTTP_RESPONSE_BYTES: u64 = 1024 * 1024 * 1024;

fn without_panicking<T>(boundary: &str, index: usize, operation: impl FnOnce() -> T) -> T {
    match catch_unwind(AssertUnwindSafe(operation)) {
        Ok(result) => result,
        Err(_) => panic!("{boundary} panicked on deterministic hostile case {index}"),
    }
}

fn assert_bucket_counts(counts: [usize; MUTATION_BUCKETS]) {
    assert_eq!(counts, [CASES_PER_BUCKET; MUTATION_BUCKETS]);
}

fn assert_canonical_host(host: &str) {
    assert!(!host.is_empty());
    assert_eq!(host, host.trim());
    assert_eq!(host, host.to_ascii_lowercase());
    assert!(!host.chars().any(char::is_whitespace));
    assert!(!host
        .chars()
        .any(|ch| matches!(ch, '/' | '\\' | '@' | '#' | '?')));

    if host.parse::<IpAddr>().is_ok() {
        return;
    }
    assert!(host.is_ascii());
    assert!(!host.starts_with('.'));
    assert!(!host.ends_with('.'));
    for label in host.split('.') {
        assert!(!label.is_empty());
        assert!(label.len() <= 63);
        assert!(!label.starts_with('-'));
        assert!(!label.ends_with('-'));
        assert!(label
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-'));
    }
}

#[test]
fn sec096_canonicalize_host_survives_4096_bounded_mutations() {
    let mut buckets = [0usize; MUTATION_BUCKETS];
    let mut accepted = 0usize;
    let mut rejected = 0usize;

    for index in 0..CASE_COUNT {
        let bucket = index % MUTATION_BUCKETS;
        let serial = index / MUTATION_BUCKETS;
        buckets[bucket] += 1;
        let base = format!("node{serial}.edge.example");
        let input = match bucket {
            0 => base,
            1 => base.to_ascii_uppercase(),
            2 => format!("{base}."),
            3 => format!("[2001:db8::{serial:x}]"),
            4 => format!("/{base}"),
            5 => format!("{base}/path"),
            6 => format!("{base}?query={serial}"),
            7 => format!("{base}#fragment"),
            8 => format!("{base}@attacker"),
            9 => format!(r#"{base}\attacker"#),
            10 => format!("node{serial}.edge .example"),
            11 => format!("é-{base}"),
            12 => format!("-node{serial}.example"),
            13 => format!("node{serial}..example"),
            14 => "a".repeat(254),
            15 => format!("{base}\0"),
            _ => unreachable!(),
        };
        assert!(input.len() <= MAX_SMALL_CASE_BYTES);

        match without_panicking("canonicalize_host", index, || canonicalize_host(&input)) {
            Ok(host) => {
                accepted += 1;
                assert_canonical_host(&host);
                assert!(bucket <= 3, "host parser accepted hostile bucket {bucket}");
            }
            Err(NetGateError::InvalidDestination) => {
                rejected += 1;
                assert!(bucket >= 4, "host parser rejected valid bucket {bucket}");
            }
            Err(error) => panic!("canonicalize_host returned unexpected error: {error:?}"),
        }
    }

    assert_bucket_counts(buckets);
    assert_eq!(accepted, 4 * CASES_PER_BUCKET);
    assert_eq!(rejected, 12 * CASES_PER_BUCKET);
}

#[test]
fn sec096_ip_cidr_parser_survives_4096_bounded_mutations() {
    let mut buckets = [0usize; MUTATION_BUCKETS];
    let mut accepted = 0usize;
    let mut rejected = 0usize;

    for index in 0..CASE_COUNT {
        let bucket = index % MUTATION_BUCKETS;
        let serial = index / MUTATION_BUCKETS;
        buckets[bucket] += 1;
        let octet_three = serial / 256;
        let octet_four = serial % 256;
        let input = match bucket {
            0 => format!("10.21.{octet_three}.{octet_four}/24"),
            1 => format!("2001:db8::{serial:x}/64"),
            2 => format!("10.21.{octet_three}.{octet_four}/33"),
            3 => format!("2001:db8::{serial:x}/129"),
            4 => format!("host-{serial}.example/24"),
            5 => "/24".to_string(),
            6 => format!("10.21.{octet_three}.{octet_four}"),
            7 => format!("10.21.{octet_three}.{octet_four}/24/{serial}"),
            8 => format!("10.21.{octet_three}.{octet_four}/999999999999999999999999"),
            9 => format!("10.21.{octet_three}.{octet_four}/prefix"),
            10 => format!("192.0.2.{octet_four}/0"),
            11 => format!("2001:db8::{serial:x}/"),
            12 => format!("10.21.{octet_three}.{octet_four}/+24"),
            13 => format!("10.21.{octet_three}.{octet_four}/-1"),
            14 => format!(" 10.21.{octet_three}.{octet_four} /24 "),
            15 => format!("10.21..{octet_four}/24"),
            _ => unreachable!(),
        };
        assert!(input.len() <= MAX_SMALL_CASE_BYTES);

        match without_panicking("IpCidr::parse", index, || IpCidr::parse(&input)) {
            Ok(cidr) => {
                accepted += 1;
                assert!(
                    matches!(bucket, 0 | 1 | 10 | 12),
                    "CIDR parser accepted bucket {bucket}: {input:?}"
                );
                let canonical = cidr.canonical();
                let (network, _) = canonical.split_once('/').expect("canonical CIDR separator");
                let network_ip = network.parse::<IpAddr>().expect("canonical network IP");
                assert!(cidr.contains(network_ip));
                let reparsed = IpCidr::parse(&canonical).expect("canonical CIDR reparses");
                assert_eq!(reparsed, cidr);
                assert_eq!(reparsed.canonical(), canonical);
            }
            Err(NetGateError::InvalidCapability) => {
                rejected += 1;
                assert!(!matches!(bucket, 0 | 1 | 10 | 12));
            }
            Err(error) => panic!("IpCidr::parse returned unexpected error: {error:?}"),
        }
    }

    assert_bucket_counts(buckets);
    assert_eq!(accepted, 4 * CASES_PER_BUCKET);
    assert_eq!(rejected, 12 * CASES_PER_BUCKET);
}

fn http_spec(url: String) -> HttpRequestSpec {
    HttpRequestSpec {
        url,
        component_id: "connect".to_string(),
        document_id: Some("doc-1".to_string()),
        automation_id: None,
        purpose: "connector request".to_string(),
        data_class: NetworkDataClass::Metadata,
        method: "GET".to_string(),
        request_bytes: 0,
        response_ceiling_bytes: 4_096,
        timeout_ms: 3_000,
        redirect_policy: RedirectPolicy::Reauthorize { max_hops: 3 },
        tls: TlsVerificationPolicy::SystemRoots,
    }
}

#[test]
fn sec096_http_request_parser_survives_4096_bounded_mutations() {
    let mut buckets = [0usize; MUTATION_BUCKETS];
    let mut accepted = 0usize;
    let mut invalid_http = 0usize;
    let mut invalid_tls = 0usize;

    for index in 0..CASE_COUNT {
        let bucket = index % MUTATION_BUCKETS;
        let serial = index / MUTATION_BUCKETS;
        buckets[bucket] += 1;
        let host = format!("api-{serial}.example.com");
        let mut spec = http_spec(format!("https://{host}/resource/{serial}"));
        match bucket {
            0 => spec.url = format!("https://{host}/resource/{serial}?case={serial}"),
            1 => spec.url = format!("http://{host}/resource/{serial}"),
            2 => spec.url = format!("ftp://{host}/resource/{serial}"),
            3 => spec.url = format!("https://user:secret@{host}/resource/{serial}"),
            4 => spec.url = "https://[2001:db8::1".to_string(),
            5 => spec.url = format!("https://?q={serial}"),
            6 => {
                let prefix = format!("https://e{serial}.example/");
                spec.url = format!(
                    "{prefix}{}",
                    "x".repeat(MAX_HTTP_URL_BYTES + 1 - prefix.len())
                );
            }
            7 => spec.url = format!("data:text/plain,case-{serial}"),
            8 => spec.method = "TRACE".to_string(),
            9 => spec.timeout_ms = 0,
            10 => spec.timeout_ms = 120_001,
            11 => spec.request_bytes = MAX_HTTP_REQUEST_BYTES + 1,
            12 => spec.response_ceiling_bytes = MAX_HTTP_RESPONSE_BYTES + 1,
            13 => {
                spec.tls = TlsVerificationPolicy::PinnedSpkiSha256 {
                    scope_host: format!("wrong-{serial}.example.com"),
                    spki_sha256_hex: "a".repeat(64),
                };
            }
            14 => {
                spec.tls = TlsVerificationPolicy::CustomCaSha256 {
                    scope_host: host.clone(),
                    ca_sha256_hex: "a".repeat(63),
                };
            }
            15 => spec.url = format!("https://{host}/safe#discard-{serial}"),
            _ => unreachable!(),
        }
        assert!(spec.url.len() <= MAX_HTTP_URL_BYTES + 1);
        assert!(spec.component_id.len() <= MAX_SMALL_CASE_BYTES);
        assert!(spec.purpose.len() <= MAX_SMALL_CASE_BYTES);
        assert!(spec.method.len() <= MAX_SMALL_CASE_BYTES);

        match without_panicking("prepare_http_request", index, || {
            prepare_http_request_for_test(&spec)
        }) {
            Ok(prepared) => {
                accepted += 1;
                assert!(
                    matches!(bucket, 0 | 1 | 15),
                    "HTTP request parser accepted bucket {bucket}, URL {:?}",
                    spec.url
                );
                assert!(matches!(prepared.scheme.as_str(), "http" | "https"));
                assert!(!prepared.host.is_empty());
                assert_eq!(prepared.host, prepared.host.to_ascii_lowercase());
                assert!(prepared.port > 0);
                assert!(!prepared.normalized_url.contains('#'));
                assert_eq!(prepared.network_request.target_host, prepared.host);
                assert_eq!(
                    prepared.network_request.protocol,
                    if prepared.scheme == "https" {
                        NetworkProtocol::Https
                    } else {
                        NetworkProtocol::Http
                    }
                );
            }
            Err(NetGateError::InvalidHttpRequest) => {
                invalid_http += 1;
                assert!((2..=12).contains(&bucket));
            }
            Err(NetGateError::TlsPolicyViolation) => {
                invalid_tls += 1;
                assert!(matches!(bucket, 13 | 14));
            }
            Err(error) => panic!("prepare_http_request returned unexpected error: {error:?}"),
        }
    }

    assert_bucket_counts(buckets);
    assert_eq!(accepted, 3 * CASES_PER_BUCKET);
    assert_eq!(invalid_http, 11 * CASES_PER_BUCKET);
    assert_eq!(invalid_tls, 2 * CASES_PER_BUCKET);
}

// Keep the hostile-input call inside the no-panic boundary helper while using only public APIs.
fn prepare_http_request_for_test(
    spec: &HttpRequestSpec,
) -> Result<vgt_netgate::PreparedHttpRequest, NetGateError> {
    vgt_netgate::prepare_http_request(spec)
}

fn network_request(serial: usize) -> NetworkRequest {
    NetworkRequest {
        component_id: format!("connect-{serial}"),
        document_id: Some(format!("doc-{serial}")),
        automation_id: None,
        target_host: format!("request-{serial}.example.test"),
        target_port: 443,
        protocol: NetworkProtocol::Https,
        direction: NetworkDirection::Outbound,
        data_class: NetworkDataClass::Metadata,
        purpose: format!("mutation {serial}"),
        method: Some("GET".to_string()),
        expected_request_bytes: 0,
        expected_response_bytes: 4_096,
        timeout_ms: 3_000,
    }
}

#[test]
fn sec096_network_request_validator_survives_4096_bounded_mutations() {
    let gate = NetGate::new();
    let mut buckets = [0usize; MUTATION_BUCKETS];
    let mut accepted = 0usize;
    let mut rejected = 0usize;

    for index in 0..CASE_COUNT {
        let bucket = index % MUTATION_BUCKETS;
        let serial = index / MUTATION_BUCKETS;
        buckets[bucket] += 1;
        let mut request = network_request(serial);
        match bucket {
            0 => {}
            1 => request.target_host = format!("request-{serial}.example/path"),
            2 => request.component_id.clear(),
            3 => request.component_id = format!("bad\ncomponent-{serial}"),
            4 => request.component_id = "c".repeat(129),
            5 => request.document_id = Some(String::new()),
            6 => request.document_id = Some(format!("bad@doc-{serial}")),
            7 => request.purpose.clear(),
            8 => request.purpose = format!("purpose\n{serial}"),
            9 => request.target_port = 0,
            10 => request.timeout_ms = 0,
            11 => request.timeout_ms = 120_001,
            12 => request.expected_request_bytes = MAX_HTTP_REQUEST_BYTES + 1,
            13 => request.expected_response_bytes = MAX_HTTP_RESPONSE_BYTES + 1,
            14 => request.method = Some("TRACE".to_string()),
            15 => {
                request.protocol = NetworkProtocol::Tcp;
                request.method = Some("GET".to_string());
            }
            _ => unreachable!(),
        }
        assert!(request.component_id.len() <= MAX_SMALL_CASE_BYTES);
        assert!(request.target_host.len() <= MAX_SMALL_CASE_BYTES);
        assert!(request.purpose.len() <= MAX_SMALL_CASE_BYTES);
        assert!(request
            .document_id
            .as_ref()
            .is_none_or(|value| value.len() <= MAX_SMALL_CASE_BYTES));
        assert!(request
            .automation_id
            .as_ref()
            .is_none_or(|value| value.len() <= MAX_SMALL_CASE_BYTES));
        assert!(request
            .method
            .as_ref()
            .is_none_or(|value| value.len() <= MAX_SMALL_CASE_BYTES));

        match without_panicking("NetGate::preview_request", index, || {
            gate.preview_request(&request)
        }) {
            Ok(decision) => {
                accepted += 1;
                assert_eq!(bucket, 0);
                assert_eq!(
                    decision.verdict,
                    vgt_netgate::ConnectionVerdict::BlockedByDefault
                );
                assert_eq!(
                    decision.canonical_host,
                    format!("request-{serial}.example.test")
                );
                assert!(decision.audit_id.is_none());
            }
            Err(NetGateError::InvalidDestination) => {
                rejected += 1;
                assert_ne!(bucket, 0);
            }
            Err(error) => panic!("NetGate::preview_request returned unexpected error: {error:?}"),
        }
    }

    assert_bucket_counts(buckets);
    assert_eq!(accepted, CASES_PER_BUCKET);
    assert_eq!(rejected, 15 * CASES_PER_BUCKET);
    assert!(
        gate.get_audit_log().is_empty(),
        "preview must stay side-effect-free"
    );
}

fn capability(serial: usize) -> NetworkCapabilityGrant {
    NetworkCapabilityGrant {
        id: format!("cap-{serial}"),
        component_id: format!("component-{serial}"),
        document_id: Some(format!("doc-{serial}")),
        automation_id: None,
        purpose: format!("purpose {serial}"),
        allowed_hosts: vec![format!("node-{serial}.example.com")],
        allowed_cidrs: Vec::new(),
        allowed_ports: vec![443],
        protocols: vec![NetworkProtocol::Https],
        directions: vec![NetworkDirection::Outbound],
        data_classes: vec![NetworkDataClass::Metadata],
        destination_classes: vec![DestinationClass::PublicInternet],
        methods: vec!["GET".to_string()],
        expires_at_utc_ms: None,
        limits: NetworkLimits::default(),
    }
}

#[test]
fn sec096_capability_ingress_survives_4096_bounded_mutations() {
    let gate = NetGate::new();
    let mut buckets = [0usize; MUTATION_BUCKETS];
    let mut accepted = 0usize;
    let mut invalid_capability = 0usize;
    let mut invalid_destination = 0usize;

    for index in 0..CASE_COUNT {
        let bucket = index % MUTATION_BUCKETS;
        let serial = index / MUTATION_BUCKETS;
        buckets[bucket] += 1;
        let mut grant = capability(serial);
        match bucket {
            0 => {}
            1 => {
                grant.allowed_hosts = vec![format!(" NODE-{serial}.EXAMPLE.COM. ")];
                grant.allowed_ports = vec![443, 443];
                grant.methods = vec!["get".to_string(), " GET ".to_string()];
            }
            2 => grant.id.clear(),
            3 => grant.id = format!("bad@cap-{serial}"),
            4 => grant.id = "c".repeat(129),
            5 => grant.component_id = format!("component\n-{serial}"),
            6 => grant.purpose = format!("purpose\n{serial}"),
            7 => grant.allowed_hosts = vec![format!("bad-{serial}.example/path")],
            8 => {
                grant.allowed_hosts.clear();
                grant.allowed_cidrs.clear();
            }
            9 => {
                grant.allowed_hosts.clear();
                grant.allowed_cidrs = vec![format!("999.999.{serial}.1/24")];
            }
            10 => grant.methods = vec!["TRACE".to_string()],
            11 => grant.allowed_ports.clear(),
            12 => grant.allowed_ports = vec![0],
            13 => grant.protocols.clear(),
            14 => grant.destination_classes.clear(),
            15 => match serial % 4 {
                0 => grant.limits.max_requests_per_minute = 0,
                1 => grant.document_id = Some(String::new()),
                2 => grant.directions.clear(),
                3 => grant.data_classes.clear(),
                _ => unreachable!(),
            },
            _ => unreachable!(),
        }
        assert!(grant.id.len() <= MAX_SMALL_CASE_BYTES);
        assert!(grant.component_id.len() <= MAX_SMALL_CASE_BYTES);
        assert!(grant.purpose.len() <= MAX_SMALL_CASE_BYTES);
        assert!(grant
            .allowed_hosts
            .iter()
            .all(|value| value.len() <= MAX_SMALL_CASE_BYTES));
        assert!(grant
            .allowed_cidrs
            .iter()
            .all(|value| value.len() <= MAX_SMALL_CASE_BYTES));
        assert!(grant
            .methods
            .iter()
            .all(|value| value.len() <= MAX_SMALL_CASE_BYTES));
        assert!(grant
            .document_id
            .as_ref()
            .is_none_or(|value| value.len() <= MAX_SMALL_CASE_BYTES));
        assert!(grant
            .automation_id
            .as_ref()
            .is_none_or(|value| value.len() <= MAX_SMALL_CASE_BYTES));

        match without_panicking("NetGate::inspect_capability", index, || {
            gate.inspect_capability(grant)
        }) {
            Ok(inspection) => {
                accepted += 1;
                assert!(matches!(bucket, 0 | 1));
                if bucket == 1 {
                    assert_eq!(
                        inspection.allowed_hosts,
                        vec![format!("node-{serial}.example.com")]
                    );
                    assert_eq!(inspection.allowed_ports, vec![443]);
                    assert_eq!(inspection.methods, vec!["GET"]);
                } else {
                    assert_eq!(
                        inspection.allowed_hosts,
                        vec![format!("node-{serial}.example.com")]
                    );
                }
            }
            Err(NetGateError::InvalidCapability) => {
                invalid_capability += 1;
                assert_ne!(bucket, 0);
                assert_ne!(bucket, 1);
                assert_ne!(bucket, 7);
            }
            Err(NetGateError::InvalidDestination) => {
                invalid_destination += 1;
                assert_eq!(bucket, 7);
            }
            Err(error) => {
                panic!("NetGate::inspect_capability returned unexpected error: {error:?}")
            }
        }
    }

    assert_bucket_counts(buckets);
    assert_eq!(accepted, 2 * CASES_PER_BUCKET);
    assert_eq!(invalid_capability, 13 * CASES_PER_BUCKET);
    assert_eq!(invalid_destination, CASES_PER_BUCKET);
    assert!(
        gate.get_capabilities().is_empty(),
        "inspection must not install a grant"
    );
}

#[test]
fn sec096_egress_proxy_policy_survives_4096_bounded_mutations() {
    let mut buckets = [0usize; MUTATION_BUCKETS];
    let mut accepted = 0usize;
    let mut invalid_destination = 0usize;
    let mut proxy_policy_rejections = 0usize;

    for index in 0..CASE_COUNT {
        let bucket = index % MUTATION_BUCKETS;
        let serial = index / MUTATION_BUCKETS;
        buckets[bucket] += 1;
        let (host, port) = match bucket {
            0 => (format!("egress-{serial}.example.net"), 443),
            1 => (format!(" EGRESS-{serial}.EXAMPLE.NET. "), 8_443),
            2 => (format!("[2001:db8::{serial:x}]"), 443),
            3 => (String::new(), 443),
            4 => (format!("user@proxy-{serial}.example.net"), 443),
            5 => (format!("proxy-{serial}.example/path"), 443),
            6 => (format!(r#"proxy-{serial}.example\path"#), 443),
            7 => (format!("é-proxy-{serial}.example.net"), 443),
            8 => (format!("{}.example", "a".repeat(254)), 443),
            9 => (format!("proxy-{serial}..example"), 443),
            10 => (format!("[2001:db8::{serial:x}"), 443),
            11 => (" localhost. ".to_string(), (serial + 1) as u16),
            12 => (format!("proxy-{serial}.example?query"), 443),
            13 => (format!("proxy {serial}.example"), 443),
            14 => (format!("proxy-{serial}.example"), 0),
            15 => (format!("203.0.{}.{}", serial / 256, serial % 256), 443),
            _ => unreachable!(),
        };
        assert!(host.len() <= MAX_SMALL_CASE_BYTES);

        match without_panicking("EgressProxyPolicy::validated", index, || {
            EgressProxyPolicy::validated(host.clone(), port)
        }) {
            Ok(policy) => {
                accepted += 1;
                assert!(matches!(bucket, 0 | 1 | 2 | 11 | 15));
                assert_eq!(policy.port, port);
                assert_canonical_host(&policy.host);
                assert_eq!(canonicalize_host(&policy.host), Ok(policy.host.clone()));
            }
            Err(NetGateError::InvalidDestination) => {
                invalid_destination += 1;
                assert!(matches!(bucket, 3..=10 | 12 | 13));
            }
            Err(NetGateError::ProxyPolicyViolation) => {
                proxy_policy_rejections += 1;
                assert_eq!(bucket, 14);
            }
            Err(error) => {
                panic!("EgressProxyPolicy::validated returned unexpected error: {error:?}")
            }
        }
    }

    assert_bucket_counts(buckets);
    assert_eq!(accepted, 5 * CASES_PER_BUCKET);
    assert_eq!(invalid_destination, 10 * CASES_PER_BUCKET);
    assert_eq!(proxy_policy_rejections, CASES_PER_BUCKET);
}

#[test]
fn sec096_passive_resource_gate_survives_4096_bounded_mutations() {
    let mut buckets = [0usize; MUTATION_BUCKETS];
    let mut accepted = 0usize;
    let mut rejected = 0usize;

    for index in 0..CASE_COUNT {
        let bucket = index % MUTATION_BUCKETS;
        let serial = index / MUTATION_BUCKETS;
        buckets[bucket] += 1;
        let input = match bucket {
            0 => " \t ".to_string(),
            1 => "ABOUT:BLANK".to_string(),
            2 => format!("data:text/plain,case-{serial}"),
            3 => format!("blob:vgt-local-{serial}"),
            4 => format!("cid:asset-{serial}"),
            5 => format!("vgt://doc/asset-{serial}"),
            6 => format!("#fragment-{serial}"),
            7 => format!("https://tracker-{serial}.example/pixel"),
            8 => format!("http://tracker-{serial}.example/font"),
            9 => format!("//tracker-{serial}.example/beacon"),
            10 => format!("file:///local/path-{serial}"),
            11 => format!("ftp://tracker-{serial}.example/resource"),
            12 => format!("javascript:alert({serial})"),
            13 => format!("DATA:text/plain,case-{serial}"),
            14 => format!("#local-reference-{serial}"),
            15 => format!(" \tvgt:local-{serial}\n"),
            _ => unreachable!(),
        };
        assert!(input.len() <= MAX_SMALL_CASE_BYTES);

        match without_panicking("validate_passive_document_resource", index, || {
            validate_passive_document_resource(&input)
        }) {
            Ok(()) => {
                accepted += 1;
                assert!(matches!(bucket, 0..=6 | 13..=15));
            }
            Err(NetGateError::AccessDenied) => {
                rejected += 1;
                assert!(matches!(bucket, 7..=12));
            }
            Err(error) => panic!("passive resource gate returned unexpected error: {error:?}"),
        }
    }

    assert_bucket_counts(buckets);
    assert_eq!(accepted, 10 * CASES_PER_BUCKET);
    assert_eq!(rejected, 6 * CASES_PER_BUCKET);
}
