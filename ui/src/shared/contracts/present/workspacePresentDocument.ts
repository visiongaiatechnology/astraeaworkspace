// STATUS: PLATIN — durable slide/document contract declarations.
import type { PresentImageObject, PresentSceneObject, PresentSlideCard } from './workspacePresentScene';

export type PresentAnimationCategory = 'entrance' | 'emphasis' | 'exit' | 'motion';
export type PresentAnimationScope = 'object' | 'paragraph' | 'series' | 'category';
export type PresentAnimationEffect =
  | 'none'
  | 'fade'
  | 'zoom'
  | 'fly-in'
  | 'appear'
  | 'fade-in'
  | 'zoom-in'
  | 'fly-in-left'
  | 'fly-in-right'
  | 'pulse'
  | 'spin'
  | 'grow-shrink'
  | 'fade-out'
  | 'fly-out'
  | 'motion-path';

export interface PresentAnimationMotionPoint {
  xPercent: number;
  yPercent: number;
}

export interface PresentAnimation {
  id: string;
  targetId: string;
  category?: PresentAnimationCategory;
  effect: PresentAnimationEffect;
  trigger: 'on-click' | 'with-previous' | 'after-previous' | 'object-trigger';
  triggerObjectId?: string;
  durationMs: number;
  delayMs: number;
  repeatCount?: number;
  rewind?: boolean;
  scope?: PresentAnimationScope;
  scopeIndex?: number;
  motionPath?: PresentAnimationMotionPoint[];
  presetId?: string;
}

export interface PresentThemeDefinition {
  id: string;
  name: string;
  backgroundColor: string;
  surfaceColor: string;
  titleColor: string;
  bodyColor: string;
  accentColor: string;
  fontFamily: string;
}


export interface PresentNotesMasterDefinition {
  backgroundColor: string;
  titleColor: string;
  bodyColor: string;
  fontFamily: string;
  notesFontSizePt: number;
  showSlideThumbnail: boolean;
  showHeader: boolean;
  headerText: string;
  showFooter: boolean;
  footerText: string;
  showPageNumber: boolean;
}

export interface PresentHandoutMasterDefinition {
  backgroundColor: string;
  textColor: string;
  fontFamily: string;
  slidesPerPage: 1 | 2 | 3 | 4 | 6 | 9;
  orientation: 'portrait' | 'landscape';
  showHeader: boolean;
  headerText: string;
  showFooter: boolean;
  footerText: string;
  showPageNumber: boolean;
  includeNotesLines: boolean;
}

export interface PresentMasterSlideDefinition {
  id: string;
  name: string;
  backgroundColor?: string;
  titleColor?: string;
  bodyColor?: string;
  accentColor?: string;
  footerText?: string;
  showFooter?: boolean;
}

export type PresentTransitionEffect =
  | 'none'
  | 'fade'
  | 'push'
  | 'wipe'
  | 'split'
  | 'reveal'
  | 'cover'
  | 'uncover'
  | 'zoom'
  | 'morph'
  // Legacy aliases retained for lossless migration.
  | 'slide-left'
  | 'slide-right'
  | 'slide-up'
  | 'slide-down';

export type PresentTransitionDirection = 'left' | 'right' | 'up' | 'down' | 'horizontal' | 'vertical';
export type PresentTransitionSound = 'none' | 'click' | 'chime' | 'whoosh';

export interface PresentSlideTransition {
  effect: PresentTransitionEffect;
  durationMs: number;
  direction?: PresentTransitionDirection;
  sound?: PresentTransitionSound;
  /** Whether an audience click may advance after click-trigger animations are exhausted. */
  advanceOnClick?: boolean;
  /** Optional automatic advance delay measured from slide activation. Null/undefined disables it. */
  advanceAfterMs?: number | null;
}

export interface PresentRecordingInteractionEvent {
  atMs: number;
  type: 'pointer-move' | 'pointer-down' | 'pointer-up' | 'ink-start' | 'ink-point' | 'ink-end';
  xPercent?: number;
  yPercent?: number;
  tool?: 'pen' | 'highlighter';
  color?: string;
  width?: number;
}

export interface PresentRecordingCaptionCue {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
}

export interface PresentRecordingMediaTrack {
  mimeType: string;
  dataUrl: string;
  sizeBytes: number;
}

