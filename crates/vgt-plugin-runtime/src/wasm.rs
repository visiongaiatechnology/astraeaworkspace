use crate::{
    PluginManifest, PluginResourceLimits, MAX_PLUGIN_LINEAR_MEMORY_BYTES, MAX_PLUGIN_WASM_BYTES,
    PLUGIN_INITIAL_LINEAR_MEMORY_BYTES,
};
use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum WasmError {
    #[error("PLUGIN_WASM_SIZE_REJECTED")]
    Size,
    #[error("PLUGIN_WASM_FORMAT_REJECTED")]
    Format,
    #[error("PLUGIN_WASM_IMPORTS_DENIED")]
    Imports,
    #[error("PLUGIN_WASM_MEMORY_MAX_REQUIRED")]
    MemoryMaximum,
    #[error("PLUGIN_WASM_MEMORY_LIMIT_REJECTED")]
    MemoryLimit,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PluginExecutionPermit {
    pub plugin_id: String,
    pub version: String,
    pub package_sha256: String,
    pub negotiated_api_version: String,
    pub entrypoint_export: String,
    pub resource_limits: PluginResourceLimits,
    pub host_capabilities: Vec<crate::PluginCapability>,
    pub standard_tier_importless_wasm: bool,
}

pub fn validate_standard_tier_wasm(
    bytes: &[u8],
    manifest: &PluginManifest,
) -> Result<(), WasmError> {
    if bytes.len() < 8 || bytes.len() > MAX_PLUGIN_WASM_BYTES {
        return Err(WasmError::Size);
    }
    if &bytes[..8] != b"\0asm\x01\0\0\0" {
        return Err(WasmError::Format);
    }
    let max_pages = manifest
        .resource_limits
        .max_linear_memory_bytes
        .min(MAX_PLUGIN_LINEAR_MEMORY_BYTES)
        / 65_536;
    let max_initial_pages = PLUGIN_INITIAL_LINEAR_MEMORY_BYTES / 65_536;
    let mut offset = 8usize;
    while offset < bytes.len() {
        let section_id = bytes[offset];
        offset += 1;
        let (section_size, next) = read_u32(bytes, offset)?;
        offset = next;
        let end = offset
            .checked_add(section_size as usize)
            .ok_or(WasmError::Format)?;
        if end > bytes.len() {
            return Err(WasmError::Format);
        }
        if section_id == 2 {
            let (imports, _) = read_u32(bytes, offset)?;
            if imports != 0 {
                return Err(WasmError::Imports);
            }
        }
        if section_id == 5 {
            let (count, mut cursor) = read_u32(bytes, offset)?;
            if count > 1 {
                return Err(WasmError::MemoryLimit);
            }
            if count == 1 {
                let (flags, next) = read_u32(bytes, cursor)?;
                cursor = next;
                if flags != 1 {
                    return Err(WasmError::MemoryMaximum);
                }
                let (minimum, next) = read_u32(bytes, cursor)?;
                cursor = next;
                let (maximum, _) = read_u32(bytes, cursor)?;
                if u64::from(minimum) > max_initial_pages
                    || minimum > maximum
                    || u64::from(maximum) > max_pages
                {
                    return Err(WasmError::MemoryLimit);
                }
            }
        }
        offset = end;
    }
    Ok(())
}

fn read_u32(bytes: &[u8], start: usize) -> Result<(u32, usize), WasmError> {
    let mut value = 0u32;
    let mut shift = 0u32;
    let mut cursor = start;
    for _ in 0..5 {
        let byte = *bytes.get(cursor).ok_or(WasmError::Format)?;
        cursor += 1;
        value |= u32::from(byte & 0x7f) << shift;
        if byte & 0x80 == 0 {
            return Ok((value, cursor));
        }
        shift += 7;
    }
    Err(WasmError::Format)
}
