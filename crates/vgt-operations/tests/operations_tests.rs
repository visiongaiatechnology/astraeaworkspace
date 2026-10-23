use std::collections::HashMap;
use vgt_object_model::{
    CellValue, DocumentKind, Paragraph, TableObject, TextBlockObject, TextSpan, WorkspaceDocument,
    WorkspaceObject,
};
use vgt_operations::{OperationError, OperationManager, OperationTransaction, WorkspaceOperation};

#[test]
fn test_text_operation_and_undo() {
    let mut doc = WorkspaceDocument::new("Doc 1", DocumentKind::Writer);
    let block_id = "block-1".to_string();
    doc.add_root_object(WorkspaceObject::TextBlock(TextBlockObject {
        id: block_id.clone(),
        paragraphs: vec![Paragraph {
            id: "p1".into(),
            style: Default::default(),
            spans: vec![TextSpan {
                text: "Sovereign".into(),
                ..Default::default()
            }],
        }],
    }));

    let mut manager = OperationManager::new(50);

    // Apply: "Sovereign" -> "Sovereign Productivity"
    let tx = OperationTransaction::new(
        "Append Productivity",
        vec![WorkspaceOperation::InsertText {
            block_id: block_id.clone(),
            paragraph_idx: 0,
            text: " Productivity".into(),
        }],
    );

    manager.commit_transaction(&mut doc, tx).unwrap();

    if let WorkspaceObject::TextBlock(tb) = doc.get_object(&block_id).unwrap() {
        assert_eq!(tb.paragraphs[0].spans[0].text, "Sovereign Productivity");
    }

    // Undo
    manager.undo(&mut doc).unwrap();
    if let WorkspaceObject::TextBlock(tb) = doc.get_object(&block_id).unwrap() {
        assert_eq!(tb.paragraphs[0].spans[0].text, "Sovereign");
    }

    // Redo
    manager.redo(&mut doc).unwrap();
    if let WorkspaceObject::TextBlock(tb) = doc.get_object(&block_id).unwrap() {
        assert_eq!(tb.paragraphs[0].spans[0].text, "Sovereign Productivity");
    }
}

#[test]
fn test_cell_operation_and_undo() {
    let mut doc = WorkspaceDocument::new("Sheet 1", DocumentKind::Grid);
    let table_id = "tbl-1".to_string();
    doc.add_root_object(WorkspaceObject::Table(TableObject {
        id: table_id.clone(),
        rows: 10,
        cols: 10,
        cells: HashMap::new(),
    }));

    let mut manager = OperationManager::new(50);

    // Set A1 = 500
    let tx = OperationTransaction::new(
        "Set A1",
        vec![WorkspaceOperation::SetCell {
            table_id: table_id.clone(),
            coord: "A1".into(),
            old_value: CellValue::Empty,
            new_value: CellValue::Number(500.0),
            old_formula: None,
            new_formula: None,
        }],
    );

    manager.commit_transaction(&mut doc, tx).unwrap();
    if let WorkspaceObject::Table(tbl) = doc.get_object(&table_id).unwrap() {
        assert_eq!(tbl.cells.get("A1").unwrap().value, CellValue::Number(500.0));
    }

    // Undo sets it back to Empty
    manager.undo(&mut doc).unwrap();
    if let WorkspaceObject::Table(tbl) = doc.get_object(&table_id).unwrap() {
        assert_eq!(tbl.cells.get("A1").unwrap().value, CellValue::Empty);
    }
}

#[test]
fn test_transaction_atomicity_and_rollback_on_failure() {
    let mut doc = WorkspaceDocument::new("Doc Atomicity", DocumentKind::Writer);
    let block_id = "block-1".to_string();
    doc.add_root_object(WorkspaceObject::TextBlock(TextBlockObject {
        id: block_id.clone(),
        paragraphs: vec![Paragraph {
            id: "p1".into(),
            style: Default::default(),
            spans: vec![TextSpan {
                text: "Original".into(),
                ..Default::default()
            }],
        }],
    }));

    let initial_doc = doc.clone();
    let initial_version = doc.version;
    let mut manager = OperationManager::new(50);

    // Transaction with 2 operations: 1st valid, 2nd targets non-existent object!
    let tx = OperationTransaction::new(
        "Failing batch",
        vec![
            WorkspaceOperation::InsertText {
                block_id: block_id.clone(),
                paragraph_idx: 0,
                text: " Modified".into(),
            },
            WorkspaceOperation::InsertText {
                block_id: "non-existent-object-999".into(),
                paragraph_idx: 0,
                text: " Will Fail".into(),
            },
        ],
    );

    let res = manager.commit_transaction(&mut doc, tx);
    assert!(matches!(res, Err(OperationError::ObjectNotFound(_))));

    // CRITICAL DOCTRINE: Document must remain 100% identical to initial state!
    assert_eq!(
        doc, initial_doc,
        "Atomic rollback invariant: document state corrupted by partial commit!"
    );
    assert_eq!(
        doc.version, initial_version,
        "Document version must not increment on aborted transaction!"
    );
}

