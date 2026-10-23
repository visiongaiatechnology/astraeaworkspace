// STATUS: GOLD — library search/instantiation oracles, plus proof the search rule is not duplicated.
import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { DrawModelError, installStencilLibrary, searchStencils } from '../../model/drawDocumentEngine';
import { assertDrawDocument } from '../../model/drawDocumentValidation';
import {
  BUILTIN_DRAW_STENCIL_LIBRARY,
  BUILTIN_DRAW_STENCIL_LIBRARY_ID,
  findDrawStencil,
  instantiateDrawStencil,
  listDrawShapeCategories,
  searchDrawShapes,
} from '../../interactions/drawStencilCatalog';
import { buildDrawModel } from './drawInteractionFixtures';

const CATALOG_SOURCE = fileURLToPath(new URL('../../interactions/drawStencilCatalog.ts', import.meta.url));

function customLibrary() {
  return {
    id: 'custom-lib',
    name: 'Custom',
    version: 1,
    stencils: [
      {
        id: 'custom-lib:special',
        libraryId: 'custom-lib',
        category: 'Custom',
        name: 'Special Widget',
        tags: ['widget', 'custom'],
        objectTemplate: {
          type: 'shape',
          name: 'Special Widget',
          x: 0,
          y: 0,
          width: 90,
          height: 50,
          rotation: 0,
          flipX: false,
          flipY: false,
          opacity: 1,
          locked: false,
          vector: { kind: 'rectangle', style: {} },
        },
      },
    ],
  };
}

describe('Draw stencil catalog (package 02)', () => {
  it('ships a non-empty built-in library with unique ids and every category populated', () => {
    expect(BUILTIN_DRAW_STENCIL_LIBRARY.stencils.length).toBeGreaterThanOrEqual(20);
    const ids = BUILTIN_DRAW_STENCIL_LIBRARY.stencils.map((stencil) => stencil.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const stencil of BUILTIN_DRAW_STENCIL_LIBRARY.stencils) {
      expect(stencil.libraryId).toBe(BUILTIN_DRAW_STENCIL_LIBRARY_ID);
      expect(stencil.name.trim().length).toBeGreaterThan(0);
      expect(stencil.tags.length).toBeGreaterThan(0);
      expect(stencil.objectTemplate.vector?.kind).toBeTruthy();
    }
    expect(listDrawShapeCategories()).toContain('Flowchart');
    expect(listDrawShapeCategories()).toContain('Network');
  });

  it('finds shapes by name, category and synonym tag, case-insensitively', () => {
    const model = buildDrawModel();
    expect(searchDrawShapes(model, 'firewall').map((stencil) => stencil.name)).toContain('Firewall');
    expect(searchDrawShapes(model, 'entscheidung').map((stencil) => stencil.name)).toContain('Decision');
    expect(searchDrawShapes(model, 'SWITCH').map((stencil) => stencil.name)).toContain('Switch');
    expect(searchDrawShapes(model, 'uml').length).toBeGreaterThan(3);
    expect(searchDrawShapes(model, '', 'Network').every((stencil) => stencil.category === 'Network')).toBe(true);
    expect(searchDrawShapes(model, 'zzzz-no-such-shape')).toEqual([]);
    expect(() => searchDrawShapes(model, 42)).toThrowError(DrawModelError);
  });

  it('merges document libraries with the built-in library without shadowing it', () => {
    const model = installStencilLibrary(buildDrawModel(), customLibrary());
    const all = searchDrawShapes(model, '');
    expect(all.map((stencil) => stencil.id)).toContain('custom-lib:special');
    expect(all.map((stencil) => stencil.id)).toContain(`${BUILTIN_DRAW_STENCIL_LIBRARY_ID}:process`);
    expect(searchDrawShapes(model, 'widget').map((stencil) => stencil.name)).toEqual(['Special Widget']);
  });

  it('delegates matching to the canonical searchStencils rule instead of re-implementing it', async () => {
    const source = await readFile(CATALOG_SOURCE, 'utf8');
    const stripped = source.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, '');
    expect(stripped).toContain('searchStencils(view, query, category)');
    // No second matcher: the module must not build its own lowercase haystack.
    expect(stripped).not.toContain('toLocaleLowerCase');
    expect(stripped).not.toContain('indexOf(');
    // The document view is what gets handed to the canonical rule.
    const model = installStencilLibrary(buildDrawModel(), customLibrary());
    const view = { ...model, stencils: [BUILTIN_DRAW_STENCIL_LIBRARY, ...model.stencils] };
    expect(searchDrawShapes(model, 'firewall').map((stencil) => stencil.id))
      .toEqual(searchStencils(view, 'firewall').map((stencil) => stencil.id));
  });

  it('instantiates a shape at the requested position with a deterministic id', () => {
    const model = buildDrawModel();
    const first = instantiateDrawStencil(model, 'draw-core-shapes:router', 'page-1', 'layer-main', { x: 120, y: 240 }, { idSeed: 'seed' });
    expect(first.x).toBe(120);
    expect(first.y).toBe(240);
    expect(first.layerId).toBe('layer-main');
    expect(first.type).toBe('shape');
    expect(first.vector?.kind).toBe('icon');
    expect(first.richText?.runs[0]?.text).toBe('Router');
    expect(first.id.startsWith('seed-')).toBe(true);
    expect(() => instantiateDrawStencil(model, 'draw-core-shapes:router', 'page-1', 'layer-main', { x: 0, y: 0 }, { idSeed: 'seed' }))
      .not.toThrow();
  });

  it('rejects unknown stencils, unknown pages, foreign layers and non-finite positions', () => {
    const model = buildDrawModel();
    expect(() => findDrawStencil(model, 'draw-core-shapes:not-real')).toThrowError(DrawModelError);
    expect(() => instantiateDrawStencil(model, 'draw-core-shapes:router', 'page-9', 'layer-main', { x: 0, y: 0 })).toThrowError(DrawModelError);
    expect(() => instantiateDrawStencil(model, 'draw-core-shapes:router', 'page-1', 'layer-nope', { x: 0, y: 0 })).toThrowError(DrawModelError);
    expect(() => instantiateDrawStencil(model, 'draw-core-shapes:router', 'page-1', 'layer-main', { x: Number.NaN, y: 0 })).toThrowError(DrawModelError);
    expect(() => findDrawStencil(model, '')).toThrowError(DrawModelError);
    expect(assertDrawDocument(model)).toBeUndefined();
  });
});
