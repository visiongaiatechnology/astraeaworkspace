// STATUS: DIAMANT VGT SUPREME
// Canonical bounded AcroForm model. Product logic is independent from the PDF parser/renderer adapter.

import { LinearPattern } from '../../../../shared/patterns/linearPattern';

import type {
  PdfDocumentModel,
  PdfFormField,
  PdfFormFieldCalculation,
  PdfFormFieldType,
  PdfFormFieldValue,
} from '../../../../shared/contracts/workspace';

export const PDF_FORM_LIMITS = Object.freeze({
  maxFields: 2_048,
  maxName: 128,
  maxLabel: 256,
  maxTooltip: 512,
  maxOptions: 256,
  maxOptionLength: 256,
  maxValueLength: 32_768,
  maxArrayValues: 256,
  maxPatternLength: 256,
  maxCalculationSources: 32,
  maxImportBytes: 1_048_576,
  maxSubmitBytes: 1_048_576,
});

export interface PdfFormValidationIssue {
  fieldId: string;
  fieldName: string;
  code: 'required' | 'pattern' | 'min-length' | 'max-length' | 'invalid-option' | 'invalid-type' | 'calculation-cycle';
  message: string;
}

export interface PdfFormSubmitEnvelope {
  format: 'astraea-pdf-form-submit-v1';
  targetUrl: string;
  targetHost: string;
  contentType: 'application/json';
  body: string;
}

const cleanText = (value: unknown, max: number): string => String(value ?? '').replace(/\u0000/g, '').slice(0, max);

function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function safePattern(pattern: string): LinearPattern {
  const clean = cleanText(pattern, PDF_FORM_LIMITS.maxPatternLength);
  if (!clean) throw new Error('Validation pattern must not be empty.');
  try {
    return new LinearPattern(clean, {
      anchored: true,
      limits: {
        maxPatternLength: PDF_FORM_LIMITS.maxPatternLength,
        maxInputLength: PDF_FORM_LIMITS.maxValueLength,
        maxStates: 2048,
        maxMatches: 1,
        maxRepeat: 128,
      },
    });
  } catch {
    throw new Error('Validation pattern is invalid or uses unsupported non-linear regex features.');
  }
}

function normalizeValue(type: PdfFormFieldType, value: unknown, options: readonly string[] = []): PdfFormFieldValue {
  if (type === 'checkbox') return Boolean(value);
  if (type === 'list') {
    const source = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
    const allowed = new Set(options);
    return source.slice(0, PDF_FORM_LIMITS.maxArrayValues).map((entry) => cleanText(entry, PDF_FORM_LIMITS.maxOptionLength)).filter((entry) => !options.length || allowed.has(entry));
  }
  const text = cleanText(value, PDF_FORM_LIMITS.maxValueLength);
  if ((type === 'radio' || type === 'dropdown') && options.length && text && !options.includes(text)) return '';
  return text;
}

function normalizeCalculation(calculation: PdfFormFieldCalculation | undefined): PdfFormFieldCalculation | undefined {
  if (!calculation) return undefined;
  const names = Array.from(new Set(calculation.sourceFieldNames.map((value) => cleanText(value, PDF_FORM_LIMITS.maxName).trim()).filter(Boolean)))
    .slice(0, PDF_FORM_LIMITS.maxCalculationSources);
  if (!names.length) return undefined;
  return {
    kind: calculation.kind,
    sourceFieldNames: names,
    separator: calculation.kind === 'concat' ? cleanText(calculation.separator ?? ' ', 32) : undefined,
  };
}

