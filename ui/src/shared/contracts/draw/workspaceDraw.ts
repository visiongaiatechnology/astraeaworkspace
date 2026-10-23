// STATUS: DIAMANT VGT SUPREME — Astraea Draw canonical workspace model

export type DrawCanvasMode = 'infinite' | 'pages';
export type DrawOrientation = 'portrait' | 'landscape';
export type DrawLayerId = string;
export type DrawObjectId = string;
export type DrawPageId = string;
export type DrawGroupId = string;
export type DrawPoint = Readonly<{ x: number; y: number }>;
export type DrawBounds = Readonly<{ x: number; y: number; width: number; height: number }>;

export interface DrawPage {
  id: DrawPageId;
  name: string;
  width: number;
  height: number;
  orientation: DrawOrientation;
  printableBounds: DrawBounds;
  objectIds: DrawObjectId[];
  layerIds: DrawLayerId[];
}

export interface DrawLayer {
  id: DrawLayerId;
  name: string;
  visible: boolean;
  locked: boolean;
  printable: boolean;
  order: number;
}

export interface DrawGuide {
  id: string;
  axis: 'x' | 'y';
  position: number;
}

export interface DrawViewport {
  zoom: number;
  panX: number;
  panY: number;
  showMiniMap: boolean;
  showGrid: boolean;
  gridSize: number;
  showRulers: boolean;
  guides: DrawGuide[];
  snapToGrid: boolean;
  snapToShapes: boolean;
  snapToGuides: boolean;
  snapTolerance: number;
}

export type DrawShapeKind =
  | 'rectangle' | 'ellipse' | 'polygon' | 'star' | 'line' | 'arrow'
  | 'bezier' | 'freehand' | 'text' | 'callout' | 'icon' | 'custom-path';
export type DrawFillRule = 'nonzero' | 'evenodd';
export type DrawArrowhead = 'none' | 'triangle' | 'open' | 'diamond' | 'circle';

export interface DrawVectorStyle {
  fill: string;
  stroke: string;
  strokeWidth: number;
  dash: number[];
  opacity: number;
  cornerRadius: number;
  shadow?: Readonly<{ x: number; y: number; blur: number; color: string; opacity: number }>;
  arrowStart: DrawArrowhead;
  arrowEnd: DrawArrowhead;
}

export interface DrawPathNode {
  id: string;
  point: DrawPoint;
  inHandle?: DrawPoint;
  outHandle?: DrawPoint;
}

export interface DrawCompoundPath {
  operation: 'union' | 'subtract' | 'intersect' | 'exclude';
  sourceObjectIds: DrawObjectId[];
  sourceRevision: number;
}

export interface DrawVectorData {
  kind: DrawShapeKind;
  style: DrawVectorStyle;
  points?: DrawPoint[];
  pathNodes?: DrawPathNode[];
  closed?: boolean;
  fillRule?: DrawFillRule;
  iconName?: string;
  compound?: DrawCompoundPath;
}

export type DrawConnectionAnchor = 'auto' | 'top' | 'right' | 'bottom' | 'left' | `point:${string}`;
export type DrawConnectorRoute = 'straight' | 'orthogonal' | 'curved' | 'custom';
export interface DrawConnectorEndpoint { objectId: DrawObjectId; anchor: DrawConnectionAnchor; }
export interface DrawConnectorSemantic {
  label?: string;
  cardinalityFrom?: string;
  cardinalityTo?: string;
  relationshipType?: string;
  metadata?: Record<string, string>;
}
export interface DrawConnectorData {
  from: DrawConnectorEndpoint;
  to: DrawConnectorEndpoint;
  route: DrawConnectorRoute;
  autoRoute: boolean;
  waypoints: DrawPoint[];
  obstacleAvoidance: boolean;
  routingPriority: number;
  crossingStyle: 'none' | 'jump';
  semantic: DrawConnectorSemantic;
  arrowStart: DrawArrowhead;
  arrowEnd: DrawArrowhead;
}


