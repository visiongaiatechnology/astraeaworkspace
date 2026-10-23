use crate::{LocalVectorIndex, LocalVectorRecord, SearchError, MAX_VECTOR_DIMENSIONS, MAX_VECTOR_DOCUMENTS};
use std::cmp::Ordering;
use std::collections::HashSet;

impl LocalVectorIndex {
    pub(crate) fn configure(&mut self, enabled: bool, dimensions: usize) -> Result<(), SearchError> {
        if !enabled {
            self.enabled = false;
            self.dimensions = 0;
            self.records.clear();
            return Ok(());
        }
        if dimensions == 0 || dimensions > MAX_VECTOR_DIMENSIONS { return Err(SearchError::ResourceLimit); }
        if self.dimensions != 0 && self.dimensions != dimensions { self.records.clear(); }
        self.enabled = true;
        self.dimensions = dimensions;
        Ok(())
    }

    pub(crate) fn upsert(&mut self, document_id: &str, object_id: &str, values: Vec<f32>) -> Result<(), SearchError> {
        if !self.enabled { return Err(SearchError::VectorDisabled); }
        if document_id.is_empty() || document_id.len() > 256 || object_id.is_empty() || object_id.len() > 4096 { return Err(SearchError::ResourceLimit); }
        if values.len() != self.dimensions || values.is_empty() || values.iter().any(|value| !value.is_finite()) { return Err(SearchError::InvalidVector); }
        self.records.retain(|record| !(record.document_id == document_id && record.object_id == object_id));
        if self.records.len() >= MAX_VECTOR_DOCUMENTS { return Err(SearchError::ResourceLimit); }
        self.records.push(LocalVectorRecord { document_id: document_id.to_string(), object_id: object_id.to_string(), values });
        Ok(())
    }

    pub fn remove_document(&mut self, document_id: &str) { self.records.retain(|record| record.document_id != document_id); }

    pub(crate) fn query(&self, vector: &[f32], allowed_document_ids: &HashSet<&str>, limit: usize) -> Result<Vec<(String, String, f32)>, SearchError> {
        if !self.enabled { return Err(SearchError::VectorDisabled); }
        if vector.len() != self.dimensions || vector.is_empty() || vector.iter().any(|value| !value.is_finite()) { return Err(SearchError::InvalidVector); }
        let mut scored = Vec::new();
        for record in &self.records {
            if !allowed_document_ids.contains(record.document_id.as_str()) { continue; }
            let score = cosine(vector, &record.values);
            scored.push((record.document_id.clone(), record.object_id.clone(), score));
        }
        scored.sort_by(|left, right| right.2.partial_cmp(&left.2).unwrap_or(Ordering::Equal).then_with(|| left.0.cmp(&right.0)).then_with(|| left.1.cmp(&right.1)));
        scored.truncate(limit.clamp(1, 500));
        Ok(scored)
    }

    pub(crate) fn validate(&self) -> Result<(), SearchError> {
        if !self.enabled {
            if self.dimensions != 0 || !self.records.is_empty() { return Err(SearchError::CorruptIndex); }
            return Ok(());
        }
        if self.dimensions == 0 || self.dimensions > MAX_VECTOR_DIMENSIONS || self.records.len() > MAX_VECTOR_DOCUMENTS { return Err(SearchError::CorruptIndex); }
        for record in &self.records {
            if record.document_id.is_empty() || record.document_id.len() > 256 || record.object_id.is_empty() || record.object_id.len() > 4096 || record.values.len() != self.dimensions || record.values.iter().any(|value| !value.is_finite()) { return Err(SearchError::CorruptIndex); }
        }
        Ok(())
    }
}

fn cosine(left: &[f32], right: &[f32]) -> f32 {
    let mut dot = 0.0f64;
    let mut l2 = 0.0f64;
    let mut r2 = 0.0f64;
    for (a, b) in left.iter().zip(right.iter()) {
        let a = *a as f64;
        let b = *b as f64;
        dot += a * b;
        l2 += a * a;
        r2 += b * b;
    }
    if l2 == 0.0 || r2 == 0.0 { 0.0 } else { (dot / (l2.sqrt() * r2.sqrt())) as f32 }
}
