// STATUS: PLATIN — validated Draw object graph cloning with closed internal references.
import type { DrawObject, DrawPoint } from '../../../shared/contracts/draw/workspaceDraw';
import { assertDrawObject, assertPoint, DrawModelError, MAX_OBJECTS, safeId } from './drawDocumentValidation';

export function cloneDrawGraph(
  objects: readonly DrawObject[],
  idMap: ReadonlyMap<string, string>,
  targetPageId: string,
  offset: DrawPoint = { x: 24, y: 24 },
): DrawObject[] {
  if (!Array.isArray(objects) || objects.length > MAX_OBJECTS) throw new DrawModelError('clone-object-list-invalid');
  if (!(idMap instanceof Map) || idMap.size !== objects.length) throw new DrawModelError('clone-id-map-invalid');
  const targetPage = safeId(targetPageId, 'clone-target-page-invalid');
  assertPoint(offset, 'clone-offset-invalid');

  const sourceById = new Map<string, DrawObject>();
  for (const object of objects) {
    assertDrawObject(object);
    if (sourceById.has(object.id)) throw new DrawModelError('clone-source-id-duplicate');
    sourceById.set(object.id, object);
  }

  const targetIds = new Set<string>();
  for (const sourceId of sourceById.keys()) {
    const targetId = safeId(idMap.get(sourceId), 'clone-id-map-missing');
    if (sourceById.has(targetId) || targetIds.has(targetId)) throw new DrawModelError('clone-target-id-duplicate');
    targetIds.add(targetId);
  }

  return [...sourceById.values()].map((object) => {
    const id = idMap.get(object.id);
    if (!id) throw new DrawModelError('clone-id-map-missing');
    const next: DrawObject = {
      ...structuredClone(object),
      id,
      pageId: targetPage,
      x: object.x + offset.x,
      y: object.y + offset.y,
    };

    if (!Number.isFinite(next.x) || !Number.isFinite(next.y)) throw new DrawModelError('clone-position-invalid');
    if (next.parentGroupId) {
      const parentId = sourceById.has(next.parentGroupId) ? idMap.get(next.parentGroupId) : undefined;
      if (parentId) next.parentGroupId = parentId;
      else delete next.parentGroupId;
    }
    if (next.childIds) {
      next.childIds = next.childIds
        .filter((childId) => sourceById.has(childId))
        .map((childId) => {
          const targetChildId = idMap.get(childId);
          if (!targetChildId) throw new DrawModelError('clone-child-id-missing');
          return targetChildId;
        });
    }
    if (next.connector) {
      const fromId = idMap.get(next.connector.from.objectId);
      const toId = idMap.get(next.connector.to.objectId);
      if (!fromId || !toId) throw new DrawModelError('clone-connector-endpoint-outside-graph');
      next.connector = {
        ...next.connector,
        from: { ...next.connector.from, objectId: fromId },
        to: { ...next.connector.to, objectId: toId },
        waypoints: next.connector.waypoints.map((point) => ({ x: point.x + offset.x, y: point.y + offset.y })),
      };
    }

    assertDrawObject(next, id);
    return next;
  });
}

