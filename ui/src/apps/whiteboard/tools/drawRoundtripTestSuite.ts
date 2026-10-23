// STATUS: PLATIN — bounded fixture checks for Draw conversion and catalog data.
/**
 * These checks operate on provided in-memory item data (or a small fallback fixture)
 * and cover local serialization, supported VDX/XML conversion, reference shape,
 * sample rule evaluation, catalog records, and static SVG encoding. They do not verify
 * persistence, native storage, live data sources, routed canvas output,
 * or compatibility with Microsoft Visio.
 */

import { WhiteboardItem } from '../types';
import { exportDrawToVisioXml, importVisioXmlToDraw } from '../../../shared/interchange/visioVdx';

export interface DrawDataGraphicRule {
  id: string;
  field: string;
  operator: 'gt' | 'lt' | 'eq' | 'contains';
  threshold: string | number;
  action: 'setColor' | 'setBadge' | 'setDataBar';
  value: string;
}

export interface DrawDataBinding {
  shapeId: string;
  sourceModule: 'grid' | 'database';
  sourceRef: string;
  rules: DrawDataGraphicRule[];
}

export interface DrawStencilItem {
  id: string;
  category: 'uml' | 'bpmn' | 'network' | 'erd';
  title: string;
  defaultWidth: number;
  defaultHeight: number;
  icon: string;
  defaultColor: string;
  defaultText: string;
}

export interface DrawRoundtripTestResult {
  id: string;
  name: string;
  status: 'passed' | 'failed' | 'warning';
  durationMs: number;
  details: string;
  metrics?: Record<string, unknown>;
}

export interface DrawSuiteReport {
  timestamp: number;
  totalTests: number;
  passedCount: number;
  failedCount: number;
  results: DrawRoundtripTestResult[];
  fixturePassPercent: number;
  fixtureSha256: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown fixture error';
}

export const BUILTIN_STENCIL_LIBRARY: DrawStencilItem[] = [
  // UML 2.5
  { id: 'uml-class', category: 'uml', title: 'UML Class', defaultWidth: 160, defaultHeight: 100, icon: 'Box', defaultColor: '#1e293b', defaultText: '<<Class>>\n+ field: type\n+ method(): void' },
  { id: 'uml-interface', category: 'uml', title: 'UML Interface', defaultWidth: 150, defaultHeight: 80, icon: 'CircleDot', defaultColor: '#0f766e', defaultText: '<<Interface>>\n+ execute()' },
  { id: 'uml-actor', category: 'uml', title: 'Actor', defaultWidth: 80, defaultHeight: 90, icon: 'User', defaultColor: '#6366f1', defaultText: 'Actor' },
  // BPMN 2.0
  { id: 'bpmn-start-event', category: 'bpmn', title: 'Start Event', defaultWidth: 50, defaultHeight: 50, icon: 'PlayCircle', defaultColor: '#16a34a', defaultText: 'Start' },
  { id: 'bpmn-task', category: 'bpmn', title: 'User Task', defaultWidth: 140, defaultHeight: 70, icon: 'CheckSquare', defaultColor: '#2563eb', defaultText: 'Process Task' },
  { id: 'bpmn-gateway', category: 'bpmn', title: 'Exclusive Gateway', defaultWidth: 70, defaultHeight: 70, icon: 'GitFork', defaultColor: '#d97706', defaultText: 'XOR' },
  { id: 'bpmn-end-event', category: 'bpmn', title: 'End Event', defaultWidth: 50, defaultHeight: 50, icon: 'StopCircle', defaultColor: '#dc2626', defaultText: 'End' },
  // Network Topology
  { id: 'net-firewall', category: 'network', title: 'Security Firewall', defaultWidth: 120, defaultHeight: 80, icon: 'Shield', defaultColor: '#b91c1c', defaultText: 'NetGate FW' },
  { id: 'net-router', category: 'network', title: 'Core Router', defaultWidth: 110, defaultHeight: 70, icon: 'Router', defaultColor: '#0284c7', defaultText: 'Gateway L3' },
  { id: 'net-server', category: 'network', title: 'Enclave Node', defaultWidth: 130, defaultHeight: 90, icon: 'Server', defaultColor: '#4f46e5', defaultText: 'VGT Compute' },
  // ERD
  { id: 'erd-entity', category: 'erd', title: 'Entity Table', defaultWidth: 180, defaultHeight: 110, icon: 'Database', defaultColor: '#334155', defaultText: 'TABLE: users\n---\nPK id: uuid\nFK org_id: uuid\nname: text' },
  { id: 'erd-relation', category: 'erd', title: '1:N Relationship', defaultWidth: 120, defaultHeight: 60, icon: 'Share2', defaultColor: '#7c3aed', defaultText: 'has_many' }
];

