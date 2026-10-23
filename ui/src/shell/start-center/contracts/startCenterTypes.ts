import type { DocumentKind, WorkspaceDocument } from '../../../shared/contracts/workspace';
import type { BetaTemplateId } from '../../../platform/templates/templateCatalog';
import type { RecoverySnapshotInfo } from '../../../platform/recovery/recovery';
import type { ShellAppearancePreference, ShellRecentEntry, ShellShortcutCommand, ShellShortcutMap, ShellUpdateState } from '../../platform/workspaceShellPlatform';
import type { EditionRegistry } from '../../../edition/contracts';

export type StartCenterCategory =
  | 'all'
  | 'recent'
  | 'productivity'
  | 'work'
  | 'collaboration'
  | 'platform'
  | 'templates';

export interface StartModuleDefinition {
  kind: DocumentKind;
  name: string;
  shortName: string;
  category: 'productivity' | 'work' | 'collaboration' | 'platform';
  categoryLabel: string;
  ext?: string;
  description: string;
  accentColor: string;
  badgeColor: string;
  isPrimary?: boolean;
}

export const ALL_START_MODULES: StartModuleDefinition[] = [
  // Productivity
  {
    kind: 'Writer',
    name: 'Astraea Writer',
    shortName: 'Dokument',
    category: 'productivity',
    categoryLabel: 'Produktivität',
    ext: '.vdoc',
    description: 'Souveräne Textverarbeitung mit Seitenlayout, Stilen, Tabellen, PDF-Export und Fabric-Embeds.',
    accentColor: 'from-blue-500/20 to-indigo-500/20 text-blue-300 border-blue-500/30',
    badgeColor: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
    isPrimary: true,
  },
  {
    kind: 'Grid',
    name: 'Astraea Grid',
    shortName: 'Rechenblatt',
    category: 'productivity',
    categoryLabel: 'Produktivität',
    ext: '.vgrid',
    description: 'High-Performance Tabellenkalkulation mit 45+ Formeln, What-If-Solver und Live-Diagrammen.',
    accentColor: 'from-emerald-500/20 to-teal-500/20 text-emerald-300 border-emerald-500/30',
    badgeColor: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
    isPrimary: true,
  },
  {
    kind: 'Present',
    name: 'Astraea Present',
    shortName: 'Präsentation',
    category: 'productivity',
    categoryLabel: 'Produktivität',
    ext: '.vpresent',
    description: 'Vektor-Foliendecks mit Master-Themes, Sorter/Outline-Modi, Live-Timer und Laserpointer.',
    accentColor: 'from-purple-500/20 to-violet-500/20 text-purple-300 border-purple-500/30',
    badgeColor: 'bg-purple-500/10 text-purple-300 border-purple-500/30',
    isPrimary: true,
  },
  {
    kind: 'Notes',
    name: 'Astraea Notes',
    shortName: 'Notizbuch',
    category: 'productivity',
    categoryLabel: 'Produktivität',
    ext: '.vnote',
    description: 'Zettelkasten-Wissensnetzwerk mit bidirektionaler Verknüpfung und Markdown-Editor.',
    accentColor: 'from-fuchsia-500/20 to-pink-500/20 text-fuchsia-300 border-fuchsia-500/30',
    badgeColor: 'bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/30',
    isPrimary: true,
  },
  {
    kind: 'PdfStudio',
    name: 'Astraea PDF Studio',
    shortName: 'PDF Studio',
    category: 'productivity',
    categoryLabel: 'Produktivität',
    ext: '.vpdf',
    description: 'Lokaler PDF-Reader und Editor mit Seitenoperationen, Annotationen und Redaktionsschutz.',
    accentColor: 'from-rose-500/20 to-red-500/20 text-rose-300 border-rose-500/30',
    badgeColor: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
    isPrimary: false,
  },
  {
    kind: 'Publish',
    name: 'Astraea Publish',
    shortName: 'Publikation',
    category: 'productivity',
    categoryLabel: 'Produktivität',
    ext: '.vpub',
    description: 'Präzise Seitenkomposition für Druck und digitale Publikationen.',
    accentColor: 'from-orange-500/20 to-amber-500/20 text-orange-300 border-orange-500/30',
    badgeColor: 'bg-orange-500/10 text-orange-300 border-orange-500/30',
    isPrimary: false,
  },

  // Work & Projects
  {
    kind: 'Tasks',
    name: 'Astraea Tasks',
    shortName: 'Aufgaben',
    category: 'work',
    categoryLabel: 'Aufgaben & Projekte',
    ext: '.vtask',
    description: 'Kanonische Aufgabenverwaltung mit Fälligkeiten, Prioritäten und Projekt-Verknüpfung.',
    accentColor: 'from-cyan-500/20 to-blue-500/20 text-cyan-300 border-cyan-500/30',
    badgeColor: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30',
    isPrimary: false,
  },
  {
    kind: 'Planner',
    name: 'Astraea Planner',
    shortName: 'Kanban Board',
    category: 'work',
    categoryLabel: 'Aufgaben & Projekte',
    description: 'Agiles Kanban-Board mit anpassbaren Spalten, Drag-and-Drop Lanes und Zuweisungen.',
    accentColor: 'from-indigo-500/20 to-violet-500/20 text-indigo-300 border-indigo-500/30',
    badgeColor: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30',
    isPrimary: false,
  },
  {
    kind: 'Projects',
    name: 'Astraea Projects',
    shortName: 'Projekte & Gantt',
    category: 'work',
    categoryLabel: 'Aufgaben & Projekte',
    description: 'Meilenstein-Zeitpläne und interaktive Gantt-Diagramme mit Phasen-Fortschrittsreglern.',
    accentColor: 'from-emerald-500/20 to-green-500/20 text-emerald-300 border-emerald-500/30',
    badgeColor: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
    isPrimary: false,
  },

  // Collaboration & Data
  {
    kind: 'Whiteboard',
    name: 'Astraea Whiteboard',
    shortName: 'Whiteboard',
    category: 'collaboration',
    categoryLabel: 'Kollaboration & Daten',
    ext: '.vboard',
    description: 'Unendliche Vektor-Leinwand für Skizzen, Systemdiagramme, Flowcharts und Brainstorming.',
    accentColor: 'from-pink-500/20 to-rose-500/20 text-pink-300 border-pink-500/30',
    badgeColor: 'bg-pink-500/10 text-pink-300 border-pink-500/30',
    isPrimary: false,
  },
  {
    kind: 'Draw',
    name: 'Astraea Draw',
    shortName: 'Diagramm',
    category: 'collaboration',
    categoryLabel: 'Kollaboration & Daten',
    ext: '.vdraw',
    description: 'Strukturierte Vektor-Diagramme mit Seiten, Layern, Routing, Stencils, Data Graphics und sicherem Interop.',
    accentColor: 'from-cyan-500/20 to-indigo-500/20 text-cyan-300 border-cyan-500/30',
    badgeColor: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30',
    isPrimary: false,
  },
  {
    kind: 'Connect',
    name: 'Astraea Connect',
    shortName: 'Kommunikation',
    category: 'collaboration',
    categoryLabel: 'Kollaboration & Daten',
    ext: '.vconnect',
    description: 'Lokaler Kommunikationsbereich mit geschützter Inhaltsverarbeitung.',
    accentColor: 'from-cyan-600/20 to-blue-600/20 text-cyan-300 border-cyan-500/30',
    badgeColor: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30',
    isPrimary: false,
  },
  {
    kind: 'Forms',
    name: 'Astraea Forms',
    shortName: 'Formulare',
    category: 'collaboration',
    categoryLabel: 'Kollaboration & Daten',
    description: 'Lokaler Formular-Generator mit Validierung, Offline-Antworten und Tabellen-Mapping.',
    accentColor: 'from-teal-500/20 to-cyan-500/20 text-teal-300 border-teal-500/30',
    badgeColor: 'bg-teal-500/10 text-teal-300 border-teal-500/30',
    isPrimary: false,
  },
  {
    kind: 'Database',
    name: 'Astraea Database',
    shortName: 'Datenbank',
    category: 'collaboration',
    categoryLabel: 'Kollaboration & Daten',
    description: 'Lokale relationale Datenbank mit benutzerdefinierten Schemas, Datensätzen und Relationen.',
    accentColor: 'from-violet-500/20 to-purple-500/20 text-violet-300 border-violet-500/30',
    badgeColor: 'bg-violet-500/10 text-violet-300 border-violet-500/30',
    isPrimary: false,
  },
  {
    kind: 'Insight',
    name: 'Astraea Insight',
    shortName: 'Analysen',
    category: 'platform',
    categoryLabel: 'Souveräne Plattform',
    ext: '.vinsight',
    description: 'Lokale Kennzahlen, Pivot-Auswertungen und interaktive Datenexploration.',
    accentColor: 'from-sky-500/20 to-indigo-500/20 text-sky-300 border-sky-500/30',
    badgeColor: 'bg-sky-500/10 text-sky-300 border-sky-500/30',
    isPrimary: false,
  },
  {
    kind: 'Automate',
    name: 'Astraea Automate',
    shortName: 'Automatisierung',
    category: 'platform',
    categoryLabel: 'Souveräne Plattform',
    ext: '.vauto',
    description: 'Visueller Automationsdesigner mit begrenzter Ausführung und Ablaufprotokoll.',
    accentColor: 'from-fuchsia-600/20 to-purple-600/20 text-fuchsia-300 border-fuchsia-500/30',
    badgeColor: 'bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/30',
    isPrimary: false,
  },

  // Platform Tools
  {
    kind: 'Vault',
    name: 'Astraea Vault',
    shortName: 'Souveräner Tresor',
    category: 'platform',
    categoryLabel: 'Souveräne Plattform',
    ext: '.vvault',
    description: 'Verschlüsselter Dateibrowser mit SHA-256 Digest-Prüfung, Papierkorb und VWC-Container-Backups.',
    accentColor: 'from-amber-500/20 to-yellow-600/20 text-amber-300 border-amber-500/30',
    badgeColor: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
    isPrimary: true,
  },
  {
    kind: 'Spaces',
    name: 'Astraea Spaces',
    shortName: 'Team-Räume',
    category: 'platform',
    categoryLabel: 'Souveräne Plattform',
    description: 'Lokale Arbeits- und Projekträume mit Rollen, verknüpften Dokumenten und Aktivitäts-Historie.',
    accentColor: 'from-indigo-500/20 to-purple-500/20 text-indigo-300 border-indigo-500/30',
    badgeColor: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30',
    isPrimary: false,
  },
  {
    kind: 'AdminPolicy',
    name: 'Astraea Admin & Policy',
    shortName: 'Admin Policy',
    category: 'platform',
    categoryLabel: 'Souveräne Plattform',
    ext: '.vadmin',
    description: 'Lokale Governance-Konsole für Rollen, DLP, Retention, Schlüssel, Geräte, Audit, Backup und Policy-Lifecycle.',
    accentColor: 'from-slate-500/20 to-purple-500/20 text-slate-200 border-purple-500/30',
    badgeColor: 'bg-purple-500/10 text-purple-200 border-purple-500/30',
    isPrimary: false,
  },
  {
    kind: 'GaiaCom',
    name: 'GaiaCom Bridge',
    shortName: 'P2P Bridge',
    category: 'platform',
    categoryLabel: 'Souveräne Plattform',
    description: 'Sichere Dokumentenaustausch-Brücke mit E2EE-Verifikation und Offline-Transfers.',
    accentColor: 'from-violet-500/20 to-fuchsia-500/20 text-violet-300 border-violet-500/30',
    badgeColor: 'bg-violet-500/10 text-violet-300 border-violet-500/30',
    isPrimary: false,
  },
];

export interface StartCenterProps {
  isOpen: boolean;
  editionRegistry: EditionRegistry;
  initialSearchQuery?: string;
  onClose: () => void;
  onCreateDocument: (kind: DocumentKind) => void;
  onCreateTemplate: (templateId: BetaTemplateId) => void;
  onOpenFile: (file: File) => void;
  onOpenVault: () => void;
  onOpenExplorer?: () => void;
  recoverySnapshots: RecoverySnapshotInfo[];
  onRestoreRecovery: (snapshotId: string) => void;
  onDeleteRecovery: (snapshotId: string) => void;
  onExportDiagnostics: () => void;
  onOpenPlatformModal?: () => void;
  documents: Record<string, WorkspaceDocument>;
  recentEntries: ShellRecentEntry[];
  storedDocumentIds: ReadonlySet<string>;
  metadataLocked: boolean;
  onOpenRecentDocument: (documentId: string) => void;
  shellAppearance: ShellAppearancePreference;
  shellShortcuts: ShellShortcutMap;
  shellUpdateState: ShellUpdateState;
  onShellAppearanceChange: (next: ShellAppearancePreference) => void;
  onShellShortcutChange: (command: ShellShortcutCommand, binding: string) => void;
  onOpenNewWindow: () => void;
}
