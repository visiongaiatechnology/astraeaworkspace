// STATUS: DIAMANT VGT SUPREME
import React, { useRef, useState } from 'react';
import type {
  Paragraph,
  WriterParagraphStyleName,
  WriterStyleCatalog,
  WriterStyleDefinition,
  WriterStyleSet,
  WriterTableBlockData,
} from '../../../../shared/contracts/workspace';
import { X, Eye, CheckCircle, AlertCircle, RefreshCw, Undo, Download, Save, Upload } from 'lucide-react';
import { deliverExportText } from '../../../../shared/interchange/exportDelivery';
import { writerExportDeliveryText, writerExportFailureText } from '../../interchange/export/writerExportStatus';
import {
  inferWriterStyleName,
  writerDirectFormattingDeltas,
  writerStyleForParagraph,
  writerStylePatchFromParagraph,
  writerStyleRelationshipWouldCycle,
} from './writerStyles';
import {
  parseWriterStyleSetJson,
  serializeWriterStyleSet,
  writerStyleSetFileName,
  WriterStyleSetValidationError,
  WRITER_STYLE_SET_MAX_BYTES,
} from './writerStyleSets';
import type { WriterRangeFormatState } from '../range/writerRangeFormatState';

export interface WriterStyleInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  paragraph?: Paragraph;
  catalog: WriterStyleCatalog;
  activeTable?: WriterTableBlockData;
  onApplyStyle: (name: WriterParagraphStyleName) => void;
  onApplyCharacterStyle: (id: string) => void;
  onApplyListStyle: (id: string) => void;
  onApplyLinkedStyle: (id: string) => void;
  onApplyTableStyle: (tableId: string, styleId: string) => void;
  onUpdateStyle: (name: WriterParagraphStyleName, patch: Partial<Omit<WriterStyleDefinition, 'name' | 'label'>>) => void;
  onClearDirectFormatting: () => void;
  styleSets: WriterStyleSet[];
  onSaveStyleSet: (name: string) => void;
  onImportStyleSet: (styleSet: WriterStyleSet) => void;
  onApplyStyleSet: (id: string) => void;
  /** What the marked range carries; a template is only active for the whole range (W-117). */
  rangeFormat?: WriterRangeFormatState;
}

