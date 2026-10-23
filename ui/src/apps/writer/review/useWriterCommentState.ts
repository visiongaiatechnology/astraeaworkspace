// STATUS: DIAMANT VGT SUPREME — Protected Writer Comment Thread Orchestrator
import { useCallback } from 'react';
import type { DocumentComment, WriterDocumentData, WriterProtectionMode } from '../types';
import { addWriterCommentReply, createWriterComment, setWriterCommentResolved } from './comments/writerCommentsEngine';
import { canComment } from '../security/protection/writerProtectionEngine';

interface UseWriterCommentStateProps {
  comments: DocumentComment[];
  protectionMode: WriterProtectionMode;
  persistWriterData: (patch: Partial<WriterDocumentData>) => void;
}

export function useWriterCommentState({
  comments,
  protectionMode,
  persistWriterData,
}: UseWriterCommentStateProps) {
  const addComment = useCallback((paragraphId: string, text: string, author = 'Reviewer') => {
    if (!canComment(protectionMode)) return false;
    const comment = createWriterComment(paragraphId, author, text);
    persistWriterData({ comments: [...comments, comment] });
    return true;
  }, [comments, persistWriterData, protectionMode]);

  const replyToComment = useCallback((commentId: string, text: string, author = 'Reviewer') => {
    if (!canComment(protectionMode)) return false;
    let changed = false;
    const next = comments.map((comment) => {
      if (comment.id !== commentId) return comment;
      changed = true;
      return addWriterCommentReply(comment, author, text);
    });
    if (changed) persistWriterData({ comments: next });
    return changed;
  }, [comments, persistWriterData, protectionMode]);

  const toggleCommentResolved = useCallback((commentId: string) => {
    if (!canComment(protectionMode)) return false;
    let changed = false;
    const next = comments.map((comment) => {
      if (comment.id !== commentId) return comment;
      changed = true;
      return setWriterCommentResolved(comment, !comment.resolved);
    });
    if (changed) persistWriterData({ comments: next });
    return changed;
  }, [comments, persistWriterData, protectionMode]);

  return { addComment, replyToComment, toggleCommentResolved };
}
