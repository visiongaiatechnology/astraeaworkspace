// STATUS: PLATIN — Large Writer section-model persistence verification
use vgt_object_model::WriterDocumentModel;

#[test]
fn round_trips_thousands_of_writer_sections_without_an_artificial_limit() {
    let section_count = 2_048;
    let sections = (0..section_count)
        .map(|index| {
            serde_json::json!({
                "id": format!("section-{index}"),
                "startParagraphId": format!("paragraph-{index}"),
                "pageSetup": {
                    "paperSize": if index % 2 == 0 { "A4" } else { "Letter" },
                    "orientation": if index % 3 == 0 { "landscape" } else { "portrait" }
                },
                "restartPageNumberAt": index + 1
            })
        })
        .collect::<Vec<_>>();
    let model: WriterDocumentModel = serde_json::from_value(serde_json::json!({
        "sections": sections
    }))
    .expect("large section collection must deserialize");

    model
        .validate()
        .expect("all section page configurations must validate");
    let encoded = serde_json::to_vec(&model).expect("large section collection must serialize");
    let restored: WriterDocumentModel =
        serde_json::from_slice(&encoded).expect("large section collection must deserialize again");

    assert_eq!(restored.sections.len(), section_count);
    assert_eq!(
        restored.sections.first().map(|section| section.id.as_str()),
        Some("section-0")
    );
    assert_eq!(
        restored.sections.last().map(|section| section.id.as_str()),
        Some("section-2047")
    );
    assert_eq!(restored, model);
}

#[test]
fn round_trips_every_writer_section_break_type_and_defaults_legacy_documents() {
    for break_type in ["next-page", "continuous", "even-page", "odd-page"] {
        let model: WriterDocumentModel = serde_json::from_value(serde_json::json!({
            "sections": [{
                "id": format!("section-{break_type}"),
                "startParagraphId": "paragraph-2",
                "pageSetup": {
                    "paperSize": "A4",
                    "orientation": "portrait"
                },
                "breakType": break_type
            }]
        }))
        .expect("typed section break must deserialize");
        let restored: WriterDocumentModel = serde_json::from_slice(
            &serde_json::to_vec(&model).expect("typed section break must serialize"),
        )
        .expect("typed section break must deserialize again");
        assert_eq!(restored, model);
    }

    let legacy: WriterDocumentModel = serde_json::from_value(serde_json::json!({
        "sections": [{
            "id": "legacy-section",
            "startParagraphId": "paragraph-2",
            "pageSetup": {
                "paperSize": "A4",
                "orientation": "portrait"
            }
        }]
    }))
    .expect("legacy section without breakType must deserialize");
    let encoded = serde_json::to_value(&legacy).expect("legacy section must serialize");
    assert_eq!(encoded["sections"][0]["breakType"], serde_json::Value::Null);
}

#[test]
fn rejects_duplicate_or_empty_writer_section_identities() {
    for sections in [
        serde_json::json!([
            {
                "id": "duplicate",
                "startParagraphId": "paragraph-1",
                "pageSetup": { "paperSize": "A4", "orientation": "portrait" }
            },
            {
                "id": "duplicate",
                "startParagraphId": "paragraph-2",
                "pageSetup": { "paperSize": "A4", "orientation": "portrait" }
            }
        ]),
        serde_json::json!([
            {
                "id": "section-1",
                "startParagraphId": "",
                "pageSetup": { "paperSize": "A4", "orientation": "portrait" }
            }
        ]),
    ] {
        let model: WriterDocumentModel = serde_json::from_value(serde_json::json!({
            "sections": sections
        }))
        .expect("invalid identity shape still deserializes before semantic validation");
        assert!(model.validate().is_err());
    }
}
