// STATUS: PLATIN — localized, bounded command and document palette.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, Download, EyeOff, FileText, FolderSearch, Search, Share2, Shield } from 'lucide-react';
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import { AstraeaAppIcon } from '../../../design-system/brand/AstraeaAppIcon';
import { useWorkspaceLocale } from '../../localization/workspaceLocale';
import { buildShellCommandRegistry, type ShellCommandDescriptor } from '../../home/workspaceShellHomeCore';
import { localizeCommandPaletteDescriptor, COMMAND_PALETTE_COPY } from '../commandPaletteLocale';
import { commandPaletteFuzzyScore } from '../commandPaletteSearch';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onExecuteCommand: (action: string) => void;
  activeDocument: Pick<WorkspaceDocument, 'id' | 'kind'> | null;
  documents: Readonly<Record<string, WorkspaceDocument>>;
  vaultAvailable: boolean;
}

const CREATE_ICONS: Readonly<Record<string, React.ReactNode>> = {
  'new-writer': <AstraeaAppIcon kind="Writer" className="w-5 h-5" />,
  'new-grid': <AstraeaAppIcon kind="Grid" className="w-5 h-5" />,
  'new-present': <AstraeaAppIcon kind="Present" className="w-5 h-5" />,
  'new-notes': <AstraeaAppIcon kind="Notes" className="w-5 h-5" />,
  'new-pdf': <AstraeaAppIcon kind="PdfStudio" className="w-5 h-5" />,
  'new-tasks': <AstraeaAppIcon kind="Tasks" className="w-5 h-5" />,
  'new-planner': <AstraeaAppIcon kind="Planner" className="w-5 h-5" />,
  'new-projects': <AstraeaAppIcon kind="Projects" className="w-5 h-5" />,
  'new-whiteboard': <AstraeaAppIcon kind="Whiteboard" className="w-5 h-5" />,
  'new-forms': <AstraeaAppIcon kind="Forms" className="w-5 h-5" />,
  'new-database': <AstraeaAppIcon kind="Database" className="w-5 h-5" />,
  'new-vault': <AstraeaAppIcon kind="Vault" className="w-5 h-5" />,
  'new-draw': <AstraeaAppIcon kind="Draw" className="w-5 h-5" />,
  'new-spaces': <AstraeaAppIcon kind="Spaces" className="w-5 h-5" />,
  'new-gaiacom': <AstraeaAppIcon kind="GaiaCom" className="w-5 h-5" />,
  'new-publish': <AstraeaAppIcon kind="Publish" className="w-5 h-5" />,
  'new-insight': <AstraeaAppIcon kind="Insight" className="w-5 h-5" />,
  'new-connect': <AstraeaAppIcon kind="Connect" className="w-5 h-5" />,
  'new-automate': <AstraeaAppIcon kind="Automate" className="w-5 h-5" />,
  'new-admin-policy': <AstraeaAppIcon kind="AdminPolicy" className="w-5 h-5" />,
};

