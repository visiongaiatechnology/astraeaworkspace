//! STATUS: DIAMANT VGT SUPREME
use crate::model::{DestinationClass, NetGateError};
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};

const MAX_HOST_BYTES: usize = 253;
const MAX_RESOLVED_IPS: usize = 32;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct IpCidr {
    network: IpAddr,
    prefix: u8,
}

impl IpCidr {
    pub fn parse(value: &str) -> Result<Self, NetGateError> {
        let (raw_ip, raw_prefix) = value
            .trim()
            .split_once('/')
            .ok_or(NetGateError::InvalidCapability)?;
        let ip: IpAddr = raw_ip
            .parse()
            .map_err(|_| NetGateError::InvalidCapability)?;
        let prefix: u8 = raw_prefix
            .parse()
            .map_err(|_| NetGateError::InvalidCapability)?;
        let max = if ip.is_ipv4() { 32 } else { 128 };
        if prefix > max {
            return Err(NetGateError::InvalidCapability);
        }
        let network = mask_ip(ip, prefix);
        Ok(Self { network, prefix })
    }

    pub fn contains(&self, ip: IpAddr) -> bool {
        match (self.network, ip) {
            (IpAddr::V4(_), IpAddr::V4(_)) | (IpAddr::V6(_), IpAddr::V6(_)) => {
                mask_ip(ip, self.prefix) == self.network
            }
            _ => false,
        }
    }

    pub fn canonical(&self) -> String {
        format!("{}/{}", self.network, self.prefix)
    }
}

fn mask_ip(ip: IpAddr, prefix: u8) -> IpAddr {
    match ip {
        IpAddr::V4(v4) => {
            let value = u32::from(v4);
            let mask = if prefix == 0 {
                0
            } else {
                u32::MAX << (32 - prefix)
            };
            IpAddr::V4(Ipv4Addr::from(value & mask))
        }
        IpAddr::V6(v6) => {
            let value = u128::from(v6);
            let mask = if prefix == 0 {
                0
            } else {
                u128::MAX << (128 - prefix)
            };
            IpAddr::V6(Ipv6Addr::from(value & mask))
        }
    }
}

pub fn canonicalize_host(host: &str) -> Result<String, NetGateError> {
    let trimmed = host.trim();
    if trimmed.is_empty()
        || trimmed.len() > MAX_HOST_BYTES
        || trimmed
            .chars()
            .any(|ch| matches!(ch, '/' | '\\' | '@' | '#' | '?'))
        || trimmed.chars().any(char::is_whitespace)
    {
        return Err(NetGateError::InvalidDestination);
    }
    let unbracketed = if trimmed.starts_with('[') && trimmed.ends_with(']') {
        &trimmed[1..trimmed.len() - 1]
    } else {
        trimmed
    };
    if let Ok(ip) = unbracketed.parse::<IpAddr>() {
        return Ok(ip.to_string());
    }
    let canonical = unbracketed.trim_end_matches('.').to_ascii_lowercase();
    if canonical == "localhost" {
        return Ok(canonical);
    }
    if canonical.is_empty() || !canonical.is_ascii() {
        return Err(NetGateError::InvalidDestination);
    }
    for label in canonical.split('.') {
        if label.is_empty()
            || label.len() > 63
            || label.starts_with('-')
            || label.ends_with('-')
            || !label
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'-')
        {
            return Err(NetGateError::InvalidDestination);
        }
    }
    Ok(canonical)
}

pub fn classify_ip(ip: IpAddr) -> DestinationClass {
    match ip {
        IpAddr::V4(v4) if v4.is_loopback() => DestinationClass::Loopback,
        IpAddr::V4(v4) if v4.is_link_local() => DestinationClass::LinkLocal,
        IpAddr::V4(v4) if v4.is_private() => DestinationClass::PrivateLan,
        IpAddr::V6(v6) if v6.is_loopback() => DestinationClass::Loopback,
        IpAddr::V6(v6) if v6.is_unicast_link_local() => DestinationClass::LinkLocal,
        IpAddr::V6(v6) if v6.is_unique_local() => DestinationClass::PrivateLan,
        _ => DestinationClass::PublicInternet,
    }
}

