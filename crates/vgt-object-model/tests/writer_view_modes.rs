// STATUS: DIAMANT VGT SUPREME — Canonical Writer view-mode wire contract
use serde_json::json;
use vgt_object_model::{WriterDocumentModel, WriterViewMode};

#[test]
fn round_trips_every_supported_writer_view_mode() {
    let cases = [
        ("print", WriterViewMode::Print),
        ("continuous", WriterViewMode::Continuous),
        ("draft", WriterViewMode::Draft),
        ("outline", WriterViewMode::Outline),
        ("reading", WriterViewMode::Reading),
        ("focus", WriterViewMode::Focus),
    ];

    for (wire_value, expected) in cases {
        let model: WriterDocumentModel = serde_json::from_value(json!({
            "viewMode": wire_value
        }))
        .expect("supported Writer view mode must deserialize");
        assert_eq!(model.view_mode, Some(expected));

        let encoded = serde_json::to_value(model).expect("Writer view mode must serialize");
        assert_eq!(encoded["viewMode"], wire_value);
    }
}

#[test]
fn rejects_unknown_writer_view_mode() {
    let result = serde_json::from_value::<WriterDocumentModel>(json!({
        "viewMode": "presentation"
    }));
    assert!(result.is_err());
}
