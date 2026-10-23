// STATUS: DIAMANT VGT SUPREME — one canonical layout tree for screen, print and export backends
import type { RenderAccessibilityNode, RenderPageGeometry, RenderSnapshotPage, RenderSnapshotPrimitive, RenderSurfaceKind } from './renderTypes';
import { parseManagedColor } from './colorManagement';
import { renderSnapshotSignature } from './deterministicSnapshot';

export type RenderEffect = 'alpha' | 'blend-mode' | 'filter' | 'mask' | 'clip-path' | 'shadow' | 'vector-path' | 'embedded-font';
export type RenderOutputBackend = 'screen' | 'print' | 'pdf' | 'svg' | 'png';

export interface CanonicalRenderPage {
  id: string;
  geometry: RenderPageGeometry;
  primitives: RenderSnapshotPrimitive[];
  accessibility?: RenderAccessibilityNode;
  effects?: RenderEffect[];
}

export interface CanonicalRenderTree {
  version: 1;
  documentId: string;
  pages: CanonicalRenderPage[];
}

export interface RenderOutputContext {
  backend: RenderOutputBackend;
  surface: RenderSurfaceKind;
  dpi: number;
  colorSpace: 'srgb';
  alphaMode: 'preserve' | 'flatten';
  background?: string;
  strictEffects?: boolean;
}

export interface UnsupportedRenderEffect {
  pageId: string;
  effect: RenderEffect;
  policy: 'unsupported' | 'flatten-required';
}

export interface PreparedRenderOutput {
  context: RenderOutputContext;
  pages: RenderSnapshotPage[];
  signature: string;
  unsupportedEffects: UnsupportedRenderEffect[];
  rasterizationExplicit: boolean;
}

const MAX_RENDER_PAGES = 100_000;
const MAX_PRIMITIVES_PER_PAGE = 2_000_000;
const BACKEND_EFFECTS: Record<RenderOutputBackend, ReadonlySet<RenderEffect>> = {
  screen: new Set(['alpha', 'blend-mode', 'filter', 'mask', 'clip-path', 'shadow', 'vector-path', 'embedded-font']),
  print: new Set(['alpha', 'clip-path', 'shadow', 'vector-path', 'embedded-font']),
  pdf: new Set(['clip-path', 'vector-path', 'embedded-font']),
  svg: new Set(['alpha', 'blend-mode', 'filter', 'mask', 'clip-path', 'shadow', 'vector-path', 'embedded-font']),
  png: new Set(['alpha', 'blend-mode', 'filter', 'mask', 'clip-path', 'shadow', 'vector-path', 'embedded-font']),
};

function assertFinite(value: number, code: string): number {
  if (!Number.isFinite(value)) throw new Error(code);
  return value;
}

function validatePrimitive(item: RenderSnapshotPrimitive): RenderSnapshotPrimitive {
  assertFinite(item.x, 'render_pipeline_non_finite_x');
  assertFinite(item.y, 'render_pipeline_non_finite_y');
  if (item.width !== undefined) assertFinite(item.width, 'render_pipeline_non_finite_width');
  if (item.height !== undefined) assertFinite(item.height, 'render_pipeline_non_finite_height');
  if (item.text && item.text.length > 1_000_000) throw new Error('render_pipeline_text_limit');
  if (item.color) parseManagedColor(item.color);
  return item;
}

