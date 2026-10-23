// STATUS: DIAMANT VGT SUPREME — strict dual-sided Tauri IPC schema boundary.

export interface TauriCoreApi {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
}

export interface TauriEventApi {
  listen<T>(event: string, handler: (event: { payload: T }) => void): Promise<() => void>;
}

const NATIVE_COMMAND_ARG_KEYS = {
  'vgt_template_instantiate': ['request'],
  'vgt_theme_resolve': ['request'],
  'vgt_brand_kit_preview': ['request'],
  'vgt_theme_asset_validate': ['asset'],
  'vgt_theme_flatten_export': ['request'],
  'vgt_policy_evaluate': ['request'],
  'vgt_policy_effective_view': [],
  'vgt_policy_install_signed_bundle': ['request'],
  'vgt_automation_runtime_activate': ['request'],
  'vgt_automation_runtime_enqueue': ['run'],
  'vgt_automation_runtime_cancel': ['runId'],
  'vgt_automation_runtime_next': [],
  'vgt_automation_runtime_status': [],
  'vgt_diagnostics_runtime_info': [],
  'vgt_diagnostics_snapshot': [],
  'vgt_diagnostics_debug_mode': ['request'],
  'vgt_safe_mode_status': [],
  'vgt_safe_mode_set': ['enabled'],
  'vgt_safe_mode_validate_workspace_config': ['request'],
  'vgt_safe_mode_rebuild_search_index': ['request'],
  'vgt_safe_mode_diagnose_plugin': ['request'],
  'vgt_update_release_status': [],
  'vgt_update_verify_and_stage_offline': ['request'],
  'vgt_update_transfer_begin': ['request'],
  'vgt_update_transfer_append': ['request'],
  'vgt_update_transfer_pause': ['request'],
  'vgt_update_transfer_resume': ['request'],
  'vgt_update_transfer_status': ['request'],
  'vgt_update_verify_and_stage_transfer': ['request'],
  'vgt_update_recovery_status': [],
  'vgt_update_mark_install_started': [],
  'vgt_update_mark_install_failed': [],
  'vgt_update_clear_recovery': [],
  'vgt_pack_container': ['request'],
  'vgt_unpack_container': ['request'],
  'vgt_formula_evaluate': ['request'],
  'vgt_ipc_server_status': [],
  'vgt_keyvault_status': [],
  'vgt_keyvault_software_provider_create': ['request'],
  'vgt_keyvault_software_provider_unlock': ['request'],
  'vgt_keyvault_audit_snapshot': [],
  'vgt_keyvault_audit_verify': ['snapshot'],
  'vgt_keyvault_lock': [],
  'vgt_keyvault_top_secret_enroll': ['request'],
  'vgt_keyvault_top_secret_unlock': ['request'],
  'vgt_keyvault_top_secret_rotate_factor': ['request'],
  'vgt_keyvault_top_secret_mark_factor_lost': [],
  'vgt_top_secret_status': [],
  'vgt_top_secret_initialize_identity': [],
  'vgt_top_secret_pack': ['request'],
  'vgt_top_secret_unpack': ['request'],
  'vgt_top_secret_export_infinity': ['request'],
  'vgt_top_secret_import_infinity': ['request'],
  'vgt_top_secret_cancel': ['request'],
  'vgt_keyvault_seal_secret': ['request'],
  'vgt_keyvault_unseal_secret': ['request'],
  'vgt_plugin_secret_handle_issue': ['request'],
  'vgt_plugin_secret_handle_status': ['request'],
  'vgt_plugin_secret_handle_revoke': ['request'],
  'vgt_plugin_runtime_review_offline': ['request'],
  'vgt_plugin_runtime_diagnose_offline': ['request'],
  'vgt_plugin_runtime_install_offline': ['request'],
  'vgt_plugin_runtime_update_offline': ['request'],
  'vgt_plugin_runtime_execution_permit': ['pluginId'],
  'vgt_plugin_runtime_grant_document_access': ['request'],
  'vgt_plugin_runtime_trust_signer': ['request'],
  'vgt_plugin_runtime_authorize_host_api': ['request'],
  'vgt_plugin_runtime_status': ['pluginId'],
  'vgt_plugin_runtime_set_user_enabled': ['request'],
  'vgt_plugin_runtime_set_safe_mode': ['enabled'],
  'vgt_plugin_runtime_record_crash': ['pluginId'],
  'vgt_plugin_runtime_rollback': ['pluginId'],
  'vgt_netgate_evaluate': ['request'],
  'vgt_take_opened_file': [],
  'vgt_take_deep_link': [],
  'vgt_shell_open_window': ['request'],
  'vgt_present_monitors': [],
  'vgt_present_open_display': ['request'],
  'vgt_present_close_display': ['request'],
  'vgt_workspace_store_write': ['request'],
  'vgt_workspace_store_list': [],
  'vgt_workspace_store_read': ['request'],
  'vgt_workspace_store_remove': ['request'],
  'vgt_workspace_store_reveal': [],
  'vgt_shell_native_capabilities': [],
  'vgt_shell_set_native_policy': ['request'],
  'vgt_shell_open_dialog': [],
  'vgt_shell_save_dialog': ['request'],
  'vgt_shell_clipboard_read': [],
  'vgt_shell_clipboard_write': ['request'],
  'vgt_shell_notify': ['request'],
  'vgt_recovery_write': ['request'],
  'vgt_recovery_list': [],
  'vgt_recovery_restore': ['request'],
  'vgt_recovery_delete': ['request'],
  'vgt_recovery_clear_all': [],
  'vgt_vault_disk_space': [],
  'vgt_ocr_languages': [],
  'vgt_ocr_recognize': ['request'],
  'vgt_import_sandbox_inspect_bytes': ['request'],
  'vgt_import_sandbox_inspect_path': ['request'],
  'vgt_import_sandbox_validate_export_bytes': ['request'],
  'vgt_import_sandbox_atomic_export': ['request'],
  'vgt_pdf_linearization_status': [],
  'vgt_pdf_linearize': ['request'],
  'vgt_pdf_signing_identities': [],
  'vgt_pdf_signing_sign': ['request'],
  'vgt_sync_open': ['request'],
  'vgt_sync_record': ['request'],
  'vgt_sync_merge': ['request'],
  'vgt_sync_quarantine_future': ['request'],
  'vgt_sync_missing': ['request'],
  'vgt_sync_status': ['request'],
  'vgt_sync_snapshot': ['request'],
  'vgt_sync_bootstrap': ['request'],
  'vgt_sync_gc': ['request'],
  'vgt_sync_membership_change': ['request'],
  'vgt_sync_close': ['request'],
} as const;

