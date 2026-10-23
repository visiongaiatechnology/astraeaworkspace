//! STATUS: DIAMANT VGT SUPREME
//! Transport-security contract shared by concrete NetGate adapters.

use crate::NetGateError;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TlsProtocolVersion {
    Tls13,
    Tls12,
    Tls11,
    Tls10,
    Ssl3,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TlsCipherSuiteClass {
    AesGcm,
    ChaCha20Poly1305,
    AesCcm,
    Cbc,
    Rc4,
    TripleDes,
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TransportSecurityPolicy {
    pub prefer_tls13: bool,
    pub allow_tls12_aead_fallback: bool,
}

impl Default for TransportSecurityPolicy {
    fn default() -> Self {
        Self {
            prefer_tls13: true,
            allow_tls12_aead_fallback: true,
        }
    }
}

pub fn validate_negotiated_tls(
    version: TlsProtocolVersion,
    cipher: TlsCipherSuiteClass,
) -> Result<(), NetGateError> {
    match (version, cipher) {
        (
            TlsProtocolVersion::Tls13,
            TlsCipherSuiteClass::AesGcm
            | TlsCipherSuiteClass::ChaCha20Poly1305
            | TlsCipherSuiteClass::AesCcm,
        ) => Ok(()),
        (
            TlsProtocolVersion::Tls12,
            TlsCipherSuiteClass::AesGcm
            | TlsCipherSuiteClass::ChaCha20Poly1305
            | TlsCipherSuiteClass::AesCcm,
        ) => Ok(()),
        _ => Err(NetGateError::TlsPolicyViolation),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sec035_rejects_legacy_protocols_and_non_aead_fallbacks() {
        assert!(
            validate_negotiated_tls(TlsProtocolVersion::Tls13, TlsCipherSuiteClass::AesGcm).is_ok()
        );
        assert!(validate_negotiated_tls(
            TlsProtocolVersion::Tls12,
            TlsCipherSuiteClass::ChaCha20Poly1305
        )
        .is_ok());
        for version in [
            TlsProtocolVersion::Tls11,
            TlsProtocolVersion::Tls10,
            TlsProtocolVersion::Ssl3,
        ] {
            assert!(validate_negotiated_tls(version, TlsCipherSuiteClass::AesGcm).is_err());
        }
        for cipher in [
            TlsCipherSuiteClass::Cbc,
            TlsCipherSuiteClass::Rc4,
            TlsCipherSuiteClass::TripleDes,
            TlsCipherSuiteClass::Unknown,
        ] {
            assert!(validate_negotiated_tls(TlsProtocolVersion::Tls12, cipher).is_err());
        }
    }
}
