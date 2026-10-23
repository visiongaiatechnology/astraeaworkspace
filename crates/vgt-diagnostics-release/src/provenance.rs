use crate::DiagnosticsCoreError;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ReproducibilityState { Tracked, IndependentlyReproduced }

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct BuildProvenanceContract {
    pub version: String,
    pub commit: String,
    pub toolchain: String,
    pub target: String,
    pub sha256_manifest: String,
    pub sbom_sha256: String,
    pub source_date_epoch: u64,
    pub reproducibility: ReproducibilityState,
}

impl BuildProvenanceContract {
    pub fn validate(&self) -> Result<(), DiagnosticsCoreError> {
        for value in [&self.version, &self.commit, &self.toolchain, &self.target] {
            if value.is_empty() || value.len() > 256 || value.chars().any(char::is_control) { return Err(DiagnosticsCoreError::BoundaryRejected); }
        }
        for digest in [&self.sha256_manifest, &self.sbom_sha256] {
            if digest.len() != 64 || !digest.bytes().all(|b| b.is_ascii_hexdigit()) { return Err(DiagnosticsCoreError::BoundaryRejected); }
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct PublicReleaseGate {
    pub windows_compile_test_package: bool,
    pub linux_compile_test_package: bool,
    pub macos_compile_test_package: bool,
    pub windows_code_signed: bool,
    pub macos_code_signed: bool,
    pub macos_notarized: bool,
}

impl PublicReleaseGate {
    pub fn ready(&self) -> bool {
        self.windows_compile_test_package && self.linux_compile_test_package && self.macos_compile_test_package
            && self.windows_code_signed && self.macos_code_signed && self.macos_notarized
    }
}
