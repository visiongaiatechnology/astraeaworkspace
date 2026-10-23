//! # VGT Operations & Transactional Undo/Redo
//!
//! Implements reversible, deterministic operations across the Workspace Object Model (WOM).
//!
//! Principles:
//! - Doktrin 33: Operations are modeled as invertible delta transitions, not full document clones.
//! - Undo/Redo state remains process-local; persistence is delegated to the encrypted VWC storage layer.

use chrono::Utc;
use serde::{Deserialize, Serialize};
use thiserror::Error;
use uuid::Uuid;
use vgt_object_model::{
    CellValue, GridCell, Paragraph, TextSpan, WorkspaceDocument, WorkspaceObject,
    WriterDocumentModel,
};

#[derive(Error, Debug, Clone, PartialEq)]
pub enum OperationError {
    #[error("Target object '{0}' not found in document")]
    ObjectNotFound(String),

    #[error("Invalid operation target: {0}")]
    InvalidTarget(String),

    #[error("Operation conflict: {0}")]
    Conflict(String),

    #[error("Undo stack is empty")]
    UndoStackEmpty,

    #[error("Redo stack is empty")]
    RedoStackEmpty,
}

/// An invertible atomic mutation on a WorkspaceDocument
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum WorkspaceOperation {
    /// Text insertion into a paragraph span
    InsertText {
        block_id: String,
        paragraph_idx: usize,
        text: String,
    },
    /// Text deletion from a paragraph
    DeleteText {
        block_id: String,
        paragraph_idx: usize,
        deleted_text: String,
    },
    /// Insert a stable-id Writer paragraph at a deterministic position.
    InsertParagraph {
        block_id: String,
        index: usize,
        paragraph: Paragraph,
    },
    /// Delete a Writer paragraph, retaining its full snapshot for inversion.
    DeleteParagraph {
        block_id: String,
        paragraph_id: String,
        index: usize,
        cached_paragraph: Paragraph,
    },
    /// Replace one Writer paragraph if its current snapshot still matches `before`.
    ReplaceParagraph {
        block_id: String,
        paragraph_id: String,
        before: Paragraph,
        after: Box<Paragraph>,
    },
    /// Move one Writer paragraph using stable identity and expected source position.
    MoveParagraph {
        block_id: String,
        paragraph_id: String,
        from_index: usize,
        to_index: usize,
    },
    /// Replace the opaque Writer application payload with optimistic conflict detection.
    SetWriterData {
        before: Option<serde_json::Value>,
        after: Option<serde_json::Value>,
    },
    /// Replace one top-level Writer payload field with optimistic conflict detection.
    SetWriterDataField {
        field: String,
        before: Option<serde_json::Value>,
        after: Option<serde_json::Value>,
    },
    /// Insert one stable-id Present slide at a deterministic position.
    InsertPresentSlide {
        index: usize,
        slide: serde_json::Value,
    },
    /// Delete a Present slide, retaining its full snapshot for inversion.
    DeletePresentSlide {
        slide_id: String,
        index: usize,
        cached_slide: serde_json::Value,
    },
    /// Replace one Present slide if its current snapshot still matches `before`.
    ReplacePresentSlide {
        slide_id: String,
        before: serde_json::Value,
        after: serde_json::Value,
    },
    /// Move one Present slide using stable identity and expected source position.
    MovePresentSlide {
        slide_id: String,
        from_index: usize,
        to_index: usize,
    },
    /// Replace one top-level Present payload field with optimistic conflict detection.
    SetPresentDataField {
        field: String,
        before: Option<serde_json::Value>,
        after: Option<serde_json::Value>,
    },
    /// Spreadsheet cell update
    SetCell {
        table_id: String,
        coord: String,
        old_value: CellValue,
        new_value: CellValue,
        old_formula: Option<String>,
        new_formula: Option<String>,
    },
    /// Shape coordinate transform
    MoveShape {
        shape_id: String,
        old_x: f32,
        old_y: f32,
        new_x: f32,
        new_y: f32,
    },
    /// Add an object to the document
    AddObject {
        object: WorkspaceObject,
        is_root: bool,
    },
    /// Remove an object from the document
    RemoveObject {
        object_id: String,
        cached_object: WorkspaceObject,
        was_root: bool,
    },
}

