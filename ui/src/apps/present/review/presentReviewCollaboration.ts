// STATUS: DIAMANT VGT SUPREME — Present review/versioning primitives with bounded persisted metadata.
import type {
  PresentActivityEntry,
  PresentApprovalRecord,
  PresentDeckVersionSnapshot,
  PresentDocumentModel,
  PresentReviewCollaborationState,
  PresentSlide,
  PresentSlideComment,
} from '../../../shared/contracts/workspace';

const MAX_COMMENT_TEXT = 16_384;
const MAX_COMMENTS_PER_SLIDE = 1_024;
const MAX_ACTIVITY = 4_096;
const MAX_VERSIONS = 24;
const MAX_VERSION_LABEL = 160;
const MAX_ACTOR = 128;
const MAX_APPROVALS = 256;
const MAX_SNAPSHOT_SLIDES = 1_000;
const MENTION_RE = /(^|\s)@([A-Za-z0-9_.-]{1,64})\b/g;

function secureId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `${prefix}-${crypto.randomUUID()}`;
  throw new Error('present_secure_id_unavailable');
}

function boundedText(value: string, max: number): string {
  return value.trim().slice(0, max);
}


export function extractPresentMentions(text: string): string[] {
  const mentions = new Set<string>();
  for (const match of text.matchAll(MENTION_RE)) mentions.add(match[2]);
  return [...mentions].slice(0, 64);
}

export function createPresentComment(params: {
  slideId: string;
  author: string;
  text: string;
  parentId?: string;
  targetObjectId?: string;
  timestamp?: number;
}): PresentSlideComment {
  const slideId = boundedText(params.slideId, 256);
  const author = boundedText(params.author, MAX_ACTOR);
  const text = boundedText(params.text, MAX_COMMENT_TEXT);
  const targetObjectId = params.targetObjectId ? boundedText(params.targetObjectId, 256) : undefined;
  if (!slideId || !author || !text) throw new Error('present_comment_required_fields');
  return {
    id: secureId('present-comment'),
    slideId,
    author,
    text,
    timestamp: params.timestamp ?? Date.now(),
    resolved: false,
    mentions: extractPresentMentions(text),
    ...(params.parentId ? { parentId: boundedText(params.parentId, 256) } : {}),
    ...(targetObjectId ? { targetObjectId } : {}),
  };
}

export function appendPresentComment(comments: readonly PresentSlideComment[], comment: PresentSlideComment): PresentSlideComment[] {
  if (comment.parentId) {
    const parent = comments.find((candidate) => candidate.id === comment.parentId);
    if (!parent || parent.parentId) throw new Error('present_comment_parent_missing');
  }
  if (comments.some((candidate) => candidate.id === comment.id)) return [...comments];
  return [...comments, comment].slice(-MAX_COMMENTS_PER_SLIDE);
}

export function resolvePresentCommentThread(comments: readonly PresentSlideComment[], commentId: string, resolved: boolean): PresentSlideComment[] {
  const selected = comments.find((comment) => comment.id === commentId);
  if (!selected) return [...comments];
  const rootId = selected.parentId ?? selected.id;
  return comments.map((comment) => (comment.id === rootId || comment.parentId === rootId ? { ...comment, resolved } : comment));
}

export function deletePresentCommentThread(comments: readonly PresentSlideComment[], commentId: string): PresentSlideComment[] {
  const selected = comments.find((comment) => comment.id === commentId);
  if (!selected) return [...comments];
  if (selected.parentId) return comments.filter((comment) => comment.id !== selected.id);
  return comments.filter((comment) => comment.id !== selected.id && comment.parentId !== selected.id);
}

export function ensurePresentReviewState(model: PresentDocumentModel): PresentReviewCollaborationState {
  const state = model.collaboration;
  return {
    activity: (state?.activity ?? []).slice(-MAX_ACTIVITY),
    versions: (state?.versions ?? []).slice(-MAX_VERSIONS),
    review: {
      status: state?.review?.status ?? 'editing',
      reviewMode: state?.review?.reviewMode ?? false,
      approvals: (state?.review?.approvals ?? []).slice(-MAX_APPROVALS),
    },
  };
}

export function appendPresentActivity(model: PresentDocumentModel, entry: Omit<PresentActivityEntry, 'id' | 'timestamp'> & { timestamp?: number }): PresentDocumentModel {
  const collaboration = ensurePresentReviewState(model);
  const activity: PresentActivityEntry = {
    id: secureId('present-activity'),
    timestamp: entry.timestamp ?? Date.now(),
    actor: boundedText(entry.actor, MAX_ACTOR) || 'Unknown',
    action: entry.action,
    summary: boundedText(entry.summary, 512),
    ...(entry.slideId ? { slideId: boundedText(entry.slideId, 256) } : {}),
    ...(entry.objectId ? { objectId: boundedText(entry.objectId, 256) } : {}),
  };
  return { ...model, collaboration: { ...collaboration, activity: [...collaboration.activity, activity].slice(-MAX_ACTIVITY) } };
}

