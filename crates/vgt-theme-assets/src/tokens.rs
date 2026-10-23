// 💠 DIAMANT VGT SUPREME STATUS
use crate::ThemeError;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub const THEME_SCHEMA: &str = "vgt.workspace.theme/1";
pub const MAX_THEME_TOKENS: usize = 1024;
pub const MAX_TOKEN_TEXT: usize = 128;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(deny_unknown_fields)]
pub struct TypographyRole {
    pub family: String,
    pub size_pt: f32,
    #[serde(default)]
    pub weight: u16,
    #[serde(default)]
    pub line_height: f32,
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(deny_unknown_fields)]
pub struct ThemeTokens {
    #[serde(default)]
    pub palette: BTreeMap<String, String>,
    #[serde(default)]
    pub semantic_colors: BTreeMap<String, String>,
    #[serde(default)]
    pub typography: BTreeMap<String, TypographyRole>,
    #[serde(default)]
    pub spacing: BTreeMap<String, f32>,
    #[serde(default)]
    pub effects: BTreeMap<String, String>,
    #[serde(default)]
    pub chart_colors: Vec<String>,
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ThemeDefinition {
    pub schema: String,
    pub id: String,
    pub version: u64,
    pub name: String,
    pub tokens: ThemeTokens,
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(deny_unknown_fields)]
pub struct ThemeOverride {
    pub tokens: ThemeTokens,
}

fn text(v: &str) -> bool {
    !v.is_empty() && v.len() <= MAX_TOKEN_TEXT && !v.chars().any(char::is_control)
}
fn color(v: &str) -> bool {
    let b = v.as_bytes();
    (b.len() == 7 || b.len() == 9) && b[0] == b'#' && b[1..].iter().all(|c| c.is_ascii_hexdigit())
}
pub fn validate_tokens(t: &ThemeTokens) -> Result<(), ThemeError> {
    let count = t.palette.len()
        + t.semantic_colors.len()
        + t.typography.len()
        + t.spacing.len()
        + t.effects.len()
        + t.chart_colors.len();
    if count > MAX_THEME_TOKENS {
        return Err(ThemeError::Bounds("theme-token-limit".into()));
    }
    for (k, v) in t.palette.iter().chain(t.semantic_colors.iter()) {
        if !text(k) || !color(v) {
            return Err(ThemeError::Invalid("theme-color".into()));
        }
    }
    for (k, v) in &t.typography {
        if !text(k)
            || !text(&v.family)
            || !v.size_pt.is_finite()
            || v.size_pt < 4.0
            || v.size_pt > 512.0
            || v.weight > 1000
            || (!v.line_height.is_finite() || v.line_height < 0.0 || v.line_height > 10.0)
        {
            return Err(ThemeError::Invalid("theme-typography".into()));
        }
    }
    for (k, v) in &t.spacing {
        if !text(k) || !v.is_finite() || *v < 0.0 || *v > 4096.0 {
            return Err(ThemeError::Invalid("theme-spacing".into()));
        }
    }
    for (k, v) in &t.effects {
        if !text(k) || !text(v) {
            return Err(ThemeError::Invalid("theme-effect".into()));
        }
    }
    if t.chart_colors.len() > 64 || t.chart_colors.iter().any(|c| !color(c)) {
        return Err(ThemeError::Invalid("theme-chart-color".into()));
    }
    Ok(())
}
fn merge_map<T: Clone>(out: &mut BTreeMap<String, T>, src: &BTreeMap<String, T>) {
    for (k, v) in src {
        out.insert(k.clone(), v.clone());
    }
}
pub fn merge_tokens(base: &ThemeTokens, layer: &ThemeTokens) -> ThemeTokens {
    let mut out = base.clone();
    merge_map(&mut out.palette, &layer.palette);
    merge_map(&mut out.semantic_colors, &layer.semantic_colors);
    merge_map(&mut out.typography, &layer.typography);
    merge_map(&mut out.spacing, &layer.spacing);
    merge_map(&mut out.effects, &layer.effects);
    if !layer.chart_colors.is_empty() {
        out.chart_colors = layer.chart_colors.clone();
    }
    out
}
pub fn resolve_theme(
    workspace: &ThemeTokens,
    template: Option<&ThemeTokens>,
    document: Option<&ThemeTokens>,
    object: Option<&ThemeTokens>,
) -> Result<ThemeTokens, ThemeError> {
    for t in [Some(workspace), template, document, object]
        .into_iter()
        .flatten()
    {
        validate_tokens(t)?;
    }
    let mut out = workspace.clone();
    if let Some(t) = template {
        out = merge_tokens(&out, t)
    }
    if let Some(t) = document {
        out = merge_tokens(&out, t)
    }
    if let Some(t) = object {
        out = merge_tokens(&out, t)
    }
    Ok(out)
}
