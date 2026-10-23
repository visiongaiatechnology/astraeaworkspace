// STATUS: PLATIN — the witness for AST-0844 ("Flatten optional irreversibel warnen").
//
// This file exists because the audit found the warning absent: the visible Flatten control reached
// `flattenPdfForm` in one click, and the control on the line above reached `resetPdfForm` the same way. The
// evidence below is not "the source contains a string" — it drives the real decision and the real model
// transition, and it fails if the gate stops protecting either action:
//
//   * `declined` must return the **unchanged** model, so a person who answers "cancel" cannot lose the field
//     structure (flatten) or the entered values (reset). A guard that asks and destroys anyway is worse than
//     no guard, so the deep comparison is the point of this file, not the outcome string.
//   * the message that reaches `confirm` is the localized question and carries the **real** number of affected
//     fields, in all seven locales. A confirmation that does not name the consequence would satisfy "there is
//     a dialog" while failing the acceptance sentence.
//   * `confirmed` must still act (the gate may not become a blanket refusal) and must produce exactly what the
//     product's own `flattenPdfForm` / `resetPdfForm` produce — this test asserts against those functions, it
//     does not re-implement them.
//   * the reset's affected count is read back from `resetPdfForm`, so a value that is already the declared
//     default does not produce a dialog. That is the counter-check against a guard that simply always asks.
//
// What it does NOT prove: that a click on the rendered button reaches these functions. There is no
// jsdom/happy-dom/@testing-library in `ui/package.json`; that link is pinned by
// `PdfFormFillerDestructiveGuard.contract.test.mjs` at the source, not by a dispatched event.
import { describe, expect, it, vi } from 'vitest';
import type { PdfDocumentModel, PdfFormField } from '../../../../shared/contracts/workspace';
import { DEFAULT_PDF_MODEL } from '../../../../shared/seeds/pdfDefaults';
import { WORKSPACE_LOCALES } from '../../../../shell/localization/workspaceLocaleTypes';
import { pdfWorkflowText } from '../../locale/pdfWorkflowDialogsLocale';
import { flattenPdfForm, resetPdfForm } from '../model/pdfAcroFormModel';
import { requestPdfFormFlatten, requestPdfFormReset } from '../model/pdfFormDestructiveGuard';

const field = (overrides: Partial<PdfFormField> = {}): PdfFormField => ({
  id: 'field-guard',
  name: 'kunde_name',
  type: 'text',
  page: 1,
  bounds: { x: 54, y: 640, width: 220, height: 24 },
  value: 'Meier GmbH',
  options: [],
  required: false,
  readOnly: false,
  tabOrder: 1,
  ...overrides,
});

const modelWithFields = (fields: PdfFormField[]): PdfDocumentModel => ({
  ...DEFAULT_PDF_MODEL,
  pages: DEFAULT_PDF_MODEL.pages.map((page) => ({ ...page, sections: page.sections.map((section) => ({ ...section })) })),
  annotations: [],
  redactions: [],
  formFields: fields,
});

const twoFields = modelWithFields([field(), field({ id: 'field-check', name: 'agb', type: 'checkbox', value: true, tabOrder: 2 })]);
const messageFor = (count: number) => `question about ${count}`;

