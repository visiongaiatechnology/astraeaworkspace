// STATUS: Messwerkzeug — KEIN Zeuge.
//
// Zweck: die GROESSE des Zeitkanals messen, nicht seine Existenz behaupten. Der Zeuge, der die
// EIGENSCHAFT sichert, steht in `vaultCredentialTimingProperty.test.ts`; dieses Werkzeug liefert nur
// die Zahlen, die die Schwere belegen. Es enthaelt bewusst keine `expect`-Zusage: eine
// Laufzeitmessung ist in dieser Umgebung nicht stabil genug fuer eine Zusage.
//
// Standardmaessig uebersprungen, damit der Testlauf in CI nicht von Zeitmessung abhaengt.
// Lauf (reproduzierbar):
//   $env:VGT_VAULT_TIMING_PROBE='1'
//   $env:TEMP="$PWD\logs\rtemp"; $env:TMP=$env:TEMP
//   npx vitest run ui/src/apps/vault/testing/security/vaultTimingProbe.test.ts `
//     --exclude "**/open-core/**" --exclude "**/premium/**" --exclude "**/node_modules/**"
import { describe, it } from 'vitest';
import type { KeyVaultStatus } from '../../../../shared/contracts/workspace';
import {
  DEFAULT_VAULT_KEY_POLICY,
  VAULT_CREDENTIAL_MAXIMUM_LENGTH,
  normalizeVaultKeyPolicy,
  validateVaultUiSessionGate,
} from '../../../../shared/vault/security/vaultKeyPolicyEngine';
import { compareVaultCredentials } from '../../../../shared/vault/security/vaultCredentialComparison';

const policy = normalizeVaultKeyPolicy({ ...DEFAULT_VAULT_KEY_POLICY, protectionMode: 'portable_password' });
const secret = 'A'.repeat(127) + 'Z';              // 128 Zeichen, das erlaubte Maximum
const differFirst = 'B' + 'A'.repeat(127);         // Unterschied an Position 0
const differLast = 'A'.repeat(127) + 'Y';          // Unterschied an Position 127
const status: KeyVaultStatus = {
  coreConnected: true,
  isLocked: false,
  platform: 'probe',
  hasPin: false,
  privacyMode: false,
};

function gateRuns(supplied: string, iterations: number): number {
  const started = process.hrtime.bigint();
  for (let index = 0; index < iterations; index += 1) {
    try {
      validateVaultUiSessionGate(policy, supplied, secret, status);
    } catch {
      // Erwartet: der Vergleich weist ab. Genau dieser Wurf wird gemessen.
    }
  }
  return Number(process.hrtime.bigint() - started) / iterations;
}

function builtinCompare(left: string, right: string, iterations: number): number {
  let sink = 0;
  const started = process.hrtime.bigint();
  for (let index = 0; index < iterations; index += 1) {
    if (left !== right) sink += 1;
  }
  const elapsed = Number(process.hrtime.bigint() - started) / iterations;
  if (sink < 0) throw new Error('unreachable');
  return elapsed;
}

function foldedCompare(left: string, right: string, bound: number, iterations: number): number {
  let sink = 0;
  const started = process.hrtime.bigint();
  for (let index = 0; index < iterations; index += 1) {
    let mismatch = left.length ^ right.length;
    for (let position = 0; position < bound; position += 1) {
      mismatch |= left.charCodeAt(position) ^ right.charCodeAt(position);
    }
    if (mismatch === 0) sink += 1;
  }
  const elapsed = Number(process.hrtime.bigint() - started) / iterations;
  if (sink < 0) throw new Error('unreachable');
  return elapsed;
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function spread(values: readonly number[]): number {
  return Math.max(...values) - Math.min(...values);
}

describe.runIf(process.env.VGT_VAULT_TIMING_PROBE === '1')('Messwerkzeug: Kanalbreite', () => {
  it('misst die Kanalbreite des Gate-Vergleichs', () => {
    const warmup = 200_000;
    gateRuns(differFirst, warmup);
    gateRuns(differLast, warmup);

    const gateIterations = 200_000;
    const gateFirst: number[] = [];
    const gateLast: number[] = [];
    for (let round = 0; round < 7; round += 1) {
      gateFirst.push(gateRuns(differFirst, gateIterations));
      gateLast.push(gateRuns(differLast, gateIterations));
    }

    const compareIterations = 20_000_000;
    const builtinFirst = builtinCompare(differFirst, secret, compareIterations);
    const builtinLast = builtinCompare(differLast, secret, compareIterations);
    const foldedFirst = foldedCompare(differFirst, secret, 128, 2_000_000);
    const foldedLast = foldedCompare(differLast, secret, 128, 2_000_000);

    const report = {
      gate_ns_differ_at_position_0: mean(gateFirst),
      gate_ns_differ_at_position_127: mean(gateLast),
      gate_spread_ns_first: spread(gateFirst),
      gate_spread_ns_last: spread(gateLast),
      gate_delta_ns: mean(gateLast) - mean(gateFirst),
      builtin_neq_ns_differ_first: builtinFirst,
      builtin_neq_ns_differ_last: builtinLast,
      builtin_neq_delta_ns: builtinLast - builtinFirst,
      folded_ns_differ_first: foldedFirst,
      folded_ns_differ_last: foldedLast,
      folded_delta_ns: foldedLast - foldedFirst,
      worst_case_theoretical_channel_width_ops: 127,
    };
    process.stdout.write(`PROBE ${JSON.stringify(report, null, 2)}\n`);
  }, 600_000);

  it('nennt die vier Zahlen des Auftraggebers', () => {
    const PASSWORD = 'korrekte-pferde-batterie';
    const cases = {
      a_vollstaendig_gleich: PASSWORD,
      b_letztes_zeichen_anders: PASSWORD.slice(0, -1) + 'X',
      c_erstes_zeichen_anders: 'X' + PASSWORD.slice(1),
      d_ein_zeichen_kuerzer: PASSWORD.slice(0, -1),
    };
    const numbers: Record<string, number> = {};
    for (const [name, supplied] of Object.entries(cases)) {
      numbers[name] = compareVaultCredentials(supplied, PASSWORD, VAULT_CREDENTIAL_MAXIMUM_LENGTH).steps;
    }
    const distinct = new Set(Object.values(numbers)).size;
    process.stdout.write(`VIER_ZAHLEN ${JSON.stringify({ ...numbers, verschiedene_werte: distinct }, null, 2)}\n`);
  });
});
