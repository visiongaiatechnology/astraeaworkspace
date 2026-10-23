import { secureRandomId } from '../../../shared/crypto/secureRandom';
// STATUS: DIAMANT VGT SUPREME
// Canonical AcroForm field manager. No demo fields, fake success timers or silent network submission.

import React, { useMemo, useState } from 'react';
import { CheckSquare, X, RotateCcw, Plus, Trash2, Download, Upload, Layers, ShieldCheck, Send } from 'lucide-react';
import type { NetworkCapability, PdfDocumentModel, PdfFormField, PdfFormFieldType, PdfFormFieldValue } from '../../../shared/contracts/workspace';
import { evaluateNetGatePolicy } from '../../../platform/operations/appContainerOps';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { pdfWorkflowText, type PdfWorkflowCopyKey } from '../locale/pdfWorkflowDialogsLocale';
import { deliverExportText } from '../../../shared/interchange/exportDelivery';
import { pdfExportDeliveryText, pdfExportFailureText } from '../interchange/pdfExportStatus';
import {
  deletePdfFormField,
  exportPdfFormData,
  importPdfFormData,
  normalizePdfFormFields,
  preparePdfFormSubmit,
  setPdfFormFieldValue,
  upsertPdfFormField,
  validatePdfForm,
  type PdfFormValidationIssue,
} from './model/pdfAcroFormModel';
import { requestPdfFormFlatten, requestPdfFormReset } from './model/pdfFormDestructiveGuard';

