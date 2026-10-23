// 💠 DIAMANT VGT SUPREME STATUS
use crate::ThemeError;
use serde::{Deserialize, Serialize};
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum AssetScope {
    Embedded,
    Local,
    Vault,
    Space,
    RemoteBlocked,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum FontEmbedding {
    Allowed,
    PreviewPrintOnly,
    Forbidden,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FontLicenseMetadata {
    pub family: String,
    pub license_id: String,
    pub embedding: FontEmbedding,
    #[serde(default)]
    pub substitutions: Vec<String>,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ThemeAssetRef {
    pub id: String,
    pub scope: AssetScope,
    pub media_receipt_id: String,
    pub sha256: String,
    #[serde(default)]
    pub source_ref: Option<String>,
    #[serde(default)]
    pub font: Option<FontLicenseMetadata>,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AssetDecision {
    pub usable: bool,
    pub auto_fetch: bool,
    pub reason_code: String,
}
fn safe_text(v: &str, max: usize) -> bool {
    !v.is_empty() && v.len() <= max && !v.chars().any(char::is_control)
}
pub fn validate_asset(a: &ThemeAssetRef) -> Result<AssetDecision, ThemeError> {
    if !safe_text(&a.id, 128)
        || !safe_text(&a.media_receipt_id, 160)
        || a.sha256.len() != 64
        || !a.sha256.bytes().all(|b| b.is_ascii_hexdigit())
    {
        return Err(ThemeError::Invalid("asset-metadata".into()));
    }
    if a.scope == AssetScope::RemoteBlocked {
        return Ok(AssetDecision {
            usable: false,
            auto_fetch: false,
            reason_code: "ASSET_REMOTE_FETCH_BLOCKED".into(),
        });
    }
    if let Some(s) = &a.source_ref {
        if s.len() > 2048 || s.chars().any(char::is_control) {
            return Err(ThemeError::Invalid("asset-source".into()));
        }
    }
    if let Some(f) = &a.font {
        if !safe_text(&f.family, 128)
            || !safe_text(&f.license_id, 256)
            || f.substitutions.is_empty()
            || f.substitutions.len() > 16
            || f.substitutions.iter().any(|s| !safe_text(s, 128))
        {
            return Err(ThemeError::Invalid("font-license".into()));
        }
    }
    Ok(AssetDecision {
        usable: true,
        auto_fetch: false,
        reason_code: "ASSET_MEDIA_ENGINE_VERIFIED".into(),
    })
}
pub fn font_substitution(
    font: &FontLicenseMetadata,
    embedded_requested: bool,
) -> Result<String, ThemeError> {
    if embedded_requested && font.embedding == FontEmbedding::Forbidden {
        return font
            .substitutions
            .first()
            .cloned()
            .ok_or_else(|| ThemeError::Invalid("font-substitution-missing".into()));
    }
    Ok(font.family.clone())
}
