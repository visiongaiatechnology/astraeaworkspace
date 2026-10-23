import React from 'react';
import { Search, X, Layers, Sparkles, FileText, CheckSquare, HardDrive, Clock3 } from 'lucide-react';
import type { StartCenterCategory } from './contracts/startCenterTypes';
import { useWorkspaceLocale } from '../localization/workspaceLocale';
import { shellSurfaceCopy } from '../i18n/shellSurfaceLocale';

interface StartTopBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  activeCategory: StartCenterCategory;
  onSelectCategory: (category: StartCenterCategory) => void;
  onClose: () => void;
}

const TABS: Array<{ id: StartCenterCategory; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'all', icon: Layers },
  { id: 'recent', icon: Clock3 },
  { id: 'productivity', icon: FileText },
  { id: 'work', icon: CheckSquare },
  { id: 'templates', icon: Sparkles },
  { id: 'platform', icon: HardDrive },
];

export const StartTopBar: React.FC<StartTopBarProps> = ({
  searchQuery,
  onSearchChange,
  activeCategory,
  onSelectCategory,
  onClose,
}) => {
  const { locale } = useWorkspaceLocale();
  const copy = shellSurfaceCopy(locale);
  return (
    <header className="glass-panel sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-x-0 border-t-0 px-5 py-3 select-none sm:gap-4 sm:px-7 lg:px-8">
      {/* Search Input */}
      <div className="relative min-w-0 flex-1 sm:min-w-[240px] sm:max-w-lg">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--vgt-control-muted)]" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={copy.topbar.globalSearch}
          aria-label={copy.topbar.globalSearch}
          aria-describedby="start-search-syntax-hint"
          className="vgt-input w-full rounded-xl py-2 pl-10 pr-20 text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--vgt-focus)] select-text"
        />
        <span id="start-search-syntax-hint" className="sr-only">
          {copy.topbar.syntaxHint}
        </span>
        <kbd className="glass-pill pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded px-1.5 py-0.5 font-mono text-[10px] text-[var(--vgt-control-muted)]">
          Ctrl+K
        </kbd>
      </div>

      {/* Category Filter Tabs */}
      <div className="glass-panel flex max-w-full flex-wrap items-center gap-1 rounded-xl p-1">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeCategory === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelectCategory(tab.id)}
              aria-pressed={isActive}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--vgt-focus)] ${
                isActive
                  ? 'glass-pill border-[color:var(--vgt-metal-edge)] bg-[var(--vgt-accent-soft)] text-[var(--vgt-accent-strong)]'
                  : 'border-transparent text-[var(--vgt-control-muted)] hover:bg-[var(--vgt-control-hover)] hover:text-[var(--vgt-control-text)]'
              }`}
            >
              <Icon aria-hidden="true" className={`h-3.5 w-3.5 ${isActive ? 'text-[var(--vgt-accent-strong)]' : 'text-[var(--vgt-control-muted)]'}`} />
              <span>{copy.categoryLabels[tab.id]}</span>
            </button>
          );
        })}
      </div>

      {/* Close Button */}
      <button
        onClick={onClose}
        type="button"
        className="vgt-button-secondary flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--vgt-control-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--vgt-focus)]"
        title={copy.topbar.continueTitle}
      >
        <span>{copy.topbar.continueWorkspace}</span>
        <X aria-hidden="true" className="h-3.5 w-3.5 text-[var(--vgt-control-muted)]" />
      </button>
    </header>
  );
};