/// Validate a Writer payload with the same typed guard the document path uses.
///
/// `WorkspaceDocument::set_writer_model` calls `WriterDocumentModel::validate()` before it stores a
/// model; the document path can therefore never persist a payload that guard rejects. This helper
/// gives the operation path the same guarantee, so `SetWriterData` cannot persist a Writer document
/// the document path would refuse.
///
/// The payload is validated, never canonicalized: the caller stores the original bytes, so unknown
/// forward-compatible fields survive untouched.
fn validate_writer_payload(payload: &serde_json::Value) -> Result<(), OperationError> {
    let model: WriterDocumentModel = serde_json::from_value(payload.clone()).map_err(|error| {
        OperationError::InvalidTarget(format!(
            "Writer payload is not a valid Writer document model: {error}"
        ))
    })?;
    model.validate().map_err(|error| {
        OperationError::InvalidTarget(format!("Writer payload failed typed validation: {error}"))
    })
}

impl WorkspaceOperation {
    /// Computes the exact inverse of this operation for undo
    pub fn invert(&self) -> WorkspaceOperation {
        match self {
            WorkspaceOperation::InsertText {
                block_id,
                paragraph_idx,
                text,
            } => WorkspaceOperation::DeleteText {
                block_id: block_id.clone(),
                paragraph_idx: *paragraph_idx,
                deleted_text: text.clone(),
            },
            WorkspaceOperation::DeleteText {
                block_id,
                paragraph_idx,
                deleted_text,
            } => WorkspaceOperation::InsertText {
                block_id: block_id.clone(),
                paragraph_idx: *paragraph_idx,
                text: deleted_text.clone(),
            },
            WorkspaceOperation::InsertParagraph {
                block_id,
                index,
                paragraph,
            } => WorkspaceOperation::DeleteParagraph {
                block_id: block_id.clone(),
                paragraph_id: paragraph.id.clone(),
                index: *index,
                cached_paragraph: paragraph.clone(),
            },
            WorkspaceOperation::DeleteParagraph {
                block_id,
                index,
                cached_paragraph,
                ..
            } => WorkspaceOperation::InsertParagraph {
                block_id: block_id.clone(),
                index: *index,
                paragraph: cached_paragraph.clone(),
            },
            WorkspaceOperation::ReplaceParagraph {
                block_id,
                paragraph_id,
                before,
                after,
            } => WorkspaceOperation::ReplaceParagraph {
                block_id: block_id.clone(),
                paragraph_id: paragraph_id.clone(),
                before: after.as_ref().clone(),
                after: Box::new(before.clone()),
            },
            WorkspaceOperation::MoveParagraph {
                block_id,
                paragraph_id,
                from_index,
                to_index,
            } => WorkspaceOperation::MoveParagraph {
                block_id: block_id.clone(),
                paragraph_id: paragraph_id.clone(),
                from_index: *to_index,
                to_index: *from_index,
            },
            WorkspaceOperation::SetWriterData { before, after } => {
                WorkspaceOperation::SetWriterData {
                    before: after.clone(),
                    after: before.clone(),
                }
            }
            WorkspaceOperation::SetWriterDataField {
                field,
                before,
                after,
            } => WorkspaceOperation::SetWriterDataField {
                field: field.clone(),
                before: after.clone(),
                after: before.clone(),
            },
            WorkspaceOperation::InsertPresentSlide { index, slide } => {
                WorkspaceOperation::DeletePresentSlide {
                    slide_id: slide
                        .get("id")
                        .and_then(serde_json::Value::as_str)
                        .unwrap_or_default()
                        .to_string(),
                    index: *index,
                    cached_slide: slide.clone(),
                }
            }
            WorkspaceOperation::DeletePresentSlide {
                index,
                cached_slide,
                ..
            } => WorkspaceOperation::InsertPresentSlide {
                index: *index,
                slide: cached_slide.clone(),
            },
            WorkspaceOperation::ReplacePresentSlide {
                slide_id,
                before,
                after,
            } => WorkspaceOperation::ReplacePresentSlide {
                slide_id: slide_id.clone(),
                before: after.clone(),
                after: before.clone(),
            },
            WorkspaceOperation::MovePresentSlide {
                slide_id,
                from_index,
                to_index,
            } => WorkspaceOperation::MovePresentSlide {
                slide_id: slide_id.clone(),
                from_index: *to_index,
                to_index: *from_index,
            },
            WorkspaceOperation::SetPresentDataField {
                field,
                before,
                after,
            } => WorkspaceOperation::SetPresentDataField {
                field: field.clone(),
                before: after.clone(),
                after: before.clone(),
            },
            WorkspaceOperation::SetCell {
                table_id,
                coord,
                old_value,
                new_value,
                old_formula,
                new_formula,
            } => WorkspaceOperation::SetCell {
                table_id: table_id.clone(),
                coord: coord.clone(),
                old_value: new_value.clone(),
                new_value: old_value.clone(),
                old_formula: new_formula.clone(),
                new_formula: old_formula.clone(),
            },
            WorkspaceOperation::MoveShape {
                shape_id,
                old_x,
                old_y,
                new_x,
                new_y,
            } => WorkspaceOperation::MoveShape {
                shape_id: shape_id.clone(),
                old_x: *new_x,
                old_y: *new_y,
                new_x: *old_x,
                new_y: *old_y,
            },
            WorkspaceOperation::AddObject { object, is_root } => WorkspaceOperation::RemoveObject {
                object_id: object.id().to_string(),
                cached_object: object.clone(),
                was_root: *is_root,
            },
            WorkspaceOperation::RemoveObject {
                object_id: _,
                cached_object,
                was_root,
            } => WorkspaceOperation::AddObject {
                object: cached_object.clone(),
                is_root: *was_root,
            },
        }
    }

