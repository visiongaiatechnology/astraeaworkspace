//! STATUS: DIAMANT VGT SUPREME
//! Authoritative diagnostics/recovery/release policy core. This crate deliberately contains no
//! network transport, installer execution, document payload logging, or platform UI code.

mod diagnostics;
mod logging;
mod provenance;
mod safe_mode;
mod update_transfer;

pub use diagnostics::*;
pub use logging::*;
pub use provenance::*;
pub use safe_mode::*;
pub use update_transfer::*;
