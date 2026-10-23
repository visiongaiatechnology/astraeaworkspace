use serde_json::json;
use vgt_object_model::{
    DocumentKind, WorkspaceDocument, WriterDocumentModel, WriterModelError, WriterPaperSize,
};

#[test]
fn preserves_all_application_payloads_and_future_fields() {
    let input = json!({
        "schema_version": 1,
        "id": "wire-test",
        "title": "Roundtrip",
        "kind": "Grid",
        "created_at": 1,
        "modified_at": 2,
        "version": 7,
        "theme_id": "default",
        "root_object_ids": [],
        "objects": {},
        "gridData": {
            "activeSheetId": "sheet-1",
            "sheets": [{
                "id": "sheet-1",
                "name": "Sheet 1",
                "tableObjectId": "table-1",
                "printSettings": {"paperSize": "A3", "orientation": "landscape"},
                "futureGridField": {"mustSurvive": true}
            }]
        },
        "writerData": {"pageSetup": {"paperSize": "A4"}, "futureWriterField": 42},
        "presentData": {"slides": [{"id": "s1", "animations": [{"id": "a1"}]}]},
        "databaseData": {"tables": [], "savedViews": [{"id": "view-1"}]},
        "whiteboardData": {"items": [{"id": "connector", "fromId": "a", "toId": "b"}]},
        "futureTopLevelPayload": {"alpha": [1,2,3]}
    });

    let doc: WorkspaceDocument = serde_json::from_value(input.clone()).expect("deserialize WOM");
    assert_eq!(doc.kind, DocumentKind::Grid);

    let output = serde_json::to_value(doc).expect("serialize WOM");
    assert_eq!(output["gridData"], input["gridData"]);
    assert_eq!(output["writerData"], input["writerData"]);
    assert_eq!(output["presentData"], input["presentData"]);
    assert_eq!(output["databaseData"], input["databaseData"]);
    assert_eq!(output["whiteboardData"], input["whiteboardData"]);
    assert_eq!(
        output["futureTopLevelPayload"],
        input["futureTopLevelPayload"]
    );
}

#[test]
fn preserves_premium_wire_kind_without_open_core_format() {
    let doc = WorkspaceDocument::new("Secure Exchange", DocumentKind::GaiaCom);
    // GaiaCom is Premium-only: it has no Open Core format, so None is the honest answer.
    assert_eq!(doc.kind.file_extension(), None);
    let value = serde_json::to_value(doc).expect("serialize GaiaCom document");
    assert_eq!(value["kind"], "GaiaCom");
}

#[test]
fn writer_payload_has_a_typed_forward_compatible_access_path() {
    let input = json!({
        "pageSetup": {
            "paperSize": "A4",
            "orientation": "landscape",
            "margins": "mirrored",
            "columns": 2,
            "columnGapMm": 8.5,
            "paperColor": "cream",
            "showPageNumbers": true,
            "headerText": "Strategy",
            "footerText": "Confidential"
        },
        "tables": [],
        "sections": [],
        "futureWriterField": {"preserved": true}
    });
    let mut document = WorkspaceDocument::new("Typed Writer", DocumentKind::Writer);
    document.writer_data = Some(input.clone());

    let model = document
        .writer_model()
        .expect("parse typed Writer model")
        .expect("Writer payload");
    assert_eq!(
        model.page_setup.as_ref().map(|setup| setup.paper_size),
        Some(WriterPaperSize::A4)
    );
    assert_eq!(
        model.extensions["futureWriterField"],
        input["futureWriterField"]
    );

    document
        .set_writer_model(model)
        .expect("persist typed Writer model");
    let output = document.writer_data.as_ref().expect("Writer payload");
    assert_eq!(
        output["pageSetup"]["paperSize"],
        input["pageSetup"]["paperSize"]
    );
    assert_eq!(
        output["pageSetup"]["columns"],
        input["pageSetup"]["columns"]
    );
    assert_eq!(output["futureWriterField"], input["futureWriterField"]);
}

#[test]
fn writer_payload_rejects_invalid_layout_boundaries() {
    let model: WriterDocumentModel = serde_json::from_value(json!({
        "pageSetup": {
            "paperSize": "Custom",
            "customWidthMm": 0,
            "customHeightMm": 297,
            "columns": 7
        }
    }))
    .expect("deserialize invalid geometry for validation");

    assert!(matches!(
        model.validate(),
        Err(WriterModelError::InvalidPageDimensions)
    ));
}

#[test]
fn writer_payload_roundtrips_typed_autocorrect_configuration() {
    let input = json!({
        "autoCorrect": {
            "enabled": true,
            "smartQuotes": true,
            "autoFormat": true,
            "locale": "de-DE",
            "replacements": [{
                "id": "mfg-rule",
                "trigger": "mfg",
                "replacement": "Mit freundlichen Grüßen",
                "caseSensitive": false
            }]
        }
    });
    let model: WriterDocumentModel = serde_json::from_value(input.clone())
        .expect("deserialize Writer AutoCorrect configuration");

    model
        .validate()
        .expect("validate Writer AutoCorrect configuration");
    let output = serde_json::to_value(model).expect("serialize Writer AutoCorrect configuration");
    assert_eq!(output["autoCorrect"], input["autoCorrect"]);
}

