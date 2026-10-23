//! # Canonical models for Workspace App Payloads

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

use crate::document::DocumentKind;
use crate::objects::{ReferenceMode, WriterListNumberFormat};

// STATUS: PLATIN — Canonical Astraea Writer payload model

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct WriterDocumentModel {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub page_setup: Option<WriterPageSetupConfig>,
    #[serde(default)]
    pub tables: Vec<WriterTableBlock>,
    #[serde(default)]
    pub images: Vec<WriterImageBlock>,
    #[serde(default)]
    pub styles: Vec<WriterStyleDefinition>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub style_catalog: Option<WriterStyleCatalog>,
    #[serde(default)]
    pub sections: Vec<WriterSectionDefinition>,
    #[serde(default)]
    pub equations: Vec<WriterEquationBlock>,
    #[serde(default)]
    pub shapes: Vec<WriterShapeBlock>,
    #[serde(default)]
    pub footnotes: Vec<WriterFootnote>,
    #[serde(default)]
    pub citations: Vec<WriterCitationSource>,
    #[serde(default)]
    pub comments: Vec<WriterComment>,
    #[serde(default)]
    pub revisions: Vec<WriterRevision>,
    #[serde(default)]
    pub bookmarks: Vec<WriterBookmark>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mail_merge: Option<WriterMailMergeConfig>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auto_correct: Option<WriterAutoCorrectConfig>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub view_mode: Option<WriterViewMode>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub current_theme: Option<String>,
    #[serde(default)]
    pub style_sets: Vec<WriterStyleSet>,
    #[serde(default)]
    pub list_templates: Vec<WriterListTemplate>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub active_heading_list_template_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub protection_mode: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub protection_password_hash: Option<String>,
    #[serde(default)]
    pub endnotes: Vec<WriterFootnote>,
    #[serde(flatten)]
    pub extensions: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WriterPageSetupConfig {
    pub paper_size: WriterPaperSize,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub custom_width_mm: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub custom_height_mm: Option<f64>,
    #[serde(default)]
    pub orientation: WriterPageOrientation,
    #[serde(default)]
    pub margins: WriterMarginPreset,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub custom_margins: Option<WriterCustomMargins>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub columns: Option<u8>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub column_gap_mm: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub column_widths_mm: Option<Vec<f64>>,
    #[serde(default)]
    pub paper_color: WriterPaperColor,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub background_color: Option<String>,
    #[serde(default)]
    pub show_page_numbers: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub page_number_format: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub page_number_position: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub page_number_start: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub chapter_numbering: Option<bool>,
    #[serde(default)]
    pub header_text: String,
    #[serde(default)]
    pub footer_text: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub first_page_header_text: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub first_page_footer_text: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub even_page_header_text: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub even_page_footer_text: Option<String>,
    #[serde(default)]
    pub first_page_different: bool,
    #[serde(default)]
    pub odd_even_different: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub link_to_previous_header: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub link_to_previous_footer: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mirrored_margins: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub watermark: Option<WriterWatermark>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub page_borders: Option<WriterPageBorders>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WriterPageBorders {
    pub style: String,
    pub width_pt: f64,
    pub color: String,
    #[serde(default)]
    pub padding_mm: f64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum WriterPaperSize {
    A0,
    A1,
    A2,
    A3,
    A4,
    A5,
    A6,
    B4,
    B5,
    Letter,
    Legal,
    Executive,
    Custom,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum WriterPageOrientation {
    #[default]
    Portrait,
    Landscape,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum WriterMarginPreset {
    #[default]
    Normal,
    Narrow,
    Wide,
    Mirrored,
    Custom,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum WriterPaperColor {
    #[default]
    White,
    Cream,
    Dark,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WriterCustomMargins {
    pub top: f64,
    pub bottom: f64,
    pub left: f64,
    pub right: f64,
    #[serde(default)]
    pub gutter: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WriterWatermark {
    pub enabled: bool,
    pub text: String,
    pub opacity: f64,
    pub rotation_deg: f64,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WriterSectionDefinition {
    pub id: String,
    pub start_paragraph_id: String,
    pub page_setup: WriterPageSetupConfig,
    #[serde(default, skip_serializing_if = "WriterSectionBreakType::is_next_page")]
    pub break_type: WriterSectionBreakType,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub restart_page_number_at: Option<u32>,
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum WriterSectionBreakType {
    #[default]
    NextPage,
    Continuous,
    EvenPage,
    OddPage,
}

impl WriterSectionBreakType {
    fn is_next_page(value: &Self) -> bool {
        matches!(value, Self::NextPage)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WriterStyleDefinition {
    pub name: String,
    pub label: String,
    pub font_size_pt: f64,
    pub bold: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub based_on: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub next_style: Option<String>,
    #[serde(default)]
    pub auto_update: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text_effect: Option<WriterTextEffect>,
    #[serde(default, flatten)]
    pub properties: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum WriterTextEffect {
    None,
    SubtleShadow,
    StrongShadow,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct WriterStyleCatalog {
    #[serde(default)]
    pub paragraph_styles: Vec<WriterStyleDefinition>,
    #[serde(default)]
    pub character_styles: Vec<WriterCharacterStyleDefinition>,
    #[serde(default)]
    pub list_styles: Vec<WriterListStyleDefinition>,
    #[serde(default)]
    pub table_styles: Vec<WriterTableStyleDefinition>,
    #[serde(default)]
    pub linked_styles: Vec<WriterLinkedStyleDefinition>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WriterStyleSet {
    pub schema_version: u16,
    pub id: String,
    pub name: String,
    pub created_at: u64,
    pub updated_at: u64,
    pub catalog: WriterStyleCatalog,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WriterCharacterStyleDefinition {
    pub id: String,
    pub label: String,
    #[serde(default, flatten)]
    pub properties: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WriterListLevelConfig {
    pub level: u8,
    pub number_format: WriterListNumberFormat,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bullet_glyph: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prefix: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub suffix: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pattern: Option<String>,
    #[serde(default = "default_list_start_at")]
    pub start_at: u32,
    #[serde(default = "default_list_restart_higher")]
    pub restart_on_higher_level: bool,
    #[serde(default)]
    pub left_indent_mm: f64,
    #[serde(default)]
    pub hanging_indent_mm: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tab_stop_mm: Option<f64>,
}

fn default_list_start_at() -> u32 {
    1
}

fn default_list_restart_higher() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WriterListTemplate {
    pub id: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default)]
    pub is_heading_linked: bool,
    #[serde(default)]
    pub levels: Vec<WriterListLevelConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WriterListStyleDefinition {
    pub id: String,
    pub label: String,
    pub list_style: String,
    pub left_indent_mm: f64,
    pub hanging_indent_mm: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WriterTableStyleDefinition {
    pub id: String,
    pub label: String,
    pub header_background: String,
    pub row_background: String,
    pub alternate_row_background: String,
    pub border_color: String,
    pub text_color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WriterLinkedStyleDefinition {
    pub id: String,
    pub label: String,
    pub paragraph_style_name: String,
    pub character_style_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub enum WriterTableAutoFitMode {
    #[default]
    Window,
    Contents,
    Fixed,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub enum WriterCellVerticalAlignment {
    #[default]
    Top,
    Middle,
    Bottom,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub enum WriterCaptionPosition {
    #[default]
    Above,
    Below,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WriterTableCell {
    pub id: String,
    pub content: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub col_span: Option<usize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub row_span: Option<usize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub vertical_alignment: Option<WriterCellVerticalAlignment>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text_rotation: Option<u16>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub formula: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WriterTableRow {
    pub id: String,
    pub cells: Vec<WriterTableCell>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cant_split: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub height_mm: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WriterTableBlock {
    pub id: String,
    pub columns: Vec<String>,
    pub rows: Vec<WriterTableRow>,
    #[serde(rename = "styleId", default, skip_serializing_if = "Option::is_none")]
    pub style_id: Option<String>,
    #[serde(
        rename = "anchorParagraphId",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub anchor_paragraph_id: Option<String>,
    #[serde(
        rename = "gridSource",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub grid_source: Option<WriterGridSourceReference>,
    #[serde(rename = "autoFit", default, skip_serializing_if = "Option::is_none")]
    pub auto_fit: Option<WriterTableAutoFitMode>,
    #[serde(
        rename = "columnWidthsMm",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub column_widths_mm: Option<Vec<f64>>,
    #[serde(
        rename = "repeatHeaderRow",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub repeat_header_row: Option<bool>,
    #[serde(
        rename = "headerRowHighlight",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub header_row_highlight: Option<bool>,
    #[serde(
        rename = "totalRowHighlight",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub total_row_highlight: Option<bool>,
    #[serde(
        rename = "alternatingRows",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub alternating_rows: Option<bool>,
    #[serde(
        rename = "firstColumnHighlight",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub first_column_highlight: Option<bool>,
    #[serde(
        rename = "lastColumnHighlight",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub last_column_highlight: Option<bool>,
    #[serde(rename = "caption", default, skip_serializing_if = "Option::is_none")]
    pub caption: Option<String>,
    #[serde(
        rename = "captionPosition",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub caption_position: Option<WriterCaptionPosition>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WriterGridSourceReference {
    pub document_id: String,
    pub object_id: String,
    pub range: String,
    pub uri: String,
    pub mode: ReferenceMode,
    pub source_version: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum WriterTextWrapMode {
    Inline,
    Square,
    Tight,
    Through,
    TopBottom,
    BehindText,
    InFrontOfText,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum WriterAnchorTarget {
    Page,
    Margin,
    Paragraph,
    Character,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct WriterMediaCrop {
    #[serde(default)]
    pub top_percent: f64,
    #[serde(default)]
    pub right_percent: f64,
    #[serde(default)]
    pub bottom_percent: f64,
    #[serde(default)]
    pub left_percent: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct WriterMediaAdjustments {
    #[serde(default)]
    pub brightness: i32,
    #[serde(default)]
    pub contrast: i32,
    #[serde(default)]
    pub saturation: i32,
    #[serde(default)]
    pub grayscale: bool,
    #[serde(default)]
    pub sepia: bool,
    #[serde(default)]
    pub invert: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum WriterShapeKind {
    Rectangle,
    RoundedRectangle,
    Ellipse,
    Line,
    Arrow,
    Callout,
    Textbox,
}

fn default_shape_opacity() -> f64 {
    1.0
}
fn default_shape_stroke_width() -> f64 {
    1.0
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WriterShapeBlock {
    pub id: String,
    pub shape_kind: WriterShapeKind,
    pub x_mm: f64,
    pub y_mm: f64,
    pub width_mm: f64,
    pub height_mm: f64,
    #[serde(default)]
    pub rotation_deg: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fill_color: Option<String>,
    #[serde(default = "default_shape_opacity")]
    pub fill_opacity: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stroke_color: Option<String>,
    #[serde(default = "default_shape_stroke_width")]
    pub stroke_width_px: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stroke_dash_style: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub callout_tail_x_mm: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub callout_tail_y_mm: Option<f64>,
    #[serde(default)]
    pub arrow_start_head: bool,
    #[serde(default)]
    pub arrow_end_head: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub group_id: Option<String>,
    #[serde(default)]
    pub z_index: i32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub anchor_paragraph_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub wrap_mode: Option<WriterTextWrapMode>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub caption: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WriterImageBlock {
    pub id: String,
    pub name: String,
    pub data_url: String,
    pub intrinsic_width: u32,
    pub intrinsic_height: u32,
    pub width_percent: f64,
    pub alignment: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub alt_text: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub caption: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub anchor_paragraph_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub placement: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub wrap_mode: Option<WriterTextWrapMode>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub wrap_distance_top_mm: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub wrap_distance_bottom_mm: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub wrap_distance_left_mm: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub wrap_distance_right_mm: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub anchor_target: Option<WriterAnchorTarget>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub horizontal_offset_mm: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub vertical_offset_mm: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub move_with_text: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fix_position_on_page: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub crop: Option<WriterMediaCrop>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rotation_deg: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub flip_horizontal: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub flip_vertical: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub opacity: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub adjustments: Option<WriterMediaAdjustments>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub caption_position: Option<WriterCaptionPosition>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WriterEquationBlock {
    pub id: String,
    pub latex: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub caption: Option<String>,
    #[serde(default)]
    pub display_mode: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub anchor_paragraph_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mathml: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font_size_pt: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WriterFootnote {
    pub id: String,
    pub number: u32,
    pub text: String,
    pub reference_paragraph_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reference_span_index: Option<usize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub note_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub number_format: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub custom_mark: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WriterCitationSource {
    pub id: String,
    #[serde(rename = "type")]
    pub source_type: String,
    pub author: String,
    pub title: String,
    pub year: String,
    #[serde(default, flatten)]
    pub metadata: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WriterCommentReply {
    pub id: String,
    pub author: String,
    pub text: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WriterComment {
    pub id: String,
    pub paragraph_id: String,
    pub author: String,
    pub avatar_color: String,
    pub text: String,
    pub created_at: i64,
    pub resolved: bool,
    #[serde(default)]
    pub replies: Vec<WriterCommentReply>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WriterRevision {
    pub id: String,
    pub paragraph_id: String,
    #[serde(rename = "type")]
    pub revision_type: String,
    pub author: String,
    pub author_color: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub original_text: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub new_text: Option<String>,
    pub timestamp: i64,
    pub status: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub details: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WriterBookmark {
    pub id: String,
    pub name: String,
    pub paragraph_id: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WriterMailMergeConfig {
    pub records: Vec<HashMap<String, String>>,
    pub current_record_index: usize,
    pub preview_enabled: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WriterAutoCorrectConfig {
    pub enabled: bool,
    pub smart_quotes: bool,
    pub auto_format: bool,
    pub locale: WriterAutoCorrectLocale,
    #[serde(default)]
    pub replacements: Vec<WriterAutoCorrectRule>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
pub enum WriterAutoCorrectLocale {
    #[default]
    #[serde(rename = "de-DE")]
    DeDe,
    #[serde(rename = "en-US")]
    EnUs,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WriterAutoCorrectRule {
    pub id: String,
    pub trigger: String,
    pub replacement: String,
    pub case_sensitive: bool,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum WriterViewMode {
    #[default]
    Print,
    Continuous,
    Draft,
    Outline,
    Reading,
    Focus,
}

#[derive(Debug, thiserror::Error)]
pub enum WriterModelError {
    #[error("invalid Writer payload: {0}")]
    Serialization(#[from] serde_json::Error),
    #[error("invalid custom page dimensions")]
    InvalidPageDimensions,
    #[error("invalid Writer column count")]
    InvalidColumnCount,
    #[error("invalid Writer column geometry")]
    InvalidColumnGeometry,
    #[error("invalid Writer margin geometry")]
    InvalidMargins,
    #[error("invalid Writer AutoCorrect configuration")]
    InvalidAutoCorrect,
    #[error("invalid Writer section identity")]
    InvalidSections,
    #[error("invalid Writer page decoration")]
    InvalidPageDecorations,
    #[error("invalid Writer header or footer")]
    InvalidHeaderFooter,
    #[error("invalid Writer page numbering")]
    InvalidPageNumbering,
}

const MAX_WRITER_HEADER_FOOTER_CHARACTERS: usize = 4_096;

fn is_writer_hex_color(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == 7 && bytes[0] == b'#' && bytes[1..].iter().all(u8::is_ascii_hexdigit)
}

impl WriterDocumentModel {
    pub fn validate(&self) -> Result<(), WriterModelError> {
        let mut section_ids = HashSet::with_capacity(self.sections.len());
        let mut section_starts = HashSet::with_capacity(self.sections.len());
        for section in &self.sections {
            if section.id.trim().is_empty()
                || section.id.len() > 256
                || section.start_paragraph_id.trim().is_empty()
                || section.start_paragraph_id.len() > 256
                || !section_ids.insert(section.id.as_str())
                || !section_starts.insert(section.start_paragraph_id.as_str())
            {
                return Err(WriterModelError::InvalidSections);
            }
            if section
                .restart_page_number_at
                .is_some_and(|start| !(1..=9_999).contains(&start))
            {
                return Err(WriterModelError::InvalidPageNumbering);
            }
        }
        let setups = self
            .page_setup
            .iter()
            .chain(self.sections.iter().map(|section| &section.page_setup));

        for setup in setups {
            if setup.page_number_format.as_deref().is_some_and(|format| {
                !matches!(
                    format,
                    "arabic"
                        | "roman"
                        | "roman-upper"
                        | "roman-lower"
                        | "alpha"
                        | "alpha-upper"
                        | "alpha-lower"
                )
            }) || setup
                .page_number_position
                .as_deref()
                .is_some_and(|position| {
                    !matches!(
                        position,
                        "footer-left"
                            | "footer-center"
                            | "footer-right"
                            | "header-left"
                            | "header-center"
                            | "header-right"
                    )
                })
                || setup
                    .page_number_start
                    .is_some_and(|start| !(1..=9_999).contains(&start))
            {
                return Err(WriterModelError::InvalidPageNumbering);
            }
            let header_footer_texts = [
                Some(setup.header_text.as_str()),
                Some(setup.footer_text.as_str()),
                setup.first_page_header_text.as_deref(),
                setup.first_page_footer_text.as_deref(),
                setup.even_page_header_text.as_deref(),
                setup.even_page_footer_text.as_deref(),
            ];
            if header_footer_texts
                .into_iter()
                .flatten()
                .any(|text| text.chars().count() > MAX_WRITER_HEADER_FOOTER_CHARACTERS)
            {
                return Err(WriterModelError::InvalidHeaderFooter);
            }
            if setup
                .background_color
                .as_deref()
                .is_some_and(|color| !is_writer_hex_color(color))
            {
                return Err(WriterModelError::InvalidPageDecorations);
            }
            if setup.paper_size == WriterPaperSize::Custom
                && !matches!(
                    (setup.custom_width_mm, setup.custom_height_mm),
                    (Some(width), Some(height))
                        if (25.0..=2_000.0).contains(&width)
                            && (25.0..=2_000.0).contains(&height)
                )
            {
                return Err(WriterModelError::InvalidPageDimensions);
            }
            if !matches!(setup.columns.unwrap_or(1), 1..=4) {
                return Err(WriterModelError::InvalidColumnCount);
            }
            if let Some(borders) = &setup.page_borders {
                if !borders.width_pt.is_finite()
                    || !(0.0..=36.0).contains(&borders.width_pt)
                    || !borders.padding_mm.is_finite()
                    || !(0.0..=50.0).contains(&borders.padding_mm)
                    || !matches!(
                        borders.style.as_str(),
                        "solid" | "dashed" | "dotted" | "double"
                    )
                    || !is_writer_hex_color(&borders.color)
                {
                    return Err(WriterModelError::InvalidPageDecorations);
                }
            }
            if let Some(watermark) = &setup.watermark {
                if !watermark.opacity.is_finite()
                    || !(0.02..=0.3).contains(&watermark.opacity)
                    || !watermark.rotation_deg.is_finite()
                    || !(-180.0..=180.0).contains(&watermark.rotation_deg)
                    || !is_writer_hex_color(&watermark.color)
                    || (watermark.enabled
                        && (watermark.text.trim().is_empty()
                            || watermark.text.chars().count() > 120))
                {
                    return Err(WriterModelError::InvalidPageDecorations);
                }
            }
            if let Some(margins) = &setup.custom_margins {
                let values = [
                    margins.top,
                    margins.bottom,
                    margins.left,
                    margins.right,
                    margins.gutter,
                ];
                if values
                    .iter()
                    .any(|value| !value.is_finite() || !(0.0..=200.0).contains(value))
                {
                    return Err(WriterModelError::InvalidMargins);
                }
            }
            let (portrait_width, portrait_height) = match setup.paper_size {
                WriterPaperSize::A0 => (841.0, 1189.0),
                WriterPaperSize::A1 => (594.0, 841.0),
                WriterPaperSize::A2 => (420.0, 594.0),
                WriterPaperSize::A3 => (297.0, 420.0),
                WriterPaperSize::A4 => (210.0, 297.0),
                WriterPaperSize::A5 => (148.0, 210.0),
                WriterPaperSize::A6 => (105.0, 148.0),
                WriterPaperSize::B4 => (250.0, 353.0),
                WriterPaperSize::B5 => (176.0, 250.0),
                WriterPaperSize::Letter => (215.9, 279.4),
                WriterPaperSize::Legal => (215.9, 355.6),
                WriterPaperSize::Executive => (184.15, 266.7),
                WriterPaperSize::Custom => (
                    setup
                        .custom_width_mm
                        .ok_or(WriterModelError::InvalidPageDimensions)?,
                    setup
                        .custom_height_mm
                        .ok_or(WriterModelError::InvalidPageDimensions)?,
                ),
            };
            let (page_width, page_height) = match setup.orientation {
                WriterPageOrientation::Portrait => (portrait_width, portrait_height),
                WriterPageOrientation::Landscape => (portrait_height, portrait_width),
            };
            let custom_is_active = setup.custom_margins.is_some()
                && (setup.margins == WriterMarginPreset::Custom
                    || setup.margins == WriterMarginPreset::Mirrored
                    || setup.mirrored_margins == Some(true));
            let (top, bottom, inside, outside, gutter) = if custom_is_active {
                let margins = setup
                    .custom_margins
                    .as_ref()
                    .ok_or(WriterModelError::InvalidMargins)?;
                (
                    margins.top,
                    margins.bottom,
                    margins.left,
                    margins.right,
                    margins.gutter,
                )
            } else {
                match setup.margins {
                    WriterMarginPreset::Narrow => (12.7, 12.7, 12.7, 12.7, 0.0),
                    WriterMarginPreset::Wide => (25.4, 25.4, 50.8, 50.8, 0.0),
                    WriterMarginPreset::Mirrored => (25.4, 25.4, 31.75, 25.4, 0.0),
                    WriterMarginPreset::Normal | WriterMarginPreset::Custom => {
                        (25.4, 25.4, 25.4, 25.4, 0.0)
                    }
                }
            };
            const MINIMUM_CONTENT_EXTENT_MM: f64 = 10.0;
            if inside + outside + gutter > page_width - MINIMUM_CONTENT_EXTENT_MM
                || top + bottom > page_height - MINIMUM_CONTENT_EXTENT_MM
            {
                return Err(WriterModelError::InvalidMargins);
            }
            let column_count = usize::from(setup.columns.unwrap_or(1));
            let column_gap = setup.column_gap_mm.unwrap_or(10.0);
            let body_width = page_width - inside - outside - gutter;
            if !column_gap.is_finite()
                || !(0.0..=100.0).contains(&column_gap)
                || body_width - column_gap * (column_count.saturating_sub(1) as f64)
                    < column_count as f64 * 5.0
            {
                return Err(WriterModelError::InvalidColumnGeometry);
            }
            if let Some(widths) = &setup.column_widths_mm {
                let occupied = widths.iter().sum::<f64>()
                    + column_gap * (column_count.saturating_sub(1) as f64);
                if widths.len() != column_count
                    || widths
                        .iter()
                        .any(|width| !width.is_finite() || !(5.0..=1_000.0).contains(width))
                    || (occupied - body_width).abs() > 0.25
                {
                    return Err(WriterModelError::InvalidColumnGeometry);
                }
            }
        }
        if let Some(config) = &self.auto_correct {
            let valid_rules = config.replacements.len() <= 256
                && config.replacements.iter().all(|rule| {
                    !rule.id.trim().is_empty()
                        && rule.id.len() <= 128
                        && !rule.trigger.is_empty()
                        && rule.trigger.chars().count() <= 128
                        && rule.replacement.chars().count() <= 1_024
                        && !rule.trigger.chars().any(char::is_control)
                        && !rule.replacement.chars().any(|character| {
                            character.is_control() && !matches!(character, '\n' | '\t')
                        })
                });
            if !valid_rules {
                return Err(WriterModelError::InvalidAutoCorrect);
            }
        }
        Ok(())
    }
}

// -------------------------------------------------------------
// 1. VGT Present Models
// -------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct PresentDocumentModel {
    pub slides: Vec<PresentSlide>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub theme: Option<String>,
    #[serde(
        rename = "aspectRatio",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub aspect_ratio: Option<String>,
}

/// GAP-0009, Runde 305: DER FEHLERTYP, DEN DIE VERDRAHTUNG BRAUCHT.
///
/// Bis hierher hatten nur die Writer-Modelle einen Fehlertyp
/// (`WriterModelError`) und nur `WriterDocumentModel` eine `validate()`. Die
/// FELDER fuer die anderen Anwendungen lagen im Dokument (`present_data`,
/// `pdf_data`, `note_data`, ...), aber es gab keinen typisierten Zugriff —
/// `crates/vgt-ipc/src/server.rs` importiert bis heute kein einziges
/// App-Modell.
///
/// Die Form ist von `WriterModelError` uebernommen: `Serialization` traegt den
/// `serde_json`-Fehler per `#[from]`, damit `?` in Getter und Setter
/// funktioniert, und jede fachliche Verletzung bekommt eine eigene Variante mit
/// eigener Meldung.
#[derive(Debug, thiserror::Error)]
pub enum PresentModelError {
    #[error("invalid Present payload: {0}")]
    Serialization(#[from] serde_json::Error),
    #[error("invalid Present slide identity: a slide id must not be empty")]
    EmptySlideId,
    #[error("invalid Present slide identity: slide id '{0}' appears more than once")]
    DuplicateSlideId(String),
    #[error("invalid Present slide index {index}: no such slide")]
    UnknownSlide { index: usize },
}

impl PresentDocumentModel {
    /// Prueft die Invarianten, die Getter und Setter zusichern.
    ///
    /// WAS HIER NICHT GEPRUEFT WIRD, und warum: eine Praesentation ohne Folien
    /// ist GUELTIG — sie ist der Anfangszustand jeder neuen Datei. Und die
    /// Geometrie einer einzelnen Folie wird nicht geprueft, weil `PresentSlide`
    /// sie als Anteile traegt und die Grenzen dort vom Renderer gesetzt werden,
    /// nicht vom Modell. Eine Pruefung, die mehr behauptet, als sie messen
    /// kann, ist schlimmer als keine.
    pub fn validate(&self) -> Result<(), PresentModelError> {
        let mut seen: HashSet<&str> = HashSet::new();
        for slide in &self.slides {
            if slide.id.is_empty() {
                return Err(PresentModelError::EmptySlideId);
            }
            if !seen.insert(slide.id.as_str()) {
                return Err(PresentModelError::DuplicateSlideId(slide.id.clone()));
            }
        }
        Ok(())
    }

    /// Die Folie an einem Index, oder ein benannter Fehler statt eines `panic`.
    pub fn slide_at(&self, index: usize) -> Result<&PresentSlide, PresentModelError> {
        self.slides
            .get(index)
            .ok_or(PresentModelError::UnknownSlide { index })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PresentSlide {
    pub id: String,
    pub title: String,
    pub subtitle: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
    #[serde(
        rename = "categoryTag",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub category_tag: Option<String>,
    pub layout: PresentSlideLayout,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cards: Option<Vec<PresentSlideCard>>,
    #[serde(
        rename = "bulletPoints",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub bullet_points: Option<Vec<String>>,
    #[serde(
        rename = "chartReferenceId",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub chart_reference_id: Option<String>,
    #[serde(
        rename = "speakerNotes",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub speaker_notes: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum PresentSlideLayout {
    Cards,
    Chart,
    Split,
    BulletList,
    Blank,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PresentSlideCard {
    pub id: String,
    pub title: String,
    pub description: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(
        rename = "colorTheme",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub color_theme: Option<String>,
}

// -------------------------------------------------------------
// 2. VGT PDF Studio Models
// -------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct PdfDocumentModel {
    #[serde(rename = "numPages")]
    pub num_pages: usize,
    pub pages: Vec<PdfPageModel>,
    pub annotations: Vec<PdfAnnotation>,
    pub redactions: Vec<PdfRedaction>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PdfPageModel {
    #[serde(rename = "pageNumber")]
    pub page_number: usize,
    pub title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub subtitle: Option<String>,
    pub sections: Vec<PdfSectionModel>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PdfSectionModel {
    pub id: String,
    #[serde(rename = "type")]
    pub section_type: String,
    pub content: String,
    #[serde(rename = "isRedacted", default)]
    pub is_redacted: bool,
    #[serde(rename = "isMarkedForRedaction", default)]
    pub is_marked_for_redaction: bool,
    #[serde(
        rename = "originalContent",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub original_content: Option<String>,
    #[serde(
        rename = "redactionReason",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub redaction_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PdfAnnotation {
    pub id: String,
    pub page: usize,
    #[serde(rename = "type")]
    pub annotation_type: String,
    pub text: String,
    pub color: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    #[serde(rename = "createdAt", default, skip_serializing_if = "Option::is_none")]
    pub created_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PdfRedaction {
    pub id: String,
    pub page: usize,
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
    pub reason: String,
    #[serde(rename = "isApplied")]
    pub is_applied: bool,
    #[serde(
        rename = "targetText",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub target_text: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<i64>,
}

// -------------------------------------------------------------
// 3. VGT Notes Models
// -------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct NoteNotebook {
    pub id: String,
    pub title: String,
    pub sections: Vec<NoteSection>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct NoteSection {
    pub id: String,
    pub title: String,
    pub pages: Vec<NotePage>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct NotePage {
    pub id: String,
    pub title: String,
    pub content: String,
    pub tags: Vec<String>,
    pub backlinks: Vec<String>,
    pub last_modified: i64,
}

// -------------------------------------------------------------
// 4. VGT Forms & Database Models
// -------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct FormsModel {
    pub fields: Vec<FormField>,
    pub responses: Vec<FormResponse>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FormField {
    pub id: String,
    pub label: String,
    #[serde(rename = "type")]
    pub field_type: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub options: Option<Vec<String>>,
    pub required: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FormResponse {
    pub id: String,
    pub timestamp: i64,
    pub answers: HashMap<String, String>,
}

// -------------------------------------------------------------
// 5. VGT Work Management Models (Tasks, Planner, Projects)
// -------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct WorkManagementModel {
    pub tasks: Vec<TaskItem>,
    pub cards: Vec<PlannerCard>,
    pub milestones: Vec<ProjectMilestone>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TaskItem {
    pub id: String,
    pub title: String,
    pub completed: bool,
    pub priority: String,
    #[serde(rename = "dueDate", default, skip_serializing_if = "Option::is_none")]
    pub due_date: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PlannerCard {
    pub id: String,
    pub title: String,
    pub column: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub assignee: Option<String>,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ProjectMilestone {
    pub id: String,
    pub name: String,
    #[serde(rename = "startDate")]
    pub start_date: String,
    #[serde(rename = "endDate")]
    pub end_date: String,
    pub progress: f32,
}

// -------------------------------------------------------------
// 6. VGT Vault & GaiaCom Models
// -------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct VaultManifestModel {
    pub files: Vec<VaultFile>,
    #[serde(default)]
    pub spaces: Vec<serde_json::Value>,
    pub shares: Vec<GaiaComShareMessage>,
    #[serde(default)]
    pub trash: Vec<VaultTrashEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct VaultFile {
    pub id: String,
    pub name: String,
    pub kind: DocumentKind,
    #[serde(rename = "sizeBytes")]
    pub size_bytes: u64,
    #[serde(rename = "encryptedHash")]
    pub encrypted_hash: String,
    #[serde(rename = "lastModified")]
    pub last_modified: i64,
    #[serde(
        rename = "sourceType",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub source_type: Option<String>,
    #[serde(
        rename = "documentId",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub document_id: Option<String>,
    #[serde(rename = "mimeType", default, skip_serializing_if = "Option::is_none")]
    pub mime_type: Option<String>,
    #[serde(
        rename = "payloadDataUrl",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub payload_data_url: Option<String>,
    #[serde(
        rename = "contentDigest",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub content_digest: Option<String>,
    #[serde(
        rename = "digestAlgorithm",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub digest_algorithm: Option<String>,
    #[serde(
        rename = "integrityState",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub integrity_state: Option<String>,
    #[serde(
        rename = "documentVersion",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub document_version: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct VaultTrashEntry {
    pub id: String,
    #[serde(rename = "deletedAt")]
    pub deleted_at: i64,
    pub file: VaultFile,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct GaiaComShareMessage {
    pub id: String,
    #[serde(rename = "recipientKey")]
    pub recipient_key: String,
    #[serde(rename = "documentTitle")]
    pub document_title: String,
    #[serde(rename = "encryptedPayloadHash")]
    pub encrypted_payload_hash: String,
    pub status: String,
}

/// GAP-0009, Runde 307: DER FEHLERTYP FUER DIE VAULT-VERDRAHTUNG.
///
/// Die Form ist von `WriterModelError` und `PresentModelError` uebernommen:
/// `Serialization` traegt den `serde_json`-Fehler per `#[from]`, damit `?` in
/// Getter und Setter funktioniert.
///
/// WARUM DER VAULT EIGENE VARIANTEN BRAUCHT UND NICHT EINE ALLGEMEINE: ein
/// Vault ist ein BESTAND. Zwei Dateien mit derselben Kennung sind dort nicht
/// eine Mehrdeutigkeit in der Anzeige, sondern ein Widerspruch — die Kennung
/// ist der Griff, an dem der Inhalt haengt, und zwei Dinge am selben Griff
/// koennen nicht beide recht haben.
#[derive(Debug, thiserror::Error)]
pub enum VaultModelError {
    #[error("invalid Vault payload: {0}")]
    Serialization(#[from] serde_json::Error),
    #[error("invalid Vault file identity: a file id must not be empty")]
    EmptyFileId,
    #[error("invalid Vault file identity: file id '{0}' appears more than once")]
    DuplicateFileId(String),
    #[error("invalid Vault trash identity: trash entry id '{0}' appears more than once")]
    DuplicateTrashId(String),
    #[error(
        "invalid Vault state: file id '{0}' is listed as available AND as deleted; \
         a file cannot be in the manifest and in the trash at the same time"
    )]
    FileBothAvailableAndDeleted(String),
}

impl VaultManifestModel {
    /// Prueft die Identitaets- und Zustandsinvarianten des Bestands.
    ///
    /// WAS HIER GEPRUEFT WIRD, und warum genau das:
    ///   * eine Dateikennung darf nicht leer sein — sie ist der Griff;
    ///   * sie darf nicht zweimal vorkommen;
    ///   * eine Papierkorb-Kennung darf nicht zweimal vorkommen;
    ///   * und eine Datei darf NICHT gleichzeitig im Bestand und im Papierkorb
    ///     stehen. Das ist kein Stil, sondern ein Widerspruch: der Bestand sagt
    ///     "verfuegbar", der Papierkorb sagt "geloescht", und beide koennen
    ///     nicht gelten. Wer das zulaesst, entscheidet an einer anderen Stelle
    ///     stillschweigend, welche der beiden Aussagen gewinnt.
    ///
    /// WAS HIER AUSDRUECKLICH NICHT GEPRUEFT WIRD: die `encrypted_hash`-Werte
    /// werden nicht gegen die Nutzlast geprueft, weil das Modell die Nutzlast
    /// nicht traegt — das ist die Aufgabe der Krypto-Schicht, und eine Pruefung
    /// hier wuerde eine Integritaet behaupten, die sie nicht messen kann. Und
    /// `spaces` bleibt undurchsichtig (`serde_json::Value`), weil es das Feld
    /// einer anderen Edition ist.
    pub fn validate(&self) -> Result<(), VaultModelError> {
        let mut dateien: HashSet<&str> = HashSet::new();
        for file in &self.files {
            if file.id.is_empty() {
                return Err(VaultModelError::EmptyFileId);
            }
            if !dateien.insert(file.id.as_str()) {
                return Err(VaultModelError::DuplicateFileId(file.id.clone()));
            }
        }

        let mut papierkorb: HashSet<&str> = HashSet::new();
        for entry in &self.trash {
            if !papierkorb.insert(entry.id.as_str()) {
                return Err(VaultModelError::DuplicateTrashId(entry.id.clone()));
            }
            if dateien.contains(entry.file.id.as_str()) {
                return Err(VaultModelError::FileBothAvailableAndDeleted(
                    entry.file.id.clone(),
                ));
            }
        }

        Ok(())
    }

    /// Die Datei mit einer Kennung, oder `None`. Kein `panic`, kein Raten.
    pub fn file_by_id(&self, id: &str) -> Option<&VaultFile> {
        self.files.iter().find(|file| file.id == id)
    }
}

// -------------------------------------------------------------
// GAP-0009, Runde 308: PDF und Notes
// -------------------------------------------------------------

/// Der Fehlertyp fuer die PDF-Verdrahtung.
///
/// EINE INVARIANTE FEHLT HIER BEWUSST, UND DAS IST GEMESSEN: `num_pages` wird
/// NICHT gegen `pages.len()` geprueft. Die Produzenten setzen es zwar
/// ueberwiegend auf `pages.length` (`ui/src/app/bootstrap/seedData.ts:251`,
/// `seedDocDefaultsOpenCore.ts:82`, `apps/pdf/integrations/
/// pdfWorkspaceConversions.ts:156`), aber `apps/pdf/interchange/
/// pdfArchiveTarget.test.ts:95` uebergibt `numPages: 4` zu einem Modell mit
/// EINER Seite und prueft genau diesen Fall. `num_pages` ist also die Zahl der
/// Seiten im Dokument, waehrend `pages` die Seiten traegt, die Inhalt haben.
/// Eine Gleichheitspruefung waere bequem und falsch.
#[derive(Debug, thiserror::Error)]
pub enum PdfModelError {
    #[error("invalid PDF payload: {0}")]
    Serialization(#[from] serde_json::Error),
    #[error("invalid PDF section identity: section id '{0}' appears more than once")]
    DuplicateSectionId(String),
    #[error("invalid PDF annotation identity: annotation id '{0}' appears more than once")]
    DuplicateAnnotationId(String),
    #[error("invalid PDF redaction identity: redaction id '{0}' appears more than once")]
    DuplicateRedactionId(String),
    #[error("invalid PDF page identity: page number '{0}' appears more than once")]
    DuplicatePageNumber(usize),
    #[error(
        "redaction leak: section '{0}' is marked redacted AND still carries \
         originalContent; the text that was supposed to be removed is still in the file"
    )]
    RedactedSectionRetainsContent(String),
}

impl PdfDocumentModel {
    /// Prueft die Identitaets- und Redaktionsinvarianten.
    ///
    /// DIE WICHTIGSTE PRUEFUNG IST DIE LETZTE, und sie ist keine Formsache:
    /// eine Sektion, die als redigiert MARKIERT ist und deren `original_content`
    /// noch gesetzt ist, traegt den Text, der entfernt werden sollte. Das ist
    /// derselbe Fehler wie ein schwarzer Balken ueber lesbarem Text — die
    /// Anzeige sagt "entfernt", die Datei sagt "hier ist es". Und sie deckt sich
    /// mit der Pruefung, die die Anwendung selbst schon hat:
    /// `ui/src/apps/pdf/security/redaction/pdfTrueRedaction.ts:308` wirft
    /// `Redaction verification failed: originalContent remained`.
    ///
    /// WAS HIER NICHT GEPRUEFT WIRD: ob `is_redacted` auch WAHR ist, wenn es
    /// wahr sein sollte — das kann dieses Modell nicht wissen, weil es die
    /// Seitenlast nicht kennt. Und `num_pages` bleibt ungeprueft, siehe die
    /// Begruendung am Fehlertyp.
    pub fn validate(&self) -> Result<(), PdfModelError> {
        let mut seiten: HashSet<usize> = HashSet::new();
        let mut sektionen: HashSet<&str> = HashSet::new();
        for page in &self.pages {
            if !seiten.insert(page.page_number) {
                return Err(PdfModelError::DuplicatePageNumber(page.page_number));
            }
            for section in &page.sections {
                if !sektionen.insert(section.id.as_str()) {
                    return Err(PdfModelError::DuplicateSectionId(section.id.clone()));
                }
                if section.is_redacted && section.original_content.is_some() {
                    return Err(PdfModelError::RedactedSectionRetainsContent(
                        section.id.clone(),
                    ));
                }
            }
        }

        let mut anmerkungen: HashSet<&str> = HashSet::new();
        for annotation in &self.annotations {
            if !anmerkungen.insert(annotation.id.as_str()) {
                return Err(PdfModelError::DuplicateAnnotationId(annotation.id.clone()));
            }
        }

        let mut redaktionen: HashSet<&str> = HashSet::new();
        for redaction in &self.redactions {
            if !redaktionen.insert(redaction.id.as_str()) {
                return Err(PdfModelError::DuplicateRedactionId(redaction.id.clone()));
            }
        }

        Ok(())
    }

    /// Die Gesamtzahl der Sektionen ueber alle Seiten. Eine Ableitung, kein Feld.
    pub fn section_count(&self) -> usize {
        self.pages.iter().map(|page| page.sections.len()).sum()
    }

    /// Alle Sektionen, die noch Originalinhalt tragen. Nach `validate()` leer.
    pub fn sections_retaining_original_content(&self) -> Vec<&str> {
        self.pages
            .iter()
            .flat_map(|page| page.sections.iter())
            .filter(|section| section.original_content.is_some())
            .map(|section| section.id.as_str())
            .collect()
    }
}

/// Der Fehlertyp fuer die Notes-Verdrahtung.
#[derive(Debug, thiserror::Error)]
pub enum NoteModelError {
    #[error("invalid Notes payload: {0}")]
    Serialization(#[from] serde_json::Error),
    #[error("invalid Notes notebook identity: notebook id '{0}' appears more than once")]
    DuplicateNotebookId(String),
    #[error("invalid Notes section identity: section id '{0}' appears more than once")]
    DuplicateSectionId(String),
    #[error("invalid Notes page identity: page id '{0}' appears more than once")]
    DuplicatePageId(String),
}

/// Der Bestand an Notizbuechern, wie er im Dokumentfeld `notebooks` liegt.
///
/// WARUM ES DIESEN UMSCHLAG GIBT: `NoteNotebook` ist ein einzelnes Notizbuch,
/// aber das Dokumentfeld traegt eine LISTE davon (`document.rs:195`). Ohne
/// einen benannten Typ fuer die Liste kann eine Pruefung der Eindeutigkeit
/// nirgends stehen — sie braucht den Blick auf alle Notizbuecher zugleich.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(transparent)]
pub struct NoteLibraryModel {
    pub notebooks: Vec<NoteNotebook>,
}

impl NoteLibraryModel {
    /// Prueft, dass jede Kennung in jedem Rang genau einmal vorkommt.
    ///
    /// Die drei Raenge sind Notizbuch, Abschnitt und Seite. Ein Abschnitt
    /// gehoert zu genau einem Notizbuch und eine Seite zu genau einem
    /// Abschnitt; eine Kennung zweimal im selben Rang ist darum ein
    /// Widerspruch und keine Mehrdeutigkeit — ein Verweis auf sie kann nicht
    /// sagen, welches der beiden Ziele gemeint ist.
    pub fn validate(&self) -> Result<(), NoteModelError> {
        let mut buecher: HashSet<&str> = HashSet::new();
        let mut abschnitte: HashSet<&str> = HashSet::new();
        let mut seiten: HashSet<&str> = HashSet::new();
        for notebook in &self.notebooks {
            if !buecher.insert(notebook.id.as_str()) {
                return Err(NoteModelError::DuplicateNotebookId(notebook.id.clone()));
            }
            for section in &notebook.sections {
                if !abschnitte.insert(section.id.as_str()) {
                    return Err(NoteModelError::DuplicateSectionId(section.id.clone()));
                }
                for page in &section.pages {
                    if !seiten.insert(page.id.as_str()) {
                        return Err(NoteModelError::DuplicatePageId(page.id.clone()));
                    }
                }
            }
        }
        Ok(())
    }

    pub fn page_count(&self) -> usize {
        self.notebooks
            .iter()
            .flat_map(|notebook| notebook.sections.iter())
            .map(|section| section.pages.len())
            .sum()
    }

    /// Die Seite mit einer Kennung, oder `None`.
    pub fn page_by_id(&self, id: &str) -> Option<&NotePage> {
        self.notebooks
            .iter()
            .flat_map(|notebook| notebook.sections.iter())
            .flat_map(|section| section.pages.iter())
            .find(|page| page.id == id)
    }
}

// -------------------------------------------------------------
// GAP-0009, Runde 309: Tasks
// -------------------------------------------------------------

/// Der Fehlertyp fuer die Work-Management-Verdrahtung.
///
/// ZWEI INVARIANTEN FEHLEN HIER BEWUSST, UND BEIDE SIND GEMESSEN:
///
///   * `progress` WIRD NICHT AUF EINEN BEREICH GEPRUEFT. Der naheliegende
///     Bereich waere 0..=1 fuer einen Anteil. Gemessen ist aber
///     `ui/src/apps/notes/testing/tasks/notesTaskBindingReopen.test.tsx:179`
///     mit `progress: 100` und `ui/src/apps/present/widgets/presentWidgets.ts:94`
///     mit `progress: 76` — die Skala ist 0..100. Und ob 100 die Obergrenze ist,
///     ist damit NICHT belegt; eine Pruefung auf 0..=100 waere eine Annahme.
///
///   * DIE DATEN WERDEN NICHT VERGLICHEN. `start_date` und `end_date` sind
///     Zeichenketten. Ein Vergleich "Ende nicht vor Anfang" ist nur bei einem
///     ISO-Format gueltig, und
///     `ui/src/apps/connect/components/ConnectCalendarView.tsx:37` zeigt
///     `startDate: ''` — der leere String existiert und wuerde jeden Vergleich
///     zu einer Aussage ueber nichts machen.
///
/// Was bleibt, ist die Identitaet: drei Listen, drei Kennungen, jede genau
/// einmal. Das ist wenig und es ist belegt.
#[derive(Debug, thiserror::Error)]
pub enum WorkModelError {
    #[error("invalid Work payload: {0}")]
    Serialization(#[from] serde_json::Error),
    #[error("invalid task identity: task id '{0}' appears more than once")]
    DuplicateTaskId(String),
    #[error("invalid planner card identity: card id '{0}' appears more than once")]
    DuplicateCardId(String),
    #[error("invalid milestone identity: milestone id '{0}' appears more than once")]
    DuplicateMilestoneId(String),
}

impl WorkManagementModel {
    pub fn validate(&self) -> Result<(), WorkModelError> {
        let mut aufgaben: HashSet<&str> = HashSet::new();
        for task in &self.tasks {
            if !aufgaben.insert(task.id.as_str()) {
                return Err(WorkModelError::DuplicateTaskId(task.id.clone()));
            }
        }
        let mut karten: HashSet<&str> = HashSet::new();
        for card in &self.cards {
            if !karten.insert(card.id.as_str()) {
                return Err(WorkModelError::DuplicateCardId(card.id.clone()));
            }
        }
        let mut meilensteine: HashSet<&str> = HashSet::new();
        for milestone in &self.milestones {
            if !meilensteine.insert(milestone.id.as_str()) {
                return Err(WorkModelError::DuplicateMilestoneId(milestone.id.clone()));
            }
        }
        Ok(())
    }

    pub fn task_by_id(&self, id: &str) -> Option<&TaskItem> {
        self.tasks.iter().find(|task| task.id == id)
    }

    pub fn card_by_id(&self, id: &str) -> Option<&PlannerCard> {
        self.cards.iter().find(|card| card.id == id)
    }

    /// Die offenen Aufgaben. Eine Ableitung, kein Feld.
    pub fn open_task_count(&self) -> usize {
        self.tasks.iter().filter(|task| !task.completed).count()
    }
}