function commandIcon(item: ShellCommandDescriptor): React.ReactNode {
  if (item.id.startsWith('open-doc:')) return <FileText className="w-4 h-4 text-purple-300" />;
  const createIcon = CREATE_ICONS[item.id];
  if (createIcon) return createIcon;
  if (item.id === 'save-vwc') return <Download className="w-4 h-4 text-blue-400" />;
  if (item.id === 'open-vault') return <AstraeaAppIcon kind="Vault" className="w-5 h-5" />;
  if (item.id === 'open-netgate') return <Shield className="w-4 h-4 text-emerald-400" />;
  if (item.id === 'open-fabric') return <Share2 className="w-4 h-4 text-blue-400" />;
  if (item.id === 'insert-chart') return <BarChart3 className="w-4 h-4 text-blue-400" />;
  if (item.id === 'toggle-privacy') return <EyeOff className="w-4 h-4 text-amber-400" />;
  return <FolderSearch className="w-4 h-4 text-purple-300" />;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onExecuteCommand,
  activeDocument,
  documents,
  vaultAvailable,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { locale } = useWorkspaceLocale();
  const copy = COMMAND_PALETTE_COPY[locale];

  const commands = useMemo(() => {
    const base = buildShellCommandRegistry({
      activeDocument,
      hasSelection: false,
      canSave: Boolean(activeDocument),
      canInsertChart: Boolean(activeDocument && ['Writer', 'Grid', 'Present', 'Insight'].includes(activeDocument.kind)),
      vaultAvailable,
    }).map((command) => localizeCommandPaletteDescriptor(command, locale));
    const docs = Object.values(documents).slice(0, 64).map<ShellCommandDescriptor>((document) => localizeCommandPaletteDescriptor({
      id: `open-doc:${document.id}`,
      title: document.title,
      description: `Open ${document.kind} document`,
      category: 'Recent',
      scope: 'navigation',
      enabled: true,
    }, locale));
    return [...base, ...docs];
  }, [activeDocument, documents, locale, vaultAvailable]);

  const filtered = useMemo(() => commands
    .map((command) => ({
      command,
      score: commandPaletteFuzzyScore(query, `${command.title} ${command.category} ${command.description}`),
    }))
    .filter((item) => item.score >= 0)
    .sort((left, right) => right.score - left.score || left.command.title.localeCompare(right.command.title))
    .slice(0, 80)
    .map((item) => item.command), [commands, query]);

  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setSelectedIndex(0);
    queueMicrotask(() => inputRef.current?.focus());
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex((value) => Math.min(value, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (!isOpen) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelectedIndex((value) => (value + 1) % (filtered.length || 1));
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedIndex((value) => (value - 1 + (filtered.length || 1)) % (filtered.length || 1));
      } else if (event.key === 'Enter') {
        event.preventDefault();
        const command = filtered[selectedIndex];
        if (command?.enabled) {
          onExecuteCommand(command.id);
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filtered, isOpen, onClose, onExecuteCommand, selectedIndex]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 pt-24 backdrop-blur-md">
      <div className="fixed inset-0" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={copy.paletteLabel} className="relative z-10 w-full max-w-xl rounded-2xl border border-purple-500/30 bg-[#0a0714]/95 p-2">
        <div className="flex items-center border-b border-purple-500/15 px-3 py-2.5">
          <Search className="mr-2.5 h-5 w-5 text-purple-400" />
          <input
            ref={inputRef}
            aria-label={copy.searchLabel}
            value={query}
            onChange={(event) => { setQuery(event.target.value); setSelectedIndex(0); }}
            className="w-full bg-transparent text-sm outline-none"
            placeholder={copy.searchPlaceholder}
          />
        </div>
        <div role="listbox" aria-label={copy.commandsLabel} className="max-h-80 space-y-1 overflow-y-auto py-2">
          {filtered.map((item, index) => (
            <button
              type="button"
              role="option"
              aria-selected={index === selectedIndex}
              aria-disabled={!item.enabled}
              disabled={!item.enabled}
              key={item.id}
              onClick={() => {
                if (!item.enabled) return;
                onExecuteCommand(item.id);
                onClose();
              }}
              onMouseEnter={() => setSelectedIndex(index)}
              className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-xs ${index === selectedIndex ? 'border-purple-400/40 bg-purple-600/30' : 'border-transparent'} ${item.enabled ? 'text-slate-300 hover:bg-purple-900/20' : 'cursor-not-allowed text-slate-600'}`}
            >
              <span className="flex items-center gap-2.5">
                {commandIcon(item)}
                <span>
                  <span className="block font-medium">{item.title}</span>
                  <span className="block text-[9px] text-slate-500">{item.enabled ? item.description : item.disabledReason}</span>
                </span>
              </span>
              <span className="flex items-center gap-2">
                <span className="text-[9px] text-purple-300/60">{item.category}</span>
                {item.shortcut && <kbd className="rounded border border-purple-500/20 px-1.5 py-0.5 text-[9px]">{item.shortcut}</kbd>}
              </span>
            </button>
          ))}
          {filtered.length === 0 && <div className="px-4 py-6 text-center text-xs text-slate-500">{copy.noResults}</div>}
        </div>
      </div>
    </div>
  );
};
