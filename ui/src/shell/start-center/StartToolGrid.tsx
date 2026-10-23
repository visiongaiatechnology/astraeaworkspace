import React, { useState } from 'react';
import { LockKeyhole, Plus, Sparkles, ShieldAlert } from 'lucide-react';
import type { DocumentKind } from '../../shared/contracts/workspace';
import { ALL_START_MODULES } from './contracts/startCenterTypes';
import { AstraeaAppIcon } from '../../design-system/brand/AstraeaAppIcon';
import type { EditionRegistry } from '../../edition/contracts';
import type { AppKind } from '../../edition/contracts';
import {
  availabilityClassOf,
  availabilityReason,
  releaseStatusDetail,
  releaseStatusLabel,
} from '../../edition/releaseStatus';
import { useWorkspaceLocale, workspaceText } from '../localization/workspaceLocale';
import { formatShellNumber, shellSurfaceCopy } from '../i18n/shellSurfaceLocale';

interface StartToolGridProps {
  searchQuery: string;
  activeCategory: string;
  onSelectModule: (kind: DocumentKind) => void;
  editionRegistry: EditionRegistry;
}

/**
 * Die Klasse eines Verfügbarkeits-Badges. Zwei ehrliche Stufen:
 * `alpha` = im beworbenen Umfang nutzbar; `in-progress` = nicht alle Funktionen verfügbar.
 * Die Farben bleiben ruhig (Emerald/Amber) und verlassen sich nicht auf Farbe allein — das Label steht daneben.
 */
function availabilityBadgeClass(availability: 'alpha' | 'in-progress'): string {
  return availability === 'alpha'
    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
    : 'border-amber-500/40 bg-amber-500/10 text-amber-200';
}

/**
 * **Wiederverwendbares Verfügbarkeits-Badge für andere Start-Surfaces.**
 *
 * Exportiert aus `StartToolGrid.tsx`, damit `StartAppOverview` (Scope: release-integrity) exakt dieselbe
 * Kennzeichnung über seinen optionalen `renderBadge`-Prop einsetzen kann, ohne eine zweite Einstufung
 * oder eine zweite Textquelle zu bauen. Texte kommen aus dem 7-Sprachen-Katalog (`availability.*`),
 * die Klasse aus der zentralen Release-Registry.
 */
export interface AppAvailabilityBadgeProps {
  readonly kind: DocumentKind;
}

export const AppAvailabilityBadge: React.FC<AppAvailabilityBadgeProps> = ({ kind }) => {
  const { locale } = useWorkspaceLocale();
  const availability = availabilityClassOf(kind as AppKind);
  const label = workspaceText(availability === 'alpha' ? 'availability.alpha' : 'availability.inProgress', locale);
  const hint = workspaceText(availability === 'alpha' ? 'availability.alphaHint' : 'availability.inProgressHint', locale);
  const reason = availabilityReason(kind as AppKind, locale);
  return (
    <span
      data-availability-badge={availability}
      data-app-overview-availability={availability}
      title={`${hint} ${reason}`}
      className={`inline-flex shrink-0 items-center rounded border px-1.5 py-0.5 text-[0.5625rem] font-semibold uppercase tracking-[0.08em] ${availabilityBadgeClass(availability)}`}
    >
      {label}
    </span>
  );
};