describe('the irreversible flatten asks before it consumes the field structure (AST-0844)', () => {
  it('flattens nothing when the question is answered with "no", and hands back the untouched model', () => {
    const confirm = vi.fn(() => false);

    const decision = requestPdfFormFlatten({ model: twoFields, messageFor, confirm });

    expect(decision.outcome).toBe('declined');
    // The data-loss assertion: the caller receives the same field structure it passed in.
    expect(decision.model).toEqual(twoFields);
    expect(decision.model.formFields?.map((entry) => entry.name)).toEqual(['kunde_name', 'agb']);
    expect(decision.model.pages).toEqual(twoFields.pages);
    // Exactly one question, and it names the real number of fields.
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledWith('question about 2');
    expect(decision.affectedFields).toBe(2);
  });

  it('flattens when and only when the question is answered with an explicit "yes"', () => {
    const confirm = vi.fn(() => true);

    const decision = requestPdfFormFlatten({ model: twoFields, messageFor, confirm });

    expect(decision.outcome).toBe('confirmed');
    // Not a blanket refusal: the result is exactly the product's own flatten of the same model.
    expect(decision.model).toEqual(flattenPdfForm(twoFields));
    expect(decision.model.formFields).toEqual([]);
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it('treats anything but a literal true as a refusal, so a missing answer cannot pass as consent', () => {
    for (const answer of [undefined, null, 0, 1, 'true', {}] as unknown[]) {
      const decision = requestPdfFormFlatten({
        model: twoFields,
        messageFor,
        confirm: (() => answer) as unknown as (message: string) => boolean,
      });
      expect(decision.outcome, String(answer)).toBe('declined');
      expect(decision.model, String(answer)).toEqual(twoFields);
    }
  });

  it('does not ask at all when there is no interactive field to lose', () => {
    const confirm = vi.fn(() => true);

    const decision = requestPdfFormFlatten({ model: modelWithFields([]), messageFor, confirm });

    expect(decision.outcome).toBe('nothing-to-do');
    expect(decision.affectedFields).toBe(0);
    expect(confirm).not.toHaveBeenCalled();
    expect(decision.model.formFields).toEqual([]);
  });
});

describe('the destructive reset asks before it discards entered values (AST-0844)', () => {
  it('keeps every entered value when the question is answered with "no"', () => {
    const confirm = vi.fn(() => false);

    const decision = requestPdfFormReset({ model: twoFields, messageFor, confirm });

    expect(decision.outcome).toBe('declined');
    expect(decision.model).toEqual(twoFields);
    expect(decision.model.formFields?.map((entry) => entry.value)).toEqual(['Meier GmbH', true]);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledWith('question about 2');
  });

  it('restores the declared defaults on an explicit "yes", exactly as the domain function does', () => {
    const confirm = vi.fn(() => true);

    const decision = requestPdfFormReset({ model: twoFields, messageFor, confirm });

    expect(decision.outcome).toBe('confirmed');
    expect(decision.model).toEqual(resetPdfForm(twoFields));
    expect(decision.model.formFields?.map((entry) => entry.value)).toEqual(['', false]);
  });

  it('does not ask when every value already is its declared default (the count comes from resetPdfForm)', () => {
    const confirm = vi.fn(() => true);
    const alreadyDefault = modelWithFields([
      field({ id: 'field-default', name: 'kunde_name', value: 'Meier GmbH', defaultValue: 'Meier GmbH' }),
      field({ id: 'field-unchecked', name: 'agb', type: 'checkbox', value: false }),
    ]);

    const decision = requestPdfFormReset({ model: alreadyDefault, messageFor, confirm });

    expect(decision.outcome).toBe('nothing-to-do');
    expect(decision.affectedFields).toBe(0);
    expect(confirm).not.toHaveBeenCalled();
    expect(decision.model).toEqual(alreadyDefault);
  });

  it('counts only the fields whose value would really change', () => {
    const mixed = modelWithFields([
      field({ id: 'field-default', name: 'kunde_name', value: 'Meier GmbH', defaultValue: 'Meier GmbH' }),
      field({ id: 'field-entered', name: 'bestellnummer', value: 'A-4711', tabOrder: 2 }),
    ]);

    const decision = requestPdfFormReset({ model: mixed, messageFor, confirm: () => false });

    expect(decision.affectedFields).toBe(1);
    expect(decision.model).toEqual(mixed);
  });
});

describe('the question itself is localized, concrete and answerable (AST-0844)', () => {
  it('names the action, the real field count and the consequence in all seven locales', () => {
    for (const locale of WORKSPACE_LOCALES) {
      const flattenQuestion = pdfWorkflowText(locale, 'form.flatten.confirm', { fields: 2 });
      const resetQuestion = pdfWorkflowText(locale, 'form.reset.confirm', { fields: 2 });

      for (const [label, question, key] of [
        ['flatten', flattenQuestion, 'form.flatten'] as const,
        ['reset', resetQuestion, 'form.reset'] as const,
      ]) {
        const actionLabel = pdfWorkflowText(locale, key);
        expect(question, `${locale}.${label}`).not.toContain('{{');
        expect(question, `${locale}.${label}`).not.toBe(actionLabel);
        // The count is interpolated with the locale's own number formatting; 2 is "2" everywhere.
        expect(question, `${locale}.${label}`).toContain('2');
        // A question, not a statement: it says more than the label plus a number.
        expect(question.length, `${locale}.${label}`).toBeGreaterThan(actionLabel.length + 20);
        // It ends by asking, so the person knows an answer is expected.
        expect(question.trim().endsWith('?') || question.trim().endsWith('？'), `${locale}.${label}`).toBe(true);
      }
    }
  });

  it('keeps the answer visible: every refusal, empty case and outcome reports the unchanged or changed state', () => {
    for (const locale of WORKSPACE_LOCALES) {
      for (const key of [
        'form.status.flattenCancelled', 'form.status.nothingToFlatten',
        'form.status.resetCancelled', 'form.status.nothingToReset',
      ] as const) {
        const message = pdfWorkflowText(locale, key);
        expect(message.trim(), `${locale}.${key}`).not.toBe('');
        expect(message, `${locale}.${key}`).not.toContain('{{');
      }
      // The post-action statuses carry the real number of affected fields.
      for (const key of ['form.status.flattened', 'form.status.reset'] as const) {
        const message = pdfWorkflowText(locale, key, { fields: 2 });
        expect(message, `${locale}.${key}`).not.toContain('{{');
        expect(message, `${locale}.${key}`).toContain('2');
      }
    }
  });
});
