// STATUS: PLATIN — native and loopback policy previews cannot override mismatched request identity.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authenticatedIpcFetch } from '../../../platform/native/ipcAuth';
import { evaluateNetGatePolicy } from '../../../platform/netgate/netGateEvaluation';
import { invokeNative, isNativeDesktop } from '../../../platform/native/nativeBridge';

vi.mock('../../../platform/native/nativeBridge', () => ({ invokeNative: vi.fn(), isNativeDesktop: vi.fn() }));
vi.mock('../../../platform/native/ipcAuth', () => ({ authenticatedIpcFetch: vi.fn() }));

const expected = {
  target_host: 'api.example.com',
  target_port: 443,
  purpose: 'Workspace connector preflight',
  capability: 'WhitelistedOnly',
  component_id: 'workspace-shell',
  document_id: 'doc-1',
  automation_id: null,
  destination_classes: ['PublicInternet'],
  capability_id: 'compat-whitelisted',
  preview_only: true,
  resolution_required: true,
  verdict: 'Allowed',
};

describe('evaluateNetGatePolicy native response boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isNativeDesktop).mockReturnValue(true);
  });

  it('accepts a complete response whose host and request context match', async () => {
    vi.mocked(invokeNative).mockResolvedValue(expected);
    await expect(evaluateNetGatePolicy('API.EXAMPLE.COM.', 'WhitelistedOnly', 'STANDARD', {
      purpose: expected.purpose,
      documentId: 'doc-1',
    })).resolves.toMatchObject({
      entry: { verdict: 'Allowed', target_host: 'api.example.com', component: 'workspace-shell', document_id: 'doc-1' },
    });
  });

  it('turns malformed or mismatched verdicts into a local BlockedByDefault entry', async () => {
    const responses = [
      { ...expected, verdict: 'ForgedAllowed' },
      { ...expected, target_host: 'attacker.example.net' },
      { ...expected, capability: 'FullUserApproved' },
      { ...expected, purpose: 'Other action' },
      { ...expected, component_id: 'other-component' },
      { ...expected, document_id: 'other-doc' },
      { ...expected, preview_only: false },
      { ...expected, destination_classes: ['Unexpected'] },
      { ...expected, extra: 'field' },
      { ...expected, target_port: 8443 },
    ];

    for (const response of responses) {
      vi.mocked(invokeNative).mockResolvedValue(response);
      await expect(evaluateNetGatePolicy('api.example.com', 'WhitelistedOnly', 'STANDARD', {
        purpose: expected.purpose,
        documentId: 'doc-1',
      })).resolves.toMatchObject({
        entry: { verdict: 'BlockedByDefault', target_host: 'api.example.com', capability_id: null, destination_classes: [] },
        message: 'NetGate response was rejected; the request is blocked.',
      });
    }
  });

  it('accepts the provider canonical IPv6 host spelling', async () => {
    vi.mocked(invokeNative).mockResolvedValue({ ...expected, target_host: '[2001:db8::1]' });
    await expect(evaluateNetGatePolicy('2001:0db8:0:0:0:0:0:1', 'WhitelistedOnly', 'STANDARD', {
      purpose: expected.purpose,
      documentId: 'doc-1',
    })).resolves.toMatchObject({ entry: { verdict: 'Allowed', target_host: '[2001:db8::1]' } });

    vi.mocked(invokeNative).mockResolvedValue({ ...expected, target_host: '2001:db8::1' });
    await expect(evaluateNetGatePolicy('2001:0db8:0:0:0:0:0:1', 'WhitelistedOnly', 'STANDARD', {
      purpose: expected.purpose,
      documentId: 'doc-1',
    })).resolves.toMatchObject({ entry: { verdict: 'Allowed', target_host: '2001:db8::1' } });
  });

  it('validates loopback responses as unknown and fails closed on malformed JSON', async () => {
    vi.mocked(isNativeDesktop).mockReturnValue(false);
    vi.mocked(authenticatedIpcFetch).mockResolvedValue({
      ok: true,
      json: async () => expected,
    } as Response);
    await expect(evaluateNetGatePolicy('api.example.com', 'WhitelistedOnly', 'STANDARD', {
      purpose: expected.purpose,
      documentId: 'doc-1',
    })).resolves.toMatchObject({ entry: { verdict: 'Allowed' } });

    vi.mocked(authenticatedIpcFetch).mockResolvedValue({
      ok: true,
      json: async () => ({ ...expected, success: true }),
    } as Response);
    await expect(evaluateNetGatePolicy('api.example.com', 'WhitelistedOnly', 'STANDARD', {
      purpose: expected.purpose,
      documentId: 'doc-1',
    })).resolves.toMatchObject({ entry: { verdict: 'BlockedByDefault' } });
  });

  it('does not evaluate response getters', async () => {
    let getterCalls = 0;
    const response = {
      ...expected,
      get verdict() {
        getterCalls += 1;
        return 'Allowed';
      },
    };
    vi.mocked(invokeNative).mockResolvedValue(response);

    await expect(evaluateNetGatePolicy('api.example.com', 'WhitelistedOnly', 'STANDARD', {
      purpose: expected.purpose,
      documentId: 'doc-1',
    })).resolves.toMatchObject({ entry: { verdict: 'BlockedByDefault' } });
    expect(getterCalls).toBe(0);
  });
});
