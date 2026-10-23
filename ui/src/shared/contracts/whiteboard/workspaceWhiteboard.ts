// STATUS: DIAMANT VGT SUPREME — Whiteboard Canonical Types
// --- Astraea Whiteboard canonical canvas model ---
export type WhiteboardObjectType = 'sticky' | 'process' | 'decision' | 'terminal' | 'connector' | 'text' | 'frame' | 'image' | 'ink' | 'shape' | 'icon' | 'table' | 'card' | 'document' | 'chart' | 'code' | 'media' | 'reaction' | 'live';

export type WhiteboardBackgroundStyle = 'dots' | 'grid' | 'plain';
export type WhiteboardGuideAxis = 'x' | 'y';
export type WhiteboardConnectorAnchor = 'auto' | 'top' | 'right' | 'bottom' | 'left';

export type WhiteboardInkPreset = 'pen' | 'pencil' | 'highlighter';
export type WhiteboardInkPointerType = 'mouse' | 'touch' | 'pen';
export type WhiteboardInkRecognizedShape = 'line' | 'rect' | 'ellipse';

export type WhiteboardDiagramFamily = 'flowchart' | 'uml' | 'network' | 'org-chart' | 'mind-map' | 'erd' | 'swimlane' | 'process-map' | 'journey-map';
export type WhiteboardDiagramKind =
  | 'process' | 'decision' | 'terminal'
  | 'uml-class' | 'uml-interface' | 'uml-actor'
  | 'network-node' | 'org-person' | 'mind-topic' | 'entity'
  | 'swimlane' | 'process-step' | 'journey-stage';
export type WhiteboardConnectorRoute = 'straight' | 'orthogonal' | 'curved';

export interface WhiteboardDiagramData {
  family: WhiteboardDiagramFamily;
  kind: WhiteboardDiagramKind;
  title: string;
  subtitle?: string;
  fields?: string[];
  lane?: string;
  stage?: string;
}

export interface WhiteboardConnectorStyle {
  route: WhiteboardConnectorRoute;
  autoRoute: boolean;
}


export type WhiteboardTemplateScope = 'user' | 'org';
export interface WhiteboardCustomTemplate {
  id: string;
  name: string;
  description?: string;
  scope: WhiteboardTemplateScope;
  createdAt: number;
  items: WhiteboardObjectModel[];
}


export interface WhiteboardFacilitationTimer {
  durationMs: number;
  startedAt?: number;
  elapsedBeforePauseMs: number;
  running: boolean;
}
export interface WhiteboardVoteBallot { id: string; targetId: string; actorLabel?: string; }
export interface WhiteboardVoteSession {
  id: string;
  prompt: string;
  targetIds: string[];
  anonymous: boolean;
  status: 'open' | 'closed';
  startedAt: number;
  ballots: WhiteboardVoteBallot[];
}
export interface WhiteboardParticipantCursor {
  id: string;
  name: string;
  x: number;
  y: number;
  lastSeenAt: number;
}
export interface WhiteboardPresenterViewport { x: number; y: number; zoom: number; }
export interface WhiteboardFacilitationState {
  timer?: WhiteboardFacilitationTimer;
  voting?: WhiteboardVoteSession;
  followPresenter: boolean;
  presenterViewport?: WhiteboardPresenterViewport;
  bringEveryoneSequence: number;
  hideParticipantNames: boolean;
  participants: WhiteboardParticipantCursor[];
  workshopFrameIds: string[];
  lockedBackgroundIds: string[];
  revealedAreaIds: string[];
}

export interface WhiteboardInkPoint {
  x: number;
  y: number;
  t: number;
  pressure: number;
  tiltX: number;
  tiltY: number;
}

export interface WhiteboardInkData {
  preset: WhiteboardInkPreset;
  inputType: WhiteboardInkPointerType;
  points: WhiteboardInkPoint[];
  color: string;
  width: number;
  opacity: number;
  arrowStart?: boolean;
  arrowEnd?: boolean;
  recognizedShape?: WhiteboardInkRecognizedShape;
}


export type WhiteboardShapeKind = 'rectangle' | 'rounded-rectangle' | 'ellipse' | 'diamond' | 'triangle';
export type WhiteboardIconName = 'server' | 'database' | 'cloud' | 'shield' | 'user' | 'globe';

export interface WhiteboardShapeData {
  kind: WhiteboardShapeKind;
  fill: string;
  stroke: string;
  strokeWidth: number;
}

export interface WhiteboardIconData { name: WhiteboardIconName; label: string; }
export interface WhiteboardTableData { columns: string[]; rows: string[][]; }
export interface WhiteboardCardData { cardKind: 'task' | 'generic'; title: string; subtitle?: string; status?: string; tags?: string[]; sourceUri?: string; }
export interface WhiteboardDocumentCardData { documentKind: string; title: string; excerpt: string; sourceUri?: string; }
export interface WhiteboardChartData { chartKind: 'bar' | 'line' | 'donut'; labels: string[]; values: number[]; title: string; }
export interface WhiteboardCodeData { language: string; code: string; }
export interface WhiteboardMediaData { mediaKind: 'audio' | 'video'; mime: string; name: string; dataUrl?: string; }
export interface WhiteboardReactionData { emoji: string; label: string; count: number; }

