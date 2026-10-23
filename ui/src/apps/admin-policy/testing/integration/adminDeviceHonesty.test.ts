// STATUS: PLATIN — Ehrlichkeit der Geräteübersicht.
//
// **Der Befund, den dieser Test festhält:** die Oberfläche rechnete die Bereitstellungsentscheidung mit
// `signatureVerified: true` als Literal. Eine geprüfte Installer-Signatur wurde damit **behauptet**,
// ohne dass irgendetwas geprüft wurde. Der Test vergleicht beide Wege: derselbe Aufruf mit
// `signatureVerified: true` erlaubt, mit dem ehrlichen `false` verweigert er benannt.
import { describe, expect, it } from 'vitest';
import {
  evaluateDeviceDeployment,
  evaluateKnownDeviceDeployment,
  registerLocalDevice,
} from '../../devices/adminDevicePolicyCore';
import { DEFAULT_ADMIN_POLICY_MODEL, type AdminPolicyModel, type RegisteredDevice } from '../../model/types';
import { verifyAuditTrail } from '../../compliance/adminAuditCore';

const clone = (): AdminPolicyModel => JSON.parse(JSON.stringify(DEFAULT_ADMIN_POLICY_MODEL)) as AdminPolicyModel;

function withRelease(): AdminPolicyModel {
  const model = clone();
  model.deployment.approvedReleases = [{
    version: '1.2.0', sequence: 1, channel: 'stable', artifactSha256: 'b'.repeat(64),
    signatureKeyId: 'release-key', approvedAt: 0, rollbackApproved: false,
  }];
  model.deployment.minimumVersion = '1.0.0';
  return model;
}

const device: RegisteredDevice = {
  id: 'device-local', name: 'This device', os: 'Windows', workspaceVersion: '1.1.0',
  groupIds: [], policyState: 'unknown', lastSeenAt: 0,
};

describe('device deployment honesty', () => {
  it('claims no verified installer signature and names the missing proof', () => {
    const model = withRelease();
    const honest = evaluateKnownDeviceDeployment(model, device);
    expect(honest.note).toBe('installer-signature-not-verified-in-policy-ui');
    expect(honest.evaluation?.allowed).toBe(false);
    expect(honest.evaluation?.reason).toBe('signature-not-verified');

    // Derselbe Aufruf mit der früheren Behauptung hätte erlaubt — das war der Defekt.
    const claimed = evaluateDeviceDeployment(model, device, '1.2.0', 'stable', {
      artifactSha256: 'b'.repeat(64), signatureKeyId: 'release-key', signatureVerified: true,
    });
    expect(claimed.allowed).toBe(true);
    expect(claimed.reason).toBe('approved-signed-release');
  });

  it('reports no approved release instead of inventing one', () => {
    const evaluation = evaluateKnownDeviceDeployment(clone(), device);
    expect(evaluation.evaluation).toBeNull();
    expect(evaluation.note).toBe('no-approved-release');
  });

  it('records only the local device and audits the registration', async () => {
    let model = clone();
    model = await registerLocalDevice(model, { id: 'device-a', name: 'A', os: 'Windows', workspaceVersion: '1.0.0' }, 'local-owner', 1_000);
    model = await registerLocalDevice(model, { id: 'device-b', name: 'B', os: 'Windows', workspaceVersion: '1.0.0' }, 'local-owner', 2_000);
    expect(model.devices.map((entry) => entry.id)).toEqual(['device-a', 'device-b']);
    expect(model.audit.events.map((event) => event.action)).toEqual(['device.register-local', 'device.register-local']);
    expect(await verifyAuditTrail(model.audit)).toMatchObject({ ok: true, lastSequence: 2 });
    // Zwei Registrierungen in EINER Instanz: beide bleiben, und die zweite verliert die erste nicht.
    expect(model.devices).toHaveLength(2);
  });

  it('refuses an invalid version or an empty identifier by name', async () => {
    await expect(registerLocalDevice(clone(), { id: 'x', name: 'X', os: 'Windows', workspaceVersion: 'v1' }, 'local-owner')).rejects.toThrow(/admin-device-invalid/);
    await expect(registerLocalDevice(clone(), { id: '', name: 'X', os: 'Windows', workspaceVersion: '1.0.0' }, 'local-owner')).rejects.toThrow(/admin-device-invalid/);
  });
});
