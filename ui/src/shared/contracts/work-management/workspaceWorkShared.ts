// STATUS: DIAMANT VGT SUPREME — Shared Work Schema Contracts

export type ProjectSchedulingMode = 'auto' | 'manual';

export type ProjectConstraintType =
  | 'asap'
  | 'alap'
  | 'must_start_on'
  | 'must_finish_on'
  | 'start_no_earlier_than'
  | 'start_no_later_than'
  | 'finish_no_earlier_than'
  | 'finish_no_later_than';

export interface ProjectTaskSplit {
  id: string;
  startDate: string;
  endDate: string;
  workHours?: number;
}

export interface TaskComment {
  id: string;
  author: string;
  text: string;
  createdAt: number;
  updatedAt?: number;
  parentCommentId?: string;
  mentions?: string[];
}
