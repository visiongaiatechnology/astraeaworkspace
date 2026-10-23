// STATUS: DIAMANT VGT SUPREME — Protected Writer Form-Filling Surface
import React from 'react';
import { CheckSquare, Image as ImageIcon, ListPlus, Plus, Trash2 } from 'lucide-react';
import type { WriterContentControl, WriterImageBlockData } from '../../../shared/contracts/workspace';

interface WriterFormFillingPanelProps {
  controls: readonly WriterContentControl[];
  images: readonly WriterImageBlockData[];
  error?: string | null;
  onFill: (controlId: string, value: unknown) => boolean;
  onAddRepeatingItem: (controlId: string) => boolean;
  onUpdateRepeatingItem: (controlId: string, itemId: string, value: string) => boolean;
  onRemoveRepeatingItem: (controlId: string, itemId: string) => boolean;
}

function controlLabel(control: WriterContentControl): string {
  return `${control.title}${control.required ? ' *' : ''}`;
}

export const WriterFormFillingPanel: React.FC<WriterFormFillingPanelProps> = ({
  controls,
  images,
  error,
  onFill,
  onAddRepeatingItem,
  onUpdateRepeatingItem,
  onRemoveRepeatingItem,
}) => (
  <section
    className="border-b border-amber-400/20 bg-amber-500/[0.06] px-4 py-3"
    aria-label="Formularausfüllung"
  >
    <div className="mb-2 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <CheckSquare className="h-4 w-4 text-amber-300" />
        <div>
          <h3 className="text-xs font-bold text-amber-100">Formularausfüllung aktiv</h3>
          <p className="text-[0.625rem] text-amber-200/70">Dokumentinhalt ist gesperrt. Nur definierte Formularfelder können geändert werden.</p>
        </div>
      </div>
      <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-0.5 text-[0.625rem] font-mono text-amber-200">
        {controls.length} Felder
      </span>
    </div>

    {error && (
      <div className="mb-2 rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-[0.6875rem] text-rose-300" role="alert">
        {error}
      </div>
    )}

    {controls.length === 0 ? (
      <div className="rounded-xl border border-dashed border-amber-300/20 bg-slate-950/30 px-3 py-3 text-[0.6875rem] text-slate-400">
        Dieses Dokument enthält keine ausfüllbaren Content Controls.
      </div>
    ) : (
      <div className="grid max-h-52 grid-cols-1 gap-2 overflow-y-auto pr-1 md:grid-cols-2 xl:grid-cols-3">
        {controls.map((control) => {
          const disabled = Boolean(control.locked);
          return (
            <div key={control.id} className="rounded-xl border border-white/10 bg-slate-950/65 p-2.5">
              <label className="mb-1.5 block text-[0.625rem] font-semibold uppercase tracking-wide text-slate-400">
                {controlLabel(control)}
              </label>

              {control.type === 'text' && (
                <input
                  type="text"
                  value={control.value}
                  maxLength={control.maxLength}
                  placeholder={control.placeholder}
                  disabled={disabled}
                  onChange={(event) => onFill(control.id, event.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 focus:border-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
                />
              )}

              {control.type === 'checkbox' && (
                <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-200">
                  <input
                    type="checkbox"
                    checked={control.checked}
                    disabled={disabled}
                    onChange={(event) => onFill(control.id, event.target.checked)}
                    className="h-4 w-4 rounded accent-amber-500"
                  />
                  <span>{control.checked ? (control.checkedLabel ?? 'Ja') : (control.uncheckedLabel ?? 'Nein')}</span>
                </label>
              )}

              {control.type === 'dropdown' && (
                <select
                  value={control.value ?? ''}
                  disabled={disabled}
                  onChange={(event) => onFill(control.id, event.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 focus:border-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="">Bitte auswählen</option>
                  {control.options.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              )}

              {control.type === 'date' && (
                <input
                  type="date"
                  value={control.value ?? ''}
                  min={control.min}
                  max={control.max}
                  disabled={disabled}
                  onChange={(event) => onFill(control.id, event.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 focus:border-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
                />
              )}

              {control.type === 'picture' && (
                <div className="flex items-center gap-2">
                  <ImageIcon className="h-4 w-4 shrink-0 text-slate-500" />
                  <select
                    value={control.imageId ?? ''}
                    disabled={disabled}
                    onChange={(event) => onFill(control.id, event.target.value)}
                    className="min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 focus:border-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="">Kein Bild</option>
                    {images.map((image, index) => (
                      <option key={image.id} value={image.id}>{image.caption || image.altText || `Bild ${index + 1}`}</option>
                    ))}
                  </select>
                </div>
              )}

              {control.type === 'repeating_section' && (
                <div className="space-y-1.5">
                  {control.items.map((item, index) => (
                    <div key={item.id} className="flex items-center gap-1.5">
                      <span className="w-5 text-right text-[0.625rem] font-mono text-slate-600">{index + 1}</span>
                      <input
                        type="text"
                        value={item.value}
                        disabled={disabled}
                        onChange={(event) => onUpdateRepeatingItem(control.id, item.id, event.target.value)}
                        className="min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-900 px-2 py-1 text-xs text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 focus:border-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
                      />
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => onRemoveRepeatingItem(control.id, item.id)}
                        className="rounded p-1 text-slate-500 hover:bg-rose-500/10 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label={`Element ${index + 1} entfernen`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onAddRepeatingItem(control.id)}
                    className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[0.625rem] font-semibold text-slate-300 hover:border-amber-400/30 hover:text-amber-200 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {control.items.length === 0 ? <ListPlus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                    Element hinzufügen
                  </button>
                </div>
              )}

              {control.tag && <div className="mt-1.5 truncate text-[0.5625rem] font-mono text-slate-600">{control.tag}</div>}
            </div>
          );
        })}
      </div>
    )}
  </section>
);
