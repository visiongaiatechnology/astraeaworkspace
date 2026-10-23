// STATUS: PLATIN — Per-workspace transient drag lifecycle with explicit threshold and cleanup.
import { parseWorkspaceDragPayload, serializeWorkspaceDragPayload } from './workspaceInteractionPayload';
import { WORKSPACE_DRAG_THRESHOLD_PX, WorkspaceInteractionError } from './workspaceInteractionTypes';

export interface WorkspacePointerPoint {
  readonly x: number;
  readonly y: number;
}

type DragPhase = 'armed' | 'dragging';

interface DragSession {
  readonly pointerId: number;
  readonly origin: WorkspacePointerPoint;
  readonly payload: string;
  phase: DragPhase;
}

function validatePointer(pointerId: number): void {
  if (!Number.isSafeInteger(pointerId) || pointerId < 0) throw new WorkspaceInteractionError('drag_pointer_invalid');
}

function validatePoint(point: WorkspacePointerPoint): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new WorkspaceInteractionError('drag_point_invalid');
}

export class WorkspaceDragController {
  private session: DragSession | null = null;
  private readonly thresholdSquared: number;

  constructor(thresholdPx = WORKSPACE_DRAG_THRESHOLD_PX) {
    if (!Number.isFinite(thresholdPx) || thresholdPx < 1 || thresholdPx > 64) {
      throw new WorkspaceInteractionError('drag_threshold_invalid');
    }
    this.thresholdSquared = thresholdPx * thresholdPx;
  }

  begin(payload: string, pointerId: number, origin: WorkspacePointerPoint): void {
    if (this.session) throw new WorkspaceInteractionError('drag_already_active');
    validatePointer(pointerId);
    validatePoint(origin);
    const canonicalPayload = serializeWorkspaceDragPayload(parseWorkspaceDragPayload(payload));
    this.session = { pointerId, origin: Object.freeze({ x: origin.x, y: origin.y }), payload: canonicalPayload, phase: 'armed' };
  }

  move(pointerId: number, point: WorkspacePointerPoint): 'idle' | 'armed' | 'dragging' {
    validatePointer(pointerId);
    validatePoint(point);
    if (!this.session || this.session.pointerId !== pointerId) return 'idle';
    if (this.session.phase === 'dragging') return 'dragging';
    const dx = point.x - this.session.origin.x;
    const dy = point.y - this.session.origin.y;
    if (dx * dx + dy * dy < this.thresholdSquared) return 'armed';
    this.session.phase = 'dragging';
    return 'dragging';
  }

  activePayload(pointerId: number): string | null {
    validatePointer(pointerId);
    return this.session?.pointerId === pointerId && this.session.phase === 'dragging'
      ? this.session.payload
      : null;
  }

  complete(pointerId: number): string | null {
    validatePointer(pointerId);
    if (!this.session || this.session.pointerId !== pointerId) return null;
    const payload = this.session.phase === 'dragging' ? this.session.payload : null;
    this.session = null;
    return payload;
  }

  cancel(pointerId?: number): boolean {
    if (!this.session) return false;
    if (pointerId !== undefined) {
      validatePointer(pointerId);
      if (this.session.pointerId !== pointerId) return false;
    }
    this.session = null;
    return true;
  }

  clear(): void {
    this.session = null;
  }

  get isActive(): boolean {
    return this.session !== null;
  }
}