#[test]
fn writer_data_field_operation_is_reversible_and_conflict_aware() {
    let mut doc = WorkspaceDocument::new("Writer Data", DocumentKind::Writer);
    doc.writer_data = Some(serde_json::json!({
        "comments": [{"id": "c1", "text": "before"}],
        "tables": [{"id": "t1"}]
    }));

    let operation = WorkspaceOperation::SetWriterDataField {
        field: "comments".into(),
        before: Some(serde_json::json!([{"id": "c1", "text": "before"}])),
        after: Some(serde_json::json!([{"id": "c1", "text": "after"}])),
    };
    operation.apply_to_draft(&mut doc).unwrap();
    assert_eq!(
        doc.writer_data.as_ref().unwrap()["comments"],
        serde_json::json!([{"id": "c1", "text": "after"}])
    );
    assert_eq!(doc.writer_data.as_ref().unwrap()["tables"], serde_json::json!([{"id": "t1"}]));

    operation.invert().apply_to_draft(&mut doc).unwrap();
    assert_eq!(
        doc.writer_data.as_ref().unwrap()["comments"],
        serde_json::json!([{"id": "c1", "text": "before"}])
    );

    doc.writer_data.as_mut().unwrap()["comments"] = serde_json::json!([{"id": "c1", "text": "concurrent"}]);
    let error = operation.apply_to_draft(&mut doc).unwrap_err();
    assert!(matches!(error, OperationError::Conflict(_)));
}

#[test]
fn removing_last_writer_data_field_clears_empty_payload() {
    let mut doc = WorkspaceDocument::new("Writer Data", DocumentKind::Writer);
    doc.writer_data = Some(serde_json::json!({"currentTheme": "Midnight"}));
    WorkspaceOperation::SetWriterDataField {
        field: "currentTheme".into(),
        before: Some(serde_json::json!("Midnight")),
        after: None,
    }
    .apply_to_draft(&mut doc)
    .unwrap();
    assert_eq!(doc.writer_data, None);
}

#[test]
fn present_slide_operations_are_reversible_and_conflict_aware() {
    let mut doc = WorkspaceDocument::new("Present Data", DocumentKind::Present);
    doc.present_data = Some(serde_json::json!({
        "slides": [
            {"id": "s1", "title": "One", "layout": "blank"},
            {"id": "s2", "title": "Two", "layout": "blank"}
        ],
        "themeId": "dark"
    }));

    let before = serde_json::json!({"id": "s1", "title": "One", "layout": "blank"});
    let after = serde_json::json!({"id": "s1", "title": "One revised", "layout": "blank"});
    let replace = WorkspaceOperation::ReplacePresentSlide {
        slide_id: "s1".into(),
        before: before.clone(),
        after: after.clone(),
    };
    replace.apply_to_draft(&mut doc).unwrap();
    assert_eq!(doc.present_data.as_ref().unwrap()["slides"][0], after);
    replace.invert().apply_to_draft(&mut doc).unwrap();
    assert_eq!(doc.present_data.as_ref().unwrap()["slides"][0], before);

    let insert = WorkspaceOperation::InsertPresentSlide {
        index: 1,
        slide: serde_json::json!({"id": "s3", "title": "Three", "layout": "blank"}),
    };
    insert.apply_to_draft(&mut doc).unwrap();
    assert_eq!(doc.present_data.as_ref().unwrap()["slides"][1]["id"], "s3");
    insert.invert().apply_to_draft(&mut doc).unwrap();
    assert_eq!(doc.present_data.as_ref().unwrap()["slides"].as_array().unwrap().len(), 2);

    let move_slide = WorkspaceOperation::MovePresentSlide {
        slide_id: "s2".into(),
        from_index: 1,
        to_index: 0,
    };
    move_slide.apply_to_draft(&mut doc).unwrap();
    assert_eq!(doc.present_data.as_ref().unwrap()["slides"][0]["id"], "s2");
    move_slide.invert().apply_to_draft(&mut doc).unwrap();
    assert_eq!(doc.present_data.as_ref().unwrap()["slides"][1]["id"], "s2");

    doc.present_data.as_mut().unwrap()["slides"][0]["title"] = serde_json::json!("Concurrent");
    let error = replace.apply_to_draft(&mut doc).unwrap_err();
    assert!(matches!(error, OperationError::Conflict(_)));
}

