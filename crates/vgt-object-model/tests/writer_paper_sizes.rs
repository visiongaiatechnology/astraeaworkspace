// STATUS: PLATIN — Writer paper-size WOM persistence and boundary verification
use vgt_object_model::{
    WriterDocumentModel, WriterMarginPreset, WriterPageOrientation, WriterPageSetupConfig,
    WriterPaperColor, WriterPaperSize,
};

fn page_setup(paper_size: WriterPaperSize) -> WriterPageSetupConfig {
    WriterPageSetupConfig {
        paper_size,
        custom_width_mm: None,
        custom_height_mm: None,
        orientation: WriterPageOrientation::Portrait,
        margins: WriterMarginPreset::Normal,
        custom_margins: None,
        columns: Some(1),
        column_gap_mm: None,
        column_widths_mm: None,
        paper_color: WriterPaperColor::White,
        background_color: None,
        show_page_numbers: true,
        page_number_format: None,
        page_number_position: None,
        page_number_start: None,
        chapter_numbering: None,
        header_text: String::new(),
        footer_text: String::new(),
        first_page_header_text: None,
        first_page_footer_text: None,
        even_page_header_text: None,
        even_page_footer_text: None,
        first_page_different: false,
        odd_even_different: false,
        link_to_previous_header: None,
        link_to_previous_footer: None,
        mirrored_margins: None,
        watermark: None,
        page_borders: None,
    }
}

#[test]
fn round_trips_every_required_writer_paper_size() {
    let required_sizes = [
        WriterPaperSize::A0,
        WriterPaperSize::A1,
        WriterPaperSize::A2,
        WriterPaperSize::A3,
        WriterPaperSize::A4,
        WriterPaperSize::A5,
        WriterPaperSize::A6,
        WriterPaperSize::Letter,
        WriterPaperSize::Legal,
        WriterPaperSize::Executive,
    ];

    for paper_size in required_sizes {
        let model = WriterDocumentModel {
            page_setup: Some(page_setup(paper_size)),
            ..Default::default()
        };
        model.validate().expect("standard paper size must validate");
        let encoded = serde_json::to_vec(&model).expect("paper size must serialize");
        let restored: WriterDocumentModel =
            serde_json::from_slice(&encoded).expect("paper size must deserialize");
        assert_eq!(restored, model);
    }
}

#[test]
fn validates_and_round_trips_custom_writer_dimensions() {
    let mut setup = page_setup(WriterPaperSize::Custom);
    setup.custom_width_mm = Some(173.25);
    setup.custom_height_mm = Some(287.5);
    let model = WriterDocumentModel {
        page_setup: Some(setup),
        ..Default::default()
    };

    model
        .validate()
        .expect("bounded custom paper size must validate");
    let encoded = serde_json::to_vec(&model).expect("custom paper size must serialize");
    let restored: WriterDocumentModel =
        serde_json::from_slice(&encoded).expect("custom paper size must deserialize");
    assert_eq!(restored, model);
}
