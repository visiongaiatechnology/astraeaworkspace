// STATUS: DIAMANT VGT SUPREME — fail-closed evidence and bounded parser boundary before untrusted render input reaches layout truth
import { validateCanonicalRenderTree, type CanonicalRenderTree } from './renderPipeline';
import { throwIfRenderCancelled } from './resourceSafety';

export interface RenderInputEvidence {
  authenticity: 'verified' | 'unverified' | 'failed';
  integrity: 'verified' | 'unverified' | 'failed';
  policy: 'allowed' | 'denied' | 'unknown';
  parser: 'validated' | 'malformed' | 'unsupported';
}

const MAX_RENDER_JSON_BYTES = 32 * 1024 * 1024;
const MAX_JSON_DEPTH = 160;
const MAX_JSON_NODES = 4_000_000;

export function assertRenderInputEvidence(evidence: RenderInputEvidence): void {
  if (evidence.authenticity !== 'verified') throw new Error('render_boundary_authenticity_rejected');
  if (evidence.integrity !== 'verified') throw new Error('render_boundary_integrity_rejected');
  if (evidence.policy !== 'allowed') throw new Error('render_boundary_policy_rejected');
  if (evidence.parser !== 'validated') throw new Error(evidence.parser === 'unsupported' ? 'render_boundary_parser_unsupported' : 'render_boundary_parser_malformed');
}

function validateJsonShape(root: unknown, signal?: AbortSignal): void {
  const stack: Array<{ value: unknown; depth: number }> = [{ value: root, depth: 0 }];
  let nodes = 0;
  while (stack.length) {
    if (++nodes % 256 === 0) throwIfRenderCancelled(signal, 'render-parser');
    if (nodes > MAX_JSON_NODES) throw new Error('render_boundary_json_node_limit');
    const { value, depth } = stack.pop()!;
    if (depth > MAX_JSON_DEPTH) throw new Error('render_boundary_json_depth_limit');
    if (!value || typeof value !== 'object') continue;
    if (Array.isArray(value)) {
      for (let index = value.length - 1; index >= 0; index -= 1) stack.push({ value: value[index], depth: depth + 1 });
    } else {
      for (const child of Object.values(value as Record<string, unknown>)) stack.push({ value: child, depth: depth + 1 });
    }
  }
}

function coerceCanonicalRenderTree(value: unknown): CanonicalRenderTree {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('render_boundary_root_invalid');
  const root = value as Record<string, unknown>;
  if (root.version !== 1 || typeof root.documentId !== 'string' || !Array.isArray(root.pages)) throw new Error('render_boundary_schema_invalid');
  return validateCanonicalRenderTree(root as unknown as CanonicalRenderTree);
}

export function parseCanonicalRenderTreeJson(json: string, evidence: RenderInputEvidence, signal?: AbortSignal): CanonicalRenderTree {
  assertRenderInputEvidence(evidence);
  throwIfRenderCancelled(signal, 'render-parser');
  if (typeof json !== 'string') throw new Error('render_boundary_json_type_invalid');
  const bytes = new TextEncoder().encode(json).length;
  if (bytes === 0 || bytes > MAX_RENDER_JSON_BYTES) throw new Error('render_boundary_json_size_limit');
  let parsed: unknown;
  try { parsed = JSON.parse(json) as unknown; } catch { throw new Error('render_boundary_json_malformed'); }
  validateJsonShape(parsed, signal);
  return coerceCanonicalRenderTree(parsed);
}

export function fuzzRenderTreeBoundary(inputs: readonly string[], evidence: RenderInputEvidence, signal?: AbortSignal): { accepted: number; rejected: number } {
  if (inputs.length > 100_000) throw new Error('render_boundary_fuzz_input_limit');
  let accepted = 0; let rejected = 0;
  for (let index = 0; index < inputs.length; index += 1) {
    if (index % 128 === 0) throwIfRenderCancelled(signal, 'render-fuzz');
    try { parseCanonicalRenderTreeJson(inputs[index]!, evidence, signal); accepted += 1; } catch { rejected += 1; }
  }
  return { accepted, rejected };
}
