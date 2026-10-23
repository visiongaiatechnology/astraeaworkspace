// STATUS: PLATIN — Canonical Writer first/default/even header and footer validation
use serde_json::json;
use vgt_object_model::{WriterDocumentModel, WriterModelError, WriterPageSetupConfig};

fn setup(value: serde_json::Value) -> WriterPageSetupConfig {
    serde_json::from_value(value).expect("test setup must deserialize")
}

#[test]
fn round_trips_independent_first_even_and_default_content() {
    let model = WriterDocumentModel {
        page_setup: Some(setup(json!({
            "paperSize": "A4",
            "headerText": "ODD HEADER",
            "footerText": "ODD FOOTER",
            "firstPageDifferent": true,
            "firstPageHeaderText": "FIRST HEADER",
            "firstPageFooterText": "FIRST FOOTER",
            "oddEvenDifferent": true,
            "evenPageHeaderText": "EVEN HEADER",
            "evenPageFooterText": "EVEN FOOTER"
        }))),
        ..Default::default()
    };

    model
        .validate()
        .expect("bounded header/footer data must validate");
    let encoded = serde_json::to_string(&model).expect("model must serialize");
    let restored: WriterDocumentModel =
        serde_json::from_str(&encoded).expect("model must deserialize");
    assert_eq!(restored, model);
}

#[test]
fn rejects_oversized_header_or_footer_content() {
    let model = WriterDocumentModel {
        page_setup: Some(setup(json!({
            "paperSize": "A4",
            "headerText": "x".repeat(4_097)
        }))),
        ..Default::default()
    };

    assert!(matches!(
        model.validate(),
        Err(WriterModelError::InvalidHeaderFooter)
    ));
}
