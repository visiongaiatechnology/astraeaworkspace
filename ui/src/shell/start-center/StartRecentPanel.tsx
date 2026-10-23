import React, { useMemo } from 'react';
import { Clock3, ShieldCheck, TriangleAlert } from 'lucide-react';
import type { WorkspaceDocument } from '../../shared/contracts/workspace';
import type { ShellRecentEntry } from '../platform/workspaceShellPlatform';
import { projectShellRecents } from '../platform/workspaceShellPlatform';
import { AstraeaAppIcon } from '../../design-system/brand/AstraeaAppIcon';
import { SearchHubPanel } from '../global-search/components/SearchHubPanel';
import { useWorkspaceLocale } from '../localization/workspaceLocale';
import { formatShellNumber, formatShellRelativeTime, shellSurfaceCopy } from '../i18n/shellSurfaceLocale';

interface StartRecentPanelProps {
  documents: Record<string, WorkspaceDocument>;
  recentEntries: ShellRecentEntry[];
  storedDocumentIds: ReadonlySet<string>;
  metadataLocked: boolean;
  searchQuery: string;
  onOpenDocument: (documentId: string) => void;
}

interface RecentOnlyProps {
  documents: Record<string, WorkspaceDocument>;
  recentEntries: ShellRecentEntry[];
  storedDocumentIds: ReadonlySet<string>;
  metadataLocked: boolean;
  onOpenDocument: (documentId: string) => void;
}

const RECENT_DISPLAY_LIMIT = 12;

const RecentOnly: React.FC<RecentOnlyProps> = ({
  documents,
  recentEntries,
  storedDocumentIds,
  metadataLocked,
  onOpenDocument,
}) => {
  const { locale } = useWorkspaceLocale();
  const copy = shellSurfaceCopy(locale);
  const recents = useMemo(
    () => projectShellRecents(recentEntries, documents, metadataLocked, storedDocumentIds),
    [documents, metadataLocked, recentEntries, storedDocumentIds],
  );

  return (
    <section aria-labelledby="start-recent-title" className="glass-panel space-y-5 rounded-2xl p-5 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mb-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--vgt-text-muted)]">
            {copy.recent.eyebrow}
          </p>
          <h2 id="start-recent-title" className="flex items-center gap-2 text-sm font-semibold tracking-tight text-[var(--vgt-text-primary)]">
            <Clock3 aria-hidden="true" className="h-4 w-4 text-[var(--vgt-text-secondary)]" />
            {copy.recent.title}
          </h2>
        </div>
        {metadataLocked && (
          <span className="inline-flex items-center gap-1.5 text-[10px] text-[var(--vgt-control-success)]">
            <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" />
            {copy.recent.metadataProtected}
          </span>
        )}
      </header>

      {recents.length === 0 ? (
        <p className="border-t border-[color:var(--vgt-metal-edge)] pt-4 text-xs leading-5 text-[var(--vgt-text-secondary)]">
          {copy.recent.empty}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {recents.slice(0, RECENT_DISPLAY_LIMIT).map((item) => (
            (() => {
              const displayLabel = item.metadataProtected
                ? `${copy.recent.protected} ${copy.modules[item.kind].shortName}`
                : item.label;
              const protectionLabel = item.protectionClass === 'Protected'
                ? copy.recent.protected
                : item.protectionClass === 'Standard' ? copy.recent.standard : item.protectionClass;
              return (
            <button
              key={item.documentId}
              type="button"
              disabled={!item.canOpen}
              onClick={() => {
                if (item.canOpen) onOpenDocument(item.documentId);
              }}
              className={`group flex min-w-0 items-center gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--vgt-focus)] ${item.canOpen
                ? 'border-[color:var(--vgt-control-border)] bg-[var(--vgt-control-surface)] hover:border-[color:var(--vgt-control-border-hover)] hover:bg-[var(--vgt-control-hover)]'
                : 'cursor-not-allowed border-[color:var(--vgt-control-border)] bg-[var(--vgt-control-surface)] opacity-70'
                }`}
            >
              <img
                src={item.previewDataUrl}
                alt=""
                aria-hidden="true"
                className="h-12 w-20 shrink-0 rounded-md border border-[color:var(--vgt-control-border)] object-cover"
              />
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-1.5">
                  <AstraeaAppIcon kind={item.kind} className="h-4 w-4 shrink-0" />
                  <span className="block min-w-0 flex-1 truncate text-[11px] font-medium text-[var(--vgt-control-text)]" title={displayLabel}>
                    {displayLabel}
                  </span>
                </span>
                <span className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[9px] text-[var(--vgt-text-muted)]">
                  <span>{formatShellRelativeTime(locale, item.modifiedAt)}</span>
                  <span>{item.approximateSizeBytes == null ? copy.recent.sizeProtected : `${formatShellNumber(locale, Math.max(1, Math.round(item.approximateSizeBytes / 1024)))} KB`}</span>
                  <span className="truncate" title={copy.recent.localVault}>{copy.recent.localVault}</span>
                  <span>{protectionLabel}</span>
                </span>
                {item.availability === 'missing' && (
                  <span className="mt-1 flex items-start gap-1 text-[9px] leading-4 text-[var(--vgt-control-warning)]">
                    <TriangleAlert aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0" />
                    {copy.recent.missing}
                  </span>
                )}
              </span>
            </button>
              );
            })()
          ))}
        </div>
      )}
    </section>
  );
};

export const StartRecentPanel: React.FC<StartRecentPanelProps> = (props) => {
  if (props.searchQuery.trim()) {
    return (
      <SearchHubPanel
        documents={props.documents}
        metadataLocked={props.metadataLocked}
        query={props.searchQuery}
        onOpenDocument={props.onOpenDocument}
      />
    );
  }

  return (
    <RecentOnly
      documents={props.documents}
      recentEntries={props.recentEntries}
      storedDocumentIds={props.storedDocumentIds}
      metadataLocked={props.metadataLocked}
      onOpenDocument={props.onOpenDocument}
    />
  );
};
