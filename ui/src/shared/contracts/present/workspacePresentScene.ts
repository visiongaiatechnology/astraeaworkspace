import type { ChartObject } from '../visualization/workspaceShapesCharts';
import type { WriterWorkspaceEmbedSnapshot } from '../workspace-integration/workspaceWriterIntegration';

// STATUS: DIAMANT VGT SUPREME — Present Slide & Scene Types
// --- Astraea Present Types ---
export interface PresentSlideCard {
  id: string;
  title: string;
  description: string;
  color?: string;
  colorTheme?: 'blue' | 'emerald' | 'purple' | 'amber' | 'rose';
  customColor?: string;
}

export interface PresentObjectGeometry {
  /** Stable logical identity used for Morph across duplicated/related slides. */
  morphKey?: string;
  xPercent: number;
  yPercent: number;
  widthPercent: number;
  heightPercent: number;
  rotation?: number;
  opacity?: number;
  zIndex?: number;
  locked?: boolean;
  hidden?: boolean;
}

export interface PresentImageObject extends PresentObjectGeometry {
  id: string;
  name: string;
  dataUrl: string;
  altText?: string;
}

export interface PresentTextSceneObject extends PresentObjectGeometry {
  id: string;
  kind: 'text';
  text: string;
  fontSizePt: number;
  fontWeight?: 'normal' | 'semibold' | 'bold';
  color: string;
  textAlign?: 'left' | 'center' | 'right';
  backgroundColor?: string;
}

export interface PresentShapeSceneObject extends PresentObjectGeometry {
  id: string;
  kind: 'shape';
  shape: 'rectangle' | 'rounded-rectangle' | 'ellipse' | 'triangle' | 'diamond' | 'arrow-right' | 'arrow-left' | 'star' | 'callout' | 'line';
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
}

export type PresentWidgetType =
  | 'kpi'
  | 'progress'
  | 'progress-ring'
  | 'gauge'
  | 'milestone'
  | 'roadmap'
  | 'comparison'
  | 'quote'
  | 'status'
  | 'calendar'
  | 'icon-stat'
  | 'device'
  | 'gallery'
  | 'rating';

export type PresentWidgetStatus = 'neutral' | 'good' | 'warning' | 'critical';

export interface PresentWidgetItem {
  id: string;
  label: string;
  value?: string;
  subtitle?: string;
  color?: string;
  status?: PresentWidgetStatus;
}

export interface PresentWidgetGalleryItem {
  id: string;
  name: string;
  dataUrl: string;
  caption?: string;
}

export interface PresentWidgetSceneObject extends PresentObjectGeometry {
  id: string;
  kind: 'widget';
  widgetType: PresentWidgetType;
  label: string;
  value: string;
  accentColor: string;
  progress?: number;
  secondaryValue?: string;
  items?: PresentWidgetItem[];
  profileName?: string;
  profileRole?: string;
  calendarYear?: number;
  calendarMonth?: number;
  highlightedDays?: number[];
  iconKey?: 'activity' | 'shield' | 'users' | 'trend' | 'clock' | 'target';
  deviceKind?: 'browser' | 'phone' | 'tablet';
  deviceUrlLabel?: string;
  galleryItems?: PresentWidgetGalleryItem[];
  ratingValue?: number;
  ratingMax?: number;
}

export interface PresentChartSceneObject extends PresentObjectGeometry {
  id: string;
  kind: 'chart';
  chart: ChartObject;
  linked: boolean;
}

export interface PresentTableSceneObject extends PresentObjectGeometry {
  id: string;
  kind: 'table';
  columns: string[];
  rows: string[][];
  headerColor: string;
  bodyColor: string;
  textColor: string;
}

export interface PresentDiagramItem {
  id: string;
  title: string;
  subtitle?: string;
  color?: string;
}

export interface PresentDiagramSceneObject extends PresentObjectGeometry {
  id: string;
  kind: 'diagram';
  diagramType: 'process' | 'timeline' | 'matrix' | 'hierarchy';
  items: PresentDiagramItem[];
  accentColor?: string;
}

export interface PresentCodeSceneObject extends PresentObjectGeometry {
  id: string;
  kind: 'code';
  code: string;
  language: string;
  lineNumbers?: boolean;
}

export type PresentWorkspaceIntegrationKind =
  | 'grid-range'
  | 'grid-chart'
  | 'grid-kpi'
  | 'project-timeline'
  | 'task-list'
  | 'task-kpi'
  | 'project-milestone'
  | 'database-table'
  | 'database-chart'
  | 'whiteboard-frame'
  | 'writer-section'
  | 'pdf-page'
  | 'forms-dashboard'
  | 'vault-asset'
  | 'space-context';

export interface PresentWorkspaceSceneObject extends PresentObjectGeometry {
  id: string;
  kind: 'workspace';
  integrationKind: PresentWorkspaceIntegrationKind;
  mode: 'Live' | 'Frozen';
  sourceDocumentId: string;
  sourceObjectId?: string;
  sourceSelector?: string;
  sourceVersion: number;
  uri: string;
  title: string;
  snapshot: WriterWorkspaceEmbedSnapshot;
}

export type PresentSceneObject =
  | PresentTextSceneObject
  | PresentShapeSceneObject
  | PresentWidgetSceneObject
  | PresentChartSceneObject
  | PresentTableSceneObject
  | PresentDiagramSceneObject
  | PresentCodeSceneObject
  | PresentWorkspaceSceneObject;
