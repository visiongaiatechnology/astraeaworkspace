// STATUS: PLATIN — deterministic Draw-to-Whiteboard projection for interchange.
import type { DrawConnectionAnchor, DrawDocumentModel, DrawObject } from '../../../shared/contracts/draw/workspaceDraw';
import type { WhiteboardItem } from '../../whiteboard/types';
import type { WhiteboardConnectorAnchor, WhiteboardShapeKind } from '../../../shared/contracts/whiteboard/workspaceWhiteboard';

export type DrawProjectionErrorCode = 'connector-data-missing' | 'page-object-missing';

export class DrawProjectionError extends Error {
  constructor(readonly code: DrawProjectionErrorCode) {
    super(`Draw projection rejected: ${code}`);
    this.name = 'DrawProjectionError';
  }
}

function colorFromFill(fill?: string): WhiteboardItem['color'] {
  const normalized = (fill ?? '').toLowerCase();
  if (normalized.includes('fef') || normalized.includes('yellow') || normalized.includes('amber')) return 'yellow';
  if (normalized.includes('purple') || normalized.includes('violet')) return 'purple';
  return 'cyan';
}

function whiteboardAnchor(anchor: DrawConnectionAnchor): WhiteboardConnectorAnchor {
  return anchor === 'top' || anchor === 'right' || anchor === 'bottom' || anchor === 'left'
    ? anchor
    : 'auto';
}

function whiteboardShapeKind(object: DrawObject, type: WhiteboardItem['type']): WhiteboardShapeKind {
  const kind = object.vector?.kind;
  if (kind === 'ellipse' || type === 'terminal') return 'ellipse';
  if (kind === 'polygon' || type === 'decision') return 'diamond';
  if (object.vector?.style?.cornerRadius && object.vector.style.cornerRadius > 0) return 'rounded-rectangle';
  return 'rectangle';
}

export function drawObjectToWhiteboardItem(object: DrawObject): WhiteboardItem {
  if (object.type === 'connector') {
    if (!object.connector) throw new DrawProjectionError('connector-data-missing');

    const connector = object.connector;
    return {
      id: object.id,
      type: 'connector',
      x: object.x,
      y: object.y,
      width: object.width,
      height: object.height,
      text: connector.semantic.label ?? '',
      fromId: connector.from.objectId,
      toId: connector.to.objectId,
      fromAnchor: whiteboardAnchor(connector.from.anchor),
      toAnchor: whiteboardAnchor(connector.to.anchor),
      lineLabel: connector.semantic.label,
      connectorStyle: {
        route: connector.route === 'custom' ? 'orthogonal' : connector.route,
        autoRoute: connector.autoRoute,
      },
      rotation: object.rotation,
      locked: object.locked,
      zIndex: object.zIndex,
    };
  }

  const kind = object.vector?.kind;
  let type: WhiteboardItem['type'] = 'process';
  if (object.type === 'frame') type = 'frame';
  else if (kind === 'ellipse') type = 'terminal';
  else if (kind === 'polygon' || object.diagram?.role === 'gateway' || object.diagram?.role === 'decision') type = 'decision';
  else if (kind === 'text') type = 'text';
  else if (kind === 'icon') type = 'icon';
  else if (kind === 'freehand' || kind === 'bezier' || kind === 'custom-path') type = 'shape';

  return {
    id: object.id,
    type,
    x: object.x,
    y: object.y,
    width: object.width,
    height: object.height,
    text: object.richText?.runs.map((run) => run.text).join('') ?? object.name,
    color: colorFromFill(object.vector?.style?.fill),
    locked: object.locked,
    rotation: object.rotation,
    zIndex: object.zIndex,
    groupId: object.parentGroupId,
    linkUri: object.hyperlink?.uri,
    tags: object.diagram ? [object.diagram.family, object.diagram.role ?? ''].filter(Boolean) : undefined,
    shape: type !== 'frame'
      ? {
        kind: whiteboardShapeKind(object, type),
        fill: object.vector?.style?.fill ?? '#1e293b',
        stroke: object.vector?.style?.stroke ?? '#60a5fa',
        strokeWidth: object.vector?.style?.strokeWidth ?? 2,
      }
      : undefined,
    table: object.table
      ? { columns: [...object.table.columns], rows: object.table.rows.map((row) => [...row]) }
      : undefined,
  };
}

export function drawPageToWhiteboardItems(
  model: DrawDocumentModel,
  pageId = model.activePageId,
): WhiteboardItem[] {
  const page = model.pages.find((candidate) => candidate.id === pageId);
  if (!page) return [];

  const pageObjects: DrawObject[] = [];
  for (const objectId of page.objectIds) {
    const object = model.objects[objectId];
    if (!object) throw new DrawProjectionError('page-object-missing');
    pageObjects.push(object);
  }

  return pageObjects
    .sort((left, right) => left.zIndex - right.zIndex)
    .map(drawObjectToWhiteboardItem);
}
