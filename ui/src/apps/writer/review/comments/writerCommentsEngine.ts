// STATUS: DIAMANT VGT SUPREME — Bounded Threaded Comments & Unicode Mentions
import type { WriterComment, WriterCommentReply } from '../../types';

const MAX_AUTHOR_LENGTH = 128;
const MAX_COMMENT_LENGTH = 4_000;
const MAX_REPLY_LENGTH = 2_000;
const MAX_REPLIES = 256;
const MAX_MENTIONS = 64;
const MENTION_PATTERN = /@([\p{L}\p{N}_][\p{L}\p{N}_.-]{0,63})/gu;

function normalizeText(value: string, maxLength: number): string {
  return value.normalize('NFKC').replace(/\u0000/g, '').trim().slice(0, maxLength);
}

function normalizeAuthor(value: string): string {
  const normalized = normalizeText(value, MAX_AUTHOR_LENGTH);
  return normalized || 'Reviewer';
}

export function extractWriterMentions(text: string): string[] {
  const normalized = text.normalize('NFKC');
  const mentions: string[] = [];
  const seen = new Set<string>();
  for (const match of normalized.matchAll(MENTION_PATTERN)) {
    const mention = match[1];
    const key = mention.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    mentions.push(mention);
    if (mentions.length >= MAX_MENTIONS) break;
  }
  return mentions;
}

export function createWriterComment(
  paragraphId: string,
  author: string,
  text: string,
  avatarColor = '#10b981',
  createdAt = Date.now(),
): WriterComment {
  const normalizedText = normalizeText(text, MAX_COMMENT_LENGTH);
  if (!paragraphId || !normalizedText) throw new Error('Kommentar benötigt Absatzbezug und Inhalt.');
  return {
    id: crypto.randomUUID(),
    paragraphId,
    author: normalizeAuthor(author),
    avatarColor,
    text: normalizedText,
    createdAt,
    resolved: false,
    replies: [],
    mentions: extractWriterMentions(normalizedText),
  };
}

export function addWriterCommentReply(
  comment: WriterComment,
  author: string,
  text: string,
  createdAt = Date.now(),
): WriterComment {
  if (comment.replies.length >= MAX_REPLIES) throw new Error('Maximale Anzahl Antworten für diesen Thread erreicht.');
  const normalizedText = normalizeText(text, MAX_REPLY_LENGTH);
  if (!normalizedText) throw new Error('Antwort darf nicht leer sein.');
  const reply: WriterCommentReply = {
    id: crypto.randomUUID(),
    author: normalizeAuthor(author),
    text: normalizedText,
    createdAt,
    mentions: extractWriterMentions(normalizedText),
  };
  return { ...comment, replies: [...comment.replies, reply] };
}

export function setWriterCommentResolved(comment: WriterComment, resolved: boolean): WriterComment {
  return { ...comment, resolved };
}

export function normalizeWriterComments(comments: readonly WriterComment[]): WriterComment[] {
  return comments.slice(0, 10_000).map((comment) => {
    const text = normalizeText(comment.text, MAX_COMMENT_LENGTH);
    return {
      ...comment,
      author: normalizeAuthor(comment.author),
      text,
      mentions: extractWriterMentions(text),
      replies: comment.replies.slice(0, MAX_REPLIES).map((reply) => {
        const replyText = normalizeText(reply.text, MAX_REPLY_LENGTH);
        return {
          ...reply,
          author: normalizeAuthor(reply.author),
          text: replyText,
          mentions: extractWriterMentions(replyText),
        };
      }),
    };
  });
}

/** The filter value that keeps every comment. */
export const WRITER_COMMENT_FILTER_ALL = 'all';

function authorKey(value: string): string {
  return value.trim().toLocaleLowerCase();
}

/**
 * Every author who takes part in the discussion, from comments **and** replies,
 * sorted for a stable dropdown. Two spellings that differ only in case or
 * surrounding whitespace count as one person.
 */
export function resolveWriterCommentAuthors(comments: readonly WriterComment[]): string[] {
  const byKey = new Map<string, string>();
  const remember = (raw: string) => {
    const key = authorKey(raw);
    if (key.length === 0 || byKey.has(key)) return;
    byKey.set(key, raw.trim());
  };
  for (const comment of comments) {
    remember(comment.author);
    for (const reply of comment.replies) remember(reply.author);
  }
  return [...byKey.values()].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));
}

/**
 * Filters the discussion by author.
 *
 * The rule is **participation**, not authorship alone: a thread stays visible
 * when the chosen person wrote the comment *or* answered in it. Someone
 * filtering by their own name wants the threads they have to follow up on, and a
 * thread they replied to is exactly that.
 */
export function filterWriterCommentsByAuthor(
  comments: readonly WriterComment[],
  author: string | undefined,
): WriterComment[] {
  if (!author || author === WRITER_COMMENT_FILTER_ALL) return [...comments];
  const wanted = authorKey(author);
  if (wanted.length === 0) return [...comments];
  return comments.filter((comment) => authorKey(comment.author) === wanted
    || comment.replies.some((reply) => authorKey(reply.author) === wanted));
}

/** Number of comments that are still open, optionally limited to one author. */
export function countOpenWriterComments(
  comments: readonly WriterComment[],
  author?: string,
): number {
  return filterWriterCommentsByAuthor(comments, author).filter((comment) => !comment.resolved).length;
}