pub(crate) fn normalized_destination_ips(
    host: &str,
    resolved: &[IpAddr],
) -> Result<Vec<IpAddr>, NetGateError> {
    if let Ok(ip) = host.parse::<IpAddr>() {
        if forbidden_destination_ip(ip) {
            return Err(NetGateError::InvalidDestination);
        }
        return Ok(vec![ip]);
    }
    if host == "localhost" && resolved.is_empty() {
        return Ok(vec![
            IpAddr::V4(Ipv4Addr::LOCALHOST),
            IpAddr::V6(Ipv6Addr::LOCALHOST),
        ]);
    }
    if resolved.is_empty() || resolved.len() > MAX_RESOLVED_IPS {
        return Err(NetGateError::ResolutionFailed);
    }
    if resolved.iter().copied().any(forbidden_destination_ip) {
        return Err(NetGateError::InvalidDestination);
    }
    let mut ips = resolved.to_vec();
    ips.sort_by_key(|ip| ip.to_string());
    ips.dedup();
    Ok(ips)
}

pub(crate) fn cidrs_match_all(cidrs: &[String], ips: &[IpAddr]) -> Result<bool, NetGateError> {
    if cidrs.is_empty() {
        return Ok(false);
    }
    let parsed: Result<Vec<IpCidr>, NetGateError> =
        cidrs.iter().map(|value| IpCidr::parse(value)).collect();
    let parsed = parsed?;
    Ok(!ips.is_empty()
        && ips
            .iter()
            .all(|ip| parsed.iter().any(|cidr| cidr.contains(*ip))))
}

pub(crate) fn cidr_matches_ip(cidrs: &[String], ip: IpAddr) -> Result<bool, NetGateError> {
    for value in cidrs {
        if IpCidr::parse(value)?.contains(ip) {
            return Ok(true);
        }
    }
    Ok(false)
}

fn forbidden_destination_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => v4.is_unspecified() || v4.is_multicast() || v4 == Ipv4Addr::BROADCAST,
        IpAddr::V6(v6) => v6.is_unspecified() || v6.is_multicast(),
    }
}

pub(crate) fn destination_classes(ips: &[IpAddr]) -> Vec<DestinationClass> {
    let mut classes: Vec<_> = ips.iter().copied().map(classify_ip).collect();
    classes.sort_by_key(|class| *class as u8);
    classes.dedup();
    classes
}

pub(crate) fn hard_denied_host(host: &str) -> bool {
    const DENIED: &[&str] = &[
        "telemetry.microsoft.com",
        "google-analytics.com",
        "doubleclick.net",
        "sentry.io",
        "datadog.com",
        "datadoghq.com",
    ];
    DENIED.iter().any(|suffix| {
        host == *suffix
            || host
                .strip_suffix(suffix)
                .is_some_and(|prefix| prefix.ends_with('.'))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classes_are_explicit() {
        assert_eq!(
            classify_ip("127.0.0.1".parse().unwrap()),
            DestinationClass::Loopback
        );
        assert_eq!(
            classify_ip("192.168.1.2".parse().unwrap()),
            DestinationClass::PrivateLan
        );
        assert_eq!(
            classify_ip("169.254.1.2".parse().unwrap()),
            DestinationClass::LinkLocal
        );
        assert_eq!(
            classify_ip("fd12::2".parse().unwrap()),
            DestinationClass::PrivateLan
        );
        assert_eq!(
            classify_ip("fe80::2".parse().unwrap()),
            DestinationClass::LinkLocal
        );
        assert_eq!(
            classify_ip("8.8.8.8".parse().unwrap()),
            DestinationClass::PublicInternet
        );
    }

    #[test]
    fn host_parser_rejects_url_and_auth_tricks() {
        assert_eq!(canonicalize_host("Example.COM.").unwrap(), "example.com");
        assert!(canonicalize_host("https://example.com").is_err());
        assert!(canonicalize_host("user@example.com").is_err());
        assert!(canonicalize_host("-bad.example").is_err());
    }

    #[test]
    fn cidr_parser_uses_real_ip_math() {
        let v4 = IpCidr::parse("192.168.5.99/24").unwrap();
        assert_eq!(v4.canonical(), "192.168.5.0/24");
        assert!(v4.contains("192.168.5.4".parse().unwrap()));
        assert!(!v4.contains("192.168.50.4".parse().unwrap()));
        let v6 = IpCidr::parse("fd12:3456::1234/48").unwrap();
        assert!(v6.contains("fd12:3456:0:1::7".parse().unwrap()));
        assert!(!v6.contains("fd12:9999::7".parse().unwrap()));
    }

    #[test]
    fn unusable_socket_destinations_are_rejected() {
        assert!(normalized_destination_ips("0.0.0.0", &[]).is_err());
        assert!(normalized_destination_ips("224.0.0.1", &[]).is_err());
        assert!(normalized_destination_ips("example.com", &["::".parse().unwrap()]).is_err());
    }
}