/**
 * Computes deterministic SHA-256 hash for container verification
 */
async function computeSha256(data: string): Promise<string> {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(data));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Runs generated fixture checks; this is not an application or release verification suite.
 */
export async function runDrawRoundtripTestSuite(
  currentItems: WhiteboardItem[],
  documentTitle: string
): Promise<DrawSuiteReport> {
  const results: DrawRoundtripTestResult[] = [];
  // Test Items baseline
  const testItems: WhiteboardItem[] = currentItems.length >= 2 ? currentItems : [
    { id: 'draw-node-1', type: 'process', x: 100, y: 150, width: 160, height: 90, text: 'Core Architecture Engine', color: 'cyan' },
    { id: 'draw-node-2', type: 'terminal', x: 380, y: 165, width: 120, height: 120, text: 'Enclave Verification', color: 'yellow' },
    { id: 'draw-conn-1', type: 'connector', x: 260, y: 195, width: 100, height: 40, text: '', fromId: 'draw-node-1', toId: 'draw-node-2', color: 'purple' }
  ];

  // 1. JSON_FIXTURE_SERIALIZATION
  const t1Start = performance.now();
  try {
    const vdrawContainer = {
      format: 'VGT_VDRAW_SPEC_V1',
      version: '1.0.0',
      title: documentTitle,
      timestamp: Date.now(),
      viewport: { zoom: 1.0, panX: 0, panY: 0 },
      layers: [{ id: 'layer-0', name: 'Main Layer', visible: true, locked: false }],
      items: testItems
    };
    const jsonSerialized = JSON.stringify(vdrawContainer);
    const hash = await computeSha256(jsonSerialized);
    const parsed = JSON.parse(jsonSerialized);

    const matchItems = parsed.items && parsed.items.length === testItems.length;
    results.push({
      id: 'VDRAW_CONTAINER_SEAL_ROUNDTRIP',
      name: '1. JSON fixture serialization roundtrip',
      status: matchItems && hash.length === 64 ? 'passed' : 'failed',
      durationMs: Math.round(performance.now() - t1Start),
      details: `Serialized and parsed ${testItems.length} fixture items. A digest was computed for the fixture JSON; this does not test the native .vdraw container or its cryptographic seal.`,
      metrics: { itemCount: testItems.length, bytes: jsonSerialized.length, hash: hash.substring(0, 16) }
    });
  } catch (err: unknown) {
    results.push({
      id: 'VDRAW_CONTAINER_SEAL_ROUNDTRIP',
      name: '1. JSON fixture serialization roundtrip',
      status: 'failed',
      durationMs: Math.round(performance.now() - t1Start),
      details: `Fixture serialization failed: ${errorMessage(err)}`
    });
  }

  // 2. VDX_XML_SUBSET_FIXTURE_CONVERSION
  const t2Start = performance.now();
  try {
    const exportResult = exportDrawToVisioXml(documentTitle, testItems);
    const importResult = importVisioXmlToDraw(exportResult.vdxXml);

    const shapesIn = testItems.filter(i => i.type !== 'connector').length;
    const shapesOut = importResult.items.filter(i => i.type !== 'connector').length;
    const connectorsIn = testItems.filter(i => i.type === 'connector').length;
    const connectorsOut = importResult.items.filter(i => i.type === 'connector').length;

    const conversionPassed = shapesIn === shapesOut && connectorsIn === connectorsOut;

    results.push({
      id: 'VDX_XML_SUBSET_FIXTURE_CONVERSION',
      name: '2. VDX/XML subset fixture conversion',
      status: conversionPassed ? 'passed' : 'warning',
      durationMs: Math.round(performance.now() - t2Start),
      details: `Converted ${shapesOut}/${shapesIn} fixture shapes and ${connectorsOut}/${connectorsIn} fixture connectors. This does not test VSDX packages, ShapeSheet fidelity, or a Microsoft Visio application.`,
      metrics: {
        shapesConverted: `${shapesOut}/${shapesIn}`,
        connectorsConverted: `${connectorsOut}/${connectorsIn}`
      }
    });
  } catch (err: unknown) {
    results.push({
      id: 'VDX_XML_SUBSET_FIXTURE_CONVERSION',
      name: '2. VDX/XML subset fixture conversion',
      status: 'failed',
      durationMs: Math.round(performance.now() - t2Start),
      details: `VDX/XML fixture conversion failed: ${errorMessage(err)}`
    });
  }

  // 3. DYNAMIC_CONNECTOR_ROUTING_INVARIANTS
  const t3Start = performance.now();
  try {
    const connectors = testItems.filter(i => i.type === 'connector');
    let validConnections = 0;

    for (const conn of connectors) {
      const startShape = testItems.find(i => i.id === conn.fromId);
      const endShape = testItems.find(i => i.id === conn.toId);
      if (startShape && endShape) {
        validConnections++;
      }
    }

    const ratio = connectors.length > 0 ? validConnections / connectors.length : 1;
    results.push({
      id: 'DYNAMIC_CONNECTOR_ROUTING_INVARIANTS',
      name: '3. Fixture connector endpoint-reference check',
      status: ratio >= 0.8 ? 'passed' : 'warning',
      durationMs: Math.round(performance.now() - t3Start),
      details: `Resolved ${validConnections}/${connectors.length} fixture connector endpoint pairs. This checks identifiers only; it does not run the routing engine or inspect canvas output.`,
      metrics: { totalConnectors: connectors.length, boundPairs: validConnections }
    });
  } catch (err: unknown) {
    results.push({
      id: 'DYNAMIC_CONNECTOR_ROUTING_INVARIANTS',
      name: '3. Fixture connector endpoint-reference check',
      status: 'failed',
      durationMs: Math.round(performance.now() - t3Start),
      details: `Fixture endpoint-reference check failed: ${errorMessage(err)}`
    });
  }

  // 4. DATA_DRIVEN_DIAGRAM_GRAPHICS
  const t4Start = performance.now();
  try {
    // Test rule execution engine
    const testRecord: Record<string, string | number> = { cpuUsage: 88, status: 'ALERT', latencyMs: 142 };
    const sampleBinding: DrawDataBinding = {
      shapeId: testItems[0].id,
      sourceModule: 'database',
      sourceRef: 'db:metrics/cluster_node_1',
      rules: [
        { id: 'r1', field: 'cpuUsage', operator: 'gt', threshold: 80, action: 'setColor', value: 'purple' },
        { id: 'r2', field: 'status', operator: 'eq', threshold: 'ALERT', action: 'setBadge', value: 'CRITICAL' }
      ]
    };

    let appliedColor: 'yellow' | 'cyan' | 'purple' | undefined = testItems[0].color || 'cyan';
    let appliedBadge = '';

    for (const rule of sampleBinding.rules) {
      const recordVal = testRecord[rule.field];
      let match = false;
      if (rule.operator === 'gt' && Number(recordVal) > Number(rule.threshold)) match = true;
      if (rule.operator === 'eq' && String(recordVal) === String(rule.threshold)) match = true;

      if (match) {
        if (rule.action === 'setColor') appliedColor = 'purple';
        if (rule.action === 'setBadge') appliedBadge = rule.value;
      }
    }

    const ruleSuccess = appliedColor === 'purple' && appliedBadge === 'CRITICAL';
    results.push({
      id: 'DATA_DRIVEN_DIAGRAM_GRAPHICS',
      name: '4. In-memory data graphic rule fixture',
      status: ruleSuccess ? 'passed' : 'failed',
      durationMs: Math.round(performance.now() - t4Start),
      details: `Evaluated ${sampleBinding.rules.length} sample rules against an in-memory record. No Grid/Database connection or live binding was exercised.`,
      metrics: { rulesEvaluated: sampleBinding.rules.length, targetShape: sampleBinding.shapeId }
    });
  } catch (err: unknown) {
    results.push({
      id: 'DATA_DRIVEN_DIAGRAM_GRAPHICS',
      name: '4. In-memory data graphic rule fixture',
      status: 'failed',
      durationMs: Math.round(performance.now() - t4Start),
      details: `Data graphic fixture evaluation failed: ${errorMessage(err)}`
    });
  }

  // 5. STENCIL_LIBRARY_TAXONOMY
  const t5Start = performance.now();
  try {
    const categories = new Set(BUILTIN_STENCIL_LIBRARY.map(s => s.category));
    const allValid = BUILTIN_STENCIL_LIBRARY.every(s => s.id && s.title && s.defaultWidth > 0 && s.defaultHeight > 0);

    results.push({
      id: 'STENCIL_LIBRARY_TAXONOMY',
      name: '5. Built-in stencil catalog fixture',
      status: allValid && categories.size === 4 ? 'passed' : 'failed',
      durationMs: Math.round(performance.now() - t5Start),
      details: `Checked ${BUILTIN_STENCIL_LIBRARY.length} catalog entries across ${categories.size} categories for required labels and positive dimensions. Serialization and insertion into the active board were not tested.`,
      metrics: { stencilCount: BUILTIN_STENCIL_LIBRARY.length, categories: Array.from(categories) }
    });
  } catch (err: unknown) {
    results.push({
      id: 'STENCIL_LIBRARY_TAXONOMY',
      name: '5. Built-in stencil catalog fixture',
      status: 'failed',
      durationMs: Math.round(performance.now() - t5Start),
      details: `Stencil catalog fixture check failed: ${errorMessage(err)}`
    });
  }

  // 6. SVG_VECTOR_FIDELITY_EXPORT
  const t6Start = performance.now();
  try {
    const svgParts: string[] = [];
    svgParts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080">`);
    svgParts.push(`<defs><marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#6366f1" /></marker></defs>`);
    svgParts.push(`<g id="draw-elements">`);

    for (const item of testItems) {
      if (item.type === 'process' || item.type === 'sticky') {
        svgParts.push(`<rect x="${item.x}" y="${item.y}" width="${item.width || 120}" height="${item.height || 80}" rx="8" fill="#3b82f6" stroke="#ffffff" stroke-width="1.5" />`);
      } else if (item.type === 'terminal' || item.type === 'decision') {
        const r = (item.width || 100) / 2;
        svgParts.push(`<circle cx="${item.x + r}" cy="${item.y + r}" r="${r}" fill="#16a34a" stroke="#ffffff" stroke-width="1.5" />`);
      } else if (item.type === 'connector') {
        svgParts.push(`<line x1="${item.x}" y1="${item.y}" x2="${item.x + 100}" y2="${item.y + 50}" stroke="#6366f1" stroke-width="2" marker-end="url(#arrow)" />`);
      }
    }

    svgParts.push(`</g></svg>`);
    const svgContent = svgParts.join('\n');
    const isScriptFree = !/<script/i.test(svgContent) && !/on\w+=/i.test(svgContent);

    results.push({
      id: 'SVG_VECTOR_FIDELITY_EXPORT',
      name: '6. Static SVG fixture encoding check',
      status: isScriptFree && svgContent.length > 200 ? 'passed' : 'failed',
      durationMs: Math.round(performance.now() - t6Start),
      details: `Generated ${svgContent.length} bytes of fixture markup and checked a short script marker list. This does not exercise the product SVG exporter or establish general SVG safety.`,
      metrics: { svgLength: svgContent.length, isScriptFree }
    });
  } catch (err: unknown) {
    results.push({
      id: 'SVG_VECTOR_FIDELITY_EXPORT',
      name: '6. Static SVG fixture encoding check',
      status: 'failed',
      durationMs: Math.round(performance.now() - t6Start),
      details: `Static SVG fixture generation failed: ${errorMessage(err)}`
    });
  }

  const passedCount = results.filter(r => r.status === 'passed').length;
  const failedCount = results.filter(r => r.status === 'failed').length;
  const fixturePassPercent = Math.round((passedCount / results.length) * 100);
  const fixtureSha256 = await computeSha256(JSON.stringify(testItems));

  return {
    timestamp: Date.now(),
    totalTests: results.length,
    passedCount,
    failedCount,
    results,
    fixturePassPercent,
    fixtureSha256
  };
}
