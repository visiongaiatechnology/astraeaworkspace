#![forbid(unsafe_code)]

//! # VGT Workspace Object Model (WOM)
//!
//! The unified canonical object representation shared across all VGT Workspace applications:
//! VGT Writer, VGT Grid, VGT Present, VGT Notes, VGT PDF Studio, etc.
//!
//! Features:
//! - Canonical document tree and object registry
//! - Schema versioning (`WOM_SCHEMA_VERSION = 2`)
//! - Universal objects: TextBlock, Table, CellRange, Shape, Image, Chart, WorkspaceReference
//! - App-specific payloads canonically modeled in Rust
//! - Cross-document object links: `vgt://workspace/document/{doc_id}/object/{object_id}`
//! - Tagged wire serialization compatible with TypeScript

pub mod app_models;
pub mod document;
pub mod objects;

pub use app_models::*;
pub use document::*;
pub use objects::*;

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    #[test]
    fn test_create_writer_document() {
        let mut doc = WorkspaceDocument::new("Quarterly Report 2026", DocumentKind::Writer);
        assert_eq!(doc.kind.file_extension(), Some("vdoc"));
        assert_eq!(doc.schema_version, WOM_SCHEMA_VERSION);

        let text_block = TextBlockObject {
            id: Uuid::new_v4().to_string(),
            paragraphs: vec![
                Paragraph {
                    id: Uuid::new_v4().to_string(),
                    style: ParagraphStyle {
                        heading_level: Some(1),
                        ..Default::default()
                    },
                    spans: vec![TextSpan {
                        text: "Executive Summary".to_string(),
                        bold: true,
                        font_size_pt: 20.0,
                        ..Default::default()
                    }],
                },
                Paragraph {
                    id: Uuid::new_v4().to_string(),
                    style: ParagraphStyle::default(),
                    spans: vec![TextSpan {
                        text: "All operations remain sovereign and local-first.".to_string(),
                        ..Default::default()
                    }],
                },
            ],
        };

        let block_id = doc.add_root_object(WorkspaceObject::TextBlock(text_block));
        assert!(doc.get_object(&block_id).is_some());
    }

    #[test]
    fn writer_line_spacing_round_trips_without_losing_units() {
        let style = ParagraphStyle {
            line_spacing_mode: Some(LineSpacingMode::Exact),
            line_spacing_value: Some(18.0),
            ..Default::default()
        };
        let json = serde_json::to_string(&style).expect("line spacing must serialize");
        let restored: ParagraphStyle =
            serde_json::from_str(&json).expect("line spacing must deserialize");
        assert_eq!(restored.line_spacing_mode, Some(LineSpacingMode::Exact));
        assert_eq!(restored.line_spacing_value, Some(18.0));
    }

    #[test]
    fn distributed_alignment_round_trips() {
        let style = ParagraphStyle {
            alignment: TextAlignment::Distributed,
            ..Default::default()
        };
        let json = serde_json::to_string(&style).expect("distributed alignment must serialize");
        assert!(json.contains("\"alignment\":\"distributed\""));
        let restored: ParagraphStyle =
            serde_json::from_str(&json).expect("distributed alignment must deserialize");
        assert_eq!(restored.alignment, TextAlignment::Distributed);
    }

    #[test]
    fn writer_indentation_round_trips() {
        let style = ParagraphStyle {
            left_indent_mm: Some(10.0),
            right_indent_mm: Some(8.0),
            first_line_indent_mm: Some(5.0),
            hanging_indent_mm: None,
            ..Default::default()
        };
        let json = serde_json::to_string(&style).expect("indentation must serialize");
        let restored: ParagraphStyle =
            serde_json::from_str(&json).expect("indentation must deserialize");
        assert_eq!(restored.left_indent_mm, Some(10.0));
        assert_eq!(restored.right_indent_mm, Some(8.0));
        assert_eq!(restored.first_line_indent_mm, Some(5.0));
    }

    #[test]
    fn writer_pagination_rules_round_trip_and_remain_optional_for_legacy_documents() {
        let style = ParagraphStyle {
            keep_with_next: Some(true),
            keep_lines_together: Some(true),
            widow_orphan_control: Some(false),
            page_break_before: Some(true),
            ..Default::default()
        };
        let json = serde_json::to_string(&style).expect("pagination rules must serialize");
        let restored: ParagraphStyle =
            serde_json::from_str(&json).expect("pagination rules must deserialize");
        assert_eq!(restored.keep_with_next, Some(true));
        assert_eq!(restored.keep_lines_together, Some(true));
        assert_eq!(restored.widow_orphan_control, Some(false));
        assert_eq!(restored.page_break_before, Some(true));

        let legacy = r#"{
            "alignment":"left",
            "line_height":1.5,
            "space_before":0.0,
            "space_after":8.0
        }"#;
        let legacy_style: ParagraphStyle =
            serde_json::from_str(legacy).expect("legacy paragraph style must remain readable");
        assert_eq!(legacy_style.keep_with_next, None);
        assert_eq!(legacy_style.keep_lines_together, None);
        assert_eq!(legacy_style.widow_orphan_control, None);
        assert_eq!(legacy_style.page_break_before, None);
    }

    #[test]
    fn writer_paragraph_decoration_round_trips_with_typed_sides_and_shading() {
        let border = ParagraphBorder {
            style: ParagraphBorderStyle::Double,
            width_pt: 1.5,
            color: "#334155".to_string(),
            spacing_pt: 4.0,
        };
        let style = ParagraphStyle {
            borders: Some(ParagraphBorders {
                top: Some(border.clone()),
                right: None,
                bottom: Some(border),
                left: None,
            }),
            shading: Some(ParagraphShading {
                fill_color: "#eff6ff".to_string(),
                opacity_percent: 75,
            }),
            ..Default::default()
        };

        let json = serde_json::to_string(&style).expect("paragraph decoration must serialize");
        assert!(json.contains("\"style\":\"double\""));
        assert!(json.contains("\"fillColor\":\"#eff6ff\""));
        let restored: ParagraphStyle =
            serde_json::from_str(&json).expect("paragraph decoration must deserialize");
        assert_eq!(restored, style);
    }

    #[test]
    fn writer_tab_stops_round_trip_with_alignment_leader_and_decimal_character() {
        let style = ParagraphStyle {
            tab_stops: vec![
                WriterTabStop {
                    id: "tab-left".to_string(),
                    position_mm: 25.0,
                    alignment: WriterTabAlignment::Left,
                    leader: WriterTabLeader::Dots,
                    decimal_character: None,
                },
                WriterTabStop {
                    id: "tab-decimal".to_string(),
                    position_mm: 80.0,
                    alignment: WriterTabAlignment::Decimal,
                    leader: WriterTabLeader::None,
                    decimal_character: Some(','),
                },
            ],
            ..Default::default()
        };
        let json = serde_json::to_string(&style).expect("tab stops must serialize");
        let restored: ParagraphStyle =
            serde_json::from_str(&json).expect("tab stops must deserialize");
        assert_eq!(restored, style);
        assert!(json.contains("\"alignment\":\"decimal\""));
        assert!(json.contains("\"leader\":\"dots\""));
        assert!(json.contains("\"decimalCharacter\":\",\""));
    }

    #[test]
    fn writer_list_identity_and_sorted_order_survive_backend_round_trip() {
        let list_style = ParagraphStyle {
            style_name: Some(WriterParagraphStyleName::Normal),
            list_style: Some(WriterListStyle::Number),
            list_level: Some(0),
            ..Default::default()
        };
        let block = TextBlockObject {
            id: "sorted-list".to_string(),
            paragraphs: vec![
                Paragraph {
                    id: "alpha".to_string(),
                    style: list_style.clone(),
                    spans: vec![TextSpan {
                        text: "Alpha".to_string(),
                        ..Default::default()
                    }],
                },
                Paragraph {
                    id: "beta".to_string(),
                    style: list_style,
                    spans: vec![TextSpan {
                        text: "Beta".to_string(),
                        ..Default::default()
                    }],
                },
            ],
        };

        let json = serde_json::to_string(&block).expect("sorted list must serialize");
        let restored: TextBlockObject =
            serde_json::from_str(&json).expect("sorted list must deserialize");
        assert_eq!(restored, block);
        assert_eq!(restored.paragraphs[0].id, "alpha");
        assert_eq!(
            restored.paragraphs[0].style.list_style,
            Some(WriterListStyle::Number)
        );
        assert!(json.contains("\"style_name\":\"normal\""));
        assert!(json.contains("\"list_style\":\"number\""));
        assert!(json.contains("\"list_level\":0"));
    }

    #[test]
    fn writer_paragraph_direction_and_flow_rules_round_trip() {
        let style = ParagraphStyle {
            text_direction: Some(WriterParagraphDirection::Rtl),
            line_break_mode: Some(WriterLineBreakMode::KeepAll),
            hyphenation_mode: Some(WriterHyphenationMode::None),
            ..Default::default()
        };
        let json = serde_json::to_string(&style).expect("text flow must serialize");
        let restored: ParagraphStyle =
            serde_json::from_str(&json).expect("text flow must deserialize");
        assert_eq!(restored, style);
        assert!(json.contains("\"text_direction\":\"rtl\""));
        assert!(json.contains("\"line_break_mode\":\"keep-all\""));
        assert!(json.contains("\"hyphenation_mode\":\"none\""));
    }

    #[test]
    fn writer_style_assignments_and_catalog_round_trip() {
        let deepest_heading: WriterParagraphStyleName =
            serde_json::from_str("\"heading9\"").expect("Heading 9 must be a typed built-in");
        let toc_level: WriterParagraphStyleName =
            serde_json::from_str("\"toc9\"").expect("TOC 9 must be a typed built-in");
        assert_eq!(deepest_heading, WriterParagraphStyleName::Heading9);
        assert_eq!(toc_level, WriterParagraphStyleName::Toc9);

        let paragraph = Paragraph {
            id: "styled".to_string(),
            style: ParagraphStyle {
                list_style: Some(WriterListStyle::Number),
                list_style_id: Some("number-standard".to_string()),
                linked_style_id: Some("title-accent".to_string()),
                ..Default::default()
            },
            spans: vec![TextSpan {
                text: "Styled".to_string(),
                character_style_id: Some("strong".to_string()),
                bold: true,
                ..Default::default()
            }],
        };
        let paragraph_json =
            serde_json::to_string(&paragraph).expect("style assignments must serialize");
        let restored: Paragraph =
            serde_json::from_str(&paragraph_json).expect("style assignments must deserialize");
        assert_eq!(restored, paragraph);

        let catalog_json = r##"{
            "styles":[],
            "styleCatalog":{
                "paragraphStyles":[{"name":"heading1","label":"Heading 1","fontSizePt":20.0,"bold":true,"basedOn":"normal","nextStyle":"normal","autoUpdate":true,"textEffect":"subtle-shadow"}],
                "characterStyles":[{"id":"strong","label":"Strong","bold":true}],
                "listStyles":[{"id":"number-standard","label":"Number","listStyle":"number","leftIndentMm":6.35,"hangingIndentMm":3.18}],
                "tableStyles":[{"id":"grid","label":"Grid","headerBackground":"#111827","rowBackground":"#0f172a","alternateRowBackground":"#172033","borderColor":"#334155","textColor":"#e2e8f0"}],
                "linkedStyles":[{"id":"title-accent","label":"Title","paragraphStyleName":"title","characterStyleId":"strong"}]
            },
            "styleSets":[{
                "schemaVersion":1,
                "id":"executive",
                "name":"Executive",
                "createdAt":1700000000000,
                "updatedAt":1700000001000,
                "catalog":{
                    "paragraphStyles":[{"name":"normal","label":"Normal","fontSizePt":11.0,"bold":false}],
                    "characterStyles":[],
                    "listStyles":[],
                    "tableStyles":[],
                    "linkedStyles":[]
                }
            }],
            "tables":[{"id":"table","columns":["A"],"rows":[],"styleId":"grid"}]
        }"##;
        let model: WriterDocumentModel =
            serde_json::from_str(catalog_json).expect("style catalog must deserialize");
        let model_json = serde_json::to_string(&model).expect("style catalog must serialize");
        assert!(model_json.contains("\"characterStyles\""));
        assert!(model_json.contains("\"styleId\":\"grid\""));
        assert!(model_json.contains("\"basedOn\":\"normal\""));
        assert!(model_json.contains("\"nextStyle\":\"normal\""));
        assert!(model_json.contains("\"autoUpdate\":true"));
        assert!(model_json.contains("\"textEffect\":\"subtle-shadow\""));
        assert!(model_json.contains("\"styleSets\":[{\"schemaVersion\":1"));
        assert!(model_json.contains("\"name\":\"Executive\""));
    }

    #[test]
    fn sec026_tombstone_removes_payload_and_preserves_only_metadata() {
        let mut doc = WorkspaceDocument::new("SEC026", DocumentKind::Writer);
        let object_id = "8d7b32b2-37a1-4bf2-a5cf-87bc980e5d64".to_string();
        let secret = "SEC026_SECRET_PAYLOAD_MUST_NOT_SURVIVE";
        let block = TextBlockObject {
            id: object_id.clone(),
            paragraphs: vec![Paragraph {
                id: "9e7d6a71-31d8-42fb-a1ff-88b8695f2734".to_string(),
                style: ParagraphStyle::default(),
                spans: vec![TextSpan {
                    text: secret.to_string(),
                    ..Default::default()
                }],
            }],
        };
        doc.add_root_object(WorkspaceObject::TextBlock(block));
        let signature = "A".repeat(86);
        doc.tombstone_object(&object_id, 1_700_000_000_000, &signature)
            .expect("signed tombstone must be created");

        assert!(doc.get_object(&object_id).is_none());
        assert!(!doc.root_object_ids.contains(&object_id));
        let encoded = serde_json::to_string(&doc).expect("tombstoned document must serialize");
        assert!(!encoded.contains(secret));
        assert!(encoded.contains("\"tombstone\":true"));
        assert!(encoded.contains("\"payload\":null"));

        let tombstones = doc
            .identity_tombstones()
            .expect("tombstone metadata must validate");
        assert_eq!(tombstones.len(), 1);
        assert_eq!(tombstones[0].id, object_id);
        assert_eq!(tombstones[0].deleted_at, 1_700_000_000_000);
        assert_eq!(tombstones[0].author_signature, signature);
        assert!(tombstones[0].payload.is_null());
    }

    #[test]
    fn test_cross_document_reference_parsing() {
        let uri = "vgt://workspace/document/revenue-doc-99/object/chart-q1";
        let (doc_id, obj_id) = WorkspaceReferenceObject::parse_uri(uri).unwrap();
        assert_eq!(doc_id, "revenue-doc-99");
        assert_eq!(obj_id, "chart-q1");

        let invalid = "https://example.com";
        assert!(WorkspaceReferenceObject::parse_uri(invalid).is_err());
    }

    #[test]
    fn test_canonical_serde_roundtrip_with_typescript_format() {
        let ts_json = r#"{
            "schema_version": 1,
            "id": "doc-123",
            "title": "Strategy Document",
            "kind": "Writer",
            "created_at": 1700000000000,
            "modified_at": 1700000005000,
            "version": 1,
            "theme_id": "vgt-dark",
            "root_object_ids": ["obj-1"],
            "objects": {
                "obj-1": {
                    "type": "TextBlock",
                    "data": {
                        "id": "obj-1",
                        "paragraphs": [
                            {
                                "id": "p-1",
                                "style": {
                                    "alignment": "left",
                                    "line_height": 1.5,
                                    "space_before": 0.0,
                                    "space_after": 8.0
                                },
                                "spans": [
                                    {
                                        "text": "Sovereign Productivity",
                                        "bold": true,
                                        "font_size_pt": 14.0
                                    }
                                ]
                            }
                        ]
                    }
                }
            }
        }"#;

        let doc: WorkspaceDocument = serde_json::from_str(ts_json).expect("Deserialization failed");
        assert_eq!(doc.id, "doc-123");
        assert_eq!(doc.title, "Strategy Document");
        assert_eq!(doc.kind, DocumentKind::Writer);
        assert_eq!(doc.objects.len(), 1);

        let serialized = serde_json::to_string(&doc).expect("Serialization failed");
        let roundtrip_doc: WorkspaceDocument =
            serde_json::from_str(&serialized).expect("Roundtrip failed");
        assert_eq!(doc, roundtrip_doc);
    }

    #[test]
    fn test_cell_value_serialization_wire_compatibility() {
        use std::collections::HashMap;

        let mut cells = HashMap::new();
        cells.insert(
            "A1".to_string(),
            GridCell {
                value: CellValue::Number(42.5),
                formula: Some("=SUM(10, 32.5)".to_string()),
                format: Some("number".to_string()),
                bold: true,
                background: None,
                text_color: None,
            },
        );
        cells.insert(
            "B1".to_string(),
            GridCell {
                value: CellValue::String("Total".to_string()),
                formula: None,
                format: None,
                bold: false,
                background: None,
                text_color: None,
            },
        );
        cells.insert(
            "C1".to_string(),
            GridCell {
                value: CellValue::Boolean(true),
                formula: None,
                format: None,
                bold: false,
                background: None,
                text_color: None,
            },
        );
        cells.insert(
            "D1".to_string(),
            GridCell {
                value: CellValue::Empty,
                formula: None,
                format: None,
                bold: false,
                background: None,
                text_color: None,
            },
        );

        let table = TableObject {
            id: "tbl-1".to_string(),
            rows: 10,
            cols: 10,
            cells,
        };

        let obj = WorkspaceObject::Table(table);
        let serialized = serde_json::to_string(&obj).unwrap();

        // Verify that tagged wire format {"type": "Table", "data": ...} is produced
        assert!(serialized.contains(r#""type":"Table""#));
        // Verify primitive cell value format
        assert!(serialized.contains("42.5"));
        assert!(serialized.contains(r#""Total""#));
        assert!(serialized.contains("true"));

        let deserialized: WorkspaceObject = serde_json::from_str(&serialized).unwrap();
        assert_eq!(obj, deserialized);
    }

    #[test]
    fn test_writer_page_model_packet_a_roundtrip() {
        let setup = WriterPageSetupConfig {
            paper_size: WriterPaperSize::B4,
            custom_width_mm: None,
            custom_height_mm: None,
            orientation: WriterPageOrientation::Portrait,
            margins: WriterMarginPreset::Mirrored,
            custom_margins: Some(WriterCustomMargins {
                top: 20.0,
                bottom: 20.0,
                left: 25.0,
                right: 15.0,
                gutter: 5.0,
            }),
            columns: Some(4),
            column_gap_mm: Some(6.0),
            column_widths_mm: Some(vec![46.75, 46.75, 46.75, 46.75]),
            paper_color: WriterPaperColor::Cream,
            background_color: Some("#F8FAFC".to_string()),
            show_page_numbers: true,
            page_number_format: Some("roman-upper".to_string()),
            page_number_position: Some("footer-right".to_string()),
            page_number_start: Some(10),
            chapter_numbering: Some(true),
            header_text: "Odd Page Header".to_string(),
            footer_text: "Odd Page Footer".to_string(),
            first_page_header_text: Some("Cover Page Header".to_string()),
            first_page_footer_text: Some("Cover Page Footer".to_string()),
            even_page_header_text: Some("Even Page Header".to_string()),
            even_page_footer_text: Some("Even Page Footer".to_string()),
            first_page_different: true,
            odd_even_different: true,
            link_to_previous_header: Some(false),
            link_to_previous_footer: Some(false),
            mirrored_margins: Some(true),
            watermark: Some(WriterWatermark {
                enabled: true,
                text: "CONFIDENTIAL".to_string(),
                opacity: 0.15,
                rotation_deg: -45.0,
                color: "#ff0000".to_string(),
            }),
            page_borders: Some(WriterPageBorders {
                style: "solid".to_string(),
                width_pt: 1.5,
                color: "#1e293b".to_string(),
                padding_mm: 5.0,
            }),
        };

        let model = WriterDocumentModel {
            page_setup: Some(setup.clone()),
            view_mode: Some(WriterViewMode::Outline),
            ..Default::default()
        };

        // Verification Gate 1: Model validation must succeed
        model.validate().expect("Paket A model must validate");

        // Verification Gate 2: Serde JSON roundtrip
        let serialized = serde_json::to_string_pretty(&model).expect("serialization must succeed");
        assert!(serialized.contains(r#""paperSize": "B4""#));
        assert!(serialized.contains(r#""columns": 4"#));
        assert!(serialized.contains(r#""columnWidthsMm": ["#));
        assert!(serialized.contains(r#""pageNumberFormat": "roman-upper""#));
        assert!(serialized.contains(r#""firstPageHeaderText": "Cover Page Header""#));
        assert!(serialized.contains(r#""evenPageHeaderText": "Even Page Header""#));
        assert!(serialized.contains(r#""linkToPreviousHeader": false"#));
        assert!(serialized.contains(r#""mirroredMargins": true"#));
        assert!(serialized.contains(r#""pageBorders": {"#));
        assert!(serialized.contains(r#""viewMode": "outline""#));

        let deserialized: WriterDocumentModel =
            serde_json::from_str(&serialized).expect("deserialization must succeed");
        assert_eq!(model, deserialized);

        // Verification Gate 3: Column break before on ParagraphStyle
        let style = ParagraphStyle {
            column_break_before: Some(true),
            ..Default::default()
        };
        let style_json = serde_json::to_string(&style).expect("serialize style");
        assert!(style_json.contains(r#""column_break_before":true"#));
        let deserialized_style: ParagraphStyle =
            serde_json::from_str(&style_json).expect("deserialize style");
        assert_eq!(deserialized_style.column_break_before, Some(true));
    }
    #[test]
    fn test_writer_list_multilevel_packet_b_roundtrip() {
        let template = WriterListTemplate {
            id: "hierarchical_numeric".to_string(),
            name: "Standard Hierarchisch Numerisch".to_string(),
            description: Some("1. > 1.1. > 1.1.1.".to_string()),
            is_heading_linked: true,
            levels: vec![
                WriterListLevelConfig {
                    level: 0,
                    number_format: WriterListNumberFormat::Arabic,
                    bullet_glyph: None,
                    prefix: None,
                    suffix: Some(".".to_string()),
                    pattern: Some("%1.".to_string()),
                    start_at: 1,
                    restart_on_higher_level: true,
                    left_indent_mm: 6.35,
                    hanging_indent_mm: 6.35,
                    tab_stop_mm: Some(6.35),
                },
                WriterListLevelConfig {
                    level: 1,
                    number_format: WriterListNumberFormat::Arabic,
                    bullet_glyph: None,
                    prefix: None,
                    suffix: Some(".".to_string()),
                    pattern: Some("%1.%2.".to_string()),
                    start_at: 1,
                    restart_on_higher_level: true,
                    left_indent_mm: 12.7,
                    hanging_indent_mm: 6.35,
                    tab_stop_mm: Some(12.7),
                },
            ],
        };

        let p_style = ParagraphStyle {
            list_style: Some(WriterListStyle::Number),
            list_number_format: Some(WriterListNumberFormat::Arabic),
            list_level: Some(1),
            list_id: Some("lst_sec_01".to_string()),
            list_restart_numbering: Some(true),
            list_start_value: Some(5),
            heading_outline_numbered: Some(true),
            ..Default::default()
        };

        let doc_model = WriterDocumentModel {
            list_templates: vec![template],
            active_heading_list_template_id: Some("hierarchical_numeric".to_string()),
            ..Default::default()
        };

        // Serialize and deserialize
        let serialized_style = serde_json::to_string(&p_style).expect("serialize p_style");
        let deserialized_style: ParagraphStyle =
            serde_json::from_str(&serialized_style).expect("deserialize p_style");
        assert_eq!(p_style, deserialized_style);

        let serialized_doc = serde_json::to_string(&doc_model).expect("serialize doc_model");
        let deserialized_doc: WriterDocumentModel =
            serde_json::from_str(&serialized_doc).expect("deserialize doc_model");
        assert_eq!(doc_model, deserialized_doc);
    }

    #[test]
    fn test_writer_table_advanced_packet_c_roundtrip() {
        let cell_a1 = WriterTableCell {
            id: "c1".to_string(),
            content: "Merged A1-B1".to_string(),
            col_span: Some(2),
            row_span: Some(1),
            vertical_alignment: Some(WriterCellVerticalAlignment::Middle),
            text_rotation: Some(90),
            formula: None,
        };
        let cell_c1 = WriterTableCell {
            id: "c3".to_string(),
            content: "=SUM(ABOVE)".to_string(),
            col_span: None,
            row_span: None,
            vertical_alignment: Some(WriterCellVerticalAlignment::Top),
            text_rotation: None,
            formula: Some("=SUM(ABOVE)".to_string()),
        };
        let row1 = WriterTableRow {
            id: "r1".to_string(),
            cells: vec![cell_a1, cell_c1],
            cant_split: Some(true),
            height_mm: Some(12.5),
        };

        let table = WriterTableBlock {
            id: "tbl_adv_01".to_string(),
            columns: vec![
                "Col A".to_string(),
                "Col B".to_string(),
                "Col C".to_string(),
            ],
            rows: vec![row1],
            style_id: Some("grid-accent".to_string()),
            anchor_paragraph_id: None,
            grid_source: None,
            auto_fit: Some(WriterTableAutoFitMode::Window),
            column_widths_mm: Some(vec![50.0, 50.0, 70.0]),
            repeat_header_row: Some(true),
            header_row_highlight: Some(true),
            total_row_highlight: Some(true),
            alternating_rows: Some(true),
            first_column_highlight: Some(false),
            last_column_highlight: Some(true),
            caption: Some("Quartalsergebnisse 2026".to_string()),
            caption_position: Some(WriterCaptionPosition::Above),
        };

        let doc_model = WriterDocumentModel {
            tables: vec![table.clone()],
            ..Default::default()
        };

        // Serialize and deserialize
        let serialized = serde_json::to_string(&doc_model).expect("serialize doc_model with table");
        let deserialized: WriterDocumentModel =
            serde_json::from_str(&serialized).expect("deserialize doc_model with table");
        assert_eq!(doc_model, deserialized);
        assert_eq!(deserialized.tables[0].columns.len(), 3);
        assert_eq!(
            deserialized.tables[0].caption,
            Some("Quartalsergebnisse 2026".to_string())
        );
        assert_eq!(deserialized.tables[0].rows[0].cant_split, Some(true));
        assert_eq!(deserialized.tables[0].rows[0].cells[0].col_span, Some(2));
    }

    #[test]
    fn test_writer_media_vector_packet_d_roundtrip() {
        let image = WriterImageBlock {
            id: "img_01".to_string(),
            name: "diagram.png".to_string(),
            data_url: "data:image/png;base64,iVBORw0KGgo=".to_string(),
            intrinsic_width: 800,
            intrinsic_height: 600,
            width_percent: 75.0,
            alignment: "center".to_string(),
            alt_text: Some("System Architecture".to_string()),
            caption: Some("Systemtopologie 2026".to_string()),
            anchor_paragraph_id: Some("p1".to_string()),
            placement: Some("block".to_string()),
            wrap_mode: Some(WriterTextWrapMode::Square),
            wrap_distance_top_mm: Some(3.0),
            wrap_distance_bottom_mm: Some(3.0),
            wrap_distance_left_mm: Some(5.0),
            wrap_distance_right_mm: Some(5.0),
            anchor_target: Some(WriterAnchorTarget::Paragraph),
            horizontal_offset_mm: Some(15.0),
            vertical_offset_mm: Some(0.0),
            move_with_text: Some(true),
            fix_position_on_page: Some(false),
            crop: Some(WriterMediaCrop {
                top_percent: 5.0,
                right_percent: 10.0,
                bottom_percent: 5.0,
                left_percent: 0.0,
            }),
            rotation_deg: Some(45.0),
            flip_horizontal: Some(true),
            flip_vertical: Some(false),
            opacity: Some(0.85),
            adjustments: Some(WriterMediaAdjustments {
                brightness: 10,
                contrast: 20,
                saturation: -5,
                grayscale: false,
                sepia: false,
                invert: false,
            }),
            caption_position: Some(WriterCaptionPosition::Below),
        };

        let shape = WriterShapeBlock {
            id: "shape_01".to_string(),
            shape_kind: WriterShapeKind::Callout,
            x_mm: 20.0,
            y_mm: 50.0,
            width_mm: 60.0,
            height_mm: 35.0,
            rotation_deg: 0.0,
            fill_color: Some("#1e293b".to_string()),
            fill_opacity: 0.9,
            stroke_color: Some("#3b82f6".to_string()),
            stroke_width_px: 2.0,
            stroke_dash_style: Some("solid".to_string()),
            text: Some("Wichtiger Sicherheitshinweis".to_string()),
            callout_tail_x_mm: Some(10.0),
            callout_tail_y_mm: Some(65.0),
            arrow_start_head: false,
            arrow_end_head: true,
            group_id: Some("grp_01".to_string()),
            z_index: 2,
            anchor_paragraph_id: Some("p1".to_string()),
            wrap_mode: Some(WriterTextWrapMode::InFrontOfText),
            caption: None,
        };

        let equation = WriterEquationBlock {
            id: "eq_01".to_string(),
            latex: "\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}".to_string(),
            caption: Some("Gaußsches Integral".to_string()),
            display_mode: true,
            anchor_paragraph_id: Some("p2".to_string()),
            mathml: Some("<math><mrow><mi>E</mi><mo>=</mo><mi>m</mi><msup><mi>c</mi><mn>2</mn></msup></mrow></math>".to_string()),
            font_size_pt: Some(12.0),
        };

        let doc_model = WriterDocumentModel {
            images: vec![image],
            shapes: vec![shape],
            equations: vec![equation],
            ..Default::default()
        };

        let serialized = serde_json::to_string(&doc_model).expect("serialize doc_model packet d");
        let deserialized: WriterDocumentModel =
            serde_json::from_str(&serialized).expect("deserialize doc_model packet d");
        assert_eq!(doc_model, deserialized);
        assert_eq!(
            deserialized.images[0].wrap_mode,
            Some(WriterTextWrapMode::Square)
        );
        assert_eq!(
            deserialized.images[0]
                .adjustments
                .as_ref()
                .unwrap()
                .contrast,
            20
        );
        assert_eq!(deserialized.shapes[0].shape_kind, WriterShapeKind::Callout);
        assert_eq!(deserialized.shapes[0].group_id, Some("grp_01".to_string()));
        assert_eq!(deserialized.equations[0].font_size_pt, Some(12.0));
    }
}
