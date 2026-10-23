// STATUS: PLATIN — Vertragstest des signierten Organisationsmanifests.
//
// Die Signatur wird hier wirklich mit Ed25519 erzeugt und geprüft (WebCrypto), nicht simuliert: der
// Test kann deshalb nur grün sein, wenn `verifyOrganizationPolicyManifest` die Bytes tatsächlich
// verifiziert. Und er prüft den fail-closed-Rückfall, den die Oberfläche anwendet.
import { describe, expect, it } from 'vitest';
import {
  decodeRootPublicKey,
  manifestSignedBytes,
  verifySignedPolicyManifest,
} from '../../interchange/adminPolicyInterchange';
import { strictestAdminPolicy } from '../../model/adminStrictestPolicy';
import { DEFAULT_ADMIN_POLICY_MODEL, type AdminPolicyModel } from '../../model/types';
import { evaluateAdminOperation, materializeGuarded } from '../../enforcement/adminEnforcementCore';
import { hasAdminCapability } from '../../security/adminRbacCore';
import type { SignedOrganizationPolicyManifest } from '../../security/adminPolicySignatureCore';
import { toOwnedArrayBuffer } from '../../../../shared/binary/ownedBufferSource';

const clone = (): AdminPolicyModel => JSON.parse(JSON.stringify(DEFAULT_ADMIN_POLICY_MODEL)) as AdminPolicyModel;

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function keypair(): Promise<{ raw: Uint8Array; sign: (bytes: Uint8Array) => Promise<string> }> {
  const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  return {
    raw,
    sign: async (bytes: Uint8Array) => toBase64(new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, pair.privateKey, toOwnedArrayBuffer(bytes)))),
  };
}

async function signedManifest(payload: AdminPolicyModel): Promise<{ manifest: SignedOrganizationPolicyManifest<AdminPolicyModel>; raw: Uint8Array }> {
  const keys = await keypair();
  const unsigned = { schema: 'vgt.admin.signed-policy/1' as const, keyId: 'enterprise-root-1', payload };
  const signatureBase64 = await keys.sign(manifestSignedBytes(unsigned));
  return { manifest: { ...unsigned, signatureBase64 }, raw: keys.raw };
}

describe('signed organization policy manifest', () => {
  it('accepts a manifest whose Ed25519 signature really verifies and applies its payload', async () => {
    const payload = clone();
    payload.dlp.defaultAction = 'block';
    payload.organization.name = 'Signed Organization';
    const { manifest, raw } = await signedManifest(payload);

    const outcome = await verifySignedPolicyManifest(clone(), manifest, raw);
    expect(outcome.accepted).toBe(true);
    expect(outcome.reason).toBe('verified-enterprise-root');
    expect(outcome.model.organization.name).toBe('Signed Organization');
    expect(outcome.model.dlp.defaultAction).toBe('block');
  });

  it('falls back to the strictest policy when the payload is changed after signing', async () => {
    const payload = clone();
    payload.dlp.defaultAction = 'audit';
    const { manifest, raw } = await signedManifest(payload);
    const tampered: SignedOrganizationPolicyManifest<AdminPolicyModel> = {
      ...manifest,
      payload: { ...manifest.payload, dlp: { ...manifest.payload.dlp, defaultAction: 'audit', rules: [] }, organization: { ...manifest.payload.organization, name: 'Tampered' } },
    };

    const outcome = await verifySignedPolicyManifest(clone(), tampered, raw);
    expect(outcome.accepted).toBe(false);
    expect(outcome.reason).toBe('signature-invalid');
    expect(outcome.model.dlp.defaultAction).toBe('block');
    expect(outcome.model.network.netGateCapabilities).toEqual([]);
    expect(outcome.model.network.remoteContentDefault).toBe('deny');
    expect(outcome.model.privacy.externalDestinations.every((destination) => !destination.enabled)).toBe(true);
  });

  it('refuses a root key that is not 32 bytes and a payload that is not a policy document', async () => {
    const { manifest, raw } = await signedManifest(clone());
    const wrongLength = await verifySignedPolicyManifest(clone(), manifest, raw.subarray(0, 16));
    expect(wrongLength.accepted).toBe(false);
    expect(wrongLength.reason).toBe('manifest-invalid');

    const unusable = { schema: 'vgt.admin.signed-policy/1' as const, keyId: 'k', payload: { schema: 'not-a-policy' }, signatureBase64: manifest.signatureBase64 };
    const unusableOutcome = await verifySignedPolicyManifest(clone(), unusable, raw);
    expect(unusableOutcome.accepted).toBe(false);
    expect(unusableOutcome.reason).toBe('signature-invalid');
  });

  it('keeps the strictest fallback administrable and the operations really denied', async () => {
    const strict = strictestAdminPolicy(clone());
    // Administration bleibt möglich, sonst wäre der Zustand nicht reparierbar.
    expect(hasAdminCapability(strict, 'local-owner', 'policy.write', { kind: 'organization', id: strict.organization.id })).toBe(true);
    expect(strict.assignments).toEqual(DEFAULT_ADMIN_POLICY_MODEL.assignments);
    expect(strict.audit).toEqual(DEFAULT_ADMIN_POLICY_MODEL.audit);

    // Operationen werden wirklich verweigert, und es entsteht nichts.
    let produced = 0;
    const guard = materializeGuarded(strict, {
      operation: 'grid.link.share-external', actorId: 'local-owner', scope: { kind: 'organization', id: strict.organization.id },
      subject: { objectId: 'doc', label: 'internal', metadata: {}, content: 'harmless' }, destinationKind: 'external',
    }, () => { produced += 1; return 'bytes'; });
    expect(guard.allowed).toBe(false);
    expect(guard.decision.detail).toBe('dlp-block');
    expect(produced).toBe(0);

    const telemetry = evaluateAdminOperation(strict, { operation: 'network.telemetry', actorId: 'local-owner', scope: { kind: 'organization', id: strict.organization.id }, connector: { capabilityId: 'cap', host: 'example.com', protocol: 'https', purpose: 'telemetry' } });
    expect(telemetry.allowed).toBe(false);
  });

  it('decodes a root key from hex and from base64 and refuses anything else', async () => {
    const { raw } = await signedManifest(clone());
    const hex = Array.from(raw, (byte) => byte.toString(16).padStart(2, '0')).join('');
    expect(Array.from(decodeRootPublicKey(hex))).toEqual(Array.from(raw));
    expect(Array.from(decodeRootPublicKey(toBase64(raw)))).toEqual(Array.from(raw));
    expect(() => decodeRootPublicKey('')).toThrow(/admin-root-key-length/);
    expect(() => decodeRootPublicKey('zz')).toThrow(/admin-root-key-length/);
    expect(() => decodeRootPublicKey('a'.repeat(5000))).toThrow(/admin-root-key-length/);
  });
});
