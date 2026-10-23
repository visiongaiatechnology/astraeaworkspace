import React, { useState } from 'react';
import { Sparkles, FileText, Table2, Presentation, BarChart3, Palette, ArrowRight } from 'lucide-react';
import { BETA_TEMPLATES, type BetaTemplateId } from '../../platform/templates/templateCatalog';
import type { EditionRegistry } from '../../edition/contracts';
import { useWorkspaceLocale, workspaceText } from '../localization/workspaceLocale';
import { shellSurfaceCopy } from '../i18n/shellSurfaceLocale';

interface StartTemplatesProps {
  onCreateTemplate: (templateId: BetaTemplateId) => void;
  editionRegistry: EditionRegistry;
}

const TEMPLATE_META: Record<
  BetaTemplateId,
  { icon: React.ComponentType<{ className?: string }> }
> = {
  'writer-report': { icon: FileText },
  'grid-budget': { icon: Table2 },
  'present-pitch': { icon: Presentation },
  'project-plan': { icon: BarChart3 },
  'whiteboard-architecture': { icon: Palette },
};

const TEMPLATE_FILTERS = ['all', 'Writer', 'Grid', 'Present', 'Projects', 'Whiteboard'] as const;

export const StartTemplates: React.FC<StartTemplatesProps> = ({ onCreateTemplate, editionRegistry }) => {
  const { locale } = useWorkspaceLocale();
  const copy = shellSurfaceCopy(locale);
  const premiumAvailabilityLabel = workspaceText('edition.premiumRequired', locale);
  const [filterKind, setFilterKind] = useState<string>('all');

  const filtered = BETA_TEMPLATES.filter((tpl) => {
    if (filterKind === 'all') return true;
    return tpl.kind.toLowerCase() === filterKind.toLowerCase();
  });

  return (
    <section aria-labelledby="start-templates-title" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="start-templates-title" className="flex items-center gap-2 text-sm font-semibold tracking-tight text-[var(--vgt-text-primary)]">
            <Sparkles aria-hidden="true" className="h-4 w-4 text-[var(--vgt-accent-strong)]" />
            <span>{copy.templates.title}</span>
          </h2>
          <p className="mt-0.5 text-xs text-[var(--vgt-text-muted)]">
            {copy.templates.description}
          </p>
        </div>

        <div aria-label={copy.templates.filterLabel} className="flex max-w-full flex-wrap items-center gap-1 rounded-xl border border-[var(--vgt-metal-edge)] bg-[var(--vgt-surface-z1)] p-1 text-[11px]">
          {TEMPLATE_FILTERS.map((kind) => {
            const selected = filterKind === kind;
            return (
              <button
                key={kind}
                type="button"
                aria-pressed={selected}
                onClick={() => setFilterKind(kind)}
                className={`rounded-lg border px-2.5 py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vgt-accent-strong)] ${
                  selected
                    ? 'border-[var(--vgt-metal-edge)] bg-[var(--vgt-accent-soft)] font-medium text-[var(--vgt-accent-strong)]'
                    : 'border-transparent text-[var(--vgt-control-muted)] hover:bg-[var(--vgt-control-hover)] hover:text-[var(--vgt-control-text)]'
                }`}
              >
                {kind === 'all' ? copy.templates.all : copy.modules[kind].shortName}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((tpl) => {
          const meta = TEMPLATE_META[tpl.id];
          const templateCopy = copy.templates.entries[tpl.id];
          const Icon = meta.icon;
          const premiumRequired = !editionRegistry.isImplementedApp(tpl.kind);

          return (
            <button
              key={tpl.id}
              type="button"
              aria-disabled={premiumRequired}
              disabled={premiumRequired}
              data-availability={premiumRequired ? 'premium-required' : 'implemented'}
              aria-label={`${templateCopy.name}${premiumRequired ? ` · ${premiumAvailabilityLabel}` : ''}`}
              onClick={() => onCreateTemplate(tpl.id)}
              className={`glass-panel group flex min-h-40 flex-col justify-between rounded-2xl border p-4 text-left transition-[border-color,background-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vgt-focus)] disabled:cursor-not-allowed disabled:opacity-75 ${premiumRequired ? 'border-[var(--vgt-control-border)]' : 'hover:border-[var(--vgt-metal-edge)] hover:bg-[var(--vgt-control-hover)]'}`}
            >
              <div>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--vgt-control-border)] bg-[var(--vgt-control-surface)] text-[var(--vgt-control-muted)] transition-colors group-hover:text-[var(--vgt-accent-strong)]">
                    <Icon aria-hidden="true" className="h-4 w-4" />
                  </div>
                  <span className="rounded-md border border-[var(--vgt-control-border)] bg-[var(--vgt-control-surface)] px-2 py-0.5 font-mono text-[10px] text-[var(--vgt-control-muted)]">
                    {copy.modules[tpl.kind].shortName}
                  </span>
                </div>

                <div className="text-xs font-semibold text-[var(--vgt-text-primary)] transition-colors group-hover:text-[var(--vgt-accent-strong)]">
                  {templateCopy.name}
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-[var(--vgt-text-muted)]">
                  {templateCopy.description}
                </p>
                {premiumRequired && (
                  <span className="mt-2 inline-flex rounded-md border border-[var(--vgt-control-warning)] bg-[var(--vgt-control-warning-soft)] px-2 py-1 text-[10px] font-semibold text-[var(--vgt-control-warning)]">
                    {premiumAvailabilityLabel}
                  </span>
                )}
              </div>

              <div className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--vgt-metal-edge)] pt-2.5 text-[10px]">
                <span className="text-[var(--vgt-text-muted)]">{templateCopy.highlight || copy.templates.fallbackHighlight}</span>
                {premiumRequired ? (
                  <span className="shrink-0 font-medium text-[var(--vgt-control-muted)]">{copy.templates.premium}</span>
                ) : (
                  <span className="flex shrink-0 items-center gap-1 font-medium text-[var(--vgt-control-muted)] transition-colors group-hover:text-[var(--vgt-accent-strong)]">
                    {copy.templates.create} <ArrowRight aria-hidden="true" className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
};
