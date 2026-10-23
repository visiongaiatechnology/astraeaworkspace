//! Canonical permission-aware encrypted Workspace Search Core.
//! The authoritative documents remain WOM; this index is rebuildable derived state.

mod extract;
mod model;
mod query;
mod vector;

pub use model::*;
pub use query::{parse_query, tokenize};
use query::{field_weight, proximity_matches};

use blake3::Hasher;
use serde::{Deserialize, Serialize};
use std::cmp::Ordering;
use std::collections::{HashMap, HashSet};
use thiserror::Error;
use vgt_object_model::{SecurityProfile, WorkspaceDocument};

use crate::extract::extract_document_fields;
use crate::model::{DocumentRecord, Occurrence, StoredField, TokenPosting};

const INDEX_AAD: &[u8] = b"VGT-SEARCH-INDEX-V3";
const MAX_INDEX_DOCUMENTS: usize = 100_000;
const MAX_POSTINGS_PER_TOKEN: usize = 500_000;

#[derive(Error, Debug, PartialEq)]
pub enum SearchError {
    #[error("Search query is empty")]
    EmptyQuery,
    #[error("Search query exceeds configured limits")]
    QueryTooLarge,
    #[error("Invalid search query: {0}")]
    InvalidQuery(&'static str),
    #[error("Index is locked: KeyVault search key required")]
    IndexLocked,
    #[error("Stale document version")]
    StaleVersion,
    #[error("Search index resource boundary exceeded")]
    ResourceLimit,
    #[error("Search index integrity validation failed")]
    CorruptIndex,
    #[error("Crypto error: {0}")]
    Crypto(String),
    #[error("Search operation cancelled")]
    Cancelled,
    #[error("Local vector index is disabled")]
    VectorDisabled,
    #[error("Invalid local vector")]
    InvalidVector,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct EncryptedIndexEnvelope {
    version: u16,
    nonce: [u8; 12],
    ciphertext: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchIndex {
    schema_version: u16,
    generation: u64,
    index: HashMap<String, TokenPosting>,
    documents: HashMap<String, DocumentRecord>,
    #[serde(default)]
    tombstones: HashMap<String, u64>,
    #[serde(default)]
    vector_index: LocalVectorIndex,
    #[serde(default)]
    preferences: SearchPreferences,
    #[serde(default)]
    is_locked: bool,
}

impl Default for SearchIndex {
    fn default() -> Self {
        Self { schema_version: SEARCH_INDEX_SCHEMA_VERSION, generation: 0, index: HashMap::new(), documents: HashMap::new(), tombstones: HashMap::new(), vector_index: LocalVectorIndex::default(), preferences: SearchPreferences::default(), is_locked: false }
    }
}

impl SearchIndex {
    pub fn new() -> Self { Self::default() }
    pub fn is_locked(&self) -> bool { self.is_locked }
    pub fn generation(&self) -> u64 { self.generation }
    pub fn document_count(&self) -> usize { self.documents.len() }
    pub fn preferences(&self) -> &SearchPreferences { &self.preferences }
    pub fn vector_index(&self) -> &LocalVectorIndex { &self.vector_index }

    pub fn configure_local_vector_index(&mut self, enabled: bool, dimensions: usize) -> Result<(), SearchError> {
        if self.is_locked { return Err(SearchError::IndexLocked); }
        if enabled && !self.preferences.semantic_ranking_enabled { return Err(SearchError::VectorDisabled); }
        self.vector_index.configure(enabled, dimensions)
    }

    pub fn upsert_local_vector(&mut self, document_id: &str, object_id: &str, values: Vec<f32>) -> Result<(), SearchError> {
        if self.is_locked { return Err(SearchError::IndexLocked); }
        if !self.preferences.semantic_ranking_enabled || !self.documents.contains_key(document_id) { return Err(SearchError::VectorDisabled); }
        self.vector_index.upsert(document_id, object_id, values)
    }

    pub fn vector_search_with_context(&self, vector: &[f32], permission: &SearchPermissionContext, limit: usize) -> Result<Vec<(String, String, f32)>, SearchError> {
        if self.is_locked { return Err(SearchError::IndexLocked); }
        if !self.preferences.semantic_ranking_enabled { return Err(SearchError::VectorDisabled); }
        validate_permission_context(permission)?;
        let allowed: HashSet<&str> = permission.allowed_partitions.iter().map(String::as_str).collect();
        let unlocked: HashSet<&str> = permission.unlocked_document_ids.iter().map(String::as_str).collect();
        let visible: HashSet<&str> = self.documents.iter().filter_map(|(id, record)| if permitted(record, &allowed) && unlocked.contains(id.as_str()) { Some(id.as_str()) } else { None }).collect();
        self.vector_index.query(vector, &visible, limit)
    }

    pub fn set_preferences(&mut self, preferences: SearchPreferences) -> Result<(), SearchError> {
        if self.is_locked { return Err(SearchError::IndexLocked); }
        validate_preferences(&preferences)?;
        if !preferences.semantic_ranking_enabled { self.vector_index.configure(false, 0)?; }
        self.preferences = preferences;
        self.generation = self.generation.saturating_add(1);
        Ok(())
    }

    pub fn record_recent_query(&mut self, query: &str, executed_at: i64) -> Result<(), SearchError> {
        if self.is_locked { return Err(SearchError::IndexLocked); }
        if !self.preferences.history_enabled { return Ok(()); }
        let value: String = query.trim().chars().take(MAX_QUERY_BYTES).collect();
        if value.is_empty() { return Err(SearchError::EmptyQuery); }
        self.preferences.recent_queries.retain(|entry| entry.query != value);
        self.preferences.recent_queries.insert(0, SearchRecentQuery { query: value, executed_at });
        self.preferences.recent_queries.truncate(self.preferences.max_history_entries.min(256));
        self.generation = self.generation.saturating_add(1);
        Ok(())
    }

    pub fn clear_recent_queries(&mut self) -> Result<(), SearchError> {
        if self.is_locked { return Err(SearchError::IndexLocked); }
        self.preferences.recent_queries.clear();
        self.generation = self.generation.saturating_add(1);
        Ok(())
    }

    pub fn upsert_saved_query(&mut self, saved: SearchSavedQuery) -> Result<(), SearchError> {
        if self.is_locked { return Err(SearchError::IndexLocked); }
        if saved.id.is_empty() || saved.id.len() > 128 || saved.name.is_empty() || saved.name.len() > 256 || saved.query.is_empty() || saved.query.len() > MAX_QUERY_BYTES || saved.group.len() > 64 { return Err(SearchError::ResourceLimit); }
        self.preferences.saved_searches.retain(|entry| entry.id != saved.id);
        self.preferences.saved_searches.push(saved);
        if self.preferences.saved_searches.len() > 128 { self.preferences.saved_searches.remove(0); }
        self.generation = self.generation.saturating_add(1);
        Ok(())
    }

    pub fn lock(&mut self) {
        self.is_locked = true;
        self.index.clear();
        self.documents.clear();
        self.tombstones.clear();
        let _ = self.vector_index.configure(false, 0);
    }

    pub fn clear(&mut self) {
        self.index.clear();
        self.documents.clear();
        self.tombstones.clear();
        self.vector_index.records.clear();
        self.generation = self.generation.saturating_add(1);
    }

    pub fn index_document(&mut self, doc: &WorkspaceDocument) -> Result<(), SearchError> {
        self.index_document_with_options(doc, &DocumentIndexOptions::default())
    }

    pub fn index_document_with_options(&mut self, doc: &WorkspaceDocument, options: &DocumentIndexOptions) -> Result<(), SearchError> {
        if self.is_locked { return Err(SearchError::IndexLocked); }
        if self.documents.len() >= MAX_INDEX_DOCUMENTS && !self.documents.contains_key(&doc.id) { return Err(SearchError::ResourceLimit); }
        if doc.id.is_empty() || doc.id.len() > 256 { return Err(SearchError::ResourceLimit); }
        validate_language(&options.language)?;
        if let Some(existing) = self.documents.get(&doc.id) { if doc.version < existing.version { return Err(SearchError::StaleVersion); } }
        if self.tombstones.get(&doc.id).copied().map(|version| doc.version <= version).unwrap_or(false) { return Err(SearchError::StaleVersion); }
        self.remove_document_internal(&doc.id);
        self.vector_index.remove_document(&doc.id);
        if options.privacy_excluded || doc.security_policy.profile == SecurityProfile::VgtTopSecret {
            self.generation = self.generation.saturating_add(1);
            return Ok(());
        }

        let acl_partition_refs = normalize_list(&options.acl_partition_refs, MAX_ACL_REFS, 256);
        if acl_partition_refs.is_empty() { return Err(SearchError::InvalidQuery("document ACL partition set is empty")); }
        let fields = extract_document_fields(doc, options);
        let mut tag_candidates = options.tags.clone();
        tag_candidates.extend(fields.iter().filter(|field| field.field == SearchField::Tag).map(|field| field.text.clone()));
        let tags = normalize_list(&tag_candidates, MAX_TAGS, 256);
        let record = DocumentRecord {
            title: doc.title.chars().take(4096).collect(), kind: doc.kind, version: doc.version, modified_at: doc.modified_at,
            security_profile: doc.security_policy.profile, acl_partition_refs, tags, metadata: normalize_metadata(&options.metadata), fields: fields.clone(),
        };
        for field in &fields { self.index_field(&doc.id, field)?; }
        self.documents.insert(doc.id.clone(), record);
        self.tombstones.remove(&doc.id);
        self.generation = self.generation.saturating_add(1);
        Ok(())
    }

    fn index_field(&mut self, document_id: &str, field: &StoredField) -> Result<(), SearchError> {
        for (position, token) in tokenize(&field.text).into_iter().enumerate() {
            let posting = self.index.entry(token).or_default();
            if posting.occurrences.len() >= MAX_POSTINGS_PER_TOKEN { return Err(SearchError::ResourceLimit); }
            posting.occurrences.push(Occurrence {
                document_id: document_id.to_string(), object_id: field.object_id.clone(), object_type: field.object_type.clone(), field: field.field,
                position: u32::try_from(position).unwrap_or(u32::MAX), language: field.language.clone(), snippet: snippet(&field.text, 240),
            });
        }
        Ok(())
    }

    pub fn remove_document(&mut self, document_id: &str) -> Result<(), SearchError> {
        let version = self.documents.get(document_id).map(|record| record.version).unwrap_or_else(|| self.tombstones.get(document_id).copied().unwrap_or(0));
        self.remove_document_at_version(document_id, version)
    }

    pub fn remove_document_at_version(&mut self, document_id: &str, authoritative_version: u64) -> Result<(), SearchError> {
        if self.is_locked { return Err(SearchError::IndexLocked); }
        if document_id.is_empty() || document_id.len() > 256 { return Err(SearchError::ResourceLimit); }
        if self.documents.get(document_id).map(|record| authoritative_version < record.version).unwrap_or(false) { return Err(SearchError::StaleVersion); }
        if self.tombstones.get(document_id).copied().map(|version| authoritative_version < version).unwrap_or(false) { return Err(SearchError::StaleVersion); }
        self.remove_document_internal(document_id);
        self.vector_index.remove_document(document_id);
        self.tombstones.insert(document_id.to_string(), authoritative_version);
        self.generation = self.generation.saturating_add(1);
        Ok(())
    }

    pub fn revoke_document_permissions(&mut self, document_id: &str) -> Result<(), SearchError> { self.remove_document(document_id) }

    pub fn apply_event(&mut self, event: SearchIndexEvent) -> Result<SearchMutationCheckpoint, SearchError> {
        if event.document_id.is_empty() || event.document_id.len() > 256 { return Err(SearchError::ResourceLimit); }
        match event.kind {
            SearchIndexEventKind::Upsert => {
                let document = event.document.ok_or(SearchError::InvalidQuery("upsert event missing document"))?;
                if document.id != event.document_id || document.version != event.authoritative_version { return Err(SearchError::StaleVersion); }
                self.index_document_with_options(&document, &event.options)?;
            }
            SearchIndexEventKind::Delete | SearchIndexEventKind::PermissionRevoked => self.remove_document_at_version(&event.document_id, event.authoritative_version)?,
        }
        Ok(SearchMutationCheckpoint { schema_version: self.schema_version, generation: self.generation, document_id: event.document_id, authoritative_version: event.authoritative_version, corpus_digest_blake3: self.corpus_digest()? })
    }

    fn remove_document_internal(&mut self, document_id: &str) {
        self.documents.remove(document_id);
        for posting in self.index.values_mut() { posting.occurrences.retain(|occurrence| occurrence.document_id != document_id); }
        self.index.retain(|_, posting| !posting.occurrences.is_empty());
    }

    /// Die Berechtigung, die der SERVER ableitet — nicht der Aufrufer.
    ///
    /// Gemessen am 2026-10-16: `crates/vgt-ipc/src/server.rs` las die
    /// Berechtigung aus dem REQUEST-BODY (`#[serde(default)] permission:
    /// SearchPermissionContext`) und reichte sie unveraendert an
    /// `search_with_context` weiter. Damit bestimmte der Aufrufer sowohl seine
    /// Partitionen als auch die Menge der sichtbaren Dokumente; die
    /// Partitionsgrenze (`fn permitted`) war eine Selbstauskunft statt einer
    /// Grenze.
    ///
    /// Diese Methode leitet beides aus dem Index ab. `search` und der IPC-Pfad
    /// benutzen DIESELBE Ableitung, damit sie nicht auseinanderlaufen koennen.
    /// Die Partitionsgrenze bleibt dabei erhalten: `permitted` schneidet jedes
    /// Dokument gegen `allowed_partitions`, und die Menge der Dokumente ist
    /// genau die, die der Index kennt.
    #[must_use]
    pub fn local_owner_permission(&self) -> SearchPermissionContext {
        SearchPermissionContext {
            allowed_partitions: vec!["local:owner".to_string()],
            unlocked_document_ids: self.documents.keys().cloned().collect(),
        }
    }

    pub fn search(&self, raw_query: &str) -> Result<Vec<SearchHit>, SearchError> {
        let permission = self.local_owner_permission();
        self.search_with_context(raw_query, &permission, MAX_RESULTS)
    }

    pub fn search_with_context(&self, raw_query: &str, permission: &SearchPermissionContext, limit: usize) -> Result<Vec<SearchHit>, SearchError> {
        if self.is_locked { return Err(SearchError::IndexLocked); }
        validate_permission_context(permission)?;
        let parsed = parse_query(raw_query)?;
        let allowed: HashSet<&str> = permission.allowed_partitions.iter().map(String::as_str).collect();
        let unlocked: HashSet<&str> = permission.unlocked_document_ids.iter().map(String::as_str).collect();
        let mut candidates: HashMap<(String, String, SearchField), (f64, String, String)> = HashMap::new();
        let total_docs = self.documents.len().max(1) as f64;

        let average_field_length = {
            let lengths: Vec<usize> = self.documents.values().flat_map(|record| record.fields.iter().map(|field| tokenize(&field.text).len())).filter(|length| *length > 0).collect();
            if lengths.is_empty() { 1.0 } else { lengths.iter().sum::<usize>() as f64 / lengths.len() as f64 }
        };
        const BM25_K1: f64 = 1.2;
        const BM25_B: f64 = 0.75;

        for token in &parsed.terms {
            let Some(posting) = self.index.get(token) else { continue; };
            let doc_frequency = posting.occurrences.iter().map(|occurrence| &occurrence.document_id).collect::<HashSet<_>>().len().max(1) as f64;
            let idf = (1.0 + (total_docs - doc_frequency + 0.5) / (doc_frequency + 0.5)).ln().max(0.01);
            let mut grouped: HashMap<(String, String, SearchField), (&Occurrence, usize)> = HashMap::new();
            for occurrence in &posting.occurrences {
                let Some(record) = self.documents.get(&occurrence.document_id) else { continue; };
                if !permitted(record, &allowed) || !filters_match(record, occurrence, &parsed.filters) { continue; }
                let key = (occurrence.document_id.clone(), occurrence.object_id.clone(), occurrence.field);
                grouped.entry(key).and_modify(|entry| entry.1 += 1).or_insert((occurrence, 1));
            }
            for (key, (occurrence, term_frequency)) in grouped {
                let Some(record) = self.documents.get(&occurrence.document_id) else { continue; };
                let field_length = record.fields.iter().find(|field| field.object_id == occurrence.object_id && field.field == occurrence.field).map(|field| tokenize(&field.text).len()).unwrap_or(1).max(1) as f64;
                let tf = term_frequency as f64;
                let denominator = tf + BM25_K1 * (1.0 - BM25_B + BM25_B * field_length / average_field_length.max(1.0));
                let bm25 = idf * (tf * (BM25_K1 + 1.0) / denominator.max(f64::EPSILON));
                let entry = candidates.entry(key).or_insert((0.0, occurrence.object_type.clone(), occurrence.snippet.clone()));
                entry.0 += bm25 * field_weight(occurrence.field);
            }
        }

        if !parsed.phrases.is_empty() || (parsed.terms.is_empty() && has_filter(&parsed.filters)) {
            for (document_id, record) in &self.documents {
                if !permitted(record, &allowed) || !record_filters_match(record, &parsed.filters) { continue; }
                for field in &record.fields {
                    let synthetic = Occurrence { document_id: document_id.clone(), object_id: field.object_id.clone(), object_type: field.object_type.clone(), field: field.field, position: 0, language: field.language.clone(), snippet: snippet(&field.text, 240) };
                    if !filters_match(record, &synthetic, &parsed.filters) { continue; }
                    let hay = field.text.to_lowercase();
                    let phrase_matches = parsed.phrases.iter().filter(|phrase| hay.contains(phrase.as_str())).count();
                    if phrase_matches == 0 && !parsed.phrases.is_empty() { continue; }
                    let key = (document_id.clone(), field.object_id.clone(), field.field);
                    let entry = candidates.entry(key).or_insert((0.0, field.object_type.clone(), snippet(&field.text, 240)));
                    entry.0 += phrase_matches as f64 * 8.0 * field_weight(field.field);
                    if parsed.terms.is_empty() && parsed.phrases.is_empty() { entry.0 += field_weight(field.field); }
                }
            }
        }

        let mut hits = Vec::new();
        for ((document_id, object_id, field), (score, object_type, raw_snippet)) in candidates {
            let Some(record) = self.documents.get(&document_id) else { continue; };
            if !parsed.phrases.is_empty() {
                let phrase_ok = record.fields.iter()
                    .filter(|stored| stored.object_id == object_id && stored.field == field)
                    .any(|stored| { let hay = stored.text.to_lowercase(); parsed.phrases.iter().all(|phrase| hay.contains(phrase)) });
                if !phrase_ok { continue; }
            }
            if let Some(distance) = parsed.proximity {
                if parsed.terms.len() > 1 && !proximity_matches(&self.index, &document_id, &object_id, field, &parsed.terms, distance as u32) { continue; }
            }
            let content_unlocked = unlocked.contains(document_id.as_str());
            hits.push(SearchHit {
                document_id, document_title: if content_unlocked { record.title.clone() } else { format!("Protected {:?} document", record.kind) },
                document_kind: record.kind, object_id, object_type, field,
                snippet: if content_unlocked { raw_snippet } else { "[Locked content — unlock to preview]".to_string() },
                relevance_score: score, metadata_protected: !content_unlocked,
            });
        }
        hits.sort_by(|left, right| right.relevance_score.partial_cmp(&left.relevance_score).unwrap_or(Ordering::Equal).then_with(|| left.document_id.cmp(&right.document_id)));
        hits.truncate(limit.clamp(1, MAX_RESULTS));
        Ok(hits)
    }

    pub fn facet_counts_with_context(&self, permission: &SearchPermissionContext) -> Result<SearchFacetCounts, SearchError> {
        if self.is_locked { return Err(SearchError::IndexLocked); }
        validate_permission_context(permission)?;
        let allowed: HashSet<&str> = permission.allowed_partitions.iter().map(String::as_str).collect();
        let unlocked: HashSet<&str> = permission.unlocked_document_ids.iter().map(String::as_str).collect();
        let mut facets = SearchFacetCounts::default();
        for (document_id, record) in &self.documents {
            if !permitted(record, &allowed) || !unlocked.contains(document_id.as_str()) { continue; }
            *facets.document_kinds.entry(format!("{:?}", record.kind).to_ascii_lowercase()).or_insert(0) += 1;
            for tag in &record.tags { *facets.tags.entry(tag.to_ascii_lowercase()).or_insert(0) += 1; }
            let mut seen_fields = HashSet::new();
            for field in &record.fields { if seen_fields.insert(field.field) { *facets.fields.entry(format!("{:?}", field.field).to_ascii_lowercase()).or_insert(0) += 1; } }
        }
        Ok(facets)
    }

    pub fn rebuild_cancellable<C, P>(corpus: &[(WorkspaceDocument, DocumentIndexOptions)], cancellation: &C, mut progress: P) -> Result<(Self, RebuildReport), SearchError>
    where C: SearchCancellationCheck, P: FnMut(SearchRebuildProgress) {
        if corpus.len() > MAX_INDEX_DOCUMENTS { return Err(SearchError::ResourceLimit); }
        let total = corpus.len();
        let mut next = Self::new();
        let mut skipped = 0usize;
        for (batch_index, batch) in corpus.chunks(MAX_REBUILD_BATCH).enumerate() {
            if cancellation.is_cancelled() { return Err(SearchError::Cancelled); }
            for (doc, options) in batch {
                if cancellation.is_cancelled() { return Err(SearchError::Cancelled); }
                let before = next.document_count();
                next.index_document_with_options(doc, options)?;
                if next.document_count() == before { skipped += 1; }
            }
            let processed = ((batch_index + 1) * MAX_REBUILD_BATCH).min(total);
            progress(SearchRebuildProgress { processed, total, indexed_documents: next.document_count(), skipped_documents: skipped, generation: next.generation });
        }
        let report = RebuildReport { rebuilt: true, indexed_documents: next.document_count(), skipped_documents: skipped, generation: next.generation };
        Ok((next, report))
    }

    pub fn checkpoint(&self) -> Result<SearchIndexCheckpoint, SearchError> {
        if self.is_locked { return Err(SearchError::IndexLocked); }
        let document_versions = self.documents.iter().map(|(id, record)| (id.clone(), record.version)).collect();
        Ok(SearchIndexCheckpoint { schema_version: self.schema_version, generation: self.generation, document_versions, corpus_digest_blake3: self.corpus_digest()? })
    }

    pub fn validate_checkpoint(&self, checkpoint: &SearchIndexCheckpoint) -> Result<(), SearchError> {
        if checkpoint.schema_version != SEARCH_INDEX_SCHEMA_VERSION || checkpoint.generation != self.generation || checkpoint.corpus_digest_blake3 != self.corpus_digest()? { return Err(SearchError::CorruptIndex); }
        for (id, version) in &checkpoint.document_versions { if self.documents.get(id).map(|record| record.version) != Some(*version) { return Err(SearchError::CorruptIndex); } }
        Ok(())
    }

    fn corpus_digest(&self) -> Result<String, SearchError> {
        let mut items: Vec<_> = self.documents.iter().collect();
        items.sort_by(|a, b| a.0.cmp(b.0));
        let mut hasher = Hasher::new();
        hasher.update(&SEARCH_INDEX_SCHEMA_VERSION.to_be_bytes());
        for (id, record) in items {
            hasher.update(&(id.len() as u64).to_be_bytes()); hasher.update(id.as_bytes()); hasher.update(&record.version.to_be_bytes());
            let bytes = serde_json::to_vec(record).map_err(|error| SearchError::Crypto(error.to_string()))?;
            hasher.update(&(bytes.len() as u64).to_be_bytes()); hasher.update(&bytes);
        }
        let mut tombstones: Vec<_> = self.tombstones.iter().collect();
        tombstones.sort_by(|left, right| left.0.cmp(right.0));
        for (id, version) in tombstones { hasher.update(&(id.len() as u64).to_be_bytes()); hasher.update(id.as_bytes()); hasher.update(&version.to_be_bytes()); }
        Ok(hasher.finalize().to_hex().to_string())
    }

    pub fn export_encrypted(&self, key: &[u8; 32]) -> Result<Vec<u8>, SearchError> {
        if self.is_locked { return Err(SearchError::IndexLocked); }
        let serialized = serde_json::to_vec(self).map_err(|error| SearchError::Crypto(error.to_string()))?;
        if serialized.len() as u64 > self.preferences.max_encrypted_index_bytes || serialized.len() > MAX_ENCRYPTED_INDEX_BLOB_BYTES { return Err(SearchError::ResourceLimit); }
        let (ciphertext, nonce) = vgt_crypto::encrypt_aes_gcm(&serialized, key, INDEX_AAD).map_err(|error| SearchError::Crypto(error.to_string()))?;
        serde_json::to_vec(&EncryptedIndexEnvelope { version: SEARCH_INDEX_SCHEMA_VERSION, nonce, ciphertext }).map_err(|error| SearchError::Crypto(error.to_string()))
    }

    pub fn import_encrypted(blob: &[u8], key: &[u8; 32]) -> Result<Self, SearchError> {
        if blob.is_empty() || blob.len() > MAX_ENCRYPTED_INDEX_BLOB_BYTES { return Err(SearchError::ResourceLimit); }
        let envelope: EncryptedIndexEnvelope = serde_json::from_slice(blob).map_err(|_| SearchError::CorruptIndex)?;
        if envelope.version != SEARCH_INDEX_SCHEMA_VERSION || envelope.ciphertext.is_empty() { return Err(SearchError::CorruptIndex); }
        let plaintext = vgt_crypto::decrypt_aes_gcm(&envelope.ciphertext, &envelope.nonce, key, INDEX_AAD).map_err(|_| SearchError::CorruptIndex)?;
        let mut index: Self = serde_json::from_slice(&plaintext).map_err(|_| SearchError::CorruptIndex)?;
        index.validate_structure()?;
        index.is_locked = false;
        Ok(index)
    }

    fn validate_structure(&self) -> Result<(), SearchError> {
        if self.schema_version != SEARCH_INDEX_SCHEMA_VERSION || self.documents.len() > MAX_INDEX_DOCUMENTS || self.tombstones.len() > MAX_INDEX_DOCUMENTS { return Err(SearchError::CorruptIndex); }
        for (token, posting) in &self.index {
            if token.is_empty() || token.len() > 512 || posting.occurrences.len() > MAX_POSTINGS_PER_TOKEN { return Err(SearchError::CorruptIndex); }
            for occurrence in &posting.occurrences {
                if !self.documents.contains_key(&occurrence.document_id) || occurrence.object_id.len() > 4096 || occurrence.object_type.len() > 512 || occurrence.snippet.len() > 4096 || validate_language(&occurrence.language).is_err() { return Err(SearchError::CorruptIndex); }
            }
        }
        validate_preferences(&self.preferences)?;
        self.vector_index.validate()?;
        for record in self.documents.values() {
            if record.acl_partition_refs.is_empty() || record.acl_partition_refs.len() > MAX_ACL_REFS || record.tags.len() > MAX_TAGS || record.metadata.len() > MAX_METADATA_FACETS || record.fields.len() > 1_000_000 || record.fields.iter().any(|field| validate_language(&field.language).is_err()) { return Err(SearchError::CorruptIndex); }
        }
        Ok(())
    }

    pub fn load_or_rebuild(blob: Option<&[u8]>, key: &[u8; 32], corpus: &[(WorkspaceDocument, DocumentIndexOptions)]) -> Result<(Self, RebuildReport), SearchError> {
        if let Some(blob) = blob { if let Ok(index) = Self::import_encrypted(blob, key) { let report = RebuildReport { rebuilt: false, indexed_documents: index.document_count(), skipped_documents: 0, generation: index.generation }; return Ok((index, report)); } }
        Self::rebuild_cancellable(corpus, &NeverCancel, |_| {})
    }
}

pub trait SearchCancellationCheck { fn is_cancelled(&self) -> bool; }
pub struct NeverCancel; impl SearchCancellationCheck for NeverCancel { fn is_cancelled(&self) -> bool { false } }
fn validate_permission_context(permission: &SearchPermissionContext) -> Result<(), SearchError> {
    if permission.allowed_partitions.is_empty() || permission.allowed_partitions.len() > MAX_ACL_REFS || permission.unlocked_document_ids.len() > MAX_INDEX_DOCUMENTS { return Err(SearchError::ResourceLimit); }
    if permission.allowed_partitions.iter().any(|value| value.is_empty() || value.len() > 256) || permission.unlocked_document_ids.iter().any(|value| value.is_empty() || value.len() > 256) { return Err(SearchError::ResourceLimit); }
    Ok(())
}

fn validate_preferences(preferences: &SearchPreferences) -> Result<(), SearchError> {
    if preferences.enabled_modules.len() > 64 || preferences.excluded_document_ids.len() > 10_000 || preferences.excluded_spaces.len() > 10_000 || preferences.allowed_connector_ids.len() > 64 || preferences.saved_searches.len() > 128 || preferences.recent_queries.len() > 256 || preferences.max_history_entries > 256 || preferences.max_encrypted_index_bytes < 1024 * 1024 || preferences.max_encrypted_index_bytes > 8 * 1024 * 1024 * 1024 { return Err(SearchError::CorruptIndex); }
    if preferences.transcription_provider != "local" && preferences.transcription_provider != "configured-provider" { return Err(SearchError::CorruptIndex); }
    if preferences.transcription_provider == "configured-provider" && preferences.transcription_connector_id.as_deref().unwrap_or("").is_empty() { return Err(SearchError::CorruptIndex); }
    for query in &preferences.recent_queries { if query.query.is_empty() || query.query.len() > MAX_QUERY_BYTES { return Err(SearchError::CorruptIndex); } }
    for saved in &preferences.saved_searches { if saved.id.is_empty() || saved.id.len() > 128 || saved.name.is_empty() || saved.name.len() > 256 || saved.query.is_empty() || saved.query.len() > MAX_QUERY_BYTES || saved.group.len() > 64 { return Err(SearchError::CorruptIndex); } }
    Ok(())
}

fn validate_language(language: &str) -> Result<(), SearchError> {
    let value = language.trim();
    if value.is_empty() || value.len() > MAX_LANGUAGE_TAG_BYTES || !value.bytes().all(|byte| byte.is_ascii_alphanumeric() || byte == b'-') { return Err(SearchError::InvalidQuery("invalid language tag")); }
    Ok(())
}

fn normalize_metadata(values: &HashMap<String, String>) -> HashMap<String, String> {
    values.iter().take(MAX_METADATA_FACETS).filter_map(|(key, value)| {
        let k: String = key.trim().chars().take(256).collect();
        let v: String = value.trim().chars().take(4096).collect();
        if k.is_empty() { None } else { Some((k, v)) }
    }).collect()
}

fn normalize_list(values: &[String], max_items: usize, max_chars: usize) -> Vec<String> {
    let mut seen = HashSet::new();
    values.iter().take(max_items).filter_map(|value| {
        let cleaned: String = value.trim().chars().take(max_chars).collect();
        if cleaned.is_empty() || !seen.insert(cleaned.to_lowercase()) { None } else { Some(cleaned) }
    }).collect()
}

fn permitted(record: &DocumentRecord, allowed: &HashSet<&str>) -> bool { record.acl_partition_refs.iter().any(|partition| allowed.contains(partition.as_str())) }
fn has_filter(filters: &SearchFilters) -> bool { !filters.document_kinds.is_empty() || !filters.fields.is_empty() || !filters.tags.is_empty() || !filters.object_types.is_empty() || filters.modified_after.is_some() || filters.modified_before.is_some() }
fn record_filters_match(record: &DocumentRecord, filters: &SearchFilters) -> bool {
    (filters.document_kinds.is_empty() || filters.document_kinds.contains(&record.kind))
        && (filters.tags.is_empty() || filters.tags.iter().all(|tag| record.tags.iter().any(|candidate| candidate.eq_ignore_ascii_case(tag))))
        && filters.modified_after.map(|value| record.modified_at >= value).unwrap_or(true)
        && filters.modified_before.map(|value| record.modified_at <= value).unwrap_or(true)
}
fn filters_match(record: &DocumentRecord, occurrence: &Occurrence, filters: &SearchFilters) -> bool {
    record_filters_match(record, filters)
        && (filters.fields.is_empty() || filters.fields.contains(&occurrence.field))
        && (filters.object_types.is_empty() || filters.object_types.iter().any(|value| occurrence.object_type.eq_ignore_ascii_case(value)))
}
fn snippet(value: &str, max_chars: usize) -> String { let mut output: String = value.chars().take(max_chars).collect(); if value.chars().count() > max_chars { output.push('…'); } output }
