// STATUS: PLATIN — Cross-App Vault-Picker: die Oberfläche (V-023).
//
// Eine Anwendung (Writer, Publish, Present …) öffnet diesen Dialog, um ein Vault-Asset **gezielt**
// auszuwählen. Der Dialog **filtert mit der Autorität** (`listVaultPickerCandidates` →
// `evaluateVaultAccess`): was die aufrufende Anwendung nicht öffnen darf, erscheint gar nicht erst. Damit
// gibt der Picker weder Namen noch Klassifikation von Assets preis, auf die kein Recht besteht.
//
// **Keyboard ist nicht optional:** Escape schließt, Enter bestätigt die markierte Zeile, die Liste ist
// per Tab erreichbar, und jede Zeile hat eine tastaturlesbare Beschriftung. Ein zeigergebundener Picker
// wäre ein Defekt.
//
// **Barrierearm ohne Farbe:** jede Zeile trägt ihre Klassifikation und — falls nötig — den Hinweis
// „grant required" als **Text**, nicht nur als Farbton.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FileKey2, Search, ShieldCheck, X } from 'lucide-react';
import type { DocumentKind, VaultFile, VaultShareGrant } from '../../contracts/workspace';
import type { VaultAccessAction } from '../security/vaultAccessPolicyEngine';
import {
  listVaultPickerCandidates,
  MAX_VAULT_PICKER_QUERY,
  resolveVaultPickerSelection,
  type VaultPickerCandidate,
} from './vaultPickerEngine';

export interface VaultPickerModalProps {
  isOpen: boolean;
  /** Die aufrufende Anwendung — bestimmt die Klassifikationsgrenze. */
  requestingApp: DocumentKind;
  action: VaultAccessAction;
  title?: string;
  files: VaultFile[];
  grants?: readonly VaultShareGrant[] | null;
  onSelect: (candidate: VaultPickerCandidate) => void;
  onCancel: () => void;
}

const fmt = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 ** 2 ? `${(bytes / 1024).toFixed(1)} KiB` : `${(bytes / 1024 ** 2).toFixed(1)} MiB`;

export const VaultPickerModal: React.FC<VaultPickerModalProps> = ({
  isOpen, requestingApp, action, title, files, grants, onSelect, onCancel,
}) => {
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const listing = useMemo(
    () => isOpen ? listVaultPickerCandidates(files, { app: requestingApp, action, grants, query }) : null,
    [isOpen, files, requestingApp, action, grants, query],
  );

  useEffect(() => {
    if (!isOpen) { setQuery(''); setHighlighted(0); return; }
    // Fokus beim Öffnen auf das Suchfeld — sonst müsste der Nutzer erst tabben.
    searchRef.current?.focus({ preventScroll: true });
  }, [isOpen]);

  useEffect(() => { setHighlighted(0); }, [query]);

  if (!isOpen || !listing) return null;

  const candidates = listing.candidates;
  const highlightedCandidate = candidates[Math.min(highlighted, Math.max(0, candidates.length - 1))];

  const confirm = () => {
    if (!highlightedCandidate) return;
    // Erneutes Urteil beim Bestätigen: zwischen Anzeige und Auswahl kann ein Grant widerrufen worden sein.
    const resolved = resolveVaultPickerSelection(files, { app: requestingApp, action, grants }, highlightedCandidate.fileId);
    if (!resolved.ok) return;
    onSelect(resolved.candidate);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') { event.preventDefault(); onCancel(); return; }
    if (event.key === 'Enter') { event.preventDefault(); confirm(); return; }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    setHighlighted((current) => {
      if (!candidates.length) return 0;
      return event.key === 'ArrowDown'
        ? Math.min(current + 1, candidates.length - 1)
        : Math.max(current - 1, 0);
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label={title ?? `Select an encrypted Vault asset for ${requestingApp}`} data-vault-picker="true" onKeyDown={onKeyDown}>
      <div className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-950 shadow-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 truncate text-sm font-semibold text-slate-100">
              <FileKey2 aria-hidden="true" className="h-4 w-4 text-cyan-300" />
              {title ?? `Select a Vault asset for ${requestingApp}`}
            </h3>
            <p className="mt-1 text-[10px] text-slate-500">
              Only assets that <b>{requestingApp}</b> may <b>{action}</b> are listed. The classification ceiling and grants are enforced before anything is shown.
            </p>
          </div>
          <button type="button" onClick={onCancel} className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white" aria-label="Close Vault picker"><X className="h-4 w-4" /></button>
        </header>

        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
          <Search aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-slate-500" />
          <input
            ref={searchRef}
            value={query}
            maxLength={MAX_VAULT_PICKER_QUERY}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by name"
            aria-label="Filter Vault assets"
            className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-cyan-400/40"
          />
        </div>

        <ul role="listbox" aria-label="Available Vault assets" className="max-h-[52vh] flex-1 overflow-auto p-2">
          {!candidates.length && <li className="px-3 py-10 text-center text-[11px] text-slate-500">
            Nothing here is available to {requestingApp} for {action}.{listing.withheldCount > 0 ? ` ${listing.withheldCount} asset(s) exist but are withheld by the access policy.` : ''}
          </li>}
          {candidates.map((candidate, index) => {
            const isHighlighted = index === Math.min(highlighted, candidates.length - 1);
            return (
              <li key={candidate.fileId}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isHighlighted}
                  data-vault-picker-candidate={candidate.fileId}
                  onMouseEnter={() => setHighlighted(index)}
                  onClick={() => {
                    const resolved = resolveVaultPickerSelection(files, { app: requestingApp, action, grants }, candidate.fileId);
                    if (resolved.ok) onSelect(resolved.candidate);
                  }}
                  className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-xs ${isHighlighted ? 'bg-cyan-500/10 text-cyan-100' : 'text-slate-300 hover:bg-white/5'}`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate">{candidate.name}</span>
                    <span className="shrink-0 rounded bg-slate-800 px-1.5 py-0.5 text-[9px] text-slate-400">{candidate.kind}</span>
                    <span className="shrink-0 rounded bg-slate-800 px-1.5 py-0.5 text-[9px] text-slate-400">{candidate.classification}</span>
                    {candidate.granted && <span className="shrink-0 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] text-emerald-300" aria-label="Access granted by an explicit share">grant</span>}
                  </span>
                  <span className="shrink-0 text-[9px] text-slate-500">{fmt(candidate.sizeBytes)}</span>
                </button>
              </li>
            );
          })}
        </ul>

        <footer className="border-t border-white/10 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10px] text-slate-500">
              <ShieldCheck aria-hidden="true" className="mr-1 inline h-3 w-3 text-cyan-300" />
              {candidates.length} available
              {listing.withheldCount > 0 ? ` · ${listing.withheldCount} withheld by policy` : ''}
              {listing.truncated ? ` · list truncated at 500 entries` : ''}
              <span className="ml-2 text-slate-600">Enter selects · Esc closes</span>
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={onCancel} className="rounded-lg border border-white/15 px-3 py-2 text-xs text-slate-200 hover:bg-white/10">Cancel</button>
              <button type="button" disabled={!highlightedCandidate} onClick={confirm} className="rounded-lg bg-cyan-600 px-3 py-2 text-xs font-semibold text-white hover:bg-cyan-500 disabled:opacity-40">Select</button>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default VaultPickerModal;
