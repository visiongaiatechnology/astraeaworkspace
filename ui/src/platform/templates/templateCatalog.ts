import type { DocumentKind } from '../../shared/contracts/workspace';

export type BetaTemplateId = 'writer-report' | 'grid-budget' | 'present-pitch' | 'project-plan' | 'whiteboard-architecture';

export interface BetaTemplateDefinition {
  readonly id: BetaTemplateId;
  readonly kind: DocumentKind;
  readonly name: string;
  readonly description: string;
}

/** Safe built-in template metadata. Template document factories live in templates.ts. */
export const BETA_TEMPLATES: readonly BetaTemplateDefinition[] = Object.freeze([
  Object.freeze({ id: 'writer-report', kind: 'Writer', name: 'Professional Report', description: 'Structured report with title, executive summary and section headings.' }),
  Object.freeze({ id: 'grid-budget', kind: 'Grid', name: 'Budget & Forecast', description: 'Quarterly planning sheet with revenue, cost and result formulas.' }),
  Object.freeze({ id: 'present-pitch', kind: 'Present', name: 'Pitch Deck', description: 'Clean 16:9 presentation starter with problem, solution and roadmap slides.' }),
  Object.freeze({ id: 'project-plan', kind: 'Projects', name: 'Project Plan', description: 'Project phases, milestones and initial canonical tasks.' }),
  Object.freeze({ id: 'whiteboard-architecture', kind: 'Whiteboard', name: 'Architecture Board', description: 'System-context whiteboard with editable nodes and connectors.' }),
]);

export function getBetaTemplateDefinition(templateId: unknown): BetaTemplateDefinition | undefined {
  if (typeof templateId !== 'string' || templateId.length > 32) return undefined;
  return BETA_TEMPLATES.find((template) => template.id === templateId);
}