export function validateCanonicalRenderTree(tree: CanonicalRenderTree): CanonicalRenderTree {
  if (!tree || typeof tree !== 'object' || tree.version !== 1 || typeof tree.documentId !== 'string' || !tree.documentId || tree.documentId.length > 256) throw new Error('render_pipeline_tree_invalid');
  if (!Array.isArray(tree.pages) || !tree.pages.length || tree.pages.length > MAX_RENDER_PAGES) throw new Error('render_pipeline_page_limit');
  const pageIds = new Set<string>();
  for (const page of tree.pages) {
    if (!page || typeof page !== 'object' || typeof page.id !== 'string' || !page.id || page.id.length > 256 || pageIds.has(page.id)) throw new Error('render_pipeline_page_id_invalid');
    pageIds.add(page.id);
    if (!page.geometry || typeof page.geometry !== 'object') throw new Error('render_pipeline_geometry_invalid');
    for (const value of [page.geometry.width, page.geometry.height, page.geometry.bodyWidth, page.geometry.bodyHeight]) assertFinite(value, 'render_pipeline_geometry_non_finite');
    if (!Array.isArray(page.primitives) || page.primitives.length > MAX_PRIMITIVES_PER_PAGE) throw new Error('render_pipeline_primitive_limit');
    page.primitives.forEach(validatePrimitive);
    if ((page.effects?.length ?? 0) > 64) throw new Error('render_pipeline_effect_limit');
  }
  return tree;
}

export function canonicalTreeToSnapshotPages(tree: CanonicalRenderTree): RenderSnapshotPage[] {
  validateCanonicalRenderTree(tree);
  return tree.pages.map((page) => ({ geometry: page.geometry, primitives: page.primitives.map((primitive) => ({ ...primitive })) }));
}

export function normalizeRenderOutputContext(context: Partial<RenderOutputContext> & Pick<RenderOutputContext, 'backend' | 'surface'>): RenderOutputContext {
  const dpi = assertFinite(context.dpi ?? (context.backend === 'png' ? 144 : 96), 'render_pipeline_dpi_non_finite');
  if (dpi < 36 || dpi > 2400) throw new Error('render_pipeline_dpi_limit');
  const colorSpace = context.colorSpace ?? 'srgb';
  if (colorSpace !== 'srgb') throw new Error('render_pipeline_color_space_unsupported');
  const alphaMode = context.alphaMode ?? (context.backend === 'pdf' || context.backend === 'print' ? 'flatten' : 'preserve');
  if (alphaMode === 'flatten') parseManagedColor(context.background ?? '#ffffff');
  return { backend: context.backend, surface: context.surface, dpi, colorSpace, alphaMode, background: context.background ?? '#ffffff', strictEffects: context.strictEffects ?? false };
}

export function prepareRenderOutput(tree: CanonicalRenderTree, input: Partial<RenderOutputContext> & Pick<RenderOutputContext, 'backend' | 'surface'>): PreparedRenderOutput {
  const context = normalizeRenderOutputContext(input);
  const pages = canonicalTreeToSnapshotPages(tree);
  const supported = BACKEND_EFFECTS[context.backend];
  const unsupportedEffects: UnsupportedRenderEffect[] = [];
  for (const page of tree.pages) {
    for (const effect of page.effects ?? []) {
      if (!supported.has(effect)) unsupportedEffects.push({ pageId: page.id, effect, policy: context.alphaMode === 'flatten' ? 'flatten-required' : 'unsupported' });
    }
    for (const primitive of page.primitives) {
      if (!primitive.color) continue;
      const color = parseManagedColor(primitive.color);
      if (color.a < 0.999 && context.backend === 'pdf') unsupportedEffects.push({ pageId: page.id, effect: 'alpha', policy: 'flatten-required' });
    }
  }
  if (context.strictEffects && unsupportedEffects.length) throw new Error(`render_pipeline_unsupported_effect:${unsupportedEffects[0]!.effect}`);
  return { context, pages, signature: renderSnapshotSignature(pages), unsupportedEffects, rasterizationExplicit: context.backend !== 'png' || context.dpi > 0 };
}

export function compareRenderTargets(tree: CanonicalRenderTree, targets: readonly (Partial<RenderOutputContext> & Pick<RenderOutputContext, 'backend' | 'surface'>)[]): { commonSignature: string; outputs: PreparedRenderOutput[] } {
  if (!targets.length || targets.length > 16) throw new Error('render_pipeline_target_limit');
  const outputs = targets.map((target) => prepareRenderOutput(tree, target));
  const commonSignature = outputs[0]!.signature;
  if (!outputs.every((output) => output.signature === commonSignature)) throw new Error('render_pipeline_geometry_divergence');
  return { commonSignature, outputs };
}
