import { describe, expect, it } from 'vitest';
import type { WhiteboardItem } from '../../../apps/whiteboard/types';
import { exportDrawToVisioXml, importVisioXmlToDraw, VisioInteropError } from '../../../shared/interchange/visioVdx';

const VDX_NS = 'http://schemas.microsoft.com/visio/2003/core';

function item(overrides: Partial<WhiteboardItem> = {}): WhiteboardItem {
  return {
    id: 'node-1',
    type: 'shape',
    x: 24,
    y: 48,
    width: 120,
    height: 60,
    rotation: 90,
    text: 'A < B & "C"',
    name: 'Node <one> & "two"',
    shape: { kind: 'ellipse', fill: '#abc', stroke: '#112233', strokeWidth: 2.5 },
    ...overrides,
  };
}

function documentXml(shapes: string, pages = 1): string {
  const pageNodes = Array.from({ length: pages }, (_, index) => `<Page ID="${index}"><Shapes>${shapes}</Shapes></Page>`).join('');
  return `<VisioDocument xmlns="${VDX_NS}"><Pages>${pageNodes}</Pages></VisioDocument>`;
}

function shape(id: number, name = 'Rectangle'): string {
  return `<Shape ID="${id}" Type="Shape" NameU="${name}"><XForm><PinX Unit="MM">25.4</PinX><PinY Unit="MM">25.4</PinY><Width Unit="MM">50.8</Width><Height Unit="MM">25.4</Height></XForm></Shape>`;
}

