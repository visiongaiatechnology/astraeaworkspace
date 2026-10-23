import { describe, expect, it } from 'vitest';
import type { DrawDocumentModel, DrawObject, DrawPage } from '../../../../shared/contracts/draw/workspaceDraw';
import { createEmptyDrawDocument, DrawModelError } from '../../model/drawDocumentEngine';
import {
  buildDrawClipboardBundle,
  buildDrawPrintProjection,
  buildDrawSvg,
  importDrawSvg,
  importDrawVisio,
  exportDrawVisio,
  unpackNativeDraw,
} from '../../import-export/drawInterchangeCore';

function makeObject(id: string, name = id, pageId = 'page-1'): DrawObject {
  return {
    id,
    pageId,
    layerId: 'layer-main',
    type: 'shape',
    name,
    x: 12,
    y: 24,
    width: 80,
    height: 48,
    rotation: 0,
    flipX: false,
    flipY: false,
    opacity: 1,
    locked: false,
    zIndex: 0,
  };
}

function makeModel(objects: DrawObject[] = [], includeSecondPage = false): DrawDocumentModel {
  const base = createEmptyDrawDocument();
  const pageOne = { ...base.pages[0], objectIds: objects.filter((object) => object.pageId === 'page-1').map((object) => object.id) };
  const pages: DrawPage[] = includeSecondPage
    ? [pageOne, {
      ...pageOne,
      id: 'page-2',
      name: 'Page 2',
      objectIds: objects.filter((object) => object.pageId === 'page-2').map((object) => object.id),
      printableBounds: { ...pageOne.printableBounds },
    }]
    : [pageOne];
  return {
    ...base,
    pages,
    objects: Object.fromEntries(objects.map((object) => [object.id, object])),
  };
}

describe('Draw interchange core', () => {
  it('renders the requested page and roundtrips the full semantic document', () => {
    const model = makeModel([makeObject('shape-a'), makeObject('shape-b', 'Hidden page object', 'page-2')], true);

    const svg = buildDrawSvg(model, 'page-1');

    expect(svg).toContain('data-vgt-id="shape-a"');
    expect(svg).not.toContain('data-vgt-id="shape-b"');
    expect(importDrawSvg(svg)).toEqual(model);
  });

  it('renders Draw connectors from the obstacle-aware routed path', () => {
    const connector: DrawObject = {
      ...makeObject('connector'),
      type: 'connector',
      connector: {
        from: { objectId: 'source', anchor: 'right' },
        to: { objectId: 'target', anchor: 'left' },
        route: 'orthogonal',
        autoRoute: true,
        waypoints: [],
        obstacleAvoidance: true,
        routingPriority: 0,
        crossingStyle: 'none',
        semantic: { label: 'depends on' },
        arrowStart: 'none',
        arrowEnd: 'triangle',
      },
    };
    const source = { ...makeObject('source'), x: 0, y: 0, width: 20, height: 20 };
    const target = { ...makeObject('target'), x: 100, y: 0, width: 20, height: 20 };
    const blocker = { ...makeObject('blocker'), x: 45, y: -5, width: 20, height: 30 };
    const model = makeModel([source, target, blocker, connector]);

    const svg = buildDrawSvg(model);

    expect(svg).toContain('<path d="M 20 10 L 20 -12 L 100 -12 L 100 10"');
    expect(svg).toContain('>depends on</text>');
    expect(svg).not.toContain('<line x1="10" y1="10" x2="110" y2="10"');
  });

  it('escapes user text in rendered SVG while preserving it in semantic metadata', () => {
    const name = '<script>alert("&")</script>';
    const model = makeModel([makeObject('shape-a', name)]);
    const svg = buildDrawSvg(model);

    expect(svg).toContain('&lt;script&gt;alert(&quot;&amp;&quot;)&lt;/script&gt;');
    expect(svg).not.toContain('<script>alert');
    expect(importDrawSvg(svg).objects['shape-a'].name).toBe(name);
  });

  it('rejects active SVG content before accepting semantic metadata', () => {
    const source = buildDrawSvg(makeModel()).replace('</svg>', '<script>alert(1)</script></svg>');

    expect(() => importDrawSvg(source)).toThrowError(DrawModelError);
  });

  it('rejects non-canonical base64 metadata padding', () => {
    const source = '<svg xmlns="http://www.w3.org/2000/svg"><metadata id="vgt-draw">AB==</metadata></svg>';

    expect(() => importDrawSvg(source)).toThrowError(DrawModelError);
  });

  it('exports only selected page objects to clipboard and rejects unknown selections', () => {
    const model = makeModel([makeObject('shape-a'), makeObject('shape-b')]);

    const bundle = buildDrawClipboardBundle(model, ['shape-a']);
    const semantic = JSON.parse(bundle.semanticJson) as { format: string; model: DrawDocumentModel };

    expect(semantic.format).toBe('VGT_DRAW_CLIPBOARD_V1');
    expect(semantic.model.pages[0].objectIds).toEqual(['shape-a']);
    expect(Object.keys(semantic.model.objects)).toEqual(['shape-a']);
    expect(() => buildDrawClipboardBundle(model, ['missing-object'])).toThrowError(DrawModelError);
  });

  it('projects print bounds and preserves Draw shapes through Visio interchange', () => {
    const model = makeModel([makeObject('shape-a', 'Architecture')]);
    const projection = buildDrawPrintProjection(model);
    const exported = exportDrawVisio('Architecture', model);
    const imported = importDrawVisio(exported.xml, createEmptyDrawDocument());

    expect(projection.svg).toBe(buildDrawSvg(model));
    expect(projection.printableBounds).toEqual(model.pages[0].printableBounds);
    expect(imported.model.pages[0].objectIds).toHaveLength(1);
    expect(Object.values(imported.model.objects)[0].name).toBe('Architecture');
  });

  it('rejects unencrypted native containers and invalid container lengths', async () => {
    const unencrypted = new Uint8Array(16);
    unencrypted.set(new TextEncoder().encode('JSON'));

    await expect(unpackNativeDraw(unencrypted)).rejects.toBeInstanceOf(DrawModelError);
    await expect(unpackNativeDraw(new Uint8Array(15))).rejects.toBeInstanceOf(DrawModelError);
  });

  it('maps shared VDX codec errors into the Draw model error contract', () => {
    expect(() => importDrawVisio('<!DOCTYPE VisioDocument><VisioDocument/>', createEmptyDrawDocument()))
      .toThrowError(DrawModelError);
  });
});