#[test]
fn writer_payload_rejects_hostile_autocorrect_boundaries() {
    let oversized_rules = (0..257)
        .map(|index| {
            json!({
                "id": format!("rule-{index}"),
                "trigger": format!("t{index}"),
                "replacement": "safe",
                "caseSensitive": false
            })
        })
        .collect::<Vec<_>>();
    let oversized: WriterDocumentModel = serde_json::from_value(json!({
        "autoCorrect": {
            "enabled": true,
            "smartQuotes": true,
            "autoFormat": true,
            "locale": "de-DE",
            "replacements": oversized_rules
        }
    }))
    .expect("deserialize bounded rules");
    assert!(matches!(
        oversized.validate(),
        Err(WriterModelError::InvalidAutoCorrect)
    ));

    let control_character: WriterDocumentModel = serde_json::from_value(json!({
        "autoCorrect": {
            "enabled": true,
            "smartQuotes": true,
            "autoFormat": true,
            "locale": "en-US",
            "replacements": [{
                "id": "control",
                "trigger": "bad\u{0}",
                "replacement": "safe",
                "caseSensitive": true
            }]
        }
    }))
    .expect("deserialize control-character rule");
    assert!(matches!(
        control_character.validate(),
        Err(WriterModelError::InvalidAutoCorrect)
    ));
}

#[test]
fn sec024_preserves_future_payload_canonical_bytes_while_known_field_changes() {
    let input = json!({
        "schema_version": 3,
        "id": "sec024-doc",
        "title": "Future document",
        "kind": "Grid",
        "created_at": 100,
        "modified_at": 200,
        "version": 9,
        "theme_id": "vgt-default-dark",
        "root_object_ids": ["future-object"],
        "objects": {
            "future-object": {
                "type": "FutureQuantumCanvas",
                "data": {
                    "id": "future-object",
                    "futureMode": "coherent",
                    "coefficients": [1, 2, 3, 5, 8],
                    "opaque": {"z": "Ω", "a": [true, null, "ß"]}
                }
            }
        },
        "gridData": {
            "activeSheetId": "sheet-1",
            "futureGridField": {"mustSurvive": true, "order": [3,2,1]}
        },
        "futureTopLevelPayload": {
            "codec": "v2.1-private",
            "bytes": "AAECAwQF",
            "nested": {"last": 99, "first": "preserve-me"}
        }
    });

    let expected_top = serde_json::to_vec(&input["futureTopLevelPayload"])
        .expect("serialize future top-level fixture");
    let expected_grid = serde_json::to_vec(&input["gridData"]["futureGridField"])
        .expect("serialize future grid fixture");
    let expected_object = serde_json::to_vec(&input["objects"]["future-object"])
        .expect("serialize future object fixture");

    let mut document: WorkspaceDocument =
        serde_json::from_value(input).expect("SEC024 deserialize future WOM");
    document.title = "Known v2 field changed".to_string();
    document.version += 1;

    let output = serde_json::to_value(document).expect("SEC024 serialize future WOM");
    assert_eq!(output["title"], "Known v2 field changed");
    assert_eq!(
        serde_json::to_vec(&output["futureTopLevelPayload"])
            .expect("serialize preserved future top-level"),
        expected_top
    );
    assert_eq!(
        serde_json::to_vec(&output["gridData"]["futureGridField"])
            .expect("serialize preserved future grid field"),
        expected_grid
    );
    assert_eq!(
        serde_json::to_vec(&output["objects"]["future-object"])
            .expect("serialize preserved future object"),
        expected_object
    );
    println!("SEC024_RUST_OPAQUE_FUTURE_PRESERVATION_PASS top=true nested=true object=true");
}

#[test]
fn whiteboard_legacy_shape_type_payloads_decode_and_roundtrip_canonically() {
    let input = json!({
        "schema_version": 2,
        "id": "whiteboard-wire-compatibility",
        "title": "System Architecture",
        "kind": "Whiteboard",
        "created_at": 1,
        "modified_at": 2,
        "version": 3,
        "theme_id": "default",
        "root_object_ids": ["start", "note", "label"],
        "objects": {
            "start": {
                "type": "Shape",
                "data": {
                    "id": "start",
                    "shape_type": "callout",
                    "x": 120,
                    "y": 120,
                    "width": 170,
                    "height": 60,
                    "rotation": 0,
                    "fill": "#0f172a",
                    "stroke": "#10b981",
                    "stroke_width": 2,
                    "text": "User Input"
                }
            },
            "note": {
                "type": "Shape",
                "data": {
                    "id": "note",
                    "shape_type": "rectangle",
                    "x": 120,
                    "y": 260,
                    "width": 190,
                    "height": 140,
                    "rotation": 0,
                    "fill": "#fef9c3",
                    "stroke": "#fde047",
                    "stroke_width": 1,
                    "text": "Encrypted local save"
                }
            },
            "label": {
                "type": "Shape",
                "data": {
                    "id": "label",
                    "shape_type": "text",
                    "x": 320,
                    "y": 270,
                    "width": 160,
                    "height": 48,
                    "rotation": 0,
                    "fill": "transparent",
                    "stroke": "transparent",
                    "stroke_width": 0,
                    "text": "Wire compatibility"
                }
            }
        },
        "whiteboardData": {
            "items": [
                {"id": "start", "type": "terminal", "text": "User Input"},
                {"id": "label", "type": "text", "text": "Wire compatibility"}
            ]
        }
    });

    let document: WorkspaceDocument =
        serde_json::from_value(input.clone()).expect("deserialize legacy Whiteboard WOM shapes");
    assert_eq!(document.kind, DocumentKind::Whiteboard);

    let output = serde_json::to_value(document).expect("serialize canonical Whiteboard WOM shapes");
    assert_eq!(output["objects"]["start"]["data"]["kind"], "callout");
    assert_eq!(output["objects"]["start"]["data"]["text"], "User Input");
    assert_eq!(output["objects"]["note"]["data"]["kind"], "rectangle");
    assert_eq!(output["objects"]["label"]["data"]["kind"], "text");
    assert!(output["objects"]["start"]["data"]
        .get("shape_type")
        .is_none());
    assert_eq!(output["whiteboardData"], input["whiteboardData"]);
}
