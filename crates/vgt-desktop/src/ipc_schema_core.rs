// STATUS: DIAMANT VGT SUPREME — pure fail-closed IPC payload schema core.
use serde_json::Value;

fn allowed_keys(command: &str) -> Option<&'static [&'static str]> {
    match command {
        "vgt_template_instantiate" => Some(&["request"]),
        "vgt_theme_resolve" => Some(&["request"]),
        "vgt_brand_kit_preview" => Some(&["request"]),
        "vgt_theme_asset_validate" => Some(&["asset"]),
        "vgt_theme_flatten_export" => Some(&["request"]),
        "vgt_policy_evaluate" => Some(&["request"]),
        "vgt_policy_effective_view" => Some(&[]),
        "vgt_policy_install_signed_bundle" => Some(&["request"]),
        "vgt_automation_runtime_activate" => Some(&["request"]),
        "vgt_automation_runtime_enqueue" => Some(&["run"]),
        "vgt_automation_runtime_cancel" => Some(&["runId"]),
        "vgt_automation_runtime_next" => Some(&[]),
        "vgt_automation_runtime_status" => Some(&[]),
        "vgt_diagnostics_runtime_info" => Some(&[]),
        "vgt_diagnostics_snapshot" => Some(&[]),
        "vgt_diagnostics_debug_mode" => Some(&["request"]),
        "vgt_safe_mode_status" => Some(&[]),
        "vgt_safe_mode_set" => Some(&["enabled"]),
        "vgt_safe_mode_validate_workspace_config" => Some(&["request"]),
        "vgt_safe_mode_rebuild_search_index" => Some(&["request"]),
        "vgt_safe_mode_diagnose_plugin" => Some(&["request"]),
        "vgt_update_release_status" => Some(&[]),
        "vgt_update_verify_and_stage_offline" => Some(&["request"]),
        "vgt_update_transfer_begin" => Some(&["request"]),
        "vgt_update_transfer_append" => Some(&["request"]),
        "vgt_update_transfer_pause" => Some(&["request"]),
        "vgt_update_transfer_resume" => Some(&["request"]),
        "vgt_update_transfer_status" => Some(&["request"]),
        "vgt_update_verify_and_stage_transfer" => Some(&["request"]),
        "vgt_update_recovery_status" => Some(&[]),
        "vgt_update_mark_install_started" => Some(&[]),
        "vgt_update_mark_install_failed" => Some(&[]),
        "vgt_update_clear_recovery" => Some(&[]),
        "vgt_pack_container" => Some(&["request"]),
        "vgt_unpack_container" => Some(&["request"]),
        "vgt_formula_evaluate" => Some(&["request"]),
        "vgt_remote_wipe" => Some(&["request"]),
        "vgt_ipc_server_status" => Some(&[]),
        "vgt_keyvault_status" => Some(&[]),
        "vgt_keyvault_software_provider_create" => Some(&["request"]),
        "vgt_keyvault_software_provider_unlock" => Some(&["request"]),
        "vgt_keyvault_audit_snapshot" => Some(&[]),
        "vgt_keyvault_audit_verify" => Some(&["snapshot"]),
        "vgt_keyvault_lock" => Some(&[]),
        "vgt_keyvault_top_secret_enroll" => Some(&["request"]),
        "vgt_keyvault_top_secret_unlock" => Some(&["request"]),
        "vgt_keyvault_top_secret_rotate_factor" => Some(&["request"]),
        "vgt_keyvault_top_secret_mark_factor_lost" => Some(&[]),
        "vgt_top_secret_status" => Some(&[]),
        "vgt_top_secret_initialize_identity" => Some(&[]),
        "vgt_top_secret_pack" => Some(&["request"]),
        "vgt_top_secret_unpack" => Some(&["request"]),
        "vgt_top_secret_export_infinity" => Some(&["request"]),
        "vgt_top_secret_import_infinity" => Some(&["request"]),
        "vgt_top_secret_cancel" => Some(&["request"]),
        "vgt_keyvault_seal_secret" => Some(&["request"]),
        "vgt_keyvault_unseal_secret" => Some(&["request"]),
        "vgt_plugin_secret_handle_issue" => Some(&["request"]),
        "vgt_plugin_secret_handle_status" => Some(&["request"]),
        "vgt_plugin_secret_handle_revoke" => Some(&["request"]),
        "vgt_plugin_runtime_review_offline" => Some(&["request"]),
        "vgt_plugin_runtime_diagnose_offline" => Some(&["request"]),
        "vgt_plugin_runtime_install_offline" => Some(&["request"]),
        "vgt_plugin_runtime_update_offline" => Some(&["request"]),
        "vgt_plugin_runtime_execution_permit" => Some(&["pluginId"]),
        "vgt_plugin_runtime_grant_document_access" => Some(&["request"]),
        "vgt_plugin_runtime_trust_signer" => Some(&["request"]),
        "vgt_plugin_runtime_authorize_host_api" => Some(&["request"]),
        "vgt_plugin_runtime_status" => Some(&["pluginId"]),
        "vgt_plugin_runtime_set_user_enabled" => Some(&["request"]),
        "vgt_plugin_runtime_set_safe_mode" => Some(&["enabled"]),
        "vgt_plugin_runtime_record_crash" => Some(&["pluginId"]),
        "vgt_plugin_runtime_rollback" => Some(&["pluginId"]),
        "vgt_netgate_evaluate" => Some(&["request"]),
        "vgt_take_opened_file" => Some(&[]),
        "vgt_take_deep_link" => Some(&[]),
        "vgt_shell_open_window" => Some(&["request"]),
        "vgt_present_monitors" => Some(&[]),
        "vgt_present_open_display" => Some(&["request"]),
        "vgt_present_close_display" => Some(&["request"]),
        "vgt_workspace_store_write" => Some(&["request"]),
        "vgt_workspace_store_list" => Some(&[]),
        "vgt_workspace_store_read" => Some(&["request"]),
        "vgt_workspace_store_remove" => Some(&["request"]),
        "vgt_workspace_store_reveal" => Some(&[]),
        "vgt_shell_native_capabilities" => Some(&[]),
        "vgt_shell_set_native_policy" => Some(&["request"]),
        "vgt_shell_open_dialog" => Some(&[]),
        "vgt_shell_save_dialog" => Some(&["request"]),
        "vgt_shell_clipboard_read" => Some(&[]),
        "vgt_shell_clipboard_write" => Some(&["request"]),
        "vgt_shell_notify" => Some(&["request"]),
        "vgt_recovery_write" => Some(&["request"]),
        "vgt_recovery_list" => Some(&[]),
        "vgt_recovery_restore" => Some(&["request"]),
        "vgt_recovery_delete" => Some(&["request"]),
        "vgt_recovery_clear_all" => Some(&[]),
        "vgt_vault_disk_space" => Some(&[]),
        "vgt_ocr_languages" => Some(&[]),
        "vgt_ocr_recognize" => Some(&["request"]),
        "vgt_import_sandbox_inspect_bytes" => Some(&["request"]),
        "vgt_import_sandbox_inspect_path" => Some(&["request"]),
        "vgt_import_sandbox_validate_export_bytes" => Some(&["request"]),
        "vgt_import_sandbox_atomic_export" => Some(&["request"]),
        "vgt_pdf_linearization_status" => Some(&[]),
        "vgt_pdf_linearize" => Some(&["request"]),
        "vgt_pdf_signing_identities" => Some(&[]),
        "vgt_pdf_signing_sign" => Some(&["request"]),
        "vgt_sync_open" => Some(&["request"]),
        "vgt_sync_record" => Some(&["request"]),
        "vgt_sync_merge" => Some(&["request"]),
        "vgt_sync_quarantine_future" => Some(&["request"]),
        "vgt_sync_missing" => Some(&["request"]),
        "vgt_sync_status" => Some(&["request"]),
        "vgt_sync_snapshot" => Some(&["request"]),
        "vgt_sync_bootstrap" => Some(&["request"]),
        "vgt_sync_gc" => Some(&["request"]),
        "vgt_sync_membership_change" => Some(&["request"]),
        "vgt_sync_close" => Some(&["request"]),
        _ => None,
    }
}



