// STATUS: GOLD — Paket 15 (AST-1307): fremdes SVG als sichere vektorielle Form, benannte Auslassungen.
//
// Der Test hält die Grenze fest, die diese Zone **nicht** überschreitet: Grundformen werden verlustfrei
// gelesen, alles andere wird **benannt** ausgelassen — und Rasterinhalt ist ein **benannter** Fall, weil
// Draw kein Bildobjekt führt (keine Attrappe, kein stiller Verlust).
import { describe, expect, it } from 'vitest';
import { DRAW_FOREIGN_SVG_LIMITS, importForeignDrawSvg } from '../../import-export/drawSvgVectorImport';
import { importDrawSvg, buildDrawSvg } from '../../import-export/drawInterchangeCore';
import { createEmptyDrawDocument } from '../../model/drawDocumentEngine';
import { projectDrawScene } from '../../interactions/drawSceneProjection';
import { describeDrawSceneNode } from '../../interactions/drawSceneRenderModel';

const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">${body}</svg>`;

describe('Paket 15 — fremdes SVG als sichere vektorielle Form', () => {
  it('reads rect, circle, ellipse, line, polyline and polygon into real Draw shapes', () => {
    const source = svg([
      '<rect x="10" y="20" width="30" height="40" fill="#ff0000" stroke="#000000" stroke-width="2"/>',
      '<circle cx="100" cy="100" r="25"/>',
      '<ellipse cx="150" cy="60" rx="30" ry="10"/>',
      '<line x1="0" y1="0" x2="50" y2="50" stroke="#00ff00"/>',
      '<polyline points="10,10 20,30 40,10"/>',
      '<polygon points="60,60 80,60 80,80 60,80"/>',
    ].join(''));
    const result = importForeignDrawSvg(source, createEmptyDrawDocument());
    expect(result.imported).toEqual(['circle', 'ellipse', 'line', 'polygon', 'polyline', 'rect']);
    expect(result.omitted).toEqual([]);
    const scene = projectDrawScene(result.model, result.model.activePageId);
    expect(scene.entries.length).toBe(6);
    // Die Geometrie stimmt: `rect` wird zur Box an (10,20)/(30,40), die Farbe kommt aus dem Attribut.
    const rect = scene.entries.find((entry) => entry.object.name.startsWith('rect'))!.object;
    expect({ x: rect.x, y: rect.y, width: rect.width, height: rect.height }).toEqual({ x: 10, y: 20, width: 30, height: 40 });
    expect(rect.vector?.style.fill).toBe('#ff0000');
    expect(rect.vector?.style.strokeWidth).toBe(2);
    // Die Kreisform bleibt eine Ellipse mit echter Ausdehnung.
    const circle = scene.entries.find((entry) => entry.object.name.startsWith('circle'))!.object;
    expect(describeDrawSceneNode(circle).shape).toEqual({ kind: 'ellipse', cx: 100, cy: 100, rx: 25, ry: 25 });
    const line = scene.entries.find((entry) => entry.object.name.startsWith('line'))!.object;
    expect(describeDrawSceneNode(line).shape?.kind).toBe('line');
  });

  it('names what it does not read instead of silently simplifying it', () => {
    const source = svg('<path d="M0 0 L10 10"/><text x="1" y="2">Hi</text><use href="#x"/><rect width="5" height="5"/>');
    const result = importForeignDrawSvg(source, createEmptyDrawDocument());
    expect(result.imported).toEqual(['rect']);
    expect(result.omitted).toEqual(['path', 'text', 'use']);
  });

  it('refuses raster content by name, because Draw owns no image object', () => {
    const source = svg('<image href="data:image/png;base64,AAAA" width="10" height="10"/><rect width="5" height="5"/>');
    expect(() => importForeignDrawSvg(source, createEmptyDrawDocument())).toThrowError(/svg-raster-content-unsupported/);
  });

  it('refuses active content through the SAME hardening as the metadata import', () => {
    for (const hostile of [
      svg('<script>alert(1)</script><rect width="5" height="5"/>'),
      svg('<rect width="5" height="5" onload="alert(1)"/>'),
      svg('<foreignObject><div>x</div></foreignObject>'),
    ]) {
      expect(() => importForeignDrawSvg(hostile, createEmptyDrawDocument())).toThrowError(/svg-active-content-rejected/);
    }
    // **Gemessene Nuance (Befund dieser Runde):** ein Farbwert `url(javascript:…)` passiert die Härtung und
    // wird erst vom **Farbnormalisierer** benannt abgelehnt (`style-color-invalid`) — fail-closed, aber mit
    // einem anderen Grund. Eine pauschale `url(`-Regel in der Härtung wäre **falsch**: Astraeas eigener
    // Export benutzt `marker-end="url(#vgt-arrow)"`, und ein erneuter Import würde daran scheitern.
    expect(() => importForeignDrawSvg(svg('<rect width="5" height="5" fill="url(javascript:alert(1))"/>'), createEmptyDrawDocument()))
      .toThrowError(/style-color-invalid/);
  });

  it('fails closed on an empty drawing, a foreign page, a bad layer and a bad source', () => {
    const base = createEmptyDrawDocument();
    expect(() => importForeignDrawSvg(svg('<path d="M0 0"/>'), base)).toThrowError(/svg-no-vector-content/);
    expect(() => importForeignDrawSvg(svg('<rect width="5" height="5"/>'), base, 'page-nope')).toThrowError(/page-missing/);
    expect(() => importForeignDrawSvg(svg('<rect width="5" height="5"/>'), base, 'page-1', 'layer-nope')).toThrowError(/object-layer-missing/);
    // @ts-expect-error — absichtlich kein Text.
    expect(() => importForeignDrawSvg(null, base)).toThrowError(/svg-source-invalid/);
  });

  it('caps the number of read elements instead of reading without bound', () => {
    const many = Array.from({ length: DRAW_FOREIGN_SVG_LIMITS.maxElements + 1 }, () => '<rect width="1" height="1"/>').join('');
    expect(() => importForeignDrawSvg(svg(many), createEmptyDrawDocument())).toThrowError(/svg-element-limit/);
  });

  it('writes through a single transaction and lists every object once', () => {
    const result = importForeignDrawSvg(svg('<rect width="5" height="5"/><rect x="10" width="5" height="5"/>'), createEmptyDrawDocument());
    const page = result.model.pages.find((candidate) => candidate.id === result.model.activePageId)!;
    expect(page.objectIds.length).toBe(2);
    expect(new Set(page.objectIds).size).toBe(2);
    expect(Object.keys(result.model.objects).length).toBe(2);
    // Die z-Reihenfolge folgt der Reihenfolge im SVG.
    const scene = projectDrawScene(result.model, result.model.activePageId);
    expect(scene.entries.map((entry) => entry.object.name)).toEqual(['rect 1', 'rect 2']);
  });

  it('keeps the Astraea metadata route untouched (one hardening, two readers)', () => {
    const model = createEmptyDrawDocument();
    const own = buildDrawSvg(model, model.activePageId);
    expect(importDrawSvg(own)).toEqual(model);
    // Und die Metadaten-Route lehnt fremdes SVG weiterhin **benannt** ab.
    expect(() => importDrawSvg(svg('<rect width="5" height="5"/>'))).toThrowError(/svg-semantic-metadata-missing/);
  });
});