    /// Apply the operation directly to a draft document without version bumping
    pub fn apply_to_draft(&self, doc: &mut WorkspaceDocument) -> Result<(), OperationError> {
        match self {
            WorkspaceOperation::InsertText {
                block_id,
                paragraph_idx,
                text,
            } => {
                let obj = doc
                    .get_object_mut(block_id)
                    .ok_or_else(|| OperationError::ObjectNotFound(block_id.clone()))?;

                if let WorkspaceObject::TextBlock(tb) = obj {
                    if let Some(p) = tb.paragraphs.get_mut(*paragraph_idx) {
                        if let Some(span) = p.spans.first_mut() {
                            span.text.push_str(text);
                        } else {
                            p.spans.push(TextSpan {
                                text: text.clone(),
                                ..Default::default()
                            });
                        }
                    } else {
                        return Err(OperationError::InvalidTarget(format!(
                            "Paragraph {} out of bounds",
                            paragraph_idx
                        )));
                    }
                } else {
                    return Err(OperationError::InvalidTarget(
                        "Object is not TextBlock".into(),
                    ));
                }
            }
            WorkspaceOperation::DeleteText {
                block_id,
                paragraph_idx,
                deleted_text,
            } => {
                let obj = doc
                    .get_object_mut(block_id)
                    .ok_or_else(|| OperationError::ObjectNotFound(block_id.clone()))?;

                if let WorkspaceObject::TextBlock(tb) = obj {
                    if let Some(p) = tb.paragraphs.get_mut(*paragraph_idx) {
                        if let Some(span) = p.spans.first_mut() {
                            if span.text.ends_with(deleted_text) {
                                let new_len = span.text.len() - deleted_text.len();
                                span.text.truncate(new_len);
                            } else {
                                span.text = span.text.replace(deleted_text, "");
                            }
                        }
                    }
                }
            }
            WorkspaceOperation::InsertParagraph {
                block_id,
                index,
                paragraph,
            } => {
                let obj = doc
                    .get_object_mut(block_id)
                    .ok_or_else(|| OperationError::ObjectNotFound(block_id.clone()))?;
                let WorkspaceObject::TextBlock(block) = obj else {
                    return Err(OperationError::InvalidTarget(
                        "Object is not TextBlock".into(),
                    ));
                };
                if block
                    .paragraphs
                    .iter()
                    .any(|candidate| candidate.id == paragraph.id)
                {
                    return Err(OperationError::Conflict(format!(
                        "Paragraph '{}' already exists",
                        paragraph.id
                    )));
                }
                if *index > block.paragraphs.len() {
                    return Err(OperationError::InvalidTarget(format!(
                        "Paragraph insert index {} out of bounds",
                        index
                    )));
                }
                block.paragraphs.insert(*index, paragraph.clone());
            }
            WorkspaceOperation::DeleteParagraph {
                block_id,
                paragraph_id,
                index,
                cached_paragraph,
            } => {
                let obj = doc
                    .get_object_mut(block_id)
                    .ok_or_else(|| OperationError::ObjectNotFound(block_id.clone()))?;
                let WorkspaceObject::TextBlock(block) = obj else {
                    return Err(OperationError::InvalidTarget(
                        "Object is not TextBlock".into(),
                    ));
                };
                let current_index = block
                    .paragraphs
                    .iter()
                    .position(|paragraph| paragraph.id == *paragraph_id)
                    .ok_or_else(|| {
                        OperationError::Conflict(format!(
                            "Paragraph '{}' was already removed",
                            paragraph_id
                        ))
                    })?;
                if current_index != *index || block.paragraphs[current_index] != *cached_paragraph {
                    return Err(OperationError::Conflict(format!(
                        "Paragraph '{}' changed before delete",
                        paragraph_id
                    )));
                }
                block.paragraphs.remove(current_index);
            }
            WorkspaceOperation::ReplaceParagraph {
                block_id,
                paragraph_id,
                before,
                after,
            } => {
                let obj = doc
                    .get_object_mut(block_id)
                    .ok_or_else(|| OperationError::ObjectNotFound(block_id.clone()))?;
                let WorkspaceObject::TextBlock(block) = obj else {
                    return Err(OperationError::InvalidTarget(
                        "Object is not TextBlock".into(),
                    ));
                };
                let paragraph = block
                    .paragraphs
                    .iter_mut()
                    .find(|paragraph| paragraph.id == *paragraph_id)
                    .ok_or_else(|| {
                        OperationError::Conflict(format!(
                            "Paragraph '{}' no longer exists",
                            paragraph_id
                        ))
                    })?;
                if *paragraph != *before {
                    return Err(OperationError::Conflict(format!(
                        "Paragraph '{}' has a concurrent edit",
                        paragraph_id
                    )));
                }
                if after.id != *paragraph_id {
                    return Err(OperationError::InvalidTarget(
                        "Replacement paragraph identity must remain stable".into(),
                    ));
                }
                *paragraph = after.as_ref().clone();
            }
            WorkspaceOperation::MoveParagraph {
                block_id,
                paragraph_id,
                from_index,
                to_index,
            } => {
                let obj = doc
                    .get_object_mut(block_id)
                    .ok_or_else(|| OperationError::ObjectNotFound(block_id.clone()))?;
                let WorkspaceObject::TextBlock(block) = obj else {
                    return Err(OperationError::InvalidTarget(
                        "Object is not TextBlock".into(),
                    ));
                };
                let current_index = block
                    .paragraphs
                    .iter()
                    .position(|paragraph| paragraph.id == *paragraph_id)
                    .ok_or_else(|| {
                        OperationError::Conflict(format!(
                            "Paragraph '{}' no longer exists",
                            paragraph_id
                        ))
                    })?;
                if current_index != *from_index {
                    return Err(OperationError::Conflict(format!(
                        "Paragraph '{}' moved concurrently",
                        paragraph_id
                    )));
                }
                if *to_index >= block.paragraphs.len() {
                    return Err(OperationError::InvalidTarget(format!(
                        "Paragraph move index {} out of bounds",
                        to_index
                    )));
                }
                let paragraph = block.paragraphs.remove(current_index);
                block.paragraphs.insert(*to_index, paragraph);
            }
            WorkspaceOperation::SetWriterData { before, after } => {
                if doc.writer_data != *before {
                    return Err(OperationError::Conflict(
                        "Writer document properties changed concurrently".into(),
                    ));
                }
                if let Some(payload) = after {
                    validate_writer_payload(payload)?;
                }
                doc.writer_data = after.clone();
            }
            WorkspaceOperation::SetWriterDataField {
                field,
                before,
                after,
            } => {
                if field.is_empty() || field.len() > 128 || field.chars().any(char::is_control) {
                    return Err(OperationError::InvalidTarget(
                        "Writer data field name is invalid".into(),
                    ));
                }

                let current = doc
                    .writer_data
                    .as_ref()
                    .and_then(serde_json::Value::as_object)
                    .and_then(|writer| writer.get(field))
                    .cloned();
                if current != *before {
                    return Err(OperationError::Conflict(format!(
                        "Writer data field '{}' changed concurrently",
                        field
                    )));
                }

                if doc.writer_data.is_none() {
                    doc.writer_data = Some(serde_json::Value::Object(serde_json::Map::new()));
                }
                let should_clear = {
                    let writer_data = doc
                        .writer_data
                        .as_mut()
                        .and_then(serde_json::Value::as_object_mut)
                        .ok_or_else(|| {
                            OperationError::InvalidTarget(
                                "Writer payload is not a JSON object".into(),
                            )
                        })?;
                    match after {
                        Some(value) => {
                            writer_data.insert(field.clone(), value.clone());
                        }
                        None => {
                            writer_data.remove(field);
                        }
                    }
                    writer_data.is_empty()
                };
                if should_clear {
                    doc.writer_data = None;
                }
            }
            WorkspaceOperation::InsertPresentSlide { index, slide } => {
                let slide_id = slide
                    .get("id")
                    .and_then(serde_json::Value::as_str)
                    .ok_or_else(|| {
                        OperationError::InvalidTarget("Present slide is missing a string id".into())
                    })?;
                if slide_id.is_empty()
                    || slide_id.len() > 256
                    || slide_id.chars().any(char::is_control)
                {
                    return Err(OperationError::InvalidTarget(
                        "Present slide id is invalid".into(),
                    ));
                }
                if doc.present_data.is_none() {
                    doc.present_data = Some(serde_json::json!({"slides": []}));
                }
                let present = doc
                    .present_data
                    .as_mut()
                    .and_then(serde_json::Value::as_object_mut)
                    .ok_or_else(|| {
                        OperationError::InvalidTarget("Present payload is not a JSON object".into())
                    })?;
                let slides = present
                    .entry("slides")
                    .or_insert_with(|| serde_json::Value::Array(Vec::new()))
                    .as_array_mut()
                    .ok_or_else(|| {
                        OperationError::InvalidTarget(
                            "Present slides payload is not an array".into(),
                        )
                    })?;
                if slides.iter().any(|candidate| {
                    candidate.get("id").and_then(serde_json::Value::as_str) == Some(slide_id)
                }) {
                    return Err(OperationError::Conflict(format!(
                        "Present slide '{}' already exists",
                        slide_id
                    )));
                }
                if *index > slides.len() {
                    return Err(OperationError::InvalidTarget(format!(
                        "Present slide insert index {} out of bounds",
                        index
                    )));
                }
                slides.insert(*index, slide.clone());
            }
            WorkspaceOperation::DeletePresentSlide {
                slide_id,
                index,
                cached_slide,
            } => {
                let present = doc
                    .present_data
                    .as_mut()
                    .and_then(serde_json::Value::as_object_mut)
                    .ok_or_else(|| {
                        OperationError::InvalidTarget("Present payload is not a JSON object".into())
                    })?;
                let slides = present
                    .get_mut("slides")
                    .and_then(serde_json::Value::as_array_mut)
                    .ok_or_else(|| {
                        OperationError::InvalidTarget(
                            "Present slides payload is not an array".into(),
                        )
                    })?;
                let current_index = slides
                    .iter()
                    .position(|slide| {
                        slide.get("id").and_then(serde_json::Value::as_str)
                            == Some(slide_id.as_str())
                    })
                    .ok_or_else(|| {
                        OperationError::Conflict(format!(
                            "Present slide '{}' was already removed",
                            slide_id
                        ))
                    })?;
                if current_index != *index || slides[current_index] != *cached_slide {
                    return Err(OperationError::Conflict(format!(
                        "Present slide '{}' changed before delete",
                        slide_id
                    )));
                }
                slides.remove(current_index);
            }
            WorkspaceOperation::ReplacePresentSlide {
                slide_id,
                before,
                after,
            } => {
                if after.get("id").and_then(serde_json::Value::as_str) != Some(slide_id.as_str()) {
                    return Err(OperationError::InvalidTarget(
                        "Replacement Present slide identity must remain stable".into(),
                    ));
                }
                let present = doc
                    .present_data
                    .as_mut()
                    .and_then(serde_json::Value::as_object_mut)
                    .ok_or_else(|| {
                        OperationError::InvalidTarget("Present payload is not a JSON object".into())
                    })?;
                let slides = present
                    .get_mut("slides")
                    .and_then(serde_json::Value::as_array_mut)
                    .ok_or_else(|| {
                        OperationError::InvalidTarget(
                            "Present slides payload is not an array".into(),
                        )
                    })?;
                let slide = slides
                    .iter_mut()
                    .find(|slide| {
                        slide.get("id").and_then(serde_json::Value::as_str)
                            == Some(slide_id.as_str())
                    })
                    .ok_or_else(|| {
                        OperationError::Conflict(format!(
                            "Present slide '{}' no longer exists",
                            slide_id
                        ))
                    })?;
                if *slide != *before {
                    return Err(OperationError::Conflict(format!(
                        "Present slide '{}' has a concurrent edit",
                        slide_id
                    )));
                }
                *slide = after.clone();
            }
            WorkspaceOperation::MovePresentSlide {
                slide_id,
                from_index,
                to_index,
            } => {
                let present = doc
                    .present_data
                    .as_mut()
                    .and_then(serde_json::Value::as_object_mut)
                    .ok_or_else(|| {
                        OperationError::InvalidTarget("Present payload is not a JSON object".into())
                    })?;
                let slides = present
                    .get_mut("slides")
                    .and_then(serde_json::Value::as_array_mut)
                    .ok_or_else(|| {
                        OperationError::InvalidTarget(
                            "Present slides payload is not an array".into(),
                        )
                    })?;
                let current_index = slides
                    .iter()
                    .position(|slide| {
                        slide.get("id").and_then(serde_json::Value::as_str)
                            == Some(slide_id.as_str())
                    })
                    .ok_or_else(|| {
                        OperationError::Conflict(format!(
                            "Present slide '{}' no longer exists",
                            slide_id
                        ))
                    })?;
                if current_index != *from_index {
                    return Err(OperationError::Conflict(format!(
                        "Present slide '{}' moved concurrently",
                        slide_id
                    )));
                }
                if *to_index >= slides.len() {
                    return Err(OperationError::InvalidTarget(format!(
                        "Present slide move index {} out of bounds",
                        to_index
                    )));
                }
                let slide = slides.remove(current_index);
                slides.insert(*to_index, slide);
            }
            WorkspaceOperation::SetPresentDataField {
                field,
                before,
                after,
            } => {
                if field.is_empty()
                    || field == "slides"
                    || field.len() > 128
                    || field.chars().any(char::is_control)
                {
                    return Err(OperationError::InvalidTarget(
                        "Present data field name is invalid".into(),
                    ));
                }
                let current = doc
                    .present_data
                    .as_ref()
                    .and_then(serde_json::Value::as_object)
                    .and_then(|present| present.get(field))
                    .cloned();
                if current != *before {
                    return Err(OperationError::Conflict(format!(
                        "Present data field '{}' changed concurrently",
                        field
                    )));
                }
                if doc.present_data.is_none() {
                    doc.present_data = Some(serde_json::Value::Object(serde_json::Map::new()));
                }
                let present_data = doc
                    .present_data
                    .as_mut()
                    .and_then(serde_json::Value::as_object_mut)
                    .ok_or_else(|| {
                        OperationError::InvalidTarget("Present payload is not a JSON object".into())
                    })?;
                match after {
                    Some(value) => {
                        present_data.insert(field.clone(), value.clone());
                    }
                    None => {
                        present_data.remove(field);
                    }
                }
            }
            WorkspaceOperation::SetCell {
                table_id,
                coord,
                new_value,
                new_formula,
                ..
            } => {
                let obj = doc
                    .get_object_mut(table_id)
                    .ok_or_else(|| OperationError::ObjectNotFound(table_id.clone()))?;

                if let WorkspaceObject::Table(tbl) = obj {
                    let cell = tbl.cells.entry(coord.clone()).or_insert_with(|| GridCell {
                        value: CellValue::Empty,
                        formula: None,
                        format: None,
                        bold: false,
                        background: None,
                        text_color: None,
                    });
                    cell.value = new_value.clone();
                    cell.formula = new_formula.clone();
                } else {
                    return Err(OperationError::InvalidTarget("Object is not Table".into()));
                }
            }
            WorkspaceOperation::MoveShape {
                shape_id,
                new_x,
                new_y,
                ..
            } => {
                let obj = doc
                    .get_object_mut(shape_id)
                    .ok_or_else(|| OperationError::ObjectNotFound(shape_id.clone()))?;

                if let WorkspaceObject::Shape(sh) = obj {
                    sh.x = *new_x;
                    sh.y = *new_y;
                } else {
                    return Err(OperationError::InvalidTarget("Object is not Shape".into()));
                }
            }
            WorkspaceOperation::AddObject { object, is_root } => {
                let id = object.id().to_string();
                doc.objects.insert(id.clone(), object.clone());
                if *is_root && !doc.root_object_ids.contains(&id) {
                    doc.root_object_ids.push(id);
                }
            }
            WorkspaceOperation::RemoveObject {
                object_id,
                was_root,
                ..
            } => {
                doc.objects.remove(object_id);
                if *was_root {
                    doc.root_object_ids.retain(|id| id != object_id);
                }
            }
        }

        Ok(())
    }

