//! STATUS: DIAMANT VGT SUPREME
//! # VGT NetGate
//!
//! Capability-based network policy boundary for Astraea Workspace.
//!
//! NetGate is NOT an OS-wide firewall. It enforces policy only for callers routed through its
//! capability API and SovereignConnector transport boundary.

mod capability;
pub mod cert;
mod destination;
pub mod enforcement;
pub mod http;
mod model;
mod policy;
pub mod proxy;
pub mod ssrf;
pub mod tls;

pub use destination::{canonicalize_host, classify_ip, IpCidr};
pub use enforcement::{
    resolve_destination, resolve_destination_cancellable, SovereignConnector, SovereignStream,
};
pub use http::{
    authorize_http_redirect, authorize_http_request, prepare_http_request, HttpRequestSpec,
    PreparedHttpRequest, RedirectPolicy, TlsVerificationPolicy,
};
pub use model::*;
pub use policy::NetGate;

pub use cert::{validate_certificate_evidence, CertificateEvidence};
pub use proxy::EgressProxyPolicy;
pub use ssrf::validate_passive_document_resource;
pub use tls::{
    validate_negotiated_tls, TlsCipherSuiteClass, TlsProtocolVersion, TransportSecurityPolicy,
};
