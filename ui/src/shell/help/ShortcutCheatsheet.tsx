import React, { useMemo, useRef, useState } from 'react';
import type { DocumentKind } from '../../shared/contracts/workspace';
import type { ShellShortcutMap } from '../platform/workspaceShellPlatform';
import { useWorkspaceLocale } from '../localization/workspaceLocale';
import { Search, X } from 'lucide-react';
import { shellSurfaceCopy, type ShortcutLabelKey } from '../i18n/shellSurfaceLocale';

interface ShortcutCheatsheetProps {
  open: boolean;
  kind: DocumentKind | null;
  shortcuts: ShellShortcutMap;
  onClose: () => void;
}

type ShortcutEntry = [ShortcutLabelKey, string];

const MODULE_SHORTCUTS: Partial<Record<DocumentKind, ShortcutEntry[]>> = {
  Writer: [['findReplace', 'Ctrl+F / Ctrl+H'], ['bold', 'Ctrl+B'], ['italic', 'Ctrl+I'], ['underline', 'Ctrl+U'], ['zenMode', 'F11 / Ctrl+Shift+F']],
  Grid: [['editCell', 'Enter / F2'], ['formulaInput', '='], ['toggleAbsoluteReference', 'F4'], ['recalculateFormulas', 'F9'], ['nextCell', 'Tab'], ['previousCell', 'Shift+Tab'], ['cellBelow', 'Enter'], ['selectAll', 'Ctrl+A'], ['find', 'Ctrl+F']],
  Present: [['startPresentation', 'F5'], ['nextSlide', 'ArrowRight / Space'], ['previousSlide', 'ArrowLeft'], ['zenMode', 'F11 / Ctrl+Shift+F']],
  Notes: [['bold', 'Ctrl+B'], ['italic', 'Ctrl+I'], ['find', 'Ctrl+F'], ['zenMode', 'F11 / Ctrl+Shift+F']],
  Database: [['nextField', 'Tab'], ['nextRecord', 'Enter'], ['find', 'Ctrl+F']],
  Connect: [['findMail', 'Ctrl+F'], ['undo', 'Ctrl+Z'], ['redo', 'Ctrl+Shift+Z']],
};

export const ShortcutCheatsheet: React.FC<ShortcutCheatsheetProps> = ({ open, kind, shortcuts, onClose }) => {
  const { locale } = useWorkspaceLocale();
  const copy = shellSurfaceCopy(locale);
  const [query, setQuery] = useState('');
  const closeRef = useRef<HTMLButtonElement>(null);
  const entries = useMemo(() => {
    const labels = copy.shortcuts.labels;
    const global: ShortcutEntry[] = [
      ['commandPalette', shortcuts['command-palette']],
      ['save', shortcuts.save],
      ['quickAddTask', shortcuts['quick-add-task']],
      ['startCenter', shortcuts['start-center']],
      ['workspaceExplorer', shortcuts['workspace-explorer']],
      ['newWindow', shortcuts['new-window']],
      ['switchTab', 'Ctrl+Tab'], ['closeTab', 'Ctrl+W'], ['zoomIn', 'Ctrl++'], ['zoomOut', 'Ctrl+-'], ['resetZoom', 'Ctrl+0'],
    ];
    const all: Array<[string, string]> = [...global, ...(kind ? MODULE_SHORTCUTS[kind] ?? [] : [])]
      .map(([key, binding]) => [labels[key], binding]);
    const needle = query.trim().toLocaleLowerCase(locale);
    return needle ? all.filter(([label, binding]) => `${label} ${binding}`.toLocaleLowerCase(locale).includes(needle)) : all;
  }, [copy.shortcuts.labels, kind, locale, query, shortcuts]);

  if (!open) return null;
  const moduleLabel = kind ? copy.modules[kind].shortName : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label={copy.shortcuts.title}>
      <button type="button" className="absolute inset-0" aria-label={copy.shortcuts.close} onClick={onClose} />
      <section className="relative z-10 w-full max-w-2xl rounded-2xl border border-purple-500/25 bg-[#0a0714] shadow-2xl">
        <header className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-white">{copy.shortcuts.title}</h2>
            <p className="mt-1 text-[10px] text-slate-500">{moduleLabel ? `${moduleLabel} · ` : ''}{copy.shortcuts.searchable}</p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} className="rounded-md p-2 text-slate-400 hover:bg-white/10" aria-label={copy.shortcuts.close}>
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="p-4">
          <label className="relative block">
            <Search aria-hidden="true" className="absolute left-3 top-2.5 h-4 w-4 text-purple-400" />
            <span className="sr-only">{copy.shortcuts.searchLabel}</span>
            <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy.shortcuts.searchPlaceholder} className="w-full rounded-lg border border-white/10 bg-slate-950 py-2 pl-9 pr-3 text-xs text-slate-200 outline-none focus:border-purple-400" />
          </label>
          <dl className="mt-4 grid max-h-[55vh] grid-cols-1 gap-x-6 overflow-y-auto sm:grid-cols-2">
            {entries.map(([label, binding]) => (
              <div key={`${label}:${binding}`} className="flex items-center justify-between gap-4 border-b border-white/[0.06] py-2.5">
                <dt className="text-xs text-slate-300">{label}</dt>
                <dd><kbd className="rounded-md border border-white/10 bg-slate-900 px-2 py-1 font-mono text-[10px] text-purple-200">{binding}</kbd></dd>
              </div>
            ))}
          </dl>
          {entries.length === 0 && <p className="py-8 text-center text-xs text-slate-500">{copy.shortcuts.noResults}</p>}
        </div>
      </section>
    </div>
  );
};