pub fn validate_json_payload(command: &str, payload: &Value) -> Result<(), &'static str> {
    let allowed = allowed_keys(command).ok_or("IPC_COMMAND_NOT_REGISTERED")?;
    let object = match payload {
        Value::Object(object) => object,
        Value::Null if allowed.is_empty() => return Ok(()),
        _ => return Err("IPC_PAYLOAD_MUST_BE_OBJECT"),
    };
    if object
        .keys()
        .any(|key| !allowed.iter().any(|allowed_key| key == allowed_key))
    {
        return Err("IPC_UNKNOWN_FIELD_REJECTED");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn sec062_unknown_command_and_fields_fail_closed() {
        assert_eq!(
            validate_json_payload("system_exec", &json!({"cmd":"calc.exe"})),
            Err("IPC_COMMAND_NOT_REGISTERED")
        );
        assert_eq!(
            validate_json_payload(
                "vgt_shell_open_window",
                &json!({"request":{},"cmd":"calc.exe"})
            ),
            Err("IPC_UNKNOWN_FIELD_REJECTED")
        );
        assert_eq!(
            validate_json_payload("vgt_shell_open_window", &json!({"request":{}})),
            Ok(())
        );
    }


    #[cfg(feature = "open-core")]
    #[test]
    fn open_core_does_not_register_premium_gaiacom_commands() {
        assert_eq!(
            validate_json_payload("vgt_gaiacom_mdns_announce", &json!({})),
            Err("IPC_COMMAND_NOT_REGISTERED")
        );
    }

    
        #[test]
        fn software_provider_commands_accept_only_request_payloads() {
            for command in [
                "vgt_keyvault_software_provider_create",
                "vgt_keyvault_software_provider_unlock",
            ] {
                assert_eq!(
                    validate_json_payload(
                        command,
                        &json!({"request":{"passphrase":"test-passphrase"}})
                    ),
                    Ok(())
                );
                assert_eq!(
                    validate_json_payload(
                        command,
                        &json!({"request":{},"passphrase":"test-passphrase"})
                    ),
                    Err("IPC_UNKNOWN_FIELD_REJECTED")
                );
            }
        }

    #[test]
    fn shell_save_dialog_accepts_request_and_rejects_unknown_fields() {
        assert_eq!(
            validate_json_payload(
                "vgt_shell_save_dialog",
                &json!({"request":{"suggestedName":"test.docx"}})
            ),
            Ok(())
        );
        assert_eq!(
            validate_json_payload("vgt_shell_save_dialog", &json!({"request":{},"extra":true})),
            Err("IPC_UNKNOWN_FIELD_REJECTED")
        );
    }
}
