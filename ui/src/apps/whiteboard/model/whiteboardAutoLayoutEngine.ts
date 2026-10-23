// STATUS: DIAMANT VGT SUPREME
// Astraea Whiteboard Algorithmic Auto-Layout & Orthogonal Connector Routing Engine
// Hierarchical Mind-Map/Tree synthesis, Rectilinear routing & Geometric alignment

import type { WhiteboardItem } from '../types';

export interface LayoutOptions {
  orientation: 'horizontal' | 'vertical';
  horizontalSpacing: number;
  verticalSpacing: number;
  startX: number;
  startY: number;
}

export interface OrthogonalPath {
  connectorId: string;
  sourceAnchor: { x: number; y: number; side: 'top' | 'right' | 'bottom' | 'left' };
  targetAnchor: { x: number; y: number; side: 'top' | 'right' | 'bottom' | 'left' };
  waypoints: { x: number; y: number }[];
  svgPathData: string;
}

/**
 * Computes the 4 boundary connection anchor points for an item
 */
export function getItemAnchors(item: WhiteboardItem) {
  const cx = item.x + item.width / 2;
  const cy = item.y + item.height / 2;

  return {
    top: { x: cx, y: item.y, side: 'top' as const },
    right: { x: item.x + item.width, y: cy, side: 'right' as const },
    bottom: { x: cx, y: item.y + item.height, side: 'bottom' as const },
    left: { x: item.x, y: cy, side: 'left' as const },
  };
}

/**
 * Calculates optimal orthogonal (Manhattan) routing path between two shapes
 */
export function calculateOrthogonalRoute(
  source: WhiteboardItem,
  target: WhiteboardItem,
  connectorId: string
): OrthogonalPath {
  const sAnchors = getItemAnchors(source);
  const tAnchors = getItemAnchors(target);

  // Pick best facing anchors based on relative position
  const dx = target.x + target.width / 2 - (source.x + source.width / 2);
  const dy = target.y + target.height / 2 - (source.y + source.height / 2);

  type AnchorPoint = { x: number; y: number; side: 'top' | 'right' | 'bottom' | 'left' };
  let sAnchor: AnchorPoint = sAnchors.right;
  let tAnchor: AnchorPoint = tAnchors.left;

  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx >= 0) {
      sAnchor = sAnchors.right;
      tAnchor = tAnchors.left;
    } else {
      sAnchor = sAnchors.left;
      tAnchor = tAnchors.right;
    }
  } else {
    if (dy >= 0) {
      sAnchor = sAnchors.bottom;
      tAnchor = tAnchors.top;
    } else {
      sAnchor = sAnchors.top;
      tAnchor = tAnchors.bottom;
    }
  }

  const waypoints: { x: number; y: number }[] = [];
  waypoints.push({ x: sAnchor.x, y: sAnchor.y });

  if (sAnchor.side === 'right' || sAnchor.side === 'left') {
    const midX = (sAnchor.x + tAnchor.x) / 2;
    waypoints.push({ x: midX, y: sAnchor.y });
    waypoints.push({ x: midX, y: tAnchor.y });
  } else {
    const midY = (sAnchor.y + tAnchor.y) / 2;
    waypoints.push({ x: sAnchor.x, y: midY });
    waypoints.push({ x: tAnchor.x, y: midY });
  }

  waypoints.push({ x: tAnchor.x, y: tAnchor.y });

  const svgPathData =
    waypoints.length > 0
      ? `M ${waypoints[0].x} ${waypoints[0].y} ` +
        waypoints
          .slice(1)
          .map((p) => `L ${p.x} ${p.y}`)
          .join(' ')
      : '';

  return {
    connectorId,
    sourceAnchor: sAnchor,
    targetAnchor: tAnchor,
    waypoints,
    svgPathData,
  };
}

/**
 * Executes hierarchical tree / mind-map auto-layout on whiteboard nodes
 */
