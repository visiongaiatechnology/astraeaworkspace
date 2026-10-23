// STATUS: DIAMANT VGT SUPREME — Sovereign Review & Collaboration Toolbar
import React from 'react';
import type {
  ReviewMode,
  ReviewerFilter,
  WriterProtectionMode,
  WriterRevision,
} from '../types';
import {
  GitCommit,
  Eye,
  CheckCircle2,
  XCircle,
  MessageSquarePlus,
  Search,
  Pilcrow,
  Columns2,
  GitCompare,
  Lock,
  Shield,
  UsersRound,
  WifiOff,
} from 'lucide-react';
import { getProtectionModeLabel } from '../security/protection/writerProtectionEngine';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { WRITER_REVIEW_BAR_COPY } from './writerReviewBarLocale';

export interface WriterReviewBarProps {
  trackChangesEnabled: boolean;
  trackChangesLocked?: boolean;
  revisionActionsLocked?: boolean;
  onToggleTrackChanges: () => void;
  /**
   * WR-038 — the explicit review mode.
   *
   * Optional so callers that only render the bar's labels keep working; when the toggle is
   * provided, all review chrome (markup selector, accept/reject, pane, compare) is gated by it.
   */
  reviewModeActive?: boolean;
  onToggleReviewMode?: () => void;
  reviewMode: ReviewMode;
  onChangeReviewMode: (mode: ReviewMode) => void;
  reviewerFilter?: ReviewerFilter;
  onChangeReviewerFilter?: (filter: ReviewerFilter) => void;
  isReviewPaneOpen?: boolean;
  onToggleReviewPane?: () => void;
  revisions: WriterRevision[];
  onAcceptAllRevisions: () => void;
  onRejectAllRevisions: () => void;
  onOpenCompareModal?: () => void;
  protectionMode?: WriterProtectionMode;
  onOpenProtectionModal?: () => void;
  onOpenNewComment: () => void;
  isFindReplaceOpen: boolean;
  onToggleFindReplace: () => void;
  showFormattingMarks: boolean;
  onToggleFormattingMarks: () => void;
  commentsCount: number;
  collaborationEnabled?: boolean;
  collaborationAvailable?: boolean;
  collaborationConnecting?: boolean;
  collaborationPeerCount?: number;
  collaborationConflictCount?: number;
  collaborationTransportLabel?: string | null;
  collaborationError?: string | null;
  onToggleCollaboration?: () => void;
}

