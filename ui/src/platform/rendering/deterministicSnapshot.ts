// STATUS: DIAMANT VGT SUPREME — deterministic render/export snapshot signatures
import type { RenderSnapshotPage, RenderSnapshotPrimitive } from './renderTypes';
import { geometrySignature } from './renderGeometry';

function round(value: number | undefined): number | undefined { return value === undefined ? undefined : Math.round(value * 1000) / 1000; }
function canonicalPrimitive(item: RenderSnapshotPrimitive): Record<string, unknown> {
  return {
    kind: item.kind, x: round(item.x), y: round(item.y), width: round(item.width), height: round(item.height),
    text: item.text?.normalize('NFC'), color: item.color?.toLowerCase(), font: item.font, sourceId: item.sourceId,
  };
}

export function canonicalRenderSnapshot(pages: readonly RenderSnapshotPage[]): string {
  if (pages.length > 100_000) throw new Error('render_snapshot_page_limit');
  return JSON.stringify(pages.map((page) => ({ geometry: geometrySignature(page.geometry), primitives: page.primitives.map(canonicalPrimitive) })));
}

export function fnv1a64(input: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const bytes = new TextEncoder().encode(input);
  for (const byte of bytes) { hash ^= BigInt(byte); hash = BigInt.asUintN(64, hash * prime); }
  return hash.toString(16).padStart(16, '0');
}

export function renderSnapshotSignature(pages: readonly RenderSnapshotPage[]): string {
  return fnv1a64(canonicalRenderSnapshot(pages));
}
