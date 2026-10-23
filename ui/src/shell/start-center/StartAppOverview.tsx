// STATUS: PLATIN — Alpha 0.1 first-start app overview (honest, task-first, no app wall).
//
// The Start Center used to lead a first-time user straight from the editorial hero into library
// metadata. This surface answers the first real question — "what can I open here?" — with the core
// Open Core apps only, each with one honest sentence and exactly one working action. It is built as a
// calm list of control rows (not a wall of marketing cards) and stays extensible: `renderBadge` is the
// later integration point for the release-status badges owned by the modules workstream, so this file
// never fakes a release claim on its own.
import React from 'react';
import type { DocumentKind, WorkspaceDocument } from '../../shared/contracts/workspace';
import type { EditionRegistry } from '../../edition/contracts';
import { ALL_START_MODULES, type StartModuleDefinition } from './contracts/startCenterTypes';
import { availabilityClassOf } from '../../edition/releaseStatus';
import { AstraeaAppIcon } from '../../design-system/brand/AstraeaAppIcon';
import { useWorkspaceLocale, workspaceText } from '../localization/workspaceLocale';
import { shellSurfaceCopy } from '../i18n/shellSurfaceLocale';

/**
 * The apps a first-time Open Core user is expected to find without searching. Ordered by the
 * user-facing Alpha priority; `AdminPolicy` is deliberately absent (security gate locked in Alpha),
 * `Planner`/`Projects`/`Forms`/`Database`/`Spaces` are Premium-only.
 */
export const START_OVERVIEW_APP_KINDS: readonly DocumentKind[] = Object.freeze([
  'Writer',
  'Grid',
  'Present',
  'Notes',
  'Tasks',
  'Whiteboard',
  'Publish',
  'PdfStudio',
  'Draw',
  'Vault',
]);

export interface StartAppOverviewProps {
  readonly editionRegistry: EditionRegistry;
  /** Open documents: an app that is already open shows "Open" instead of creating a duplicate. */
  readonly documents: Readonly<Record<string, WorkspaceDocument>>;
  /** Opens an existing document (shell handles activation and closing the Start Center). */
  readonly onOpenDocument: (documentId: string) => void;
  /** Creates a new document of the app's kind (shell handles gating and closing the Start Center). */
  readonly onCreateDocument: (kind: DocumentKind) => void;
  /**
   * Reserved integration point for the Alpha release-status badges (modules workstream).
   * Rendered inside the future badge slot of each row; nothing is rendered by default.
   */
  readonly renderBadge?: (kind: DocumentKind) => React.ReactNode;
}

interface StartOverviewApp {
  readonly kind: DocumentKind;
  readonly definition: StartModuleDefinition;
}

function resolveOverviewApps(editionRegistry: EditionRegistry): StartOverviewApp[] {
  const byKind = new Map<DocumentKind, StartModuleDefinition>(ALL_START_MODULES.map((definition) => [definition.kind, definition]));
  const apps: StartOverviewApp[] = [];
  for (const kind of START_OVERVIEW_APP_KINDS) {
    const definition = byKind.get(kind);
    // Honest condition: shipped in this edition **and** allowed to be created in the Alpha Beta.
    // A locked security gate stays visible elsewhere, but never becomes a dead button here.
    if (!definition || !editionRegistry.isImplementedApp(kind) || !editionRegistry.isCreationAvailable(kind)) continue;
    apps.push({ kind, definition });
  }
  return apps;
}

export const StartAppOverview: React.FC<StartAppOverviewProps> = ({
  editionRegistry,
  documents,
  onOpenDocument,
  onCreateDocument,
  renderBadge,
}) => {
  const { locale } = useWorkspaceLocale();
  const surface = shellSurfaceCopy(locale);
  const apps = resolveOverviewApps(editionRegistry);

  const openDocumentByKind = new Map<DocumentKind, WorkspaceDocument>();
  for (const document of Object.values(documents)) {
    if (!openDocumentByKind.has(document.kind)) openDocumentByKind.set(document.kind, document);
  }

  const openLabel = workspaceText('start.overview.open', locale);
  const createLabel = workspaceText('start.overview.create', locale);

  return (
    <section aria-labelledby="start-app-overview-title" data-start-app-overview="true" className="space-y-3">
      <div>
        <h2 id="start-app-overview-title" className="text-sm font-semibold tracking-tight text-[var(--vgt-text-primary)]">
          {workspaceText('start.overview.title', locale)}
        </h2>
        <p className="mt-0.5 text-xs leading-relaxed text-[var(--vgt-text-muted)]">
          {workspaceText('start.overview.description', locale)}
        </p>
      </div>

      {apps.length === 0 ? (
        <p role="status" className="glass-panel rounded-xl px-4 py-3 text-xs text-[var(--vgt-text-muted)]">
          {workspaceText('start.overview.empty', locale)}
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-2.5 lg:grid-cols-2" data-start-app-overview-list="true">
          {apps.map(({ kind, definition }) => {
            const localized = surface.modules[kind];
            const openDocument = openDocumentByKind.get(kind);
            const actionLabel = openDocument ? openLabel : createLabel;
            return (
              <li
                key={kind}
                data-app-overview-kind={kind}
                data-app-overview-state={openDocument ? 'open' : 'create'}
                className="flex h-full items-start gap-3 rounded-xl border border-[color:var(--vgt-metal-edge)] bg-[var(--vgt-control-surface)] px-3 py-2.5"
              >
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[var(--vgt-control-border)] bg-[var(--vgt-surface-z2)]">
                  <AstraeaAppIcon kind={kind} alt="" className="h-8 w-8" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <h3 className="text-[13px] font-semibold leading-tight text-[var(--vgt-text-primary)]">{definition.name}</h3>
                    <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--vgt-control-muted)]">{localized.shortName}</span>
                    {renderBadge ? <span data-app-overview-badge-slot={kind}>{renderBadge(kind)}</span> : null}
                  </div>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--vgt-text-muted)]" title={localized.description}>
                    {localized.description}
                  </p>
                  {/* The badge alone is not an explanation: state visibly whether the app is usable
                      in the advertised scope (Alpha) or still missing features (in progress). */}
                  <p
                    data-app-overview-availability-hint={availabilityClassOf(kind)}
                    className="mt-0.5 text-[9px] leading-relaxed text-[var(--vgt-control-muted)]"
                  >
                    {workspaceText(
                      availabilityClassOf(kind) === 'alpha' ? 'availability.alphaHint' : 'availability.inProgressHint',
                      locale,
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  data-app-overview-action={openDocument ? 'open' : 'create'}
                  onClick={() => {
                    if (openDocument) onOpenDocument(openDocument.id);
                    else onCreateDocument(kind);
                  }}
                  aria-label={`${definition.name} — ${actionLabel}`}
                  className="vgt-button-secondary mt-0.5 inline-flex shrink-0 items-center rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vgt-accent-strong)]"
                >
                  {actionLabel}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
