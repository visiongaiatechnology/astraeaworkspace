// STATUS: DIAMANT VGT SUPREME — Paket E & F WOM Roundtrip Tests
use vgt_object_model::{WriterDocumentModel, WriterFootnote, WriterRevision};

#[test]
fn test_writer_packet_e_references_roundtrip() {
    let footnote = WriterFootnote {
        id: "fn_01".to_string(),
        number: 1,
        text: "Siehe Gödel, Escher, Bach (1979).".to_string(),
        reference_paragraph_id: "p_10".to_string(),
        reference_span_index: Some(0),
        note_type: Some("footnote".to_string()),
        number_format: Some("arabic".to_string()),
        custom_mark: None,
    };

    let endnote = WriterFootnote {
        id: "en_01".to_string(),
        number: 1,
        text: "Umfassender mathematischer Beweis in Anhang C.".to_string(),
        reference_paragraph_id: "p_99".to_string(),
        reference_span_index: Some(2),
        note_type: Some("endnote".to_string()),
        number_format: Some("roman".to_string()),
        custom_mark: None,
    };

    let doc = WriterDocumentModel {
        footnotes: vec![footnote.clone()],
        endnotes: vec![endnote.clone()],
        protection_mode: Some("none".to_string()),
        ..Default::default()
    };

    let serialized = serde_json::to_string(&doc).expect("Must serialize Paket E doc");
    let deserialized: WriterDocumentModel =
        serde_json::from_str(&serialized).expect("Must deserialize Paket E doc");

    assert_eq!(doc, deserialized);
    assert_eq!(deserialized.footnotes[0].note_type.as_deref(), Some("footnote"));
    assert_eq!(deserialized.endnotes[0].note_type.as_deref(), Some("endnote"));
    assert_eq!(deserialized.endnotes[0].number_format.as_deref(), Some("roman"));
}

#[test]
fn test_writer_packet_f_review_and_protection_roundtrip() {
    let revision = WriterRevision {
        id: "rev_01".to_string(),
        paragraph_id: "p_20".to_string(),
        revision_type: "format".to_string(),
        author: "Chief Architect".to_string(),
        author_color: "#10b981".to_string(),
        original_text: Some("Normaler Text".to_string()),
        new_text: Some("Hervorgehobener Text".to_string()),
        timestamp: 1773000000,
        status: "pending".to_string(),
        details: Some("bold: true, font_size: 14pt".to_string()),
    };

    let doc = WriterDocumentModel {
        revisions: vec![revision.clone()],
        protection_mode: Some("read_only".to_string()),
        protection_password_hash: Some("sha256:abc123def456".to_string()),
        ..Default::default()
    };

    let serialized = serde_json::to_string(&doc).expect("Must serialize Paket F doc");
    let deserialized: WriterDocumentModel =
        serde_json::from_str(&serialized).expect("Must deserialize Paket F doc");

    assert_eq!(doc, deserialized);
    assert_eq!(deserialized.protection_mode.as_deref(), Some("read_only"));
    assert_eq!(deserialized.protection_password_hash.as_deref(), Some("sha256:abc123def456"));
    assert_eq!(deserialized.revisions[0].revision_type, "format");
    assert_eq!(deserialized.revisions[0].details.as_deref(), Some("bold: true, font_size: 14pt"));
}
