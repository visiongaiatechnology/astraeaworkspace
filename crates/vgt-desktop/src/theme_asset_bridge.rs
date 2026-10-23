// 💠 DIAMANT VGT SUPREME STATUS
use crate::security_gate_bridge::require_trusted_main_window;
use tauri::WebviewWindow;
use vgt_object_model::WorkspaceDocument;
use vgt_theme_assets::{
    flatten_for_export, instantiate_template, preview_brand_kit_update, resolve_theme,
    validate_asset, AssetDecision, BrandKit, BrandKitUpdatePreview, FlattenedThemeExport,
    TemplateDescriptor, ThemeAssetRef, ThemeTokens,
};
#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TemplateInstantiateRequest {
    pub template: TemplateDescriptor,
    pub new_title: Option<String>,
}
#[tauri::command]
pub fn vgt_template_instantiate(
    window: WebviewWindow,
    request: TemplateInstantiateRequest,
) -> Result<WorkspaceDocument, String> {
    require_trusted_main_window(&window)?;
    instantiate_template(&request.template, request.new_title.as_deref())
        .map_err(|_| String::from("TEMPLATE_INSTANTIATION_REJECTED"))
}
#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ThemeResolveRequest {
    pub workspace: ThemeTokens,
    pub template: Option<ThemeTokens>,
    pub document: Option<ThemeTokens>,
    pub object: Option<ThemeTokens>,
}
#[tauri::command]
pub fn vgt_theme_resolve(
    window: WebviewWindow,
    request: ThemeResolveRequest,
) -> Result<ThemeTokens, String> {
    require_trusted_main_window(&window)?;
    resolve_theme(
        &request.workspace,
        request.template.as_ref(),
        request.document.as_ref(),
        request.object.as_ref(),
    )
    .map_err(|_| "THEME_RESOLUTION_REJECTED".into())
}
#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BrandPreviewRequest {
    pub document: WorkspaceDocument,
    pub current: BrandKit,
    pub next: BrandKit,
}
#[tauri::command]
pub fn vgt_brand_kit_preview(
    window: WebviewWindow,
    request: BrandPreviewRequest,
) -> Result<BrandKitUpdatePreview, String> {
    require_trusted_main_window(&window)?;
    preview_brand_kit_update(&request.document, &request.current, &request.next)
        .map_err(|_| "BRAND_KIT_PREVIEW_REJECTED".into())
}
#[tauri::command]
pub fn vgt_theme_asset_validate(
    window: WebviewWindow,
    asset: ThemeAssetRef,
) -> Result<AssetDecision, String> {
    require_trusted_main_window(&window)?;
    validate_asset(&asset).map_err(|_| "THEME_ASSET_REJECTED".into())
}
#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ThemeExportRequest {
    pub target_format: String,
    pub native_theme_id: String,
    pub resolved: ThemeTokens,
}
#[tauri::command]
pub fn vgt_theme_flatten_export(
    window: WebviewWindow,
    request: ThemeExportRequest,
) -> Result<FlattenedThemeExport, String> {
    require_trusted_main_window(&window)?;
    flatten_for_export(
        &request.target_format,
        &request.native_theme_id,
        &request.resolved,
    )
    .map_err(|_| "THEME_EXPORT_REJECTED".into())
}