export const StartToolGrid: React.FC<StartToolGridProps> = ({
  searchQuery,
  activeCategory,
  onSelectModule,
  editionRegistry,
}) => {
  const { locale } = useWorkspaceLocale();
  const copy = shellSurfaceCopy(locale);
  const premiumAvailabilityLabel = workspaceText('edition.premiumRequired', locale);
  const premiumUnavailableMessage = workspaceText('edition.appUnavailable', locale);
  const alphaLabel = workspaceText('availability.alpha', locale);
  const alphaHint = workspaceText('availability.alphaHint', locale);
  const inProgressLabel = workspaceText('availability.inProgress', locale);
  const inProgressHint = workspaceText('availability.inProgressHint', locale);
  const [unavailableModule, setUnavailableModule] = useState<DocumentKind | null>(null);
  const normalizedSearch = searchQuery.trim().toLocaleLowerCase();
  const filteredModules = ALL_START_MODULES.map((mod) => {
    const availabilityClass = availabilityClassOf(mod.kind);
    return {
      ...mod,
      localized: copy.modules[mod.kind],
      localizedCategory: copy.categoryLabels[mod.category],
      availability: editionRegistry.isImplementedApp(mod.kind) ? 'implemented' as const : 'premium-required' as const,
      releaseStatus: editionRegistry.getReleaseStatus(mod.kind),
      releaseLabel: releaseStatusLabel(mod.kind, locale),
      releaseDetail: releaseStatusDetail(mod.kind, locale),
      /** Verfügbarkeits-/Alpha-Stufe aus der zentralen Release-Registry (keine zweite Einstufung). */
      availabilityClass,
      availabilityLabel: availabilityClass === 'alpha' ? alphaLabel : inProgressLabel,
      availabilityHint: availabilityClass === 'alpha' ? alphaHint : inProgressHint,
      availabilityReason: availabilityReason(mod.kind, locale),
      /**
       * Ein Sicherheits-Gate kann im Code enthalten und trotzdem für die Beta gesperrt sein. Diese
       * Unterscheidung ist der Kern der ehrlichen Kennzeichnung: `implemented` heißt nicht `freigegeben`.
       */
      releaseBlocked: editionRegistry.isImplementedApp(mod.kind) && !editionRegistry.isCreationAvailable(mod.kind),
    };
  }).filter((mod) => {
    const matchesSearch =
      normalizedSearch === '' ||
      mod.name.toLocaleLowerCase().includes(normalizedSearch) ||
      mod.localized.shortName.toLocaleLowerCase().includes(normalizedSearch) ||
      mod.localized.description.toLocaleLowerCase().includes(normalizedSearch) ||
      mod.kind.toLocaleLowerCase().includes(normalizedSearch) ||
      (mod.ext?.toLocaleLowerCase().includes(normalizedSearch) ?? false);

    const matchesCategory = activeCategory === 'all' || mod.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <section aria-labelledby="start-tools-title" className="space-y-4">
      <div>
        <h2 id="start-tools-title" className="flex items-center gap-2 text-sm font-semibold tracking-tight text-[var(--vgt-text-primary)]">
          <span>{copy.tools.title}</span>
          <span className="rounded-full border border-[var(--vgt-control-border)] bg-[var(--vgt-control-surface)] px-2 py-0.5 font-mono text-[10px] text-[var(--vgt-control-muted)]">
            {formatShellNumber(locale, filteredModules.length)} {copy.tools.count}
          </span>
        </h2>
        <p className="mt-0.5 text-xs text-[var(--vgt-text-muted)]">
          {copy.tools.description}
        </p>
        {/* Die zwei Verfügbarkeitsstufen werden benannt — Farben allein wären keine Aussage. */}
        <p data-availability-legend="true" className="mt-1 text-[10px] leading-relaxed text-[var(--vgt-control-muted)]">
          {alphaLabel} — {alphaHint} · {inProgressLabel} — {inProgressHint}
        </p>
      </div>

      {filteredModules.length === 0 ? (
        <div className="glass-panel rounded-2xl p-8 text-center">
          <p className="text-sm text-[var(--vgt-text-muted)]">{copy.tools.empty}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filteredModules.map((mod) => {
            const premiumRequired = mod.availability === 'premium-required';
            const gated = !premiumRequired && mod.releaseBlocked;
            const startDisabled = premiumRequired || gated;
            return (
            <article
              key={mod.kind}
              data-availability={mod.availability}
              data-release-status={mod.releaseStatus}
              data-availability-class={mod.availabilityClass}
              title={`${mod.name} — ${mod.availabilityLabel}: ${mod.availabilityHint} ${mod.availabilityReason} · ${mod.releaseDetail}`}
              className={`glass-panel group flex min-h-52 flex-col justify-between rounded-2xl p-4 transition-[border-color,background-color,box-shadow] ${startDisabled ? 'opacity-70' : 'hover:border-[var(--vgt-metal-edge)] hover:bg-[var(--vgt-control-hover)]'}`}
            >
              <div>
                <div className="mb-4 flex items-center justify-between gap-2">
                  <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl border border-[var(--vgt-control-border)] bg-[var(--vgt-surface-z2)] shadow-[inset_0_1px_0_var(--vgt-metal-highlight)]">
                    <AstraeaAppIcon
                      kind={mod.kind}
                      alt={`${mod.name} Icon`}
                      className="h-11 w-11 transition-transform group-hover:scale-105"
                    />
                  </div>
                  {mod.ext && <span className="rounded-md border border-[var(--vgt-control-border)] bg-[var(--vgt-control-surface)] px-2 py-0.5 font-mono text-[10px] text-[var(--vgt-control-muted)]">{mod.ext}</span>}
                </div>

                <h3 className="flex items-center gap-1.5 text-sm font-semibold text-[var(--vgt-text-primary)] transition-colors group-hover:text-[var(--vgt-accent-strong)]">
                  <span>{mod.name}</span>
                  {mod.isPrimary && (
                    <Sparkles aria-hidden="true" className="inline h-3 w-3 shrink-0 text-[var(--vgt-accent-strong)]" />
                  )}
                </h3>
                {premiumRequired ? (
                  <span className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-[var(--vgt-control-border)] bg-[var(--vgt-control-surface)] px-2 py-1 text-[10px] font-semibold text-[var(--vgt-control-muted)]">
                    <LockKeyhole aria-hidden="true" className="h-3 w-3" />
                    {premiumAvailabilityLabel}
                  </span>
                ) : (
                  <>
                    {/* Ehrliche Verfügbarkeits-/Alpha-Kennzeichnung: Badge plus sichtbarer Hinweis. */}
                    <span
                      data-availability-badge={mod.availabilityClass}
                      title={`${mod.availabilityReason} · ${mod.releaseLabel}`}
                      className={`mt-2 inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${availabilityBadgeClass(mod.availabilityClass)}`}
                    >
                      {mod.releaseStatus === 'security-gate-blocked'
                        ? <ShieldAlert aria-hidden="true" className="h-3 w-3" />
                        : null}
                      {mod.availabilityLabel}
                    </span>
                    <p data-availability-hint={mod.availabilityClass} className="mt-1.5 text-[10px] leading-relaxed text-[var(--vgt-text-muted)]">
                      {mod.availabilityHint}
                    </p>
                  </>
                )}
                <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--vgt-text-muted)]">
                  {mod.localized.description}
                </p>
                {/* Ehrlicher Zustandstext: nicht verfügbar wird benannt, nie still verschluckt. */}
                {(premiumRequired || gated) && unavailableModule === mod.kind && (
                  <p role="status" aria-live="polite" className="mt-3 rounded-lg border border-[var(--vgt-control-border)] bg-[var(--vgt-surface-z1)] px-3 py-2 text-xs leading-relaxed text-[var(--vgt-text-secondary)]">
                    {premiumRequired ? premiumUnavailableMessage : `${mod.availabilityReason} ${mod.releaseDetail}`}
                  </p>
                )}
              </div>

              <div className="mt-5 flex items-center justify-between gap-3 border-t border-[var(--vgt-metal-edge)] pt-3">
                <span className="text-[10px] font-medium text-[var(--vgt-control-muted)]">
                  {mod.localizedCategory}
                </span>
                <button
                  type="button"
                  aria-disabled={startDisabled}
                  data-availability={mod.availability}
                  data-release-status={mod.releaseStatus}
                  title={gated ? mod.releaseDetail : premiumRequired ? premiumUnavailableMessage : undefined}
                  onClick={() => {
                    if (startDisabled) {
                      setUnavailableModule((current) => current === mod.kind ? null : mod.kind);
                      return;
                    }
                    setUnavailableModule(null);
                    onSelectModule(mod.kind);
                  }}
                  aria-label={premiumRequired
                    ? `${mod.name} — ${premiumAvailabilityLabel}`
                    : gated
                      ? `${mod.name} — ${mod.releaseLabel}`
                      : `${mod.name} · ${copy.tools.start}`}
                  className={`vgt-button-secondary inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vgt-accent-strong)] ${startDisabled ? 'cursor-not-allowed opacity-65' : 'active:scale-[0.98]'}`}
                >
                  {premiumRequired
                    ? <><LockKeyhole aria-hidden="true" className="h-3.5 w-3.5" /><span>{copy.tools.premium}</span></>
                    : gated
                      ? <><ShieldAlert aria-hidden="true" className="h-3.5 w-3.5" /><span>{mod.releaseLabel}</span></>
                      : <><Plus aria-hidden="true" className="h-3.5 w-3.5" /><span>{copy.tools.start}</span></>}
                </button>
              </div>
            </article>
            );
          })}
        </div>
      )}
    </section>
  );
};
