//! STATUS: DIAMANT VGT SUPREME
//! Certificate acceptance is fail-closed. Concrete TLS stacks must translate their verified peer
//! state into this evidence before NetGate accepts the connection.

use crate::NetGateError;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CertificateEvidence {
    pub chain_verified: bool,
    pub hostname_verified: bool,
    pub within_validity: bool,
    pub revoked: bool,
    pub self_signed: bool,
    pub self_signed_explicitly_trusted: bool,
}

pub fn validate_certificate_evidence(evidence: CertificateEvidence) -> Result<(), NetGateError> {
    if !evidence.chain_verified
        || !evidence.hostname_verified
        || !evidence.within_validity
        || evidence.revoked
        || (evidence.self_signed && !evidence.self_signed_explicitly_trusted)
    {
        return Err(NetGateError::TlsPolicyViolation);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid() -> CertificateEvidence {
        CertificateEvidence {
            chain_verified: true,
            hostname_verified: true,
            within_validity: true,
            revoked: false,
            self_signed: false,
            self_signed_explicitly_trusted: false,
        }
    }

    #[test]
    fn sec036_certificate_failures_are_rejected() {
        assert!(validate_certificate_evidence(valid()).is_ok());
        let mut candidate = valid();
        candidate.chain_verified = false;
        assert!(validate_certificate_evidence(candidate).is_err());
        let mut candidate = valid();
        candidate.hostname_verified = false;
        assert!(validate_certificate_evidence(candidate).is_err());
        let mut candidate = valid();
        candidate.within_validity = false;
        assert!(validate_certificate_evidence(candidate).is_err());
        let mut candidate = valid();
        candidate.revoked = true;
        assert!(validate_certificate_evidence(candidate).is_err());
        let mut candidate = valid();
        candidate.self_signed = true;
        assert!(validate_certificate_evidence(candidate).is_err());
        let mut candidate = valid();
        candidate.self_signed = true;
        candidate.self_signed_explicitly_trusted = true;
        assert!(validate_certificate_evidence(candidate).is_ok());
    }
}
