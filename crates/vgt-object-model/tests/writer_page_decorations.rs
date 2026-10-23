// STATUS: DIAMANT VGT SUPREME — Native Writer page-decoration validation
use serde_json::json;
use vgt_object_model::{WriterDocumentModel, WriterModelError, WriterPageSetupConfig};

fn setup(value: serde_json::Value) -> WriterPageSetupConfig {
    serde_json::from_value(value).expect("test setup must deserialize")
}

#[test]
fn round_trips_bounded_background_border_and_watermark() {
    let page_setup = setup(json!({
        "paperSize": "A4",
        "backgroundColor": "#E2E8F0",
        "pageBorders": {
            "style": "double",
            "widthPt": 2.0,
            "color": "#1E293B",
            "paddingMm": 4.0
        },
        "watermark": {
            "enabled": true,
            "text": "CONFIDENTIAL",
            "opacity": 0.12,
            "rotationDeg": -35.0,
            "color": "#64748B"
        }
    }));
    let model = WriterDocumentModel {
        page_setup: Some(page_setup),
        ..Default::default()
    };

    model.validate().expect("bounded decorations must validate");
    let encoded = serde_json::to_string(&model).expect("model must serialize");
    let restored: WriterDocumentModel =
        serde_json::from_str(&encoded).expect("model must deserialize");
    assert_eq!(model, restored);
}

#[test]
fn rejects_hostile_or_non_finite_page_decorations() {
    let invalid = [
        json!({ "paperSize": "A4", "backgroundColor": "javascript:red" }),
        json!({ "paperSize": "A4", "pageBorders": { "style": "solid", "widthPt": 40.0, "color": "#000000", "paddingMm": 1.0 } }),
        json!({ "paperSize": "A4", "pageBorders": { "style": "groove", "widthPt": 1.0, "color": "#000000", "paddingMm": 1.0 } }),
        json!({ "paperSize": "A4", "watermark": { "enabled": true, "text": "", "opacity": 0.1, "rotationDeg": 0.0, "color": "#000000" } }),
        json!({ "paperSize": "A4", "watermark": { "enabled": true, "text": "x", "opacity": 0.9, "rotationDeg": 0.0, "color": "#000000" } }),
    ];

    for value in invalid {
        let model = WriterDocumentModel {
            page_setup: Some(setup(value)),
            ..Default::default()
        };
        assert!(matches!(
            model.validate(),
            Err(WriterModelError::InvalidPageDecorations)
        ));
    }
}
