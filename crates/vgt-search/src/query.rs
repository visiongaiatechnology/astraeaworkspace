use crate::model::{ParsedSearchQuery, SearchField, SearchFilters, TokenPosting, MAX_QUERY_BYTES, MAX_TOKEN_CHARS};
use crate::SearchError;
use std::collections::HashMap;
use vgt_object_model::DocumentKind;

pub fn tokenize(text: &str) -> Vec<String> {
    text.split(|c: char| !c.is_alphanumeric())
        .filter(|value| !value.is_empty())
        .map(|value| {
            value
                .chars()
                .flat_map(char::to_lowercase)
                .take(MAX_TOKEN_CHARS)
                .collect::<String>()
        })
        .collect()
}

fn parse_kind(raw: &str) -> Option<DocumentKind> {
    match raw.to_ascii_lowercase().as_str() {
        "writer" => Some(DocumentKind::Writer),
        "grid" => Some(DocumentKind::Grid),
        "present" => Some(DocumentKind::Present),
        "notes" => Some(DocumentKind::Notes),
        "pdf" | "pdfstudio" => Some(DocumentKind::PdfStudio),
        "draw" => Some(DocumentKind::Draw),
        "whiteboard" => Some(DocumentKind::Whiteboard),
        "forms" => Some(DocumentKind::Forms),
        "database" => Some(DocumentKind::Database),
        "publish" => Some(DocumentKind::Publish),
        "insight" => Some(DocumentKind::Insight),
        "tasks" => Some(DocumentKind::Tasks),
        "planner" => Some(DocumentKind::Planner),
        "projects" => Some(DocumentKind::Projects),
        "vault" => Some(DocumentKind::Vault),
        "spaces" => Some(DocumentKind::Spaces),
        "connect" => Some(DocumentKind::Connect),
        "automate" => Some(DocumentKind::Automate),
        "gaiacom" => Some(DocumentKind::GaiaCom),
        _ => None,
    }
}

fn parse_field(raw: &str) -> Option<SearchField> {
    match raw.to_ascii_lowercase().as_str() {
        "title" => Some(SearchField::Title),
        "text" | "fulltext" => Some(SearchField::FullText),
        "cell" | "table" => Some(SearchField::TableCell),
        "shape" => Some(SearchField::ShapeText),
        "chart" => Some(SearchField::ChartTitle),
        "meta" | "metadata" => Some(SearchField::Metadata),
        "tag" => Some(SearchField::Tag),
        "object" | "objecttype" => Some(SearchField::ObjectType),
        "ocr" => Some(SearchField::Ocr),
        "transcript" => Some(SearchField::Transcript),
        _ => None,
    }
}

pub fn parse_query(raw: &str) -> Result<ParsedSearchQuery, SearchError> {
    let trimmed = raw.trim();
    if trimmed.is_empty() { return Err(SearchError::EmptyQuery); }
    if trimmed.len() > MAX_QUERY_BYTES { return Err(SearchError::QueryTooLarge); }
    if trimmed.chars().any(|ch| ch.is_control() && !ch.is_whitespace()) { return Err(SearchError::InvalidQuery("control character")); }

    let mut chunks = Vec::new();
    let mut current = String::new();
    let mut quoted = false;
    for ch in trimmed.chars() {
        match ch {
            '"' => {
                quoted = !quoted;
                if !quoted && !current.is_empty() {
                    chunks.push((current.clone(), true));
                    current.clear();
                }
            }
            c if c.is_whitespace() && !quoted => {
                if !current.is_empty() {
                    chunks.push((current.clone(), false));
                    current.clear();
                }
            }
            _ => current.push(ch),
        }
    }
    if quoted { return Err(SearchError::InvalidQuery("unterminated quote")); }
    if !current.is_empty() { chunks.push((current, false)); }

    let mut query = ParsedSearchQuery { terms: Vec::new(), phrases: Vec::new(), filters: SearchFilters::default(), proximity: None };
    for (chunk, was_quoted) in chunks {
        if was_quoted {
            let phrase = chunk.trim().to_lowercase();
            if !phrase.is_empty() { query.phrases.push(phrase); }
            continue;
        }
        if let Some((key, value)) = chunk.split_once(':') {
            let value = value.trim();
            if value.is_empty() { return Err(SearchError::InvalidQuery("empty filter")); }
            match key.to_ascii_lowercase().as_str() {
                "type" | "app" | "kind" => query.filters.document_kinds.push(parse_kind(value).ok_or(SearchError::InvalidQuery("unknown document type"))?),
                "field" => query.filters.fields.push(parse_field(value).ok_or(SearchError::InvalidQuery("unknown field"))?),
                "tag" => query.filters.tags.push(value.to_lowercase()),
                "object" => query.filters.object_types.push(value.to_lowercase()),
                "after" => query.filters.modified_after = Some(value.parse::<i64>().map_err(|_| SearchError::InvalidQuery("invalid after timestamp"))?),
                "before" => query.filters.modified_before = Some(value.parse::<i64>().map_err(|_| SearchError::InvalidQuery("invalid before timestamp"))?),
                "near" | "proximity" => { let distance = value.parse::<u16>().map_err(|_| SearchError::InvalidQuery("invalid proximity"))?; if distance == 0 || distance > 64 { return Err(SearchError::InvalidQuery("proximity out of range")); } query.proximity = Some(distance); },
                _ => query.terms.extend(tokenize(&chunk)),
            }
        } else {
            query.terms.extend(tokenize(&chunk));
        }
    }
    query.terms.sort();
    query.terms.dedup();
    query.phrases.sort();
    query.phrases.dedup();
    if query.terms.is_empty() && query.phrases.is_empty() && query.filters == SearchFilters::default() {
        return Err(SearchError::EmptyQuery);
    }
    Ok(query)
}

pub(crate) fn proximity_matches(index: &HashMap<String, TokenPosting>, document_id: &str, object_id: &str, field: SearchField, terms: &[String], distance: u32) -> bool {
    let mut positions_per_term: Vec<Vec<u32>> = Vec::new();
    for term in terms {
        let Some(posting) = index.get(term) else { return false; };
        let positions: Vec<u32> = posting.occurrences.iter().filter(|occurrence| occurrence.document_id == document_id && occurrence.object_id == object_id && occurrence.field == field).map(|occurrence| occurrence.position).collect();
        if positions.is_empty() { return false; }
        positions_per_term.push(positions);
    }
    fn search_window(groups: &[Vec<u32>], index: usize, chosen: &mut Vec<u32>, distance: u32) -> bool {
        if index == groups.len() {
            let min = chosen.iter().copied().min().unwrap_or(0);
            let max = chosen.iter().copied().max().unwrap_or(0);
            return max.saturating_sub(min) <= distance;
        }
        for position in groups[index].iter().copied().take(256) {
            chosen.push(position);
            if search_window(groups, index + 1, chosen, distance) { return true; }
            chosen.pop();
        }
        false
    }
    search_window(&positions_per_term, 0, &mut Vec::new(), distance)
}

pub(crate) fn field_weight(field: SearchField) -> f64 { match field { SearchField::Title => 6.0, SearchField::Tag => 4.5, SearchField::ChartTitle => 4.0, SearchField::Metadata => 3.0, SearchField::Ocr | SearchField::Transcript => 2.5, SearchField::FullText => 2.0, SearchField::TableCell => 1.8, SearchField::ShapeText => 1.6, SearchField::ObjectType => 1.0 } }
