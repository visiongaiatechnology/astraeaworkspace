// STATUS: DIAMANT VGT SUPREME — explicit non-native task export fidelity reporting
import type { TaskItem } from '../../../shared/contracts/workspace';

export type TaskExportFormat = 'vtodo' | 'csv' | 'json' | 'vtask' | 'print';

function any(tasks: TaskItem[], predicate: (task: TaskItem) => boolean): boolean {
  return tasks.some(predicate);
}

export function taskExportFidelityWarnings(tasks: TaskItem[], format: TaskExportFormat): string[] {
  if (format === 'json' || format === 'vtask') return [];
  const warnings: string[] = [];
  if (format === 'print') {
    warnings.push('Print/PDF is a presentation export, not a re-importable task container.');
    return warnings;
  }
  if (any(tasks, (task) => Boolean(task.comments?.length || task.checklist?.length || task.attachments?.length || task.activity?.length))) {
    warnings.push(`${format === 'csv' ? 'CSV' : 'VTODO'} does not preserve comments, checklist detail, attachments, or activity history.`);
  }
  if (any(tasks, (task) => Boolean(task.reminders?.length || task.recurrenceSpec))) {
    warnings.push(`${format === 'csv' ? 'CSV' : 'VTODO'} cannot represent all Astraea reminder/custom recurrence semantics losslessly.`);
  }
  if (any(tasks, (task) => Boolean(task.statusReason || task.blocked || task.linkedWorkspaceUris?.length))) {
    warnings.push(`${format === 'csv' ? 'CSV' : 'VTODO'} does not preserve blocker and workspace-link metadata.`);
  }
  if (format === 'csv' && any(tasks, (task) => Boolean(task.assignees?.length || task.linkedWorkspaceUris?.length))) {
    warnings.push('CSV omits multi-assignee identity and workspace deep-link metadata not present in its canonical columns.');
  }
  return warnings;
}

export function formatTaskFidelityNotice(tasks: TaskItem[], format: TaskExportFormat): string {
  const warnings = taskExportFidelityWarnings(tasks, format);
  return warnings.length ? ` Fidelity notice: ${warnings.join(' ')}` : ' Full canonical task metadata is preserved.';
}
