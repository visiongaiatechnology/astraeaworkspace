// STATUS: PLATIN — The link dialog (WR-035)
//
// ## Why this exists
//
// `Strg+K` used to call `window.prompt`, which Tauri/WebView2 blocks — the command was
// simply dead in the desktop window, and even where it worked it offered no way to open
// or remove an existing link. The plan asks for a comprehensible dialog with apply,
// open, remove and cancel.
//
// The dialog is deliberately the only place that turns typed text into a URL:
// `normalizeWriterLinkUrl` adds `https://` to a bare domain and refuses everything that
// is not an http(s) or mailto target, so a pasted `javascript:` can never become a link.
import React, { useEffect, useRef, useState } from 'react';
import { Link2, Trash2, ExternalLink, X } from 'lucide-react';

/**
 * Turns what the user typed into a link target, or `null` when it is not acceptable.
 *
 * A bare domain gets `https://`; anything with a foreign scheme is refused instead of
 * being silently prefixed (a `javascript:` target would otherwise become a link).
 */
export function normalizeWriterLinkUrl(raw: string): string | null {
  const value = raw.trim();
  if (value.length === 0) return null;
  if (/^(javascript|data|vbscript|file):/iu.test(value)) return null;
  if (/^(https?:\/\/|mailto:)/iu.test(value)) {
    try {
      // `mailto:` is checked by its shape; `http(s)` by the URL parser.
      if (/^mailto:/iu.test(value)) return /^mailto:[^@\s]+@[^@\s]+\.[^@\s]+$/iu.test(value) ? value : null;
      const parsed = new URL(value);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : null;
    } catch {
      return null;
    }
  }
  // No scheme: treat it as a domain and complete it.
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/u.test(value)) {
    try {
      const parsed = new URL(`https://${value}`);
      return parsed.toString();
    } catch {
      return null;
    }
  }
  return null;
}

export interface WriterLinkModalProps {
  readonly isOpen: boolean;
  /** The link currently under the caret, if any. */
  readonly currentUrl?: string | null;
  readonly onApply: (url: string) => void;
  readonly onRemove: () => void;
  readonly onOpen?: (url: string) => void;
  readonly onClose: () => void;
}

export const WriterLinkModal: React.FC<WriterLinkModalProps> = ({
  isOpen,
  currentUrl = null,
  onApply,
  onRemove,
  onOpen,
  onClose,
}) => {
  const [value, setValue] = useState(currentUrl ?? '');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setValue(currentUrl ?? '');
    setError(null);
    // The URL field is the whole point of the dialog: focus it and select what is there.
    queueMicrotask(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [currentUrl, isOpen]);

  if (!isOpen) return null;

  const submit = () => {
    const normalized = normalizeWriterLinkUrl(value);
    if (normalized === null) {
      setError('Bitte eine Webadresse angeben, z. B. example.com oder https://example.com.');
      return;
    }
    onApply(normalized);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/60 pt-[18vh]"
      data-writer-link-dialog="open"
      role="dialog"
      aria-modal="true"
      aria-label="Link einfügen"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="w-[min(480px,calc(100vw-32px))] rounded-xl border border-slate-700 bg-[#0c1220] p-4 text-xs text-slate-100 shadow-[0_24px_70px_rgba(0,0,0,0.9)] ring-1 ring-white/15"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            onClose();
          }
          if (event.key === 'Enter') {
            event.preventDefault();
            submit();
          }
        }}
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <Link2 className="h-4 w-4 text-sky-400" />
            <span>Link</span>
          </div>
          <button
            type="button"
            aria-label="Schließen"
            data-writer-link-action="cancel"
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <label className="mb-1 block font-mono text-[0.625rem] uppercase tracking-wider text-slate-400" htmlFor="writer-link-url">
          Ziel-Adresse
        </label>
        <input
          id="writer-link-url"
          ref={inputRef}
          type="text"
          value={value}
          inputMode="url"
          spellCheck={false}
          placeholder="https://example.com"
          data-writer-link-input="true"
          onChange={(event) => {
            setValue(event.target.value);
            setError(null);
          }}
          className="w-full rounded border border-white/15 bg-slate-950/80 px-2 py-1.5 text-xs text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70"
        />
        {error && (
          <p className="mt-2 text-[0.6875rem] text-rose-300" role="alert" data-writer-link-error="true">
            {error}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          {currentUrl && onOpen && (
            <button
              type="button"
              data-writer-link-action="open"
              onClick={() => {
                onOpen(currentUrl);
                onClose();
              }}
              className="mr-auto flex items-center gap-1 rounded border border-white/10 bg-slate-900/80 px-2 py-1 text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Link öffnen
            </button>
          )}
          {currentUrl && (
            <button
              type="button"
              data-writer-link-action="remove"
              onClick={() => {
                onRemove();
                onClose();
              }}
              className="flex items-center gap-1 rounded border border-rose-500/40 bg-rose-950/40 px-2 py-1 text-rose-200 hover:bg-rose-900/50 hover:text-white"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Link entfernen
            </button>
          )}
          <button
            type="button"
            data-writer-link-action="cancel"
            onClick={onClose}
            className="rounded border border-white/10 bg-slate-900/80 px-2 py-1 text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            Abbrechen
          </button>
          <button
            type="button"
            data-writer-link-action="apply"
            onClick={submit}
            className="rounded border border-blue-500/50 bg-blue-600/30 px-2 py-1 font-semibold text-blue-100 hover:bg-blue-600/50 hover:text-white"
          >
            Übernehmen
          </button>
        </div>
      </div>
    </div>
  );
};
