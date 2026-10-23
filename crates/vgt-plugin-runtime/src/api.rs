use crate::{PluginCapability, PluginManifest, MAX_PLUGIN_IO_BYTES};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;

#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum HostApiError {
    #[error("PLUGIN_CAPABILITY_DENIED")]
    CapabilityDenied,
    #[error("PLUGIN_HOST_REQUEST_REJECTED")]
    RequestRejected,
    #[error("PLUGIN_OPERATION_VALIDATION_REJECTED")]
    OperationRejected,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum PluginHostRequest {
    DocumentRead {
        document_id: String,
        object_ids: Vec<String>,
    },
    ProposeOperations {
        document_id: String,
        transaction_id: String,
        operations: Vec<Value>,
    },
    RegisterCommand {
        command_id: String,
        title: String,
    },
    RegisterPanel {
        panel_id: String,
        title: String,
    },
    ImportExportTransform {
        media_type: String,
        direction: TransformDirection,
        payload_bytes: u64,
    },
    AutomationAction {
        action_id: String,
        payload_bytes: u64,
    },
    DataConnector {
        connector_id: String,
        payload_bytes: u64,
    },
    NetworkRequest {
        request_id: String,
        payload_bytes: u64,
    },
    ScopedStorageWrite {
        namespace: String,
        payload_bytes: u64,
        resulting_total_bytes: u64,
    },
    ClipboardRead,
    ClipboardWrite {
        payload_bytes: u64,
    },
    UseSecretHandle {
        scope: String,
        handle_id: String,
    },
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum TransformDirection {
    Import,
    Export,
}

impl PluginHostRequest {
    pub fn required_capability(&self) -> PluginCapability {
        match self {
            Self::DocumentRead { .. } => PluginCapability::DocumentRead,
            Self::ProposeOperations { .. } => PluginCapability::DocumentProposeOperations,
            Self::RegisterCommand { .. } => PluginCapability::CommandsRegister,
            Self::RegisterPanel { .. } => PluginCapability::PanelsRegister,
            Self::ImportExportTransform { .. } => PluginCapability::ImportExportTransform,
            Self::AutomationAction { .. } => PluginCapability::AutomationAction,
            Self::DataConnector { .. } => PluginCapability::DataConnector,
            Self::NetworkRequest { .. } => PluginCapability::NetworkRequest,
            Self::ScopedStorageWrite { .. } => PluginCapability::StorageScoped,
            Self::ClipboardRead => PluginCapability::ClipboardRead,
            Self::ClipboardWrite { .. } => PluginCapability::ClipboardWrite,
            Self::UseSecretHandle { .. } => PluginCapability::SecretsUseHandle,
        }
    }
    pub fn validate(&self) -> Result<(), HostApiError> {
        match self {
            Self::DocumentRead {
                document_id,
                object_ids,
            } => {
                valid_id(document_id, 128)?;
                if object_ids.len() > 1024 {
                    return Err(HostApiError::RequestRejected);
                }
                for id in object_ids {
                    valid_id(id, 128)?;
                }
            }
            Self::ProposeOperations {
                document_id,
                transaction_id,
                operations,
            } => {
                valid_id(document_id, 128)?;
                valid_id(transaction_id, 128)?;
                if operations.is_empty() || operations.len() > 1024 {
                    return Err(HostApiError::RequestRejected);
                }
                let bytes =
                    serde_json::to_vec(operations).map_err(|_| HostApiError::RequestRejected)?;
                if bytes.len() as u64 > MAX_PLUGIN_IO_BYTES {
                    return Err(HostApiError::RequestRejected);
                }
            }
            Self::RegisterCommand { command_id, title } => {
                valid_id(command_id, 128)?;
                valid_text(title, 128)?;
            }
            Self::RegisterPanel { panel_id, title } => {
                valid_id(panel_id, 128)?;
                valid_text(title, 128)?;
            }
            Self::ImportExportTransform {
                media_type,
                payload_bytes,
                ..
            } => {
                valid_text(media_type, 128)?;
                valid_payload(*payload_bytes)?;
            }
            Self::AutomationAction {
                action_id,
                payload_bytes,
            } => {
                valid_id(action_id, 128)?;
                valid_payload(*payload_bytes)?;
            }
            Self::DataConnector {
                connector_id,
                payload_bytes,
            } => {
                valid_id(connector_id, 128)?;
                valid_payload(*payload_bytes)?;
            }
            Self::NetworkRequest {
                request_id,
                payload_bytes,
            } => {
                valid_id(request_id, 128)?;
                valid_payload(*payload_bytes)?;
            }
            Self::ScopedStorageWrite {
                namespace,
                payload_bytes,
                ..
            } => {
                valid_id(namespace, 128)?;
                valid_payload(*payload_bytes)?;
            }
            Self::ClipboardRead => {}
            Self::ClipboardWrite { payload_bytes } => valid_payload(*payload_bytes)?,
            Self::UseSecretHandle { scope, handle_id } => {
                valid_id(scope, 192)?;
                if handle_id.len() != 64
                    || !handle_id
                        .bytes()
                        .all(|b| b.is_ascii_digit() || matches!(b, b'a'..=b'f'))
                {
                    return Err(HostApiError::RequestRejected);
                }
            }
        }
        Ok(())
    }
}

pub fn authorize_host_request(
    manifest: &PluginManifest,
    request: &PluginHostRequest,
) -> Result<(), HostApiError> {
    request.validate()?;
    let required = request.required_capability();
    if !manifest.requested_capabilities.contains(&required) {
        return Err(HostApiError::CapabilityDenied);
    }
    match request {
        PluginHostRequest::ScopedStorageWrite {
            resulting_total_bytes,
            ..
        } if *resulting_total_bytes > manifest.resource_limits.max_storage_bytes => {
            Err(HostApiError::RequestRejected)
        }
        PluginHostRequest::ImportExportTransform { payload_bytes, .. }
        | PluginHostRequest::AutomationAction { payload_bytes, .. }
        | PluginHostRequest::DataConnector { payload_bytes, .. }
        | PluginHostRequest::NetworkRequest { payload_bytes, .. }
        | PluginHostRequest::ScopedStorageWrite { payload_bytes, .. }
        | PluginHostRequest::ClipboardWrite { payload_bytes }
            if *payload_bytes > manifest.resource_limits.max_input_bytes =>
        {
            Err(HostApiError::RequestRejected)
        }
        _ => Ok(()),
    }
}

/// Plugin output is only a proposal. The authoritative Operations/WOM engine supplied by the host
/// must accept the exact batch before any document transaction can commit.
pub fn validate_operation_proposal<F>(
    manifest: &PluginManifest,
    request: &PluginHostRequest,
    authoritative_validator: F,
) -> Result<(), HostApiError>
where
    F: FnOnce(&str, &[Value]) -> bool,
{
    authorize_host_request(manifest, request)?;
    let PluginHostRequest::ProposeOperations {
        document_id,
        operations,
        ..
    } = request
    else {
        return Err(HostApiError::RequestRejected);
    };
    if authoritative_validator(document_id, operations) {
        Ok(())
    } else {
        Err(HostApiError::OperationRejected)
    }
}

fn valid_payload(value: u64) -> Result<(), HostApiError> {
    if value <= MAX_PLUGIN_IO_BYTES {
        Ok(())
    } else {
        Err(HostApiError::RequestRejected)
    }
}
fn valid_id(value: &str, max: usize) -> Result<(), HostApiError> {
    if !value.is_empty()
        && value.len() <= max
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b':' | b'-' | b'/'))
    {
        Ok(())
    } else {
        Err(HostApiError::RequestRejected)
    }
}
fn valid_text(value: &str, max: usize) -> Result<(), HostApiError> {
    if !value.trim().is_empty() && value.len() <= max && !value.chars().any(char::is_control) {
        Ok(())
    } else {
        Err(HostApiError::RequestRejected)
    }
}
