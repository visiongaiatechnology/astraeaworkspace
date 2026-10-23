use serde::{Deserialize, Serialize};
use thiserror::Error;

const MAX_FEATURES: usize = 64;
const MAX_PROVIDERS: usize = 32;
const MAX_TESTS: usize = 64;
const MAX_ERRORS: usize = 32;
const MAX_ID: usize = 96;
const MAX_SUMMARY: usize = 256;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum HealthState { Pass, Warn, Fail, Unavailable }

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct FeatureState {
    pub id: String,
    pub state: HealthState,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct ProviderState {
    pub id: String,
    pub available: bool,
    pub hardware_backed_verified: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct SelfTestResult {
    pub id: String,
    pub state: HealthState,
    pub error_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct DiagnosticErrorSummary {
    pub error_id: String,
    pub component: String,
    pub summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct RuntimeHealthSnapshot {
    pub schema: String,
    pub features: Vec<FeatureState>,
    pub providers: Vec<ProviderState>,
    pub self_tests: Vec<SelfTestResult>,
    pub recent_errors: Vec<DiagnosticErrorSummary>,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum DiagnosticsCoreError {
    #[error("DIAGNOSTICS_BOUNDARY_REJECTED")]
    BoundaryRejected,
}

impl RuntimeHealthSnapshot {
    pub fn new(
        features: Vec<FeatureState>,
        providers: Vec<ProviderState>,
        self_tests: Vec<SelfTestResult>,
        recent_errors: Vec<DiagnosticErrorSummary>,
    ) -> Result<Self, DiagnosticsCoreError> {
        if features.len() > MAX_FEATURES || providers.len() > MAX_PROVIDERS || self_tests.len() > MAX_TESTS || recent_errors.len() > MAX_ERRORS {
            return Err(DiagnosticsCoreError::BoundaryRejected);
        }
        for feature in &features { validate_id(&feature.id)?; }
        for provider in &providers { validate_id(&provider.id)?; }
        for test in &self_tests {
            validate_id(&test.id)?;
            if let Some(error_id) = &test.error_id { validate_id(error_id)?; }
        }
        for error in &recent_errors {
            validate_id(&error.error_id)?;
            validate_id(&error.component)?;
            if error.summary.is_empty() || error.summary.len() > MAX_SUMMARY || error.summary.chars().any(char::is_control) {
                return Err(DiagnosticsCoreError::BoundaryRejected);
            }
        }
        Ok(Self { schema: "vgt.diagnostics.runtime-health/1".to_string(), features, providers, self_tests, recent_errors })
    }
}

pub fn validate_id(value: &str) -> Result<(), DiagnosticsCoreError> {
    if value.is_empty() || value.len() > MAX_ID || !value.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b':' | b'-')) {
        return Err(DiagnosticsCoreError::BoundaryRejected);
    }
    Ok(())
}
