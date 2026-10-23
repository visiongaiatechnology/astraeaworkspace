// STATUS: PLATIN
// Bounded Whiteboard diagnostic suite; fixture checks do not claim external-application fidelity.

import { WOM_SCHEMA_VERSION } from '../../../shared/contracts/workspace';
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import { secureRandomHex, secureRandomId } from '../../../shared/crypto/secureRandom';
import { packNativeWhiteboard, unpackNativeWhiteboard } from '../interchange/whiteboardExportImportEngine';
import type { WhiteboardItem } from '../types';
import {
  exportWhiteboardToSvg,
  decomposeWhiteboardFrames,
} from '../interchange/whiteboardInterchangeEngine';
import {
  WhiteboardSpatialIndex,
  enforceResourceCeiling,
  estimateMemoryFootprint,
} from '../rendering/whiteboardSpatialIndexEngine';
import {
  calculateOrthogonalRoute,
  applyTreeAutoLayout,
} from '../model/whiteboardAutoLayoutEngine';

export interface WhiteboardTestResult {
  id: string;
  name: string;
  passed: boolean;
  durationMs: number;
  message: string;
  details?: string;
}

export interface WhiteboardSuiteReport {
  timestamp: string;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  allPassed: boolean;
  results: WhiteboardTestResult[];
}

function createContainerDiagnosticDocument(items: readonly WhiteboardItem[]): WorkspaceDocument {
  const now = Date.now();
  return {
    schema_version: WOM_SCHEMA_VERSION,
    id: secureRandomId('whiteboard-container-diagnostic'),
    title: 'Whiteboard Container Diagnostic',
    kind: 'Whiteboard',
    created_at: now,
    modified_at: now,
    version: 1,
    theme_id: 'default',
    root_object_ids: [],
    objects: {},
    whiteboardData: { items: items.map((item) => ({ ...item })) },
  };
}

function diagnosticErrorMessage(error: unknown): string {
  if (!(error instanceof Error) || !error.message) return 'Unknown diagnostic failure';
  return error.message.slice(0, 240);
}

function canonicalDiagnosticValue(value: unknown, depth = 0): unknown {
  if (depth > 32) throw new Error('Diagnostic fixture exceeds the canonical comparison depth');
  if (Array.isArray(value)) return value.map((entry) => canonicalDiagnosticValue(entry, depth + 1));
  if (typeof value !== 'object' || value === null) return value;
  const normalized: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    normalized[key] = canonicalDiagnosticValue((value as Record<string, unknown>)[key], depth + 1);
  }
  return normalized;
}

/**
 * Creates canonical benchmark dataset for whiteboard stress testing
 */
export function createBenchmarkWhiteboardItems(): WhiteboardItem[] {
  return [
    {
      id: 'frame_1',
      type: 'frame',
      x: 50,
      y: 50,
      width: 600,
      height: 400,
      text: 'Sprint Planning Frame',
    },
    {
      id: 'node_start',
      type: 'terminal',
      x: 100,
      y: 120,
      width: 140,
      height: 60,
      text: 'Start Sprint',
    },
    {
      id: 'node_process_1',
      type: 'process',
      x: 300,
      y: 120,
      width: 160,
      height: 70,
      text: 'Develop Microservice',
    },
    {
      id: 'node_decision_1',
      type: 'decision',
      x: 320,
      y: 240,
      width: 120,
      height: 100,
      text: 'Tests Green?',
    },
    {
      id: 'sticky_note_1',
      type: 'sticky',
      x: 100,
      y: 220,
      width: 140,
      height: 100,
      text: 'Security review required before PR merge',
      color: 'yellow',
    },
    {
      id: 'conn_1',
      type: 'connector',
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      text: '',
      fromId: 'node_start',
      toId: 'node_process_1',
      lineLabel: 'kickoff',
    },
    {
      id: 'conn_2',
      type: 'connector',
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      text: '',
      fromId: 'node_process_1',
      toId: 'node_decision_1',
    },
  ];
}

/**
 * Executes the full 6-point verification suite
 */
