import type { AppCatalogMetadata, AppKind } from './contracts';

function freezeMetadata(entry: AppCatalogMetadata): Readonly<AppCatalogMetadata> {
  return Object.freeze({ ...entry });
}

/**
 * Safe, static product metadata only. This module must never import an app
 * implementation, renderer, parser, factory, or operational provider.
 */
export const APP_CATALOG: readonly Readonly<AppCatalogMetadata>[] = Object.freeze([
  freezeMetadata({
    kind: 'Writer',
    name: 'Astraea Writer',
    shortName: 'Writer',
    category: 'productivity',
    extension: '.vdoc',
    description: 'Local-first word processing with page layout, styles, tables, PDF export, and Workspace Fabric embeds.',
  }),
  freezeMetadata({
    kind: 'Grid',
    name: 'Astraea Grid',
    shortName: 'Grid',
    category: 'productivity',
    extension: '.vgrid',
    description: 'Spreadsheet workspace with formulas, what-if analysis, and live charts.',
  }),
  freezeMetadata({
    kind: 'Present',
    name: 'Astraea Present',
    shortName: 'Present',
    category: 'productivity',
    extension: '.vpresent',
    description: 'Presentation workspace with slide themes, outline views, timers, and a laser pointer.',
  }),
  freezeMetadata({
    kind: 'Notes',
    name: 'Astraea Notes',
    shortName: 'Notes',
    category: 'productivity',
    extension: '.vnote',
    description: 'Linked notebook with a Zettelkasten knowledge graph and Markdown editing.',
  }),
  freezeMetadata({
    kind: 'PdfStudio',
    name: 'Astraea PDF Studio',
    shortName: 'PDF Studio',
    category: 'productivity',
    extension: '.vpdf',
    description: 'Local PDF reader and editor with page operations, annotations, and redaction tools.',
  }),
  freezeMetadata({
    kind: 'Tasks',
    name: 'Astraea Tasks',
    shortName: 'Tasks',
    category: 'work',
    extension: '.vtask',
    description: 'Task management with due dates, priorities, and project links.',
  }),
  freezeMetadata({
    kind: 'Planner',
    name: 'Astraea Planner',
    shortName: 'Planner',
    category: 'work',
    description: 'Kanban workspace with configurable columns, workflow lanes, and assignments.',
  }),
  freezeMetadata({
    kind: 'Projects',
    name: 'Astraea Projects',
    shortName: 'Projects',
    category: 'work',
    description: 'Project milestones, phase tracking, and interactive Gantt timelines.',
  }),
  freezeMetadata({
    kind: 'Whiteboard',
    name: 'Astraea Whiteboard',
    shortName: 'Whiteboard',
    category: 'collaboration',
    extension: '.vboard',
    description: 'Infinite canvas for sketches, diagrams, flowcharts, and brainstorming.',
  }),
  freezeMetadata({
    kind: 'Draw',
    name: 'Astraea Draw',
    shortName: 'Draw',
    category: 'collaboration',
    extension: '.vdraw',
    description: 'Structured vector diagrams with pages, layers, routing, and data graphics.',
  }),
  freezeMetadata({
    kind: 'Forms',
    name: 'Astraea Forms',
    shortName: 'Forms',
    category: 'collaboration',
    description: 'Form builder with validation, offline responses, and table mapping.',
  }),
  freezeMetadata({
    kind: 'Database',
    name: 'Astraea Database',
    shortName: 'Database',
    category: 'collaboration',
    description: 'Local relational database workspace with schemas, records, and relations.',
  }),
  freezeMetadata({
    kind: 'Vault',
    name: 'Astraea Vault',
    shortName: 'Vault',
    category: 'platform',
    extension: '.vvault',
    description: 'Protected local file workspace with integrity checks and encrypted backups.',
  }),
  freezeMetadata({
    kind: 'Spaces',
    name: 'Astraea Spaces',
    shortName: 'Spaces',
    category: 'platform',
    description: 'Team workspaces with roles, linked documents, and activity history.',
  }),
  freezeMetadata({
    kind: 'AdminPolicy',
    name: 'Astraea Admin & Policy',
    shortName: 'Admin & Policy',
    category: 'platform',
    extension: '.vpolicy',
    description: 'Governance workspace for access, retention, audit, and security policy.',
  }),
  freezeMetadata({
    kind: 'GaiaCom',
    name: 'Astraea GaiaCom Bridge',
    shortName: 'GaiaCom',
    category: 'platform',
    description: 'Secure document exchange with end-to-end verification and offline transfers.',
  }),
  freezeMetadata({
    kind: 'Publish',
    name: 'Astraea Publish',
    shortName: 'Publish',
    category: 'productivity',
    extension: '.vpub',
    description: 'Page-layout workspace for print and digital publication.',
  }),
  freezeMetadata({
    kind: 'Insight',
    name: 'Astraea Insight',
    shortName: 'Insight',
    category: 'platform',
    extension: '.vinsight',
    description: 'Local analytics, pivots, KPIs, and cross-filtered visual exploration.',
  }),
  freezeMetadata({
    kind: 'Connect',
    name: 'Astraea Connect',
    shortName: 'Connect',
    category: 'collaboration',
    extension: '.vconnect',
    description: 'Local-first mail and communication workspace with protected content handling.',
  }),
  freezeMetadata({
    kind: 'Automate',
    name: 'Astraea Automate',
    shortName: 'Automate',
    category: 'platform',
    extension: '.vauto',
    description: 'Visual automation designer with bounded execution and tracing.',
  }),
]);

const APP_KINDS: ReadonlySet<string> = new Set(APP_CATALOG.map((app) => app.kind));
const APP_BY_EXTENSION: ReadonlyMap<string, Readonly<AppCatalogMetadata>> = new Map(
  APP_CATALOG.flatMap((app) => app.extension ? [[app.extension, app] as const] : []),
);

export function isAppKind(value: unknown): value is AppKind {
  return typeof value === 'string' && value.length <= 32 && APP_KINDS.has(value);
}

export function findAppMetadataByExtension(extension: string): Readonly<AppCatalogMetadata> | undefined {
  return APP_BY_EXTENSION.get(extension);
}
