// STATUS: DIAMANT VGT SUPREME — VWC v3 compatibility and authenticated manifest policy.

use crate::{
    ChunkType, ContainerError, CURRENT_FORMAT_VERSION, MAX_CHUNK_COUNT, MAX_TOTAL_PLAINTEXT_SIZE,
    STREAM_PLAINTEXT_CHUNK_SIZE,
};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub const CURRENT_MANIFEST_SCHEMA_VERSION: u16 = 1;
pub const CHUNK_FLAG_CRITICAL: u8 = 0x01;
pub const CHUNK_FLAG_KNOWN_MASK: u8 = CHUNK_FLAG_CRITICAL;
pub const PAYLOAD_SCHEMA_NAMESPACE_WOM: &str = "vgt.wom";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct CompatibilityMatrixEntry {
    pub format_version: u16,
    pub minimum_reader_implementation: u16,
    pub minimum_writer_implementation: u16,
    pub current_reader_support: bool,
    pub current_writer_support: bool,
}

pub const COMPATIBILITY_MATRIX: [CompatibilityMatrixEntry; 3] = [
    CompatibilityMatrixEntry {
        format_version: 1,
        minimum_reader_implementation: 1,
        minimum_writer_implementation: 1,
        current_reader_support: true,
        current_writer_support: false,
    },
    CompatibilityMatrixEntry {
        format_version: 2,
        minimum_reader_implementation: 1,
        minimum_writer_implementation: 2,
        current_reader_support: true,
        current_writer_support: false,
    },
    CompatibilityMatrixEntry {
        format_version: 3,
        minimum_reader_implementation: 3,
        minimum_writer_implementation: 3,
        current_reader_support: true,
        current_writer_support: true,
    },
];

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ContainerCompatibility {
    pub container_format_version: u16,
    pub minimum_reader_implementation: u16,
    pub minimum_writer_implementation: u16,
    pub payload_schema_namespace: String,
    pub payload_schema_version: u32,
}

impl ContainerCompatibility {
    pub fn wom(payload_schema_version: u32) -> Self {
        Self {
            container_format_version: CURRENT_FORMAT_VERSION,
            minimum_reader_implementation: 3,
            minimum_writer_implementation: 3,
            payload_schema_namespace: PAYLOAD_SCHEMA_NAMESPACE_WOM.to_string(),
            payload_schema_version,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ManifestChunkEntry {
    pub index: u32,
    pub chunk_type: u8,
    #[serde(default)]
    pub flags: u8,
    pub plaintext_len: u64,
    #[serde(flatten)]
    pub extensions: BTreeMap<String, serde_json::Value>,
}

impl ManifestChunkEntry {
    pub fn known(index: u32, chunk_type: ChunkType, plaintext_len: u64) -> Self {
        Self {
            index,
            chunk_type: chunk_type.as_u8(),
            flags: if chunk_type == ChunkType::DocumentTree {
                CHUNK_FLAG_CRITICAL
            } else {
                0
            },
            plaintext_len,
            extensions: BTreeMap::new(),
        }
    }

    pub fn is_critical(&self) -> bool {
        self.flags & CHUNK_FLAG_CRITICAL != 0
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ContainerManifest {
    pub manifest_schema_version: u16,
    pub compatibility: ContainerCompatibility,
    pub chunks: Vec<ManifestChunkEntry>,
    #[serde(flatten)]
    pub extensions: BTreeMap<String, serde_json::Value>,
}

impl ContainerManifest {
    pub fn new(
        payload_schema_version: u32,
        chunks: Vec<ManifestChunkEntry>,
    ) -> Result<Self, ContainerError> {
        let manifest = Self {
            manifest_schema_version: CURRENT_MANIFEST_SCHEMA_VERSION,
            compatibility: ContainerCompatibility::wom(payload_schema_version),
            chunks,
            extensions: BTreeMap::new(),
        };
        manifest.validate()?;
        Ok(manifest)
    }

    pub fn validate(&self) -> Result<(), ContainerError> {
        if self.manifest_schema_version != CURRENT_MANIFEST_SCHEMA_VERSION {
            return Err(ContainerError::UnsupportedManifestVersion(
                self.manifest_schema_version,
            ));
        }
        if self.compatibility.container_format_version != CURRENT_FORMAT_VERSION
            || self.compatibility.minimum_reader_implementation > CURRENT_FORMAT_VERSION
            || self.compatibility.payload_schema_namespace.len() > 64
            || self.compatibility.payload_schema_namespace.is_empty()
        {
            return Err(ContainerError::IncompatibleManifest);
        }
        if self.chunks.is_empty() || self.chunks.len() > MAX_CHUNK_COUNT as usize {
            return Err(ContainerError::TooManyChunks(
                self.chunks.len().min(u32::MAX as usize) as u32,
                MAX_CHUNK_COUNT,
            ));
        }
        let mut total = 0u64;
        for (expected, chunk) in self.chunks.iter().enumerate() {
            if chunk.index != expected as u32 || chunk.flags & !CHUNK_FLAG_KNOWN_MASK != 0 {
                return Err(ContainerError::CorruptedManifest);
            }
            if chunk.plaintext_len > STREAM_PLAINTEXT_CHUNK_SIZE as u64 {
                return Err(ContainerError::ChunkPlaintextTooLarge(
                    chunk.plaintext_len.min(usize::MAX as u64) as usize,
                    STREAM_PLAINTEXT_CHUNK_SIZE,
                ));
            }
            let chunk_type = ChunkType::from_u8(chunk.chunk_type);
            if matches!(chunk_type, ChunkType::Unknown(_)) && chunk.is_critical() {
                return Err(ContainerError::UnknownCriticalChunk(chunk.chunk_type));
            }
            total = total
                .checked_add(chunk.plaintext_len)
                .ok_or(ContainerError::PlaintextTotalTooLarge(u64::MAX))?;
            if total > MAX_TOTAL_PLAINTEXT_SIZE as u64 {
                return Err(ContainerError::PlaintextTotalTooLarge(total));
            }
        }
        if !self
            .chunks
            .iter()
            .any(|chunk| chunk.chunk_type == ChunkType::DocumentTree.as_u8())
        {
            return Err(ContainerError::MissingDocumentTree);
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ContainerMigrationAction {
    None,
    RewriteContainerOnly,
    RejectUnsupportedFutureFormat,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct ContainerMigrationPlan {
    pub source_format_version: u16,
    pub target_format_version: u16,
    pub payload_schema_version: Option<u32>,
    pub action: ContainerMigrationAction,
}

pub fn migration_plan(
    format_version: u16,
    manifest: Option<&ContainerManifest>,
) -> ContainerMigrationPlan {
    let payload_schema_version = manifest.map(|value| value.compatibility.payload_schema_version);
    let action = if format_version == CURRENT_FORMAT_VERSION {
        ContainerMigrationAction::None
    } else if (1..CURRENT_FORMAT_VERSION).contains(&format_version) {
        ContainerMigrationAction::RewriteContainerOnly
    } else {
        ContainerMigrationAction::RejectUnsupportedFutureFormat
    };
    ContainerMigrationPlan {
        source_format_version: format_version,
        target_format_version: CURRENT_FORMAT_VERSION,
        payload_schema_version,
        action,
    }
}
