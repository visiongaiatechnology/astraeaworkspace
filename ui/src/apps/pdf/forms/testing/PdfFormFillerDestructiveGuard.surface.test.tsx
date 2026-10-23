// STATUS: PLATIN — the rendered surface of the two destructive controls (AST-0844).
//
// What this file proves: after the guard was added, both irreversible controls are still rendered and still
// carry a localized, non-empty name in all seven locales, and the dialog still exposes its modal semantics.
// That is the regression this change could plausibly have caused (a control that disappears is a control
// nobody can be warned about).
//
// What this file does NOT prove, and must not be read as proving: that a person can operate the control. There
// is no jsdom, no happy-dom and no @testing-library in `ui/package.json`, and `renderToStaticMarkup` produces
// markup without event handlers — no click can be dispatched here, and therefore no confirmation can be
// observed answering. The gate's behaviour is witnessed in `pdfFormDestructiveGuard.test.ts`, and the fact
// that the rendered control is wired to that gate is pinned at the source in
// `PdfFormFillerDestructiveGuard.contract.test.mjs`. A real click on the real confirm still needs a browser
// session, which this round did not perform.
import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import { WORKSPACE_LOCALES } from '../../../../shell/localization/workspaceLocaleTypes';
import { DEFAULT_PDF_MODEL } from '../../../../shared/seeds/pdfDefaults';
import type { PdfDocumentModel } from '../../../../shared/contracts/workspace';
import { pdfWorkflowText } from '../../locale/pdfWorkflowDialogsLocale';
import { PdfFormFillerModal } from '../PdfFormFillerModal';

vi.mock('../../../../shell/localization/workspaceLocale', () => ({ useWorkspaceLocale: vi.fn() }));

const noop = (): void => undefined;
const filledForm = {
  ...DEFAULT_PDF_MODEL,
  formFields: [{
    id: 'form-entered', name: 'kunde_name', type: 'text', page: 1,
    bounds: { x: 54, y: 640, width: 220, height: 24 }, label: 'Authored contact field',
    value: 'Meier GmbH', defaultValue: '', required: false, readOnly: false, tabOrder: 1,
  }],
} satisfies PdfDocumentModel;

const props = {
  isOpen: true, pdfData: filledForm, onClose: noop, onUpdatePdfData: noop,
} satisfies ComponentProps<typeof PdfFormFillerModal>;

describe('the destructive form controls stay reachable and named (AST-0844)', () => {
  it('renders both irreversible controls with their localized names in every locale', () => {
    for (const locale of WORKSPACE_LOCALES) {
      vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: locale, locale, setPreference: noop });
      const markup = renderToStaticMarkup(<PdfFormFillerModal {...props} />);

      // Both controls that now ask first are present and named.
      expect(markup, locale).toContain(pdfWorkflowText(locale, 'form.flatten'));
      expect(markup, locale).toContain(pdfWorkflowText(locale, 'form.reset'));
      // The dialog keeps its modal semantics and accessible name.
      expect(markup, locale).toContain('role="dialog"');
      expect(markup, locale).toContain('aria-modal="true"');
      expect(markup, locale).toContain(`id="pdf-form-title"`);
      // The entered value is still offered for editing: the guard did not turn the surface read-only.
      expect(markup, locale).toContain('value="Meier GmbH"');
      expect(markup, locale).toContain('kunde_name');
    }
  });
});
