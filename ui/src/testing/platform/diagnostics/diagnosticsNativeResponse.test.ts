// STATUS: PLATIN — validates the complete native diagnostics response before projection.
import { describe, expect, it } from 'vitest';
import { validateNativeDiagnosticsSnapshot } from '../../../platform/diagnostics/diagnostics';

function validSnapshot() {
  return {
    runtime: {
      product_version: '0.1.0-beta.1',
      build_hash: 'a'.repeat(40),
      release_channel: 'beta',
      platform: 'windows',
      architecture: 'x86_64',
      build_profile: 'release',
      core_provider: 'vgt-core/native-tauri',
    },
    health: {
      schema: 'vgt.diagnostics.runtime-health/1',
      features: [{ id: 'core.connectivity', state: 'pass' }],
      providers: [{ id: 'vgt-core.native', available: true, hardware_backed_verified: false }],
      self_tests: [{ id: 'runtime-info', state: 'pass', error_id: null }],
      recent_errors: [{ error_id: 'ERR-001', component: 'workspace', summary: 'Local error recorded.' }],
    },
    debug: { enabled: false, enabled_until_ms: null },
    safe_mode: { enabled: true, third_party_plugins_enabled: false, automations_enabled: false, network_enabled: false },
    logs: [{ sequence: 1, timestamp_ms: 10, severity: 'Info', component: 'diagnostics', event_id: 'snapshot', message: 'Captured.', fields: { count: 1 } }],
  };
}

describe('validateNativeDiagnosticsSnapshot', () => {
  it('projects a complete bounded native response into the diagnostics runtime contract', () => {
    expect(validateNativeDiagnosticsSnapshot(validSnapshot())).toMatchObject({
      product_version: '0.1.0-beta.1',
      build_hash: 'a'.repeat(40),
      release_channel: 'beta',
      feature_states: [{ id: 'core.connectivity', state: 'pass' }],
      self_tests: [{ id: 'runtime-info', state: 'pass', error_id: null }],
      debug_mode: { enabled: false, enabled_until_ms: null },
      safe_mode: { enabled: true, network_enabled: false },
    });
  });

  it('rejects malformed health, impossible release fields, and oversized response arrays', () => {
    const malformedHealth = validSnapshot();
    malformedHealth.health.features = [{ id: 'invalid id', state: 'pass' }];
    expect(validateNativeDiagnosticsSnapshot(malformedHealth)).toBeNull();

    const unknownState = validSnapshot();
    unknownState.health.features = [{ id: 'core.connectivity', state: 'unknown' }];
    expect(validateNativeDiagnosticsSnapshot(unknownState)).toBeNull();

    const oversized = validSnapshot();
    oversized.logs = Array.from({ length: 129 }, () => validSnapshot().logs[0]);
    expect(validateNativeDiagnosticsSnapshot(oversized)).toBeNull();

    const invalidVersion = validSnapshot();
    invalidVersion.runtime.product_version = 'x'.repeat(65);
    expect(validateNativeDiagnosticsSnapshot(invalidVersion)).toBeNull();
  });

  it('rejects accessors and sparse response arrays without executing code', () => {
    let getterCalls = 0;
    const snapshot = validSnapshot();
    const runtime = Object.defineProperty(snapshot.runtime, 'platform', {
      enumerable: true,
      get: () => { getterCalls += 1; return 'windows'; },
    });
    expect(validateNativeDiagnosticsSnapshot({ ...snapshot, runtime })).toBeNull();

    const sparse = validSnapshot();
    sparse.health.features = Array(1);
    expect(validateNativeDiagnosticsSnapshot(sparse)).toBeNull();
    expect(getterCalls).toBe(0);
  });
});
