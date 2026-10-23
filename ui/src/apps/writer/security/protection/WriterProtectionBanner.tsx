// STATUS: DIAMANT VGT SUPREME — Visible document-protection blockade for Writer
import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import { WRITER_REVIEW_BAR_COPY } from '../../review/writerReviewBarLocale';
import type { WriterProtectionNotice } from './writerProtectionNotice';

interface WriterProtectionBannerProps {
  notice: WriterProtectionNotice;
  /** True once the user tried to type into the blocked document. */
  blockedEditAttempted?: boolean;
  onOpenProtection: () => void;
}

/**
 * Explains *why* the document does not accept input.
 *
 * A read-only textarea swallows keystrokes silently; without this status region
 * the only hint is a small badge in the toolbar, which is not even rendered in
 * focus mode. The banner is deliberately calm — protection is a document state,
 * not an error — and always offers the action that resolves it.
 */
export const WriterProtectionBanner: React.FC<WriterProtectionBannerProps> = ({
  notice,
  blockedEditAttempted = false,
  onOpenProtection,
}) => {
  const { locale } = useWorkspaceLocale();
  const copy = WRITER_REVIEW_BAR_COPY[locale];
  if (!notice.restricted) return null;

  const message = notice.mode === 'read_only'
    ? copy.protectionNoticeReadOnly
    : notice.mode === 'comments_only'
      ? copy.protectionNoticeCommentsOnly
      : notice.mode === 'form_filling'
        ? copy.protectionNoticeFormFilling
        : copy.protectionNoticeReview;

  return (
    <div
      role="status"
      aria-live="polite"
      data-writer-protection-banner={notice.mode}
      className="sticky top-0 z-40 flex w-full flex-wrap items-center gap-x-3 gap-y-1 border-b border-amber-400/25 bg-amber-950/85 px-4 py-2 text-xs text-amber-100 backdrop-blur-sm motion-reduce:backdrop-blur-none"
    >
      <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-amber-300" aria-hidden="true" />
      <span className="font-semibold tracking-wide">{copy.protectionNoticeTitle}</span>
      <span className="text-amber-200/90">{message}</span>
      {blockedEditAttempted && (
        <span data-writer-protection-blocked="true" className="font-medium text-amber-200">
          {copy.protectionBlockedEdit}
        </span>
      )}
      <button
        type="button"
        onClick={onOpenProtection}
        className="ml-auto rounded border border-amber-300/40 px-2 py-0.5 font-medium text-amber-50 transition-colors hover:bg-amber-300/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
      >
        {copy.protectionUnlock}
      </button>
    </div>
  );
};