interface PdfFormFillerModalProps {
  isOpen: boolean;
  pdfData: PdfDocumentModel;
  onClose: () => void;
  onUpdatePdfData: (updated: PdfDocumentModel) => void;
  networkCapability?: NetworkCapability;
  sovereignTransport?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

const newField = (page: number, label: string): PdfFormField => ({
  id: secureRandomId('form'),
  name: `field_${Date.now()}`,
  type: 'text',
  page,
  bounds: { x: 54, y: 640, width: 220, height: 24 },
  label,
  tooltip: '',
  value: '',
  defaultValue: '',
  required: false,
  readOnly: false,
  tabOrder: 0,
});

/** Release Beta 0.1: native save on the desktop; the browser fallback stays a download. */
const deliverFormData = (text: string) => deliverExportText(text, {
  suggestedName: 'astraea-form-data.json',
  extensions: ['json'],
  mimeType: 'application/json;charset=utf-8',
});

const valueAsText = (value: PdfFormFieldValue): string => Array.isArray(value) ? value.join('\n') : typeof value === 'boolean' ? String(value) : value;

const FIELD_TYPE_COPY_KEYS = {
  text: 'form.type.text', checkbox: 'form.type.checkbox', radio: 'form.type.radio', dropdown: 'form.type.dropdown',
  list: 'form.type.list', button: 'form.type.button', signature: 'form.type.signature',
} as const satisfies Record<PdfFormFieldType, PdfWorkflowCopyKey>;

const ISSUE_COPY_KEYS = {
  required: 'form.issue.required', pattern: 'form.issue.pattern', 'min-length': 'form.issue.minLength',
  'max-length': 'form.issue.maxLength', 'invalid-option': 'form.issue.invalidOption', 'invalid-type': 'form.issue.invalidType',
  'calculation-cycle': 'form.issue.calculationCycle',
} as const satisfies Record<PdfFormValidationIssue['code'], PdfWorkflowCopyKey>;

const CALCULATION_COPY_KEYS = {
  sum: 'form.calculation.sum', average: 'form.calculation.average', concat: 'form.calculation.concat',
} as const satisfies Record<'sum' | 'average' | 'concat', PdfWorkflowCopyKey>;

const BOUNDS_COPY_KEYS = {
  x: 'form.bounds.x', y: 'form.bounds.y', width: 'form.bounds.width', height: 'form.bounds.height',
} as const satisfies Record<keyof PdfFormField['bounds'], PdfWorkflowCopyKey>;

export const PdfFormFillerModal: React.FC<PdfFormFillerModalProps> = ({
  isOpen,
  pdfData,
  onClose,
  onUpdatePdfData,
  networkCapability,
  sovereignTransport,
}) => {
  const { locale } = useWorkspaceLocale();
  const fields = useMemo(() => normalizePdfFormFields(pdfData), [pdfData]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [importText, setImportText] = useState('');
  const [status, setStatus] = useState('');
  const selected = fields.find((field) => field.id === selectedId) ?? fields[0];
  const issues = useMemo(() => validatePdfForm(pdfData), [pdfData]);

  if (!isOpen) return null;

  const persist = (updated: PdfDocumentModel, message: string) => {
    onUpdatePdfData(updated);
    setStatus(message);
  };

  const updateDefinition = (patch: Partial<PdfFormField>) => {
    if (!selected) return;
    try { persist(upsertPdfFormField(pdfData, { ...selected, ...patch }), pdfWorkflowText(locale, 'form.status.savedDefinition')); }
    catch { setStatus(pdfWorkflowText(locale, 'form.error.operation')); }
  };

  const updateValue = (value: PdfFormFieldValue) => {
    if (!selected) return;
    try { persist(setPdfFormFieldValue(pdfData, selected.id, value), pdfWorkflowText(locale, 'form.status.savedValue')); }
    catch { setStatus(pdfWorkflowText(locale, 'form.error.operation')); }
  };

  const addField = () => {
    try {
      const field = newField(1, pdfWorkflowText(locale, 'form.newField'));
      persist(upsertPdfFormField(pdfData, field), pdfWorkflowText(locale, 'form.status.created'));
      setSelectedId(field.id);
    } catch { setStatus(pdfWorkflowText(locale, 'form.error.operation')); }
  };

  /** Export the canonical form data. Success wording depends on the confirmed delivery mode. */
  const exportFormData = async () => {
    try {
      const delivery = await deliverFormData(exportPdfFormData(pdfData));
      setStatus(`${pdfWorkflowText(locale, 'form.status.exported')} ${pdfExportDeliveryText(locale, delivery)}`);
    } catch (error) {
      setStatus(pdfExportFailureText(locale, error));
    }
  };

  const removeField = () => {
    if (!selected) return;
    persist(deletePdfFormField(pdfData, selected.id), pdfWorkflowText(locale, 'form.status.deleted'));
    setSelectedId('');
  };

  /**
   * AST-0844 — the two irreversible form actions ask first.
   *
   * `flattenPdfForm` turns every interactive field into page content and drops the field structure;
   * `resetPdfForm` discards the entered values. Both effects survive the save that `persist` performs
   * immediately, while the undo stack lives in memory only. This surface therefore holds **no** reference to
   * either raw action: it can only reach them through `requestPdfFormFlatten` / `requestPdfFormReset`, which
   * ask the localized question first and hand back the untouched model when the answer is not an explicit yes.
   *
   * Every path of both controls is visible in the status line — question, refusal, empty case and outcome — so
   * none of them is silent. The two gates are pure, but the status wording and the question come from the
   * message catalog; the number reported after the action is the same `affectedFields` the question named.
   */
  const requestFlatten = () => {
    try {
      const decision = requestPdfFormFlatten({
        model: pdfData,
        messageFor: (fields) => pdfWorkflowText(locale, 'form.flatten.confirm', { fields }),
        confirm: (message) => window.confirm(message),
      });
      if (decision.outcome === 'declined') { setStatus(pdfWorkflowText(locale, 'form.status.flattenCancelled')); return; }
      if (decision.outcome === 'nothing-to-do') { setStatus(pdfWorkflowText(locale, 'form.status.nothingToFlatten')); return; }
      persist(decision.model, pdfWorkflowText(locale, 'form.status.flattened', { fields: decision.affectedFields }));
    } catch { setStatus(pdfWorkflowText(locale, 'form.status.flattenFailed')); }
  };

  const requestReset = () => {
    try {
      const decision = requestPdfFormReset({
        model: pdfData,
        messageFor: (fields) => pdfWorkflowText(locale, 'form.reset.confirm', { fields }),
        confirm: (message) => window.confirm(message),
      });
      if (decision.outcome === 'declined') { setStatus(pdfWorkflowText(locale, 'form.status.resetCancelled')); return; }
      if (decision.outcome === 'nothing-to-do') { setStatus(pdfWorkflowText(locale, 'form.status.nothingToReset')); return; }
      persist(decision.model, pdfWorkflowText(locale, 'form.status.reset', { fields: decision.affectedFields }));
    } catch { setStatus(pdfWorkflowText(locale, 'form.status.resetFailed')); }
  };

  const handleSubmit = async () => {
    if (!selected?.submitUrl) { setStatus(pdfWorkflowText(locale, 'form.error.endpoint')); return; }
    if (!networkCapability) { setStatus(pdfWorkflowText(locale, 'form.error.capability')); return; }
    try {
      const envelope = preparePdfFormSubmit(pdfData, selected.submitUrl);
      if (!window.confirm(pdfWorkflowText(locale, 'form.submit.confirm', { host: envelope.targetHost }))) return;
      const { entry } = await evaluateNetGatePolicy(envelope.targetHost, networkCapability, 'STANDARD', {
        componentId: 'pdf-studio-form-submit', purpose: 'Submit explicitly approved PDF form data', method: 'POST',
        expectedRequestBytes: new TextEncoder().encode(envelope.body).byteLength, expectedResponseBytes: 64 * 1024, timeoutMs: 10_000,
      });
      if (entry.verdict !== 'Allowed') { setStatus(pdfWorkflowText(locale, 'form.error.denied')); return; }
      if (!sovereignTransport) { setStatus(pdfWorkflowText(locale, 'form.error.submit')); return; }
      const response = await sovereignTransport(envelope.targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': envelope.contentType },
        body: envelope.body,
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        redirect: 'error',
      });
      if (!response.ok) { setStatus(pdfWorkflowText(locale, 'form.error.submit')); return; }
      setStatus(pdfWorkflowText(locale, 'form.status.submitted', { host: envelope.targetHost }));
    } catch { setStatus(pdfWorkflowText(locale, 'form.error.submit')); }
  };

  const typeOptions: PdfFormFieldType[] = ['text', 'checkbox', 'radio', 'dropdown', 'list', 'button', 'signature'];
  const optionText = selected?.options?.join('\n') ?? '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 select-none" role="dialog" aria-modal="true" aria-labelledby="pdf-form-title">
      <div className="vgt-dialog-scroll-surface bg-slate-900 border border-white/15 rounded-xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col text-xs max-h-[88vh]">
        <div className="px-4 py-3 bg-slate-950 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2"><CheckSquare className="w-4 h-4 text-cyan-400"/><span id="pdf-form-title" className="font-bold text-slate-100 text-sm">{pdfWorkflowText(locale, 'form.title')}</span><span className="text-[0.625rem] text-slate-500">{pdfWorkflowText(locale, 'form.counts', { fields: fields.length, issues: issues.length })}</span></div>
          <button aria-label={pdfWorkflowText(locale, 'form.close')} type="button" onClick={onClose} className="p-1 rounded hover:bg-white/10 text-slate-400"><X className="w-4 h-4"/></button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[260px_1fr] min-h-0 flex-1">
          <aside className="border-b sm:border-b-0 sm:border-r border-white/10 p-3 overflow-y-auto bg-slate-950/50">
            <button type="button" onClick={addField} className="w-full mb-3 px-3 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white flex items-center justify-center gap-2"><Plus className="w-3.5 h-3.5"/>{pdfWorkflowText(locale, 'form.create')}</button>
            <div className="space-y-1.5">
              {fields.map((field) => (
                <button type="button" key={field.id} onClick={() => setSelectedId(field.id)} className={`w-full text-left p-2 rounded border ${selected?.id === field.id ? 'border-cyan-500/50 bg-cyan-500/10' : 'border-white/5 bg-slate-900 hover:bg-white/5'}`}>
                  <div className="font-semibold text-slate-200 truncate">{field.label || field.name}</div>
                  <div className="text-[0.625rem] text-slate-500">{pdfWorkflowText(locale, 'form.fieldTypePage', { type: pdfWorkflowText(locale, FIELD_TYPE_COPY_KEYS[field.type]), page: field.page, tab: field.tabOrder ?? 0 })}</div>
                </button>
              ))}
              {!fields.length && <div className="p-3 text-slate-500 border border-dashed border-white/10 rounded">{pdfWorkflowText(locale, 'form.empty')}</div>}
            </div>
          </aside>

          <main className="p-4 overflow-y-auto space-y-4">
            {status && <div role="status" aria-live="polite" className="rounded border border-cyan-500/25 bg-cyan-500/10 px-3 py-2 text-cyan-100">{status}</div>}
            {issues.length > 0 && <div role="status" className="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-200">{issues.slice(0, 4).map((issue) => <div key={`${issue.fieldId}-${issue.code}`}>{issue.fieldName || pdfWorkflowText(locale, 'form.title')}: {pdfWorkflowText(locale, ISSUE_COPY_KEYS[issue.code])}</div>)}</div>}

            {selected ? <>
              <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="space-y-1"><span className="text-slate-400">{pdfWorkflowText(locale, 'form.fieldName')}</span><input value={selected.name} onChange={(e) => updateDefinition({ name: e.target.value })} className="w-full bg-slate-950 border border-white/10 rounded px-2 py-1.5"/></label>
                <label className="space-y-1"><span className="text-slate-400">{pdfWorkflowText(locale, 'form.type')}</span><select value={selected.type} onChange={(e) => updateDefinition({ type: e.target.value as PdfFormFieldType, value: e.target.value === 'checkbox' ? false : e.target.value === 'list' ? [] : '' })} className="w-full bg-slate-950 border border-white/10 rounded px-2 py-1.5">{typeOptions.map((type) => <option key={type} value={type}>{pdfWorkflowText(locale, FIELD_TYPE_COPY_KEYS[type])}</option>)}</select></label>
                <label className="space-y-1"><span className="text-slate-400">{pdfWorkflowText(locale, 'form.label')}</span><input value={selected.label ?? ''} onChange={(e) => updateDefinition({ label: e.target.value })} className="w-full bg-slate-950 border border-white/10 rounded px-2 py-1.5"/></label>
                <label className="space-y-1"><span className="text-slate-400">{pdfWorkflowText(locale, 'form.tooltip')}</span><input value={selected.tooltip ?? ''} onChange={(e) => updateDefinition({ tooltip: e.target.value })} className="w-full bg-slate-950 border border-white/10 rounded px-2 py-1.5"/></label>
                <label className="space-y-1"><span className="text-slate-400">{pdfWorkflowText(locale, 'form.page')}</span><input type="number" min={1} max={pdfData.pages.length} value={selected.page} onChange={(e) => updateDefinition({ page: Number(e.target.value) })} className="w-full bg-slate-950 border border-white/10 rounded px-2 py-1.5"/></label>
                <label className="space-y-1"><span className="text-slate-400">{pdfWorkflowText(locale, 'form.tabOrder')}</span><input type="number" min={0} value={selected.tabOrder ?? 0} onChange={(e) => updateDefinition({ tabOrder: Number(e.target.value) })} className="w-full bg-slate-950 border border-white/10 rounded px-2 py-1.5"/></label>
              </section>

              <section role="group" aria-label={pdfWorkflowText(locale, 'form.bounds')} className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(['x','y','width','height'] as const).map((key) => <label key={key} className="space-y-1"><span className="text-slate-500">{pdfWorkflowText(locale, BOUNDS_COPY_KEYS[key])}</span><input type="number" value={selected.bounds[key]} onChange={(e) => updateDefinition({ bounds: { ...selected.bounds, [key]: Number(e.target.value) } })} className="w-full bg-slate-950 border border-white/10 rounded px-2 py-1.5"/></label>)}
              </section>

              {(selected.type === 'dropdown' || selected.type === 'list' || selected.type === 'radio') && <label className="block space-y-1"><span className="text-slate-400">{pdfWorkflowText(locale, 'form.options')}</span><textarea value={optionText} onChange={(e) => updateDefinition({ options: e.target.value.split(/\r?\n/).filter(Boolean) })} className="w-full h-20 bg-slate-950 border border-white/10 rounded px-2 py-1.5"/></label>}

              <section className="rounded-lg border border-white/10 bg-slate-950/60 p-3 space-y-2">
                <div className="font-semibold text-slate-200">{pdfWorkflowText(locale, 'form.value')}</div>
                {selected.type === 'checkbox' ? <label className="flex gap-2 items-center"><input type="checkbox" checked={Boolean(selected.value)} onChange={(e) => updateValue(e.target.checked)}/>{pdfWorkflowText(locale, 'form.checked')}</label>
                : selected.type === 'dropdown' || selected.type === 'radio' ? <select aria-label={pdfWorkflowText(locale, 'form.value')} value={valueAsText(selected.value)} onChange={(e) => updateValue(e.target.value)} className="w-full bg-slate-900 border border-white/10 rounded px-2 py-1.5"><option value="">—</option>{selected.options?.map((option) => <option key={option}>{option}</option>)}</select>
                : selected.type === 'list' ? <select aria-label={pdfWorkflowText(locale, 'form.value')} multiple value={Array.isArray(selected.value) ? selected.value : []} onChange={(e) => updateValue(Array.from(e.target.selectedOptions as ArrayLike<{ value: string }>).map((option: { value: string }) => option.value))} className="w-full h-24 bg-slate-900 border border-white/10 rounded px-2 py-1.5">{selected.options?.map((option) => <option key={option}>{option}</option>)}</select>
                : <input aria-label={pdfWorkflowText(locale, 'form.value')} disabled={selected.type === 'button' || selected.type === 'signature' || Boolean(selected.calculation)} value={valueAsText(selected.value)} onChange={(e) => updateValue(e.target.value)} className="w-full bg-slate-900 border border-white/10 rounded px-2 py-1.5 disabled:opacity-50"/>}
              </section>

              <section className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-white/10 p-3">
                <label className="flex items-center gap-2"><input type="checkbox" checked={Boolean(selected.required)} onChange={(e) => updateDefinition({ required: e.target.checked })}/>{pdfWorkflowText(locale, 'form.required')}</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={Boolean(selected.readOnly)} onChange={(e) => updateDefinition({ readOnly: e.target.checked })}/>{pdfWorkflowText(locale, 'form.readOnly')}</label>
                <label className="space-y-1"><span className="text-slate-400">{pdfWorkflowText(locale, 'form.validationPattern')}</span><input value={selected.validation?.pattern ?? ''} onChange={(e) => updateDefinition({ validation: { ...selected.validation, pattern: e.target.value || undefined } })} className="w-full bg-slate-950 border border-white/10 rounded px-2 py-1.5"/></label>
                <label className="space-y-1"><span className="text-slate-400">{pdfWorkflowText(locale, 'form.maxLength')}</span><input type="number" min={0} value={selected.validation?.maxLength ?? ''} onChange={(e) => updateDefinition({ validation: { ...selected.validation, maxLength: e.target.value ? Number(e.target.value) : undefined } })} className="w-full bg-slate-950 border border-white/10 rounded px-2 py-1.5"/></label>
              </section>

              <section className="grid grid-cols-3 gap-2 rounded-lg border border-white/10 p-3">
                <select aria-label={pdfWorkflowText(locale, 'form.calculation.none')} value={selected.calculation?.kind ?? ''} onChange={(e) => updateDefinition({ calculation: e.target.value ? { kind: e.target.value as 'sum'|'average'|'concat', sourceFieldNames: selected.calculation?.sourceFieldNames ?? [] } : undefined })} className="bg-slate-950 border border-white/10 rounded px-2 py-1.5"><option value="">{pdfWorkflowText(locale, 'form.calculation.none')}</option><option value="sum">{pdfWorkflowText(locale, CALCULATION_COPY_KEYS.sum)}</option><option value="average">{pdfWorkflowText(locale, CALCULATION_COPY_KEYS.average)}</option><option value="concat">{pdfWorkflowText(locale, CALCULATION_COPY_KEYS.concat)}</option></select>
                <input aria-label={pdfWorkflowText(locale, 'form.calculationSources')} disabled={!selected.calculation} value={selected.calculation?.sourceFieldNames.join(', ') ?? ''} onChange={(e) => updateDefinition({ calculation: selected.calculation ? { ...selected.calculation, sourceFieldNames: e.target.value.split(',').map((v: string) => v.trim()).filter(Boolean) } : undefined })} placeholder={pdfWorkflowText(locale, 'form.calculationSourcesPlaceholder')} className="col-span-2 bg-slate-950 border border-white/10 rounded px-2 py-1.5 disabled:opacity-40"/>
              </section>

              {selected.type === 'button' && <section className="rounded-lg border border-white/10 p-3 space-y-2"><label className="block space-y-1"><span className="text-slate-400">{pdfWorkflowText(locale, 'form.endpoint')}</span><input value={selected.submitUrl ?? ''} onChange={(e) => updateDefinition({ submitUrl: e.target.value || undefined })} className="w-full bg-slate-950 border border-white/10 rounded px-2 py-1.5"/></label><button type="button" onClick={() => void handleSubmit()} className="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 flex items-center gap-2"><Send className="w-3.5 h-3.5"/>{pdfWorkflowText(locale, 'form.submit')}</button></section>}

              <button type="button" onClick={removeField} className="px-3 py-1.5 rounded border border-red-500/30 text-red-300 hover:bg-red-500/10 flex items-center gap-2"><Trash2 className="w-3.5 h-3.5"/>{pdfWorkflowText(locale, 'form.delete')}</button>
            </> : <div className="text-slate-500">{pdfWorkflowText(locale, 'form.noSelection')}</div>}

