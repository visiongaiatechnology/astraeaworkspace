import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { PresentDocumentModel, PresentSlide, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import { WORKSPACE_LOCALES } from '../../../../shell/localization/workspaceLocaleTypes';
import { PresentExportCenterModal } from '../../interchange/PresentExportCenterModal';
import { PresentWorkspaceIntegrationModal } from '../../integrations/PresentWorkspaceIntegrationModal';
import { PRESENT_WORKFLOW_COPY, presentExportFailureCopy, presentWorkspaceFailureCopy } from '../presentWorkflowLocale';

vi.mock('../../../../shell/localization/workspaceLocale', () => ({ useWorkspaceLocale: vi.fn() }));

const noop = (): void => undefined;
const document = {
  id: 'doc-1', kind: 'Present', title: 'Launch strategy', version: 3,
  presentData: { slides: [{ id: 'slide-1', title: 'Authored slide title' }] },
} as unknown as WorkspaceDocument;
const model = { slides: [{ id: 'slide-1', title: 'Authored slide title' }] } as unknown as PresentDocumentModel;
const currentSlide = { id: 'slide-1', title: 'Authored slide title' } as unknown as PresentSlide;
const sourceDocument = { id: 'source-1', kind: 'Grid', title: 'User-authored workbook', version: 2, objects: {}, gridData: { sheets: [] } } as unknown as WorkspaceDocument;

describe('Present export and Workspace integration localization', () => {
  it('keeps every locale aligned and interpolates counts and active actions', () => {
    const exportKeys = Object.keys(PRESENT_WORKFLOW_COPY['en-US'].export).sort();
    const workspaceKeys = Object.keys(PRESENT_WORKFLOW_COPY['en-US'].workspace).sort();
    for (const locale of WORKSPACE_LOCALES) {
      expect(Object.keys(PRESENT_WORKFLOW_COPY[locale].export).sort(), `${locale} export`).toEqual(exportKeys);
      expect(Object.keys(PRESENT_WORKFLOW_COPY[locale].workspace).sort(), `${locale} workspace`).toEqual(workspaceKeys);
      expect(PRESENT_WORKFLOW_COPY[locale].export.slideCount(3)).toContain('3');
      expect(PRESENT_WORKFLOW_COPY[locale].export.busy('pdf')).toBeTruthy();
      expect(PRESENT_WORKFLOW_COPY[locale].workspace.page('7')).toContain('7');
    }
  });

  it('renders export controls, authored slide content, and narrow-layout guards in all locales', () => {
    for (const locale of WORKSPACE_LOCALES) {
      vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: locale, locale, setPreference: noop });
      const copy = PRESENT_WORKFLOW_COPY[locale].export;
      const markup = renderToStaticMarkup(<PresentExportCenterModal isOpen document={document} model={model} currentSlide={currentSlide} onClose={noop} />);
      for (const label of [copy.title, copy.close, copy.officeNative, copy.renderedOutputs, copy.password, copy.encryptedNative, copy.speakerNotes, copy.handout, copy.slideSelection, copy.packageTitle, copy.addFonts, copy.redistribution, copy.buildPackage, copy.done]) {
        expect(markup, `${locale}: ${label}`).toContain(label.replaceAll('&', '&amp;'));
      }
      expect(markup).toContain('Authored slide title');
      expect(markup).toContain('role="dialog"');
      expect(markup).toContain('max-h-[92vh]');
      expect(markup).toContain('grid-cols-1 sm:grid-cols-2');
      expect(markup).toContain('break-words');
    }
  });

  it('renders Workspace insertion fallback labels without exposing source errors', () => {
    for (const locale of WORKSPACE_LOCALES) {
      vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: locale, locale, setPreference: noop });
      const copy = PRESENT_WORKFLOW_COPY[locale].workspace;
      const markup = renderToStaticMarkup(<PresentWorkspaceIntegrationModal isOpen sourceDocuments={[sourceDocument]} existingObjects={[]} onClose={noop} onInsert={noop} />);
      for (const label of [copy.title, copy.close, copy.sourceDocument, copy.objectView, copy.referenceMode, copy.live, copy.frozen, copy.noTarget, copy.cancel, copy.insert]) {
        expect(markup, `${locale}: ${label}`).toContain(label);
      }
      expect(markup).toContain('User-authored workbook');
      expect(markup).toContain('max-h-[92vh]');
      expect(markup).toContain('break-words');
      expect(presentExportFailureCopy(locale, new Error('private renderer path'))).not.toContain('private renderer path');
      expect(presentWorkspaceFailureCopy(locale, new Error('private snapshot detail'))).not.toContain('private snapshot detail');
    }
  });
});
