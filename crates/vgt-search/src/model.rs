use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use vgt_object_model::{DocumentKind, SecurityProfile, WorkspaceDocument};

pub const SEARCH_INDEX_SCHEMA_VERSION: u16 = 3;
pub const MAX_QUERY_BYTES: usize = 4096;
pub const MAX_TOKEN_CHARS: usize = 256;
pub const MAX_ENCRYPTED_INDEX_BLOB_BYTES: usize = 8 * 1024 * 1024 * 1024;
pub const MAX_RESULTS: usize = 500;
pub const MAX_ACL_REFS: usize = 128;
pub const MAX_TAGS: usize = 128;
pub const MAX_METADATA_FACETS: usize = 256;
pub const MAX_DERIVED_FIELDS: usize = 256;
pub const MAX_DERIVED_TEXT_BYTES: usize = 8 * 1024 * 1024;
pub const MAX_INDEXED_FIELD_BYTES: usize = 8 * 1024 * 1024;
pub const MAX_LANGUAGE_TAG_BYTES: usize = 35;
pub const MAX_REBUILD_BATCH: usize = 512;
pub const MAX_VECTOR_DIMENSIONS: usize = 4096;
pub const MAX_VECTOR_DOCUMENTS: usize = 100_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SearchField {
    Title,
    FullText,
    TableCell,
    ShapeText,
    ChartTitle,
    Metadata,
    Tag,
    ObjectType,
    Ocr,
    Transcript,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DerivedFieldKind {
    Ocr,
    Transcript,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DerivedSearchField {
    pub kind: DerivedFieldKind,
    pub source_id: String,
    pub text: String,
    pub provenance: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DocumentIndexOptions {
    #[serde(default = "default_acl")]
    pub acl_partition_refs: Vec<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub metadata: HashMap<String, String>,
    #[serde(default)]
    pub derived_fields: Vec<DerivedSearchField>,
    #[serde(default)]
    pub privacy_excluded: bool,
    #[serde(default = "default_language")]
    pub language: String,
}

fn default_acl() -> Vec<String> { vec!["local:owner".to_string()] }
fn default_language() -> String { "und".to_string() }

impl Default for DocumentIndexOptions {
    fn default() -> Self {
        Self {
            acl_partition_refs: default_acl(),
            tags: Vec::new(),
            metadata: HashMap::new(),
            derived_fields: Vec::new(),
            privacy_excluded: false, language: default_language(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct SearchPermissionContext {
    #[serde(default = "default_acl")]
    pub allowed_partitions: Vec<String>,
    #[serde(default)]
    pub unlocked_document_ids: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct SearchFilters {
    #[serde(default)]
    pub document_kinds: Vec<DocumentKind>,
    #[serde(default)]
    pub fields: Vec<SearchField>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub object_types: Vec<String>,
    pub modified_after: Option<i64>,
    pub modified_before: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ParsedSearchQuery {
    pub terms: Vec<String>,
    pub phrases: Vec<String>,
    pub filters: SearchFilters,
    pub proximity: Option<u16>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SearchHit {
    pub document_id: String,
    pub document_title: String,
    pub document_kind: DocumentKind,
    pub object_id: String,
    pub object_type: String,
    pub field: SearchField,
    pub snippet: String,
    pub relevance_score: f64,
    pub metadata_protected: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct Occurrence {
    pub document_id: String,
    pub object_id: String,
    pub object_type: String,
    pub field: SearchField,
    pub position: u32,
    pub language: String,
    pub snippet: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub(crate) struct TokenPosting {
    pub occurrences: Vec<Occurrence>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct StoredField {
    pub object_id: String,
    pub object_type: String,
    pub field: SearchField,
    pub text: String,
    pub language: String,
    pub provenance: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub(crate) struct DocumentRecord {
    pub title: String,
    pub kind: DocumentKind,
    pub version: u64,
    pub modified_at: i64,
    pub security_profile: SecurityProfile,
    pub acl_partition_refs: Vec<String>,
    pub tags: Vec<String>,
    pub metadata: HashMap<String, String>,
    pub fields: Vec<StoredField>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct SearchFacetCounts {
    pub document_kinds: HashMap<String, u64>,
    pub fields: HashMap<String, u64>,
    pub tags: HashMap<String, u64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SearchIndexEventKind { Upsert, Delete, PermissionRevoked }

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SearchIndexEvent {
    pub kind: SearchIndexEventKind,
    pub document_id: String,
    pub authoritative_version: u64,
    pub document: Option<WorkspaceDocument>,
    #[serde(default)]
    pub options: DocumentIndexOptions,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SearchMutationCheckpoint {
    pub schema_version: u16,
    pub generation: u64,
    pub document_id: String,
    pub authoritative_version: u64,
    pub corpus_digest_blake3: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct SearchRebuildProgress {
    pub processed: usize,
    pub total: usize,
    pub indexed_documents: usize,
    pub skipped_documents: usize,
    pub generation: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LocalVectorRecord {
    pub document_id: String,
    pub object_id: String,
    pub values: Vec<f32>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct LocalVectorIndex {
    pub enabled: bool,
    pub dimensions: usize,
    pub records: Vec<LocalVectorRecord>,
}


#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SearchSavedQuery {
    pub id: String,
    pub name: String,
    pub query: String,
    pub group: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SearchRecentQuery {
    pub query: String,
    pub executed_at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SearchPreferences {
    pub enabled_modules: Vec<DocumentKind>,
    pub excluded_document_ids: Vec<String>,
    pub excluded_spaces: Vec<String>,
    pub max_encrypted_index_bytes: u64,
    pub max_history_entries: usize,
    pub history_enabled: bool,
    pub semantic_ranking_enabled: bool,
    pub local_ocr_enabled: bool,
    pub transcription_enabled: bool,
    pub transcription_provider: String,
    pub transcription_connector_id: Option<String>,
    pub external_connector_indexing_enabled: bool,
    pub allowed_connector_ids: Vec<String>,
    pub saved_searches: Vec<SearchSavedQuery>,
    pub recent_queries: Vec<SearchRecentQuery>,
}

impl Default for SearchPreferences {
    fn default() -> Self {
        Self {
            enabled_modules: vec![DocumentKind::Writer, DocumentKind::Grid, DocumentKind::Present, DocumentKind::Notes, DocumentKind::PdfStudio, DocumentKind::Draw, DocumentKind::Whiteboard, DocumentKind::Forms, DocumentKind::Database, DocumentKind::Tasks, DocumentKind::Planner, DocumentKind::Projects, DocumentKind::Vault, DocumentKind::Spaces, DocumentKind::Connect, DocumentKind::Insight, DocumentKind::Publish, DocumentKind::Automate, DocumentKind::AdminPolicy],
            excluded_document_ids: Vec::new(), excluded_spaces: Vec::new(), max_encrypted_index_bytes: 512 * 1024 * 1024, max_history_entries: 128, history_enabled: false, semantic_ranking_enabled: false, local_ocr_enabled: false, transcription_enabled: false, transcription_provider: "local".to_string(), transcription_connector_id: None, external_connector_indexing_enabled: false, allowed_connector_ids: Vec::new(), saved_searches: Vec::new(), recent_queries: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SearchIndexCheckpoint {
    pub schema_version: u16,
    pub generation: u64,
    pub document_versions: HashMap<String, u64>,
    pub corpus_digest_blake3: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RebuildReport {
    pub rebuilt: bool,
    pub indexed_documents: usize,
    pub skipped_documents: usize,
    pub generation: u64,
}