function snapshotSlides(slides: readonly PresentSlide[]): PresentSlide[] {
  if (slides.length > MAX_SNAPSHOT_SLIDES) throw new Error('present_version_slide_limit');
  return structuredClone([...slides]);
}

export function createPresentVersion(model: PresentDocumentModel, label: string, author: string, timestamp = Date.now()): PresentDocumentModel {
  const collaboration = ensurePresentReviewState(model);
  const cleanLabel = boundedText(label, MAX_VERSION_LABEL) || `Version ${collaboration.versions.length + 1}`;
  const cleanAuthor = boundedText(author, MAX_ACTOR) || 'Unknown';
  const snapshot: PresentDeckVersionSnapshot = {
    id: secureId('present-version'),
    label: cleanLabel,
    author: cleanAuthor,
    timestamp,
    slides: snapshotSlides(model.slides),
  };
  const withVersion: PresentDocumentModel = {
    ...model,
    collaboration: { ...collaboration, versions: [...collaboration.versions, snapshot].slice(-MAX_VERSIONS) },
  };
  return appendPresentActivity(withVersion, { actor: cleanAuthor, action: 'version', summary: `Created deck version “${cleanLabel}”`, timestamp });
}

export interface PresentSlideVersionDiff {
  slideId: string;
  status: 'added' | 'removed' | 'changed';
  beforeTitle?: string;
  afterTitle?: string;
  changedFields: string[];
}

function comparableSlide(slide: PresentSlide): Record<string, unknown> {
  const { comments: _comments, presenterInk: _ink, recording: _recording, ...rest } = slide;
  return rest as Record<string, unknown>;
}

export function comparePresentVersions(before: PresentDeckVersionSnapshot, after: PresentDeckVersionSnapshot): PresentSlideVersionDiff[] {
  const beforeById = new Map(before.slides.map((slide) => [slide.id, slide]));
  const afterById = new Map(after.slides.map((slide) => [slide.id, slide]));
  const ids = new Set([...beforeById.keys(), ...afterById.keys()]);
  const diffs: PresentSlideVersionDiff[] = [];
  for (const slideId of ids) {
    const left = beforeById.get(slideId);
    const right = afterById.get(slideId);
    if (!left && right) {
      diffs.push({ slideId, status: 'added', afterTitle: right.title, changedFields: ['slide'] });
      continue;
    }
    if (left && !right) {
      diffs.push({ slideId, status: 'removed', beforeTitle: left.title, changedFields: ['slide'] });
      continue;
    }
    if (!left || !right) continue;
    const a = comparableSlide(left);
    const b = comparableSlide(right);
    const fields = new Set([...Object.keys(a), ...Object.keys(b)]);
    const changedFields = [...fields].filter((field) => JSON.stringify(a[field]) !== JSON.stringify(b[field])).sort();
    if (changedFields.length) diffs.push({ slideId, status: 'changed', beforeTitle: left.title, afterTitle: right.title, changedFields });
  }
  return diffs;
}

export function compareVersionToCurrent(snapshot: PresentDeckVersionSnapshot, model: PresentDocumentModel): PresentSlideVersionDiff[] {
  return comparePresentVersions(snapshot, { id: 'current', label: 'Current', author: '', timestamp: Date.now(), slides: model.slides });
}

export function setPresentReviewStatus(model: PresentDocumentModel, status: PresentReviewCollaborationState['review']['status'], actor: string, note?: string): PresentDocumentModel {
  const collaboration = ensurePresentReviewState(model);
  const cleanActor = boundedText(actor, MAX_ACTOR) || 'Unknown';
  const timestamp = Date.now();
  let approvals = collaboration.review.approvals;
  if (status === 'approved' || status === 'changes-requested') {
    const approval: PresentApprovalRecord = {
      id: secureId('present-approval'), reviewer: cleanActor, timestamp,
      decision: status === 'approved' ? 'approved' : 'changes-requested',
      ...(note?.trim() ? { note: boundedText(note, 2_048) } : {}),
    };
    approvals = [...approvals, approval].slice(-MAX_APPROVALS);
  }
  const next: PresentDocumentModel = {
    ...model,
    collaboration: {
      ...collaboration,
      review: { status, reviewMode: status === 'in-review' || status === 'approved', approvals },
    },
  };
  return appendPresentActivity(next, {
    actor: cleanActor,
    action: status === 'approved' ? 'approve' : status === 'changes-requested' ? 'request-changes' : 'review',
    summary: status === 'in-review' ? 'Submitted presentation for review' : status === 'editing' ? 'Returned presentation to editing' : status === 'approved' ? 'Approved presentation' : 'Requested presentation changes',
    timestamp,
  });
}
