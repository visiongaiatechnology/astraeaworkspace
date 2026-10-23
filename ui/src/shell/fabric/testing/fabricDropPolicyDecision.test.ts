// The drop path must obtain a policy decision, and it must refuse when it cannot.
//
// ## The defect this pins
//
// The drop resolver refuses a drop unless the caller supplies a real policy decision:
//
//   const policyEffect = dropPolicyEffectOf(request.requestedPolicyDecision);
//   if (policyEffect === undefined) return rejected('drop_policy_decision_required');
//
// No production caller ever supplied one. `precheckPolicy` — the single authority — was called in exactly
// one place in the whole tree, `shell/workspace/useWorkspaceActions.ts`, and that call is for `'file.export'`.
// The fabric modal asked for a verdict without a decision at both of its entry points, so **every**
// cross-app drop was refused with `drop_policy_decision_required`. The suites stayed green because the tests
// pass `{ effect: 'Allow' }` in themselves, so nothing ever exercised the real absence.
//
// The source even carried the marker: *"die Entscheidung steht hier noch nicht bereit … und wird
// vorübergehend als `Allow` weitergereicht"* — a transition marker that was never resolved.
//
// ## What is asserted
//
// 1. the new authority helper **fails closed**: with the native core unreachable it answers `Deny` with a
//    named reason, rather than returning nothing for the resolver to interpret;
// 2. that answer, fed to the resolver, is refused for a **named** reason — so the wiring is load-bearing
//    and not decorative;
// 3. the modal calls the helper at **both** entry points, which is the part a type checker cannot see.
//
// ## Counter-check protocol
//
// A. Remove `requestDropPolicyDecision` from either modal call site → case 3 fails, naming that site.
// B. Make the helper return `undefined` on the unreachable path instead of a `Deny` → case 1 fails, and
//    case 2 would fall back to `drop_policy_decision_required`, which is the silent outcome this exists to
//    prevent.
// C. Restore and re-run → green.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import { requestDropPolicyDecision } from '../../../platform/native/nativePolicy';
import { assessFabricWorkspaceDrop, createFabricWorkspaceObjectDragPayload } from '../fabricGraphWorkspaceDrop';

const modalSource = readFileSync(new URL('../FabricGraphModal.tsx', import.meta.url), 'utf8');

const source: WorkspaceDocument = {
  schema_version: 2,
  id: 'grid-source',
  title: 'Forecast',
  kind: 'Grid',
  created_at: 1,
  modified_at: 1,
  version: 3,
  theme_id: 'cosmic-obsidian',
  root_object_ids: ['table-forecast'],
  objects: {
    'table-forecast': {
      type: 'Table',
      data: { id: 'table-forecast', rows: 1, cols: 1, cells: { A1: { value: 'private-cell' } } },
    },
  },
};

const target: WorkspaceDocument = {
  schema_version: 2,
  id: 'writer-target',
  title: 'Report',
  kind: 'Writer',
  created_at: 1,
  modified_at: 1,
  version: 4,
  theme_id: 'cosmic-obsidian',
  root_object_ids: [],
  objects: {},
};

const documents = { [source.id]: source, [target.id]: target };
const builtPayload = createFabricWorkspaceObjectDragPayload(source, source.objects['table-forecast']!);
// The payload builder answers `null` for an object it cannot serialise. That must not happen for this
// fixture; asserting it here keeps the failure legible instead of surfacing as a confusing type error.
if (builtPayload === null) throw new Error('the fixture produced no drag payload');
const payload: string = builtPayload;

describe('the drop path obtains a policy decision and fails closed without one', () => {
  it('the authority helper answers Deny, with a named reason, when the native core is unreachable', async () => {
    // There is no `window.__TAURI_INTERNALS__` in this environment, so this is the unreachable path — the
    // exact situation the helper exists to make legible instead of silent.
    const decision = await requestDropPolicyDecision(target.id);
    expect(decision.effect).toBe('Deny');
    expect(decision.reason_code).toBe('drop_policy_authority_unreachable');
    // And it is a complete decision, not a partial one: the resolver reads `effect` off the object.
    expect(typeof decision.policy_id).toBe('string');
    expect(typeof decision.policy_version).toBe('number');
  });

  it('negative counter-check: that answer is refused for a named reason, not silently accepted', async () => {
    const decision = await requestDropPolicyDecision(target.id);
    const refused = assessFabricWorkspaceDrop(payload, target.id, documents, decision);
    expect(refused.status).toBe('rejected');
    // A `Deny` gets its own name; it must not look like "waiting for approval" or like a missing decision.
    expect(refused).toMatchObject({ status: 'rejected', code: 'drop_policy_denied' });
  });

  it('an absent decision is still refused — the gate was never weakened by this change', () => {
    const refused = assessFabricWorkspaceDrop(payload, target.id, documents);
    expect(refused).toMatchObject({ status: 'rejected', code: 'drop_policy_decision_required' });
  });

  it('both modal entry points ask for the decision', () => {
    // A type checker cannot see this: the parameter is optional, so omitting it compiles. Reading the file
    // is the only way to assert that the call is actually made.
    const calls = modalSource.match(/requestDropPolicyDecision\(/gu) ?? [];
    expect(calls.length, 'expected the helper to be imported and awaited at both entry points').toBe(2);
    // The insert path must pass it into the resolver, and the drop handler into the assessment.
    expect(modalSource).toContain('resolveFabricWorkspaceDrop(payload, activeDocumentId, documents, intent, undefined, decision)');
    expect(modalSource).toContain('assessFabricWorkspaceDrop(raw, activeDocumentId, documents, policyDecision)');
  });
});
