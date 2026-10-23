// STATUS: PLATIN — policy previews fail closed unless a bounded response echoes the request context.
import type { NetworkAuditEntry, NetworkCapability, SecurityProfile } from '../../shared/contracts/workspace';
import { authenticatedIpcFetch } from '../native/ipcAuth';
import { invokeNative, isNativeDesktop } from '../native/nativeBridge';
import { parseNetGatePolicyResponse, type NetGateCapability } from './netGatePolicyResponseSchema';

export interface NetGateEvaluationContext {
  componentId?: string;
  documentId?: string | null;
  automationId?: string | null;
  purpose?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';
  expectedRequestBytes?: number;
  expectedResponseBytes?: number;
  timeoutMs?: number;
}

const ALLOWED_CAPABILITIES: readonly NetworkCapability[] = ['None', 'LocalLanOnly', 'WhitelistedOnly', 'FullUserApproved'];
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'] as const;

function blockedPreview(
  host: string,
  componentId: string,
  documentId: string | null,
  automationId: string | null,
  purpose: string,
): { entry: NetworkAuditEntry; message: string } {
  const timestamp = Date.now();
  return {
    entry: {
      id: timestamp,
      timestamp,
      component: componentId,
      document_id: documentId,
      automation_id: automationId,
      target_host: host,
      target_port: 443,
      protocol: 'HTTPS',
      purpose,
      verdict: 'BlockedByDefault',
      capability_id: null,
      destination_classes: [],
      preview_only: true,
      resolution_required: true,
    },
    message: 'NetGate response was rejected; the request is blocked.',
  };
}

function boundedNonNegativeInteger(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(value)));
}

export async function evaluateNetGatePolicy(
  target: string,
  networkCapability: NetworkCapability,
  securityProfile: SecurityProfile = 'STANDARD',
  context: NetGateEvaluationContext = {},
): Promise<{ entry: NetworkAuditEntry; message: string }> {
  const normalized = typeof target === 'string' ? target.trim() : '';
  if (securityProfile === 'VGT_TOP_SECRET') {
    throw new Error('VGT Top Secret blocks generic NetGate egress; an authenticated compatible peer/provider is required.');
  }
  if (securityProfile === 'PQC') {
    throw new Error('PQC network profile is reserved but not operational in this build.');
  }
  if (!normalized || normalized.length > 253 || /[\s/@?#]/u.test(normalized)) {
    throw new Error('Enter a valid host name or IP address');
  }
  if (!ALLOWED_CAPABILITIES.includes(networkCapability)) throw new Error('Network capability is invalid');

  const rawPurpose = context.purpose ?? 'Interactive Workspace policy evaluation';
  if (typeof rawPurpose !== 'string') throw new Error('Network purpose is invalid');
  const purpose = rawPurpose.trim();
  if (!purpose || purpose.length > 512 || /\p{Cc}/u.test(purpose)) {
    throw new Error('Network purpose is required and must be at most 512 characters');
  }
  const componentId = context.componentId ?? 'workspace-shell';
  const documentId = context.documentId ?? null;
  const automationId = context.automationId ?? null;
  if (typeof componentId !== 'string' || !componentId || componentId.length > 128 || /\p{Cc}/u.test(componentId) ||
    (documentId !== null && (typeof documentId !== 'string' || documentId.length > 128 || /\p{Cc}/u.test(documentId))) ||
    (automationId !== null && (typeof automationId !== 'string' || automationId.length > 128 || /\p{Cc}/u.test(automationId)))) {
    throw new Error('Network evaluation context is invalid');
  }

  const method = context.method ?? 'GET';
  if (!HTTP_METHODS.includes(method)) throw new Error('Network method is invalid');
  const request = {
    target_host: normalized,
    target_port: 443,
    purpose,
    capability: networkCapability,
    component_id: componentId,
    document_id: documentId,
    automation_id: automationId,
    method,
    expected_request_bytes: boundedNonNegativeInteger(context.expectedRequestBytes, 0),
    expected_response_bytes: boundedNonNegativeInteger(context.expectedResponseBytes, 64 * 1024),
    timeout_ms: Math.max(1, boundedNonNegativeInteger(context.timeoutMs, 5_000)),
  };
  const raw: unknown = isNativeDesktop()
    ? await invokeNative<unknown>('vgt_netgate_evaluate', { request })
    : await (async () => {
        const response = await authenticatedIpcFetch('/api/v1/netgate/evaluate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
        });
        if (!response.ok) throw new Error(`NetGate Core returned HTTP ${response.status}`);
        return response.json() as Promise<unknown>;
      })();

  const expected = {
    capability: networkCapability as NetGateCapability,
    targetHost: normalized,
    targetPort: request.target_port,
    purpose,
    componentId,
    documentId,
    automationId,
  };
  const parsed = parseNetGatePolicyResponse(raw, expected);
  if (!parsed) return blockedPreview(normalized, componentId, documentId, automationId, purpose);

  const timestamp = Date.now();
  const entry: NetworkAuditEntry = {
    id: timestamp,
    timestamp,
    component: componentId,
    document_id: documentId,
    automation_id: automationId,
    target_host: parsed.target_host,
    target_port: parsed.target_port,
    protocol: 'HTTPS',
    purpose,
    verdict: parsed.verdict,
    capability_id: parsed.capability_id,
    destination_classes: parsed.destination_classes,
    preview_only: parsed.preview_only,
    resolution_required: parsed.resolution_required,
  };
  const message = entry.verdict === 'Allowed'
    ? `NetGate preflight allows ${entry.target_host}:${entry.target_port}; real transport still revalidates DNS, destination class and limits.`
    : `NetGate ${entry.verdict} · ${entry.target_host}:${entry.target_port} · ${entry.purpose}`;
  return { entry, message };
}
