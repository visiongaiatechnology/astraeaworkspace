// STATUS: PLATIN — Writer custom, gutter and mirrored-margin persistence boundaries
use vgt_object_model::{WriterDocumentModel, WriterModelError};

fn deserialize_margin_model(margins: &str, margin_json: serde_json::Value) -> WriterDocumentModel {
    serde_json::from_value(serde_json::json!({
        "pageSetup": {
            "paperSize": "A4",
            "orientation": "portrait",
            "margins": margins,
            "customMargins": margin_json,
            "mirroredMargins": margins == "mirrored"
        }
    }))
    .expect("margin payload must deserialize")
}

#[test]
fn mirrored_margins_and_binding_gutter_round_trip_losslessly() {
    let model = deserialize_margin_model(
        "mirrored",
        serde_json::json!({
            "top": 18.5,
            "bottom": 22.25,
            "left": 32.75,
            "right": 17.5,
            "gutter": 9.25
        }),
    );

    model
        .validate()
        .expect("bounded mirrored margins must validate");
    let encoded = serde_json::to_vec(&model).expect("margin model must serialize");
    let restored: WriterDocumentModel =
        serde_json::from_slice(&encoded).expect("margin model must deserialize again");

    assert_eq!(restored, model);
}

#[test]
fn rejects_margins_that_leave_no_usable_page_width() {
    let model = deserialize_margin_model(
        "custom",
        serde_json::json!({
            "top": 20,
            "bottom": 20,
            "left": 100,
            "right": 95,
            "gutter": 10
        }),
    );

    assert!(matches!(
        model.validate(),
        Err(WriterModelError::InvalidMargins)
    ));
}

#[test]
fn ignores_inactive_custom_values_after_switching_back_to_a_preset() {
    let model = deserialize_margin_model(
        "normal",
        serde_json::json!({
            "top": 100,
            "bottom": 100,
            "left": 100,
            "right": 100,
            "gutter": 0
        }),
    );

    model
        .validate()
        .expect("inactive legacy custom margins must not override the selected preset");
}
