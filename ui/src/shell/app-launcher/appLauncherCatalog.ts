// STATUS: PLATIN — immutable shell app catalog separated from drawer interaction state.
import type { DocumentKind } from '../../shared/contracts/workspace';

export interface AppDefinition {
  id: string;
  kind?: DocumentKind;
  action?: 'start-center' | 'search' | 'explorer';
  name: string;
  category: 'Office' | 'Collaboration' | 'Core Engine' | 'Security' | 'Admin';
  ext?: string;
  description: string;
  gradient: string;
  accentText: string;
  badgeBorder: string;
  availability?: 'implemented' | 'premium-required';
}

export const ALL_APPS: ReadonlyArray<AppDefinition> = [
  // Productivity Apps
  {
    id: 'doc-writer',
    kind: 'Writer',
    name: 'Astraea Writer',
    category: 'Office',
    ext: '.vdoc',
    description: 'Local-first word processor with page layout, styles, media, tables, PDF export and Workspace Fabric embeds.',
    gradient: 'from-blue-600 to-indigo-600',
    accentText: 'text-blue-400',
    badgeBorder: 'border-blue-500/30 text-blue-300 bg-blue-500/10',
  },
  {
    id: 'doc-grid',
    kind: 'Grid',
    name: 'Astraea Grid',
    category: 'Office',
    ext: '.vgrid',
    description: 'High-performance computational spreadsheet with live formula evaluation and chart fabric engines.',
    gradient: 'from-emerald-600 to-teal-600',
    accentText: 'text-emerald-400',
    badgeBorder: 'border-emerald-500/30 text-emerald-300 bg-emerald-500/10',
  },
  {
    id: 'doc-present',
    kind: 'Present',
    name: 'Astraea Present',
    category: 'Office',
    ext: '.vpresent',
    description: 'Vector-grade presentation engine with live cross-document charts and interactive slide canvas.',
    gradient: 'from-purple-600 to-violet-600',
    accentText: 'text-purple-400',
    badgeBorder: 'border-purple-500/30 text-purple-300 bg-purple-500/10',
  },
  {
    id: 'doc-notes',
    kind: 'Notes',
    name: 'Astraea Notes',
    category: 'Office',
    ext: '.vnote',
    description: 'Bi-directionally linked knowledge base, Zettelkasten notebook and encrypted personal wiki.',
    gradient: 'from-purple-600 to-pink-600',
    accentText: 'text-purple-400',
    badgeBorder: 'border-purple-500/30 text-purple-300 bg-purple-500/10',
  },
  {
    id: 'doc-pdfstudio',
    kind: 'PdfStudio',
    name: 'Astraea PDF Studio',
    category: 'Office',
    ext: '.vpdf',
    description: 'Local PDF reader/editor with page operations, annotations and structured redaction export.',
    gradient: 'from-rose-600 to-red-600',
    accentText: 'text-rose-400',
    badgeBorder: 'border-rose-500/30 text-rose-300 bg-rose-500/10',
  },

  // Work Management
  {
    id: 'doc-tasks',
    kind: 'Tasks',
    name: 'Astraea Tasks',
    category: 'Collaboration',
    ext: '.vtask',
    description: 'Canonical task manager with priorities, due dates, subtasks, comments, attachments and Planner/Project links.',
    gradient: 'from-blue-600 to-cyan-600',
    accentText: 'text-cyan-400',
    badgeBorder: 'border-cyan-500/30 text-cyan-300 bg-cyan-500/10',
  },
  {
    id: 'doc-planner',
    kind: 'Planner',
    name: 'Astraea Planner',
    category: 'Collaboration',
    description: 'Agile Kanban board with customizable columns, drag-and-drop workflow lanes, and peer assignees.',
    gradient: 'from-indigo-600 to-violet-600',
    accentText: 'text-indigo-400',
    badgeBorder: 'border-indigo-500/30 text-indigo-300 bg-indigo-500/10',
  },
  {
    id: 'doc-projects',
    kind: 'Projects',
    name: 'Astraea Projects',
    category: 'Collaboration',
    description: 'Milestone timeline and interactive Gantt charts with live completion percentage sliders.',
    gradient: 'from-emerald-600 to-green-600',
    accentText: 'text-emerald-400',
    badgeBorder: 'border-emerald-500/30 text-emerald-300 bg-emerald-500/10',
  },

  // Information & Collaboration
  {
    id: 'doc-whiteboard',
    kind: 'Whiteboard',
    name: 'Astraea Whiteboard',
    category: 'Collaboration',
    ext: '.vboard',
    description: 'Infinite vector spatial canvas for freehand ideation, diagramming, and collaborative sketching.',
    gradient: 'from-fuchsia-600 to-pink-600',
    accentText: 'text-fuchsia-400',
    badgeBorder: 'border-fuchsia-500/30 text-fuchsia-300 bg-fuchsia-500/10',
  },
  {
    id: 'doc-draw',
    kind: 'Draw',
    name: 'Astraea Draw',
    category: 'Collaboration',
    ext: '.vdraw',
    description: 'Structured vector diagramming with pages, layers, routing, engineering stencils, data graphics and encrypted native files.',
    gradient: 'from-cyan-600 to-indigo-600',
    accentText: 'text-cyan-400',
    badgeBorder: 'border-cyan-500/30 text-cyan-300 bg-cyan-500/10',
  },
  {
    id: 'doc-forms',
    kind: 'Forms',
    name: 'Astraea Forms',
    category: 'Collaboration',
    description: 'Local form builder with validation, conditional logic, offline responses and Grid/Database mappings.',
    gradient: 'from-cyan-600 to-teal-600',
    accentText: 'text-cyan-400',
    badgeBorder: 'border-cyan-500/30 text-cyan-300 bg-cyan-500/10',
  },
  {
    id: 'doc-database',
    kind: 'Database',
    name: 'Astraea Database',
    category: 'Collaboration',
    description: 'Local relational database system with custom schema models, records, and linked relational views.',
    gradient: 'from-violet-600 to-purple-600',
    accentText: 'text-violet-400',
    badgeBorder: 'border-violet-500/30 text-violet-300 bg-violet-500/10',
  },

  // Platform Tools
  {
    id: 'doc-vault',
    kind: 'Vault',
    name: 'Astraea Vault',
    category: 'Security',
    ext: '.vvault',
    description: 'Encrypted workspace filesystem browser with persisted payloads, SHA-256 content-digest verification, trash/restore and VWC backup.',
    gradient: 'from-amber-500 to-yellow-700',
    accentText: 'text-amber-400',
    badgeBorder: 'border-amber-500/30 text-amber-300 bg-amber-500/10',
  },
  {
    id: 'doc-spaces',
    kind: 'Spaces',
    name: 'Astraea Spaces',
    category: 'Collaboration',
    description: 'Local team/project spaces with members, roles, linked Workspace documents and activity history.',
    gradient: 'from-indigo-600 to-purple-600',
    accentText: 'text-indigo-400',
    badgeBorder: 'border-indigo-500/30 text-indigo-300 bg-indigo-500/10',
  },
  {
    id: 'doc-gaiacom',
    kind: 'GaiaCom',
    name: 'Astraea GaiaCom Bridge',
    category: 'Security',
    description: 'Secure document exchange bridge. Local E2EE verification is available; native LAN/BLE/QR transport attaches through the desktop GaiaCom service.',
    gradient: 'from-violet-600 to-pink-600',
    accentText: 'text-violet-400',
    badgeBorder: 'border-violet-500/30 text-violet-300 bg-violet-500/10',
  },
  {
    id: 'doc-publish', kind: 'Publish', name: 'Astraea Publish', category: 'Office', ext: '.vpub',
    description: 'Page-layout and publication workspace for precise print and digital composition.',
    gradient: 'from-orange-600 to-amber-600', accentText: 'text-orange-400', badgeBorder: 'border-orange-500/30 text-orange-300 bg-orange-500/10',
  },
  {
    id: 'doc-insight', kind: 'Insight', name: 'Astraea Insight', category: 'Core Engine', ext: '.vinsight',
    description: 'Local analytics, pivots, KPIs and cross-filtered visual exploration.',
    gradient: 'from-sky-600 to-indigo-600', accentText: 'text-sky-400', badgeBorder: 'border-sky-500/30 text-sky-300 bg-sky-500/10',
  },
  {
    id: 'doc-connect', kind: 'Connect', name: 'Astraea Connect', category: 'Collaboration', ext: '.vconnect',
    description: 'Local-first mail and communication workspace with protected content handling.',
    gradient: 'from-cyan-700 to-blue-700', accentText: 'text-cyan-300', badgeBorder: 'border-cyan-500/30 text-cyan-300 bg-cyan-500/10',
  },
  {
    id: 'doc-automate', kind: 'Automate', name: 'Astraea Automate', category: 'Core Engine', ext: '.vauto',
    description: 'Visual deterministic automation designer with bounded execution and tracing.',
    gradient: 'from-fuchsia-700 to-purple-700', accentText: 'text-fuchsia-300', badgeBorder: 'border-fuchsia-500/30 text-fuchsia-300 bg-fuchsia-500/10',
  },
  {
    id: 'doc-adminpolicy', kind: 'AdminPolicy', name: 'Astraea Admin & Policy', category: 'Admin', ext: '.vpolicy',
    description: 'Organization policy, governance, retention and security administration.',
    gradient: 'from-slate-600 to-slate-800', accentText: 'text-slate-300', badgeBorder: 'border-slate-500/30 text-slate-300 bg-slate-500/10',
  },
  {
    id: 'shell-start-center', action: 'start-center', name: 'Workspace Home', category: 'Core Engine', ext: 'Shell',
    description: 'Start Center, recent work, templates, recovery and platform status.',
    gradient: 'from-purple-700 to-indigo-700', accentText: 'text-purple-300', badgeBorder: 'border-purple-500/30 text-purple-300 bg-purple-500/10',
  },
  {
    id: 'shell-search', action: 'search', name: 'Workspace Search', category: 'Core Engine', ext: 'Search',
    description: 'Permission-safe local search across Workspace documents and derived content.',
    gradient: 'from-indigo-700 to-blue-700', accentText: 'text-indigo-300', badgeBorder: 'border-indigo-500/30 text-indigo-300 bg-indigo-500/10',
  },
  {
    id: 'shell-explorer', action: 'explorer', name: 'Workspace Explorer', category: 'Core Engine', ext: 'Library',
    description: 'Browse, search and organize saved Workspace documents.',
    gradient: 'from-slate-600 to-indigo-700', accentText: 'text-[var(--vgt-accent)]', badgeBorder: 'border-[var(--vgt-metal-edge)] text-[var(--vgt-text-secondary)] bg-[var(--vgt-control-surface)]',
  },
];