export const WriterStyleInspectorModal: React.FC<WriterStyleInspectorModalProps> = ({
  isOpen,
  onClose,
  paragraph,
  catalog,
  activeTable,
  onApplyStyle,
  onApplyCharacterStyle,
  onApplyListStyle,
  onApplyLinkedStyle,
  onApplyTableStyle,
  onUpdateStyle,
  onClearDirectFormatting,
  styleSets,
  onSaveStyleSet,
  onImportStyleSet,
  onApplyStyleSet,
  rangeFormat,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [styleSetName, setStyleSetName] = useState('');
  const [styleSetMessage, setStyleSetMessage] = useState<string | null>(null);

  if (!isOpen || !paragraph) return null;

  const styles = catalog.paragraphStyles;

  const currentStyleName = inferWriterStyleName(paragraph);
  const activeStyleDef = writerStyleForParagraph(paragraph, styles);

  const deltas = writerDirectFormattingDeltas(paragraph, styles);

  const handleUpdateStyleFromSelection = () => {
    onUpdateStyle(currentStyleName, writerStylePatchFromParagraph(paragraph, activeStyleDef));
  };

  const handleSaveStyleSet = () => {
    try {
      onSaveStyleSet(styleSetName);
      setStyleSetName('');
      setStyleSetMessage('Style-Set wurde im Dokument gespeichert.');
    } catch (error) {
      setStyleSetMessage(error instanceof WriterStyleSetValidationError ? error.message : 'Style-Set konnte nicht gespeichert werden.');
    }
  };

  const handleImportStyleSet = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      if (file.size > WRITER_STYLE_SET_MAX_BYTES) {
        throw new WriterStyleSetValidationError('Style-Set-Datei überschreitet 1 MiB.');
      }
      const styleSet = parseWriterStyleSetJson(await file.text());
      onImportStyleSet(styleSet);
      setStyleSetMessage(`Style-Set „${styleSet.name}“ wurde importiert.`);
    } catch (error) {
      setStyleSetMessage(error instanceof WriterStyleSetValidationError ? error.message : 'Style-Set konnte nicht importiert werden.');
    }
  };

  const handleExportStyleSet = async (styleSet: WriterStyleSet) => {
    try {
      const delivery = await deliverExportText(serializeWriterStyleSet(styleSet), {
        suggestedName: writerStyleSetFileName(styleSet),
        extensions: ['json'],
        mimeType: 'application/json;charset=utf-8',
      });
      setStyleSetMessage(`Style-Set „${styleSet.name}“: ${writerExportDeliveryText(delivery)}`);
    } catch (error) {
      setStyleSetMessage(error instanceof WriterStyleSetValidationError ? error.message : writerExportFailureText(error));
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-white/15 rounded-2xl max-w-3xl w-full p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150 select-none">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-white/10">
          <div className="flex items-center space-x-2 text-purple-400">
            <Eye className="w-4 h-4" />
            <h3 className="text-sm font-bold text-slate-100">Formatinspektor (Style Inspector)</h3>
          </div>
          <button aria-label="Close Formatinspektor (Style Inspector) dialog" type="button" onClick={onClose} className="p-1 rounded text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="space-y-3.5 text-xs text-slate-300 max-h-[440px] overflow-y-auto pr-1">
          {/* Paragraph Style Hierarchy */}
          <div className="p-3 bg-slate-950/70 rounded-xl border border-white/5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[0.625rem] font-bold uppercase tracking-wider text-slate-400">
                Absatz-Formatvorlage
              </span>
              <span className="px-2 py-0.5 rounded-full text-[0.625rem] font-mono font-medium bg-blue-500/20 text-blue-300 border border-blue-500/30">
                {activeStyleDef.label} ({activeStyleDef.name})
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[0.6875rem] text-slate-400 pt-1">
              <div>Schriftgröße: <span className="text-slate-200">{activeStyleDef.fontSizePt} pt</span></div>
              <div>Zeilenabstand: <span className="text-slate-200">{activeStyleDef.lineHeight}</span></div>
            </div>
            <div className="grid gap-2 pt-1 md:grid-cols-2">
              <label className="space-y-1 text-[0.625rem] font-semibold uppercase tracking-wide text-slate-500">
                <span>Basiert auf</span>
                <select
                  aria-label="Basisformatvorlage"
                  value={activeStyleDef.basedOn ?? ''}
                  disabled={currentStyleName === 'normal'}
                  onChange={(event) => onUpdateStyle(currentStyleName, {
                    basedOn: event.target.value || undefined,
                  })}
                  className="w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-xs normal-case tracking-normal text-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus:border-purple-400 disabled:opacity-40"
                >
                  <option value="">Keine</option>
                  {styles.map((style) => (
                    <option
                      key={style.name}
                      value={style.name}
                      disabled={writerStyleRelationshipWouldCycle(styles, currentStyleName, style.name)}
                    >
                      {style.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-[0.625rem] font-semibold uppercase tracking-wide text-slate-500">
                <span>Folgeabsatz</span>
                <select
                  aria-label="Formatvorlage für Folgeabsatz"
                  value={activeStyleDef.nextStyle ?? 'normal'}
                  onChange={(event) => onUpdateStyle(currentStyleName, {
                    nextStyle: event.target.value as WriterParagraphStyleName,
                  })}
                  className="w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-xs normal-case tracking-normal text-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus:border-purple-400"
                >
                  {styles.map((style) => <option key={style.name} value={style.name}>{style.label}</option>)}
                </select>
              </label>
            </div>
            <label className="flex items-start gap-2 rounded-lg border border-white/5 bg-black/20 p-2 text-[0.6875rem] text-slate-300">
              <input
                type="checkbox"
                aria-label="Formatvorlage automatisch aktualisieren"
                checked={Boolean(activeStyleDef.autoUpdate)}
                onChange={(event) => onUpdateStyle(currentStyleName, { autoUpdate: event.target.checked })}
                className="mt-0.5"
              />
              <span>
                <strong className="block text-slate-200">Automatisch aktualisieren</strong>
                Direkte Absatzformatierungen aktualisieren diese Vorlage und damit alle darauf basierenden Absätze.
              </span>
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <StyleGroup
              title="Zeichenformatvorlagen"
              activeId={paragraph.spans.find((span) => span.character_style_id)?.character_style_id}
              styles={catalog.characterStyles}
              onApply={onApplyCharacterStyle}
            />
            <StyleGroup
              title="Listenformatvorlagen"
              activeId={rangeFormat ? rangeFormat.listStyleId.value : paragraph.style.list_style_id}
              mixed={rangeFormat?.listStyleId.mixed ?? false}
              styles={catalog.listStyles}
              onApply={onApplyListStyle}
            />
            <StyleGroup
              title="Verknüpfte Formatvorlagen"
              activeId={paragraph.style.linked_style_id}
              styles={catalog.linkedStyles}
              onApply={onApplyLinkedStyle}
            />
            <StyleGroup
              title={activeTable ? 'Tabellenformatvorlagen' : 'Tabellenformatvorlagen · keine Tabelle am Absatz'}
              activeId={activeTable?.styleId}
              styles={catalog.tableStyles}
              disabled={!activeTable}
              onApply={(styleId) => activeTable && onApplyTableStyle(activeTable.id, styleId)}
            />
          </div>

          <section className="rounded-xl border border-white/5 bg-slate-950/70 p-3 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[0.625rem] font-bold uppercase tracking-wider text-slate-400">Eigene Style-Sets</span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 rounded-lg border border-sky-500/30 px-2.5 py-1 text-[0.6875rem] font-medium text-sky-300 transition-colors hover:bg-sky-500/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
              >
                <Upload className="h-3.5 w-3.5" /> Importieren
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.vgtstyles.json,application/json"
                className="hidden"
                onChange={handleImportStyleSet}
              />
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                aria-label="Name des neuen Style-Sets"
                maxLength={80}
                value={styleSetName}
                onChange={(event) => {
                  setStyleSetName(event.target.value);
                  setStyleSetMessage(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') handleSaveStyleSet();
                }}
                placeholder="z. B. VGT Geschäftsbericht"
                className="min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 placeholder:text-slate-600 focus:border-purple-400"
              />
              <button
                type="button"
                disabled={!styleSetName.trim()}
                onClick={handleSaveStyleSet}
                className="flex items-center gap-1.5 rounded-lg border border-purple-500/40 bg-purple-600/25 px-2.5 py-1.5 text-[0.6875rem] font-medium text-purple-200 transition-colors hover:bg-purple-600/45 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 disabled:cursor-not-allowed disabled:opacity-35"
              >
                <Save className="h-3.5 w-3.5" /> Speichern
              </button>
            </div>

            {styleSetMessage && (
              <p role="status" className="rounded-lg border border-white/5 bg-black/20 px-2.5 py-1.5 text-[0.6875rem] text-slate-300">
                {styleSetMessage}
              </p>
            )}

            {styleSets.length === 0 ? (
              <p className="text-[0.6875rem] italic text-slate-500">Noch keine eigenen Style-Sets im Dokument.</p>
            ) : (
              <div className="space-y-1.5">
                {styleSets.map((styleSet) => (
                  <div key={styleSet.id} className="flex items-center gap-2 rounded-lg border border-white/5 bg-slate-900/80 px-2.5 py-2">
                    <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-200">{styleSet.name}</span>
                    <button
                      type="button"
                      onClick={() => onApplyStyleSet(styleSet.id)}
                      className="rounded-md border border-emerald-500/30 px-2 py-1 text-[0.625rem] font-semibold text-emerald-300 hover:bg-emerald-500/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                    >
                      Anwenden
                    </button>
                    <button
                      type="button"
                      aria-label={`${styleSet.name} exportieren`}
                      title="Style-Set als JSON exportieren"
                      onClick={() => handleExportStyleSet(styleSet)}
                      className="rounded-md border border-white/10 p-1.5 text-slate-400 hover:border-sky-500/30 hover:text-sky-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Quick Style Switcher */}
          <div className="p-3 bg-slate-950/70 rounded-xl border border-white/5 space-y-2">
            <span className="text-[0.625rem] font-bold uppercase tracking-wider text-slate-400 block">
              Formatvorlage zuweisen
            </span>
            <div className="flex flex-wrap gap-1.5">
              {styles.map((s) => (
                <button
                  key={s.name}
                  type="button"
                  onClick={() => onApplyStyle(s.name)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                    currentStyleName === s.name
                      ? 'bg-purple-600 text-white shadow-sm'
                      : 'bg-slate-900 border border-white/10 text-slate-300 hover:text-white hover:border-white/20'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Direct Formatting Deltas */}
          <div className="p-3 bg-slate-950/70 rounded-xl border border-white/5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[0.625rem] font-bold uppercase tracking-wider text-slate-400">
                Direkte Formatierungsabweichungen (Deltas)
              </span>
              {deltas.length === 0 ? (
                <span className="text-[0.625rem] text-emerald-400 flex items-center gap-1 font-medium">
                  <CheckCircle className="w-3 h-3" /> Konform zur Vorlage
                </span>
              ) : (
                <span className="text-[0.625rem] text-amber-400 flex items-center gap-1 font-medium">
                  <AlertCircle className="w-3 h-3" /> {deltas.length} Abweichung(en)
                </span>
              )}
            </div>

            {deltas.length === 0 ? (
              <p className="text-[0.6875rem] text-slate-400 italic py-1">
                Dieser Absatz verwendet exakt die Vorgaben der Formatvorlage „{activeStyleDef.label}“. Es liegen keine manuellen Formatübersteuerungen vor.
              </p>
            ) : (
              <div className="space-y-1.5 pt-1">
                {deltas.map((d, i) => (
                  <div
                    key={i}
                    className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[0.6875rem] flex items-center justify-between"
                  >
                    <div>
                      <span className="font-semibold text-amber-300">{d.label}: </span>
                      <span className="text-slate-200">{d.current}</span>
                    </div>
                    <span className="text-[0.625rem] text-slate-400">Vorlage: {d.base}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-3 border-t border-white/10">
          <button
            type="button"
            onClick={() => {
              onClearDirectFormatting();
              onClose();
            }}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-rose-300 hover:text-white hover:bg-rose-500/20 border border-rose-500/30 flex items-center space-x-1.5 transition-all"
            title="Entfernt alle manuellen Zeichen- und Absatzübersteuerungen"
          >
            <Undo className="w-3.5 h-3.5" />
            <span>Formatierung löschen</span>
          </button>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleUpdateStyleFromSelection}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-purple-200 hover:text-white bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/40 flex items-center space-x-1.5 transition-all"
              title="Aktualisiert die Formatvorlage mit den aktuellen Einstellungen des Absatzes"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Vorlage aktualisieren</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-md transition-all"
            >
              Schließen
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface StyleGroupProps {
  title: string;
  activeId?: string;
  /** True when the marked range does not agree on a single template (W-117). */
  mixed?: boolean;
  styles: ReadonlyArray<{ id: string; label: string }>;
  disabled?: boolean;
  onApply: (id: string) => void;
}

const StyleGroup: React.FC<StyleGroupProps> = ({ title, activeId, mixed = false, styles, disabled = false, onApply }) => (
  <section
    className="rounded-xl border border-white/5 bg-slate-950/70 p-3 space-y-2"
    data-writer-style-group-mixed={mixed ? 'true' : 'false'}
  >
    <span className="block text-[0.625rem] font-bold uppercase tracking-wider text-slate-400">{title}</span>
    {mixed && (
      <span className="block text-[0.625rem] text-amber-300">
        Mehrere Werte in der markierten Auswahl – keine der Vorlagen gilt für alle Absätze.
      </span>
    )}
    <div className="flex flex-wrap gap-1.5">
      {styles.map((style) => (
        <button
          key={style.id}
          type="button"
          disabled={disabled}
          onClick={() => onApply(style.id)}
          aria-pressed={!mixed && activeId === style.id}
          className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-all disabled:cursor-not-allowed disabled:opacity-35 ${
            !mixed && activeId === style.id
              ? 'border-purple-400/60 bg-purple-600 text-white'
              : 'border-white/10 bg-slate-900 text-slate-300 hover:border-white/20 hover:text-white'
          }`}
        >
          {style.label}
        </button>
      ))}
    </div>
  </section>
);
