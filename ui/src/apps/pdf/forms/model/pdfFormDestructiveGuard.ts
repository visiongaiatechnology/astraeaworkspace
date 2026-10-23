// STATUS: DIAMANT VGT SUPREME — the one gate in front of the two irreversible form actions.
//
// AST-0844 · PDF Studio / Paket 17 asks for a *visible, fail-closed* path: "Flatten optional irreversibel
// warnen". Two controls in `PdfFormFillerModal` destroyed user data in a single click with no question:
//
//   * `flattenPdfForm` (`./pdfAcroFormModel`) converts every interactive field into page content and thereby
//     drops the field structure — name, type, options, tab order and validation are not recoverable by typing
//     the value back in;
//   * `resetPdfForm` discards the values a person entered and restores the declared defaults.
//
// Both effects survive the save that `persist` performs immediately, while the undo stack
// (`usePdfDocumentHistory`) lives in memory only — so outside the current session neither is reversible. The
// one confirmation the surface already had guarded `form.submit.confirm`, i.e. the *reversible* action.
//
// The gate is deliberately pure and receives its `confirm` as a parameter instead of calling `window.confirm`
// itself: the decision can then be witnessed without a DOM (there is no jsdom/happy-dom in this project), and
// the surface stays answerable for asking the question.
//
// Fail-closed: only a literal `true` proceeds. `undefined`, a truthy non-boolean and a throw all leave the
// model untouched — a confirmation that did not happen is a refusal, never a silent pass.
//
// One rule per fact: this module does not decide what a default value is or how a field becomes page content.
// It asks the owning functions (`resetPdfForm`, `flattenPdfForm`) for both the affected count and the result,
// so the question and the action can never disagree.
import type { PdfDocumentModel, PdfFormFieldValue } from '../../../../shared/contracts/workspace';
import { flattenPdfForm, normalizePdfFormFields, resetPdfForm } from './pdfAcroFormModel';

export type PdfFormDestructiveOutcome = 'confirmed' | 'declined' | 'nothing-to-do';

export interface PdfFormDestructiveRequest {
  /** The canonical document model the action would change. */
  readonly model: PdfDocumentModel;
  /** Builds the localized question for the real number of affected fields. */
  readonly messageFor: (affectedFields: number) => string;
  /** Returns `true` only when the person explicitly confirmed. */
  readonly confirm: (message: string) => boolean;
}

export interface PdfFormDestructiveDecision {
  readonly outcome: PdfFormDestructiveOutcome;
  /** The changed model for `confirmed`; the **unchanged** model for every other outcome. */
  readonly model: PdfDocumentModel;
  /** The question that was asked (or would have been asked), so a caller can report the real wording. */
  readonly message: string;
  /** The number the question named: fields to consume (`flatten`) or values to discard (`reset`). */
  readonly affectedFields: number;
}

const valueKey = (value: PdfFormFieldValue | undefined): string => JSON.stringify(value ?? null);

/** Fields a flatten would consume — asked of the canonical normalizer, not counted here. */
const affectedFieldsOfFlatten = (model: PdfDocumentModel): number => normalizePdfFormFields(model).length;

/**
 * Values a reset would really discard — derived from `resetPdfForm`'s **own** output, so this module never
 * owns a second opinion about what a declared default is. Fields whose value is already the default are not
 * counted, which is what keeps the dialog from appearing when there is nothing to lose.
 */
const affectedFieldsOfReset = (model: PdfDocumentModel): number => {
  const before = new Map((model.formFields ?? []).map((field) => [field.id, valueKey(field.value)]));
  return (resetPdfForm(model).formFields ?? [])
    .filter((field) => before.get(field.id) !== valueKey(field.value))
    .length;
};

function decide(
  request: PdfFormDestructiveRequest,
  affectedFields: number,
  apply: (model: PdfDocumentModel) => PdfDocumentModel,
): PdfFormDestructiveDecision {
  const { model, messageFor, confirm } = request;
  const message = messageFor(affectedFields);
  if (!(affectedFields > 0)) return { outcome: 'nothing-to-do', model, message, affectedFields };
  if (confirm(message) !== true) return { outcome: 'declined', model, message, affectedFields };
  return { outcome: 'confirmed', model: apply(model), message, affectedFields };
}

/**
 * Asks before flattening, and flattens only an explicit confirmation.
 *
 * A document without interactive fields is not a loss and does not deserve a dialog: the outcome is
 * `nothing-to-do` and `confirm` is **not** called. Every other path either asks first (`confirmed`) or returns
 * the untouched model (`declined`).
 */
export function requestPdfFormFlatten(request: PdfFormDestructiveRequest): PdfFormDestructiveDecision {
  return decide(request, affectedFieldsOfFlatten(request.model), flattenPdfForm);
}

/**
 * Asks before resetting, and discards entered values only on an explicit confirmation.
 *
 * The question names the values that will be lost. A form whose values already match their declared defaults
 * reports `nothing-to-do` without asking.
 */
export function requestPdfFormReset(request: PdfFormDestructiveRequest): PdfFormDestructiveDecision {
  return decide(request, affectedFieldsOfReset(request.model), resetPdfForm);
}