export type NativeCommandName = keyof typeof NATIVE_COMMAND_ARG_KEYS;

declare global {
  interface Window {
    __TAURI__?: { core?: TauriCoreApi; event?: TauriEventApi };
  }
}

function validateNativeInvokePayload(command: string, args: Record<string, unknown> | undefined): asserts command is NativeCommandName {
  if (!Object.prototype.hasOwnProperty.call(NATIVE_COMMAND_ARG_KEYS, command)) {
    throw new Error('Native Workspace command is not registered');
  }
  const allowed = NATIVE_COMMAND_ARG_KEYS[command as NativeCommandName] as readonly string[];
  const keys = Object.keys(args ?? {});
  if (keys.some((key) => !allowed.includes(key))) {
    throw new Error('Native Workspace IPC payload contains an unknown field');
  }
}

export function isNativeDesktop(): boolean {
  return typeof window !== 'undefined' && typeof window.__TAURI__?.core?.invoke === 'function';
}

export async function invokeNative<T>(command: NativeCommandName, args?: Record<string, unknown>): Promise<T> {
  validateNativeInvokePayload(command, args);
  const invoke = window.__TAURI__?.core?.invoke;
  if (!invoke) throw new Error('Native Workspace bridge is unavailable');
  return invoke<T>(command, args);
}

export async function listenNative<T>(event: string, handler: (payload: T) => void): Promise<() => void> {
  const listen = window.__TAURI__?.event?.listen;
  if (!listen) return () => undefined;
  return listen<T>(event, (nativeEvent) => handler(nativeEvent.payload));
}

export function __testValidateNativeInvokePayload(command: string, args?: Record<string, unknown>): void {
  validateNativeInvokePayload(command, args);
}