export function normalizePdfFormField(field: PdfFormField, pageCount: number): PdfFormField {
  const options = Array.from(new Set((field.options ?? []).map((option) => cleanText(option, PDF_FORM_LIMITS.maxOptionLength)).filter(Boolean)))
    .slice(0, PDF_FORM_LIMITS.maxOptions);
  const type = field.type;
  const page = Math.trunc(boundedNumber(field.page, 1, 1, Math.max(1, pageCount)));
  const normalized: PdfFormField = {
    id: cleanText(field.id, 160).trim() || `form-${page}-${Date.now()}`,
    name: cleanText(field.name, PDF_FORM_LIMITS.maxName).trim(),
    type,
    page,
    bounds: {
      x: boundedNumber(field.bounds?.x, 54, 0, 20_000),
      y: boundedNumber(field.bounds?.y, 54, 0, 20_000),
      width: boundedNumber(field.bounds?.width, 180, 1, 20_000),
      height: boundedNumber(field.bounds?.height, 22, 1, 20_000),
    },
    label: cleanText(field.label, PDF_FORM_LIMITS.maxLabel).trim() || undefined,
    tooltip: cleanText(field.tooltip, PDF_FORM_LIMITS.maxTooltip).trim() || undefined,
    options: options.length ? options : undefined,
    required: Boolean(field.required),
    readOnly: Boolean(field.readOnly),
    tabOrder: Math.trunc(boundedNumber(field.tabOrder, 0, 0, PDF_FORM_LIMITS.maxFields)),
    validation: field.validation ? {
      pattern: field.validation.pattern ? cleanText(field.validation.pattern, PDF_FORM_LIMITS.maxPatternLength) : undefined,
      minLength: field.validation.minLength === undefined ? undefined : Math.trunc(boundedNumber(field.validation.minLength, 0, 0, PDF_FORM_LIMITS.maxValueLength)),
      maxLength: field.validation.maxLength === undefined ? undefined : Math.trunc(boundedNumber(field.validation.maxLength, PDF_FORM_LIMITS.maxValueLength, 0, PDF_FORM_LIMITS.maxValueLength)),
    } : undefined,
    calculation: normalizeCalculation(field.calculation),
    submitUrl: field.submitUrl ? assertSafeSubmitUrl(field.submitUrl) : undefined,
    value: normalizeValue(type, field.value, options),
    defaultValue: field.defaultValue === undefined ? undefined : normalizeValue(type, field.defaultValue, options),
  };
  if (!normalized.name) throw new Error('Form field name is required.');
  if (normalized.validation?.pattern) safePattern(normalized.validation.pattern);
  return normalized;
}

function assertUniqueNames(fields: readonly PdfFormField[]): void {
  const names = new Set<string>();
  for (const field of fields) {
    const key = field.name.toLocaleLowerCase('en-US');
    if (names.has(key)) throw new Error(`Duplicate form field name: ${field.name}`);
    names.add(key);
  }
}

export function normalizePdfFormFields(model: PdfDocumentModel): PdfFormField[] {
  const source = model.formFields ?? [];
  if (source.length > PDF_FORM_LIMITS.maxFields) throw new Error('Form field limit exceeded.');
  const normalized = source.map((field) => normalizePdfFormField(field, model.pages.length));
  assertUniqueNames(normalized);
  return normalized.sort((a, b) => a.page - b.page || (a.tabOrder ?? 0) - (b.tabOrder ?? 0) || a.name.localeCompare(b.name));
}

export function upsertPdfFormField(model: PdfDocumentModel, field: PdfFormField): PdfDocumentModel {
  const current = normalizePdfFormFields(model);
  const normalized = normalizePdfFormField(field, model.pages.length);
  const next = current.some((entry) => entry.id === normalized.id)
    ? current.map((entry) => entry.id === normalized.id ? normalized : entry)
    : [...current, normalized];
  if (next.length > PDF_FORM_LIMITS.maxFields) throw new Error('Form field limit exceeded.');
  assertUniqueNames(next);
  return recalculatePdfForm({ ...model, formFields: next });
}

export function deletePdfFormField(model: PdfDocumentModel, fieldId: string): PdfDocumentModel {
  return recalculatePdfForm({ ...model, formFields: normalizePdfFormFields(model).filter((field) => field.id !== fieldId) });
}

export function setPdfFormFieldValue(model: PdfDocumentModel, fieldId: string, value: PdfFormFieldValue): PdfDocumentModel {
  const fields = normalizePdfFormFields(model);
  const next = fields.map((field) => {
    if (field.id !== fieldId) return field;
    if (field.readOnly || field.calculation) throw new Error(`Field ${field.name} is read-only or calculated.`);
    return { ...field, value: normalizeValue(field.type, value, field.options ?? []) };
  });
  if (!fields.some((field) => field.id === fieldId)) throw new Error('Form field not found.');
  return recalculatePdfForm({ ...model, formFields: next });
}

function valueText(value: PdfFormFieldValue): string {
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return value;
}

