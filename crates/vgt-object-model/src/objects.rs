//! # Universal Workspace Objects

use serde::de::{Deserializer, Error as _, Visitor};
use serde::ser::{SerializeStruct, Serializer};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum WomError {
    #[error("Object '{0}' not found in document")]
    ObjectNotFound(String),

    #[error("Invalid object reference URI: '{0}'")]
    InvalidReferenceUri(String),

    #[error("Type mismatch for object '{0}'")]
    TypeMismatch(String),

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
}

/// Normalized properties shared across object families without forcing them into one semantic type.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct WorkspaceObjectCommonMetadata {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ownership: Option<WorkspaceObjectOwnership>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub geometry: Option<WorkspaceGeometryMetadata>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub accessibility: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provenance: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub links: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum WorkspaceObjectOwnership {
    Strong,
    ExternalLive,
    ExternalFrozen,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorkspaceGeometryMetadata {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rotation_deg: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MediaAssetObject {
    pub id: String,
    pub mime: String,
    pub byte_length: u64,
    pub sha256: String,
    pub storage: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub chunk_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub capability_uri: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub file_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub common: Option<WorkspaceObjectCommonMetadata>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CommentReviewObject {
    pub id: String,
    pub target_uri: String,
    pub status: String,
    pub comments: Vec<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub common: Option<WorkspaceObjectCommonMetadata>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorkItemReferenceObject {
    pub id: String,
    pub work_item_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub common: Option<WorkspaceObjectCommonMetadata>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DataRecordObject {
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub schema_id: Option<String>,
    pub fields: HashMap<String, serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub common: Option<WorkspaceObjectCommonMetadata>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PolicyMetadataObject {
    pub id: String,
    pub namespace: String,
    pub policy_version: u64,
    pub values: HashMap<String, serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub common: Option<WorkspaceObjectCommonMetadata>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ExtensionObject {
    pub id: String,
    pub namespace: String,
    pub family: String,
    pub payload: serde_json::Value,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub common: Option<WorkspaceObjectCommonMetadata>,
}

/// Opaque future object retained by the storage boundary instead of being destroyed.
#[derive(Debug, Clone, PartialEq)]
pub struct OpaqueWorkspaceObject {
    pub object_type: String,
    pub id: String,
    pub data: serde_json::Value,
}

/// Enumeration of universal Workspace Objects. Serialization is custom so future object
/// tags can survive a Rust storage round-trip without becoming executable/typed content.
#[derive(Debug, Clone, PartialEq)]
pub enum WorkspaceObject {
    TextBlock(TextBlockObject),
    Table(TableObject),
    CellRange(CellRangeObject),
    Shape(ShapeObject),
    Image(ImageObject),
    Chart(ChartObject),
    WorkspaceReference(WorkspaceReferenceObject),
    MediaAsset(MediaAssetObject),
    CommentReview(CommentReviewObject),
    WorkItemRef(WorkItemReferenceObject),
    DataRecord(DataRecordObject),
    PolicyMetadata(PolicyMetadataObject),
    ExtensionObject(ExtensionObject),
    Opaque(OpaqueWorkspaceObject),
}

impl WorkspaceObject {
    pub fn id(&self) -> &str {
        match self {
            WorkspaceObject::TextBlock(o) => &o.id,
            WorkspaceObject::Table(o) => &o.id,
            WorkspaceObject::CellRange(o) => &o.id,
            WorkspaceObject::Shape(o) => &o.id,
            WorkspaceObject::Image(o) => &o.id,
            WorkspaceObject::Chart(o) => &o.id,
            WorkspaceObject::WorkspaceReference(o) => &o.id,
            WorkspaceObject::MediaAsset(o) => &o.id,
            WorkspaceObject::CommentReview(o) => &o.id,
            WorkspaceObject::WorkItemRef(o) => &o.id,
            WorkspaceObject::DataRecord(o) => &o.id,
            WorkspaceObject::PolicyMetadata(o) => &o.id,
            WorkspaceObject::ExtensionObject(o) => &o.id,
            WorkspaceObject::Opaque(o) => &o.id,
        }
    }

    pub fn type_name(&self) -> &str {
        match self {
            WorkspaceObject::TextBlock(_) => "TextBlock",
            WorkspaceObject::Table(_) => "Table",
            WorkspaceObject::CellRange(_) => "CellRange",
            WorkspaceObject::Shape(_) => "Shape",
            WorkspaceObject::Image(_) => "Image",
            WorkspaceObject::Chart(_) => "Chart",
            WorkspaceObject::WorkspaceReference(_) => "WorkspaceReference",
            WorkspaceObject::MediaAsset(_) => "MediaAsset",
            WorkspaceObject::CommentReview(_) => "CommentReview",
            WorkspaceObject::WorkItemRef(_) => "WorkItemRef",
            WorkspaceObject::DataRecord(_) => "DataRecord",
            WorkspaceObject::PolicyMetadata(_) => "PolicyMetadata",
            WorkspaceObject::ExtensionObject(_) => "ExtensionObject",
            WorkspaceObject::Opaque(o) => &o.object_type,
        }
    }
}

impl Serialize for WorkspaceObject {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut state = serializer.serialize_struct("WorkspaceObject", 2)?;
        state.serialize_field("type", self.type_name())?;
        match self {
            WorkspaceObject::TextBlock(v) => state.serialize_field("data", v)?,
            WorkspaceObject::Table(v) => state.serialize_field("data", v)?,
            WorkspaceObject::CellRange(v) => state.serialize_field("data", v)?,
            WorkspaceObject::Shape(v) => state.serialize_field("data", v)?,
            WorkspaceObject::Image(v) => state.serialize_field("data", v)?,
            WorkspaceObject::Chart(v) => state.serialize_field("data", v)?,
            WorkspaceObject::WorkspaceReference(v) => state.serialize_field("data", v)?,
            WorkspaceObject::MediaAsset(v) => state.serialize_field("data", v)?,
            WorkspaceObject::CommentReview(v) => state.serialize_field("data", v)?,
            WorkspaceObject::WorkItemRef(v) => state.serialize_field("data", v)?,
            WorkspaceObject::DataRecord(v) => state.serialize_field("data", v)?,
            WorkspaceObject::PolicyMetadata(v) => state.serialize_field("data", v)?,
            WorkspaceObject::ExtensionObject(v) => state.serialize_field("data", v)?,
            WorkspaceObject::Opaque(v) => state.serialize_field("data", &v.data)?,
        }
        state.end()
    }
}

impl<'de> Deserialize<'de> for WorkspaceObject {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        #[derive(Deserialize)]
        struct WireObject {
            #[serde(rename = "type")]
            object_type: String,
            data: serde_json::Value,
        }
        let wire = WireObject::deserialize(deserializer)?;
        macro_rules! decode {
            ($variant:ident, $ty:ty) => {
                WorkspaceObject::$variant(
                    serde_json::from_value::<$ty>(wire.data).map_err(D::Error::custom)?,
                )
            };
        }
        Ok(match wire.object_type.as_str() {
            "TextBlock" => decode!(TextBlock, TextBlockObject),
            "Table" => decode!(Table, TableObject),
            "CellRange" => decode!(CellRange, CellRangeObject),
            "Shape" => decode!(Shape, ShapeObject),
            "Image" => decode!(Image, ImageObject),
            "Chart" => decode!(Chart, ChartObject),
            "WorkspaceReference" => decode!(WorkspaceReference, WorkspaceReferenceObject),
            "MediaAsset" => decode!(MediaAsset, MediaAssetObject),
            "CommentReview" => decode!(CommentReview, CommentReviewObject),
            "WorkItemRef" => decode!(WorkItemRef, WorkItemReferenceObject),
            "DataRecord" => decode!(DataRecord, DataRecordObject),
            "PolicyMetadata" => decode!(PolicyMetadata, PolicyMetadataObject),
            "ExtensionObject" => decode!(ExtensionObject, ExtensionObject),
            _ => {
                let id = wire
                    .data
                    .get("id")
                    .and_then(serde_json::Value::as_str)
                    .ok_or_else(|| D::Error::custom("opaque WOM object requires data.id"))?
                    .to_string();
                WorkspaceObject::Opaque(OpaqueWorkspaceObject {
                    object_type: wire.object_type,
                    id,
                    data: wire.data,
                })
            }
        })
    }
}

// -------------------------------------------------------------
// 1. Text Model
// -------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TextBlockObject {
    pub id: String,
    pub paragraphs: Vec<Paragraph>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Paragraph {
    pub id: String,
    pub style: ParagraphStyle,
    pub spans: Vec<TextSpan>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ParagraphStyle {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub style_name: Option<WriterParagraphStyleName>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub heading_level: Option<u8>,
    pub alignment: TextAlignment,
    pub line_height: f32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub line_spacing_mode: Option<LineSpacingMode>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub line_spacing_value: Option<f32>,
    pub space_before: f32,
    pub space_after: f32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub list_style: Option<WriterListStyle>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub list_style_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub linked_style_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub list_level: Option<u8>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub left_indent_mm: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub right_indent_mm: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub first_line_indent_mm: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hanging_indent_mm: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub keep_with_next: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub keep_lines_together: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub widow_orphan_control: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub page_break_before: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub column_break_before: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub borders: Option<ParagraphBorders>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shading: Option<ParagraphShading>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tab_stops: Vec<WriterTabStop>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text_direction: Option<WriterParagraphDirection>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub line_break_mode: Option<WriterLineBreakMode>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hyphenation_mode: Option<WriterHyphenationMode>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub list_number_format: Option<WriterListNumberFormat>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub list_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub list_restart_numbering: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub list_start_value: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub list_override_glyph: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub heading_outline_numbered: Option<bool>,
}

impl Default for ParagraphStyle {
    fn default() -> Self {
        Self {
            style_name: None,
            heading_level: None,
            alignment: TextAlignment::Left,
            line_height: 1.5,
            line_spacing_mode: None,
            line_spacing_value: None,
            space_before: 0.0,
            space_after: 8.0,
            list_style: None,
            list_style_id: None,
            linked_style_id: None,
            list_level: None,
            left_indent_mm: None,
            right_indent_mm: None,
            first_line_indent_mm: None,
            hanging_indent_mm: None,
            keep_with_next: None,
            keep_lines_together: None,
            widow_orphan_control: None,
            page_break_before: None,
            column_break_before: None,
            borders: None,
            shading: None,
            tab_stops: Vec::new(),
            text_direction: None,
            line_break_mode: None,
            hyphenation_mode: None,
            list_number_format: None,
            list_id: None,
            list_restart_numbering: None,
            list_start_value: None,
            list_override_glyph: None,
            heading_outline_numbered: None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WriterListNumberFormat {
    Arabic,
    AlphaLower,
    AlphaUpper,
    RomanLower,
    RomanUpper,
    LeadingZero,
    BulletDisc,
    BulletCircle,
    BulletSquare,
    BulletArrow,
    BulletCheck,
    BulletDiamond,
    CustomGlyph,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WriterListStyle {
    Bullet,
    Number,
    Checklist,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WriterParagraphStyleName {
    Normal,
    Title,
    Subtitle,
    Heading1,
    Heading2,
    Heading3,
    Heading4,
    Heading5,
    Heading6,
    Heading7,
    Heading8,
    Heading9,
    Quote,
    Caption,
    Toc1,
    Toc2,
    Toc3,
    Toc4,
    Toc5,
    Toc6,
    Toc7,
    Toc8,
    Toc9,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WriterParagraphDirection {
    Auto,
    Ltr,
    Rtl,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum WriterLineBreakMode {
    Normal,
    BreakWord,
    Anywhere,
    KeepAll,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WriterHyphenationMode {
    None,
    Manual,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ParagraphBorder {
    pub style: ParagraphBorderStyle,
    pub width_pt: f32,
    pub color: String,
    pub spacing_pt: f32,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct ParagraphBorders {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub top: Option<ParagraphBorder>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub right: Option<ParagraphBorder>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bottom: Option<ParagraphBorder>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub left: Option<ParagraphBorder>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ParagraphBorderStyle {
    Solid,
    Dashed,
    Dotted,
    Double,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ParagraphShading {
    pub fill_color: String,
    pub opacity_percent: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WriterTabStop {
    pub id: String,
    pub position_mm: f32,
    pub alignment: WriterTabAlignment,
    pub leader: WriterTabLeader,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub decimal_character: Option<char>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum WriterTabAlignment {
    Left,
    Right,
    Center,
    Decimal,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum WriterTabLeader {
    None,
    Dots,
    Dashes,
    Underline,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LineSpacingMode {
    Preset,
    Exact,
    Minimum,
    Multiple,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TextAlignment {
    Left,
    Center,
    Right,
    #[serde(alias = "justified")]
    Justify,
    Distributed,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TextSpan {
    pub text: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub character_style_id: Option<String>,
    #[serde(default)]
    pub bold: bool,
    #[serde(default)]
    pub italic: bool,
    #[serde(default)]
    pub underline: bool,
    #[serde(default)]
    pub strikethrough: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font_family: Option<String>,
    #[serde(default = "default_font_size")]
    pub font_size_pt: f32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text_color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub background_color: Option<String>,
}

fn default_font_size() -> f32 {
    11.0
}

impl Default for TextSpan {
    fn default() -> Self {
        Self {
            text: String::new(),
            character_style_id: None,
            bold: false,
            italic: false,
            underline: false,
            strikethrough: false,
            font_family: None,
            font_size_pt: 11.0,
            text_color: None,
            background_color: None,
        }
    }
}

// -------------------------------------------------------------
// 2. Grid & Table Model
// -------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TableObject {
    pub id: String,
    pub rows: usize,
    pub cols: usize,
    pub cells: HashMap<String, GridCell>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CellRangeObject {
    pub id: String,
    pub start_col: u32,
    pub start_row: u32,
    pub end_col: u32,
    pub end_row: u32,
    pub sheet_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct GridCell {
    pub value: CellValue,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub formula: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub format: Option<String>,
    #[serde(default)]
    pub bold: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub background: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text_color: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum CellValue {
    Empty,
    String(String),
    Number(f64),
    Boolean(bool),
    Error(String),
}

impl Serialize for CellValue {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match self {
            CellValue::Empty => serializer.serialize_str(""),
            CellValue::String(s) => serializer.serialize_str(s),
            CellValue::Number(n) => serializer.serialize_f64(*n),
            CellValue::Boolean(b) => serializer.serialize_bool(*b),
            CellValue::Error(e) => serializer.serialize_str(&format!("#ERR:{}", e)),
        }
    }
}

impl<'de> Deserialize<'de> for CellValue {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        struct CellValueVisitor;

        impl<'de> Visitor<'de> for CellValueVisitor {
            type Value = CellValue;

            fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
                formatter.write_str("a string, number, boolean, or null for CellValue")
            }

            fn visit_bool<E>(self, v: bool) -> Result<Self::Value, E> {
                Ok(CellValue::Boolean(v))
            }

            fn visit_i64<E>(self, v: i64) -> Result<Self::Value, E> {
                Ok(CellValue::Number(v as f64))
            }

            fn visit_u64<E>(self, v: u64) -> Result<Self::Value, E> {
                Ok(CellValue::Number(v as f64))
            }

            fn visit_f64<E>(self, v: f64) -> Result<Self::Value, E> {
                Ok(CellValue::Number(v))
            }

            fn visit_str<E>(self, v: &str) -> Result<Self::Value, E> {
                if v.is_empty() {
                    Ok(CellValue::Empty)
                } else if let Some(err_msg) = v.strip_prefix("#ERR:") {
                    Ok(CellValue::Error(err_msg.to_string()))
                } else {
                    Ok(CellValue::String(v.to_string()))
                }
            }

            fn visit_unit<E>(self) -> Result<Self::Value, E> {
                Ok(CellValue::Empty)
            }

            fn visit_none<E>(self) -> Result<Self::Value, E> {
                Ok(CellValue::Empty)
            }
        }

        deserializer.deserialize_any(CellValueVisitor)
    }
}

// -------------------------------------------------------------
// 3. Shape & Geometry
// -------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ShapeObject {
    pub id: String,
    // Legacy field name. Documents written before the canonical kind spelling exist; without this
    // alias they cannot be decoded, which is a data-compatibility failure, not a style question.
    #[serde(alias = "shape_type")]
    pub kind: ShapeKind,
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
    #[serde(alias = "rotation_degrees", default)]
    pub rotation: f32,
    pub fill: String,
    pub stroke: String,
    #[serde(alias = "stroke_width", default = "default_stroke_width")]
    pub stroke_width: f32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
}

fn default_stroke_width() -> f32 {
    1.0
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ShapeKind {
    Rectangle,
    RoundedRectangle,
    Circle,
    Ellipse,
    // Callout and Text are part of the canonical shape vocabulary: the Whiteboard uses them, and a
    // document containing one could not be decoded without these variants.
    Callout,
    Text,
    #[serde(alias = "ArrowRight", alias = "arrow-right")]
    Arrow,
    Star,
    Line,
}

// -------------------------------------------------------------
// 4. Image & Asset
// -------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ImageObject {
    pub id: String,
    pub asset_hash: String,
    pub alt_text: String,
    pub width: f32,
    pub height: f32,
    pub mime_type: String,
}

// -------------------------------------------------------------
// 5. Shared Chart Object
// -------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ChartType {
    Bar,
    Column,
    Line,
    Area,
    Pie,
    Scatter,
    Heatmap,
    Waterfall,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ChartObject {
    pub id: String,
    pub chart_type: ChartType,
    pub title: String,
    pub categories: Vec<String>,
    pub series: Vec<ChartSeries>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub data_source_link: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ChartSeries {
    pub name: String,
    pub values: Vec<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
}

// -------------------------------------------------------------
// 6. Cross-Document Reference (Fabric)
// -------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ReferenceMode {
    Live,
    Frozen,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ReferenceStatus {
    Current,
    Changed,
    Broken,
    Unavailable,
    PermissionLost,
    Frozen,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorkspaceReferencePermissionProvenance {
    pub source_document_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_policy_version: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_role_ceiling: Option<String>,
    #[serde(default)]
    pub snapshot_explicitly_embedded: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorkspaceReferenceObject {
    pub id: String,
    pub uri: String,
    pub mode: ReferenceMode,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cached_snapshot: Option<Box<WorkspaceObject>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expected_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_snapshot_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_version: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub resolved_source_version: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fabric_status: Option<ReferenceStatus>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub frozen_at: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub permission_provenance: Option<WorkspaceReferencePermissionProvenance>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub permission_state: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fallback_snapshot: Option<Box<WorkspaceObject>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fallback_policy: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub common: Option<WorkspaceObjectCommonMetadata>,
}

impl WorkspaceReferenceObject {
    pub fn parse_uri(uri: &str) -> Result<(String, String), WomError> {
        if !uri.starts_with("vgt://workspace/document/") {
            return Err(WomError::InvalidReferenceUri(uri.to_string()));
        }
        let remainder = &uri["vgt://workspace/document/".len()..];
        let parts: Vec<&str> = remainder.split("/object/").collect();
        if parts.len() != 2 || parts[0].is_empty() || parts[1].is_empty() {
            return Err(WomError::InvalidReferenceUri(uri.to_string()));
        }
        Ok((parts[0].to_string(), parts[1].to_string()))
    }
}