            <section className="border-t border-white/10 pt-4 grid grid-cols-2 gap-3">
              <button type="button" onClick={requestReset} className="px-3 py-2 rounded border border-white/10 flex items-center justify-center gap-2"><RotateCcw className="w-3.5 h-3.5"/>{pdfWorkflowText(locale, 'form.reset')}</button>
              <button type="button" onClick={requestFlatten} className="px-3 py-2 rounded border border-white/10 flex items-center justify-center gap-2"><Layers className="w-3.5 h-3.5"/>{pdfWorkflowText(locale, 'form.flatten')}</button>
              <button type="button" onClick={() => { void exportFormData(); }} className="px-3 py-2 rounded border border-white/10 flex items-center justify-center gap-2"><Download className="w-3.5 h-3.5"/>{pdfWorkflowText(locale, 'form.export')}</button>
              <button type="button" onClick={() => { try { persist(importPdfFormData(pdfData, importText), pdfWorkflowText(locale, 'form.status.imported')); } catch { setStatus(pdfWorkflowText(locale, 'form.status.importFailed')); } }} className="px-3 py-2 rounded border border-white/10 flex items-center justify-center gap-2"><Upload className="w-3.5 h-3.5"/>{pdfWorkflowText(locale, 'form.import')}</button>
              <textarea value={importText} onChange={(e) => setImportText(e.target.value)} placeholder={pdfWorkflowText(locale, 'form.importPlaceholder')} className="col-span-2 h-20 bg-slate-950 border border-white/10 rounded px-2 py-1.5"/>
            </section>

            <div className="rounded border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-emerald-200 flex gap-2"><ShieldCheck className="w-4 h-4 shrink-0"/><span>{pdfWorkflowText(locale, 'form.xfaNotice')}</span></div>
          </main>
        </div>
      </div>
    </div>
  );
};