#[test]
fn present_data_field_operation_is_reversible_and_rejects_slides_field() {
    let mut doc = WorkspaceDocument::new("Present Data", DocumentKind::Present);
    doc.present_data = Some(serde_json::json!({
        "slides": [{"id": "s1", "title": "One", "layout": "blank"}],
        "themeId": "dark"
    }));
    let operation = WorkspaceOperation::SetPresentDataField {
        field: "themeId".into(),
        before: Some(serde_json::json!("dark")),
        after: Some(serde_json::json!("light")),
    };
    operation.apply_to_draft(&mut doc).unwrap();
    assert_eq!(doc.present_data.as_ref().unwrap()["themeId"], "light");
    operation.invert().apply_to_draft(&mut doc).unwrap();
    assert_eq!(doc.present_data.as_ref().unwrap()["themeId"], "dark");

    let forbidden = WorkspaceOperation::SetPresentDataField {
        field: "slides".into(),
        before: None,
        after: None,
    };
    assert!(matches!(forbidden.apply_to_draft(&mut doc), Err(OperationError::InvalidTarget(_))));
}

/// The document path guard is `WriterDocumentModel::validate()`, called by
/// `WorkspaceDocument::set_writer_model`. The operation path must not accept a payload that the
/// document path rejects.
#[test]
fn set_writer_data_rejects_a_payload_the_typed_writer_guard_rejects() {
    use vgt_object_model::{WriterDocumentModel, WriterModelError};

    // Custom paper with a zero width and seven columns: serde deserializes this happily, the
    // typed guard does not.
    let invalid = serde_json::json!({
        "pageSetup": {
            "paperSize": "Custom",
            "customWidthMm": 0,
            "customHeightMm": 297,
            "columns": 7
        }
    });

    // Baseline: the typed document path rejects this exact payload with this exact error.
    let model: WriterDocumentModel =
        serde_json::from_value(invalid.clone()).expect("typed guard input must deserialize");
    assert!(
        matches!(
            model.validate(),
            Err(WriterModelError::InvalidPageDimensions)
        ),
        "test premise: the document path guard rejects this payload"
    );

    let mut doc = WorkspaceDocument::new("Writer Data Guard", DocumentKind::Writer);
    let operation = WorkspaceOperation::SetWriterData {
        before: None,
        after: Some(invalid),
    };

    let result = operation.apply_to_draft(&mut doc);
    assert!(
        result.is_err(),
        "operation path accepted a writer_data payload the document path rejects; \
         persisted writer_data = {:?}",
        doc.writer_data
    );
    assert_eq!(
        doc.writer_data, None,
        "a rejected payload must not reach persistence"
    );
}

/// Positive control: the guard must not reject valid payloads, and must not canonicalize them.
#[test]
fn set_writer_data_still_accepts_a_valid_forward_compatible_payload_verbatim() {
    let mut doc = WorkspaceDocument::new("Writer Data Valid", DocumentKind::Writer);
    let valid = serde_json::json!({
        "pageSetup": {"paperSize": "A4"},
        "futureWriterField": {"preserved": true}
    });
    let operation = WorkspaceOperation::SetWriterData {
        before: None,
        after: Some(valid.clone()),
    };

    operation
        .apply_to_draft(&mut doc)
        .expect("a valid writer payload must still apply");
    assert_eq!(
        doc.writer_data,
        Some(valid.clone()),
        "the guard validates; it must not rewrite the stored payload"
    );

    // Clearing the payload stays legal: the guard only constrains payloads that are written.
    let clear = WorkspaceOperation::SetWriterData {
        before: Some(valid),
        after: None,
    };
    clear
        .apply_to_draft(&mut doc)
        .expect("clearing writer_data must stay legal");
    assert_eq!(doc.writer_data, None);
}

/// The guard is the typed path itself: a payload that cannot even be read as a
/// `WriterDocumentModel` is rejected as well, because `WorkspaceDocument::writer_model()` fails on
/// the same bytes. Nothing that the document path can represent is refused.
#[test]
fn set_writer_data_rejects_a_payload_the_typed_writer_model_cannot_read() {
    let mut doc = WorkspaceDocument::new("Writer Data Unreadable", DocumentKind::Writer);

    // `pageSetup` is present but its required `paperSize` is missing.
    let unreadable = serde_json::json!({"pageSetup": {"columns": 7}});
    assert!(
        serde_json::from_value::<vgt_object_model::WriterDocumentModel>(unreadable.clone()).is_err(),
        "test premise: the document path cannot read this payload"
    );

    let operation = WorkspaceOperation::SetWriterData {
        before: None,
        after: Some(unreadable),
    };
    assert!(matches!(
        operation.apply_to_draft(&mut doc),
        Err(OperationError::InvalidTarget(_))
    ));
    assert_eq!(doc.writer_data, None);
}