describe('Visio VDX/XML subset conversion', () => {
  it('escapes exported content and preserves supported shape geometry on import', () => {
    const exported = exportDrawToVisioXml('Drawing <&"', [item()]);

    expect(exported.vdxXml).toContain('<Title>Drawing &lt;&amp;&quot;</Title>');
    expect(exported.vdxXml).toContain('NameU="Node &lt;one&gt; &amp; &quot;two&quot;"');
    expect(exported.vdxXml).toContain('A &lt; B &amp; &quot;C&quot;');
    expect(exported.vdxXml).not.toContain('A < B');
    expect(exported.vdxXml).toContain(`<VisioDocument xmlns="${VDX_NS}"`);
    expect(exported.vdxXml).toContain('<Ellipse IX="1">');
    expect(exported.vdxXml).toContain('<Data1>');
    expect(exported.vdxXml).toContain('<PinX Unit="MM">22.225000</PinX>');
    expect(exported.vdxXml).toContain('<PinY Unit="MM">20.637500</PinY>');

    const imported = importVisioXmlToDraw(exported.vdxXml);
    expect(imported.items).toHaveLength(1);
    expect(imported.items[0]).toMatchObject({
      type: 'shape',
      y: 48,
      text: 'A < B & "C"',
      name: 'Node <one> & "two"',
      shape: { kind: 'ellipse', fill: '#abc', stroke: '#112233', strokeWidth: 2.5 },
    });
    expect(imported.items[0]?.x).toBeCloseTo(24, 5);
    expect(imported.items[0]?.width).toBeCloseTo(120, 5);
    expect(imported.items[0]?.height).toBeCloseTo(60, 5);
    expect(imported.items[0]?.rotation).toBeCloseTo(90, 5);
    expect(imported.conversion.foreignXmlPreserved).toBe(false);
    expect(imported.conversion.activeContentExecuted).toBe(false);
    expect(imported.conversion.summary).toContain('single-page Visio 2003 VDX subset');
  });

  it('imports namespaced VDX and resolves page-level connector targets after remapping ids', () => {
    const xml = `<v:VisioDocument xmlns:v="${VDX_NS}"><v:Pages><v:Page ID="0"><v:Shapes>`
      + '<v:Shape ID="1" Type="Shape" NameU="Rectangle"><v:XForm><v:PinX Unit="MM">25.4</v:PinX><v:PinY Unit="MM">25.4</v:PinY><v:Width Unit="MM">50.8</v:Width><v:Height Unit="MM">25.4</v:Height></v:XForm><v:Text>Source &amp; target</v:Text></v:Shape>'
      + '<v:Shape ID="2" Type="Shape" NameU="Flowchart_Decision"><v:XForm><v:PinX Unit="MM">76.2</v:PinX><v:PinY Unit="MM">25.4</v:PinY><v:Width Unit="MM">50.8</v:Width><v:Height Unit="MM">25.4</v:Height></v:XForm></v:Shape>'
      + '<v:Shape ID="3" Type="Shape" NameU="Connector"><v:XForm1D><v:BeginX Unit="MM">25.4</v:BeginX><v:BeginY Unit="MM">25.4</v:BeginY><v:EndX Unit="MM">76.2</v:EndX><v:EndY Unit="MM">25.4</v:EndY></v:XForm1D></v:Shape>'
      + '</v:Shapes><v:Connects><v:Connect FromSheet="3" FromCell="BeginX" ToSheet="1" ToCell="PinX"/><v:Connect FromSheet="3" FromCell="BeginY" ToSheet="1" ToCell="PinY"/><v:Connect FromSheet="3" FromCell="EndX" ToSheet="2" ToCell="PinX"/><v:Connect FromSheet="3" FromCell="EndY" ToSheet="2" ToCell="PinY"/></v:Connects></v:Page></v:Pages></v:VisioDocument>';
    const imported = importVisioXmlToDraw(xml);
    const source = imported.items.find((candidate) => candidate.type === 'process');
    const target = imported.items.find((candidate) => candidate.type === 'decision');
    const connector = imported.items.find((candidate) => candidate.type === 'connector');

    expect(source).toMatchObject({ x: 0, y: 48, width: 192, height: 96, text: 'Source & target' });
    expect(target).toBeDefined();
    expect(connector?.fromId).toBe(source?.id);
    expect(connector?.toId).toBe(target?.id);
    expect(imported.conversion.shapesConvertedCount).toBe(2);
    expect(imported.conversion.connectorsConvertedCount).toBe(1);
  });

  it('exports numeric VDX shape ids, page-level connections, and interoperable geometry', () => {
    const start = item({ id: 'start-node', type: 'process', name: 'Start node', x: 10, y: 12, width: 80, height: 50, text: 'Start' });
    const end = item({ id: 'end-node', type: 'decision', name: 'End node', x: 220, y: 112, width: 90, height: 70, text: 'End' });
    const edge = item({ id: 'edge-1', type: 'connector', x: 0, y: 0, width: 0, height: 0, fromId: start.id, toId: end.id });
    const exported = exportDrawToVisioXml('Connections', [start, end, edge]).vdxXml;

    expect(exported).toContain('<Shape ID="1"');
    expect(exported).toContain('<Shape ID="2"');
    expect(exported).toContain('<Shape ID="3"');
    expect(exported).toContain('<XForm1D>');
    expect(exported).toContain('<Connects><Connect FromSheet="3" FromCell="BeginX" ToSheet="1" ToCell="PinX"/>');
    expect(exported).toContain('<Geom IX="0">');
    const shapeSection = exported.slice(exported.indexOf('<Shapes>'), exported.indexOf('</Shapes>'));
    expect(shapeSection).not.toContain('<Connects>');

    const imported = importVisioXmlToDraw(exported);
    const importedStart = imported.items.find((candidate) => candidate.name === start.name);
    const importedEnd = imported.items.find((candidate) => candidate.name === end.name);
    const importedEdge = imported.items.find((candidate) => candidate.type === 'connector');
    expect(importedEdge?.fromId).toBe(importedStart?.id);
    expect(importedEdge?.toId).toBe(importedEnd?.id);
    expect(imported.conversion.shapesConvertedCount).toBe(2);
    expect(imported.conversion.connectorsConvertedCount).toBe(1);
  });

  it('rejects malformed, ambiguous, unsupported, multi-page, or invalid geometry input', () => {
    expect(() => importVisioXmlToDraw('<!DOCTYPE VisioDocument><VisioDocument/>')).toThrow(VisioInteropError);
    expect(() => importVisioXmlToDraw(documentXml('<Shape ID="1" id="2" NameU="Rectangle"/>'))).toThrow(/attribute-ambiguous/u);
    expect(() => importVisioXmlToDraw(documentXml('<Shape ID="1" NameU="UnknownMaster"/>'))).toThrow(/item-kind-unsupported/u);
    expect(() => importVisioXmlToDraw(documentXml('<Shape ID="1" NameU="Rectangle"><XForm><PinX>0</PinX><PinY>0</PinY><Width Unit="MM">-1</Width><Height>80</Height></XForm></Shape>'))).toThrow(/geometry-invalid/u);
    expect(() => importVisioXmlToDraw(documentXml('<Shape ID="1" NameU="Rectangle"/>', 2))).toThrow(/page-count-unsupported/u);
    expect(() => importVisioXmlToDraw(documentXml('<Shape ID="one" NameU="Rectangle"/><Group><Shape ID="nested" NameU="Rectangle"/></Group>'))).toThrow(/shape-element-unsupported/u);
  });

  it('rejects connector references to missing shapes, connectors, and duplicate source ids', () => {
    const connector = (id: number) => `<Shape ID="${id}" Type="Shape"><XForm1D><BeginX>0</BeginX><BeginY>0</BeginY><EndX>20</EndX><EndY>20</EndY></XForm1D></Shape>`;
    const connects = (source: number, from: number, to: number) => `<Connect FromSheet="${source}" FromCell="BeginX" ToSheet="${from}" ToCell="PinX"/><Connect FromSheet="${source}" FromCell="EndX" ToSheet="${to}" ToCell="PinX"/>`;
    const nodes = `${shape(1)}${shape(2)}`;
    expect(() => importVisioXmlToDraw(documentXml(`${nodes}${connector(3)}`))).toThrow(/connector-reference-invalid/u);
    const missingTarget = `<VisioDocument xmlns="${VDX_NS}"><Pages><Page ID="0"><Shapes>${shape(1)}${connector(3)}</Shapes><Connects>${connects(3, 1, 99)}</Connects></Page></Pages></VisioDocument>`;
    expect(() => importVisioXmlToDraw(missingTarget)).toThrow(/connector-reference-invalid/u);
    const duplicateConnector = `<VisioDocument xmlns="${VDX_NS}"><Pages><Page ID="0"><Shapes>${nodes}${connector(3)}${connector(4)}</Shapes><Connects>${connects(3, 1, 2)}${connects(4, 3, 2)}</Connects></Page></Pages></VisioDocument>`;
    expect(() => importVisioXmlToDraw(duplicateConnector)).toThrow(/connector-reference-invalid/u);
    expect(() => importVisioXmlToDraw(documentXml('<Shape ID="1" NameU="Rectangle"/><Shape ID="1" NameU="Rectangle"/>'))).toThrow(/source-id-duplicate/u);
  });

  it('rejects duplicate ids, unsafe colors, unsupported items, and invalid connector graphs on export', () => {
    expect(() => exportDrawToVisioXml('x', [item(), item()])).toThrow(/item-id-duplicate/u);
    expect(() => exportDrawToVisioXml('x', [item({ shape: { kind: 'rectangle', fill: 'url(javascript:alert(1))', stroke: '#000', strokeWidth: 1 } })])).toThrow(/item-fill-invalid/u);
    expect(() => exportDrawToVisioXml('x', [item({ type: 'image' })])).toThrow(/item-kind-unsupported/u);
    expect(() => exportDrawToVisioXml('x', [item({ type: 'connector', fromId: 'missing', toId: 'also-missing' })])).toThrow(/connector-reference-invalid/u);
  });
});