    /// Apply the operation directly to a WorkspaceDocument, incrementing version on success
    pub fn apply(&self, doc: &mut WorkspaceDocument) -> Result<(), OperationError> {
        self.apply_to_draft(doc)?;
        doc.version += 1;
        doc.modified_at = Utc::now().timestamp_millis();
        Ok(())
    }
}

/// A transactional batch of operations committed atomically
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct OperationTransaction {
    pub id: String,
    pub timestamp_utc: i64,
    pub description: String,
    pub operations: Vec<WorkspaceOperation>,
}

impl OperationTransaction {
    pub fn new(description: &str, operations: Vec<WorkspaceOperation>) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            timestamp_utc: Utc::now().timestamp_millis(),
            description: description.to_string(),
            operations,
        }
    }

    pub fn invert(&self) -> OperationTransaction {
        let inverted_ops: Vec<WorkspaceOperation> =
            self.operations.iter().rev().map(|op| op.invert()).collect();

        OperationTransaction {
            id: Uuid::new_v4().to_string(),
            timestamp_utc: Utc::now().timestamp_millis(),
            description: format!("Undo: {}", self.description),
            operations: inverted_ops,
        }
    }
}

/// Transactional Undo/Redo stack manager using shadow-document commit semantics
pub struct OperationManager {
    undo_stack: Vec<OperationTransaction>,
    redo_stack: Vec<OperationTransaction>,
    max_history_depth: usize,
}