export async function runWhiteboardTestSuite(): Promise<WhiteboardSuiteReport> {
  const results: WhiteboardTestResult[] = [];
  const benchmark = createBenchmarkWhiteboardItems();

  // Test 1: real encrypted VGT .vboard container path using a bounded private fixture
  const t1Start = performance.now();
  try {
    const password = `whiteboard-diagnostic-${secureRandomHex(32)}`;
    const source = createContainerDiagnosticDocument(benchmark);
    const encrypted = await packNativeWhiteboard(source, { password });
    const restored = await unpackNativeWhiteboard(encrypted, { password });
    const formatIsEncryptedVgt = new TextDecoder().decode(encrypted.subarray(0, 4)) === 'VGT3';
    const canonicalItemsMatch = JSON.stringify(canonicalDiagnosticValue(restored.whiteboardData?.items))
      === JSON.stringify(canonicalDiagnosticValue(source.whiteboardData?.items));
    const roundtripMatches = restored.id === source.id
      && restored.title === source.title
      && restored.kind === 'Whiteboard'
      && canonicalItemsMatch;
    const passed = formatIsEncryptedVgt && roundtripMatches;

    results.push({
      id: 'VBOARD_CONTAINER_ROUNDTRIP',
      name: '1. Encrypted VGT .vboard Container Roundtrip',
      passed,
      durationMs: Math.round((performance.now() - t1Start) * 100) / 100,
      message: passed
        ? `Encrypted VGT3 roundtrip preserved ${benchmark.length} diagnostic objects.`
        : 'Encrypted container diagnostic did not preserve the required format and canonical fixture contract.',
      details: `format=${formatIsEncryptedVgt ? 'VGT3' : new TextDecoder().decode(encrypted.subarray(0, 4))}; identity=${restored.id === source.id ? 'preserved' : 'mismatch'}; title=${restored.title === source.title ? 'preserved' : 'mismatch'}; kind=${restored.kind === 'Whiteboard' ? 'preserved' : 'mismatch'}; items=${restored.whiteboardData?.items?.length ?? 0}/${source.whiteboardData?.items?.length ?? 0}; canonicalItems=${canonicalItemsMatch ? 'preserved' : 'mismatch'}`,
    });
  } catch (error: unknown) {
    results.push({
      id: 'VBOARD_CONTAINER_ROUNDTRIP',
      name: '1. Encrypted VGT .vboard Container Roundtrip',
      passed: false,
      durationMs: Math.round((performance.now() - t1Start) * 100) / 100,
      message: `Encrypted VGT3 diagnostic failed: ${diagnosticErrorMessage(error)}`,
    });
  }

  // Test 2: SVG Vector Serialization & XSS Defense (CWE-79)
  const t2Start = performance.now();
  try {
    const maliciousItems: WhiteboardItem[] = [
      ...benchmark,
      {
        id: 'xss_sticky',
        type: 'sticky',
        x: 10,
        y: 10,
        width: 100,
        height: 100,
        text: '<script>alert(document.cookie)</script><img src="x" onerror="alert(1)"/>',
        color: 'cyan',
      },
    ];

    const rawSvg = exportWhiteboardToSvg('Security Test', maliciousItems);
    const hasExecutableElements = /<\s*(?:script|img|iframe|object|embed)\b/iu.test(rawSvg);
    const hostileTextWasEscaped = rawSvg.includes('&lt;script&gt;') && rawSvg.includes('&lt;img src=');
    const passed = !hasExecutableElements && hostileTextWasEscaped && rawSvg.includes('<svg') && rawSvg.includes('</svg>');

    results.push({
      id: 'SVG_VECTOR_XSS_DEFENSE',
      name: '2. SVG Vector Serialization & CWE-79 XSS Neutralization',
      passed,
      durationMs: Math.round((performance.now() - t2Start) * 100) / 100,
      message: passed
        ? 'Bounded SVG export kept hostile markup inert as escaped text and passed the shared active-content validator.'
        : 'SVG diagnostic found active markup or failed to preserve the escaped hostile-text fixture.',
    });
  } catch (error: unknown) {
    results.push({
      id: 'SVG_VECTOR_XSS_DEFENSE',
      name: '2. SVG Vector Serialization & CWE-79 XSS Neutralization',
      passed: false,
      durationMs: Math.round((performance.now() - t2Start) * 100) / 100,
      message: `SVG diagnostic failed: ${diagnosticErrorMessage(error)}`,
    });
  }

  // Test 3: Spatial Index Query Accuracy & Viewport Culling
  const t3Start = performance.now();
  try {
    const index = new WhiteboardSpatialIndex(256);
    index.rebuild(benchmark);

    // Query viewport encompassing only node_start and sticky_note_1 (x: 50-260, y: 50-340)
    const viewport = { minX: 50, minY: 50, maxX: 260, maxY: 340 };
    const visible = index.queryViewport(viewport);

    // Should include frame_1, node_start, sticky_note_1, conn_1
    const foundStart = visible.some((i) => i.id === 'node_start');
    const foundSticky = visible.some((i) => i.id === 'sticky_note_1');
    const passed = visible.length > 0 && foundStart && foundSticky;

    results.push({
      id: 'SPATIAL_INDEX_CULLING',
      name: '3. 2D Spatial Hash Index Viewport Culling Accuracy',
      passed,
      durationMs: Math.round((performance.now() - t3Start) * 100) / 100,
      message: passed
        ? `Spatial query matched ${visible.length}/${benchmark.length} elements intersecting viewport`
        : 'Spatial index failed to resolve items inside query bounds',
    });
  } catch (error: unknown) {
    results.push({
      id: 'SPATIAL_INDEX_CULLING',
      name: '3. 2D Spatial Hash Index Viewport Culling Accuracy',
      passed: false,
      durationMs: Math.round((performance.now() - t3Start) * 100) / 100,
      message: `Spatial diagnostic failed: ${diagnosticErrorMessage(error)}`,
    });
  }

  // Test 4: Orthogonal Connector Routing
  const t4Start = performance.now();
  try {
    const startNode = benchmark.find((i) => i.id === 'node_start')!;
    const procNode = benchmark.find((i) => i.id === 'node_process_1')!;

    const route = calculateOrthogonalRoute(startNode, procNode, 'conn_1');
    const validWaypoints = route.waypoints.length >= 3;
    const validPathData = route.svgPathData.startsWith('M ') && route.svgPathData.includes('L ');

    const laidOut = applyTreeAutoLayout(benchmark);
    const validLayout = laidOut.length === benchmark.length;

    const passed = validWaypoints && validPathData && validLayout;

    results.push({
      id: 'ORTHOGONAL_ROUTING',
      name: '4. Rectilinear (Manhattan) Orthogonal Connector Routing',
      passed,
      durationMs: Math.round((performance.now() - t4Start) * 100) / 100,
      message: passed
        ? `Orthogonal route calculated: ${route.waypoints.length} waypoints via ${route.sourceAnchor.side}->${route.targetAnchor.side}`
        : 'Failed to generate valid rectilinear waypoints',
    });
  } catch (error: unknown) {
    results.push({
      id: 'ORTHOGONAL_ROUTING',
      name: '4. Rectilinear (Manhattan) Orthogonal Connector Routing',
      passed: false,
      durationMs: Math.round((performance.now() - t4Start) * 100) / 100,
      message: `Routing diagnostic failed: ${diagnosticErrorMessage(error)}`,
    });
  }

  // Test 5: Frame-to-Slide Decomposition
  const t5Start = performance.now();
  try {
    const slices = decomposeWhiteboardFrames(benchmark);
    const frameSlice = slices.find((s) => s.frameId === 'frame_1');
    const passed = slices.length === 1 && Boolean(frameSlice) && (frameSlice?.containedItems.length || 0) >= 3;

    results.push({
      id: 'FRAME_SLICING_DECOMPOSITION',
      name: '5. Frame Boundary Slicing & Slide Scene Partitioning',
      passed,
      durationMs: Math.round((performance.now() - t5Start) * 100) / 100,
      message: passed
        ? `Decomposition isolated '${frameSlice?.title}' with ${frameSlice?.containedItems.length} elements`
        : 'Frame decomposition did not properly segment spatial frame items',
    });
  } catch (error: unknown) {
    results.push({
      id: 'FRAME_SLICING_DECOMPOSITION',
      name: '5. Frame Boundary Slicing & Slide Scene Partitioning',
      passed: false,
      durationMs: Math.round((performance.now() - t5Start) * 100) / 100,
      message: `Frame diagnostic failed: ${diagnosticErrorMessage(error)}`,
    });
  }

  // Test 6: Memory Ceiling & OOM Prevention
  const t6Start = performance.now();
  try {
    // Generate synthetic large item
    const oversizedItems: WhiteboardItem[] = [
      ...benchmark,
      {
        id: 'huge_img',
        type: 'image',
        x: 0,
        y: 0,
        width: 400,
        height: 300,
        text: '',
        dataUrl: 'data:image/png;base64,' + 'A'.repeat(500000), // ~500 KB
      },
    ];

    const initialMem = estimateMemoryFootprint(oversizedItems);
    // Enforce ceiling of 200 KB
    const ceilingRes = enforceResourceCeiling(oversizedItems, 200 * 1024);

    const passed = ceilingRes.culledCount === 1 && ceilingRes.memoryFreed > 0;

    results.push({
      id: 'OOM_CEILING_ENFORCEMENT',
      name: '6. Resource Ceiling & Out-Of-Memory (OOM) Protection',
      passed,
      durationMs: Math.round((performance.now() - t6Start) * 100) / 100,
      message: passed
        ? `Ceiling enforced: pruned ${ceilingRes.culledCount} oversized image from ${initialMem.formattedSize}, freed ${(ceilingRes.memoryFreed / 1024).toFixed(1)} KB`
        : `OOM ceiling check failed: memory not freed`,
    });
  } catch (error: unknown) {
    results.push({
      id: 'OOM_CEILING_ENFORCEMENT',
      name: '6. Resource Ceiling & Out-Of-Memory (OOM) Protection',
      passed: false,
      durationMs: Math.round((performance.now() - t6Start) * 100) / 100,
      message: `Resource diagnostic failed: ${diagnosticErrorMessage(error)}`,
    });
  }

  const passedTests = results.filter((r) => r.passed).length;
  return {
    timestamp: new Date().toISOString(),
    totalTests: results.length,
    passedTests,
    failedTests: results.length - passedTests,
    allPassed: passedTests === results.length,
    results,
  };
}
