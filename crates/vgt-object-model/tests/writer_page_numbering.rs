// STATUS: DIAMANT VGT SUPREME — Canonical Writer page-number validation and persistence
use serde_json::json;
use vgt_object_model::{WriterDocumentModel, WriterModelError};

fn model(value: serde_json::Value) -> WriterDocumentModel {
    serde_json::from_value(value).expect("test Writer model must deserialize")
}

#[test]
fn round_trips_document_and_section_page_numbering() {
    let source = json!({
        "pageSetup": {
            "paperSize": "A4",
            "showPageNumbers": true,
            "pageNumberFormat": "roman-lower",
            "pageNumberPosition": "header-center",
            "pageNumberStart": 7,
            "chapterNumbering": true
        },
        "sections": [{
            "id": "chapter-two",
            "startParagraphId": "paragraph-two",
            "pageSetup": {
                "paperSize": "A4",
                "showPageNumbers": true,
                "pageNumberFormat": "alpha-upper",
                "pageNumberPosition": "footer-left"
            },
            "restartPageNumberAt": 3
        }]
    });
    let writer = model(source.clone());
    writer.validate().expect("valid page numbering must pass");
    let encoded = serde_json::to_value(writer).expect("Writer model must serialize");
    assert_eq!(encoded["pageSetup"]["pageNumberStart"], 7);
    assert_eq!(encoded["sections"][0]["restartPageNumberAt"], 3);
}

#[test]
fn rejects_unknown_format_position_and_out_of_range_starts() {
    for invalid_setup in [
        json!({"paperSize": "A4", "pageNumberFormat": "binary"}),
        json!({"paperSize": "A4", "pageNumberPosition": "margin-outside"}),
        json!({"paperSize": "A4", "pageNumberStart": 0}),
        json!({"paperSize": "A4", "pageNumberStart": 10_000}),
    ] {
        assert!(matches!(
            model(json!({"pageSetup": invalid_setup})).validate(),
            Err(WriterModelError::InvalidPageNumbering)
        ));
    }

    let invalid_section = model(json!({
        "sections": [{
            "id": "section",
            "startParagraphId": "paragraph",
            "pageSetup": {"paperSize": "A4"},
            "restartPageNumberAt": 0
        }]
    }));
    assert!(matches!(
        invalid_section.validate(),
        Err(WriterModelError::InvalidPageNumbering)
    ));
}