export interface WhiteboardGuide {
  id: string;
  axis: WhiteboardGuideAxis;
  position: number;
}

export interface WhiteboardBookmark {
  id: string;
  name: string;
  x: number;
  y: number;
  zoom: number;
}

export interface WhiteboardViewConfig {
  backgroundStyle: WhiteboardBackgroundStyle;
  gridSize: number;
  showRulers: boolean;
  guides: WhiteboardGuide[];
  bookmarks: WhiteboardBookmark[];
  presentationPath: string[];
  snapToGrid: boolean;
  snapToGuides: boolean;
}

export interface WhiteboardObjectConstraints {
  moveAxis?: 'free' | 'horizontal' | 'vertical';
  lockAspectRatio?: boolean;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  keepInsideFrameId?: string;
}


export type WhiteboardLiveObjectKind =
  | 'grid-range' | 'grid-chart' | 'writer-excerpt' | 'present-slide'
  | 'project-milestone-timeline' | 'planner-board' | 'task-card'
  | 'form-result-chart' | 'database-view' | 'pdf-page' | 'note-block' | 'vault-asset';
export type WhiteboardLiveObjectMode = 'Live' | 'Frozen' | 'Link';
export interface WhiteboardLiveObjectSnapshot {
  sourceVersion: number;
  capturedAt: number;
  title: string;
  subtitle?: string;
  lines: string[];
  labels?: string[];
  values?: number[];
  status?: string;
}
export interface WhiteboardLiveObjectData {
  kind: WhiteboardLiveObjectKind;
  mode: WhiteboardLiveObjectMode;
  sourceDocumentId: string;
  sourceUri: string;
  selector?: string;
  sourceTitle: string;
  frozenSnapshot?: WhiteboardLiveObjectSnapshot;
}

export interface WhiteboardObjectModel {
  id: string;
  type: WhiteboardObjectType;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  color?: 'yellow' | 'cyan' | 'purple';
  fromId?: string;
  toId?: string;
  fromAnchor?: WhiteboardConnectorAnchor;
  toAnchor?: WhiteboardConnectorAnchor;
  lineLabel?: string;
  dataUrl?: string;
  name?: string;
  locked?: boolean;
  ink?: WhiteboardInkData;
  shape?: WhiteboardShapeData;
  icon?: WhiteboardIconData;
  table?: WhiteboardTableData;
  card?: WhiteboardCardData;
  document?: WhiteboardDocumentCardData;
  chart?: WhiteboardChartData;
  code?: WhiteboardCodeData;
  media?: WhiteboardMediaData;
  reaction?: WhiteboardReactionData;
  liveObject?: WhiteboardLiveObjectData;
  diagram?: WhiteboardDiagramData;
  connectorStyle?: WhiteboardConnectorStyle;
  rotation?: number;
  hidden?: boolean;
  groupId?: string;
  zIndex?: number;
  linkUri?: string;
  tags?: string[];
  constraints?: WhiteboardObjectConstraints;
}


export type WhiteboardCollaborationRole = 'Owner' | 'Admin' | 'Editor' | 'Commenter' | 'Viewer';

export interface WhiteboardCollaborationComment {
  id: string;
  objectId?: string;
  parentId?: string;
  authorId: string;
  authorName: string;
  body: string;
  mentions: string[];
  createdAt: number;
  updatedAt: number;
  resolvedAt?: number;
}

export interface WhiteboardCollaborationActivity {
  id: string;
  at: number;
  actorId: string;
  actorName: string;
  kind: 'edit' | 'comment' | 'merge' | 'presence' | 'space' | 'guest';
  objectId?: string;
  detail: string;
}

export interface WhiteboardObjectVersion {
  lamport: number;
  actorId: string;
  deleted?: boolean;
}

export interface WhiteboardObjectAuthorship {
  actorId: string;
  actorName: string;
  updatedAt: number;
}

export interface WhiteboardSpaceBinding {
  spaceId: string;
  memberId: string;
}

export interface WhiteboardGuestAccess {
  /** Legacy local metadata only; this is not an issued or remotely revocable capability. */
  guestId: string;
  permission: 'Viewer' | 'Commenter';
  expiresAt: number;
  createdAt: number;
  transportId: string;
}

export interface WhiteboardCollaborationState {
  enabled: boolean;
  localDisplayName: string;
  lamport: number;
  comments: WhiteboardCollaborationComment[];
  activity: WhiteboardCollaborationActivity[];
  objectAuthorshipEnabled: boolean;
  objectAuthors: Record<string, WhiteboardObjectAuthorship>;
  objectVersions: Record<string, WhiteboardObjectVersion>;
  spaceBinding?: WhiteboardSpaceBinding;
  /** Legacy local metadata retained only so users can clear entries from older builds. */
  guestAccess?: WhiteboardGuestAccess;
}

export interface WhiteboardDocumentModel {
  items: WhiteboardObjectModel[];
  view?: Partial<WhiteboardViewConfig>;
  templates?: WhiteboardCustomTemplate[];
  facilitation?: Partial<WhiteboardFacilitationState>;
  collaboration?: Partial<WhiteboardCollaborationState>;
}
