use crate::model::{DerivedFieldKind, DocumentIndexOptions, SearchField, StoredField, MAX_DERIVED_FIELDS, MAX_DERIVED_TEXT_BYTES, MAX_INDEXED_FIELD_BYTES, MAX_METADATA_FACETS, MAX_TAGS};
use serde_json::Value;
use std::collections::HashSet;
use vgt_object_model::{CellValue, WorkspaceDocument, WorkspaceObject};

fn bounded_text(value: &str, max: usize) -> String {
    value.chars().take(max).collect()
}

fn push_field(fields: &mut Vec<StoredField>, object_id: &str, object_type: &str, field: SearchField, text: &str, language: &str, provenance: Option<String>) {
    let text = bounded_text(text.trim(), MAX_INDEXED_FIELD_BYTES);
    if text.is_empty() { return; }
    fields.push(StoredField { object_id: object_id.to_string(), object_type: object_type.to_string(), field, text, language: language.to_string(), provenance });
}

fn walk_json(prefix: &str, value: &Value, fields: &mut Vec<StoredField>, depth: usize, budget: &mut usize, language: &str) {
    if depth > 16 || *budget == 0 { return; }
    match value {
        Value::String(text) => {
            let take = text.len().min(*budget).min(64 * 1024);
            let candidate: String = text.chars().take(take).collect();
            let key = prefix.to_ascii_lowercase();
            let field = if key.contains("ocr") { SearchField::Ocr } else if key.contains("transcript") { SearchField::Transcript } else if key.contains("tag") || key.contains("label") { SearchField::Tag } else { SearchField::Metadata };
            push_field(fields, prefix, "AppMetadata", field, &candidate, language, Some(format!("wom-json:{}", prefix)));
            *budget = budget.saturating_sub(take);
        }
        Value::Number(number) => push_field(fields, prefix, "AppMetadata", SearchField::Metadata, &number.to_string(), language, Some(format!("wom-json:{}", prefix))),
        Value::Bool(boolean) => push_field(fields, prefix, "AppMetadata", SearchField::Metadata, if *boolean { "true" } else { "false" }, language, Some(format!("wom-json:{}", prefix))),
        Value::Array(items) => for (index, item) in items.iter().take(2048).enumerate() { walk_json(&format!("{}[{}]", prefix, index), item, fields, depth + 1, budget, language); },
        Value::Object(map) => for (key, item) in map.iter().take(2048) { walk_json(&format!("{}.{}", prefix, key), item, fields, depth + 1, budget, language); },
        Value::Null => {}
    }
}

pub(crate) fn extract_document_fields(doc: &WorkspaceDocument, options: &DocumentIndexOptions) -> Vec<StoredField> {
    let mut fields = Vec::new();
    push_field(&mut fields, &doc.id, "Document", SearchField::Title, &doc.title, &options.language, None);

    for (object_id, object) in &doc.objects {
        push_field(&mut fields, object_id, object.type_name(), SearchField::ObjectType, object.type_name(), &options.language, None);
        match object {
            WorkspaceObject::TextBlock(block) => for paragraph in &block.paragraphs { for span in &paragraph.spans { push_field(&mut fields, object_id, "TextBlock", SearchField::FullText, &span.text, &options.language, None); } },
            WorkspaceObject::Table(table) => for (coord, cell) in &table.cells {
                let text = match &cell.value { CellValue::String(v) => v.clone(), CellValue::Number(v) => v.to_string(), CellValue::Boolean(v) => v.to_string(), _ => String::new() };
                if !text.is_empty() { push_field(&mut fields, object_id, "Table", SearchField::TableCell, &format!("{} {}", coord, text), &options.language, None); }
            },
            WorkspaceObject::Shape(shape) => if let Some(text) = &shape.text { push_field(&mut fields, object_id, "Shape", SearchField::ShapeText, text, &options.language, None); },
            WorkspaceObject::Chart(chart) => push_field(&mut fields, object_id, "Chart", SearchField::ChartTitle, &chart.title, &options.language, None),
            _ => {}
        }
    }

    let mut seen_tags = HashSet::new();
    for tag in options.tags.iter().take(MAX_TAGS) {
        let normalized = bounded_text(tag.trim(), 256);
        if !normalized.is_empty() && seen_tags.insert(normalized.to_lowercase()) { push_field(&mut fields, &doc.id, "Document", SearchField::Tag, &normalized, &options.language, None); }
    }
    for (key, value) in options.metadata.iter().take(MAX_METADATA_FACETS) {
        let joined = format!("{} {}", bounded_text(key, 256), bounded_text(value, 4096));
        push_field(&mut fields, &doc.id, "Document", SearchField::Metadata, &joined, &options.language, Some("explicit-metadata".to_string()));
    }
    for derived in options.derived_fields.iter().take(MAX_DERIVED_FIELDS) {
        if derived.text.len() > MAX_DERIVED_TEXT_BYTES { continue; }
        let field = match derived.kind { DerivedFieldKind::Ocr => SearchField::Ocr, DerivedFieldKind::Transcript => SearchField::Transcript };
        push_field(&mut fields, &derived.source_id, "Derived", field, &derived.text, &options.language, Some(bounded_text(&derived.provenance, 1024)));
    }

    let opaque = [
        ("notebooks", doc.notebooks.as_ref()), ("noteData", doc.note_data.as_ref()), ("pdfData", doc.pdf_data.as_ref()),
        ("presentData", doc.present_data.as_ref()), ("gridData", doc.grid_data.as_ref()), ("formsData", doc.forms_data.as_ref()),
        ("databaseData", doc.database_data.as_ref()), ("workData", doc.work_data.as_ref()), ("workManagementData", doc.work_management_data.as_ref()),
        ("vaultData", doc.vault_data.as_ref()), ("writerData", doc.writer_data.as_ref()), ("whiteboardData", doc.whiteboard_data.as_ref()),
    ];
    let mut budget = MAX_INDEXED_FIELD_BYTES;
    for (name, value) in opaque { if let Some(value) = value { walk_json(name, value, &mut fields, 0, &mut budget, &options.language); } }
    // Forward-compatible app payloads that have no typed WOM field yet (drawData,
    // publishData, insightData, connectData, automateData, adminPolicyData, gaiaComData, ...)
    // arrive through serde's flattened `extensions` bucket. Without this walk, six of the
    // fourteen Open-Core document kinds contributed only a title and produced no typed
    // payload field at all. Keys are sorted so a rebuild is deterministic.
    let mut extension_names: Vec<&String> = doc.extensions.keys().collect();
    extension_names.sort();
    for name in extension_names { if let Some(value) = doc.extensions.get(name) { walk_json(name, value, &mut fields, 0, &mut budget, &options.language); } }
    fields
}
