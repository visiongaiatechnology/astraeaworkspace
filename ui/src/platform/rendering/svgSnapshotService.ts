// STATUS: DIAMANT VGT SUPREME — deterministic vector screenshot/export service
import type { RenderSnapshotPage, RenderSnapshotPrimitive } from './renderTypes';
import { managedColorToCss, parseManagedColor } from './colorManagement';

function xml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function n(value: number | undefined): string {
  if (value === undefined) return '0';
  if (!Number.isFinite(value)) throw new Error('render_svg_non_finite');
  return String(Math.round(value * 1000) / 1000);
}

function color(value: string | undefined): string {
  return managedColorToCss(parseManagedColor(value ?? '#000000'));
}

function primitiveSvg(item: RenderSnapshotPrimitive): string {
  if (item.kind === 'text') return `<text data-source-id="${xml(item.sourceId ?? '')}" x="${n(item.x)}" y="${n(item.y)}" fill="${color(item.color)}" font-family="sans-serif">${xml(item.text ?? '')}</text>`;
  if (item.kind === 'rect') return `<rect data-source-id="${xml(item.sourceId ?? '')}" x="${n(item.x)}" y="${n(item.y)}" width="${n(item.width)}" height="${n(item.height)}" fill="${color(item.color)}"/>`;
  if (item.kind === 'line') return `<line data-source-id="${xml(item.sourceId ?? '')}" x1="${n(item.x)}" y1="${n(item.y)}" x2="${n(item.x + (item.width ?? 0))}" y2="${n(item.y + (item.height ?? 0))}" stroke="${color(item.color)}"/>`;
  return `<rect data-source-id="${xml(item.sourceId ?? '')}" x="${n(item.x)}" y="${n(item.y)}" width="${n(item.width)}" height="${n(item.height)}" fill="#cbd5e1"/>`;
}

export function createDeterministicSvgSnapshot(page: RenderSnapshotPage): string {
  if (page.primitives.length > 2_000_000) throw new Error('render_svg_primitive_limit');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n(page.geometry.width)}" height="${n(page.geometry.height)}" viewBox="0 0 ${n(page.geometry.width)} ${n(page.geometry.height)}">${page.primitives.map(primitiveSvg).join('')}</svg>`;
}
