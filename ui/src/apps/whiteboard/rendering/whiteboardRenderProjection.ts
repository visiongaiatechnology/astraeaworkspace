// STATUS: DIAMANT VGT SUPREME
// Canonical Whiteboard screen/export geometry projection.

import type { WhiteboardItem } from '../types';
import { buildWhiteboardConnectorPaths, type WhiteboardConnectorPath } from '../model/whiteboardDiagramEngine';

export interface WhiteboardRenderProjection {
  items: WhiteboardItem[];
  connectorPaths: ReadonlyMap<string, WhiteboardConnectorPath>;
}

export function buildWhiteboardRenderProjection(items: readonly WhiteboardItem[]): WhiteboardRenderProjection {
  const visible = items
    .filter((item) => !item.hidden)
    .slice()
    .sort((left, right) => (left.zIndex ?? 0) - (right.zIndex ?? 0) || left.id.localeCompare(right.id));
  const connectorPaths = buildWhiteboardConnectorPaths(visible);
  return { items: visible, connectorPaths };
}
