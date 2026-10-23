// STATUS: PLATIN — bounded path simplification for Draw vector geometry.
import type { DrawPoint } from '../../../shared/contracts/draw/workspaceDraw';
import { assertPoint, bounded, DrawModelError, MAX_OBJECTS } from './drawDocumentValidation';

const MAX_PATH_WORK = 1_000_000;
const MAX_VECTOR_COORDINATE = 1_000_000_000;

function copyPathPoints(points: readonly DrawPoint[]): DrawPoint[] {
  if (!Array.isArray(points) || points.length > MAX_OBJECTS) throw new DrawModelError('path-point-limit');
  const copy: DrawPoint[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(points, String(index));
    if (!descriptor || !('value' in descriptor)) throw new DrawModelError('path-point-invalid');
    assertPoint(descriptor.value, 'path-point-invalid');
    const point = descriptor.value as DrawPoint;
    copy.push({
      x: bounded(point.x, -MAX_VECTOR_COORDINATE, MAX_VECTOR_COORDINATE, 'path-point-invalid'),
      y: bounded(point.y, -MAX_VECTOR_COORDINATE, MAX_VECTOR_COORDINATE, 'path-point-invalid'),
    });
  }
  return copy;
}

function squaredDistanceToSegment(point: DrawPoint, start: DrawPoint, end: DrawPoint): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return (point.x - start.x) ** 2 + (point.y - start.y) ** 2;
  const projection = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSq;
  const position = Math.max(0, Math.min(1, projection));
  const nearestX = start.x + position * dx;
  const nearestY = start.y + position * dy;
  return (point.x - nearestX) ** 2 + (point.y - nearestY) ** 2;
}

function simplifyRadially(points: readonly DrawPoint[], tolerance: number): DrawPoint[] {
  const result: DrawPoint[] = [points[0]];
  let anchor = points[0];
  for (let index = 1; index < points.length - 1; index += 1) {
    const point = points[index];
    if (Math.hypot(point.x - anchor.x, point.y - anchor.y) > tolerance) {
      result.push(point);
      anchor = point;
    }
  }
  result.push(points[points.length - 1]);
  return result;
}

export function simplifyDrawPath(points: readonly DrawPoint[], tolerance = 1): DrawPoint[] {
  const threshold = bounded(tolerance, 0, 10_000, 'path-tolerance-invalid');
  const copy = copyPathPoints(points);
  if (copy.length <= 2) return copy;

  const keep = new Uint8Array(copy.length);
  keep[0] = 1;
  keep[copy.length - 1] = 1;
  const pending: Array<readonly [number, number]> = [[0, copy.length - 1]];
  const thresholdSq = threshold * threshold;
  let work = 0;
  while (pending.length > 0) {
    const segment = pending.pop();
    if (!segment) break;
    const [start, end] = segment;
    let farthestDistance = thresholdSq;
    let farthestIndex = -1;
    for (let index = start + 1; index < end; index += 1) {
      work += 1;
      if (work > MAX_PATH_WORK) return simplifyRadially(copy, threshold);
      const distance = squaredDistanceToSegment(copy[index], copy[start], copy[end]);
      if (distance > farthestDistance) {
        farthestDistance = distance;
        farthestIndex = index;
      }
    }
    if (farthestIndex >= 0) {
      keep[farthestIndex] = 1;
      pending.push([farthestIndex, end], [start, farthestIndex]);
    }
  }

  const simplified: DrawPoint[] = [];
  for (let index = 0; index < copy.length; index += 1) if (keep[index]) simplified.push(copy[index]);
  return simplified;
}
