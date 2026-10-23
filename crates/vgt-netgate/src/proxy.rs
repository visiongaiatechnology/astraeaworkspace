//! STATUS: DIAMANT VGT SUPREME
//! Enterprise egress proxy policy.
//!
//! A configured proxy is mandatory, never advisory. Official NetGate connectors must not resolve
//! or connect to the destination directly while this policy is active. The destination hostname is
//! carried inside the bounded HTTP CONNECT request so remote DNS remains at the proxy boundary.

use crate::{canonicalize_host, NetGateError};
use serde::{Deserialize, Serialize};

const MAX_PROXY_HEADER_BYTES: usize = 8 * 1024;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EgressProxyPolicy {
    pub host: String,
    pub port: u16,
}

impl EgressProxyPolicy {
    pub fn validated(host: impl Into<String>, port: u16) -> Result<Self, NetGateError> {
        let host = canonicalize_host(&host.into())?;
        if port == 0 || host.is_empty() {
            return Err(NetGateError::ProxyPolicyViolation);
        }
        Ok(Self { host, port })
    }
}

pub(crate) fn connect_request_bytes(
    target_host: &str,
    target_port: u16,
) -> Result<Vec<u8>, NetGateError> {
    let host = canonicalize_host(target_host)?;
    if target_port == 0 {
        return Err(NetGateError::InvalidDestination);
    }
    let authority = if host.contains(':') {
        format!("[{host}]:{target_port}")
    } else {
        format!("{host}:{target_port}")
    };
    let request = format!(
        "CONNECT {authority} HTTP/1.1\r\nHost: {authority}\r\nProxy-Connection: Keep-Alive\r\n\r\n"
    );
    if request.len() > MAX_PROXY_HEADER_BYTES {
        return Err(NetGateError::ProxyPolicyViolation);
    }
    Ok(request.into_bytes())
}

