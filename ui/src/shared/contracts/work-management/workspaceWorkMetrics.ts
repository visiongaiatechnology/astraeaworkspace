export interface EvmMetrics {
  plannedValuePv: number;
  earnedValueEv: number;
  actualCostAc: number;
  scheduleVarianceSv: number;
  costVarianceCv: number;
  schedulePerformanceIndexSpi: number;
  costPerformanceIndexCpi: number;
  budgetAtCompletionBac: number;
  estimateAtCompletionEac: number;
  varianceAtCompletionVac: number;
  statusAssessment: 'ahead_under_budget' | 'ahead_over_budget' | 'behind_under_budget' | 'behind_over_budget' | 'on_track';
}
