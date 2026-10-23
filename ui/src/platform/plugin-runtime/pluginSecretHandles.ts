// STATUS: DIAMANT VGT SUPREME — Host-only issuance and lifecycle for opaque plugin KeyVault handles.
import { invokeNative, isNativeDesktop } from '../native/nativeBridge';
import type { ScopedSecretHandle } from './pluginRuntimePolicy';

interface NativeHandleResponse {
  success: boolean;
  handle_id?: string | null;
  plugin_id: string;
  scope: string;
  expires_unix_ms?: number | null;
  error?: string | null;
}

export async function issuePluginSecretHandle(
  pluginId: string,
  scope: string,
  secret: string,
  ttlSeconds = 300,
): Promise<ScopedSecretHandle> {
  if (!isNativeDesktop()) throw new Error('PLUGIN_SECRET_HANDLES_REQUIRE_NATIVE_KEYVAULT');
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 300) throw new Error('PLUGIN_SECRET_HANDLE_TTL_REJECTED');
  const response = await invokeNative<NativeHandleResponse>('vgt_plugin_secret_handle_issue', {
    request: { plugin_id: pluginId, scope, secret, ttl_seconds: ttlSeconds },
  });
  if (!response.success || !response.handle_id || !response.expires_unix_ms) throw new Error(response.error ?? 'PLUGIN_SECRET_HANDLE_ISSUE_FAILED');
  return { handleId: response.handle_id, pluginId: response.plugin_id, scope: response.scope, expiresAtUnixMs: response.expires_unix_ms };
}

export async function validatePluginSecretHandle(handle: ScopedSecretHandle): Promise<boolean> {
  if (!isNativeDesktop()) return false;
  const response = await invokeNative<NativeHandleResponse>('vgt_plugin_secret_handle_status', {
    request: { plugin_id: handle.pluginId, scope: handle.scope, handle_id: handle.handleId },
  });
  return response.success === true && response.expires_unix_ms === handle.expiresAtUnixMs;
}

export async function revokePluginSecretHandle(handle: ScopedSecretHandle): Promise<boolean> {
  if (!isNativeDesktop()) return false;
  const response = await invokeNative<NativeHandleResponse>('vgt_plugin_secret_handle_revoke', {
    request: { plugin_id: handle.pluginId, scope: handle.scope, handle_id: handle.handleId },
  });
  return response.success === true;
}