export const WriterReviewBar: React.FC<WriterReviewBarProps> = ({
  trackChangesEnabled,
  trackChangesLocked = false,
  revisionActionsLocked = false,
  onToggleTrackChanges,
  reviewModeActive = false,
  onToggleReviewMode,
  reviewMode,
  onChangeReviewMode,
  reviewerFilter = 'all',
  onChangeReviewerFilter,
  isReviewPaneOpen = false,
  onToggleReviewPane,
  revisions,
  onAcceptAllRevisions,
  onRejectAllRevisions,
  onOpenCompareModal,
  protectionMode = 'none',
  onOpenProtectionModal,
  onOpenNewComment,
  isFindReplaceOpen,
  onToggleFindReplace,
  showFormattingMarks,
  onToggleFormattingMarks,
  commentsCount,
  collaborationEnabled = false,
  collaborationAvailable = false,
  collaborationConnecting = false,
  collaborationPeerCount = 0,
  collaborationConflictCount = 0,
  collaborationTransportLabel,
  collaborationError,
  onToggleCollaboration,
}) => {
  const pendingCount = revisions.filter((r) => r.status === 'pending').length;
  const authors = Array.from(new Set(revisions.map((r) => r.author)));
  const isProtected = protectionMode !== 'none';
  /**
   * WR-038 — review chrome only exists in review mode.
   *
   * Without the new toggle the bar behaves exactly as before, which keeps the label test and
   * every embed of the bar working; with it, markup, filters, accept/reject, the pane and the
   * compare action appear only while the user is reviewing.
   */
  const reviewChromeVisible = onToggleReviewMode === undefined || reviewModeActive;
  const { locale } = useWorkspaceLocale();
  const copy = WRITER_REVIEW_BAR_COPY[locale];
  const collaborationLabel = collaborationConnecting
    ? copy.collaborationConnecting
    : collaborationEnabled
      ? copy.collaborationOnline(collaborationPeerCount + 1)
      : copy.collaboration;
  const collaborationTitle = collaborationError
    ? copy.collaborationError
    : !collaborationAvailable
      ? copy.collaborationUnavailable
      : collaborationConnecting
        ? copy.collaborationConnecting
        : collaborationEnabled
          ? copy.collaborationConnectedTitle(collaborationTransportLabel ?? 'SyncGraph', collaborationPeerCount)
          : copy.collaborationStartTitle;

  return (
    <div data-vgt-workspace-chrome="toolbar" className="w-full h-10 border-b border-white/10 bg-slate-950/60 px-4 flex items-center justify-between text-xs select-none">
      {/* Left: Track Changes, Markup, Filter, Compare & Review Pane */}
      <div className="flex items-center space-x-2">
        {onToggleReviewMode && (
          <button
            type="button"
            onClick={onToggleReviewMode}
            aria-pressed={reviewModeActive}
            data-writer-review-mode-toggle={reviewModeActive ? 'on' : 'off'}
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg font-medium transition-all ${
              reviewModeActive
                ? 'bg-blue-500/20 text-blue-200 border border-blue-500/40 shadow'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent'
            }`}
            title={copy.reviewModeTitle}
          >
            <MessageSquarePlus className="w-3.5 h-3.5" />
            <span>{copy.reviewMode}</span>
          </button>
        )}
        <button
          type="button"
          onClick={onToggleTrackChanges}
          disabled={trackChangesLocked}
          className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg font-medium transition-all ${
            trackChangesEnabled
              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent'
          } ${trackChangesLocked ? 'cursor-not-allowed opacity-80' : ''}`}
          title={trackChangesLocked ? copy.trackChangesLockedTitle : copy.trackChangesTitle}
        >
          <GitCommit className="w-3.5 h-3.5" />
          <span>{copy.trackChanges}</span>
          {trackChangesEnabled && (
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
          )}
        </button>

        {reviewChromeVisible && trackChangesEnabled && (
          <div className="flex items-center space-x-1 pl-2 border-l border-white/10">
            <Eye className="w-3.5 h-3.5 text-slate-500" />
            <select
              value={reviewMode}
              onChange={(e) => onChangeReviewMode(e.target.value as ReviewMode)}
              className="bg-slate-900 border border-white/10 rounded-md px-2 py-0.5 text-[0.6875rem] text-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70"
              title="Markup-Ansicht wählen"
            >
              <option value="all">Alle Markups</option>
              <option value="simple">Einfaches Markup</option>
              <option value="none">Kein Markup</option>
              <option value="original">Original</option>
            </select>
          </div>
        )}

        {reviewChromeVisible && trackChangesEnabled && authors.length > 0 && onChangeReviewerFilter && (
          <div className="flex items-center space-x-1 pl-2 border-l border-white/10">
            <select
              value={reviewerFilter}
              onChange={(e) => onChangeReviewerFilter(e.target.value)}
              className="bg-slate-900 border border-white/10 rounded-md px-2 py-0.5 text-[0.6875rem] text-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70"
              title="Nach Prüfer filtern"
            >
              <option value="all">Alle Bearbeiter</option>
              {authors.map((author) => (
                <option key={author} value={author}>
                  {author}
                </option>
              ))}
            </select>
          </div>
        )}

        {reviewChromeVisible && pendingCount > 0 && (
          <div className="flex items-center space-x-1 pl-2 border-l border-white/10">
            <span className="text-[0.6875rem] text-slate-400 font-mono">
              {pendingCount} offen
            </span>
            <button
              type="button"
              onClick={onAcceptAllRevisions}
              disabled={revisionActionsLocked}
              className="p-1 rounded text-emerald-400 hover:bg-emerald-500/10 transition-colors disabled:cursor-not-allowed disabled:opacity-35"
              aria-label={revisionActionsLocked ? 'Revisionsverwaltung ist durch den Dokumentschutz gesperrt' : 'Alle Änderungen annehmen'} title={revisionActionsLocked ? 'Revisionsverwaltung ist durch den Dokumentschutz gesperrt' : 'Alle Änderungen annehmen'}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onRejectAllRevisions}
              disabled={revisionActionsLocked}
              className="p-1 rounded text-rose-400 hover:bg-rose-500/10 transition-colors disabled:cursor-not-allowed disabled:opacity-35"
              aria-label={revisionActionsLocked ? 'Revisionsverwaltung ist durch den Dokumentschutz gesperrt' : 'Alle Änderungen ablehnen'} title={revisionActionsLocked ? 'Revisionsverwaltung ist durch den Dokumentschutz gesperrt' : 'Alle Änderungen ablehnen'}
            >
              <XCircle className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Review Pane Sidebar Toggle */}
        {reviewChromeVisible && onToggleReviewPane && (
          <button
            type="button"
            onClick={onToggleReviewPane}
            className={`flex items-center space-x-1 px-2 py-1 rounded-md transition-colors ${
              isReviewPaneOpen
                ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
            title={copy.reviewPaneTitle}
          >
            <Columns2 className="w-3.5 h-3.5" />
            <span>{copy.reviewPane}</span>
          </button>
        )}

        {/* Compare Documents Modal Button */}
        {reviewChromeVisible && onOpenCompareModal && (
          <button
            type="button"
            onClick={onOpenCompareModal}
            className="flex items-center space-x-1 px-2 py-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors"
            title={copy.compareTitle}
          >
            <GitCompare className="w-3.5 h-3.5 text-purple-400" />
            <span>{copy.compare}</span>
          </button>
        )}

        {/* Document Protection Badge / Button */}
        {onOpenProtectionModal && (
          <button
            type="button"
            onClick={onOpenProtectionModal}
            className={`flex items-center space-x-1 px-2 py-0.5 rounded-full text-[0.6875rem] font-medium transition-all ${
              isProtected
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
            title={copy.protectionTitle}
          >
            {isProtected ? (
              <>
                <Lock className="w-3 h-3 text-amber-400" />
                <span>{getProtectionModeLabel(protectionMode)}</span>
              </>
            ) : (
              <>
                <Shield className="w-3 h-3 text-slate-400" />
                <span>{copy.protection}</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Right: Collaboration, Comments, Find & Non-printing marks */}
      <div className="flex items-center space-x-2">
        {onToggleCollaboration && (
          <button
            type="button"
            onClick={onToggleCollaboration}
            disabled={!collaborationAvailable || collaborationConnecting}
            className={`flex items-center space-x-1 rounded-md px-2 py-1 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              collaborationEnabled
                ? 'bg-cyan-500/15 text-cyan-200 border border-cyan-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
            title={collaborationTitle}
          >
            {collaborationAvailable ? <UsersRound className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
            <span>{collaborationLabel}</span>
            {collaborationConflictCount > 0 && (
              <span className="rounded-full bg-amber-500/20 px-1 text-[0.5625rem] font-bold text-amber-300">{collaborationConflictCount}</span>
            )}
          </button>
        )}
        <button
          type="button"
          onClick={onOpenNewComment}
          className="flex items-center space-x-1 px-2 py-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors"
          title={copy.commentTitle}
        >
          <MessageSquarePlus className="w-3.5 h-3.5 text-blue-400" />
          <span>{copy.comment}</span>
          {commentsCount > 0 && (
            <span className="text-[0.625rem] bg-slate-800 text-slate-300 px-1 rounded-full">
              {commentsCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={onToggleFindReplace}
          className={`flex items-center space-x-1 px-2 py-1 rounded-md transition-colors ${
            isFindReplaceOpen
              ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
          }`}
          title={copy.findTitle}
        >
          <Search className="w-3.5 h-3.5" />
          <span>{copy.find}</span>
        </button>

        <button
          type="button"
          onClick={onToggleFormattingMarks}
          className={`p-1 rounded-md transition-colors ${
            showFormattingMarks
              ? 'bg-blue-600/20 text-blue-300'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
          }`}
          aria-label={copy.formattingMarks} title={copy.formattingMarks}
        >
          <Pilcrow className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