export function applyTreeAutoLayout(
  items: WhiteboardItem[],
  options: LayoutOptions = {
    orientation: 'horizontal',
    horizontalSpacing: 80,
    verticalSpacing: 50,
    startX: 100,
    startY: 100,
  }
): WhiteboardItem[] {
  const nodes = items.filter((i) => i.type !== 'connector' && i.type !== 'frame');
  const connectors = items.filter((i) => i.type === 'connector');
  const frames = items.filter((i) => i.type === 'frame');

  if (nodes.length <= 1) return items;

  // Build adjacency list & in-degree map
  const inDegree = new Map<string, number>();
  const childrenMap = new Map<string, string[]>();
  const nodesById = new Map<string, WhiteboardItem>();

  for (const n of nodes) {
    inDegree.set(n.id, 0);
    childrenMap.set(n.id, []);
    nodesById.set(n.id, n);
  }

  for (const c of connectors) {
    if (c.fromId && c.toId && inDegree.has(c.toId) && inDegree.has(c.fromId)) {
      inDegree.set(c.toId, (inDegree.get(c.toId) || 0) + 1);
      childrenMap.get(c.fromId)?.push(c.toId);
    }
  }

  // Identify root nodes (inDegree === 0)
  let roots = nodes.filter((n) => (inDegree.get(n.id) || 0) === 0);
  if (roots.length === 0) roots = [nodes[0]];

  const nodePositions = new Map<string, { x: number; y: number }>();
  const visited = new Set<string>();

  let currentSecondaryCoord = options.orientation === 'horizontal' ? options.startY : options.startX;

  interface LayoutFrame {
    nodeId: string;
    depth: number;
    children: string[];
    nextChildIndex: number;
    placedChildCount: number;
    minChildSecondary: number;
    maxChildSecondary: number;
  }

  function createLayoutFrame(nodeId: string, depth: number): LayoutFrame {
    visited.add(nodeId);
    return {
      nodeId,
      depth,
      children: (childrenMap.get(nodeId) ?? []).filter((id) => !visited.has(id)),
      nextChildIndex: 0,
      placedChildCount: 0,
      minChildSecondary: Number.POSITIVE_INFINITY,
      maxChildSecondary: Number.NEGATIVE_INFINITY,
    };
  }

  function layoutSubtree(rootId: string): void {
    const stack: LayoutFrame[] = [createLayoutFrame(rootId, 0)];

    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      if (!frame) break;

      if (frame.nextChildIndex < frame.children.length) {
        const childId = frame.children[frame.nextChildIndex];
        frame.nextChildIndex += 1;
        if (childId && !visited.has(childId)) stack.push(createLayoutFrame(childId, frame.depth + 1));
        continue;
      }

      const node = nodesById.get(frame.nodeId);
      stack.pop();
      if (!node) continue;

      let secondary: number;
      if (frame.placedChildCount === 0) {
        secondary = currentSecondaryCoord;
        const delta = (options.orientation === 'horizontal' ? node.height : node.width)
          + (options.orientation === 'horizontal' ? options.verticalSpacing : options.horizontalSpacing);
        currentSecondaryCoord += delta;
      } else {
        secondary = (frame.minChildSecondary + frame.maxChildSecondary) / 2;
      }

      const primary = options.orientation === 'horizontal'
        ? options.startX + frame.depth * (node.width + options.horizontalSpacing)
        : options.startY + frame.depth * (node.height + options.verticalSpacing);
      nodePositions.set(frame.nodeId, options.orientation === 'horizontal'
        ? { x: primary, y: secondary }
        : { x: secondary, y: primary });

      const parent = stack[stack.length - 1];
      if (parent) {
        parent.placedChildCount += 1;
        parent.minChildSecondary = Math.min(parent.minChildSecondary, secondary);
        parent.maxChildSecondary = Math.max(parent.maxChildSecondary, secondary);
      }
    }
  }

  for (const root of roots) {
    if (!visited.has(root.id)) {
      layoutSubtree(root.id);
    }
  }

  // Position any disconnected islands
  for (const node of nodes) {
    if (!visited.has(node.id)) {
      layoutSubtree(node.id);
    }
  }

  const updatedNodes = nodes.map((node) => {
    const pos = nodePositions.get(node.id);
    if (!pos) return node;
    return {
      ...node,
      x: Math.round(pos.x),
      y: Math.round(pos.y),
    };
  });

  return [...updatedNodes, ...connectors, ...frames];
}

/**
 * Geometric alignment utility for selected whiteboard items
 */
export function alignWhiteboardItems(
  items: WhiteboardItem[],
  selectedIds: string[],
  alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'
): WhiteboardItem[] {
  const selectedIdSet = new Set(selectedIds);
  const targets = items.filter((i) => selectedIdSet.has(i.id) && i.type !== 'connector');
  if (targets.length <= 1) return items;

  let referenceValue = 0;
  if (alignment === 'left') {
    referenceValue = Math.min(...targets.map((i) => i.x));
  } else if (alignment === 'center') {
    const minX = Math.min(...targets.map((i) => i.x));
    const maxX = Math.max(...targets.map((i) => i.x + i.width));
    referenceValue = (minX + maxX) / 2;
  } else if (alignment === 'right') {
    referenceValue = Math.max(...targets.map((i) => i.x + i.width));
  } else if (alignment === 'top') {
    referenceValue = Math.min(...targets.map((i) => i.y));
  } else if (alignment === 'middle') {
    const minY = Math.min(...targets.map((i) => i.y));
    const maxY = Math.max(...targets.map((i) => i.y + i.height));
    referenceValue = (minY + maxY) / 2;
  } else if (alignment === 'bottom') {
    referenceValue = Math.max(...targets.map((i) => i.y + i.height));
  }

  return items.map((item) => {
    if (!selectedIdSet.has(item.id) || item.type === 'connector' || item.locked) return item;

    if (alignment === 'left') return { ...item, x: referenceValue };
    if (alignment === 'center') return { ...item, x: Math.round(referenceValue - item.width / 2) };
    if (alignment === 'right') return { ...item, x: referenceValue - item.width };
    if (alignment === 'top') return { ...item, y: referenceValue };
    if (alignment === 'middle') return { ...item, y: Math.round(referenceValue - item.height / 2) };
    if (alignment === 'bottom') return { ...item, y: referenceValue - item.height };

    return item;
  });
}
