// 💠 DIAMANT VGT SUPREME STATUS
use crate::{
    assets::{validate_asset, ThemeAssetRef},
    tokens::{validate_tokens, ThemeTokens},
    NeverCancel, ThemeCancellationCheck, ThemeError, MAX_TEMPLATE_DOCUMENT_BYTES,
    MAX_TEMPLATE_OBJECTS,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeSet, HashMap};
use uuid::Uuid;
use vgt_object_model::WorkspaceDocument;
pub const TEMPLATE_SCHEMA: &str = "vgt.workspace.template/1";
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum TemplateSource {
    BuiltIn,
    Local,
    Vault,
    Space,
    ThirdParty,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TemplateDescriptor {
    pub schema: String,
    pub id: String,
    pub version: u64,
    pub name: String,
    pub categories: Vec<String>,
    pub tags: Vec<String>,
    pub preview_asset_id: Option<String>,
    pub required_assets: Vec<ThemeAssetRef>,
    pub required_styles: Vec<String>,
    pub compatibility_version: u32,
    pub source: TemplateSource,
    pub inert: bool,
    pub theme_tokens: ThemeTokens,
    pub document: WorkspaceDocument,
}
fn bounded(v: &str, n: usize) -> bool {
    !v.is_empty() && v.len() <= n && !v.chars().any(char::is_control)
}
fn active_key(k: &str) -> bool {
    matches!(
        k.to_ascii_lowercase().as_str(),
        "script"
            | "javascript"
            | "macro"
            | "shell"
            | "exec"
            | "command"
            | "plugin_entrypoint"
            | "autorun"
            | "onload"
    )
}
fn has_active(v: &Value) -> bool {
    match v {
        Value::Object(m) => m.iter().any(|(k, v)| active_key(k) || has_active(v)),
        Value::Array(a) => a.iter().any(has_active),
        _ => false,
    }
}
pub fn validate_template(t: &TemplateDescriptor) -> Result<(), ThemeError> {
    if t.schema != TEMPLATE_SCHEMA
        || !bounded(&t.id, 128)
        || !bounded(&t.name, 256)
        || t.version == 0
        || t.categories.len() > 32
        || t.tags.len() > 64
        || t.required_assets.len() > 256
        || t.required_styles.len() > 256
        || t.compatibility_version == 0
    {
        return Err(ThemeError::Invalid("template-metadata".into()));
    }
    if t.categories
        .iter()
        .chain(t.tags.iter())
        .chain(t.required_styles.iter())
        .any(|v| !bounded(v, 128))
    {
        return Err(ThemeError::Bounds("template-text".into()));
    }
    validate_tokens(&t.theme_tokens)?;
    if t.document.objects.len() > MAX_TEMPLATE_OBJECTS {
        return Err(ThemeError::Bounds("template-object-limit".into()));
    }
    let size = serde_json::to_vec(&t.document)
        .map_err(|_| ThemeError::Invalid("template-json".into()))?
        .len();
    if size > MAX_TEMPLATE_DOCUMENT_BYTES {
        return Err(ThemeError::Bounds("template-document-bytes".into()));
    }
    for a in &t.required_assets {
        validate_asset(a)?;
    }
    if t.source == TemplateSource::ThirdParty
        && (!t.inert
            || has_active(
                &serde_json::to_value(&t.document)
                    .map_err(|_| ThemeError::Invalid("template-json".into()))?,
            ))
    {
        return Err(ThemeError::ActiveTemplateContent);
    }
    Ok(())
}
fn strip_instance_data(v: &mut Value) {
    match v {
        Value::Object(m) => {
            for key in [
                "responses",
                "drafts",
                "notificationQueue",
                "governanceAuditLog",
                "recentQueries",
                "credential",
                "credentials",
                "secret",
                "secrets",
                "cached_snapshot",
                "fallback_snapshot",
                "permission_provenance",
                "source_snapshot_id",
                "resolved_source_version",
            ] {
                m.remove(key);
            }
            for value in m.values_mut() {
                strip_instance_data(value);
            }
        }
        Value::Array(a) => {
            for x in a {
                strip_instance_data(x)
            }
        }
        _ => {}
    }
}
fn replace_ids(v: &mut Value, map: &HashMap<String, String>) {
    match v {
        Value::String(s) => {
            if let Some(n) = map.get(s) {
                *s = n.clone()
            }
        }
        Value::Object(m) => {
            for x in m.values_mut() {
                replace_ids(x, map)
            }
        }
        Value::Array(a) => {
            for x in a {
                replace_ids(x, map)
            }
        }
        _ => {}
    }
}
fn remap_object_keys(v: &mut Value, map: &HashMap<String, String>) {
    if let Some(objects) = v.get_mut("objects").and_then(Value::as_object_mut) {
        let old = std::mem::take(objects);
        for (k, val) in old {
            objects.insert(map.get(&k).cloned().unwrap_or(k), val);
        }
    }
}
pub fn instantiate_template(
    t: &TemplateDescriptor,
    new_title: Option<&str>,
) -> Result<WorkspaceDocument, ThemeError> {
    instantiate_template_cancellable(t, new_title, &NeverCancel)
}
pub fn instantiate_template_cancellable(
    t: &TemplateDescriptor,
    new_title: Option<&str>,
    cancel: &dyn ThemeCancellationCheck,
) -> Result<WorkspaceDocument, ThemeError> {
    validate_template(t)?;
    if cancel.cancelled() {
        return Err(ThemeError::Cancelled);
    }
    let mut value = serde_json::to_value(&t.document)
        .map_err(|_| ThemeError::Invalid("template-serialize".into()))?;
    strip_instance_data(&mut value);
    let mut ids = HashMap::new();
    ids.insert(t.document.id.clone(), Uuid::new_v4().to_string());
    for (index, id) in t.document.objects.keys().enumerate() {
        if index % 256 == 0 && cancel.cancelled() {
            return Err(ThemeError::Cancelled);
        }
        ids.insert(id.clone(), Uuid::new_v4().to_string());
    }
    remap_object_keys(&mut value, &ids);
    replace_ids(&mut value, &ids);
    let mut doc: WorkspaceDocument =
        serde_json::from_value(value).map_err(|_| ThemeError::Invalid("template-clone".into()))?;
    let now = Utc::now().timestamp_millis();
    doc.created_at = now;
    doc.modified_at = now;
    doc.version = 1;
    if let Some(title) = new_title {
        if !bounded(title, 512) {
            return Err(ThemeError::Bounds("template-title".into()));
        }
        doc.title = title.into();
    }
    let unique: BTreeSet<_> = doc.objects.keys().collect();
    if unique.len() != doc.objects.len()
        || doc
            .root_object_ids
            .iter()
            .any(|id| !doc.objects.contains_key(id))
    {
        return Err(ThemeError::Invalid("template-id-graph".into()));
    }
    Ok(doc)
}