function numericValue(value: PdfFormFieldValue): number {
  const parsed = Number(valueText(value).replace(',', '.').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function computeCalculation(calculation: PdfFormFieldCalculation, byName: Map<string, PdfFormField>): string {
  const sources = calculation.sourceFieldNames.map((name) => byName.get(name.toLocaleLowerCase('en-US'))).filter((field): field is PdfFormField => Boolean(field));
  if (calculation.kind === 'concat') return sources.map((field) => valueText(field.value)).join(calculation.separator ?? ' ').slice(0, PDF_FORM_LIMITS.maxValueLength);
  const values = sources.map((field) => numericValue(field.value));
  const number = calculation.kind === 'average' ? (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0) : values.reduce((a, b) => a + b, 0);
  return Number.isFinite(number) ? String(Math.round(number * 1_000_000) / 1_000_000) : '0';
}

export function recalculatePdfForm(model: PdfDocumentModel): PdfDocumentModel {
  let fields = normalizePdfFormFields({ ...model, formFields: model.formFields ?? [] });
  const byName = new Map(fields.map((field) => [field.name.toLocaleLowerCase('en-US'), field]));
  const visiting = new Set<string>();
  const done = new Set<string>();
  const calculate = (field: PdfFormField): PdfFormField => {
    if (!field.calculation) return field;
    const key = field.name.toLocaleLowerCase('en-US');
    if (done.has(key)) return byName.get(key) ?? field;
    if (visiting.has(key)) throw new Error(`Calculation cycle detected at ${field.name}.`);
    visiting.add(key);
    for (const sourceName of field.calculation.sourceFieldNames) {
      const source = byName.get(sourceName.toLocaleLowerCase('en-US'));
      if (source?.calculation) byName.set(source.name.toLocaleLowerCase('en-US'), calculate(source));
    }
    const updated = { ...field, value: computeCalculation(field.calculation, byName), readOnly: true };
    byName.set(key, updated);
    visiting.delete(key);
    done.add(key);
    return updated;
  };
  fields = fields.map((field) => calculate(field));
  return { ...model, formFields: fields };
}

export function validatePdfForm(model: PdfDocumentModel): PdfFormValidationIssue[] {
  const fields = normalizePdfFormFields(model);
  const issues: PdfFormValidationIssue[] = [];
  for (const field of fields) {
    const text = valueText(field.value);
    const empty = typeof field.value === 'boolean' ? field.value === false : Array.isArray(field.value) ? field.value.length === 0 : text.trim().length === 0;
    if (field.required && empty) issues.push({ fieldId: field.id, fieldName: field.name, code: 'required', message: 'Required field is empty.' });
    const validation = field.validation;
    if (validation?.minLength !== undefined && text.length < validation.minLength) issues.push({ fieldId: field.id, fieldName: field.name, code: 'min-length', message: `Minimum length is ${validation.minLength}.` });
    if (validation?.maxLength !== undefined && text.length > validation.maxLength) issues.push({ fieldId: field.id, fieldName: field.name, code: 'max-length', message: `Maximum length is ${validation.maxLength}.` });
    if (validation?.pattern && text && !safePattern(validation.pattern).test(text)) issues.push({ fieldId: field.id, fieldName: field.name, code: 'pattern', message: 'Value does not match validation pattern.' });
    if ((field.type === 'radio' || field.type === 'dropdown') && text && field.options?.length && !field.options.includes(text)) issues.push({ fieldId: field.id, fieldName: field.name, code: 'invalid-option', message: 'Value is not a declared option.' });
    if (field.type === 'list' && Array.isArray(field.value) && field.options?.length && field.value.some((value) => !field.options!.includes(value))) issues.push({ fieldId: field.id, fieldName: field.name, code: 'invalid-option', message: 'List contains an undeclared option.' });
  }
  try { recalculatePdfForm(model); } catch (error) {
    issues.push({ fieldId: '', fieldName: '', code: 'calculation-cycle', message: error instanceof Error ? error.message : 'Calculation cycle detected.' });
  }
  return issues;
}

export function resetPdfForm(model: PdfDocumentModel): PdfDocumentModel {
  const fields = normalizePdfFormFields(model).map((field) => ({
    ...field,
    value: field.defaultValue === undefined ? normalizeValue(field.type, field.type === 'checkbox' ? false : field.type === 'list' ? [] : '', field.options ?? []) : field.defaultValue,
  }));
  return recalculatePdfForm({ ...model, formFields: fields });
}

export function exportPdfFormData(model: PdfDocumentModel): string {
  const payload = {
    format: 'astraea-pdf-form-data-v1' as const,
    fields: normalizePdfFormFields(recalculatePdfForm(model)).map((field) => ({ name: field.name, value: field.value })),
  };
  const json = JSON.stringify(payload, null, 2);
  if (new TextEncoder().encode(json).length > PDF_FORM_LIMITS.maxImportBytes) throw new Error('Form data export exceeds size limit.');
  return json;
}

export function importPdfFormData(model: PdfDocumentModel, json: string): PdfDocumentModel {
  if (new TextEncoder().encode(json).length > PDF_FORM_LIMITS.maxImportBytes) throw new Error('Form data import exceeds size limit.');
  let parsed: unknown;
  try { parsed = JSON.parse(json); } catch { throw new Error('Form data is not valid JSON.'); }
  if (!parsed || typeof parsed !== 'object' || (parsed as { format?: unknown }).format !== 'astraea-pdf-form-data-v1' || !Array.isArray((parsed as { fields?: unknown }).fields)) {
    throw new Error('Unsupported form data format.');
  }
  const source = (parsed as { fields: Array<{ name?: unknown; value?: unknown }> }).fields;
  if (source.length > PDF_FORM_LIMITS.maxFields) throw new Error('Form data field limit exceeded.');
  const values = new Map<string, unknown>();
  for (const entry of source) {
    const name = cleanText(entry?.name, PDF_FORM_LIMITS.maxName).trim();
    if (!name) throw new Error('Form data contains an empty field name.');
    const key = name.toLocaleLowerCase('en-US');
    if (values.has(key)) throw new Error(`Duplicate field in form data: ${name}`);
    values.set(key, entry.value);
  }
  const current = normalizePdfFormFields(model);
  const known = new Set(current.map((field) => field.name.toLocaleLowerCase('en-US')));
  for (const name of values.keys()) if (!known.has(name)) throw new Error(`Unknown form field in import: ${name}`);
  const fields = current.map((field) => values.has(field.name.toLocaleLowerCase('en-US')) && !field.readOnly && !field.calculation
    ? { ...field, value: normalizeValue(field.type, values.get(field.name.toLocaleLowerCase('en-US')), field.options ?? []) }
    : field);
  const next = recalculatePdfForm({ ...model, formFields: fields });
  const issues = validatePdfForm(next);
  if (issues.length) throw new Error(`Imported form data failed validation: ${issues[0].fieldName || 'form'} ${issues[0].message}`);
  return next;
}

function displayValue(field: PdfFormField): string {
  if (field.type === 'checkbox') return field.value ? 'Yes' : 'No';
  if (field.type === 'button' || field.type === 'signature') return cleanText(field.value, 512) || (field.type === 'signature' ? '[Unsigned]' : '[Button]');
  return valueText(field.value) || '[Empty]';
}

export function flattenPdfForm(model: PdfDocumentModel): PdfDocumentModel {
  const next = recalculatePdfForm(model);
  const issues = validatePdfForm(next);
  if (issues.length) throw new Error(`Cannot flatten invalid form: ${issues[0].fieldName || 'form'} ${issues[0].message}`);
  const byPage = new Map<number, PdfFormField[]>();
  for (const field of next.formFields ?? []) {
    const list = byPage.get(field.page) ?? [];
    list.push(field);
    byPage.set(field.page, list);
  }
  const pages = next.pages.map((page) => {
    const fields = byPage.get(page.pageNumber) ?? [];
    if (!fields.length) return page;
    return {
      ...page,
      sections: [...page.sections, ...fields.map((field, index) => ({
        id: `flattened-form-${field.id}-${index}`,
        type: 'key-value' as const,
        content: `${field.label || field.name}: ${displayValue(field)}`.slice(0, 32_768),
      }))],
    };
  });
  return { ...next, pages, formFields: [] };
}

export function assertSafeSubmitUrl(input: string): string {
  const raw = cleanText(input, 2_048).trim();
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('Submit URL is invalid.'); }
  if (url.protocol !== 'https:' || !url.hostname) throw new Error('Form submission requires an explicit HTTPS endpoint.');
  if (url.username || url.password) throw new Error('Submit URL must not contain credentials.');
  return url.toString();
}

export function preparePdfFormSubmit(model: PdfDocumentModel, submitUrl: string): PdfFormSubmitEnvelope {
  const next = recalculatePdfForm(model);
  const issues = validatePdfForm(next);
  if (issues.length) throw new Error(`Form submission blocked by validation: ${issues[0].fieldName || 'form'} ${issues[0].message}`);
  const targetUrl = assertSafeSubmitUrl(submitUrl);
  const target = new URL(targetUrl);
  const body = exportPdfFormData(next);
  if (new TextEncoder().encode(body).length > PDF_FORM_LIMITS.maxSubmitBytes) throw new Error('Form submission payload exceeds size limit.');
  return { format: 'astraea-pdf-form-submit-v1', targetUrl, targetHost: target.hostname, contentType: 'application/json', body };
}
