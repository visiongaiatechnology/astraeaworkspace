import type { EvmMetrics } from '../contracts/work-management/workspaceWorkMetrics';

export interface WorkEarnedValueInput {
  readonly estimateHours?: number;
  readonly completed?: boolean;
  readonly progress?: number;
  readonly dueDate?: string;
  readonly startDate?: string;
}

export function calculateWorkEarnedValueMetrics(
  tasks: readonly WorkEarnedValueInput[],
  hourlyRate = 85,
  statusDateMs = Date.now(),
): EvmMetrics {
  let bac = 0;
  let pv = 0;
  let ev = 0;
  let ac = 0;

  for (const task of tasks.slice(0, 50_000)) {
    const hours = task.estimateHours && task.estimateHours > 0 ? task.estimateHours : 8;
    const taskBudget = hours * hourlyRate;
    bac += taskBudget;
    const progressFraction = (task.completed ? 100 : (task.progress || 0)) / 100;
    ev += taskBudget * progressFraction;

    if (task.dueDate) {
      const dueMs = new Date(task.dueDate).getTime();
      const startMs = task.startDate ? new Date(task.startDate).getTime() : dueMs - 86_400_000;
      if (!Number.isNaN(dueMs)) {
        if (statusDateMs >= dueMs) pv += taskBudget;
        else if (statusDateMs > startMs && dueMs > startMs) {
          const fractionPlanned = (statusDateMs - startMs) / (dueMs - startMs);
          pv += taskBudget * Math.min(1, Math.max(0, fractionPlanned));
        }
      }
    } else {
      pv += taskBudget * 0.5;
    }

    ac += (task.completed ? hours : hours * progressFraction) * 0.95 * hourlyRate;
  }

  pv = Math.round(pv * 100) / 100;
  ev = Math.round(ev * 100) / 100;
  ac = Math.round(ac * 100) / 100;
  bac = Math.round(bac * 100) / 100;

  const sv = Math.round((ev - pv) * 100) / 100;
  const cv = Math.round((ev - ac) * 100) / 100;
  const spi = pv > 0 ? Math.round((ev / pv) * 100) / 100 : 1;
  const cpi = ac > 0 ? Math.round((ev / ac) * 100) / 100 : 1;
  const eac = cpi > 0 ? Math.round((bac / cpi) * 100) / 100 : bac;
  const vac = Math.round((bac - eac) * 100) / 100;

  let statusAssessment: EvmMetrics['statusAssessment'] = 'on_track';
  if (spi >= 1 && cpi >= 1) statusAssessment = 'ahead_under_budget';
  else if (spi >= 1 && cpi < 1) statusAssessment = 'ahead_over_budget';
  else if (spi < 1 && cpi >= 1) statusAssessment = 'behind_under_budget';
  else if (spi < 1 && cpi < 1) statusAssessment = 'behind_over_budget';

  return {
    plannedValuePv: pv,
    earnedValueEv: ev,
    actualCostAc: ac,
    scheduleVarianceSv: sv,
    costVarianceCv: cv,
    schedulePerformanceIndexSpi: spi,
    costPerformanceIndexCpi: cpi,
    budgetAtCompletionBac: bac,
    estimateAtCompletionEac: eac,
    varianceAtCompletionVac: vac,
    statusAssessment,
  };
}