export interface PresentRecordingTake {
  id: string;
  createdAt: number;
  durationMs: number;
  narration?: PresentRecordingMediaTrack;
  camera?: PresentRecordingMediaTrack;
  interactionEvents: PresentRecordingInteractionEvent[];
  captions: PresentRecordingCaptionCue[];
  transcript?: string;
}

export interface PresentSlideRecording {
  activeTakeId?: string;
  takes: PresentRecordingTake[];
}


export interface PresentMediaSource {
  mode: 'external' | 'embedded';
  mediaKind: 'audio' | 'video';
  mimeType: string;
  name: string;
  externalUrl?: string;
  dataUrl?: string;
  sizeBytes?: number;
  subtitlesVtt?: string;
  transcript?: string;
}

export interface PresentSlide {
  id: string;
  title: string;
  subtitle: string;
  category?: string;
  categoryTag?: string;
  layout: 'cards' | 'chart' | 'split' | 'bullet-list' | 'blank';
  cards?: PresentSlideCard[];
  bulletPoints?: string[];
  chartReferenceId?: string;
  speakerNotes?: string;
  backgroundColor?: string;
  backgroundGradient?: {
    type: 'linear' | 'radial';
    from: string;
    to: string;
    angle?: number;
  };
  hidden?: boolean;
  sectionId?: string;
  images?: PresentImageObject[];
  sceneObjects?: PresentSceneObject[];
  animations?: PresentAnimation[];
  masterId?: string;
  transition?: PresentSlideTransition;
  timingSeconds?: number;
  /** Legacy external URL aliases retained for migration. */
  audioUrl?: string;
  videoUrl?: string;
  audioMedia?: PresentMediaSource;
  videoMedia?: PresentMediaSource;
  comments?: PresentSlideComment[];
  presenterInk?: PresentInkStroke[];
  recording?: PresentSlideRecording;
}


export interface PresentInkPoint {
  xPercent: number;
  yPercent: number;
}

export interface PresentInkStroke {
  id: string;
  tool: 'pen' | 'highlighter';
  color: string;
  width: number;
  opacity: number;
  points: PresentInkPoint[];
}

export interface PresentCustomShow {
  id: string;
  name: string;
  slideIds: string[];
}

export interface PresentSlideComment {
  id: string;
  slideId: string;
  author: string;
  text: string;
  timestamp: number;
  resolved?: boolean;
  parentId?: string;
  mentions?: string[];
  targetObjectId?: string;
}

export interface PresentDeckVersionSnapshot {
  id: string;
  label: string;
  author: string;
  timestamp: number;
  slides: PresentSlide[];
}

export interface PresentActivityEntry {
  id: string;
  timestamp: number;
  actor: string;
  action: 'comment' | 'reply' | 'resolve' | 'version' | 'review' | 'approve' | 'request-changes' | 'sync';
  slideId?: string;
  objectId?: string;
  summary: string;
}

export interface PresentApprovalRecord {
  id: string;
  reviewer: string;
  timestamp: number;
  decision: 'approved' | 'changes-requested';
  note?: string;
}

export interface PresentReviewState {
  status: 'editing' | 'in-review' | 'changes-requested' | 'approved';
  reviewMode: boolean;
  approvals: PresentApprovalRecord[];
}

export interface PresentReviewCollaborationState {
  activity: PresentActivityEntry[];
  versions: PresentDeckVersionSnapshot[];
  review: PresentReviewState;
}

export interface PresentSection {
  id: string;
  name: string;
  color?: string;
}


export interface PresentInteropPreservedPart {
  format: 'pptx' | 'odp';
  path: string;
  content: string;
}

export interface PresentPackagedFont {
  id: string;
  name: string;
  mimeType: 'font/ttf' | 'font/otf' | 'font/woff' | 'font/woff2';
  dataUrl: string;
  sizeBytes: number;
  licenseConfirmedAt: number;
}

export interface PresentDocumentModel {
  slides: PresentSlide[];
  theme?: string;
  themeId?: string;
  themes?: PresentThemeDefinition[];
  masters?: PresentMasterSlideDefinition[];
  notesMaster?: PresentNotesMasterDefinition;
  handoutMaster?: PresentHandoutMasterDefinition;
  sections?: PresentSection[];
  customShows?: PresentCustomShow[];
  collaboration?: PresentReviewCollaborationState;
  aspectRatio?: '16:9' | '16:10' | '4:3' | 'A4' | string;
  interopPreservedParts?: PresentInteropPreservedPart[];
  packagedFonts?: PresentPackagedFont[];
}