pub(crate) fn validate_connect_response(header: &[u8]) -> Result<(), NetGateError> {
    if header.is_empty()
        || header.len() > MAX_PROXY_HEADER_BYTES
        || !header.ends_with(b"\r\n\r\n")
        || header[..header.len().saturating_sub(4)]
            .windows(4)
            .any(|window| window == b"\r\n\r\n")
        || header.iter().enumerate().any(|(index, byte)| {
            (*byte == b'\r' && header.get(index + 1) != Some(&b'\n'))
                || (*byte == b'\n'
                    && index.checked_sub(1).and_then(|i| header.get(i)) != Some(&b'\r'))
                || (*byte < b' ' && !matches!(*byte, b'\r' | b'\n' | b'\t'))
                || *byte == 0x7f
        })
    {
        return Err(NetGateError::ProxyPolicyViolation);
    }
    let text = std::str::from_utf8(header).map_err(|_| NetGateError::ProxyPolicyViolation)?;
    let status_line_end = text
        .find("\r\n")
        .ok_or(NetGateError::ProxyPolicyViolation)?;
    let status_line = &text[..status_line_end];
    let (version, status_and_reason) = status_line
        .split_once(' ')
        .ok_or(NetGateError::ProxyPolicyViolation)?;
    let (status, reason) = status_and_reason
        .split_once(' ')
        .ok_or(NetGateError::ProxyPolicyViolation)?;
    if !matches!(version, "HTTP/1.0" | "HTTP/1.1") || status != "200" {
        return Err(NetGateError::ProxyPolicyViolation);
    }
    if reason
        .bytes()
        .any(|byte| (byte < b' ' && byte != b'\t') || byte == 0x7f)
    {
        return Err(NetGateError::ProxyPolicyViolation);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn connect_request_is_bounded_and_host_bound() {
        let bytes = connect_request_bytes("Example.COM.", 443).expect("request");
        let text = String::from_utf8(bytes).expect("utf8");
        assert!(text.starts_with("CONNECT example.com:443 HTTP/1.1\r\n"));
        assert!(text.contains("Host: example.com:443\r\n"));
    }

    #[test]
    fn proxy_only_accepts_successful_connect_response() {
        assert!(validate_connect_response(b"HTTP/1.1 200 Connection Established\r\n\r\n").is_ok());
        assert_eq!(
            validate_connect_response(b"HTTP/1.1 407 Proxy Authentication Required\r\n\r\n"),
            Err(NetGateError::ProxyPolicyViolation)
        );
    }

    #[test]
    fn rejects_bare_lf_malformed_status_line() {
        let malformed = b"HTTP/1.1 200 OK\nX: y\r\n\r\n";
        assert_eq!(
            validate_connect_response(malformed),
            Err(NetGateError::ProxyPolicyViolation)
        );
    }

    #[test]
    fn accepts_and_rejects_exact_proxy_header_size_boundary() {
        let status_prefix = b"HTTP/1.1 200 ";
        let terminator = b"\r\n\r\n";
        let reason_len = MAX_PROXY_HEADER_BYTES - status_prefix.len() - terminator.len();
        let mut at_limit = Vec::with_capacity(MAX_PROXY_HEADER_BYTES);
        at_limit.extend_from_slice(status_prefix);
        at_limit.resize(at_limit.len() + reason_len, b'A');
        at_limit.extend_from_slice(terminator);
        assert_eq!(at_limit.len(), MAX_PROXY_HEADER_BYTES);
        assert_eq!(validate_connect_response(&at_limit), Ok(()));

        let mut over_limit = Vec::with_capacity(MAX_PROXY_HEADER_BYTES + 1);
        over_limit.extend_from_slice(status_prefix);
        over_limit.resize(over_limit.len() + reason_len + 1, b'A');
        over_limit.extend_from_slice(terminator);
        assert_eq!(over_limit.len(), MAX_PROXY_HEADER_BYTES + 1);
        assert_eq!(
            validate_connect_response(&over_limit),
            Err(NetGateError::ProxyPolicyViolation)
        );
    }

    #[test]
    fn connect_request_enforces_authority_constraints() {
        let cases = [
            ("Example.COM.", 443, Some("example.com:443")),
            ("192.0.2.10", 8443, Some("192.0.2.10:8443")),
            ("[2001:db8::1]", 443, Some("[2001:db8::1]:443")),
            ("example.com/path", 443, None),
            ("user@example.com", 443, None),
            ("example.com?x=1", 443, None),
            ("example.com#fragment", 443, None),
            ("example.com\r\nHost: attacker", 443, None),
            ("example.com", 0, None),
        ];

        for (host, port, expected_authority) in cases {
            match expected_authority {
                Some(authority) => {
                    let request = connect_request_bytes(host, port).expect("valid authority");
                    assert!(request.len() <= MAX_PROXY_HEADER_BYTES);
                    let request = String::from_utf8(request).expect("ASCII request");
                    assert!(request.starts_with(&format!("CONNECT {authority} HTTP/1.1\r\n")));
                    assert!(request.contains(&format!("Host: {authority}\r\n")));
                }
                None => assert!(connect_request_bytes(host, port).is_err()),
            }
        }

        let maximum_host = format!(
            "{}.{}.{}.{}",
            "a".repeat(63),
            "b".repeat(63),
            "c".repeat(63),
            "d".repeat(61)
        );
        assert_eq!(maximum_host.len(), 253);
        let maximum_request =
            connect_request_bytes(&maximum_host, u16::MAX).expect("253-byte DNS host");
        assert!(maximum_request.len() <= MAX_PROXY_HEADER_BYTES);

        let oversized_host = format!("{maximum_host}e");
        assert_eq!(oversized_host.len(), 254);
        assert_eq!(
            connect_request_bytes(&oversized_host, 443),
            Err(NetGateError::InvalidDestination)
        );
    }

    #[test]
    fn deterministic_adversarial_response_corpus_has_exact_accounting() {
        const CASES: usize = 4_096;
        const ACCEPTED_CASES: usize = CASES / 8;
        let mut accepted = 0usize;
        let mut rejected = 0usize;
        let mut random = 0x9e37_79b9_u32;

        for case_index in 0..CASES {
            let family = case_index % 8;
            let variant = case_index / 8;
            let (input, expected_acceptance) = match family {
                0 => {
                    let version = if variant % 2 == 0 {
                        "HTTP/1.0"
                    } else {
                        "HTTP/1.1"
                    };
                    let reason = "R".repeat(variant % 64);
                    let header =
                        format!("{version} 200 {reason}\r\nProxy-Agent: netgate-{variant}\r\n\r\n")
                            .into_bytes();
                    (header, true)
                }
                1 => {
                    let status = 300 + (variant % 300);
                    let header =
                        format!("HTTP/1.1 {status} Rejected\r\nProxy-Agent: netgate\r\n\r\n")
                            .into_bytes();
                    (header, false)
                }
                2 => {
                    let version = ["HTTP/2", "HTTP/1.2", "http/1.1", "ICY"][variant % 4];
                    (format!("{version} 200 OK\r\n\r\n").into_bytes(), false)
                }
                3 => {
                    let separator = ["\t", "  ", "\t ", " \t"][variant % 4];
                    (
                        format!("HTTP/1.1{separator}200 OK\r\n\r\n").into_bytes(),
                        false,
                    )
                }
                4 => (
                    format!("HTTP/1.1 200 OK\nX-Case: {variant}\r\n\r\n").into_bytes(),
                    false,
                ),
                5 => {
                    let ending = [b"\r\n".as_slice(), b"\n", b"\r", b"\r\n\r"][variant % 4];
                    let mut header = b"HTTP/1.1 200 OK".to_vec();
                    header.extend_from_slice(ending);
                    (header, false)
                }
                6 => {
                    let mut header = format!("HTTP/1.1 200 OK\r\nX-Case: {variant}-").into_bytes();
                    header.push(if variant % 2 == 0 { 0xff } else { 0x7f });
                    header.extend_from_slice(b"\r\n\r\n");
                    (header, false)
                }
                _ => {
                    random ^= random << 13;
                    random ^= random >> 17;
                    random ^= random << 5;
                    let noise_len = 1 + (variant % 32);
                    let mut header = format!("INVALID-{random:08x}-").into_bytes();
                    header.extend(std::iter::repeat_n(b'Z', noise_len));
                    header.extend_from_slice(b"\r\n\r\n");
                    (header, false)
                }
            };

            assert!(
                input.len() <= MAX_PROXY_HEADER_BYTES,
                "case {case_index} exceeded cap"
            );
            let outcome = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                validate_connect_response(&input)
            }));
            let outcome =
                outcome.unwrap_or_else(|_| panic!("parser panicked on case {case_index}"));
            match outcome {
                Ok(()) => {
                    accepted += 1;
                    assert!(
                        expected_acceptance,
                        "malformed case {case_index} was accepted"
                    );
                }
                Err(NetGateError::ProxyPolicyViolation) => {
                    rejected += 1;
                    assert!(!expected_acceptance, "valid case {case_index} was rejected");
                }
                Err(error) => panic!("case {case_index} returned unclassified error: {error:?}"),
            }
        }

        assert_eq!(accepted, ACCEPTED_CASES);
        assert_eq!(rejected, CASES - ACCEPTED_CASES);
        assert_eq!(accepted + rejected, CASES);
    }
}
