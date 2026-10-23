// STATUS: DIAMANT VGT SUPREME
// Astraea Grid authoritative Data Validation Modal

import React, { useId, useState } from 'react';
import { ShieldCheck, X, Trash2, AlertCircle } from 'lucide-react';
import { GridDataValidationRule, GridValidationKind } from '../../../shared/contracts/grid/workspaceGrid';
import { createGridSecureId } from '../security/gridWebCryptoIntegrity';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { GRID_DATA_VALIDATION_COPY, resolveGridDataValidationListOptions } from '../locale/gridDataValidationLocale';

interface GridDataValidationModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedRange: string;
  rules: GridDataValidationRule[];
  onUpdateRules: (rules: GridDataValidationRule[]) => void;
  onToggleCircleInvalid: () => void;
  isCirclingInvalid: boolean;
}

type TabKey = 'settings' | 'input-message' | 'error-alert';

export const GridDataValidationModal: React.FC<GridDataValidationModalProps> = ({
  isOpen,
  onClose,
  selectedRange,
  rules,
  onUpdateRules,
  onToggleCircleInvalid,
  isCirclingInvalid,
}) => {
  const { locale } = useWorkspaceLocale();
  const copy = GRID_DATA_VALIDATION_COPY[locale];
  const rangeInputId = useId();
  const kindSelectId = useId();
  const listOptionsId = useId();
  const listSourceId = useId();
  const formulaInputId = useId();
  const minimumInputId = useId();
  const maximumInputId = useId();
  const inputMessageId = useId();
  const errorMessageId = useId();
  const [activeTab, setActiveTab] = useState<TabKey>('settings');
  const [rangeInput, setRangeInput] = useState(selectedRange || 'A1');
  const [kind, setKind] = useState<GridValidationKind>('list');
  const [minVal, setMinVal] = useState('');
  const [maxVal, setMaxVal] = useState('');
  const [listOptionsOverride, setListOptionsOverride] = useState<string | null>(null);
  const listOptions = resolveGridDataValidationListOptions(copy.listOptionsInitial, listOptionsOverride);
  const [listSource, setListSource] = useState('');
  const [customFormula, setCustomFormula] = useState('=A1<>""');
  const [allowBlank, setAllowBlank] = useState(true);
  const [inputMessage, setInputMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  if (!isOpen) return null;

  const handleAddRule = () => {
    const newRule: GridDataValidationRule = {
      id: createGridSecureId('validation'),
      range: rangeInput.trim().toUpperCase(),
      kind,
      allowBlank,
      min: minVal !== '' ? Number(minVal) : undefined,
      max: maxVal !== '' ? Number(maxVal) : undefined,
      options: kind === 'list' && !listSource.trim() ? listOptions.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
      listSource: kind === 'list' && listSource.trim() ? listSource.trim() : undefined,
      formula: kind === 'custom' ? customFormula.trim() : undefined,
      inputMessage: inputMessage.trim() || undefined,
      errorMessage: errorMessage.trim() || undefined,
    };

    onUpdateRules([...rules, newRule]);
    onClose();
  };

  const handleDeleteRule = (id: string) => {
    onUpdateRules(rules.filter((r) => r.id !== id));
  };

  const handleClearAll = () => {
    onUpdateRules([]);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-white/10 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden text-slate-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-slate-950/60">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-blue-400" />
            <h3 className="text-sm font-semibold text-white tracking-wide">{copy.title}</h3>
          </div>
          <button aria-label={copy.closeDialog}
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/10 bg-slate-950/30 px-5 pt-2">
          {[
            { id: 'settings', label: copy.tabs.settings },
            { id: 'input-message', label: copy.tabs['input-message'] },
            { id: 'error-alert', label: copy.tabs['error-alert'] },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as TabKey)}
              className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-300'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-5 space-y-4 text-xs">
          {/* Range input */}
          <div className="flex items-center gap-3">
            <label htmlFor={rangeInputId} className="text-slate-400 font-medium">{copy.range}</label>
            <input
              id={rangeInputId}
              type="text"
              value={rangeInput}
              onChange={(e) => setRangeInput(e.target.value.toUpperCase())}
              placeholder={copy.rangePlaceholder}
              className="px-3 py-1.5 bg-slate-950 border border-white/10 rounded font-mono text-white text-xs w-36"
            />
          </div>

          {activeTab === 'settings' && (
            <div className="space-y-3.5">
              <div>
                <label htmlFor={kindSelectId} className="block text-slate-400 mb-1 font-medium">{copy.allowKind}</label>
                <select
                  id={kindSelectId}
                  value={kind}
                  onChange={(e) => setKind(e.target.value as GridValidationKind)}
                  className="w-full px-3 py-2 bg-slate-950 border border-white/10 rounded text-white text-xs"
                >
                  {(['list', 'whole-number', 'number', 'decimal', 'date', 'time', 'text-length', 'custom'] as const).map((entry) => (
                    <option key={entry} value={entry}>{copy.kinds[entry]}</option>
                  ))}
                </select>
              </div>

              {kind === 'list' && (
                <div className="space-y-2">
                  <div>
                    <label htmlFor={listOptionsId} className="block text-slate-400 mb-1 font-medium">{copy.listOptions}</label>
                    <input id={listOptionsId} type="text" value={listOptions} disabled={!!listSource.trim()} onChange={(e) => setListOptionsOverride(e.target.value)} placeholder={copy.listOptionsPlaceholder} className="w-full px-3 py-2 bg-slate-950 border border-white/10 rounded text-white text-xs disabled:opacity-40"/>
                  </div>
                  <div>
                    <label htmlFor={listSourceId} className="block text-slate-400 mb-1 font-medium">{copy.dynamicSource}</label>
                    <input id={listSourceId} type="text" value={listSource} onChange={(e) => setListSource(e.target.value)} placeholder={copy.dynamicSourcePlaceholder} className="w-full px-3 py-2 bg-slate-950 border border-white/10 rounded text-white text-xs font-mono"/>
                  </div>
                  <p className="text-[0.6875rem] text-slate-500">{copy.dynamicSourceHelp}</p>
                </div>
              )}

              {kind === 'custom' && (
                <div>
                  <label htmlFor={formulaInputId} className="block text-slate-400 mb-1 font-medium">{copy.formula}</label>
                  <input id={formulaInputId} type="text" value={customFormula} onChange={(e) => setCustomFormula(e.target.value)} placeholder={copy.formulaPlaceholder} className="w-full px-3 py-2 bg-slate-950 border border-white/10 rounded text-white text-xs font-mono"/>
                  <p className="text-[0.6875rem] text-slate-500 mt-1">{copy.formulaHelp}</p>
                </div>
              )}

              {kind === 'time' && <div className="text-[0.6875rem] text-slate-500">{copy.timeFormatHelp}</div>}

              {(kind === 'number' || kind === 'whole-number' || kind === 'decimal' || kind === 'text-length') && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor={minimumInputId} className="block text-slate-400 mb-1 font-medium">{copy.minimum}</label>
                    <input
                      id={minimumInputId}
                      type="number"
                      value={minVal}
                      onChange={(e) => setMinVal(e.target.value)}
                      placeholder="0"
                      className="w-full px-3 py-2 bg-slate-950 border border-white/10 rounded text-white text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label htmlFor={maximumInputId} className="block text-slate-400 mb-1 font-medium">{copy.maximum}</label>
                    <input
                      id={maximumInputId}
                      type="number"
                      value={maxVal}
                      onChange={(e) => setMaxVal(e.target.value)}
                      placeholder="100"
                      className="w-full px-3 py-2 bg-slate-950 border border-white/10 rounded text-white text-xs font-mono"
                    />
                  </div>
                </div>
              )}

              <label className="flex items-center gap-2 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={allowBlank}
                  onChange={(e) => setAllowBlank(e.target.checked)}
                  className="rounded text-blue-600 bg-slate-800 border-white/20"
                />
                <span className="text-slate-300">{copy.allowBlank}</span>
              </label>
            </div>
          )}

          {activeTab === 'input-message' && (
            <div className="space-y-3">
              <p className="text-slate-400">{copy.inputMessageHelp}</p>
              <div>
                <label htmlFor={inputMessageId} className="block text-slate-400 mb-1 font-medium">{copy.inputMessage}</label>
                <textarea
                  id={inputMessageId}
                  rows={3}
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  placeholder={copy.inputMessagePlaceholder}
                  className="w-full px-3 py-2 bg-slate-950 border border-white/10 rounded text-white text-xs"
                />
              </div>
            </div>
          )}

          {activeTab === 'error-alert' && (
            <div className="space-y-3">
              <p className="text-slate-400">
                {copy.errorMessageHelp}
              </p>
              <div>
                <label htmlFor={errorMessageId} className="block text-slate-400 mb-1 font-medium">{copy.errorMessage}</label>
                <textarea
                  id={errorMessageId}
                  rows={3}
                  value={errorMessage}
                  onChange={(e) => setErrorMessage(e.target.value)}
                  placeholder={copy.errorMessagePlaceholder}
                  className="w-full px-3 py-2 bg-slate-950 border border-white/10 rounded text-white text-xs"
                />
              </div>
            </div>
          )}

          {/* Existing rules preview */}
          {rules.length > 0 && (
            <div className="border-t border-white/10 pt-3">
              <span className="text-[0.6875rem] font-semibold text-slate-400">{copy.activeRules(rules.length)}</span>
              <div className="max-h-24 overflow-y-auto space-y-1 mt-1.5 pr-1">
                {rules.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between px-2.5 py-1.5 bg-slate-950/60 rounded border border-white/5"
                  >
                    <div>
                      <span className="font-mono text-blue-400 font-semibold">{r.range}</span>
                      <span className="text-slate-400 ml-2">({copy.kinds[r.kind]})</span>
                      {r.options && <span className="text-slate-500 ml-1">[{r.options.join(', ')}]</span>}
                      {r.listSource && <span className="text-slate-500 ml-1 font-mono">{r.listSource}</span>}
                    </div>
                    <button aria-label={copy.deleteRule(r.range)}
                      type="button"
                      onClick={() => handleDeleteRule(r.id)}
                      className="text-red-400 hover:text-red-300 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-white/10 bg-slate-950/40">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleCircleInvalid}
              className={`flex items-center gap-1 px-3 py-1.5 rounded border text-xs transition-colors ${
                isCirclingInvalid
                  ? 'bg-red-500/20 text-red-300 border-red-500/40'
                  : 'border-white/10 hover:bg-white/5 text-slate-300'
              }`}
            >
              <AlertCircle className="w-3.5 h-3.5 text-red-400" />
              <span>{isCirclingInvalid ? copy.hideInvalidCircles : copy.circleInvalid}</span>
            </button>

            {rules.length > 0 && (
              <button
                type="button"
                onClick={handleClearAll}
                className="px-2.5 py-1.5 rounded text-xs text-slate-400 hover:text-red-300 transition-colors"
              >
                {copy.clearAll}
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 text-slate-400 hover:text-white transition-colors"
            >
              {copy.cancel}
            </button>
            <button
              type="button"
              onClick={handleAddRule}
              className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors shadow-lg shadow-blue-600/20"
            >
              {copy.applyRule}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