impl OperationManager {
    pub fn new(max_history_depth: usize) -> Self {
        Self {
            undo_stack: Vec::new(),
            redo_stack: Vec::new(),
            max_history_depth,
        }
    }

    /// Execute a transaction atomically on a shadow document and record it to undo stack
    pub fn commit_transaction(
        &mut self,
        doc: &mut WorkspaceDocument,
        tx: OperationTransaction,
    ) -> Result<(), OperationError> {
        let mut shadow = doc.clone();
        for op in &tx.operations {
            op.apply_to_draft(&mut shadow)?;
        }

        // Increment version only once for the entire batch after all operations succeed
        shadow.version += 1;
        shadow.modified_at = Utc::now().timestamp_millis();
        *doc = shadow;

        self.undo_stack.push(tx);
        if self.undo_stack.len() > self.max_history_depth {
            self.undo_stack.remove(0);
        }
        self.redo_stack.clear();

        Ok(())
    }

    /// Undo the most recent transaction atomically
    pub fn undo(&mut self, doc: &mut WorkspaceDocument) -> Result<String, OperationError> {
        let tx = self
            .undo_stack
            .pop()
            .ok_or(OperationError::UndoStackEmpty)?;
        let inverted_tx = tx.invert();

        let mut shadow = doc.clone();
        for op in &inverted_tx.operations {
            op.apply_to_draft(&mut shadow)?;
        }

        shadow.version += 1;
        shadow.modified_at = Utc::now().timestamp_millis();
        *doc = shadow;

        let desc = tx.description.clone();
        self.redo_stack.push(tx);
        Ok(desc)
    }

    /// Redo the previously undone transaction atomically
    pub fn redo(&mut self, doc: &mut WorkspaceDocument) -> Result<String, OperationError> {
        let tx = self
            .redo_stack
            .pop()
            .ok_or(OperationError::RedoStackEmpty)?;

        let mut shadow = doc.clone();
        for op in &tx.operations {
            op.apply_to_draft(&mut shadow)?;
        }

        shadow.version += 1;
        shadow.modified_at = Utc::now().timestamp_millis();
        *doc = shadow;

        let desc = tx.description.clone();
        self.undo_stack.push(tx);
        Ok(desc)
    }

    pub fn can_undo(&self) -> bool {
        !self.undo_stack.is_empty()
    }

    pub fn can_redo(&self) -> bool {
        !self.redo_stack.is_empty()
    }
}