export type DrawDiagramFamily =
  | 'flowchart' | 'swimlane' | 'bpmn' | 'data-flow' | 'process-map'
  | 'uml-class' | 'uml-sequence' | 'uml-component' | 'uml-deployment' | 'uml-use-case' | 'uml-activity' | 'uml-state' | 'uml-package' | 'uml-object'
  | 'erd' | 'network-logical' | 'network-physical' | 'rack' | 'org-chart' | 'mind-map' | 'timeline' | 'pert' | 'gantt' | 'floor-plan' | 'electrical' | 'engineering';

export interface DrawDiagramMetadata {
  family: DrawDiagramFamily;
  role?: string;
  entity?: { tableId?: string; fields: Array<{ id: string; name: string; type: string; primaryKey?: boolean; foreignKey?: { tableId: string; fieldId: string } }> };
  network?: { zone?: string; vlan?: string; subnet?: string; rackUnits?: number; deviceType?: string };
}

export type DrawDataSourceKind = 'grid-range' | 'database-record' | 'database-query' | 'task' | 'project' | 'insight' | 'external-approved';
export type DrawDataBindingMode = 'live' | 'frozen' | 'broken';
export type DrawDataGraphicTarget = 'fill' | 'stroke' | 'icon' | 'badge' | 'data-bar' | 'label' | 'tooltip' | 'x' | 'y' | 'width' | 'height';
export interface DrawDataGraphicRule {
  id: string;
  sourceField: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'truthy';
  compareValue?: string | number | boolean;
  target: DrawDataGraphicTarget;
  value: string | number;
  allowGeometryMutation: boolean;
}
export interface DrawDataBinding {
  id: string;
  objectId: DrawObjectId;
  sourceKind: DrawDataSourceKind;
  sourceDocumentId?: string;
  sourceUri: string;
  selector?: string;
  mode: DrawDataBindingMode;
  rules: DrawDataGraphicRule[];
  frozenSnapshot?: Record<string, string | number | boolean | null>;
  lastSourceVersion?: number;
  lastRefreshAt?: number;
}


export interface DrawTextRun { text:string; bold?:boolean; italic?:boolean; underline?:boolean; fontFamily?:string; fontSize?:number; color?:string; }
export interface DrawRichText {
  runs: DrawTextRun[];
  autoFit: 'none' | 'shrink' | 'resize-shape';
  padding: { top:number; right:number; bottom:number; left:number };
  verticalAlign: 'top' | 'middle' | 'bottom';
  rotation: number;
  styleName?: string;
}
export interface DrawTableData { columns:string[]; rows:string[][]; headerRows:number; styleName?:string; }
export interface DrawReviewAnnotation { id:string; kind:'comment'|'note'|'review-marker'; author?:string; text:string; createdAt:number; resolved?:boolean; }
export interface DrawHyperlink { kind:'workspace'|'external'; uri:string; label?:string; }

export interface DrawObject {
  id: DrawObjectId;
  pageId: DrawPageId;
  layerId: DrawLayerId;
  type: 'shape' | 'connector' | 'group' | 'frame';
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  flipX: boolean;
  flipY: boolean;
  opacity: number;
  locked: boolean;
  zIndex: number;
  parentGroupId?: DrawGroupId;
  childIds?: DrawObjectId[];
  vector?: DrawVectorData;
  connector?: DrawConnectorData;
  diagram?: DrawDiagramMetadata;
  richText?: DrawRichText;
  table?: DrawTableData;
  annotations?: DrawReviewAnnotation[];
  hyperlink?: DrawHyperlink;
  customProperties?: Record<string, string | number | boolean>;
}

export interface DrawStencilDefinition {
  id: string;
  libraryId: string;
  category: string;
  name: string;
  tags: string[];
  objectTemplate: Omit<DrawObject, 'id' | 'pageId' | 'layerId' | 'zIndex'>;
}

export interface DrawStencilLibrary {
  id: string;
  name: string;
  version: number;
  stencils: DrawStencilDefinition[];
}

export interface DrawDocumentModel {
  schemaVersion: 1;
  canvasMode: DrawCanvasMode;
  activePageId: DrawPageId;
  pages: DrawPage[];
  layers: DrawLayer[];
  objects: Record<DrawObjectId, DrawObject>;
  viewport: DrawViewport;
  stencils: DrawStencilLibrary[];
  dataBindings: DrawDataBinding[];
  revision: number;
}
